# Independent simulator review

Reviewers: separate `/root/review` and final `/root/final_review` agents; neither wrote the implementation.
Status: **independent source review approved for `d296c1c` (unchanged source in `0491dae`), conditional on local and GitHub CI gates**.

## Scope and findings

Read the architecture, repository release rules, simulator stories, coverage matrix, controller,
provider fixtures, clock, source integration, adapters and situation inference. Executed actual
built-page probes independently, without assigning service identity or inferred state.

1. **Stop did not restore real operation.** An independent built-page probe returned
   `{active:false, clock:true, feeds:true, gps:true}` after Stop. Baseline settings retained the
   enabled simulation switches and the virtual clock stayed active. The implementation team
   changed the lifecycle. The independent Stop regression now passes.
2. **Clear before Start corrupted time.** It set the virtual clock to
   `1970-01-01T00:00:00.000Z` and generated an uncaught renderer `toUpperCase` exception.
   A selection change followed by Continue could follow the same null-start path. Independent
   regressions for both transitions pass after lifecycle fixes.
3. **Impossible Circle destination.** Return Circle fixtures advertised Uxbridge. The provider author
   changed Circle to Edgware Road and added a contract regression; final source review remains pending.
4. **Restart retained completed synthetic journey memory.** A complete outbound journey plus office dwell
   establishes homeward direction. Restart at home incorrectly remained homeward. Independent full-route
   regression added; controller now clears journey memory on each restart; independent completed-route regression passes.
5. **Coverage overstatement risk.** Traversing a simulator checkpoint proves that controls/time
   advance, but does not establish actual app tube identity, onward planning or presentation.
   The coverage matrix correctly lists these gaps. They must be closed before release.
6. **Feed-only GPS used the wrong clock domain.** A real watch fix taken30seconds ago was
   treated as81,870,000ms old when the selected virtual date was the next day. The existing
   mock fixes omitted timestamps and hid this defect. An independent actual-watch-callback
   regression now requires preservation of the observation age; native observations are translated by age into virtual time and the regression passes.
7. **Browser versus jsdom.** The existing application tests execute the built application in
   jsdom. Both reviewers separately executed the actual Chromium verification successfully.

Independent regression file: `tests/simulator-review.test.mjs`. Final rebuilt-page run: **10 passed,
0 failed**, including preservation of the browser's actual Date constructor, completed-journey restart,
restoration of saved real journey memory and observation of stale board writes.

## Mutation testing

Mutations run in an isolated temporary copy; shared implementation files were never deliberately
broken. Each change was restored after execution. The selected baseline cases pass independently;
mutant failure logs show assertion failures about the changed behavior, not only teardown errors.

| ID | Deliberate defect | Test evidence | Initial result |
| --- | --- | --- | --- |
| P1 | Erase cancellation flag | Provider delay/cancellation/alternatives contract | CAUGHT |
| P2 | Include current time in vehicle identity | Stable vehicle progression across virtual time | CAUGHT |
| P3 | Recompute expected arrival relative to current time | Fixed arrival versus decreasing countdown | CAUGHT |
| P5 | Report every calling point actual before passage | Production Service Details progress contract | CAUGHT |
| A1 | Ignore chosen playback speed | Real page advances 1000ms instead of expected5000ms | CAUGHT |
| A2 | Force every injected fix to12m accuracy | Real page station inference rejects rough fix | CAUGHT |
| P4 | Remove scenario delay | Production Darwin adapter reports zero instead of eight minutes | CAUGHT |
| A3 | Disable synthetic fetch interception | Independent-switch integration increments live request count unexpectedly; passing baseline | CAUGHT |
| A4 | Do not stop the playback timer at checkpoints | Actual checkpoint playback fails to clear its timer | CAUGHT |
| I1 | Do not increment source epoch | Stale-body test forced a fresh refresh before checking state, masking overwrite | Initially SURVIVED; CAUGHT by independent write-observer regression (3 stale trains entered state) |
| I2 | Allow save() during simulated feed session | Feed-only persistence test detects stored changes | CAUGHT |
| C1 | Collapse distinct service IDs when departure times are close | New production whichTrain ambiguity regression | CAUGHT |
| C2 | Ignore GPS uncertainty at office arrival | Generic atOffice boundary regression | CAUGHT |

