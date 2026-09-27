# Kommandekollen

**Målet är att upptäcka kommande bostäder tidigt direkt hos mäklaren**, innan
de dyker upp på större bostadssajter, så att bostadssökaren kan kontakta mäklaren.
Ingen fullständig mäklartäckning, tidsvinst eller möjlighet att köpa före andra
garanteras. **Bostadslistan är privat, för ägaren och inbjudna bakom det
gemensamma lösenordet.** Texthjälpen är valfri, inte tjänstens kärnvärde.
Besökare med lösenord kan prova AI eller egna sökfilter utan e-post. E-post verifieras
först vid sparande, följt av en ny uttrycklig granskning/bekräftelse.
Ingen medlemsansökan eller manuell ägarprövning behövs i delat lösenordsläge.
**AI-budgeten är högst sex anrop per dygn för hela tjänsten, inte per besökare.
Den manuella privata piloten har tre färska objekt från HusmanHagberg
(2026-09-27); sökningar kan fortfarande bara sparas pausade.**
Schemalagd städning och hantering av inloggningsmejl är påslagna. Ägaren har
loggat in via ett riktigt mejl, använt AI-flödet och uttryckligen sparat en
pausad sökning. Den sparade profilen och avstängda bostadsmejl är verifierade
i produktionsdatabasen. Fleranvändarflöden och kapacitet återstår att följa upp.
Automatisk insamling från de efterfrågade
mäklarsajterna är fortfarande en uttrycklig lanseringsblockerare, inte en färdig
funktion som ersatts av en demo.

Migrationerna till och med `0005`, privat objektåtkomst och `ACCESS_MODE=shared`
är driftsatta. Lösenordet finns bara som privat serverhemlighet och hos ägaren.
Den tidigare sparade ägarsökningen och AI-förbrukningen är bevarade.
[Aktuell driftsättningsstatus](docs/DEPLOYMENT.md) skiljer tillgängliga verktyg
från aktiverade källor och beskriver den slutförda domänövergången till `www`.
[Kontrakt, integritet och säker aktivering](docs/SHARED_ACCESS.md).

## Kör lokalt

```sh
npm ci
npm run dev
```

Öppna `http://127.0.0.1:5173/` för webbplatsen, eller
`http://127.0.0.1:5173/?demo=1` för den tydligt märkta, helt fiktiva sökningen.
Demo varken sparar uppgifter eller skickar mejl. Utan API-konfiguration går det
inte att hämta objekt, ansöka eller logga in; anslutningsfelet visas uttryckligen.

Projektet installerar sin egen Node 22-binär som används av npm-skripten.
Installation kan startas från Node 18.20.8; `EBADENGINE`-varningar under denna
första installation gäller förälderns Node. Global Node eller kontoinställningar
ändras inte. CI använder Node 22 direkt.

```sh
npm run db:local          # endast lokal D1
npm run api:dev           # lokal Worker, standardport 8787
npm run build            # typkontroll + statisk frontend
npm test                 # riktiga lokala D1/transaktioner, simulerad mejlleverantör
npm run test:browser     # desktop + mobil; installera Chromium om den saknas
npm run ingest           # inget hämtas med tom konfiguration
```

Både `npm test` och `npm run test:browser` behöver Playwrights Chromium
(`npx playwright install chromium`). Skrapartesterna använder en riktig
webbläsare men fångar alla nätverksanrop till syntetiska fixturer. CI installerar
webbläsaren före båda testsviterna; inga mäklarsidor behöver hämtas för kontrollerna.

Kopiera `.env.example` respektive `.dev.vars.example` vid behov. Hemligheter hör
aldrig hemma i `VITE_*`, JavaScript-paket, git eller Actions-loggar.

## Det som finns

