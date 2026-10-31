# Compact Signal: independent release review

Reviewed 31 October 2026 against exact source commit **`12ef7b94c1ab02866cda263d2184f8d8999a1bc8`**. This includes latest main `8789a50` and the guided simulator release `0ca7d3c`.

**Focused source review passed; release remains pending full CI.** The independent reviewer did not implement production code. Review tests, separate detached worktrees, deliberate mutations, and the evidence below were owned independently of the implementation.

The first full integrated run at `9bed703` passed 696/697 tests. `tests/simulator-journey-ux.test.mjs:124`, "Signal Journey verification: outbound far evaluates real checkpoints through completion", timed out waiting for "Next advances one adjacent checkpoint". That failure is under investigation; this focused review does not override it. The final committed head must pass full CI after resolution. This record's exact source/targeted/mutation evidence remains bound to `12ef7b9`.

## Architecture and latest-code preservation

- Signal remains an optional Settings switch. Both designs share the same journey engine, transport adapters, tracking controller, saved journey, and controls. Switching skins moves existing nodes; it does not clone controls or start a second application state.
- Planning, route choice, train identity, GPS inference, freshness, and Follow timing remain in their existing engine/controller paths. The engine change is an optional status-presentation input qualifying an unavailable Tube fallback. No feed requests or server/API contracts changed.
- Existing Panda golden files were not regenerated. Signal content parity checks preserve every original journey field and the same requests while allowing the intended presentation changes.
- Reviewed the incoming `8789a50` diff. Its six real UI scenarios protect both designs' train-stop walking allowance, line-coloured Tube identity, board-order pick buttons, inferred H&C underground, departure-relative alternative labels, and Aldgate's combined platform list. All six pass against the reviewed commit.
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
