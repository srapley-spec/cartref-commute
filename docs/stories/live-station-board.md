# Live before a journey: the next stop's departure board
Status: Done for Commute and Leisure going home (Signal design); Leisure going out still shows trains to London only (see Not yet) · Since: 31 Oct 2026

## Story
As a commuter at home or in the office with no journey under way, when I tap Live I want to see what's actually
leaving the next stop of my journey right now, and whether I could make each one from here, so that Live gives me
something different from Auto ("when do I leave?") instead of an empty screen.

## Where it came from
Sam, 31 Oct. Before a journey started, Signal's three view buttons showed only two screens: Auto and Plan both showed
the Leave-now plan, and Live showed "No active journey yet. Choose a route to follow, or return to Auto". Sam's idea:
"if it thinks I'm at home and I'm just sitting at home and I click on live, it should show me the live train boards
at Letchworth right now; in Auto, the options for leaving, as now". He then agreed these rules (31 Oct):
1. The board lists what's available at the station. It may flag whether each train is catchable and by which
   route, but it's a list of departures, not a plan.
2. The next stop is the next stop of the journey: from the office, Aldgate. When there are several boarding
   stations, show them all, grouped by station, with station lozenges at the top that jump to each section.
3. Commute: only trains in your direction. Leisure: all departures until a destination is chosen; once one is
   chosen, the options for it.
4. Without a location, ask; never assume you're at home.
5. Plan still being the same as Auto when the question is Leave now is fine.
6. No toggle.

## Acceptance criteria
- **When it shows:** Live (Signal's Auto / Plan / Live control) with no followed journey and no detected journey
  (on the way to the station, at a station, on a train or tube, in London to the office, nearly home all keep their
  own live views). Auto and Plan are unchanged. The Live choice lasts as before (20 minutes or a change of situation).
- **The next stop comes from the routes, not from a list of places** (engine `nextStops`): each route's first
  boarding point, distinct, in route order. That's the route's `firstStop` when the profile gives one (a tube
  before the train), else the station its train leaves from. Sam's commute: Letchworth going to work; Aldgate going
  home (Aldgate East when the Circle and Met are both closed); Leisure going home: King's Cross, St Pancras and
  Farringdon. At a London station going home the next stop is that station (already a live view).
- **Rail stations** (engine `railStationBoard`): every train from that station on your routes, in departure order.
  - A train that left more than 30 s ago drops off; "Delayed" with no estimate stays whatever its time.
  - One train on two boards from the same station (one Thameslink to St Pancras and Farringdon) is one row, naming
    both ("to Farringdon or St Pancras").
  - Each row: Train (timetabled) · Expected · where it takes you · operator, final destination, platform, countdown ·
    the train's own flags (cancelled, late, stopping, standing room, reason) · Arrive (door to door) · Follow.
  - **Can you make it from here** comes from the same options Auto plans from where you are (no second timing
    model): "You can make it", "Fast walk", "Run", "Car needed", or "Can't make it from here" (missed). Where both
    stops of one train are options, the easier one counts. A train no plan covers says "Can't tell yet if you can make
    it" (e.g. Leisure home before the way to the station is planned). Cancelled: no reach label (Cancelled says it).
    No estimate: can't tell. A train you can't make is greyed, never removed.
- **Aldgate** (engine `tubeStationBoard`, connections from `planConnection`): every westbound Circle and Met still
  to come (30 s grace), soonest first: line, time, destination, platform, countdown; where to get off and the train
  home it connects to, and the home time; "You can make it · leave the office by HH:MM" (or "leave for the platform"
  at Aldgate), "Can't make it from here", or, only when you're already at Aldgate, "Only if you're near the platform"
  for one leaving before you'd usually reach it (as Auto offers it). A tube no train home connects with is listed and
  says so.
  - Aldgate's departures load near the office only (the existing request): away from the office Live says "Live
    departures from Aldgate load when you're near the office". No new requests.
  - Circle and Met closed: "No live departures for Aldgate East in the app".
- **Several stations:** one section per station, the station your best option boards at first (then route order),
  each headed with its name, and a lozenge per station at the top (44 px tall) that scrolls to its section. One
  station: no lozenges, no heading; the list title says "Departures from <station>".
- **Heading:** "Live · departures from <stations> · HH:MM" (· timetable when not live) and "No journey under way:
  what's leaving your next stop now, and whether you can make it from here. Auto shows when to leave."
- **Location unknown:** unchanged: "Finding your location" / "Location needed"; no board, never assumes home.
- No new requests, saved data or settings. Signal only (Panda has no Live control). No toggle (Sam, 31 Oct).

## Tests
- tests/core/stationBoard.test.mjs: "nextStops: each route's first boarding point, once each, in route order"
- tests/core/stationBoard.test.mjs: "nextStops (Sam's routes): Letchworth to work; Aldgate from the office, Aldgate East when Circle and Met are closed; the station you're at"
- tests/core/stationBoard.test.mjs: "railStationBoard: every train from the station once, in departure order, departed ones gone, cancelled and no-estimate kept"
- tests/core/stationBoard.test.mjs: "railStationBoard: reach and arrival come from the plan from where you are; the easiest way wins; missed is can't make it"
- tests/core/stationBoard.test.mjs: "railStationBoard: several stations are grouped, the best option's station first"
- tests/core/stationBoard.test.mjs: "tubeStationBoard: every departure still to come, what each connects to, and whether you can make it (early only at the stop)"
- tests/core/stationBoard.test.mjs: "reachFlag: what each reach says on the board"
- tests/live-station-board.test.mjs: "Live at home with no journey: every train leaving Letchworth, each saying whether you can make it"
- tests/live-station-board.test.mjs: "Live in the office going home: Aldgate westbound departures, the train home each connects to, and whether you can make it"
- tests/live-station-board.test.mjs: "Live going home away from the office says Aldgate departures load near the office (no extra requests)"
- tests/live-station-board.test.mjs: "Live with Circle and Met closed: the next stop is Aldgate East, which has no live departures in the app"
- tests/live-station-board.test.mjs: "Live in Leisure going home: each London station grouped, with station lozenges that jump to its departures"
- tests/live-station-board.test.mjs: "Live without a location keeps asking where you are and never assumes home"
- tests/signal.test.mjs: "manual Live with no active journey is explicit and does not invent a train"

## Not yet / open questions
- **Leisure going out: all departures from Letchworth until a destination is chosen** (Sam's rule 3). Today it lists
  the trains to London (King's Cross and St Pancras; with "Where to?", also Farringdon), because only boards filtered
  to those stations are loaded. All departures needs a new, unfiltered board request and the proxy (`proxy/worker.js`)
  only allows the fixed station pairs, so it changes what's fetched from live feeds: a separate change on the
  wait-for-GitHub path, and the proxy would need redeploying. Choosing a destination then gives that destination's
  options, which Leisure "Where to?" already plans.
- Commute going home away from the office: the next stop is Aldgate, but its departures only load near the office.
  Fetching them from anywhere would be a request change.
- Aldgate East (Circle and Met closed) has no live departures in the app.
- Reach for a tube is walk / near the platform / can't make it; effort levels (fast walk, run) aren't applied to tubes.
