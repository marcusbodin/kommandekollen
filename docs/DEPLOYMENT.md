# Deployment and launch status

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
every-minute cleanup/mail cron. Catalog and guest draft APIs require the gate;
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
the zone's Free DNS plan. The minimal input-first frontend is published by Pages run
`36299417326` from feature commit `47b3c2a`; the unchanged active Worker version is
`b4da83e5-c887-49cb-a194-d2b292160f67`. `SHARED_ACCESS_PASSWORD` was generated in a
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

On 2026-09-27, a frontend-only rollout removed the initial header, hero, photo,
password form and secondary panels. The public first view is the textarea with
integrated send and "Mer". Explicit send opens the password/unchecked AI-consent
dialog; no AI request occurs before authorization. Actual desktop/mobile browser
checks confirmed that typing, opening/cancelling the dialog and reading privacy
made no POST requests. Cancellation retained the exact typed text. Backend,
secrets, migrations, budgets and saved records were not changed by this release.

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
may move to Cloudflare Free when deployment is separately authorized.** This
explicit owner decision supersedes the earlier recommendation to keep Inleed
DNS. No registrar transfer, paid DNS, hosting, mail hosting or SSL is required.

| Host | Hosting and DNS |
| --- | --- |
| `https://kommandekollen.se` | GitHub Pages, site DNS records **DNS-only initially** (not Cloudflare-proxied) |
| `https://api.kommandekollen.se` | Cloudflare Worker Custom Domain in the active Free DNS zone; routing/DNS/certificate managed by Workers |

`www` is not an application origin by default. If selected later, follow GitHub's
documented apex/www redirect setup and use the canonical apex for login links.
Do not add `www`, `github.io`, preview deployments or `workers.dev` to production
CORS merely to make an unconfigured hostname work.

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

`ingest.yml` is disabled unless `INGEST_ENABLED=true`; default configuration
contains zero collection sources. It runs at 03:15 UTC (before the Stockholm
morning window in both seasons), at most five minutes, with a concurrency lock.

Private Actions **secrets**: `INGEST_API_URL`, `INGEST_TOKEN` (matching Worker
`ADMIN_TOKEN`) and `COLLECTION_CONFIG` (exact permitted-source allowlist).
Never use pull-request event code to run these secrets. No data artifacts or
raw source content are uploaded. The job only imports to the protected Worker.
See [SOURCES.md](SOURCES.md) for the actual supported parser contract and the
difference between infrastructure and a verified live source.

## Required launch evidence

Verified intended GitHub identity and ownership; preserved domain TXT verification;
completed Free DNS migration with correct DNSSEC/DS and record parity; active
same-site frontend/API domains and valid TLS; Free-only resources; private secrets; fixed owner
identity; completed privacy disclosure/provider agreements; a legitimately
usable and successfully validated source; production CPU/quotas; real mail
acceptance/deliverability; approved-member access and revocation from desktop
and mobile. Completed external steps are listed at the top of this document;
local tests do not establish the remaining production evidence.
