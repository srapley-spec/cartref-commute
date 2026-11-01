# Trip: door to door by rail, anywhere in the region (leisure journeys)
Status: Behind toggle (Settings → Experimental → Trip, off by default; Signal is the sole design). Built 31 Oct night; independent
mutation review before merging; Google unverified until Sam has a key · Behind toggle when built
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
"Region" = London, the South East and the East of England: an outline along their county edges (engine data,
`TRIP_DEFAULTS.region`; Birmingham, Coventry, Northampton and Swindon are out, north Norfolk is in), inside a box
(south 50.55, west −1.95, north 53.0, east 1.80) that Google's address search is restricted to. Approximate near a
county edge.
Minutes are whole minutes, rounded down.

### Switch and mode
- Settings → Experimental → "Trip: plan door to door by rail between any two addresses in the region". Off by default.
  Off: the app is unchanged (Commute, Leisure, "Any start and end point", requests and saved data as today; no Google
  script loaded, no Trip request).
- On: a third mode button **Trip** beside Commute and Leisure. Trip's opt-in remains independent and off by
  default. With Panda retired, no Signal design switch or design requirement hint remains; old `signal:false`
  data cannot hide an enabled saved Trip. The former [two-design exception](../decisions/trip-signal-only.md) is
  historical. All eight Trip view contracts remain ordinary regressions in `tests/journey-views.test.mjs`.
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
- **Trip only (Sam, 1 Nov, latest clarification):** preserve Signal's current UI and every non-Trip behaviour for
  real-world testing; changes outside Trip require express direction. Trip uses the actual Signal layout, colours,
  hierarchy and components. Similar CSS values or shared tokens do not establish visual fidelity. The proposed
  commute redesign and separate Trip card direction are rejected. Review Trip against unchanged Signal, using
  matched journey data where possible; sharing renderers must not change non-Trip output or behaviour.
  Sam selected the current commute screen as that reference. Trip recommendations call the same Signal card-frame
  renderer; use the existing hierarchy, surfaces, time sizes, route/status badges and action row. A multi-connection
  Trip repeats the existing connection component. Trip context displays its chosen places and never leaves Trip
  labels on the commute screen after changing mode.
  The existing Journey options disclosure hosts Trip's original From/To and per-end access controls; they are
  moved without cloning or replacing handlers, and returned to the hidden Trip root on leaving Trip. The question,
  chosen time and journey answers remain exposed. Access controls explicitly label To/From the station.
  The collapsed summary keeps the selected per-end modes visible, mirroring the commute's exposed pace.
  The exposed question selector uses the existing Signal planning-control rules, including equal-width buttons.
- **Exactly the same journey UI (Sam, 1 Nov):** Trip recommendations, Next best and the full list use the shared
  Auto/Plan card structure, type sizes, headline/countdown, duration rows, connection panels, route/status chips
  and steps/Follow placement. No repeated standalone headline, duration or operator summary. Both recommendations
  are complete and equally sized; list rows use the shared compact sizes. Address/access inputs remain specific
  to Trip. Before boarding Follow uses the same headline, facts and card; once aboard the next action leads.
  Both duration facts remain exposed through access, ride, change and final-leg phases, as in Commute Follow;
  the total uses the canonical journey start and current expected arrival, never time remaining.
  Each connection and its warnings stays attached to the right service. The train caption sums only canonical
  rail ride durations (including across midnight), excluding access, transfers and non-rail rides; Total journey
  uses canonical leave → final arrival. Missing/cancelled rail times withdraw the rail sum and total; unknown
  access withdraws only the total. A journey without rail must never claim zero minutes on trains. Journey steps
  retain their own open/closed state through refresh, without opening another card or changing Follow identity.
