# Leisure journeys: door to door by rail, anywhere in the region
Status: Planned (design for independent review; not built) · Behind toggle when built (Settings → Experimental →
"Leisure journeys", off by default; Sam, 31 Oct) · Since: 31 Oct 2026 (evening)

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
to the South East; independent review before implementation; behind a feature switch.

Decisions the same evening (Sam, answering design questions):
- Ways to and from the station: **walk, cycle, drive**. No bus, tube, taxi or drop-off to the station in this story.
- Stations are **discovered and ranked**, not just the nearest: the nearest few within reach for the mode, ranked door
  to door, the others shown with what they cost.
- **The Google key is required.** No estimated fallback for addresses or station times: without a key the feature says
  what it needs and plans nothing. Tests use recorded-shape synthetic Google responses.
- **Plan plus live legs**: live National Rail times for every rail leg and every change, connection at risk / missed,
  Follow a route for the whole multi-leg trip, and the drive re-checked for traffic before you leave.

Evidence gathered the same evening (live calls from the build session):
- TfL's journey planner plans national rail **station to station** across the South East with exact station IDs:
  Brighton → Canterbury East (185 min via Victoria; 209 min via Gatwick and St Pancras), Reading → Brighton (128 min via
  Gatwick), Brighton → Letchworth Garden City (118 min direct Thameslink). With **coordinates outside London it returns
  404 "No journey found"**, so the door ↔ station legs must come from Google and only station ↔ station from TfL.
- A guessed station ID (`910GLETCHWT`) was silently resolved by TfL to "Letchworth Avenue" bus stop in Feltham and a bus
  journey planned there. Station IDs must come from a lookup and the reply must be checked against what was asked.
- TfL's nearby-stations search (`StopPoint?lat&lon&stopTypes=NaptanRailStation&radius`) works outside London (6
  stations within 3 km of Brighton). Its station detail lists facilities ("Car Park: yes") but has no CRS code.
- The National Rail journey planner (Online/Real Time Journey Planner) is a licensed SOAP service; Sam does not yet
  have access. The Google Routes and Places APIs could not be reached from the build session and Sam has no key yet.

## Acceptance criteria
Numbers here are the contract; the architecture says where each lives. "Region" = the bounding box in profile data
(south 50.55, west −1.95, north 52.75, east 1.80: London, the South East and the East of England).

### Switch
- Settings → Experimental → "Leisure journeys: plan door to door by rail between any two addresses in the region".
  Off by default. Off: the app is unchanged (Leisure, "Any start and end point", requests and saved data as today; no
  Google or journey-planner request is ever made).
- On: Leisure in the Signal design becomes the leisure journey planner. With Signal off, the switch is shown but its
  hint says "Needs the Signal design"; Panda is unchanged.
- On, with no Google key in Settings: "Add a Google Maps key in Settings to search addresses and time the trip to the
  station." Nothing is planned and no request is made.

### Where from and where to
- Two fields, **From** and **To**. From defaults to "Current location" (the phone's location; refused if outside the
  region or the fix is older than 2 min or worse than 200 m). Swap reverses them.
- Typing 3 or more characters shows a drop-down of up to 5 suggestions after 250 ms without typing, restricted to the
  region, addresses and stations alike. Fewer than 3 characters shows up to 5 recent places (saved on the phone, newest
  first, at most 5). Choosing a suggestion resolves it to a place (name, address line, position).
- The drop-down is usable by touch, keyboard and VoiceOver (combobox / listbox, arrow keys, Enter, Escape returns to the
  field, rows at least 44 px). A late reply for older text never replaces a newer one.
- A place outside the region is refused: "Outside the area this plans: London, the South East and the East of England."
- One autocomplete session token per search, ended by the choice (Google bills a session, not each keystroke).

### Getting to and from the station
- Each end has its own way: **Walk / Cycle / Drive** (to the station at From; from the station at To). Defaults Walk /
  Walk; the last choice is remembered.
- Walk: Google's walking route distance at your leisure walking pace (profile `walking.kmh.leisure`). Cycle: Google's
  cycling time. Drive: Google's traffic-aware driving time for the time you'd set off.
- Allowances (Settings, minutes): park and walk to the platform 10; lock the bike and walk to the platform 4; walk
  from the station entrance to the platform 3 (walk and every arrival); from the train back to a parked car 5.
- Drive is for getting to a station, not driving the journey: a drive to a station is at most 25 km straight line.

### Which stations
- Candidates for each end: rail stations within the mode's reach in a straight line (walk 3 km, cycle 10 km, drive 25 km),
  nearest first, at most 4. If none is within reach, the single nearest station is used with the flag "Nearest
  station is N km away".
- Their real times come from one Google route-matrix request per end (the place × the candidates).
- A candidate more than 20 min slower to reach than the quickest one is dropped before any rail search (it can't win
  by much); at most 3 From stations × 2 To stations = 6 station pairs are searched.
