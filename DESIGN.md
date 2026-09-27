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

The user-pinned visual reference supersedes the former rose/cream palette:
airy white, pale mint input regions, teal brand/details and pale-pink pill
actions. It supplies a visual language, not finance content, copied artwork or
a different product. Exact purpose copy, wordmark/home icon and navigation stay.
Georgia gives the main heading and wordmark a readable native serif voice;
forms, navigation and supporting headings retain the compact Segoe UI stack.
The intro is on white rather than inside a tinted hero card. Mint groups the
input, photo credit and footer; pink is reserved for primary actions.

The `--cp-*` system has these stable roles:

| Role | Light | Dark |
| --- | --- | --- |
| Pinned primitives | Pinky `#fbe3e8`, Blue Greeny `#5cbdb9`, Teeny Greeny `#ebf6f5` | Same primitives |
| Canvas / surface | White `#ffffff` | `#172927` / `#203532` |
| Soft region / input | Mint `#ebf6f5` | `#29433f` |
| Primary action / hover | Pink `#fbe3e8` / derived `#f7d4de` | Same pinks |
| Secondary button / hover | Teal `#5cbdb9` / derived `#7ccdc8` | Same teals |
| Quiet choice / disabled ink | Mint `#ebf6f5` / `#526b69` | Same colors |
| Action / brand-fill foreground | Deep ink `#203a39` | Same deep ink |
| Text / muted | `#203a39` / `#526b69` | Mint `#ebf6f5` / `#b5ccc7` |
| Heading / link / selected control | Derived deep teal `#246d69`; hover `#195653` | Pinned teal `#5cbdb9`; hover `#8ed5ce` |
| Focus | Deep teal `#246d69` | Light teal `#8ed5ce` |
| Control elevation | `0 3px 10px rgba(32,58,57,.12)` | `0 3px 10px rgba(0,0,0,.22)` |
| Menu / dialog elevation | `0 10px 28px rgba(32,58,57,.16)` | `0 10px 28px rgba(0,0,0,.36)` |

The raw teal fill is never small text on white: deeper teal derivatives provide
AA text contrast. Pink actions use dark ink, not white. The user's borderless
refinement replaces persistent edges with filled controls and soft elevation:
`--cp-shadow-control` groups the prompt, photo, fields and ordinary panels;
`--cp-shadow-panel` raises menus and dialogs. There are no inset rings or
shadow stripes in place of separators. Header/footer and section separators
have no borders; spacing and surface colors retain their hierarchy.
Primary buttons stay visibly pink even when empty/busy/disabled. Disabled
controls keep their native disabled semantics, muted readable ink, no elevation
and a not-allowed cursor; hover never makes them look enabled. Secondary/Meny
buttons are teal; quieter choices are mint. Selected property types also have
an underlined, heavier label, not just a different fill. Navigation links stay
unshadowed text links. No shadows are attached to individual labels.

Native checkbox/radio/slider affordances and explicit keyboard/feedback focus
outlines are retained. Text and placeholders meet their AA contrast thresholds;
focus indicators meet 3:1. Visible labels, native semantics and focus identify
fields and actions. Pastel fills and soft shadows are grouping cues, not a
claim of 3:1 boundary contrast. Tests check the actual border widths are zero,
the elevation has offset/blur rather than an outline ring, labeled controls,
button states and real text/focus contrast, not colors of removed borders.
Success, warning and error tokens retain their semantic colors and text cues;
errors use readable red text instead of a decorative underline. They are not
decoration. Dark mode uses layered green-dark surfaces, not a
mechanical inversion. No gradients, glass, external fonts or large shadows.

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

The Clawpilot `--cp-*` light/dark variables in `src/style.css` remain the color source of truth.
Light is the default even when the OS prefers dark; dark remains an explicit
theme-button/query choice. All component colors use those tokens; raw brand
values occur only in token definitions. Body typography is Segoe UI, Aptos,
Calibri, then platform fallbacks; `--cp-font-display` is Georgia with native
serif fallbacks. Body is 16px, supporting copy 13–14px, headings 18–44px
(home display 32px on narrow phones). The wordmark reduces to 18px at 360px
and below, keeping the logo and menu on one compact row. Inputs remain at least 16px to avoid iOS focus zoom. Primary
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
Use 4px spacing steps, 10px field corners, 16px image/panel corners and a
20px prompt region. Primary actions and the menu toggle are gently pill-shaped. Brief
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
