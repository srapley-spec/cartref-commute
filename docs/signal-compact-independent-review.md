# Compact Signal: independent release review

Reviewed 31 October 2026 against exact source commit **`12ef7b94c1ab02866cda263d2184f8d8999a1bc8`**. This includes latest main `8789a50` and the guided simulator release `0ca7d3c`.

**Independent review passed. Full-suite and deployment gates are recorded separately.** The independent reviewer did not implement production code. Review tests, separate detached worktrees, deliberate mutations, and the evidence below were owned independently of the implementation.

Production source is unchanged from `12ef7b9` through integrated commit `5cbb195`. The subsequent test/docs changes, including main `6aa5e2f`, Follow coverage `e505692`, simulator test-readiness fix `1f903a7`, and latest main `2b9fedf`, were independently reviewed. The simulator guide and authoritative progress helper/regressions from `2b9fedf` were retained verbatim. The exact source/44-targeted-test/20-layout/11-mutation evidence below remains bound to `12ef7b9`; final committed-head full CI is recorded by the release owner.

## Architecture and latest-code preservation

- Signal remains an optional Settings switch. Both designs share the same journey engine, transport adapters, tracking controller, saved journey, and controls. Switching skins moves existing nodes; it does not clone controls or start a second application state.
- Planning, route choice, train identity, GPS inference, freshness, and Follow timing remain in their existing engine/controller paths. The engine change is an optional status-presentation input qualifying an unavailable Tube fallback. No feed requests or server/API contracts changed.
- Existing Panda golden files were not regenerated. Signal content parity checks preserve every original journey field and the same requests while allowing the intended presentation changes.
- Reviewed the incoming `8789a50` diff. Its six real UI scenarios protect both designs' train-stop walking allowance, line-coloured Tube identity, board-order pick buttons, inferred H&C underground, departure-relative alternative labels, and Aldgate's combined platform list. All six pass against the reviewed commit.
- Reviewed later test-only main updates `6aa5e2f` and `e505692`. The former re-runs at least 14 existing Aldgate/going-home scenarios with Signal enabled and asserts the actual design. The latter retains all nine Follow scenarios and runs each in Panda and Signal, including cancellation, reopening, alternatives, Tube vehicle identity, planning expiry, missing/stale data, confirmed boarding, and feature-off behavior. These remain part of the final full-suite gate.
- Simulator source is unchanged. Existing independent integration cases still pass for genuine inference while Planner is pinned, followed Thameslink remaining on rail through St Pancras, actual Follow-panel report evidence/redaction, and technical simulator focus not pinning the commuter application.

## Findings resolved before approval

1. Reparenting on every refresh blurred planning inputs before interaction detection. Layout changes now run on skin transitions, and focus is captured before appearance changes. Repeated refresh retains the same input and defers Auto until editing ends.
2. Restoring only selected nodes left Panda's header and original sections out of order. Every original root child now has a stable home. Three consecutive roundtrips preserve node identity, original root/footer order, input values, and working control handlers.
3. Open inner alerts could pin Auto after their parent was collapsed or after all alerts resolved. Reading detection checks the node itself and all ancestors for hidden/closed disclosures. Visible expanded alerts still defer navigation and retain their open state.
4. A future plan's missing routes could disappear behind folded alerts, especially while Leave-now boards reload. The status uses the displayed Arrive-by/Leave-around failures and recognises their independently loaded boards.
5. Consolidating Tube flags could advertise a closed H&C fallback or hide its severe delays behind another warning. The visible status qualifies unavailable onward travel even when cancellation/feed errors take priority. Only represented duplicate flags fold; H&C delays and disruption on a surviving main line remain visible.
6. Folding notices could conceal example/timetable provenance when a train warning won priority. The visible status now retains the source qualifier while preserving the warning's severity and precedence.

The durable independent regressions are in [signal-compact-review.test.mjs](../tests/signal-compact-review.test.mjs). Source provenance is also covered by [signal.test.mjs](../tests/signal.test.mjs).

## Exact-commit validation

