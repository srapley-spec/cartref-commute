# Developer journey simulator
Status: Partly done (release verification in progress) · Since: 30 Oct 2026 · Issues: #32, #34

## Story
As a developer I want to replay coherent location, Darwin and TfL inputs through the real application,
so that I can inspect inference and onward planning without travelling.

## Acceptance criteria
- Settings → Experimental has independent GPS Simulation and Transport Feed Simulation switches, both off by default and session-only. Reload exits simulation. Stop restores real GPS, clock, feeds and pre-simulation journey memory.
- Either route (Great Northern via King's Cross or Thameslink via Farringdon) works outbound and returning on an independently defined timetable. Scenario controls select normal, later/wrong train, uncertainty, delay, cancellation, platform change, missed connection, disruption, outage, awaiting GPS, permission denied, GPS loss or low accuracy.
- Start/restart begins at the selected UTC date/time, paused at the first checkpoint. Continue advances at1×,5× or20× and pauses at every checkpoint indefinitely. Pause stops immediately. Selection changes require a restart before continuing. Reset clears journey memory and caches.
- GPS fixes enter the normal position handler; train identities are inferred or manually chosen through normal application controls. Synthetic GPS never assigns a train lock or tube ride.
- GPS accuracy can be entered in metres, or vary with indoor and train contexts. Rough fixes must not assert arrival or invent boarding. Accurate recovery uses normal inference; GPS loss supplies no fabricated precise fixes.
- Synthetic feeds and GPS playback share a scoped virtual clock. Browser Date and device time remain unchanged. With GPS only, live feeds and application time use device time; speed accelerates coordinates only. With feeds only, real location observations are stamped into the virtual time domain.
- Simulation does not write journey context or settings to localStorage. Requests and asynchronous work from an older source epoch cannot update current caches. Leaving simulation clears virtual-time caches and throttle/retry timestamps.
- Approximate rail polylines follow the profile corridor; they are synthetic test geometry, not surveyed tracks. Provider formats pass through production adapters.

## Tests
- tests/simulator.test.mjs: "developer simulator defaults off and toggles from Settings"
- tests/simulator.test.mjs: "simulated fixes do not overwrite persisted journey context"
- tests/simulator.test.mjs: "playback starts at the selected end and supports multiple speeds"
- tests/simulator.test.mjs: "each route and direction starts paused at first checkpoint"
- tests/simulation-clock.test.mjs: "simulated clock freezes at waypoint and moves only when explicitly advanced"
- Additional application scenario assertions and their actual results: [coverage matrix](../simulator-scenario-coverage.md).
- Independent regressions and mutation results: [review](../simulator-review.md).
- Real Chromium control/playback verification: `python3 tests/browser-simulator.py` (Playwright and Chromium required).

## Architecture
`src/simulator/clock.js` supplies scoped time, `feeds.js` supplies transport providers, `controller.js`
orchestrates scenario playback and GPS, and `panel.html` supplies controls. The static build embeds
all modules. The shell injects providers and time; `src/core` remains pure and reusable.

## Release gates
The source-generated index, full tests, local committed-code CI, independent final review, branch
GitHub CI, merge and merged-commit CI must all pass. Coverage gaps remain blockers until the matrix
records executed assertions. This status is not a release approval.
