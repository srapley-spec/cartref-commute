# Independent Signal and Follow a route review

**Final decision: APPROVED, subject to the committed-code local CI and GitHub-first release gates.**
Eighty deliberate breakages are caught; eleven meaningful coverage gaps were closed. The final sections record
latest-main compatibility, the context guard, and independent verification of pinned TfL tracking.

Reviewer: independent agent that did not implement production code. Initial implementation reviewed: `75ad60c`.
Review performed in detached worktrees; intentional breakages were never applied to the implementation checkout.

## Initial result

**Changes required before release.** The existing focused baseline (follow/view engine and built-page Signal/follow tests) passed. Independent probes nevertheless found user-visible failures and mutation survivors. These are not waived as flakes.

### Behavioral findings

1. A future homeward route selected in manual Plan while already at the saved home immediately became `arrived`. Initial destination presence is not evidence that the selected journey has happened.
2. Selecting Follow and then Live at the origin showed “No active journey yet” beside the followed-route panel. A chosen route must count as an active journey even before departure.
3. With the phone on the rail line after the selected departure but no matching train identity, the follower declared the train missed. Ambiguous onboard identity must remain uncertain rather than prove that the train was missed.
4. An onboard follower could offer a later train departing back at the origin. Replacement options must be reachable from the current journey stage, rather than merely future departures in a station feed.

Regression tests for all four were supplied in `tests/independent-signal-review.test.mjs`.

### Mutation testing

Each mutation was applied alone, the production page/engine rebuilt, and the corresponding tests run. Build failures were not counted as catches.

Initial round: **22 deliberate mutations, 17 caught, 5 meaningful survivors, zero build failures.**

| ID | Deliberate breakage | Initial result |
| --- | --- | --- |
| F01 | Better alternative accepted from four minutes sooner | Caught |
| F02 | Exactly five minutes sooner rejected | Caught |
| F03 | Fresh GPS-dependent access route changes saved arrival | Caught |
| F04 | Selected boarding hub ignored when matching | Caught |
| F05 | Different service IDs treated as the same service | Caught |
| F06 | Stale matching service used to change followed state | Survived; regression added |
| F07 | Journey phase regresses after boarding | Caught |
| F08 | Boarded journey declared missed | Caught |
| F09 | Acknowledged event reappears every refresh | Caught |
| F10 | Offered alternative replaces the chosen option snapshot | Survived; regression added |
| F11 | Cancellation ignored | Caught |
| F12 | Location loss proves a missed train | Caught |
| V01 | View override lasts 21 minutes | Caught |
| V02 | Override retained at exactly 20 minutes | Caught |
| V03 | Changed situation does not expire override | Caught |
| V04 | Interaction deferral removed | Caught |
| V05 | Live without a journey is no longer explicit | Caught |
| P01 | Follow controls visible with feature off | Caught |
| P02 | Pinning a view clears the Tube choice | Caught |
| P03 | Follow selection not immediately persisted | Survived; regression added |
| P04 | Real followed route leaks into feed-only opt-in before Start | Survived; regression added |
| P05 | Followed cancellation hidden while Plan pinned | Survived; regression added |

The five survivor regressions are separate from source fixes: each passes on the unmutated initial implementation, then fails when its targeted breakage is reintroduced. This distinguishes an actual test improvement from unrelated failures. Machine-readable initial and recheck results are retained by the reviewer; all five were rechecked successfully: **baseline passed, targeted mutant failed**. After these test additions, **all 22 breakages are caught**. The feed-only test waits for the normal post-Stop refresh before closing its browser context, so asynchronous teardown failures are not counted as mutation evidence.

## Architecture and testing standards

- Pure TypeScript core owns follow state, matching, reasons, stable arrival, alternatives, and view expiry. DOM/network/clock remain shell inputs.
- The original journey snapshot is retained; rail arrival changes use the original onward tail rather than a newly reconstructed GPS-dependent route.
- Feature-off behavior is protected by existing goldens and explicit page tests. Both designs share one controller, engine, providers and persisted route.
- Source-session isolation covers followed routes and view overrides; virtual-clock state must not write over the real saved journey.
- No new live-provider endpoint, credential, location watch, or background tracking promise is introduced.
- Saved-state and build changes require GitHub green before merge; local CI alone is insufficient under repository rules.
- Browser automation is supplementary to jsdom tests. Real iPhone Safari, VoiceOver and live-provider reliability cannot be certified by these checks.

### Additional integration checks required

