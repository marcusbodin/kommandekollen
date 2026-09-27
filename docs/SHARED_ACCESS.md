# Shared password and email-at-save mode

The operator activated `ACCESS_MODE=shared` on 2026-09-26 after applying additive
0004 and deploying the matching backend/frontend. Incorrect-password and
unauthenticated API guards were checked in production; the correct-password
guest email-save path was subsequently confirmed working by the user. This is
not production capacity certification. Missing `ACCESS_MODE` or the value
`membership` retains the previous owner-approved membership mode. Other values
fail closed. Existing accounts, saved profiles, consent, seen IDs, sessions and
all prior AI reservations are preserved by migration `0004_shared_access.sql`.
Migrations 0001-0003 are immutable.

## Visitor flow

The isolated input-first frontend was published on 2026-09-27 through Pages
run `36299417326`; no Worker, secret, configuration or migration changed.
The user's subsequent correction restores a lightweight website shell around
that public input: existing wordmark, navigation, purpose copy and footer with
privacy/contact/copyright. The later user decision makes a separate upcoming
feed public while retaining the gate for AI and saved searches. That choice is
now superseded: real listings are private, for the owner and invited people.
The new boundary requires matching Worker and Pages changes, not a secret
rotation or migration. Publication status belongs to DEPLOYMENT.md.

The product goal is early discovery directly at brokers, before larger portals,
not an all-source or first-buyer guarantee. Optional AI clarifies wishes; private
reading/filtering uses none. The homepage explicitly frames that discovery goal
as "Vi bygger". The supporting statement "Hitta kommande bostäder före andra"
and initial "Hitta bostad" action do not change that goal into proven coverage.
Zero connected sources remains an honest empty state; the prompt helper explains
that the gated AI action creates a search proposal, not a saved profile.

Describe a home locally -> explicitly send -> enter the shared password if
needed and explicitly consent to Cloudflare processing -> interpret -> review
the draft -> explicitly choose saving -> enter email -> open its link in the
same browser -> explicitly verify -> review again and explicitly confirm saving.
Email verification creates account identity, **not a saved profile or alerts**.
No ready sources means paused saving only. Existing approved email sessions
can manage their own search after passing the shared gate; they do not need to
verify again for every edit. The owner keeps the existing saved search and role.

Site navigation exposes "Så fungerar det", "Konto"/"Min sökning" and "Integritet".
On mobile these are under "Meny", together with manual filters without AI,
saved drafts, account/login/logout/owner tools, quota and results/source status.
The old input-level "Mer" is removed. Privacy/contact is also in the footer.
Manual review and account login request the gate when needed but never AI
consent or inference. The existing backend remains the authorization boundary.
The supplied local house/radar logo stays. The latest layout places the prompt
left and "Vad är viktigt i ditt nästa hem?" right over a decorative home-photo
background, with text-before-input on mobile. Expanded personal panels share the
same mounted flow and use full-width opaque surfaces below the pair.
The old inspiration card stays removed, including legacy/demo and the public feed.
The pinned palette supplies teal details and pale-pink actions; a native serif
display complements the unchanged sans-serif controls.
Decorative borders are replaced by soft shadows and filled pink/teal/mint
controls. Keyboard focus and native control affordances remain. Disabled
buttons retain their color but not elevation or submission ability; no
validation, request locking or consent rule is changed by this presentation.

Password success is not implicit consent. The unchecked processing checkbox and
one explicit awaited continuation are required before inference. A synchronous
submission lock prevents double-click/Enter duplication; cancellation aborts
the check and settles the pending intent without submitting the retained text.
The current draft's ordinary followups reuse its explicit in-memory consent;
reload/new draft requires it again. There are no automatic AI retries.
Text is not persisted in browser storage. Gate/password is never stored in JS
storage; only the existing server cookie persists.

Reload shows the compact website shell, not previous private panels;
"Fortsätt utkast" explicitly retrieves the existing
server draft without inference. The email action's return link uses client-only
`?review=1` to show that draft for the required second review. `?info=privacy`
opens public privacy details, also reachable from inside the consent dialog.
`?info=help` explains the real describe/clarify/review flow and same-browser email
verification plus second confirmation. Logo/menu/information interactions keep
the textarea mounted and retain its text. None of these client query parameters
changes authorization, consent or any backend contract.
Model/provider errors, exhausted quota and save receipts stay visible and
focused. No-source paused-only saving and old saved-profile versions are intact.