In an independent detached checkout of `12ef7b9`:

```sh
TZ=Europe/London node --import ./tests/clock.mjs --test \
  tests/signal-compact-review.test.mjs tests/signal.test.mjs \
  tests/independent-signal-review.test.mjs tests/simulator-signal-review.test.mjs
TZ=Europe/London node --import ./tests/clock.mjs --test \
  --test-name-pattern='Both designs' tests/rules.test.mjs
python tests/browser-signal-compact.py
```

**44 targeted tests passed:** 8 compact review, 13 Signal, 13 prior independent Follow, 4 independent Signal/simulator, and 6 latest-main Tube scenarios. **All 20 Chromium layout/appearance cases passed**, including 320/393 px, light/dark/system overrides, cancelled trains remaining listed, complete notices, existing adjustments, future planning controls, changing the followed train, refresh/reload persistence, explicit boarding, and 200% of every visible element's computed font size. No horizontal overflow or time-label collisions were found. Measured visible control heights were at least 44 px; sampled text contrast was at least 5.81:1 in light and 8.02:1 in dark.

This is additional independent evidence; the release owner records the full suite, documentation/type checks, committed-head CI, and deployed Pages checks separately.

## Full-suite simulator harness failure: resolved

The first full integrated local run at `9bed703` passed 696/697 tests. "Signal Journey verification: outbound far evaluates real checkpoints through completion" in `tests/simulator-journey-ux.test.mjs` timed out waiting for the next adjacent checkpoint. It was investigated before release.

A real Tube selection queues asynchronous verification and legitimately disables Next. The old test clicked that disabled control, so the click was ignored. An independent reproduction held the real verification for only 150 ms after the actual Tube choice: immediately before the old click, checkpoint 8 had `disabled:true`, `pending:true`; after the original six-second timeout, both were false but checkpoint 8 and elapsed time 80 were unchanged. This reproduces a lost test click, rather than slow checkpoint movement.

Reviewed fix `1f903a7` waits for the actual enabled button, no stepping, and no pending verification, then clicks synchronously inside the successful predicate. That first fix retained a shared six-second deadline for readiness and movement, exact adjacent-checkpoint movement, and settled verification. Production simulator code is unchanged.

Independently reran all three cases: **old helper with the 150 ms hold fails its intended adjacent-checkpoint assertion; fixed helper with the identical hold passes; the actual normal Signal outbound-far scenario passes.** Logs are `/workspace/scratch/independent-journey-next-{old-hold,fixed-hold,actual}.log`.

A later GitHub PR run (`41167256578`, commit `5d066e3`) passed 707/708 tests but reached the same fixed deadline during the Signal return-Farringdon leg, with index 9, elapsed 70.333 minutes, and `stepping:true`. The same commit's push run and local run passed all 708. This leg goes from minute 49 to 72 using 69 normal 20-second GPS frames; the failing run had completed 64 frames. Runner resource use was not profiled, so the evidence establishes a timing-margin problem rather than a specific CPU cause.

An intermediate candidate replaced the total six-second movement deadline with an elapsed-progress watchdog. Before release, main independently added the same correction and durable regressions in `2b9fedf`; the final integration adopts that incoming helper and story verbatim, rather than maintaining a helper fork. Its authoritative defaults are **20 seconds for control readiness, six seconds without simulated progress, and 60 seconds while movement remains pending**. The inactivity clock resets only when finite, monotonic simulator elapsed time increases. The actual button click remains synchronous with readiness, backward/overshot indices fail, the destination remains exactly one adjacent checkpoint, and every existing journey/verification assertion stays in place. Readiness and the existing verification wait are separate from the movement limit.

Independently tested the intermediate candidate with delays inserted only into the generated HTML string at the real stepping loop's existing yields. With 850 ms extra at each ninth frame of leg 9, **the old helper fails while still progressing at minute 61.333; the candidate passes the entire journey and completes that leg from 49 to 72 in 10.329 seconds.** A deliberate accepted-click step that never changes elapsed/index **fails its six-second inactivity assertion at 6.001 seconds**, with elapsed still 49 and index still 9. These controlled diagnostics establish the cause and stall-detection requirement; their intermediate 30-second movement setting is not the final helper's default. Logs are `/workspace/scratch/independent-journey-progress-{slow-old,slow-fixed,frozen-fixed}.log`.

