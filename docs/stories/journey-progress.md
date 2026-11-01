# Visual progress for the journey and the current leg
Status: Implemented in Signal, always active since 1 Nov; release evidence recorded separately · Since: 31 Oct 2026

## Story
As a commuter on a train or Tube, I want to see my overall journey, the leg I am on, its calling points and how
it is running against the plan, so I can understand the next action without reading several paragraphs.

## Where it came from
31 Oct, Sam reviewed the compact Signal screens during the simulator journey. The on-train card gave the
arrival and a textual last report, but lacked the journey diagram shown in the repository's design proposals.
He requested overall progress with each leg, a second view of the current leg, calling points, and ahead/behind
information based on live data. The same presentation is required on the Tube and must work without tapping Follow.

The visual references are [Womble A's on-train diagram](../design/proposals/womble/a3-on-train.html) and its
[data-honesty notes](../design/proposals/womble/README.md#data-honesty-and-risks). Those are static design examples,
not production position or routing logic. Their old amber/green identity accents are superseded by the current
status-colour rule; Signal uses its own tokens and blue identity/accent.

## Acceptance criteria
- On a rail or Tube live view, show an overall journey strip identifying its legs, completed/current/upcoming
  state, and the destination. Under it show the current leg and its known calling points or endpoints.
- Use the existing journey/connection/Follow result and timed steps. Visual progress must not select another
  route, alter the chosen train or Tube, recompute a second itinerary, or retime completed followed-route history.
- This works for both inferred and explicitly followed journeys, in both directions. A visualisation must not
  require Follow to be enabled before an already-inferred live journey can be understood.
- A fresh Service Details report can mark the last actually reported calling point. Keep reported, expected,
  timetable and modelled times distinguishable. A future expected call is not an actual report.
- A marker between reports is an estimate, labelled as such. Do not present an interpolated exact train position,
  invent non-stop passing points, or imply that a calling-point feed reports continuous movement.
- Known train delay/ahead information comes from live reported/expected times against the corresponding
  timetable and uses the shared status policy. Missing or stale evidence must not produce a confident
  live ahead/behind or on-time claim. Preserve the existing unknown/likely identity and correction controls.
- Tube visualisation uses the existing chosen/inferred connection and destination. A fresh prediction matched
  to an already-known vehicle and target may qualify its arrival as live; it does not establish an exact live
  position between stops. Without that evidence, keep timing/position explicitly modelled or estimated.
- A Tube prediction compared with the planned/modelled arrival is labelled ahead/behind **plan**, with neutral
  styling. It is not evidence of a late train service or a missed connection; the ordinary connection engine
  still decides reachability and risk.
- Tube calling-point names/order come from configured profile topology, not from a claim that the vehicle has
  been reported at each station. If the current profile provides only the endpoints, say so. Do not invent
  intermediate predictions or promote a static route sequence into live stop evidence.
- With no usable timing, missing identity or unavailable observations, show the available route context and an
  explicit unknown state rather than a falsely precise percentage. Stale data remains visible as stale.
- The diagram remains supplementary to the readable arrival, train/Tube identity, status and next action.
  Use semantic text, accessible progress labels and source explanations, not colour or a moving marker alone.
- Keep the compact Signal hierarchy. Diagrams and call labels wrap without clipping at phone widths and
  enlarged text. Progress/accent identity is blue or the named Tube line's identity colour; green/amber/red
  communicate service status under the shared rules.
- Signal progress is always available in applicable live views; Follow and Along the line remain independent.
  Independent engine/integration review is required because the progress model is more than a CSS change.

## Tests
Pure-model, adapter and independent counterexample tests are linked below. Real-page and browser checks
exercise the same generated application; the final committed-head review/release record supplies executed results.
The phone geometry and source-state cases are in
[browser-signal-journey-clarity.py](../../tests/browser-signal-journey-clarity.py).

The pure `src/core/journeyProgress.ts` model accepts explicit time, timed legs, the current leg, calling points,
source identity/freshness and disruption policy. `journeyProgress` qualifies observations and display state;
`progressLegsFromSteps` consumes existing route segments/steps, while `retimeProgressLeg` overlays current timing
without rewriting saved history. The Signal renderer in `src/journey-progress.js` adapts existing state and
draws these results. It does not fetch, infer a service, choose another connection or perform timing arithmetic.

The Service Details adapter retains ordered calling points as separate `scheduledAt`, `expectedAt` and
`actualAt` facts, including signed early evidence and coherent midnight crossings. The existing `last`, `next`
and `at(code)` interfaces stay compatible; a clamped legacy lateness value is not the progress model's baseline.
Expected or missing values must not be converted into an actual report or an invented on-time fact.
An explicit `noEstimate` endpoint remains unknown even if a residual prediction exists. A fresh timing report
may promote a newly observed delay, but cannot clear a board's explicit cancellation/no-estimate incident;
the ordinary controller/provider recovery path owns that state change.

`Profile.tubeCorridors` in `src/core/profiles/sam.ts` supplies static corridor station names/IDs. It introduces
no runtime topology request. `places.officeStops` provides target stop IDs and line-specific arrival directions:
the recorded Metropolitan terminus platform at Aldgate is northbound, not an assumed eastbound platform.
Tube headline and progress share the vehicle/line/target/platform-direction/freshness checks. The recorded
`tests/fixtures/tfl-2026-10-30T2243Z/ALD.json` case verifies that terminus direction; it is not a live-validation
claim for every configured intermediate station.

- tests/core/serviceProgress.test.mjs: "Service Details preserves ordered scheduled expected and reported times with signed early evidence"
- tests/core/serviceProgress.test.mjs: "Service Details leaves delayed cancelled and absent estimates unknown instead of manufacturing on-time facts"
- tests/core/serviceProgress.test.mjs: "Service Details keeps ordered midnight calls on the same coherent journey"
- tests/core/journeyProgress.test.mjs: "journey progress shows the complete itinerary and only the last reported calling point as confirmed progress"
- tests/core/journeyProgress.test.mjs: "journey progress uses signed live baselines and the shared configurable rail delay colours"
- tests/core/journeyProgress.test.mjs: "journey progress freezes stale reports and never promotes a future cached actual into a report"
- tests/core/journeyProgress.test.mjs: "journey progress labels Tube prediction positions estimated and does not confuse plan variance with connection risk"
- tests/core/journeyProgress.test.mjs: "journey progress retains history but makes cancellation and unknown arrival explicit without future promises"
- tests/core/journeyProgress.test.mjs: "progress itinerary reuses canonical fast-walk steps and does not overlap a departed rail leg"
- tests/core/journeyProgress.test.mjs: "progress itinerary preserves saved onward leg identities when current rail arrival becomes unknown"
- tests/core/journeyProgress.test.mjs: "remembered progress context expires at its known journey window and never retimes supplied legs"
- tests/core/journeyProgress-review.test.mjs: "independent progress: future actual data in a cached observation never turns into a report as time passes"
- tests/core/journeyProgress-review.test.mjs: "independent progress: stale calling-point progress is frozen and cannot produce fresh ahead or behind claims"
- tests/core/journeyProgress-review.test.mjs: "independent progress: an explicit service or vehicle match is required before a prediction becomes live evidence"
- tests/core/journeyProgress-review.test.mjs: "independent progress: cancellation and no-estimate retain history without promising future expected calls"
- tests/core/journeyProgress-review.test.mjs: "independent progress: early reports use the original timetable and shared configured delay colours"
- tests/core/journeyProgress-review.test.mjs: "independent progress: a canonically fast-walking itinerary cannot overlap the train or rewrite the chosen option"
- tests/core/journeyProgress-review.test.mjs: "independent progress: model and time-overlay helpers accept frozen observations without mutating saved state"
- tests/core/journeyProgress-review.test.mjs: "independent progress: the recorded Metropolitan terminus platform direction controls destination predictions"
- tests/journey-progress.test.mjs: "Signal progress: an inferred train without Follow shows complete stages, factual calling points and no additional requests"
- tests/journey-progress.test.mjs: "Signal progress: live expected arrival changes show behind and ahead against the original timetable"
- tests/journey-progress.test.mjs: "Signal progress: stale reports freeze the confirmed bar and keep report details accessible"
- tests/journey-progress.test.mjs: "Signal progress: an inferred Tube without Follow shows route stops and honest modelled progress"
- tests/journey-progress.test.mjs: "Signal progress: a location projection without a live arrival stays modelled"
- tests/journey-progress.test.mjs: "Signal progress: fresh endpoint unknown delay is explicit and residual predictions cannot clear board incidents"
- tests/journey-progress.test.mjs: "Signal progress: an exact fresh Tube destination prediction estimates position without manufacturing stop reports"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: Tube headline and progress share vehicle, target-platform and freshness guards"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: an otherwise fresh arrival report preserves a current cancellation until the board explicitly recovers"

## Shared model for Along the line
Along the line consumes the same qualified progress model for commentary station times and significant
current-service disruption. This prevents a newer delayed Service Details report being hidden behind an older
on-time board, while retaining identity, freshness, cancellation and no-estimate guards. Signal draws the diagram
independently of whether Along the line or Follow is enabled.

## Limits
- Calling-point reports are not continuous location reports. Passing points still require the separate data
  capability described in [which train](which-train.md); this visualisation does not deliver it.
- A simulated journey tests the same production model and shell with controlled evidence. It is not proof of
  provider-wide live coverage or an actual physical commute.
- During the 31 Oct refinement, direct route-sequence/PDF requests returned HTTP 403 and no runtime feed keys
  were available. Configured Tube topology must not be described as newly fetched live evidence. Recorded data
  supports the tested identity/direction cases; intermediate station progress remains an estimate.
- Real iPhone Safari and VoiceOver acceptance remain separate from Chromium layout and keyboard checks.
