# Tube home decides the train
Status: Done · Since: 28 Oct 2026 (evening trip); on the generic connection model 29 Oct afternoon (plan 2b-iv);
picks only 30 Oct 15:48, reverted 30 Oct evening (worked out again); at Aldgate plans from the platform, 30 Oct evening;
Met platform and measured run, 31 Oct morning

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
  Aldgate. That gives the Circle only: TfL lists the Met at Aldgate only as arriving.
- **Met departures from Aldgate (31 Oct; Sam: "I do not accept this isn't available from TfL")**: every westbound Met
  at Liverpool Street (the next stop) came from Aldgate, and TfL predicts it there with its turnaround included. Each
  such prediction less **90 s** is a Met departure from Aldgate, with TfL's destination (or "towards"), never "Aldgate"
  or "Check Front of Train". One extra request (Liverpool Street) each time Aldgate is fetched. If it fails (an error, a
  429, a hang until the request times out, or an "OK" that isn't a list, e.g. a Wi-Fi sign-in page), the Circles from
  Aldgate still show. Exception: a 429 starts the app's usual 60 s TfL back-off, so the next refresh's Aldgate request
  waits too (as any TfL 429 does). A Met listed twice (two platforms at Liverpool Street, or already in Aldgate's own
  westbound list) appears once, at the earlier time (Aldgate's own when it has one); a Circle sharing its vehicle number
  never hides it. Engine: `terminusDepartures` (generic: any terminus and its next stop); the next stop and run are
  profile data (`officeStops` ALD `startsHere`).
- **The 90 s is measured (31 Oct, Saturday 09:00–09:25, 75 polls 20 s apart, 5 Mets seen leaving):** TfL's first
  Liverpool Street prediction after a Met left Aldgate was 90–95 s after it left (every Met's window overlaps only
  there). The timetable's 2 min made every departure about 30 s early. With 90 s, in the last 2 minutes before a Met
  leaves the app's time is a median 10 s early, at most 46 s early and 17 s late; further ahead, median 18–26 s early,
  at most 89 s early and 33 s late. The biggest early errors are Mets already standing at the platform and running late
  (431, 406: TfL predicts them leaving almost at once and slips as they wait); no run value fixes that.
- **Platform for a Met (31 Oct):** a Met standing at Aldgate has its platform in TfL's location at Liverpool Street
  ("At Aldgate Platform 3"; every Met standing there on 30 Oct 22:43 and 31 Oct 09:00–09:25), so its button reads
  "Platform 3: 2 Met Uxbridge · 1 min" like the board. A Met not yet at Aldgate has no platform: Aldgate's own feed
  lists an arriving Met under both bays (2 and 3) and which one it really uses can't be told in advance (432 was listed
  "towards Aldgate" at 2 and arrived at 3; 433 and 434 both used 2).
- **TrackerNet (TfL's per-platform feed, what the boards are thought to use) is not used (31 Oct):** TfL refuses Sam's
  key on every TrackerNet endpoint (401 "invalid subscription key"; PredictionDetailed M and H at ALD,
  PredictionSummary, LineStatus, StationStatus; key as query or header), while the same key gets 200 from the unified API
  and a made-up key gets 429 at TfL's gateway. TfL's portal lists TrackerNet as its own product
  ("TrackernetFeedPublic"); on its portal each product subscription has its own key, so the key we have is most likely
  the "500 Requests per min" one (inference). Recorded: `tests/fixtures/tfl-2026-10-31T0859Z/trackernet-ALD.json`.
- Checked against TfL's recorded feeds (30 Oct 22:43): Met 441 waiting at Aldgate platform 2 → leaves 22:44:41; 435
  still arriving → 22:53:11 (TfL's turnaround); 474 → 23:05:12. 31 Oct 08:59: 431 at platform 3 → 09:01:20 (left
  09:02:29–09:03:08), 406 at platform 2 → 09:03:51 (left 09:04:47–09:05:29). Not yet checked against the board on the
  platform. TfL's timetable (`Line/metropolitan/Timetable/940GZZLUALD`) lists the Mets from Aldgate (Saturday every 5
  min, with destinations); the live Mets matched it in order, running 0–5 min late, so it adds nothing a live train
  doesn't already say. Independent review (31 Oct, first version): consistent with Moorgate's predictions to ±30 s;
  TfL's turnaround at Aldgate 4 min; the one Met starting elsewhere (Moorgate bay) never appears at Liverpool Street,
  so it's rightly not listed.
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
  Buttons read like Aldgate's single combined westbound list: "Platform 1: 3 Met Amersham · 11 min" (platform when
  they're on more than one, place on the list, line in its colour, destination, minutes ticking; 30 Oct, Sam: the
  countdown is unique to each train). Golden: the evening goldens show them.
- Once your tube leaves (picked or worked out) you're on it until within 300 m of the stop the app chose, or 10
  minutes after the ride time: passing Farringdon on the way to King's Cross doesn't end it. "Got off already? At …"
  ends it. "On a different tube?" switches to one that has left (up to 3 within 6 min of yours, nearest first; 30
  Oct); its buttons say how long ago each left ("left 7 min ago").
- The card says where your tube is going: "Probably the Circle to Edgware Road that left Aldgate at 16:46" (30 Oct;
  kept with the ride, so a pick saved before this shows no destination).
- A ride that's over (reached the stop, or its time is up) is cleared, so an old one, even yesterday's, never stops
  tonight's tube being worked out. A tube you picked that hasn't left yet wins: nothing earlier is worked out over it.
- Aldgate is noted only from a fresh fix (90 s): underground the last fix still reads Aldgate, and re-noting it would
  move "seen" past the tube you took. (Independent review, 30 Oct evening.)
