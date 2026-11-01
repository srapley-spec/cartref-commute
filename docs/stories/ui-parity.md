# Supported UIs advance together
Status: Implemented · Since: 31 Oct 2026 · Release checks: [PR #43](https://github.com/srapley-spec/cartref-commute/pull/43)

## Story
As a commuter, I want every supported design and view to give me the same journey facts and actions, so that
changing appearance or switching between planning and Live cannot hide duration, the fastest usable route or
other information I rely on.

## Where it came from
31 Oct evening: Sam's actual Live screen showed departure, expected departure and arrival, but omitted train and
total journey duration and the existing arrival-first indication. The planning renderer already had those facts.
The Live introduction also described the screen in a long paragraph. Sam required a clear SDLC rule, always
enforced, that all supported design systems and UIs advance concurrently until a UI is dropped.

## Acceptance criteria
- A feature or correction ships in every supported design and applicable view in the same change. Different
  geometry is allowed; different facts, ranking meaning, available actions or uncertainty are not. Do not treat
  an experimental design switch as permission to leave another supported UI behind.
- Panda and Signal remain supported. Additions to the supported-design or surface registry require their own
  real-page contract cases; omissions cannot be hidden by editing a hand-maintained test-name list.
- Auto / Plan / Live controls and their override lifetime are shared by Panda and Signal, including with Follow
  disabled. Follow remains its own independently configurable capability. Turning Signal off changes geometry,
  not access to planning or the Live departure board.
- Duration is derived once from the existing canonical itinerary, using `src/core/journeyFacts.ts`: train duration
  uses the relevant train's expected departure/arrival, and total duration uses the option's own leave/arrival.
  A followed route uses its canonical journey start and current expected arrival, not the time the Follow button
  was tapped. The same inputs produce the same values in all applicable designs and views.
- A specific Tube connection uses `connectionJourneyFacts`: its actual board-projected `leaveBy` to its timed
  door-to-door arrival. A rail option rebuilt after the Tube departed may have a later generic access start;
  that start is not reused for this connection. Conditional early departures without an established `leaveBy`
  keep the total unknown. Train duration still uses the connected train's own known times.
- Invalid, reversed, missing or unusable timing stays unknown. An unknown whole-journey arrival must not become
  a confident total duration. Known train-only facts do not manufacture an unplanned onward connection.
- “Arrives first” retains the existing earliest usable arrival at each achievable effort level, with the same
  tie break and fast-walk/run/car qualifiers. It is not a new ranking by shortest train ride or shortest total
  duration. Future planning questions retain their own eligible window; an impossible, cancelled or no-estimate
  train is not promoted. Live uses the option matched to that boarding station, not another stop's main option.
- The station projection preserves an existing graded run/car option even when it is missed at walking pace;
  it must not collapse that effort to impossible. An alternate boarding option keeps its own effort, duration
  and flags rather than inheriting its main option's winner label.
- Tube connections expose the existing earliest reachable arrival separately as `ConnectionPlan.fastest`.
  A slower explicit pick stays selected (`best`) without being called fastest. Auto and Live compare the same
  full loaded eligible set; compact choice geometry keeps the first three plus the fastest and chosen departure.
- The relevant duration and arrival-first facts are visible without opening Journey steps or an unrelated
  disclosure. Current warnings, catchability, train identity and Follow actions remain available.
- Use short, plain commuter messages: time, result or action first. At the origin, the departures heading already
  names the screen. Replace the explanatory “No journey under way…” paragraph with “Auto shows when to leave.”; never
  pretend the passenger is already on a service.

## Design exceptions (Sam, 1 Nov 2026)
- A surface may exist in fewer than all supported designs only with Sam's explicit, recorded exception: the registry
  entry lists `designs` and `exception` (a decision under `docs/` with `Approved by: Sam` and
  `Design exception: surface:<id> designs:<ids>`). The gate checks the record, expects results only for the listed
  designs, rejects an unexpected result for an excepted design, and refuses an exception that names a different
  surface, lists unregistered designs or covers every design.
- First and only use: Trip mode's eight views are Signal-only ([decision](../decisions/trip-signal-only.md),
  [Trip story](leisure-journeys.md)). Their Signal cases drive the real Trip screen into each view.
- Tests: tests/ui-parity-enforcement.test.mjs "UI parity gate accepts a design exception only with Sam's recorded
  decision naming the surface and its designs"; the `UI parity: signal / plan-trip-*` and `signal / trip-*` cases.

## Mandatory SDLC gate
- `config/ui-parity.json` is the supported-design/surface registry. Its surfaces cover every key in the pure
  presentation model's `BLOCKS`, plus the explicit Live departures and Along the line surfaces. The Along the line companion
  retains current journey duration facts, significant disruption and stale/unknown qualifications in both designs. Settings and geometry may vary by
  design; a fixture must reach the real production view rather than insert matching HTML.
  A production-source inventory also checks actual CSS/HTML design selectors and explicit design assignments
  against the registry. A third implemented design cannot silently lack coverage, and a retired design's live
  implementation must really be removed. Historical proposal files are not supported production UIs. Opaque
  computed design assignments are rejected rather than assumed to be covered.
