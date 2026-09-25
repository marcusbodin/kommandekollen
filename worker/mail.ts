import { filterSchema, matches, stockholmClock, type Listing } from "../shared/model";
import { actionUrl, authorizations, escapeHtml, seal, unseal, unsubscribeToken, type Env } from "./support";

interface Subscription {
  id: string; email: string; filters: string; created_at: number; activated_at: number;
}
interface Outbox {
  id: string; subscription_id: string; kind: string; payload: string; listing_ids: string;
  created_at: number; first_attempt: number | null; attempts: number;
}
export interface Mail { from: string; to: string; subject: string; text: string; html: string }
export async function queueVerification(env: Env, id: string, email: string, token: string, now: number) {
  const confirm = actionUrl(env, "confirm", token);
  const remove = actionUrl(env, "unsubscribe", await unsubscribeToken(env, id));
  const mail: Mail = {
    from: env.MAIL_FROM, to: email, subject: "Din inloggningslänk till Kommandekollen",
    text: `Bekräfta din e-post och logga in inom 30 minuter: ${confirm}\nÖppna länken och tryck på Fortsätt. Nya medlemmar måste dessutom godkännas av ägaren. E-postverifiering ger inte tillgång till bostäder eller bevakning.\nBegärde du inte detta? Ignorera mejlet eller radera ansökan och medlemskapet: ${remove}`,
    html: `<h1>Fortsätt till Kommandekollen</h1><p>Bekräfta din e-post och logga in inom 30 minuter.</p><p><a href="${escapeHtml(confirm)}">Öppna säker inloggning</a></p><p>Nya medlemmar måste också godkännas av ägaren. Verifiering ger inte tillgång till bostäder eller bevakning.</p><p>Begärde du inte detta? Ignorera mejlet eller <a href="${escapeHtml(remove)}">radera ansökan och medlemskapet</a>.</p>`,
  };
  return env.DB.prepare(`INSERT INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt)
    VALUES(?,?,'verification',?,?,'[]',?,?)`)
    .bind(crypto.randomUUID(), id, crypto.randomUUID(), await seal(env.TOKEN_SECRET, mail), now, now);
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
  const subscriber = await env.DB.prepare(`SELECT id,email,filters,created_at,activated_at FROM subscriptions
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
  const filters = filterSchema.parse(JSON.parse(subscriber.filters));
  const allowed = new Set<string>(authorizations(env).map(source => source.id));
  const listings: Listing[] = rows.results.map(row => ({
    ...JSON.parse(row.data), id: row.id, firstSeen: row.first_seen, lastSeen: row.last_seen,
  })).filter(l => allowed.has(l.sourceId) && matches(l, filters)).slice(0, 20);
  const markDay = env.DB.prepare("UPDATE subscriptions SET last_digest_day=? WHERE id=?").bind(day, subscriber.id);
  if (!listings.length) { await markDay.run(); return; }
  const remove = actionUrl(env, "unsubscribe", await unsubscribeToken(env, subscriber.id));
  const facts = (l: Listing) => `${l.type} · ${l.rooms ?? "?"} rum · ${l.size ?? "?"} m² · ${l.price === null ? "Pris saknas" : `${l.price.toLocaleString("sv-SE")} kr`}`;
  const mail: Mail = {
    from: env.MAIL_FROM, to: subscriber.email, subject: `${listings.length} nya matchningar – Kommandekollen`,
    text: `Nya matchningar för din bevakning, ${day}.\n\n${listings.map(l => `${l.address}, ${l.area}, ${l.municipality}\n${facts(l)}\n${l.url}`).join("\n\n")}\n\nHögst 20 objekt per mejl. Fler nya matchningar kommer vid nästa utskick. Uppgifter kan ändras; kontrollera hos källan.\nAvsluta och radera din bevakning: ${remove}`,
    html: `<h1>Dina nya matchningar</h1><p>${day}. Uppgifter kan ändras; kontrollera hos källan.</p>${listings.map(l => `<h2>${escapeHtml(l.address)}</h2><p>${escapeHtml(`${l.area}, ${l.municipality}`)}<br>${escapeHtml(facts(l))}</p><p><a href="${escapeHtml(l.url)}">Visa hos källan</a></p>`).join("")}<p>Högst 20 objekt per mejl. Fler nya matchningar kommer vid nästa utskick.</p><p><a href="${escapeHtml(remove)}">Avsluta och radera din bevakning</a></p>`,
  };
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,subscription_id,kind,day,payload,listing_ids,created_at,next_attempt)
      VALUES(?,?,'digest',?,?,?,?,?)`).bind(
      crypto.randomUUID(), subscriber.id, day, await seal(env.TOKEN_SECRET, mail),
      JSON.stringify(listings.map(l => l.id)), now, now),
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
      OR (?='digest' AND state='approved' AND alerts_enabled=1))`)
    .bind(outbox.subscription_id, now, outbox.kind, outbox.kind, outbox.kind).first();
  if (!await eligible()) {
    await env.DB.prepare("DELETE FROM outbox WHERE id=?").bind(outbox.id).run();
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
    env.DB.prepare("DELETE FROM admin_audit WHERE created_at<?").bind(now - 180 * 86400_000),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM send_attempts WHERE created_at<?").bind(now - 35 * 86400_000),
    env.DB.prepare("DELETE FROM quotas WHERE period<?").bind(new Date(now - 65 * 86400_000).toISOString().slice(0, 7)),
    env.DB.prepare("DELETE FROM outbox WHERE state IN ('sent','failed','expired') AND COALESCE(error_code,'')!='delivery_uncertain' AND created_at<?").bind(now - 7 * 86400_000),
    env.DB.prepare("DELETE FROM listings WHERE last_seen<?").bind(new Date(now - 30 * 86400_000).toISOString()),
  ]);
}
