# Membership, privacy and operations

## Access model

Production now uses `ACCESS_MODE=shared`, replacing applications/owner approval with a shared
server password and anonymous guest drafts, asking for email only at saving.
It preserves existing account data and all budgets. Its full API, 0004
migration, same-browser verification, second-confirmation rules, guest retention
and operator-only secret/rotation steps are in [SHARED_ACCESS.md](SHARED_ACCESS.md).
The operator deployed this mode on 2026-09-26 after the additive migration.
The previous owner search and historical reservations were preserved.

## Private listings

The latest user decision supersedes public upcoming facts: only the owner and
invited password holders may browse. Email and AI consent are not required to
browse; they retain separate roles for personal searches. The core goal is early source-direct discovery, not a
promise of complete coverage, arrival before every portal or purchase priority.
No new source authorization accompanies this decision. The last verified
production inventory contains three HusmanHagberg observations from
`2026-09-27T16:07:54.625Z`; they are historical, not refreshed by searches.
No fixture/demo data is automatically substituted. Custom scraping and all
collection workflows have been removed at the owner's request. This local
removal does not mutate stored facts, timestamps, grants, accounts or settings.

`GET /api/listings` runs after existing public/IP rate checks and the shared
guest guard (or approved-member authentication in legacy mode), before parsing
queries or returning any facts/counts/cursors. It requires `serviceReady` and
valid access configuration; disabled/unconfigured service returns explicit
HTTP 503 `gate_unavailable` in shared mode or `not_ready` in legacy mode, not empty
success. CORS, `no-store`, allowed origins, 180/IP/hour and 10,000/day remain
unchanged. The private read boundary alone needs no migration; the separately
implemented observation path below requires additive migration 0005.

| Input | Contract |
| --- | --- |
| `filters` (optional) | JSON of the complete strict `shared/model.ts` Filters object; omitted means default all. Null numeric bounds are unset, not zero. |
| `cursor` (optional) | Opaque base64url keyset, at most 1,400 characters, versioned and tied to normalized filters and the previous `(firstSeen,id)` key. |
| Other/duplicate parameters | HTTP 400 `validation`; even `limit=12` is rejected. The page size is fixed server-side at 12. |
| Invalid/mismatched cursor | HTTP 400 `invalid_cursor`; refresh or begin with no cursor. Query length is capped at 4,096 encoded characters. |

Response contract is strict `PublicListingsPage` in `shared/public-listings.ts`:

| Field | Meaning |
| --- | --- |
| `availability` | `no_sources`: no unexpired source authorization; `empty`: authorizations exist but no eligible records; `ready`: eligible inventory exists, even if filters yield zero matches. |
| `items` | At most 12 explicit factual DTOs, never arbitrary stored JSON or database rows. |
| `total` | Current matching stored eligible finds, at most 200; never the broker's whole inventory. This may change between requests. |
| `hasMore`, `nextCursor` | More current matching facts follow this page; otherwise false and null. |

Private item fields are exactly `id`, `sourceId`, `status`, `county`,
`municipality`, `area`, `address`, `type`, nullable `price/rooms/size/fee`, `url`,
`firstSeen`, `lastSeen` and `coverage` (`complete` or `partial`). Type is nullable,
as are price/rooms/size/fee; missing values display "Ej angivet". There are no source runs, license references, feed
URLs, account/profile/draft/consent fields or internal source error codes.
Browser-known static source names label source links. Only `active=1` records
with validated upcoming status, Stockholms län scope, consistent stable IDs,
current authorization and approved HTTPS hostname pass. Invalid scoped records
are excluded with a count-only server warning; malformed stored JSON produces
an explicit read failure rather than a fabricated empty inventory.

