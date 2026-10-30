# Journey simulator scenario coverage

Status: strengthened application integration **22/22 passed**, including actual train/tube identity, displayed arrival states and poor-fix protection. Independent review and committed CI remain release gates.

The integration suite loads the generated `index.html` in jsdom, submits the actual Settings form,
clicks simulator controls and advances the actual playback interval callback. It does not assign trains,
boards, direction or journey locks to the application. This verifies the web application DOM and handlers;
it does not establish Safari permission behaviour, rendering or background delivery on a physical device.

## Application matrix

All test references in this table are `tests/simulator-integration.test.mjs` unless stated otherwise.
Results record direct and focused integration runs on 30 October; final committed CI and independent review are separate release gates.

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
