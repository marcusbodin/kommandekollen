# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Swedish-speaking home seekers looking for upcoming homes in Stockholm.
The latest explicit user decision makes the upcoming-listings feed public.
Browsing and filtering need neither a password nor AI. Personal interpretation
and saved searches remain protected; this does not authorize any new source.
The owner approved shared-password access on 2026-09-26. Visitors who have the
shared password may try AI without email. Email is verified only when saving,
followed by a second explicit review/confirmation. No manual application or
owner approval is needed in this mode. Shared access is active in production;
the previous membership mode remains the local/missing-setting default.

## Product Purpose

Help home seekers discover upcoming homes early, directly at the broker, with
the objective of contacting that broker before the home reaches larger portals.
This is the product's core value, not a verified coverage or latency claim:
there are still zero connected sources. No all-brokers/all-listings, buying
priority or competitive head-start guarantee is justified.

Show permitted upcoming facts publicly, newest observed first. Optional AI lets
authorized visitors describe their next home, clarify material ambiguity,
review hard requirements, soft preferences and unverified criteria, then
explicitly save their personal selection. Manual filters remain a fallback.
New matching objects may be emailed each morning only after separate consent
and source readiness; with no ready sources, save paused.

## Operating Context

Shared mode: free-text input -> explicit send -> contextual shared password
and optional AI-processing consent -> guest draft -> reviewed save intent -> email verification
in the same browser -> second explicit confirmation. Verification alone never
saves or activates alerts. Existing owners retain their saved searches and role.
Rejected/revoked accounts remain blocked. Membership mode retains the former
application -> verification -> manual approval process. Every email permits
signed deletion. The public demo is synthetic and never calls AI.

The user's latest correction requires a recognizable lightweight website:
existing wordmark, clear menu, short purpose explanation, dominant housing
input and a footer with privacy/contact/copyright. This supersedes the literal
input-only surface, not the decision to ask for the password at first search
rather than on arrival. A calm note states paused saving and no housing emails.
The public feed independently explains the current absence of connected sources.
The site menu exposes privacy before authentication, manual filters without AI,
own search/draft, account/login/logout/owner tools and source/result information.
An already-open gate skips password entry, not AI consent. In-memory consent
covers followups in the current draft only; no inference is triggered on load,
restore, typing or email verification. Existing searches are never silently
replaced. The new user-requested hero uses a decorative photo behind the prompt
and question, not an image-only screen or a property listing. There is no
always-open account/source panel. Information and home navigation keep
unsent text in place.

## Capabilities and Constraints

- Intended coverage: the major Stockholm estate agencies, subject to each
  source's access terms and available authorized feeds.
- Never represent disabled or unverified sources as working integrations.
- Owner purchased kommandekollen.se.
- Intended personal GitHub owner is marcusbodin.
- Public source repository approved for free GitHub Pages.
- A narrow public `GET /api/listings` exposes only authorized upcoming facts in
  Stockholms län, 12 at a time, with independent filters across the bounded
  inventory. It never returns private source runs, contracts or personal data.
  The existing catalog and personal APIs stay gated; saved data requires the
  verified own-account session, plus the guest gate in shared mode.
  Membership mode still requires approval for personal functions, not public browsing.
- The initial 12-card page and explicit Load more do not remove the existing
  200-record pilot inventory cap. First seen means Kommandekollen's observation,
  not the broker's original publication date. Unknown and stale facts stay explicit.
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
  Frontend HTTPS is valid and enforced. Shared-password access, optional AI and
  scheduled cleanup/mail processing are enabled; applications/manual approvals
  are replaced by email verification at saving. Complete real
  guest/account testing and production capacity checks continue; no source or
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
The pinned supplied house/radar logo and local favicon stay unchanged.
The user's white/mint/teal/pink palette, Georgia display, Segoe controls,
borderless surfaces and filled buttons remain binding. The latest reference
authorizes a full-width decorative background hero, with the search card left
and "Vad är viktigt i ditt nästa hem?" right on desktop; mobile reads question
then input. It does not authorize reference-site branding, ads or photos.
The earlier inspiration card remains removed; listings have no image field.
"Hitta kommande bostäder före andra." stays as supporting value copy and the
initial primary CTA remains exactly "Hitta bostad".
Its introduction explicitly says "Vi bygger" and "Målet:", distinguishing the
source-direct discovery goal from the zero-source pilot actually operating.
The adjacent helper explains that the protected AI step makes a search proposal,
not a saved profile. Public browsing/filtering is separate and needs no AI.

## Evidence on Hand

No real listing dataset, agency permissions, listing photographs, testimonials or
coverage measurements have been supplied. No live agency integration is enabled.
Demonstration data must be labeled and must never send email or create accounts.
Fastighetsbyran explicitly disallows automated access without special permission
in https://www.fastighetsbyran.com/robots.txt (checked 2026-09-25).
Svensk Fast's website terms explicitly prohibit scraping and automatic indexing
without permission. Other assessed candidate sources remain unverified.
Neither private membership nor the public-feed decision overrides source
restrictions or creates a reuse license.
The approved decorative hero photo is Holger Ellgaard's "Sodra angby 2008m.jpg",
distributed as two locally cropped/resized WebP files under CC BY-SA 3.0.
It illustrates the homepage, not an available listing or an endorsement.
The license applies to those image adaptations, not the application or logo.
A regular free Unsplash interior photo by Francesca Tosolini was locally cropped
and optimized; its verified source/license is recorded in
`public/assets/ATTRIBUTION.md`. These historical files are retained but are no
longer rendered. Both photos' provenance is recorded there; the supplied logo's
provenance is separate in `public/assets/BRAND.md`.

## Product Principles

- Honest source coverage and freshness.
- Useful filters before marketing content.
- Backend-enforced access and verified personal saving with straightforward withdrawal.
- Explicit failures rather than fabricated listings or success messages.
- Bounded operation within free service quotas.