- `tests/ui-parity.test.mjs` exercises every design × surface pair against the generated real application.
  Assertions check actual visible facts and actions, including appropriate unknown states; hidden markup alone
  is not evidence that the commuter can see the information.
- `tools/run-tests.mjs` and `tools/check-ui-parity.mjs` enforce the result matrix. A failed, missing, skipped,
  TODO or duplicate tuple fails the gate. `npm test` always runs it, so committed-head local CI and GitHub cannot
  omit it. `npm run check-ui-parity` provides the focused matrix run. `Docs: none` cannot bypass this requirement.
- Update the registry, runtime fixtures and acceptance story when introducing a design or surface. A shared
  renderer can update both designs without fake separate file edits; successful behavior contracts are the proof.
- Removing a design or surface requires Sam's explicit retirement decision. Retain a registry retirement entry
  and decision document identifying the retired UI and approval; the checker validates that record. The record
  is evidence to inspect, not an automatic substitute for the user's authorization.
  The entry is `{kind: "design" | "surface", id, decision: "docs/<decision>.md"}`; the decision must contain
  `Approved by: Sam` and `Retired UI: design:<id>` (or `surface:<id>`). Retirement history remains in the registry.
  CI supplies an explicit comparison base through `UI_PARITY_BASE`; an invalid base fails rather than silently
  dropping removal protection.
- The gate protects its maintained semantic contract. It does not prove all possible data combinations or make
  browser, independent review, unknown-source, accessibility and release checks optional.

## Tests
The implemented checkpoint has separate [independent mutation evidence](../journey-facts-parity-independent-review.md)
and [hash-bound browser evidence](../journey-facts-parity-browser-review.md). Exact committed-code CI,
post-merge Tests/Pages and the public-build smoke are recorded in [PR #43](https://github.com/srapley-spec/cartref-commute/pull/43).

The runtime contract is [ui-parity.test.mjs](../../tests/ui-parity.test.mjs); the separate reviewer owns
[ui-parity-review.test.mjs](../../tests/ui-parity-review.test.mjs). Guarded duration unit tests live beside the
pure helper, and the gate has its own enforcement tests. Native Chromium checks in
[browser-ui-parity.py](../../tests/browser-ui-parity.py) cover visible facts, layout, both appearances, phone widths
and enlarged text. The final independent report and committed-head CI/release result must record actual runs;
these links and the existence of tests are not claims that those runs already passed.

- tests/core/journeyFacts.test.mjs: "journey facts: every view receives train and total durations from the same canonical option"
- tests/core/journeyFacts.test.mjs: "journey facts: Follow updates its endpoint without replacing the saved journey start"
- tests/core/journeyFacts.test.mjs: "journey facts: explicit unknown arrival never falls back to a retained planned ETA"
- tests/core/journeyFacts.test.mjs: "journey facts: completed rail uncertainty cannot erase an independently known onward arrival"
- tests/core/journeyFacts.test.mjs: "journey facts: a missing current train endpoint cannot reuse the original option total"
- tests/core/journeyFacts.test.mjs: "journey facts: a board service without a full route has no invented door-to-door total"
- tests/core/journeyFacts.test.mjs: "journey facts: invalid or reversed intervals stay unknown, while midnight uses actual instants"
- tests/core/journeyFacts.test.mjs: "connection journey facts: selected Tube timing replaces a rail option access start that is already too late"
- tests/core/journeyFacts.test.mjs: "connection journey facts: conditional early departures and missing or invalid instants cannot invent a start"
- tests/core/journeyFacts.test.mjs: "connection journey facts: cancellation and no-estimate train incidents do not expose retained connection totals"
- tests/core/connections.test.mjs: "Connection fastest: a slower explicit pick stays selected without being relabelled earliest arrival"
- tests/core/connections.test.mjs: "Connection fastest: unpicked and selected-fastest identities agree while an early pick cannot invent a reachable winner"
- tests/core/connections.test.mjs: "Connection fastest: the existing max window and equal-arrival departure tie remain unchanged"
- tests/core/stationBoard.test.mjs: "railStationBoard: graded run and car remain possible despite being missed at walking pace"
- tests/core/stationBoard.test.mjs: "railStationBoard: the easier graded route wins without reranking run and car options by arrival"
- tests/core/stationBoard.test.mjs: "railStationBoard: alternate boarding preserves its own effort and facts without inheriting the main winner"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate registers every supported design and every engine view, with no duplicate or empty entries"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate requires actual passing results for every tuple and rejects skip TODO omission failure and duplicate"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate forbids silent registry shrinkage even when a docs waiver exists"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate accepts explicit documented retirement and retains its history"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate is mandatory in npm test and both committed CI paths without rerunning the matrix"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate rejects a broken comparison base instead of discarding retirement protection"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate discovers third production CSS and assignment designs but ignores historical prototypes"
- tests/ui-parity-enforcement.test.mjs: "UI parity gate rejects opaque computed design assignment instead of assuming registry completeness"

## Limits
- The matrix is the set of supported semantic surfaces, not every combination of provider response and saved
  setting. Add a regression for any real trip exposing a gap, then keep it in the shared contract.
- Layout may differ between designs. Geometry, native Safari/VoiceOver and live-provider reliability still need
  their appropriate checks; passing semantic parity is not a full accessibility or hardware acceptance result.
