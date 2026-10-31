# Developer journey simulator
Status: Implemented and independently reviewed (Journey Mode UX redesign; [release evidence in PR #37](https://github.com/srapley-spec/cartref-commute/pull/37)) · Since: 30 Oct 2026 · Issues: #32, #34

## Story
As a developer I want to replay coherent location, Darwin and TfL inputs through the real application,
so that I can inspect inference and onward planning without travelling.

## Acceptance criteria
- Settings → Experimental has independent GPS Simulation and Transport Feed Simulation switches, both off by default and session-only. Reload exits simulation. Stop restores real GPS, clock, feeds and pre-simulation journey memory.
- Either route (Great Northern via King's Cross or Thameslink via Farringdon) works outbound and returning on an independently defined timetable. Scenario controls select normal, later/wrong train, uncertainty, delay, cancellation, platform change, missed connection, disruption, outage, awaiting GPS, permission denied, GPS loss or low accuracy.
- Start/restart begins at the selected UTC date/time, paused at the first checkpoint. Continue advances at1×,5× or20× and pauses at every checkpoint indefinitely. Pause stops immediately. Selection changes require a restart before continuing. If the selected time is empty when enabling feeds, restore the displayed default with a visible warning before starting the session. Reset clears journey memory and caches.
- GPS fixes enter the normal position handler; train identities are inferred or manually chosen through normal application controls. Synthetic GPS never assigns a train lock or tube ride.
- GPS accuracy can be entered in metres, or vary with indoor and train contexts. Rough fixes must not assert arrival or invent boarding. Accurate recovery uses normal inference; GPS loss supplies no fabricated precise fixes.
- Stationary waits emit zero speed before departure. Once boarded, rail movement continues through the final approach until the station stop, even when the next checkpoint is alighting. The normal engine derives the stop from these fixes; its stop instant, parsed Darwin arrival and virtual checkpoint clock must agree.
- Synthetic feeds and GPS playback share a scoped virtual clock. Browser Date and device time remain unchanged. With GPS only, live feeds and application time use device time; speed accelerates coordinates only. With feeds only, real location observations are stamped into the virtual time domain.
- Simulation does not write journey context or settings to localStorage. Requests and asynchronous work from an older source epoch cannot update current caches. Leaving simulation clears virtual-time caches and throttle/retry timestamps.
- An existing real followed route and planning-tab lifetime are excluded from simulation and restored on Stop. The genuine app's Follow and Stop following controls still work against synthetic services in memory; Restart clears those simulated choices. Follow-option and live vehicle-ETA caches are invalidated with the other source caches. Follow observations reuse normal rendering rather than invoking inference again.
- Approximate rail polylines follow the profile corridor; they are synthetic test geometry, not surveyed tracks. Provider formats pass through production adapters.

- A compact bottom bar is visible whenever either simulator switch is enabled, including before Start. Start/Continue/Pause and Stop remain reachable with the controller hidden. Show/Hide controls only collapses the panel: it preserves the checkpoint, clock, settings and playback state. The panel and bar share layout space above the phone safe area, and all controls use explicit theme colours with readable contrast in light and dark modes.

## Journey Mode and Advanced diagnostics
- Open Simulator from the real application header without changing sources, clock or saved journey state. Journey Mode is the default; choose direction, rail route and the grouped scenario. Normal journey starts in at most three deliberate actions after opening (direction, route, Start).
- Start automatically enables synthetic GPS and both transport feeds through the existing session transaction, starts the shared clock and pauses at the first checkpoint. It collapses setup immediately and brings the real application's main card into view. British local time is shown in the guided UI; the legacy UTC clock input remains available in Advanced.
- Remember only allowlisted direction, route and scenario preferences in a separate versioned key. Never persist active flags, clocks, input coordinates or reports. Reload returns to real operation.
- Guided choices remain drafts while a journey is active. They do not change the providers or route until Start/Restart. Advanced changes that require a restart keep the active scenario coherent until then.
- The compact overlay shows simulated location/time, current/next checkpoint, progress, playback, sequential Next, Stop, timeline and verification. Reserve its measured height so actual app content can scroll clear. Every touch target is44px and text contrast is at least4.5:1 in light/dark modes.
- Opening or collapsing modes, timeline inspection and verification details never changes simulation state. Timeline inspection cannot teleport. Next reconstructs each adjacent segment through normal GPS fixes, shared time and ordinary feed refreshes.
- Every old control and automation ID remains available in Advanced diagnostics: independent source switches, manual fixes/accuracy/GPS loss, route/scenario/date/speed, playback, reset, source diagnostics and the existing app's train/tube choices.

## Expected versus actual
- Read outputs already computed by normal application rendering. Verification never calls mutating inference functions just to observe them, assigns a train/tube or replaces the main app interface.
- Evaluate each meaningful checkpoint after normal refresh settles. Explicit assertions produce PASS/FAIL; missing evidence, pending work, unsupported/manual inputs or a legitimate unresolved passenger decision produce INCONCLUSIVE. Reaching a location is not itself a pass.
- Session/index/playback generations reject stale asynchronous verification after restart, Stop, source changes or continued playback. Device clock advancement in GPS-only mode must not leave verification permanently pending.
- Optional Signal and Panda share the same simulator. Explicit Plan/Live pins are reported as INCONCLUSIVE for automatic-view expectations; Return to Auto restores those assertions. A displayed followed service has an independent phase assertion at Stevenage/approach/through-station checkpoints, even when the main card uses the richer on-train view. The separate real Follow card is retained and sanitized alongside the main card.
- Reading/editing deferral is INCONCLUSIVE only when the real application reports a pending transition and actual app interaction is present. A pending flag alone cannot conceal a wrong automatic view. Simulator inputs are excluded from the real app's interaction deferral, so inspecting Advanced controls cannot hold back normal journey presentation.
- Deliberately poor GPS from Advanced uses coarse-location expectations even if Normal journey is selected. It remains INCONCLUSIVE for precision-dependent decisions, still fails a confident station claim from a coarse fix, and returns to ordinary assertions after precise recovery.
- Keep earlier failures and later revisions. A small failure indicator opens expected/actual explanations and the actual displayed main-card text without hiding that card.
- Preserve genuine application failures; never weaken an assertion or change GPS/provider fixtures merely to obtain a passing simulator run. Deliberate production inference mutations must result in visible runtime failures.

## Reports and privacy
- Show reached checkpoint counts separately from passed, failed and inconclusive assertions and significant inference events. Results remain inspectable/copyable/exportable after Stop until a new run or reload.
- Export a versioned JSON allowlist: scenario configuration, relevant virtual timestamps, assertions, sanitized display text, bounded revisions and selected diagnostic facts. Do not export raw settings/state, API URLs/credentials, precise coordinates, postcodes or home/work addresses.
- Refresh the union of private values throughout the session and before exporting; credentials changed during a session must remain redacted after Stop restores the original settings.
- Current main's `followRoute`, `viewOverride`, `planInputs` and legacy migration metadata are session-isolated together. Source changes clear the Follow option Map, transport prediction cache and presentation state; guarded pending predictions cannot populate a newer session.
- The train-speed watch is reset across simulation boundaries. After transient cache clearing, Stop and disabling both sources rehydrate only recent original real station visits using device-time validation (20 minutes for the hub visit,25 for the last hub); original stopped time survives resumed native fixes with no speed. Synthetic visits and speed readings never rehydrate real state.
- Session isolation includes the actual planning date/time, origin/destination input values and runtime alternative origin, not just saved JSON. Both exit paths restore these before normal refreshing and replan the selected By/At question when native GPS resumes. Original unsaved private drafts are included in the redaction union and never exported raw.
- Report format identifiers and validated structural enums remain intact while untrusted messages and service identifiers are sanitized. Unavailable clipboard access offers a selectable text fallback; download URLs are revoked.

## Tests
- tests/simulator-controls.test.mjs: "Stop exits a ready GPS-only simulator before the journey has started"
- tests/simulator-controls.test.mjs: "simulator dock starts hidden playback and preserves paused state while showing and hiding controls"
- tests/simulator-controls.test.mjs: "GPS-only opt-in exposes the dock before Start and disabling hides both controls"
- tests/simulator.test.mjs: "developer simulator defaults off and toggles from Settings"
- tests/simulator.test.mjs: "simulated fixes do not overwrite persisted journey context"
- tests/simulator.test.mjs: "playback starts at the selected end and supports multiple speeds"
- tests/simulator.test.mjs: "each route and direction starts paused at first checkpoint"
- tests/simulation-clock.test.mjs: "simulated clock freezes at waypoint and moves only when explicitly advanced"
- Additional application scenario assertions and their actual results: [coverage matrix](../simulator-scenario-coverage.md).
- Original simulator regressions and mutation results: [review](../simulator-review.md). Guided redesign staged mobile/technical review and additional mutations: [UX review](../simulator-ux-review.md).
- Real Chromium control/playback verification: `python3 tests/browser-simulator.py` (Playwright and Chromium required).

## Architecture
`src/simulator/scenarios.js` contains route definitions, `gps.js` emits browser-shaped observations and interpolates movement, `clock.js` supplies scoped time, `feeds.js` supplies transport providers, `controller.js`
orchestrates scenario playback and GPS, and `panel.html` supplies controls. `catalog.js` describes the scenario groups; `journey-ui.js` presents the guided and Advanced views; `session.js` reads application outputs; `verification.js` evaluates assertions; `report.js` stores sanitized results. The static build embeds
all modules. The shell injects providers and time; `src/core` remains pure and reusable.

## Release gates
The source-generated index, full tests, local committed-code CI, independent final review, branch
GitHub CI, merge and merged-commit CI must all pass. Coverage gaps remain blockers until the matrix
records executed assertions. Exact committed CI, merge and deployment evidence is recorded in [PR #37](https://github.com/srapley-spec/cartref-commute/pull/37).

Test lifecycle cleanup waits for native GPS and the resulting refresh to settle before closing a simulated browser. This prevents pending asynchronous callbacks from running after document teardown; CI correctly rejected the earlier incomplete cleanup.

Phone UI regression: the Chromium check covers320×568,393×852 and852×393 layouts under system light/dark plus manual light/dark overrides in both Panda and Signal (36 combinations). Every button/input/select must have4.5:1 text contrast and a44px target, with no panel overflow or overlap with the playback bar. Hiding the controller is tested independently of stopping the simulation.

Redesign regression suites: `tests/simulator-journey-ux.test.mjs`, `tests/simulator-verification.test.mjs`, `tests/simulator-report.test.mjs`, and independent `tests/simulator-ux-review.test.mjs`. The complete scenario matrix and staged review record carry executed results.
Signal/current-main integration adds independent `tests/simulator-signal-review.test.mjs`; the eight complete normal-journey cases verify all route/direction combinations under both real designs.
Train-stop/current-main integration adds independent `tests/simulator-stop-review.test.mjs`: four route/direction cases check provider/GPS/clock agreement, predeparture waiting, freeze/reset and the return stop's station; a fifth checks restoration through both exit paths. Broken approach speed must cause a visible runtime stop-clock failure.