At most the existing 200 inventory rows are read server-side per request.
Canonical `filterSchema` and Swedish-aware `matches` evaluate the whole eligible
collection, not the loaded page or ASCII SQLite lowercasing. Sort is descending
normalized first-seen timestamp, then descending unique ID (ordinal, not locale).
The unsigned cursor is a validated navigation key, not an authorization token.
Newer arrivals cannot shift an offset and duplicate previously read cards;
refresh starts at the newest item. This is a changing feed, not a frozen snapshot.
First seen is this service's observation, **not original publication time**.
Last checked is preserved; facts older than 48 hours remain visibly marked.

The browser sends `credentials:"include"` with `cache:"no-store"`, displays only
its loaded count, and keeps browse filters independent of the personal draft. An explicit "Använd filter"
applies editing controls; changing applied filters resets results/cursor and
aborts obsolete requests. Request generations reject late responses, and a
synchronous guard rejects duplicate load-more clicks. Failed load-more retains
cards with an explicit retry, except access loss clears them. Private reads never create sessions, infer, save
or enqueue mail; only existing traffic-rate counters can change.
The old catalog, private source-run view and all personal/owner APIs stay gated.
The 12-card UI is **not** unlimited collection or Free CPU capacity certification.

### Unknown facts

Unrestricted type browsing includes unknown types. A selected type, type
alternative or exclusion-only type constraint requires a known type; unknown
cannot establish either "Villa" or "not Villa". Unknown type earns no type-wish
score. Numeric `includeUnknown` retains its existing range semantics and never
turns null into zero or overrides a type constraint. Listing schema, private
catalog, filters, deterministic ranking, cards and mail share this model.

## Private observation imports

