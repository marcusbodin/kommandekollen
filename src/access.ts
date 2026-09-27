const accessEvent = "kommandekollen-access-closed";
let generation = 0;
let pending = new AbortController();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("kommandekollen-access");

export class PrivateAccessError extends Error {}

export const accessGeneration = () => generation;
export function closePrivateAccess(broadcast = false) {
  generation++;
  pending.abort();
  pending = new AbortController();
  window.dispatchEvent(new Event(accessEvent));
  if (broadcast) channel?.postMessage("closed");
}
channel?.addEventListener("message", event => { if (event.data === "closed") closePrivateAccess(); });

export function onAccessClosed(listener: () => void) {
  window.addEventListener(accessEvent, listener);
  return () => window.removeEventListener(accessEvent, listener);
}
export async function privateFetch(url: string, init: RequestInit = {}, allowAnonymous = false) {
  const current = generation;
  const response = await fetch(url, {
    ...init, credentials: "include", cache: "no-store", redirect: "error",
    signal: AbortSignal.any([pending.signal, init.signal ?? AbortSignal.timeout(25_000)]),
  });
  if (current !== generation) throw new PrivateAccessError("Åtkomsten har stängts. Öppna den igen för att fortsätta.");
  if (response.status === 401 && !allowAnonymous) {
    closePrivateAccess();
    throw new PrivateAccessError("Åtkomsten är stängd. Öppna den igen för att fortsätta.");
  }
  if (response.status === 503) {
    const failure: unknown = await response.clone().json().catch(() => null);
    if (failure && typeof failure === "object" && "code" in failure
      && (failure.code === "gate_unavailable" || failure.code === "access_config")) {
      closePrivateAccess();
      throw new PrivateAccessError("Lösenordsåtkomsten är inte tillgänglig. Försök senare.");
    }
  }
  return response;
}
