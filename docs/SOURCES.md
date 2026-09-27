# Sources and collection status

## Manual private production pilot, 2026-09-27

After the owner's explicit approval, the complete linked Notar, HusmanHagberg
and MOHV policy pages were freshly reviewed. Notar/MOHV's inspected documents
are privacy policies, not extraction licenses; no explicit extraction ban was
found in them. HusmanHagberg expressly permits attributed, non-distorting
links and restricts copying protected texts/images. This supports the recorded
limited private factual-link assessment, **not** a claim of broker permission,
legal certainty or authority for repeated database extraction.

One bounded manual Linux run was made per source, using unchanged normal-browser
allowlists, robots checks and request/time/size limits. No detail pages, paging,
API replay, challenge bypass, proxy, retry or stale-capture retimestamping was used.

| Source | Fresh production result | Current activation |
| --- | --- | --- |
| HusmanHagberg | Run `36332042322`: 3 genuine upcoming Stockholm-county facts imported at `2026-09-27T16:07:54.625Z`; partial receipt 3 inserted, 0 updated/ignored/retired | Active private usage-basis grant, exact `www.husmanhagberg.se` host, expires `2026-10-04T18:00:00.000Z` |
| Notar | Run `36331879123`: `access_denied`; stopped, no import | Grant removed; disabled |
| MOHV | Run `36332125202`: `not_ready`; usable results could not be verified, no import | Grant removed; disabled; the code alone does not establish whether the cause was access, dependency or rendering readiness |

Production D1 independently confirms three active HusmanHagberg rows, three
private-provenance entries, one partial receipt with its payload cleared, and
zero retirements. The existing one subscription remains paused and the four
AI attempts are unchanged. Password protection remains required; these are not
public/static listing data or complete source coverage. An authenticated live
browser rendering is not claimed by the import/database verification.

Only the working HusmanHagberg grant remains in private Worker/GitHub secrets.
`AUTHORIZED_SOURCES=[]` and `PROPERTY_EMAILS_ENABLED=false` remain unchanged.
There is **no scheduled collection**; these observations will age without another
explicit operation. Source access, private facts and authorization basis are not
published in workflow logs/artifacts. Only source IDs and aggregate outcomes are.

## Historical preview and initial policy status

Initial policy checks: 2026-09-25. Bounded Notar/Bjurfors public-HTML investigation:
2026-09-27, detailed below. Static index HTML yielded no property records.
A subsequently authorized normal-browser Notar investigation rendered 24 explicit
upcoming cards; the named DOM parser extracted 13 Stockholm-county records into
a private, incomplete preview. No individual detail page was fetched, and no
login, CAPTCHA, private API or bot protection was bypassed. Production source
activation was still empty at that stage; research did not ingest or publish inventory.
The separately approved expansion on the same date added working local previews
for HusmanHagberg and MOHV. SkandiaMäklarna and Länsförsäkringar were stopped at
their explicit linked terms; MOHV was authorized as the replacement candidate.
These are three technically demonstrated preview sources including Notar, not
three licensed/activated production sources or complete Stockholm coverage.
The table below records that earlier investigation; the fresh production
pilot above supersedes its activation statuses.

