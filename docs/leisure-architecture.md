# Trip mode (leisure journeys) — architecture

Status: design revision 2, 31 Oct 2026 (night), after the first independent review (verdict "rework": 3 blockers,
6 majors; all addressed below, §12). Not built. Behaviour contract: [story](stories/leisure-journeys.md).
Sam's architecture brief (31 Oct): **reuse, loose coupling and speed**. Each section says which it serves.

## 1. Decisions this rests on (Sam, 31 Oct)
- A **third mode, Trip** (Commute / Leisure / Trip). Today's Leisure (home ↔ London) is unchanged.
- Walk / cycle / drive to and from the station. Stations discovered and ranked. Google key required, no estimates.
- Google through its **Maps JavaScript library** (the supported browser route), loaded only when Trip is used.
- National Rail journey planner when access arrives; TfL journey planner station to station meanwhile.
- First build: plan, live legs and changes, Follow across legs, drive re-check. Signal only. Behind Experimental.

## 2. Shape: one journey core, ports at the edges
```
        Screen (src/trip-ui.js, mounted by page.html)        ← draws Presentation + Journey[]; owns DOM only
                    │ calls
        Orchestrator (src/core/tripPlan.ts)                  ← async, pure: ports + now injected, emits stages
         │        │           │            │
   StationIndex  AccessTimer  RailPlanner  LiveBoards  PlaceSearch     ← ports (src/core/ports.ts, types only)
   (bundled)     (Google JS)  (TfL | NR)   (Darwin)    (Google JS)     ← adapters (src/adapters-web/*, shell side)
         │                                                            parsers stay pure in src/core/adapters/
   Journey core (src/core/journey.ts + journeyCore.ts)                ← shared by commute and Trip
```
**Coupling rule**: the engine sees only `Place`, `Station`, `Journey` and port results. No provider ID formats (910G,
CRS-by-name, Google place IDs beyond an opaque string), no URLs, no keys, no DOM. Each port has three implementations:
the real one, a fixture one (tests), and a simulator one (journey simulator). Swapping Google → another geocoder, or
TfL → NR planner, changes one adapter and no engine code.

## 3. Reuse: the Journey core
Today `Option` is one train plus a `hub`. Rather than a parallel `Trip` type (rejected: it would grow its own rank,
follow and present), introduce a general **`Journey`** and make the commute's `Option` a one-leg case of it.
```ts
interface Ride { kind: "rail"|"tube"|"walk"|"bus"|"other"; train?: Train;            // rail legs carry a Train
                 from: Station; to: Station; dep: number; arr: number; secs?: number; label?: string }
interface Transfer { arriveAt: Station; departFrom: Station; via: Ride[]; gapSecs: number; minSecs: number|null }
interface Journey { id: string; leave: number; arrive: number;
                    before: Segment[]; rides: Ride[]; transfers: Transfer[]; after: Segment[];
                    flags: Flag[]; recommended?: number; uncertain?: boolean; missed?: boolean; late?: boolean;
                    tomorrow?: boolean; source: "darwin"|"tfl"|"nr"|"demo" }
```
- **Ranking**: `topPicks` already uses only `leave / arrive / uncertain / missed / late`. Retype it on a minimal
  `Rankable` interface (no behaviour change; commute goldens prove it). Trip uses it as is (20-min window).
- **Timing**: `journeyTimes(j)` and `journeySteps(j)` in `journey.ts` compute every time from segments + rides (the
  "every time from segments" rule); `buildOptions` keeps its output and later delegates to them.
- **Flags**: split `trainFlags` into `serviceFlags(train, policy)` (cancelled, no estimate, status colour, reason:
  generic) and the commute's profile rules (standing room, stopping train: Sam-specific, never applied to trips).
- **Searching**: generalise `searchRoutes` from `"A-B"` string keys (split on "-", `hubOfKey` assumes `p.home`) to
  `searchPairs(pairs: {key, from, to}[], rounds, search, conv, { concurrent })`; `searchRoutes` becomes a thin wrapper
  (commute unchanged, serial). Trip runs each round concurrently; "every pair gets its first search before any gets a
  second" and "stop on refusal / timeout" are kept per round.
