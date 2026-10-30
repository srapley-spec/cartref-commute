# Independent simulator review

Reviewer: separate `/root/review` agent, which did not write the implementation.
Status: **release approval withheld pending final source/commit review and coverage closure**.

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
   regression now requires preservation of the observation age; implementation fix pending.
7. **Browser versus jsdom.** The existing application tests execute the built application in
   jsdom. Chromium is installed, and actual browser execution remains a separate release gate.

Independent regression file: `tests/simulator-review.test.mjs`. Latest rebuilt-page run: **7 passed,
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

## Final review gate

Pending: final committed SHA, regenerated build, full test/CI results, complete actual application
scenario matrix, actual Chromium test results, final network/persistence review, review of fixes
and final mutation rerun. No independent release sign-off has been given.
