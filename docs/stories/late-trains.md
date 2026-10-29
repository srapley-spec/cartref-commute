# Late trains say so
Status: Done · Since: 29 Oct 2026 (morning trip)

## Story
As a commuter at or near the station, I want a late train's expected time everywhere it appears, and fresh data,
so that I don't rush for a train that isn't there yet or miss one that's running late.

## Where it came from
29 Oct morning: the 07:00 (exp 07:03) and 07:08 (exp 07:09) weren't shown as late.

## Acceptance criteria
- Late trains show "07:00 exp 07:03" everywhere they appear (card, list, board).
- At Letchworth or on the way there, refresh every 30 s.
- Elsewhere, automatic refreshes no more often than every 30 s; live boards each time, timetable reused for 5 min.

## Tests
- tests/rules.test.mjs: "Automatic refreshes: none within 30 s; after that, live boards again (timetable reused for 5 min)"
- tests/core/refresh.test.mjs: "refreshPlan: office tubes going home; line status reused 2 min, National Rail status 5 min; at most every 30 s"
- tests/rules.test.mjs: "Review: at Letchworth station a late train says 'Departs · N min late'; refreshes every 30 s"
- tests/golden.test.mjs: "golden: morning near Letchworth, live, with a delay and the standing-room rule"
- tests/golden.test.mjs: "golden: evening at the office, live, with cancellations and a delay; every planning view"
