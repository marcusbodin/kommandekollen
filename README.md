# Kommandekollen

Sluten bostadssökning och morgonbevakning för Stockholms län.
**Lokalt implementerad, inte publicerad. Inga livekällor är anslutna och inga
riktiga mejlutskick har verifierats.** Automatisk insamling från de efterfrågade
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

- Svensk, responsiv sökyta med ljust/mörkt Clawpilot-tema. Kommun, område/gata,
  bostadstyp, pris, rum, boarea och avgift; saknade uppgifter är inte noll.
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

Avsett GitHub-konto: **marcusbodin**. Publikt källkodsrepo är godkänt, men ingen
push, fjärrrepoändring, resursprovisionering, DNS-ändring eller driftsättning har
gjorts. Domänen `kommandekollen.se` finns hos Inleed. Källrättigheter,
konton, domänverifiering, e-postleverans och produktionsbudget måste lösas innan
tjänsten kan öppnas ens för godkända medlemmar.
