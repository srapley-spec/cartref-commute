# Top card: best and next best
Status: Done · Since: 28 Oct 2026

## Story
As a commuter glancing at the phone, I want the card to show the best train and the one to fall back on, on any
route, so that I can act without reading the list.

## Where it came from
Decided 28 Oct. Earlier versions showed "the best per route", which put a worse train on the card just because it
was a different route.

## Acceptance criteria
- Every route is weighed; no train is on the card just because its route is different.
- **Leave now / Leave around:** best = earliest arrival. Next best = the best of the trains that leave later than
  the best, only if it arrives within 20 min of the best (`topWindowMin` in the profile).
- **Arrive by:** best = the latest train that gets you there in time. Next best = an earlier train with more
  margin, leaving no more than 20 min before it.
- Never a strictly worse train (leaves earlier and arrives later) as the alternative.
- One card is fine when nothing qualifies. The list always has everything.
- Leave now also says which train you'd catch by setting off this minute, if it's a different one.
- Cancelled and "Delayed, no estimate" are never on the card.
- **Departure wording (Sam, 1 Nov 2026):** before setting off, the precise `leave in …` countdown is the only
  departure instruction on each option. Never add `leave now` alongside a positive countdown, including below
  90 seconds. At expiry retain `leave time passed`; leave times, catchability and required pace are unchanged.
  The same shared rule applies to Panda and Signal. Station/platform instructions and on-the-way progress
  retain their separate meanings; the planning-mode label remains a way to choose the current planning question.
- Train duration, total journey duration and the existing “Arrives first” meaning are shared facts, not separate
  choices made by each design or view. Live departures, station lists, planning and Follow consume the same
  itinerary and retain effort qualifiers. The fastest-to-arrive option need not have the shortest train ride or
  total duration. → [UI parity](ui-parity.md)

## Tests
- tests/core/engine.test.mjs: "topPicks: best, then the next best on any route; strictly worse options are never the alternative"
- tests/core/engine.test.mjs: "Picks: from the options, never missed or uncertain, best first, alternative never strictly worse"
- tests/core/plan.test.mjs: "rankNow: leaving order; first catchable; fastest; card picks within the window"
- tests/logic.test.mjs: "Leave now card: best train, then the next best (same route allowed), total time, and the train you'd catch right now"
- tests/logic.test.mjs: "A train you'd have to hurry for stays on the list and the card, with a departure countdown"
- tests/effort.test.mjs: "Departure countdown: Panda has no redundant leave-now instruction below ninety seconds"
- tests/effort.test.mjs: "Departure countdown: Signal has no redundant leave-now instruction below ninety seconds"
