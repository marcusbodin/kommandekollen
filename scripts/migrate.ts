import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const ledger = `CREATE TABLE IF NOT EXISTS "d1_migrations" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
const resultsSchema = z.array(z.object({
  success: z.literal(true), results: z.array(z.record(z.unknown())),
})).min(1);
type Results = z.infer<typeof resultsSchema>;
type Input = { command: string } | { file: string };
export type Execute = (input: Input) => Promise<Results>;
const schemaQuery = "SELECT type,name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name;";
const objectSchema = z.object({ type: z.string(), name: z.string(), sql: z.string().nullable() });
type SchemaObject = z.infer<typeof objectSchema>;

export function checkRemoteTarget(configured: { accountId?: string; databaseId?: string }, requested: { accountId?: string; databaseId?: string }) {
  const target = z.object({ accountId: z.string().regex(/^[a-f0-9]{32}$/), databaseId: z.string().uuid() }).parse(requested);
  if (configured.accountId !== target.accountId || configured.databaseId !== target.databaseId) {
    throw new Error("Requested account/database does not match the production binding. No remote commands were run.");
  }
  return target;
}

export function migrationBundle(name: string, sql: string): string {
  if (!/^\d{4}_[a-zA-Z0-9_-]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
  // D1 /import executes the schema and its ledger insert atomically; never record them separately.
  return `${ledger}\n${sql}\nINSERT INTO "d1_migrations" (name) VALUES ('${name}');\n`;
}

async function history(execute: Execute) {
  const objects = (await execute({ command: schemaQuery }))
    .flatMap(result => result.results).map(row => objectSchema.parse(row));
  const hasLedger = objects.some(row => row.type === "table" && row.name === "d1_migrations");
  const applied = hasLedger
    ? (await execute({ command: 'SELECT name FROM "d1_migrations" ORDER BY id;' }))
      .flatMap(result => result.results).map(row => z.object({ name: z.string() }).parse(row).name)
    : [];
  if (!applied.length && objects.some(row => row.name !== "d1_migrations")) {
    throw new Error("Application schema exists without migration history. Stop and inspect; no schema or ledger was changed.");
  }
  return { applied, objects };
}
function assertHistory(applied: string[], expected: string[]) {
  if (JSON.stringify(applied) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected migration history. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(applied)}. Stop and inspect.`);
  }
}
function assertSchema(actual: SchemaObject[], bundles: { sql: string }[]) {
  const db = new DatabaseSync(":memory:");
  try {
    if (actual.some(row => row.name === "d1_migrations") || bundles.length) db.exec(ledger);
    for (const bundle of bundles) db.exec(bundle.sql);
    const expected = z.array(objectSchema).parse(db.prepare(schemaQuery).all());
    const normalize = (rows: SchemaObject[]) => rows.map(row => ({
      ...row, sql: row.sql?.replace(/('(?:[^']|'')*')|\s+/g, (match, literal: string | undefined) => literal ?? "") ?? null,
    }));
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
      throw new Error("Unexpected database schema for the recorded migration history. Stop and inspect; do not repair the ledger manually.");
    }
  } finally { db.close(); }
}