- **Live matching**: `matchLeg(ride, board)` reuses Darwin board parsing and same-train rules.
- **Follow**: `followJourney.ts` follows `Journey.rides[i]` with a current-ride index, reusing `follow.ts`'s exported
  rules (1-min stability, 5-min better, reasons, never silent replacement, explicit Follow to switch) by extracting
  them into `followRules.ts` (pure move, follow.ts behaviour unchanged). The released commute Follow is not rewritten
  now; it moves onto `followJourney` later through `journeyOfOption` (one ride), proven by its existing tests.
- **Presentation**: `present.ts` gains trip views and a `TripSituation` (§7); same `Presentation` type, so
  `viewControl.ts` (Auto / Plan / Live override) is reused unchanged.
- **Convergence path** (not in this build): `journeyOfOption(o)` adapter first, used by shared consumers (progress
  strip, follow), then the commute's planner emits `Journey` directly. Each step is a no-change refactor with goldens.

## 4. Ports (`src/core/ports.ts`, types only)
```ts
interface PlaceSearch { suggest(text: string, session: object, region: Region): Promise<Suggestion[]>;
                        resolve(s: Suggestion, session: object): Promise<Place> }        // resolve ends the session
interface AccessTimer { matrix(origin: LatLon, to: LatLon[], mode: Mode, departAt: number, dir: "to"|"from")
                          : Promise<({ metres: number; secs: number } | null)[]> }
interface StationIndex { near(geo: LatLon, km: number): Station[]; byCrs(crs: string): Station|null;
                         byNaptan(id: string): Station|null; nearestTo(geo: LatLon, m: number): Station|null }
interface RailPlanner { plan(from: Station, to: Station, t: number, timeIs: "Departing"|"Arriving")
                          : Promise<{ journeys: RailJourney[]; refused: string[] }> }   // RailJourney = rides+transfers
interface LiveBoards  { board(from: string, to: string): Promise<Board>; service(id: string): Promise<ServiceProgress> }
```
`Station = { crs, name, geo, naptan: string[], carPark: "yes"|"no"|"unknown", depsPerHour: number }`.

## 5. Station data (bundled; serves speed and correctness)
`data/stations.json`, generated by `tools/stations.mjs` (run by hand, reviewed, committed; reruns diffed):
- Base list: open UK stations list (name, position, CRS; ODbL 1.0, attribution in Settings → About), filtered to the
  region box: 1,092 stations.
- TfL station IDs: TfL nearby-stations search at each station's position (≤ 400 m), matched by normalised name; all
  matching IDs kept (St Pancras has `910GSTPADOM`, `910GSTPX`, `910GSTPXBOX`); unmatched or ambiguous rows listed in
  the tool's report and fixed by hand in a small overrides file. Removes runtime ID lookups and the Feltham risk.
