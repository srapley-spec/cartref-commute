# Journey facts across planning and live views
Status: Implemented; cross-design parity rule retired 1 Nov 2026 · Since: 31 Oct 2026

## Story
As a commuter, I want duration, earliest-arrival meaning, source confidence and actions to remain correct when
I move between planning, Live and an active journey.

## Where it came from
On 31 Oct, Live omitted duration and arrival-first information already shown in planning. Shared engine facts
and visible-page regressions fixed that gap. On 1 Nov Sam retired Panda and explicitly removed the two-design
parity rule. The registry and release-policy enforcement are gone; the actual journey regression assertions remain.
[Decision and recovery](../panda-retirement-review.md).

## Acceptance criteria
- Signal is the only design. Auto / Plan / Live stay available with Follow enabled or disabled. Follow remains
  independently configurable; an old design preference must not enable it or change the selected trip.
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

## Tests
Ordinary page regressions in [journey-views.test.mjs](../../tests/journey-views.test.mjs) retain all eleven
presentation views, Live departures and Along the line. [journey-facts-review.test.mjs](../../tests/journey-facts-review.test.mjs)
retains counterexamples for uncatchable/cancelled/unknown trains, alternate boarding, effort levels and selected
Tube timing. [browser-journey-facts.py](../../tests/browser-journey-facts.py) checks visible facts, layout, light/dark,
320/393 px widths and enlarged text. These are functional tests, not a design registry or a policy gate.

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

## Limits
These regressions cover their fixtures, not every feed response or saved setting. Safari, VoiceOver and live
provider reliability need their own checks. Dated reports for the former parity gate remain historical evidence.
