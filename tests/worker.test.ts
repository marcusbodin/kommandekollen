import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { defaultFilters } from "../shared/model";
import { prepareDigest } from "../worker/mail";
import { hash, keyed, seal, unseal, type Env, type MemberState } from "../worker/support";
import { parseJsonLd } from "../scripts/collector";

const ORIGIN = "https://app.example.com", BASE = "https://api.example.com";
const bindings = {
  ADMIN_TOKEN: "test-admin-token-".repeat(4), TOKEN_SECRET: "test-encryption-secret-".repeat(4),
  RESEND_API_KEY: "test-no-live-mail", MAIL_FROM: "Kommandekollen <alerts@example.com>",
  PUBLIC_URL: `${ORIGIN}/`, ALLOWED_ORIGINS: ORIGIN, PRIVACY_CONTACT: "privacy@example.com",
  OWNER_EMAIL: "owner@example.com", SERVICE_ENABLED: "true",
  AUTHORIZED_SOURCES: JSON.stringify([{ id: "authorized", hosts: ["listings.example.com"], licenseReference: "Synthetic test fixture license", expiresAt: "2099-01-01T00:00:00Z" }]),
};
let mf: Miniflare, env: Env;
let sent: { payload: { text: string; to: string }; key: string | null }[];
let providerStatus: number;
async function request(path: string, body?: unknown, cookie?: string, admin = false, ip = "192.0.2.1") {
  return mf.dispatchFetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip,
      ...(cookie ? { Cookie: cookie } : {}), ...(admin ? { Authorization: `Bearer ${bindings.ADMIN_TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function seed(email: string, state: MemberState = "approved", alerts = false) {
  const id = crypto.randomUUID(), token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await env.DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,alerts_enabled,token_hash,token_expires,created_at,expires_at,consent_version)
    VALUES(?,?,?,?,?,'test application',?,?,?,?,?,'test')`).bind(
    id, email, await keyed(bindings.TOKEN_SECRET, `email:${email}`), JSON.stringify(defaultFilters), state, Number(alerts),
    await hash(crypto.randomUUID()), Date.now() + 3600_000, Date.now(), Date.now() + 180 * 86400_000,
  ).run();
  await env.DB.prepare("INSERT INTO sessions(token_hash,member_id,expires_at) VALUES(?,?,?)").bind(await hash(token), id, Date.now() + 3600_000).run();
  return { id, cookie: `__Host-kk_session=${token}` };
}
async function fixtureFeed() {
  const html = readFileSync(new URL("./fixtures/authorized-page.html", import.meta.url), "utf8");
  const listings = parseJsonLd(html, { id: "authorized", format: "jsonld-page", url: "https://listings.example.com/upcoming", licenseReference: "test license", licenseExpires: "2099-01-01T00:00:00Z", allowedListingHosts: ["listings.example.com"] });
  return { sourceId: "authorized", observedAt: new Date().toISOString(), listings };
}
beforeEach(async () => {
  sent = []; providerStatus = 200;
  mf = new Miniflare({
    modules: true, scriptPath: ".worker/index.js", compatibilityDate: "2025-09-24",
    d1Databases: ["DB"], bindings,
    outboundService: async request => {
      if (new URL(request.url).origin !== "https://api.resend.com") throw new Error("Unexpected outbound request");
      sent.push({ payload: z.object({ text: z.string(), to: z.string() }).parse(await request.json()), key: request.headers.get("Idempotency-Key") });
      return Response.json(providerStatus === 200 ? { id: "test-provider-id" } : { error: "mock provider failure" }, { status: providerStatus });
    },
  });
  const db = await mf.getD1Database("DB");
  env = { ...bindings, DB: db };
  const migration = readFileSync("worker/migrations/0001_initial.sql", "utf8");
  // D1 exec accepts multi-statement SQL when line breaks inside statements are flattened.
  await db.exec(migration.replace(/\n/g, " "));
});
afterEach(async () => { await mf.dispose(); });

describe("membership authorization", () => {
  it("never exposes inventory or source-run results to anonymous, unverified, pending, rejected or revoked users", async () => {
    expect((await request("/admin/ingest", await fixtureFeed(), undefined, true)).status).toBe(200);
    expect((await request("/api/catalog")).status).toBe(401);
    const publicStatus = await (await request("/api/status")).json();
    expect(publicStatus).not.toHaveProperty("listings");
    expect(publicStatus).not.toHaveProperty("sources");
    expect(publicStatus).not.toHaveProperty("owner");
    for (const state of ["unverified", "pending", "rejected", "revoked"] as const) {
      const member = await seed(`${state}@example.com`, state);
      expect((await request("/api/catalog", undefined, member.cookie)).status).toBe(state === "unverified" || state === "pending" ? 403 : 401);
      expect((await request("/api/search", { filters: defaultFilters, enabled: true, consent: true }, member.cookie)).status).not.toBe(200);
    }
    const approved = await seed("approved@example.com");
    const result = await (await request("/api/catalog", undefined, approved.cookie)).json();
    expect(result).toHaveProperty("listings");
    expect(JSON.stringify(result)).toContain("Exempelgatan");
  });
  it("email verification creates pending membership, not access; GET scanners cannot confirm", async () => {
    const response = await request("/api/apply", { email: "new@example.com", application: "Looking for a home", consent: true, website: "" });
    expect(response.status).toBe(202);
    await request("/admin/tick", {}, undefined, true);
    expect(sent).toHaveLength(1);
    const token = /#confirm=([a-f0-9]{64})/.exec(sent[0].payload.text)![1];
    expect((await request(`/api/confirm?token=${token}`)).status).not.toBe(200);
    const confirmed = await request("/api/confirm", { token });
    expect(confirmed.status).toBe(200);
    const cookie = confirmed.headers.get("Set-Cookie")!.split(";")[0];
    expect(confirmed.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(confirmed.headers.get("Set-Cookie")).toContain("Secure");
    expect((await request("/api/catalog", undefined, cookie)).status).toBe(403);
    expect(await (await request("/api/me", undefined, cookie)).json()).toMatchObject({ state: "pending", alertsEnabled: false, owner: false });
    expect((await request("/api/confirm", { token })).status).toBe(200);
    expect(await env.DB.prepare("SELECT token_hash FROM subscriptions").first()).toEqual({ token_hash: await hash(token) });
    expect(JSON.stringify(await env.DB.prepare("SELECT payload FROM outbox").all())).not.toContain(token);
  });
  it("only the explicitly configured, email-verified owner gains the owner role", async () => {
    await request("/api/login", { email: "owner@example.com", website: "" });
    await request("/admin/tick", {}, undefined, true);
    const token = /#confirm=([a-f0-9]{64})/.exec(sent[0].payload.text)![1];
    const confirmed = await request("/api/confirm", { token });
    const cookie = confirmed.headers.get("Set-Cookie")!.split(";")[0];
    expect(await (await request("/api/me", undefined, cookie)).json()).toMatchObject({ owner: true, state: "approved", alertsEnabled: false });
    const response = await request("/api/apply", { email: "attacker@example.com", application: "First owner please", consent: true, website: "", role: "owner" }, undefined, false, "192.0.2.2");
    expect(response.status).toBe(400);
  });
  it("rejects non-owner review; requires verified pending applications; revocation immediately gates sessions and cancels mail", async () => {
    const owner = await seed("owner@example.com"), member = await seed("member@example.com"), pending = await seed("pending@example.com", "pending");
    expect((await request("/api/admin/members", undefined, member.cookie)).status).toBe(403);
    expect((await request("/api/admin/review", { memberId: pending.id, decision: "approve" }, member.cookie)).status).toBe(403);
    const unverified = await seed("unverified@example.com", "unverified");
    expect((await request("/api/admin/review", { memberId: unverified.id, decision: "approve" }, owner.cookie)).status).toBe(409);
    expect((await request("/api/admin/review", { memberId: pending.id, decision: "approve" }, owner.cookie)).status).toBe(200);
    expect((await request("/api/me", undefined, pending.cookie)).status).toBe(401);
    expect(await env.DB.prepare("SELECT state,alerts_enabled FROM subscriptions WHERE id=?").bind(pending.id).first()).toEqual({ state: "approved", alerts_enabled: 0 });
    expect((await request("/api/admin/review", { memberId: member.id, decision: "revoke" }, owner.cookie)).status).toBe(200);
    expect((await request("/api/catalog", undefined, member.cookie)).status).toBe(401);
    expect((await request("/api/admin/review", { memberId: owner.id, decision: "revoke" }, owner.cookie)).status).toBe(400);
  });
  it("isolates saved searches and deletes member data with authenticated explicit POST", async () => {
    const one = await seed("one@example.com"), two = await seed("two@example.com");
    expect((await request("/api/search", { filters: { ...defaultFilters, municipality: "Solna" }, enabled: true, consent: true, memberId: two.id }, one.cookie)).status).toBe(400);
    expect((await request("/api/search", { filters: { ...defaultFilters, municipality: "Solna" }, enabled: true, consent: true }, one.cookie)).status).toBe(200);
    expect(await (await request("/api/me", undefined, two.cookie)).json()).toMatchObject({ alertsEnabled: false, filters: { municipality: null } });
    const signature = await keyed(bindings.TOKEN_SECRET, `unsubscribe:${one.id}`);
    expect((await request(`/api/unsubscribe?token=${one.id}.${signature}`)).status).not.toBe(200);
    expect((await request("/api/unsubscribe", { token: `${one.id}.${signature}` })).status).toBe(200);
    expect((await request("/api/unsubscribe", { token: `${one.id}.${signature}` })).status).toBe(200);
    expect((await request("/api/catalog", undefined, one.cookie)).status).toBe(401);
    expect(await env.DB.prepare("SELECT id FROM subscriptions WHERE id=?").bind(two.id).first()).toBeTruthy();
  });
  it("serializes competing owner decisions and requires a new login after approval", async () => {
    const owner = await seed("owner@example.com"), pending = await seed("review@example.com", "pending");
    const results = await Promise.all([
      request("/api/admin/review", { memberId: pending.id, decision: "approve" }, owner.cookie),
      request("/api/admin/review", { memberId: pending.id, decision: "approve" }, owner.cookie),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM admin_audit").first<{ n: number }>())?.n).toBe(1);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM outbox WHERE kind='notice'").first<{ n: number }>())?.n).toBe(1);
    await request("/api/login", { email: "review@example.com", website: "" });
    await request("/admin/tick", {}, undefined, true);
    await request("/admin/tick", {}, undefined, true);
    const mail = sent.find(mail => mail.payload.text.includes("#confirm="))!;
    const token = /#confirm=([a-f0-9]{64})/.exec(mail.payload.text)![1];
    const confirmed = await request("/api/confirm", { token });
    const cookie = confirmed.headers.get("Set-Cookie")!.split(";")[0];
    expect((await request("/api/catalog", undefined, cookie)).status).toBe(200);
    await request("/api/logout", {}, cookie);
    expect((await request("/api/confirm", { token })).status).toBe(410);
  });
  it("enforces capacity atomically while reserving an owner slot", async () => {
    await Promise.all(Array.from({ length: 39 }, (_, i) => seed(`member${i}@example.com`, "pending")));
    await expect(seed("overflow@example.com", "pending")).rejects.toThrow("capacity");
    expect(await (await request("/api/status")).json()).toMatchObject({ acceptingApplications: false });
    expect((await request("/api/apply", { email: "extra@example.com", application: "A new application", consent: true, website: "" })).status).toBe(503);
    expect((await request("/api/login", { email: "owner@example.com", website: "" })).status).toBe(202);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first<{ n: number }>())?.n).toBe(40);
  });
  it("enforces strict CORS, JSON, body limits, expiry and no unauthenticated infrastructure actions", async () => {
    const response = await mf.dispatchFetch(`${BASE}/api/apply`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await request("/admin/tick", {})).status).toBe(401);
    expect((await request("/admin/ingest", await fixtureFeed())).status).toBe(401);
    expect((await mf.dispatchFetch(`${BASE}/api/login`, { method: "POST", headers: { Origin: ORIGIN }, body: "{}" })).status).toBe(415);
    expect((await request("/api/apply", { value: "x".repeat(5000) })).status).toBe(413);
    const user = await seed("expired@example.com");
    await env.DB.prepare("UPDATE sessions SET expires_at=0 WHERE member_id=?").bind(user.id).run();
    expect((await request("/api/catalog", undefined, user.cookie)).status).toBe(401);
  });
  it("responds identically for duplicate/unknown login addresses and throttles abuse", async () => {
    await seed("known@example.com");
    const unknown = await request("/api/login", { email: "unknown@example.com", website: "" });
    const known = await request("/api/login", { email: "known@example.com", website: "" });
    expect(await unknown.json()).toEqual(await known.json());
    expect((await request("/api/login", { email: "known@example.com", website: "" })).status).toBe(202);
    expect((await request("/api/login", { email: "known@example.com", website: "" })).status).toBe(429);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM outbox").first<{ n: number }>())?.n).toBe(1);
  });
});
describe("inventory and transactional mail", () => {
  it("preserves inventory on failed source runs, deduplicates snapshots and rejects unauthorized sources", async () => {
    const feed = await fixtureFeed();
    expect((await request("/admin/ingest", feed, undefined, true)).status).toBe(200);
    expect(await (await request("/admin/ingest", feed, undefined, true)).json()).toMatchObject({ duplicate: true });
    expect((await request("/admin/source-failure", { sourceId: "authorized", code: "fetch_failed" }, undefined, true)).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM listings WHERE active=1").first<{ n: number }>())?.n).toBe(1);
    expect((await request("/admin/ingest", { ...feed, sourceId: "fastighetsbyran", listings: [] }, undefined, true)).status).toBe(403);
    expect((await request("/admin/ingest", { ...feed, listings: [{ ...feed.listings[0], url: "https://evil.example/listing" }] }, undefined, true)).status).toBe(400);
  });
  it("queues only approved opted-in members, sends once and preserves unseen matches after provider errors", async () => {
    const user = await seed("digest@example.com", "approved", true);
    await seed("pending@example.com", "pending", true);
    await seed("revoked@example.com", "revoked", true);
    await seed("disabled@example.com", "approved", false);
    await request("/admin/ingest", await fixtureFeed(), undefined, true);
    const morning = new Date().toISOString().slice(0, 10) + "T06:00:00Z";
    await prepareDigest(env, Date.parse(morning));
    await prepareDigest(env, Date.parse(morning));
    expect((await env.DB.prepare("SELECT count(*) AS n FROM outbox WHERE kind='digest'").first<{ n: number }>())?.n).toBe(1);
    providerStatus = 503;
    await request("/admin/tick", {}, undefined, true);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM seen").first<{ n: number }>())?.n).toBe(0);
    expect(await env.DB.prepare("SELECT error_code FROM outbox").first()).toMatchObject({ error_code: "provider_503" });
    await env.DB.prepare("UPDATE outbox SET next_attempt=0").run();
    providerStatus = 200;
    await Promise.all([request("/admin/tick", {}, undefined, true), request("/admin/tick", {}, undefined, true)]);
    expect(sent).toHaveLength(2);
    expect(sent[0].key).toBe(sent[1].key);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM seen WHERE subscription_id=?").bind(user.id).first<{ n: number }>())?.n).toBe(1);
    expect(await env.DB.prepare("SELECT state,payload FROM outbox").first()).toMatchObject({ state: "sent", payload: "" });
    await prepareDigest(env, Date.parse(morning) + 86400_000);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM outbox").first<{ n: number }>())?.n).toBe(1);
  });
  it("rechecks revoked membership at send time and never consumes unseen listings", async () => {
    const member = await seed("stopped@example.com", "approved", true);
    await request("/admin/ingest", await fixtureFeed(), undefined, true);
    await prepareDigest(env, Date.parse(new Date().toISOString().slice(0, 10) + "T06:00:00Z"));
    await env.DB.prepare("UPDATE subscriptions SET state='revoked' WHERE id=?").bind(member.id).run();
    await request("/admin/tick", {}, undefined, true);
    expect(sent).toHaveLength(0);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM seen").first<{ n: number }>())?.n).toBe(0);
  });
  it("reserves daily, monthly and authentication-email quotas atomically under concurrency", async () => {
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7);
    await env.DB.prepare("INSERT INTO quotas(period,total) VALUES(?,79)").bind(day).run();
    await env.DB.prepare("INSERT INTO quotas(period,total) VALUES(?,2399)").bind(month).run();
    const attempt = () => env.DB.prepare("INSERT INTO send_attempts(id,outbox_id,day,month,kind,created_at) VALUES(?,'test',?,?,'digest',?)")
      .bind(crypto.randomUUID(), day, month, now).run();
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await env.DB.prepare("SELECT total FROM quotas WHERE period=?").bind(day).first()).toEqual({ total: 80 });
    expect(await env.DB.prepare("SELECT total FROM quotas WHERE period=?").bind(month).first()).toEqual({ total: 2400 });
    await env.DB.prepare("UPDATE quotas SET total=0,verification=20").run();
    await expect(env.DB.prepare("INSERT INTO send_attempts(id,outbox_id,day,month,kind,created_at) VALUES(?,'test',?,?,'notice',?)")
      .bind(crypto.randomUUID(), day, month, now).run()).rejects.toThrow("mail_quota");
  });
  it("encrypts queued payloads and quarantines ambiguous sends after the idempotency window", async () => {
    const data = { to: "private@example.com", token: "sensitive-token" };
    const ciphertext = await seal(bindings.TOKEN_SECRET, data);
    expect(ciphertext).not.toContain(data.to);
    expect(await unseal(bindings.TOKEN_SECRET, ciphertext)).toEqual(data);
    const member = await seed("uncertain@example.com", "approved", true);
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO outbox(id,subscription_id,kind,day,payload,listing_ids,state,created_at,next_attempt,first_attempt)
      VALUES('uncertain',?,'digest','test',?,'[]','pending',?,0,?)`)
      .bind(member.id, ciphertext, now - 24 * 3600_000, now - 24 * 3600_000).run();
    await request("/admin/tick", {}, undefined, true);
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT state,error_code FROM outbox").first()).toEqual({ state: "expired", error_code: "delivery_uncertain" });
  });
});
