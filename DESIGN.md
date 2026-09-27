# Kommandekollen design

The search surface is Operate mode: one housing task, not a marketing landing
page. The user's correction replaces the isolated-input design with a compact,
recognizable website shell: existing "kommandekollen." wordmark/home identity,
real navigation, short purpose copy, dominant search and a tidy footer.
The latest user-pinned H1 is exactly "Hitta kommande bostäder före andra" and
the initial primary action is exactly "Hitta bostad". Supporting copy qualifies
the aspiration: "Vi bygger en samlad koll på kommande bostäder direkt från
mäklarna. Målet: hitta ditt nästa hem innan annonsen når de stora bostadssajterna."
It does not claim connected sources, complete coverage, measured speed or buying
priority. Early source-direct discovery is the core value; AI is optional help.
The input label remains "Beskriv ditt nästa hem". Its helper says the AI creates
a proposal, needs a password and asks for email only at saving. Followups use
"Uppdatera sökförslaget". The public feed follows the prompt/review immediately.
A calm pilot note says searches currently save paused without housing emails.
Password, email, private source panels, saved profiles and full legal text stay
progressively disclosed. No inspiration photograph is rendered in any mode.

The user-pinned visual reference supersedes the former rose/cream palette:
airy white, pale mint input regions, teal brand/details and pale-pink pill
actions. It supplies a visual language, not finance content, copied artwork or
a different product. The pinned wordmark and navigation stay.
Georgia gives the main heading and wordmark a readable native serif voice;
forms, navigation and supporting headings retain the compact Segoe UI stack.
The intro is on white rather than inside a tinted hero card. Mint groups the
input, empty state and footer; pink is reserved for primary actions.

The user-supplied house/radar artwork is the pinned site mark, replacing the
generic home-icon badge in both shared and legacy/demo headers. Its turquoise
outline/chimney, pale-mint arc and pink wedge must not be redrawn, recolored,
inverted or replaced with a generic icon. A lossless local 80px derivative
renders at 40px, or 36px on narrow phones, beside the existing wordmark.
Only the outer blank canvas is cropped; the small original light backing
protects very pale details in dark mode. A matching 32px PNG is the favicon.
Explicit dimensions prevent layout shifts; an empty image alt avoids repeating
the accessible brand-link name. The full brand remains a 44px-high home link.
The artwork's provenance is separate from the photo license, in
`public/assets/BRAND.md`. Source artwork colors are preserved pixels, not theme
tokens; the surrounding UI still uses the pinned `--cp-*` system.

The `--cp-*` system has these stable roles:

| Role | Light | Dark |
| --- | --- | --- |
| Pinned primitives | Pinky `#fbe3e8`, Blue Greeny `#5cbdb9`, Teeny Greeny `#ebf6f5` | Same primitives |
| Canvas / surface | White `#ffffff` | `#172927` / `#203532` |
| Soft region / input | Mint `#ebf6f5` | `#29433f` |
| Primary action / hover | Pink `#fbe3e8` / derived `#f7d4de` | Same pinks |
| Secondary button / hover | Teal `#5cbdb9` / derived `#7ccdc8` | Same teals |
| Quiet choice / disabled ink | Mint `#ebf6f5` / `#526b69` | Same colors |
| Action / secondary foreground | Deep ink `#203a39` | Same deep ink |
| Text / muted | `#203a39` / `#526b69` | Mint `#ebf6f5` / `#b5ccc7` |
| Heading / link / selected control | Derived deep teal `#246d69`; hover `#195653` | Pinned teal `#5cbdb9`; hover `#8ed5ce` |
| Focus | Deep teal `#246d69` | Light teal `#8ed5ce` |
| Control elevation | `0 3px 10px rgba(32,58,57,.12)` | `0 3px 10px rgba(0,0,0,.22)` |
| Menu / dialog elevation | `0 10px 28px rgba(32,58,57,.16)` | `0 10px 28px rgba(0,0,0,.36)` |

The raw teal fill is never small text on white: deeper teal derivatives provide
AA text contrast. Pink actions use dark ink, not white. The user's borderless
refinement replaces persistent edges with filled controls and soft elevation:
`--cp-shadow-control` groups the prompt, fields, factual cards and ordinary panels;
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
Questions, review and focused outcomes appear after progression. Public source
availability is visible immediately, without reading the private source status.
Draft restore is explicit, except return from email review.
Email-at-save verification and the second explicit confirmation stay separate.

Copy names each distinct outcome: "Skapa med AI" permits interpretation,
"Fortsätt till e-post" starts the guest's verification step, "Begär verifieringslänk"
requests a link without promising delivery, and "Bekräfta e-post" establishes
identity without saving. "Bekräfta och spara pausad sökning" remains a separate
second consented action. Only its successful save receipt says "Din sökning är
sparad och pausad". Processing, provider, privacy and quota meanings are unchanged.

The public section is "Senaste kommande bostäder". "Filtrera objekt" discloses
independent ordinary filters; "Använd filter" applies them across the entire
bounded collection. It never edits the personal draft. "Ladda fler" appends 12
at a time; current cards survive a failed next-page request, with explicit retry.
Cards carry only factual attributes, source links, first discovered and last
checked dates. First discovered is not original publication time. Older-than-48h
facts and unknown values stay explicit. The public response's absence of sources
reads "Inga bostadskällor är anslutna ännu. Därför visas inga bostäder just nu."
This is different from no current inventory, no filter matches and fetch/service
failures. No count is invented, no synthetic fallback is substituted, and the
12-card initial page does not remove the 200-record inventory cap.

All inspiration components, visible photo captions/credit links and photo-led
layouts are removed, including legacy membership and demo. Historical unused
WebP files and their provenance remain in `public/assets/ATTRIBUTION.md`.
The supplied logo is retained, not treated as inspiration. No agency branding,
fictional coverage claims, maps without data or decorative thumbnails are used.

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
The compact homepage uses an 1120px shell, a centered 760px intro/prompt column
and the public feed below. Factual cards use two columns on wider desktops
and one below 1050px; filters disclose in one easy-to-scan column.
Natural spacing and a minimum-height page put
the footer after the content, not over the keyboard. The public textarea has a
persistent visible label, a factual example placeholder and a short next-step
helper. Native dialogs remain scrollable. At 320px, 16px side gutters preserve
16px input text and 44px action targets; navigation and controls reflow at 200%
zoom. Private ranked results/source runs remain separately requested.
Legacy/demo desktop uses an 880px input/review panel and flexible
two-column factual property cards. Below 1050px,
properties become one column. Below 700px, content stacks. There are no
photo bands or reserved empty image regions.
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
Use 4px spacing steps, 10px field corners, 16px card/panel corners and a
20px prompt region. Primary actions and the menu toggle are gently pill-shaped. Brief
hover transitions respect reduced motion; no looping or background animation. No
drop-shadow-heavy nested panels, gradients, custom scrollbars or entrance effects.

Explicit states: public/unconfigured, email verification, pending approval,
approved member, owner review, revoked/expired login, demo, loading, error,
empty, unknown factual values, stale inventory, paused/active alerts. Demo is
labeled globally and on each object. Demo manual filters immediately preview
synthetic results; public filters apply only to the public feed. Member results
and digests use the approved saved profile;
drafting or manual editing never changes it before explicit confirmation.
Every edit invalidates prior draft approval. Generated, expired, failed,
cancelled and stale-version states remain visible and recoverable.

Token links require a button-triggered POST; opening a link never verifies,
unsubscribes or removes a member. Actions and errors use live-region feedback.
The public demo cannot create an account or simulate a successful mail delivery.
