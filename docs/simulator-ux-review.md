# Journey Simulator UX redesign — independent staged review

Reviewer: `/root/ux_review`, separate from the feature implementation authors. The reviewer owns this
report and `tests/simulator-ux-review.test.mjs`; no feature implementation was written by this reviewer.
Reviewed base: `47c82c7`; initial integrated implementation reviewed through the 31 October 00:03 UTC build.
Final focused integration review: `a23e31d`, incorporating current main `be1e58e` and its Follow-a-route feature.
**Independent UX and technical review approved.** Release remains conditional on committed-code CI and
GitHub release gates; this approval does not claim those have already completed.

## Stage 1 — design and guided/mobile experience

**Approved**, including a final built-page recheck after integration.

The design contract preserves a single existing simulation engine and source-isolation transaction.
Guided selections are drafts until Start; Advanced and timeline inspection are presentation changes.
Preferences allow only direction, route and scenario. The real app remains the journey interface.

Independent actual Chromium execution covered **18 combinations**: system light/dark ×
automatic/manual light/manual dark × 393×852, 320×568 and 852×393. All passed on the final
00:00 UTC built-page snapshot. Direction, route and Start are three deliberate setup actions.
Start is directly reachable without scrolling, activates coordinated sources, pauses at checkpoint one
and collapses configuration. Technical controls remain available in Advanced. Timeline inspection and
opening Advanced preserve the clock, checkpoint, configuration and session. Stop restores real sources.

The dock measures 125–129 px in these viewports, reserves its measured height, has no horizontal overflow,
and uses at least 44 px touch targets and 4.5:1 button text contrast. An additional real-browser probe
confirmed the actual app hero is visible at the top after Start, while configuration is collapsed.

Findings fixed and retested: initially undersized badge/timeline targets; a setup footer that could require
extra scrolling; and a late Start completion that closed controls after the user reopened them.

Evidence: `/tmp/cartref-ux-stage1-review.log`, `/tmp/cartref-ux-final-layout.log`,
`/tmp/cartref-ux-report-browser.log`; retained open-without-activation and active-draft/mode tests.

## Stage 2 — expected versus actual assertions

Assertions inspect outputs recorded by normal app rendering and inference. They do not invoke a second,
mutating inference pass or assign expected identities to the application. Checkpoint arrival alone is
never proof of correctness. Unsupported/manual/source-independent observations are INCONCLUSIVE.
Explicit user planning views and genuinely unconfirmed alighting remain distinguishable from a defect.
Earlier failures remain visible, with later observations retained as revisions.

Findings fixed or referred back to the implementation lead:

1. GPS-only verification stayed permanently pending because its device clock necessarily advanced during
   asynchronous refresh. It now guards elapsed/index/session identity; the retained actual-page test passes.
2. Return King's Cross expected copy incorrectly said Farringdon. Corrected with a regression.
3. Platform-change assertions applied to unrelated alighting cards. Restricted to relevant origin boards.
4. A user-confirmed wrong service with the correct conflict warning was a false identification failure.
   Identity becomes inconclusive under that explicit override; missing conflict warnings still fail.
5. An explicit Arrive-by/Leave-around screen must not be judged as an unintended live-card regression.
   The observation includes requested plan mode, while forced wrong views remain detectable.
6. Final audit found recovery assertions required `app.railSource`, absent from the assembled observation.
   The readonly field is now wired. An independent real guided outage/recovery probe observes both outage
   and recovery PASS, including the actual Darwin source; a retained application regression also passes.

A genuine production defect was found by the new assertions: Thameslink passing St Pancras prematurely
became a King's Cross arrival. The scenario and assertion were preserved. The generic core fix uses normal
inferred service data, profile geometry, ordered calling points and fresh train-speed evidence. It assigns
neither identity nor certainty. Exact service IDs and ordered prefixes constrain multi-board extensions;
divergent branches are rejected. A known/selected Underground ride vetoes continuation. The short return
origin gap requires a recent observed departure, accurate fresh movement outside every hub uncertainty
radius and the departed hub's profile corridor. Unknown identity cannot force passage inside another hub.

