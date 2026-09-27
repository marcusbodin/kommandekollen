# Deployment and launch status

## Custom collection removal, 2026-09-27

The owner cancelled on-demand scraping and requested removal of all custom web
scraping. The source tree removes its collectors, preview commands,
scraping-only workflows/dependencies and unshipped Browser Worker/Durable Object
feature. Migration 0006 was never deployed and has been removed; migrations
0001-0005 and the production Worker/UI code remain unchanged. ScraperAPI is
under assessment only, not integrated or authorized for restricted sources.

This is a source-only release: publishing it removes the collection workflow
definitions from the active branch. Existing workflow history is retained.
No secret, grant, database, Pages or Worker deployment needs changing.
The production-configured frontend bundles remain byte-identical to the
published `index-BYkC9A39.js` and `index-LqHVXeMz.css`.
The historical three HusmanHagberg observations retain their original
time; reading still requires the existing private grant and shared gate.
Property emails remain off. The release records below describe **historical
deployments**, not currently available local scraping commands or approval to
re-run historical workflows.

## Solid blue-white logo and first private objects, 2026-09-27

Pages `36332659680` published `7b234d6`, including the logo/button change
`83fbd65`. The latest supplied solid-blue house with white radar now appears
in the header and favicon. Primary buttons remain blue with white text.
Secondary buttons have transparent backgrounds and matching 1px blue borders
and text (`#005ec7` in light mode, contrast-adapted `#4d9aff` in dark mode).
The supplied interior image, liquid glass and bold headings are unchanged.

Production-configured bundles are `index-BYkC9A39.js` and
`index-LqHVXeMz.css`. All nine selected live HTML, bundle, logo, image and
provenance files matched the production build byte-for-byte over HTTPS.
Apex redirects to HTTPS www; the API remains www-origin-only and anonymous
listings/catalog remain 401/no-store.

Linux Check `36331825235` passed on attempt 2 with unchanged code. Attempt 1
passed 67/68 browser cases, including the new exact asset, transparent-button,
color, focus and contrast assertions; an existing immediate `posts[0]`
assertion raced its asynchronous request in `app.spec.ts:310`.
That intermittent test remains a separate follow-up. The four desktop/mobile
light/dark screenshots were reviewed. No native local or authenticated live
browser verification is claimed.

The distinct owner-approved manual source pilot is now connected for
**HusmanHagberg only**, not all three investigated sources:

- Run `36332042322` imported three fresh partial observations. Remote D1
  confirms three active rows, three private-provenance rows, one partial
  receipt with its payload cleared and zero retirements.
- Notar `36331879123` stopped with `access_denied`; MOHV `36332125202` stopped
  with `not_ready`. No import, retry, access-control bypass or guessed facts.
  Both grants were removed from private Worker and GitHub configuration.
- The surviving private HusmanHagberg usage-basis grant expires at
  `2026-10-04T18:00:00.000Z`. It is not a broker license. Complete licensed
  source configuration remains empty. Collection is manual, not scheduled;
  `PROPERTY_EMAILS_ENABLED=false`. One existing subscription remains paused,
  and the four stored AI attempts are unchanged.

