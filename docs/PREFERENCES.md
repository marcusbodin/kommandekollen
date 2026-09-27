# Personal search: drafts, consent and Workers AI

The prompt flow, additive migration and matching backend/frontend were deployed
on 2026-09-26. The operator enabled private membership and optional AI after
bounded real-provider/native-binding checks and confirmation of Workers Free.
After the visible-feedback/grounding fix and approved quota migration, the owner
completed actual email login, AI interpretation, explicit confirmation and a
paused save. Aggregate production D1 inspection confirmed the versioned profile
and disabled alerts. Other-member flows and capacity still need follow-up.
**No live property source is connected. Save paused is useful infrastructure,
not delivery of live agency collection or working property alerts.**

## Member experience and matching

Optional shared-password mode adds guest drafting before email. Its gated
guest endpoints, explicit email save intent and second confirmation are
documented in [SHARED_ACCESS.md](SHARED_ACCESS.md). Existing member endpoints
also require the shared gate when that mode is active; they are not a bypass.
Its compact website shell adds wordmark/menu, purpose copy and privacy/contact
footer around the public input. It defers password and unchecked AI consent until
explicit "Förfina min sökning", retaining text across cancel/error and information
navigation. Followups use "Tolka mitt svar" and reuse consent only
within the current in-memory draft. Existing server drafts and saved searches
stay behind explicit disclosure on arrival; the email return opens review, never
confirmation or inference. The API/matching/quotas below are unchanged.
This is a separately activated 0004 rollout, not a change to the historical
production evidence above.

An approved member describes a home, optionally answers one material question,
reviews an editable summary and explicitly confirms the exact draft. Membership
approval and alert consent are separate. Generating, editing, cancelling,
reloading or encountering an AI error does not update the active search.
Without ready sources the button says **Spara pausad sökning**. Activation needs
fresh consent and backend service/source readiness.

Manual sliders and exact-entry fields are secondary, fully functional without
AI. Existing exact filters remain compatible, including `null` (unset) versus
`0`. Version-1 profiles add up to five alternative or excluded municipalities,
types and area strings, four supported soft filter groups and six unverified
criteria. Alternatives use OR within each category and AND between categories.
A single filter and alternatives for that same category cannot coexist.
Area/gata means literal case-insensitive substring matching, not geographic
boundaries. Numeric properties, municipality and type are the only supported
facts; travel time, quietness, sunlight, balconies etc. are not inferred.

`shared/preferences.ts` is the single deterministic matching/ranking/reason
implementation used by frontend results and digests. Soft groups give one
explainable fulfilled-wish reason each, never a percentage or hard exclusion.
Unknown facts never earn a soft ranking reason. Ties use stable listing IDs.
Results with unverified criteria or explicitly included missing hard facts say
that manual checks are required. Unsupported MUST criteria require explicit
acceptance of manual checking before saving, or must be edited/removed.

Saved results always use the approved profile. An unsaved AI draft is not an
active filter. Only the synthetic demo previews unsaved manual filters. The
demo's prompt sequence is a fixed illustrated example, not a model invocation
or a promise to understand arbitrary text.

Mornings still send **only previously unseen objects**, not notifications for
every changed listing. Maximum 20 per digest. Changing a search increments its
version and expires old pending/sending digest payloads, without clearing seen
IDs or resetting the current day's digest marker. An already-attempted old
message is quarantined as `delivery_uncertain`, not regenerated with a new key.
Membership, alert status, search version and outbox eligibility are rechecked
before dispatch. A provider request already in flight cannot be recalled.

## API contract

All routes below require the existing approved session, exact Origin and
credentialed CORS. POST bodies are strict JSON; no client-selected member ID.
The private `/api/me` response adds `profile`, `searchVersion` and `aiReady`.

| Route | Request / response |
| --- | --- |
| `GET /api/preferences/draft` | `{draft: Draft|null, aiReady}`; restores only own ready, unexpired draft |
| `POST /api/preferences/interpret` | `{id: UUID, expectedVersion, previousId: UUID|null, text, aiConsent:true}` → `{draft}` |
| `POST /api/preferences/draft` | `{id: UUID, expectedVersion, previousId: UUID|null, profile, resolveQuestions:boolean}` → `{draft}`; manual review, no model |
| `POST /api/preferences/confirm` | `{id, revision, expectedVersion, enabled:boolean, acceptUnverified:boolean, consent:true}` → `{message, searchVersion, profile, alertsEnabled}` |
| `POST /api/preferences/cancel` | `{id}` → `{message}`; deletes only own matching draft |

`Draft` is `{id, revision, baseVersion, profile, question, conflicts, turns,
expiresAt}`. `question` is null or `{text, choices, required}`. `conflicts` is
a bounded list of human-readable unresolved contradictions. Required questions
and contradictions block confirmation. Optional questions may be skipped.
Manual `resolveQuestions:true` is the user's explicit statement that their
edited profile resolves the question; it never grants access or enables mail.

`/api/search` remains the manual/pausing endpoint but now requires
`expectedVersion` alongside `{filters, enabled, consent:true}`. Clients must
reload `/api/me` before retrying a `409`; no silent last-writer-wins behavior.
Pausing unchanged filters preserves the richer profile. An explicitly saved
different legacy filter set replaces it with a manual profile.

