import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index";
import { cleanup, dispatchOne, prepareDigest } from "../worker/mail";
import { hash, propertyEmailsReady, type Env } from "../worker/support";
import { defaultFilters, listingSchema, matches, listingFacts } from "../shared/model";
import { assess, manualProfile, ranked } from "../shared/preferences";
import { observationSchema, RECEIPT_RETENTION_MS, type Observation } from "../shared/observations";

let mf: Miniflare, env: Env;
const origin = "https://app.example.com";
const privateGrant = { id: "notar", hosts: ["www.notar.se"], basisReference: "Synthetic local policy fixture, not a real permission", expiresAt: "2099-01-01T00:00:00.000Z" };
const licensedGrant = { id: "notar", hosts: ["www.notar.se"], licenseReference: "Synthetic licensed snapshot fixture", expiresAt: privateGrant.expiresAt };
const timestamp = (minutes = 0) => new Date(Date.now() - minutes * 60_000).toISOString();
function item(externalId = "synthetic-1") {
  return listingSchema.parse({ sourceId: "notar", externalId, status: "upcoming", county: "Stockholms län",
    municipality: "Solna", area: "ÅÄÖ", address: "Fiktiva gatan", type: null, price: null, rooms: 3, size: 70, fee: null,
    url: `https://www.notar.se/kopa-bostad/objekt/${externalId}` });
}
function batch(items = [item()], observedAt = timestamp(20)): Observation {
  return { kind: "listing-observations", version: 1, sourceId: "notar", observationId: crypto.randomUUID(), observedAt, coverage: "partial", items };
}
async function call(path: string, body?: unknown, admin = false, guest = false, target = env) {
  return worker.fetch(new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...(admin ? { Authorization: `Bearer ${target.ADMIN_TOKEN}` } : {}),
      ...(guest ? { Cookie: `__Host-kk_guest=${"c".repeat(64)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), target);
}
const submit = (data: unknown) => call("/admin/observations", data, true);
const cooldown = () => env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'ingest:%'").run();
async function snapshot() {
  return Promise.all(["listings", "private_listing_observations", "ingestion_receipts", "source_ingestion_state", "source_runs"]
    .map(async table => ({ table, rows: (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
}
beforeEach(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch(){return new Response('fixture');} }",
    compatibilityDate: "2025-09-24", d1Databases: ["DB"] });
  const DB = await mf.getD1Database("DB");
  for (const file of readdirSync("worker/migrations").filter(file => file.endsWith(".sql")).sort())
    await DB.exec(readFileSync(`worker/migrations/${file}`, "utf8").replaceAll("\n", " "));
  env = { DB, ADMIN_TOKEN: "synthetic-admin-token-".repeat(3), TOKEN_SECRET: "synthetic-token-secret-".repeat(3),
    RESEND_API_KEY: "synthetic-not-a-provider", MAIL_FROM: "alerts@example.com", OWNER_EMAIL: "owner@example.com",
    PUBLIC_URL: origin, ALLOWED_ORIGINS: origin, PRIVACY_CONTACT: "privacy@example.com", SERVICE_ENABLED: "true",
    ACCESS_MODE: "shared", SHARED_ACCESS_PASSWORD: "b".repeat(64), AUTHORIZED_SOURCES: "[]",
    PRIVATE_OBSERVATION_SOURCES: JSON.stringify([privateGrant]) };
  await DB.prepare("INSERT INTO guest_sessions(id,token_hash,credential_version,expires_at) VALUES('browser',?,?,?)")
    .bind(await hash("c".repeat(64)), await hash("b".repeat(64)), Date.now() + 3600000).run();
});
afterEach(async () => { await mf.dispose(); });

describe("atomic private observations", () => {
  it("persists genuine captures, preserves firstSeen and accepts older disjoint IDs without regressing newer facts", async () => {
    const first = batch();
    expect(await (await submit(first)).json()).toMatchObject({ inserted: 1, updated: 0, retired: 0, coverage: "partial" });
    await cooldown();
    const newer = batch([{ ...item(), price: 1234567 }], timestamp(5));
    expect((await submit(newer)).status).toBe(200);
    await cooldown();
    const older = batch([{ ...item(), price: 99 }, item("other")], timestamp(10));
    expect(await (await submit(older)).json()).toMatchObject({ inserted: 1, ignored: 1, retired: 0 });
    const row = await env.DB.prepare("SELECT data,first_seen,last_seen FROM listings WHERE id='notar:synthetic-1'").first<{ data: string; first_seen: string; last_seen: string }>();
    expect(row).toMatchObject({ first_seen: first.observedAt, last_seen: newer.observedAt });
    expect(JSON.parse(row!.data).price).toBe(1234567);
    expect((await call("/api/listings")).status).toBe(401);
    const page = await (await call("/api/listings", undefined, false, true)).json();
    expect(page).toMatchObject({ total: 2, items: expect.arrayContaining([expect.objectContaining({ type: null, coverage: "partial" })]) });
    const catalog = await (await call("/api/catalog", undefined, false, true)).json();
    expect(catalog).toMatchObject({ alertsReady: false, listings: expect.arrayContaining([expect.objectContaining({ type: null })]) });
    expect(JSON.stringify(page)).not.toContain("basisReference");
    expect((await env.DB.prepare("SELECT payload FROM ingestion_receipts").all()).results.every(row => row.payload === "")).toBe(true);
  });
  it("never retires on empty, invalid or failed partial pages and keeps newer failure metadata", async () => {
    expect((await submit(batch())).status).toBe(200);
    await call("/admin/source-failure", { sourceId: "notar", code: "fetch_failed" }, true);
    const before = await snapshot();
    expect((await submit({ ...batch(), items: [{ ...item("bad"), county: "Uppsala län" }] })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
    await cooldown();
    expect(await (await submit(batch([], timestamp(1)))).json()).toMatchObject({ retired: 0, count: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM listings WHERE active=1").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT status,error_code FROM source_runs").first()).toEqual({ status: "failed", error_code: "fetch_failed" });
  });
  it("compares legacy UTC timestamps by their instant, preserving original firstSeen formatting", async () => {
    const time = new Date(Date.now() - 20 * 60_000); time.setUTCMilliseconds(0);
    const legacyTime = time.toISOString().replace(".000Z", "Z");
    await env.DB.prepare("INSERT INTO listings(id,source_id,data,first_seen,last_seen,active) VALUES('notar:synthetic-1','notar',?,?,?,1)")
      .bind(JSON.stringify(item()), legacyTime, legacyTime).run();
    await env.DB.prepare("INSERT INTO source_runs(source_id,last_attempt,last_success,status,item_count) VALUES('notar',?,?,'ok',1)")
      .bind(legacyTime, legacyTime).run();
    const newer = batch([{ ...item(), price: 42 }], new Date(time.getTime() + 200).toISOString());
    expect(await (await submit(newer)).json()).toMatchObject({ updated: 1, ignored: 0 });
    expect(await env.DB.prepare("SELECT first_seen,last_seen FROM listings").first())
      .toEqual({ first_seen: legacyTime, last_seen: newer.observedAt });
    expect(await env.DB.prepare("SELECT last_attempt,last_success,status FROM source_runs").first())
      .toEqual({ last_attempt: newer.observedAt, last_success: newer.observedAt, status: "partial" });
  });
  it("deduplicates concurrent retries and fails changed IDs or equal-time facts atomically", async () => {
    const data = batch();
    const responses = await Promise.all([submit(data), submit(data)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ingestion_receipts").first()).toEqual({ n: 1 });
    const before = await snapshot();
    expect((await submit({ ...data, items: [{ ...item(), price: 42 }] })).status).toBe(409);
    await cooldown();
    expect((await submit(batch([item("never-inserted"), { ...item(), price: 42 }], data.observedAt))).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  it("enforces the 50 batch and 200 inventory limits with all-or-nothing rollback", async () => {
    expect((await submit(batch(Array.from({ length: 51 }, (_, i) => item(`limit-${i}`))))).status).toBe(400);
    for (let page = 0; page < 4; page++) {
      await cooldown();
      expect((await submit(batch(Array.from({ length: 50 }, (_, i) => item(`limit-${page * 50 + i}`))))).status).toBe(200);
    }
    const before = await snapshot();
    await cooldown();
    const result = await submit(batch([{ ...item("limit-0"), price: 999 }, item("overflow")], timestamp(1)));
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ code: "inventory_capacity" });
    expect(await snapshot()).toEqual(before);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM listings").first()).toEqual({ n: 200 });
  });
  it("orders complete snapshots and partial pages without retiring newer facts or resurrecting absent older IDs", async () => {
    const first = batch([item("old")], timestamp(30));
    expect((await submit(first)).status).toBe(200);
    await cooldown();
    expect((await submit(batch([item("newer")], timestamp(2)))).status).toBe(200);
    const completeEnv = { ...env, PRIVATE_OBSERVATION_SOURCES: "[]", AUTHORIZED_SOURCES: JSON.stringify([licensedGrant]) };
    const complete = { sourceId: "notar", observedAt: timestamp(10), listings: [] };
    await cooldown();
    expect(await (await call("/admin/ingest", complete, true, false, completeEnv)).json()).toMatchObject({ retired: 1 });
    expect((await env.DB.prepare("SELECT id,active FROM listings ORDER BY id").all()).results)
      .toEqual([{ id: "notar:newer", active: 1 }, { id: "notar:old", active: 0 }]);
    await cooldown();
    expect(await (await submit(batch([item("old"), item("absent")], timestamp(15)))).json()).toMatchObject({ ignored: 2, inserted: 0 });
    expect(await env.DB.prepare("SELECT id FROM listings WHERE id='notar:absent'").first()).toBeNull();
    await cooldown();
    expect((await call("/admin/ingest", { ...complete, observedAt: timestamp(25), listings: [item()] }, true, false, completeEnv)).status).toBe(409);
    await cooldown();
    expect((await submit(batch([item("old")], timestamp(1)))).status).toBe(200);
    expect(await env.DB.prepare("SELECT first_seen,active FROM listings WHERE id='notar:old'").first()).toEqual({ first_seen: first.observedAt, active: 1 });
    expect(await (await call("/api/listings", undefined, false, true, completeEnv)).json()).toMatchObject({ total: 0 });
  });
  it("keeps concurrent source limits transactional and reports throttling without partial writes", async () => {
    const responses = await Promise.all([submit(batch([item("a")])), submit(batch([item("b")]))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 429]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM listings").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ingestion_receipts").first()).toEqual({ n: 1 });
  });
  it("serializes concurrent complete and partial imports and retains the newer observation after a throttled retry", async () => {
    const observed = batch([{ ...item(), price: 200 }], timestamp(5));
    const complete = { sourceId: "notar", observedAt: timestamp(20), listings: [{ ...item(), price: 100 }] };
    const completeEnv = { ...env, PRIVATE_OBSERVATION_SOURCES: "[]", AUTHORIZED_SOURCES: JSON.stringify([licensedGrant]) };
    const results = await Promise.all([submit(observed), call("/admin/ingest", complete, true, false, completeEnv)]);
    expect(results.map(response => response.status).sort()).toEqual([200, 429]);
    await cooldown();
    if (results[0].status === 429) expect((await submit(observed)).status).toBe(200);
    else expect((await call("/admin/ingest", complete, true, false, completeEnv)).status).toBe(200);
    const row = await env.DB.prepare("SELECT data,last_seen,active FROM listings").first<{ data: string; last_seen: string; active: number }>();
    expect(row).toMatchObject({ last_seen: observed.observedAt, active: 1 });
    expect(JSON.parse(row!.data).price).toBe(200);
    expect(await env.DB.prepare("SELECT listing_id FROM private_listing_observations").first()).toEqual({ listing_id: "notar:synthetic-1" });
  });
  it("fails closed on authorization, source binding, timestamp, preview and URL violations", async () => {
    expect((await call("/admin/observations", batch())).status).toBe(401);
    for (const bad of [
      { ...batch(), kind: "notar-rendered-preview" }, { ...batch(), observedAt: timestamp(-1) },
      { ...batch(), observedAt: timestamp(61) }, { ...batch(), items: [item(), item()] },
      { ...batch(), items: [{ ...item(), type: "Unknown" }] },
      { ...batch(), items: [{ ...item(), sourceId: "mohv" }] },
      { ...batch(), items: [{ ...item(), url: "https://unexpected.example.com/property" }] },
      { ...batch(), items: [{ ...item(), status: "sold" }] },
      { ...batch(), items: [{ ...item(), firstSeen: timestamp() }] },
    ]) expect((await submit(bad)).status).toBe(400);
    env.PRIVATE_OBSERVATION_SOURCES = "[]";
    expect((await submit(batch())).status).toBe(403);
    env.PRIVATE_OBSERVATION_SOURCES = JSON.stringify([{ ...privateGrant, expiresAt: "2020-01-01T00:00:00.000Z" }]);
    expect((await submit(batch())).status).toBe(403);
    env.PRIVATE_OBSERVATION_SOURCES = JSON.stringify([privateGrant]);
    env.AUTHORIZED_SOURCES = JSON.stringify([licensedGrant]);
    expect((await submit(batch())).status).toBe(503);
    env.AUTHORIZED_SOURCES = "[]";
    env.PRIVATE_OBSERVATION_SOURCES = JSON.stringify(["notar", "mohv", "husmanhagberg", "bjurfors", "authorized"].map(id => ({ ...privateGrant, id })));
    expect((await submit(batch())).status).toBe(503);
  });
  it("retains replay receipts longer than acceptance and cleans up without reviving old captures", async () => {
    const data = batch();
    expect((await submit(data)).status).toBe(200);
    const before = await snapshot();
    expect(await (await submit(data)).json()).toMatchObject({ duplicate: true });
    expect(await snapshot()).toEqual(before);
    await cleanup(env, Date.now() + RECEIPT_RETENTION_MS + 1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ingestion_receipts").first()).toEqual({ n: 0 });
    const old = { ...data, observationId: crypto.randomUUID(), observedAt: timestamp(61) };
    expect((await submit(old)).status).toBe(400);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM listings").first()).toEqual({ n: 1 });
  });
  it("keeps property delivery paused with real-shaped inventory and preserves uncertain send history", async () => {
    expect((await submit(batch())).status).toBe(200);
    expect(propertyEmailsReady(env)).toBe(false);
    env.PROPERTY_EMAILS_ENABLED = "true";
    expect(propertyEmailsReady(env)).toBe(false);
    env.PROPERTY_EMAILS_ENABLED = "false";
    await env.DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,alerts_enabled,token_hash,token_expires,created_at,expires_at,consent_version)
      VALUES('member','member@example.com','hash',?,'approved','fixture',1,'token',?,?,?,'fixture')`)
      .bind(JSON.stringify(defaultFilters), Date.now() + 60000, Date.now(), Date.now() + 3600000).run();
    await prepareDigest(env);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 0 });
    for (const firstAttempt of [null, Date.now()]) {
      await env.DB.prepare(`INSERT INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt,first_attempt)
        VALUES(?,'member','digest',?,'never-send','["notar:synthetic-1"]',?,0,?)`)
        .bind(crypto.randomUUID(), crypto.randomUUID(), Date.now(), firstAttempt).run();
      await dispatchOne(env);
    }
    expect((await env.DB.prepare("SELECT error_code FROM outbox ORDER BY rowid").all()).results)
      .toEqual([{ error_code: "alerts_paused" }, { error_code: "delivery_uncertain" }]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM seen").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM send_attempts").first()).toEqual({ n: 0 });
  });
  it("shares unknown-type filtering and deterministic ranking without guessing from other facts", () => {
    const unknown = item(), known = { ...item("known"), type: "Villa" as const };
    expect(observationSchema.parse(batch()).items[0].type).toBeNull();
    expect(matches(unknown, defaultFilters)).toBe(true);
    expect(matches(unknown, { ...defaultFilters, type: "Villa", includeUnknown: true })).toBe(false);
    expect(matches(unknown, { ...defaultFilters, maxPrice: 5, includeUnknown: true })).toBe(true);
    const profile = manualProfile();
    profile.alternatives.types = ["Villa"];
    expect(ranked([unknown, known], profile)).toEqual([known]);
    profile.alternatives.types = []; profile.excluded.types = ["Lägenhet"];
    expect(assess(unknown, profile).eligible).toBe(false);
    profile.excluded.types = []; profile.wishes = [{ ...defaultFilters, type: "Villa" }];
    expect(assess(unknown, profile).score).toBe(0);
    expect(listingFacts(unknown)).toMatchObject({ type: "Ej angivet", price: "Ej angivet", fee: "Ej angivet" });
  });
});
