# Leisure journeys — architecture (design for independent review)

Status: design, 31 Oct 2026 (evening). Not built. Behaviour contract: [story](stories/leisure-journeys.md).
Fits inside the four layers of [architecture.md](architecture.md); nothing here changes the commute.

## 1. What is new, and what is reused

| Need | Today | Leisure journeys |
| --- | --- | --- |
| Ends of the journey | home / office / one typed London place | any two places in the region, chosen from a search |
| Getting to the station | measured walks, Sam's routes | walk / cycle / drive, timed by Google, plus allowances |
| Which station | profile data (Letchworth; KGX / STP / ZFD) | discovered per trip (nearby stations), ranked door to door |
| The train | **one direct train** per option (`Option.train`, `hub`) | **a rail journey with 0..n changes** |
| Live | Darwin boards for fixed pairs; Service Details | Darwin board per leg origin; Service Details for the leg you're on |
| Following | `follow.ts`: one train between walk/tube segments | the same principles over several rail legs |

Reused unchanged: the segment model (`journey.ts`: every time on screen comes from segments), `trainFlags`, status
thresholds (`rules.ts`, `disruption.ts`), ranking (`topPicks`, 20-min window), `searchRoutes` round discipline (every
pair gets its first search before any gets a second; stop on refusal / timeout), `present.ts` view choice and block
order, `viewControl.ts`, Darwin board parsing, Service Details parsing, the simulator's clock and provider injection.

The one structural change is **multi-leg rail**. It is added as a new type beside `Option`, not by bending `Option`:
the commute keeps `Option` exactly as it is; leisure produces `Trip`. Shared code is extracted only where both need it.

## 2. Engine (`src/core`, pure)

New modules (no DOM, no network, no clock; times are inputs):

- `region.ts`: `Region` bounding box (profile data); `inRegion(geo, region)`.
- `places.ts`: `Place { id, name, address, geo, kind: "address"|"station"|"current" }`; `recentPlaces(list, place, max=5)`
  (dedupe by id, newest first); `validPlace(x)` for restore.
- `stationsNear.ts`: `candidates(geo, mode, stations, reach={walk:3,cycle:10,drive:25}, max=4)` over a station list
  (`Station { crs, name, geo }`) → nearest first within reach, else `[nearest]` with `far: km`. `prune(cands, accessMs,
  slackMs=20 min)`. `pairs(from, to, max=[3,2])`.
- `access.ts`: builds the before/after `Segment[]` for a mode from a measured route (`{ metres, secs }`) and
  allowances: walk = metres ÷ leisure pace (+ station 3 min); cycle = Google secs + lock 4 min; drive = Google secs +
  park 10 min; arriving: station exit 3 min + walk / cycle, or 5 min back to the car + drive. New segment kinds `cycle`
  and `drive` join `SegmentKind`; `accessOf` counts them as `fixed` (effort levels apply to walks only).
- `trip.ts`: the multi-leg model and its timing.
  ```ts
  interface RailLeg { train: Train; fromCrs: string; toCrs: string; kind: "rail"|"tube"|"walk"|"other"; secs?: number }
  interface Change { at: string; atCrs: string; minSecs: number }      // planner's minimum connection, never shortened
  interface Trip { id; from: Place; to: Place; fromStation: Station; toStation: Station;
                   before: Segment[]; legs: RailLeg[]; changes: Change[]; after: Segment[];
                   leave; arrive; flags: Flag[]; changeStatus: ChangeStatus[]; recommended?; source: "nre"|"tfl" }
  ```
  `buildTrip(...)` computes `leave` / `arrive` from segments and the first / last rail leg's live-or-timetabled times;
  `tripSteps(trip)` returns the `Leg[]` for Journey steps; `changeStatus(prev, next, change)` → spare minutes and
  level with the 5 / 2 min thresholds in `LEISURE_DEFAULTS` (overridable via `Profile.leisure`).
- `tripSearch.ts`: rounds per station pair over an injected `RailPlannerFn` (Leave now / around / Arrive by, mirroring
  `search.ts`), with the 6-pair first round and 12-search total cap; returns trips, failures per pair and diagnostics.
  Arrive by with a drive: Google gives arrival times only for transit, so the drive is timed at the estimated set-off
  and re-timed once at the computed leave (the shell asks; the engine says which set-off time to ask for).
- `tripRank.ts`: `rankTrips(trips, question, T)` → leaving order list, picks with `topPicks` semantics (via a small
  generic extracted from `rank.ts` that takes `leave` / `arrive`), "Other stations" with consequence minutes.
- `tripLive.ts`: `matchLeg(leg, board)` (timetabled departure + destination; same rules as same-train matching),
  `applyLive(trip, boards)` → expected times, platform, cancellation, flags, change status; missing / stale board is
  "Not live", never cancellation.
- `followTrip.ts`: follows a `Trip` with the follow principles of `follow.ts`: stable arrival (1-min threshold),
  notices with reasons (cancelled, delay, connection at risk / missed, traffic), current leg from plan + time +
  explicit answers + position near leg stations, alternatives only ≥ 5 min sooner or when broken, never silent
  replacement. Shares helpers with `follow.ts` (service key, status) rather than duplicating them. Saved shape
  `FollowTrip { version: 1, kind: "trip", ... }` with a validator; the existing `FollowRoute` is untouched.
- `present.ts`: leisure trips use the same `View` / blocks; new block `otherStations`; `headlineKind` unchanged.

