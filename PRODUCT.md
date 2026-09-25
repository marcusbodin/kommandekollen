# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Swedish-speaking home seekers looking for upcoming homes in Stockholm.
The owner changed the scope on 2026-09-25: this is a CLOSED membership service.
People may apply; only the configured owner can approve verified applicants.

## Product Purpose

Let users filter upcoming homes from estate agents and subscribe to matching
results by email each morning.

## Operating Context

Public visitors see an application/login shell and explicitly synthetic demo.
Application -> email verification -> pending manual approval -> approved,
rejected or revoked. Verification alone never grants inventory access or alerts.
Approved members configure familiar property-search preferences, review matching
homes and explicitly activate morning alerts. Every email permits account deletion.
Owner approval, rejection and revocation are authenticated server-side operations.

## Capabilities and Constraints

- Intended coverage: the major Stockholm estate agencies, subject to each
  source's access terms and available authorized feeds.
- Never represent disabled or unverified sources as working integrations.
- Owner purchased kommandekollen.se.
- Intended personal GitHub owner is marcusbodin.
- Public source repository approved for free GitHub Pages.
- Public code is not public inventory. Real listings, source-run results and
  saved searches require an approved backend-validated membership session.
- The owner role is fixed by private server configuration, never first-signup
  or a client-selected role. Owner identity remains unset until account setup.
- Cloudflare Workers/D1 and Resend approved only on free plans.
- Subscriber information and secrets must not be public.
- A domain purchase is the only cost explicitly accepted.
- Initial implemented geographic scope: the 26 municipalities of Stockholms län.
- Conservative pilot limits: 40 accounts, 200 stored listings, 80 attempted
  emails/day, 2400/month; at most 20 non-digest email attempts/day.
- Updated owner decision, 2026-09-25: Inleed remains the registrar and domain
  billing provider; authoritative DNS may move to Cloudflare Free at deployment.
  The previous requirement to retain Inleed DNS is superseded.
- Approved frontend: https://kommandekollen.se on GitHub Pages; approved API:
  https://api.kommandekollen.se through a Worker Custom Domain in an active
  Cloudflare zone. This supports same-site secure sessions without bearer tokens.
- Existing DNS records and DNSSEC/DS must be coordinated during migration.
  Pages DNS records start DNS-only; nameservers come from the actual Cloudflare
  account, never guessed values. No DNS/account/deployment action has occurred.
- No paid DNS, hosting, email or SSL purchase is approved.
- GitHub authentication, Cloudflare provisioning, Resend verification and
  DNS configuration have not been completed.

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
- Email-verified, owner-approved membership with straightforward withdrawal.
- Explicit failures rather than fabricated listings or success messages.
- Bounded operation within free service quotas.