Thirteen applied mutations are caught. The initial source-epoch survivor was closed by a new independent
regression that observes every actual board assignment after pending live JSON resolves; it does not issue a
fresh refresh before checking. Its passing baseline exits0; the mutant exits1 because three stale live trains
entered current state. No deliberate mutant remains in the shared workspace.

These results establish sensitivity for those behaviors on the reviewed working snapshot. They
are not a claim of complete mutation coverage or review approval for a later commit. The release
must rerun relevant mutants against the final reviewed SHA and record results below.

## Final independent review

Final reviewer: `/root/final_review`, which did not implement the feature. Reviewed implementation
commit `d296c1c`; the subsequent `0491dae` merge changes documentation only and preserves that source.
Read the architecture, simulator stories, coverage matrix, extraction/build integration and source diff.
Reviewed pure engine changes, native GPS timestamps, explicit train conflicts, session switches,
saved-state snapshots, stale-body/retry guards and configured-home endpoints.

Additional unexpected-transition finding: clearing the scenario date then enabling synthetic feeds
threw `RangeError: Invalid time value`, leaving feeds enabled with no virtual clock and a hidden panel.
The author fixed Settings preflight to visibly restore the displayed default before changing sources.
The new independent regression passes and observes no browser error or partially switched state.
Configured-home playback and real home-arrival presentation also pass independently.

Executed on final implementation source:

- **30/30** independent/provider/isolation tests pass (24.07 seconds): ten independent built-page
  regressions, eight source-isolation regressions and twelve production-adapter contracts.
- Independently reran `python3 tests/browser-simulator.py`: all four complete route/direction
  combinations pass, every checkpoint freezes, all three speeds advance correctly, zero page errors,
  zero external requests during simulation, Stop restores real operation.
- Six representative temporary mutations rerun in an isolated `/tmp/cartref-final-review` copy:

| ID | Deliberate final-source defect | Result |
| --- | --- | --- |
| R1 | Force the extracted GPS provider's accuracy to12m | CAUGHT: real app coarse-station inference assertion |
| R2 | Prevent source epoch increment | CAUGHT: independent stale-board-write observer |
| R3 | Forward device timestamps without virtual-age translation | CAUGHT: independent native-watch30second-age regression |
| R4 | Ignore configured home in scenario endpoints | CAUGHT: actual endpoint/home-arrival regression |
| R5 | Suppress fresh contradiction against a confirmed train | CAUGHT: actual picked-train conflict warning regression |
| R6 | Include current time in TfL vehicle identity | CAUGHT: explicit same-vehicle continuity assertion |

R6 initially failed by dereferencing a missing vehicle. The provider test now explicitly asserts
that the same vehicle remains identifiable; rerunning the mutant fails that meaningful assertion.
Passing final baseline proves the stronger assertion works without the mutation. Shared implementation
files were never mutated. These are representative sensitivity checks, not exhaustive mutation coverage.

**Verdict: no significant remaining implementation or documented scenario-coverage blocker found.**
Approve the reviewed source for release after committed-code local CI and required GitHub branch
checks pass. This verdict does not replace those gates or verification of the merged commit.

Residual limits are explicit: approximate synthetic geometry and local London journey durations,
no claim of Safari permission/background fidelity, ambiguous overlapping trains may require a user
choice, and Darwin's date-less HH:mm cannot reliably represent the repeated autumn London hour.
Midnight playback is tested; the rare repeated-hour overnight case remains unsupported. The normal
commute scenarios and daylight return journeys are covered. Actual TfL vehicle observations can
correct the profile's fallback ride durations, so fixture dwell/running variability is acceptable.

