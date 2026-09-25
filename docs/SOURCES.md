# Sources and collection status

Checked 2026-09-25. No live listing page was scraped in this implementation.
No live agency adapter has been validated. Robots files and the primary terms
below were read; no login, CAPTCHA, hidden API or bot protection was bypassed.

| Candidate | Evidence | Exact status |
| --- | --- | --- |
| Fastighetsbyrån | [robots.txt](https://www.fastighetsbyran.com/robots.txt) explicitly prohibits automated access without special permission; object/API paths disallowed | Explicitly prohibited without permission; disabled |
| Svensk Fastighetsförmedling | [Terms](https://www.svenskfast.se/om-oss/anvandarvillkor/) prohibit scraping, copying/indexing and automatically generated object links without permission. [Robots](https://www.svenskfast.se/robots.txt) also exclude search parameters `t`, `maxp`, `minp`, `maxr`, `minr`, `maxla`, `minla`, `sw`, `noprice` and several paths | Explicitly prohibited without permission; disabled |
| Bjurfors | [Robots](https://www.bjurfors.se/robots.txt) allow `/` except specified Ragnar/PDF/undefined-office paths; sitemap advertised. [Boagent terms](https://www.bjurfors.se/sv/mitt-bjurfors/anvandarvillkor/) describe personal-data processing, not a syndication license | Reuse permission / suitable public license not established; disabled. Do **not** misquote Boagent terms as an explicit scraping ban |
| Länsförsäkringar Fastighetsförmedling | [Robots](https://www.lansfast.se/robots.txt) exclude error and internal application/config/data/Umbraco directories; advertise sitemap | Bounded robots assessment only. Terms/feed license unverified; disabled |
| SkandiaMäklarna | [Robots](https://www.skandiamaklarna.se/robots.txt) exclude `/episerver/`; sitemap advertised | Terms/feed license unverified; disabled |
| HusmanHagberg | [Robots](https://www.husmanhagberg.se/robots.txt) allow `/`; sitemap advertised | Terms/feed license unverified; disabled |
| Notar | [Robots](https://www.notar.se/robots.txt) allow `/`; sitemap advertised | Terms/feed license unverified; disabled |
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
