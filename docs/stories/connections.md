# Connections at any station
Status: Done · Since: 29 Oct 2026 (morning trip); hardened after independent review 29 Oct afternoon

## Story
As a traveller arriving at an interchange, I want the onward departures I can make from when I actually arrived,
with minutes to spare, so that I take the connection that gets me there first.

## Where it came from
29 Oct morning at King's Cross. Measured: train arrival to the eastbound tube platform ≈ 4½ min (model at fast pace:
just under 5); office arrival estimate 08:06 was correct. Made generic in `connections.ts` because it applies at
any station with live departures ("generic engine, bespoke data").
29 Oct afternoon: an independent review (deliberate one-line breakages plus probes) found edges not pinned and
three bugs: back at King's Cross after minutes without a fix showed "on the tube" for a tube already gone; a picked
tube was dropped when TfL moved its time by seconds; the card's tube and the list's highlighted row could differ.
All fixed and tested. Going home now uses the same model (see [tube-home](tube-home.md)).
30 Oct morning: Sam asked that the lozenge naming the tube to get on be that line's colour (H&C light pink, Circle
yellow, Met magenta), as the line chips in the list already are.
30 Oct morning, measured best case (Friday, quiet, front of the train, platform 6): stepping off the train to the
subsurface platform took 3 min 05 s (log: [`data/interchanges/2026-10-30-kings-cross-to-sub-surface-lines.md`](../../data/interchanges/2026-10-30-kings-cross-to-sub-surface-lines.md)).
**The model was not changed to 185 s**, because the walk here counts from "arrived": the first fix within 400 m of
King's Cross, which comes while the train is still pulling in (that morning the app had "arrived 08:39"; Sam stepped
off at about 08:40:45). From 08:39 the model at fast pace (6 min × 0.82 ≈ 4 min 55 s) gives about 08:43:55 to
08:44:54; Sam reached the platform at about 08:43:50, so it was within a minute and slightly cautious. 185 s from
08:39 would have put him on the platform at about 08:42, so the app would have recommended a Met that he missed by
about 10 s. Options for using the measurement are with Sam (see "Open").

## Acceptance criteria
- The walk to the platform counts from when you arrived at the station; you can be on the platform no sooner than
  1 minute from now; an arrival time in the future counts as now.
- Departures you can make: those leaving at or after you can reach the platform, at most 6 (configurable). Best =
  earliest arrival at your destination (a later departure on a faster line can win); equal arrivals go to the
  earlier departure. Minutes to spare are whole minutes, rounded down.
- A departure can offer several stops to get off at; the earliest arrival is used (ties: the earlier stop) and the
  others are kept.
- Departures before you can reach the platform, but not within 30 s, are offered "if you're near the platform".
- You can pick the one you're getting. The pick is matched by vehicle when known; otherwise the same line's
  departure nearest the picked time, within 3 minutes; never a different known vehicle. When TfL moves its time,
  the pick follows it. The list's highlighted row is always the card's tube; after you pick, "near the platform"
  isn't offered. A pick earlier than we'd expect you can reach is said ("tight"), not overruled.
- Once it leaves you're on it until within 300 m of your stop, or 10 minutes after the ride time; passing stations
  (e.g. Farringdon) or a stray fix don't end it or change which station you arrived at. A ride clears the pick.
- "Did you get it?" only on a good (≤50 m), fresh (≤1 min) fix within the station's radius, 3+ minutes after it
  left, unless you've said yes. "No, still here" treats you as on the platform, so a tube about a minute away is
  catchable. "On a different tube?" switches to one that has left.
- Back at the station after minutes without a fix is "you're at the station", not on a tube that has gone.
- Fastest arrival wins across lines and stops: at King's Cross and Farringdon with live tubes, the H&C to Aldgate
  East competes with Circle/Met to Aldgate, each with its own ride time. H&C problems are shown at King's Cross; on
  a tube, "Your lines" is that tube's line. Going home from Aldgate the H&C stays a fallback (service frequency).
- Planning before you reach London (no live tubes): Aldgate East only when Circle and Met are both closed; severe
  delays on both are a "bad" flag.
