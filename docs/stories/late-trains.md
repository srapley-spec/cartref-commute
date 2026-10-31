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
said once, small. Sam chose a departure-board layout (option A of three), amber from 5 min, and TfL's reported
delays shown as expected times, coloured.

## Acceptance criteria
- **Departure board (at a station, or on your way to one):** the card and every list row show three times at the
  same size, labelled, in the platform board's order: **Train** (the timetabled time, the train's name; "Train from
  St Pancras" on the card when you'd board elsewhere) · **Expected** · **At office / At home** (card) or **Arrive**
  (list). Route chips go on their own line beneath; on phones under 370 px the times step down to 25 px.
- **Expected** comes from the engine (`departureStatus` in `src/core/rules.ts`), never page arithmetic: the expected
  departure time whenever it differs from the timetable (late, or early), coloured by the status band (green under
  5 min late, amber 5–14, red 15+); otherwise a word: "On time" (live data), "Not live" (timetable, delay unknown),
  "Estimated" (worked out from another stop), "No estimate", "Cancelled". TfL journey-planner trains that report a
  delay show its expected time, coloured like a live one (Sam, 30 Oct).
- Expected is the departure. A train that leaves on time but arrives late shows "On time" with its arrival delay in
  the status pill ("20 min late"), which keeps saying how late the worse of the two is.
- On a board, an "On time" status pill is left off (it repeats Expected); a delay pill stays ("3 min late"). The
  timetabled time is never struck through: a missed train says "Can't make it" instead.
- The arrival is one expected time (train + tube + walk); no timetabled door-to-door arrival exists to show.
- **Leave mode (at home or the office):** unchanged. Big Leave → Arrive; the train line reads "07:00 exp 07:03".
- **Signal shared columns (Sam, 31 Oct):** the primary answer, Next best and complete board share one set of
  horizontal anchors. Train/Leave is left aligned, Expected is centred at the page's time-grid centre, and
  destination arrival is right aligned. Planning reserves the middle slot without inventing an Expected
  column. Next best sits above the time grid, and Follow/service metadata occupies its own row. At enlarged
  text sizes, preserve the semantic order and readable reflow without overlaps or clipped times.
- At Letchworth or on the way there, refresh every 30 s.
- Elsewhere, automatic refreshes no more often than every 30 s; live boards each time, timetable reused for 5 min.

## Tests
Signal's cross-card/row column geometry and enlarged-text reflow are checked in
[browser-signal-journey-clarity.py](../../tests/browser-signal-journey-clarity.py); pure/page assertions below retain
the departure semantics independently of CSS.

- tests/rules.test.mjs: "Automatic refreshes: none within 30 s; after that, live boards again (timetable reused for 5 min)"
- tests/core/refresh.test.mjs: "refreshPlan: office tubes going home; line status reused 2 min, National Rail status 5 min; at most every 30 s"
- tests/rules.test.mjs: "At Letchworth station a late train shows Train and Expected side by side, coloured by status band; refreshes every 30 s"
- tests/core/engine.test.mjs: "departureStatus: the Expected column; the time whenever it differs from the timetable (live or TfL), else a word, never 'On time' without live data"
- tests/app.test.mjs: "Departure board on TfL timetable data: Expected says 'Not live', never 'On time'; a delay TfL reports shows its expected time, coloured"
- tests/logic.test.mjs: "At King's Cross, a St Pancras train on the card says 'Train from St Pancras'"
- tests/rules.test.mjs: "At Letchworth station going to work, Leave now is a departure board too"
- tests/app.test.mjs: "Evening at King's Cross: trains home planned from the station, no walk from the office"
- tests/golden.test.mjs: "golden: morning near Letchworth, live, with a delay and the standing-room rule"
- tests/golden.test.mjs: "golden: evening at the office, live, with cancellations and a delay; every planning view"
