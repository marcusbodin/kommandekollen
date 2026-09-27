import { z } from "zod";
import { filterSchema } from "../shared/model";
import { draftSchema, manualProfile, profileSchema, type Draft, type Interpretation, type Profile } from "../shared/preferences";
import { aiReady, interpret } from "./ai";
import { ApiError, authenticate, propertyEmailsReady, json, readJson, serviceReady, type Env, type Member } from "./support";

const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const stale = () => new ApiError(409, "stale_draft", "Sökningen eller utkastet har ändrats. Läs in din sparade sökning igen; inget skrevs över.");
type Row = { id: string; revision: number; base_version: number; profile: string; question: string; conflicts: string; turns: number; expires_at: number; status: string };
function toDraft(row: Row): Draft {
  return draftSchema.parse({ id: row.id, revision: row.revision, baseVersion: row.base_version,
    profile: JSON.parse(row.profile), question: JSON.parse(row.question), conflicts: JSON.parse(row.conflicts), turns: row.turns, expiresAt: row.expires_at });
}
export function savedProfile(member: Pick<Member, "filters" | "preference_profile">): Profile {
  return member.preference_profile ? profileSchema.parse(JSON.parse(member.preference_profile)) : manualProfile(filterSchema.parse(JSON.parse(member.filters)));
}
async function getDraft(env: Env, member: Member, id?: string): Promise<Draft | null> {
  const row = await env.DB.prepare("SELECT * FROM search_drafts WHERE member_id=? AND expires_at>? AND status='ready'")
    .bind(member.id, Date.now()).first<Row>();
  if (!row || (id && row.id !== id) || row.base_version !== member.search_version) return null;
  return toDraft(row);
}
async function reserveDraft(env: Env, member: Member, id: string, baseVersion: number, content: Interpretation, turns: number, working: boolean, previousId: string | null): Promise<Draft> {
  if (baseVersion !== member.search_version) throw stale();
  const expiresAt = Date.now() + 30 * 60_000;
  const nonce = crypto.randomUUID();
  const results = await env.DB.batch<Row>([
    env.DB.prepare(`UPDATE subscriptions SET draft_version=draft_version+1,draft_id=?,draft_nonce=?
      WHERE id=? AND state='approved' AND search_version=? AND (? IS NULL OR draft_id=?)
      AND COALESCE(search_commit,'')!=? AND NOT EXISTS(SELECT 1 FROM search_drafts WHERE id=?)`)
      .bind(id, nonce, member.id, baseVersion, previousId, previousId, id, id),
    env.DB.prepare(`INSERT INTO search_drafts(member_id,id,revision,base_version,profile,question,conflicts,turns,status,expires_at)
      SELECT id,?,draft_version,search_version,?,?,?,?,?,? FROM subscriptions WHERE id=? AND draft_id=? AND state='approved' AND search_version=? AND draft_nonce=?
      ON CONFLICT(member_id) DO UPDATE SET id=excluded.id,revision=excluded.revision,base_version=excluded.base_version,
      profile=excluded.profile,question=excluded.question,conflicts=excluded.conflicts,turns=excluded.turns,status=excluded.status,expires_at=excluded.expires_at
      RETURNING *`)
      .bind(id, JSON.stringify(content.profile), JSON.stringify(content.question), JSON.stringify(content.conflicts), turns,
        working ? "working" : "ready", expiresAt, member.id, id, baseVersion, nonce),
  ]);
  if (results[0].meta.changes !== 1 || !results[1].results.length) throw stale();
  return toDraft(results[1].results[0]);
}
async function confirm(env: Env, member: Member, draft: Draft, enabled: boolean, acceptUnverified: boolean) {
  if (draft.question?.required || draft.conflicts.length) throw new ApiError(409, "clarify", "Lös först den nödvändiga frågan eller motsägelsen.");
  if (draft.profile.unverified.some(c => c.must) && !acceptUnverified) {
    throw new ApiError(400, "unverified", "Godkänn uttryckligen manuell kontroll av krav som uppgifterna inte kan avgöra, eller ändra kraven.");
  }
  if (enabled && !propertyEmailsReady(env)) {
    throw new ApiError(503, "alerts_paused", "Bostadsmejlen är pausade. Spara sökningen pausad.");
  }
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE subscriptions SET filters=?,preference_profile=?,alerts_enabled=?,consent_version=?,search_version=search_version+1,search_commit=?,draft_id=NULL
      WHERE id=? AND state='approved' AND expires_at>? AND search_version=? AND draft_id=?
      AND EXISTS(SELECT 1 FROM search_drafts WHERE member_id=? AND id=? AND revision=? AND base_version=? AND status='ready' AND expires_at>?)`)
      .bind(JSON.stringify(draft.profile.filters), JSON.stringify(draft.profile), Number(enabled),
        acceptUnverified ? "2026-09-personal-search-manual-check" : "2026-09-personal-search", draft.id, member.id, Date.now(),
        draft.baseVersion, draft.id, member.id, draft.id, draft.revision, draft.baseVersion, Date.now()),
    env.DB.prepare(`UPDATE outbox SET state='expired',payload='',error_code=CASE WHEN first_attempt IS NULL THEN 'search_changed' ELSE 'delivery_uncertain' END
      WHERE subscription_id=? AND kind='digest' AND state IN ('pending','sending') AND search_version!=?
      AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=? AND search_version=?)`)
      .bind(member.id, draft.baseVersion + 1, member.id, draft.id, draft.baseVersion + 1),
    env.DB.prepare(`DELETE FROM search_drafts WHERE member_id=? AND id=?
      AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND search_commit=?)`).bind(member.id, draft.id, member.id, draft.id),
  ]);
  if (result[0].meta.changes !== 1) throw stale();
  return json({ message: enabled ? "Sökningen är sparad. Daglig bevakning är startad för nya objekt, inte alla ändringar."
    : "Sökningen är sparad pausad. Inga bostadsmejl aktiverades.", searchVersion: draft.baseVersion + 1, profile: draft.profile, alertsEnabled: enabled });
}
export async function preferenceRoute(request: Request, env: Env, ipHash: string): Promise<Response> {
  const member = await authenticate(request, env);
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/preferences/draft") return json({ draft: await getDraft(env, member), aiReady: aiReady(env) });
  if (request.method !== "POST") throw new ApiError(404, "not_found", "Sidan finns inte.");
  const input = await readJson(request, 16000);
  if (path === "/api/preferences/cancel") {
    const { id } = z.object({ id: z.string().uuid() }).strict().parse(input);
    await env.DB.prepare("DELETE FROM search_drafts WHERE member_id=? AND id=?").bind(member.id, id).run();
    return json({ message: "Utkastet är borttaget. Den sparade sökningen är oförändrad." });
  }
  if (path === "/api/preferences/confirm") {
    const data = z.object({ id: z.string().uuid(), revision: version, expectedVersion: version,
      enabled: z.boolean(), acceptUnverified: z.boolean(), consent: z.literal(true) }).strict().parse(input);
    const draft = await getDraft(env, member, data.id);
    if (!draft || data.revision !== draft.revision || data.expectedVersion !== draft.baseVersion) throw stale();
    return confirm(env, member, draft, data.enabled, data.acceptUnverified);
  }
  if (path === "/api/preferences/draft") {
    const data = z.object({ id: z.string().uuid(), expectedVersion: version, profile: profileSchema,
      previousId: z.string().uuid().nullable(), resolveQuestions: z.boolean() }).strict().parse(input);
    const previous = data.previousId ? await getDraft(env, member, data.previousId) : null;
    if (data.previousId && !previous) throw stale();
    const draft = await reserveDraft(env, member, data.id, data.expectedVersion, {
      profile: data.profile, question: data.resolveQuestions ? null : previous?.question ?? null,
      conflicts: data.resolveQuestions ? [] : previous?.conflicts ?? [],
    }, previous?.turns ?? 0, false, data.previousId);
    return json({ draft });
  }
  if (path === "/api/preferences/interpret") {
    const data = z.object({ id: z.string().uuid(), expectedVersion: version, previousId: z.string().uuid().nullable(),
      text: z.string().trim().min(3).max(1600), aiConsent: z.literal(true) }).strict().parse(input);
    if (!aiReady(env) || !serviceReady(env)) throw new ApiError(503, "ai_disabled", "Texthjälpen är inte aktiverad. Använd vanliga filter.");
    const previous = data.previousId ? await getDraft(env, member, data.previousId) : null;
    if (data.previousId && !previous) throw stale();
    if (previous && previous.turns >= 3) throw new ApiError(429, "turns", "Högst tre tolkningar per utkast. Fortsätt med manuella ändringar.");
    const draft = await reserveDraft(env, member, data.id, data.expectedVersion,
      previous ?? { profile: manualProfile(), question: null, conflicts: [] }, (previous?.turns ?? 0) + 1, true, data.previousId);
    try {
      const result = await interpret(env, member.id, ipHash, data.text, previous ? { profile: previous.profile, question: previous.question, conflicts: previous.conflicts } : null);
      await authenticate(request, env);
      const saved = await env.DB.prepare(`UPDATE search_drafts SET profile=?,question=?,conflicts=?,status='ready'
        WHERE member_id=? AND id=? AND revision=? AND expires_at>?
        AND EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND state='approved' AND search_version=? AND draft_id=?)`)
        .bind(JSON.stringify(result.profile), JSON.stringify(result.question), JSON.stringify(result.conflicts), member.id, draft.id,
          draft.revision, Date.now(), member.id, draft.baseVersion, draft.id).run();
      if (saved.meta.changes !== 1) throw stale();
      return json({ draft: { ...draft, ...result } });
    } catch (error) {
      await env.DB.prepare("DELETE FROM search_drafts WHERE member_id=? AND id=? AND revision=?").bind(member.id, draft.id, draft.revision).run();
      throw error;
    }
  }
  throw new ApiError(404, "not_found", "Sidan finns inte.");
}
