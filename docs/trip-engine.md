# How the Trip engine plans a journey, and how it is tested

Written 3 Nov 2026 after issue #56 (Letchworth → One Braham recommended Liverpool Street and a long walk when the same
train via Aldgate arrives 8 minutes sooner). This is the working description of the engine as it is on `main` after
that fix: what it does, in order, with the numbers; and what evidence exists that it does it. The story
(`docs/stories/leisure-journeys.md`) holds the acceptance criteria; `docs/leisure-architecture.md` holds the design
decisions and build log; this document is the mechanism.

Everything here is in `src/core/trip/` and is pure: no DOM, no network, no clock reads. The page (`src/trip-ui.js`)
supplies ports, caches and the clock; the adapters (`src/trip-adapters.js`) talk to TfL and Google.

## 1. Inputs

`planTrip(request, ports, onStage)` (`tripPlan.ts`):

| Input | What it is |
|---|---|
| `from`, `to` | A `Place`: `{ id, name, address, geo: [lat, lon], kind: "address" \| "station" \| "current" }`. |
| `modes` | How you get to the first station and from the last stop: `walk`, `cycle` or `drive` at each end. |
| `question` | `{ kind: "now" \| "at" \| "by", t }`: Leave now, Leave around T, Arrive by T. |
| `now` | The clock, passed in (the engine never reads one). |
| `leisureKmh` | Your walking pace for Trip (Settings); walks are distance ÷ this pace. |
| `cfg` | `TripConfig` (`config.ts`): every threshold below, with defaults. Settings overrides the allowances. |
| `ports` | `stations` (the bundled list as a `StationIndex`), `access` (Google route matrix), `planner` (TfL), optional `live` (Darwin boards). |

The result is a `TripResult`: every journey found (in leaving order), the picks, "Other stations", the candidates
tried, the failed searches, the notes, and the request counts. `onStage` is called twice: `"timetable"` with the
first answer and `"complete"` at the end, so the page can draw before everything has arrived.

## 2. The pipeline in one view

```
place → region check → candidate stations at each end
      → round 1: station pairs (≤ 9) + searches to the place itself (≤ 3)   ‖  Google walk / cycle / drive times
      → FIRST ANSWER (station-pair journeys, ranked)
      → promote stations seen in round-1 journeys; time the Tube stops the place searches alighted at
      → round 2: untried pairs of the best stations (+ place searches for good origins, ≤ 3)
      → later searches for the 3 best pairs until the question's window is covered
      → re-time drives for the chosen journey
      → COMPLETE ANSWER (everything, ranked; "Better option found" if ≥ 5 min sooner than the first)
```

Budget: at most 18 planner searches per plan (`totalMax`), 2–4 Google matrix calls. A search that returns nothing is a
"failed pair" with its reason; nothing is retried in the same plan.

## 3. Which stations are tried (`stations.ts`)

1. **Region.** Both places must be inside `cfg.region` (today: London, the South East and the East of England, a box
   plus an outline). Outside: `TripError("outside")` and the page says so. This is the limit that refuses Newcastle or
   Fort William today; TfL itself plans station to station across Great Britain.
2. **Reach** in a straight line: walk 3 km, cycle 10 km, drive 25 km.
3. **Candidates** per end: the **3 nearest** within reach, plus up to **2 well-served** stations within reach whose
   `servicePerHour` is at least **2×** the best of the nearest three (highest first). None within reach: the single
   nearest station, flagged "Nearest station is N km away".
4. **Promotion** (after round 1): a station within reach where a round-1 journey boards or changes becomes a
   candidate (found from live data, not the prior).

