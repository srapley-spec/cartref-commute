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
