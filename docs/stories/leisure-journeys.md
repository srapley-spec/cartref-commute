# Trip: door to door by rail, anywhere in the region (leisure journeys)
Status: Partly built (engine; design revision 3 approved with changes by independent review) · Behind toggle when built
(Settings → Experimental → "Trip", off by default; Sam, 31 Oct) · Since: 31 Oct 2026 (evening)

Architecture: [leisure-architecture.md](../leisure-architecture.md). Design-system additions:
[design-system.md → Leisure journeys extensions](../design-system.md#leisure-journeys-extensions-proposed-31-oct-2026).

## Story
As someone making a one-off trip by train (a day out, visiting someone, an event), when I'm going from any address to
any address in London, the South East or the East of England, I want to search for both ends by address, say how I'll
get to and from the station (walk, cycle or drive), and get the best door-to-door rail journey with when to leave, so
that I can plan it like my commute and then be kept up to date on the way, including at every change of train.

## Where it came from
31 Oct 2026, evening. Sam: "build the full leisure planning mode … go from anywhere … to anywhere. This is about rail
travel, so we don't need long driving or flights. The design should all be around optimising for the best journey and
keeping you up to date on the way. The principles and design should be very similar to the commuter version. The
biggest difference is getting to and from the station." Address search with a drop-down; Signal design system, with any
extensions called out explicitly for a separate designer to review and polish; Google for the times to and from the
station; National Rail's journey planner for the trains, with TfL as the fallback until access arrives; searches limited
to the South East; independent review before implementation; behind a feature switch. Later: "think carefully about the
architecture … we need to support reuse, loose coupling and speed."

Decisions the same evening (Sam, answering design questions):
- Ways to and from the station: **walk, cycle, drive**. No bus, tube, taxi or drop-off to the station in this story.
- Stations are **discovered and ranked**, not just the nearest.
- **The Google key is required.** No estimated fallback: without a key the feature says what it needs and plans nothing.
- **Plan plus live legs**: live times for every rail leg and change, Follow for the whole trip, drive re-checked.
- **Trip is a third mode** (Commute / Leisure / Trip). Today's Leisure (home ↔ London) stays exactly as it is.
- **Google through its Maps JavaScript library**, loaded only when Trip is used; moving it to the proxy later must be
  one adapter and a setting ("Google: key in this browser | My proxy").
- Trip needs a TfL key (TfL refuses concurrent searches without one).

Evidence (live calls from the build session and the independent review, 31 Oct):
- TfL's journey planner plans national rail **station to station** across the region with exact station IDs: Brighton →
  Canterbury East (185 min via Victoria), Reading → Brighton (128 min via Gatwick), Brighton → Letchworth Garden City
  (118 min, direct Thameslink). With **coordinates outside London it returns 404 "No journey found"**.
- A guessed ID (`910GLETCHWT`) was silently resolved to "Letchworth Avenue" bus stop in Feltham.
- TfL replies: the last rail leg's arrival often has no station ID (name, ICS code and position only); TfL adds its
  own walk out of the station; cross-London changes come back as tube legs with gaps, no connection time; a 23:00
  search returns the next morning's first train; asking a 25 km nearby-stations radius returns HTTP 504.
- Near Chilham (Kent) the four nearest stations exclude Ashford International (11.6 km), whose high-speed trains are
  what you'd use to reach London: picking stations by distance alone is wrong.

## Acceptance criteria
"Region" = profile data, south 50.55, west −1.95, north 52.75, east 1.80 (London, the South East, the East of England).
Minutes are whole minutes, rounded down.

### Switch and mode
- Settings → Experimental → "Trip: plan door to door by rail between any two addresses in the region". Off by default.
  Off: the app is unchanged (Commute, Leisure, "Any start and end point", requests and saved data as today; no Google
  script loaded, no Trip request).
- On, with Signal on: a third mode button **Trip** beside Commute and Leisure. With Signal off: no Trip button; the
  switch's hint says "Needs the Signal design". Leisure is the same with the switch on or off.
- Trip with no Google key: the setup card "Add a Google Maps key in Settings to search addresses and time the trip to
  the station", with Open Settings. Nothing planned, no request, no script loaded.

### Where from and where to
- Fields **From** and **To**. From defaults to "Current location", used only when the fix is ≤ 2 min old, ≤ 200 m
  accurate and inside the region; otherwise it says which. Swap reverses them.
- 3+ characters: a drop-down of ≤ 5 suggestions, 250 ms after the last keystroke, restricted to the region; fewer than
  3: ≤ 5 recent places, newest first. "Powered by Google" under suggestions. A reply for older text never replaces a
  newer one. Combobox / listbox for VoiceOver; arrow keys, Enter, Escape; rows ≥ 44 px.
- One Google session per search, ended by fetching the chosen place. Recent places keep Google's place ID and the
  name (not positions; Google's terms).
- Outside the region: "Outside the area this plans: London, the South East and the East of England."
- Choosing From starts timing its stations at once (before To is chosen); choosing To starts planning at once.

### Getting to and from the station
- Each end has Walk / Cycle / Drive. Defaults Walk / Walk; last choice remembered.
- Walk: Google's walking distance at your leisure pace (`walking.kmh.leisure`). Cycle: Google's cycling time. Drive:
  Google's traffic-aware time for when you'd set off.
- Allowances (Settings, minutes, 0–60): park and reach the platform 10; lock the bike and reach the platform 4; station
  entrance to platform 3 (walking); off the train to the street 3; off the train back to a parked car 5.

### Which stations
- Reach in a straight line: walk 3 km, cycle 10 km, drive 25 km. Candidates: the 3 nearest within reach, plus up to 2
  well-served stations within reach (departures per hour at least twice the best of the nearest three, highest
  first). None within reach: the nearest, flagged "Nearest station is N km away".
- A station within reach where a round-1 journey boards or changes becomes a candidate too (found from live data).
- Pinned with fixture stations: driving from near Chilham, Ashford International is searched, both by the
  well-served rule and by promotion (Chilham → London changes there). (Live Saturday counts, 31 Oct, 2 h: Chilham,
  Chartham, Selling 4 each; Canterbury West 9; Faversham 14; Ashford International 20.)
- Round 1 searches: nearest From × every To candidate, and every From candidate × nearest To (≤ 9, at once). Round 2:
  untried pairs of the best From and To stations, then later searches for the 3 best pairs to cover Leave around
  (to T + 100) or Arrive by (from T − 100); none for pairs > 30 min behind the best. ≤ 18 planner searches per plan.
- Station times: walk / cycle don't depend on the time; a drive to the station is timed for the best journey's
  set-off, a drive from it for the best journey's arrival; re-timed when followed.
- Drive to a station with no car park: "No station car park"; unknown: "Car park not known". Never hidden.
- The pick: the commute's top-card rule (earliest arrival for Leave now / Leave around; latest leave arriving in time
  for Arrive by; next best within 20 min). "Other stations": the best journey from / to each other station with its
  consequence ("From Ashford International: arrive 12 min sooner, leave 9 min earlier"); at most 4.

### The trains
- Journeys can have changes, including a cross-London Tube or walk; each change shows where and how long ("Change at
  Clapham Junction · 7 min"; "Waterloo → Bank → Liverpool Street by Tube · 18 min").
- Rail planner: National Rail's when its address and key are in Settings; otherwise TfL, station to station by the
  station's own TfL IDs. A reply whose ends aren't the asked stations (by ID, else ICS code, else within 300 m) is
  refused for that pair: "TfL matched a different place".
- A bus or coach ride inside a journey is kept and flagged "Bus between X and Y".
- A journey departing on a later day is flagged "Tomorrow" with its date.
- Leave now, Leave around T (to T + 100 min), Arrive by T. Every journey returned is listed in leaving order.

### Changes (one rule, planned and live)
- Spare = next ride's departure − this ride's arrival − any Tube / walk between them, in whole minutes, using the best
  known time at each end (live if known, else timetabled). An end without live data says "Not live"; the other end's
  live delay still counts (a 12-min-late arrival against a 7-min change is red, never neutral).
- Under 2: red "Connection at risk". Under 5 and below the planned change: amber "Tight change, N min". Otherwise
  neutral "Change N min" (a planner's own 4-min change on time is not amber). Next ride gone or cancelled while you'd
  still be on this one: red "Connection missed" with "Plan from <station>". Planned changes are never shortened.

### Edges
- Both ends share a station, or are within 1.5 km: "Close enough to walk / cycle / drive: no train needed", plus any
  journeys found.
- Already at a candidate station (≤ 400 m): its access time is 0 and the headline is "Departs".
- Current location moves > 500 m since the plan (not following): re-planned from the new position.
- Arrive by with a drive: the drive is timed for the computed leave, re-timed once; if it then misses, "Late by N min".

### Live, and keeping you up to date
- Live times for at most 6 board requests per refresh (≥ 30 s apart, shared by station pair): the followed journey's
  next two rides, then each pick's first ride, then other first rides leaving within 30 min. Rides beyond the board's
  119 min, and the rest, say "Not live". A matched ride uses Service Details by its ID. Through the proxy, the Worker
  must accept any station (today it allows only LET, KGX, ZFD, STP).
- Same status colours as the commute (amber 5–14 min late, red 15+, cancelled, no estimate).
- Drive: re-timed every 5 min within 60 min of leaving; a change of 2+ min moves the leave time with "Traffic: leave N
  min earlier"; if the new leave time has passed: "Leave now: N min late for the 14:05".
- Follow works for the whole trip: one tap. The card shows the next step, ahead / behind, every change with its reason;
  never silently replaced; an alternative only when ≥ 5 min sooner or the followed one is broken; switching is an
  explicit Follow.
- Which ride you're on: the followed ride by time; position within 1 km of the line between its stations confirms; when
  two rides fit (within 1 km and 5 min) it asks "Are you on the 14:05 to Victoria?" and remembers for this trip.
- Views: planning; on the way to the station; on a ride (headline = arrival); at a change (headline = next departure
  and spare); final leg. Auto / Plan / Live work as in the commute.

### Speed
- First answer after at most 2 network steps one after another from choosing the second place (its place fetch, then
  the first searches alongside its station times); live times after at most 3. Drawn when round 1 completes or at
  2.5 s with what has arrived. Proved by the order of calls in a log (deterministic); 8 s with 600 ms feeds as a
  smoke bound.
- A journey found later that arrives ≥ 5 min sooner is shown as "Better option found", never a silent swap.

### Keys, saved data and requests
- Keys (Google; National Rail planner address and key) are stored only on the phone, shown as their last 4
  characters, never logged, captured, exported, put in simulator reports or sent anywhere but their own service.
- Saved (validated on restore; malformed dropped): the switch, keys, allowances, current From / To / ways / question,
  ≤ 5 recent places, a followed trip. Switch off keeps them.

| Per plan | Requests |
| --- | --- |
| Google autocomplete | 1 per 250 ms pause after 3+ characters |
| Google place fetch | 1 per chosen place |
| Google route matrix | 1 per end (+1 for Arrive by with a drive; +1 per 5 min drive re-check) |
| Rail planner | ≤ 9 round 1, ≤ 18 in total |
| National Rail boards | ≤ 6 per refresh, ≥ 30 s apart |
| Service Details | ≤ 1 per minute for the ride you're on |
| TfL station lookups | 0 (bundled) |

## Tests
Built so far (see the build log in the architecture for what is and isn't on screen yet):
- tests/core/trip.test.mjs: "Region: London, the South East and the East of England; Letchworth and Brighton in, Birmingham out"
- tests/core/trip.test.mjs: "Allowances: defaults 10 / 4 / 3 / 3 / 5 min; Settings clamp to 0–60"
- tests/core/trip.test.mjs: "Station candidates: 3 nearest within reach plus up to 2 well-served (≥ 2× the best nearby); driving finds the main line"
- tests/core/trip.test.mjs: "Station candidates: reach is 3 / 10 / 25 km; none within reach gives the nearest, flagged with its distance"
- tests/core/trip.test.mjs: "Station candidates: a station a journey changes at, within reach, is promoted from live planner data"
- tests/core/trip.test.mjs: "Round 1 searches: nearest From × every To, every From × nearest To, at most 9"
- tests/core/trip.test.mjs: "Changes: under 2 min red at risk; under 5 and below the planned change amber; a planner's own short change neutral"
- tests/core/trip.test.mjs: "Changes: whole minutes rounded down; a negative spare is missed; a cancelled next train is missed"
- tests/core/trip.test.mjs: "Changes: one live side still counts (12 min late against a 7-min change is red); the other end says Not live"
- tests/core/trip.test.mjs: "Changes: a Tube ride across London is taken off the spare"
- tests/core/trip.test.mjs: "TfL journeys: Brighton → Canterbury West from a recorded reply; TfL's walk out of the station dropped; three changes"
- tests/core/trip.test.mjs: "TfL journeys: ends are checked; a reply for other stations is refused, not shown as the asked trip"
- tests/core/trip.test.mjs: "TfL journeys: a 23:00 search returns tomorrow's first trains, flagged Tomorrow with the date"
- tests/core/trip.test.mjs: "Recorded fixtures and station data hold no keys"
- tests/core/trip.test.mjs: "Access: walking is Google's distance at your leisure pace plus 3 min to the platform; driving adds 10 min to park"
- tests/core/trip.test.mjs: "Journey times come from the segments and rides: leave = first train − the way there; arrive = last train + the way on"
- tests/core/trip.test.mjs: "planTrip: plans door to door, picks by the top-card rule and lists every journey in leaving order"
- tests/core/trip.test.mjs: "planTrip: first answer after at most 2 steps one after another (round 1 alongside the station times)"
- tests/core/trip.test.mjs: "planTrip: one station pair failing still plans the others; a refusal is reported with the pair"
- tests/core/trip.test.mjs: "planTrip: a place outside the region is refused with the region named; places within 1.5 km say no train needed"
- tests/core/trip.test.mjs: "Ranking: Arrive by flags late journeys with whole minutes; the pick is the latest leave that arrives in time"
- tests/core/trip.test.mjs: "Other stations: each other station's best journey with what it costs; a better option needs 5 min"
- tests/core/trip.test.mjs: "TfL journeys: Winchester → Norwich crosses London by Tube; the Tube is the way across the change, not a ride"
- tests/core/trip-live.test.mjs: "Live budget: at most 6 boards, shared by station pair; the followed trip's next two rides come first"
- tests/core/trip-live.test.mjs: "Live budget: rides more than 119 min away get no board (Not live)"
- tests/core/trip-live.test.mjs: "Live: a ride matches its board by timetabled time and destination; two candidates with no way to tell them apart match none"
- tests/core/trip-live.test.mjs: "Live: a late first train re-times the journey, eats into the change and says so; rides without a board say Not live"
- tests/core/trip-live.test.mjs: "Live: a cancelled next train makes the connection missed; the journey is never dropped"
- tests/core/trip-live.test.mjs: "Trip views: planning views start plan- (never an active journey); a followed trip's phase picks its view"
- tests/core/trip-live.test.mjs: "Follow a trip: phases by time and answers; a confirmed ride sets the earliest you can be on, not forever"
- tests/core/trip-live.test.mjs: "Follow a trip: a later arrival is announced once with its reason; never replaced; alternatives only ≥ 5 min sooner or when broken"
- tests/core/trip-live.test.mjs: "Follow a trip: saved state is checked; malformed is dropped"
- tests/proxy.test.mjs: "Proxy (Trip): any station's board only with ALLOW_ANY_STATION=yes; still only well-formed codes"
- tests/proxy.test.mjs: "Proxy (Trip): Google only when GOOGLE_KEY is set, fixed hosts and field masks, the key sent upstream only"
- tests/trip-google.test.mjs: the contract suite in tests/contracts/google-ports.mjs, run against the Maps JS, proxy and
  fixture (simulator) adapters (8 checks each; generated names, so not linked one by one)
- Still planned: Google contract suite (Maps JS, proxy, simulator adapters); page tests (switch off unchanged, Trip
  without key, combobox keyboard / stale reply, full plan, live budget, Follow through a change); goldens for
  Brighton → Canterbury West and Winchester → Norwich incl. request counts.

## Not yet / open questions
- National Rail journey planner: licensed SOAP; built from documentation, unverified until access; likely needs the
  proxy.
- Google: class names, limits and cycling coverage in the UK are unverified until Sam has a key.
- Station data: CRS and positions from the open UK stations list (ODbL); TfL IDs, car parks and departures per hour
  measured once by a tool.
- Out of scope: bus / tube / taxi to the station, fares, step-free routing ([family day out](family-day-out.md)),
  outside the region, Panda.