export async function applyMigrations(directory: string, execute: Execute, report: (message: string) => void = console.log) {
  const files = (await readdir(directory)).filter(file => file.endsWith(".sql")).sort();
  if (!files.length) throw new Error("No SQL migrations found.");
  const bundles = await Promise.all(files.map(async name => ({ name, sql: migrationBundle(name, await readFile(join(directory, name), "utf8")) })));
  const { applied, objects } = await history(execute);
  assertHistory(applied, files.slice(0, applied.length));
  assertSchema(objects, bundles.slice(0, applied.length));
  if (applied.length === files.length) { report("All migrations already applied; no changes made."); return; }
  for (let i = applied.length; i < bundles.length; i++) {
    const migration = bundles[i];
    const temporary = await mkdtemp(join(tmpdir(), "kommandekollen-migration-"));
    const file = join(temporary, migration.name);
    try {
      await writeFile(file, migration.sql, { mode: 0o600 });
      report(`Applying ${migration.name} through the SQL file path.`);
      // --remote --file uses /import, not the faulty trigger-splitting /query migration path.
      // https://github.com/cloudflare/workers-sdk/issues/15314
      await execute({ file });
      const current = await history(execute);
      assertHistory(current.applied, files.slice(0, i + 1));
      assertSchema(current.objects, bundles.slice(0, i + 1));
      report(`Verified ${migration.name} in migration history.`);
    } finally {
      await rm(file, { force: true });
      await rmdir(temporary);
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: { local: { type: "boolean" }, remote: { type: "boolean" }, env: { type: "string" }, "persist-to": { type: "string" },
      "account-id": { type: "string" }, "database-id": { type: "string" }, help: { type: "boolean" } },
    strict: true, allowPositionals: false,
  });
  if (values.help) {
    console.log("Usage: npm run db:migrate -- --local [--persist-to PATH]\n       npm run db:migrate -- --remote --env production --account-id ACCOUNT --database-id DATABASE\nImports each unchanged SQL migration and its ledger row together. Never deploys a Worker or enables the service.");
    return;
  }
  if (!!values.local === !!values.remote) throw new Error("Choose exactly one explicit target: --local or --remote.");
  if (values.remote && values.env !== "production") throw new Error("Remote migrations require --env production.");
  if (values.remote && values["persist-to"]) throw new Error("--persist-to is local-only.");
  const { unstable_readConfig } = await import("wrangler");
  const config = z.object({
    account_id: z.string().optional(),
    d1_databases: z.array(z.object({ binding: z.string(), database_name: z.string().optional(), database_id: z.string().optional() })),
  }).parse(unstable_readConfig({ config: join(root, "wrangler.toml"), env: values.env }, { hideWarnings: true }));
  const binding = config.d1_databases.find(db => db.binding === "DB" && db.database_name === "kommandekollen");
  if (!binding?.database_id) throw new Error("The selected environment has no kommandekollen DB binding with a database ID.");
  const target = values.remote ? checkRemoteTarget(
    { accountId: config.account_id, databaseId: binding.database_id },
    { accountId: values["account-id"], databaseId: values["database-id"] },
  ) : undefined;
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
  const args = ["d1", "execute", "kommandekollen", values.remote ? "--remote" : "--local", "--json"];
  if (values.env) args.push("--env", values.env);
  if (values["persist-to"]) args.push("--persist-to", resolve(values["persist-to"]));
  const run = promisify(execFile);
  const temporary = await mkdtemp(join(tmpdir(), "kommandekollen-d1-target-"));
  const snapshot = join(temporary, "wrangler.json");
  try {
    // Pin only the selected binding: later edits to the owner's config cannot redirect this run.
    const selected = { account_id: target?.accountId, d1_databases: [{
      binding: "DB", database_name: "kommandekollen", database_id: target?.databaseId ?? binding.database_id,
    }] };
    await writeFile(snapshot, JSON.stringify({
      name: "kommandekollen-migrations",
      ...(values.env ? { env: { [values.env]: selected } } : selected),
    }), { mode: 0o600 });
    args.push("--config", snapshot);
    const execute: Execute = async input => {
      const { stdout } = await run(process.execPath, [
        cli, ...args, ...("file" in input ? ["--file", input.file] : ["--command", input.command]),
      ], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: "false",
        ...(target ? { CLOUDFLARE_ACCOUNT_ID: target.accountId } : {}) }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
      return resultsSchema.parse(JSON.parse(stdout));
    };
    await applyMigrations(join(root, "worker/migrations"), execute);
  } finally {
    await rm(snapshot, { force: true });
    await rmdir(temporary);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Stopped. If a remote response was interrupted, inspect d1_migrations before retrying; do not insert ledger rows manually.");
    process.exitCode = 1;
  });
}
