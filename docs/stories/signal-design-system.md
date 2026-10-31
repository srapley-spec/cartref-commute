# Signal design system and automatic journey presentation
Status: Behind toggle (independent review approved; release gates recorded in docs/signal-testing.md) · Since: 29 Oct 2026

## Story
As a commuter, I want the appropriate planning or live journey view to appear automatically, with a manual override, so I can act quickly without losing control or information.

## Decision and evidence
Sam selected Signal after reviewing two iPhone-first mockups, requested dynamic light/dark switching, and explicitly required automatic Planner/Live switching with manual override. The source architecture remains authoritative: [decisions and proposals](../architecture.md#signal-presentation-architecture-29-oct-2026). See [specification](../design-system.md).

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
Production implementation is behind the switch; release verification is in progress. [Signal testing](../signal-testing.md) records the required evidence
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
- tests/signal.test.mjs: "Signal uses identical journey content and requests to Panda when following is off"
- tests/signal.test.mjs: "Signal status summary follows actual engine warning precedence and handles loading"
- tests/signal.test.mjs: "manual Plan retains tracking, selection and deadline; Return to Auto uses latest situation"
- tests/signal.test.mjs: "planning override expires exactly at twenty minutes and on a reliable situation change"
- tests/signal.test.mjs: "GPS loss does not expire a planning pin or clear a confirmed train"
- tests/signal.test.mjs: "expanded journey steps defer navigation and keep disclosure and focus through refresh"
- tests/signal.test.mjs: "appearance and design settings persist independently of journey state"
- tests/presentation-ui.test.mjs: "Signal dispatch enforces the canonical order on the actual live hero"