- Driving to a station whose TfL facilities say "Car Park: no": flagged "No station car park" (never hidden).
- The pick is door to door (as the commute): earliest arrival for Leave now / Leave around; latest leave that arrives in
  time for Arrive by; top-card rule with the 20-min window. The other stations appear under "Other stations", each with
  its consequence ("From Stevenage: arrive 12 min later", "leave 8 min earlier").

### The trains
- The rail journey between two stations can have changes, including a cross-London Tube or walk between termini; each
  change shows its station and time ("Change at Clapham Junction · 7 min").
- Rail planner: National Rail's journey planner when its address and key are in Settings; otherwise TfL's journey
  planner, station to station by exact station ID. A TfL reply whose first rail leg doesn't start at the asked station,
  or whose last doesn't end at the asked one, is refused for that pair ("TfL matched a different place").
- Questions as the commute: Leave now, Leave around (100 min past T), Arrive by T.
- Never hide a journey: every one returned is listed in leaving order with its flags (cancelled, late, timetable only,
  tight change, connection at risk, no car park, nearest station far away).
- A change shorter than 5 min is flagged "Tight change (N min)" (amber); the planner's own minimum connection time is
  respected and never shortened.

### Live, and keeping you up to date
- Each rail leg departing within 2 h has live National Rail times: one departure board per distinct leg origin (filtered
  to that leg's destination), matched by timetabled departure and destination. Shown as the commute shows trains:
  timetabled, expected, platform, status colour (amber 5–14 min late, red 15+, cancelled, no estimate).
- Change status from expected times: spare = next leg's expected departure − (this leg's expected arrival + change time
  between platforms). Spare ≥ 5 min: fine. 2–4 min: amber "Tight change, N min". Under 2 min: red "Connection at risk".
  The next leg gone or cancelled while you'd still be on this one: red "Connection missed", with "Plan from <station>".
- Drive before you leave: while within 60 min of the leave time, the drive is re-timed every 5 min; a change of 2 min or
  more moves the leave time and says why ("Traffic: leave 6 min earlier").
- Follow a route works for the whole trip: one tap on any journey. The card shows the next step (leave / ride to the
  station / board / change / final leg), ahead or behind, every change with its reason; the followed trip is never
  silently replaced; an alternative is offered only when it arrives at least 5 min sooner or the followed one is broken,
  and taking it is an explicit Follow.
- Which leg you're on: by the followed plan, time and position against each leg's stations; when unsure it asks ("Are
  you on the 14:05 to Victoria?") and remembers the answer.

### Screen (Signal)
- Same structure as the commute: primary answer (Leave by / Departs / Arrive), Next best, every journey, Other stations,
  Travel alerts, freshness and Refresh, Auto / Plan / Live.
- Journey steps: the access leg with its mode, each rail leg (timetabled · expected · platform), each change, the
  final leg; each time computed from the journey's segments.
- New or extended Signal components are listed in the design system section above and used only as listed there.

### Keys, saved data and requests
- Keys in Settings (Google Maps key; National Rail journey planner address and key) are stored only on the phone, never
  shown back in full, never logged, exported, captured or sent anywhere but their own service.
- Saved on the phone (validated on restore; dropped if malformed): the switch, the keys, the allowances, the current
  From / To / modes, at most 5 recent places, a followed leisure trip. Turning the switch off keeps them; the simulator
  snapshot covers them.
- Request budget per plan: ≤ 2 nearby-station lookups (cached 1 day per 1 km square), ≤ 2 route-matrix requests,
  ≤ 6 rail-planner searches in the first round and ≤ 12 in total, Darwin boards ≤ 1 per leg origin per refresh with
  refreshes ≥ 30 s apart. Each refusal or timeout stops further requests for that refresh, as the commute does.

## Tests
- None yet (planned). Planned engine tests: region check; candidate selection per mode (3 / 10 / 25 km, max 4, nearest
  fallback flag); 20-min pruning and the 6-pair cap; access segments from Google times (leisure pace, allowances);
  itinerary timing from segments; change spare thresholds at 5 and 2 min (both edges); TfL multi-leg adapter incl. the
  Feltham wrong-station refusal from a recorded reply; NR planner adapter from a documented-shape fixture; Google
  autocomplete / details / routes / matrix parsers from synthetic fixtures; ranking and Other-stations consequences;
  drive re-time ≥ 2 min rule; follow across legs (connection at risk, missed, explicit alternative only).
  Planned page tests (toggle off unchanged; toggle on without key; combobox keyboard / stale reply; full plan with mocked
  feeds; follow through a change) and goldens for Brighton → Canterbury and Reading → Brighton.

## Not yet / open questions
- National Rail journey planner: SOAP, licensed; built from documentation until Sam's access arrives; very likely needs
  the proxy (browsers can't send its SOAP request across origins). TfL fallback until then.
- Google from the phone directly: whether a website-restricted key works for Routes and Places (New) from a browser is
  unverified; if not, the calls go through the proxy with the key server-side.
- Station data: CRS codes and positions from the open UK stations list (ODbL, attribution in Settings → About); TfL
  station IDs resolved live and name-checked.
- Out of scope: bus / tube / taxi to the station, fares and tickets, step-free routing ([family day out](family-day-out.md)),
  anywhere outside the region, Panda.
