# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Swedish-speaking home seekers looking for upcoming homes in Stockholm.
The owner confirmed that this is an open service, not a personal-only tool.

## Product Purpose

Let users filter upcoming homes from estate agents and subscribe to matching
results by email each morning.

## Operating Context

Users configure Hemnet-like preferences, review matching homes, verify their
email address and receive daily notifications. Every email must support
unsubscribing.

## Capabilities and Constraints

- Intended coverage: the major Stockholm estate agencies, subject to each
  source's access terms and available authorized feeds.
- Never represent disabled or unverified sources as working integrations.
- Owner purchased kommandekollen.se.
- Intended personal GitHub owner is marcusbodin.
- Public source repository approved for free GitHub Pages.
- Cloudflare Workers/D1 and Resend approved only on free plans.
- Subscriber information and secrets must not be public.
- A domain purchase is the only cost explicitly accepted.
- Exact geographic scope within Stockholm is still open.
- GitHub authentication, Cloudflare provisioning, Resend verification and
  DNS configuration have not been completed.

## Brand Commitments

Kommandekollen. Swedish interface. Familiar property-search controls inspired
by the task flow on Hemnet, without copying its branding or content.

## Evidence on Hand

No real listing dataset, agency permissions, photographs, testimonials or
coverage measurements have been supplied. Demonstration data must be labeled.
Fastighetsbyran explicitly disallows automated access without special permission
in https://www.fastighetsbyran.com/robots.txt (checked 2026-09-25).

## Product Principles

- Honest source coverage and freshness.
- Useful filters before marketing content.
- Verified subscriptions with straightforward withdrawal.
- Explicit failures rather than fabricated listings or success messages.
- Bounded operation within free service quotas.