The reviewer inspected the pure helper and page wiring and independently executed the positive actual-app
through-St-Pancras regression plus the production-helper reversion negative control. Both pass. One first
positive run hit a 6-second test helper timeout while the 18-layout browser workload ran concurrently;
it passed unchanged when run alone. No test timeout or assertion was weakened.

## Stage 3 — diagnostics, reports and isolation

Pure reporter and assembled UI review verified strict allowlists, immutable exported snapshots, sticky
failures/revisions, and rejection of stale-session or finished-report observations. A strict field list
excludes raw settings, coordinates, request URLs and errors. Known private values are redacted from actual
app text and typed evidence. Original, temporary and rotated credentials remain private across Restart
and Stop. Clipboard export requires an explicit user action.

Findings fixed and retested:

- Privacy knowledge originally missed credentials changed through actual Settings during an active run.
  A real-page rotating-key → Restart → Stop → Copy regression now passes, including the original baseline
  credential while the temporary credential is active.
- Session publishing originally omitted stored revisions/sanitized actual-display evidence. It now keeps
  the complete stored row, so the user can compare actual card wording with assertions and inspect history.
- Redaction incorrectly changed the trusted report format discriminator. Its fixed schema value is preserved.
- After Stop, the retained timeline incorrectly labelled reached historical checkpoints as upcoming.
  It now uses the stopped report's configuration, start time and actual reached records.
- The compact playback label now includes asynchronous stepping, so it correctly offers Pause during Next.

Independent real Chromium exercised clipboard denial and selectable JSON fallback, actual browser JSON
download, and retained results after Stop. Downloaded and copied reports match; fixture secrets and precise
personal coordinates are absent. No page errors occurred. Retained race tests prove Stop during initial
refresh cannot reactivate a late Start, and an older verification completion cannot publish into a restarted
run, clear a newer pending flag or revise a finished report.

## Independent retained tests and mutation evidence

`tests/simulator-ux-review.test.mjs` contains **11 tests**. The first nine passed together on the integrated
built source (21.69 s); the added destination-uncertainty boundary test passed separately. Final committed CI
must execute all eleven together. The final Follow integration regression also passed separately (2.71 s).
Tests use actual generated app handlers, DOM and normal inference where
app behavior is under review; pure async/report tests isolate specific adverse contracts.

| Deliberate defect | Independent evidence that detects it | Result |
| --- | --- | --- |
| Production `whichTrain` always reports no match | Identical real GPS/Darwin playback still establishes rail travel; actual card reports no match; rail identity assertion and visible badge become FAIL | Detected in retained isolated-HTML test; unmodified app passes |
| Every verifier assertion forced PASS | The same production train-identification defect can no longer produce expected FAIL | Retained test fails with PASS versus FAIL |
| Remove stale session/request verification guard | Resolve pre-Restart provider job before the current job | Retained race test fails because stale work publishes/clears current pending state |
| Disable report privacy refresh | Rotate actual Settings credential, Stop, Copy | Retained privacy test fails because the temporary credential is exported |
| Revert through-station production helper | Normal Thameslink GPS still passes St Pancras | Actual app prematurely leaves rail state; rail-progress assertion and visible badge become FAIL |
| Remove destination uncertainty guard | GPS centre 419.7 m from Farringdon with ±45 m accuracy overlaps its 445 m confidence radius | Independent boundary test fails: continuation true versus required false |
| Remove clearing of saved Follow/planning metadata | Actual real Follow selection and Arrive-by metadata precede Start | Independent retained Follow isolation test fails because the real followed journey survives into simulation |

All mutations use isolated HTML strings or temporary copied workspaces. Shared production source is restored
and contains no mutation. A mutation counts only when the intended assertion fails, not a setup/import error.

