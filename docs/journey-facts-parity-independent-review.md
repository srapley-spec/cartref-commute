# Independent review: journey facts and enforced UI parity

Reviewed 31 October 2026 by an agent that did not implement production code or the release gate.

**Result: satisfied with the production change and regression coverage. All 39 deliberate single-change mutations were caught. No production findings remain open.** Final committed-head CI and exact post-merge Tests, Pages and deployed smoke remain the release owner's gates.

## Exact checkpoint

- Production source: `f36310f0ec8527988e59231c0b564b1e5d039d6a`.
- Committed generated page SHA256: `c3e08873e2db816cdd93306ff6a1f6fce10e966b5834cc4e20ca0c5f86b69c21`.
- The isolated checkout started at the latest `origin/main`, `1292004`, before checking out the exact candidate. Mutations ran only there, not in the implementation workspace.
- One additional assertion subsequently strengthens the existing qualified-effort page test: its visible `data-reach` must agree with the canonical fast-walk/run/car qualification. The assertion passed against the checkpoint and killed the reached mutation. It changes no production source, generated page or test-case count.

## Semantics reviewed

“Arrives first” retains the agreed meaning: earliest reachable arrival, with the existing effort qualifications. It is not a newly invented shortest-duration ranking. The independent fixture deliberately contains a later, shorter trip and an earlier-arriving, longer trip; the shorter trip must not take the earlier-arrival label. Cancelled, no-estimate and impossible services cannot win. Alternative boarding points use their own access budget, duration and reach, rather than inheriting the main boarding point's winner.

`journeyFacts` uses the existing option's canonical start and actual or controller-supplied endpoint. Follow does not reset the start to the moment Follow was tapped or to the current clock. Missing, cancelled, no-estimate and invalid current train observations cannot turn retained planned times into confident current durations. A separately known onward arrival can remain useful after an already-completed rail incident.

Tube connection duration uses that actual connection's established `leaveBy` and timed arrival, rather than a generic rail option's later access start. The existing connection planner exposes its already-calculated `fastest` separately from the person's `best` selection; no new ranking or routing algorithm is introduced. Conditional early departures without an established start retain an unknown total.

Panda and Signal expose the same facts in Auto, Plan, Live and Follow, including recovery alternatives and the collapsed Signal Next best summary. Panda's view controls no longer depend on enabling Follow. Qualified arrival-first effort replaces its plain effort lozenge; it does not create two competing instructions. The Live introduction is short.

## Counterexamples resolved during the work

- Live rail rows originally rendered only train flags, losing the canonical arrival-first qualification and both durations. They now draw the existing option's facts and qualifications.
- A current train with `arr: null` and no separate unknown flag could leave a finite old total. The shared helper now treats missing, non-finite and reversed current intervals as unavailable.
- At Aldgate, the 17:39 Tube connected to a rail option whose generic access start was 17:40:30. Reusing that start displayed about **1h 33m**, despite it being after the Tube had departed. The actual connection starts at 17:30:30 and takes about **1h 43m**; the 17:45 connection takes about **1h 37m**. Auto, Plan and Live now agree on each selected connection's own duration.
- Selecting a later Tube must not make it the fastest route. The true earliest-arrival comparison remains visible independently of the explicit selection.
- Run/car options were projected as impossible because their `missed` flag means unsuitable for the ordinary walking recommendation. The board now retains their canonical effort level without promoting them into walking recommendations.
- A new production ES module or JSX/TSX design assignment could escape the first scanner allowlist. Production inventory now covers the supported JavaScript/TypeScript module variants as well as HTML/CSS design tokens.

These were fixed with production changes and meaningful regressions; they were not waived as wording differences or flakes.

## Executed baseline

The detached checkpoint passed **69 focused tests**: twenty independent actual-page/runner probes, eight enforcement tests, and the journey-facts, station-board and engine suites. The strengthened reached effort assertion also passed before its mutant was applied.

The twenty independent cases exercise both supported designs, home/station contexts, Auto/Plan/Live, Follow before and after boarding, default Follow-off controls, missing current arrival with a valid recovery alternative, collapsed Next best, actual Tube connections and a slower explicit pick, same-train alternative boarding, qualified effort and the real release runner.

Visibility checks inspect computed styles, hidden ancestors and closed native disclosures; retaining a duration in hidden markup does not count. The runner test builds an isolated temporary repository and invokes the real tools. It proves that zero-exit child runs with skipped, omitted or merely console-declared parity coverage fail, and that unrelated page/core failures and full-suite discovery remain mandatory.

## Mutation evidence

Each mutation changed one production/tool/configuration decision, built successfully, and was exercised by a relevant reached test. There were no invalid-build kills or unexplained survivors.