Draft revision/ID and saved-search version are checked transactionally against
the authenticated member. A newer draft, manual edit, confirmed search or
revocation invalidates an older response. Confirmation cannot replay a consumed
draft. The server saves the stored reviewed profile, never a profile submitted
alongside confirmation.

Errors include `ai_disabled` (503), `ai_budget` / `turns` (429),
`ai_provider` / `ai_invalid` / `ai_timeout` (502), `stale_draft` (409),
`clarify` (409), `unverified` (400) and `no_sources` (503). No provider failure
is converted into a fake interpretation. The manual path remains available.

The interface distinguishes interpreting, reviewing and saving. Completed
errors are focused/scrolled into view next to the primary action and preserve
typed text. A successful confirmation retains a visible receipt containing the
server-returned saved profile/version/status. Read-only draft recovery does not
spend another AI attempt. Late initial draft reads cannot replace edits already
in progress; an external saved-version change invalidates consent but retains
local text/filters with an explicit conflict notice. Failed inference attempts
still consume their reservation; no UI recovery refunds or retries them.

## Fixed provider contract and Free budget

`worker/ai.ts` exports the actual `aiCall(text, previous)`, `AI_SYSTEM`,
`AI_JSON_SCHEMA`, `AI_MODEL` and `parseAIResponse` for bounded operator evaluation.

```ts
env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
  messages: [
    { role: "system", content: "Fixed server instruction and examples; see aiCall" },
    { role: "user", content: JSON.stringify({ housingText, previous }) },
  ],
  response_format: { type: "json_schema", json_schema: AI_JSON_SCHEMA },
  max_tokens: 1536,
  temperature: 0,
  stream: false,
}, { signal, returnRawResponse: true });
```

The native raw response must be JSON with a `response` object or JSON string.
The complete interpretation is validated with strict Zod schemas. Tool calls,
extra actions/roles, invalid ranges, empty criteria and observed damaged-text
sequences are rejected. No arbitrary SQL, network fetch, tools, role change,
save or mail action is exposed to the model. OpenAI `choices` metadata is not
used as a fallback when the expected `response` field is missing.

Each request contains at most 1,600 input characters, one previous typed profile
and current question/conflicts, no full chat history. There are at most three
interpretations per draft. Provider response body is bounded to 20,000 bytes
and the entire provider operation has a 20-second timeout. The character limit
is an input-size limit, **not** our token-cost estimate.

The documented model context is 24,000 tokens. Conservatively charge that
**entire context as input, plus all 1,536 allowed output tokens**, even though
this double-counts part of the context. At 26,668 / 204,805 neurons per million
input/output tokens, `ceil(24000*26668/1000000 + 1536*204805/1000000)` is below
the **1,000-neuron reservation per attempt**. No tokenizer or character-to-token
assumption is used to reduce this bound.

D1's `ai_budget` trigger enforces, before inference:

- 6,000 reserved neurons globally per UTC day (six attempts).
- Six attempts per member and per IP per UTC day, within the shared six-attempt
  global limit, not six guaranteed attempts for each member.
- Two unresolved calls globally and one per member, including previous days.

The separate three-interpretation limit per draft is unchanged. Start a new
draft only through an explicit user action; there are no automatic retries.

Every attempt, even failed, consumes its full reservation. No refunds or
automatic retries. If an outcome is unknown, the concurrency slot stays held
(`uncertain` or a crash-left `running`) until an operator verifies provider
completion. Do not blindly reset these states or delete today's budget rows.
Known completed attempts become `done`; cleanup removes those after two days.
At most 4,000 of the account-shared daily Free allowance remains for evaluation
and other uses. The operator must keep the account on Free and account for
other usage; this app cannot inspect other projects' consumption. There is no
paid model fallback, model picker, Gateway credit configuration or daily AI
per-listing inference. Mail reservations remain independent.

## Schema, rollout and operations

`0001_initial.sql` is unchanged and already deployed. Additive
`0002_preferences.sql` adds profile/search/draft-version columns, digest search
versions, one TTL draft per member, pseudonymous AI attempts and two triggers.
The original three capacity/mail-quota triggers remain intact.

The approved additive `0003_ai_daily_attempts.sql` replaces only `ai_budget`,
raising member/IP daily caps from three to six. It does not edit `0001`/`0002`,
change the 1,000-neuron reservation, 6,000-neuron global cap or concurrency
guards, or update/delete any existing attempts. Three previously completed
attempts therefore leave room for a fourth only if the shared global and
concurrency limits allow it. Apply `0003` before publishing the updated daily
limit copy; its presence in source does not mean it is deployed.

Use the existing [atomic file migration runner](../worker/migrations/README.md),
not remote `wrangler d1 migrations apply`. The authorized operator, not a local
implementation agent, runs:

```sh
npm run db:migrate -- --remote --env production \
  --account-id ACTUAL_ACCOUNT_ID --database-id ACTUAL_DATABASE_ID
```