The gate is shared access, not proof of personal identity or an unlimited
public service. Anyone who knows it may create a guest session. A revoked
account stays blocked, but someone who still knows the shared secret can start
a new anonymous guest session; change the shared secret if access must end.
New/unverified/pending accounts become approved only after a fresh, gated email
verification. Rejected/revoked accounts are never reinstated automatically.
Old pending sessions and old email tokens cannot silently upgrade access.
Shared mode removes applications and manual approve/reject actions; owner-only
revocation remains. Only the exact private `OWNER_EMAIL` grants the owner role.

## Server contract

Every private consumer route, including existing member AI, catalog, login,
confirmation and owner routes, requires a valid gate in shared mode.
Infrastructure `/admin/*` keeps its independent server secret.
Signed POST `/api/unsubscribe` remains ungated for deletion.
The public `/api/status` adds `accessMode`; it exposes no guest/member details.
`GET /api/listings` requires the shared guest gate, or an approved member in
legacy mode, before query validation, listing facts, counts or cursors are read.
Its explicit facts-only DTO, whole-inventory filters and 12-item pagination are
documented in [OPERATIONS.md](OPERATIONS.md#private-listings).
The frontend uses credentialed no-store requests. Explicit password entry
creates a bounded guest session; browsing/filtering/loading more creates no
account, draft, AI attempt, save or email. The browse-only entry does not probe
email identity or request AI consent. Existing traffic-rate buckets still apply.
The old `/api/catalog` remains private, not exposed wholesale to anonymous users.

Logout, expiry and observed access loss clear in-memory listings, cursors,
catalog and private panels, abort requests and reject late responses. Local
logout notifies other tabs without sending credentials. Hidden pages conceal
private listings and revalidate on return; visible sessions check at most once
per minute, with local expiry enforcement. Remote rotation/revocation is
detected on the next server check, not through an instantaneous push. A guest's
expected account-only 401 does not invalidate an otherwise valid password gate.
The housing-text node remains mounted and its unsent text survives access loss.

| Route | Contract |
| --- | --- |
| POST `/api/gate` | `{password}`; checks rates before comparison, sets guest cookie |
| GET `/api/gate` | `{open:true,expiresAt,aiReady,pendingSave,hasDraft,quota:{remaining,limit:6,day}}`; expiry is epoch milliseconds, not a credential fingerprint |
| POST `/api/gate/logout` | `{}`; deletes current guest and its draft/challenge; clears guest and account cookies |
| GET `/api/guest/preferences/draft` | `{draft,aiReady,quota,saveIntent}`; own ready draft only; intent is null or `{id,verified,enabled,acceptUnverified}` |
| POST `/api/guest/preferences/interpret` | Same draft request as member API, but `expectedVersion:0`; explicit `aiConsent:true` |
| POST `/api/guest/preferences/draft` | Same manual review request, `expectedVersion:0`; no inference |
| POST `/api/guest/preferences/cancel` | `{id}`; own draft/challenge only |
| POST `/api/guest/preferences/save` | `{id,revision,expectedVersion:0,enabled,acceptUnverified,consent:true,email,website:""}`; generic 202, queues verification only if eligible |
| POST `/api/guest/preferences/verify` | `{token}`; same gate/browser, one-time email verification; sets account session, no save |
| POST `/api/guest/preferences/confirm` | Review fields plus `challengeId`, without email; requires guest and verified account session; atomic exact-version save |

`Draft` and profile validation/matching stay as documented in PREFERENCES.md.
Guest draft baseVersion zero is not an existing member search version. At the
first explicit save request, the server privately snapshots the destination
account's actual search version. The challenge binds that version, member ID,
guest ID, draft ID/revision, enabled state and manual-check acceptance. Before
email verification it returns neither the destination profile nor its version.
Final confirmation checks both identities and the entire stored intent, not
client-supplied profile data. Changing a draft deletes its old challenge.
Concurrent email requests share the existing per-email rate limit.

Tokens are random 256-bit values stored as SHA-256 hashes. Email tokens are URL
fragments, immediately removed into memory (including same-page hash navigation).
GET does not verify or save. Wrong-browser, expired, replayed or swapped claims
fail visibly; use the original browser or request a new link after reopening
access. No recovery can skip email verification or save consent.

## Bounds, privacy and rotation

The high-entropy shared credential must be **64 lowercase hexadecimal
characters**, generated privately by the operator from 32 cryptographic random
bytes. It is not a human-chosen password. Fixed-size hashes are compared without
an early mismatch exit; no expensive human-password KDF is needed. Neither
credential nor its fingerprint is sent to the frontend or stored in a bundle,
localStorage, logs or source. Request rates are checked before comparison:
5 attempts/IP/15 minutes and 50 globally/hour, in addition to the existing
180 requests/IP/hour and 10,000 public requests/day.

The API sets an unpredictable `__Host-kk_guest` cookie: host-only, HttpOnly,
Secure, SameSite=Strict, Path=/, at most 12 hours. Local HTTP fixtures alone use
`kk_guest` without Secure. Guest session tokens are hashed at rest. Each row has
a server-derived credential fingerprint, checked on every gated request.
Changing the secret invalidates old gates immediately, including gates paired
with existing member cookies. Successful new gate entry removes obsolete
fingerprint rows; ordinary expiry cleanup runs on schedule.

Capacity is **200 guest sessions**, enforced transactionally in D1, and the
existing **40-account** cap, including unverified accounts, remains. One guest
draft expires after 30 minutes. Email save challenges and gated-login bindings
expire after 30 minutes; requesting a save extends that exact draft by at most
30 minutes, never beyond the guest session. Cleanup deletes expired state.
Revocation/deletion removes linked guest sessions and cascades their drafts and
challenges. Closing guest access deletes its temporary state, not saved searches.
Account logout deletes member sessions and linked guest state. No raw prompt or
full chat transcript is retained. The existing controller/contact is unchanged.

AI remains the same fixed free-eligible model with **1,000 reserved neurons per
attempt**, **6,000 globally per UTC day**, six per member/guest identity and IP,
two unresolved globally and one per identity. A guest verified into an account
uses that account's identity for subsequent inference. Prior anonymous and
member reservations are never rewritten or refunded. Clearing cookies or
deleting an account cannot reset global/IP usage. Remaining quota is a snapshot,
not a promise to reserve a slot. Three interpretations per draft remains a
separate limit. No automatic retry, paid fallback or AI on daily listing runs.

Mail keeps the original 80/day, 2,400/month and 20 non-digest/day attempt limits,
including shared-mode verification. Generic email responses prevent account
enumeration; they are not a delivery guarantee. Mail failure/quota states remain
explicit in the outbox. This is not Free-capacity certification: the initial
production CPU p99 was about 14.147ms, above nominal Free 10ms, despite no observed
runtime CPU errors in that bounded sample. No billing change is authorized.

## Operator rollout (not performed by implementation)

1. Keep the existing production mode while applying only additive 0004 through
   the verified atomic file runner. Do not use remote Wrangler migration
   statement splitting or edit prior migration history.
2. Generate the shared secret in the owner's private local terminal and pipe or
   enter it into `wrangler secret put SHARED_ACCESS_PASSWORD --env production`.
   Do not print it in chat, terminal transcripts, CI logs, source or notes.
   Use the actual configured account; never rotate TOKEN_SECRET or ADMIN_TOKEN.
3. Deploy matching Worker/frontend with the existing mode first. Then explicitly
   set the production variable `ACCESS_MODE=shared` and deploy to activate.
   Missing/malformed secret fails closed; AI_ENABLED and SERVICE_ENABLED retain
   their separate controls.
4. Verify gated owner login preserves the existing saved version/profile.
   Check unauthenticated old/new AI paths deny access. Perform the consented
   guest email + second-confirm smoke within the existing shared daily quota.
   Apply a temporary disabled AI flag rather than resetting reservations if
   there is insufficient evaluation budget.
5. To rotate, replace only SHARED_ACCESS_PASSWORD with a new private random
   value. Guests must re-enter it and request new links for interrupted saves;
   saved accounts/searches are retained. To stop shared mode, explicitly switch
   ACCESS_MODE back to membership or disable service/AI; keep cleanup enabled.

Local tests use obviously synthetic, non-production credentials and reserved
example email domains. Worker/D1 tests exercise migration preservation,
authorization, isolation, races, budgets and cascades. Browser tests use actual
loopback HTTP -> Worker -> D1, with only model and email provider substituted;
they do not prove live provider quality or production capacity.
