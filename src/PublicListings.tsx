import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { defaultFilters, filterSchema, type Filters } from "../shared/model";
import { publicListingsSchema, type PublicListing, type PublicListingsPage } from "../shared/public-listings";

export function PublicListings({ apiBase, renderFilters, renderListing }: {
  apiBase: string;
  renderFilters: (filters: Filters, change: (filters: Filters) => void) => ReactNode;
  renderListing: (listing: PublicListing) => ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters });
  const [editing, setEditing] = useState<Filters>({ ...defaultFilters });
  const [items, setItems] = useState<PublicListing[]>([]);
  const [page, setPage] = useState<PublicListingsPage | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), inFlight = useRef(false), controller = useRef<AbortController | null>(null);
  const filterDetails = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  async function load(selected: Filters, cursor: string | null, replace: boolean) {
    if (!replace && inFlight.current) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    inFlight.current = true; setBusy(true); setError("");
    if (replace) { setItems([]); setPage(null); }
    try {
      if (!apiBase) throw new Error("Objektlistan är inte ansluten ännu. Inga objekt kan hämtas.");
      const query = new URLSearchParams({ filters: JSON.stringify(selected) });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${apiBase}/api/listings?${query}`, {
        credentials: "omit", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ message: z.string().max(500) }).safeParse(data);
        throw new Error(failure.success ? failure.data.message : "Objektlistan kunde inte hämtas. Försök igen.");
      }
      const parsed = publicListingsSchema.safeParse(data);
      if (!parsed.success || (cursor && parsed.data.nextCursor === cursor)) throw new Error("Objektlistan svarade oväntat. Försök igen.");
      if (current !== generation.current) return;
      const result = parsed.data;
      setPage(result);
      setItems(previous => replace || result.availability !== "ready" ? result.items
        : [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))]);
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error && failure.name !== "TypeError"
        && failure.name !== "TimeoutError" && failure.name !== "SyntaxError" ? failure.message
        : "Kunde inte läsa objektlistan. Kontrollera anslutningen och försök igen.");
    } finally {
      if (current === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    void load(defaultFilters, null, true);
    return () => { generation.current++; controller.current?.abort(); };
  }, [apiBase]);
  function apply(selected: Filters) {
    const parsed = filterSchema.safeParse(selected);
    if (!parsed.success) { setError("Kontrollera objektfiltren. Minsta värdet får inte vara större än det högsta."); return; }
    setFilters(parsed.data); setEditing(parsed.data);
    if (filterDetails.current) filterDetails.current.open = false;
    void load(parsed.data, null, true);
    heading.current?.focus({ preventScroll: true });
  }
  return <section className="public-listings" aria-labelledby="public-listings-title">
    <div className="public-listings-heading">
      <h2 id="public-listings-title" ref={heading} tabIndex={-1}>Senaste kommande bostäder</h2>
    </div>
    <details ref={filterDetails} className="public-filters">
      <summary>Filtrera objekt</summary>
      <div className="public-filter-controls">
        {renderFilters(editing, setEditing)}
        <p className="small muted">Filtren gäller hela objektlistan, inte din sparade sökning. Välj Använd filter när du är klar.</p>
        <button className="primary" disabled={!filterSchema.safeParse(editing).success} onClick={() => apply(editing)}>Använd filter</button>
      </div>
    </details>
    <p role="status" className="small muted">{busy ? items.length ? "Hämtar fler objekt…" : "Hämtar objekt…"
      : items.length === 1 ? "1 inläst objekt · senast upptäckta först" : items.length ? `${items.length} inlästa objekt · senast upptäckta först` : ""}</p>
    {error && <div className="notice" role="alert"><p>{error}</p>
      {items.length > 0 && <p>Redan inlästa objekt finns kvar och har inte uppdaterats.</p>}
      <button disabled={busy} onClick={() => void load(filters, page?.nextCursor ?? null, !items.length)}>Försök igen</button></div>}
    {!busy && !error && page?.availability === "no_sources" && <div className="public-empty">
      <p>Inga bostadskällor är anslutna ännu. Därför visas inga bostäder just nu.</p>
    </div>}
    {!busy && !error && page?.availability === "empty" && <div className="public-empty"><h3>Inga kommande objekt just nu</h3>
      <p>Det finns inga tillgängliga kommande objekt från tillåtna källor i Stockholms län.</p></div>}
    {!busy && !error && page?.availability === "ready" && !items.length && <div className="public-empty">
      <h3>Inga objekt matchar filtren</h3><p>Prova ett större område eller färre gränser.</p>
      <button onClick={() => apply(defaultFilters)}>Rensa filter</button></div>}
    <div className="property-grid" aria-busy={busy}>{items.map(item => <div key={item.id}>{renderListing(item)}</div>)}</div>
    {page?.hasMore && !error && <div className="public-load-more">
      <button className="primary" disabled={busy} onClick={() => void load(filters, page.nextCursor, false)}>Ladda fler</button>
    </div>}
    {!busy && page && <button className="text-button refresh-listings" onClick={() => void load(filters, null, true)}>Uppdatera listan</button>}
    {items.length > 0 && <p className="small muted results-note">Uppgifter och kommande-status kan ändras. Äldre uppgifter än 48 timmar markeras. Kontrollera alltid hos källan. Uppdatera listan för nytillkomna objekt.</p>}
  </section>;
}