The retained incoming regressions exercise a real 25-minute Thameslink segment with 750 ms added at the actual app's zero-delay stepping yields, preserving every inference assertion and requiring elapsed wall time to exceed the former six-second total deadline. A second regression replaces the actual UI action with a no-op and requires the watchdog to reject it, using an 80 ms configurable inactivity limit to keep that deliberate negative check fast. **Both incoming regressions independently passed against the final integrated helper at `5cbb195`**; output is `/workspace/scratch/independent-authoritative-watchdog-tests.log`. The helper and story have no diff from incoming main. Both checks remain in the final full-suite gate.

The bounded readiness/progress test corrections are approved. They preserve production simulator behavior and journey correctness checks. Final full-suite and deployment evidence is recorded in [signal-testing.md](signal-testing.md).

## Measured improvement

The immutable original and final page used the same deterministic 03:22 transport fixture and 393 px viewport. Light and dark geometry matched. All trains, including the cancelled service and alternative boarding stops, remain in the final board.

| Measurement | Original normal | Final normal | Original disrupted | Final disrupted |
| --- | ---: | ---: | ---: | ---: |
| First answer top | 703 px | 247 px | 1,105 px | 265 px |
| Departure board top | 1,569 px | 613 px | 2,191 px | 632 px |
| Train row heights | 252–296 px | 148–171 px | 303–376 px | 148–171 px |
| Full page height | 3,596 px | 1,592 px | 4,534 px | 1,611 px |

The first useful answer and a complete first train row now fit within the 852 px viewport in both fixtures. The improvement comes from prioritisation, full-width metadata, compact alternatives, and consolidating repeated information; ordinary controls retain their touch targets.

## Deliberate mutation evidence

Each variant below changed one production line in a separate detached worktree of **`12ef7b9`**. Every variant built successfully, then failed its intended behavioral or browser assertion. Import/build errors and timeouts were not counted as catches. Original source bytes were restored between variants.

| Deliberate regression | Catch |
| --- | --- |
| Disable the active-layout guard, reparenting controls on refresh | Editing no longer defers automatic navigation |
| Omit remembering every original root child | Exact Panda root order fails after skin roundtrip |
| Treat every open inner notice as visible | Collapsing its parent fails to release Auto |
| Exclude the details node itself from visibility checks | A resolved, hidden alert still pins Auto |
| Read Leave-now failures instead of displayed-plan failures | Future plan's missing route is absent from status |
| Restore the old loading shortcut without plan boards/failures | Leave-now loading conceals the future plan's failure |
| Invert the unavailable-fallback condition | Closed H&C fallback is advertised without qualification |
| Disable the additional visible network-impact summary | Cancellation conceals onward closure |
| Mark every Tube flag as consolidated | H&C/surviving-line severe delays disappear from immediate view |
| Disable visible source provenance | Cancellation conceals the example-data qualifier |
| Restore a 92 px metadata column in the train rows | Chromium fails the actual row-height density assertion |

**11/11 deliberate regressions caught.** After restoring source, all **21 compact + Signal tests passed**. The mutation checkout had no remaining diff in `src` or `tests`; only its generated build timestamp differed. The separate positive-test checkout retained the exact committed page throughout.

Session evidence is stored under `/workspace/scratch/signal-compact-mutation-evidence-12ef7b9/` (per-mutation build/test logs and `results.json`), `/workspace/scratch/signal-compact-final-independent-browser/` (screenshots and measured JSON), and the corresponding final focused/Tube test logs in `/workspace/scratch/`.

Actual browser verification here used Chromium. The live feed, physical journey, and a Safari device were not available to this independent run; transport fixtures and the existing real-controller simulator scenarios cover their tested contracts without claiming a physical commute was performed.
