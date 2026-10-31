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
