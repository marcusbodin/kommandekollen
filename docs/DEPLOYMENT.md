# Deployment checklist — not performed

The project is local only. These instructions do not authorize deployment,
account switching, new resources, repository pushes or DNS changes. The owner
controls those actions separately. Intended GitHub owner: **marcusbodin**.

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
   Custom-domain root later needs `/`. Leave `VITE_DEMO=false` in published
   production; demo can still be opened explicitly and contains synthetic data.
5. The public shell can be published without live sources, but must retain its
   not-configured state and must not advertise functional scraping or delivery.

## Domain and Inleed

`kommandekollen.se` is registered at Inleed with `ns1.inleed.net` through
`ns6.inleed.net`. **Keep DNS there unless the owner later explicitly approves a
different arrangement.** Do not buy web hosting, mail hosting or SSL.

Before adding Pages A/CNAME records or a `CNAME` file, verify domain ownership in
the **marcusbodin GitHub profile's Pages settings** using GitHub's actual
`_github-pages-challenge-...` TXT name/value. Copy the account-specific values
from GitHub, never invent them. Confirm ownership and the repository's working
Pages deployment before attaching the domain; this avoids dangling-domain
takeover risk. No `CNAME` file is included in this repository.

After verification, use the current GitHub Pages DNS instructions, choose the
intended apex/www arrangement, and enable HTTPS after GitHub issues its
certificate. Keep the verification TXT in place as instructed by GitHub.

## Worker authentication hosting constraint

The current session transport uses HttpOnly SameSite=Strict cookies. That works
with a same-site API and frontend but **not** as a reliable
`github.io` → `workers.dev` cross-site login architecture.

A Worker Custom Domain usually requires an active Cloudflare DNS zone. Merely
adding `api.kommandekollen.se CNAME ...workers.dev` at Inleed does not establish
Cloudflare custom-hostname routing/certificates. Do not recommend or apply that
as if it worked. Same-site hosting or an explicitly reviewed cross-origin
bearer-session transport must be settled before real login is launched. Moving
authoritative DNS or paid Cloudflare partial-zone features is **not approved**.
This is a deployment blocker, not something hidden by a frontend fallback.

## Cloudflare configuration

Once the owner authorizes setup, create a Free Worker/D1 database, replace the
placeholder database ID in `wrangler.toml`, and apply
`worker/migrations/0001_initial.sql` remotely via Wrangler's migration command.
Do not run remote commands against an account merely because a CLI is logged in.
Local migration scripts never use `--remote`.

Server configuration:

| Name | Where | Meaning |
| --- | --- | --- |
| `DB` | D1 binding | Private member/session/inventory store |
| `SERVICE_ENABLED` | Worker var | Defaults `false`; opens applications/mail only after configuration |
| `PUBLIC_URL` | Worker var | Exact frontend root including initial project subpath |
| `ALLOWED_ORIGINS` | Worker var | Exact comma-separated origins; no `*`, no paths, no untrusted previews |
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

Cron is every minute, with Stockholm local-time gating and bounded per-invocation
work. Keep on the Free plan. Before launch measure CPU and D1 use at configured
caps in the actual Worker; tests validate logic, not production CPU allowance.

## Resend

Use Free only. Create/verify the sending domain in the owner's actual account.
Copy exact DKIM/SPF/verification records from that account to Inleed; do not use
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

Verified intended GitHub identity and ownership; domain TXT verification; agreed
compatible session hosting; Free-only resources; private secrets; fixed owner
identity; completed privacy disclosure/provider agreements; a legitimately
usable and successfully validated source; production CPU/quotas; real mail
acceptance/deliverability; approved-member access and revocation from desktop
and mobile. None of those external-account steps is implied by local tests.
