import { StrictMode, useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { defaultFilters, filterSchema, listingSchema, matches, municipalities, sourceIds, types, type Filters, type Listing } from "../shared/model";
import { sources, type Source } from "../shared/sources";
import { demoListings } from "./demo";
import { NumericFilter } from "./NumericFilter";
import "./style.css";

const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const demo = import.meta.env.VITE_DEMO === "true" || new URLSearchParams(location.search).get("demo") === "1";
const action = /^(confirm|unsubscribe)=(.+)$/.exec(location.hash.slice(1));
if (action) history.replaceState(null, "", location.pathname + location.search);
type Run = { last_success: string | null; last_attempt: string; status: string; error_code: string | null; item_count: number };
type SourceState = Source & { authorized?: boolean; run?: Run | null };
type Catalog = { listings: Listing[]; sources: SourceState[]; serviceReady: boolean; privacyContact: string | null };
const catalogSchema = z.object({
  listings: z.array(listingSchema.extend({ id: z.string(), firstSeen: z.string().datetime(), lastSeen: z.string().datetime() })).max(200),
  sources: z.array(z.object({
    id: z.enum(sourceIds), name: z.string(), status: z.enum(["blocked", "unverified", "awaiting-feed"]), reason: z.string(),
    robots: z.string().nullable(), terms: z.string().nullable(), checked: z.string().nullable(),
    authorized: z.boolean(), run: z.object({
      last_success: z.string().nullable(), last_attempt: z.string(), status: z.string(), error_code: z.string().nullable(), item_count: z.number(),
    }).nullable(),
  })),
  serviceReady: z.boolean(), privacyContact: z.string().nullable(),
});
const number = (value: number) => new Intl.NumberFormat("sv-SE").format(value);
const date = (value: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(new Date(value));
const stale = (value: string) => Date.now() - Date.parse(value) > 48 * 3600_000;

function Inspiration() {
  const base = `${import.meta.env.BASE_URL}assets/home-light-`;
  return <figure className="inspiration">
    <img src={`${base}960.webp`} srcSet={`${base}480.webp 480w, ${base}960.webp 960w`}
      sizes="(max-width: 700px) calc(100vw - 32px), (max-width: 1100px) 45vw, 560px"
      width={960} height={640} alt="" decoding="async" fetchPriority="high" />
    <figcaption>Inspirationsbild · inte ett bostadsobjekt</figcaption>
  </figure>;
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
    response = await fetch(`${apiBase}${path}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error("Kunde inte nå tjänsten. Kontrollera anslutningen och försök igen. Begäran kan ha nått servern."); }
  let result: { message?: string };
  try { result = await response.json(); }
  catch { throw new Error("Tjänsten svarade oväntat. Försök igen senare."); }
  if (!response.ok) throw new Error(result.message || "Begäran misslyckades. Försök igen senare.");
  if (typeof result.message !== "string") throw new Error("Bekräftelse saknas i serverns svar.");
  return result.message;
}
function ActionPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = action?.[1] === "confirm";
  async function submit() {
    setBusy(true); setError("");
    try { setMessage(await post(`/api/${confirm ? "confirm" : "unsubscribe"}`, { token: action![2] })); }
    catch (error) { setError(error instanceof Error ? error.message : "Ett fel uppstod."); }
    finally { setBusy(false); }
  }
  return <section className="action-page surface">
    <Icon name={confirm ? "bell" : "home"} />
    <h1>{confirm ? "Bekräfta och logga in" : "Avsluta ditt medlemskap"}</h1>
    <p>{confirm ? "Bekräfta din e-post för att fortsätta. En ny ansökan behöver därefter godkännas av ägaren; verifiering ensam ger ingen tillgång till bostäder eller bevakningar." : "Din e-postadress, ditt medlemskap och dina sökpreferenser raderas ur den aktiva databasen när du avslutar."} Ingenting ändras bara av att öppna länken.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {message ? <p role="status" className="notice">{message}</p> : <button className="primary" disabled={busy || demo || !apiBase} onClick={submit}>{busy ? "Arbetar…" : confirm ? "Fortsätt" : "Avsluta och radera"}</button>}
    {(demo || !apiBase) && <p className="notice">Länken kan inte behandlas i demo eller utan konfigurerat API. Öppna mejlets länk på den riktiga tjänsten.</p>}
    <a href={location.pathname + location.search}>Till medlemskapet</a>
  </section>;
}
const memberSchema = z.object({
  id: z.string(), email: z.string(), state: z.enum(["unverified", "pending", "approved", "rejected", "revoked"]),
  owner: z.boolean(), filters: filterSchema, alertsEnabled: z.boolean(),
});
type Member = z.infer<typeof memberSchema>;
type Application = { id: string; email: string; application: string; state: string };
function OwnerPanel({ ownerId }: { ownerId: string }) {
  const [members, setMembers] = useState<Application[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch(`${apiBase}/api/admin/members`, { credentials: "include", signal: AbortSignal.timeout(20_000) });
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
  return <section className="owner-panel surface" id="medlemmar"><h2>Hantera medlemskap</h2><p className="small muted">Endast verifierade ansökningar kan godkännas. Återkallelse stoppar åtkomst och väntande mejl.</p>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
    {members.map(member => <div className="member-row" key={member.id}><div><strong>{member.email}</strong><p className="small">{member.application}</p><span className="small muted">{{ unverified: "Ej verifierad", pending: "Väntar på beslut", approved: "Godkänd", rejected: "Avslagen", revoked: "Återkallad" }[member.state]}</span></div>
      <div className="member-actions">{member.state === "pending" && <><button className="primary" disabled={busy} onClick={() => review(member.id, "approve")}>Godkänn</button><button disabled={busy} onClick={() => review(member.id, "reject")}>Avslå</button></>}
        {member.state === "approved" && member.id !== ownerId && <button disabled={busy} onClick={() => review(member.id, "revoke")}>Återkalla</button>}</div></div>)}
  </section>;
}
function Membership({ member, ready, accepting, refresh }: { member: Member | null; ready: boolean; accepting: boolean; refresh: () => void }) {
  const [login, setLogin] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false);
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
      <summary>{member.state === "approved" ? "Ditt medlemskap" : "Din ansökan väntar på godkännande"}<span>{member.email}</span></summary>
      <div className="account-content">
      {member.state !== "approved" && <p className="notice">Din e-postadress är verifierad. Ägaren behöver nu godkänna ansökan. Du har ännu ingen tillgång till bostäder, källresultat eller bevakning.</p>}
      <div className="member-actions"><button disabled={busy} onClick={() => accountAction("/api/logout")}>Logga ut</button><button className="text-button" onClick={() => setDeleteConfirm(value => !value)}>Radera medlemskapet</button></div>
      {deleteConfirm && <div className="notice"><p>Detta raderar ansökan, medlemskapet och bevakningen. Du behöver ansöka på nytt om du vill återvända.</p><button disabled={busy} onClick={() => accountAction("/api/delete-account")}>Bekräfta radering</button></div>}
      </div></details>
    </> : <div className="membership-grid"><div className="membership-welcome"><Inspiration /><div className="welcome-copy"><h1>En privat väg till nästa hem.</h1><p>Kommande bostäder i Stockholms län, för godkända medlemmar.</p></div></div>
      <form onSubmit={submit}><h2>{login ? "Logga in med mejllänk" : "Ansök om medlemskap"}</h2>
        <p className="small muted">{login ? "Få en säker länk till din e-post. Inget lösenord behövs." : "Ansök, verifiera din e-post och invänta ägarens godkännande."}</p>
        {!ready && <p className="notice">Tjänsten är inte konfigurerad för ansökningar eller mejl ännu.</p>}
        {!accepting && ready && !login && <p className="notice">Piloten är full. Nya ansökningar är tillfälligt pausade.</p>}
        <label>E-postadress<input type="email" name="email" required autoComplete="email" maxLength={254} placeholder="namn@example.com" /></label>
        {!login && <><label>Berätta kort om din bostadssökning<textarea name="application" required minLength={10} maxLength={500} rows={3} /></label>
          <label className="check"><input type="checkbox" name="consent" required /><span>Jag godkänner att min ansökan behandlas enligt <a href="#integritet">integritetsinformationen</a>.</span></label></>}
        <div className="honeypot" aria-hidden="true"><label>Lämna tomt<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <button className="primary" disabled={busy || !ready || (!login && !accepting)}>{busy ? "Skickar begäran…" : login ? "Begär inloggningslänk" : "Skicka medlemsansökan"}</button>
        <button type="button" className="text-button" onClick={() => { setLogin(value => !value); setMessage(""); setError(""); }}>{login ? "Ny här? Ansök om medlemskap" : "Har du redan ansökt? Logga in"}</button>
        <details className="membership-info"><summary>Så fungerar medlemskapet</summary><p className="small muted">Högst 40 medlemskap inklusive väntande ansökningar. E-postverifiering är inte ett medlemsbeslut. Bostäder och bevakningar visas bara för godkända medlemmar. Vi samlar inte in objekt från källor där användningen är förbjuden eller oklar.</p></details>
        <a className="demo-link" href="?demo=1">Prova sökningen med fiktiva exempel<Icon name="arrow" /></a>
      </form></div>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
  </section>;
}
function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (value: Filters) => void }) {
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
    <div className="section-heading"><h2>Din sökning</h2><button className="text-button" onClick={() => onChange({ ...defaultFilters })}>Rensa</button></div>
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
        <label className="check"><input type="checkbox" checked={filters.includeUnknown} onChange={event => update("includeUnknown", event.target.checked)} /><span>Ta även med objekt där filtrerade uppgifter saknas</span></label>
        <p className="small muted">Saknade uppgifter räknas aldrig som noll. Om en min- och maxgräns korsas följer den andra gränsen med. Exakta värden kan skrivas in utan avrundning.</p>
      </div>
    </details>
    {!filterSchema.safeParse(filters).success && <p role="alert" className="error">Kontrollera intervallen. Minsta värdet får inte vara större än det högsta.</p>}
  </aside>;
}
function Property({ listing }: { listing: Listing }) {
  return <article className="property surface">
    <div className="property-top"><span className="badge">{demo ? "Demo · kommande" : "Kommande"}</span><span className="small muted">{listing.type}</span></div>
    <div className="property-location">{listing.area} · {listing.municipality}</div>
    <h3>{listing.address}</h3>
    <p className="price">{listing.price === null ? "Pris ej angivet" : `${number(listing.price)} kr`}</p>
    <dl className="facts">
      <div><dt>Boarea</dt><dd>{listing.size === null ? "Ej angivet" : `${number(listing.size)} m²`}</dd></div>
      <div><dt>Rum</dt><dd>{listing.rooms === null ? "Ej angivet" : number(listing.rooms)}</dd></div>
      <div><dt>Avgift/mån</dt><dd>{listing.fee === null ? "Ej angivet" : `${number(listing.fee)} kr`}</dd></div>
    </dl>
    <div className="property-bottom">
      {demo ? <span className="small muted">Fiktivt objekt · ingen annons</span> : <><div className="small muted">{sources.find(source => source.id === listing.sourceId)?.name}<br />
        <span className={stale(listing.lastSeen) ? "stale" : ""}>{stale(listing.lastSeen) ? "Äldre uppgift: " : "Kontrollerad: "}{date(listing.lastSeen)}</span></div>
        <a href={listing.url} target="_blank" rel="noopener noreferrer">Visa objekt<Icon name="arrow" /></a></>}
    </div>
  </article>;
}
function Subscription({ filters, enabled, active, refresh }: { filters: Filters; enabled: boolean; active: boolean; refresh: () => void }) {
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (demo) { setMessage("Det här är bara en förhandsvisning. Ingen prenumeration har skapats, ingen e-postadress har sparats och inget mejl har skickats."); return; }
    setBusy(true);
    try {
      setMessage(await post("/api/search", { filters, enabled: true, consent: true })); refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Ett fel uppstod."); }
    finally { setBusy(false); }
  }
  return <section className="subscription surface" id="bevakning" aria-labelledby="subscription-title">
    <div className="subscription-intro"><div className="title-icon"><Icon name="bell" /><h2 id="subscription-title">Låt nästa hem hitta till dig</h2></div>
      <p>Bevaka den här sökningen som godkänd medlem. Nya matchningar köas varje morgon, kl. 07–10 svensk tid.</p>
      <p className="saved-search">{filters.municipality || "Hela Stockholms län"} · {filters.type || "Alla bostadstyper"}{filters.maxPrice !== null ? ` · högst ${number(filters.maxPrice)} kr` : ""}</p>
      <p className="small muted">Alla filter ovan sparas. Bara nya matchningar, högst 20 per mejl. Pausa när du vill. En sparad sökning per medlem.</p>
    </div>
    <form onSubmit={submit}>
      {demo && <p className="notice small"><strong>Demo.</strong> Formuläret visar flödet men skickar eller sparar ingenting.</p>}
      {!demo && !enabled && <p className="notice" role="status">Bevakning är inte tillgänglig ännu. Ingen prenumeration kan skapas.</p>}
      <p className="small">Status: {demo ? "endast demonstration" : active ? "bevakning aktiverad" : "bevakning pausad"}. Mejl skickas endast till medlemskapets verifierade adress.</p>
      <label className="check"><input name="consent" type="checkbox" required disabled={!demo && !enabled} /><span>Jag vill få bostadsbevakning via mejl och har läst <a href="#integritet">integritetsinformationen</a>.</span></label>
      <button className="primary" disabled={busy || (!demo && !enabled) || !filterSchema.safeParse(filters).success}>{busy ? "Sparar…" : demo ? "Förhandsvisa bevakning" : "Spara och aktivera bevakning"}<Icon name="arrow" /></button>
      {!demo && active && <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError(""); try { setMessage(await post("/api/search", { filters, enabled: false, consent: true })); refresh(); }
        catch (error) { setError(error instanceof Error ? error.message : "Kunde inte pausa."); } finally { setBusy(false); }
      }}>Pausa bostadsmejlen</button>}
      {error && <p className="error" role="alert">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
      <p className="small muted">Gratisgränser och driftfel kan fördröja mejl. Inget utskick om nya träffar saknas. Länken i varje mejl avslutar hela medlemskapet.</p>
    </form>
  </section>;
}
function Sources({ data }: { data: SourceState[] }) {
  return <section id="kallor" className="sources-section">
    <h2>Källor och täckning</h2><p className="muted">Vi visar bara objekt från tillåtna källor. En tillåtande robots.txt är inte en licens att återpublicera data. Ingen fullständig Stockholmstäckning utlovas.</p>
    <div className="source-list surface">{data.map(source => <div className="source-row" key={source.id}>
      <div><h3>{source.name}</h3><p className="small muted">{source.authorized ? "Licens konfigurerad av tjänstens ansvariga." : source.reason}</p>
        {source.run?.last_success && <p className="small">Senast lyckad import: {date(source.run.last_success)} · {source.run.item_count} objekt</p>}
        {source.run?.status === "failed" && <p className="error small">Senaste hämtningen misslyckades. Tidigare objekt behålls och märks som äldre när de passerat 48 timmar.</p>}
      </div><span className="source-status">{source.authorized ? source.run?.last_success ? stale(source.run.last_success) ? "Äldre data" : source.run.status === "failed" ? "Hämtningsfel" : "Importerad feed" : "Väntar på data" : source.status === "blocked" ? "Tillstånd krävs" : source.status === "awaiting-feed" ? "Ingen feed ansluten" : "Ej verifierad"}</span>
    </div>)}</div>
  </section>;
}
function App() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "light");
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters });
  const [catalog, setCatalog] = useState<Catalog>({ listings: demo ? demoListings : [], sources, serviceReady: false, privacyContact: null });
  const [loading, setLoading] = useState(!demo && !!apiBase);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState("newest");
  const [member, setMember] = useState<Member | null>(null);
  const [ready, setReady] = useState(false), [accepting, setAccepting] = useState(false);
  const [accountLoading, setAccountLoading] = useState(!demo && !!apiBase && !action);
  const [accountError, setAccountError] = useState("");
  const [accountReload, setAccountReload] = useState(0);
  const refresh = () => setAccountReload(value => value + 1);
  const canSearch = demo || member?.state === "approved";
  useEffect(() => {
    if (demo || !apiBase || action) return;
    let active = true;
    setAccountLoading(true); setAccountError("");
    Promise.all([
      fetch(`${apiBase}/api/status`, { credentials: "include", signal: AbortSignal.timeout(20_000) }),
      fetch(`${apiBase}/api/me`, { credentials: "include", signal: AbortSignal.timeout(20_000) }),
    ]).then(async ([statusResponse, memberResponse]) => {
      if (!statusResponse.ok) throw new Error("Kunde inte kontrollera tjänstens status.");
      const status = z.object({ serviceReady: z.boolean(), acceptingApplications: z.boolean(), privacyContact: z.string().nullable() }).parse(await statusResponse.json());
      if (!active) return;
      setReady(status.serviceReady); setAccepting(status.acceptingApplications);
      setCatalog(current => ({ ...current, privacyContact: status.privacyContact }));
      if (memberResponse.status === 401) {
        setMember(null); setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false })); return;
      }
      if (!memberResponse.ok) throw new Error("Kunde inte kontrollera medlemskapet. Logga in igen.");
      const account = memberSchema.parse(await memberResponse.json());
      if (active) { setMember(account); setFilters(account.filters); }
    }).catch(error => {
      if (active) {
        setMember(null); setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
        setAccountError(error instanceof Error ? error.message : "Medlemskontrollen misslyckades.");
      }
    }).finally(() => { if (active) setAccountLoading(false); });
    return () => { active = false; };
  }, [accountReload]);
  useEffect(() => {
    const check = () => { if (!demo && apiBase && !action) refresh(); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  useEffect(() => {
    if (demo || !apiBase || action || member?.state !== "approved") return;
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError("");
    const timeout = setTimeout(() => controller.abort(), 20_000);
    fetch(`${apiBase}/api/catalog`, { credentials: "include", signal: controller.signal }).then(async response => {
      if (response.status === 401 || response.status === 403) {
        setMember(null); setCatalog(current => ({ ...current, listings: [], sources, serviceReady: false }));
        throw new Error("Medlemskapet behöver kontrolleras. Logga in igen.");
      }
      if (!response.ok) throw new Error("Bostäderna kunde inte hämtas. Försök igen om en stund.");
      const parsed = catalogSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Tjänsten svarade med oväntade uppgifter. Inga nya objekt visas.");
      if (active) setCatalog(parsed.data);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Kunde inte hämta data."); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [reload, member]);
  const valid = filterSchema.safeParse(filters).success;
  const filtered = useMemo(() => valid ? catalog.listings.filter(listing => matches(listing, filters)).sort((a, b) => {
    if (sort === "price") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (sort === "size") return (b.size ?? -1) - (a.size ?? -1);
    return b.firstSeen.localeCompare(a.firstSeen);
  }) : [], [filters, catalog.listings, sort, valid]);
  const enabledSources = catalog.sources.filter(source => source.authorized).length;
  const changeTheme = () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; };
  return <>
    <a className="skip" href="#main">Hoppa till innehåll</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href={location.pathname}><span className="brand-mark"><Icon name="home" /></span>kommandekollen<span className="brand-dot">.</span></a>
      <nav aria-label="Huvudmeny"><a href="#main">{canSearch ? "Sök bostad" : "Medlemskap"}</a><a href={canSearch ? "#kallor" : "#integritet"}>{canSearch ? "Källstatus" : "Integritet"}</a>{member?.owner && <a href="#medlemmar">Medlemmar</a>}</nav>
      <button className="theme-button" aria-label={theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"} onClick={changeTheme}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
    </div></header>
    {demo && <div className="demo-bar"><strong>Demonstrationsläge</strong><span>Alla bostäder är påhittade. Inga mejl skickas.</span></div>}
    <main id="main" className="container">
      {action ? <ActionPage /> : <>
        {!demo && <>
          {accountLoading && <p role="status" className="notice">Kontrollerar medlemskap…</p>}
          {accountError && <div className="notice" role="alert"><p>{accountError}</p><button onClick={refresh}>Försök igen</button></div>}
          <Membership member={member} ready={ready} accepting={accepting} refresh={refresh} />
        </>}
        {canSearch && <>
        <section className="search-heading"><Inspiration /><div className="search-heading-copy"><h1>Hitta hem, innan det är till salu.</h1><p>Kommande bostäder i Stockholms län.</p>
          <a className="button secondary" href="#bevakning"><Icon name="bell" />Bevaka sökningen</a></div></section>
        <div className="coverage-strip"><span className="status-dot" aria-hidden="true" /><span>{demo ? "6 exempelbostäder · 0 anslutna livekällor" : `${enabledSources} tillåtna källor · begränsad täckning`}</span><a href="#kallor">Se källstatus<Icon name="arrow" /></a></div>
        {!demo && !apiBase && <section className="notice config-state" role="status"><h2>Tjänsten är inte ansluten ännu</h2><p>Livekällor och bevakning är inte tillgängliga. Du kan prova sökningen med tydligt märkta exempelbostäder.</p><a className="button secondary" href="?demo=1">Prova med exempel</a></section>}
        <div className="search-layout">
          <FilterPanel filters={filters} onChange={setFilters} />
          <section className="results" aria-label="Sökresultat">
            <div className="results-toolbar"><h2 aria-live="polite">{loading ? "Hämtar bostäder…" : `${filtered.length} ${demo ? "exempelbostäder" : "bostäder"}`}</h2>
              <label className="sort">Sortera<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Senast upptäckta</option><option value="price">Lägst pris</option><option value="size">Störst boarea</option></select></label></div>
            {error && <div role="alert" className="notice"><h3>Det gick inte att uppdatera</h3><p>{error}</p><p>Eventuella tidigare resultat är inte uppdaterade.</p><button className="secondary" onClick={() => setReload(value => value + 1)}>Försök igen</button></div>}
            {!demo && catalog.listings.some(listing => stale(listing.lastSeen)) && <p className="notice">Vissa uppgifter är äldre än 48 timmar. De skickas inte i bevakningsmejl. Kontrollera status hos källan.</p>}
            {loading ? <div aria-busy="true" aria-label="Läser in bostäder" className="property-grid">{[1, 2, 3, 4].map(i => <div className="skeleton surface" key={i}><div/><div/><div/></div>)}</div> :
              filtered.length ? <div className="property-grid">{filtered.map(listing => <Property listing={listing} key={listing.id} />)}</div> :
                <div className="empty surface"><Icon name="home" /><h3>{!valid ? "Kontrollera dina filter" : catalog.listings.length ? "Inga bostäder matchar just nu" : "Inga liveobjekt att visa ännu"}</h3>
                  <p>{!valid ? "Ange giltiga intervall i sökningen." : catalog.listings.length ? "Prova ett större område, justera priset eller inkludera objekt med saknade uppgifter." : "Vi inväntar tillåtna datakällor. Importstödet finns, men automatisk insamling från mäklarna är inte aktiv."}</p>
                  {catalog.listings.length > 0 && <button className="secondary" onClick={() => setFilters({ ...defaultFilters })}>Rensa alla filter</button>}</div>}
            <p className="results-note small muted">{demo ? "Exemplen visar hur sökningen fungerar, inte marknadsläget." : "Kommande-status och uppgifter kommer från källan och kan ändras. Objekt med okänt pris sorteras sist."}</p>
          </section>
        </div>
        <Subscription filters={filters} enabled={catalog.serviceReady && !error && !loading} active={member?.alertsEnabled || false} refresh={refresh} />
        <Sources data={catalog.sources} />
        {member?.owner && <OwnerPanel ownerId={member.id} />}
        </>}
      </>}
      <section id="integritet" className="privacy">
        <h2>Din bevakning, dina uppgifter</h2>
        <div className="privacy-columns"><div><h3>Det här sparas</h3><p>Din e-postadress, ansökan, medlemsbeslut, sökfilter, samtyckesversion och vilka objekt som skickats. Uppgifterna används för medlemskapet och din valda bevakning. Inga reklamspårare eller analyskakor används. En nödvändig säker sessionskaka håller dig inloggad i högst 12 timmar.</p><p>Overifierade ansökningar raderas efter 48 timmar. Väntande, avslagna och återkallade medlemskap sparas högst 30 dagar, godkända högst 180 dagar. Mejllänkar gäller i 30 minuter.</p></div>
          <div><h3>Avsluta och radera</h3><p>Logga in för att ändra dina filter eller pausa bostadsmejlen. Varje mejl innehåller även en länk som avslutar och raderar hela medlemskapet. Uppgifter om ägarens beslut sparas pseudonymiserat i högst 180 dagar för spårbarhet.</p><p>Cloudflare lagrar uppgifterna och Resend hanterar mejlen. Tillfälliga, pseudonymiserade identifierare begränsar missbruk. Driftmetadata sparas högst 35 dagar, utom aggregerade kvoter och osäkra leveranser som behöver utredas.</p></div></div>
        <p className="small muted">{catalog.privacyContact ? <>Personuppgiftskontakt: <a href={`mailto:${catalog.privacyContact}`}>{catalog.privacyContact}</a>. Rättslig grund: samtycke. Du kan återkalla samtycket när som helst och kontakta IMY med klagomål.</> : "Tjänsten är inte öppnad för registrering. Ansvarig och integritetskontakt måste anges före lansering."} Leverantörernas säkerhetskopior och mejlloggar kan omfattas av separata lagringstider; se tjänstens driftinformation före lansering.</p>
      </section>
    </main>
    <footer className="site-footer"><span>kommandekollen.</span><a href="#integritet">Integritet & radering</a><a href={`${import.meta.env.BASE_URL}assets/ATTRIBUTION.md`}>Bild & licens</a>{canSearch && <a href="#kallor">Källstatus</a>}<span className="small">Privat tjänst · medlemskap efter godkännande</span></footer>
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
