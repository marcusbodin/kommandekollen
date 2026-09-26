import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import worker from "../worker/index";
import { defaultFilters } from "../shared/model";
import { draftSchema, manualProfile, type Draft } from "../shared/preferences";
import { cleanup, type Mail } from "../worker/mail";
import { hash, keyed, unseal, unsubscribeToken, type Env, type MemberState } from "../worker/support";

const origin = "https://app.example.com", base = "https://api.example.com";
const fixturePassword = "a".repeat(64);
let mf: Miniflare, env: Env, calls: number;
beforeEach(async () => {
  mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2025-09-24", d1Databases: ["DB"] });
  const DB = await mf.getD1Database("DB");
  for (const file of readdirSync("worker/migrations").filter(file => file.endsWith(".sql")).sort()) {
    await DB.exec(readFileSync(`worker/migrations/${file}`, "utf8").replaceAll("\n", " "));
  }
  calls = 0;
  env = { DB, ADMIN_TOKEN: "test-admin-".repeat(4), TOKEN_SECRET: "test-secret-".repeat(4), RESEND_API_KEY: "no-live-mail",
    MAIL_FROM: "alerts@example.com", OWNER_EMAIL: "owner@example.com", PUBLIC_URL: origin, ALLOWED_ORIGINS: origin,
    SERVICE_ENABLED: "true", AUTHORIZED_SOURCES: "[]", PRIVACY_CONTACT: "privacy@example.com", AI_ENABLED: "true",
    ACCESS_MODE: "shared", SHARED_ACCESS_PASSWORD: fixturePassword,
    AI: { run: async () => { calls++; return Response.json({ response: { profile: manualProfile({ ...defaultFilters, municipality: "Solna" }), question: null, conflicts: [] } }); } } };
});
afterEach(async () => { await mf.dispose(); });
function request(path: string, body?: unknown, cookie = "", ip = "192.0.2.1", requestOrigin = origin) {
  return worker.fetch(new Request(base + path, { method: body === undefined ? "GET" : "POST",
    headers: { Origin: requestOrigin, "Content-Type": "application/json", Cookie: cookie, "CF-Connecting-IP": ip },
    body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
const session = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function gate(ip = "192.0.2.1") {
  const response = await request("/api/gate", { password: fixturePassword }, "", ip);
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict; Path=/; Max-Age=43200; Secure");
  return session(response);
}
async function account(email: string, state: MemberState = "approved") {
  const id = crypto.randomUUID(), token = "b".repeat(64);
  await env.DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,owner_slot,token_hash,token_expires,created_at,expires_at,consent_version,search_version,preference_profile)
    VALUES(?,?,?,?,?,'existing application',?,?,1,?,?,'existing-consent',7,?)`)
    .bind(id, email, await keyed(env.TOKEN_SECRET, `email:${email}`), JSON.stringify({ ...defaultFilters, maxPrice: 4250123 }), state,
      Number(email === env.OWNER_EMAIL), await hash(crypto.randomUUID()), Date.now(), Date.now() + 86400000,
      JSON.stringify(manualProfile({ ...defaultFilters, maxPrice: 4250123 }))).run();
  await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)").bind(await hash(token), id, Date.now() + 43200000).run();
  return { id, cookie: `__Host-kk_session=${token}` };
}
async function draft(cookie: string, previousId: string | null = null) {
  const response = await request("/api/guest/preferences/draft", { id: crypto.randomUUID(), expectedVersion: 0, previousId,
    profile: manualProfile({ ...defaultFilters, municipality: "Solna" }), resolveQuestions: false }, cookie);
  expect(response.status).toBe(200);
  return draftSchema.parse((await response.json() as { draft: unknown }).draft);
}
const review = (d: Draft) => ({ id: d.id, revision: d.revision, expectedVersion: 0, enabled: false, acceptUnverified: false, consent: true });
async function saveLink(cookie: string, d: Draft, email = "new@example.com", ip = "192.0.2.1") {
  const response = await request("/api/guest/preferences/save", { ...review(d), email, website: "" }, cookie, ip);
  expect(response.status).toBe(202);
  const row = await env.DB.prepare("SELECT payload FROM outbox ORDER BY created_at DESC LIMIT 1").first<{ payload: string }>();
  const mail = await unseal<Mail>(env.TOKEN_SECRET, row!.payload);
  expect(mail.text).toContain("samma webbläsare");
  const url = new URL(mail.text.match(/https:\/\/app\.example\.com\/#guest-confirm=[a-f0-9]+/)![0]);
  expect(url.search).toBe("");
  return url.hash.slice("#guest-confirm=".length);
}
async function confirmData(cookie: string, d: Draft) {
  const state = await (await request("/api/guest/preferences/draft", undefined, cookie)).json() as { saveIntent: { id: string } };
  return { ...review(d), challengeId: state.saveIntent.id };
}
const prompt = () => ({ id: crypto.randomUUID(), expectedVersion: 0, previousId: null, text: "En lägenhet i Solna", aiConsent: true });
describe("shared gate and isolated guest saving", () => {
  it("fails closed without a flag/secret, requires the gate for old member AI, and limits password guessing", async () => {
    const owner = await account("owner@example.com");
    for (const path of ["/api/me", "/api/catalog", "/api/preferences/draft", "/api/admin/members"]) {
      expect((await request(path, undefined, owner.cookie)).status).toBe(401);
    }
    expect((await request("/api/preferences/interpret", prompt(), owner.cookie)).status).toBe(401);
    expect((await request("/api/guest/preferences/interpret", prompt())).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await request("/api/gate", { password: "wrong" })).status).toBe(401);
    expect((await request("/api/gate", { password: fixturePassword })).status).toBe(429);
    env.SHARED_ACCESS_PASSWORD = "";
    expect((await request("/api/gate", { password: fixturePassword }, "", "192.0.2.2")).status).toBe(503);
    env.ACCESS_MODE = "membership";
    expect((await request("/api/gate", { password: fixturePassword }, "", "192.0.2.2")).status).toBe(503);
    expect(calls).toBe(0);
  });
  it("bounds global guessing and denies foreign origins before opening sessions", async () => {
    for (let i = 0; i < 50; i++) expect((await request("/api/gate", { password: "wrong" }, "", `192.0.2.${i + 1}`)).status).toBe(401);
    expect((await request("/api/gate", { password: fixturePassword }, "", "192.0.2.200")).status).toBe(429);
    expect((await request("/api/gate", { password: fixturePassword }, "", "192.0.2.201", "https://foreign.example")).status).toBe(403);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_sessions").first()).toEqual({ n: 0 });
  });
  it("enforces the 200-guest capacity atomically and reclaims expired sessions", async () => {
    const version = await hash(fixturePassword);
    await env.DB.batch(Array.from({ length: 199 }, (_, i) => env.DB.prepare("INSERT INTO guest_sessions(id,token_hash,credential_version,expires_at) VALUES(?,?,?,?)")
      .bind(`guest-${i}`, `hash-${i}`, version, Date.now() + 3600000)));
    const results = await Promise.all([request("/api/gate", { password: fixturePassword }, "", "192.0.2.1"),
      request("/api/gate", { password: fixturePassword }, "", "192.0.2.2")]);
    expect(results.map(r => r.status).sort()).toEqual([200, 503]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_sessions").first()).toEqual({ n: 200 });
    await env.DB.prepare("UPDATE guest_sessions SET expires_at=0 WHERE id='guest-0'").run();
    await gate("192.0.2.3");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_sessions").first()).toEqual({ n: 200 });
  });
  it("does not queue save mail beyond the unchanged non-digest daily limit", async () => {
    const cookie = await gate(), d = await draft(cookie), day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT INTO quotas VALUES(?,20,20)").bind(day).run();
    expect((await request("/api/guest/preferences/save", { ...review(d), email: "new@example.com", website: "" }, cookie)).status).toBe(503);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 0 });
  });
  it("isolates drafts and blocks all private access after credential rotation", async () => {
    const one = await gate(), two = await gate("192.0.2.2");
    const d = await draft(one);
    expect(await (await request("/api/guest/preferences/draft", undefined, two)).json()).toMatchObject({ draft: null });
    expect((await request("/api/guest/preferences/save", { ...review(d), email: "new@example.com", website: "" }, two)).status).toBe(409);
    expect((await request("/api/admin/members", undefined, one)).status).toBe(401);
    const owner = await account("owner@example.com");
    expect((await request("/api/me", undefined, `${one}; ${owner.cookie}`)).status).toBe(200);
    env.SHARED_ACCESS_PASSWORD = "c".repeat(64);
    for (const path of ["/api/me", "/api/catalog", "/api/guest/preferences/draft", "/api/preferences/draft"]) {
      expect((await request(path, undefined, `${one}; ${owner.cookie}`)).status).toBe(401);
    }
    expect(await env.DB.prepare("SELECT search_version FROM subscriptions").first()).toEqual({ search_version: 7 });
  });
  it("verifies email without saving, requires a second exact confirmation, and rejects scanners, wrong browsers and replays", async () => {
    const cookie = await gate(), other = await gate("192.0.2.2"), d = await draft(cookie);
    const token = await saveLink(cookie, d);
    expect((await request("/api/guest/preferences/verify", undefined, cookie)).status).toBe(404);
    expect((await request("/api/guest/preferences/verify", { token }, other)).status).toBe(410);
    const before = await env.DB.prepare("SELECT filters,search_version,alerts_enabled,state FROM subscriptions").first();
    expect(before).toMatchObject({ search_version: 0, alerts_enabled: 0, state: "unverified" });
    const verified = await request("/api/guest/preferences/verify", { token }, cookie);
    expect(verified.status).toBe(200);
    const signed = `${cookie}; ${session(verified)}`;
    expect(await env.DB.prepare("SELECT filters,search_version,alerts_enabled,state FROM subscriptions").first())
      .toEqual({ ...before, state: "approved" });
    expect((await request("/api/guest/preferences/verify", { token }, cookie)).status).toBe(410);
    const data = await confirmData(cookie, d);
    expect((await request("/api/guest/preferences/confirm", data, cookie)).status).toBe(401);
    expect((await request("/api/guest/preferences/confirm", { ...data, consent: false }, signed)).status).toBe(400);
    expect((await request("/api/guest/preferences/confirm", { ...data, enabled: true }, signed)).status).toBe(409);
    expect((await request("/api/guest/preferences/confirm", data, signed)).status).toBe(200);
    expect((await request("/api/guest/preferences/confirm", data, signed)).status).toBe(409);
    expect(await env.DB.prepare("SELECT state,search_version,alerts_enabled FROM subscriptions").first())
      .toEqual({ state: "approved", search_version: 1, alerts_enabled: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox WHERE kind='digest'").first()).toEqual({ n: 0 });
  });
  it("keeps the existing owner profile and identity untouched before verification and refuses stale saved versions", async () => {
    const owner = await account("owner@example.com"), cookie = await gate(), d = await draft(cookie);
    const before = await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(owner.id).first();
    const token = await saveLink(cookie, d, "owner@example.com");
    expect(await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(owner.id).first()).toEqual(before);
    const verified = await request("/api/guest/preferences/verify", { token }, cookie);
    expect(verified.status).toBe(200);
    expect(await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(owner.id).first()).toEqual(before);
    const signed = `${cookie}; ${session(verified)}`;
    expect(await (await request("/api/me", undefined, signed)).json()).toMatchObject({ owner: true, searchVersion: 7 });
    await env.DB.prepare("UPDATE subscriptions SET search_version=8 WHERE id=?").bind(owner.id).run();
    expect((await request("/api/guest/preferences/confirm", await confirmData(cookie, d), signed)).status).toBe(409);
    expect(await env.DB.prepare("SELECT preference_profile FROM subscriptions").first()).toEqual({ preference_profile: (before as { preference_profile: string }).preference_profile });
  });
  it.each(["rejected", "revoked"] as const)("never silently reinstates %s accounts or reveals their state", async state => {
    await account("blocked@example.com", state);
    const cookie = await gate(), d = await draft(cookie);
    const response = await request("/api/guest/preferences/save", { ...review(d), email: "blocked@example.com", website: "" }, cookie);
    expect(response.status).toBe(202);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_saves").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT state FROM subscriptions").first()).toEqual({ state });
  });
  it("requires a fresh gated email link for old pending accounts, without changing their saved search", async () => {
    const pending = await account("pending@example.com", "pending"), cookie = await gate();
    expect((await request("/api/apply", {}, cookie)).status).toBe(404);
    expect((await request("/api/login", { email: "pending@example.com", website: "" }, cookie)).status).toBe(202);
    const mail = await unseal<Mail>(env.TOKEN_SECRET, (await env.DB.prepare("SELECT payload FROM outbox").first<{ payload: string }>())!.payload);
    const token = mail.text.match(/#confirm=([a-f0-9]{64})/)![1];
    const other = await gate("192.0.2.2");
    expect((await request("/api/confirm", { token }, other)).status).toBe(410);
    expect((await request("/api/confirm", { token }, cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT state,search_version,alerts_enabled FROM subscriptions WHERE id=?").bind(pending.id).first())
      .toEqual({ state: "approved", search_version: 7, alerts_enabled: 0 });
  });
  it("invalidates challenges on edits, rejects activation without sources, and retains drafts on reload", async () => {
    const cookie = await gate(), d = await draft(cookie);
    expect((await request("/api/guest/preferences/save", { ...review(d), enabled: true, email: "new@example.com", website: "" }, cookie)).status).toBe(503);
    const token = await saveLink(cookie, d);
    const next = await draft(cookie, d.id);
    expect(await (await request("/api/guest/preferences/draft", undefined, cookie)).json()).toMatchObject({ draft: next, saveIntent: null });
    expect((await request("/api/guest/preferences/verify", { token }, cookie)).status).toBe(410);
    expect(await env.DB.prepare("SELECT search_version FROM subscriptions").first()).toEqual({ search_version: 0 });
  });
  it("concurrent guests claiming the same email cannot swap challenges or draft ownership", async () => {
    const one = await gate(), two = await gate("192.0.2.2"), first = await draft(one), second = await draft(two);
    const results = await Promise.all([
      request("/api/guest/preferences/save", { ...review(first), email: "same@example.com", website: "" }, one),
      request("/api/guest/preferences/save", { ...review(second), email: "same@example.com", website: "" }, two, "192.0.2.2"),
    ]);
    expect(results.map(r => r.status)).toEqual([202, 202]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_saves").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 1 });
    const intent = await env.DB.prepare("SELECT draft_id,guest_id FROM guest_saves").first<{ draft_id: string; guest_id: string }>();
    const linked = await env.DB.prepare("SELECT guest_id FROM guest_drafts WHERE id=?").bind(intent!.draft_id).first<{ guest_id: string }>();
    expect(linked?.guest_id).toBe(intent?.guest_id);
    expect(await env.DB.prepare("SELECT search_version,alerts_enabled FROM subscriptions").first()).toEqual({ search_version: 0, alerts_enabled: 0 });
  });
  it("shares the six-call global budget across guests and members without cookie resets or refunds", async () => {
    const owner = await account("owner@example.com");
    for (let i = 0; i < 3; i++) {
      const cookie = await gate(`192.0.2.${i + 1}`);
      expect((await request("/api/guest/preferences/interpret", prompt(), cookie)).status).toBe(200);
    }
    const cookie = await gate("192.0.2.4");
    for (let i = 0; i < 3; i++) expect((await request("/api/preferences/interpret", { ...prompt(), expectedVersion: 7 }, `${cookie}; ${owner.cookie}`)).status).toBe(200);
    const next = await gate("192.0.2.5");
    expect((await request("/api/guest/preferences/interpret", prompt(), next)).status).toBe(429);
    expect(calls).toBe(6);
    expect(await env.DB.prepare("SELECT count(*) AS n,sum(reserved) AS total FROM ai_attempts").first()).toEqual({ n: 6, total: 6000 });
    expect(await (await request("/api/gate", undefined, next)).json()).toMatchObject({ quota: { remaining: 0, limit: 6 } });
    await draft(next);
  });
  it("keeps three interpretations per guest draft and closing access does not refund reservations", async () => {
    const cookie = await gate();
    let previousId: string | null = null;
    for (let i = 1; i <= 3; i++) {
      const response = await request("/api/guest/preferences/interpret", { ...prompt(), previousId }, cookie);
      expect(response.status).toBe(200);
      const d = draftSchema.parse((await response.json() as { draft: unknown }).draft);
      expect(d.turns).toBe(i); previousId = d.id;
    }
    const fourth = await request("/api/guest/preferences/interpret", { ...prompt(), previousId }, cookie);
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ code: "turns" });
    expect(calls).toBe(3);
    const closed = await request("/api/gate/logout", {}, cookie);
    expect(closed.status).toBe(200);
    expect(closed.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringContaining("__Host-kk_guest=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure"),
      expect.stringContaining("__Host-kk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure"),
    ]));
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_drafts").first()).toEqual({ n: 0 });
    const next = await gate("192.0.2.2");
    expect(await (await request("/api/gate", undefined, next)).json()).toMatchObject({ quota: { remaining: 3 } });
    expect(await env.DB.prepare("SELECT sum(reserved) AS total FROM ai_attempts").first()).toEqual({ total: 3000 });
  });
  it("retains one in-flight call per guest, two globally, and rejects late responses after rotation", async () => {
    const cookie = await gate();
    let finish!: (r: Response) => void;
    env.AI = { run: () => new Promise(resolve => { finish = resolve; }) };
    const first = request("/api/guest/preferences/interpret", prompt(), cookie);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect((await request("/api/guest/preferences/interpret", prompt(), cookie)).status).toBe(429);
    env.SHARED_ACCESS_PASSWORD = "c".repeat(64);
    finish(Response.json({ response: { profile: manualProfile({ ...defaultFilters, municipality: "Solna" }), question: null, conflicts: [] } }));
    expect((await first).status).toBe(401);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_drafts").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT state,reserved FROM ai_attempts").first()).toEqual({ state: "done", reserved: 1000 });
  });
  it("cleans bounded guest state and cascades account deletion/revocation without refunding AI", async () => {
    const cookie = await gate(), d = await draft(cookie), token = await saveLink(cookie, d);
    const verified = await request("/api/guest/preferences/verify", { token }, cookie);
    expect(verified.status).toBe(200);
    expect((await request("/api/guest/preferences/interpret", prompt(), cookie)).status).toBe(200);
    await env.DB.prepare("UPDATE subscriptions SET state='revoked'").run();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_sessions").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_drafts").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 1 });
    const another = await gate("192.0.2.2");
    await draft(another);
    await cleanup(env, Date.now() + 13 * 3600_000);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_sessions").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM guest_drafts").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 1 });
  });
  it("keeps signed unsubscribe ungated and removes associated drafts, sessions and challenges without erasing budgets", async () => {
    const cookie = await gate(), d = await draft(cookie), token = await saveLink(cookie, d);
    const verified = await request("/api/guest/preferences/verify", { token }, cookie);
    expect(verified.status).toBe(200);
    const member = await env.DB.prepare("SELECT id FROM subscriptions").first<{ id: string }>();
    await request("/api/guest/preferences/interpret", prompt(), cookie);
    const remove = await unsubscribeToken(env, member!.id);
    expect((await request("/api/unsubscribe", { token: remove })).status).toBe(200);
    for (const table of ["subscriptions", "sessions", "guest_sessions", "guest_drafts", "guest_saves"]) {
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
    }
    expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 1 });
  });
});