Evidence: `/tmp/cartref-ux-review-final-nine.log`, `/tmp/cartref-ux-review-destination-boundary.log`,
`/tmp/cartref-ux-always-pass-mutant.log`, `/tmp/cartref-ux-stale-guard-mutant.log`,
`/tmp/cartref-ux-privacy-mutant.log`, `/tmp/cartref-ux-review-through-station-retry.log`,
`/tmp/cartref-ux-review-through-station.log`, `/tmp/cartref-ux-destination-mutant.log`.

## Final current-main integration review

**Approved for `a23e31d` and the final scoped office-dwell correction**, with final committed CI still
required after the newly retained regression. No significant independent review findings remain open.
The reviewer re-read the merged Follow story, production integration and simulator transaction, and ran
focused tests rather than repeating the heavy browser suite during the release lead's full test run.

- `saved.follow`, `viewAt` and `viewKey` are cleared when entering/restarting simulation; the complete original
  settings/journey snapshot restores them on Stop. The user's Follow feature preference remains enabled.
- Source invalidation clears `followable` and `tubeEta`. A pending `refreshTubeEta` result checks its source
  epoch after parsing, and the existing response-body guard rejects stale responses across source changes.
- Actual Follow controls remain usable in the synthetic journey. Repeated `readSimulationActual()` calls
  read the already rendered Follow result without changing saved state, train lock or rendered model.
- The independent retained actual-page regression selects a real Follow route and Arrive-by view, seeds
  stale cache sentinels, starts simulation, uses the genuine Follow control, restarts and stops. It verifies
  exact original Follow/planning metadata restoration, no synthetic storage writes, cache clearing and
  observational purity. Baseline PASS; removing metadata clearing in an isolated built page causes the
  same test to fail on the unintended real Follow state. No shared source was mutated.
- The office-dwell oracle now accepts the legitimate new homeward plan after direction turns home, while
  the initial office arrival still requires arrival acknowledgement. Independently executed focused
  positive and negative cases pass (2/2), including stale Underground/rail state and insufficient evidence.
  A subsequent strengthened full-route check exposed incidental future itinerary text, `36 min on the train`,
  incorrectly matching the stale-ride phrase check. The independently reviewed correction checks the primary
  heading instead. Its positive test uses the actual homeward itinerary text; explicit stale On the train and
  On the tube headings still fail even with a spoofed planning view and no active ride. The initial arrival
  requirement, actual view, direction, active ride and rail-state guards remain unchanged. Focused final
  oracle cases pass (2/2). All four actual normal journeys were rerun against the final built oracle:
  **4/4 PASS, zero runtime assertion FAILs**, 51.21 s. The reviewer inspected the strengthened retained
  test, which requires zero actual failures across every checkpoint, rather than merely correct totals.

Evidence: `/tmp/cartref-ux-review-follow-regression.log`, `/tmp/cartref-ux-follow-mutation.log`,
`/tmp/cartref-ux-review-follow-oracles.log`, `/tmp/cartref-ux-review-follow-oracles-final.log`,
`/tmp/cartref-ux-normal-runtime-dwell-fixed.log`, and `/tmp/cartref-follow-review.log`.

## Remaining limits and release gate

Synthetic schedules and corridor coordinates are deterministic fixtures, not live timetable truth. Runtime
INCONCLUSIVE is intentional where actual evidence cannot establish a decision, especially unconfirmed
boarding/alighting and independent source modes. Tests cover browser geolocation APIs and mobile Chromium
layouts; they do not establish Safari permission/background delivery on a physical iPhone. The existing
normal operation, source isolation, speeds, accuracy, provider ambiguity and recovery suites remain required.

All significant findings above have been fixed and retested; independent technical/UX review is approved.
The independent reviewer also inspected the final Advanced diagnostics allowlist: provider/view/flags,
service/vehicle identifiers, generation and request counts, with no credentials or coordinates.
Outage evidence: `/tmp/cartref-ux-review-outage.log` and `/tmp/cartref-ux-wiring-regressions.log`.
The release lead must record the reviewed commit, full committed-code local CI, required branch checks,
current green main, and exact merged-commit CI/deployment. Independent review does not replace those gates.

## Reviewed implementation CI evidence

