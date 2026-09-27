import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index";
import { defaultFilters, matches, type Filters } from "../shared/model";
import { manualProfile } from "../shared/preferences";
import { publicListingSchema, publicListingsSchema } from "../shared/public-listings";
import { hash, keyed, type Env } from "../worker/support";
import { publicFixtures } from "./fixtures/public-listings";

let mf: Miniflare, env: Env;
const origin = "https://app.example.com";
const authorization = { id: "authorized", hosts: ["listings.example.com"], licenseReference: "Private synthetic contract reference", expiresAt: "2099-01-01T00:00:00Z" };
const cookie = `__Host-kk_session=${"a".repeat(64)}`;
const guestCookie = `__Host-kk_guest=${"c".repeat(64)}`;
beforeEach(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('D1 fixture'); } }",
    compatibilityDate: "2025-09-24", d1Databases: ["DB"] });
  const DB = await mf.getD1Database("DB");
  for (const file of readdirSync("worker/migrations").filter(file => file.endsWith(".sql")).sort())
    await DB.exec(readFileSync(`worker/migrations/${file}`, "utf8").replaceAll("\n", " "));
  env = { DB, TOKEN_SECRET: "synthetic-public-listings-secret-".repeat(3), ADMIN_TOKEN: "synthetic-admin-".repeat(3),
    RESEND_API_KEY: "no-real-provider", MAIL_FROM: "alerts@example.com", OWNER_EMAIL: "owner@example.com",
    PUBLIC_URL: origin, ALLOWED_ORIGINS: origin, PRIVACY_CONTACT: "privacy@example.com", SERVICE_ENABLED: "true",
    ACCESS_MODE: "shared", SHARED_ACCESS_PASSWORD: "b".repeat(64), AUTHORIZED_SOURCES: JSON.stringify([authorization]),
    AI_ENABLED: "true", AI: { run: async () => { throw new Error("Public browsing must never call AI"); } } };
  await DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,token_hash,token_expires,created_at,expires_at,consent_version,preference_profile,search_version)
    VALUES('fixture-owner','owner@example.com',?,?,'approved','Synthetic fixture','token',?,?,?,'fixture',?,4)`)
    .bind(await keyed(env.TOKEN_SECRET, "email:owner@example.com"), JSON.stringify(defaultFilters),
      Date.now() + 60000, Date.now(), Date.now() + 3600000, JSON.stringify(manualProfile({ ...defaultFilters, maxPrice: 4250123 }))).run();
  await DB.prepare("INSERT INTO sessions VALUES(?,'fixture-owner',?)").bind(await hash("a".repeat(64)), Date.now() + 3600000).run();
  await DB.prepare("INSERT INTO guest_sessions(id,token_hash,credential_version,expires_at) VALUES('invited-browser',?,?,?)")
    .bind(await hash("c".repeat(64)), await hash(env.SHARED_ACCESS_PASSWORD!), Date.now() + 3600000).run();
});
afterEach(async () => { await mf.dispose(); });
function get(path = "/api/listings", cookies: string = guestCookie) {
  return worker.fetch(new Request(`${origin}${path}`, { headers: { Origin: origin, ...(cookies ? { Cookie: cookies } : {}) } }), env);
}
function query(filters: Filters = defaultFilters, cursor?: string | null) {
  const params = new URLSearchParams({ filters: JSON.stringify(filters) });
  if (cursor) params.set("cursor", cursor);
  return `/api/listings?${params}`;
}
async function page(filters = defaultFilters, cursor?: string | null) {
  const response = await get(query(filters, cursor));
  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return publicListingsSchema.parse(await response.json());
}
async function seed() {
  await env.DB.batch(publicFixtures.map(({ id, firstSeen, lastSeen, ...listing }) =>
    env.DB.prepare("INSERT INTO listings VALUES(?,?,?,?,?,1)").bind(id, listing.sourceId, JSON.stringify(listing), firstSeen, lastSeen)));
}
async function snapshot() {
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'rate_limits'").all<{ name: string }>()).results;
  return Promise.all(tables.map(async ({ name }) => ({ name, rows: (await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results })));
}
async function all(filters: Filters) {
  let result = await page(filters), collected = result.items;
  while (result.nextCursor) {
    result = await page(filters, result.nextCursor);
    collected = collected.concat(result.items);
  }
  return collected;
}
describe("private upcoming listings through the real Worker and local D1", () => {
  it("returns 12 + 12 + 5 stable newest-first facts, no private data or identity mutations", async () => {
    await seed();
    await env.DB.prepare("INSERT INTO source_runs(source_id,last_attempt,status,error_code) VALUES('authorized','2025-01-01','failed','private-source-error')").run();
    const before = await snapshot();
    const first = await page(), second = await page(defaultFilters, first.nextCursor), third = await page(defaultFilters, second.nextCursor);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([12, 12, 5]);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    expect(third.nextCursor).toBeNull();
    expect(first.total).toBe(29);
    const result = [...first.items, ...second.items, ...third.items];
    expect(result.map(item => item.id)).toEqual(publicFixtures.map(item => item.id).reverse());
    expect(new Set(result.map(item => item.id)).size).toBe(29);
    expect(result.every(item => item.lastSeen === "2025-02-02T12:00:00.000Z")).toBe(true);
    expect(Object.keys(first).sort()).toEqual(["availability", "hasMore", "items", "nextCursor", "total"]);
    expect(Object.keys(first.items[0]).sort()).toEqual(Object.keys(publicListingSchema.shape).sort());
    const withCookie = await get(query(), `${guestCookie}; ${cookie}`);
    expect(await withCookie.json()).toEqual(first);
    expect((await get(query(), "__Host-kk_guest=invalid")).status).toBe(401);
    const body = JSON.stringify(first);
    for (const privateValue of ["licenseReference", "source_runs", "private-source-error", "Private synthetic", "owner@example.com", "preference_profile", "externalId", "token_hash"])
      expect(body).not.toContain(privateValue);
    for (const path of ["/api/catalog", "/api/me", "/api/preferences/draft", "/api/guest/preferences/draft", "/api/admin/members"]) {
      expect((await get(path, "")).status).toBe(401);
      expect((await get(path, cookie)).status).toBe(401);
    }
    const post = await worker.fetch(new Request(`${origin}/api/listings`, { method: "POST", headers: { Origin: origin } }), env);
    expect(post.status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });
  it("denies anonymous facts, counts, diagnostics and cursors before parsing queries in either access mode", async () => {
    await seed();
    for (const mode of ["shared", "membership"]) {
      env.ACCESS_MODE = mode;
      for (const path of ["/api/listings", "/api/listings?limit=200", "/api/listings?cursor=invalid",
        "/api/catalog", "/api/admin/members", "/admin/status"]) {
        const response = await get(path, "");
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body).toEqual({ code: expect.any(String), message: expect.any(String) });
        for (const key of ["items", "total", "count", "nextCursor", "listings", "sources"]) expect(body).not.toHaveProperty(key);
      }
    }
    expect((await get("/api/listings", cookie)).status).toBe(200);
    await env.DB.prepare("UPDATE subscriptions SET state='pending'").run();
    expect((await get("/api/listings", cookie)).status).toBe(403);
  });
  it("requires the current gate after logout, expiry, linked revocation and credential rotation", async () => {
    await seed();
    env.SHARED_ACCESS_PASSWORD = "d".repeat(64);
    expect((await get()).status).toBe(401);
    env.SHARED_ACCESS_PASSWORD = "b".repeat(64);
    await env.DB.prepare("UPDATE guest_sessions SET expires_at=0").run();
    expect((await get()).status).toBe(401);
    await env.DB.prepare("UPDATE guest_sessions SET expires_at=?,member_id='fixture-owner'").bind(Date.now() + 60000).run();
    await env.DB.prepare("UPDATE subscriptions SET state='revoked'").run();
    expect((await get()).status).toBe(401);
  });
  it("applies the shared Swedish, range and unknown-value semantics across the whole collection", async () => {
    await seed();
    const cases: Partial<Filters>[] = [
      { municipality: "Stockholm" }, { type: "Villa" }, { area: "åRSTA öSTRA" }, { area: "hägersten" },
      { area: "SYNTETISKA GATAN 1" }, { minPrice: 1500000, maxPrice: 3000000 },
      { minRooms: 3, maxRooms: 5, minSize: 50, maxSize: 150, maxFee: 4500 },
      { maxPrice: 2000000, minRooms: 2, minSize: 50, maxFee: 4000, includeUnknown: true },
      { minPrice: 0, maxPrice: null, minRooms: null, maxRooms: 0 }, { includeUnknown: true },
    ];
    for (const change of cases) {
      const filters = { ...defaultFilters, ...change };
      expect((await all(filters)).map(item => item.id))
        .toEqual(publicFixtures.filter(item => matches(item, filters)).map(item => item.id).reverse());
    }
    expect((await page({ ...defaultFilters, municipality: "Stockholm" })).total).toBe(15);
    expect((await all(defaultFilters)).some(item => item.price === null)).toBe(true);
  });
  it("strictly rejects query/cursor abuse and cursors belonging to other filters", async () => {
    await seed();
    const first = await page();
    for (const suffix of [
      "?limit=200", "?limit=12", "?unknown=x", "?filters={", "?filters=null", "?filters={}&filters={}",
      "?cursor=@@", "?cursor=", "?cursor=YWJj&cursor=YWJj", `?cursor=${"a".repeat(1401)}`,
      `?filters=${"x".repeat(4097)}`, "?cursor=eyJ2IjoxLCJpZCI6IicgT1IgMT0xLS0ifQ",
    ]) expect((await get(`/api/listings${suffix}`)).status).toBe(400);
    for (const invalid of [
      { ...defaultFilters, minPrice: -1 }, { ...defaultFilters, minPrice: 20, maxPrice: 10 },
      { ...defaultFilters, area: "a".repeat(61) }, { ...defaultFilters, includeUnknown: "true" },
      { ...defaultFilters, maxRooms: "2" }, { ...defaultFilters, county: "elsewhere" },
    ]) expect((await get(`/api/listings?${new URLSearchParams({ filters: JSON.stringify(invalid) })}`)).status).toBe(400);
    const mismatch = await get(query({ ...defaultFilters, municipality: "Solna" }, first.nextCursor));
    expect(mismatch.status).toBe(400); expect(await mismatch.json()).toMatchObject({ code: "invalid_cursor" });
    env.AUTHORIZED_SOURCES = "[]";
    expect((await get("/api/listings?cursor=garbage")).status).toBe(400);
  });
  it("excludes inactive, unauthorized, expired, wrong-scope and unsafe or inconsistent records", async () => {
    await seed();
    env.AUTHORIZED_SOURCES = JSON.stringify([authorization, { ...authorization, id: "mohv", expiresAt: "2020-01-01T00:00:00Z" }]);
    const base = publicFixtures[0];
    const variants = [
      { sourceId: "notar" }, { sourceId: "mohv" }, { county: "Uppsala län" }, { status: "sold" },
      { url: "https://unapproved.example.com/item" }, { url: "http://listings.example.com/item" },
      { url: "not-a-url" }, { url: "" },
      { url: "https://user:password@listings.example.com/item" }, { url: "https://listings.example.com/item#secret" },
      { privateAccountData: "must-not-escape" },
    ];
    for (const [i, variant] of variants.entries()) {
      const { id: _id, firstSeen, lastSeen, ...data } = { ...base, ...variant, externalId: `excluded-${i}` };
      await env.DB.prepare("INSERT INTO listings VALUES(?,?,?,?,?,1)").bind(`${data.sourceId}:${data.externalId}`, data.sourceId, JSON.stringify(data), firstSeen, lastSeen).run();
    }
    const { id: _id, firstSeen, lastSeen, ...data } = base;
    await env.DB.prepare("INSERT INTO listings VALUES('authorized:inactive','authorized',?,?,?,0)").bind(JSON.stringify({ ...data, externalId: "inactive" }), firstSeen, lastSeen).run();
    await env.DB.prepare("INSERT INTO listings VALUES('authorized:mismatched','authorized',?,?,?,1)").bind(JSON.stringify(data), firstSeen, lastSeen).run();
    await env.DB.prepare("INSERT INTO listings VALUES('authorized:invalid-time','authorized',?,'not-a-date',?,1)").bind(JSON.stringify({ ...data, externalId: "invalid-time" }), lastSeen).run();
    expect((await all(defaultFilters)).map(item => item.id)).toEqual(publicFixtures.map(item => item.id).reverse());
    env.AUTHORIZED_SOURCES = JSON.stringify([{ ...authorization, expiresAt: "2020-01-01T00:00:00Z" }]);
    expect((await page()).availability).toBe("no_sources");
  });
  it("distinguishes no sources, empty inventory, no match, unready service and read failure", async () => {
    env.AUTHORIZED_SOURCES = "[]";
    expect(await page()).toEqual({ availability: "no_sources", items: [], total: 0, hasMore: false, nextCursor: null });
    env.AUTHORIZED_SOURCES = JSON.stringify([authorization]);
    expect((await page()).availability).toBe("empty");
    await seed();
    expect(await page({ ...defaultFilters, municipality: "Nacka" })).toEqual({ availability: "ready", items: [], total: 0, hasMore: false, nextCursor: null });
    env.SERVICE_ENABLED = "false"; env.AUTHORIZED_SOURCES = "[]";
    const unready = await get();
    expect(unready.status).toBe(503); expect(await unready.json()).toMatchObject({ code: "gate_unavailable" });
    env.SERVICE_ENABLED = "true"; env.AUTHORIZED_SOURCES = JSON.stringify([authorization]);
    await env.DB.prepare("UPDATE listings SET data='broken-json' WHERE id=?").bind(publicFixtures[0].id).run();
    const failed = await get();
    expect(failed.status).toBe(503); expect(await failed.json()).toMatchObject({ code: "listings_unavailable" });
    const cors = await worker.fetch(new Request(`${origin}/api/listings`, { headers: { Origin: "https://unapproved.example.com" } }), env);
    expect(cors.status).toBe(403);
  });
  it("uses keysets rather than shifting offsets when newer objects arrive or the boundary disappears", async () => {
    await seed();
    const first = await page();
    const { id: _id, firstSeen: _firstSeen, lastSeen, ...data } = publicFixtures[0];
    await env.DB.prepare("INSERT INTO listings VALUES('authorized:new','authorized',?,?,?,1)")
      .bind(JSON.stringify({ ...data, externalId: "new" }), "2026-02-01T00:00:00.000Z", lastSeen).run();
    await env.DB.prepare("DELETE FROM listings WHERE id=?").bind(first.items.at(-1)!.id).run();
    const second = await page(defaultFilters, first.nextCursor), third = await page(defaultFilters, second.nextCursor);
    expect([...first.items, ...second.items, ...third.items].map(item => item.id)).toEqual(publicFixtures.map(item => item.id).reverse());
    expect((await page()).items[0].id).toBe("authorized:new");
  });
  it("keeps every record in the 200-object inventory reachable without enlarging any page", async () => {
    const { id: _id, firstSeen, lastSeen, ...base } = publicFixtures[0];
    await env.DB.batch(Array.from({ length: 200 }, (_, i) => {
      const externalId = `bounded-${String(i).padStart(3, "0")}`;
      return env.DB.prepare("INSERT INTO listings VALUES(?,?,?,?,?,1)")
        .bind(`authorized:${externalId}`, "authorized", JSON.stringify({ ...base, externalId }), firstSeen, lastSeen);
    }));
    const result = await all(defaultFilters);
    expect(result).toHaveLength(200);
    expect(new Set(result.map(item => item.id)).size).toBe(200);
    expect(result[0].id).toBe("authorized:bounded-199");
    expect(result.at(-1)!.id).toBe("authorized:bounded-000");
  });
  it("round-trips a bounded cursor with maximum Swedish filter text and long stable IDs", async () => {
    const { id: _id, firstSeen, lastSeen, ...base } = publicFixtures[0];
    await env.DB.batch(Array.from({ length: 25 }, (_, i) => {
      const externalId = `cursor-${i}`.padEnd(80, "x");
      return env.DB.prepare("INSERT INTO listings VALUES(?,?,?,?,?,1)")
        .bind(`authorized:${externalId}`, "authorized", JSON.stringify({ ...base, externalId, area: "ÅÄÖ".repeat(20) }), firstSeen, lastSeen);
    }));
    const filters = { ...defaultFilters, area: "åäö".repeat(20), minPrice: 0, maxPrice: 100000000,
      minRooms: 0, maxRooms: 30, minSize: 0, maxSize: 10000, maxFee: 100000, includeUnknown: true };
    const first = await page(filters);
    expect(first.items).toHaveLength(12);
    expect(first.nextCursor!.length).toBeLessThanOrEqual(1400);
    expect(query(filters, first.nextCursor).length).toBeLessThan(4096);
    expect(await all(filters)).toHaveLength(25);
  });
});
