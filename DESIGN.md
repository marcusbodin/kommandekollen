# Kommandekollen design

The search surface is Operate mode: one housing task, not a marketing landing
page. The user's correction replaces the isolated-input design with a compact,
recognizable website shell: existing "kommandekollen." wordmark/home identity,
real navigation, short purpose copy, dominant search and a tidy footer.
The heading is "Vad är viktigt i ditt nästa hem?" and the introduction explains
personal housing searches for Stockholms län without claiming live inventory.
"Förfina min sökning" describes the first action; followups use "Tolka mitt svar".
A calm pilot note says searches currently save paused, without homes or housing
emails. Password, email, source panels, saved profiles and full legal text are
not initial-page content. One clearly labeled home inspiration photograph is
integrated with the intro/search, not a listing image or a giant photo hero.

The warmer refinement uses the established rose as a deliberate atmospheric
region: 14% `--cp-accent` mixed with `--cp-bg`, a rose heading and home-icon
badge, white/dark elevated input surface and a softly tinted footer.
Typography, exact purpose copy and navigation remain unchanged. Body copy on
the colored region uses `--cp-text`; footer links retain rose underlines with
high-contrast text, including in dark mode. Status colors are not decoration.
The image supplies natural teal, wood and sunlight rather than a new UI palette.

Desktop navigation exposes "Så fungerar det", "Konto"/"Min sökning" and
"Integritet"; mobile uses the accessible "Meny" toggle. This same menu reveals
manual filters, drafts, account/owner tools, results/source status, quota,
the synthetic demo and theme choice. There is no competing input-level "Mer".
The footer contains copyright/service identity, privacy/deletion and the public
contact link. The logo and inline information panes retain unsent text.
Private functions still require server authorization; disclosure is not access.

The first explicit send opens a compact native dialog protecting password and
AI-consent entry. The text stays in place. Password is not consent: an unchecked
Cloudflare processing checkbox and explicit continuation are required before
one inference. Followups in that same consented draft stay inline; a reload or
new draft requires consent again. Cancel/Escape/error preserves the text.
No mount, gate restore, input edit or GET submits or saves anything.
Questions, review, relevant no-source notice and focused outcomes appear only
after progression. Draft restore is explicit, except return from email review.
Email-at-save verification and the second explicit confirmation stay separate.

The legacy membership mode and synthetic demo retain their existing layout.
The shared site's reused local interior photograph is always labeled
"Inspirationsbild · inte ett bostadsobjekt". It never represents a listing.
Its caption links to the existing credit/license record. Alt text describes
only the pictured room, not a property, address or Stockholm location.
Provenance and modifications are documented in
`public/assets/ATTRIBUTION.md`. No agency branding, fictional coverage claims,
maps without map data or decorative listing thumbnails are used.

Clawpilot light/dark variables in `src/style.css` are the color source of truth.
Light is the default even when the OS prefers dark; dark remains an explicit
theme-button/query choice. All component colors use those tokens. The only accent is rose; status messages
also have plain text, not color alone. Typography is Segoe UI, Aptos, Calibri,
then platform fallbacks. Body is 16px, supporting copy 13–14px, fixed-scale
headings 18–32px. Inputs remain at least 16px to avoid iOS focus zoom. Primary
targets and disclosure summaries are at least 44px high with visible keyboard
focus; checkbox labels provide the larger touch target.

The primary search interaction is a compact housing-description textarea,
one material followup and an editable
summary separating requirements, wishes and manual checks. One explicit
confirmation saves the reviewed profile; with no ready sources it saves paused.
No endless chat transcript or fake AI in the deterministic public demo.
The compact homepage uses an 1120px shell with search/intro beside a bounded
photo on desktop. At 960px and below the image follows the input, with a
160px crop (132px on narrow phones), so it does not push the input down.
Desktop requests the existing higher-resolution crop. Natural spacing and a minimum-height page put
the footer after the content, not over the keyboard. The public textarea has a
persistent visible label, a factual example placeholder and a short next-step
helper. Native dialogs remain scrollable. At 320px, 16px side gutters preserve
16px input text and 44px action targets; navigation and controls reflow at 200%
zoom. Results/source sections are requested separately, not initial content.
Legacy/demo desktop uses an 880px input/review panel and flexible
two-column factual property cards. Below 1050px,
properties become one column. Below 700px, content stacks, with
112px inspiration bands rather than a full-screen hero. Opaque light panels
keep text readable; no copy is drawn directly on photography.
Manual controls are secondary under "Använd vanliga filter" / "Ändra själv med
filter". Municipality, touch-choice property types, maximum price and minimum
rooms are immediately available there. "Fler filter" contains remaining criteria.
Numeric filters use native range controls with visible Swedish values and
aria-valuetext. Null is its own "Ingen gräns" stop, distinct from a finite
endpoint. Typical slider scales are price 0–20M/100k, rooms 0–10/0.5, area
0–300/5 and fee 0–15k/250. These are not limits: compact exact-entry disclosures
accept the full shared-schema bounds; larger existing values expand the scale.
Exact saved values get their own slider stop and are never rounded on render
or save. Crossed bounds move the paired limit to maintain min <= max.
The application form and privacy text similarly stack; approved account
controls collapse, while pending approval and service errors stay explicit.
No sticky controls obscure forms or the mobile keyboard.
Use 4px spacing steps, 10px control corners and 16px card corners. Brief
hover transitions respect reduced motion; no looping or background animation. No
drop-shadow-heavy nested panels, gradients, custom scrollbars or entrance effects.

Explicit states: public/unconfigured, email verification, pending approval,
approved member, owner review, revoked/expired login, demo, loading, error,
empty, unknown factual values, stale inventory, paused/active alerts. Demo is
labeled globally and on each object. Only demo manual filters immediately
preview results. Member results and digests use the approved saved profile;
drafting or manual editing never changes it before explicit confirmation.
Every edit invalidates prior draft approval. Generated, expired, failed,
cancelled and stale-version states remain visible and recoverable.

Token links require a button-triggered POST; opening a link never verifies,
unsubscribes or removes a member. Actions and errors use live-region feedback.
The public demo cannot create an account or simulate a successful mail delivery.