- Wire existing Tube reachability into route recovery so the approach is not continually re-timed from the office after boarding a Tube.
- Use arrival status at the rail destination while onboard, and do not retroactively cancel/change the rail leg after it has finished.
- Retain headline/identity/progress/onward/line order in actual live-view DOM; the original presentation story explicitly documented a missing DOM order test.
- Avoid labelling a retained failed-live board fresh merely because another board loaded at the same time. The original global `boardsAt` timestamp is not per-route freshness evidence.

## Corrected checkpoint review: `8fe80ee`

Independent focused baseline: **110 tests passed, zero failures** (follow/view/presentation core, built-page follow/Signal, independent whole-journey cases, and actual live DOM order).

The corrected implementation resolves the initial false completion, no-active-followed-route, onboard uncertainty, unreachable onboard alternatives, stale selected-board, platform/expected-time projection, completed-route lifecycle and canonical live ordering findings. No source code was written by the independent reviewer; reviewer-authored regression tests were incorporated by the implementer.

Second mutation round: **16 deliberate breakages, 15 caught initially, one meaningful dispatch test gap**. The gap was closed with a real departed-train fixture: changing the engine's priority and invoking the actual page render must change the actual identity/headline order. The new regression passes on unmodified code and fails if the page's canonical dispatcher is removed. **All 16 second-round breakages are now caught. Combined rounds: 38/38 caught after six test gaps were closed.**

| ID | Deliberate breakage | Final result |
| --- | --- | --- |
| C01 | Re-plan original office walk despite active approach connection | Caught |
| C02 | Unknown connection readiness treated as known | Caught |
| C03 | Recovery route keeps old office steps instead of current connection | Caught |
| C04 | Completed rail cancellation changes onward journey | Caught |
| C05 | Fresh onward GPS/vehicle report blocked by stale rail board | Caught |
| C06 | Fresh Service Details blocked by stale rail board | Caught |
| C07 | Onboard status uses departure rather than arrival delay | Caught |
| C08 | Final-walk ETA change moves completed rail history | Caught |
| C09 | Journey steps retain an old platform | Caught |
| C10 | An unchanged displayed arrival is repeatedly announced | Caught |
| J01 | Completed journey keeps Auto/Live pinned to old following state | Caught |
| J02 | Failed selected board treated fresh when sibling succeeds | Caught |
| J03 | Ambiguous onboard identity declares selected train missed | Caught |
| J04 | Initial presence at destination completes future route | Caught |
| U01 | Actual page dispatch ignores engine block order | Caught after regression added |
| U02 | Canonical DOM sorter ignores model order | Caught |

The live block adapter consumes the engine's ordering table, retains unrecognised content, and preserves node identity/listeners/focus/disclosure. Tests cover actual train, station, Tube, final-walk and London templates. Engine timing arithmetic remains in core; shell adapts existing profile and provider observations.

Two further probes identified shell direction/mode changes under denied GPS retaining the old pin, and a past active connection still claiming a departed train catchable. The first has a reviewer-authored integration regression; the second was reported to the engine implementer. Final approval remains pending these fixes and review of the latest concurrently-developed Follow-a-route improvements found on `origin/follow-a-route` (`d330e95`).

This is **not release approval** until the final checkpoint section below records those outcomes.

## Latest-route preservation checkpoint: `4749540` / `f793867`

Independent focused baseline at `4749540`: **103 tests passed**. An expanded final source baseline at `f793867` passed **144 tests**, with typecheck green. The Tube/adapter files were subsequently rerun after their coverage-only additions: **14/14 passed**.

Third mutation round covered generic Tube direction, vehicle/line/station identity, cache/provider ages, interchange allowances, recovery notices, run/car progress, same-train calls, boarding correction, boarding-call recovery, departure grace, ETA stability, malformed saved alternatives, feature-off requests, concurrent fetch deduplication and the normal refresh-to-live-connection path. **22 breakages: 19 caught initially, three test gaps closed and independently rechecked.**

The three new regressions distinguish cache expiry from provider-clock age and exercise wrong explicit station / stale provider timestamps through the real network adapter. The network cases include a valid-response positive control, so an unrelated fetch failure cannot satisfy rejection assertions. Each regression passes unmodified source and fails for its intended mutation.

A direct source-precedence probe then found that a fresh selected cancellation could be erased by a recent arrival prediction. `f793867` preserves the cancellation while allowing stale board data to yield to fresh Service Details. Reverting that exact guard fails the independent cancellation regression; the preexisting stale-board/fresh-report case remains green.

**Cumulative mutation result: 61/61 deliberate breakages caught after nine test gaps were closed.** No build failure or asynchronous teardown failure is counted as a catch. See [machine-readable mutation evidence](signal-review-mutations.json).

