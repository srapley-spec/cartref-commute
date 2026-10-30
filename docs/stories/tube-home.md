# Tube home decides the train
Status: Done · Since: 28 Oct 2026 (evening trip); on the generic connection model 29 Oct afternoon (plan 2b-iv);
picks only 30 Oct 15:48, reverted 30 Oct evening (worked out again); at Aldgate plans from the platform, 30 Oct evening

## Story
As a commuter leaving the office, I want the next tubes from Aldgate and, once underground, where to get off for
the earliest home time, so that the tube I catch decides the train rather than the other way round.

## Where it came from
28 Oct evening: the plan assumed a tube; which tube Sam caught changed which train home was best.
29 Oct afternoon: moved from bespoke code onto the generic [connection model](connections.md) (Sam: "generic
engine, bespoke data"), so going home gets the same pick / ride / "did you get it?" behaviour as the morning. The
golden recordings were unchanged apart from the new pick buttons.
30 Oct 15:37, at his desk: the app showed "On the tube · worked out from when you left Aldgate · Probably the Circle
that left Aldgate at 15:29". Indoor GPS put the desk (313 m away) at Aldgate, a tube left, and a phone lying still
gets no location update for 90 s, which looks like being underground. At 15:48 the tube home became picks only.
30 Oct 18:24–18:32, the real trip: at Aldgate (±7 m) the top card still said "Leave 18:28" (timed from the office) and
the status line said "you're in London"; the tubes offered were Circles 10, 16 and 27 min away while the board had a
Met leaving in 2 min. The Met wasn't pickable, so under picks-only the app had no idea Sam was on a tube: at Moorgate
it still timed the journey from the office. Sam chose to revert 15:48 (the desk false alarm is harmless; missing
that you're travelling isn't) and to separate live tracking from planning with a Live tab
([architecture](../architecture.md), planned).
TfL's real Aldgate feed (recorded 30 Oct 19:32, `tests/fixtures/tfl-aldgate-arrivals-2026-10-30T1932Z.json`): Met
trains appear only as arrivals ending at Aldgate (destination Aldgate or none, "Northbound - Platform 2/3"), plus
phantom H&C entries for the same vehicles. No Met departure from Aldgate is in this feed, so the app has never listed
the Met going home. TfL's Met timetable from Aldgate has them (Fridays 18:23, 18:26, 18:30, 18:34 …).

## Acceptance criteria
- Near the office: the next westbound tubes from Aldgate you can make, each with where to get off, its train home,
  home time and when to leave. At Aldgate, tubes you might just make are offered "if you're near the platform".
- Which tubes count: westbound platform only (the Circle runs both ways through Aldgate), never one ending at
  Aldgate. With the real feed that is only the Circle (see Not yet).
- Where to get off: Farringdon or King's Cross, whichever gets you home soonest with the trains loaded; ties go to
  the earlier stop. Arrival at each London station and the time needed there are worked out at your pace.
- **At Aldgate going home** (within 150 m, fix good to 150 m): every commute option plans from the platform: the walk
  from the office goes, the platform walk stays, and Journey steps start "You're at Aldgate: go to the platform". The
  status line says "you're at Aldgate". A rougher fix, or going to work, changes nothing. When Circle and Met are
  closed (H&C from Aldgate East) the office walk is kept (an overestimate from Aldgate).
- Aldgate is noted within 150 m (the tubes due then); at Aldgate with a fresh fix you're not on a tube; no tube has
  left yet means not on one; a second tube within 3 min is "or".
- **Worked out:** seen at Aldgate in the last 25 min, a tube has left since, and you've gone (no fix for 90 s+, or a
  fix away from the office): "Probably the Circle that left Aldgate at 16:46". A tube you picked always wins.
  Known trade-off (30 Oct 15:37): indoor GPS can put the desk at Aldgate, so this can show at the desk; "No, still
  here" or the planning tabs clear it.
- "Which one are you getting?" near the office and at Aldgate; your pick follows its vehicle if TfL moves its time.
  Buttons read like Aldgate's single combined westbound list (platform when more than one, place on the list, line
  in its colour, destination, minutes ticking).
- Once your tube leaves (picked or worked out) you're on it until within 300 m of the stop the app chose, or 10
  minutes after the ride time: passing Farringdon on the way to King's Cross doesn't end it. "Got off already? At …"
  ends it. "On a different tube?" switches to one that has left; its buttons say how long ago each left.
- **Whole evening:** once you've left the office (at Aldgate, underground, passing Moorgate or Farringdon, got off),
  the card never times the journey from the office.
- Still at Aldgate with a good (≤50 m), fresh fix 3+ minutes after your tube left: "Did you get it?". "No, still
  here" looks for the next tube, not the one you missed.
- A ride home is never treated as a ride to work, or the reverse.

## Tests
- tests/rules.test.mjs: "Whole evening, 30 Oct: desk, Aldgate, underground, Moorgate, Farringdon — once you've left, the card never times from the office"
- tests/rules.test.mjs: "Aldgate's real feed (recorded 30 Oct 19:32): westbound Circles are kept; Met arrivals ending at Aldgate, phantom H&C and eastbound Circles are not"
- tests/rules.test.mjs: "Going home, 30 Oct 18:24: at Aldgate the card plans from the platform, not the office; the status line says Aldgate"
- tests/core/plan.test.mjs: "Routes home; from where you are (walk to Letchworth, or already at King's Cross); leisure"
- tests/rules.test.mjs: "Tube going home: at Aldgate the next tube is noted; underground the card says which tube and where to get off"
- tests/rules.test.mjs: "Tube going home: Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means not on one; a second tube within 3 min is 'or'"
- tests/rules.test.mjs: "Going home: tubes from Aldgate get off where you're home soonest; pick one; once it leaves you're on it"
- tests/rules.test.mjs: "Going home: passing Farringdon doesn't end the ride to King's Cross; 'Got off at Farringdon' does"
- tests/rules.test.mjs: "Going home: still at Aldgate with a good fix 4 min after your tube left — asked; No keeps you at Aldgate"
- tests/rules.test.mjs: "Going home: your picked tube follows a delay (by vehicle)"
- tests/rules.test.mjs: "Going home 2: the ride heads for the best stop and ends there or when its time is over; morning and evening rides never mix"
- tests/rules.test.mjs: "Going home 2: 'On a different tube?' switches you to one that has left; after 'No, still here' the app looks for the next one"
- tests/core/connections.test.mjs: "Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept"
- tests/core/situation.test.mjs: "onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate"
- tests/core/situation.test.mjs: "Going home by tube: noted at Aldgate; on a tube once one has left and you've gone; which one"
- tests/core/refresh.test.mjs: "tubeHomeConnections: arrival at each London station and the time needed there, at your pace"

## Not yet / open questions
- **Met departures from Aldgate are missing** (TfL's arrivals don't have them). Proposed: TfL's Met timetable from
  Aldgate (fetched once a day), confirmed by arriving vehicles. A new request: Sam to agree; GitHub-first merge.
  Until then, a worked-out tube can be the wrong one when you took a Met.
- The invented Aldgate feed in the going-home tests includes westbound Met departures that the real feed never has.
- Live tab (Sam, 30 Oct evening): live tracking separate from Leave now / Arrive by / Leave around; planned.
- Aldgate East (H&C) has no live departures in the app going home; the H&C stays a fallback.
