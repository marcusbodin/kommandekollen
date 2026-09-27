# Kommandekollen design

The search surface is Operate mode: one housing task, not a marketing landing
page. The user's correction replaces the isolated-input design with a compact,
recognizable website shell: existing "kommandekollen." wordmark/home identity,
real navigation, short purpose copy, dominant search and a tidy footer.
The latest composition reference puts the prompt on the left and the question
"Vad är viktigt i ditt nästa hem?" on the right, over a full-width home photograph.
It supplies composition only, not another site's branding, ads, tabs or copy.
The initial primary action remains exactly "Hitta bostad".
"Hitta kommande bostäder före andra." is a short secondary value statement below
the main heading, not a competing headline. Supporting copy qualifies the
aspiration: "Vi bygger en samlad koll direkt från mäklarna."
It does not claim connected sources, complete coverage, measured speed or buying
priority. Early source-direct discovery is the core value; AI is optional help.
The input label remains "Beskriv ditt nästa hem". Its helper says the AI creates
a proposal, needs a password and asks for email only at saving. Followups use
"Uppdatera sökförslaget". The private feed follows the prompt/review immediately.
The latest decision replaces public listing access with password-only invited
browsing. Its locked section offers "Öppna bostadslistan"; the browse dialog
asks only for the shared password, never email or AI consent. The shell stays
public and the same prompt remains mounted. Later inference still asks for
unchecked AI consent. Listing facts/counts and source diagnostics are absent
until server access is verified; stale responses cannot restore them after logout.
The user removed the goal sentence, global pause note and public-feed subtitle
without replacement. Paused-only disclosures remain in review, saving and receipts.
Password, email, private source panels, saved profiles and full legal text stay
progressively disclosed. The new background is decorative, not a property listing
or a photo card. No inspiration image is rendered inside the public feed.

The latest user-supplied logo palette supersedes the earlier mint/teal/pink:
neutral white/gray surfaces and black/white typography, with blue, light blue
and coral confined to buttons. The supplied logo and interior image retain
their original colors. Links, status copy, focus, inputs and disclosures stay
neutral rather than distributing the accent colors across the page.
Georgia gives the main heading and wordmark a readable native serif voice;
headings now use the requested heavier weight 700.
forms, navigation and supporting headings retain the compact Segoe UI stack.
The owner's subsequent liquid-glass request replaces the two opaque hero panels
with translucent material: 66% white in light mode, 72% charcoal in dark mode,
10px backdrop blur, slight saturation and restrained inset light edges over
the existing offset shadow. The input's inner surfaces are transparent rather
than hiding the picture behind a second solid block. Hero text/placeholders and
focus use strong neutral ink, dark in light mode and near-white in dark mode.
Contrast is bounded against both black and white image pixels, not just the
fallback canvas. Unsupported backdrop filtering, reduced transparency, forced
colors and image failure restore opaque panels and light/dark gray input surfaces.
Expanded review/filter panels, menus, dialogs and listing surfaces stay solid.
No full-photo wash, text shadow, animation or pointer-following distortion is
added. Empty states and the footer are neutral; blue is for primary actions.

The user-supplied house/radar artwork is the pinned site mark, replacing the
generic home-icon badge in both shared and legacy/demo headers. The latest blue
outline/chimney, light-blue arc and coral wedge must not be redrawn, recolored,
inverted or replaced with a generic icon. A lossless local 80px derivative
renders at 40px, or 36px on narrow phones, beside the existing wordmark.
Only transparent outer padding is trimmed; the artwork is centered on a
transparent square with no solid backing. A matching 32px PNG is the favicon.
Explicit dimensions prevent layout shifts; an empty image alt avoids repeating
the accessible brand-link name. The full brand remains a 44px-high home link.
The artwork's provenance is separate from the photo license, in
`public/assets/BRAND.md`. Source artwork colors are preserved pixels, not theme
tokens; the surrounding UI still uses the pinned `--cp-*` system.

The `--cp-*` system has these stable roles:

| Role | Light | Dark |
| --- | --- | --- |
| Pinned button primitives | Blue `#0070ed`, ice `#a3d9fc`, coral `#fc6761` | Same primitives |
| Canvas / surface | White `#ffffff` | `#171717` / `#222222` |
| Soft region / input | Gray `#f2f2f2` | `#2b2b2b` |
| Primary action / hover | Blue `#0070ed` / `#005ec7` | Same blues |
| Secondary button / hover | Ice `#a3d9fc` / `#8bcdf8` | Same light blues |
| Destructive button / hover | Coral `#fc6761` / `#ed554f` | Same corals |
| Quiet choice / disabled ink | Gray `#e8e8e8` / `#595959` | Same colors |
| Primary / secondary foreground | White `#ffffff` / ink `#202020` | Same foregrounds |
| Text / muted | `#202020` / `#595959` | `#f5f5f5` / `#c2c2c2` |
| Heading / link / focus | `#202020`; hover `#000000` | `#f5f5f5`; hover `#ffffff` |
| Control elevation | `0 3px 10px rgba(0,0,0,.12)` | `0 3px 10px rgba(0,0,0,.22)` |
| Menu / dialog elevation | `0 10px 28px rgba(0,0,0,.16)` | `0 10px 28px rgba(0,0,0,.36)` |

Blue buttons use white text (4.62:1); ice and coral buttons use dark text.
The colors never become small accent text on white. The user's borderless
refinement replaces persistent edges with filled controls and soft elevation:
`--cp-shadow-control` groups the prompt, fields, factual cards and ordinary panels;
`--cp-shadow-panel` raises menus and dialogs. There are no inset rings or
shadow stripes in place of separators. Header/footer and section separators
have no borders; spacing and surface colors retain their hierarchy. The
explicitly requested hero glass is the sole exception to the no-inset-shadow
rule: its top/bottom light edges describe the transparent material, not controls.
Primary buttons stay visibly blue with readable white ink when empty/busy/disabled.
Other disabled controls use neutral readable ink. Disabled controls retain their
native semantics, no elevation
and a not-allowed cursor; hover never makes them look enabled. Secondary/Meny
buttons are light blue; quieter choices are gray. Selected property types also have
an underlined, heavier label, not just a different fill. Navigation links stay
unshadowed text links. No shadows are attached to individual labels.

Native checkbox/radio/slider affordances and explicit keyboard/feedback focus
outlines are retained. Text and placeholders meet their AA contrast thresholds;
focus indicators meet 3:1. Visible labels, native semantics and focus identify
fields and actions. Pastel fills and soft shadows are grouping cues, not a
claim of 3:1 boundary contrast. Tests check the actual border widths are zero,
ordinary elevation has offset/blur rather than an outline ring, labeled controls,
button states and real text/focus contrast, not colors of removed borders.
Success, warning and errors retain their explicit text and semantics, not
colored decoration. Error messages use strong neutral ink and weight.
Destructive buttons use coral but still require their existing confirmations.
Dark mode uses layered charcoal surfaces, not a mechanical inversion.
No gradients, external fonts or large shadows; glass stays limited to the hero.

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
Questions, review and focused outcomes appear after progression. Source
availability is shown only after invited browsing access is verified.
Draft restore is explicit, except return from email review.
Email-at-save verification and the second explicit confirmation stay separate.

Copy names each distinct outcome: "Skapa med AI" permits interpretation,
"Fortsätt till e-post" starts the guest's verification step, "Begär verifieringslänk"
requests a link without promising delivery, and "Bekräfta e-post" establishes
identity without saving. "Bekräfta och spara pausad sökning" remains a separate
second consented action. Only its successful save receipt says "Din sökning är
sparad och pausad". Processing, provider, privacy and quota meanings are unchanged.

The private section is "Senaste kommande bostäder". "Filtrera objekt" discloses
independent ordinary filters; "Använd filter" applies them across the entire
bounded collection. It never edits the personal draft. "Ladda fler" appends 12
at a time; current cards survive a failed next-page request, with explicit retry.
Cards carry only factual attributes, source links, first discovered and last
checked dates. First discovered is not original publication time. Older-than-48h
facts and unknown values stay explicit. The private response's absence of sources
reads "Inga bostadskällor är anslutna ännu. Därför visas inga bostäder just nu."
This is different from no current inventory, no filter matches and fetch/service
failures. No count is invented, no synthetic fallback is substituted, and the
12-card initial page does not remove the 200-record inventory cap.

