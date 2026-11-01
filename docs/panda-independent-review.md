# Independent Panda retirement review — 1 November 2026

Decision: **satisfied with the functionality and mutation review**. No lost Panda capability or application-source
defect was found in the reviewed retirement. Final committed-HEAD local CI, GitHub branch green, merge and
post-merge Tests/Pages verification remain required release work; this review does not waive them.

Latest candidate reviewed: `99bab4a2a5d9dd954bc368d42fa0860905422a5e`.
Its application and generated page are identical to source integration
`c757c70f9f52273ddc85dfe2cf306c9eb53ba27a`. The centred-duration follow-up is recorded below and is also
**satisfied**. The original review approved `022422f9724e2449ebb52df8a2389eb5f80be923`; its 13 effective mutations
ran against `a3845e04e421d1639dcd1a5b865294c5fe07a6cf`. Their original source hashes and results remain history,
alongside the four new mutations of the duration integration.

This reviewer did not implement the retirement, edit the author's checkout, merge or push main. Review and
deliberate breakages used the detached `/workspace/cartref-independent-review` worktree and disposable fixture
copies. The author audit and earlier browser results were supporting evidence, not the basis of sign-off.

## Original review: archive and source comparison

- Independently checked the remote with `git ls-remote origin refs/heads/archive/panda-2026-11-01`:
  `a45f08d704bbe59e7b7fa0bd044ce29bae2dbd4f`. The initial snapshot
  `0d6bf6e103246fefa68412d90f58d314af1cad9d` and intervening main `a27b1f6` are ancestors. At this stage the archive retained the complete
  pre-retirement main, including its build, dependencies, Panda/Signal implementations and tests. The later archive check is recorded below.
- Read `CLAUDE.md`, architecture, the archived Panda component inventory, and the relevant planning,
  presentation, connection, source, journey-facts/progress, Follow, Along, simulator and Trip stories. Compared
  archived and candidate application source and the test/build/CI changes, including deleted gates and tests.
- Relative to latest pre-retirement main, `src/core`, `src/simulator`, Trip UI/adapters, Follow transport,
  proxy, test harness and clock are byte-for-byte unchanged. Retirement removes renderer branching and saved
  design selection, rather than replacing the planning/tracking engines or their observations.
- After removing only the retired `html[data-design="signal"]` selector prefix, candidate Signal CSS is
  identical to main's Signal CSS except for the intended multi-station boarding-summary rule. This independently
  verifies retention of main's newer stable duration anchors, countdown layout and Trip styling.
- The only removed page IDs are `s_signal` and obsolete `s_tripNeeds`. Original controls, dialogs, source detail,
  Refresh and actions remain. Trip uses only its independent opt-in after removal of the design prerequisite.
- Parity registry/validator/enforcement-only tests and redundant two-renderer replays are intentionally removed
  under Sam's retirement instruction. Actual semantic view, duration, action, Tube, Along, Follow and simulator
  cases remain ordinary tests. All eight recently added Trip views are retained. Test discovery still includes
  page and core suites and propagates failures; mutation M12 proves dropping core discovery is detected.

## Functionality checked

| Area | Independent check and result |
| --- | --- |
| Planning and complete train lists | Leave now, Arrive by/tomorrow and Leave around; selected/best/earlier/stopping/late/cancelled/no-estimate services, effort and earliest-arrival ownership retained. Explicit Plan keeps the answer and alerts while tracking continues. |
| Live journey stages | Real view factories reach waiting-for-location, pre-journey departures, Follow, rail, interchange, outbound/homeward Tube, London/office and final walk. Source/rule probes retain train/Tube identity, corrections, platform choices, stop timing and arrival/direction boundaries. |
| Controls | Original Journey options and planning nodes retain identity, handlers, entered dates and values through repeated light/dark/system changes. Commute/Leisure, direction and pace still act and persist; no duplicate control copy is introduced. |
| Two-station facts | Distinct Farringdon/St Pancras times and platforms remain readable in collapsed Next best; a missing second platform remains missing. Expanded original steps/actions remain available; Follow chooses the actual boarding service. A shared service label cannot attribute one station's platform to both. |
| Source honesty and notices | Stale-board caution and important impact remain exposed. Travel alerts and Lines & data have reachable native controls; full nested source reasons, good-service lines, unknown rail status and estimated Tube explanation remain readable. Open nested notice reading survives redraw. |
| Saved phone data | Absent/false/true obsolete design values all use Signal. Independent Follow and Along opt-ins, actual `alongLinePreferences`, complete chosen legs, route ID/original arrival, pin, home, pace, personal timings/factor and separate planning inputs survive normal save/reload. |
| Follow and Along | Current Follow is independently configurable; legacy Follow migration is retained. Along is available before boarding, preserves its original article controls/preferences and evidence qualification, and does not require enabling Follow. Active incidents are retained in commentary. |
| Trip reconciliation | A recorded multi-ride address journey plans and follows. Its addresses, access modes, question, recents and complete Follow state survive all obsolete design values, appearance save, Commute/Trip changes and independent Trip off/on. Missing-key setup remains honest. |
| Simulator | Reset/Back, unavailable/stale GPS and source guards retain their existing coverage. New combined upgrade probe changes synthetic pace and Along depth while feeds are synthetic; storage remains untouched and Stop restores the real route, original legs, pace and Along preferences. |
| Latest main's progress fix | The displayed train owns its live reports even when a different later service is followed. Done/Now/Next labels and report/stage verification are retained from `a45f08d`; old design preferences cannot disable the verification or diagram. |

