# On your way to the station
Status: Done · Since: 27 Oct 2026; own view 29 Oct

## Story
As a commuter walking to Letchworth station, I want the departures with when I'll reach the station at my pace,
and whether I'm on track, so that I know whether to hurry and for which train.

## Where it came from
27 Oct morning: the 07:20 showed as missed while Sam was on his way and could make it. 29 Oct morning: the walk
needed its own view rather than "leave now".

## Acceptance criteria
- Within 3 km of Letchworth with a good fix and closer than home, the walk is worked out from where you are
  (straight line × 1.3 for streets, at your pace).
- Shows departures, when you'll reach the station, and "on track" or minutes behind for each.
- "If you hurry" trains are listed nearest-to-making first, with a departure countdown; they stay on the list and
  card until they leave.
- Leave now searches start early enough that trains you'd hurry for are actually loaded.
- Refresh every 30 s on the way (see [late-trains](late-trains.md)).

## Tests
- tests/rules.test.mjs: "On your way to Letchworth: departures, when you'll reach the station, and whether you're on track"
- tests/logic.test.mjs: "On the way to the station, the walk is worked out from where you are"
- tests/logic.test.mjs: "A train you'd have to hurry for stays on the list and the card, with a departure countdown"
- tests/core/plan.test.mjs: "Routes home; from where you are (walk to Letchworth, or already at King's Cross); leisure"