The architectural review also required caller-supplied Tube direction, bounded validation of saved alternate-call snapshots, explicit recovery/same-train boarding choices, full source-session context checks, and retention of provider timestamp/station evidence through normalization. These are implemented and tested.

## Final main merge and compatibility review

Independent merged source baseline at `7e10208`: **176/176 focused tests passed**, and typecheck passed. The seven released engine scenario groups and nine released whole-page scenario groups are preserved in dedicated regression files; the reviewer inspected the original tests against their translations. [Main reconciliation](signal-main-reconciliation.md) documents the mapping and intentional corrections to old accidental behavior.

Saved state review covers `settings.follow` opt-in, explicit new opt-out precedence, deferred conversion until a real matching service/boarding/day loads, unchanged legacy storage, stable planned/expected arrival and onward allowance, old acknowledgements, previously declined services absent from the first load, pending-route Stop, and planning-pin lifetime/situation/deadline. Migration does not infer boarding from time. Old missing detailed onward times are represented as unknown instead of inventing a historical itinerary.

The fourth mutation round deliberately broke migration day/hub identity, saved expected arrival, absent declines, historical chronology, acknowledgements, the released setting alias, explicit opt-out, retained legacy records, Stop, original pin age, changed-station expiry, simulator isolation, arrival-notice supersession/reannouncement, and inert selected-row controls. **16 breakages: 14 caught initially, two test gaps closed and rechecked.** The two new regressions use the same train from the same origin but different destination hubs, and feed-only opt-in before simulator playback. Both pass unchanged source and fail the intended mutations.

The reviewer also found that the inert “Following” row tag needed the journey's direction/mode as well as rail service identity. Otherwise a Commute choice could prevent following that rail service as a different Leisure journey. The selected-row production change after `7e10208` adds those two context comparisons. Its permanent UI regression follows a Commute train, changes to Leisure, selects the same service and checks the new saved mode. Removing the exact context guard fails the regression. The migration/context regression files passed **30/30** after the change.

**Final independent result: APPROVED for release, subject to the repository's final local CI and GitHub-first gates.** No outstanding source, architecture or test-quality blocker remains in the reviewed implementation. Approval applies to `7e10208` plus the reviewed selected-row direction/mode guard, pinned-timetable tracking fix described below, and their coverage-only additions. The reviewed `src/journey-ui.js` SHA-256 is recorded in the machine-readable evidence; documentation-only release updates do not alter this source approval.

**Cumulative mutation evidence: 80/80 deliberate breakages caught, after eleven meaningful test gaps were closed across the review rounds and narrow source-fix checks.** Every survivor recheck first establishes a green baseline, then fails on the intended breakage; build and teardown failures are excluded. The independent reviewer authored regression tests and review evidence, not production source.

Architectural standards are maintained: one pure engine and one shared controller; injected clock/provider/profile observations; no duplicated routing or legacy planner; exact source-session isolation; semantic engine block ordering consumed by the real DOM; default-off Signal with existing Panda goldens retained; explicit persisted-state validation and compatibility. The separately released Follow improvements and newer simulator controls are preserved.

This review does not claim live-provider reliability, actual iPhone Safari/VoiceOver, or closed-Safari/background behavior. The app's existing inference limitations and recorded Tube-evidence boundaries remain documented. Automated browser verification and full final local/GitHub checks are recorded by the integrator in [Signal testing](signal-testing.md).

## Pinned timetable tracking follow-up

The final provider-path audit found that the TfL timetable refresh planner suppressed current-train loading whenever Arrive by/Leave around was selected, even for a followed journey or a validated legacy selection waiting to restore. Earlier RDM/example-provider cases did not exercise this seam. The narrow fix adds a caller-supplied optional `following` fact to the pure refresh planner and supplies validated active/pending following from the shell. Only the planning-question suppression changes: existing location gates, five-minute timetable reuse and feature-off behavior remain intact.

Independent review of the exact change passed typecheck and **55/55** focused engine, refresh and migration tests. Two independent breakages were then made separately: removing the engine's following condition makes the core refresh assertion fail (`none` instead of `timetable`); removing the page's tracking input makes the actual TfL saved-selection restoration fail because no current boards load. Each targeted test passes first on unchanged source and fails only after the intended breakage. Both mutations are caught, without build/teardown failures.

The reviewer approves this narrow provider-path correction as part of the final source approval above. Source hashes for the shared journey controller, refresh planner and page wiring are included in the machine-readable evidence. Final release still requires the repository's final committed-code local CI and GitHub-first checks.