Unknown type/price/rooms/size/fee consistently read "Ej angivet"; no type is
inferred from fee, address or photography. Unrestricted types include unknowns;
explicit type choices or exclusions do not. Partial cards say that they are
observed in a limited selection, not a complete inventory. List counts mean
stored finds. Source details distinguish private observations from licensed
complete snapshots without exposing configuration references.
Available private finds do not enable property email. Review/save/receipt
disclosures remain paused until the independent server capability is ready;
no global homepage pause sentence is restored.

The old inspiration card, its visible caption/credit and the former photo-led
layouts remain removed, including legacy membership and demo. The newly requested
hero is the sole exception to the earlier no-photo direction. Its quiet footer
credit and provenance are separate from the historical unused WebP files in
`public/assets/ATTRIBUTION.md`.
The current background is the owner's supplied warm interior image with a
balcony and tiled stove, `autumn-home-800.webp` and `autumn-home-1374.webp`.
Its provenance and processing are public in the same notice; no photographer,
real address or public reuse license is invented. The former house photograph
and its CC BY-SA attribution remain historical, not the new image's license.
Only local files load. The image is
decorative (empty alt), has explicit 1374 x 1145 intrinsic dimensions, uses a
bounded 800px mobile source and high fetch priority, and crops within a backdrop
no taller than 680px. There are no runtime third-party image requests.
The supplied logo is retained, not treated as inspiration. No agency branding,
fictional coverage claims, maps without data or decorative thumbnails are used.

The Clawpilot `--cp-*` light/dark variables in `src/style.css` remain the color source of truth.
Light is the default even when the OS prefers dark; dark remains an explicit
theme-button/query choice. All component colors use those tokens; raw brand
values occur only in token definitions. Body typography is Segoe UI, Aptos,
Calibri, then platform fallbacks; `--cp-font-display` is Georgia with native
serif fallbacks. Body is 16px, supporting copy 13–14px, headings 18–48px
(home display 32px on narrow phones). The wordmark reduces to 18px at 360px
and below, keeping the logo and menu on one compact row. Inputs remain at least 16px to avoid iOS focus zoom. Primary
targets and disclosure summaries are at least 44px high with visible keyboard
focus; checkbox labels provide the larger touch target.

The primary search interaction is a compact housing-description textarea,
one material followup and an editable
summary separating requirements, wishes and manual checks. One explicit
confirmation saves the reviewed profile; with property-email capability off it
saves paused regardless of the number of private observations.
No endless chat transcript or fake AI in the deterministic public demo.
The compact homepage has a full-width photo region below the header and a
bounded 1120px inner composition. At desktop widths the opaque search card is
left and the large question is right, sharing one grid row. The DOM retains
heading-before-input context; no interactive controls are reordered.
At 960px and below the heading precedes the search card in one natural-height
column. There is no viewport-height hero, parallax or image-only mobile screen.
Expanded review, manual filters and save receipts span the row below the top
pair on opaque surfaces. A presentation slot keeps the same PreferenceFlow and
textarea mounted; changing listing filters, panels or theme cannot reset them.
The background height is bounded instead of stretching a photo across a long
expanded form. The private feed stays on a plain surface in a centered 1080px
column, using a full-width page grid rather than overflowing 100vw offsets.
Factual cards use two columns on wider desktops and one below 1050px;
filters disclose in one easy-to-scan column.
Natural spacing and a minimum-height page put
the footer after the content, not over the keyboard. The public textarea has a
persistent visible label, a factual example placeholder and a short next-step
helper. Native dialogs remain scrollable. At 320px, 16px side gutters preserve
16px input text and 44px action targets; navigation and controls reflow at 200%
zoom. Private ranked results/source runs remain separately requested.
Legacy/demo desktop uses an 880px input/review panel and flexible
two-column factual property cards. Below 1050px,
properties become one column. Below 700px, content stacks. These legacy/demo
surfaces do not restore the removed inspiration photograph.
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