The direct structured comparison of all **22 golden scenarios** found `options`, `requests` and `errors` exactly
equal to both original `0d6bf6e` and latest main `a45f08d`. This includes times, ranking, flags, itinerary steps and
alternate boarding options, rather than only the rendered prose. Presentation text changes reflect Signal geometry
and latest main's duration/countdown arrangement; they do not change engine answers or request behavior.

## Executed tests and findings

The independent targeted command ran these nine suites using the production built page and virtual clock:

```sh
TZ=Europe/London node --import ./tests/clock.mjs --test --test-reporter=tap \
  tests/journey-views.test.mjs tests/rules.test.mjs tests/app.test.mjs \
  tests/along-line-review.test.mjs tests/follow-main-regression.test.mjs \
  tests/live-station-board.test.mjs tests/simulator-context-reset.test.mjs \
  tests/journey-facts-review.test.mjs tests/test-runner.test.mjs
```

Result on integrated `da9c987`: **225 passed; four failed old inline-sentence-order assertions**. These were
investigated, not waived. Main's later stable duration layout puts duration and service in separate slots.
Reviewed `c9cdedd`'s replacement assertions: each still locates the intended service, checks its exact numeric
train duration and preserves best/next-best ordering, margin, stopping/late flags and leave instruction. The four
affected app scenarios and the additionally updated logic scenario independently replayed **5/5 passing**.

Additional independent executions:

- **22/22 passed**: any-place planning, legacy Follow migration, journey progress and canonical presentation
  suites (`anyplace`, `follow-migration`, `journey-progress`, `presentation-ui`).
- **9/9 passed**: new [retirement regressions](../tests/panda-independent-review.test.mjs), including all upgrade
  values, original controls, distinct/unknown platforms, reachable nested source detail, Trip and simulator isolation.
  Re-run against final application source after integrating `a45f08d`, including explicit progress-verifier flags.
- **5/5 passed** after that integration: mismatched-report rejection, a timetable Follow with independent fresh
  actual-train reports, both KGX/Farringdon simulator journeys following a different later service under an obsolete
  false design preference, and the calling-report/stage-verification counterexamples. These came from
  `journey-progress`, `progress-follow-conflict` and `simulator-verification` suites.
- **8/8 native Chromium layouts passed** in [the independent browser check](../tests/browser-panda-independent-review.py):
  light/dark × 320/390 px × normal/doubled visible text. Native keyboard expansion exposes original metadata and
  Follow; nested full notices are reachable and remain open on redraw. No horizontal overflow, overlapping time
  values or page errors; Follow targets were at least 44 px. Collapsed and enlarged screenshots were visually inspected.
  Artifacts are in `/workspace/scratch/panda-independent/`; tested build SHA-256:
  `9e0f6ace49346801a0a6a871b41f7c92814ef07476e77a1df14efde116f4dd99`.
  This final replay used the candidate's committed generated page.

No retirement production fix was necessary. The subsequent main-branch progress fix was inspected and retained.
Review also identified current documentation still describing a mandatory
parity gate, a renamed browser-test link and some present-tense Panda wording; these were sent to the author for
cleanup and their corrections were inspected in the final candidate. Historical decision and old review evidence remain history.

## Independent deliberate breakages

All **13 effective one-line breakages built successfully and were caught by assertions**, in isolated copies.
[Machine-readable evidence](panda-independent-mutation-results.json) records exact before/after code, test selection,
exit status and failing test name for every mutation.

| Mutation | Deliberate behavior loss | Detecting regression |
| --- | --- | --- |
| M01 | Drop actual Along preferences during design migration | Saved `signal=false` upgrade, real Along depth and full preferences |
| M02 | Clone original Journey options controls | Original node identity, uniqueness and handlers |
| M03 | Remove collapsed two-station boarding context | Unknown-platform Next best summary |
| M04 | Attribute one platform to the whole two-station service | Distinct-platform service/boarding ownership |
| M05 | Persistently hide full original notices | Exposed original Travel alerts body |
| M06 | Discard consolidated current line/source strip | Unknown rail live-status evidence remains readable |
| M07 | Disable nested disclosure restoration | Full line-notice reading position survives redraw |
| M08 | Hide Follow while Plan is pinned | Active followed-route cancellation alert |
| M09 | Restore the retired Signal prerequisite for Trip | Enabled saved Trip under obsolete `signal=false` |
| M10 | Enable Trip regardless of independent opt-in | Trip-off baseline and no Trip request |
| M11 | Alias real saved-state snapshot to synthetic edits | Stop restores real itinerary and Along preferences |
| M12 | Stop discovering core test files | Runner discovers both suites and detects their failures |
| M13 | Gate the new live-progress verifier/diagram on obsolete Signal settings | Explicit verifier and diagram flags under saved `signal=false` |

