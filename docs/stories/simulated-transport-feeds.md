# Synthetic Darwin and TfL feeds
Status: Partly done (prototype on feature branch, not yet tested or rebuilt) · Since: 30 Oct 2026 · Issues: #34

## Story
As a developer I need coordinated synthetic train boards, train progress and TfL arrivals, with plausible alternatives, so that the app determines rather than receives the selected journey.

## Implementation
- Separate feature toggle in Settings → Experimental: **Simulate Darwin and TfL feeds**, off by default and independent of GPS simulator.
- `src/simulator/feeds.js` supplies synthetic Darwin board and service details, TfL national rail journeys, tube arrivals and line status. `src/page.html` intercepts requests before external fetch when enabled; `tools/build.mjs` includes the module in the static build.
- Services have distinct synthetic service IDs and competing departures. No production application inference functions were modified.
- Toggle change invalidates train and tube caches.

## Tests
- tests/simulated-feeds.test.mjs: "separate feed switch defaults off and synthetic transport requests avoid live fetch"

## Remaining blockers
- Not yet run: local CI and GitHub Actions, source-generated `index.html` rebuild, independent review.
- **Virtual clock integration is not implemented.** Synthetic fixture services currently use the real calendar day at preset morning clock times, so they will not necessarily line up with an accelerated GPS scenario or actual time of day. No claim of synchronized end-to-end journey testing is justified yet.
- Fixture shapes and URL matching need expanded adapter contract tests, including delay and cancellation and simulated train progress.
- Explicit validation of both route forks, both directions, train identity, competing services and zero network requests is outstanding.
- In-flight live fetch requests initiated before a mode switch can still resolve after the mode switch; response generation/caching must be isolated.
- Never merge until this work passes review and the generator rebuilds `index.html`.

## Virtual-clock implementation and audit
- `src/simulator/clock.js` now supplies scoped simulated time; `src/page.html` uses its Date wrapper, `src/simulator/controller.js` advances it at playback checkpoints, and `src/simulator/feeds.js` consumes the same timestamp.
- `tests/simulation-clock.test.mjs` tests clock advance/freeze/reset (not executed).
- Full scenario coverage audit: [docs/simulator-scenario-coverage.md](../simulator-scenario-coverage.md). Significant cases remain gaps; this is not yet an end-to-end verified harness.

## Coordinated provider fixtures (release work in progress)
The provider generator now anchors every service to the selected scenario epoch, including return calling points and journeys spanning midnight. Darwin board payloads support the RDM, proxy and Huxley URL shapes, and Service Details reports actual calling points only after their virtual passage time. GN and Thameslink competitors retain distinct identities. Delay, cancellation and platform-change fixtures preserve alternatives. Synthetic provider outages recover at scenario minute 40; unsupported URLs return explicit errors without live fallback.

TfL predictions use fixed expected times for stable vehicle identifiers across King's Cross, Farringdon, Barbican and Aldgate. Countdown decreases with virtual time and departed services disappear; return vehicles travel west. Missed-connection and disruption scenarios move these services coherently. This proves provider contracts, not complete application journey inference; the release still requires browser integration coverage and independent review.

## Additional provider contract tests
- tests/simulator-providers.test.mjs: parameterised outbound/return adapter contracts for both routes.

- tests/simulator-providers.test.mjs: "synthetic delay cancellation and platform changes preserve competing services"
- tests/simulator-providers.test.mjs: "TfL predictions progress by stable vehicle across stations and freeze while paused"
- tests/simulator-providers.test.mjs: "return Underground services travel west with coherent Farringdon and Kings Cross timing"
- tests/simulator-providers.test.mjs: "scenario epoch survives midnight without moving rail or TfL fixture identities"
- tests/simulator-providers.test.mjs: "provider URL variants and unknown URLs remain entirely synthetic and outages recover"
- tests/simulator-providers.test.mjs: "TfL timetable returns only trains for requested endpoints and passes production adapter"

Executed directly with `TZ=Europe/London node tests/simulator-providers.test.mjs`: 8 passed, 0 failed. Full-suite and release results remain pending.
- tests/simulator-providers.test.mjs: "uncertain scenario retains competing services with indistinguishable nearby reports"

The uncertainty fixture places the competing service two minutes behind the primary, with equally close calling-point evidence. Updated provider-only result: 9 passed, 0 failed.

The delay scenario represents a corridor signalling restriction: every train travelling in the scenario direction is eight minutes late, with a reason, and competitors remain available. This keeps GPS and each service report coherent without collapsing the delayed GN into an on-time Thameslink at Stevenage.

Local Journey Planner fixtures support walking to the office and named alternative starts (Science Museum / SW7 2DD), London coordinates and the commute's Underground station identifiers. Short journeys use distance-scaled walking; longer journeys use an illustrative Circle journey with walking legs. Unknown places fail explicitly. These synthetic local travel durations are estimates rather than recorded TfL itineraries.

Missed connections keep the original Underground timetable intact: delaying passenger boarding by six minutes exposes the next vehicle rather than shifting every departure with the passenger. Return Circle services terminate at Edgware Road; Metropolitan services can terminate at Uxbridge.

- tests/simulator-providers.test.mjs: "local Journey Planner supports office walking and alternative London starts without rail legs"
- tests/simulator-providers.test.mjs: "missed connection preserves departure times and changes the vehicle still available to board"
- tests/simulator-providers.test.mjs: "return Circle destinations are valid for the line while Metropolitan services continue to Uxbridge"

Updated provider contract result: 12 passed, 0 failed; `npm run check-docs` passes after removing literal references to parameterised test-name templates.