Adapters (`src/core/adapters`, pure parsers and request builders; the shell sends):
- `google.ts`: `autocompleteRequest(input, token, region)`, `parseAutocomplete(json)` → suggestions;
  `detailsRequest(id, token)`, `parsePlace(json)`; `routeMatrixRequest(origin(s), dest(s), mode, departAt)`,
  `parseRouteMatrix(json)` → `{ i, j, metres, secs, ok }[]`; `routesRequest`, `parseRoute`. Field masks are constants.
  Built from Google's documented Routes API v2 and Places API (New) shapes; **unverified until Sam has a key** (the
  build session could not reach Google). Fixtures are synthetic and labelled so.
- `tflTrip.ts`: TfL journey → `RailLeg[]` + `Change[]` (multi-leg; tube / walk legs between termini kept as legs),
  `tflStationCheck(json, fromId, toId)` (the Feltham refusal), `parseNearbyStations(json)` (ids, names, car park).
- `nrePlanner.ts`: request builder + parser for National Rail's journey planner (SOAP), from published documentation;
  **unverified until access**. Fixture marked "documented shape, not a recorded reply".

## 3. Data (profile layer)
- `data/stations.json`: the region's rail stations (CRS, name, lat, lon) from the open UK stations list (ODbL 1.0;
  attribution in Settings). Generated by `tools/stations.mjs`, filtered to the region, committed. Data, not options.
- TfL station IDs: resolved per trip from TfL's nearby-stations search at the candidate's position (≤ 400 m, name
  check), cached on the phone for 30 days. Never constructed from a name.
- `Profile.leisure`: region box, reach per mode, max candidates, prune slack, pair caps, allowances, change thresholds,
  drive re-time interval / threshold. Sam's profile supplies defaults; Settings override allowances only.

## 4. Screen (`src/page.html` + a new `src/leisure-ui.js`)
- `leisure-ui.js` (like `journey-ui.js`): the From / To combobox, mode segmented controls, and drawing trips in
  `present.ts` block order. It fetches through injected functions so the simulator can supply them.
- Fetching in the page: Google (autocomplete, details, route matrix, routes), TfL (nearby stations, station detail,
  journey planner), NR journey planner, Darwin boards / Service Details. Each behind the existing source-epoch guard,
  timeout, backoff and "stop on refusal" behaviour; keys read from Settings at call time; never logged.
- Only when the switch is on **and** Signal is on **and** Leisure is chosen. Otherwise none of this code runs.

## 5. Flow of one plan
1. From / To resolved to `Place`s (Google details; current location from the fix). Region check.
2. `candidates` per end from `data/stations.json`. One route-matrix request per end → access times. `prune`.
3. TfL station IDs for the surviving candidates (cache, else nearby search). Skipped when NR planner is configured (CRS).
4. `tripSearch` rounds over the station pairs with the injected planner → trips (timetable).
5. `applyLive` with Darwin boards for legs departing within 2 h → expected times, flags, change status.
6. `rankTrips` → picks, list, Other stations. `present.ts` → view and blocks. Draw.
7. Refresh: boards every refresh (≥ 30 s); planner searches reused 5 min (as the timetable today); drive re-time every
   5 min within 60 min of leaving; matrix for walk / cycle reused for the trip.

## 6. Failure and honesty rules
- No Google key: say so; no request. Google refusal / quota: "Google refused the request (HTTP n)"; no estimate is
  invented (Sam's decision).
- One end's stations all failing → no trips, with why. One pair failing → the others still plan; "Why these trains?"
  lists the pair and the reason.
- Planner says nothing / disambiguation / wrong station → that pair fails with its reason.
- Live missing or stale → "Not live" flags; never treated as cancellation (existing rule).

## 7. Saved data (GitHub-first release path: saved state, new feeds, keys)
`settings.leisureJourneys: boolean`, `settings.googleKey: string`, `settings.nrPlanner: { url, key }`,
`settings.leisureAllow: { parkMin, lockMin, stationMin, carBackMin }` (each 0–60), `leisureTrip: { from, to, modeFrom,
modeTo, question }`, `recentPlaces: Place[] (≤ 5)`, `followTrip`. All validated on restore; malformed → dropped, not
partially used. Simulator snapshot / restore and report sanitisation include all of them (keys and places are private).

## 8. Proxy
Two things probably need the proxy (`proxy/worker.js`), both unverified: the NR journey planner (SOAP + CORS) and Google
if a website-restricted key is refused from a browser. Design: new routes `/nrjp` and `/google/*` with the key held as a
Worker secret, origin check as today, fixed upstream hosts only. The existing CRS allowlist (`LET KGX ZFD STP`) blocks
leisure boards through the proxy; direct phone calls to Darwin are unaffected. Proxy changes are a separate commit.

## 9. Tests
Engine tests for every threshold at its edge; adapters from fixtures (TfL recorded replies captured this evening,
keys stripped; Google and NR synthetic, labelled); page tests with mocked feeds for toggle off (unchanged, zero new
requests), toggle on without key, combobox (keyboard, VoiceOver roles, stale replies), a full plan, live change status,
Follow through a change; goldens for two trips; simulator providers for Google / planner so journeys can be replayed.
Independent review with mutation testing before merge (CLAUDE.md).

## 10. Risks
- Google browser access and pricing (autocomplete sessions, matrix elements); mitigated by sessions, the 3-char /
  250 ms rule, the pair caps and caching.
- TfL as a national rail planner outside London is not its purpose; coverage verified only on the three trips above.
- Multi-leg live matching at intermediate stations depends on Darwin board filtering by destination; trains that
  divide or change identity may not match → "Not live", never a guess.
- Size: this is the largest change since the re-architecture. Delivered in reviewable steps (engine + adapters →
  screen → live → follow), each behind the switch.
