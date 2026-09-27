# Sources and collection status

Initial policy checks: 2026-09-25. Bounded Notar/Bjurfors public-HTML investigation:
2026-09-27, detailed below. Live navigation and listing-index pages were read,
but yielded no extractable property records. No individual property detail page
was fetched and no factual agency parser has been validated. No login, CAPTCHA,
hidden API or bot protection was bypassed. Production source activation remains
empty; these research reads did not ingest or publish inventory.

| Candidate | Evidence | Exact status |
| --- | --- | --- |
| Fastighetsbyrån | [robots.txt](https://www.fastighetsbyran.com/robots.txt) explicitly prohibits automated access without special permission; object/API paths disallowed | Explicitly prohibited without permission; disabled |
| Svensk Fastighetsförmedling | [Terms](https://www.svenskfast.se/om-oss/anvandarvillkor/) prohibit scraping, copying/indexing and automatically generated object links without permission. [Robots](https://www.svenskfast.se/robots.txt) also exclude search parameters `t`, `maxp`, `minp`, `maxr`, `minr`, `maxla`, `minla`, `sw`, `noprice` and several paths | Explicitly prohibited without permission; disabled |
| Bjurfors | [Robots](https://www.bjurfors.se/robots.txt) allow `/` except specified Ragnar/PDF/undefined-office paths; rechecked 2026-09-27. [Boagent terms](https://www.bjurfors.se/sv/mitt-bjurfors/anvandarvillkor/) describe personal-data processing, not a syndication license | Bounded public-HTML requests returned empty HTTP 200 responses; see investigation below. Reuse permission / suitable public license not established; disabled. Do **not** misquote Boagent terms as an explicit scraping ban |
| Länsförsäkringar Fastighetsförmedling | [Robots](https://www.lansfast.se/robots.txt) exclude error and internal application/config/data/Umbraco directories; advertise sitemap | Bounded robots assessment only. Terms/feed license unverified; disabled |
| SkandiaMäklarna | [Robots](https://www.skandiamaklarna.se/robots.txt) exclude `/episerver/`; sitemap advertised | Terms/feed license unverified; disabled |
| HusmanHagberg | [Robots](https://www.husmanhagberg.se/robots.txt) allow `/`; sitemap advertised | Terms/feed license unverified; disabled |
| Notar | [Robots](https://www.notar.se/robots.txt) allow `/`; rechecked 2026-09-27. Linked [Sekretess & Villkor](https://www.notar.se/information/sekretess-villkor) describes personal-data processing | No listing cards in the fetched server HTML; see investigation below. Recurring extraction/republication permission not established; disabled |
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

## Bounded source-specific HTML investigation (2026-09-27)

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

**Result: blocked before factual parsing, not a successful empty inventory.**
Observed property count is zero, but available/upcoming inventory count is
**unknown**. Status, municipality, county, stable ID and numerical facts could
not be validated. There is no normalized source preview or complete snapshot to
import. Adding a source-specific factual parser or structural property fixtures
from this evidence would invent a contract, so neither was added.

This does **not** establish that Notar or Bjurfors cannot be scraped. Notar may
expose records after normal browser rendering; the cause of Bjurfors' empty
response is unknown. The next technical decision is a separately bounded,
authorized rendered-browser investigation or inspection of a compatible public
HTML page, not hidden-API probing or bypassing protections. Browser traversal
does not fit the existing robots-plus-one-content-request collector contract.
Even if facts become readable, complete-source coverage and recurring
republication rights still need assessment. Partial pages must never enter the
complete-snapshot ingestion path, which retires absent listings.

No collector format, allowlist, authorization, request limit, schema, database,
quota or production configuration changed as a result of this investigation.

## Real pipeline, not a claimed live scraper

`scripts/collector.ts` actually fetches robots and one configured resource,
parses structured HTML or JSON, normalizes facts and rejects invalid data.
The HTML parser supports the explicit `RealEstateListing` contract in the
synthetic fixture. This is **not** proof any named agency emits that contract.
An actual source needs a source-specific fixture and validation before activation.

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
