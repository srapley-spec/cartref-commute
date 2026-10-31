# Signal design system and automatic journey presentation
Status: Behind toggle (compact v2 independently and visually reviewed; release gates in Signal testing) · Since: 29 Oct 2026

## Story
As a commuter, I want the appropriate planning or live journey view to appear automatically, with a manual override, so I can act quickly without losing control or information.

## Decision and evidence
Sam selected Signal after reviewing two iPhone-first mockups, requested dynamic light/dark switching, and explicitly required automatic Planner/Live switching with manual override. The source architecture remains authoritative: [decisions and proposals](../architecture.md#signal-presentation-architecture-29-oct-2026). See [specification](../design-system.md).

## Compact v2 direction (Sam, 31 Oct 2026)
Sam requested a substantial reduction in the first Signal build's bulk, taking the readable timetable density of
Railboard and Flighty's decisive current-journey hierarchy as references. This is a compact redesign of Signal,
not a new routing system. The approved hierarchy and preservation constraints are in
[compact design review](../signal-compact-design-review.md). Its reference audit and target measurements are
separate from final candidate visual approval.

This decision intentionally revises the earlier inventory's always-exposed direction and pace controls: the
**existing functional controls** now live in **Journey options**, whose closed summary shows the effective
direction/mode and pace. No duplicate state, cloned controls or mock settings are introduced. Auto / Plan / Live
and Leave now / Arrive by / Leave around remain exposed. The compact-v2 criteria below supersede older Signal
geometry where they differ; journey calculations, current features and status semantics remain authoritative.

### Compact v2 acceptance criteria
- Show a short masthead, always-available Auto / Plan / Live and planning-mode controls, effective journey context,
  then the current answer with one dominant time. Journey options expands to the real Commute/Leisure,
  Auto/office/home and pace controls; each changed value is reflected in the closed summary.
- Keep the primary recommendation prominent. Render Next best as a compact native disclosure rather than a
  second large card. Expansion preserves its service/platform/status, scheduled/expected and arrival times,
  duration, same-train boarding alternatives, flags, complete steps and Follow action. No train is omitted.
- Keep one concise network-impact line visible near the answer. Full original banners and their full notices
  remain under Travel alerts, with a reachable control from the summary. Never hide a train-specific
  cancellation, no-estimate or uncertainty flag inside only the global disclosure.
- Lines & data contains the full line-status detail, source/model explanation and technical request/build data.
  A concise freshness label and Refresh remain available outside that disclosure. Why these trains stays
  reachable, and stale, partial-failure and unknown-source qualifications remain truthful.
- Board rows use their full width for service information, with aligned Train / Expected / Arrival where
  required, readable route/operator/platform/flags and a Follow action at least 44 px high. Density comes from
  hierarchy and less repetition, not clipped details, tiny service text or removed actions.
- In Auto/Live a followed journey is the foreground answer; other recommendations may fold beneath it,
  preserving all actions and information. Explicitly choosing Plan keeps its primary planning answer visible
  outside that fold while following and its important alerts continue. Ordinary refresh cannot fold the
  requested answer away. Tube connection choices and correction controls are extracted outside folded
  recommendations, retaining their real handlers; planning navigation preserves the selected Tube.
- Controls, disclosures, notice text, focus, selected service and entered dates/times survive ordinary redraws.
  Native disclosure contents grow naturally for long text, large type and unknown/late states; no horizontal
  overflow or overlapping actions at 320 px. Themes retain contrast and status/Tube identity colours.
- When Circle, Met and H&C are all unavailable now, the impact line says to check onward travel; it must not
  present H&C/Aldgate East as a usable resolution or assert the same closure will apply to a future plan. Existing
  warning precedence is retained for more important feed or train problems, with the onward-travel qualification
  still visible. Future Arrive by/Leave around missing-route status comes from the displayed plan, even while
  its full alerts are folded.
- Signal stays off by default. With Signal off, Panda's original DOM placement, control behavior, requests,
  ranking, content and selected journey are restored. Switching on/off moves the same live elements back to
  their recorded homes, retaining their handlers and values; it does not replace the production application.

## Acceptance criteria — agreed direction and existing constraints
- Automatic is the default view selection; manual Planner/Live and Return to Auto are available.
- Situation, service identity, confidence, ranking and times come from the engine; view selection does not change trip direction or train identity.
- Uncertain identity asks for confirmation. Live without an active journey is explicit, not invented.
- Follow the device appearance by default; manual light/dark choices are available.
- Preserve all current commute capabilities in the specification inventory, including cancelled/no-estimate options, same-train boarding points, warnings, freshness, corrections, all modes, dates, pace, Settings and Leisure entry points.
- Preserve the station departure-first rule and the homeward Tube-to-train consequences. Latest-code
  reconciliation includes original arrival, incident recovery, explicit “I’m on it”, stable same-train progress,
  explicit run/car following, quiet ordinary alternatives while on a Tube, and one-minute ETA stability.
- Known-vehicle Tube predictions may update the chosen connection only through the recorded-data validated,
  source-guarded matching path; missing/stale observations remain modelled. See [Follow a route](follow-a-route.md).
- No simulated early-platform, coach or signalling-point features are presented as current capabilities.
- Red, amber and green are reserved for status (Sam, 30 Oct): never accent, identity, selection or tracking. Every
  live train, including the one you're on, shows its status as a word with minutes, coloured by band (red: cancelled,
  no estimate, 15+ min; amber: 5–14 min; green: under 5 min; Sam 30 Oct). A departure shows Train · Expected ·
  At destination at the same size ([rule](../design-system.md#timetabled-and-expected-departure-sam-30-oct-2026-panda-and-signal);
  the preview predates it). On the live card the status chip sits inside the
  train's blue identity lozenge (Sam, 30 Oct). The preview shows this; production shares the engine rule with Panda
  ([train-status](train-status.md)). → [specification](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal)

## Additional policies agreed by Sam (29 Oct; lifetime updated 30 Oct 2026)
- Use the newer Follow a route behavior, selected by Sam on 30 Oct. Return to Auto clears the override; otherwise
  it expires after 20 minutes or an underlying situation change. This replaces the original journey-scoped
  lifetime. Refresh, appearance changes and temporary GPS loss alone do not end it.
- Automatic transitions defer during editing, selection or expanded-notice reading.
- Tracking and important journey alerts continue while Planner is manually pinned.

## Feature switch and preservation
- Settings → Experimental → Signal design starts off. Panda remains available by disabling it.
- Follow a route is a separate Experimental setting. Selecting Signal checks it as a convenience; it can be
  configured independently, and both designs share the chosen route and normal engine.
- Switching design retains direction, deadline, selected train/Tube, followed route and ordinary saved settings.
- Implement from latest `main`, not the prototype source revision: current departure columns, effort levels,
  train status, correction controls, Aldgate platform planning, interchange timings and simulator survive.

## Tests
The shared Signal/Follow a route implementation is behind the switch; compact v2 review is approved and release verification is recorded separately. [Signal testing](../signal-testing.md) records the required evidence
and hands-on morning checks; do not treat the standalone mockup as regression evidence.

Before release acceptance: run existing engine/app/golden suites, typecheck, build and check-docs on the committed
implementation. Focused UI tests now cover automatic transitions, manual pinning, Return to Auto following the
latest situation, state/focus preservation, no-active/uncertain identity, persistence, exact expiry, interaction
deferral and alert visibility while planning is pinned. Run the production-browser layout/theme checks; real
iPhone Safari and VoiceOver remain hardware acceptance. See [verification](../signal-testing.md).

- tests/core/viewControl.test.mjs: "view control: planning pins the selected question without changing the live situation or deadline"
- tests/core/viewControl.test.mjs: "view control: manual choice expires at exactly twenty minutes and immediately on a changed situation"
- tests/core/viewControl.test.mjs: "view control: Return to Auto uses the newest situation rather than the situation that was pinned"
- tests/core/viewControl.test.mjs: "view control: requesting Live without an active journey is explicit and never fabricates a service"
- tests/core/viewControl.test.mjs: "view control: automatic transitions wait during editing, selection or notice reading and then catch up"
- tests/core/viewControl.test.mjs: "view control: malformed or future saved overrides cannot trap the app in a pinned view"

- tests/signal.test.mjs: "Signal off preserves the default design and keeps new controls hidden"
- tests/signal.test.mjs: "Signal preserves every journey field and request while compacting Panda content"
- tests/signal.test.mjs: "Signal status summary follows actual engine warning precedence and handles loading"
- tests/signal.test.mjs: "manual Plan retains tracking, selection and deadline; Return to Auto uses latest situation"
- tests/signal.test.mjs: "planning override expires exactly at twenty minutes and on a reliable situation change"
- tests/signal.test.mjs: "GPS loss does not expire a planning pin or clear a confirmed train"
- tests/signal.test.mjs: "expanded journey steps defer navigation and keep disclosure and focus through refresh"
- tests/signal.test.mjs: "appearance and design settings persist independently of journey state"
- tests/presentation-ui.test.mjs: "Signal dispatch enforces the canonical order on the actual live hero"

Compact v2 adds independent real-page integration coverage in `tests/signal-compact-review.test.mjs` and production-browser checks
in [browser-signal-compact.py](../../tests/browser-signal-compact.py). The browser checks must inspect ordinary,
closure, followed and expanded-detail layouts in light/dark appearances at phone widths, enlarged text,
44 px actions, no overflow, original-Panda restoration and disclosure reachability. Test creation or reference
measurements alone do not establish a passing final candidate; independent review and the committed-code
release checks remain required.

- tests/signal-compact-review.test.mjs: "compact review: repeated refresh keeps planning focus and defers navigation until editing ends"
- tests/signal-compact-review.test.mjs: "compact review: skin roundtrips restore every original Panda node in order with working controls and input values"
- tests/signal-compact-review.test.mjs: "compact review: expanded visible alerts defer Auto and collapsing their parent releases hidden inner alerts"
- tests/signal-compact-review.test.mjs: "compact review: an open nested alert under a hidden or collapsed ancestor never pins Auto"
- tests/signal-compact-review.test.mjs: "compact review: future Arrive by and Leave around missing routes stay visible above folded alerts"
- tests/signal-compact-review.test.mjs: "compact review: a closed Hammersmith and City fallback is qualified before opening any alert"
- tests/signal-compact-review.test.mjs: "compact review: a cancellation summary cannot hide the currently closed onward fallback"
- tests/core/present.test.mjs: "statusLine: a closed fallback asks to check onward travel without claiming a future closure"
- tests/signal.test.mjs: "Signal keeps example and timetable provenance visible when train warnings take precedence"

- tests/signal-compact-plan.test.mjs: "compact Plan: explicitly choosing Plan keeps its primary answer visible while following continues"
- tests/signal-compact-plan.test.mjs: "compact Plan: live Tube choices remain outside folded recommendations and keep working while following"
- tests/presentation-ui.test.mjs: "Signal planning keeps the primary answer ahead of the accessible line-status strip"