- Car park: TfL station detail `Car park` facility (key spelled so; absent → `unknown`).
- `depsPerHour`: departures in a weekday 2-hour window from the National Rail board, measured once by the tool
  (≈ 1,100 requests on Sam's RDM key, throttled). Used only to find well-served stations (§6). Without it the field
  is 0 and only the nearest rule applies.
- Keys come from the environment; nothing key-shaped is written (TfL echoes `app_key` in `searchCriteria`: stripped,
  and a test fails if any data or fixture file contains `app_key=` or `x-apikey`).

## 6. Station candidates and pairs (blocker 1 fixed)
Per end and mode (reach in a straight line: walk 3 km, cycle 10 km, drive 25 km):
- the **3 nearest** within reach, plus up to **2 well-served** stations within reach not already included: the
  highest `depsPerHour` that is at least 2× the best of the nearest three. Max 5. None within reach → the nearest
  station, flagged "Nearest station is N km away".
- Example to pin (drive, near Chilham, Kent): nearest Chilham, Chartham, Selling; well-served Ashford International
  and Canterbury West. Ashford's high-speed trains are therefore searched.
- **No pruning on access time alone.** Round 1 pairs: nearest From × every To candidate, and every From candidate ×
  nearest To (≤ 9 searches, concurrent). Round 2 only for pairs whose best door-to-door arrival is within 30 min of
  the best found (≤ 6 more). Total ≤ 15 planner searches per plan.

## 7. Trips with changes, and the views
- TfL adapter (`tflJourney.ts`), from recorded replies: rail rides keep their `Train`; tube / walk rides between
  termini become a `Transfer.via`; leading / trailing TfL walk legs at a station are dropped (we add our own access
  and exit) and recorded in diagnostics. Ends are checked by naptan ID, else ICS code, else within 300 m of the asked
  station; a mismatch refuses that journey ("TfL matched a different place"). Bus / coach / replacement-bus rides are
  kept and flagged ("Bus between X and Y"), never dropped. Requested modes: national-rail, tube, overground,
  elizabeth-line, dlr, walking.
- **One change rule** (`changeStatus` in `journeyCore.ts`), used for planned and live times alike:
  spare = floor((next ride's departure − this ride's arrival − transfer ride time) / 1 min), using expected times
  when both are live, else timetabled with status "Not live" (never green). spare ≥ 5 ok; 2–4 amber "Tight change,
  N min"; < 2 red "Connection at risk"; next departed / cancelled while this ride is still running → red "Connection
  missed" + "Plan from <station>". The change time is the planner's minimum connection (NR) or the gap TfL planned;
  never shortened.
- Overnight: a journey departing on a later service day is flagged "Tomorrow" with the date.
- Views (`present.ts`): `trip-plan-now | trip-plan-by | trip-plan-at` (blocks: label, headline, options, otherStations,
  lines, board, why, source), `trip-access` (on the way to the station: way, headline, then), `trip-on-ride`
  (headline = arrival; which, progress, then), `trip-change` (headline = next departure + spare; which, then),
  `trip-final` (headline = arrival; then). `TripSituation` = plan kind + followed / inferred ride index + at a trip
  station (≤ 400 m) + on the move. Which ride you're on: the followed ride by time; GPS within 1 km of the ride's
  line between its stations confirms; when two rides fit (within 1 km and 5 min) it asks and remembers for this trip.

## 8. Speed (target and how it's met)
**Target**: first answer drawn ≤ 4 s after the second place is chosen, with every feed answering in 600 ms; live
times drawn ≤ 6 s; at most 3 serial network steps on the critical path. Tested in a page test with mock feeds at
fixed latency, asserting time to first draw and serial depth from the request log.
How:
1. Bundled stations (§5): no ID or facility lookups at plan time.
2. **Prefetch on choice**: choosing From starts its candidates' access matrix at once (while To is being typed);
   choosing To starts its matrix and the round-1 planner searches immediately (they don't need access times).
3. Concurrent rounds (§3, §6). Planner replies cached 5 min per (pair, 15-min slot); matrices for walk / cycle cached
   for the session; drive matrix per 15-min slot.
4. **Progressive drawing** via orchestrator stages: `timetable-partial` (first pair back) → `timetable` (round 1
   done) → `live` → `round-2`. A redraw never silently swaps the headline: a new best after first draw is shown with
   "Better option found" and the previous one stays in the list.
5. Critical path: place details (1) → planner round 1 ∥ access matrix (2) → first draw; Darwin boards (3) → live.

## 9. Live within a budget
≤ 6 Darwin board requests per refresh, refreshes ≥ 30 s apart: the rides of the two picks, the followed journey's
next two rides, then first rides departing within 30 min, in that order. Others say "Not live". A matched ride then
uses Service Details by service ID (about once a minute for the ride you're on, as today). Drive re-check: Google
matrix every 5 min within 60 min of leaving; a change ≥ 2 min moves the leave time with "Traffic: leave N min
earlier/later"; if the new leave time has passed, the headline says "Leave now: N min late for the 14:05" and Follow's
missed / alternative rules apply.

## 10. Screen (`src/trip-ui.js`)
- Explicit `mount(root, { ports, store, clock, present, onFollow })`; no page globals, no Panda DOM. `page.html` adds
  the Trip mode button (only when the switch and Signal are on) and mounts it. Turning either off unmounts it; the
  Commute / Leisure screens are untouched.
- Google adapter (`src/adapters-web/google.js`): loads the Maps JS library on first Trip use (script tag, key from
  Settings, `loading=async`), Places `AutocompleteSuggestion` with a session token, `locationRestriction` = region box
  and `gb`; the session ends with the place's field fetch. Matrix via the library's route-matrix service. Exact class
  names and limits are **unverified until Sam's key exists**; only this file depends on them.
- Google terms: recent places keep the place ID and name; positions are re-fetched (not kept beyond 30 days).
  "Powered by Google" shown under the suggestions.

## 11. Saved data, keys, release
Saved (validated on restore, malformed dropped): `settings.tripMode` (switch), `settings.googleKey`,
`settings.nrPlanner {url, key}`, `settings.tripAllow {parkMin, lockMin, stationMin, carBackMin}` (0–60 each),
`trip {from, to, modeFrom, modeTo, question}`, `recentPlaces` (≤ 5, ID + name + savedAt), `followJourney`. Keys shown
as the last 4 characters, never logged, captured, exported or included in simulator reports. Switch off keeps them;
no Trip request is made. Release: GitHub-first path (saved state, new feeds, keys, external script).

## 12. First review → this revision
| Finding | Resolution |
| --- | --- |
| 1 Straight-line candidates miss Ashford; 20-min prune wrong | §6 nearest + well-served, no access-only prune, pin Chilham |
| 2 TfL shape (null naptan at end, trailing walk, transfers as gaps) | §7 end check naptan / ICS / 300 m; drop TfL station walks; `Transfer` model |
| 3 No CRS for change stations | §5 bundled stations with CRS + naptan IDs |
| 4 Live board cost unbounded | §9 ≤ 6 boards per refresh, priority order, Service Details by ID |
| 5 Two tight-change rules, rounding | §7 one rule, floor, Not live never green |
| 6 Request budget inconsistent | story budget table; §5 removes runtime lookups; request-count golden |
| 7 Gaps (same station, at station, moving, tomorrow, buses, Leisure, mid-trip, arrive-by drive) | story "Edges"; Trip as 3rd mode (Sam) |
| 8 Google claims | Maps JS (Sam); session ends on fetch; terms; attribution; unverified items isolated in one file |
| 9 present.ts commute-specific | §7 trip views + `TripSituation` |
| 10 Untestable wording | story numbers for ask / remember / key display / passed leave |
| 11 Design-system gaps | L11–L16 added |
| Reuse / coupling / speed | §2–§4, §8 |
Not taken: the reviewer suggested cutting cycle and the drive re-check from the first build; Sam chose both, so they
stay, built last (order §13).

## 13. Build order (each step tested, reviewed, behind the switch)
1. `Rankable` / `searchPairs` / `serviceFlags` / `followRules` extractions: no behaviour change, commute goldens
   unchanged (docs waiver line in the commit).
2. Station data tool + `data/stations.json` + `StationIndex`.
3. Journey core, `changeStatus`, TfL journey adapter from recorded replies (Brighton → Canterbury West, Winchester →
   Norwich, 23:00 overnight), candidates and pairs, `tripPlan` orchestrator with fixture ports.
4. Trip views in `present.ts`; `trip-ui.js` with the switch (off and on tested), fixture ports in page tests.
5. Google Maps JS adapter (synthetic tests; live check once the key exists).
6. Live boards within budget; change status live.
7. `followJourney` across rides.
8. Drive re-check; NR planner adapter from documentation (unverified until access).
Mutation-testing independent review before merging (CLAUDE.md); GitHub-first path.
