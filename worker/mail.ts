import { stockholmClock, type Listing } from "../shared/model";
import { assess, hardDescription, ranked } from "../shared/preferences";
import { savedProfile } from "./preferences";
import { actionUrl, authorizations, escapeHtml, seal, sharedAccess, unseal, unsubscribeToken, type Env } from "./support";

interface Subscription {
  id: string; email: string; filters: string; created_at: number; activated_at: number;
  preference_profile: string | null; search_version: number;
}
interface Outbox {
  id: string; subscription_id: string; kind: string; payload: string; listing_ids: string;
  created_at: number; first_attempt: number | null; attempts: number;
  search_version: number;
}
export interface Mail { from: string; to: string; subject: string; text: string; html: string }
export async function queueVerification(env: Env, id: string, email: string, token: string, now: number, action = "confirm", challenge: string | null = null) {
  const confirm = actionUrl(env, action, token);
  const remove = actionUrl(env, "unsubscribe", await unsubscribeToken(env, id));
  const instructions = action === "guest-confirm"
    ? "Öppna länken i samma webbläsare där du gjorde utkastet, med lösenordsåtkomsten kvar. Tryck på Fortsätt. Gå sedan tillbaka och granska och bekräfta sparandet. Verifieringen sparar ingen sökning och startar inga bostadsmejl."
    : sharedAccess(env) ? "Öppna länken i samma webbläsare med lösenordsåtkomsten kvar och tryck på Fortsätt. Inga sökningar eller bevakningar ändras av inloggningen."
    : "Öppna länken och tryck på Fortsätt. Nya medlemmar måste dessutom godkännas av ägaren. E-postverifiering ger inte tillgång till bostäder eller bevakning.";
  const mail: Mail = {
    from: env.MAIL_FROM, to: email, subject: "Din inloggningslänk till Kommandekollen",
    text: `Bekräfta din e-post och logga in inom 30 minuter: ${confirm}\n${instructions}\nBegärde du inte detta? Ignorera mejlet eller radera kontot: ${remove}`,
    html: `<h1>Fortsätt till Kommandekollen</h1><p>Bekräfta din e-post och logga in inom 30 minuter.</p><p><a href="${escapeHtml(confirm)}">Öppna säker inloggning</a></p><p>${escapeHtml(instructions)}</p><p>Begärde du inte detta? Ignorera mejlet eller <a href="${escapeHtml(remove)}">radera kontot</a>.</p>`,
  };
  return env.DB.prepare(`INSERT INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt)
    SELECT ?,?,'verification',?,?,'[]',?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM guest_saves WHERE id=?)`)
    .bind(crypto.randomUUID(), id, crypto.randomUUID(), await seal(env.TOKEN_SECRET, mail), now, now, challenge, challenge);
}
export async function approvalNotice(env: Env, member: { id: string; email: string }, now: number, auditId: string) {
  const remove = actionUrl(env, "unsubscribe", await unsubscribeToken(env, member.id));
  const mail: Mail = {
    from: env.MAIL_FROM, to: member.email, subject: "Ditt medlemskap är godkänt",
    text: `Du har blivit godkänd för Kommandekollen. Logga in för att söka och aktivera en bevakning: ${env.PUBLIC_URL}\nInga bostadsmejl skickas innan du aktiverar bevakningen.\nRadera medlemskapet: ${remove}`,
    html: `<h1>Ditt medlemskap är godkänt</h1><p><a href="${escapeHtml(env.PUBLIC_URL)}">Logga in</a> för att söka och aktivera bevakning. Inga bostadsmejl skickas innan dess.</p><p><a href="${escapeHtml(remove)}">Radera medlemskapet</a></p>`,
  };
  return env.DB.prepare(`INSERT INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt)
    SELECT ?,?,'notice',?,?,'[]',?,? WHERE EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`)
    .bind(crypto.randomUUID(), member.id, crypto.randomUUID(), await seal(env.TOKEN_SECRET, mail), now, now, auditId);
}
export async function prepareDigest(env: Env, now = Date.now()) {
  const { day, hour } = stockholmClock(new Date(now));
  if (hour < 7 || hour >= 10) return;
  const subscriber = await env.DB.prepare(`SELECT id,email,filters,preference_profile,search_version,created_at,activated_at FROM subscriptions
    WHERE state='approved' AND alerts_enabled=1 AND expires_at>? AND (last_digest_day IS NULL OR last_digest_day<?)
    AND NOT EXISTS(SELECT 1 FROM outbox WHERE subscription_id=subscriptions.id
      AND (state IN ('pending','sending') OR error_code='delivery_uncertain'))
    ORDER BY last_digest_day,created_at LIMIT 1`).bind(now, day).first<Subscription>();
  if (!subscriber) return;
  const rows = await env.DB.prepare(`SELECT l.id,l.data,l.first_seen,l.last_seen FROM listings l
    WHERE l.active=1 AND l.last_seen>=?
    AND NOT EXISTS(SELECT 1 FROM seen s WHERE s.subscription_id=? AND s.listing_id=l.id)
    ORDER BY l.first_seen,l.id LIMIT 200`)
    .bind(new Date(now - 48 * 3600_000).toISOString(), subscriber.id)
    .all<{ id: string; data: string; first_seen: string; last_seen: string }>();
  const profile = savedProfile(subscriber);
  const allowed = new Set<string>(authorizations(env).map(source => source.id));
  const listings = ranked<Listing>(rows.results.map(row => ({
    ...JSON.parse(row.data), id: row.id, firstSeen: row.first_seen, lastSeen: row.last_seen,
  })).filter(l => allowed.has(l.sourceId)), profile).slice(0, 20);
  const markDay = env.DB.prepare("UPDATE subscriptions SET last_digest_day=? WHERE id=? AND search_version=?").bind(day, subscriber.id, subscriber.search_version);
  if (!listings.length) { await markDay.run(); return; }
  const remove = actionUrl(env, "unsubscribe", await unsubscribeToken(env, subscriber.id));
  const facts = (l: Listing) => `${l.type} · ${l.rooms ?? "?"} rum · ${l.size ?? "?"} m² · ${l.price === null ? "Pris saknas" : `${l.price.toLocaleString("sv-SE")} kr`}`;
  const checks = profile.unverified.map(c => `${c.must ? "Krav att kontrollera själv" : "Önskemål att kontrollera själv"}: ${c.text}`).join("\n");
  const why = (l: Listing) => [assess(l, profile).needsCheck ? "Matchar kända filter; manuell kontroll krävs." : "Matchar dina faktabaserade krav.",
    ...assess(l, profile).reasons].join("\n");
  const mail: Mail = {
    from: env.MAIL_FROM, to: subscriber.email, subject: `${listings.length} nya bostadsförslag – Kommandekollen`,
    text: `Nya bostadsförslag för din godkända sökning, ${day}.\nKrav: ${hardDescription(profile).join("; ")}\n${checks}\n\n${listings.map(l => `${l.address}, ${l.area}, ${l.municipality}\n${facts(l)}\n${why(l)}\n${l.url}`).join("\n\n")}\n\nHögst 20 objekt per mejl. Bara nya objekt, inte varje ändring. Uppgifter kan ändras; kontrollera hos källan.\nAvsluta och radera din bevakning: ${remove}`,
    html: `<h1>Dina nya bostadsförslag</h1><p>${day}. Uppgifter kan ändras; kontrollera hos källan.</p><p>Krav: ${escapeHtml(hardDescription(profile).join("; "))}</p><p>${escapeHtml(checks).replaceAll("\n", "<br>")}</p>${listings.map(l => `<h2>${escapeHtml(l.address)}</h2><p>${escapeHtml(`${l.area}, ${l.municipality}`)}<br>${escapeHtml(facts(l))}</p><p>${escapeHtml(why(l)).replaceAll("\n", "<br>")}</p><p><a href="${escapeHtml(l.url)}">Visa hos källan</a></p>`).join("")}<p>Högst 20 objekt per mejl. Bara nya objekt, inte varje ändring.</p><p><a href="${escapeHtml(remove)}">Avsluta och radera din bevakning</a></p>`,
  };
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt,search_version)
      SELECT ?,?,'digest',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND state='approved' AND alerts_enabled=1 AND search_version=?)`).bind(
      crypto.randomUUID(), subscriber.id, day, await seal(env.TOKEN_SECRET, mail),
      JSON.stringify(listings.map(l => l.id)), now, now, subscriber.search_version, subscriber.id, subscriber.search_version),
    markDay,
  ]);
}
export async function dispatchOne(env: Env, now = Date.now()) {
  const outbox = await env.DB.prepare(`UPDATE outbox SET state='sending',lease_until=?
    WHERE id=(SELECT id FROM outbox WHERE
      ((state='pending' AND next_attempt<=?) OR (state='sending' AND lease_until<?))
      ORDER BY created_at LIMIT 1) RETURNING *`).bind(now + 300_000, now, now).first<Outbox>();
  if (!outbox) return;
  const eligible = () => env.DB.prepare(`SELECT id FROM subscriptions WHERE id=? AND expires_at>?
    AND ((?='verification' AND state IN ('unverified','pending','approved'))
      OR (?='notice' AND state='approved')
      OR (?='digest' AND state='approved' AND alerts_enabled=1 AND search_version=?
        AND EXISTS(SELECT 1 FROM outbox WHERE id=? AND state='sending')))`)
    .bind(outbox.subscription_id, now, outbox.kind, outbox.kind, outbox.kind, outbox.search_version, outbox.id).first();
  if (!await eligible()) {
    await env.DB.prepare(`UPDATE outbox SET state='expired',payload='',error_code=CASE WHEN first_attempt IS NULL THEN 'ineligible' ELSE 'delivery_uncertain' END WHERE id=?`).bind(outbox.id).run();
    return;
  }
  if (outbox.kind === "verification" && now - outbox.created_at > 25 * 60_000) {
    await env.DB.prepare("UPDATE outbox SET state='expired',payload='',error_code='login_expired' WHERE id=?").bind(outbox.id).run();
    return;
  }
  // Retrying outside Resend's 24-hour deduplication window could duplicate delivery.
  if (outbox.attempts >= 5 || now - (outbox.first_attempt ?? outbox.created_at) >= 23 * 3600_000) {
    await env.DB.prepare("UPDATE outbox SET state='expired',payload='',error_code=? WHERE id=?")
      .bind(outbox.first_attempt === null ? "retry_window" : "delivery_uncertain", outbox.id).run();
    return;
  }
  if (outbox.kind === "digest") {
    const ids = JSON.parse(outbox.listing_ids) as string[];
    const allowed = new Set<string>(authorizations(env).map(source => source.id));
    const rows = await env.DB.prepare("SELECT id,source_id FROM listings WHERE active=1 AND last_seen>=?")
      .bind(new Date(now - 48 * 3600_000).toISOString()).all<{ id: string; source_id: string }>();
    const current = new Set(rows.results.filter(row => allowed.has(row.source_id)).map(row => row.id));
    if (ids.some(id => !current.has(id))) {
      await env.DB.prepare("UPDATE outbox SET state='expired',payload='',error_code=? WHERE id=?")
        .bind(outbox.first_attempt === null ? "source_unavailable" : "delivery_uncertain", outbox.id).run();
      return;
    }
  }
  try {
    const day = new Date(now).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO send_attempts(id,outbox_id,day,month,kind,created_at) VALUES(?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), outbox.id, day, day.slice(0, 7), outbox.kind, now),
      env.DB.prepare("UPDATE outbox SET attempts=attempts+1,first_attempt=COALESCE(first_attempt,?) WHERE id=?").bind(now, outbox.id),
    ]);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("mail_quota")) throw error;
    await env.DB.prepare("UPDATE outbox SET state='pending',next_attempt=?,error_code='mail_quota' WHERE id=?")
      .bind(now + 3600_000, outbox.id).run();
    console.warn(JSON.stringify({ event: "mail_deferred", code: "mail_quota" }));
    return;
  }
  let response: Response;
  try {
    const payload = await unseal<Mail>(env.TOKEN_SECRET, outbox.payload);
    if (!await eligible()) return;
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": outbox.id },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000),
    });
  } catch {
    await retry(env, outbox, now, "provider_network");
    return;
  }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      await retry(env, outbox, now, `provider_${response.status}`);
    } else {
      await env.DB.prepare("UPDATE outbox SET state='failed',payload='',error_code=? WHERE id=?")
        .bind(`provider_${response.status}`, outbox.id).run();
      console.error(JSON.stringify({ event: "mail_failed", code: `provider_${response.status}` }));
    }
    return;
  }
  let result: { id?: string };
  try { result = await response.json(); }
  catch { await retry(env, outbox, now, "provider_response"); return; }
  if (typeof result.id !== "string") { await retry(env, outbox, now, "provider_response"); return; }
  const statements = (JSON.parse(outbox.listing_ids) as string[]).map(id =>
    env.DB.prepare(`INSERT OR IGNORE INTO seen(subscription_id,listing_id,sent_at)
      SELECT id,?,? FROM subscriptions WHERE id=?`).bind(id, now, outbox.subscription_id));
  statements.push(env.DB.prepare("UPDATE outbox SET state='sent',payload='',provider_id=?,error_code=NULL WHERE id=?")
    .bind(result.id, outbox.id));
  await env.DB.batch(statements);
}
async function retry(env: Env, outbox: Outbox, now: number, code: string) {
  await env.DB.prepare("UPDATE outbox SET state='pending',next_attempt=?,error_code=? WHERE id=?")
    .bind(now + Math.min(3600_000, 60_000 * 2 ** outbox.attempts), code, outbox.id).run();
  console.warn(JSON.stringify({ event: "mail_retry", code }));
}
export async function cleanup(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM subscriptions WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM search_drafts WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM guest_sessions WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM guest_saves WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM guest_drafts WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM gate_logins WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM ai_attempts WHERE state='done' AND created_at<?").bind(now - 2 * 86400_000),
    env.DB.prepare("DELETE FROM admin_audit WHERE created_at<?").bind(now - 180 * 86400_000),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM send_attempts WHERE created_at<?").bind(now - 35 * 86400_000),
    env.DB.prepare("DELETE FROM quotas WHERE period<?").bind(new Date(now - 65 * 86400_000).toISOString().slice(0, 7)),
    env.DB.prepare("DELETE FROM outbox WHERE state IN ('sent','failed','expired') AND COALESCE(error_code,'')!='delivery_uncertain' AND created_at<?").bind(now - 7 * 86400_000),
    env.DB.prepare("DELETE FROM listings WHERE last_seen<?").bind(new Date(now - 30 * 86400_000).toISOString()),
  ]);
}
