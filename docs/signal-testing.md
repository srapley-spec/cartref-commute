# Signal and Follow a route: verification and morning checks

Status: behind Experimental switches; release verification and final independent review pending. This record is
a test plan and handoff, not release approval.

## Starting point

The implementation branches from current `main` (`47c82c7`), rather than from the older Signal prototype.
GitHub's Tests run and a fresh local `npm run ci` passed for that baseline. The prototype remains a visual
reference; its example journeys, timers, inference and routing code are not production inputs.

Signal design and Follow a route are separate Settings → Experimental options. Both default off. Selecting
Signal checks Follow a route as a convenience; either can be configured independently. Panda and Signal use
the same feeds, engine and chosen-journey state. Turning Signal off restores Panda without discarding a followed
journey. Changing the design must not change the API request plan.

## Rules that changed since the design prototype

The implementation must preserve these current-main improvements, with feature-off tests unchanged and shared
behavior checked in both designs:

| Current behavior | Preservation check |
| --- | --- |
| Effort levels are always on | Walk, fast walk, run, car and unreachable flags remain visible; only eligible alternatives are offered |
| Station departure columns | Train / Expected / At destination retain equal prominence; scheduled service identity is never struck through |
| Status bands | Under 5 minutes late is green; 5–14 amber; 15+, cancellation and no estimate red; no “On time” without live data |
| Status and identity differ | Blue identifies a train/selection; status uses words, minutes and its band; Tube line names retain their line colours |
| Same train at multiple boarding stations | Every applicable station/time/platform choice remains, with unreachable choices qualified |
| Train/Tube inference and corrections | User picks, uncertainty, reported-position conflicts, “No, still here” and changing a train/Tube remain available |
| Aldgate platform planning | At Aldgate, journey steps and timing start from the platform rather than the office |
| Homeward Tube inference | Preserve current inference and picks; do not restore the superseded picks-only change |
| Measured interchange timings | Use current profile/Settings values for King's Cross and Aldgate East, with no copied prototype arithmetic |
| Direction and office arrival | Retain current office dwell/GPS behavior and the location-resume fix |
| All planning modes and destinations | Commute, Leisure, direction, pace, dates, Arrive by, Leave around and any-place entry points survive |
| Feed quality and errors | Cancellation/no-estimate rows, stale warnings, partial failures, timetable labels and last good data remain |
| Journey simulator | Keep readable/collapsible controls, pause/checkpoint behavior, separate clocks/providers and Stop restoration |

The Signal token file's old 2-minute amber boundary is superseded by the current 5-minute engine rule.

## Automated acceptance evidence

The release record must name the reviewed commit, independent review findings, fixes and rerun results. A high
number of tests is not a substitute for checking the paths below.

1. Run `npm run ci` on the committed implementation. This checks install, engine types, generated `index.html`,
   documentation links and all engine/page/golden tests. Review every intentional golden diff; Panda's feature-off
   content should remain unchanged.
2. Run the same semantic scenarios through both designs. Compare train/service identity, boarding station,
   times, flags, alternatives, selected train/Tube, direction and requests. Differences should be presentation or
   explicitly selected Follow a route behavior, not silently changed journey calculations.
3. Exercise followed-route state with re-ranking, updated live times, cancellation, no estimate, missing/stale
   data, departed services, reload, malformed persisted state and explicit replacement. A departed service does
   not disappear from tracking just because it has left the ordinary ranked list.
4. Pin planning and verify tracking/important journey alerts continue. Check override expiry immediately before
   and at 20 minutes, reaching/leaving a station, starting/stopping rail travel, Return to Auto, refresh, appearance
   change and a transient GPS failure. Keep direction, train/Tube selection and entered planning time intact.
5. Replay both rail routes, outbound and returning, through the existing simulator. Include delay, cancellation,
   platform change, uncertainty, missed connection, outage and low accuracy. Simulated following must not modify
   the real saved journey; restart/reset clears simulated context and Stop restores real operation/state.
6. Run real-browser layout checks in light, dark and System appearance at 320 px and normal phone width, landscape
   and increased text size. Check no horizontal overflow or hidden controls, 44 px touch targets, status contrast,
   native date/time inputs and simulator overlays. Use iPhone Safari and VoiceOver for hardware-specific acceptance.
7. Have an independent reviewer check architecture and test quality as well as behavior. Deliberately break
   matching, cancellation, stable arrival, alternative threshold, pin expiry and feature-off gating; establish that
   the tests fail for those changes. Investigate surviving mutations rather than declaring them harmless without
   evidence. Re-review fixes and repeat the affected checks.

