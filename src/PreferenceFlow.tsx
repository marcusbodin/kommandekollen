import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { defaultFilters, municipalities, types, type Filters } from "../shared/model";
import { describeFilters, draftSchema, hardDescription, manualProfile, profileSchema, type Draft, type Profile } from "../shared/preferences";

type Account = { profile: Profile; searchVersion: number; aiReady: boolean; alertsEnabled: boolean };
const receiptSchema = z.object({ message: z.string(), searchVersion: z.number().int().nonnegative(), profile: profileSchema, alertsEnabled: z.boolean() });
type Receipt = z.infer<typeof receiptSchema>;
type Props = {
  apiBase: string; demo: boolean; member: Account | null; ready: boolean; refresh: () => void;
  renderFilters: (filters: Filters, change: (filters: Filters) => void) => ReactNode;
  onDemoPreview: (profile: Profile) => void;
};
export function ProfileSummary({ profile }: { profile: Profile }) {
  return <div className="preference-summary">
    <div><h3>Måste ha</h3><ul>{hardDescription(profile).map((line, i) => <li key={i}>{line}</li>)}</ul></div>
    <div><h3>Gärna</h3>{profile.wishes.length ? <ul>{profile.wishes.map((wish, i) => <li key={i}>{describeFilters(wish).join(", ") || "Inget önskemål angivet"}</li>)}</ul> : <p className="muted">Inga extra önskemål.</p>}</div>
    {profile.unverified.length > 0 && <div className="unverified-summary"><h3>Behöver kontrolleras av dig</h3><p className="small">Våra uppgifter kan inte avgöra detta. Förslagen är inte bekräftade matchningar för dessa kriterier.</p>
      <ul>{profile.unverified.map((c, i) => <li key={i}>{c.must ? "Krav" : "Önskemål"}: {c.text}</li>)}</ul></div>}
  </div>;
}
const examples = ["Lägenhet i Solna eller Sundbyberg, minst 3 rum. Gärna 80 m².", "Villa i Nacka, högst 7 miljoner. Lugn gata är viktigt."];
export function PreferenceFlow({ apiBase, demo, member, ready, refresh, renderFilters, onDemoPreview }: Props) {
  const [text, setText] = useState(""), [draft, setDraft] = useState<Draft | null>(null);
  const [profile, setProfile] = useState<Profile>(member?.profile ?? manualProfile());
  const [editing, setEditing] = useState(false), [dirty, setDirty] = useState(false);
  const [aiConsent, setAiConsent] = useState(false), [accept, setAccept] = useState(false), [consent, setConsent] = useState(false);
  const [resolveQuestions, setResolveQuestions] = useState(false);
  const [activity, setActivity] = useState<"interpret" | "review" | "save" | "restore" | "pause" | null>(null);
  const busy = activity !== null;
  const [receipt, setReceipt] = useState<Receipt | null>(null), [availableDraft, setAvailableDraft] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null), operation = useRef<string | null>(null), sequence = useRef(0);
  const summary = useRef<HTMLHeadingElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const feedback = useRef<HTMLDivElement>(null), savedHeading = useRef<HTMLHeadingElement>(null), manualHeading = useRef<HTMLElement>(null);
  const edits = useRef(0), focusOutcome = useRef<"feedback" | "draft" | "receipt" | null>(null);
  const version = member?.searchVersion ?? 0;
  const savedVersion = useRef(version);
  async function call(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!apiBase) throw new Error("API-adressen saknas. Inget har skickats.");
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/preferences/${path}`, { method: body ? "POST" : "GET",
        credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: signal ?? AbortSignal.timeout(25000) });
    } catch {
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
    if (demo) return;
    const abort = new AbortController();
    const initialEdits = edits.current, initialSequence = sequence.current;
    void call("draft", undefined, abort.signal).then(result => {
      const restored = z.object({ draft: draftSchema.nullable() }).parse(result).draft;
      if (abort.signal.aborted || sequence.current !== initialSequence) return;
      if (restored && edits.current !== initialEdits) {
        setAvailableDraft(true); setMessage("Ett tidigare utkast finns. Dina påbörjade ändringar har behållits. Du kan läsa in utkastet utan ett nytt AI-försök.");
      } else if (restored) { setDraft(restored); setProfile(restored.profile); setMessage("Ditt osparade utkast är återläst. Ingen bevakning ändrades."); }
    }).catch(error => { if (!abort.signal.aborted && sequence.current === initialSequence) setError(error instanceof z.ZodError ? "Det sparade utkastets svar kunde inte kontrolleras. Använd filter eller läs in igen." : error instanceof Error ? error.message : "Utkastet kunde inte läsas."); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
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
    setDraft(next); setProfile(next.profile); setDirty(false); setText(""); setConsent(false); setAccept(false); setEditing(false); setResolveQuestions(false);
    setReceipt(null); setAvailableDraft(false);
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
    if (busy) return;
    setError(""); setMessage("");
    if (demo) { receive(demoDraft()); return; }
    const id = crypto.randomUUID(), current = ++sequence.current, abort = new AbortController();
    controller.current = abort; operation.current = id; setActivity("interpret");
    const timer = setTimeout(() => abort.abort(), 25000);
    try {
      const result = await call("interpret", { id, expectedVersion: version, previousId: draft?.id ?? null, text, aiConsent }, abort.signal);
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
      if (current === sequence.current) { setActivity(null); operation.current = null; }
    }
  }
  async function cancel() {
    const id = operation.current ?? draft?.id;
    sequence.current++; controller.current?.abort(); setActivity(null); setError(""); setConsent(false); setAccept(false);
    if (demo) { focusOutcome.current = "feedback"; setDraft(null); setMessage("Demo avbruten; ingenting sparades."); return; }
    if (id) {
      try { await call("cancel", { id }); setDraft(null); setProfile(member?.profile ?? manualProfile()); setDirty(false); setEditing(false);
        focusOutcome.current = "feedback";
        setMessage("Utkastet är borttaget. Den sparade sökningen är oförändrad."); }
      catch (error) { focusOutcome.current = "feedback"; setError(error instanceof Error ? error.message : "Kunde inte ta bort utkastet. Läs in det igen."); }
    }
  }
  async function review(skipOptional = false) {
    if (busy) return;
    const current = ++sequence.current;
    setActivity("review"); setError(""); setMessage(""); setConsent(false); setAccept(false);
    try {
      const checked = profileSchema.parse(profile);
      const id = crypto.randomUUID();
      if (demo) receive({ id, revision: (draft?.revision ?? 0) + 1, baseVersion: 0, profile: checked, turns: 0, expiresAt: Date.now() + 1800000, question: null, conflicts: [] });
      else {
        const result = await call("draft", { id, expectedVersion: version, profile: checked, previousId: draft?.id ?? null, resolveQuestions: resolveQuestions || skipOptional });
        if (current === sequence.current) receive(z.object({ draft: draftSchema }).parse(result).draft);
      }
    } catch (error) { if (current === sequence.current) { focusOutcome.current = "feedback"; setError(error instanceof z.ZodError ? "Kontrollera intervall och alternativ. Utkastet kunde inte bekräftas; dina ändringar finns kvar." : error instanceof Error ? error.message : "Kunde inte granska ändringarna."); } }
    finally { if (current === sequence.current) setActivity(null); }
  }
  async function restoreDraft() {
    if (busy) return;
    const current = ++sequence.current;
    setActivity("restore"); setError(""); setMessage(""); setConsent(false); setAccept(false);
    try {
      const result = z.object({ draft: draftSchema.nullable() }).parse(await call("draft"));
      if (current !== sequence.current) return;
      focusOutcome.current = "feedback"; setAvailableDraft(false);
      if (!result.draft) setMessage("Inget färdigt utkast kunde läsas in. Din text och dina ändringar finns kvar. Använd vanliga filter eller försök med AI senare; inget nytt AI-anrop har gjorts.");
      else {
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
    const current = ++sequence.current;
    setActivity("save"); setError(""); setMessage("");
    try {
      const result = receiptSchema.parse(await call("confirm", {
        id: draft.id, revision: draft.revision, expectedVersion: version, enabled: ready, acceptUnverified: accept, consent,
      }));
      if (current !== sequence.current) return;
      setReceipt(result); focusOutcome.current = "receipt";
      setMessage(result.message); setDraft(null); setText(""); setDirty(false); refresh();
    } catch (error) { if (current === sequence.current) { focusOutcome.current = "feedback"; setError(error instanceof z.ZodError ? "Sparandet kunde inte bekräftas trots ett svar från tjänsten. Kontrollera din sparade sökning innan du försöker igen." : error instanceof Error ? error.message : "Sparandet kunde inte bekräftas. Läs in din sparade sökning innan nytt försök."); } }
    finally { if (current === sequence.current) setActivity(null); setConsent(false); }
  }
  const valid = profileSchema.safeParse(profile).success;
  const blocking = !!draft?.question?.required || !!draft?.conflicts.length;
  return <section className="preference-flow surface" id="bevakning" aria-label="Personlig sökning">
    <form onSubmit={event => { event.preventDefault(); void generate(); }}>
      <label htmlFor="housing-prompt">{draft?.question && !dirty ? draft.question.text : draft ? "Vill du rätta eller lägga till något?" : "Beskriv ditt nästa hem"}</label>
      <textarea id="housing-prompt" ref={input} value={text} onChange={event => editText(event.target.value)} maxLength={1600} rows={3}
        placeholder="Var vill du bo, vad måste finnas och vad vore fint?" disabled={busy} aria-describedby="prompt-privacy" />
      <p className="small muted" id="prompt-privacy">Skriv inga namn, kontaktuppgifter eller känsliga uppgifter. {demo ? "Detta är ett fast, illustrativt exempel – inte AI. Din text tolkas inte." : "Din bostadstext och föregående utkast skickas till Cloudflare. Vi lägger inte till konto eller mejladress."}</p>
      {!draft && <><div className="example-chips">{examples.map((example, i) => <button type="button" key={example} disabled={busy}
        onClick={() => { editText(example); input.current?.focus(); }}>Använd exempel: {i === 0 ? "lägenhet" : "villa"}</button>)}</div><p className="small muted">Exemplen fyller i texten men skickas inte.</p></>}
      {draft?.question && !dirty && <div className="example-chips">{draft.question.choices.map(choice => <button type="button" key={choice} disabled={busy} onClick={() => { editText(choice); input.current?.focus(); }}>{choice}</button>)}</div>}
      {!demo && <label className="check"><input type="checkbox" checked={aiConsent} onChange={event => setAiConsent(event.target.checked)} /><span>Jag vill använda AI-texthjälpen hos Cloudflare.</span></label>}
      {!demo && !member?.aiReady && <p className="notice">AI-texthjälpen är inte aktiverad. Du kan skapa samma sparade sökning med vanliga filter nedan.</p>}
      <div className="flow-actions"><button className="primary" disabled={busy || dirty || (!demo && (!member?.aiReady || !aiConsent || text.trim().length < 3))}>
        {activity === "interpret" ? "Tolkar dina önskemål…" : demo ? draft ? "Visa exemplets svar" : "Visa exempelutkast" : draft ? "Tolka mitt svar" : "Hjälp mig att precisera"}</button>
        {(activity === "interpret" || (draft && !busy)) && <button type="button" onClick={() => void cancel()}>{activity === "interpret" ? "Avbryt" : "Börja om"}</button>}
        {draft?.question && !draft.question.required && !dirty && <button type="button" disabled={busy} onClick={() => void review(true)}>Hoppa över frågan</button>}</div>
      {(busy || error || message) && <div ref={feedback} tabIndex={-1} className={`flow-feedback ${error ? "error" : "notice"}`} role={error ? "alert" : "status"} aria-atomic="true">
        <p>{error || (activity ? { interpret: "Tolkar din text. Ingen sökning eller bevakning sparas i det här steget.",
          review: "Förbereder sammanfattningen för din granskning. Sökningen är inte sparad ännu.",
          save: "Sparar den godkända sökningen. Vänta på bekräftelsen.",
          restore: "Läser in utkastet utan ett nytt AI-anrop.", pause: "Pausar bostadsmejlen. Vänta på bekräftelsen." }[activity] : message)}</p>
        {!demo && !busy && (error || availableDraft) && <div className="flow-actions">
          <button type="button" onClick={() => void restoreDraft()}>Läs in utkast</button>
          <button type="button" onClick={() => { setEditing(true); requestAnimationFrame(() => {
            manualHeading.current?.focus({ preventScroll: true }); manualHeading.current?.scrollIntoView({ block: "center", behavior: "instant" });
          }); }}>Använd vanliga filter</button>
          <button type="button" onClick={() => { setSavedOpen(true); refresh(); }}>Kontrollera sparad sökning</button>
        </div>}
      </div>}
      {!demo && <p className="small muted">Built with Llama · <a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE" target="_blank" rel="noopener noreferrer">Modellvillkor</a>. Högst tre försök per medlem/dygn och sex totalt i piloten. Granska alltid tolkningen.</p>}
    </form>
    {receipt && <section className="save-receipt">
      <h2 ref={savedHeading} tabIndex={-1}>{receipt.alertsEnabled ? "Sökningen är sparad och bevakningen startad" : "Sökningen är sparad pausad"}</h2>
      <p>{receipt.alertsEnabled ? "Bara nya objekt kan skickas i morgonbevakningen." : "Inga bostadsmejl har aktiverats."} Bekräftad version {receipt.searchVersion}.</p>
      <ProfileSummary profile={receipt.profile} />
    </section>}
    {draft && <div className="draft-review"><h2 ref={summary} tabIndex={-1}>{dirty ? "Ändringar som inte granskats" : "Stämmer det här?"}</h2>
      {draft.conflicts.length > 0 && <div role="alert" className="notice"><strong>Det här behöver lösas</strong><ul>{draft.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      <ProfileSummary profile={profile} />
      {text.trim() && <p className="notice">Din nya text är inte tolkad än. Tolka den eller töm textfältet innan du godkänner sammanfattningen.</p>}
      <p className="small">Resultaten uppdateras från tillgängliga källor. Morgonmejl gäller bara nya objekt, inte varje ändring. Högst 20 per mejl. En sparad sökning per medlem.</p>
      {!ready && !demo && <p className="notice">Inga redo källor för bevakning. Du kan spara sökningen pausad – inga bostadsmejl startas.</p>}
      {profile.unverified.some(c => c.must) && <label className="check"><input type="checkbox" checked={accept} onChange={event => setAccept(event.target.checked)} disabled={dirty || busy} />
        <span>Jag accepterar att själv kontrollera kraven ovan. De används inte som bekräftade matchningskrav.</span></label>}
      <label className="check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={dirty || blocking || busy} />
        <span>{ready ? "Jag godkänner den här sökningen och vill starta daglig mejlbevakning." : "Jag godkänner den här sökningen och vill spara den pausad."}</span></label>
      <button className="primary" disabled={busy || dirty || !!text.trim() || blocking || !valid || !consent || (profile.unverified.some(c => c.must) && !accept)} onClick={() => void save()}>
        {activity === "save" ? "Sparar sökningen…" : demo ? "Förhandsvisa sparande" : ready ? "Spara och starta daglig bevakning" : "Spara pausad sökning"}</button>
    </div>}
    <details className="manual-search" open={editing} onToggle={event => setEditing(event.currentTarget.open)}>
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
    {!demo && member && <details className="saved-profile" open={savedOpen} onToggle={event => setSavedOpen(event.currentTarget.open)}><summary>Din sparade sökning · {member.alertsEnabled ? "bevakning startad" : "pausad"}</summary>
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
