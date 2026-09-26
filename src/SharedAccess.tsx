import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

export const quotaSchema = z.object({ remaining: z.number().int().min(0).max(6), limit: z.literal(6), day: z.string() });
export const gateSchema = z.object({ open: z.literal(true), aiReady: z.boolean(), pendingSave: z.boolean(), hasDraft: z.boolean(), quota: quotaSchema });
export type Gate = z.infer<typeof gateSchema>;
export async function accessRequest(apiBase: string, path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { method: body ? "POST" : "GET", credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000) });
  } catch { throw new Error("Kunde inte nå tjänsten. Resultatet är inte bekräftat. Kontrollera anslutningen innan du försöker igen."); }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error(`Tjänsten gav ett oväntat svar (HTTP ${response.status}). Försök senare.`); }
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(result);
    throw new Error(error.success ? error.data.message : "Begäran kunde inte slutföras.");
  }
  return result;
}
export function GatePanel({ apiBase, refresh, inspiration }: { apiBase: string; refresh: () => void; inspiration: ReactNode }) {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error && !busy) feedback.current?.focus(); }, [error, busy]);
  return <section className="membership surface membership-public"><div className="membership-grid">
    <div className="membership-welcome">{inspiration}<div className="welcome-copy"><h1>Hitta ditt nästa hem.</h1>
      <p>Öppna med det gemensamma lösenordet. Beskriv sedan vad du söker – utan e-post.</p></div></div>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await accessRequest(apiBase, "/api/gate", { password }); setPassword(""); refresh(); }
      catch (error) { setError(error instanceof Error ? error.message : "Åtkomsten kunde inte öppnas."); }
      finally { setBusy(false); }
    }}><h2>Öppna sökningen</h2>
      <label>Gemensamt lösenord<input type="password" autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} required maxLength={128} disabled={busy} /></label>
      <p className="small muted">Du får lösenordet av tjänstens ansvariga. Det är inte ett personligt kontolösenord.</p>
      <button className="primary" disabled={busy || !password}>{busy ? "Kontrollerar lösenordet…" : "Öppna"}</button>
      {error && <p className="error" role="alert" tabIndex={-1} ref={feedback}>{error}</p>}
      <p className="small">Piloten delar på högst sex AI-försök per UTC-dygn. Vanliga filter fungerar utan AI. E-post verifieras först när du sparar. Högst 40 konton och 200 tillfälliga gästsessioner.</p>
      <a className="demo-link" href="?demo=1">Visa fiktivt exempel utan lösenord</a>
    </form>
  </div></section>;
}
export function GateStatus({ gate, apiBase, refresh }: { gate: Gate; apiBase: string; refresh: () => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <section className="notice" aria-label="Gäståtkomst">
    <p><strong>{gate.quota.remaining} av {gate.quota.limit} AI-försök återstår för hela tjänsten idag (UTC).</strong> Andra kan använda dem före dig. Ingen personlig tilldelning. Filter kräver inte AI.</p>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await accessRequest(apiBase, "/api/gate/logout", {}); refresh(); }
      catch (error) { setError(error instanceof Error ? error.message : "Utloggningen kunde inte bekräftas."); }
      finally { setBusy(false); }
    }}>Stäng åtkomsten</button>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
