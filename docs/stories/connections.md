# Connections at any station
Status: Done · Since: 29 Oct 2026 (morning trip)

## Story
As a traveller arriving at an interchange, I want the onward departures I can make from when I actually arrived,
with minutes to spare, so that I take the connection that gets me there first.

## Where it came from
29 Oct morning at King's Cross. Measured: train arrival to the eastbound tube platform ≈ 4½ min (model at fast pace:
just under 5); office arrival estimate 08:06 was correct. Made generic in `connections.ts` because it applies at
any station with live departures ("generic engine, bespoke data").

## Acceptance criteria
- The walk to the platform counts from when you arrived at the station.
- Departures you might just make are offered "if you're near the platform"; minutes to spare are shown.
- You can pick the one you're getting.
- Once it leaves you're on it until your stop; passing stations (e.g. Farringdon) or a stray fix don't end it.
- "Did you get it?" only on a good, fresh fix back where you started.
- Fastest arrival wins across lines and stops: going to work, the H&C to Aldgate East competes with Circle/Met to
  Aldgate. Going home it stays a fallback (service frequency).
- Aldgate East is used only when Circle and Met are both closed; severe delays on both are a "bad" flag.
- Without live tube times, the app says so and estimates.

## Tests
- tests/core/engine.test.mjs: "planConnection: walk counted from arrival; near-platform departures; fastest arrival wins; your pick; spare time"
- tests/core/engine.test.mjs: "Rides: last until your stop or the ride time is over; asked only on a good, fresh fix back where you started"
- tests/core/engine.test.mjs: "bestConnections: per station, the earliest arrival you can still make; ties go to the earlier stop; cancelled never"
- tests/rules.test.mjs: "At King's Cross: the walk to the tube counts from when you arrived; tubes you might just make are listed, marked"
- tests/rules.test.mjs: "Tube ride: pick your tube at King's Cross; once it leaves you're on it, passing Farringdon or a stray fix doesn't undo it; asked if you're clearly still there"
- tests/rules.test.mjs: "Aldgate East only when Circle and Met are both closed; severe delays on both are a 'bad' flag"
- tests/app.test.mjs: "Morning at King's Cross: which tube to get on and when you'll be at the office"
- tests/app.test.mjs: "At King's Cross without live tube times: says so and estimates"
- tests/app.test.mjs: "On the tube: works out which one from when you left King's Cross and follows it to Aldgate"
- tests/rules.test.mjs: "On the tube: within 25 min of the station, a tube has left, and either you've left the station or the fix is over 90 s old"
- tests/rules.test.mjs: "Which tube: the one that left nearest to when you were last seen; a second within 3 min is 'or'"
- tests/golden.test.mjs: "golden: at King's Cross in the morning: which tube"
- tests/golden.test.mjs: "golden: Circle and Met closed: Aldgate East fallback"
