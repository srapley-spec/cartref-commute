# Start from the nearest station (not at home)
Status: Done (opt-in from the header, for today only; not behind an Experimental toggle: the default commute is
unchanged until you tap it) · Since: 31 Oct 2026

## Story
As Sam, when I'm somewhere other than home (31 Oct: demoing the app to people somewhere in Hitchin), I want to tap
once and have the app find the nearest station on my line, give me a rough walk there from where I am, and do
everything else exactly as the normal commute does, so that the plan is from where I actually am, not from Cartref.

## Where it came from
31 Oct, Sam: "a commute but not from home option which I can click on and it would identify the nearest railway
station, which I'm almost certain will be Hitchin, and give me a rough walking time to that station with the rest of
the functionality identical to the normal commute." Later the same day: the demo is in Fairfield, so "the nearest
station could either be Arlesey or Letchworth, and you'll have to work that out from the location". Fairfield is
roughly as far from one as the other (~2.5 km vs ~3 km, approximate: not geocoded), so the app also offers the other
stations nearby with their walks.

## How it works
- Engine (`src/core/startStation.ts`, generic): the profile lists stations you may start from (`startStations`,
  each with its own position or one from `stationGeo`). `startStationsNear` lists those within 10 km, nearest first. `nearestStartStation` picks the nearest of those and the home station within 10 km.
  `profileFromStation` derives the same profile with that station as the local one: trains from and to it (boards
  `HIT-KGX`…), its position for "near the station" and direction, the line from there to each London station, the
  busy-train rule moved to it, notices naming it counted as on your route, and the home station kept as a choice.
  A station off the line (Arlesey) joins it where it's nearest: Arlesey → Hitchin → London. Stopping thresholds, entry/exit allowances and all London timings are shared.
- Routes (`samRoutes`, `start`): away from home the first step is "Set off from where you are", never "Leave
  Cartref"; nothing starts at home (no car). Going back, the trip ends at that station ("Arrive Hitchin"), with no
  walk to Cartref.
- Page: one line in the header, in both designs. Choosing reloads the page (the station is part of the profile the
  page is built on). The choice is saved as `startFrom: { code, day }` and only applies on that day.

## Acceptance criteria
- At home the header shows "Not at home? Start from the nearest station". Tapping it with a fix good to 1 km picks
  the nearest start station within 10 km, saves it for today and reloads.
- No fix yet, or no start station within 10 km: the header says why and lists the stations to pick from
  (Letchworth · Hitchin · Arlesey), with Cancel. Nothing is saved until one is picked.
- Starting from Hitchin: the header says "Starting from Hitchin (about N min walk) today, walking from where you are",
  then up to two other start stations within 10 km, nearest first, each as "<Station> instead (about N min walk)"
  (one tap switches, for today), then "Back to home";
  the route label is "Near Hitchin → 20 Mansfield Street"; live boards are requested from Hitchin only (`HIT`); all
  options are trains from Hitchin.
- The walk to the station is the straight line × 1.3 from where you are at your pace (5 km/h average, 6 fast,
  4.3 leisure), up to 5 km; the saved home and its measured walk don't apply. "On your way to Hitchin" shows from
  the first good fix (no "left home" test). Without a fix the walk is your usual home walk, labelled as such.
- Hitchin journey times (live, 31 Oct, Saturday): King's Cross 49 min (stopping Great Northern), St Pancras 33–34,
  Farringdon 38–39 (Thameslink). The shared stopping thresholds (45/45/52) flag the 49-min train as stopping and not
  the Thameslink ones. A late train expected to make up time is judged on its expected times (11:33: 44 min).
- In Fairfield (~2.5 km from Arlesey, ~3.2 km from Letchworth): the nearest is Arlesey (about 39 min walk);
  "Letchworth instead" is offered. Starting from Letchworth while away plans from Letchworth with the walk from
  where you are, never from Cartref.
- Arlesey journey times (live, 31 Oct, Saturday): Thameslink (Peterborough) every 30 min, St Pancras 39 min,
  Farringdon 44; no direct King's Cross train in the 2 hours shown. Not stopping trains by the shared thresholds.
- "Back to home" clears it and reloads. A choice from another day, or an unknown station, is ignored: the app is
  the Letchworth commute exactly as before.
- Only Hitchin and Arlesey are offered besides Letchworth. A station is added only after its live times are checked against
  the stopping thresholds (Stevenage not checked; its stoppers may be under 45 min).

## Tests
- tests/start-station.test.mjs: "Start station: the nearest station you can start from, within 10 km; none in London"
- tests/start-station.test.mjs: "Start station: Arlesey's profile joins the line at Hitchin; the home station stays a choice while away"
- tests/start-station.test.mjs: "In Fairfield: the nearest is Arlesey, Letchworth is offered with its walk, and one tap switches"
- tests/start-station.test.mjs: "Starting from Arlesey: boards from Arlesey, real Thameslink trains planned (31 Oct recording)"
- tests/start-station.test.mjs: "Start station: Hitchin's profile has trains from Hitchin and the line from Hitchin; home and unknown codes leave it unchanged"
- tests/start-station.test.mjs: "Start station: routes from Hitchin set off from where you are and come back to Hitchin, never Cartref"
- tests/start-station.test.mjs: "At home the header offers 'Start from the nearest station'; in Hitchin it chooses Hitchin for today and reloads"
- tests/start-station.test.mjs: "Without a location, or with none near, the header lets you pick the station instead"
- tests/start-station.test.mjs: "Starting from Hitchin: trains from Hitchin, the walk from where you are, and 'Back to home' clears it"
- tests/start-station.test.mjs: "Starting from Hitchin: live boards are requested from Hitchin, and real Hitchin trains are planned (31 Oct recording)"
- tests/start-station.test.mjs: "Starting from a station is for today only; an unknown station is ignored"
- tests/start-station.test.mjs: "Starting from Hitchin works in the Signal design too: the header line stays visible"
- Recorded data: tests/fixtures/darwin-hit-2026-10-31T1130Z.json and darwin-arl-2026-10-31.json (Darwin boards from
  Hitchin and Arlesey to KGX/STP/ZFD, no key).

## Not yet / open questions
- "Nearest" is by straight-line distance, not by which station gets you there first. Where two are close (Fairfield),
  the other is one tap away with its walk; comparing their trains automatically is the discovered-alternatives
  work (#13).
- The walk is a straight-line estimate (× 1.3), not a routed walk; it can be several minutes out where streets
  wind or the station entrance is on the far side.
- Entry and exit allowances are Letchworth's (2 min in, 1.5 min out), not measured at Hitchin.
- Going back while starting elsewhere ends at that station; "Nearly home" still counts the walk to your saved home.
- The journey simulator still assumes Letchworth; don't use it while starting from another station.
- Only stations on the profile's line; anywhere else needs discovered alternatives (#13) and a place picker (#25).
