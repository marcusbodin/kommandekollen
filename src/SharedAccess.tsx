import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { closePrivateAccess, privateFetch, PrivateAccessError } from "./access";

export const quotaSchema = z.object({ remaining: z.number().int().min(0).max(6), limit: z.literal(6), day: z.string() });
export const gateSchema = z.object({ open: z.literal(true), expiresAt: z.number().int().positive(), aiReady: z.boolean(), alertsReady: z.boolean(), pendingSave: z.boolean(), hasDraft: z.boolean(), quota: quotaSchema });
export type Gate = z.infer<typeof gateSchema>;
export async function accessRequest(apiBase: string, path: string, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await privateFetch(`${apiBase}${path}`, { method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(25000) }, path === "/api/gate" && !!body);
  } catch (error) {
    if (error instanceof PrivateAccessError) throw error;
    throw new Error("Kunde inte nå tjänsten. Resultatet är inte bekräftat. Kontrollera anslutningen innan du försöker igen.");
  }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error(`Tjänsten gav ett oväntat svar (HTTP ${response.status}). Försök senare.`); }
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(result);
    throw new Error(error.success ? error.data.message : "Begäran kunde inte slutföras.");
  }
  return result;
}
export type SearchAccess = { guest: boolean; searchVersion: number };
type Purpose = "ai" | "manual" | "account" | "browse";
export type Authorize = (purpose: Purpose) => Promise<SearchAccess | null>;
export function useSearchAccess(apiBase: string, gate: Gate | null, opened: (gate: Gate) => void) {
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const pending = useRef<((access: SearchAccess | null) => void) | null>(null);
  const authorize: Authorize = purpose => {
    if (pending.current) return Promise.resolve(null);
    setPurpose(purpose);
    return new Promise(resolve => { pending.current = resolve; });
  };
  function finish(access: SearchAccess | null) {
    const resolve = pending.current; pending.current = null; setPurpose(null); resolve?.(access);
  }
  useEffect(() => () => { pending.current?.(null); pending.current = null; }, []);
  return { authorize, dialog: purpose && <AccessDialog apiBase={apiBase} gate={gate} purpose={purpose} finish={finish} opened={opened} /> };
}
function AccessDialog({ apiBase, gate, purpose, finish, opened }: {
  apiBase: string; gate: Gate | null; purpose: Purpose; finish: (access: SearchAccess | null) => void; opened: (gate: Gate) => void;
}) {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(!gate), [consent, setConsent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), abort = useRef<AbortController | null>(null), submitting = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { abort.current?.abort(); element.close(); };
  }, []);
  useEffect(() => { if (error && !busy) { feedback.current?.focus(); feedback.current?.scrollIntoView({ block: "nearest" }); } }, [error, busy]);
  function cancel() { abort.current?.abort(); finish(null); }
  return <dialog ref={dialog} className="access-dialog" aria-labelledby="access-title" onCancel={event => { event.preventDefault(); cancel(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (submitting.current || (purpose === "ai" && !consent)) return;
      submitting.current = true; setBusy(true); setError("");
      const controller = new AbortController(); abort.current = controller;
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        if (!apiBase) throw new Error("API-adressen saknas. Inget har skickats.");
        if (needsPassword) {
          await accessRequest(apiBase, "/api/gate", { password }, controller.signal);
          closePrivateAccess(); setPassword(""); setNeedsPassword(false);
        }
        let currentGate: Gate;
        try { currentGate = gateSchema.parse(await accessRequest(apiBase, "/api/gate", undefined, controller.signal)); }
        catch (error) { setNeedsPassword(true); throw error; }
        if (controller.signal.aborted) return;
        opened(currentGate);
        if (purpose === "browse") { finish({ guest: true, searchVersion: 0 }); return; }
        if (purpose === "ai" && (!currentGate.aiReady || currentGate.quota.remaining === 0)) {
          setUnavailable(true);
          throw new Error(currentGate.quota.remaining === 0 ? "Dagens gemensamma AI-kvot är slut. Din text finns kvar. Välj vanliga filter i menyn – inga AI-försök behövs."
            : "Texthjälpen är inte tillgänglig. Din text finns kvar; välj vanliga filter i menyn.");
        }
        const response = await privateFetch(`${apiBase}/api/me`, { signal: controller.signal }, true);
        if (response.status !== 401 && !response.ok) throw new Error("Kontot kunde inte kontrolleras. Inget AI-anrop har gjorts.");
        const account = response.status === 401 ? null : z.object({ state: z.string(), searchVersion: z.number().int().nonnegative() }).parse(await response.json());
        if (controller.signal.aborted) return;
        const guest = !account || account.state !== "approved" || currentGate.pendingSave || currentGate.hasDraft;
        finish({ guest, searchVersion: guest ? 0 : account!.searchVersion });
      }
      catch (error) { setError(error instanceof Error ? error.message : "Åtkomsten kunde inte öppnas."); }
      finally { clearTimeout(timer); submitting.current = false; setBusy(false); }
    }}><h2 id="access-title">{purpose === "ai" ? "Skapa ett sökförslag med AI" : purpose === "browse" ? "Öppna bostadslistan" : "Öppna åtkomsten med lösenord"}</h2>
      {needsPassword && <label>Gemensamt lösenord<input autoFocus type="password" autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} required maxLength={128} disabled={busy} /></label>}
      {purpose === "ai" && <>
        <p>Texten och föregående utkast skickas till Cloudflare AI. Skriv inga personliga eller känsliga uppgifter. Ingenting sparas som sökning ännu.</p>
        <label className="check"><input autoFocus={!needsPassword} type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} />
          <span>Jag vill använda AI-texthjälpen hos Cloudflare.</span></label>
      </>}
      {purpose !== "ai" && <p>{purpose === "browse" ? "Bostadslistan är för ägaren och inbjudna. Du behöver bara lösenordet, inte e-post eller AI." : "Det gemensamma lösenordet öppnar åtkomsten. Inget AI-anrop görs."}</p>}
      {purpose !== "browse" && <details><summary>Integritet, modell & gränser</summary>
        <p className="small">Built with Llama. Vi lägger inte till konto eller e-post till AI-texten. Ingen rå prompt eller chatthistorik sparas av appen; tolkade utkast gäller i 30 minuter. AI kan feltolka – granska resultatet.</p>
        <p className="small">Högst sex AI-försök totalt per UTC-dygn, inte per besökare. Misslyckade anrop räknas också. Högst 40 konton och 200 gästsessioner. Ingen obegränsad gratis tjänst.</p>
        <a href="?info=privacy" target="_blank" rel="noopener noreferrer">Fullständig integritetsinformation</a>{" · "}
        <a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE" target="_blank" rel="noopener noreferrer">Modellvillkor</a>
      </details>}
      {error && <p className="error" role="alert" tabIndex={-1} ref={feedback}>{error}</p>}
      {busy && <p role="status">Kontrollerar åtkomst… Inget AI-anrop har gjorts.</p>}
      <div className="flow-actions"><button className="primary" disabled={busy || unavailable || (needsPassword && !password) || (purpose === "ai" && !consent)}>
        {purpose === "ai" ? "Skapa med AI" : purpose === "browse" ? "Visa bostäder" : "Fortsätt utan AI"}</button>
        <button type="button" onClick={cancel}>{unavailable ? "Tillbaka till text och filter" : "Avbryt"}</button></div>
    </form>
  </dialog>;
}
export function GateStatus({ gate, apiBase, refresh }: { gate: Gate; apiBase: string; refresh: () => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <section className="notice" aria-label="Gäståtkomst">
    <p><strong>{gate.quota.remaining} av {gate.quota.limit} AI-försök återstår för hela tjänsten idag (UTC).</strong> Andra kan använda dem före dig. Ingen personlig tilldelning. Filter kräver inte AI.</p>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await accessRequest(apiBase, "/api/gate/logout", {}); closePrivateAccess(true); refresh(); }
      catch (error) { setError(error instanceof Error ? error.message : "Utloggningen kunde inte bekräftas."); }
      finally { setBusy(false); }
    }}>Stäng åtkomsten</button>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