Worker `65c61c74-d129-4bed-99f2-9097361daa69` removed the old public empty
source variable before private secret provisioning. Final secret-change
version `a425314d-a89b-41bc-ad71-2ac513141438` retains only the working source.
All other secrets, www links/CORS, free-tier limits and technical-email/cleanup
schedule are preserved. See [source outcomes](SOURCES.md#manual-private-production-pilot-2026-09-27)
and the [manual runner](OPERATIONS.md#manual-private-browser-runner).

## Earlier neutral branding and liquid glass, 2026-09-27

Pages run `36328796921` published commit `7f1371a`: the supplied blue/radar logo,
blue/light-blue/coral buttons, neutral page colors, weight-700 headings and
image-backed glass panels. Current bundles are `index-Dc6DEFWP.js` and
`index-BeADpxR5.css`. The supplied interior image remains unchanged.

Linux Check `36328387176` passed, including image-bounded contrast, neutral
colors outside buttons, logo transparency and glass accessibility/failure
fallbacks. Its desktop/mobile light/dark screenshots were reviewed. Ordinary
HTTPS reads matched all nine checked HTML, bundle, image and provenance files
byte-for-byte; apex still redirects to HTTPS www with HTTPS enforcement active.
Local Chromium startup remains unavailable; the visual evidence is from Linux,
not a claimed authenticated production-browser session.

This is a frontend-only release. Worker, database, source grants and property
mail settings are unchanged: no live housing sources or property alerts are
enabled by the visual changes.

## Supplied homepage image, 2026-09-27

Pages run `36327213219` published commit `132d4f9`, replacing the earlier house
photograph with the owner's supplied interior image. Both local WebP versions
(`autumn-home-800.webp`, 69,404 bytes; `autumn-home-1374.webp`, 155,438 bytes)
and the published HTML/JavaScript/CSS matched the production build over HTTPS.
Linux Check `36326901516` passed before publication. The prior house photograph's
license is retained with its historical files, not assigned to the new image.
No source grants, imported listings or property-email settings changed.

## Private listings rollout, 2026-09-27

The owner's later decision supersedes anonymous browsing: real listings are
for the owner and invited users behind the shared password. The public branded
shell remains accessible; browsing after the password needs neither email nor
AI consent.

Migration `0005_private_observations.sql` has been applied through the pinned,
atomic migration runner and verified against the expected schema and ledger.
Private before/after fingerprints confirmed that the existing saved profile
and all four AI reservations were unchanged. Inventory remains zero.

Initial rollout Worker version `c693db09-982a-4363-9daa-5ec26e26fe56` enabled the private API
boundary and additive observation infrastructure. Both `/api/listings` and
`/api/catalog` return 401 with no listing/count data and `Cache-Control: no-store`
without the gate, including malformed listing parameters. These checks succeeded
with both exact apex/www origins at that stage; the final configuration below
accepts only the canonical www origin. `AUTHORIZED_SOURCES=[]`,
`PRIVATE_OBSERVATION_SOURCES=[]` and `PROPERTY_EMAILS_ENABLED=false` are explicit.
Shared access, verification mail, AI budgets and the existing cleanup schedule
remain unchanged. No broker facts were imported.

Pages run `36319779490` successfully published final commit `821b8cd`,
including the private UI, safe partial importer, three manual source previews
and corrected access-loss feedback. The published bundle is
`index-BNUsr6g2.js` with the unchanged `index-Dn7utxJQ.css`. Actual HTTPS reads
matched both files byte-for-byte to the tested production build; logo, favicon
and both hero images also matched their local originals.
Source previews remain operator-only tools, not an enabled
daily collection job or a license. Offline replays of the original private
captures reproduced HusmanHagberg's 1/18 and MOHV's 27/50 sampled results from
266 rendered cards without renewing capture timestamps.

The owner authorized `www.kommandekollen.se` as the canonical hostname. Its
DNS-only CNAME to `marcusbodin.github.io` is verified at two public resolvers.
The initial switch was delayed by certificate provisioning, during which the
working apex HTTPS site was retained. **The transition is now complete.**
GitHub reports an approved certificate for both apex and www, expiring
2026-12-26, with `cname=www.kommandekollen.se` and `https_enforced=true`.
Pages run `36325588188` republished commit `a4fa9d4` with the unchanged frontend
bundles listed above.

After the old apex CDN response expired, ordinary HTTPS requests to the apex
root returned 301 to `https://www.kommandekollen.se/`. Final checks at
2026-09-27 14:30 UTC verified that all four HTTP/HTTPS and apex/www combinations
converge to HTTPS www for both the root and `/assets/ATTRIBUTION.md`, preserving
the requested path and query. TLS verification succeeded without bypasses,
and the final published JavaScript and CSS matched the local build byte-for-byte.
Fragment inheritance has not been freshly browser-verified: fragments are not
sent to the server, and curl does not retain them in its effective URL.
No domain monitor or recurring certificate automation remains active.

Current Worker version `d3e29d4f-2cca-4b66-8018-5445f83109ce` sets
`PUBLIC_URL=https://www.kommandekollen.se/` and accepts only the exact
`https://www.kommandekollen.se` browser origin. Targeted Worker checks cover
canonical verification/unsubscribe links and rejection of apex, HTTP www and
deceptive suffix origins. Read-only production checks confirmed status 200 and
unauthenticated listing/catalog 401 for www, with 403 for the old apex and HTTP
www origins; all used `Cache-Control: no-store`. Reload an already-open apex
tab before continuing. No source grants, email activation, secrets or database
contents changed in this domain-only deployment.

The integrated build and 113 coupled local Worker/D1/migration/model tests
passed. The current macOS host then failed bare Chromium startup outside Vitest,
with a native SIGSEGV; no source code change, larger cap or dependency reinstall
was used to mask that failure. Fresh local browser verification remains blocked.
The existing Linux workflow previously installed Chromium after `npm test`,
although source-preview unit tests now need it. Commit `b9b4b25` moves that
existing installation before both suites. Linux exposed an access-error wrapper
bug and a concurrent revocation race, repaired in `7260323` and `821b8cd`,
plus a test HTTP-bridge teardown race. **Final Linux run `36319433460` passed
all 211 unit tests and all 66 desktop/mobile browser tests.** Broker traffic
in those tests is intercepted to synthetic fixtures; no further live broker
loads were made. Production checks used read-only HTTPS/API requests and no
password, email, AI or mutation requests; they are not a claimed live browser run.

## Prior releases through the copy-only homepage (historical)

The owner authorized step-by-step deployment on 2026-09-25. The public repository
and GitHub Pages shell are published under **marcusbodin**. Cloudflare Free DNS
is active while Inleed remains the registrar. The production Worker is deployed
on `api.kommandekollen.se` with validated TLS; its EU-jurisdiction D1 database has
`0001_initial.sql`, `0002_preferences.sql`, `0003_ai_daily_attempts.sql` and
`0004_shared_access.sql` with verified migration history. The third migration
raises member/IP daily attempts to six within the unchanged global budget and
preserves all existing reservations. On 2026-09-26 the owner requested the
personal-search rollout, followed by shared-password access with email at saving.
The fourth migration adds isolated guest sessions/drafts/save challenges without
rewriting the existing owner profile or AI reservations.

The **shared-password pilot is enabled**: `SERVICE_ENABLED=true`,
`AI_ENABLED=true`, `ACCESS_MODE=shared`, native Workers AI binding and an
every-minute cleanup/mail cron. The new read-only `GET /api/listings` is public
and serves fixed pages of 12 approved-source objects, with independent browsing
filters. The existing catalog and guest draft APIs still require the gate;
saved accounts/profiles require their verified own-account session as well.
Manual applications/approval are disabled in this mode.
There are **zero authorized live sources**, so searches save paused and alert
activation is denied server-side. Production owner, contact, sender and API
credentials are stored as Worker secrets, never in this repository. The matching
ingestion credential is a repository secret, but collection remains disabled.
Resend domain verification and a real test through contact-address forwarding
to the owner's inbox succeeded.

Frontend HTTPS is valid and enforced; HTTP redirects to the canonical HTTPS URL.
The public controller/contact and provider-location disclosures are published.
The owner separately confirmed the account's **Workers Free** plan, not only
the zone's Free DNS plan. The current homepage is published by Pages run
`36309935479` from copy-removal commit `c9f6843`, retaining the photographic-hero
commit `44dff88`, public-feed commit `b2dbb5f` and supplied-logo commit `ec1bf12`.
This latest release changed
Pages only. The Worker deployed for the preceding public-feed release remains
`88c17650-e6e9-4b9c-8074-11972ba86570`. `SHARED_ACCESS_PASSWORD` was generated in a
private local terminal and stored as a Worker secret; its value is not in the
repository, chat or deployment output. The owner saved their copy.

The owner completed actual queued email login, reached owner controls, used the
AI flow and explicitly saved a paused search. Read-only aggregate D1 inspection
confirmed a persisted versioned profile, no remaining draft and alerts disabled.
The initial missing-feedback failure was repaired and this complete owner path
then succeeded; no personal housing description or saved profile is published.

Shared-mode rollout checks verified the mobile/desktop password form, a visible
401 for an incorrect password and gate-required denial of old and guest AI paths.
The existing owner profile/version and all four prior AI reservations survived.
The user subsequently confirmed correct-password access without email and the
guest email-verification/save flow.

On 2026-09-27, the owner requested a public, filtered upcoming-object list below
the housing prompt, with explicit "Ladda fler" pagination. Browsing does not
require a password, email or AI. The supplied house/radar logo is now used in
both headers and as a local favicon. All inspiration-photo components and their
visible credits have been removed; the historical licensed files remain unused.
The initial headline was "Hitta kommande bostäder före andra" and the main
button remains "Hitta bostad". Supporting copy distinguishes the service's intended
early-discovery value from actual source coverage; no coverage, latency or
purchase guarantee is made. Searches still save paused and send no property mail.

The owner's subsequent photographic reference adds a full-width decorative
background below the header. On desktop, the search card is on the left and
"Vad är viktigt i ditt nästa hem?" is the H1 on the right; the previous sales
headline remains supporting text. At 960 pixels and below, the question precedes
the input. Opaque surfaces protect text readability in both themes. Expanded
review/manual/save content spans below both columns without replacing the mounted
preference flow; the public feed stays outside the hero on a plain surface.

At the owner's explicit request, the latest copy-only release removes the
"Målet: hitta ditt nästa hem innan annonsen når de stora bostadssajterna."
sentence, the global paused-search note and the public-list subtitle.
The remaining introduction is exactly "Vi bygger en samlad koll direkt från
mäklarna." No replacement claims or empty paragraph elements were added.
Paused-only review, confirmation and receipt copy remain truthful and unchanged;
removing a homepage note does not enable alerts or connect a listing source.

The background is Holger Ellgaard's photograph of Sodra Angby, served locally as
`stockholm-hero-800.webp` (800 by 500 pixels, 104,498 bytes) on mobile and
`stockholm-hero-1600.webp` (1600 by 1000 pixels, 295,120 bytes) on desktop.
Both cropped/resized WebP derivatives retain the original CC BY-SA 3.0 license.
"Bakgrundsfoto & licens" links to `assets/ATTRIBUTION.md` with the photographer,
source, license and modifications. The image is decorative, not a property
listing or endorsement; its license does not relicense the application or logo.

The owner's supplied visual reference now defines the palette: pink `#fbe3e8`,
blue-green `#5cbdb9` and mint `#ebf6f5`. White open surfaces, Georgia display
headings and pink pill actions replace the earlier rose enclosure. Deeper teal
derivatives provide readable light-theme text and keyboard focus; the optional
dark theme uses complementary dark teal surfaces. The owner-provided logo is
served as `brand-mark-80.png` (80 by 80 pixels, 5,622 bytes), displayed at
36–40 pixels, with `favicon-32.png` (32 by 32 pixels, 1,609 bytes). Its original
colors and light backing are retained; no external images or fonts are loaded.

At the owner's request, decorative borders and separator lines were replaced
with soft depth shadows and spacing. Primary buttons retain the reference pink,
including their still-disabled empty state; secondary/menu buttons use teal.
Native control affordances and visible keyboard/feedback focus remain intact.
The new public feed has separate request/filter state; existing private
consent, draft revision and explicit-save guards remain in place.

The published bundle is `index-BLOvpDD_.js`, with `index-Dn7utxJQ.css`.
Anonymous production `GET /api/listings` returned HTTP 200 with exactly
`{"availability":"no_sources","items":[],"total":0,"hasMore":false,"nextCursor":null}`.
At the preceding Worker rollout, malformed cursors and unsupported limit
parameters returned 400. Existing
`/api/me`, `/api/catalog` and guest draft routes returned 401 without the gate.
The public response excludes accounts, drafts, private source metadata and
license references. Query work remains bounded by the existing 200-object cap;
no source or capacity increase was enabled.

Actual live browser checks at 320, 360, 390, 430 and 1440 pixels confirmed the
absence of all three requested phrases, unchanged logo/favicon and question,
full-width hero, public section below the
hero, absent old inspiration images, single-row mobile header, 16-pixel fields,
44-pixel buttons and no horizontal overflow. At 1440 pixels, the actual input
and right-hand H1 overlap vertically by about 88 pixels. On mobile, the question
precedes the input and the input starts before 500 pixels. The expected local
responsive image loaded at every checked width, and the attribution URL returned
the complete notice. No third-party image or font requests were made.
Anonymous filter application and refresh returned the
truthful no-sources state without cookies and preserved the typed synthetic
housing text. "Ladda fler" stays hidden for an empty feed. Populated pagination
and filter races were exercised only with local synthetic Worker/D1 fixtures,
never by importing synthetic objects into production.

Menu, help, privacy and the logo retained the input. "Hitta bostad" opened the
password/unchecked AI-consent dialog; "Skapa med AI" remained disabled, and
cancellation retained the text. Computed text contrast passed for the checked
light/dark surfaces. A bounded desktop/mobile visual batch was inspected.
Soft shadows are not claimed as 3:1 boundaries or full WCAG certification.
Browser checks attempted no POST, consumed no AI calls and reported no runtime
errors or insecure subresource requests. Only normal traffic-rate counters are
updated by anonymous browsing. No Worker deployment, API/configuration change,
migration, secret, quota or source authorization changed during this Pages-only
homepage-copy release.

Still required during the pilot: broader guest/account revocation and
withdrawal scenarios, continued provider/privacy review, and
production CPU/provider/D1 capacity evidence. Live listing sources and actual
digest delivery are separate unresolved prerequisites for property alerts.
An initial active-pilot sample had CPU p50 2.467 ms and p99 14.147 ms with no
reported runtime errors. Provider schema confirms the underlying units are
microseconds. The p99 exceeds the nominal Free 10 ms budget: this is not
capacity certification and needs attention before widening the pilot.
The successful owner path does not prove every member workflow.
These instructions do not authorize paid upgrades or unrelated
account changes.

## Local components

```sh
npm ci
npm run db:local
npm run api:dev
```

Create ignored `.dev.vars` from its example only when exercising actual local
authentication with approved test credentials. There is deliberately no fake
mail-success mode in the application. `npm test` uses isolated real D1 databases
and an in-memory mock of Resend, without contacting a mail service. Test/demo
addresses are reserved example domains.

For a same-site local UI/API pair, use the **same hostname**, e.g.
`http://127.0.0.1:5173` and `http://127.0.0.1:8787`. Set `VITE_API_URL` only to
the intended API; it is public configuration. The unconfigured shell and
`?demo=1` need no backend.

## Public Pages shell

1. Authenticate separately as the real `marcusbodin` account. Do not use
   `marbodin`, `marcusbodin_microsoft`, Microsoft or Mojang. Create the approved
   public repository only after that account check.
2. Keep source code public but **all member data, real inventory, source runs,
   private feed endpoints and secrets outside the repository**.
3. Set Pages source to GitHub Actions. `pages.yml` is manual-only and guarded to
   `github.repository_owner == 'marcusbodin'`; it uploads only `dist/`.
4. `PUBLIC_API_URL` and `PAGES_BASE` are repository **variables**, not credentials.
   Initial project Pages URL normally needs `PAGES_BASE=/kommandekollen/`.
   At the approved production domain, set `PAGES_BASE=/` and
   `PUBLIC_API_URL=https://api.kommandekollen.se`. Leave `VITE_DEMO=false` in published
   production; demo can still be opened explicitly and contains synthetic data.
5. The public shell can be published without live sources, but must retain its
   not-configured state and must not advertise functional scraping or delivery.
   **Current active live listing sources: 0.** Member approval grants access
   rights, not a promise of available listings or active alerts. Keep the source
   allowlist empty and the no-live-data state until a legitimate integration is
   validated; the public demo remains entirely synthetic.

## Approved domain architecture

**Inleed remains the registrar and domain billing provider. Authoritative DNS
is on Cloudflare Free following the authorized migration.** This
explicit owner decision supersedes the earlier recommendation to keep Inleed
DNS. No registrar transfer, paid DNS, hosting, mail hosting or SSL is required.

| Host | Hosting and DNS |
| --- | --- |
| `https://kommandekollen.se` | GitHub Pages, DNS-only A records; redirects to HTTPS www |
| `https://www.kommandekollen.se` | Canonical GitHub Pages host with enforced HTTPS; DNS-only CNAME to `marcusbodin.github.io` |
| `https://api.kommandekollen.se` | Cloudflare Worker Custom Domain in the active Free DNS zone; routing/DNS/certificate managed by Workers |

The owner explicitly selected `www`; only `https://www.kommandekollen.se` is
configured in production CORS, and generated email links use that address.
HTTP requests to either website hostname redirect to HTTPS www. Do not add the
old apex, `github.io`, preview deployments, wildcards or `workers.dev` to
production CORS.

## Safe DNS migration procedure

The initial migration is complete: Cloudflare is authoritative on the Free plan,
GitHub's verification TXT is retained and the Pages A records are DNS-only.
The owner confirmed that no previous custom DNS records or mail service existed.
No parent DS was present. Retain the safeguards below for future DNS changes.

Before adding Pages site A/CNAME records or a `CNAME` file, verify domain ownership in
the **marcusbodin GitHub profile's Pages settings** using GitHub's actual
`_github-pages-challenge-...` TXT name/value. Copy the account-specific values
from GitHub, never invent them. Confirm ownership and the repository's working
Pages deployment before attaching the domain; this avoids dangling-domain
takeover risk. No `CNAME` file is included in this repository.

1. Inventory and export the **current** Inleed zone privately before changing
   anything: record names, types, values, priorities and TTLs, including apex/www,
   all TXT (especially GitHub verification), MX, SPF, DKIM selectors, DMARC,
   CAA, SRV and delegated subdomains. Record the current registrar nameservers,
   DNSSEC signing state and parent `.se` DS records separately. The previously
   observed nameservers were `ns1.inleed.net` through `ns6.inleed.net`; verify
   current values at migration time rather than treating this note as live DNS.
   Do not commit the export: DNS can contain private service-verification values.
2. Add the zone in the owner's intended Cloudflare account on the **Free** plan.
   Compare the imported zone record-by-record against the export; automatic
   scans can miss TXT, DKIM and other records. Preserve exact data, including
   trailing-dot/priority semantics, and mail records must remain DNS-only.
   Use Cloudflare's own apex SOA/NS for its zone, not copies of Inleed's apex
   authority records. Preserve deliberate subdomain NS delegations.
3. Coordinate DNSSEC **before** changing registrar delegation. If the current
   zone is signed with a parent DS, an ordinary migration generally requires
   removing/disabling that old DS at Inleed using the providers' documented
   procedure, while retaining a valid old signed zone for the cache transition.
   Wait for the old DS TTL and verify its removal at the parent and recursive
   resolvers before changing nameservers. Do not turn off old signing while its
   DS is still published/cached: that can cause DNSSEC validation failures.
   If status or signing control is unclear, stop and coordinate with Inleed and
   Cloudflare rather than guessing. No blind DS deletion/replacement, and never
   publish Cloudflare's new DS while Inleed is still the serving authority.
4. Only after record parity and DNSSEC readiness, copy **the exact nameservers
   assigned to this zone by the real Cloudflare account** into Inleed's registrar
   delegation controls. Do not use guessed Cloudflare nameservers, merely edit
   apex NS records inside the old zone, or combine the two providers' NS sets.
   Keep the old zone serving matching records during propagation; coordinate
   changes to both copies until old NS caches expire.
5. Confirm the Cloudflare zone becomes **Active** and compare authoritative and
   recursive answers for GitHub verification, site records and all existing mail
   records. Recheck mail flow and existing services; watch for SERVFAIL, stale
   authority, missing records and certificate/CAA issues. Preserve the GitHub
   verification TXT permanently as instructed by GitHub. Keep the old zone/export
   for a rollback window rather than deleting it immediately.
6. After delegation is stable, enable Cloudflare DNSSEC if desired using its
   current account-issued DS values at Inleed. Verify the DNSKEY/DS chain and
   successful validation. A rollback to Inleed requires coordinating DS with
   whichever zone will answer; never change nameservers back beneath a mismatched
   cached Cloudflare DS. Record the exact rollback sequence before execution.

After ownership verification and active DNS, use the current GitHub Pages
instructions for the exact site A/AAAA/CNAME records and custom-domain setting.
Set Pages site records **DNS-only initially**, then let GitHub issue HTTPS and
enable Enforce HTTPS. Do not invent provider IPs or add wildcard DNS. An optional
future proxy change is a separate decision, not part of this setup.

## Same-site API and secure sessions

The approved HTTPS apex frontend and API subdomain are **same-site**, which
supports the existing HttpOnly Secure SameSite=Strict session cookie. They are
still **cross-origin**: keep credentialed fetches and strict CORS allowing only
`https://kommandekollen.se`. Cookies remain API-host-only with the `__Host-`
prefix, no broad `Domain` attribute and no browser-storage bearer tokens.

Once the Cloudflare zone is Active, attach `api.kommandekollen.se` through
**Workers Custom Domains**, using the production Wrangler custom-domain route
or the matching dashboard flow when deployment is authorized. Workers creates
the managed routing/DNS and certificate. Do not hand-create a CNAME pointing
to `workers.dev`, and do not apply the Pages DNS-only setting to this
Worker-managed API hostname. Inspect any existing `api` DNS record before
resolving a conflict; do not overwrite an unrelated service blindly.

The zone and API custom domain are active with API TLS validated; GitHub's
frontend certificate is approved and HTTPS is enforced. Test login/explicit confirmation from an email link,
credentialed API calls, logout and revocation on desktop and mobile after setup.
The preliminary `github.io` shell is not a supported production login host.

## Cloudflare configuration

The production binding in `wrangler.toml` now points to the provisioned database.
Do not create a duplicate database or reimport its initial schema. For subsequent
authorized migrations, use the target-checked atomic runner:

```sh
npm run db:migrate -- --remote --env production \
  --account-id <confirmed-account-id> --database-id <confirmed-database-id>
```

See [migration notes](../worker/migrations/README.md). Wrangler 4.135's remote
`d1 migrations apply` query path failed to split the original triggers correctly;
the runner uses the documented atomic SQL-file import with its ledger update.
The initial import succeeded, including all capacity/quota triggers. Its
post-commit progress-output parsing issue was subsequently fixed and actual
schema/history validated read-only. Do not manually add ledger rows or drop
schema to recover an uncertain command response.

Do not run remote commands against an account merely because a CLI is logged in.
Local migration scripts never use `--remote`.

`wrangler.toml` keeps local defaults separate from `env.production`. The
production environment already declares the exact API Custom Domain, disables
`workers.dev` and preview URLs, sets the frontend root and exact origin, and
enables `SERVICE_ENABLED` and `AI_ENABLED` for the private pilot while keeping
the source allowlist empty. Local defaults remain disabled. Credentials are
provisioned separately as Worker secrets. `MAIL_FROM` and `PRIVACY_CONTACT`
are also production secrets rather than tracked vars; the local empty defaults
may cause an intentional Wrangler non-inherited-vars warning.
Select `--env production` consistently for future deployment, remote migrations
and secret setup; bindings/vars/secrets must belong to that environment. A dry
run may bundle/validate this configuration locally; it does not activate DNS.
Do not deploy the default localhost-oriented configuration to production.

Server configuration:

| Name | Where | Meaning |
| --- | --- | --- |
| `DB` | D1 binding | Private member/session/inventory store |
| `SERVICE_ENABLED` | Worker var | Defaults `false`; opens applications/mail only after configuration |
| `AI_ENABLED` | Worker var | Local default `false`; production `true`, approved members and explicit AI consent only |
| `AI` | Native Workers AI binding | Fixed Free-eligible model; never a frontend API credential |
| `PUBLIC_URL` | Worker var | Production: `https://kommandekollen.se/`; local configuration remains separate |
| `ALLOWED_ORIGINS` | Worker var | Production: exactly `https://kommandekollen.se`; no `*`, paths or untrusted previews |
| `MAIL_FROM` | Private Worker config | Resend-verified sender, not an invented mailbox |
| `PRIVACY_CONTACT` | Private Worker config, displayed publicly | Approved public contact for privacy/controller inquiries |
| `OWNER_EMAIL` | Worker secret | Exact private owner address; **unset by default** |
| `TOKEN_SECRET` | Worker secret | Random high-entropy secret, at least 32 characters |
| `RESEND_API_KEY` | Worker secret | Sending permission only |
| `ADMIN_TOKEN` | Worker secret | Independent random infrastructure token, at least 32 characters |
| `AUTHORIZED_SOURCES` | Private Worker configuration | JSON source/host/license/expiry allowlist, empty by default |

The authorized-source JSON shape is:

```json
[{
  "id": "authorized",
  "hosts": ["listings.example.com"],
  "licenseReference": "Reference to a verified license permitting this use",
  "expiresAt": "2099-01-01T00:00:00Z"
}]
```

Examples are nonfunctional reserved domains. Never publish permission letters,
personal contacts, private feed URLs or secrets when editing config.

The handler uses a once-per-minute cron with Stockholm local-time gating and
bounded per-invocation work. Production cleanup was enabled before applications.
Keep on the Free plan. Before widening the pilot measure CPU
and D1 use at configured caps in the actual Worker; tests validate logic, not
production CPU allowance.

## Resend

Use Free only. Create/verify the sending domain in the owner's actual account.
Copy exact DKIM/SPF/verification records from that account into the authoritative
Cloudflare zone after migration. If setup precedes migration, add them at Inleed
and preserve them in the new zone during the transition. Do not use
invented TXT values, blindly replace existing SPF, or alter MX for normal mail
unless specifically required and understood. Follow the real account's domain
status and sending restrictions. A domain purchase does not require buying
email hosting. Validate a real authorized test delivery and its unsubscribe
flow before opening membership, then monitor bounces/complaints and quota.

## Collection Actions

The scheduled collector and manual browser-observation workflow are removed
from current source. Do not enable old `INGEST_ENABLED`/`COLLECTION_CONFIG`
settings or dispatch historical workflows. Their removal is a code release,
not a database migration or a request to delete stored observations.
Existing remote workflow history and secrets are retained. In particular,
the Worker's private source grant
is still needed to read existing data; do not remove it as an unused scraper key.

The retained [JSON observation importer](OPERATIONS.md#controlled-importer)
requires explicit private admin credentials and source authorization, validates
already structured facts and never fetches a broker or replacement provider.
No automated collection or replacement-provider workflow is supplied.

## Required launch evidence

Verified intended GitHub identity and ownership; preserved domain TXT verification;
completed Free DNS migration with correct DNSSEC/DS and record parity; active
same-site frontend/API domains and valid TLS; Free-only resources; private secrets; fixed owner
identity; completed privacy disclosure/provider agreements; a legitimately
usable and successfully validated source; production CPU/quotas; real mail
acceptance/deliverability; approved-member access and revocation from desktop
and mobile. Completed external steps are listed at the top of this document;
local tests do not establish the remaining production evidence.
