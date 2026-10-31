# Signal and Follow a route: verification and morning checks

Status: behind Experimental switches; independent review approved. The exact committed-code release checks are
required before publication and are visible on [PR #36](https://github.com/srapley-spec/cartref-commute/pull/36).

## Starting point

The implementation branches from current `main` (`47c82c7`), rather than from the older Signal prototype.
Premerge reconciliation also found concurrent `origin/follow-a-route` (`d330e95`); current journey improvements
were selectively ported while retaining current-main status thresholds and simulator handling.
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
| `tests/core/followTube.test.mjs` | Six recorded-data probes for exact vehicle441 arrival, stop/line/direction identity, three-minute cache/provider expiry and malformed/missing fallback |
| `tests/follow-transport.test.mjs` | Three page integration probes for conditional target-stop requests, stale/wrong-vehicle fallback, shared concurrent work and source-switch rejection |
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

## Latest-code reconciliation and Tube evidence

Concurrent follow-route improvements are preserved: original arrival stays visible after change, recovered
incidents supersede obsolete cancellation/no-estimate/missed notices, “I’m on it” provides explicit boarding
correction, and known same-train station calls can supply progress without changing chosen boarding. A person
may explicitly follow a run/car option as Behind, but automatic alternatives remain walking/fast only. Ordinary
better-option prompts stay quiet during a Tube approach unless recovery is necessary. ETA changes below one
minute keep the previous baseline instead of generating zero-minute announcements.

Five recorded TfL snapshots at `tests/fixtures/tfl-2026-10-30T2243Z/` verify a narrowly scoped live Tube case:
known westbound Met vehicle 441 reaches Farringdon at 22:49:42Z and King's Cross St Pancras at 22:52:41Z. The six
pure matching tests and three transport integration tests passed before final release verification. Matching
requires the selected vehicle, line, target stop and direction; both provider observation and fetch cache must
be younger than three minutes. Only an enabled followed homeward journey with an already-known Tube vehicle,
before its rail leg, makes one additional existing target-stop request per refresh. Concurrent requests share
work; source/route/vehicle/stop changes invalidate the result. No fresh matching prediction means modelled
route-duration fallback, not a live arrival claim. This evidence does not solve missing Aldgate Met departures
or prove that every live Tube journey exposes a usable vehicle identity.

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
- Recorded predictions verify only the already-known vehicle/target-stop case. Planned Tube legs and inferred
  rides alone do not establish live vehicle identity, provider-wide reliability, or missing Met departures at
  Aldgate; estimates and unknowns stay explicit.
- Closed-Safari alerts and background location require native capabilities; a web page can update only while open.
- Real iPhone, Dynamic Type/large text, VoiceOver and live journeys must not be claimed as passed without being run.
- Review summaries and automated pass results will be added by the integrator after the implementation is tested.

## Reconciliation with the released Follow build

While Signal was being reviewed, `main` advanced to `be1e58e` and released Follow a route. Integration preserves
its existing `settings.follow` switch and saved `follow` selection. A pure importer waits for a real matching
itinerary, retains the original record, arrival, chosen boarding point, acknowledgements and declined options,
and never substitutes another day's reused service ID. Pending restoration is explicit. An explicit new opt-out
wins over the legacy switch; Stop clears both active representations. Legacy planning pins retain their original
age and expire on a reliably changed situation without losing the stored planning question/time.

The seven released engine scenarios are retained in `tests/core/follow-main-regression.test.mjs`; the nine
released page scenarios are retained in `tests/follow-main-regression.test.mjs`, translated to the shared engine
and new controls rather than obsolete HTML wording. Their deliberate corrections retain the canonical 5/15-minute
train status bands, require real arrival evidence, and offer a boarding-point change explicitly. Migration has
separate pure-engine and whole-page regressions. The chosen route keeps the existing Tube-pick controls and an
inert Following marker, so redrawing or tapping the selected row cannot reset the original arrival/reasons.


## Final automated review and release gates

Independent reviews approved the merged implementation and final context/TfL fixes. The reviewer caught all
80 deliberate breakages after closing 11 meaningful coverage gaps. See [signed review](signal-review.md) and
[machine-readable evidence](signal-review-mutations.json). The full merged baseline passed 572 tests; final
coverage-only additions and the two narrowly reviewed guards are included in the exact-commit CI gate.

The final gate is `npm run ci -- --keep` on the committed code, followed by green GitHub Tests on the branch,
confirmation that current main is green, and verification of Tests plus Pages deployment for the exact merge
commit. Chromium Signal and simulator checks cover phone widths, appearance, enlarged text, contrast, keyboard,
persistence, provider isolation and all four route/direction combinations. The legacy release's seven engine and
nine page scenario groups remain covered. No Panda golden recordings were changed.

An initial long execution session ended before reporting a CI result; it was not counted as a pass. A durable
run with an explicit retained log and exit result completed the merged baseline (572/572, exit 0). The final
committed-code gate uses the same durable execution method. There was no memory/disk failure or waived test failure.

Real iPhone Safari, VoiceOver, closed-Safari/background behavior and provider-wide live reliability remain outside
these automated checks. The morning sequence above is the device check; both experimental options remain off by
default for new users. Existing Follow users keep their switch and saved selection through migration.

## Compact Signal review — 31 October 2026

Sam's live screenshots showed the answer displaced by controls and repeated alerts, with train metadata
confined to a narrow centre column. The authorised redesign uses a compact masthead/context, the existing
controls in Journey options, one primary answer, an expandable next-best service with visible train/platform
identity, and full-width departure rows. Auto/Plan/Live and the planning questions remain exposed. Full notices
and line/data detail remain native disclosures; train-specific warnings and additional surviving-line problems
stay visible. Example and timetable provenance remain visible when worse warnings take priority.

Implementation was reconciled with `8789a50`, retaining the latest guided simulator and six both-design Tube
regressions. No route timing, ranking, feed request policy or saved preference shape changed. Panda restores
the original nodes, handlers, values and root order. No Panda golden recordings changed.

The final production-browser checks passed 20 compact phone/theme layouts and the 12 existing Signal layouts.
They cover actual controls, notices, all loaded services including cancellation, Follow selection changes,
refresh/reload/Plan/Stop, boarding, simulator entry, 44×44 actions, contrast, and all-visible-font 200% text
with no horizontal overflow or overlapping times. At 393px, the ordinary/overnight answer begins at 247/265px
instead of 703/1,105px; the board begins at 613/632px instead of 1,569/2,191px. The overnight page is 64.5% shorter.
These are identical deterministic fixtures, not claims about every live response or iPhone Safari.

The [independent design review](signal-compact-design-review.md) records the inspected screenshots, reference
sources, visual approval and accepted density exceptions. The [independent regression review](signal-compact-independent-review.md)
records exact source commits, focused capability checks, edge cases, and deliberate mutations. Review found
and closed focus loss, Panda order changes, hidden explicit Plan, hidden nested-alert deferral, missing future
plan failures, misleading closed-fallback copy, lost additional line warnings, undersized targets, and enlarged
text collisions. These were fixed and retested; an earlier failed candidate was not counted as release evidence.

Release uses the GitHub-first path because interaction-sensitive page tests changed. The committed-HEAD full
CI, current-main green result, branch Tests, and exact merged Tests/Pages deployment remain separate gates.
Real iPhone Safari, VoiceOver, live-provider reliability and background operation retain the limits above.
