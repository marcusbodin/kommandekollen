# Kommandekollen design

The search surface operates a familiar property-search workflow. The public
surface is a closed-membership application, not a claim of public inventory.
One freely licensed, locally optimized interior photograph supplies a compact
welcoming background, always labeled "Inspirationsbild · inte ett bostadsobjekt".
It never represents a listing. Provenance and modifications are documented in
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
optional explicitly selected examples, one material followup and an editable
summary separating requirements, wishes and manual checks. One explicit
confirmation saves the reviewed profile; with no ready sources it saves paused.
No endless chat transcript or fake AI in the deterministic public demo.
Desktop uses a readable 880px central input/review panel, then flexible
two-column factual property cards and source transparency. Below 1050px,
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
Use 4px spacing steps, 10px control corners and 16px card corners. No
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