- **Connection panels (Sam, 1 Nov):** Trip options use the approved journey + train panel hierarchy: exposed
  Leave by / arrival and leave countdown, total journey duration, then a panel for each existing train/Tube/bus
  ride in itinerary order. Each panel retains its own scheduled/expected departure, boarding station,
  destination, operator/platform and source-qualified status; existing change allowances/warnings remain.
  Trip Follow retains the remaining connection panels using the engine's current ride index, keeps arrival/next
  action first once aboard, and stops presenting completed rides as upcoming. The renderer repeats the component,
  without calculating another itinerary or inventing a live status.
- Journeys can have changes, including a cross-London Tube or walk; each change shows where and how long ("Change at
  Clapham Junction · 7 min"; "Waterloo → Bank → Liverpool Street by Tube · 18 min").
- Rail planner: National Rail's when its address and key are in Settings; otherwise TfL, station to station by the
  station's own TfL IDs. A reply whose ends aren't the asked stations (by ID, else ICS code, else within 300 m) is
  refused for that pair: "TfL matched a different place".
- A bus or coach ride inside a journey is kept and flagged "Bus between X and Y".
- A journey departing on a later day than the one asked about is flagged with its date: "Tomorrow · Wed 4 Nov" for the
  next day, "Fri 6 Nov" for later.
- Leave now, Leave around T (to T + 100 min), Arrive by T. Every journey returned is listed in leaving order.

### Changes (one rule, planned and live)
- Spare = next ride's departure − this ride's arrival − any Tube / walk between them, in whole minutes, using the best
  known time at each end (live if known, else timetabled). An end without live data says "Not live"; the other end's
  live delay still counts (a 12-min-late arrival against a 7-min change is red, never neutral).
- Under 2: red "Connection at risk". Under 5 and below the planned change: amber "Tight change, N min". Otherwise
  neutral "Change N min" (a planner's own 4-min change on time is not amber). Next ride gone or cancelled while you'd
  still be on this one: red "Connection missed" with "Plan from <station>". Planned changes are never shortened.

### Edges
- Both places' nearest station is the same one, or they are within 1.5 km: a card "Close enough to walk / cycle /
  drive: no train needed", plus any journeys found.
- A station Google finds no route to or from: its journeys are still listed, flagged "Google found no walking route to
  X: door-to-door times unknown", and never picked.
- Already at a candidate station (≤ 400 m): its access time is 0 and the headline is "Departs".
- Current location moves > 500 m since the plan (not following): re-planned from the new position.
- A drive is first timed for a first guess (Leave now / around: that time; Arrive by: 2 h before), then re-timed once
  for the best journey's set-off (to the station) and arrival (from it); if it then misses, "Late by N min".

### Live, and keeping you up to date
- Live times for at most 6 board requests per refresh (≥ 30 s apart, shared by station pair): the followed journey's
  next two rides, then each pick's first ride, then other first rides leaving within 30 min. A pair's board is kept for
  30 s, so drawing again (the first answer, then the complete plan) never asks twice. Rides beyond the board's
  119 min, and the rest, say "Not live". A matched ride uses Service Details by its ID. Through the proxy, the Worker
  must accept any station (today it allows only LET, KGX, ZFD, STP).
- Same status colours as the commute (amber 5–14 min late, red 15+, cancelled, no estimate).
- Drive: re-timed every 5 min within 60 min of leaving; a change of 2+ min moves the leave time with "Traffic: leave N
  min earlier" (shown under the form, and as the reason in a followed trip's notice).
- Follow works for the whole trip: one tap. The card shows the next step, ahead / behind, every change with its reason;
  never silently replaced; an alternative only when ≥ 5 min sooner or the followed one is broken; switching is an
  explicit Follow.
- Which ride you're on: the followed ride by time; position within 1 km of the line between its stations confirms; when
  two rides fit (within 1 km and 5 min) it asks "Are you on the 14:05 to Victoria?" and remembers for this trip.
- Views: planning; on the way to the station; on a ride (headline = arrival); at a change (headline = next departure
  and spare); final leg. Auto / Plan / Live work as in the commute.

### Speed
- First answer after at most 2 network steps one after another from choosing the second place (its place fetch, then
  the first searches alongside its station times); live times after at most 3 (boards are asked for as soon as
  round 1 is drawn). Proved by the order of calls in a log (deterministic).
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
| Google route matrix | 1 per end (+1 per drive end, any question: re-timed once for the chosen journey; again with each 5-min re-plan) |
| Rail planner | ≤ 9 round 1, ≤ 18 in total |
| National Rail boards | ≤ 6 per refresh, ≥ 30 s apart |
| Service Details | ≤ 1 per minute for the ride you're on |
| TfL station lookups | 0 (bundled) |

## Tests
Built so far (the build log in the architecture says what is and isn't on screen):
- tests/core/trip-journey-facts.test.mjs: "Trip facts: sum time aboard trains across midnight and keep access, changes and other modes in the total"
- tests/core/trip-journey-facts.test.mjs: "Trip facts: unknown access keeps known rail duration without inventing a door-to-door total"
- tests/core/trip-journey-facts.test.mjs: "Trip facts: cancellation or an unknown rail time withdraws the rail sum and the total"
- tests/core/trip-journey-facts.test.mjs: "Trip facts: a missing transfer time cannot become a claimed total; no rail cannot become zero minutes on trains"
- tests/trip-shared-ui.test.mjs: "Trip cards: one complete recommendation and compact rows retain every connection, canonical facts and shared actions"
- tests/trip-shared-ui.test.mjs: "Trip cards: Journey steps keep their own disclosure state through refresh and Follow uses the selected itinerary"
- tests/trip-shared-ui.test.mjs: "Trip cards: Next best has the same complete headline, facts, connections and actions in all planning questions"
- tests/trip-shared-ui.test.mjs: "Trip context: the selected places replace commute copy only while Trip is active"
- tests/trip-controls-review.test.mjs: "Trip controls review: theme redraw preserves the original field, typed query, caret and keyboard suggestions"
- tests/trip-controls-review.test.mjs: "Trip controls review: a late place reply cannot replace commute context after leaving Trip"
- tests/trip-controls-review.test.mjs: "Trip controls review: a saved active Trip mounts in the shared host before its first refresh"
- tests/trip-controls-review.test.mjs: "Trip controls review: disabling Trip removes its controls and re-enabling keeps the same field handlers and places"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: Follow retains canonical duration facts through access, rides, changes and the final leg"
- tests/browser-connection-panels.py: rendered card/row geometry and connection clocks at 320/393 px, light/dark, 200% text; explicit Live baseline retained.
- tests/core/trip.test.mjs: "Region: London, the South East and the East of England; Birmingham, Coventry, Northampton and Swindon out"
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
- tests/core/trip-edges.test.mjs: "planTrip: 5 candidates at each end give 9 round-1 searches at once; never more than 18 (or the configured cap)"
- tests/core/trip-edges.test.mjs: "planTrip: a station a journey changes at, within reach, is promoted and searched in round 2"
- tests/core/trip-edges.test.mjs: "planTrip: round 2 skips stations more than 30 min behind the best, and searches them when within"
- tests/core/trip-edges.test.mjs: "planTrip: Arrive by searches 'Arriving' at the time in round 1 and covers the 100 min before; Leave now searches on after the last"
- tests/core/trip-edges.test.mjs: "planTrip: already at a station only from your current location; an address there still walks"
- tests/core/trip-edges.test.mjs: "planTrip: a station Google can't route to is shown, flagged and never picked (not dropped)"
- tests/core/trip-edges.test.mjs: "planTrip: places sharing their nearest station are close enough without a train (any distance)"
- tests/core/trip-edges.test.mjs: "planTrip: a drive is re-timed once for the best journey's set-off and arrival"
- tests/core/trip-edges.test.mjs: "Round 1 never pairs a station with itself"
- tests/core/trip-edges.test.mjs: "Changes: a spare of 0 is at risk, not missed; exactly 5 against a longer planned change is fine"
- tests/core/trip-edges.test.mjs: "Changes: the planned change counts the Tube across, so an on-time 4-min cross-London change is not amber"
- tests/core/trip-edges.test.mjs: "Changes: Not live names the end without live data: this train's arrival"
- tests/core/trip-edges.test.mjs: "Live budget: at most 6 boards; the followed trip's next two rides first, then the picks, then first rides within 30 min"
- tests/core/trip-edges.test.mjs: "Live budget: a ride already arrived gets no board; 30 min exactly still does"
- tests/core/trip-edges.test.mjs: "Live: an arrival with no estimate keeps the timetable and says Not live; a board that disappears makes the ride Not live again"
- tests/core/trip-edges.test.mjs: "Live: the 'Nearest station is N km away' flag survives live times"
- tests/core/trip-edges.test.mjs: "Ranking: arriving exactly on time isn't late; Late by rounds down (1 min 30 s late is 1 min)"
- tests/core/trip-edges.test.mjs: "Ranking: every journey in leaving order; one whose leave time has passed is listed but never picked"
- tests/core/trip-edges.test.mjs: "Other stations: at most 4, uncertain or missed journeys skipped; a better option needs the default 5 min"
- tests/core/trip-edges.test.mjs: "Follow: a broken trip is offered any reachable alternative; one whose leave time has passed never"
- tests/core/trip-edges.test.mjs: "Follow: an answer about a later ride wins over the clock"
- tests/core/trip-edges.test.mjs: "Follow: 5 min later is amber, 4 is not, 15 is red; a cancellation is announced once"
- tests/core/trip-edges.test.mjs: "Follow: restore drops a saved trip with a broken ride, bad lists or times"
- tests/core/trip-edges.test.mjs: "TfL: a leading walk is dropped too; a coach is a bus ride, flagged"
- tests/core/trip-edges.test.mjs: "TfL: an end without a naptan ID is matched by its ICS code; one 500 m off with neither is refused"
- tests/core/trip-edges.test.mjs: "Flags: driving to a station with no car park, or one not known; walking says neither"
- tests/core/trip-edges.test.mjs: "Flags: a later day says Tomorrow only when it is the next day; otherwise the date"
- tests/core/trip-edges.test.mjs: "Trip defaults are the story's numbers (docs/stories/leisure-journeys.md)"
- tests/core/trip-edges.test.mjs: "Follow: restore checks each part of a saved trip on its own"
- tests/core/trip-edges.test.mjs: "Live budget: a pick whose first ride has already arrived gets no board"
- tests/core/trip-edges.test.mjs: "planTrip: asking about a later day flags nothing as Tomorrow on that day"
- tests/core/trip-edges.test.mjs: "Station reach: a station just inside the reach is a candidate, just outside is not"
- tests/core/trip-edges.test.mjs: "Rounds at once: a refusal in round 1 stops round 2 for every item, with the reason"
- tests/core/trip-edges.test.mjs: "planTrip: no route from the last station is flagged too; a journey to a station never timed is not shown"
- tests/core/trip-edges.test.mjs: "planTrip: sharing a station that isn't the nearest at both ends is not 'close enough'"
- tests/core/trip-edges.test.mjs: "planTrip: a drive for Arrive by is first timed 2 h before; walking is timed once per end (never re-timed)"
- tests/core/trip-edges.test.mjs: "Days count by the local calendar in summer time too (23:30 to 00:30 in July is the next day)"
- tests/core/trip-edges.test.mjs: "planTrip: walking to the station and driving from it re-times only the drive (3 requests, not 4)"
- tests/core/trip-edges.test.mjs: "planTrip: driving to the station and walking from it re-times only the drive (the far end keeps its walking time)"
- tests/core/trip-live.test.mjs: "Live budget: at most 6 boards, shared by station pair; the followed trip's next two rides come first"
- tests/core/trip-live.test.mjs: "Live budget: rides more than 119 min away get no board (Not live)"
- tests/core/trip-live.test.mjs: "Live: a ride matches its board by timetabled time and destination; two candidates with no way to tell them apart match none"
- tests/core/trip-live.test.mjs: "Live: a late first train re-times the journey, eats into the change and says so; rides without a board say Not live"
- tests/core/trip-live.test.mjs: "Live: a cancelled next train makes the connection missed; the journey is never dropped"
- tests/core/trip-live.test.mjs: "Trip views: planning views start plan- (never an active journey); a followed trip's phase picks its view"
- tests/core/trip-live.test.mjs: "Follow a trip: phases by time and answers; a confirmed ride sets the earliest you can be on, not forever"
- tests/core/trip-live.test.mjs: "Follow a trip: a later arrival is announced once with its reason; never replaced; alternatives only ≥ 5 min sooner or when broken"
- tests/core/trip-live.test.mjs: "Follow a trip: saved state is checked; malformed is dropped"
- tests/trip-page.test.mjs: "Trip switch off: no Trip button, the commute as before, and no Trip or Google request"
- tests/trip-page.test.mjs: "Trip upgrade: an obsolete disabled Signal preference cannot hide an enabled saved Trip"
- tests/trip-page.test.mjs: "Trip without a Google key: the setup card, nothing planned, no Google script or request"
- tests/trip-page.test.mjs: "Trip: address drop-down after 3 characters and 250 ms; keyboard choose; a late reply for older text is ignored"
- tests/trip-page.test.mjs: "Trip: Brighton → Canterbury plans door to door from TfL, every journey listed, and makes no commute requests"
- tests/trip-page.test.mjs: "Trip: Follow a journey; the followed trip is saved and shown, and Stop following clears it"
- tests/trip-page.test.mjs: "Trip: back to Commute restores the commute screen and Trip's places are kept"
- tests/trip-page.test.mjs: "Trip search: nothing is asked for until 250 ms after the last keystroke"
- tests/trip-page.test.mjs: "Trip search: a slow reply for older text never replaces the newer one's suggestions"
- tests/trip-page.test.mjs: "Trip search: choosing a place ends the search session; the next search starts a new one; recent places keep no position"
- tests/trip-page.test.mjs: "Trip search: arrow keys wrap round; Escape closes the list and keeps the text"
- tests/trip-page.test.mjs: "Trip: a place outside the region is refused when chosen, with the region named"
- tests/trip-page.test.mjs: "Trip: the setup card shows without a key and hides with one; without a key nothing is planned from saved places"
- tests/trip-page.test.mjs: "Trip: Current location is used only within 200 m and 2 minutes"
- tests/trip-page.test.mjs: "Trip: choosing From starts timing its stations before To is chosen"
- tests/trip-page.test.mjs: "Trip: Refresh while Trip is on screen makes no commute request"
- tests/trip-page.test.mjs: "Trip settings: the Google key is never shown back, only its last 4 characters"
- tests/trip-page.test.mjs: "Trip live: one plan asks for at most 6 boards, never the same pair twice within 30 s"
- tests/trip-page.test.mjs: "Trip live: boards are asked for as soon as round 1 is drawn, before the later searches come back"
- tests/trip-page.test.mjs: "Trip drive: re-checked every 5 min; 2 min or more moves the leave time and says which way; 1 min doesn't"
- tests/trip-page.test.mjs: "Trip: places close together show the 'no train needed' card"
- tests/trip-page.test.mjs: "Trip search: with two rows, Up from nothing goes to the last and Down from the last wraps to the first"
- tests/trip-page.test.mjs: "Trip search: the same field starts a new session after a choice"
- tests/trip-page.test.mjs: "Trip drive: the 5-min re-check asks Google again for the same set-off (traffic now, not the cached answer)"
- tests/trip-page.test.mjs: "Trip live: a redraw within 30 s reuses the boards; after 30 s they are asked for again"
- tests/trip-page.test.mjs: "Trip search through the proxy: the same field sends a new session after a choice"
- tests/trip-page.test.mjs: "Trip: changing the question clears the old journeys until the new plan arrives (never shown under the new label)"
- tests/trip-page.test.mjs: "Trip: walking times are asked for once; the 5-min re-plan reuses them (only drives are asked again)"
- tests/trip-state.test.mjs: "Trip saved state: at most 5 recent places; a bad way to the station or question falls back to the defaults"
- tests/trip-state.test.mjs: "Trip saved state: a place without a proper position is dropped; Current location keeps no position"
- tests/trip-state.test.mjs: "Trip saved state: a followed trip is only kept when it passes the engine's checks"
- tests/trip-google.test.mjs: "Maps JS adapter: choosing a place ends its session; the next search with the same ID gets a new token"
- tests/trip-google.test.mjs: "TfL planner adapter: asks by ICS code with the time, the question and the key; 404 and 300 are refusals, not failures"
- tests/trip-google.test.mjs: "TfL planner adapter: a station TfL doesn't know is never asked about"
- tests/proxy.test.mjs: "Proxy (Trip): any station's board only with ALLOW_ANY_STATION=yes; still only well-formed codes"
- tests/proxy.test.mjs: "Proxy (Trip): Google only when GOOGLE_KEY is set, fixed hosts and field masks, the key sent upstream only"
- tests/trip-google.test.mjs: the contract suite in tests/contracts/google-ports.mjs, run against the Maps JS, proxy and
  fixture (simulator) adapters (8 checks each; generated names, so not linked one by one).
- Untested, said so: the plan-token guard (an older plan finishing after a newer one must not replace it); the commute
  screen not being redrawn under Trip (CSS hides it either way); "Better option found" on the page (the engine rule is
  tested).
- Still planned: goldens for Brighton → Canterbury West and Winchester → Norwich incl. request counts.

## Not yet / open questions
Built differently from the text above, or not yet (31 Oct night):
- Saved state is one validated key, `tripMode` (active, from, to, ways, question, recent places, followed trip), not
  separate keys: the commute already uses `trip` for its direction memory, and one key keeps Trip off the ~40 places
  the page checks `mode`. Settings: `trip`, `googleKey`, `googleVia`, `tripParkMin`… (minutes; engine defaults).
- Not yet: "Leave now: N min late for the 14:05" when a drive's new leave time has passed; a 2.5-s early draw; Swap
  when From is Current location leaves To empty; National Rail journey planner adapter (no access); simulator providers for Trip (the contract suite has a
  fixture adapter, but the journey simulator doesn't drive Trip); Auto / Plan / Live buttons for Trip (the view follows
  the followed trip's phase); asking which ride you're on (time and answers only, no GPS check yet); re-planning when
  the current location moves 500 m; "Plan from <station>" after a missed connection (the alternative offer covers it
  partly); Service Details for the ride you're on.
- The drive re-check is the 5-min re-plan with drive times per 5-min slot; a leave-time change of 2 min or more is
  announced (fixed after the review: it never fired; its cache now also keys on when it is asked, so the re-check sees
  new traffic for the same set-off).
- National Rail journey planner: licensed SOAP; built from documentation, unverified until access; likely needs the
  proxy.
- Google: class names, limits and cycling coverage in the UK are unverified until Sam has a key; only
  `src/trip-adapters.js` depends on them.
- Station data: CRS and positions from the open UK stations list (ODbL); TfL IDs, car parks and departures per hour
  measured once by `tools/stations.mjs` (service levels from a Saturday evening: re-run on a weekday).
- Out of scope: bus / tube / taxi to the station, fares, step-free routing ([family day out](family-day-out.md)),
  outside the region, Panda.
