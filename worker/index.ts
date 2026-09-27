import { z } from "zod";
import { defaultFilters, filterSchema, sourceIds } from "../shared/model";
import { sources } from "../shared/sources";
import { manualProfile } from "../shared/preferences";
import { aiReady } from "./ai";
import { preferenceRoute, savedProfile } from "./preferences";
import { gateRoute, guestPreferenceRoute } from "./guest";
import { publicListings, readListings } from "./listings";
import { ingestBatch } from "./observations";
import { approvalNotice, cleanup, dispatchOne, prepareDigest, queueVerification } from "./mail";
import {
  ApiError, authenticate, listingAuthorizations, propertyEmailsReady, equalSecrets, hash, isOwner, json, keyed, randomToken,
  rate, readJson, serviceReady, sessionCookie, authenticateGuest, guestCookie, sharedAccess, type Env, type Member,
} from "./support";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const applySchema = z.object({
  email: emailSchema, application: z.string().trim().min(10).max(500), consent: z.literal(true), website: z.string().max(0),
}).strict();
const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const unsubscribeSchema = z.object({ token: z.string().regex(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/) }).strict();
async function tick(env: Env) {
  if (!serviceReady(env)) throw new ApiError(503, "not_ready", "Tjänsten är inte aktiverad.");
  await cleanup(env);
  await prepareDigest(env);
  await dispatchOne(env);
}
async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname, now = Date.now();
  if (path.startsWith("/admin/")) {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !await equalSecrets(request.headers.get("authorization") || "", `Bearer ${env.ADMIN_TOKEN}`)) {
      throw new ApiError(401, "unauthorized", "Åtkomst nekad.");
    }
    return infrastructure(request, env, path, now);
  }
  if (!await rate(env, "public", 10_000, 86400)) throw new ApiError(429, "busy", "Dagens trafikgräns är nådd. Försök i morgon.");
  const ipHash = await keyed(env.TOKEN_SECRET || "local-unconfigured", `ip:${request.headers.get("CF-Connecting-IP") || "local"}`);
  if (!await rate(env, `request:${ipHash}`, 180, 3600)) throw new ApiError(429, "rate", "För många försök. Vänta en timme.");
  if (request.method === "GET" && path === "/api/status") {
    const capacity = await env.DB.prepare("SELECT count(*) AS n FROM subscriptions WHERE email!=?")
      .bind((env.OWNER_EMAIL || "").trim().toLowerCase()).first<{ n: number }>();
    const ready = serviceReady(env);
    return json({ serviceReady: ready, acceptingApplications: !sharedAccess(env) && ready && !!capacity && capacity.n < 39,
      accessMode: sharedAccess(env) ? "shared" : "membership", privacyContact: env.PRIVACY_CONTACT || null });
  }
  if (path === "/api/gate" || path === "/api/gate/logout") return gateRoute(request, env, ipHash);
  const guest = path !== "/api/unsubscribe" && sharedAccess(env) ? await authenticateGuest(request, env) : null;
  if (path === "/api/listings") {
    if (!guest) await authenticate(request, env);
    if (request.method === "GET") return publicListings(request, env);
    throw new ApiError(404, "not_found", "Sidan finns inte.");
  }
  if (path.startsWith("/api/guest/preferences/")) {
    if (!guest) throw new ApiError(404, "not_found", "Sidan finns inte.");
    return guestPreferenceRoute(request, env, ipHash, guest);
  }
  if (request.method === "POST" && (path === "/api/apply" || path === "/api/login")) {
    if (guest && path === "/api/apply") throw new ApiError(404, "applications_closed", "Ingen medlemsansökan behövs. Prova och verifiera e-post när du sparar.");
    if (!serviceReady(env)) throw new ApiError(503, "not_ready", "Medlemsansökan och inloggning är inte aktiverade ännu.");
    const input = await readJson(request);
    const data = path === "/api/apply" ? applySchema.parse(input) : z.object({ email: emailSchema, website: z.string().max(0) }).strict().parse(input);
    const day = new Date(now).toISOString().slice(0, 10);
    const quotas = await env.DB.prepare("SELECT period,total,verification FROM quotas WHERE period IN (?,?)")
      .bind(day, day.slice(0, 7)).all<{ period: string; total: number; verification: number }>();
    if (quotas.results.some(quota => quota.period === day ? quota.total >= 80 || quota.verification >= 20 : quota.total >= 2400)) {
      throw new ApiError(503, "mail_quota", "Mejlkvoten är förbrukad. Försök igen när kvoten har återställts; ingen ny länk har köats.");
    }
    if (path === "/api/apply" && data.email !== env.OWNER_EMAIL.trim().toLowerCase()) {
      const capacity = await env.DB.prepare("SELECT count(*) AS n FROM subscriptions WHERE email!=?")
        .bind(env.OWNER_EMAIL.trim().toLowerCase()).first<{ n: number }>();
      if (capacity && capacity.n >= 39) throw new ApiError(503, "capacity", "Piloten är full. Nya ansökningar är tillfälligt pausade.");
    }
    if (!await rate(env, `login:${ipHash}`, 3, 3600) || !await rate(env, "login:all", 50, 86400)) {
      throw new ApiError(429, "rate", "För många försök. Vänta en timme och försök igen.");
    }
    const response = () => json({ message: guest
      ? "Om adressen kan användas köas en inloggningslänk. Öppna den i samma webbläsare inom 30 minuter. Inga sökningar ändras."
      : "Begäran har tagits emot. Om adressen kan användas köas en inloggningslänk. Kontrollera skräpposten. Nya medlemmar behöver också ägarens godkännande." }, 202);
    const emailHash = await keyed(env.TOKEN_SECRET, `email:${data.email}`);
    if (!await rate(env, `email:${emailHash}`, 1, 3600)) return response();
    const existing = await env.DB.prepare("SELECT id,email,state FROM subscriptions WHERE email_hash=?")
      .bind(emailHash).first<Pick<Member, "id" | "email" | "state">>();
    if (existing?.state === "rejected" || existing?.state === "revoked") return response();
    const owner = data.email === env.OWNER_EMAIL.trim().toLowerCase();
    if (!existing && path === "/api/login" && !owner) return response();
    if (!existing) {
      const capacity = await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first<{ n: number }>();
      if (capacity && capacity.n >= 40) {
        console.warn(JSON.stringify({ event: "application_deferred", code: "capacity" }));
        return response();
      }
    }
    const id = existing?.id || crypto.randomUUID(), token = randomToken();
    const update = existing
      ? env.DB.prepare("UPDATE subscriptions SET token_hash=?,token_expires=?,token_used=0 WHERE id=?")
        .bind(await hash(token), now + 30 * 60_000, id)
      : env.DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,owner_slot,token_hash,token_expires,created_at,expires_at,consent_version)
        VALUES(?,?,?,?,'unverified',?,?,?,?,?,?,'2026-09-25-membership')`)
        .bind(id, data.email, emailHash, JSON.stringify(defaultFilters), "application" in data ? data.application : "Configured owner", Number(owner),
          await hash(token), now + 30 * 60_000, now, now + 48 * 3600_000);
    try {
      await env.DB.batch([update, ...(guest ? [env.DB.prepare("INSERT INTO gate_logins(token_hash,guest_id,member_id,expires_at) VALUES(?,?,?,?)")
        .bind(await hash(token), guest.id, id, now + 30 * 60_000)] : []), await queueVerification(env, id, data.email, token, now)]);
    } catch (error) {
      if (!(error instanceof Error) || !/capacity|UNIQUE constraint/.test(error.message)) throw error;
      console.warn(JSON.stringify({ event: "application_deferred", code: "capacity_or_duplicate" }));
    }
    return response();
  }
  if (request.method === "POST" && path === "/api/confirm") {
    const { token } = tokenSchema.parse(await readJson(request));
    const tokenHash = await hash(token);
    if (guest && !await env.DB.prepare("SELECT token_hash FROM gate_logins WHERE token_hash=? AND guest_id=? AND expires_at>?")
      .bind(tokenHash, guest.id, now).first()) {
      throw new ApiError(410, "gate_link", "Öppna länken i samma webbläsare där du begärde den, med lösenordsåtkomsten kvar. Annars behöver du begära en ny länk.");
    }
    const row = await env.DB.prepare("SELECT id,email,state,token_expires,token_used FROM subscriptions WHERE token_hash=?")
      .bind(tokenHash).first<Member & { token_expires: number; token_used: number }>();
    if (!row || row.token_expires < now || ["rejected", "revoked"].includes(row.state)) {
      throw new ApiError(410, "expired", "Länken har gått ut eller är ogiltig. Begär en ny inloggningslänk.");
    }
    const session = await keyed(env.TOKEN_SECRET, `session:${token}`);
    const sessionHash = await hash(session);
    // Only an unused email token can create a session. Replays may reuse, never recreate, that session.
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO sessions(token_hash,member_id,expires_at)
        SELECT ?,id,? FROM subscriptions WHERE token_hash=? AND token_used=0 AND state NOT IN ('rejected','revoked')`)
        .bind(sessionHash, now + 12 * 3600_000, tokenHash),
      env.DB.prepare(`UPDATE subscriptions SET token_used=1,
        state=CASE WHEN state='unverified' OR (?=1 AND state='pending') THEN ? ELSE state END,
        expires_at=CASE WHEN state='unverified' OR (?=1 AND state='pending') THEN ? ELSE expires_at END
        WHERE token_hash=? AND state NOT IN ('rejected','revoked')`)
        .bind(Number(!!guest), guest || isOwner(env, row) ? "approved" : "pending", Number(!!guest), now + (guest || isOwner(env, row) ? 180 : 30) * 86400_000, tokenHash),
      ...(guest ? [env.DB.prepare("UPDATE guest_sessions SET member_id=? WHERE id=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)")
        .bind(row.id, guest.id, sessionHash)] : []),
    ]);
    if (!await env.DB.prepare("SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?").bind(sessionHash, now).first()) {
      throw new ApiError(410, "used", "Länken är redan använd. Begär en ny inloggningslänk.");
    }
    return new Response(JSON.stringify({ message: guest || isOwner(env, row) || row.state === "approved" ? "Du är inloggad. Din sparade sökning är oförändrad." : "E-postadressen är verifierad. Ansökan väntar på ägarens godkännande; inga bostäder eller bevakningar är tillgängliga ännu." }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(request, session) },
    });
  }
  if (request.method === "POST" && path === "/api/unsubscribe") {
    const { token } = unsubscribeSchema.parse(await readJson(request));
    const [id, signature] = token.split(".");
    if (!env.TOKEN_SECRET || !await equalSecrets(signature, await keyed(env.TOKEN_SECRET, `unsubscribe:${id}`))) {
      throw new ApiError(410, "invalid_link", "Länken är ogiltig.");
    }
    await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(id).run();
    return json({ message: "Medlemskapet och bevakningen har avslutats. Personuppgifterna är raderade ur den aktiva medlemsdatabasen. Ett mejl som redan skickas kan fortfarande komma fram." });
  }
  if (request.method === "POST" && path === "/api/logout") {
    const member = await authenticate(request, env, false);
    await env.DB.prepare("DELETE FROM sessions WHERE member_id=?").bind(member.id).run();
    if (guest) await env.DB.prepare("DELETE FROM guest_sessions WHERE member_id=? OR id=?").bind(member.id, guest.id).run();
    const headers = new Headers({ "Content-Type": "application/json", "Set-Cookie": sessionCookie(request, "", true) });
    if (guest) headers.append("Set-Cookie", guestCookie(request, "", true));
    return new Response(JSON.stringify({ message: "Du är utloggad på alla enheter." }), { headers });
  }
  if (request.method === "POST" && path === "/api/delete-account") {
    const member = await authenticate(request, env, false);
    await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(member.id).run();
    if (guest) await env.DB.prepare("DELETE FROM guest_sessions WHERE id=?").bind(guest.id).run();
    const headers = new Headers({ "Content-Type": "application/json", "Set-Cookie": sessionCookie(request, "", true) });
    if (guest) headers.append("Set-Cookie", guestCookie(request, "", true));
    return new Response(JSON.stringify({ message: "Medlemskapet och dess uppgifter har raderats." }), { headers });
  }
  if (request.method === "GET" && path === "/api/me") {
    const member = await authenticate(request, env, false);
    return json({ id: member.id, email: member.email, state: member.state, owner: isOwner(env, member),
      filters: filterSchema.parse(JSON.parse(member.filters)), alertsEnabled: !!member.alerts_enabled,
      profile: savedProfile(member), searchVersion: member.search_version, aiReady: aiReady(env) && serviceReady(env),
      alertsReady: propertyEmailsReady(env) });
  }
  if (path.startsWith("/api/preferences/")) return preferenceRoute(request, env, ipHash);
  if (!guest) await authenticate(request, env);
  if (request.method === "GET" && path === "/api/catalog") {
    const grants = listingAuthorizations(env), ids = new Set(grants.map(source => source.id));
    const runs = await env.DB.prepare("SELECT source_id,last_attempt,last_success,status,error_code,item_count FROM source_runs")
      .all<{ source_id: string; last_attempt: string; last_success: string | null; status: string; error_code: string | null; item_count: number }>();
    return json({
      listings: await readListings(env),
      sources: sources.map(source => {
        const run = runs.results.find(run => run.source_id === source.id);
        return { ...source, authorized: ids.has(source.id), coverage: grants.find(grant => grant.id === source.id)?.coverage ?? null,
          run: run ? { last_attempt: run.last_attempt, last_success: run.last_success, status: run.status,
            error_code: run.error_code, item_count: run.item_count } : null };
      }),
      serviceReady: serviceReady(env) && ids.size > 0, alertsReady: propertyEmailsReady(env), privacyContact: env.PRIVACY_CONTACT || null,
    });
  }
  if (request.method === "POST" && path === "/api/search") {
    const member = await authenticate(request, env);
    const data = z.object({ filters: filterSchema, enabled: z.boolean(), consent: z.literal(true), expectedVersion: z.number().int().nonnegative() }).strict().parse(await readJson(request));
    if (data.enabled && !propertyEmailsReady(env)) throw new ApiError(503, "alerts_paused", "Bostadsmejlen är pausade. Spara sökningen pausad.");
    const profile = JSON.stringify(data.filters) === JSON.stringify(filterSchema.parse(JSON.parse(member.filters)))
      ? savedProfile(member) : manualProfile(data.filters);
    const commit = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE subscriptions SET filters=?,preference_profile=?,alerts_enabled=?,consent_version=?,search_version=search_version+1,search_commit=?,draft_id=NULL WHERE id=? AND state='approved' AND search_version=?")
        .bind(JSON.stringify(data.filters), JSON.stringify(profile), Number(data.enabled), "2026-09-25-alerts", commit, member.id, data.expectedVersion),
      env.DB.prepare(`UPDATE outbox SET state='expired',payload='',error_code=CASE WHEN first_attempt IS NULL THEN 'search_changed' ELSE 'delivery_uncertain' END
        WHERE subscription_id=? AND kind='digest' AND state IN ('pending','sending') AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)`).bind(member.id, member.id, commit),
      env.DB.prepare("DELETE FROM search_drafts WHERE member_id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)").bind(member.id, member.id, commit),
    ]);
    if (results[0].meta.changes !== 1) throw new ApiError(409, "stale_search", "Sökningen ändrades i en annan flik. Läs in den igen; inget skrevs över.");
    return json({ message: data.enabled ? "Sökningen är sparad och bevakningen aktiverad. Bara nya matchningar skickas." : "Sökningen är sparad. Bostadsmejlen är pausade." });
  }
  if (path.startsWith("/api/admin/")) {
    const member = await authenticate(request, env);
    if (!isOwner(env, member)) throw new ApiError(403, "owner_required", "Endast ägaren kan hantera medlemskap.");
    if (request.method === "GET" && path === "/api/admin/members") {
      const rows = await env.DB.prepare("SELECT id,email,application,state,created_at,alerts_enabled FROM subscriptions ORDER BY created_at DESC LIMIT 40").all();
      return json({ members: rows.results });
    }
    if (request.method === "POST" && path === "/api/admin/review") {
      const data = z.object({ memberId: z.string().uuid(), decision: z.enum(["approve", "reject", "revoke"]) }).strict().parse(await readJson(request));
      if (guest && data.decision !== "revoke") throw new ApiError(400, "manual_approval_disabled", "I lösenordsläget verifieras e-post utan manuella medlemsbeslut.");
      const target = await env.DB.prepare("SELECT id,email,state FROM subscriptions WHERE id=?").bind(data.memberId).first<Member>();
      if (!target || isOwner(env, target)) throw new ApiError(400, "invalid_member", "Medlemskapet kan inte ändras här.");
      if ((data.decision === "approve" || data.decision === "reject") && target.state !== "pending") {
        throw new ApiError(409, "invalid_state", "Bara e-postverifierade, väntande ansökningar kan godkännas eller avslås.");
      }
      if (data.decision === "revoke" && target.state !== "approved") throw new ApiError(409, "invalid_state", "Bara godkända medlemskap kan återkallas.");
      const state = { approve: "approved", reject: "rejected", revoke: "revoked" }[data.decision];
      const auditId = crypto.randomUUID();
      const statements = [
        env.DB.prepare(`INSERT INTO admin_audit(id,actor_id,member_id,action,created_at)
          SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND state=?)`)
          .bind(auditId, member.id, target.id, data.decision, now, target.id, target.state),
        env.DB.prepare(`UPDATE subscriptions SET state=?,alerts_enabled=0,activated_at=?,expires_at=?
          WHERE id=? AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`)
          .bind(state, now, now + (state === "approved" ? 180 : 30) * 86400_000, target.id, auditId),
        env.DB.prepare("DELETE FROM sessions WHERE member_id=? AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)").bind(target.id, auditId),
        env.DB.prepare("DELETE FROM outbox WHERE subscription_id=? AND state IN ('pending','sending') AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)").bind(target.id, auditId),
      ];
      if (state === "approved") statements.push(await approvalNotice(env, target, now, auditId));
      const results = await env.DB.batch(statements);
      if (results[0].meta.changes !== 1) throw new ApiError(409, "changed", "Medlemskapet ändrades samtidigt. Uppdatera listan och försök igen.");
      return json({ message: { approve: "Medlemskapet är godkänt. Ett informationsmejl har köats. Medlemmen behöver logga in igen.", reject: "Ansökan är avslagen.", revoke: "Åtkomsten är återkallad. Sessioner och väntande mejl har tagits bort." }[data.decision] });
    }
  }
  throw new ApiError(404, "not_found", "Sidan finns inte.");
}

