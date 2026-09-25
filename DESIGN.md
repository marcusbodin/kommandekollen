# Kommandekollen design

The search surface operates a familiar property-search workflow. The public
surface is a closed-membership application, not a claim of public inventory.
No photos, agency branding, fictional coverage claims, maps without map data,
or decorative listing thumbnails are used.

Clawpilot light/dark variables in `src/style.css` are the color source of truth.
All component colors use those tokens. The only accent is rose; status messages
also have plain text, not color alone. Typography is Segoe UI, Aptos, Calibri,
then platform fallbacks. Body is 16px, supporting copy 13–14px, fixed-scale
headings 18–32px. Controls are at least 44px high with visible keyboard focus.

Desktop search: 280px filter rail, flexible two-column factual property cards,
then inline saved-search controls and source transparency. Below 1050px,
properties become one column. Below 700px, the rail and content stack; ranges
retain paired inputs. The application form and privacy text similarly stack.
Use 4px spacing steps, 10px control corners and 16px card corners. No
drop-shadow-heavy nested panels, gradients, custom scrollbars or entrance effects.

Explicit states: public/unconfigured, email verification, pending approval,
approved member, owner review, revoked/expired login, demo, loading, error,
empty, unknown factual values, stale inventory, paused/active alerts. Demo is
labeled globally and on each object. Changing a filter updates the current
view but never changes the saved search until explicit member action.

Token links require a button-triggered POST; opening a link never verifies,
unsubscribes or removes a member. Actions and errors use live-region feedback.
The public demo cannot create an account or simulate a successful mail delivery.
