# Kommandekollen

Sluten bostadssökning och morgonbevakning för Stockholms län.
**Webbgränssnitt och avstängd backend är publicerade. Medlemsansökningar,
inloggning och schemalagda utskick är ännu inte aktiverade. Inga livekällor är
anslutna.** Ett tekniskt Resend-utskick till kontaktadressen har nått den
verifierade mottagaren; appens kompletta medlems- och bevakningsflöde återstår.
Automatisk insamling från de efterfrågade
mäklarsajterna är fortfarande en uttrycklig lanseringsblockerare, inte en färdig
funktion som ersatts av en demo.

## Kör lokalt

```sh
npm ci
npm run dev
```

Öppna `http://127.0.0.1:5173/` för den stängda medlemsytan, eller
`http://127.0.0.1:5173/?demo=1` för den tydligt märkta, helt fiktiva sökningen.
Demo varken sparar uppgifter eller skickar mejl. Utan API-konfiguration går det
inte att ansöka eller logga in.

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

Kopiera `.env.example` respektive `.dev.vars.example` vid behov. Hemligheter hör
aldrig hemma i `VITE_*`, JavaScript-paket, git eller Actions-loggar.

## Det som finns

- Personligt sökflöde: beskriv hemmet, besvara högst en fråga åt gången,
  granska **Måste ha / Gärna / Behöver kontrolleras av dig**, redigera och
  godkänn uttryckligen. Utan redo källor sparas sökningen **pausad**.
  Cloudflare Workers AI är valfri, endast för godkända medlemmar och avstängd
  som standard. Den nya funktionen behöver migration `0002` och samordnad
  driftsättning; den aktiverar inte den publicerade tjänsten av sig själv.
- Mobilanpassad, ljus sökyta med Clawpilot-tema; mörkt läge väljs uttryckligen.
  Manuella filter är alternativet utan AI: kommun och bostadstyper,
  reglage för pris/rum/boarea/avgift, valfri
  exakt inmatning och extra sökval under **Fler filter**. Ingen gräns är ett eget
  val; befintliga exakta sökvärden avrundas inte. Saknade uppgifter är inte noll.
- En licensverifierad, lokalt optimerad interiörbild, tydligt märkt som
  inspiration och aldrig kopplad till ett objekt. [Bildkälla och licens](public/assets/ATTRIBUTION.md).
- Ansökan och lösenordsfri e-postverifiering. En verifierad ny användare stannar
  i **väntar på godkännande**, utan objekttillgång eller mejlbevakning.
- Ägarvy för granskning, godkännande, avslag och återkallelse. Ägarrollen kommer
  endast från privat `OWNER_EMAIL`. Återkallelse stoppar API-åtkomst och köade mejl.
- Backend-skyddad katalog, källstatus och separat sparad sökning per medlem.
  Ingen verklig inventering lagras i statiska filer eller publika byggartefakter.
- D1-migration, krypterad mejlkö, atomiska kvoter, begränsade återförsök,
  verifierings-/inloggningslänkar, utloggning, paus och kontoradering.
- Morgonjobb i `Europe/Stockholm`, även sommartid. Bara nya matchningar, högst
  20 per mejl. Misslyckad leverans markerar inte objekt som sedda.
- Begränsad collector för tillåtna JSON-feeds och explicit strukturerad
  HTML/JSON-LD, med parserfixturer, robotskontroll, tids-/storleksgränser och
  autentiserad import. **Den är testad på syntetiska fixturer, inte på någon
  fungerande liveintegration med en mäklare.**

## Begränsningar och dokumentation

Pilot: 40 konton inklusive ansökningar, 200 objekt, högst 50 objekt per komplett
källsnapshot och 4 källor per insamlingsjobb. Appen reserverar högst 80
mejlförsök/dygn, 2400/månad och 20 icke-bostadsmejl/dygn. Det inkluderar inloggning,
verifiering, godkännande och återförsök. Resend Free har 100 mejl/dygn och
3000/månad; kontot måste reserveras för appen eller annan användning räknas av.
Inga betalda uppgraderingar eller obegränsad gratiskapacitet förutsätts.

- [Driftsättning och DNS](docs/DEPLOYMENT.md)
- [Källor, belägg och importformat](docs/SOURCES.md)
- [Dataskydd, medlemskap och drift](docs/OPERATIONS.md)
- [Visuellt system](DESIGN.md)
- [Personliga sökprofiler, AI-kontrakt, gratisbudget och migration](docs/PREFERENCES.md)

AI-hjälpen reserverar konservativt 1 000 neuroner per försök, högst 6 000 per
UTC-dygn för hela appen och tre försök per medlem/IP. Kontots Free-kvot delas med
annan användning. Inga betalda modeller eller automatiska kostnadsfallbacks används.
**Built with Llama**; modellvillkor och begränsade verkliga utvärderingsresultat
finns i dokumentationen ovan. Manuella sökningar kräver inte AI.

Webbläsartesterna startar en separat frontend på port 5174 och simulerar API:t
lokalt, utan att skicka mejl eller röra förhandsvisningen på 5173. De täcker
320/360/390/430px, tangentbordsstyrda reglage, exakta sparade värden,
medlemsgränser, lokal bildladdning och ljust standardtema även vid mörkt OS.

Koden finns i [marcusbodin/kommandekollen](https://github.com/marcusbodin/kommandekollen).
Domänen registreras och betalas fortsatt hos Inleed; auktoritativ DNS är flyttad
till **Cloudflare Free**. GitHub Pages är kopplat till `kommandekollen.se`;
dess HTTPS-certifikat inväntas fortfarande. API:t är driftsatt med TLS på
`https://api.kommandekollen.se` och D1-databasen är migrerad med EU-jurisdiktion.
Privata nycklar och administratörsuppgifter finns endast i tjänsternas
hemlighetslagring, inte i repot.

`wrangler.toml` har en separat produktionsmiljö med `SERVICE_ENABLED=false`,
tom källista och tomt cron-schema. Aktivera inte medlemsdelen innan frontendens
HTTPS, dataskyddsinformation, schemalagd städning och hela medlemsflödet är
kontrollerade. Riktiga källor och produktionsbudget måste dessutom verifieras
innan fungerande bostadsbevakning kan utlovas. Aktuell driftstatus och kvarstående
kontroller finns i [driftsättningsguiden](docs/DEPLOYMENT.md).
