import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { defaultFilters, filterSchema, listingFacts, listingSchema, municipalities, sourceIds, types, type Filters, type Listing } from "../shared/model";
import { assess, manualProfile, profileSchema, ranked, type Profile } from "../shared/preferences";
import { sources, type Source } from "../shared/sources";
import { demoListings } from "./demo";
import { NumericFilter } from "./NumericFilter";
import { PreferenceFlow, type PreferenceControls } from "./PreferenceFlow";
import { gateSchema, GateStatus, useSearchAccess, type Gate } from "./SharedAccess";
import { PublicListings } from "./PublicListings";
import type { PublicListing } from "../shared/public-listings";
import { accessGeneration, closePrivateAccess, onAccessClosed, privateFetch, PrivateAccessError } from "./access";
import "./style.css";

const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const demo = import.meta.env.VITE_DEMO === "true" || new URLSearchParams(location.search).get("demo") === "1";
function takeAction() {
  const match = /^(confirm|guest-confirm|unsubscribe)=(.+)$/.exec(location.hash.slice(1));
  if (match) history.replaceState(null, "", location.pathname + location.search);
  return match;
}
const initialAction = takeAction();
type Run = { last_success: string | null; last_attempt: string; status: string; error_code: string | null; item_count: number };
type SourceState = Source & { authorized?: boolean; coverage?: "complete" | "partial" | null; run?: Run | null };
type Catalog = { listings: Listing[]; sources: SourceState[]; serviceReady: boolean; privacyContact: string | null };
const catalogSchema = z.object({
  listings: z.array(listingSchema.extend({ id: z.string(), firstSeen: z.string().datetime(), lastSeen: z.string().datetime(), coverage: z.enum(["complete", "partial"]) })).max(200),
  sources: z.array(z.object({
    id: z.enum(sourceIds), name: z.string(), status: z.enum(["blocked", "unverified", "awaiting-feed"]), reason: z.string(),
    robots: z.string().nullable(), terms: z.string().nullable(), checked: z.string().nullable(),
    authorized: z.boolean(), coverage: z.enum(["complete", "partial"]).nullable(), run: z.object({
      last_success: z.string().nullable(), last_attempt: z.string(), status: z.string(), error_code: z.string().nullable(), item_count: z.number(),
    }).nullable(),
  })),
  serviceReady: z.boolean(), privacyContact: z.string().nullable(),
});
const date = (value: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(new Date(value));
const stale = (value: string) => Date.now() - Date.parse(value) > 48 * 3600_000;

function BrandMark() {
  return <img className="brand-mark" src={`${import.meta.env.BASE_URL}assets/brand-mark-blue-80.png`}
    width={40} height={40} alt="" decoding="async" />;
}
function Icon({ name }: { name: "home" | "bell" | "arrow" | "sun" | "moon" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
async function post(path: string, body: unknown): Promise<string> {
  if (!apiBase) throw new Error("API-adressen är inte konfigurerad. Ingen begäran har skickats.");
  let response: Response;
  try {
    response = await privateFetch(`${apiBase}${path}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof PrivateAccessError) throw error;
    throw new Error("Kunde inte nå tjänsten. Kontrollera anslutningen och försök igen. Begäran kan ha nått servern.");
  }
  let result: { message?: string };
  try { result = await response.json(); }
  catch { throw new Error("Tjänsten svarade oväntat. Försök igen senare."); }
  if (!response.ok) throw new Error(result.message || "Begäran misslyckades. Försök igen senare.");
  if (typeof result.message !== "string") throw new Error("Bekräftelse saknas i serverns svar.");
  if (path === "/api/logout" || path === "/api/delete-account") closePrivateAccess(true);
  return result.message;
}
function ActionPage({ shared, action }: { shared: boolean; action: RegExpExecArray }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const outcome = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!busy && (error || message)) { outcome.current?.focus({ preventScroll: true }); outcome.current?.scrollIntoView({ block: "center" }); }
  }, [busy, error, message]);
  const guestConfirm = action?.[1] === "guest-confirm";
  const confirm = action?.[1] === "confirm" || guestConfirm;
  async function submit() {
    setBusy(true); setError("");
    try { setMessage(await post(guestConfirm ? "/api/guest/preferences/verify" : `/api/${confirm ? "confirm" : "unsubscribe"}`, { token: action![2] })); }
    catch (error) { setError(error instanceof Error ? error.message : "Ett fel uppstod."); }
    finally { setBusy(false); }
  }
  return <section className="action-page surface">
    <Icon name={confirm ? "bell" : "home"} />
    <h1>{confirm ? "Bekräfta och logga in" : "Avsluta ditt medlemskap"}</h1>
    <p>{confirm ? shared || guestConfirm ? "Bekräfta din e-post i samma webbläsare där du begärde länken, med lösenordsåtkomsten kvar. Verifieringen sparar ingen sökning och startar inga bostadsmejl. Återgå därefter och granska sökningen innan du bekräftar sparandet."
      : "Bekräfta din e-post för att fortsätta. En ny ansökan behöver därefter godkännas av ägaren; verifiering ensam ger ingen tillgång till sparade sökningar eller bevakningar."
      : "Din e-postadress, ditt medlemskap och dina sökpreferenser raderas ur den aktiva databasen när du avslutar."} Ingenting ändras bara av att öppna länken.</p>
    {error && <p role="alert" className="error" tabIndex={-1} ref={outcome}>{error}</p>}
    {message ? <p role="status" className="notice" tabIndex={-1} ref={outcome}>{message}</p> : <button className="primary" disabled={busy || demo || !apiBase} onClick={submit}>{busy ? confirm ? "Bekräftar e-post…" : "Avslutar medlemskapet…" : confirm ? "Bekräfta e-post" : "Avsluta och radera"}</button>}
    {(demo || !apiBase) && <p className="notice">Länken kan inte behandlas i demo eller utan konfigurerat API. Öppna mejlets länk på den riktiga tjänsten.</p>}
    {error && (shared || guestConfirm) && <p>Om länken öppnades på en annan enhet: öppna mejlet i ursprungliga webbläsaren. Om lösenordsåtkomsten har gått ut behöver du öppna tjänsten och begära en ny länk. Skriv inte token eller lösenord i ett supportmeddelande.</p>}
    <a href={guestConfirm ? `${location.pathname}?review=1` : location.pathname + location.search}>{shared || guestConfirm ? "Till sökningen och granskningen" : "Till medlemskapet"}</a>
  </section>;
}
const memberSchema = z.object({
  id: z.string(), email: z.string(), state: z.enum(["unverified", "pending", "approved", "rejected", "revoked"]),
  owner: z.boolean(), filters: filterSchema, alertsEnabled: z.boolean(),
  profile: profileSchema, searchVersion: z.number().int().nonnegative(), aiReady: z.boolean(), alertsReady: z.boolean(),
});
type Member = z.infer<typeof memberSchema>;
type Application = { id: string; email: string; application: string; state: string };
function OwnerPanel({ ownerId, shared = false }: { ownerId: string; shared?: boolean }) {
  const [members, setMembers] = useState<Application[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await privateFetch(`${apiBase}/api/admin/members`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Kunde inte hämta medlemslistan. Logga in igen som ägare.");
      const data = z.object({ members: z.array(z.object({ id: z.string().uuid(), email: z.string(), application: z.string(), state: z.string() })) }).parse(await response.json());
      setMembers(data.members);
    } catch { setMembers([]); setError("Kunde inte hämta medlemslistan. Logga in igen som ägare."); }
  }
  useEffect(() => { void load(); }, []);
  async function review(memberId: string, decision: "approve" | "reject" | "revoke") {
    setBusy(true); setError(""); setMessage("");
    try { setMessage(await post("/api/admin/review", { memberId, decision })); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Åtgärden misslyckades."); }
    finally { setBusy(false); }
  }
  return <section className="owner-panel surface" id="medlemmar"><h2>Hantera medlemskap</h2><p className="small muted">{shared ? "Konton verifieras via e-post utan manuella godkännanden." : "Endast verifierade ansökningar kan godkännas."} Återkallelse stoppar kontots åtkomst och väntande mejl.</p>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
    {members.map(member => <div className="member-row" key={member.id}><div><strong>{member.email}</strong><p className="small">{member.application}</p><span className="small muted">{{ unverified: "Ej verifierad", pending: "Väntar på beslut", approved: "Godkänd", rejected: "Avslagen", revoked: "Återkallad" }[member.state]}</span></div>
      <div className="member-actions">{!shared && member.state === "pending" && <><button className="primary" disabled={busy} onClick={() => review(member.id, "approve")}>Godkänn</button><button disabled={busy} onClick={() => review(member.id, "reject")}>Avslå</button></>}
        {member.state === "approved" && member.id !== ownerId && <button className="danger-button" disabled={busy} onClick={() => review(member.id, "revoke")}>Återkalla</button>}</div></div>)}
  </section>;
}
function Membership({ member, ready, accepting, refresh, shared = false }: { member: Member | null; ready: boolean; accepting: boolean; refresh: () => void; shared?: boolean }) {
  const [login, setLogin] = useState(shared), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      setMessage(await post(login ? "/api/login" : "/api/apply", login
        ? { email: data.get("email"), website: data.get("website") }
        : { email: data.get("email"), website: data.get("website"), application: data.get("application"), consent: data.get("consent") === "on" }));
    } catch (error) { setError(error instanceof Error ? error.message : "Försöket misslyckades."); }
    finally { setBusy(false); }
  }
  async function accountAction(path: string) {
    setBusy(true); setError("");
    try { setMessage(await post(path, {})); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Åtgärden misslyckades."); }
    finally { setBusy(false); }
  }
  return <section className={`membership surface ${member ? "membership-account" : "membership-public"}`} id="medlemskap">
    {member ? <><details className="account-details" open={member.state !== "approved" ? true : undefined}>
      <summary>{member.state === "approved" ? "Ditt medlemskap" : shared ? "Verifiera ditt konto på nytt" : "Din ansökan väntar på godkännande"}<span>{member.email}</span></summary>
      <div className="account-content">
      {member.state !== "approved" && <p className="notice">{shared ? "Verifiera din e-post på nytt via en inloggningslänk för att använda det befintliga kontot. Ett gammalt väntande medlemskap aktiveras inte automatiskt."
        : "Din e-postadress är verifierad. Ägaren behöver nu godkänna ansökan. Du har ännu ingen tillgång till bostäder, källresultat eller bevakning."}</p>}
      <div className="member-actions"><button disabled={busy} onClick={() => accountAction("/api/logout")}>Logga ut</button><button className="text-button danger-button" onClick={() => setDeleteConfirm(value => !value)}>Radera medlemskapet</button></div>
      {shared && member.state !== "approved" && <button disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { setMessage(await post("/api/login", { email: member.email, website: "" })); }
        catch (error) { setError(error instanceof Error ? error.message : "Mejlförfrågan misslyckades."); }
        finally { setBusy(false); }
      }}>Begär en ny mejllänk</button>}
      {deleteConfirm && <div className="notice"><p>{shared ? "Detta raderar kontot, utkasten och bevakningen. Åtkomsten stängs. AI-kvoten återställs inte." : "Detta raderar ansökan, medlemskapet och bevakningen. Du behöver ansöka på nytt om du vill återvända."}</p><button className="danger-button" disabled={busy} onClick={() => accountAction("/api/delete-account")}>Bekräfta radering</button></div>}
      </div></details>
    </> : <div className={shared ? "" : "membership-grid"}>{!shared && <div className="membership-welcome"><div className="welcome-copy"><h1>En privat väg till nästa hem.</h1><p>Beskriv ditt nästa hem, förtydliga vid behov och godkänn din sökning. Bara för godkända medlemmar.</p></div></div>}
      <form onSubmit={submit}><h2>{login ? "Logga in med mejllänk" : "Ansök om medlemskap"}</h2>
        <p className="small muted">{shared ? "Logga in till ditt befintliga konto med en mejllänk. Det gemensamma lösenordet behövs också för åtkomst."
          : login ? "Få en säker länk till din e-post. Inget personligt lösenord behövs." : "Ansök, verifiera din e-post och invänta ägarens godkännande."}</p>
        {!ready && <p className="notice">Tjänsten är inte konfigurerad för ansökningar eller mejl ännu.</p>}
        {!accepting && ready && !login && <p className="notice">Piloten är full. Nya ansökningar är tillfälligt pausade.</p>}
        <label>E-postadress<input type="email" name="email" required autoComplete="email" maxLength={254} placeholder="namn@example.com" /></label>
        {!login && <><label>Berätta kort om din bostadssökning<textarea name="application" required minLength={10} maxLength={500} rows={3} /></label>
          <label className="check"><input type="checkbox" name="consent" required /><span>Jag godkänner att min ansökan behandlas enligt <a href="#integritet">integritetsinformationen</a>.</span></label></>}
        <div className="honeypot" aria-hidden="true"><label>Lämna tomt<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <button className="primary" disabled={busy || !ready || (!login && !accepting)}>{busy ? "Skickar begäran…" : login ? "Begär inloggningslänk" : "Skicka medlemsansökan"}</button>
        {!shared && <><button type="button" className="text-button" onClick={() => { setLogin(value => !value); setMessage(""); setError(""); }}>{login ? "Ny här? Ansök om medlemskap" : "Har du redan ansökt? Logga in"}</button>
          <details className="membership-info"><summary>Så fungerar medlemskapet</summary><p className="small muted">Högst 40 medlemskap inklusive väntande ansökningar. E-postverifiering är inte ett medlemsbeslut. Bostäder, sparade sökningar och bevakningar är bara för godkända medlemmar. Vi samlar inte in objekt från källor där användningen är förbjuden eller oklar.</p></details>
          <a className="demo-link" href="?demo=1">Prova sökningen med fiktiva exempel<Icon name="arrow" /></a></>}
      </form></div>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
  </section>;
}
function FilterPanel({ filters, onChange, heading = "Din sökning" }: { filters: Filters; onChange: (value: Filters) => void; heading?: string }) {
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  type NumericKey = "minPrice" | "maxPrice" | "minRooms" | "maxRooms" | "minSize" | "maxSize" | "maxFee";
  const updateNumber = (key: NumericKey, value: number | null) => {
    const next = { ...filters, [key]: value };
    for (const [min, max] of [["minPrice", "maxPrice"], ["minRooms", "maxRooms"], ["minSize", "maxSize"]] as const) {
      if (next[min] !== null && next[max] !== null && next[min] > next[max]) {
        if (key === min) next[max] = next[min];
        else next[min] = next[max];
      }
    }
    onChange(next);
  };
  const field = (key: NumericKey, label: string, unit: string, step: number, suggestedMax: number, max: number) =>
    <NumericFilter key={key} label={label} value={filters[key]} unit={unit} step={step} suggestedMax={suggestedMax} max={max}
      minimum={key.startsWith("min")} onChange={value => updateNumber(key, value)} />;
  const extraCount = [filters.area || null, filters.minPrice, filters.maxRooms, filters.minSize, filters.maxSize, filters.maxFee,
    filters.includeUnknown ? true : null].filter(value => value !== null).length;
  return <aside className="filter-panel surface" aria-label="Sökfilter">
    <div className="section-heading"><h2>{heading}</h2><button className="text-button" onClick={() => onChange({ ...defaultFilters })}>Rensa</button></div>
    <label>Kommun<select value={filters.municipality || ""} onChange={event => update("municipality", event.target.value ? event.target.value as Filters["municipality"] : null)}>
      <option value="">Hela Stockholms län</option>{municipalities.map(name => <option key={name}>{name}</option>)}
    </select></label>
    <fieldset className="type-options"><legend>Bostadstyp</legend><div className="type-buttons">
      <button type="button" aria-pressed={filters.type === null} onClick={() => update("type", null)}>Alla</button>
      {types.map(type => <button type="button" key={type} aria-pressed={filters.type === type} onClick={() => update("type", type)}>{type}</button>)}
    </div></fieldset>
    {field("maxPrice", "Högsta pris", "kr", 100000, 20000000, 100000000)}
    {field("minRooms", "Minsta antal rum", "rum", 0.5, 10, 30)}
    <details className="more-filters"><summary>Fler filter<span className="small">{extraCount ? `${extraCount} valda` : "Område, storlek & avgift"}</span></summary>
      <div className="more-filter-fields">
        <label>Område eller gata<input type="search" value={filters.area} maxLength={60} placeholder="Till exempel Södermalm" onChange={event => update("area", event.target.value)} /></label>
        {field("minPrice", "Lägsta pris", "kr", 100000, 20000000, 100000000)}
        {field("maxRooms", "Högsta antal rum", "rum", 0.5, 10, 30)}
        {field("minSize", "Minsta boarea", "m²", 5, 300, 10000)}
        {field("maxSize", "Största boarea", "m²", 5, 300, 10000)}
        {field("maxFee", "Högsta månadsavgift", "kr/mån", 250, 15000, 100000)}
        <label className="check"><input type="checkbox" checked={filters.includeUnknown} onChange={event => update("includeUnknown", event.target.checked)} /><span>Ta även med objekt där filtrerade sifferuppgifter saknas</span></label>
        <p className="small muted">Saknade uppgifter räknas aldrig som noll. Vald bostadstyp kräver en angiven typ. Om en min- och maxgräns korsas följer den andra gränsen med. Exakta värden kan skrivas in utan avrundning.</p>
      </div>
    </details>
    {!filterSchema.safeParse(filters).success && <p role="alert" className="error">Kontrollera intervallen. Minsta värdet får inte vara större än det högsta.</p>}
  </aside>;
}
function Property({ listing, profile }: { listing: Listing | PublicListing; profile?: Profile }) {
  const assessment = profile && "externalId" in listing ? assess(listing, profile) : null;
  const facts = listingFacts(listing);
  return <article className="property surface">
    <div className="property-top"><span className="badge">{demo ? "Demo · kommande" : "Kommande"}</span><span className="small muted">Bostadstyp: {facts.type}</span></div>
    <div className="property-location">{listing.area} · {listing.municipality}</div>
    <h3>{listing.address}</h3>
    <p className="price">{listing.price === null ? `Pris: ${facts.price}` : facts.price}</p>
    <dl className="facts">
      <div><dt>Boarea</dt><dd>{facts.size}</dd></div>
      <div><dt>Rum</dt><dd>{facts.rooms}</dd></div>
      <div><dt>Avgift/mån</dt><dd>{facts.fee}</dd></div>
    </dl>
    {assessment && <p className="small">{assessment.needsCheck ? "Matchar kända filter. Manuell kontroll krävs." : "Matchar dina faktabaserade krav."}</p>}
    {!!assessment?.reasons.length && <ul className="match-reasons small">{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    {!!profile?.unverified.length && <p className="small muted">Inte bedömt: {profile.unverified.map(c => c.text).join("; ")}.</p>}
    {!profile && <p className="small muted">Först upptäckt: {date(listing.firstSeen)}</p>}
    {listing.coverage === "partial" && <p className="small muted">Observerat i ett begränsat urval, inte en fullständig inventering.</p>}
    <div className="property-bottom">
      {demo ? <span className="small muted">Fiktivt objekt · ingen annons</span> : <><div className="small muted">{sources.find(source => source.id === listing.sourceId)?.name}<br />
        <span className={stale(listing.lastSeen) ? "stale" : ""}>{stale(listing.lastSeen) ? "Äldre uppgift: " : "Kontrollerad: "}{date(listing.lastSeen)}</span></div>
        <a href={listing.url} target="_blank" rel="noopener noreferrer">Visa objekt<Icon name="arrow" /></a></>}
    </div>
  </article>;
}
function Sources({ data }: { data: SourceState[] }) {
  return <section id="kallor" className="sources-section">
    <h2>Källor och täckning</h2><p className="muted">Vi visar bara objekt från tillåtna källor. En tillåtande robots.txt är inte en licens att återpublicera data. Ingen fullständig Stockholmstäckning utlovas.</p>
    <div className="source-list surface">{data.map(source => <div className="source-row" key={source.id}>
      <div><h3>{source.name}</h3><p className="small muted">{source.authorized ? source.coverage === "partial" ? "Privat observationsåtkomst konfigurerad av ansvarig. Detta är ingen återpubliceringslicens." : "Licens konfigurerad av tjänstens ansvariga." : source.reason}</p>
        {source.run?.last_success && <p className="small">Senast observerat: {date(source.run.last_success)} · {source.run.item_count} objekt i importen{source.coverage === "partial" ? ", inte hela källans utbud" : ""}</p>}
        {source.run?.status === "failed" && <p className="error small">Senaste hämtningen misslyckades. Tidigare objekt behålls och märks som äldre när de passerat 48 timmar.</p>}
      </div><span className="source-status">{source.authorized ? source.run?.last_success ? stale(source.run.last_success) ? "Äldre data" : source.run.status === "failed" ? "Hämtningsfel" : source.coverage === "partial" ? "Partiellt urval" : "Importerad feed" : "Väntar på data" : source.status === "blocked" ? "Tillstånd krävs" : source.status === "awaiting-feed" ? "Ingen feed ansluten" : "Ej verifierad"}</span>
    </div>)}</div>
  </section>;
}
function App() {
  const [action, setAction] = useState(initialAction);
  useEffect(() => {
    const handle = () => { const next = takeAction(); if (next) setAction(next); };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "light");
  const [demoProfile, setDemoProfile] = useState<Profile>(manualProfile());
  const [catalog, setCatalog] = useState<Catalog>({ listings: demo ? demoListings : [], sources, serviceReady: false, privacyContact: null });
  const [loading, setLoading] = useState(!demo && !!apiBase);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState("personal");
  const [member, setMember] = useState<Member | null>(null);
  const [shared, setShared] = useState<boolean | null>(null), [gate, setGate] = useState<Gate | null>(null);
  const [listingsVisible, setListingsVisible] = useState(false), [accessVersion, setAccessVersion] = useState(0);
  const wantsAccount = useRef(new URLSearchParams(location.search).get("review") === "1");
  const minimal = !demo && shared !== false && !action;
  const [panel, setPanel] = useState(() => {
    const info = new URLSearchParams(location.search).get("info");
    return info === "privacy" || info === "help" ? info : "";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null), preferenceControls = useRef<PreferenceControls>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null), privacyHeading = useRef<HTMLHeadingElement>(null);
  const { authorize, dialog } = useSearchAccess(apiBase, gate, current => { setGate(current); setListingsVisible(true); });
  const [ready, setReady] = useState(false), [accepting, setAccepting] = useState(false);
  const [accountLoading, setAccountLoading] = useState(!demo && !!apiBase && !action);
  const [accountError, setAccountError] = useState("");
  const [accountReload, setAccountReload] = useState(0);
  const recheck = () => setAccountReload(value => value + 1);
  const refresh = () => { wantsAccount.current = true; recheck(); };
  const canSearch = demo || (shared ? !!gate : member?.state === "approved");
  const guestFlow = shared && !!gate && (!member || member.state !== "approved" || gate.pendingSave || gate.hasDraft);
  const canShowSaved = !!member && !!gate && !guestFlow;
  async function openPanel(next: string) {
    setMenuOpen(false);
    if (next === "account" && !gate) {
      if (!await authorize("account")) { menuButton.current?.focus(); return; }
      refresh();
    }
    if (next === "account" && gate) refresh();
    setPanel(next);
    requestAnimationFrame(() => (next === "privacy" ? privacyHeading.current : panelHeading.current)?.focus());
  }
  function showSearch(part: keyof PreferenceControls = "focusPrompt") {
    setMenuOpen(false); setPanel(""); preferenceControls.current?.[part]();
  }
  function openInfo(event: MouseEvent<HTMLAnchorElement>, next: "help" | "privacy") {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); void openPanel(next);
  }
  useEffect(() => {
    return onAccessClosed(() => {
      setAccessVersion(value => value + 1); setListingsVisible(false);
      setGate(null); setMember(null);
      setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
      setPanel(current => ["help", "privacy"].includes(current) ? current : "");
    });
  }, []);
  useEffect(() => {
    if (demo || !apiBase) return;
    let active = true;
    const currentAccess = accessGeneration(), controller = new AbortController();
    const current = () => active && currentAccess === accessGeneration();
    setAccountLoading(true); setAccountError("");
    privateFetch(`${apiBase}/api/status`, { signal: controller.signal }, true).then(async statusResponse => {
      if (!statusResponse.ok) throw new Error("Kunde inte kontrollera tjänstens status.");
      const status = z.object({ serviceReady: z.boolean(), acceptingApplications: z.boolean(), privacyContact: z.string().nullable(), accessMode: z.enum(["shared", "membership"]).optional() }).parse(await statusResponse.json());
      if (!current()) return;
      setReady(status.serviceReady); setAccepting(status.acceptingApplications);
      setShared(status.accessMode === "shared");
      if (status.accessMode === "shared") {
        const response = await privateFetch(`${apiBase}/api/gate`, { signal: controller.signal }, true);
        if (!current()) return;
        if (response.status === 401) { closePrivateAccess(); return; }
        if (!response.ok) throw new Error("Lösenordsåtkomsten kunde inte kontrolleras. Försök igen senare.");
        const nextGate = gateSchema.parse(await response.json());
        if (!current()) return;
        setGate(nextGate); setListingsVisible(document.visibilityState !== "hidden");
      } else setGate(null);
      setCatalog(current => ({ ...current, privacyContact: status.privacyContact }));
      if (status.accessMode === "shared" && !wantsAccount.current) return;
      const memberResponse = await privateFetch(`${apiBase}/api/me`, { signal: controller.signal }, true);
      if (!current()) return;
      if (memberResponse.status === 401) {
        setMember(null);
        if (status.accessMode !== "shared") setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
        return;
      }
      if (!memberResponse.ok) throw new Error("Kunde inte kontrollera medlemskapet. Logga in igen.");
      const account = memberSchema.parse(await memberResponse.json());
      if (current()) { setMember(account); if (status.accessMode !== "shared") setListingsVisible(account.state === "approved"); }
    }).catch(error => {
      if (current()) {
        closePrivateAccess();
        setMember(null); setGate(null); setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
        setAccountError(error instanceof Error ? error.message : "Medlemskontrollen misslyckades.");
      }
    }).finally(() => { if (active) setAccountLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [accountReload]);
  useEffect(() => {
    const check = () => { if (!demo && apiBase && !action && document.visibilityState !== "hidden") recheck(); };
    const suspend = () => {
      setListingsVisible(false); setAccessVersion(value => value + 1);
      setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
    };
    const visibility = () => { if (document.visibilityState === "hidden") suspend(); else check(); };
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("focus", check); window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", check); document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!gate || demo) return;
    const expiry = setTimeout(() => closePrivateAccess(), Math.max(0, gate.expiresAt - Date.now()));
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const generation = accessGeneration();
      void privateFetch(`${apiBase}/api/gate`).then(async response => {
        if (!response.ok) throw new Error("Åtkomsten kunde inte kontrolleras. Öppna bostadslistan igen.");
        const current = gateSchema.parse(await response.json());
        if (generation === accessGeneration()) setGate(current);
      }).catch(() => {
        if (generation === accessGeneration()) {
          closePrivateAccess();
          setAccountError("Åtkomsten kunde inte kontrolleras. Öppna bostadslistan igen.");
        }
      });
    }, 60_000);
    return () => { clearTimeout(expiry); clearInterval(interval); };
  }, [gate]);
  useEffect(() => {
    if (demo || !apiBase || action || !canSearch || !listingsVisible || (minimal && panel !== "results")) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError("");
    const timeout = setTimeout(() => controller.abort(), 20_000);
    privateFetch(`${apiBase}/api/catalog`, { signal: controller.signal }).then(async response => {
      if (response.status === 401 || response.status === 403) {
        setMember(null); setGate(null); setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
        throw new Error("Medlemskapet behöver kontrolleras. Logga in igen.");
      }
      if (!response.ok) throw new Error("Bostäderna kunde inte hämtas. Försök igen om en stund.");
      const parsed = catalogSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Tjänsten svarade med oväntade uppgifter. Inga nya objekt visas.");
      if (active) setCatalog(parsed.data);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Kunde inte hämta data."); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [reload, member, canSearch, listingsVisible, accessVersion, minimal, panel]);
  const profile = demo ? demoProfile : member?.profile ?? manualProfile();
  const filtered = useMemo(() => ranked(catalog.listings, profile).sort((a, b) => {
    if (sort === "price") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (sort === "size") return (b.size ?? -1) - (a.size ?? -1);
    if (sort === "newest") return b.firstSeen.localeCompare(a.firstSeen);
    return 0;
  }), [profile, catalog.listings, sort]);
  const enabledSources = catalog.sources.filter(source => source.authorized).length;
  const changeTheme = () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; };
  const publicFeed = !demo && <PublicListings apiBase={apiBase} accessible={canSearch && listingsVisible} accessVersion={accessVersion}
    openAccess={() => { if (shared) void authorize("browse"); else void openPanel("account"); }}
    renderFilters={(filters, change) => <FilterPanel filters={filters} onChange={change} heading="Objektfilter" />}
    renderListing={listing => <Property listing={listing} />} />;
  return <div className={minimal ? "website-shell" : undefined}>
    <a className="skip" href="#main">Hoppa till innehåll</a>
    {minimal && <header className="site-header compact-header" onKeyDown={event => {
      if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }}>
      <div className="header-inner">
        <a className="brand" href="#main" onClick={event => { event.preventDefault(); showSearch(); }} aria-label="kommandekollen. – till sökningen">
          <BrandMark />kommandekollen<span className="brand-dot">.</span>
        </a>
        <nav id="site-navigation" className="compact-nav" data-expanded={menuOpen} aria-label="Huvudmeny">
          <div className="nav-essential">
            <a href="?info=help" onClick={event => openInfo(event, "help")}>Så fungerar det</a>
            {canShowSaved ? <button onClick={() => showSearch("showSaved")}>Min sökning</button>
              : <button onClick={() => void openPanel("account")}>Konto</button>}
            <a href="?info=privacy" onClick={event => openInfo(event, "privacy")}>Integritet</a>
          </div>
          {menuOpen && <div className="nav-advanced">
            <button onClick={() => showSearch("showManual")}>Använd vanliga filter</button>
            {gate && <button onClick={() => showSearch("restore")}>Fortsätt utkast</button>}
            {member && <button onClick={() => void openPanel("account")}>{member.owner ? "Konto & ägarverktyg" : "Konto / logga in"}</button>}
            {gate && <button onClick={() => void openPanel("results")}>Resultat & källstatus</button>}
            <a href="?demo=1" target="_blank" rel="noopener noreferrer">Visa fiktivt exempel</a>
            <button onClick={changeTheme}>{theme === "dark" ? "Ljust tema" : "Mörkt tema"}</button>
            {gate && <p className="small muted">{gate.quota.remaining} av {gate.quota.limit} AI-försök återstår för hela tjänsten idag (UTC). Andra kan använda dem före dig.</p>}
          </div>}
        </nav>
        <button ref={menuButton} className="site-menu-toggle" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(value => !value)}>Meny</button>
      </div>
    </header>}
    <header hidden={minimal} className="site-header"><div className="header-inner">
      <a className="brand" href={location.pathname}><BrandMark />kommandekollen<span className="brand-dot">.</span></a>
      <nav aria-label="Huvudmeny"><a href="#main">{canSearch ? "Sök bostad" : "Medlemskap"}</a><a href={canSearch ? "#kallor" : "#integritet"}>{canSearch ? "Källstatus" : "Integritet"}</a>{member?.owner && <a href="#medlemmar">Medlemmar</a>}</nav>
      <button className="theme-button" aria-label={theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"} onClick={changeTheme}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
    </div></header>
    {demo && <div className="demo-bar"><strong>Demonstrationsläge</strong><span>Alla bostäder är påhittade. Inga mejl skickas.</span></div>}
    <main id="main" className={`container${minimal ? " compact-home" : ""}`}>
      {action ? <ActionPage key={action[2]} shared={!!shared} action={action} /> : <>
        {minimal && <>
          <div className="home-hero">
          <picture className="hero-picture" aria-hidden="true">
            <source media="(max-width: 960px)" srcSet={`${import.meta.env.BASE_URL}assets/autumn-home-800.webp`} />
            <img className="hero-backdrop" src={`${import.meta.env.BASE_URL}assets/autumn-home-1374.webp`}
              width="1374" height="1145" alt="" fetchPriority="high" decoding="async"
              onError={event => { event.currentTarget.hidden = true; }}
              onLoad={event => { event.currentTarget.hidden = false; }} />
          </picture>
          <div className="home-composition">
          <PreferenceFlow apiBase={apiBase} demo={false} minimal authorized={!!gate} authorize={authorize}
            intro={<section className="home-intro" aria-labelledby="home-title">
              <h1 id="home-title">Vad är viktigt i ditt nästa hem?</h1>
              <p className="home-value">Hitta kommande bostäder före andra.</p>
              <p>Vi bygger en samlad koll direkt från mäklarna.</p>
            </section>}
            controlsRef={preferenceControls}
            member={guestFlow || !gate ? null : member} guest={guestFlow || !gate ? { aiReady: gate?.aiReady ?? false } : undefined}
            ready={gate?.alertsReady ?? false} refresh={refresh} onInference={refresh}
            renderFilters={(filters, change) => <FilterPanel filters={filters} onChange={change} />} onDemoPreview={setDemoProfile} />
          </div>
          </div>
          {publicFeed}
          {accountError && <div className="notice" role="alert"><p>{accountError} Din text finns kvar.</p><button onClick={refresh}>Kontrollera åtkomst igen</button></div>}
          {!apiBase && <p role="status" className="notice">Tjänsten är inte ansluten. Ingen text kan skickas. Ett fiktivt exempel finns i menyn.</p>}
          {panel && <div className="secondary-heading"><h2 ref={panelHeading} tabIndex={-1}>{panel === "account" ? "Ditt konto" : panel === "results" ? "Resultat & källor" : panel === "help" ? "Så fungerar det" : "Integritet"}</h2>
            <button onClick={() => showSearch()}>Tillbaka till texten</button></div>}
          {panel === "help" && <section className="how-it-works" aria-label="Så skapar du en sökning">
            <p>Objektlistan är privat, för ägaren och inbjudna med det gemensamma lösenordet. Bläddring och filtrering kräver inte e-post eller AI. Täckningen beror på anslutna källor och deras tillstånd. Vi garanterar inte alla objekt eller ett försprång framför andra bostadssajter.</p>
            <p>Först upptäckt är när Kommandekollen såg objektet, inte när mäklaren publicerade det. Vill du ha hjälp att formulera din personliga sökning är AI-hjälpen valfri:</p>
            <ol>
              <li><strong>Beskriv.</strong> Berätta var och hur du vill bo. Välj Hitta bostad, ange det gemensamma lösenordet och godkänn AI-hjälpen. Lösenordet är inte ett personligt konto.</li>
              <li><strong>Förtydliga.</strong> Svara på en fråga i taget när något behöver förklaras. Du kan också använda vanliga filter, utan AI.</li>
              <li><strong>Granska.</strong> Kontrollera krav, önskemål och sådant du behöver undersöka själv. Sökförslaget är inte sparat ännu.</li>
            </ol>
            <p>Vill du spara? Verifiera din e-post i samma webbläsare. Granska sedan sökförslaget igen och bekräfta sparandet. Verifieringen ensam sparar ingenting.</p>
            <details><summary>Om AI, integritet och gränser</summary>
              <p>Built with Llama. Med ditt godkännande skickas bostadstexten och föregående utkast till Cloudflare, utan tillagd konto- eller e-postinformation. Skriv inga personliga eller känsliga uppgifter. Granska alltid tolkningen.</p>
              <p>Hela piloten delar på högst sex AI-försök per UTC-dygn, även misslyckade anrop räknas. Vanliga filter använder inte AI. Ingen rå prompt eller chatthistorik sparas i appen; tolkade utkast gäller i 30 minuter.</p>
              <a href="?info=privacy" onClick={event => openInfo(event, "privacy")}>Fullständig integritetsinformation</a>{" · "}
              <a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE" target="_blank" rel="noopener noreferrer">Modellvillkor</a>
            </details>
          </section>}
          {panel === "account" && gate && <>
            <Membership member={member} ready={ready} accepting={false} refresh={refresh} shared />
            <GateStatus gate={gate} apiBase={apiBase} refresh={refresh} />
            {member?.owner && <OwnerPanel ownerId={member.id} shared />}
          </>}
        </>}
        {!demo && !minimal && <>
          {accountLoading && <p role="status" className="notice">Kontrollerar medlemskap…</p>}
          {accountError && <div className="notice" role="alert"><p>{accountError}</p><button onClick={refresh}>Försök igen</button></div>}
          <Membership member={member} ready={ready} accepting={accepting} refresh={refresh} />
          {!canSearch && publicFeed}
        </>}
        {canSearch && (demo || listingsVisible) && (!minimal || panel === "results") && <>
        {!minimal && <><section className="search-heading"><div className="search-heading-copy"><h1>Beskriv ditt nästa hem.</h1><p>Dina krav. Dina önskemål. Du godkänner innan något sparas.</p></div></section>
        <PreferenceFlow apiBase={apiBase} demo={demo} member={guestFlow ? null : member} guest={guestFlow ? { aiReady: gate!.aiReady } : undefined} ready={gate?.alertsReady ?? member?.alertsReady ?? false} refresh={refresh}
          renderFilters={(filters, change) => <FilterPanel filters={filters} onChange={change} />} onDemoPreview={setDemoProfile} onInference={shared ? refresh : undefined} />
          {publicFeed}</>}
        {shared && !member && <details className="surface"><summary>Har du redan en sparad sökning? Logga in</summary>
          <Membership member={null} ready={ready} accepting={false} refresh={refresh} shared /></details>}
        <div className="coverage-strip"><span className="status-dot" aria-hidden="true" /><span>{demo ? "6 exempelbostäder · 0 anslutna livekällor" : `${enabledSources} tillåtna källor · begränsad täckning`}</span><a href="#kallor">Se källstatus<Icon name="arrow" /></a></div>
        {!demo && !apiBase && <section className="notice config-state" role="status"><h2>Tjänsten är inte ansluten ännu</h2><p>Livekällor och bevakning är inte tillgängliga. Du kan prova sökningen med tydligt märkta exempelbostäder.</p><a className="button secondary" href="?demo=1">Prova med exempel</a></section>}
        <div className="personal-results">
          <section className="results" aria-label="Sökresultat">
            <div className="results-toolbar"><h2 aria-live="polite">{loading ? "Hämtar bostäder…" : `${filtered.length} ${demo ? "exempelbostäder" : "bostäder"}`}</h2>
              <label className="sort">Sortera<select value={sort} onChange={event => setSort(event.target.value)}><option value="personal">Dina önskemål först</option><option value="newest">Senast upptäckta</option><option value="price">Lägst pris</option><option value="size">Störst boarea</option></select></label></div>
            {!demo && <p className="small muted">{member ? "Resultat för din sparade sökning. Osparade utkast påverkar inte detta urval." : "Tillgängliga objekt. Du har ingen sparad sökning ännu."}</p>}
            {error && <div role="alert" className="notice"><h3>Det gick inte att uppdatera</h3><p>{error}</p><p>Eventuella tidigare resultat är inte uppdaterade.</p><button className="secondary" onClick={() => setReload(value => value + 1)}>Försök igen</button></div>}
            {!demo && catalog.listings.some(listing => stale(listing.lastSeen)) && <p className="notice">Vissa uppgifter är äldre än 48 timmar. De skickas inte i bevakningsmejl. Kontrollera status hos källan.</p>}
            {loading ? <div aria-busy="true" aria-label="Läser in bostäder" className="property-grid">{[1, 2, 3, 4].map(i => <div className="skeleton surface" key={i}><div/><div/><div/></div>)}</div> :
              filtered.length ? <div className="property-grid">{filtered.map(listing => <Property listing={listing} profile={profile} key={listing.id} />)}</div> :
                <div className="empty surface"><Icon name="home" /><h3>{catalog.listings.length ? "Inga bostäder matchar just nu" : "Inga liveobjekt att visa ännu"}</h3>
                  <p>{catalog.listings.length ? "Prova ett större område eller andra gränser. Ändra och godkänn din sökning ovan." : "Vi inväntar tillåtna datakällor. Importstödet finns, men automatisk insamling från mäklarna är inte aktiv."}</p></div>}
            <p className="results-note small muted">{demo ? "Exemplen visar hur sökningen fungerar, inte marknadsläget." : "Kommande-status och uppgifter kommer från källan och kan ändras. Objekt med okänt pris sorteras sist."}</p>
          </section>
        </div>
        <Sources data={catalog.sources} />
        {!minimal && member?.owner && <OwnerPanel ownerId={member.id} shared={!!shared} />}
        </>}
      </>}
      <section hidden={minimal && panel !== "privacy"} id="integritet" className="privacy">
        <h2 ref={privacyHeading} tabIndex={-1}>Din bevakning, dina uppgifter</h2>
        {shared && <p>Med det gemensamma lösenordet kan du prova utan e-post. En separat nödvändig säker gästkaka gäller i högst 12 timmar. Högst 200 gästsessioner och 40 konton ryms i piloten. Gästutkast och verifieringsavsikter gäller i 30 minuter. Först när du sparar frågar vi efter e-post. Ny verifiering ersätter ägarprövning; du granskar och bekräftar sökningen separat. Tidigare avslagna eller återkallade konton återaktiveras inte automatiskt.</p>}
        <div className="privacy-columns"><div><h3>Det här sparas</h3><p>{shared ? "Gästens slumpmässiga sessionsidentifierare och tolkade utkast. När du vill spara lagras e-postadress, verifieringsavsikt, sökfilter, godkänd profil, samtyckesversion och vilka objekt som skickats. Befintliga medlemsbeslut bevaras; ingen ny ansökningstext behövs."
          : "Din e-postadress, ansökan, medlemsbeslut, sökfilter, godkänd preferensprofil, samtyckesversion och vilka objekt som skickats."} Uppgifterna används för kontot och din valda bevakning. Inga reklamspårare eller analyskakor används. En nödvändig säker sessionskaka håller dig inloggad i högst 12 timmar.</p><p>Overifierade konton raderas efter 48 timmar. Väntande, avslagna och återkallade medlemskap sparas högst 30 dagar, godkända högst 180 dagar. Mejllänkar gäller i 30 minuter.</p></div>
          <div><h3>Avsluta och radera</h3><p>Logga in för att ändra dina filter eller pausa bostadsmejlen. Varje mejl innehåller även en länk som avslutar och raderar hela medlemskapet. Uppgifter om ägarens beslut sparas pseudonymiserat i högst 180 dagar för spårbarhet.</p><p>Cloudflare lagrar uppgifterna och Resend hanterar mejlen. Tillfälliga, pseudonymiserade identifierare begränsar missbruk. Driftmetadata sparas högst 35 dagar, utom aggregerade kvoter och osäkra leveranser som behöver utredas.</p></div></div>
        <p>Personuppgiftsansvarig: <strong>Marcus Bodin (privatperson)</strong>. Kontakt: <a href="mailto:kontakt@kommandekollen.se">kontakt@kommandekollen.se</a>. Rättslig grund: samtycke. Du kan återkalla samtycket när som helst och kontakta IMY med klagomål.</p>
        <p className="small muted">D1-databasen har EU-jurisdiktion. Resend lagrar kontouppgifter, mejlmetadata, loggar och API-poster i USA; sändningsregionen ändrar inte detta. Leverantörernas säkerhetskopior och mejlloggar kan ha separata lagringstider. Radering här innebär inte omedelbar radering ur alla leverantörsbackuper.</p>
        <h3>Valfri AI-texthjälp</h3><p>Med ditt godkännande skickas din bostadstext och föregående preferensutkast till Cloudflare Workers AI (Llama 3.3). Vi skickar inte med konto, mejladress eller medlemsansökan. Skriv inte personliga eller känsliga uppgifter i bostadstexten. Cloudflare uppger att kundinnehåll inte används för modellträning utan uttryckligt samtycke; ingen särskild behandlingsregion utlovas här.</p>
        <p>Vi sparar inte din råa prompt eller en chatthistorik. Utkast med tolkade önskemål och aktuell fråga gäller i 30 minuter och rensas vid underhåll; radering eller återkallat medlemskap tar bort dem direkt. Slutförda AI-kvotposter är pseudonymiserade och rensas efter två dagar, osäkra anrop behålls tills de utretts. En godkänd profil sparas med medlemskapet. AI kan feltolka: granska innan du sparar, eller använd vanliga filter utan AI.</p>
      </section>
    </main>
    {dialog}
    {minimal && <footer className="site-footer compact-footer">
      <span>© {new Date().getFullYear()} kommandekollen.</span>
      <a href="?info=privacy" onClick={event => openInfo(event, "privacy")}>Integritet & radering</a>
      <a href="mailto:kontakt@kommandekollen.se">Kontakt</a>
      <a href={`${import.meta.env.BASE_URL}assets/ATTRIBUTION.md`}>Bakgrundsbild & ursprung</a>
    </footer>}
    <footer hidden={minimal} className="site-footer"><span>kommandekollen.</span><a href="#integritet">Integritet & radering</a>{canSearch && <a href="#kallor">Källstatus</a>}<span className="small">{shared ? "Delat lösenord · e-post när du sparar" : "Privat tjänst · medlemskap efter godkännande"}</span></footer>
  </div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
