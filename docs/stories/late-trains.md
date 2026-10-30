# Late trains say so
Status: Done · Since: 29 Oct 2026 (morning trip) · Departure board columns: 30 Oct 2026

## Story
As a commuter at or near the station, I want a late train's expected time everywhere it appears, and fresh data,
so that I don't rush for a train that isn't there yet or miss one that's running late.

## Where it came from
29 Oct morning: the 07:00 (exp 07:03) and 07:08 (exp 07:09) weren't shown as late.

30 Oct, walking to Letchworth: the card said "Departs · 3 min late **08:03**" in large type and "08:00 exp 08:03" in
small print. The train is called the 08:00: on the platform board, on the "Which train?" buttons and in "You're on the
08:00". The big 08:03 read like a different train, and the delay was said three times while the train's name was
said once, small. Sam chose a departure-board layout (option A of three) and amber from 5 min.

## Acceptance criteria
- **Departure board (at a station, or on your way to one):** the card and every list row show three times at the
  same size, labelled, in the platform board's order: **Train** (the timetabled time, the train's name) · **Expected**
  · **At office / At home** (card) or **Arrive** (list). Expected is the expected departure time when the train is
  1+ min late; otherwise a word: "On time", "Not live" (timetable data: the delay isn't known, so never "On time"),
  "No estimate", "Cancelled". The route chips move to their own line under the times.
- Expected is coloured by the status band, from the engine (`departureStatus` in `src/core/rules.ts`), never page
  arithmetic: **green under 5 min late, amber 5–14, red 15+**, cancelled or no estimate (Sam, 30 Oct). The same bands
  colour the delay pill, which now says "N min late" (it said "+N min", and turned red from 10 min).
- The arrival is one expected time (train + tube + walk); the office or home has no timetable of its own to show
  beside it (Sam, 30 Oct).
- **Leave mode (at home or the office):** unchanged. Big Leave → Arrive; the train line reads "07:00 exp 07:03".
- Late trains show the timetabled and the expected time everywhere they appear (card, list, journey steps).
- At Letchworth or on the way there, refresh every 30 s.
- Elsewhere, automatic refreshes no more often than every 30 s; live boards each time, timetable reused for 5 min.

## Tests
- tests/rules.test.mjs: "Automatic refreshes: none within 30 s; after that, live boards again (timetable reused for 5 min)"
- tests/core/refresh.test.mjs: "refreshPlan: office tubes going home; line status reused 2 min, National Rail status 5 min; at most every 30 s"
- tests/rules.test.mjs: "At Letchworth station a late train shows Train and Expected side by side, coloured by status band; refreshes every 30 s"
- tests/core/engine.test.mjs: "departureStatus: on time, N min late, cancelled, no estimate, not live; green under 5 min, amber 5–14, red 15+"
- tests/core/engine.test.mjs: "trainFlags: cancelled, standing room, stopping, delays, unknown — from the profile's rules"
- tests/rules.test.mjs: "At Letchworth station going to work, Leave now is a departure board too"
- tests/app.test.mjs: "Evening at King's Cross: trains home planned from the station, no walk from the office"
- tests/golden.test.mjs: "golden: morning near Letchworth, live, with a delay and the standing-room rule"
- tests/golden.test.mjs: "golden: evening at the office, live, with cancellations and a delay; every planning view"
