import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { z } from "zod";
import { defaultFilters, municipalities, types, type Filters } from "../shared/model";
import { describeFilters, draftSchema, hardDescription, manualProfile, profileSchema, type Draft, type Profile } from "../shared/preferences";
import type { Authorize, SearchAccess } from "./SharedAccess";
import { privateFetch, PrivateAccessError } from "./access";

type Account = { profile: Profile; searchVersion: number; aiReady: boolean; alertsEnabled: boolean };
const receiptSchema = z.object({ message: z.string(), searchVersion: z.number().int().nonnegative(), profile: profileSchema, alertsEnabled: z.boolean() });
type Receipt = z.infer<typeof receiptSchema>;
export type PreferenceControls = { showManual: () => void; showSaved: () => void; restore: () => void; focusPrompt: () => void };
type Props = {
  apiBase: string; demo: boolean; member: Account | null; ready: boolean; refresh: () => void;
  renderFilters: (filters: Filters, change: (filters: Filters) => void) => ReactNode;
  onDemoPreview: (profile: Profile) => void;
  intro?: ReactNode;
  guest?: { aiReady: boolean };
  onInference?: () => void;
  minimal?: boolean; authorized?: boolean; authorize?: Authorize; controlsRef?: Ref<PreferenceControls>;
};
const intentSchema = z.object({ id: z.string().uuid(), verified: z.boolean(), enabled: z.boolean(), acceptUnverified: z.boolean() });
export function ProfileSummary({ profile }: { profile: Profile }) {
  return <div className="preference-summary">
    <div><h3>Måste ha</h3><ul>{hardDescription(profile).map((line, i) => <li key={i}>{line}</li>)}</ul></div>
    <div><h3>Gärna</h3>{profile.wishes.length ? <ul>{profile.wishes.map((wish, i) => <li key={i}>{describeFilters(wish).join(", ") || "Inget önskemål angivet"}</li>)}</ul> : <p className="muted">Inga extra önskemål.</p>}</div>
    {profile.unverified.length > 0 && <div className="unverified-summary"><h3>Behöver kontrolleras av dig</h3><p className="small">Våra uppgifter kan inte avgöra detta. Förslagen är inte bekräftade matchningar för dessa kriterier.</p>
      <ul>{profile.unverified.map((c, i) => <li key={i}>{c.must ? "Krav" : "Önskemål"}: {c.text}</li>)}</ul></div>}
  </div>;
}
const examples = ["Lägenhet i Solna eller Sundbyberg, minst 3 rum. Gärna 80 m².", "Villa i Nacka, högst 7 miljoner. Lugn gata är viktigt."];
export function PreferenceFlow({ apiBase, demo, member, ready, refresh, renderFilters, onDemoPreview, guest, onInference,
  minimal = false, authorized = true, authorize, controlsRef, intro }: Props) {
  const [text, setText] = useState(""), [draft, setDraft] = useState<Draft | null>(null);
  const [profile, setProfile] = useState<Profile>(member?.profile ?? manualProfile());
  const [editing, setEditing] = useState(false), [dirty, setDirty] = useState(false);
  const [aiConsent, setAiConsent] = useState(false), [accept, setAccept] = useState(false), [consent, setConsent] = useState(false);
  const [resolveQuestions, setResolveQuestions] = useState(false);
  const [activity, setActivity] = useState<"interpret" | "review" | "save" | "restore" | "pause" | null>(null);
  const busy = activity !== null;
  const [receipt, setReceipt] = useState<Receipt | null>(null), [availableDraft, setAvailableDraft] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const pendingSubmit = useRef(false), progressed = useRef(false);
  const [saveIntent, setSaveIntent] = useState<z.infer<typeof intentSchema> | null>(null);
  const [emailEntry, setEmailEntry] = useState(false), [email, setEmail] = useState("");
  const emailHeading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null), operation = useRef<string | null>(null), sequence = useRef(0);
  const summary = useRef<HTMLHeadingElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const feedback = useRef<HTMLDivElement>(null), savedHeading = useRef<HTMLHeadingElement>(null), manualHeading = useRef<HTMLElement>(null);
  const savedSummary = useRef<HTMLElement>(null);
  const edits = useRef(0), focusOutcome = useRef<"feedback" | "draft" | "receipt" | null>(null);
  const version = guest ? 0 : member?.searchVersion ?? 0;
  const aiEnabled = guest?.aiReady ?? member?.aiReady;
  const savedVersion = useRef<number | null>(member || !minimal ? version : null);
  const hadAccess = useRef(authorized);
  async function call(path: string, body?: unknown, signal?: AbortSignal, access?: SearchAccess): Promise<unknown> {
    if (!apiBase) throw new Error("API-adressen saknas. Inget har skickats.");
    let response: Response;
    try {
      response = await privateFetch(`${apiBase}/api/${(access?.guest ?? !!guest) ? "guest/" : ""}preferences/${path}`, { method: body ? "POST" : "GET",
        credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: signal ?? AbortSignal.timeout(25000) });
    } catch (error) {
      if (error instanceof PrivateAccessError) throw error;
      throw new Error("Kunde inte nå tjänsten eller begäran avbröts. Resultatet är inte bekräftat. Din text finns kvar; läs in utkastet innan du försöker igen.");
    }
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new Error(`Tjänsten gav ett oväntat svar (HTTP ${response.status}). Resultatet kunde inte bekräftas. Din text finns kvar; läs in utkastet eller använd filter.`); }
    if (!response.ok) {
      const parsed = z.object({ message: z.string() }).safeParse(result);
      throw new Error(parsed.success ? parsed.data.message : `Tjänsten kunde inte slutföra begäran (HTTP ${response.status}). Läs in utkastet eller använd filter.`);
    }
    return result;
  }
  useEffect(() => {
    if (demo || (minimal && (!authorized || progressed.current))) return;
    const abort = new AbortController();
    const initialEdits = edits.current, initialSequence = sequence.current;
    void call("draft", undefined, abort.signal).then(result => {
      const data = z.object({ draft: draftSchema.nullable(), saveIntent: intentSchema.nullable().optional() }).parse(result);
      const restored = data.draft;
      if (abort.signal.aborted || sequence.current !== initialSequence) return;
      setSaveIntent(data.saveIntent ?? null);
      if (minimal && restored && new URLSearchParams(location.search).get("review") !== "1") {
        setAvailableDraft(true);
      } else if (restored && edits.current !== initialEdits) {
        setAvailableDraft(true); setMessage("Ett tidigare utkast finns. Dina påbörjade ändringar har behållits. Du kan läsa in utkastet utan ett nytt AI-försök.");
      } else if (restored) { setDraft(restored); setProfile(restored.profile); setMessage("Ditt osparade utkast är återläst. Ingen bevakning ändrades."); }
    }).catch(error => { if (!abort.signal.aborted && sequence.current === initialSequence) setError(error instanceof z.ZodError ? "Det sparade utkastets svar kunde inte kontrolleras. Använd filter eller läs in igen." : error instanceof Error ? error.message : "Utkastet kunde inte läsas."); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [minimal, authorized]);
  useEffect(() => {
    if (!guest || !authorized) return;
    const check = () => {
      void call("draft").then(result => {
        const state = z.object({ saveIntent: intentSchema.nullable() }).parse(result);
        setSaveIntent(state.saveIntent); setConsent(false);
      }).catch(error => { setError(error instanceof Error ? error.message : "Kunde inte kontrollera verifieringen."); });
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [!!guest, authorized]);
  useEffect(() => {
    if (minimal && hadAccess.current && !authorized) {
      sequence.current++; controller.current?.abort(); setActivity(null);
      setDraft(null); setSaveIntent(null); setReceipt(null); setProfile(manualProfile());
      setSavedOpen(false); setEditing(false); setDirty(false); setAvailableDraft(false);
      setAiConsent(false); setConsent(false); setAccept(false); setEmailEntry(false); setEmail("");
      progressed.current = false; savedVersion.current = null;
      setMessage("Åtkomsten behöver öppnas igen. Din text finns kvar; dina sparade uppgifter visas först när åtkomsten har kontrollerats.");
      focusOutcome.current = "feedback";
    }
    hadAccess.current = authorized;
  }, [minimal, authorized]);
  useEffect(() => {
    if (savedVersion.current === null) {
      if (member) { savedVersion.current = version; if (!dirty && !draft) setProfile(member.profile); }
      return;
    }
    if (savedVersion.current !== version) {
      savedVersion.current = version;
      sequence.current++; controller.current?.abort(); setActivity(null); setConsent(false); setAccept(false);
      if (dirty || text.trim() || draft) {
        setDraft(null); setDirty(true); setEditing(true); setReceipt(null);
        setError("Din sparade sökning ändrades under arbetet. Dina lokala ändringar och din text finns kvar. Granska dem på nytt innan du sparar.");
        focusOutcome.current = "feedback";
      } else {
        setProfile(member?.profile ?? manualProfile());
        if (receipt && receipt.searchVersion !== version) {
          setReceipt(null); setMessage("Din sparade sökning har uppdaterats. Den aktuella versionen visas under Din sparade sökning.");
        }
      }
    }
  }, [version, member]);
  useEffect(() => { setConsent(false); }, [ready]);
  useEffect(() => {
    if (busy || !focusOutcome.current) return;
    const destination = focusOutcome.current;
    focusOutcome.current = null;
    const element = error ? feedback.current : destination === "receipt" ? savedHeading.current
      : destination === "draft" ? draft?.question ? input.current : summary.current : feedback.current;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [busy, error, message, draft, receipt]);
  function editText(value: string) { edits.current++; setText(value); setConsent(false); }
  const change = (next: Profile) => {
    edits.current++;
    setProfile(next); setDirty(true); setConsent(false); setAccept(false); setMessage("");
    if (demo && profileSchema.safeParse(next).success) onDemoPreview(next);
  };
  function receive(next: Draft) {
    progressed.current = true;
    setDraft(next); setProfile(next.profile); setDirty(false); setText(""); setConsent(false); setAccept(false); setEditing(false); setResolveQuestions(false);
    setReceipt(null); setAvailableDraft(false);
    setSaveIntent(null); setEmailEntry(false);
    setMessage("Ett utkast att granska. Din sparade sökning och mejl är oförändrade.");
    focusOutcome.current = "draft";
  }
  function demoDraft(): Draft {
    const p = manualProfile({ ...defaultFilters, type: "Lägenhet", minRooms: 3 });
    p.alternatives.municipalities = ["Solna", "Sundbyberg"];
    p.wishes = [{ ...defaultFilters, minSize: 80 }];
    if (draft) p.filters.maxPrice = 5000000;
    return { id: crypto.randomUUID(), revision: (draft?.revision ?? 0) + 1, baseVersion: 0, profile: p, turns: draft ? 2 : 1,
      conflicts: [], question: draft ? null : { text: "Är 5 miljoner ett fast pristak?", choices: ["Ja, högst 5 miljoner"], required: true }, expiresAt: Date.now() + 1800000 };
  }
  async function generate() {
    if (busy || pendingSubmit.current) return;
    pendingSubmit.current = true;
    setError(""); setMessage("");
    if (demo) { receive(demoDraft()); pendingSubmit.current = false; return; }
    let access: SearchAccess | undefined;
    if (minimal) {
      const result = draft && aiConsent && authorized ? { guest: !!guest, searchVersion: version } : await authorize!("ai");
      if (!result) { pendingSubmit.current = false; input.current?.focus(); return; }
      access = result; savedVersion.current = access.searchVersion; setAiConsent(true);
    }
    const id = crypto.randomUUID(), current = ++sequence.current, abort = new AbortController();
    controller.current = abort; operation.current = id; setActivity("interpret");
    const timer = setTimeout(() => abort.abort(), 25000);
    try {
      const result = await call("interpret", { id, expectedVersion: access?.searchVersion ?? version, previousId: draft?.id ?? null, text,
        aiConsent: minimal ? true : aiConsent }, abort.signal, access);
      if (current === sequence.current) receive(z.object({ draft: draftSchema }).parse(result).draft);
    } catch (error) {
      if (current === sequence.current) {
        focusOutcome.current = "feedback";
        setError(abort.signal.aborted ? "Begäran avbröts eller tog för lång tid. Inget aktiverades. Din text finns kvar; läs in utkastet innan du fortsätter."
          : error instanceof z.ZodError ? "Texthjälpens utkast kunde inte kontrolleras. Din text finns kvar och ingen sökning har aktiverats. Läs in utkastet eller använd filter."
          : error instanceof Error ? error.message : "Texthjälpen kunde inte nås. Använd filter eller försök igen.");
      }
    } finally {
      clearTimeout(timer);
      pendingSubmit.current = false;
      if (current === sequence.current) { setActivity(null); operation.current = null; }
      onInference?.();
    }
  }
  async function cancel() {
    const id = operation.current ?? draft?.id;
    sequence.current++; controller.current?.abort(); setActivity(null); setError(""); setConsent(false); setAccept(false); setAiConsent(false);
    if (demo) { focusOutcome.current = "feedback"; setDraft(null); setMessage("Demo avbruten; ingenting sparades."); return; }
    if (id) {
      try { await call("cancel", { id }); setDraft(null); setProfile(member?.profile ?? manualProfile()); setDirty(false); setEditing(false);
        focusOutcome.current = "feedback";
        setMessage("Utkastet är borttaget. Den sparade sökningen är oförändrad."); }
      catch (error) { focusOutcome.current = "feedback"; setError(error instanceof Error ? error.message : "Kunde inte ta bort utkastet. Läs in det igen."); }
    }
  }
  async function review(skipOptional = false) {
    if (busy || pendingSubmit.current) return;
    let access: SearchAccess | undefined;
    if (minimal && !authorized) {
      pendingSubmit.current = true;
      const result = await authorize!("manual");
      pendingSubmit.current = false;
      if (!result) return;
      access = result; savedVersion.current = access.searchVersion;
    }
    const current = ++sequence.current;
    setActivity("review"); setError(""); setMessage(""); setConsent(false); setAccept(false);
    try {
      const checked = profileSchema.parse(profile);
      const id = crypto.randomUUID();
      if (demo) receive({ id, revision: (draft?.revision ?? 0) + 1, baseVersion: 0, profile: checked, turns: 0, expiresAt: Date.now() + 1800000, question: null, conflicts: [] });
      else {
        const result = await call("draft", { id, expectedVersion: access?.searchVersion ?? version, profile: checked, previousId: draft?.id ?? null, resolveQuestions: resolveQuestions || skipOptional }, undefined, access);
        if (current === sequence.current) receive(z.object({ draft: draftSchema }).parse(result).draft);
      }
    } catch (error) { if (current === sequence.current) { focusOutcome.current = "feedback"; setError(error instanceof z.ZodError ? "Kontrollera intervall och alternativ. Utkastet kunde inte bekräftas; dina ändringar finns kvar." : error instanceof Error ? error.message : "Kunde inte granska ändringarna."); } }
    finally { if (current === sequence.current) setActivity(null); if (access) refresh(); }
  }
  async function restoreDraft() {
    if (busy) return;
    const current = ++sequence.current;
    setActivity("restore"); setError(""); setMessage(""); setConsent(false); setAccept(false);
    try {
      const result = z.object({ draft: draftSchema.nullable(), saveIntent: intentSchema.nullable().optional() }).parse(await call("draft"));
      if (current !== sequence.current) return;
      focusOutcome.current = "feedback"; setAvailableDraft(false);
      setSaveIntent(result.saveIntent ?? null);
      if (!result.draft) setMessage("Inget färdigt utkast kunde läsas in. Din text och dina ändringar finns kvar. Använd vanliga filter eller försök med AI senare; inget nytt AI-anrop har gjorts.");
      else {
        progressed.current = true;
        setDraft(result.draft);
        if (!dirty) setProfile(result.draft.profile);
        setMessage(dirty ? "Utkastet är återläst. Dina lokala filterändringar finns kvar och behöver granskas innan de sparas."
          : "Utkastet är återläst. Din text finns kvar. Granska sammanfattningen; inget nytt AI-anrop har gjorts.");
      }
    } catch (error) { if (current === sequence.current) { focusOutcome.current = "feedback"; setError(error instanceof z.ZodError ? "Utkastets svar kunde inte kontrolleras. Din text finns kvar; använd filter." : error instanceof Error ? error.message : "Utkastet kunde inte läsas in."); } }
    finally { if (current === sequence.current) setActivity(null); }
  }
  async function save() {
    if (busy || !draft || dirty || text.trim()) return;
    if (demo) { focusOutcome.current = "feedback"; setMessage("Demo: ingen sökning har sparats, ingen prenumeration har skapats och inget mejl har skickats."); onDemoPreview(profile); return; }
    if (guest && !saveIntent?.verified) {
      setEmailEntry(true); requestAnimationFrame(() => { emailHeading.current?.focus(); emailHeading.current?.scrollIntoView({ block: "center" }); }); return;
    }
    const current = ++sequence.current;
    setActivity("save"); setError(""); setMessage("");
    try {
      const result = receiptSchema.parse(await call("confirm", {
        id: draft.id, revision: draft.revision, expectedVersion: version, enabled: ready, acceptUnverified: accept, consent,
        ...(guest ? { challengeId: saveIntent!.id } : {}),
      }));
      if (current !== sequence.current) return;
      setReceipt(result); focusOutcome.current = "receipt";
      setMessage(result.message); setDraft(null); setText(""); setDirty(false); refresh();
    } catch (error) { if (current === sequence.current) { focusOutcome.current = "feedback"; setError(error instanceof z.ZodError ? "Sparandet kunde inte bekräftas trots ett svar från tjänsten. Kontrollera din sparade sökning innan du försöker igen." : error instanceof Error ? error.message : "Sparandet kunde inte bekräftas. Läs in din sparade sökning innan nytt försök."); } }
    finally { if (current === sequence.current) setActivity(null); setConsent(false); }
  }
  async function sendVerification() {
    if (busy || !draft || dirty || text.trim() || !consent) return;
    setActivity("save"); setError(""); setMessage(""); focusOutcome.current = "feedback";
    try {
      const result = z.object({ message: z.string() }).parse(await call("save", { id: draft.id, revision: draft.revision,
        expectedVersion: 0, enabled: ready, acceptUnverified: accept, consent, email, website: "" }));
      setMessage(result.message); setEmailEntry(false); setEmail(""); refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Mejlförfrågan kunde inte bekräftas."); }
    finally { setActivity(null); setConsent(false); }
  }
  function showManual() {
    setEditing(true);
    requestAnimationFrame(() => { manualHeading.current?.focus(); manualHeading.current?.scrollIntoView({ block: "center", behavior: "instant" }); });
  }
  useImperativeHandle(controlsRef, () => ({
    showManual,
    showSaved: () => { setSavedOpen(true); requestAnimationFrame(() => savedSummary.current?.focus()); },
    restore: () => { void restoreDraft(); },
    focusPrompt: () => { setSavedOpen(false); if (!dirty) setEditing(false); input.current?.focus(); },
  }));
  const valid = profileSchema.safeParse(profile).success;
  const blocking = !!draft?.question?.required || !!draft?.conflicts.length;
  return <section className={`preference-flow ${minimal ? "minimal-flow" : "surface"}`} id="bevakning" aria-label="Personlig sökning">
    {intro}
    <form className={minimal ? "prompt-form" : undefined} onSubmit={event => { event.preventDefault(); void generate(); }}>
      <div className={minimal ? "prompt-shell" : undefined}>
      <label htmlFor="housing-prompt">{draft?.question && !dirty ? draft.question.text : draft ? "Vill du rätta eller lägga till något?" : "Beskriv ditt nästa hem"}</label>
      <textarea id="housing-prompt" ref={input} value={text} onChange={event => editText(event.target.value)} maxLength={1600} rows={3}
        placeholder={minimal ? "Till exempel: en trea i Solna, högst 4 miljoner. Gärna balkong." : "Var vill du bo, vad måste finnas och vad vore fint?"} disabled={busy} aria-describedby={minimal ? "prompt-helper" : "prompt-privacy"} />
      {minimal && <div className="prompt-tools"><p id="prompt-helper" className="small muted">{authorized ? "AI-hjälpen skapar ett förslag. E-post först när du sparar." : "Få ett sökförslag med AI. Lösenord krävs. E-post först när du sparar."}</p>
        <button className="primary" disabled={busy || dirty || text.trim().length < 3}>
          {activity === "interpret" ? "Skapar sökförslag…" : draft ? "Uppdatera sökförslaget" : "Hitta bostad"}</button></div>}
      </div>
      {!minimal && <p className="small muted" id="prompt-privacy">Skriv inga namn, kontaktuppgifter eller känsliga uppgifter. {demo ? "Detta är ett fast, illustrativt exempel – inte AI. Din text tolkas inte." : "Din bostadstext och föregående utkast skickas till Cloudflare. Vi lägger inte till konto eller mejladress."}</p>}
      {!minimal && !draft && <><div className="example-chips">{examples.map((example, i) => <button type="button" key={example} disabled={busy}
        onClick={() => { editText(example); input.current?.focus(); }}>Använd exempel: {i === 0 ? "lägenhet" : "villa"}</button>)}</div><p className="small muted">Exemplen fyller i texten men skickas inte.</p></>}
      {draft?.question && !dirty && <div className="example-chips">{draft.question.choices.map(choice => <button type="button" key={choice} disabled={busy} onClick={() => { editText(choice); input.current?.focus(); }}>{choice}</button>)}</div>}
      {!minimal && !demo && <label className="check"><input type="checkbox" checked={aiConsent} onChange={event => setAiConsent(event.target.checked)} /><span>Jag vill använda AI-texthjälpen hos Cloudflare.</span></label>}
      {!minimal && !demo && !aiEnabled && <p className="notice">AI-texthjälpen är inte aktiverad. Du kan skapa samma sparade sökning med vanliga filter nedan.</p>}
      <div className="flow-actions">{!minimal && <button className="primary" disabled={busy || dirty || (!demo && (!aiEnabled || !aiConsent || text.trim().length < 3))}>
        {activity === "interpret" ? "Skapar sökförslag…" : demo ? draft ? "Visa exemplets svar" : "Visa exempelutkast" : draft ? "Uppdatera sökförslaget" : "Hitta bostad"}</button>}
        {(activity === "interpret" || (draft && !busy)) && <button type="button" onClick={() => void cancel()}>{activity === "interpret" ? "Avbryt" : "Börja om"}</button>}
        {draft?.question && !draft.question.required && !dirty && <button type="button" disabled={busy} onClick={() => void review(true)}>Hoppa över frågan</button>}</div>
      {(busy || error || message) && <div ref={feedback} tabIndex={-1} className={`flow-feedback ${error ? "error" : "notice"}`} role={error ? "alert" : "status"} aria-atomic="true">
        <p>{error || (activity ? { interpret: "Tolkar din text. Ingen sökning eller bevakning sparas i det här steget.",
          review: "Förbereder sammanfattningen för din granskning. Sökningen är inte sparad ännu.",
          save: guest && !saveIntent?.verified ? "Begär verifieringsmejl. Sökningen är inte sparad ännu." : "Sparar den godkända sökningen. Vänta på bekräftelsen.",
          restore: "Läser in utkastet utan ett nytt AI-anrop.", pause: "Pausar bostadsmejlen. Vänta på bekräftelsen." }[activity] : message)}</p>
        {!demo && !busy && (error || availableDraft) && <div className="flow-actions">
          <button type="button" onClick={() => void restoreDraft()}>Läs in utkast</button>
          <button type="button" onClick={showManual}>Använd vanliga filter</button>
          <button type="button" onClick={() => { setSavedOpen(true); refresh(); }}>Kontrollera sparad sökning</button>
        </div>}
      </div>}
      {!minimal && !demo && <p className="small muted">Built with Llama · <a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE" target="_blank" rel="noopener noreferrer">Modellvillkor</a>. Högst sex försök per medlem/IP och sex totalt i piloten per dygn (UTC). Granska alltid tolkningen.</p>}
    </form>
    {receipt && <section className="save-receipt">
      <h2 ref={savedHeading} tabIndex={-1}>{receipt.alertsEnabled ? "Din sökning är sparad och bevakningen startad" : "Din sökning är sparad och pausad"}</h2>
      <p>{receipt.alertsEnabled ? "Bara nya objekt kan skickas i morgonbevakningen." : "Inga bostadsmejl har aktiverats."} Bekräftad version {receipt.searchVersion}.</p>
      <ProfileSummary profile={receipt.profile} />
    </section>}
    {draft && <div className="draft-review"><h2 ref={summary} tabIndex={-1}>{dirty ? "Ändringar som inte granskats" : "Stämmer det här?"}</h2>
      {draft.conflicts.length > 0 && <div role="alert" className="notice"><strong>Det här behöver lösas</strong><ul>{draft.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      <ProfileSummary profile={profile} />
      {guest && saveIntent?.verified && <p className="notice" role="status">E-postadressen är verifierad. Granska den här sammanfattningen och godkänn sparandet igen. Den sparade sökningen har inte ändrats.</p>}
      {text.trim() && <p className="notice">Din nya text är inte tolkad än. Tolka den eller töm textfältet innan du godkänner sammanfattningen.</p>}
      <p className="small">Resultaten uppdateras från tillgängliga källor. Morgonmejl gäller bara nya objekt, inte varje ändring. Högst 20 per mejl. En sparad sökning per medlem.</p>
      {!ready && !demo && <p className="notice">Bostadsmejlen är pausade. Du kan spara sökningen pausad – inga bostadsmejl startas.</p>}
      {profile.unverified.some(c => c.must) && <label className="check"><input type="checkbox" checked={accept} onChange={event => setAccept(event.target.checked)} disabled={dirty || busy} />
        <span>Jag accepterar att själv kontrollera kraven ovan. De används inte som bekräftade matchningskrav.</span></label>}
      <label className="check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={dirty || blocking || busy} />
        <span>{ready ? "Jag godkänner den här sökningen och vill starta daglig mejlbevakning." : "Jag godkänner den här sökningen och vill spara den pausad."}</span></label>
      <button className="primary" disabled={busy || dirty || !!text.trim() || blocking || !valid || !consent || (profile.unverified.some(c => c.must) && !accept)} onClick={() => void save()}>
        {activity === "save" ? guest && !saveIntent?.verified ? "Begär verifieringslänk…" : "Sparar sökningen…" : demo ? "Förhandsvisa sparande" : guest && saveIntent?.verified
          ? ready ? "Bekräfta och starta daglig bevakning" : "Bekräfta och spara pausad sökning"
          : guest ? "Fortsätt till e-post" : ready ? "Spara och starta daglig bevakning" : "Spara pausad sökning"}</button>
      {guest && emailEntry && <form onSubmit={event => { event.preventDefault(); void sendVerification(); }}>
        <h3 ref={emailHeading} tabIndex={-1}>Verifiera e-post för att spara</h3>
        <p>Öppna mejlets länk i samma webbläsare, med lösenordsåtkomsten kvar. Du får sedan granska och bekräfta sparandet igen. Ingen ansökan eller ägarprövning behövs. Högst 40 konton i piloten.</p>
        <label>E-postadress<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
        <button className="primary" disabled={busy || !consent || dirty || !!text.trim()}>Begär verifieringslänk</button>
      </form>}
    </div>}
    <details hidden={minimal && !editing && !draft && !error} className="manual-search" open={editing} onToggle={event => setEditing(event.currentTarget.open)}>
      <summary ref={manualHeading}>{draft ? "Ändra själv med filter" : "Använd vanliga filter"}</summary>
      <fieldset className="manual-controls" disabled={busy}>
      <p className="small muted">Manuella ändringar behöver granskas och godkännas innan de ersätter din sparade sökning. Tomma gränser betyder ingen gräns, inte noll.</p>
      {renderFilters(profile.filters, filters => change({ ...profile, filters }))}
      {(["alternatives", "excluded"] as const).map(group => <details className="scope-editor" key={group}><summary>{group === "alternatives" ? "Alternativa områden och typer" : "Uteslut områden och typer"}</summary>
        <fieldset><legend>Kommuner</legend><div className="scope-options">{municipalities.map(value => <label className="check" key={value}><input type="checkbox" checked={profile[group].municipalities.includes(value)}
          onChange={event => change({ ...profile, [group]: { ...profile[group], municipalities: event.target.checked ? [...profile[group].municipalities, value] : profile[group].municipalities.filter(v => v !== value) } })} />{value}</label>)}</div></fieldset>
        <fieldset><legend>Bostadstyper</legend><div className="scope-options">{types.map(value => <label className="check" key={value}><input type="checkbox" checked={profile[group].types.includes(value)}
          onChange={event => change({ ...profile, [group]: { ...profile[group], types: event.target.checked ? [...profile[group].types, value] : profile[group].types.filter(v => v !== value) } })} />{value}</label>)}</div></fieldset>
        <label>Områden eller gator, ett per rad<textarea rows={2} value={profile[group].areas.join("\n")} onChange={event => change({ ...profile, [group]: { ...profile[group], areas: event.target.value.split("\n") } })} /></label>
        <p className="small">Högst fem per sort. Kommunalternativ kräver att kommunfiltret ovan står på hela länet; samma princip gäller område och typ. Områden är textsökningar, inte ritade gränser.</p>
      </details>)}
      <details><summary>Önskemål och sådant du kontrollerar själv</summary>
        {profile.wishes.map((wish, i) => <details key={i}><summary>Önskemål {i + 1}: {describeFilters(wish).join(", ")}</summary>
          {renderFilters(wish, filters => change({ ...profile, wishes: profile.wishes.map((w, j) => j === i ? filters : w) }))}
          <button type="button" onClick={() => change({ ...profile, wishes: profile.wishes.filter((_, j) => j !== i) })}>Ta bort önskemål {i + 1}</button>
        </details>)}
        {profile.wishes.length < 4 && <button onClick={() => change({ ...profile, wishes: [...profile.wishes, { ...defaultFilters }] })}>Lägg till faktabaserat önskemål</button>}
        {profile.unverified.map((criterion, i) => <div className="criterion-editor" key={i}>
          <label>Att kontrollera {i + 1}<input value={criterion.text} maxLength={160} onChange={event => change({ ...profile, unverified: profile.unverified.map((c, j) => i === j ? { ...c, text: event.target.value } : c) })} /></label>
          <label className="check"><input type="checkbox" checked={criterion.must} onChange={event => change({ ...profile, unverified: profile.unverified.map((c, j) => i === j ? { ...c, must: event.target.checked } : c) })} />Detta är ett krav, inte bara ett önskemål</label>
          <button onClick={() => change({ ...profile, unverified: profile.unverified.filter((_, j) => i !== j) })}>Ta bort kontrollpunkt {i + 1}</button>
        </div>)}
        {profile.unverified.length < 6 && <button onClick={() => change({ ...profile, unverified: [...profile.unverified, { text: "", must: false }] })}>Lägg till manuell kontrollpunkt</button>}
      </details>
      {blocking && <label className="check"><input type="checkbox" checked={resolveQuestions} onChange={event => { setResolveQuestions(event.target.checked); setDirty(true); setConsent(false); }} />
        <span>Jag har löst frågan eller motsägelsen i ändringarna ovan. Granska dessa värden i stället.</span></label>}
      {!valid && <p role="alert" className="error">Kontrollera intervall, tomma kontrollpunkter och motstridiga eller för många alternativ. Inget kan sparas ännu.</p>}
      <button disabled={busy || !valid} onClick={() => void review()}>{activity === "review" ? "Granskar ändringarna…" : "Granska ändringarna"}</button>
      </fieldset>
    </details>
    {!demo && member && <details hidden={minimal && !savedOpen} className="saved-profile" open={savedOpen} onToggle={event => setSavedOpen(event.currentTarget.open)}><summary ref={savedSummary}>Din sparade sökning · {member.alertsEnabled && ready ? "bevakning startad" : "pausad"}</summary>
      <ProfileSummary profile={member.profile} /><p className="small">Version {version}. Den här sökningen används för resultaten och eventuella mejl, inte ditt osparade utkast.</p>
      <button disabled={busy} onClick={() => { edits.current++; setProfile(member.profile); setEditing(true); setDirty(true); setConsent(false); setAccept(false); }}>Ändra sparad sökning</button>
      {member.alertsEnabled && <button disabled={busy} onClick={async () => {
        setActivity("pause"); setError(""); setMessage("");
        focusOutcome.current = "feedback";
        try {
          const response = await fetch(`${apiBase}/api/search`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters: member.profile.filters, enabled: false, consent: true, expectedVersion: version }), signal: AbortSignal.timeout(20000) });
          const result = z.object({ message: z.string() }).parse(await response.json());
          if (!response.ok) throw new Error(result.message);
          setMessage(result.message); refresh();
        } catch (error) { setError(error instanceof Error ? error.message : "Pausen kunde inte bekräftas."); }
        finally { setActivity(null); }
      }}>Pausa bostadsmejlen</button>}
    </details>}
  </section>;
}
