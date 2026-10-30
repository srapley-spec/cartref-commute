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
30 Oct: Sam asked that tubes you pick be identified by their order on the platform's dot-matrix board and minutes
until arrival, "the only real way to identify them that a user has access to"; clock times like "08:42 Met" aren't
on the board. Once on the tube, "left 4 min ago" works (Sam). Aldgate has a single combined list as well as
per-platform boards, and each train's countdown is unique (Sam).
30 Oct morning, measured best case (Friday, quiet, front of the train, platform 6): stepping off the train to the
subsurface platform took 3 min 05 s (log: [`data/interchanges/2026-10-30-kings-cross-to-sub-surface-lines.md`](../../data/interchanges/2026-10-30-kings-cross-to-sub-surface-lines.md)).
**The model was not changed to 185 s**, because the walk here counts from "arrived": the first fix within 400 m of
King's Cross, which comes while the train is still pulling in (that morning the app had "arrived 08:39"; Sam stepped
off at about 08:40:45). From 08:39 the model at fast pace (6 min × 0.82 ≈ 4 min 55 s) gives about 08:43:55 to
08:44:54; Sam reached the platform at about 08:43:50, so it was within a minute and slightly cautious. 185 s from
08:39 would have put him on the platform at about 08:42, so the app would have recommended a Met that he missed by
about 10 s. Options for using the measurement are with Sam (see "Open").
30 Oct morning, the same trip: GPS went quiet underground (last fix about 08:41). 90 s later the 08:40 Circle
counted as "a tube has left", so the app put Sam on it while he was still walking down (by its own walk he couldn't
be on the platform before about 08:44). "On a different tube?" listed the earliest three that had left, so the only
H&C on offer was the 08:38; picked, it said Aldgate East 08:49 (he was at Farringdon) and the office 08:56 (he was
at his desk 09:05). He caught the H&C due 08:45. Fixed the same day: only a tube you could have caught counts, and
the others are nearest first. Whether the list was exactly that when he picked is inferred from the code, not seen.
Independent review (30 Oct): "arrived" is the app's first fix at the station, which is late if the app was opened
on the platform: adding the walk then hid the tube Sam was on ("Probably the 08:48 Met" for the 08:45 H&C). Second
round: the same with the phone locked on the train and unlocked on the platform. Fixed: the walk counts from the
last fix away from a station, and never earlier than the first fix at the station. Third round: a coarse first
fix at the station counted as "away"; now only a fix confidently away from every station does. Also: after "No, still here" a tube that had just left could
still be guessed (fixed: no slack then); a test assertion that couldn't fail; 12 untested boundaries, now pinned.

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
- A tube you picked that hasn't left yet wins: while you wait for it, an earlier tube leaving (and the phone going
  quiet) never makes the app work out that you're on that one (30 Oct, same rule as going home).
