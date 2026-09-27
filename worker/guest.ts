import { z } from "zod";
import { defaultFilters } from "../shared/model";
import { draftSchema, manualProfile, profileSchema, type Draft, type Interpretation } from "../shared/preferences";
import { aiReady, interpret } from "./ai";
import { queueVerification } from "./mail";
import {
  ApiError, authenticate, authenticateGuest, authorizations, equalSecrets, gateVersion, guestCookie, hash, json,
  keyed, randomToken, rate, readJson, serviceReady, sessionCookie, type Env, type Guest, type Member,
} from "./support";

const stale = () => new ApiError(409, "stale_guest", "Utkastet eller den sparade sökningen har ändrats. Läs in utkastet och granska igen. Inget skrevs över.");
const idSchema = z.string().uuid();
const reviewSchema = z.object({
  id: idSchema, revision: z.number().int().nonnegative(), expectedVersion: z.literal(0),
  enabled: z.boolean(), acceptUnverified: z.boolean(), consent: z.literal(true),
}).strict();
type Row = { id: string; revision: number; profile: string; question: string; conflicts: string; turns: number; expires_at: number };
type Save = { id: string; guest_id: string; member_id: string; draft_id: string; revision: number; saved_version: number;
  enabled: number; accept_unverified: number; verified: number; consumed: number; expires_at: number };
const toDraft = (row: Row): Draft => draftSchema.parse({ id: row.id, revision: row.revision, baseVersion: 0,
  profile: JSON.parse(row.profile), question: JSON.parse(row.question), conflicts: JSON.parse(row.conflicts), turns: row.turns, expiresAt: row.expires_at });
