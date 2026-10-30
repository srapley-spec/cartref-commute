# On your way to the station
Status: Done · Since: 27 Oct 2026; own view 29 Oct

## Story
As a commuter walking to Letchworth station, I want the departures with when I'll reach the station at my pace,
and whether I'm on track, so that I know whether to hurry and for which train.

## Where it came from
27 Oct morning: the 07:20 showed as missed while Sam was on his way and could make it. 29 Oct morning: the walk
needed its own view rather than "leave now".

## Acceptance criteria
- Within 3 km of Letchworth with a good fix and closer than home, the walk is worked out from where you are. With
  a saved home: your measured walk × the share of the distance still to go. Without: straight line × 1.3 for
  streets, at your pace. (29 Oct afternoon: with a saved home ~1.6 km out, the straight-line estimate exceeded the
  measured walk, so "on your way" never started.)
- "On your way" starts once you're more than 100 m plus the fix's accuracy from your saved home (GPS drift at home
  isn't leaving).
- "On track · N min to spare" is whole minutes in hand for that train.
- "At the station about …" is coloured by the top train's minutes to spare (the same whole number as its "N min to
  spare", so colour and text can't disagree): **green** with 3 min or more at your pace; **amber** with 1–2 min, or
  when you only make it at a fast walk; **red** under a minute ("keep going") or when it needs more than a fast walk.
  (30 Oct morning: Sam reached the station 6 min before the 08:03 and the line was the hero's fixed orange, which
  read as a warning. 3 min chosen by Sam, 30 Oct.) The rule is `wayLevel` in `src/core/present.ts`.
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
- tests/rules.test.mjs: "Review: on your way — exact minutes to spare, and 'on your way' starts 100 m from your saved home"
- tests/core/present.test.mjs: "wayLevel: on your way, green with 3+ min to spare at your pace; amber when tight or only at a fast walk; red otherwise"
- tests/rules.test.mjs: "On your way: 'At the station about' is green with 3+ min to spare for the top train, amber at 1–2, red under 1"
- tests/rules.test.mjs: "Review 3: a picked tube that's delayed starts your ride at its new time; GPS drift at home isn't leaving"
- tests/golden.test.mjs: "golden: on your way to Letchworth (home saved 1.6 km out, 550 m from the station), live"

## Not yet / open questions
- Test data: the default test home is 550 m from the station but uses a 22-minute measured walk. Make it
  consistent (~1.6 km) next time the goldens are regenerated.
