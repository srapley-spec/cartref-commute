# UK-wide Trip: plan by rail anywhere in Great Britain

Status: built 3 Nov 2026 (branch `feat/uk-wide-trip`), live run recorded in `docs/reviews/trip-uk-wide-live-2026-11-03.md`; merging after independent review.

## Story
As Sam, I want Trip to plan from any address in Great Britain to any other — a gig in Newcastle, a hotel in
Alnmouth, Fort William by the sleeper, an office in London — the same way it plans in the South East: discovered
stations, real trains, the final walk from where I actually get off, live times once I'm on the way. I want to see the
sleeper as an option when there is one.

## Where it came from
3 Nov 2026, late. Sam: "We knew it only covered the south east but I want to be able to travel anywhere in the UK by
rail including gigs to tube stations in London and then walking." Then: "When are you building the uk wide version.
This is the one that's critical to test and document." Journeys he named: the London office and Letchworth to
Washington NE38 8SE, Newcastle, St Leonards, a hotel in Alnmouth, Fort William ("I expect to see the sleeper as an
option"), Great Bookham; and all the returns.

Evidence (3 Nov, `docs/reviews/trip-complex-journeys-2026-11-03.md`): TfL's journey planner answers every one of those
by station ID (Leeds → Manchester, Edinburgh → Glasgow, Cardiff → Bristol too); the South East limit was the app's own
region box and station list. TfL cannot place *coordinates* outside London (404), and it lacks the direct Highland
Caledonian Sleeper (Euston ⇄ Fort William), offering only the Glasgow sleeper plus a connection; Google Maps has both.

## Acceptance criteria

### Where
- Any place in Great Britain: England, Scotland and Wales, with their islands that have railway connections
  considered by position (Isle of Wight, Anglesey, Skye by bridge). Northern Ireland, Ireland, the Isle of Man and
  the Channel Islands are outside: "Outside the area this plans: Great Britain."
- The station list is national: 2,609 stations with CRS codes; 2,588 with TfL IDs (overrides for the 14 TfL names
  differently, Edinburgh Waverley among them; 21 TfL does not know at all, listed in `data/stations-report.md`).
- Departures-per-hour (the "well-served" prior) is measured only for the South East; elsewhere it is 0, so the three
  nearest stations within reach are the candidates and no station is added for frequency. Said in the engine doc.

### Which stations, which journeys (the 3 Nov journeys are the tests)
- London office (One Braham) → Newcastle, Leave now 08:00: the 08:30 LNER from King's Cross, arriving 11:09, boarding
  by Tube from Aldgate (TfL's walk from Fenchurch Street to Aldgate, kept; see "Boarding elsewhere").
- Letchworth → Newcastle, Leave now 08:00: via Stevenage (08:30 → Hitchin → Stevenage 08:55 → York → Newcastle 11:27),
  not via King's Cross; its 0-minute York connection is flagged "Connection at risk", never hidden; Arrive by 12:00
  picks the same train as "Latest for 12:00".
- Letchworth → Alnmouth: 08:30 → Stevenage → York → Alnmouth 12:04. London office → Alnmouth: 08:30 LNER → Newcastle
  → Alnmouth 11:44.
- Washington NE38 8SE: no station within 3 km; the nearest (Chester-le-Street, 5.6 km) is used and flagged "Nearest
  station to where you're going is 5.6 km away"; cycle / drive at that end plan as before.
- Fort William by day: → York → Edinburgh → Glasgow Queen Street → 18:24 → 22:06. Evening (20:00): the Euston → Glasgow
  Central sleeper (23:45 → 07:30) then Queen Street → Fort William 12:12, flagged "Tomorrow"; and the next morning's
  day trains. **The direct Highland sleeper (21:15 Euston → Fort William 10:00) is not in TfL's data**: the engine
  cannot show it until a second route source exists (Phase 3). The story says so; nothing is invented.
- Returns mirror the outbound answers: Newcastle 17:24 → King's Cross 20:11 → Tube; Newcastle 17:27 → Stevenage →
  Letchworth 20:21; Fort William 17:37 → Glasgow → the Lowland sleeper → Euston 07:15 → Letchworth 08:17.
- Places TfL can't plan to by position (everything outside London): the searches to the place are refused and
  listed once; station-based planning answers (already built, #56).

### Boarding elsewhere (the departure-side mirror of #56)
- A station-pair reply that *begins* with TfL's walk from the station asked for to another stop (Fenchurch Street →
  Aldgate; Liverpool Street → Moorgate) is refused as that pair but, when the first mile is on foot and that stop is
  within walking reach (3 km) of the start, kept as a journey **boarding at that stop**: Google times the walk from the
  start to it, plus the platform allowance. The stop may be a Tube stop (identity `tfl:<naptan>`). Said in "Why these
  trains?". Not for cycling or driving to the station.
- Without this, London-office origins lost the 08:30 LNER and every evening Fort William option (3 Nov dry run).
- Each boarding stop is its own search key (and its own page-cache key): later searches ask TfL from that stop's own
  ID, after the last departure found from it; a stop first seen in a later search is timed before the final answer;
  a stop with no position, or reached by a walk that did not start at the station asked for, is refused.
- Independent review (3 Nov, 16 mutations, 7 probes): found the page cache keying Tube origins by their empty CRS
  (fixed) and four test gaps (closed); the region outline holds every one of the 2,609 stations and excludes
  Belfast, Dublin, Douglas and Calais; planning over the national index takes about 3 ms.

### Everything else unchanged
Reach, allowances, rounds and budgets, Leave now / around / Arrive by, picks, Other stations, live boards, Follow,
saved state: as in `docs/stories/leisure-journeys.md`. Planning over 2,609 stations instead of 1,136 adds no
measurable time (the index is a list scan; a plan is a handful of network calls).

## Tests
Recorded TfL replies (3 Nov, for Wed 4 Nov; keys removed): `tests/fixtures/trip/tfl-{letchworth,liverpoolst,fenchurchst}-{newcastle,alnmouth,chesterlestreet}.json`,
`…-fortwilliam[-evening].json`, `tfl-letchworth-newcastle-arrive.json`, and the returns `tfl-{newcastle,alnmouth,chesterlestreet,fortwilliam}-{letchworth,liverpoolst}[-evening].json`.
- tests/core/trip-uk.test.mjs: "Region: Great Britain; Belfast, Dublin, the Isle of Man and Calais are out; Stranraer, Penzance, Thurso, Shetland and the Hebrides are in"
- tests/core/trip-uk.test.mjs: "Station data is national: 2,600+ stations, Newcastle / Alnmouth / Fort William / Edinburgh Waverley with TfL IDs; Chester-le-Street is Washington's nearest at 5.6 km"
- tests/core/trip-uk.test.mjs: "London office → Newcastle: boards the Tube at Aldgate after TfL's walk from Fenchurch Street, the 08:30 LNER, arrives 11:09 (what TfL and Google say)"
- tests/core/trip-uk.test.mjs: "Letchworth → Newcastle goes via Stevenage, not King's Cross; Alnmouth by the York change; Arrive by 12:00 picks the 08:30 as Latest"
- tests/core/trip-uk.test.mjs: "Washington NE38 8SE: no station within walking reach, so Chester-le-Street (5.6 km) is used and flagged; the long walk is shown, not hidden"
- tests/core/trip-uk.test.mjs: "Fort William: by day via York, Edinburgh and Glasgow Queen Street; in the evening the Euston → Glasgow sleeper then Queen Street, arriving tomorrow (the direct Highland sleeper is not in TfL's data)"
- tests/core/trip-uk.test.mjs: "Returns: Newcastle → Letchworth via Stevenage 20:21; Newcastle → London office by King's Cross and the Tube; Fort William → Letchworth by the sleeper, arriving tomorrow"
- tests/core/trip-uk.test.mjs: "Boarding elsewhere needs the first mile on foot and the stop within walking reach; cycling to the station keeps the strict match; a journey wrong at both ends is refused"
- tests/core/trip-uk.test.mjs: "Outside Great Britain is refused with the area named; a Great Britain place far from any station still plans"
- tests/core/trip-uk.test.mjs: "Journeys boarding at a Tube stop are keyed by that stop: the later search asks from it, after the last one found; two stops are two keys"
- tests/core/trip-uk.test.mjs: "A boarding stop first seen in a later search is timed and listed, not silently dropped"
- tests/trip-page.test.mjs: "Trip UK-wide: two Tube boarding stops from one London station are two planner-cache keys, so each gets its own later search"
- tests/trip-page.test.mjs: "Trip UK-wide: Letchworth → Newcastle plans through the page via Stevenage, with the total, Leave by and a York change flagged"
- tests/trip-page.test.mjs: "Trip: a place outside the region is refused when chosen, with the region named"
- tests/core/trip.test.mjs: "Region: Great Britain since 3 Nov (the detail is in tests/core/trip-uk.test.mjs); the old South East box is history"
Live comparison after the build: `tools/trip-compare.mjs tools/trip-compare.example.json` (the 3 Nov journeys), written up in `docs/reviews/trip-uk-wide-live-2026-11-03.md`: every comparable journey matches TfL's trains and stations; against Google only bus legs and the Highland sleeper differ.

## Not yet / open
- The Highland sleeper and other services missing from TfL's planner: Google transit as a second route source.
- Departures-per-hour outside the South East (a national measurement is ≈ 2,600 board requests; worth a quiet hour).
- Searching *from* the start's position (TfL plans from coordinates around London): would also catch Aldgate East
  from One Braham directly. Needs Sam's direction on first-mile rules.