Two preliminary probes were neutralized by the ordinary synchronous render path: `renderBanners` overwrote an
early `hidden` assignment, and `restoreOpen` reopened an early closed disclosure. They did not create a persisting
user-visible breakage. Their exact results remain in `calibration`; they were replaced with M05/M07 above and
re-run successfully. There is no unresolved meaningful surviving mutation and no excluded failing requirement.

## Limits and release decision

This review establishes the inspected source invariants, fixture behavior and native Chromium reachability/layout.
It is not a physical journey, real iPhone Safari/VoiceOver acceptance test, provider-wide transport guarantee or
an exhaustive mutation proof. No live transport or Google credentials were used; recorded/synthetic providers
remain explicitly identified.

**Independent review satisfied.** Carry the committed review tests into the final candidate and complete every
normal local/GitHub release check. Settings and test/build machinery changed, so the GitHub-first release path
still applies. The root agent remains responsible for the final integrated CI, exact main commit and live deployment.

## Incremental review: centred Total journey

Reviewed candidate `99bab4a2a5d9dd954bc368d42fa0860905422a5e`, application source
`c757c70f9f52273ddc85dfe2cf306c9eb53ba27a`, against new pre-retirement main/archive
`dc1918905ec6e4d12da0b95a1290c5e429a98dcf`. Independently verified the remote archive now points at that complete
main commit; the earlier snapshots remain ancestors. Later candidate commits update only recordings, browser-test
maintenance and result metadata; application, generated page and test-runner source remain identical to `c757c70`.

The only new application behavior is the approved explicit **Total journey** label, centred beneath the headline
times with separate train duration underneath. `journeyFactsMarkup` still uses the same canonical numeric facts;
known and unavailable labels are unconditional in the sole Signal design. No obsolete design prerequisite was
reintroduced. Latest-main CSS matches exactly after removing the retired selector prefix and retaining the existing
boarding-summary rule. Engine, simulator, Trip/provider code, harness, clock and test machinery are unchanged from
the prior reviewed application. The active retirement instructions, controls, migration and archive recovery remain.

Executed independently on this application source:

- **42/42 passed** across `panda-independent-review`, `signal`, `along-line-composition-review` and
  `journey-facts-review`. This replays all nine preservation probes, adds explicit whole-journey wording under
  absent/false/true obsolete preferences, and proves an unknown Follow total has no retained numeric value.
- **8/8 independent Chromium cases passed** after extending the independent browser check to measure the total
  and train-duration centres and their separate vertical rows. Both themes, 320/390 px and doubled text retained
  readable station alternatives, native disclosure actions, full notices and 44 px Follow targets; zero page errors.
- **6/6 updated stable-layout browser cases passed**, covering Plan, Live, station and Follow, long/missing platforms,
  unavailable durations, expansion/refresh, doubled text, unchanged Expected departure columns and touch targets.
  The committed page tested in both browser checks has SHA-256
  `1f995b39e663a5fa80b9c80625c9b2d6df49359eb9b0e7d50b56d3e59a4157a4`.
- Re-compared all **22** golden `options`, `requests` and `errors` arrays to both original `0d6bf6e` and final
  archived main `dc19189`: every array is unchanged. Source inspection confirms only presentation wording/layout.

Reviewed the compact-test maintenance in `93e5fe5` rather than accepting a higher unexplained cap. Independent
native measurements against archived `dc19189` Signal and the candidate, in both light and dark at 393 px, found
identical row heights of 230.953125–255.546875 px with 45 px of visible stacked duration facts. The old 220 px raw
row cap fails the approved archive too. The candidate board is 20.796875 px lower because of its retained alternate
boarding facts. The updated check retains the 220 px layout-overhead bound, requires visible duration blocks to be
greater than zero and at most 48 px, and measures board overhead separately from required visible durations. Its
existing fact, cancellation, visibility, contrast, overlap and touch checks remain. This is an evidenced geometry
contract update, not an excluded failing requirement. Measurements are in `/tmp/panda-independent-centred-archive.json`.

All **four new isolated one-line mutations built and were caught**: C01 restores obsolete settings-gating for the
new label; C02 fabricates a zero-minute unknown total; C03 left-aligns the total; C04 overlaps train duration with
the total row. Exact code and failing assertions are appended to the mutation JSON. The earlier 13 results are
preserved with their original source baseline; their retirement paths did not change in this small integration.

**Incremental independent review satisfied.** No application defect, lost functionality or meaningful surviving
mutation was found. Complete the normal committed-HEAD CI, GitHub-first merge and exact main/Pages verification.
