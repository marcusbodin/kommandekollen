# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Swedish-speaking home seekers looking for upcoming homes in Stockholm.
The owner approved shared-password access on 2026-09-26. Visitors who have the
shared password may try AI without email. Email is verified only when saving,
followed by a second explicit review/confirmation. No manual application or
owner approval is needed in this mode. The previous membership mode remains the
configuration default until the operator explicitly rolls out shared access.

## Product Purpose

Let authorized visitors describe their next home, clarify material ambiguity,
review hard requirements, soft preferences and unverified criteria, then
explicitly save their personal selection. Manual filters remain a fallback.
New matching objects may be emailed each morning only after separate consent
and source readiness; with no ready sources, save paused.

## Operating Context

Shared mode: password -> guest draft -> reviewed save intent -> email verification
in the same browser -> second explicit confirmation. Verification alone never
saves or activates alerts. Existing owners retain their saved searches and role.
Rejected/revoked accounts remain blocked. Membership mode retains the former
application -> verification -> manual approval process. Every email permits
signed deletion. The public demo is synthetic and never calls AI.

## Capabilities and Constraints

- Intended coverage: the major Stockholm estate agencies, subject to each
  source's access terms and available authorized feeds.
- Never represent disabled or unverified sources as working integrations.
- Owner purchased kommandekollen.se.
- Intended personal GitHub owner is marcusbodin.
- Public source repository approved for free GitHub Pages.
- Public code is not public inventory. Shared mode requires a backend-validated
  guest gate for inventory/AI and a verified own-account session for saved data.
  Membership mode still requires approved membership.
- The owner role is fixed by private server configuration, never first-signup
  or a client-selected role. Owner identity is configured privately in production.
- Authorized public controller identity: Marcus Bodin (privatperson);
  public contact kontakt@kommandekollen.se. This is disclosure, not the private
  email used to authorize the owner role.
- Cloudflare Workers/D1 and Resend approved only on free plans.
- Cloudflare Workers AI Free is approved for draft interpretation only, with
  housing text/prior preference state but no account or email metadata added.
  Fixed Llama 3.3 70B JSON-mode model, strict untrusted-output validation,
  conservative 6,000-neuron daily reservation cap. Production AI was enabled
  on 2026-09-26 after bounded real-model and native-binding checks; full
  production member-flow/capacity checks continue. Local defaults stay OFF.
  No paid fallbacks or AI per listing/day.
- A bounded versioned profile preserves hard filters, alternatives, exclusions,
  supported soft ranking and visibly unverified criteria. Unsupported MUST
  criteria require explicit manual-check acceptance. The model never saves,
  grants membership or gives alert consent.
- Drafts expire after 30 minutes. Explicit atomic, member/version-bound
  confirmation saves only the reviewed profile; stale tabs and replays fail.
- Subscriber information and secrets must not be public.
- A domain purchase is the only cost explicitly accepted.
- Initial implemented geographic scope: the 26 municipalities of Stockholms län.
- Conservative pilot limits: 200 temporary guest sessions, 40 accounts, 200 stored listings, 80 attempted
  emails/day, 2400/month; at most 20 non-digest email attempts/day.
- Updated owner decision, 2026-09-25: Inleed remains the registrar and domain
  billing provider; authoritative DNS may move to Cloudflare Free at deployment.
  The previous requirement to retain Inleed DNS is superseded.
- Approved frontend: https://kommandekollen.se on GitHub Pages; approved API:
  https://api.kommandekollen.se through a Worker Custom Domain in an active
  Cloudflare zone. This supports same-site secure sessions without bearer tokens.
- Existing DNS records and DNSSEC/DS must be coordinated during migration.
  Pages DNS records start DNS-only; nameservers come from the actual Cloudflare
  account, never guessed values. Cloudflare Free DNS is now active.
- No paid DNS, hosting, email or SSL purchase is approved.
- Source code and the public shell are published under marcusbodin.
  The production API and EU-jurisdiction D1 database are provisioned.
  Frontend HTTPS is valid and enforced. Applications, optional AI and scheduled
  cleanup/mail processing are enabled for the private pilot. Complete real
  membership testing and production capacity checks continue; no source or
  listing-alert delivery is enabled.
- The Resend sending subdomain is verified. A real technical test message
  reached the private inbox via the approved public contact forwarding address.
  This is not evidence of a working listing digest or live property coverage.

## Brand Commitments

Kommandekollen. Swedish interface. Familiar property-search controls inspired
by the task flow on Hemnet, without copying its branding or content.
Confirmed mobile preference: bright/lightweight, default-light interface even
on a dark-preferring OS, larger touch targets and numeric sliders with optional
precise entry. Existing ranges and saved-search semantics remain available.
Use freely licensed local home imagery only as labeled inspiration, never as
a representation of an actual listing.

## Evidence on Hand

No real listing dataset, agency permissions, listing photographs, testimonials or
coverage measurements have been supplied. No live agency integration is enabled.
Demonstration data must be labeled and must never send email or create accounts.
Fastighetsbyran explicitly disallows automated access without special permission
in https://www.fastighetsbyran.com/robots.txt (checked 2026-09-25).
Svensk Fast's website terms explicitly prohibit scraping and automatic indexing
without permission. Other assessed candidate sources remain unverified.
Private membership does not override source restrictions or create a reuse license.
A regular free Unsplash interior photo by Francesca Tosolini is locally cropped
and optimized; its verified source/license is recorded in
`public/assets/ATTRIBUTION.md`. It is not a Stockholm property or coverage claim.

## Product Principles

- Honest source coverage and freshness.
- Useful filters before marketing content.
- Backend-enforced access and verified personal saving with straightforward withdrawal.
- Explicit failures rather than fabricated listings or success messages.
- Bounded operation within free service quotas.
