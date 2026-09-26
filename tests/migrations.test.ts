import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations, checkRemoteTarget, migrationBundle, readWranglerResult, type Execute } from "../scripts/migrate";

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

describe("Wrangler JSON output contract", () => {
  const result = [{ results: [{ "Total queries executed": 18, "Rows written": 1 }], success: true, finalBookmark: "test-bookmark" }];
  const json = JSON.stringify(result, null, 2);
  const progress = "├ Checking if file needs uploading\n│\n├ 🌀 Uploading /tmp/migration/0001_initial.sql\n│ 🌀 Uploading complete.\n│\n";
  it("accepts the remote import spinner followed by a complete validated JSON result", async () => {
    await expect(readWranglerResult(Promise.resolve({ stdout: progress + json + "\n" })))
      .resolves.toEqual([{ results: result[0].results, success: true }]);
  });
  it("accepts plain query JSON and ANSI-colored CRLF import progress", async () => {
    await expect(readWranglerResult(Promise.resolve({ stdout: json }))).resolves.toHaveLength(1);
    await expect(readWranglerResult(Promise.resolve({ stdout: "\x1b[90m" + progress.replaceAll("\n", "\r\n") + "\x1b[0m" + json }))).resolves.toHaveLength(1);
  });
  it.each([
    "", progress, progress + "[", progress + "[]", progress + '[{"success":false,"results":[]}]',
    progress + '[{"success":true}]', progress + json + "\nUnexpected trailing output",
    "[ERROR] import failed\n" + json, "Unrecognized output\n" + json,
  ])("fails closed on missing, invalid, failed or ambiguous output: %s", async stdout => {
    await expect(readWranglerResult(Promise.resolve({ stdout }))).rejects.toThrow();
  });
  it("propagates a nonzero process error unchanged instead of parsing its stdout", async () => {
    const error = Object.assign(new Error("Wrangler failed with exit code 1"), { code: 1, stdout: progress + json, stderr: "Provider rejected the import" });
    await expect(readWranglerResult(Promise.reject(error))).rejects.toBe(error);
  });
});

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
      .toEqual(["ai_budget", "inventory_capacity", "reserve_quota", "revoke_search_drafts", "subscription_capacity"]);
    const sql = await readFile("worker/migrations/0001_initial.sql", "utf8");
    expect(h.files[0]).toContain(sql);
    h.db.exec("INSERT INTO quotas VALUES('day',79,0),('month',2399,0)");
    h.db.exec("INSERT INTO send_attempts VALUES('one','outbox','day','month','digest',0)");
    expect(() => h.db.exec("INSERT INTO send_attempts VALUES('two','outbox','day','month','digest',0)")).toThrow("mail_quota");
    expect(h.db.prepare("SELECT total FROM quotas ORDER BY period").all()).toEqual([{ total: 80 }, { total: 2400 }]);
    expect(h.db.prepare("SELECT count(*) AS count FROM send_attempts").get()).toMatchObject({ count: 1 });
    expect(h.files).toHaveLength(3);
    await applyMigrations("worker/migrations", h.execute, () => {});
    expect(h.files).toHaveLength(3);
  });
  it("upgrades existing 0001 members without rewriting filters, consent, seen history or initial SQL", async () => {
    const h = harness();
    const initial = await readFile("worker/migrations/0001_initial.sql", "utf8");
    h.db.exec(migrationBundle("0001_initial.sql", initial));
    h.db.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,token_hash,token_expires,created_at,expires_at,consent_version,last_digest_day)
      VALUES('member','member@example.com','hash','{\"maxPrice\":4250123}','approved','example','token',1,1,2,'old-consent','2026-09-25')`).run();
    await applyMigrations("worker/migrations", h.execute, () => {});
    expect(h.files).toHaveLength(2);
    expect(h.files[0]).toContain("0002_preferences.sql");
    expect(h.db.prepare("SELECT filters,consent_version,last_digest_day,search_version,preference_profile FROM subscriptions").get())
      .toEqual({ filters: '{"maxPrice":4250123}', consent_version: "old-consent", last_digest_day: "2026-09-25", search_version: 0, preference_profile: null });
    expect(await readFile("worker/migrations/0001_initial.sql", "utf8")).toBe(initial);
    expect(h.db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).toEqual([{ name: "0001_initial.sql" }, { name: "0002_preferences.sql" }, { name: "0003_ai_daily_attempts.sql" }]);
  });
  it("upgrades 0002 with three completed attempts intact and preserves all other guards and data", async () => {
    const h = harness();
    const initial = await readFile("worker/migrations/0001_initial.sql", "utf8");
    const preferences = await readFile("worker/migrations/0002_preferences.sql", "utf8");
    h.db.exec(migrationBundle("0001_initial.sql", initial));
    h.db.exec(migrationBundle("0002_preferences.sql", preferences));
    const oldTrigger = preferences.slice(preferences.indexOf("CREATE TRIGGER ai_budget"));
    const upgrade = await readFile("worker/migrations/0003_ai_daily_attempts.sql", "utf8");
    expect(upgrade).toBe("DROP TRIGGER ai_budget;\n\n" + oldTrigger
      .replace("member_hash=NEW.member_hash)>=3", "member_hash=NEW.member_hash)>=6")
      .replace("ip_hash=NEW.ip_hash)>=3", "ip_hash=NEW.ip_hash)>=6"));
    h.db.exec(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,token_hash,token_expires,created_at,expires_at,consent_version,search_version,preference_profile)
      VALUES('member','member@example.com','hash','{}','approved','fixture','token',1,1,2,'existing-consent',4,'{"version":1}');
      INSERT INTO search_drafts VALUES('member','draft',5,4,'{}','null','[]',3,'ready',100);
      INSERT INTO seen VALUES('member','listing',1);
      INSERT INTO quotas VALUES('mail-day',79,19);`);
    const insert = h.db.prepare("INSERT INTO ai_attempts VALUES(?,?,?,?,?,1000,?)");
    for (let i = 1; i <= 3; i++) insert.run(`existing-${i}`, "member-hash", "ip-hash", "2099-01-02", i, "done");
    insert.run("existing-unresolved", "other-member", "other-ip", "2099-01-01", 0, "uncertain");
    expect(() => insert.run("fourth", "member-hash", "ip-hash", "2099-01-02", 4, "running")).toThrow("ai_budget");
    const tables = ["subscriptions", "search_drafts", "seen", "quotas", "ai_attempts"];
    const snapshot = () => tables.map(table => h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const history = h.db.prepare("SELECT * FROM d1_migrations ORDER BY id").all();
    const unaffected = () => h.db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name!='ai_budget' ORDER BY type,name").all();
    const schema = unaffected();
    await applyMigrations("worker/migrations", h.execute, () => {});
    expect(h.files).toHaveLength(1);
    expect(h.files[0]).toContain(upgrade);
    expect(snapshot()).toEqual(before);
    expect(unaffected()).toEqual(schema);
    expect(h.db.prepare("SELECT * FROM d1_migrations WHERE id<=2 ORDER BY id").all()).toEqual(history);
    expect(h.db.prepare("SELECT name FROM d1_migrations ORDER BY id").all())
      .toEqual([{ name: "0001_initial.sql" }, { name: "0002_preferences.sql" }, { name: "0003_ai_daily_attempts.sql" }]);
    insert.run("fourth", "member-hash", "ip-hash", "2099-01-02", 4, "running");
    expect(() => insert.run("blocked", "new-member", "new-ip", "2099-01-03", 5, "running")).toThrow("ai_budget");
    h.db.exec("UPDATE ai_attempts SET state='done' WHERE id='fourth'");
    expect(() => insert.run("same-unresolved-member", "other-member", "new-ip", "2099-01-03", 5, "running")).toThrow("ai_budget");
    insert.run("fifth", "member-hash", "ip-hash", "2099-01-02", 5, "done");
    insert.run("sixth", "member-hash", "ip-hash", "2099-01-02", 6, "done");
    expect(() => insert.run("seventh", "member-hash", "ip-hash", "2099-01-02", 7, "done")).toThrow("ai_budget");
    expect(() => insert.run("seventh-other", "new-member", "new-ip", "2099-01-02", 7, "done")).toThrow("ai_budget");
    expect(() => h.db.exec("INSERT INTO ai_attempts VALUES('invalid','new-member','new-ip','2099-01-03',8,999,'done')")).toThrow("CHECK constraint");
    expect(h.db.prepare("SELECT sum(reserved) AS total FROM ai_attempts WHERE day='2099-01-02'").get()).toEqual({ total: 6000 });
    expect(h.db.prepare("SELECT * FROM ai_attempts WHERE id LIKE 'existing-%' ORDER BY rowid").all()).toEqual(before[4]);
    await applyMigrations("worker/migrations", h.execute, () => {});
    expect(h.files).toHaveLength(1);
    expect(await readFile("worker/migrations/0001_initial.sql", "utf8")).toBe(initial);
    expect(await readFile("worker/migrations/0002_preferences.sql", "utf8")).toBe(preferences);
  });
});