Check history/schema on a lost response before retrying. The runner applies
only the unapplied suffix and never rewrites applied history. Keep the backend
closed until migration succeeds, then deploy the matching Worker/frontend.

The operator adds an environment-specific binding, initially with AI OFF:

```toml
# Add within existing [env.production.vars], not as a duplicate table:
AI_ENABLED = "false"

# Add this separate binding table:
[env.production.ai]
binding = "AI"
```

The binding is native; no API token belongs in frontend vars or this binding.
Missing flag/binding means OFF. A binding-only deploy does not imply the model
works. The parent verified native JSON response/header shape with local workerd
and the real remote AI binding, including native AbortSignal/returnRawResponse.
Full production membership/draft behavior, Swedish quality beyond the bounded
sample and Free CPU time still require rollout checks before general use.

The production configuration now enables `SERVICE_ENABLED=true` and
`AI_ENABLED=true`, with sources still zero. Manual paused searches work without
AI. Scheduled cleanup was enabled before applications; the scheduled handler
cleans before checking `SERVICE_ENABLED`. An every-minute cron also dispatches at most one
login/notice/digest per tick, with morning digest preparation restricted to
07:00–09:59 Europe/Stockholm. The operator owns cron activation, domain HTTPS,
provider privacy agreements, session/mail validation and account capacity.
Do not lower authentication/source/consent guards to work around launch issues.

Only profile/draft data is stored, not raw prompts or full model output.
Drafts expire for access after 30 minutes and are deleted on the next cleanup.
Revocation and account deletion delete drafts immediately; confirmed profiles
follow the membership lifetime. AI attempt identifiers are HMAC-pseudonymized,
contain no housing text and retain global/IP budget enforcement across deletion/rejoin.
Unknown outcomes require operator investigation before removal. Never enable
request-body/model-output logging or publish private browser traces.

Cloudflare's [data-use statement](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
says Customer Content is not used for training without explicit consent. Users
can nevertheless type PII; the UI warns against this, rejects obvious emails/
Swedish personal numbers, and adds no account/email metadata. It does not claim
all PII can be detected, no provider retention, or EU-only AI processing.
The user-approved public controller is **Marcus Bodin (privatperson)**, contact
**kontakt@kommandekollen.se**. This does not disclose or configure the private
owner-login address. The privacy UI distinguishes D1's verified EU jurisdiction
from Resend's US account/metadata/log/API storage and does not infer AI residency.
Provider retention/transfer arrangements and operational checks remain the
controller's responsibility; the UI is not a legal-compliance certification.

## Evidence and limitations

Local tests cover typed profiles, deterministic matching, unknown/zero/exact
values, unsupported criteria, quotas under concurrency, auth/isolation,
invalid output, cancellation, version/consent/paused saves and digest
invalidation. Browser tests simulate the backend; they do not prove AI quality.

The parent ran eight bounded synthetic REST calls on this exact model. Initial
three cases exposed semantic errors. After adding schema descriptions and
grounded examples, alternatives/soft size and contradictory-room cases passed,
as did two followups preserving/changing prior state. The unsupported-criteria
case retained its meaning but generated damaged Swedish characters; the strict
parser now rejects that output instead of silently repairing it. Four revised
outputs pass the actual parser, one is deliberately rejected. A ninth synthetic
call through native workerd/remote AI returned the correct Solna/Lägenhet/
min3rum/max5m profile and passed the same strict parser. Native abort options and
raw response shape worked. Total provider-reported usage across these nine calls
was about 681.285 neurons outside the production D1 application budget.
This remains a small evaluation, not broad Swedish-language quality proof or
proof that the deployed membership/draft flow meets the Free CPU budget.
Local/missing-flag defaults remain OFF. The operator enabled production AI after
these bounded checks; this is not a broad reliability or capacity certification.

A subsequent production report exposed a model output containing both a single
municipality and its alternative, which the strict validator correctly refused.
No draft or saved search remained after that rejection, but the previous UI
made the failure easy to miss. The fix preserves that validation and makes its
error visible. Additional synthetic grounding distinguishes bedrooms from total
rooms, plot area from living area, and preferred budgets from hard ceilings.
One bounded in-memory provider check accepted the revised structure while still
requiring location/type review; it is not evidence that all semantics are right.
No real user's housing text or raw output is committed or logged.

`tests/browser/preferences-network.spec.ts` exercises browser requests over a
loopback HTTP server through the actual Worker routes, strict provider parser
and real local D1. Only the external model is substituted. This complements
the faster browser API simulations and covers actual draft/confirmation
response shapes, persisted read-back, rejected/limited AI, visible error
recovery and state races. Production quotas are never reset by these tests.

Sources: [model and context](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/),
[JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/),
[Free pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
Prices/support must be rechecked before changing model or limits.

**Built with Llama.** Llama 3.3 is licensed under the Llama 3.3 Community License,
Copyright © Meta Platforms, Inc. All Rights Reserved.
[License](https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE)
and [Acceptable Use Policy](https://www.llama.com/llama3_3/use-policy).
This repository calls Cloudflare's hosted model; it does not distribute weights
or train another model. Required attribution is also visible beside the AI UI.
