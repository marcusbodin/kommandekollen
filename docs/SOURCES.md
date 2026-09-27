# Sources and collection status

Initial policy checks: 2026-09-25. Bounded Notar/Bjurfors public-HTML investigation:
2026-09-27, detailed below. Static index HTML yielded no property records.
A subsequently authorized normal-browser Notar investigation rendered 24 explicit
upcoming cards; the named DOM parser extracted 13 Stockholm-county records into
a private, incomplete preview. No individual detail page was fetched, and no
login, CAPTCHA, private API or bot protection was bypassed. Production source
activation remains empty; research did not ingest or publish inventory.

| Candidate | Evidence | Exact status |
| --- | --- | --- |
| Fastighetsbyrån | [robots.txt](https://www.fastighetsbyran.com/robots.txt) explicitly prohibits automated access without special permission; object/API paths disallowed | Explicitly prohibited without permission; disabled |
| Svensk Fastighetsförmedling | [Terms](https://www.svenskfast.se/om-oss/anvandarvillkor/) prohibit scraping, copying/indexing and automatically generated object links without permission. [Robots](https://www.svenskfast.se/robots.txt) also exclude search parameters `t`, `maxp`, `minp`, `maxr`, `minr`, `maxla`, `minla`, `sw`, `noprice` and several paths | Explicitly prohibited without permission; disabled |
| Bjurfors | [Robots](https://www.bjurfors.se/robots.txt) allow `/` except specified Ragnar/PDF/undefined-office paths; rechecked 2026-09-27. [Boagent terms](https://www.bjurfors.se/sv/mitt-bjurfors/anvandarvillkor/) describe personal-data processing, not a syndication license | Bounded public-HTML requests returned empty HTTP 200 responses; see investigation below. Reuse permission / suitable public license not established; disabled. Do **not** misquote Boagent terms as an explicit scraping ban |
| Länsförsäkringar Fastighetsförmedling | [Robots](https://www.lansfast.se/robots.txt) exclude error and internal application/config/data/Umbraco directories; advertise sitemap | Bounded robots assessment only. Terms/feed license unverified; disabled |
| SkandiaMäklarna | [Robots](https://www.skandiamaklarna.se/robots.txt) exclude `/episerver/`; sitemap advertised | Terms/feed license unverified; disabled |
| HusmanHagberg | [Robots](https://www.husmanhagberg.se/robots.txt) allow `/`; sitemap advertised | Terms/feed license unverified; disabled |
| Notar | [Robots](https://www.notar.se/robots.txt) allow `/`; rechecked 2026-09-27. Linked [Sekretess & Villkor](https://www.notar.se/information/sekretess-villkor) describes personal-data processing | Static HTML has no cards; ordinary rendering yielded 24 upcoming cards / 13 Stockholm records in a private partial preview. Recurring extraction/republication permission and complete coverage not established; production disabled |
| Erik Olsson | [Robots](https://www.erikolsson.se/robots.txt) exclude `/api/*`, `/dashboard/*`, `/password`, `/beta`; sitemaps advertised | Terms/feed license unverified; disabled; API exclusions must be respected |
| MOHV | [Robots](https://www.mohv.se/robots.txt) exclude `/wp-admin/`, allow its admin-ajax path; page/office/post sitemaps advertised | Terms/feed license unverified; disabled |
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
checks use the existing 12-second/64 KB bounds, followed by at least two seconds
(or the published crawl delay, capped at 60 seconds) before the page load.
The website's own functional requests run normally within that explicit browser
budget; this is not the production collector's two-request budget.

To reproduce extraction from an already captured DOM with **no network**:

```bash
./node_modules/node/bin/node --import tsx scripts/preview-notar.ts \
  --from-html /absolute/private/notar-rendered.html \
  --output /absolute/private/notar-offline-preview.json
```

Offline extraction does not invent a new capture/last-seen timestamp.
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