async function getDraft(env: Env, guest: Guest) {
  const row = await env.DB.prepare("SELECT * FROM guest_drafts WHERE guest_id=? AND status='ready' AND expires_at>?")
    .bind(guest.id, Date.now()).first<Row>();
  return row ? toDraft(row) : null;
}
export async function aiAvailability(env: Env) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare("SELECT COALESCE(sum(reserved),0) AS reserved FROM ai_attempts WHERE day=?").bind(day).first<{ reserved: number }>();
  return { remaining: Math.max(0, Math.floor((6000 - (row?.reserved ?? 0)) / 1000)), limit: 6, day };
}
export async function gateRoute(request: Request, env: Env, ipHash: string) {
  const path = new URL(request.url).pathname;
  if (path === "/api/gate" && request.method === "POST") {
    await gateVersion(env);
    if (!await rate(env, `gate:${ipHash}`, 5, 900) || !await rate(env, "gate:all", 50, 3600)) {
      throw new ApiError(429, "gate_rate", "För många lösenordsförsök. Vänta innan du försöker igen.");
    }
    const { password } = z.object({ password: z.string().max(128) }).strict().parse(await readJson(request, 1024));
    if (!await equalSecrets(password, env.SHARED_ACCESS_PASSWORD!)) throw new ApiError(401, "gate_password", "Lösenordet kunde inte godkännas.");
    const version = await gateVersion(env), now = Date.now(), token = randomToken();
    await env.DB.prepare("DELETE FROM guest_sessions WHERE expires_at<=? OR credential_version!=?").bind(now, version).run();
    try {
      await env.DB.prepare("INSERT INTO guest_sessions(id,token_hash,credential_version,expires_at) VALUES(?,?,?,?)")
        .bind(crypto.randomUUID(), await hash(token), version, now + 12 * 3600_000).run();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("guest_capacity")) throw error;
      throw new ApiError(503, "guest_capacity", "Alla gästplatser är upptagna. Försök senare.");
    }
    return new Response(JSON.stringify({ message: "Åtkomsten är öppen i den här webbläsaren. Du kan prova utan e-post." }),
      { headers: { "Content-Type": "application/json", "Set-Cookie": guestCookie(request, token) } });
  }
  const guest = await authenticateGuest(request, env);
  if (path === "/api/gate" && request.method === "GET") {
    const pending = await env.DB.prepare("SELECT id FROM guest_saves WHERE guest_id=? AND consumed=0 AND expires_at>?")
      .bind(guest.id, Date.now()).first();
    const draft = await env.DB.prepare("SELECT id FROM guest_drafts WHERE guest_id=? AND status='ready' AND expires_at>?").bind(guest.id, Date.now()).first();
    return json({ open: true, expiresAt: guest.expires_at, aiReady: aiReady(env), pendingSave: !!pending, hasDraft: !!draft, quota: await aiAvailability(env) });
  }
  if (path === "/api/gate/logout" && request.method === "POST") {
    await env.DB.prepare("DELETE FROM guest_sessions WHERE id=?").bind(guest.id).run();
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", guestCookie(request, "", true));
    headers.append("Set-Cookie", sessionCookie(request, "", true));
    return new Response(JSON.stringify({ message: "Åtkomsten är stängd och gästutkastet raderat. Din sparade sökning finns kvar." }), { headers });
  }
  throw new ApiError(404, "not_found", "Sidan finns inte.");
}
async function reserve(env: Env, guest: Guest, id: string, previousId: string | null, content: Interpretation, turns: number, working: boolean) {
  const nonce = randomToken(), expires = Math.min(guest.expires_at, Date.now() + 30 * 60_000);
  const result = await env.DB.batch<Row>([
    env.DB.prepare(`UPDATE guest_sessions SET draft_version=draft_version+1,draft_id=?,draft_nonce=?
      WHERE id=? AND expires_at>? AND credential_version=? AND (? IS NULL OR draft_id=?)
      AND NOT EXISTS(SELECT 1 FROM guest_drafts WHERE id=?)`)
      .bind(id, nonce, guest.id, Date.now(), guest.credential_version, previousId, previousId, id),
    env.DB.prepare(`INSERT INTO guest_drafts(guest_id,id,revision,profile,question,conflicts,turns,status,expires_at)
      SELECT id,?,draft_version,?,?,?,?,?,? FROM guest_sessions WHERE id=? AND draft_nonce=?
      ON CONFLICT(guest_id) DO UPDATE SET id=excluded.id,revision=excluded.revision,profile=excluded.profile,
      question=excluded.question,conflicts=excluded.conflicts,turns=excluded.turns,status=excluded.status,expires_at=excluded.expires_at RETURNING *`)
      .bind(id, JSON.stringify(content.profile), JSON.stringify(content.question), JSON.stringify(content.conflicts), turns,
        working ? "working" : "ready", expires, guest.id, nonce),
    env.DB.prepare("DELETE FROM guest_saves WHERE guest_id=? AND EXISTS(SELECT 1 FROM guest_sessions WHERE id=? AND draft_nonce=?)").bind(guest.id, guest.id, nonce),
  ]);
  if (result[0].meta.changes !== 1 || !result[1].results.length) throw stale();
  return toDraft(result[1].results[0]);
}
function review(draft: Draft, enabled: boolean, accepted: boolean, env: Env) {
  if (draft.question?.required || draft.conflicts.length) throw new ApiError(409, "clarify", "Granska och lös först frågan eller motsägelsen.");
  if (draft.profile.unverified.some(c => c.must) && !accepted) throw new ApiError(400, "unverified", "Godkänn manuell kontroll av kraven, eller ändra dem.");
  if (enabled && (!serviceReady(env) || !authorizations(env).length)) throw new ApiError(503, "no_sources", "Inga redo källor. Spara sökningen pausad.");
}
export async function guestPreferenceRoute(request: Request, env: Env, ipHash: string, guest: Guest) {
  const path = new URL(request.url).pathname.split("/").at(-1), now = Date.now();
  if (path === "draft" && request.method === "GET") {
    const intent = await env.DB.prepare("SELECT * FROM guest_saves WHERE guest_id=? AND consumed=0 AND expires_at>?").bind(guest.id, now).first<Save>();
    return json({ draft: await getDraft(env, guest), aiReady: aiReady(env), quota: await aiAvailability(env),
      saveIntent: intent ? { id: intent.id, verified: !!intent.verified, enabled: !!intent.enabled, acceptUnverified: !!intent.accept_unverified } : null });
  }
  if (request.method !== "POST") throw new ApiError(404, "not_found", "Sidan finns inte.");
  const input = await readJson(request, 16000);
  if (path === "cancel") {
    const { id } = z.object({ id: idSchema }).strict().parse(input);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM guest_drafts WHERE guest_id=? AND id=?").bind(guest.id, id),
      env.DB.prepare("DELETE FROM guest_saves WHERE guest_id=? AND draft_id=?").bind(guest.id, id),
    ]);
    return json({ message: "Gästutkastet är borttaget. Sparade sökningar är oförändrade." });
  }
  if (path === "draft" || path === "interpret") {
    const base = { id: idSchema, previousId: idSchema.nullable(), expectedVersion: z.literal(0) };
    const data = path === "draft"
      ? z.object({ ...base, profile: profileSchema, resolveQuestions: z.boolean() }).strict().parse(input)
      : z.object({ ...base, text: z.string().trim().min(3).max(1600), aiConsent: z.literal(true) }).strict().parse(input);
    const previous = data.previousId ? await getDraft(env, guest) : null;
    if (data.previousId && previous?.id !== data.previousId) throw stale();
    if ("profile" in data) {
      return json({ draft: await reserve(env, guest, data.id, data.previousId, { profile: data.profile,
        question: data.resolveQuestions ? null : previous?.question ?? null, conflicts: data.resolveQuestions ? [] : previous?.conflicts ?? [] }, previous?.turns ?? 0, false) });
    }
    if (previous && previous.turns >= 3) throw new ApiError(429, "turns", "Högst tre tolkningar per utkast. Fortsätt med manuella ändringar.");
    if (!aiReady(env)) throw new ApiError(503, "ai_disabled", "Texthjälpen är inte aktiverad. Använd vanliga filter.");
    const draft = await reserve(env, guest, data.id, data.previousId, previous ?? { profile: manualProfile(), question: null, conflicts: [] }, (previous?.turns ?? 0) + 1, true);
    try {
      const result = await interpret(env, guest.member_id ?? `guest:${guest.id}`, ipHash, data.text, previous ? { profile: previous.profile, question: previous.question, conflicts: previous.conflicts } : null);
      await authenticateGuest(request, env);
      const saved = await env.DB.prepare(`UPDATE guest_drafts SET profile=?,question=?,conflicts=?,status='ready'
        WHERE guest_id=? AND id=? AND revision=? AND expires_at>?`)
        .bind(JSON.stringify(result.profile), JSON.stringify(result.question), JSON.stringify(result.conflicts), guest.id, draft.id, draft.revision, Date.now()).run();
      if (saved.meta.changes !== 1) throw stale();
      return json({ draft: { ...draft, ...result }, quota: await aiAvailability(env) });
    } catch (error) {
      await env.DB.prepare("DELETE FROM guest_drafts WHERE guest_id=? AND id=? AND revision=?").bind(guest.id, draft.id, draft.revision).run();
      throw error;
    }
  }
  if (path === "save") {
    const data = reviewSchema.extend({ email: z.string().trim().toLowerCase().email().max(254), website: z.string().max(0) }).parse(input);
    const draft = await getDraft(env, guest);
    if (!draft || draft.id !== data.id || draft.revision !== data.revision) throw stale();
    review(draft, data.enabled, data.acceptUnverified, env);
    const day = new Date(now).toISOString().slice(0, 10);
    const quota = await env.DB.prepare("SELECT period,total,verification FROM quotas WHERE period IN (?,?)").bind(day, day.slice(0, 7)).all<{ period: string; total: number; verification: number }>();
    if (quota.results.some(q => q.period === day ? q.total >= 80 || q.verification >= 20 : q.total >= 2400)) {
      throw new ApiError(503, "mail_quota", "Mejlkvoten är förbrukad. Ingen ny länk har köats.");
    }
    if (!await rate(env, `login:${ipHash}`, 3, 3600) || !await rate(env, "login:all", 50, 86400)) {
      throw new ApiError(429, "rate", "För många mejlförsök. Vänta en timme.");
    }
    const response = () => json({ message: "Om adressen kan användas köas en verifieringslänk. Öppna den i samma webbläsare inom 30 minuter. Granska sedan och bekräfta sparandet. Inget har sparats ännu." }, 202);
    const emailHash = await keyed(env.TOKEN_SECRET, `email:${data.email}`);
    if (!await rate(env, `email:${emailHash}`, 1, 3600)) return response();
    const member = await env.DB.prepare("SELECT id,state,search_version FROM subscriptions WHERE email_hash=?").bind(emailHash).first<Pick<Member, "id" | "state" | "search_version">>();
    if (member && ["revoked", "rejected"].includes(member.state)) return response();
    const memberId = member?.id ?? crypto.randomUUID(), token = randomToken(), challenge = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    if (!member) statements.push(env.DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,owner_slot,token_hash,token_expires,created_at,expires_at,consent_version)
      VALUES(?,?,?,?,'unverified','',?,?,0,?,?,'2026-09-shared-save')`)
      .bind(memberId, data.email, emailHash, JSON.stringify(defaultFilters), Number(data.email === env.OWNER_EMAIL.trim().toLowerCase()), await hash(randomToken()), now, now + 48 * 3600_000));
    statements.push(
      env.DB.prepare(`INSERT INTO guest_saves(id,guest_id,member_id,token_hash,draft_id,revision,saved_version,enabled,accept_unverified,expires_at)
        SELECT ?,?,?,?,id,revision,?,?,?,? FROM guest_drafts WHERE guest_id=? AND id=? AND revision=? AND expires_at>? AND status='ready'
        ON CONFLICT(guest_id) DO UPDATE SET id=excluded.id,member_id=excluded.member_id,token_hash=excluded.token_hash,draft_id=excluded.draft_id,
        revision=excluded.revision,saved_version=excluded.saved_version,enabled=excluded.enabled,accept_unverified=excluded.accept_unverified,
        verified=0,consumed=0,expires_at=excluded.expires_at`)
        .bind(challenge, guest.id, memberId, await hash(token), member?.search_version ?? 0, Number(data.enabled), Number(data.acceptUnverified),
          Math.min(guest.expires_at, now + 30 * 60_000), guest.id, draft.id, draft.revision, now),
      env.DB.prepare("UPDATE guest_drafts SET expires_at=? WHERE guest_id=? AND id=? AND revision=?").bind(Math.min(guest.expires_at, now + 30 * 60_000), guest.id, draft.id, draft.revision),
      await queueVerification(env, memberId, data.email, token, now, "guest-confirm", challenge),
    );
    try { await env.DB.batch(statements); }
    catch (error) {
      if (!(error instanceof Error) || !/capacity|UNIQUE constraint/.test(error.message)) throw error;
      console.warn(JSON.stringify({ event: "guest_save_deferred", code: "capacity_or_duplicate" }));
    }
    return response();
  }
  if (path === "verify") {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
    const challenge = await env.DB.prepare("SELECT * FROM guest_saves WHERE token_hash=? AND guest_id=? AND verified=0 AND consumed=0 AND expires_at>?")
      .bind(await hash(token), guest.id, now).first<Save>();
    const draft = await getDraft(env, guest);
    if (!challenge || !draft || draft.id !== challenge.draft_id || draft.revision !== challenge.revision) throw new ApiError(410, "expired", "Länken är använd, har gått ut eller hör till en annan webbläsare. Återgå till ditt utkast.");
    const session = randomToken(), sessionHash = await hash(session);
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO sessions(token_hash,member_id,expires_at)
        SELECT ?,s.id,? FROM subscriptions s JOIN guest_saves c ON c.member_id=s.id
        WHERE c.id=? AND c.guest_id=? AND c.verified=0 AND c.consumed=0 AND c.expires_at>?
        AND s.state NOT IN ('revoked','rejected') AND s.expires_at>? AND s.search_version=c.saved_version
        AND EXISTS(SELECT 1 FROM guest_drafts d WHERE d.guest_id=c.guest_id AND d.id=c.draft_id AND d.revision=c.revision AND d.expires_at>?)`)
        .bind(sessionHash, now + 12 * 3600_000, challenge.id, guest.id, now, now, now),
      env.DB.prepare(`UPDATE subscriptions SET state='approved',activated_at=COALESCE(activated_at,?),expires_at=?
        WHERE id=? AND state IN ('unverified','pending') AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)`)
        .bind(now, now + 180 * 86400_000, challenge.member_id, sessionHash),
      env.DB.prepare("UPDATE guest_saves SET verified=1 WHERE id=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)").bind(challenge.id, sessionHash),
      env.DB.prepare("UPDATE guest_sessions SET member_id=? WHERE id=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=?)").bind(challenge.member_id, guest.id, sessionHash),
    ]);
    if (result[0].meta.changes !== 1) throw stale();
    return new Response(JSON.stringify({ message: "E-postadressen är verifierad. Sökningen är inte sparad. Gå tillbaka, granska och bekräfta sparandet." }),
      { headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(request, session) } });
  }
  if (path === "confirm") {
    const data = reviewSchema.extend({ challengeId: idSchema }).parse(input);
    const member = await authenticate(request, env), draft = await getDraft(env, guest);
    const challenge = await env.DB.prepare("SELECT * FROM guest_saves WHERE id=? AND guest_id=? AND member_id=? AND verified=1 AND consumed=0 AND expires_at>?")
      .bind(data.challengeId, guest.id, member.id, now).first<Save>();
    if (!draft || !challenge || draft.id !== data.id || draft.revision !== data.revision ||
      challenge.draft_id !== data.id || challenge.revision !== data.revision ||
      challenge.saved_version !== member.search_version || !!challenge.enabled !== data.enabled ||
      !!challenge.accept_unverified !== data.acceptUnverified) throw stale();
    review(draft, data.enabled, data.acceptUnverified, env);
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE subscriptions SET filters=?,preference_profile=?,alerts_enabled=?,consent_version=?,search_version=search_version+1,search_commit=?,draft_id=NULL
        WHERE id=? AND state='approved' AND expires_at>? AND search_version=?
        AND EXISTS(SELECT 1 FROM guest_saves c JOIN guest_drafts d ON d.guest_id=c.guest_id JOIN guest_sessions g ON g.id=c.guest_id
          WHERE c.id=? AND c.member_id=subscriptions.id AND c.guest_id=? AND c.verified=1 AND c.consumed=0 AND c.expires_at>?
          AND d.id=c.draft_id AND d.revision=c.revision AND d.status='ready' AND d.expires_at>? AND g.expires_at>? AND g.credential_version=?)`)
        .bind(JSON.stringify(draft.profile.filters), JSON.stringify(draft.profile), Number(data.enabled),
          data.acceptUnverified ? "2026-09-shared-save-manual-check" : "2026-09-shared-save", challenge.id, member.id, now,
          challenge.saved_version, challenge.id, guest.id, now, now, now, guest.credential_version),
      env.DB.prepare(`UPDATE outbox SET state='expired',payload='',error_code=CASE WHEN first_attempt IS NULL THEN 'search_changed' ELSE 'delivery_uncertain' END
        WHERE subscription_id=? AND kind='digest' AND state IN ('pending','sending') AND search_version!=?
        AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)`)
        .bind(member.id, member.search_version + 1, member.id, challenge.id),
      env.DB.prepare("UPDATE guest_saves SET consumed=1 WHERE id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)").bind(challenge.id, member.id, challenge.id),
      env.DB.prepare("DELETE FROM guest_drafts WHERE guest_id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)").bind(guest.id, member.id, challenge.id),
      env.DB.prepare("DELETE FROM search_drafts WHERE member_id=? AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)").bind(member.id, member.id, challenge.id),
    ]);
    if (result[0].meta.changes !== 1) throw stale();
    return json({ message: data.enabled ? "Sökningen är sparad och bevakningen startad för nya objekt." : "Sökningen är sparad pausad. Inga bostadsmejl aktiverades.",
      profile: draft.profile, searchVersion: member.search_version + 1, alertsEnabled: data.enabled });
  }
  throw new ApiError(404, "not_found", "Sidan finns inte.");
}