| # | Deliberate breakage | Check that caught it |
| --- | --- | --- |
| 1 | Total starts at train departure | Canonical full-journey duration |
| 2 | Train duration becomes total duration | Separate train/total facts |
| 3 | Unknown Follow endpoint reuses the old plan | Explicit-null endpoint |
| 4 | Missing current arrival is accepted | Missing-current-endpoint regression |
| 5 | Cancellation/no-estimate flags are ignored | Unavailable current facts |
| 6 | Tube total uses generic rail access start | Actual connection start counterexample |
| 7 | Unknown early start falls back to a plan | Conditional-start uncertainty |
| 8 | Explicit Tube selection becomes fastest | Slower-pick actual-page fixture |
| 9 | Run/car board reach becomes impossible | Existing station-board regression and strengthened reached page test |
| 10 | Live drops canonical arrival-first flags | Reached Live rail comparison |
| 11 | Live rail omits durations | Visible train/total facts |
| 12 | Follow omits durations | Same selected journey across views |
| 13 | Follow retains a stale saved winner | Missing current arrival with a valid alternative |
| 14 | Panda controls require Follow | Default Panda Auto/Plan/Live |
| 15 | Verbose Live paragraph returns | Glanceable introduction |
| 16 | Next best hides its duration | Closed-disclosure summary |
| 17 | Plain qualified-effort pill duplicates | One canonical fast/run/car lozenge |
| 18 | Auto Tube uses generic rail total | Actual selected connection in Auto |
| 19 | Live Tube uses generic rail total | Same connection in Live |
| 20 | Auto Tube badge follows the pick | True winner after a slower pick |
| 21 | Follow alternative omits durations | Reached recovery alternative |
| 22 | Signal renders Panda | Actual registered Signal surface |
| 23 | Supported Panda registry entry disappears | Production inventory and supported matrix |
| 24 | Tube surface disappears | Engine-view coverage |
| 25 | Gate stops requiring every engine view | Missing-view validation |
| 26 | Skipped tuple is accepted | Real runner negative fixture |
| 27 | TODO tuple is accepted | Strict actual-result parser |
| 28 | Missing tuple is accepted | Real runner omission fixture |
| 29 | Failed tuple is accepted | Strict failed-result parser |
| 30 | Runner discards coverage validation | Real runner zero-exit negative fixture |
| 31 | Runner ignores unrelated test failure | Non-parity failure fixture |
| 32 | Normal runner executes only parity | Required page/core discovery fixture |
| 33 | npm test bypasses the runner | Mandatory-entry-point regression |
| 34 | GitHub CI bypasses the runner | Mandatory GitHub-path regression |
| 35 | Local CI bypasses the runner | Mandatory committed-copy path |
| 36 | Removal needs no retirement approval | Previous-registry retirement regression |
| 37 | Unknown production design is ignored | Third CSS/assignment design discovery |
| 38 | ES module design assignment is ignored | Production module discovery |
| 39 | Opaque computed design assignment is accepted | Explicit design-inventory failure |

The first reduced selection left mutation 9 alive because it checked the qualified text but not the visible reach state. The existing full-suite core regression already killed it. The additional reached assertion now independently catches the actual UI inconsistency too; both its passing baseline and failing mutant were run. This was a test-selection/coverage improvement, not an outstanding production defect.

Session artifacts are under `/workspace/scratch/journey-facts-parity-review/`: `baseline.log`, `final-baseline.log`, `mutations.json`, `mutation-run.log`, `mutant-01.log` through `mutant-39.log`, the mutation runner, and the explicit mutation-9 follow-up logs. Durable regressions are [independent page/runner tests](../tests/journey-facts-review.test.mjs), [enforcement tests](../tests/ui-parity-enforcement.test.mjs), [journey facts](../tests/core/journeyFacts.test.mjs), [station-board reach](../tests/core/stationBoard.test.mjs), and the registered [runtime parity matrix](../tests/journey-views.test.mjs).

## Release rule and limits

The SDLC rule is backed by production design discovery, an explicit supported registry, coverage of every engine view, strict passing results for the complete design/surface matrix, and mandatory integration in npm test plus both release paths. A silent removal cannot be hidden with a docs waiver; retirement needs an explicit decision recording Sam's approval. New visual geometry is free to differ while the semantic facts remain common.

This does not claim that finite tests prove every provider response or future design. Review still matters when a change adds a new type of UI surface or alters the gate itself. The current request introduces no provider endpoint or saved-state migration; the tests use controlled observations and the existing planning engine. Native-device appearance and real provider availability are separate from this code/mutation review; the browser report and deployed smoke supply the visual/public-build evidence.
