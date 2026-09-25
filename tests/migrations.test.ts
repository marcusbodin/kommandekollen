import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations, checkRemoteTarget, migrationBundle, type Execute } from "../scripts/migrate";

const databases: DatabaseSync[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of directories.splice(0)) {
    await rm(join(dir, "0001_test.sql"), { force: true });
    await rmdir(dir);
  }
});
function harness(failAfterImport = false) {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const files: string[] = [], queries: string[] = [];
  const execute: Execute = async input => {
    if ("command" in input) {
      queries.push(input.command);
      expect(input.command).toMatch(/^SELECT /);
      return [{ success: true, results: db.prepare(input.command).all() }];
    }
    const sql = await readFile(input.file, "utf8");
    files.push(sql);
    // Model /import's all-or-nothing transaction, not its unpublished SQL splitter.
    db.exec("BEGIN");
    try { db.exec(sql); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); throw error; }
    if (failAfterImport) throw new Error("Simulated lost import response");
    return [{ success: true, results: [] }];
  };
  return { db, files, queries, execute };
}
async function fixture(sql: string) {
  const dir = await mkdtemp(join(tmpdir(), "kommandekollen-migration-test-"));
  directories.push(dir);
  await writeFile(join(dir, "0001_test.sql"), sql);
  return dir;
}

describe("atomic migration file transport", () => {
  it("requires an exact explicit account and database match", () => {
    const target = { accountId: "0".repeat(32), databaseId: "00000000-0000-4000-8000-000000000001" };
    expect(checkRemoteTarget(target, target)).toEqual(target);
    expect(() => checkRemoteTarget(target, {})).toThrow();
    expect(() => checkRemoteTarget(target, { ...target, accountId: "1".repeat(32) })).toThrow("does not match");
    expect(() => checkRemoteTarget(target, { ...target, databaseId: "00000000-0000-4000-8000-000000000002" })).toThrow("does not match");
  });
  it("keeps a trigger body and the ledger in one import, never in a query command", async () => {
    const dir = await fixture("CREATE TABLE probe(n INTEGER); CREATE TRIGGER bounded BEFORE INSERT ON probe WHEN NEW.n > 1 BEGIN SELECT RAISE(ABORT, 'capacity'); END;");
    const h = harness();
    await applyMigrations(dir, h.execute, () => {});
    expect(h.files).toHaveLength(1);
    expect(h.files[0]).toContain('INSERT INTO "d1_migrations" (name)');
    expect(h.queries.every(sql => !sql.includes("CREATE TRIGGER"))).toBe(true);
    expect(() => h.db.exec("INSERT INTO probe VALUES(2)")).toThrow("capacity");
    expect(h.db.prepare("SELECT name FROM d1_migrations").get()).toMatchObject({ name: "0001_test.sql" });
    await applyMigrations(dir, h.execute, () => {});
    expect(h.files).toHaveLength(1);
  });
  it("rolls back schema and ledger together on a failed file", async () => {
    const dir = await fixture("CREATE TABLE probe(n INTEGER); INSERT INTO nonexistent VALUES(1);");
    const h = harness();
    await expect(applyMigrations(dir, h.execute, () => {})).rejects.toThrow("nonexistent");
    expect(h.db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([]);
  });
  it("recognizes a committed import after a lost response without replaying it", async () => {
    const dir = await fixture("CREATE TABLE probe(n INTEGER);");
    const h = harness(true);
    await expect(applyMigrations(dir, h.execute, () => {})).rejects.toThrow("lost import response");
    await applyMigrations(dir, h.execute, () => {});
    expect(h.files).toHaveLength(1);
  });
  it("only commits one copy when two runners observe the same unapplied migration", async () => {
    const dir = await fixture("CREATE TABLE IF NOT EXISTS probe(n INTEGER); INSERT INTO probe VALUES(1);");
    const h = harness();
    let reads = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const execute: Execute = async input => {
      const result = await h.execute(input);
      if ("command" in input && input.command.includes("sqlite_schema") && reads < 2) {
        if (++reads === 2) release();
        await barrier;
      }
      return result;
    };
    const results = await Promise.allSettled([
      applyMigrations(dir, execute, () => {}), applyMigrations(dir, execute, () => {}),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.db.prepare("SELECT count(*) AS count FROM probe").get()).toMatchObject({ count: 1 });
    expect(h.db.prepare("SELECT count(*) AS count FROM d1_migrations").get()).toMatchObject({ count: 1 });
  });
  it("refuses partial schemas and unexpected history without issuing writes", async () => {
    const dir = await fixture("CREATE TABLE probe(n INTEGER);");
    const partial = harness();
    partial.db.exec("CREATE TABLE probe(n INTEGER)");
    await expect(applyMigrations(dir, partial.execute, () => {})).rejects.toThrow("without migration history");
    expect(partial.files).toHaveLength(0);
    const unknown = harness();
    unknown.db.exec(migrationBundle("0001_unknown.sql", "CREATE TABLE probe(n INTEGER);"));
    await expect(applyMigrations(dir, unknown.execute, () => {})).rejects.toThrow("Unexpected migration history");
    expect(unknown.files).toHaveLength(0);
  });
  it("refuses schema drift even when the ledger says the migration was applied", async () => {
    const dir = await fixture("CREATE TABLE probe(n INTEGER);");
    const h = harness();
    await applyMigrations(dir, h.execute, () => {});
    h.db.exec("ALTER TABLE probe ADD COLUMN unexpected TEXT");
    await expect(applyMigrations(dir, h.execute, () => {})).rejects.toThrow("Unexpected database schema");
    expect(h.files).toHaveLength(1);
  });
  it("imports the unchanged initial schema with all transactional guards intact", async () => {
    const h = harness();
    await applyMigrations("worker/migrations", h.execute, () => {});
    expect(h.db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name").all().map(row => row.name))
      .toEqual(["inventory_capacity", "reserve_quota", "subscription_capacity"]);
    const sql = await readFile("worker/migrations/0001_initial.sql", "utf8");
    expect(h.files[0]).toContain(sql);
    h.db.exec("INSERT INTO quotas VALUES('day',79,0),('month',2399,0)");
    h.db.exec("INSERT INTO send_attempts VALUES('one','outbox','day','month','digest',0)");
    expect(() => h.db.exec("INSERT INTO send_attempts VALUES('two','outbox','day','month','digest',0)")).toThrow("mail_quota");
    expect(h.db.prepare("SELECT total FROM quotas ORDER BY period").all()).toEqual([{ total: 80 }, { total: 2400 }]);
    expect(h.db.prepare("SELECT count(*) AS count FROM send_attempts").get()).toMatchObject({ count: 1 });
  });
});