- Leisure going home at Aldgate plans as before (its routes have no tube; this crashed from 18:35 to the fix).
- **Whole evening:** once you've left the office (at Aldgate, underground, passing Moorgate or Farringdon, got off),
  the card never times the journey from the office.
- Still at Aldgate with a good (≤50 m), fresh fix 3+ minutes after your tube left: "Did you get it?". "No, still
  here" looks for the next tube, not the one you missed.
- A ride home is never treated as a ride to work, or the reverse.
- Signal's [overall/current-leg progress](journey-progress.md) uses this same selected/inferred ride, target and
  connection. A matching fresh known-vehicle target prediction can qualify arrival; the position between Tube
  stops remains an estimate. Do not turn the terminus-derived departure or route sequence into a fictitious
  live position or alter which rail connection the ordinary engine chooses.

## Tests
- tests/core/terminus.test.mjs: "Met departures from Aldgate, from TfL's real Liverpool Street arrivals (recorded 30 Oct 22:43): each westbound Met less the 2-min run"
- tests/core/terminus.test.mjs: "terminusDepartures: only the line and outbound direction; past trains dropped (30 s grace); destination never the terminus or 'Check Front of Train'"
- tests/rules.test.mjs: "Met departures from Aldgate (31 Oct): from TfL's Liverpool Street arrivals less the measured 90 s, recorded 30 Oct 22:43 with Aldgate's; offered like the board"
- tests/rules.test.mjs: "Met platform at Aldgate (recorded 31 Oct 08:59, Saturday): the Mets standing at platforms 3 and 2 show them, like the board; a Met still arriving shows none"
- tests/core/terminus.test.mjs: "Met platform at Aldgate (recorded 31 Oct 08:59): a Met standing there has TfL's platform; one still arriving has none"
- tests/core/terminus.test.mjs: "Met departures from Aldgate, measured run (31 Oct 09:00–09:25, 75 polls): TfL predicts Liverpool Street 90–95 s after a Met leaves, so the profile's 90 s"
- tests/core/terminus.test.mjs: "terminusDepartures platform: only 'At <terminus> Platform N' for the named terminus; not Aldgate East, not approaching, not without a name"
- tests/rules.test.mjs: "Met departures from Aldgate, review: Liverpool Street refusing (429), hanging, or answering OK with a page or an object never loses the Circles; a Met isn't listed twice"
- tests/core/terminus.test.mjs: "terminusDepartures: anything but a list (an error page, an object) gives none"
- tests/both-designs.test.mjs: "Both designs: the 30 Oct going-home tube and Aldgate rules pass in Signal too" (re-runs this story's rules tests with the Signal design on; the whole-evening test checks which design is on screen)
- tests/rules.test.mjs: "Whole evening, 30 Oct: desk, Aldgate, underground, Moorgate, Farringdon — once you've left, the card never times from the office"
- tests/rules.test.mjs: "Aldgate's real feed (recorded 30 Oct 19:32): westbound Circles are kept; Met arrivals ending at Aldgate, phantom H&C and eastbound Circles are not"
- tests/rules.test.mjs: "Review 30 Oct: an old finished ride doesn't stop tonight's tube being worked out; a pick that hasn't left wins"
- tests/rules.test.mjs: "Review 30 Oct: underground, a refresh doesn't re-note Aldgate from the old fix; got off ends it for good; never going to work or in leisure"
- tests/core/situation.test.mjs: "Going home by tube, boundaries (independent review 30 Oct): 25 min window, a train or a London station, away from the office, tubes before you arrived"
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
- tests/rules.test.mjs: "Review: going home, 'On a different tube?' at Aldgate lists the nearest to yours first"
- tests/rules.test.mjs: "Both designs (panda): going home at Aldgate — the combined list with platforms; on the tube, its colour and 'left N min ago'"
- tests/rules.test.mjs: "Both designs (signal): going home at Aldgate — the combined list with platforms; on the tube, its colour and 'left N min ago'"
- tests/core/connections.test.mjs: "Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept"
- tests/core/situation.test.mjs: "onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate"
- tests/core/situation.test.mjs: "Going home by tube: noted at Aldgate; on a tube once one has left and you've gone; which one"
- tests/core/refresh.test.mjs: "tubeHomeConnections: arrival at each London station and the time needed there, at your pace"

## Not yet / open questions
- Met departures: to confirm against the board on the platform, and at a weekday peak (the 90 s was measured on a
  Saturday morning, 5 departures, 20 s polls; TfL's responses can lag by up to ~30 s). A late-running Met already at
  the platform shows as leaving up to ~1½ min before it does (TfL's prediction, not ours). A hanging Liverpool Street
  request delays the Aldgate list until it times out. Without a TfL key, the extra request uses more of TfL's keyless
  limit.
- A Met's platform is known only once it's standing at Aldgate; the board may show it earlier.
- TrackerNet: if Sam's key gets the TrackernetFeedPublic product (a second key, then a second key field in Settings),
  prove it against live data and, if it has real Aldgate departures by platform, make it the primary source with this
  as the fallback. Its set numbers vs the unified API's vehicleId are unchecked.
- A rough fix at Aldgate (worse than 150 m) isn't noted, so underground afterwards the card still times from the
  office. Accepted for now: loosening it brings the desk closer to counting as Aldgate.
- At the desk with a still phone, a worked-out tube has no "No, still here" until a fresh fix arrives (that question
  needs a good fix under 1 min old); each tube that leaves can bring the card back. Known trade-off of the revert.
- The invented Aldgate feed in the going-home tests includes westbound Met departures that the real feed never has
  (the real recorded feeds are tested separately).
- Live tab (Sam, 30 Oct evening): live tracking separate from Leave now / Arrive by / Leave around; planned.
- Aldgate East (H&C) has no live departures in the app going home; the H&C stays a fallback.
