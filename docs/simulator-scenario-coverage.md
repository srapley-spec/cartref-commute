# Journey simulator scenario coverage

Status: **680/680 tests pass** on independently approved source `c7116fd` ([GitHub PR Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41157467871), [push Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41157462898)); all retained application/unit scenarios below are included. The recorded baselines grew from **409** to **425**, **577**, then **585** as main independently released Follow, Signal and train-stop timing. Real Chromium passed **36 design/theme/phone layouts in both modes**, eight complete journeys, all three speeds, download and actual reload isolation. Independent staged technical and mobile reviews are approved. Exact final committed local CI, merge and deployment evidence is recorded in [release PR #37](https://github.com/srapley-spec/cartref-commute/pull/37). Runtime assertions detect genuine inference, Follow-phase and stop-clock defects; playback alone never establishes a pass.

The integration suite loads the generated `index.html` in jsdom, submits the actual Settings form,
clicks simulator controls and advances the actual playback interval callback. It does not assign trains,
boards, direction or journey locks to the application. This verifies the web application DOM and handlers;
it does not establish Safari permission behaviour, rendering or background delivery on a physical device.

## Application matrix

All test references in this table are `tests/simulator-integration.test.mjs` unless stated otherwise.
The rows retain their original direct-run evidence; every named retained regression also passed in the complete680-test final-source GitHub run. Exact committed local CI and release evidence is recorded in PR #37.

| Scenario | Application behaviour | Simulator inputs | Expected application outcome | Automated test | Result |
| --- | --- | --- | --- | --- | --- |
| Outbound Great Northern | Home, walk, station, rail, interchange, Barbican, Aldgate, office | GN outbound clocked GPS, Darwin, TfL | Every checkpoint pauses, correct direction and final office fix; no network or storage writes | `simulator app: outbound kgx traverses every checkpoint and freezes` | PASS (direct app integration run) |
| Outbound Thameslink | St Pancras passing and Farringdon interchange | TL outbound independent timetable | Same controls, through St Pancras to Farringdon and office | `simulator app: outbound far traverses every checkpoint and freezes` | PASS after permanent ride-completion fix (final 22-case run) |
| Return Great Northern | Office to King's Cross to Letchworth/home | Independent westbound and northbound schedule | Homeward direction, all checkpoints, final home fix and real nearly-home/home presentation | `simulator app: return kgx traverses every checkpoint and freezes` | PASS (direct app integration run) |
| Return Thameslink | Office to Farringdon to Letchworth/home | Independent return schedule | Homeward direction, actual Farringdon alighting control when planner recommends continuing to King’s Cross, final home fix and real nearly-home/home presentation | `simulator app: return far traverses every checkpoint and freezes` | PASS (direct app integration run) |
| Speeds and immediate pause | Shared virtual time | 1×, 5×, 20× callback execution | 1000/5000/20000ms advance per playback tick; exact freeze on Pause; each speed automatically lands at next checkpoint | `simulator app: 1x 5x and 20x advance the shared clock at selected speed and pause immediately` | PASS (direct app integration run) |
| Location precision | Accuracy gates hub/boarding inference | Manual ±1400m, then ±15m at KGX | Coarse fix cannot establish station or boarding; precise fix identifies KGX; negative accuracy rejected | `simulator app: coarse manual fixes reach real inference and precise recovery restores a station` | PASS (direct app integration run) |
| Awaiting location | Normal permission presentation | No GPS fix | Pending location and no inferred direction | `simulator app: pending and permission denied GPS scenarios use normal location presentation` | PASS (direct app integration run) |
| Permission denied and recovery | Normal location error handler | Denied scenario then normal scenario | Denied status followed by valid position recovery | Same pending/denied test | PASS (direct app integration run) |
| Independent switches | GPS-only, feeds-only, disabled | Settings transitions | Device clock with live feeds, synthetic clock with feeds, normal fetch after disable | `simulator app: GPS-only and feed-only are independent and both disabled restore normal operation` | PASS (direct app integration run) |
| Expected boarding | Production train inference | Normal SVG checkpoint and all competing trains | Identify GN0905 from GPS/Darwin; GN0917 remains available | `simulator app: normal identifies the passenger train from GPS and Darwin with competitors` | PASS (direct app integration run) |
| Later train | Actual passenger service identity | +12min GPS itinerary | Identify GN0917 instead of GN0905 | `simulator app: later-train identifies the passenger train from GPS and Darwin with competitors` | PASS (direct app integration run) |
| Different train | Production identification | Wrong-train later departure | Identify actual later service without simulator assigning a lock | `simulator app: wrong-train identifies the passenger train from GPS and Darwin with competitors` | PASS (direct app integration run) |
| Confirmed wrong train | Selection contradicted by live progress | Wrong-train GPS at Stevenage, real pick of earlier0905 | Keep the selected service but flag conflict and warn on actual main card | `simulator app: a confirmed train conflicting with reported position is retained with an explicit warning` | PASS (final 22-case application run plus pure engine regression) |
| Delayed train | Expected/scheduled times | Eight-minute delay in GPS and provider schedule | Correct delayed service identified and delay shown | `simulator app: delay identifies the passenger train from GPS and Darwin with competitors` | PASS (direct app integration run) |
| Cancellation | Never hide cancelled trains, usable alternatives | Primary GN cancellation | Cancelled primary visible; planner retains usable alternative | `simulator app: cancelled departure stays visible and replans to an available service` | PASS (direct app integration run) |
| Uncertain train and explicit choice | Ask when close candidates | Competitor two minutes after primary; initial rail GPS gap; real pick button | Uncertain identity, two choices, picked service remembered by ID | `simulator app: nearby departures remain uncertain and manual train selection uses real pick controls` | PASS (final 22-case run after withholding initial rail fixes) |
| Accuracy changing in buildings/trains | Preserve movement knowledge through rough fixes | Realistic/poor/manual profiles | Rough fixes don't invent movement; established train retained through rough fix; recovery works | `tests/simulator-accuracy.test.mjs` | PASS (3/3 implementation-agent run) |

## Further behaviour coverage

| Behaviour | Simulator inputs | Expected application outcome | Automated test | Result |
| --- | --- | --- | --- | --- |
| Correct hub and rail direction on all four branches | Clocked complete routes | Real `whichTrain` matches service ID at Stevenage for each route/direction; KGX/Farringdon recognised | Four full-route integration tests above | PASS |
| Underground continuity and GPS loss | Platform pick, underground no-fix, Barbican precise fix | Actual DOM pick produces ride; same vehicle retained at Barbican, both directions/routes | Four full-route integration tests above | PASS |
| Walking to station and arrival office | Walking GPS, office dwell | Real `onWay` true; office dwell turns direction home | Four full-route integration tests above | PASS |
| Missed Underground connection | Original tube schedule, precise stationary platform fixes, passenger boards six minutes later | Missed service remains represented; reachable later vehicle offered | `simulator app: missed Underground connection keeps original departures and offers the next vehicle` | PASS (final 22-case run after preserving platform fixes until delayed boarding) |
| Outage and recovery | All provider503 at16–40min, recovery later | App surfaces error; Darwin recovers with parsed services | `simulator app: provider outage retains usable state and recovers during playback` | PASS |
| Arrival-by / leave-around | Actual view controls and synthetic timetable | Nonempty journeys from synthetic service IDs | `simulator app: arrival-by and leave-around plan from synthetic providers` | PASS |
| Reload/background resume | Visibility event and new page built from persisted state | Exact frozen time on resume; no active simulation or virtual clock on reload | `simulator app: reload and background resume keep simulation session isolated` | PASS |
| Date boundary | Select23:44 start, playback across midnight | Correct next-calendar departure and train identity | `simulator app: rail identity remains coherent through midnight` | PASS |
| Leisure/alternative origin | Actual leisure mode and Science Museum origin form | Both hub journey plans, positive durations and ranked rail options | `simulator app: alternative London origin uses real leisure journey planning` | PASS |
| Stale response bodies and source switch | Live JSON resolves after synthetic activation | Only SIM services remain, no live retries | tests/simulator-isolation.test.mjs: `source sessions discard stale live response bodies and stale failures after synthetic activation` | PASS (isolation-agent run) |
| Feed-only persistence | Real pace UI mutation, Stop | Saved state restored; device clock and live providers restored | tests/simulator-isolation.test.mjs: `feed-only simulation suppresses saved journey mutations and Stop restores clock sources and state` | PASS (isolation-agent run) |
| Previously saved flags | Saved simulation flags on new page | Flags ignored, real GPS/clock/network | tests/simulator-isolation.test.mjs: `reload ignores saved simulation switches and restores normal device operation` | PASS (isolation-agent run) |
| Platform and disruption | Primary platform4, Metropolitan severe delays | Actual parsed board platform and displayed warnings | `simulator app: platform changes and Underground disruption reach normal application warnings` | PASS |

## Additional defect from strengthened presentation tests

The outbound Thameslink route reached the exact office position while the actual main card still showed
"On the tube". A ride became inactive at Aldgate, but its saved record remained and became active again
once the passenger walked more than300m away before the ride grace period expired. The GN timetable
masked this because its grace period had expired by office arrival. The test retains the actual `#hero`
arrival assertion. The lifecycle now permanently clears a completed ride and its old departure evidence.
All four route tests pass with actual office/home presentation assertions. An additional accuracy probe
injects a1400m fix centred on Aldgate immediately after tube boarding and requires the actual ride
to continue. `rideActive` previously ignored accuracy and fix age. The pure engine now requires fresh
post-departure GPS with its complete uncertainty circle inside the existing300m arrival radius;
timeout remains a separate completion signal. The same full-route test then verifies precise
Aldgate arrival ends the ride and the real office card appears.

## Practical limits requiring explicit review

- The wrong-train scenario establishes the actual later service through GPS. A separate regression confirms the earlier service using the actual train-pick button and requires
  a visible warning when reported progress contradicts it, while retaining the user’s choice.
- Delayed train coverage models a corridor signalling restriction delaying competitors too. A single GN delayed
  eight minutes can coincide with an on-time TL at Stevenage; continuous GPS may preserve a prior confident lock.
  This ambiguity must not be represented as proof that any overlapping trains can always be identified.
- DOM integration uses the actual static application and handlers in jsdom. Safari behaviour and real browser
  layout require the separate browser check; no real GPS or live API quota is used by synthetic scenarios.
- Synthetic coordinates interpolate railway waypoints; they are not a recorded track survey. London fixture
  journeys support bounded local coordinates and named Science Museum/office examples, not arbitrary worldwide planning.
- Independent review/mutation outcomes and exact committed CI results belong in the final evidence below.

## Release evidence

Main-merged integration evidence (after merging live branch`be91e99`): `tests/simulator-integration.test.mjs`, **22 passed / 0 failed**, 93.24 seconds.
The final picked-train conflict regression passed using actual pick controls; all26 pure situation tests passed.
The return-Farringdon explicit alighting control also passed a focused rerun after strengthening its station assertion.
Focused precision/profile tests passed separately; source-isolation tests passed **8/8**.
Story test-link verification (`npm run check-docs`) passed.

The final evidence must record the exact committed source/build SHA, full test count, local CI,
branch CI, independent review and mutations, and merged-commit CI. None is implied by this matrix.
Do not merge while significant application coverage gaps above remain.

Real Chromium verification (`python3 tests/browser-simulator.py`) executed all four complete routes,
all three speeds, every checkpoint freeze, Stop restoration, zero page errors and zero external requests
during simulation. The script drives the actual interval callbacks inside Chromium; the DOM integration
suite separately asserts engine outputs, train choices, tube vehicles, alighting and displayed arrival states.

An independent overnight DST probe exposed Darwin's date-less HH:mm ambiguity during the autumn repeated
London hour. Ordinary midnight journeys are covered and pass; playback through the repeated autumn hour
is not supported reliably and must not be used to validate exact service identity. Daytime commute scenarios
are unaffected. London local Journey Planner fixtures use illustrative durations, not real scheduled services.

Final source review approved implementation `d296c1c` (unchanged by documentation-only main merge
`0491dae`). A fresh independent reviewer reran30 baseline tests, Chromium and six representative
mutations after the first reviewer exhausted its account quota. All passed/caught respectively;
see [independent review](simulator-review.md). The initial full CI correctly failed a page teardown
with pending refresh callbacks. Tests now wait for the actual loading state to settle before close;
the focused cleanup suite passes4/4. Final committed CI and merge evidence are recorded in
[PR33](https://github.com/srapley-spec/cartref-commute/pull/33) and its GitHub Actions checks.

## Guided Journey Mode and runtime verification redesign

The pre-redesign baseline was executed again: **409 passed, 0 failed** (`/tmp/cartref-ux-baseline.log`).
The number is historical evidence, not a fixed test-count target. Main subsequently added 16 Follow-a-route tests: the current main baseline is **425 passed, 0 failed** (`be1e58e`, [GitHub Actions run 41147553836](https://github.com/srapley-spec/cartref-commute/actions/runs/41147553836)). Those tests were preserved when main was integrated. Existing corridor, provider, source-isolation,
accuracy and recovery tests remain in place. New tests load the same generated application and use the same
controller/provider pipeline through the guided controls.

A passing simulator test is different from a runtime checkpoint PASS. Tests below can pass by proving that
a genuine application defect produces a visible runtime FAIL. Merely reaching a waypoint does not establish
application correctness; undefined or insufficient assertions remain INCONCLUSIVE.

| Behaviour | Simulator/user inputs | Expected observable outcome | Automated test | Current execution result |
| --- | --- | --- | --- | --- |
| Three-action guided start | Open Journey Mode; choose direction, corridor, Start | Both synthetic sources and shared clock active; first checkpoint paused; configuration collapses and real app remains the main screen | `Journey Mode starts either selected corridor and direction in three actions with automatic coordinated sources` | PASS (rebuilt-page 12-case UX run) |
| Scenario discoverability and preservation | Inspect every grouped scenario option | All existing fixture IDs retained; each has an input description and expected app behaviour | `Journey scenarios retain every existing fixture and explain their expected application behaviour` | PASS (rebuilt-page 12-case UX run) |
| Advanced tools and timeline inspection | Open modes/timeline while playback runs | Same session, sources, checkpoint and timer retained; old manual controls remain available; inspecting does not jump | `Journey Advanced and timeline inspection preserve the same active simulation and playback timer` | PASS (rebuilt-page 12-case UX run) |
| Remember choices without resuming simulation | Select return/Farringdon, stop, reload stored preferences | Allowlisted direction/corridor choices restored; real GPS/feeds/device clock active on reload | `Journey preferences remember selection across reload without persisting an active simulation` | PASS (rebuilt-page 12-case UX run) |
| Explicit inference defect detection | Isolated built-page mutation makes production `trackLine` return false while GPS/Darwin remain normal | Actual app displays the wrong non-rail view; runtime rail-movement assertion and compact badge show FAIL, with expected/actual evidence | `Journey verification detects a deliberate production movement defect and exposes expected versus actual failure` | PASS (rebuilt-page 12-case UX run) |
| Actual message comparison | Open failed checkpoint evidence | Detail retains the main-card message the genuine app displayed, alongside explicit assertions | Same production movement mutation test | PASS (actual main-card text retained in rebuilt-page comparison) |
| Results and privacy | Complete two checkpoints, Stop, copy report containing fixture secrets/custom home | Separate checkpoint/assertion counts, configuration/times and evidence exported; no credentials or personal coordinates; viewing results does not resume simulation | `Journey results distinguish assertion counts and copy a credential-free diagnostic report` | PASS after preserving the fixed report-kind discriminator during privacy redaction |
| Outbound GN / King's Cross | Guided full normal journey, actual app tube selection | Every checkpoint evaluated, actual SVG identity PASS, clock remains frozen during inspection, summary counts reflect actual verdicts | `Journey verification: outbound kgx evaluates real checkpoints through completion` | PASS (final strengthened four-route run; zero runtime FAIL assertions) |
| Outbound TL / Farringdon | Guided full normal journey, actual app tube selection | Same; the known Thameslink remains on rail through St Pancras and genuinely alights at Farringdon | `Journey verification: outbound far evaluates real checkpoints through completion` | PASS (final strengthened four-route run; zero runtime FAIL assertions) |
| Return GN / King's Cross | Guided westbound tube and northbound rail | Real platform pick, actual SVG train identity, complete endpoint and truthful assertion totals | `Journey verification: return kgx evaluates real checkpoints through completion` | PASS (final strengthened four-route run; zero runtime FAIL assertions) |
| Return TL / Farringdon | Actual tube pick and explicit Farringdon alighting control | Real northbound train identity and home endpoint; unconfirmed alighting is not fabricated | `Journey verification: return far evaluates real checkpoints through completion` | PASS (final strengthened four-route run; zero runtime FAIL assertions) |
| Known-service through-station continuity | Thameslink passes St Pancras with precise fresh train-speed fixes and matching service calling points | Actual app stays on rail, runtime rail-progress assertion passes, then genuine stationary Farringdon arrival ends rail state | `Journey verification recognises known Thameslink continuing through St Pancras before genuine Farringdon alighting` | PASS after generic production inference fix |
| Through-station regression remains detectable | Isolated built-page mutation restores ordinary hub-radius handling for the known moving service | Actual app again prematurely leaves rail state; the same runtime assertion and visible badge report FAIL | `Journey verification visibly fails when known-service through-station inference is deliberately reverted` | PASS: negative control exposes deliberately restored application failure |
| Start/show asynchronous interaction | Reopen controls during settled Start callback | User's Show action is retained; late completion cannot close it again or change playback | `Journey controls reopened while Start settles are not closed again by a late callback` | PASS after removing duplicate late collapse from the Start completion callback |
| iPhone-sized layout and accessibility | Three viewports × system/manual light/dark, Journey and Advanced modes | Prominent Start needs no extra scroll, controls ≥44px and text contrast ≥4.5:1; measured dock space reserved and no overlap/overflow | `python3 tests/browser-simulator.py` | PASS (18 layouts, both modes; Start requires no extra scroll) |
| Browser report export | Stop a completed journey and use actual JSON download | Report retains results without restarting simulation; no external transport requests | `python3 tests/browser-simulator.py` | PASS (real Chromium JSON download after Stop) |
| Advanced independent sources and insufficient evidence | Turn synthetic GPS off using the real Advanced source checkbox while keeping synthetic feeds | Independent source selection works; coordinated checkpoint verification is INCONCLUSIVE instead of a fabricated PASS | `Advanced independent sources retain controls and make incomplete checkpoint evidence inconclusive` | PASS (focused Advanced integration run) |
| British local time and Advanced clock parity | Set August 08:44 UTC in Advanced, then return to Journey setup and Start | Setup/dock say 09:44 BST and actual clock retains the same selected instant | `Journey setup displays the British local time actually selected in Advanced` | PASS (actual app focused integration, 3/3 including history/privacy) |
| Runtime outage and recovery wiring | Guided provider outage from minute 16 to 40 | Real application reports failure; recovery oracle observes the actual Darwin source and resumed services | `Journey runtime verification observes the real provider outage and its recovered source` | PASS (actual app focused integration, 3/3 including history/privacy) |
| Follow state isolation after current-main integration | Choose a real journey with the actual Follow button, Start guided simulation, select/stop following a synthetic journey, then Stop simulation | Real saved Follow is untouched, synthetic Follow exists only in memory, actual rendered selection/cancellation are reported, and Stop restores the exact original Follow | `Journey simulation isolates real Follow state while actual synthetic Follow and Stop following remain usable` | PASS (actual built-page focused regression) |
| Following a delayed service | Guided eight-minute rail delay; actual Follow button on the delayed service; continue to Stevenage | Real planner reports delay, actual Follow card recognises boarding the same inferred service, exported events retain the observed selection without credentials | `Journey delayed services remain followable through genuine boarding and reported inference events` | PASS (actual built-page focused regression) |

### Application defect uncovered and fixed using the new verifier

The new verifier initially reported a real FAIL at outbound Thameslink **Passing St Pancras**: its fresh
train-speed fix fell within the neighbouring King's Cross hub radius, and the production app prematurely
cleared rail movement. The original route playback test had not asserted that intermediate inference state.
The scenario and assertion were retained. A generic pure-engine helper now uses already inferred service
identity, ordered calling points, profile geometry and fresh train-speed evidence to preserve a continuing
service through an intermediate/shared hub; genuine stationary destination arrival still ends rail state.

The positive actual-app regression now observes rail-progress PASS through St Pancras and genuine alighting
at Farringdon. A separate isolated built-page mutation removes the helper's continuation evidence and requires
the runtime verifier to show the original FAIL again. Successful playback is never substituted for either
assertion. No simulator identity injection, fixture change or assertion removal was used to conceal the defect.

### Guided UX execution evidence

- Built-page Journey UX: **12 passed, 0 failed**, 78.81s (`/tmp/cartref-journey-ux-fixed.log`).
- Additional independent-source regression and strengthened timeline test: **2 passed, 0 failed** (`/tmp/cartref-journey-ux-advanced.log`). The retained UX file subsequently gained a positive through-station case and separate production-helper negative control; it now contains 18 cases after adding local-time hint, actual provider-recovery wiring, and two actual Follow integration regressions. The 499-test GitHub run reran all 18 together.
- Real Chromium:18 phone/theme combinations across Journey and Advanced modes,44px controls,4.5:1 minimum text contrast, measured dock reservation, no overflow/overlap, three-action Start, unchanged playback through mode/timeline inspection, actual JSON download after Stop and all four route/direction journeys at1×/5×/20×. Zero page errors or live transport requests during simulation (`/tmp/cartref-journey-ux-browser-fixed.log`).
- The retained production mutation changes only an isolated built-page copy of `trackLine` to return no rail movement. The real app consequently renders the wrong view and runtime verification displays FAIL. No expected train identity or route is injected into the application.
- First execution identified two implementation defects: a late Start callback closed controls the user had reopened, and privacy redaction altered the report's fixed format discriminator. Both were fixed, and the original failing assertions pass without weakening them.

Focused integration after the core continuity correction: **4 passed, 0 failed**, 27.77s (`/tmp/cartref-journey-ux-core-fixed.log`). This includes a numbered session-identity preservation check, the production movement mutation, known Thameslink continuity plus genuine alighting, and the deliberately reverted through-station helper. The mutation targets the production function name/signature with an assertion that exactly one target was replaced.

The stopped-history comparison also retains completed versus upcoming steps and historical times after a new Advanced draft route is selected, without reactivating simulation. An additional probe caught a British-time hint that advertised the default November date while preserving a custom August clock; the UI now derives that hint from the selected instant. The source recovery regression requires the observational snapshot to include the real provider source, not merely nonempty cached services.

Final wiring and reporting focused integration: **3 passed, 0 failed**, 13.09s (`/tmp/cartref-ux-report-clock-outage.log`). This verifies historical GN progress after selecting a future TL draft, the same August instant displayed as British Summer Time in setup and playback, and the runtime outage/recovery oracle against actual provider state.

Current-main Follow integration was exercised through the actual application buttons, not by writing a followed train into engine state. The saved real journey was selected through the ordinary live-timetable UI before simulation. Guided Start removed it only from the in-memory session; synthetic Follow and Stop following changed the real app card and generated report events without changing persistent storage. Stop restored the exact original followed journey. A separate delayed-service run selected the genuine Follow button, observed the eight-minute provider delay and the same inferred train onboard near Stevenage, and checked credential-free exported events. Both focused cases passed (`/tmp/cartref-ux-follow-isolation.log`, `/tmp/cartref-ux-follow-delay.log`).

After current-main integration and the office-dwell oracle correction, all four complete normal journeys passed the stronger requirement of **zero runtime FAIL assertions**, while retaining legitimate INCONCLUSIVE decisions and explicit SVG train-identity PASS. This focused actual-page run passed **4/4**, 51.21s (`/tmp/cartref-ux-normal-runtime-dwell-fixed.log`). It exposed and corrected an oracle false negative: a valid homeward planning card included a future journey step saying “36 min on the train”; the stale-card check now targets the primary “On the train/tube” heading while retaining independent direction, planning-view, ended-rail and ended-ride assertions. Initial office arrival still requires the actual office-arrival card.

### Retained-suite evidence before the subsequent Signal release

The pre-Signal implementation passed **499 tests, 0 failed, 0 skipped** on GitHub in 202.63s, including all 18 Journey UX cases, all 11 independent-review regressions, 26 verifier cases, 11 report cases, the eight added rail-context regressions and the 425-test updated-main baseline. Existing tests were retained. The branch push and PR checks both passed ([push](https://github.com/srapley-spec/cartref-commute/actions/runs/41149135000), [PR](https://github.com/srapley-spec/cartref-commute/actions/runs/41149141080)).

The earlier `a23e31d` branch check failed only the two outbound office-dwell wording assertions described above (494 passed, 2 failed); the corrected implementation reran the full suite successfully. A working-tree run overlapping main integration and a later environment restart were discarded, not counted as passes. Golden regeneration is checked for actual diffs rather than treating fixture writes as evidence of correctness.

## Current-main Signal integration

Main advanced again to `4ee24c7` (PR #36) during the release checks. Its baseline is **577 passed, 0 failed** ([Tests 41150601099](https://github.com/srapley-spec/cartref-commute/actions/runs/41150601099)); its full Follow/Signal scenarios and translated legacy regressions are retained. The earlier 499-test result above belongs to the prior main integration and is historical evidence, not the final new count.

| Behaviour | Simulator inputs | Expected actual application outcome | Automated test | Result |
| --- | --- | --- | --- | --- |
| Both designs, corridors and directions | Full coordinated normal GPS/feeds/clock, actual Tube choices | Zero runtime FAIL assertions, actual Stevenage identity PASS, frozen checkpoints and genuine end-of-journey presentation in Panda and Signal | Eight complete-route cases in `tests/simulator-journey-ux.test.mjs` | PASS: Panda4 in 58-case integrated run; Signal4 in 68.25s |
| Explicit planning pin | Actual Signal Plan and Return to Auto controls on a moving train | Preserve tracking; pin yields INCONCLUSIVE for automatic presentation; Auto restores actual rail identity PASS | `tests/simulator-signal-review.test.mjs`: explicit Planner pin | PASS (independent actual-page run) |
| Follow phase despite richer main card | Actual Follow of Thameslink; sequential GPS through Stevenage and St Pancras | Normal on-train card plus correct followed on-train phase; both assertions PASS; real Follow panel retained in evidence | Same independent suite: genuine followed Thameslink | PASS; production wrong-phase mutation produces runtime assertion and visible badge FAIL |
| Current Follow persistence and source isolation | Real Follow/planning selection before Start; simulated Follow, Restart, Stop; stale option/transport sentinels | Restore original real route/metadata, no synthetic storage writes, no stale option reuse; observation is read-only | Last case in `tests/simulator-ux-review.test.mjs`, adapted only to main's released API | PASS; removing new saved-memory or Map clearing is detected |
| Harness focus versus actual app editing | Keep Advanced speed selector focused during playback, then repeat with actual app Settings editing | Harness focus cannot defer the real app; genuine editing deferral is INCONCLUSIVE, closing resumes real on-train view and identity PASS | New independent suite: focused technical speed control | PASS; removing focus exclusion or trusting an unsubstantiated pending flag is detected |
| Separate Follow report privacy | Actual panel, bounded revision and private fixture values | Retain genuine warnings while redacting private location/credential strings; never export raw route/state | Independent Follow panel/revision case and `tests/simulator-report.test.mjs` | PASS; shared-sanitizer mutation is detected; redundant first-layer-only mutation safely survives secondary export redaction |
| Mobile design compatibility | Actual Settings design/appearance toggles, both modes, three sizes, system/manual themes, eight full journeys/all speeds | Readable controls, compact reserved dock, unchanged playback, real app headline, no live requests, actual report download | `python3 tests/browser-simulator.py` | PASS on final reviewed source:36 layouts, both modes, eight journeys, no page errors/live calls (`/tmp/cartref-ux-signal-browser-final.log`) |

The new shell observes main's already-computed inference and follower result, including its separate actual Follow panel. No legacy parallel planner was retained. The new verification distinguishes a legitimate presentation pin/reading deferral from an unintended view failure; a pending flag without actual app interaction cannot suppress assertions. Core service continuity remains generic and unchanged by this integration.

### Integrated test evidence before the subsequent train-stop release

The reviewed implementation `5674e2f` passed **663 tests, 0 failed, 0 skipped** on GitHub in193.86s. This includes the updated577-test main baseline,22 Journey UX cases (eight complete normal routes across both designs),29 verifier cases,12 report cases,11 original independent UX regressions,4 independent Signal integration regressions and8 added pure rail-context cases. No original valid simulator test was removed. Two UX Follow tests and the last independent Follow test were translated to main's released shared API while preserving persistence, restart, cache, actual-control, phase and read-only assertions; mutation probes continue to detect their intended defects.

The final real-browser run passed36 design/theme/phone combinations in both modes and8 complete journeys at1×/5×/20×, with frozen checkpoints, visible real headline, actual JSON download and zero page errors/live requests during simulation. The independent reviewer then tested the exact committed build in393×852 and852×393, light/dark:44px targets, minimum control contrast10.24:1,125px dock with140px reserved space, no overflow/overlap, frozen clock and successful Stop-to-real restoration. Physical Safari remains explicitly unverified.

## Train-stop timing and real station restoration

Main subsequently released `cdf6ecd` with the train-stop watch and its simulator reset. Its [585/585 baseline](https://github.com/srapley-spec/cartref-commute/actions/runs/41152958710) is preserved. The simulator now emits zero speed during stationary waits, actual rail speed through the final approach and zero on arrival; the normal engine derives the stop. It restores recent original real station visits after transient reset through both exit paths, while discarding the synthetic speed watch.

| Behaviour | Simulator inputs | Expected actual application outcome | Automated test | Result |
| --- | --- | --- | --- | --- |
| Four coordinated train stops | Both corridors/directions, normal sequential GPS and parsed Darwin | Provider arrival equals GPS-derived stop and virtual arrival; returning LET stop never attaches to an old London hub | Four route cases in `tests/simulator-stop-review.test.mjs` | PASS:5/5 suite44.69s including restoration |
| Waiting before departure | Same-position GPS fixes while selected Darwin departure is still future | Zero speed, no fabricated fresh train-speed reading; actual boarding starts the train movement | Same four cases | PASS; old next-mode-only speed mutation is detected |
| Visible stop verification | Outbound London alighting checkpoint | Runtime `station-stop-clock` and `rail-arrival-clock` PASS using actual parsed destination board and normal hub memory | Same independent outbound cases plus verifier counterexamples | PASS; broken final-approach speed causes actual runtime/badge FAIL |
| Freeze and restart | Pause at arrival, then actual Restart | Stop/clock remain frozen; speed/visit memory clears for new session | Same four cases | PASS |
| Preserve real stopped visit | Native KGX/no-speed location and a real saved stop before simulation; dock Stop and actual Settings source-disable | Original runtime/saved/storage stop survives resumed real fixes; no synthetic speed history escapes | Fifth independent stop-review case | PASS; old restore-then-reset ordering is detected |
| Advanced poor accuracy with Normal scenario | Select poor profile before Start, walk, then precise Restart | Actual coarse data yields INCONCLUSIVE, no falsely precise arrival claims; precise recovery resumes original normal assertions | `Advanced poor accuracy stays inconclusive in a normal scenario and precise restart recovers` | PASS:actual page2.82s; independent normal/coarse-false-station/precise boundary probe also passes |

After these changes, all eight complete normal routes across Panda/Signal reran with zero runtime FAIL assertions (**8/8**,121.83s). The final Chromium rerun again passed36 layouts/both modes and8 journeys/all speeds with zero errors or live calls (`/tmp/cartref-ux-stop-browser-final.log`). The focused verifier/report suite passed42/42. Final complete integrated test counts and release evidence are recorded in PR #37.

### Train-stop suite evidence before final planning-input correction

The reviewed final source `11f369b` passed **678 tests, 0 failed, 0 skipped** on GitHub in313.47s. This retains the585-test current-main baseline and adds23 Journey UX cases,30 verifier cases,12 report cases,11 original independent UX regressions,4 independent Signal integration cases,5 independent train-stop integration cases and8 pure rail-context regressions. Complete exact-commit release evidence is in PR #37.

Independent review endorsed exact source commit `11f369ba9096f9cf7e14016c8898505d5b01b9a8` after comparing the committed generated index and source with the approved snapshot. The only index differences were build time and the already-reviewed actual-coarse-accuracy guard. No implementation code was written by that reviewer, and no significant findings remain open.

## Planning-input isolation and actual browser reload

An additional independent end-of-session probe found a real saved-only restoration gap: after temporary simulation edits, By/At metadata returned but the DOM date/time and runtime alternative origin did not. The old generated page failed all four combinations (By/At × dock Stop/Settings source-disable); By planned the wrong November8 target and At did not resume planning. The session now restores the actual input values and runtime origin before normal refreshing. The normal location dispatcher resumes the selected planner rather than always invoking Arrive-by.

| Behaviour | Inputs and expected actual outcome | Automated test | Result |
| --- | --- | --- | --- |
| Original By/At question survives temporary edits | Real November5 11:23/Aldgate question; edit to November8 14:47/ScienceMuseum in simulation; both exit paths restore original DOM/runtime and actual planning target | Sixth case in `tests/simulator-stop-review.test.mjs` | PASS all4 paths,6.47s; removing input restoration reproduces all4 failures |
| Original private unsaved input draft stays private | Original draft differs from submitted origin; representative diagnostic event before/after Stop | Same retained independent case | PASS; original draft restored exactly and redacted from report |
| Leave-around starts when GPS arrives late | Initial loading completes without location, then normal native location delivery | `tests/simulator-planning-resume.test.mjs` | PASS:actual requested target and genuine Leaving-around card,1.03s |
| Real browser reload clears active state | Stop/export, then actual Chromium reload | `python3 tests/browser-simulator.py` | PASS:36 layouts, eight journeys/all speeds, report download, reload exits sources/clock/controller, zero page errors/live calls while simulated (`/tmp/cartref-ux-browser-release-final.log`) |

The preceding complete source run passed678/678 with zero golden changes before this final input-isolation correction. Final integrated counts and fresh committed-code CI are recorded in PR #37, together with the exact merged/deployed commit.

### Final source and complete results

Exact approved source `c7116fd60fe6aa8b4766cc4814e4e04543a136e1` passed **680 tests, 0 failed, 0 skipped** on both GitHub checks in220.83s. The final count comprises the585-test current-main baseline,23 Journey UX cases,30 verifier cases,12 report cases,11 original independent UX regressions,4 Signal integration regressions,6 stop/isolation regressions,8 pure rail-context cases and1 late-GPS planning-resume regression. The independent reviewer compared all42 committed source/build files with the approved snapshot and found zero mismatches.

Both By/At questions and alternative origins restore through both exit paths, while private drafts remain redacted. The final Chromium run also confirms actual reload clears active simulation after successful report export. Previous complete678-test runs had zero golden differences; the final fresh-copy CI and exact merged/deployed-commit evidence are linked from PR #37.