| Candidate | Evidence | Exact status |
| --- | --- | --- |
| Fastighetsbyrån | [robots.txt](https://www.fastighetsbyran.com/robots.txt) explicitly prohibits automated access without special permission; object/API paths disallowed | Explicitly prohibited without permission; disabled |
| Svensk Fastighetsförmedling | [Terms](https://www.svenskfast.se/om-oss/anvandarvillkor/) prohibit scraping, copying/indexing and automatically generated object links without permission. [Robots](https://www.svenskfast.se/robots.txt) also exclude search parameters `t`, `maxp`, `minp`, `maxr`, `minr`, `maxla`, `minla`, `sw`, `noprice` and several paths | Explicitly prohibited without permission; disabled |
| Bjurfors | [Robots](https://www.bjurfors.se/robots.txt) allow `/` except specified Ragnar/PDF/undefined-office paths; rechecked 2026-09-27. [Boagent terms](https://www.bjurfors.se/sv/mitt-bjurfors/anvandarvillkor/) describe personal-data processing, not a syndication license | Bounded public-HTML requests returned empty HTTP 200 responses; see investigation below. Reuse permission / suitable public license not established; disabled. Do **not** misquote Boagent terms as an explicit scraping ban |
| Länsförsäkringar Fastighetsförmedling | Fresh [robots](https://www.lansfast.se/robots.txt) exclude error and internal application/config/data/Umbraco directories. Linked [terms](https://www.lansfast.se/anvandarvillkor/) explicitly require permission for indexing and automatically generated links on another site | Stopped before an index/browser/detail investigation; no adapter or source activation |
| SkandiaMäklarna | Fresh [robots](https://www.skandiamaklarna.se/robots.txt) exclude `/episerver/`. Linked [terms](https://www.skandiamaklarna.se/anvandarvillkor/) prohibit indexing/automatically generated links and bulk copying without permission, including bulk storage without redistribution | Stopped before an index/browser/detail investigation; no adapter or source activation |
| HusmanHagberg | Fresh [robots](https://www.husmanhagberg.se/robots.txt) allow `/`. [Terms](https://www.husmanhagberg.se/anvandarvillkor/) permit attributed, non-distorting linking, but restrict copying protected texts/images | 18 rendered cards, 1 unambiguous Stockholm-county match after 10 conflicting-status and 7 location exclusions. Private partial preview; no general extraction/reuse license or production activation established |
| Notar | [Robots](https://www.notar.se/robots.txt) allow `/`; rechecked 2026-09-27. Linked [Sekretess & Villkor](https://www.notar.se/information/sekretess-villkor) describes personal-data processing | Static HTML has no cards; ordinary rendering yielded 24 upcoming cards / 13 Stockholm records in a private partial preview. Recurring extraction/republication permission and complete coverage not established; production disabled |
| Erik Olsson | [Robots](https://www.erikolsson.se/robots.txt) exclude `/api/*`, `/dashboard/*`, `/password`, `/beta`; sitemaps advertised | Terms/feed license unverified; disabled; API exclusions must be respected |
| MOHV | Fresh [robots](https://www.mohv.se/robots.txt) exclude `/wp-admin/`, allow its admin-ajax path. Linked [privacy policy](https://www.mohv.se/integritetspolicy/) describes personal-data processing, not a syndication license | Approved replacement candidate. 27 Stockholm matches in an explicit first-50-card window of a 266-card upcoming page. Private partial preview only; production disabled |
| Authorized partner feed | Real validator/import pipeline and synthetic fixtures exist | No partner, feed credentials or suitable license supplied; zero live coverage |

Search-engine summaries were not treated as legal evidence; in particular, the
actual Bjurfors page did not substantiate broad claims made in search summaries.
A sitemap or permissive robots file is not a reuse license. Private membership
does not override terms, copyright or database rights. Minimal factual attributes
and links differ from expressive descriptions/photographs, but repeated systematic
database extraction can still require assessment. No photos or descriptions are
copied. An explicitly licensed public feed can suffice; a separate written
permission is not required if that license actually permits the intended use.

## Initial bounded static-HTML investigation (2026-09-27)

The requested first source was Notar, with Bjurfors as the single permitted
fallback. Research used ordinary public GETs, fresh robots checks before each
source, at least two seconds between broker requests, the existing 12-second
timeout and 500,000-byte content / 64,000-byte robots limits. No sitemap was
crawled. No JavaScript bundle, internal endpoint, browser session, redirect
workaround, proxy or changed client identity was used to obtain listing data.

| Source / public URL | Observed result |
| --- | --- |
| [Notar navigation](https://www.notar.se/) | 126,351 bytes. Public navigation links to the index and privacy/terms page. No property-detail links in the fetched HTML |
| [Notar linked privacy/terms](https://www.notar.se/information/sekretess-villkor) | Personal-data processing policy read. No reuse license established; not treated as either permission or an explicit blanket scraping prohibition |
| [Notar listing index](https://www.notar.se/kopa-bostad?rf=true) | 118,398 bytes. `Till salu` / `Kommande` tab labels and pagination controls, but no per-property cards, detail links or factual records. A tab label is not evidence that any particular home is upcoming |
| [Bjurfors navigation](https://www.bjurfors.se/sv/) | Empty response body |
| [Bjurfors Stockholm index](https://www.bjurfors.se/sv/tillsalu/stockholm/) | HTTP 200, `Content-Length: 0`, no `Content-Type`, zero body bytes and no links or structured data |

Only one listing-index page per source was requested; no individual detail pages
could be selected from these responses. HTML was retained privately for local
inspection, outside the repository and public artifacts. No real property
addresses, IDs, descriptions or photos were extracted into fixtures or logs.

**Static-only result: blocked before factual parsing, not an empty inventory.**
Observed property count is zero, but available/upcoming inventory count is
**unknown**. Status, municipality, county, stable ID and numerical facts could
not be validated. There is no normalized source preview or complete snapshot to
import from these initial responses. No factual parser was invented from the
empty/static shells.

This does **not** establish that Notar or Bjurfors cannot be scraped. Notar may
expose records after normal browser rendering; the cause of Bjurfors' empty
response is unknown. The separately authorized rendered investigation below
resolved the Notar technical blocker, not the completeness or reuse questions.
Browser traversal does not fit the robots-plus-one-content-request collector
contract. Partial pages must never enter complete-snapshot ingestion, which
retires absent listings.

No collector format, allowlist, authorization, request limit, schema, database,
quota or production configuration changed as a result of this investigation.

## Named Notar rendered-DOM preview

The normal public page was allowed to execute its own JavaScript, with default
Chromium identity and fresh contexts. There were three bounded investigation
loads: two dependency-discovery attempts, then one successful load with **one**
ordinary visible `Kommande` tab click. There was no paging, repeated search,
detail traversal, login or challenge workaround.

The official HTML declares `https://notar-assets.b-cdn.net/_nuxt/` as its
application script/style origin. Ordinary page execution also demonstrated
these anonymous, read-only operations on `https://data.notar.se`:

| Operation | Public role | Observed parameter names (not values) |
| --- | --- | --- |
| `GET /areas` | Geographic filter bootstrap | `country`, `types[]` |
| `GET /objects` | Result cards / public search | `limit`, `sortBy`, `sortOrder`, `assignmentStatus`, `compactObjects` |

Only those evidenced paths/methods/parameter names and their normal CORS
preflight are allowed. The tool never constructs these requests, changes the
page's parameters, reads API response bodies itself, or replays an endpoint.
Images/media/fonts, trackers/ads (including Adfenix and Google Tag Manager),
unrelated origins and contact/account/write operations are blocked.
An unclassified data-host operation (including a newly added search parameter)
also fails the entire preview explicitly. Blocking it is not evidence that
retained cards are current; no automatic allowlist expansion or request replay
occurs.
`data.notar.se/robots.txt` returned **403**: no usable data-host policy or reuse
grant was established. This differs from an actual application access denial:
the page's public data requests returned 200 anonymously. The local tool records
the missing policy, honors a published policy if available, and stops on actual
401/403/429 data responses or visible access challenges. This research exception
does not relax the production collector's fail-closed robots/authorization rules.

The successful research load attempted 95 browser requests: 75 allowed and
20 blocked, with 1,349,968 encoded bytes and 5,574,969 decoded bytes reported by
Chromium. These are one-run observations, not performance or Free-tier guarantees.
Robots reads are separate from browser traffic. Real HTML, operation metrics
and extracted records remain in private session files, never public fixtures,
static bundles, workflow artifacts or console logs.

`scripts/notar-dom.ts` parses the **observed rendered structure**, not generic
JSON-LD: selected `.custom-tab[role=tab]`, `a.card[href]`, `.v-card-title`,
three `.subtitle-info > span` fields (status, area, municipality), and `li > span`
facts with `rok`, `kvm` and `kr/mån` units. Every included card must explicitly
say `Kommande försäljning`. Municipality matches the shared Stockholm-county
allowlist exactly, with the displayed ` kommun` suffix removed; county is
derived from that mapping, not guessed from a neighborhood.
Stable IDs come only from validated canonical
`https://www.notar.se/kopa-bostad/objekt/<id>` links. No URL query, fragment,
credentials or alternate host is accepted.

The captured page contained 24 upcoming cards: 13 matched the county scope and
11 were outside it. The 13 unique records all supplied address, area,
municipality, rooms and size; 12 supplied monthly fee. No price or explicit
property type was available for them: these fields remain `null`. Type is never
inferred from an address, room count, fee or plot-area mention. Combined
living/auxiliary area is left unknown rather than summed. Actual detail-page
types, all pages and complete Stockholm inventory have **not** been verified.

The result is deliberately **not** `feedSchema`:
`kind: "notar-rendered-preview"`, `ingestible: false`, `coverage.complete: false`,
`coverage.totalAvailable: null`, explicit rendered/excluded/duplicate/unknown
counts, and `items` rather than a complete `listings` snapshot. Shared listing
validation is reused with a local nullable-type override; no shared schema
changed. Empty or failed hydration, changed structures/statuses, invalid
identity/values and conflicting duplicate IDs are explicit failures, not a
successful empty inventory. A valid page containing only out-of-scope cards can
produce zero matches, still with unknown total and incomplete coverage.

### Manual local reproduction

Requires the repository's existing Node/tsx and installed Playwright Chromium;
there is no new dependency, CI job or recurring browser fleet. Output must be
a **new absolute file outside the checkout**, in an existing private directory:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-notar.ts \
  --output /absolute/private/notar-preview.json
```

This command launches one fresh browser at the fixed official index, selects
`Kommande` at most once, and closes it. No arbitrary URL argument exists.
Separate local-browser caps: 100 allowed / 200 attempted requests, 12 MB decoded
traffic, 30-second browser-phase deadline, 15-second launch/navigation deadlines,
10-second readiness deadlines, 500 KB rendered DOM and 50 cards. Fresh robots
checks use the existing 12-second/64 KB bounds, followed by a two-second
initial wait before the page load. A positive published `Crawl-delay` on either
the page or data host is rejected as incompatible with this browser mode:
a one-time startup sleep does not enforce per-request spacing. No browser is
launched in that case. Zero or absent delay retains the initial two-second wait.
The website's own functional requests run normally within that explicit browser
budget; this is not the production collector's two-request budget.

To reproduce extraction from an already captured DOM with **no network**:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-notar.ts \
  --from-html /absolute/private/notar-rendered.html \
  --output /absolute/private/notar-offline-preview.json
```

Offline extraction does not invent a new capture/last-seen timestamp.
Fresh Notar previews now persist an `observationId` UUID and `observedAt`;
the legacy `capturedAt` alias is exactly that same successful-capture timestamp.
The UUID is generated once for that capture and stored with the output. Bare
`--from-html` has `observationId: null` and `observedAt: null`, never a newly
minted observation. This metadata addition did not re-fetch Notar or change its
network policy, parser, coverage, or production integration.
Output is mode 0600, exclusive (never overwrites a file or symlink); stdout
contains counts and non-ingestible/partial status, not property facts.
Errors exit nonzero. Do not put real HTML or JSON in the repository.

Tests use anonymized minimal DOM, an intercepted synthetic Chromium page and
the existing collector regression cases; no broker requests are made by tests:

```bash
./node_modules/node/bin/node ./node_modules/vitest/vitest.mjs run \
  tests/notar-preview.test.ts tests/model.test.ts
```

The preview is **not wired to `collectSource` or `/admin/ingest`** and cannot
retire inventory. Production collection, Worker, D1, quotas, source allowlists
and authorization remain unchanged. Publication still requires a defensible
reuse basis plus a separately designed complete-snapshot or safe-delta contract;
copying this page's 13 records into the existing snapshot route is not safe.

## HusmanHagberg and MOHV bounded previews

### Fresh policy evidence and stopped candidates (2026-09-27)

Each candidate's official robots, public navigation, and linked legal page
were read freshly. All four page robots returned 200; none published a positive
crawl delay. No sitemap was crawled. The restricted brokers were not investigated
past their home/legal pages:

- [SkandiaMäklarna terms](https://www.skandiamaklarna.se/anvandarvillkor/)
  include automated tools in the definition of users and state:
  “Du får inte indexera innehållet på vår webb och baserat på detta
  automatgenerera länkar på någon annan webbplats”.
  This is in the list requiring prior permission. Separate clauses prohibit
  bulk copying/storage even without distribution, and copies on another site.
- [Länsförsäkringar terms](https://www.lansfast.se/anvandarvillkor/) state:
  “Du får inte heller utan tillstånd indexera innehållet på vår webb och
  baserat på detta automatgenerera länkar på någon annan webbplats”.
  Their private-use allowance covers isolated copies for later personal
  reading and sharing links, not a general license for this indexed service.

Both sites allow some ordinary private saving/sharing. That does not override
the separate indexing restrictions. Neither broker has an implemented adapter.
Noncommercial use, an owner/invited-user audience, and a shared password do not
create permission. No license reference was fabricated.

[HusmanHagberg terms](https://www.husmanhagberg.se/anvandarvillkor/) explicitly
allow linking from another website, require clear attribution and no distortion,
and restrict reproduction/distribution of protected text and images. No general
recurring database-extraction or republication license was established.
MOHV's linked [privacy policy](https://www.mohv.se/integritetspolicy/) concerns
personal-data processing; no broader usage license was found in the reviewed
navigation. Absence of an explicit prohibition in that reviewed policy is not
a reuse grant. Reassess the actual intended use and current terms before any
recurring collection or display.

### Observed contracts and coverage

| Source / canonical public entry | Observed DOM window | Eligible Stockholm records | Missing facts |
| --- | --- | --- | --- |
| [HusmanHagberg Kommande](https://www.husmanhagberg.se/kopa/?c=true) | 18 property cards; promotional panels are not cards | 1; exclude 10 cards displaying both `Budgivning` and `Kommande®`, then 7 outside the exact municipality allowlist | Type and monthly fee null; price, rooms and living area present |
| [MOHV Snart här](https://www.mohv.se/snart-har/) | First 50 cards in DOM order, from 266 cards actually present in the captured index | 27; 23 location exclusions in the sampled window | All 27 have explicit type, rooms and living area; 11 have price, 16 have null price; all monthly fees null |

HusmanHagberg's public home navigation linked the exact `?c=true` URL.
The source's card grid has direct `div.group` property cards and unrelated
promotional siblings. The parser uses the card's `div.mt-4`, `h3`, area and
municipality paragraph, visible status badges, and `rum`/`kvm`/`kr` spans.
Every included card has `Kommande®` and no contradictory `Budgivning` label.
Three of the four geographic Stockholm matches had that contradiction; they
were excluded, not silently counted as verified upcoming. Canonical links are
`https://www.husmanhagberg.se/objekt/<slug>/<stable-id>/`.

MOHV's ordinary [property navigation](https://www.mohv.se/till-salu/) linked
the exact `/snart-har/` entry. Observed cards are direct
`section.vitec-estate-list-item.is-coming` children of
`section.vitec-estate-list`, with `a.estate-listitem-kommande` and an explicit
`Snart här` badge. The geographic `data-municipality`, `data-county` and
`data-area` attributes are part of that observed public DOM, not a guessed API
schema. County must say `Stockholm` and municipality must independently match
the shared Stockholm-county allowlist exactly. The parser reads displayed
title, rooms, living area, type and price from the named card elements.
`Friliggande villa` explicitly maps to `Villa`; unsupported labels such as
`Parhus`/`Kedjehus` remain null rather than being guessed to mean `Radhus`.
Plot area and unlabelled numeric data attributes are never substituted.
Canonical links are `https://www.mohv.se/objekt/<locality-slug>/<address-slug>/<stable-id>/`.
An out-of-county card with an empty locality URL segment was excluded by its
geography; malformed links on included records fail validation.

Both parsers reject changed required structure, malformed recognized facts,
unsafe or differently bound links, and conflicting duplicate included IDs.
Identical included records are deduplicated explicitly. Unknown/combined floor
areas stay null. No descriptions, photos, seller/contact details, new type
inference, or complete-inventory claims are added. No detail pages were needed.
There was no source paging, query rewriting, API replay, authentication or
challenge workaround.

### Browser dependency evidence and limits

HusmanHagberg used two normal fresh-context Chromium investigation loads.
The first allowed only source-declared runtime, blocked unclassified data reads
and produced no usable cards; it was diagnostic, not a successful empty preview.
It established the anonymous page-initiated public search dependency:

| Origin/path | Role | Observed methods / parameter names |
| --- | --- | --- |
| `assets.cdn.husmanhagberg.se/assets-production/_next/static/` | HTML-declared first-party application scripts/styles | GET |
| `api.husmanhagberg.se/object/api/objects/` | Public card search and coordinates used by that index | GET; `c`, `ps`, optionally `onlyCoordinates`; normal OPTIONS preflight eligible |

The second load narrowly allowed those operations without constructing,
replaying or altering them and rendered the 18 cards. The API-host robots
returned 404: no published policy or reuse grant was established. The runner
checks again on every live run, respects a published policy, tolerates only
that missing-policy status, and rejects denial/other errors. It requires a
successful primary card-search response; coordinates or retained cards alone
are insufficient. Account/session checks, CMS broker-directory reads and
evidenced Next navigation/detail prefetches remain blocked as unnecessary for
this fixed public index. Any other unclassified functional read fails the run.

MOHV used one normal generic-index discovery load and one normal load of its
linked upcoming index. There were no XHR/fetch operations in the successful
upcoming load. Its HTML-declared first-party jQuery, Divi and Vitec
`vitec`/`ractive`/`search` runtime and styles were sufficient. The tool does not
guess/replay a WordPress endpoint. Even the robots-allowed admin-ajax path is
blocked as an unobserved functional operation. Form/lead/contact scripts,
maps, media, Google/reCAPTCHA scripts, ads/analytics, third-party widgets and
unrelated origins are not enabled. An actual access challenge or functional
failure stops the run; none was worked around.

| Investigation browser load | Attempted | Allowed | Blocked | Decoded bytes | Encoded bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| HusmanHagberg dependency discovery | 56 | 24 | 32 | 3,828,752 | 606,516 |
| HusmanHagberg successful card load | 77 | 26 | 51 | 5,615,751 | 659,939 |
| MOHV generic-index discovery | 75 | 33 | 42 | 3,791,411 | 572,431 |
| MOHV upcoming index | 69 | 33 | 36 | 2,840,660 | 493,277 |

These are measured research observations, not future network counts or
Free-tier guarantees. Robots reads are additional and separately bounded.
The initial static HusmanHagberg upcoming and MOHV generic-index attempts
returned 200 but exceeded the 500 KB body limit and were stopped; no large-body
retry or alternate identity was used. Browser documents were larger, but
actual property results fit the existing parser limit: the HusmanHagberg
results region was 78,128 bytes including promotional siblings, and MOHV's
first-50-card region was 87,099 bytes. The committed runner further removes
promotional siblings, images, scripts and unrelated attributes from the saved
results fragment. No DOM, network, production or quota cap was increased.

`scripts/broker-browser.ts` shares safeguards between the two new sources.
Both use fresh contexts, default Chromium identity, blocked service workers,
100 allowed / 200 attempted requests, 12 MB actual decoded traffic, a
30-second browser-phase deadline, 15-second launch/navigation and 10-second
readiness bounds. Images/fonts/media are blocked and still count as attempts.
Fresh robots use the existing 12-second/64 KB bounds. Positive published
`Crawl-delay` is rejected before browser work rather than pretending a startup
sleep enforces it; otherwise the initial two-second wait is retained.
Allowed page/runtime/data HTTP failures, redirects, request failures,
unclassified functional operations, missing cards and visible challenges fail
explicitly, never as retained-card or empty-inventory success.

### Manual private commands and capture identity

The new source-specific parsers share a manual CLI, not a production collector:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-broker.ts \
  --source husmanhagberg --output /absolute/private/hh-preview.json \
  --capture-output /absolute/private/hh-capture.json

./node_modules/node/bin/node --import tsx scripts/preview-broker.ts \
  --source mohv --output /absolute/private/mohv-preview.json \
  --capture-output /absolute/private/mohv-capture.json
```

Each invocation opens only the fixed public upcoming index, takes at most the
first 50 property cards in original DOM order, and closes the browser. There is
no arbitrary URL, paging, filter-rewrite, automatic retry, paid dependency,
recurring job or newly opened app server. Recheck current terms before live use.

Results keep `kind: "<source>-rendered-preview"`, `ingestible: false` and `items`
(including the existing-style computed `id`). `coverage.complete` is always
false and `totalAvailable` always null. `renderedCards` records the authentic
pre-window DOM count; `sampledCards` records the captured card count;
`windowLimit: 50` and `truncated` make the deliberate window explicit.
Exclusions/duplicates apply to that sampled window only. There is no implication
that MOHV's 27 matches exhaust Stockholm, or that no more HH homes exist.

Successful live capture creates one UUID `observationId` and one canonical UTC
`observedAt`. Optional capture output stores a versioned `broker-dom-capture`
envelope with source ID, the same identity/time, pre-window count, minimal DOM,
and its SHA-256 hash. An offline replay preserves them:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-broker.ts \
  --source mohv --from-capture /absolute/private/mohv-capture.json \
  --output /absolute/private/mohv-replayed-preview.json
```

The hash detects mismatched DOM/metadata files; it is **not** a publisher
signature, legal authorization, or proof that arbitrary user-supplied capture
metadata is genuine. Only trusted, actually observed capture files should be
used. Replaying a capture never renews its time, changes its UUID or makes an
old observation fresh. The backend's separate importer owns any controlled
conversion and freshness enforcement; these envelopes are not ingestion feeds.

Bare DOM extraction also works without any network:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-broker.ts \
  --source husmanhagberg --from-html /absolute/private/hh-results.html \
  --output /absolute/private/hh-offline-preview.json
```

Bare HTML has no authenticated capture metadata: `observationId`, `observedAt`,
`renderedCards` and `truncated` are null. The known `sampledCards` remains the
actual number of cards in that fragment. Do not attach “now” or an invented full
page count. A raw DOM containing more than 50 property cards is rejected; the
caller must not hide backend truncation inside an importer.

All outputs are exclusive mode-0600 files outside the checkout, with
symlink-aware repository/existing-file rejection. Stdout contains counts only;
errors are sanitized and exit nonzero. Real DOM, listings and traffic proof stay
in private session files, never fixtures, bundles, logs or public artifacts.
Only anonymized observed-structure fixtures are committed.

```bash
./node_modules/node/bin/node ./node_modules/vitest/vitest.mjs run \
  tests/broker-preview.test.ts tests/notar-preview.test.ts tests/model.test.ts
npm run build
```

These tests use actual Chromium with **all network intercepted**, including
denials, changed operations, request/decoded-byte caps, the exact 266-to-50
window, metadata replay, exclusions, malformed facts and private file handling.
Separate local offline parsing verified the real captured HH and MOHV windows.
The existing Notar parser/behavior is retained; only shared private-file
safeguards/browser limits and genuine Notar live-capture metadata were added.
`collector.ts`, `ingest.ts`, `source-config.ts`, Worker/shared schemas and
production source grants/configuration were not changed by this expansion.

## Existing complete-snapshot collector (unchanged)

`scripts/collector.ts` actually fetches robots and one configured resource,
parses structured HTML or JSON, normalizes facts and rejects invalid data.
The HTML parser supports the explicit `RealEstateListing` contract in the
synthetic fixture. This is **not** proof any named agency emits that contract.
The named Notar DOM preview above is separate; it does not make this generic
HTML contract compatible with Notar or authorize production activation.

The private CI `COLLECTION_CONFIG` JSON secret is an exact-URL allowlist:

```json
[{
  "id": "authorized",
  "format": "json-feed",
  "url": "https://feeds.example.com/approved-upcoming.json",
  "licenseReference": "Reference to a verified license permitting this use",
  "licenseExpires": "2099-01-01T00:00:00Z",
  "allowedListingHosts": ["listings.example.com"]
}]
```

The example is not a working feed or a license. Keep real feed endpoints, tokens
and permission correspondence out of public source control. End users cannot
supply fetch URLs. Redirects, non-HTTPS URLs, credentials in URLs and private
IP resolutions are rejected. Because this is a trusted owner-maintained
allowlist, only known publisher-owned hosts may be configured; never put
user-controlled/dynamic-DNS hosts on it.

Per job: at most 4 sources and one URL per host. Each source gets a fresh robots
check plus **one** content request; no discovery crawl, pagination, browser fleet,
retry loop, API probing or link following. At least 2 seconds between requests;
longer robots crawl delays are honored up to 60 seconds, otherwise fail closed.
Timeout 12 seconds/request, robots 64 KB, content 500 KB. Missing/unreadable
robots, network failures, redirects, unsupported markup and invalid fields fail
the source explicitly. A blocked source's listings are never fetched.

The job sends normalized data to authenticated `POST /admin/ingest`; the Worker
checks a second private `AUTHORIZED_SOURCES` allowlist with source ID, permitted
listing hosts, license reference and expiration. No URL fetch runs inside the
Worker. Snapshot bodies are limited to 100 KB and 50 items; sources are throttled
to one new snapshot/5 minutes. Failed batches roll back in D1. Failures are
reported through `/admin/source-failure` without replacing prior inventory.

## Normalized complete snapshot

```json
{
  "sourceId": "authorized",
  "observedAt": "2026-09-25T06:00:00.000Z",
  "listings": [{
    "externalId": "publisher-stable-id",
    "sourceId": "authorized",
    "status": "upcoming",
    "county": "Stockholms län",
    "municipality": "Stockholm",
    "area": "Södermalm",
    "address": "Exempelgatan 12",
    "type": "Lägenhet",
    "price": 4250000,
    "rooms": 2,
    "size": 56,
    "fee": 3200,
    "url": "https://listings.example.com/publisher-stable-id"
  }]
}
```

All numerical facts may be `null`, never invented zero. `status`, county and a
Stockholm municipality are mandatory. Timestamps must be within an hour of
import; feed timestamps are preserved, not relabeled as fresh. HTML must
explicitly mark `Försäljningsstatus=Kommande`; no status inference from URL.
The fixture explains the supported HTML structured-data fields.

Snapshots are **complete per source**, not pages/deltas. Missing objects become
inactive only on successful import, including an explicitly valid empty JSON
snapshot. Unsupported/empty HTML is a parse failure. Repeated or older snapshots
are idempotent. ID = source ID + publisher's stable ID; first-seen time is
preserved on updates. Cross-agency identity is not guessed from addresses:
two different publishers' IDs can describe the same home. This is disclosed as
a remaining deduplication limitation, not silently merged.

Data older than 48 hours is visibly stale and excluded from alerts. Source
failures preserve last-success timestamps. Inactive inventory expires after
30 days; emailed IDs remain for the membership lifetime to prevent reimport floods.
No inventory is written to Actions artifacts, static bundles or public logs.