The release lead pinned the approved source and final oracle correction as `c965e04`. Its [GitHub push check](https://github.com/srapley-spec/cartref-commute/actions/runs/41149135000) and [PR check](https://github.com/srapley-spec/cartref-commute/actions/runs/41149141080) both passed: **499/499 tests**, including all eleven independent regressions together. This records the executed follow-up to the focused review, not a replacement for independent review. Exact fresh-copy local CI and merged-commit/deployment evidence belongs to [PR #37](https://github.com/srapley-spec/cartref-commute/pull/37), so the report can link stable evidence without a self-referential commit hash.

## Additional independent review after Signal main integration

Reviewer: `/root/signal_integration_review`, separate from both the simulator implementation and the
Signal implementation. The reviewer wrote only retained review tests and this report, with no feature fixes.
Reviewed integration: released main `4ee24c7` (PR #36) plus the resolved simulator candidate built
31 October at **00:48 UTC**. **Technical and assertion review approved; no significant findings remain open.**
The release lead must still record final committed-code CI, exact branch/merged checks and the final mobile rerun.

The new main was read against its architecture, Signal/presentation/Follow stories and reconciliation record.
It replaces legacy `saved.follow` with validated `saved.followRoute`, uses `viewOverride`/`planInputs`, moves
chosen-route output to the separate actual `followPanel`, and adds transport/source state. The integration:

- Clears/restores the full real saved Follow/planning snapshot; clears simulated selections on Restart;
  clears old choice maps, presentation, followed-route progress and provider/vehicle caches at source boundaries.
  Incoming Follow transport still checks source epoch and route/vehicle/target identity after asynchronous work.
- Records already-computed fit, ride and Follow results during normal rendering. Repeated observational reads
  preserve saved state, train locks, rendered output and Follow updates byte-for-byte.
- Includes the real Follow panel in sanitized expected/actual evidence without changing the ordinary main-card
  observation or injecting a chosen identity into the engine. Following is based on the actual visible panel.
- Keeps genuine explicit app Planner/Live choices INCONCLUSIVE where the ordinary checkpoint view expectation
  is inapplicable. Actual rail tracking/identity remains intact, and Return to Auto restores the live assertion.
- Checks a visible followed service's on-train phase at known rail checkpoints even when the main app correctly
  shows the richer ordinary On the train card. This closes a detector gap found during review: checking Follow
  phase only when the main view was `following` could miss a broken follower under an otherwise correct rail card.
- Excludes simulator technical inputs from the real app's interaction-deferral policy. Otherwise leaving the
  Advanced speed selector focused made genuine rail movement retain an old planning view indefinitely. Real
  app Settings/date inputs, service choices and expanded notices retain the existing deferral policy.
- Treats a deferred presentation as INCONCLUSIVE only when both the actual pending result and genuine
  app interaction are observed. A pending flag without an actual interaction does not exempt a wrong automatic
  view from its normal FAIL assertion.

### Retained execution evidence

The first ten `tests/simulator-ux-review.test.mjs` cases are unchanged (prefix compared with `3d4c225`). Its
last Follow-isolation case now uses the actual current-main controls and fields while retaining its original
snapshot, source-cache, Restart, persistence and read-only requirements. It passes (**1/1**, 3.81s).

`tests/simulator-signal-review.test.mjs` adds four actual-output regressions:

1. Signal enabled, real train inferred, explicit app Planner pin → INCONCLUSIVE with continued tracking,
   unchanged identity, no simulator mode side effect, and genuine Return to Auto → rail identity PASS.
2. The genuine app Follow control selects synthetic Thameslink; its normal inferred train continues through
   St Pancras, with runtime identity/phase/progress PASS, an actual separate Follow panel in report evidence,
   no fixture credential in export and no extra inference from observation.
3. Follow panel text and every retained revision use the diagnostic privacy allowlist, and earlier failures
   remain visible after recovery.
4. A focused Advanced speed selector cannot defer the actual app's live transition: sequential normal
   GPS/feed playback reaches Stevenage, the selector stays focused, and the real app still shows On the train,
   without a pending presentation or failed identity assertion. The same case then restarts, holds genuine
   Settings editing open during movement, requires actual pending + INCONCLUSIVE, and closes editing to require
   normal On the train / identity PASS again.

The first three passed together (**3/3**, 18.37s). The strengthened Follow phase case passed separately
(**1/1**, 11.98s); the final paired technical-focus/genuine-editing regression passed separately
(**1/1**, 11.88s total).
The final committed suite must run all four together. Evidence:
`/tmp/cartref-signal-review-actual-final.log`, `/tmp/cartref-signal-review-follow-final.log`,
`/tmp/cartref-signal-review-isolation.log`, `/tmp/cartref-signal-review-focus.log`,
`/tmp/cartref-signal-review-focus-editing.log`.

### Additional independent adverse probes

| Temporary defect | Intended detector | Observed result |
| --- | --- | --- |
| Remove the new saved Follow/planning clear entries from both entry/reset guards | Retained isolation test after an actual real Follow and Arrive-by selection | FAIL: real `followRoute` survives instead of being absent |
| Disable the choice Map's `clear` method with one line | Retained stale-choice sentinel assertion after Start | FAIL: stale option remains available |
| Change production `followedObservation`'s inferred on-train phase to before-train with one line | Retained actual followed-Thameslink case at Stevenage | The real runtime `follow-phase` assertion and visible badge both become **FAIL**; the positive regression fails `FAIL != PASS` |
| Return unsanitized strings from the shared report sanitizer with one line | Retained Follow-panel/revision privacy assertion | FAIL: private credential appears in exported evidence |
| Remove only the simulator-input exclusion from interaction deferral with one line | Retained focused speed-selector playback regression | FAIL: actual app remains `plan-now` instead of `on-train` |
| Weaken the verification deferral guard to trust pending without actual interaction | Explicit wrong-auto-view counterexample in the verifier suite | FAIL: INCONCLUSIVE would hide a view defect that must be FAIL |

All probes used copied generated pages/modules in temporary directories; shared production source was never
mutated. A preliminary probe bypassing only the Follow field's first sanitization **survived safely**: export
sanitization independently removed the sensitive text. This is evidence of the second guard, not a claimed
mutation kill. The shared-sanitizer defect above produced the intended assertion failure. Initial mutation
target-count/setup errors were corrected and were not counted as detected defects.

Evidence: `/tmp/cartref-signal-review-mutant.log`, `/tmp/cartref-signal-review-choices-mutant.log`,
`/tmp/cartref-signal-review-phase-mutant.log`, `/tmp/cartref-signal-review-privacy-mutant.log`,
`/tmp/cartref-signal-review-privacy-disabled-mutant.log`, `/tmp/cartref-signal-review-focus-mutant.log`,
`/tmp/cartref-signal-review-pending-mutant.log`.

The earlier independent UX, source-isolation and synthetic-consistency findings remain covered. This review
adds current-main compatibility evidence; it does not replace final all-suite CI or the release lead's actual
36-layout/8-journey browser run. Physical iPhone Safari/VoiceOver/background delivery remains a hardware limit.

## Final committed evidence addendum

The reviewer independently endorsed exact commit `5674e2fbbea23cb996c32a2de4dd15db929f5d84` after an additional actual Chromium check on Signal:393×852 and852×393, light/dark; genuine three-action return/Farringdon Start; automatically collapsed controls; real app headline visible;44px controls; minimum contrast10.24:1;125px dock with140px reserved space; no overflow/overlap/errors/live calls during simulation; frozen clock; Stop restored real transport calls. The reviewer visually inspected light/dark screenshots. Evidence: `/tmp/cartref-signal-independent-mobile.log`, `/tmp/cartref-signal-review-mobile-light.png`, `/tmp/cartref-signal-review-mobile-dark.png`. No feature source was written by that reviewer.

The integrated source's [PR Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41152458880) and [push Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41152454687) both pass **663/663**, including all independent regressions. Final clean-copy local CI and exact merged/deployment evidence remain recorded in [release PR #37](https://github.com/srapley-spec/cartref-commute/pull/37); this addendum records observed evidence without implying hardware Safari acceptance.

## Additional independent review after train-stop main integration

Reviewer: `/root/signal_integration_review`, still independent of feature implementation. Reviewed incoming
main `cdf6ecd` (GPS train-stop watch and connection timing) against the updated connections story, with the
resolved simulator candidate built **31 October 01:16 UTC**. **Technical review approved; no significant
findings remain open.** Final committed CI, current-main/branch checks and deployment remain release gates.

### Findings and fixes reviewed

1. The old synthetic segment logic switched to walking speed between the last rail checkpoint and alighting.
   It therefore supplied no recent train-speed reading when the genuine engine tried to detect the stop.
   Rail movement now lasts until actual alighting; the checkpoint emits stationary speed. Conversely, the old
   next-checkpoint-only logic reported train speed during a stationary wait before scheduled boarding. A train
   segment now starts with the actual boarding phase, and identical-coordinate waits emit zero speed.
2. Stop restored saved visit memory and then cleared its runtime counterpart. Resuming native GPS at the same
   real station overwrote the original saved stop with a new unstopped visit. Transient reset now precedes the
   snapshot restoration; only recent, known-hub visits are rehydrated using device time. Invalid/future stop
   timestamps are excluded from runtime. Settings disabling both sources repeats restoration after its final
   source invalidation. Simulated speed-watch history is cleared, never carried into real observations.
3. The read-only runtime oracle now observes the actual station stop and parsed service arrival. At outbound
   London alighting, both must match the shared virtual arrival; a duplicate Thameslink service must use the
   actual destination board, not its earlier St Pancras call. Explicit missing stop evidence fails; a genuinely
   absent observation field is INCONCLUSIVE. Scenario-specific later/cancelled/delayed service selection remains
   in the existing oracle, not injected into production inference.
4. Accuracy gating follows the actual fix, independently of the scenario label. A Normal scenario with the
   Advanced poor-accuracy profile is INCONCLUSIVE for unsupported arrival inference, while a confident station
   claim from a fix worse than 250m still fails. Independent boundary observations confirmed Normal + 650m →
   INCONCLUSIVE, invented coarse station → FAIL, and precise recovery → PASS. Precise normal assertions remain.

The core watch receives observation timestamps from the normal position handler and checks chronological
recent movement; simulation supplies its existing scoped clock, without globally replacing browser time.
The incoming `stopWatch` reset is preserved. The restoration helper uses device time and original saved visit
memory, with no synthetic coordinates, train identity or expected decisions written into the engine.

### Retained actual-application tests

`tests/simulator-stop-review.test.mjs` contains **five cases**, all passed together (**5/5**, 44.69s):

- Great Northern and Thameslink, outbound and return, traverse normal sequential GPS/provider playback.
  Each verifies stationary waiting before boarding, a fresh genuine train-speed observation before the stop,
  the actual watch's stopped time equal to parsed Darwin arrival and virtual clock, indefinite-pause state
  remaining unchanged in the observation interval, and Restart clearing prior speed/stop history.
- Outbound King's Cross and Farringdon verify the actual hub visit and the visible runtime stop/provider-clock
  assertions PASS. Returning Letchworth verifies that its stop is not attached to an old London hub visit.
- A real saved King's Cross stop survives both the dock Stop button and actual Settings disabling both sources,
  including resumed native no-speed station fixes. Runtime, saved state and localStorage keep the original stop;
  synthetic speed history does not escape. The paired exit-path case also passed separately (2.22s total).

These tests select ordinary real Underground controls where required and never prescribe a train, stop,
arrival or route decision to production state. Evidence: `/tmp/cartref-stop-review-final.log`,
`/tmp/cartref-stop-review-restore.log`, `/tmp/cartref-stop-review-accuracy-gate.log`.

### Independent temporary defects

| Defect in isolated generated page | Intended failure observed |
| --- | --- |
| Restore the old next-checkpoint-only train-speed condition | Stationary predeparture waiting fabricates a fast reading; retained test fails timestamp versus null |
| Disable rail speed only on the final alighting segment | Actual stop is absent; the runtime `station-stop-clock` assertion and visible badge both show FAIL, and the retained positive test fails null versus arrival time |
| Restore the old Stop ordering (restore snapshot, then clear runtime visits) | Resumed native GPS loses the original real stopped time; retained dock restoration assertion fails undefined versus the original timestamp |

All three fail for the intended assertion, not setup/import errors; no shared source was mutated. The normal
candidate passes the corresponding retained cases. Evidence: `/tmp/cartref-stop-review-old-speed-final-mutant.log`,
`/tmp/cartref-stop-review-arrival-final-mutant.log`, `/tmp/cartref-stop-review-restore-final-mutant.log`.

The previous Signal mobile review and source/clock/privacy findings remain applicable. The release lead reruns
all normal journeys, mobile layouts and the complete committed suite on the final integrated source. Real
under-roof iPhone speed availability remains the explicitly documented hardware limitation from the main story.

## Final source commit endorsement and full-suite result

The independent reviewer explicitly endorsed exact source commit `11f369ba9096f9cf7e14016c8898505d5b01b9a8`. The four key committed implementation files match the reviewed working snapshot byte for byte; comparison of the committed generated index found only build time and the already-reviewed accuracy-gate correction. No feature source was written by that reviewer and no significant findings remain open.

Both final-source [PR Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41155133955) and [push Tests](https://github.com/srapley-spec/cartref-commute/actions/runs/41155128856) pass **678/678**, with no skipped tests. This includes all prior and new independent regressions together. Exact final fresh-copy local CI, merged commit, GitHub Tests, Pages and published-browser results are recorded in [PR #37](https://github.com/srapley-spec/cartref-commute/pull/37).

## Final independent isolation review: planning inputs and alternative origins

The final saved-state audit found that the persisted snapshot did not cover the current planning form or
runtime leisure origin. The reviewer reproduced the defect on the previously tested `11f369b` build through
actual controls, before building the fix: real Arrive-by/Leave-around for 5 November 11:23 and origin Aldgate,
then a simulated 8 November 14:47 / Science Museum question, then Stop. Both dock Stop and Settings disabling
both sources restored saved preferences but retained the simulated DOM date/time, origin and destination.
The actual restored By question used the wrong date; the restored At question remained unloaded.

The candidate built **31 October 01:43 UTC** adds a session-only snapshot of the four date/time/origin/destination
input values and runtime origin, restoring them before normal rendering/refresh. It retains original location
strings in the existing private-value union, without exporting the input snapshot. Native direction changes
now dispatch the existing `planView()` (By or At), so Leave-around is replanned after real GPS resumes. This
preserves the existing By path and does not change journey inference or the transport providers.

**Independent review approved.** The unchanged four-path actual-app regression passed after the fix (6.47s).
The strengthened version also preserves an unsubmitted private origin draft distinct from the active runtime
origin, and proves diagnostic text containing that draft remains redacted both during simulation and after
restoration (**1/1 case, four control-path combinations**, 11.26s while two review processes ran concurrently).
This is the sixth retained case in `tests/simulator-stop-review.test.mjs`; no earlier case was removed or weakened.

Disabling only the new input-restoration branch in an isolated generated page makes the retained case fail
for the intended wrong DOM/runtime/question values on all four paths. The normal candidate restores both
actual `state.by.T` and `state.at.T`, including after native GPS resumes. The reviewer wrote no feature source.

Evidence: `/tmp/cartref-input-isolation-review-baseline.log`, `/tmp/cartref-input-isolation-review-fixed.log`,
`/tmp/cartref-input-isolation-review-private-fixed.log`, `/tmp/cartref-input-isolation-review-mutant.log`.
No further significant findings remain open. Final committed-code CI and exact GitHub release/deployment
checks remain required; focused review is not a substitute for those gates.