Saved-state and build integration changes require GitHub green on the branch before merging (`CLAUDE.md`).
Check latest main is green, bring it into the implementation branch, reread changed stories and rerun the full
checks. After merge, verify Tests and Pages deployment for the exact merged commit before saying Signal is live.

## Implemented test coverage and browser evidence

The implementation now includes focused suites in addition to the existing engine, application, golden and
simulator tests:

| Suite | Main evidence |
| --- | --- |
| `tests/core/follow.test.mjs` | Immutable chosen itinerary, service matching/date/boarding identity, explained ETA changes, cancellation/recovery, 5-minute alternatives, stale data and persistence validation |
| `tests/core/viewControl.test.mjs` | Pure Plan/Live resolution, exact 20-minute expiry, situation change, interaction deferral, no-active state and malformed overrides |
| `tests/follow.test.mjs` | Real page controls, immediate persistence, live updates, correction, design/reload preservation and simulator isolation |
| `tests/signal.test.mjs` | Feature-off compatibility, semantic/request parity, status-summary precedence, manual views, expiry, GPS loss, focus/disclosure and appearance |
| `tests/presentation-ui.test.mjs` | Actual live-template block boundaries consume engine order; reordering retains content, listeners, disclosures and focus |
| `tests/follow-journey-review.test.mjs` | Caught Tube→chosen rail continuity, final-walk context, uncertain missed arrival, arrival-based status, unavailable line data, Leisure destination and fresh Service Details with stale boards |
| `tests/independent-signal-review.test.mjs` | Independent probes for immediate save, stale evidence, route stability, uncertain boarding, active chosen journey, source isolation and pinned cancellation alert |

`tests/browser-signal.py` has passed on an earlier integration snapshot: Chromium rendered 12 System/appearance/
width combinations (two system themes × System/Light/Dark × two phone widths), plus a 320 px enlarged-text stress
case. It exercised saved appearance/route persistence, engine parity, manual views, simulator entry/exit and
returning to Panda, with no page errors. The final committed implementation must rerun this script after the
latest review fixes; this earlier pass is not final release evidence. Light/dark screenshots are produced by the
script for inspection. Chromium coverage does not replace Safari/iPhone/VoiceOver acceptance.

Canonical block rendering now closes the old Signal live-order coverage gap: tests mutate the engine order and
check that the actual rendered DOM follows it. Panda retains its existing feature-off content. Full CI results,
reviewed commit and mutation review evidence must be recorded after final verification; independent reviewers'
separate evidence documents are authoritative for their findings.

## Morning test sequence

After the implementation is released and the verification record says it passed:

1. Open the usual Cartref Commute site and refresh. In Settings → Experimental enable **Signal design**; check
   **Follow a route** is enabled, then Save. Keep the existing feed credentials and timing settings.
2. Check Commute, Leisure, direction and pace controls; open Settings again. Confirm nothing required has become
   inaccessible. Test System, Light and Dark appearance, including changing the device appearance in System mode.
3. In Leave now, choose a train with **Follow**. Check its arrival, service, platform and next step. Refresh and
   reopen the app: the same chosen journey should remain, even if the fastest alternative has changed.
4. Open Planner during the journey. Confirm the followed journey still updates and an important cancellation or
   delay stays visible. Return to Auto should show the latest situation without changing the chosen journey.
5. Switch off Signal while leaving Follow a route on. Confirm Panda retains the followed journey. Switch Signal
   back on; the selected train, planning time, direction and existing settings should be unchanged.
6. Tap **Stop following**. Normal automatic planning/inference should continue, without requiring a followed route.
7. For a desk test, enable GPS Simulation and Transport Feed Simulation. Choose a route and direction, start,
   and Continue through the checkpoints. Repeat with a delay/cancellation or missed-connection scenario. Follow
   an offered journey and check that changes are explained and another route requires an explicit Follow action.
8. Tap the simulator's **Stop** control. Confirm normal GPS/feeds and the pre-simulation saved journey return.
   Reload must also leave simulation. Avoid interpreting synthetic platform or arrival information as live data.

## Known verification limits

- Existing jsdom page tests execute the real built application with mocked network and location. They prove
  integration with deterministic response shapes, not current provider reliability or Safari rendering.
- Planned Tube legs and inferred Tube rides do not establish that a verified vehicle can be followed underground.
  That remains subject to recorded-feed evidence; display estimates and unknowns honestly.
- Closed-Safari alerts and background location require native capabilities; a web page can update only while open.
- Real iPhone, Dynamic Type/large text, VoiceOver and live journeys must not be claimed as passed without being run.
- Review summaries and automated pass results will be added by the integrator after the implementation is tested.