- "Which one are you getting?" (King's Cross, Farringdon) reads like the platform's dot-matrix board, the only
  way to tell tubes apart on the platform: place on the board (1 = next, among the eastbound tubes still shown,
  i.e. leaving no more than 30 s ago), the line in its colour, destination (a "(… Line)" suffix dropped), and
  minutes, rounded down, "due" under a minute, ticking every second. The first 4 you could pick, in board order.
  When they're on more than one platform, each says "Platform N:" first. The board's own rounding (down vs
  nearest, when "due" shows) is unverified: Sam to compare on the platform.
- Once you're on the tube the board is gone: "On a different tube?" buttons say the line (coloured), destination
  and how long ago it left ("left 4 min ago", rounded down; "just left" under a minute; "leaving now" if due in
  the next 30 s), ticking (Sam, 30 Oct). Going home the same.
- On the tube, the card names your tube with its destination: "You're on the 07:56 Met to Aldgate" (and "or the …"
  likewise), as on the tube's front and the board; the destination is kept with your pick and ride (30 Oct).
  → [which-train](which-train.md)
- Once it leaves you're on it until within 300 m of your stop, or 10 minutes after the ride time; passing stations
  (e.g. Farringdon) or a stray fix don't end it or change which station you arrived at. A ride clears the pick.
- "Did you get it?" only on a good (≤50 m), fresh (≤1 min) fix within the station's radius, 3+ minutes after it
  left, unless you've said yes. "No, still here" treats you as on the platform, so a tube about a minute away is
  catchable. "On a different tube?" switches to one that has left.
- Worked out (not picked): you're on a tube only once one **you could have caught** has left: leaving no more than
  1 minute before the earliest you could be on the platform. That earliest is:
  - the later of **(the last fix this session confidently away from every station + the walk, at your pace)** and
    **(the first fix at this station)**. Confidently away: good to 250 m and further than 400 m + its accuracy from
    each station, so a coarse fix at the station (the first one underground) doesn't count: you can't have arrived before you were last seen away, nor been here before the app
    first saw you. Running all along (fixes seconds apart), that's arrival + walk. Locked on the train and unlocked
    on the platform, the walk counts from the last fix on the train. Opened (or reloaded) at the station, or asleep
    for longer than the walk: the first fix here, no walk. A gap before arriving (a tunnel) only ever makes earlier
    tubes count, never hides one;
  - **after "No, still here"**: that moment exactly (no minute's slack);
  - **no visit to this station recorded** (or one at another station): any tube that has left counts (as before).
  The guess is the one of those leaving nearest to when you were last seen, or to the earliest you could be on the
  platform if that's later; another within 3 min (not exactly 3) is "or". If somehow none you could have caught
  has left (e.g. an older worked-out ride redrawn after the visit changed), the guess is the nearest that has.
- "On a different tube?" lists up to 3 that have left (or leave within 30 s), less than 6 min from yours, **nearest
  to yours first** (ties: the earlier); earlier ones you'd have had to be quick for are kept. Same going home.
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
- tests/rules.test.mjs: "Morning, 30 Oct: a tube you picked at King's Cross that hasn't left wins over working out an earlier one"
- tests/rules.test.mjs: "Tube ride: pick your tube at King's Cross; once it leaves you're on it, passing Farringdon or a stray fix doesn't undo it; asked if you're clearly still there"
- tests/rules.test.mjs: "Aldgate East only when Circle and Met are both closed; severe delays on both are a 'bad' flag"
- tests/app.test.mjs: "Morning at King's Cross: which tube to get on and when you'll be at the office"
- tests/app.test.mjs: "At King's Cross: the lozenge naming your tube is that line's colour (H&C pink, Circle yellow, Met magenta)"
- tests/app.test.mjs: "At King's Cross: 'Which one are you getting?' reads like the platform board: place, line, destination, minutes"
- tests/core/connections.test.mjs: "The platform board: a tube's place (1 = next) among those still shown, and its minutes rounded down; under 1 is 'due'"
- tests/core/connections.test.mjs: "On the tube the board is gone: a tube that left is told by how long ago (rounded down); platform numbers from TfL's names"
- tests/app.test.mjs: "At King's Cross without live tube times: says so and estimates"
- tests/app.test.mjs: "On the tube: works out which one from when you left King's Cross and follows it to Aldgate"
- tests/rules.test.mjs: "On the tube: within 25 min of the station, a tube has left, and either you've left the station or the fix is over 90 s old"
- tests/rules.test.mjs: "Which tube: the one that left nearest to when you were last seen; a second within 3 min is 'or'"
- tests/core/situation.test.mjs: "onTube / whichTube / otherTubes: only a tube you could have caught (arrival + walk) puts you on it (30 Oct)"
- tests/rules.test.mjs: "30 Oct: GPS goes quiet walking down at King's Cross: not on a tube you couldn't reach; then the H&C you caught, others nearest first"
- tests/core/situation.test.mjs: "otherTubes: boundaries (30 s leaving, 6 min window), ties go to the earlier whatever the list order (review, 30 Oct)"
- tests/rules.test.mjs: "Review: the app opened on the platform: no walk added (you may have arrived long before), so the tube you caught counts"
- tests/rules.test.mjs: "Review: after 'No, still here', a tube that had already left never becomes your ride"
- tests/rules.test.mjs: "Review: arrival at a different station (Farringdon) doesn't limit the tubes at King's Cross"
- tests/rules.test.mjs: "Review 2: locked on the train, unlocked on the platform: the walk counts from when you were last seen away, so the tube you caught counts"
- tests/rules.test.mjs: "Review 2: the app asleep for a long time: no earlier than when it first saw you here; via Farringdon, the last fix away from any station"
- tests/rules.test.mjs: "Review 2: after 'No, still here' a tube leaving 30 s later is catchable (no slack, but no extra margin either)"
- tests/rules.test.mjs: "Review 2: opened on the platform, the earliest is when it first saw you, not 'anything that left'"
- tests/rules.test.mjs: "Review 3: opened on the platform with a coarse first fix (400 m), then a good one: the coarse fix isn't 'away', so the tube you caught counts"
- tests/core/situation.test.mjs: "awayFromHubs: only a fix good to 250 m whose uncertainty can't reach any London station (review, 30 Oct)"
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