`servicePerHour` comes from `data/stations.json`, measured once from National Rail boards (a coarse prior; the
Saturday-evening sample is noted in the file's metadata). It only ever adds stations; the nearest three are always in.

## 4. What is searched (`tripPlan.ts`)

A search goes from an origin **station** to a **target**, which is either a destination **station** or, when the far
end is on foot, **the place itself** (its position). The planner port has `plan(fromStation, toStation, t, timeIs)`
and optional `planTo(fromStation, place, t, timeIs)`; TfL's adapter implements both.

- **Round 1 pairs** (`roundOnePairs`): nearest From × every To candidate, then every From candidate × nearest To, at
  most 9, all at once.
- **Round 1 place searches**: when `modes.to === "walk"`, the planner can plan to places, and `cfg.placeSearches > 0`
  (default 3): from the first 3 origin candidates to the place's position.
- **Round 2**: untried pairs among origins and destinations whose best door-to-door arrival is within 30 min of the
  best overall (promoted stations always count as good), plus a place search for each good origin that hasn't had
  one, up to 3. **No place searches in round 2 if every round-1 place search was refused** (`placeWorks`): TfL plans to
  positions around London only; elsewhere it answers "no journey", and that is said once, not repeated.
- **Later searches**: for the 3 best (origin, target) pairs, departing after the last journey found, until Leave now /
  around covers T + 100 min; for Arrive by, from T − 100 min. Pairs more than 30 min behind the best get none.
- `timeIs` is `Arriving` for Arrive by, else `Departing`; the search time is `now` (Leave now) or T.

**Journeys kept per search key.** Each (origin, target) has a key (`LET-LST`, `LET-@place`). Within a key, one journey
per **(trains' departures, alighting stop)**: the same 07:50 alighting at Aldgate East and at Tower Hill are two
journeys. Across keys, `assemble` keeps one journey per `Journey.id`, so a train found both by a station pair and by a
place search is listed once.

**Journeys that alight somewhere else.** A station-pair reply often ends with TfL walking from a nearby stop to the
station asked for (Letchworth → Fenchurch Street: "… → Aldgate → walk to Fenchurch Street"). The parser refuses it as
that pair but returns it in `elsewhere`. When the far end is on foot and that stop is within walking reach (3 km) of
the place, the engine **keeps it as a journey to the place from that stop**, under the place key, and says so in the
notes ("3 journeys alight at Aldgate / Tower Hill and walk on; kept as journeys to One Braham from there"). Without
a place target (cycle / drive at the far end, or a planner that can't plan to places), it stays refused.

## 5. Reading a TfL reply (`tflJourney.ts`)

Modes asked for: national-rail, tube, overground, elizabeth-line, dlr, walking (no bus; any bus that comes back is kept
and flagged "Bus between X and Y"). Each leg becomes a `Ride` of kind `rail`, `tube` (also DLR, tram), `walk`, `bus` or
`other`; rail rides also carry a `Train` so the rest of the app treats them like any train.

**Who a TfL stop point is** (`tflStation`), in order:
1. its naptan ID is in the station list (`ids.tfl`), or
2. its ICS code is (`ids.tflIcs`; a hub's rail and Tube stops share one: Farringdon), or
3. the nearest listed station within **300 m** whose **name agrees** (`sameStationName`: one name's words, minus
   "London / Rail / Station / Underground / DLR", are all in the other's; "King's Cross St. Pancras Underground
   Station" is King's Cross; "Tower Hill" is never Fenchurch Street, though it is 180 m away), or
4. **a stop of its own**: `crs: ""`, the name, TfL's position, `ids: { tfl: [naptan], tflIcs: [ics] }`. Its identity for
   keys, ids and comparisons is `stationKey()`: CRS, else `tfl:<naptan>`, else `name:<name>`.

Before 3 Nov, step 3 matched by position alone, which relabelled Tube stops as the nearest mainline station; that was
one of the causes of #56.

**Ends are checked.** Leading and trailing walks (TfL's own walks into and out of the stations) are dropped and noted;
Trip adds its own access and exit. Then:
- the first ride must start at the station asked for, else refused: "TfL matched a different place (A → B)";
- for a **station** target, the last ride must end at it (by `stationKey`); else refused with "…, not C" and offered in
  `elsewhere`;
- for a **place** target, the reply's final arrival point must be within **300 m** of the place; the last ride's `to`
  (a station or a Tube stop) is where you alight. A note says "Alight at Aldgate East for One Braham".
- at least one main ride (rail / bus / other) must remain, else "No train in TfL's journey".

Partial refusals are reported back as notes ("Why these trains?") unless the journey was kept to the place instead.

## 6. Times: every minute once (`access.ts`, `journeyCore.ts`)

A journey is `before` segments → rides → `after` segments. **Every time on screen comes from these**; nothing else does
timing arithmetic (`journeyTimes`: leave = first ride's departure − before; arrive = last ride's arrival + after).

- **Before**: walk = Google's walking distance to the station at your leisure pace + 3 min to the platform
  (`stationMin`); cycle = Google's cycling time + 4 min to lock up (`lockMin`); drive = Google's driving time (traffic
  aware, for the set-off time) + 10 min to park (`parkMin`). Already at the station (Current location within 400 m):
  just the platform minutes.
- **After**: 3 min out of the station (`exitMin`; 5 min back to the car when driving, `carBackMin`) + the walk / cycle
  / drive from **where you alight**, which since 3 Nov may be a Tube stop: Google is asked from that stop's position.
  TfL's own final walk is dropped, so the walk is counted once.
- Allowances are Settings values, clamped 0–60 min. Defaults 10 / 4 / 3 / 3 / 5.
- Walk times are time-independent and cached for the session by the page; drives are re-timed for the chosen journey's
  real set-off and arrival, and again every 5 minutes while following.
- Known imprecision: Google is asked from the station's listed coordinate, which at a large station can be the middle
  of the complex rather than the exit nearest you (Euston: 17 min measured against Google Maps' 9).

**Identity.** `Journey.id` = `fromKey|toKey|<origin CRS + hh:mm of each main ride>`, so the same trains to two different
stops are two journeys, and a saved followed trip finds itself again after a refresh.

**Changes** (`changeStatus`, one rule for planned and live): spare = next departure − this arrival − any Tube / walk
across, whole minutes down. Under 0 or next cancelled: missed. Under 2: at risk. Under 5 and below the planned spare:
tight. A trailing Tube ride is not a change; it is the last ride, and the journey arrives when it does.

## 7. Picking (`tripRank.ts`, `rank.ts`)

- A journey can be picked (`tripCanFollow`) only when nothing about it is unknown: not uncertain (no route for a walk,
  a cancelled or unknown-time train), not missed, leave time not passed, every ride's times usable.
- **Leave now / around**: the earliest arrival; next best = a later leave arriving within 20 min of it.
- **Arrive by T**: the latest leave that arrives by T (tie: earlier arrival); next best = an earlier leave that
  arrives sooner, within 20 min. Journeys after T are listed and flagged "Late by N min", never hidden.
- Flags: "Arrives first · walking", "Latest for 09:00", "Leave N min before 07:30" (Leave around), "Tomorrow · Wed 4 Nov".
- **Other stations**: the best journey from / to each other station (by `stationKey`, so Tube stops are told apart),
  with its consequence in minutes; at most 4.
- **Better option found**: a journey in the complete answer arriving ≥ 5 min sooner than the first answer's pick.
  Because Tube stops from place searches are timed after the first answer, #56's Aldgate pick arrives this way.

## 8. Live and Follow (`tripLive.ts`, `followTrip.ts`)

- Live asks for at most 6 Darwin boards per refresh: the followed trip's next two rides, each pick's first ride, then
  other first rides leaving within 30 min; only rail rides between stations with CRS codes (never a Tube board).
- A board's service is matched by timetabled departure and destination; one candidate or none, never a guess.
  Live times replace the ride's, arrive and changes are recomputed, Tube rides are untouched.
- Follow keeps the whole itinerary, its phases (before, access, ride, change, final, arrived) by time and by your
  answers, recovery from the stop you can actually reach (a Tube stop included), and restores from saved state only
  when the saved shape validates. A journey ending at a Tube stop saves and restores (tested).

## 9. Diagnostics

`TripResult.failed` (a search that returned nothing: "Baldock → Grand Arcade Cambridge: TfL found no journey …"),
`TripResult.notes` (partial refusals, kept-elsewhere journeys, access problems), and `requests` (planner, access).
The page shows failed and notes under "Why these trains?". A refusal is never silent.

## 10. Known limits (3 Nov)

1. **Region.** Places outside the South East are refused. TfL plans UK-wide by station ID; the limit is the app's
   (`TRIP_DEFAULTS.region`, `tools/stations.mjs`). Planned next (decisions log, 3 Nov).
2. **Origin side has no place search.** You board at a listed rail station; from an office next to a Tube stop the
   app walks you to the nearest mainline station first (One Braham → Liverpool Street, 15 min, where TfL and Google
   start at Aldgate East, 6 min). The mirror of #56; needs Sam's direction on first-mile rules.
3. **TfL's data gaps.** Its interchange walks are conservative (King's Cross ↔ St Pancras 13–14 min; Google 5–6); it
   lacks the direct Highland Caledonian Sleeper (Euston ⇄ Fort William) and offers only the Glasgow sleeper plus a
   connection. A second route source (Google transit) is the planned answer.
4. **Reach is a hard edge** (3 km walking): a fast station at 3.1 km is never tried.
5. **Leave-by margins.** The platform allowance plus Google's walk from your door can make a train unreachable that
   Google Maps would start you 1–2 minutes sooner for. Deliberate conservatism; the allowance is yours to set.
6. **No Google key, nothing planned** (Sam, 31 Oct): no estimated fallback for real users.

## 11. How it is tested

Tests run on a virtual clock (Tue 3 Nov 2026 10:00); the engine tests pass explicit times.

**Recorded TfL replies** (`tests/fixtures/trip/`, keys removed, leg geometry removed): Brighton → Canterbury West (three
changes, TfL's walk out, a 23:00 search for tomorrow's trains, Arrive by), Brighton → Letchworth (a guessed ID resolving
to a bus stop), Winchester → Norwich (cross-London Tube), and from 3 Nov: Letchworth → Fenchurch Street / Liverpool
Street / Whitechapel / One Braham's position (Leave now and Arrive by), Brighton → Victoria / Pimlico's position.

**Engine tests** (`tests/core/trip.test.mjs`, `trip-edges.test.mjs`, `trip-live.test.mjs`, `follow.test.mjs`) prove,
among others: candidate rules and reach; round budgets and causal depth of the first answer (≤ 2 network steps);
Tube-stop identity (Tower Hill is not Fenchurch Street; hubs match by ICS code or name; nameless or noise-only names
never match; a CRS-less station end matches nothing); place ends (walk dropped, 300 m check, alighting stop kept with
TfL's IDs); the #56 plan end to end (first answer Liverpool Street 08:40, complete answer Aldgate 08:32, after-segments
"Out of Aldgate 3 min" + 320 m walk, Other stations, notes, budget, ids, live budget, Follow save / restore / recovery);
the same trains to two stops listed twice whichever reply arrives first; Arrive by preferring the nearer stop;
an unrelated destination (Pimlico) to prove nothing is Aldgate-specific; cycling, a planner without places and
`placeSearches: 0` searching stations only; round 2 sending no place searches after refusals; the 3 km filter on
alight-elsewhere journeys; kept refusals said once; `placeSearches` per round.

**Page tests** (`tests/trip-page.test.mjs`, `trip-shared-ui*.test.mjs`): the Trip switch, address search, a plan from
recorded replies through the real page, request counts and no commute requests, live board budget and timing, Follow
and Stop, drive re-check, and from 3 Nov: Letchworth → One Braham recommends alighting at Aldgate on the first
complete card, lists an Aldgate East journey from the place search, shows the Tube leg, "Out of Aldgate" and the final
walk, asks TfL for the place itself, stays within 18 searches, and Follow saves a Tube-stop ending.

**Independent review** (CLAUDE.md rule; 3 Nov, three rounds): 25 deliberate one-line breakages of the engine and
adapters. Round 1 found one behaviour defect (the dedupe by trains alone; fixed in a20c91f) and six test gaps; all
were turned into committed tests; by round 3 every mutation was killed by a committed test except one page-assertion
nicety, since tightened. The reports are in the session; the tests are the record.

**Live comparison runs** (`docs/reviews/trip-20-journeys-2026-11-03.md`, `docs/reviews/trip-complex-journeys-2026-11-03.md`):
20 journeys in the region, twice (estimated walks; then Google-timed walks), and 32 long-distance and regional
journeys out and back, each against TfL's own door-to-door answer and Google Maps transit. In the region every
answer matched TfL on trains and alighting stop and Google's rail-only routes within walking minutes; the one engine
defect those runs exposed (Arrive by picking Liverpool Street + 15 min over Aldgate East on the same train) is the
dedupe fix above. Outside the region the app refuses; the TfL and Google answers are recorded as acceptance targets.

**Re-running the live comparison**: `node tools/trip-compare.mjs <journeys.json>` after `npm run build`, with
`TFL_APP_KEY` (and `GOOGLE_MAPS_KEY` for Google-timed walks and Google Maps routes) in the environment. It prints each
journey's app answer, TfL's and Google's, and writes a JSON with keys removed. `tools/trip-compare.example.json`
holds the 3 Nov journeys (public places; homes are town-centre points).

**Not verified**: live-day running (every run was timetable, the day before); journeys on other days; Google's
transit coverage as a route *source* (only as a comparator); National Rail's planner (no access).