This is a separate admin-only path, **not** automatic authority to activate sources.
Password-only or noncommercial use is not a license. Parent/operator review of
access, extraction and use conditions remains required; no real grant was
created, source fetched or production record imported during its original implementation.
The subsequent owner-approved manual pilot and actual source outcomes are recorded
in [SOURCES.md](SOURCES.md#manual-private-production-pilot-2026-09-27).

`PRIVATE_OBSERVATION_SOURCES` defaults to `[]`. Each configured entry has
`id`, exact `hosts`, `expiresAt` and `basisReference`: a truthful private
reference to the operator's reviewed usage basis, not an invented
`licenseReference`. The existing licensed `AUTHORIZED_SOURCES` stays separate.
Duplicate/overlapping IDs, malformed grants and more than **four combined
sources**, including configured expired entries, fail closed. Remove an old
entry explicitly before changing its capability. Neither grant type implies
the other. Browsing checks each record's provenance and current corresponding
grant/host; a private record never becomes licensed merely by changing flags.

`POST /admin/observations` uses the existing infrastructure bearer credential,
not a guest or member cookie. It accepts only `shared/observations.ts`:

```text
kind: "listing-observations"
version: 1
observationId: UUID retained from the capture
sourceId: known source ID
observedAt: canonical UTC ISO timestamp, e.g. YYYY-MM-DDTHH:mm:ss.sssZ
coverage: "partial"
items: 0..50 strict ListingInput facts, each with the same sourceId
```

Items contain externalId, sourceId, upcoming status, Stockholms län, a known
municipality, area/address, nullable type/price/rooms/size/fee and an approved
HTTPS URL. IDs must be unique within the batch. Backend-owned id/firstSeen/
lastSeen, descriptions, photos and contact fields are rejected.
New batches require genuine capture time within the previous hour, never a
future timestamp. A captured page that ages out is not relabeled as "now".

The entire request is at most 100,000 bytes. One accepted new batch per source
per five-minute bucket applies jointly to complete and partial imports.
Inventory remains at most **200 stored records**, including inactive records.
A 51-item batch or capacity overflow fails explicitly; nothing is truncated.
The response is `{accepted:true,duplicate,coverage,count,inserted,updated,
ignored,retired}`. Counts account for submitted records; partial `retired`
is always zero. Ignored records are older or unchanged observations, not
silently dropped capacity overflow.

### Atomicity, ordering and retention

Additive `0005_private_observations.sql` adds provenance, ingestion receipts
and per-source complete-snapshot ordering state. Migrations 0001-0004 and all
account/profile/consent/seen/quota data remain unchanged. Existing source
success timestamps seed the complete-snapshot watermark.

A single receipt insert executes an atomic SQLite trigger: conflict checks,
source-rate reservation, capacity-checked upserts, applicable retirement,
provenance and source metadata succeed together or roll back. The receipt's
temporary payload is cleared in the same transaction; persisted receipts
contain hashes/timestamps/counts, not copied listing facts.

Only explicitly seen IDs are inserted/updated by partial batches. Existing
firstSeen is retained; newer genuine observation times update facts/lastSeen.
Older disjoint pages can add their observed IDs, but cannot overwrite a newer
ID. Same UUID with different canonical content or equal-time conflicting
facts gives 409. Concurrent identical retries apply once. Exact receipt replay
returns the recorded counts without refreshing listing/source timestamps.

Complete snapshots retain their separate `/admin/ingest` contract and licensed
authorization. Only a newer complete snapshot can retire missing IDs, and not
records observed after that snapshot. The durable complete watermark prevents
an older partial page from resurrecting absent records. Partial/empty/failed
pages never retire anything. Absence is not evidence of sale. New complete
snapshots older than the watermark fail explicitly.

Receipts are retained for **48 hours**, longer than the one-hour new-batch
window, and pruned by existing cleanup. Exact authorized replay while its
receipt exists remains idempotent even after the new-acceptance window.
After pruning, old evidence fails age validation. Unrefreshed inventory retains
the existing 30-day cleanup and 48-hour stale disclosure. A delayed capture
does not clear a source failure newer than its observation time.

### Controlled importer

`scripts/import-observations.ts` accepts only an already structured
`listing-observations` JSON envelope. It validates the strict shared schema,
source/host authorization and original observation identity/time. It does not
fetch sources, parse HTML/DOM, infer missing facts, convert legacy preview
formats or turn partial data into complete snapshots. Legacy preview kinds,
computed item IDs, copied content and invented backend timestamps are rejected.

Set the reviewed private allowlist in the operator's private environment,
not the public repository. Preparation makes **no network requests**:

```sh
./node_modules/node/bin/node --import tsx scripts/import-observations.ts \
  --prepare /absolute/private/observations.json \
  --output /absolute/private/new-observation-envelope.json
```

The output must be new, outside the checkout, in an existing private directory;
it is written exclusively with mode 0600. Existing files/symlinks are not
overwritten. To send separately, explicitly configure `INGEST_API_URL` as
the exact HTTPS admin origin and `INGEST_TOKEN` privately, then:

```sh
./node_modules/node/bin/node --import tsx scripts/import-observations.ts \
  --send /absolute/private/new-observation-envelope.json
```

Only explicit `--local` permits `http://127.0.0.1:<port>` for synthetic tests.
Redirects are refused. The importer does not fetch brokers, inspect raw API
responses, automatically enroll sources or retry with a new identity. stdout
has counts only; failures are sanitized. Observation metadata is trusted
operator-supplied evidence, not a cryptographic attestation of broker consent.

### Manual private browser runner

**Removed on the owner's request, 2026-09-27.** The manual observation workflow,
the older scheduled collector, source-specific browser/HTML parsers and preview
commands no longer exist in the source tree. Historical run IDs and outcomes
remain in [SOURCES.md](SOURCES.md#manual-private-production-pilot-2026-09-27);
they are not instructions to run an old workflow or restore an old checkout.
The unshipped on-demand feature, Browser Worker/Durable Object configuration and
unapplied migration 0006 were also removed. Migrations 0001-0005 are unchanged.
Publishing the cleanup removes the collection workflow definitions from the
active branch. Secrets, deployed Workers and D1 state are unchanged; old GitHub
workflow history is retained.

### Property emails remain paused

`PROPERTY_EMAILS_ENABLED` is a separate default-off capability. Only exact
`"true"` plus existing service readiness and licensed sources can make
authenticated `alertsReady` true. Do **not** enable it in this phase.
Inventory/source presence or a private grant alone never enables alerts.
Gate/me/catalog expose readiness separately from browsing availability.

Activation, member/legacy saves, guest save intent and final confirmation,
digest enqueue and dispatch enforce the capability. Existing queued digests
are expired without sending or marking unseen IDs; uncertain prior attempts
retain `delivery_uncertain`. Verification/login mail still uses the existing
provider/outbox/quotas. Private-observation provenance is excluded from digest
preparation and send-time rechecks even if email enablement is later approved.
The only enabled email flag added here is an explicit **synthetic test binding**
for pre-existing mail regression cases, not production configuration.

### Replacement collection is only under assessment

ScraperAPI is being assessed separately, not integrated. There is no replacement
runner, provider key, automatic collection or new schedule. A provider cannot
grant broker/database rights or justify bypassing robots, access controls or
explicit source restrictions. Any future integration needs separate approval,
source-specific permission review and a verified free-tier budget. It must feed
the retained strict observation/snapshot boundaries, preserve original times
and never label a partial page as a complete snapshot. Existing cleanup and
technical-email processing remain unchanged; property emails remain off.

### Legacy membership mode

The following application/approval behavior applies when `ACCESS_MODE=membership`,
which remains the local default, not the active production mode.

The public Pages bundle contains code and an explicitly synthetic demo, never
real inventory. Real facts require the separate authenticated bounded API.
`GET /api/status` exposes configuration readiness and capacity, never owner
identity, real listings, source-run results or member data.

Application creates `unverified`. A 256-bit random, SHA-256-hashed email token,
valid 30 minutes, is emailed through the encrypted outbox. Explicit confirmation
POST creates a session and moves new applicants to `pending`. **Pending is not
approved.** Only the exact privately configured `OWNER_EMAIL`, verified through
the same email link, gets the owner role and approved access automatically.
There is no first-user admin or client-supplied role. `owner_slot` is a capacity
reservation only; authorization always compares the verified address with server
configuration. Keep that identity fixed; account changes require an explicit
operator migration/review.

Authenticated owner controls:

- `GET /api/admin/members`: at most 40 accounts and application text.
- `POST /api/admin/review`: approve/reject verified pending applicants, or revoke
  approved members. All transitions are transactionally conditional and audited.
  An owner cannot revoke their own role through this endpoint.

Approval invalidates previous sessions, queues an informational notice and leaves
alerts **off**. The member logs in again and explicitly saves/enables a search.
Rejection/revocation invalidate sessions and delete pending/sending messages.
Every private catalog, personal search and owner operation checks the session and membership in D1,
not a frontend role claim. Searches always use the authenticated member ID; extra
fields such as `memberId` or `role` are rejected.

Sessions expire after 12 hours, are random/unpredictable derived tokens stored
only as hashes server-side, and currently use `HttpOnly; Secure; SameSite=Strict;
Path=/` cookies in HTTPS (`__Host-kk_session`). Local HTTP uses a non-Secure cookie
only for local development. All public mutation routes require exact configured
Origin and JSON; CORS never uses `*` or origin reflection. A revoked member cannot
reuse a valid-looking cookie. Token replay can reuse its existing live session,
but cannot recreate a logged-out or revoked session. Email links put tokens in
the URL fragment, strip it immediately into memory, use no-referrer and require
an explicit POST to avoid scanner side effects.

**Approved hosting:** the HTTPS frontend at `kommandekollen.se` and API at
`api.kommandekollen.se` are same-site, but still different origins. The owner
approved Cloudflare Free authoritative DNS while retaining Inleed as registrar,
so an active Cloudflare zone can support the API Worker Custom Domain. Preserve
host-only `__Host-kk_session` cookies on the API: do not add a `Domain` attribute.
All private frontend fetches, including listing pages, require
`credentials: "include"` and no-store. The API allows only
the exact `https://kommandekollen.se` origin with credentialed CORS. SameSite
does not replace these Origin checks. No bearer-token redesign is needed.
Cloudflare DNS and the API custom domain are active with API TLS verified.
GitHub's frontend HTTPS certificate is approved and HTTP redirects to HTTPS. See
DEPLOYMENT.md for migration safeguards. The initial `github.io` shell is not a
supported login origin; do not weaken cookies to support cross-site login.

## Mail reliability and limits

Resend Free: 100 messages/day and 3000/month (confirmed at task start).
App caps are deliberately lower: **80 attempted sends per UTC day**, **2400 per
UTC month**, **20 non-digest attempts/day**, including retries, login, verification
and approval notices. A dedicated Resend account/project budget is necessary:
other uses of the same provider quota are not visible to this app.

There are at most **39 ordinary accounts + 1 owner** (pending/rejected/revoked
accounts also take capacity until retention/deletion), 200 stored listings,
50 per source snapshot, one search per member and 20 objects per digest.
New applications stop visibly when full; login responses do not enumerate email
addresses. IP HMAC buckets limit login/application attempts to 3/hour; email
HMAC buckets to 1/hour, global login requests to 50/day. Public API requests are
capped at 10,000/day, with 180/IP/hour. Saturated buckets stop generating new
writes. Cloudflare's own network/abuse limits remain necessary; application
limits are not a substitute for DDoS protection.

Production cron is enabled and runs every minute. Cleanup was enabled before
membership applications. Each invocation does bounded cleanup, prepares at most
one member's digest during **07:00–09:59 Europe/Stockholm**, and dispatches at
most one queued mail. DST uses Intl's IANA zone, not a fixed UTC offset. This
is a dispatch window, not a promise of delivery precisely at 07:00. The complete
inventory is at most 200 small factual records, with no Worker HTML parsing or
browser automation. Actual production CPU time under the Free 10ms limit still
needs measurement before widening the pilot; local tests cannot certify that
Cloudflare production budget.

The first active-owner sample reported p50 2.467 ms and p99 14.147 ms CPU,
with no reported runtime errors. The p99 exceeds the nominal Free 10 ms limit.
Keep the pilot bounded and investigate capacity before approving a wider group;
do not interpret either startup time or successful requests as a guarantee
that the configured maximum workload fits Free.

D1 triggers transactionally reserve daily/monthly/non-digest quota before each
provider attempt. Concurrent calls cannot overrun the cap. Reservations are not
refunded on failure: conservative accounting is safer than assuming no delivery.
The outbox is AES-GCM encrypted at rest with a domain-separated key derived from
`TOKEN_SECRET`; raw login tokens exist only inside that encrypted queue until sent.
Mail bodies and recipient addresses are never logged.

A 5-minute lease prevents simultaneous sends. Immutable message IDs are Resend
idempotency keys and retry bodies never change. Network/429/5xx errors retry with
bounded exponential delay, at most 5 attempts and within 23 hours of the first
attempt (inside Resend's 24-hour deduplication window). Login mail expires after
25 minutes so expired links are not newly dispatched. Known permanent provider
errors stop the message and retain unseen matches.

On accepted provider response, marking the outbox sent and recording seen IDs
are one D1 transaction. A crash before that transaction is retried under the same
idempotency key. A failed send never consumes unseen objects. Older-than-48-hour
inventory, removed listings and expired source permissions are excluded before
send. Approval and alert opt-in are rechecked immediately before calling Resend.
A message already in flight at revocation/deletion cannot be recalled; the UI
states this boundary.

If delivery becomes ambiguous after the retry window/attempt cap, the record is
`expired / delivery_uncertain` and the member's further digests are quarantined.
It is **not** blindly regenerated under a new key. Inspect the Resend record by
outbox ID, reconcile accepted IDs into `seen`, then resolve the record through
an explicit authenticated operator DB operation. Never mark unseen as sent
without evidence. Resend acceptance is not proof of inbox delivery; provider
bounce/complaint handling and deliverability need real-account validation.

## Operator visibility

`GET /admin/status` requires the private infrastructure bearer token and returns
aggregate membership/outbox states, quota usage and source freshness. It omits
emails and mail content. `POST /admin/tick`, `/admin/ingest` and
`/admin/source-failure` require the same secret; there is no public cron or admin
bootstrap endpoint. The owner review API instead requires the verified owner
session; the infrastructure key never creates a member session.

Errors have stable codes. Worker logs contain only allowlisted event/error codes,
not input, email, tokens, provider body or response payloads. The ingestion job
logs generic success/failure only; detailed status is private in D1. Do not enable
full request/body logging or upload `.wrangler`, feed snapshots, `.dev.vars`,
private browser traces or database dumps to public CI artifacts.

## Retention and deletion

| Data | Retention |
| --- | --- |
| Unverified application | 48 hours |
| Verified waiting application | 30 days |
| Rejected/revoked account | 30 days after decision |
| Approved membership + own search + seen IDs | 180 days after approval |
| Session | 12 hours, or immediate logout/revocation/deletion |
| Shared-mode guest session | 12 hours; credential rotation denies access immediately |
| Guest draft / save challenge / gated email-login binding | 30 minutes; associated state cascades on logout/deletion/revocation |
| HMAC rate buckets | At most two bucket periods (up to 48 hours) |
| Provider attempt metadata | 35 days, no address or message body |
| Sent/failed/expired ordinary outbox metadata | 7 days; content cleared on terminal state |
| Ambiguous delivery metadata | Until resolved or member expires/deletes |
| Quota totals | Current and recent months, pruned after the 65-day cutoff month |
| Inactive/unrefreshed inventory | 30 days |
| Pseudonymous owner decision audit | 180 days |

When the scheduler is enabled, cleanup runs even when signups/delivery are
disabled. Enable scheduled cleanup before accepting personal data.
Deleting a member cascades
through sessions, saved preferences, outbox and seen IDs in the active database.
Audit IDs are pseudonymous, not raw email. Operational audit processing should
be included in the controller's finalized privacy/legal-basis assessment.
Provider backups/PITR, Resend delivery logs, data-processing agreements and any
international transfer terms need owner review and accurate published retention
before launch. Do not promise instantaneous erasure from providers' backups.

The owner approved the published controller identity Marcus Bodin (privatperson)
and public contact kontakt@kommandekollen.se. This does not disclose the private
owner-login email. The disclosure is not a substitute for the controller's
provider/retention assessment. No advertising/analytics trackers are included.

The production D1 database was created with EU jurisdiction. Selecting Ireland
for Resend controls the sending region, not account-data residency: Resend states
that account data, email metadata, logs and API records are stored in the US.
Reflect that distinction and the applicable provider/transfer arrangements in
the finalized privacy information; do not claim that all service data stays
inside the EU. See [Resend region documentation](https://resend.com/docs/dashboard/domains/regions).

## Safe maintenance

To pause new applications and delivery during an incident, set
`SERVICE_ENABLED=false` and `AI_ENABLED=false` and redeploy the production
environment. Keep cleanup scheduled for retained personal data. Do not roll
back applied migrations or replace the source allowlist with unverified feeds.
Existing approved sessions remain subject to the server's authorization and
expiry checks. Do not change
`TOKEN_SECRET` casually: it protects encrypted queued payloads, HMAC pseudonyms,
unsubscribe signatures and session derivation. For rotation, first stop sends,
resolve/delete queued secrets, invalidate all sessions/tokens and coordinate
account reauthentication; old unsubscribe links will not validate under a new
key. Never rotate into silent mail loss.

Use only Free plans, no automatic upgrades. Public-repository Actions are
bounded and do not store inventory. On request/CPU/D1/provider limit errors,
fail closed, surface the error and reduce load. No paid overage is authorized.