- Without live tube times, the app says so and estimates.
- The lozenge naming your tube ("Get on the H&C to Barking", "You're getting…", and on the tube "You're on / Probably
  the … Met") is that line's colour, the same tokens as the line chips: Circle `--circle` (yellow), Met `--met`
  (magenta), H&C `--hc` (light pink). A line the app doesn't know keeps the default lozenge; "Get on the next Circle
  or Met" (no live times, two lines) keeps it too.

## Open
- King's Cross rail → subsurface platform: one best-case measurement of 185 s from stepping off (30 Oct). To use it,
  the walk would need to count from when you step off (or the train stops), not from the first fix within 400 m.
  Until Sam decides, the setting stays 6 min (fast ≈ 4 min 55 s from the first fix), which matched 29 and 30 Oct.

## Tests
- tests/core/engine.test.mjs: "planConnection: walk counted from arrival; near-platform departures; fastest arrival wins; your pick; spare time"
- tests/core/engine.test.mjs: "Rides: last until your stop or the ride time is over; asked only on a good, fresh fix back where you started"
- tests/core/engine.test.mjs: "bestConnections: per station, the earliest arrival you can still make; ties go to the earlier stop; cancelled never"
- tests/rules.test.mjs: "At King's Cross: the walk to the tube counts from when you arrived; tubes you might just make are listed, marked"
- tests/rules.test.mjs: "Tube ride: pick your tube at King's Cross; once it leaves you're on it, passing Farringdon or a stray fix doesn't undo it; asked if you're clearly still there"
- tests/rules.test.mjs: "Aldgate East only when Circle and Met are both closed; severe delays on both are a 'bad' flag"
- tests/app.test.mjs: "Morning at King's Cross: which tube to get on and when you'll be at the office"
- tests/app.test.mjs: "At King's Cross: the lozenge naming your tube is that line's colour (H&C pink, Circle yellow, Met magenta)"
- tests/app.test.mjs: "At King's Cross without live tube times: says so and estimates"
- tests/app.test.mjs: "On the tube: works out which one from when you left King's Cross and follows it to Aldgate"
- tests/rules.test.mjs: "On the tube: within 25 min of the station, a tube has left, and either you've left the station or the fix is over 90 s old"
- tests/rules.test.mjs: "Which tube: the one that left nearest to when you were last seen; a second within 3 min is 'or'"
- tests/golden.test.mjs: "golden: at King's Cross in the morning: which tube"
- tests/golden.test.mjs: "golden: Circle and Met closed: Aldgate East fallback"
- tests/core/connections.test.mjs: "Ready: never sooner than a minute from now; arrival in the future counts as now"
- tests/core/connections.test.mjs: "At most 6 departures you can make by default (or `max`); a departure exactly at ready is catchable"
- tests/core/connections.test.mjs: "Equal arrivals: the earlier departure wins; minutes to spare round down"
- tests/core/connections.test.mjs: "Your pick: matched on line, by vehicle when known, and kept when the live time moves"
- tests/core/connections.test.mjs: "A pick with a known train never switches to a different known train"
- tests/core/connections.test.mjs: "A pick without a vehicle: the same line's departure nearest to the picked time, within 3 min"
- tests/core/connections.test.mjs: "Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept"
- tests/core/connections.test.mjs: "Rides end 10 min after the ride time (not before); 'did you get it?' only within the station radius"
- tests/core/connections.test.mjs: "A ride ends only within 300 m of your stop"
- tests/rules.test.mjs: "Review A: back at King's Cross after a gap of minutes is 'you're at King's Cross', not 'on the tube' you missed"
- tests/rules.test.mjs: "Review: at Farringdon with live tubes, office times use Farringdon's rides (Circle 7 min, H&C 8 min)"
- tests/rules.test.mjs: "Review: H&C to Aldgate East is the pick when it arrives sooner even though it leaves later"
- tests/rules.test.mjs: "At King's Cross: an H&C to Aldgate East is the pick when it gets you to the office sooner"
- tests/rules.test.mjs: "Review: 'Did you get it?' — No resets the walk: the next tube a minute or two away is the pick"
- tests/rules.test.mjs: "Review: tapping a tube that's leaving now makes it your ride; picks expire; 'On a different tube?' offers the others"
- tests/rules.test.mjs: "Review: at King's Cross the list's best row is the tube on the card; after you pick, 'near the platform' isn't offered"
- tests/rules.test.mjs: "Review: H&C problems are shown at King's Cross; the line strip on a tube is that line's"
- tests/rules.test.mjs: "Review 2: the page uses the phone's own fix time; a picked train counts as moving; riding doesn't move your station; a ride clears the pick"
- tests/rules.test.mjs: "Review 3: a picked tube that's delayed starts your ride at its new time; GPS drift at home isn't leaving"
- tests/rules.test.mjs: "Review 3: on an H&C ride, 'Your lines' is the H&C"