- Privat, separat objektlista via `GET /api/listings`: 12 kommande objekt
  åt gången, **Ladda fler**, senast upptäckta först och **Filtrera objekt** över
  hela det tillgängliga urvalet. Filtren ändrar ingen personlig sökning och
  använder ingen AI. Bara aktiva objekt i Stockholms län från aktuellt tillåtna
  källor får visas. Tom källista, tomt utbud, inga filterträffar och tjänstefel
  har skilda lägen; ingen demo ersätter riktiga data.
  Först upptäckt är tjänstens observation, inte mäklarens publiceringsdatum.
  Lösenordet räcker för bläddring; inget e-postkonto eller AI-godkännande krävs.
  Utloggning, utgången session och upptäckt återkallad åtkomst tömmer privata data
  även när ett äldre svar är på väg tillbaka.
  [Privat API, sidmarkörer och begränsningar](docs/OPERATIONS.md#public-listings).
- Separat, administratörsskyddad import av partiella observationer med ursprunglig
  observationstid och identitet. Återförsök är idempotenta; en partiell eller
  tom observation raderar inte objekt som saknas i urvalet. Ny import kräver
  högst en timme gammal fångst och en separat, tidsbegränsad
  `PRIVATE_OBSERVATION_SOURCES`-konfiguration med sanningsenligt granskad grund.
  Standardvärdet är tomt. `PROPERTY_EMAILS_ENABLED` är separat och avstängt;
  privata observationsdata går inte till den licensierade mejlvägen.
  [Kontrakt och explicit lokal förberedelse/import](docs/OPERATIONS.md).
- Personligt sökflöde: beskriv hemmet, besvara högst en fråga åt gången,
  granska **Måste ha / Gärna / Behöver kontrolleras av dig**, redigera och
  godkänn uttryckligen. Utan redo källor sparas sökningen **pausad**.
  Cloudflare Workers AI är valfri och kräver särskilt godkännande av texthjälpen.
  I medlemsläget krävs godkänt konto; i det nya delade lösenordsläget räcker en
  serververifierad gästsession. Migration `0002` och det matchande
  gränssnittet/backend är driftsatta. Lokal standardkonfiguration håller AI avstängd.
- Startsidan i delat lösenordsläge har logotyp, meny, en kort förklaring av
  tjänsten och en sidfot med integritet och kontakt. Fritextrutan och
  **Hitta bostad** står ovanför objektlistan. Pausat sparande förklaras
  vid granskning och sparande, inte i en global pilotnotis. Lösenord och uttryckligt
  AI-godkännande efterfrågas vid första sökningen, inte när sidan öppnas.
  Texten behålls vid avbrott, fel och navigation till information.
  **Meny** öppnar vanliga filter, sparad sökning/utkast och konto.
  Följdfrågor återanvänder samtycket inom samma utkast; ingen AI körs vid
  sidladdning eller återläsning.
- Mobilanpassad sökyta med neutrala vita/grå ytor och svart/vit text.
  Blått och korall används endast på knappar: blå primärknappar med vit text,
  genomskinliga sekundärknappar med samma mörkblå färg på ram och text,
  samt korall för radering/återkallelse. I mörkt läge anpassas konturknapparnas
  blå nyans för läsbarhet, utan att lägga till bakgrundsfärg.
  Loggan och bakgrundsbilden behåller sina egna färger.
  Färgerna använder Clawpilot-variabler; rubriker har fetare vikt 700,
  Georgia används i huvudrubrik/logotyp och Segoe UI i formulär och navigation.
  Fyllda knappar och mjuka skuggor ersätter dekorativa kantlinjer;
  tydliga tangentbordsmarkeringar och inbyggda formulärkontroller behålls.
  Inaktiva primärknappar förblir blå men går inte att skicka.
  Mörkt läge väljs uttryckligen.
  Manuella filter är alternativet utan AI: kommun och bostadstyper,
  reglage för pris/rum/boarea/avgift, valfri
  exakt inmatning och extra sökval under **Fler filter**. Ingen gräns är ett eget
  val; befintliga exakta sökvärden avrundas inte. Saknade uppgifter är inte noll.
- Startsidan har ägarens tillhandahållna interiörbild med balkong och kakelugn
  som lokal bakgrund.
  På desktop ligger sökrutan till vänster och **Vad är viktigt i ditt nästa hem?**
  till höger över bilden; på mobil kommer texten före sökrutan. De två panelerna
  använder liquid glass: genomskinlig toning, lätt bakgrundsoskärpa och diskreta
  ljuskanter. Även textrutans inre bakgrund är genomskinlig så att bilden syns.
  Text, platshållare och tangentbordsfokus behåller kontrast över ljusa och mörka
  bildpartier. Utan stöd för effekten, vid minskad transparens/kontrastläge eller
  om bilden saknas används ogenomskinliga läsytor. Utökad granskning och vanliga
  filter får hela bredden nedanför, utan att textrutan monteras om.
  Två WebP-filer i 800/1374px används med responsiv beskärning.
  [Bildens ursprung och bearbetning](public/assets/ATTRIBUTION.md) nås från
  sidfoten. Den tidigare husbildens **CC BY-SA 3.0** gäller bara dess historiska
  bildfiler, inte den nya bakgrunden, appens kod eller logga.
  Bilden är en bakgrundsillustration, inte ett objekt till salu.
  Det tidigare inspirationskortet är fortsatt borttaget, även i demo och äldre
  medlemsläge. Objektlistan ligger på en vanlig läsyta och visar källänkar och
  faktauppgifter, inga påhittade objektbilder. Historiska oanvända fotofiler behålls.
- Den senaste tillhandahållna helblå husloggan med vit radar används i sidhuvud
  och favicon.
  Små lokala PNG-filer behåller originalets färger och transparens.
  [Loggans ursprung och bearbetning](public/assets/BRAND.md) redovisas separat
  från fotografiernas licenser.
- I medlemsläget: ansökan och lösenordsfri e-postverifiering. En verifierad ny användare stannar
  i **väntar på godkännande**, utan personliga sökningar eller mejlbevakning.
  Även bostadslistan kräver ett godkänt medlemskap i detta äldre läge.
- Ägarvy för granskning, godkännande, avslag och återkallelse i medlemsläget;
  lösenordsläget behåller återkallelse men ingen manuell antagning. Ägarrollen kommer
  endast från privat `OWNER_EMAIL`. Återkallelse stoppar API-åtkomst och köade mejl.
- Backend-skyddad personlig katalog, intern källstatus och separat sparad sökning per medlem.
  Ingen verklig inventering lagras i statiska filer eller publika byggartefakter.
- D1-migration, krypterad mejlkö, atomiska kvoter, begränsade återförsök,
  verifierings-/inloggningslänkar, utloggning, paus och kontoradering.
- Morgonjobb i `Europe/Stockholm`, även sommartid. Bara nya matchningar, högst
  20 per mejl. Misslyckad leverans markerar inte objekt som sedda.
- Begränsad collector för tillåtna JSON-feeds och explicit strukturerad
  HTML/JSON-LD, med parserfixturer, robotskontroll, tids-/storleksgränser och
  autentiserad import. **Den är testad på syntetiska fixturer, inte på någon
  fungerande liveintegration med en mäklare.**
- Separata, manuella skrapare för **Notar, HusmanHagberg och MOHV** har verifierats
  mot faktiskt renderad DOM med vanlig Chromium. Notars tidigare prov gav
  13 Stockholmsträffar av 24 kort. HusmanHagberg gav 1 entydig träff av 18 kort
  efter att motstridiga statusetiketter uteslutits. MOHV gav 27 träffar bland
  de första 50 av 266 kort på den undersökta sidan; det är inte full täckning.
  [Källspecifika belägg, begränsningar och lokala kommandon](docs/SOURCES.md#husmanhagberg-and-mohv-bounded-previews).
  Resultaten är privata och uttryckligen ofullständiga, **inte kompletta
  inläsningssnapshots**. Saknade fakta förblir `null`. Sparad fångstmetadata
  behåller ursprunglig observationstid och identitet vid lokal återläsning.
  SkandiaMäklarna och Länsförsäkringar är stoppade på uttryckliga villkor;
  privat användning ger inte automatiskt tillstånd till indexering.
  Förhandsvisningsverktygen importerar inte själva. Den separata manuella
  [privata körningen](docs/OPERATIONS.md#manual-private-browser-runner)
  importerade tre färska HusmanHagberg-objekt den 27 september.
  Notar stoppades vid nekad åtkomst och MOHV vid ett resultat som inte kunde
  verifieras; deras tidigare prov används inte som färska objekt.
  Bara HusmanHagberg är nu aktiverad, med tidsbegränsad privat användningsgrund
  till 4 oktober. Ingen allmän mäklarlicens, automatisk insamling eller
  mejlbevakning har aktiverats.

## Begränsningar och dokumentation

Pilot: 40 konton inklusive ansökningar, 200 objekt, högst 50 objekt per
snapshot eller observationsbatch och högst 4 konfigurerade källor sammanlagt.
Appen reserverar högst 80
mejlförsök/dygn, 2400/månad och 20 icke-bostadsmejl/dygn. Det inkluderar inloggning,
verifiering, godkännande och återförsök. Resend Free har 100 mejl/dygn och
3000/månad; kontot måste reserveras för appen eller annan användning räknas av.
Inga betalda uppgraderingar eller obegränsad gratiskapacitet förutsätts.

- [Driftsättning och DNS](docs/DEPLOYMENT.md)
- [Källor, belägg och importformat](docs/SOURCES.md)
- [Dataskydd, medlemskap och drift](docs/OPERATIONS.md)
- [Visuellt system](DESIGN.md)
- [Personliga sökprofiler, AI-kontrakt, gratisbudget och migration](docs/PREFERENCES.md)
- [Delat lösenord, gästutkast och e-post vid sparande](docs/SHARED_ACCESS.md)

AI-hjälpen reserverar konservativt 1 000 neuroner per försök, högst 6 000 per
UTC-dygn för hela appen och sex försök per medlem/IP. Kontots Free-kvot delas med
annan användning. Inga betalda modeller eller automatiska kostnadsfallbacks används.
**Built with Llama**; modellvillkor och begränsade verkliga utvärderingsresultat
finns i dokumentationen ovan. Manuella sökningar kräver inte AI.

Webbläsartesterna startar en separat frontend på port 5174. Förutom snabba
API-simuleringar körs faktiska HTTP-anrop genom Worker och lokal D1, med enbart
modell och mejlleverantör ersatta av testfixturer. Inga verkliga mejl skickas
och förhandsvisningen på 5173 lämnas orörd. Testerna täcker
320/360/390/430px, tangentbordsstyrda reglage, exakta sparade värden,
medlemsgränser, privat sidindelning/filter/återförsök, lokal logga/favicon,
hero-geometri och bildbortfall, frånvaro av det gamla inspirationskortet,
samt ljust standardtema även vid mörkt OS.

Koden finns i [marcusbodin/kommandekollen](https://github.com/marcusbodin/kommandekollen).
Domänen registreras och betalas fortsatt hos Inleed; auktoritativ DNS är flyttad
till **Cloudflare Free**. GitHub Pages finns på **https://www.kommandekollen.se/**.
Adressen utan `www` och båda HTTP-adresserna omdirigeras till HTTPS med `www`.
Certifikatet täcker båda värdnamnen och tvingad HTTPS är påslagen.
Mejllänkar och tillåtna webbläsaranrop använder endast den nya HTTPS-adressen.
Ladda om en redan öppen flik på den gamla adressen innan du fortsätter.
API:t är driftsatt med TLS på
`https://api.kommandekollen.se` och D1-databasen är migrerad med EU-jurisdiktion.
Privata nycklar och administratörsuppgifter finns endast i tjänsternas
hemlighetslagring, inte i repot.

`wrangler.toml` har en separat produktionsmiljö med `SERVICE_ENABLED=true`,
`AI_ENABLED=true`, tom källista och städning/mejlkö varje minut. Ägarens
e-postverifiering och första sparade AI-sökning har fungerat i produktion.
Övriga medlemsflöden och produktionsbudget följs upp under piloten;
ett lyckat ägarflöde är inte bevis för alla fleranvändarfall.
Riktiga källor och produktionsbudget måste dessutom verifieras
innan fungerande bostadsbevakning kan utlovas. Aktuell driftstatus och kvarstående
kontroller finns i [driftsättningsguiden](docs/DEPLOYMENT.md).