async function infrastructure(request: Request, env: Env, path: string, now: number) {
  if (request.method === "GET" && path === "/admin/status") {
    const [outbox, quotas, members, runs] = await env.DB.batch([
      env.DB.prepare("SELECT state,error_code,count(*) AS count FROM outbox GROUP BY state,error_code"),
      env.DB.prepare("SELECT * FROM quotas ORDER BY period DESC LIMIT 40"),
      env.DB.prepare("SELECT state,count(*) AS count FROM subscriptions GROUP BY state"),
      env.DB.prepare("SELECT * FROM source_runs"),
    ]);
    return json({ outbox: outbox.results, quotas: quotas.results, members: members.results, sources: runs.results });
  }
  if (request.method === "POST" && path === "/admin/tick") { await tick(env); return json({ processed: true }); }
  if (request.method === "POST" && path === "/admin/source-failure") {
    const data = z.object({ sourceId: z.enum(sourceIds), code: z.enum(["fetch_failed", "robots_blocked", "invalid_feed", "authorization_expired"]) }).strict()
      .parse(await readJson(request));
    await env.DB.prepare(`INSERT INTO source_runs(source_id,last_attempt,status,error_code) VALUES(?,?,'failed',?)
      ON CONFLICT(source_id) DO UPDATE SET last_attempt=excluded.last_attempt,status='failed',error_code=excluded.error_code`)
      .bind(data.sourceId, new Date(now).toISOString(), data.code).run();
    return json({ recorded: true });
  }
  if (request.method === "POST" && path === "/admin/ingest") return ingestBatch(request, env, "complete", now);
  if (request.method === "POST" && path === "/admin/observations") return ingestBatch(request, env, "partial", now);
  throw new ApiError(404, "not_found", "Sidan finns inte.");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    const isPublic = !new URL(request.url).pathname.startsWith("/admin/");
    let response: Response;
    try {
      if (origin && !allowed.includes(origin)) throw new ApiError(403, "origin", "Otillåtet ursprung.");
      if (isPublic && request.method === "POST" && !origin) throw new ApiError(403, "origin", "Ursprung saknas.");
      response = request.method === "OPTIONS" ? new Response(null, { status: 204 }) : await route(request, env);
    } catch (error) {
      if (error instanceof z.ZodError) response = json({ code: "validation", message: "Kontrollera uppgifterna och försök igen." }, 400);
      else if (error instanceof ApiError) response = json({ code: error.code, message: error.message }, error.status);
      else {
        const code = error instanceof Error && error.message.includes("inventory_capacity") ? "inventory_capacity" : "internal";
        console.error(JSON.stringify({ event: "request_failed", code }));
        response = json({ code, message: "Tjänsten kunde inte behandla begäran. Försök senare." }, 503);
      }
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Vary", "Origin, Cookie");
    if (origin && allowed.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledController, env: Env) {
    try {
      await cleanup(env);
      if (!serviceReady(env)) return;
      await prepareDigest(env);
      await dispatchOne(env);
    }
    catch { console.error(JSON.stringify({ event: "scheduled_failed", code: "tick_failed" })); throw new Error("scheduled_failed"); }
  },
};
