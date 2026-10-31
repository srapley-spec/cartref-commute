# Trip mode (leisure journeys) — architecture

Status: design revision 3, 31 Oct 2026 (night). Approved with changes by the second independent review; those changes
are in this text (§14). Not built. Behaviour contract: [story](stories/leisure-journeys.md).
Sam's brief: **reuse, loose coupling and speed**; Google through the Maps JS library now, **easy to move to the proxy
later**.

## 1. Decisions this rests on (Sam, 31 Oct)
- A third mode, **Trip** (Commute / Leisure / Trip). Today's Leisure (home ↔ London) is unchanged.
- Walk / cycle / drive to and from the station. Stations discovered and ranked. Google key required, no estimates.
- Google via its Maps JavaScript library first; via the proxy later, switched by a setting (§5).
- National Rail journey planner when access arrives; TfL journey planner, station to station, meanwhile. Trip needs a
  TfL key (keyless TfL refuses concurrent searches).
- First build: plan, live rides and changes, Follow across rides, drive re-check. Signal only. Behind Experimental.

## 2. Shape: one journey core, ports at the edges
```
  Screen: src/trip-ui.js  mount(root, deps)          draws Presentation + Journey[]; owns its DOM only
       │
  Shell wrappers: caching, refresh cadence, epochs   (src/trip-shell.js: cachingPlanner, refresh timers)
       │
  Orchestrator: src/core/tripPlan.ts                 async, pure: ports + now injected; emits stages
       │
  Ports (src/core/ports.ts, types only): PlaceSearch · AccessTimer · StationIndex · RailPlanner · LiveBoards
       │
  Adapters (src/adapters/*.js, shell side; pure parsers in src/core/adapters/*.ts)
     google-mapsjs · google-proxy · tfl-planner · nr-planner · darwin-boards · fixtures · simulator
```
**Coupling rules.** The engine sees only plain data: `Place`, `Station`, `Journey`, port results. No provider ID
formats, URLs, keys, SDK objects or DOM. Caching, cadence and clocks live in shell wrappers, never in `tripPlan.ts`.
Every port has a real adapter, a fixture adapter (tests) and a simulator adapter.

## 3. Reuse: the Journey core
```ts
interface Ride { kind: "rail"|"tube"|"walk"|"bus"|"other"; train?: Train; from: Station; to: Station;
                 dep: number; arr: number; live: { dep: boolean; arr: boolean }; label?: string }
interface Transfer { arriveAt: Station; departFrom: Station; via: Ride[]; plannedGapSecs: number; minSecs: number|null }
interface Journey { id: string; leave: number; arrive: number; before: Segment[]; rides: Ride[];
                    transfers: Transfer[]; after: Segment[]; flags: Flag[]; recommended?: number;
                    uncertain?: boolean; missed?: boolean; late?: boolean; tomorrow?: boolean; source: string }
```
The commute's `Option` is a one-ride case, reached by an adapter later (§13 convergence); the commute is not rewritten
in this build. What is shared, and how much change each needs (from the code, second review):
- **`topPicks`**: retyped on `Rankable { leave, arrive, uncertain?, missed?, late? }`. It reads only those fields:
  no behaviour change.
- **Round runner**: a generic `runRounds<K,R>(items, rounds, exec, { concurrency })`. `searchRoutes` uses it with
  concurrency 1 (unchanged); Trip writes its own rounds and result store (multi-ride journeys can't live in
  `Board.services`). With concurrency, "stop on refusal" applies from the next round; requests in flight complete.
- **Flags**: `serviceFlags(train, policy)` (cancelled, no estimate, status, reason) is generic; `trainFlags` keeps its
  order by inserting the profile flags (standing room, stopping) after "Cancelled". Goldens prove no change.
  Standing-room and stopping-train rules are Sam's commute rules and are never applied to trips.
- **Timing**: `journeyTimes(j)` / `journeySteps(j)` compute every time from segments and rides.
- **Follow**: released `follow.ts` keeps its logic. Only the notice queue (add notice, incident supersession, recovery)
  is extracted into `followNotices.ts`, a real refactor with its own tests and mutation review. `followJourney.ts`
  uses it plus the constants (`FOLLOW_BETTER_MIN` 5 min; `FOLLOW_CHANGE_MS` 1 min = arrival-change notice threshold)
  and has its own per-ride alternative logic.
- **Views**: `viewControl.ts` takes `isPlanView`, `planViews` and the following view from its input, with commute
  defaults (today `isLive = !view.startsWith("plan-")` would make a Trip plan look live). Trip views are named
  `plan-trip-now | plan-trip-by | plan-trip-at | trip-access | trip-ride | trip-change | trip-final`. Tested in Auto,
  Plan and Live for both modes.

## 4. Ports (`src/core/ports.ts`, plain data only)
```ts
type Region = { s: number; w: number; n: number; e: number };
type Suggestion = { id: string; primary: string; secondary: string };
type Place = { id: string; name: string; address: string; geo: [number, number]; kind: "address"|"station"|"current" };
interface PlaceSearch { readonly attribution: string;
  newSession(): string;                                           // opaque ID; the adapter maps it to its own token
  suggest(text: string, session: string, region: Region): Promise<Suggestion[]>;   // ≤ 5
  resolve(id: string, session: string): Promise<Place> }          // ends the session
interface AccessTimer { matrix(origin: [number, number], to: [number, number][], mode: "walk"|"cycle"|"drive",
  at: number, dir: "to"|"from"): Promise<({ metres: number; secs: number } | null)[]> }   // input order, whole s, null = no route
interface StationIndex { near(geo, km): Station[]; byCrs(crs): Station|null; byId(provider, id): Station|null;
  nearestTo(geo, m): Station|null }
interface RailPlanner { plan(from: Station, to: Station, t: number, timeIs: "Departing"|"Arriving")
  : Promise<{ journeys: RailJourney[]; refused: string[] }> }    // RailJourney = rides + transfers
interface LiveBoards { board(fromCrs: string, toCrs: string): Promise<Board>; service(id: string): Promise<ServiceProgress> }
type Station = { crs: string; name: string; geo: [number, number]; carPark: "yes"|"no"|"unknown";
  servicePerHour: number; ids: Record<string, string[]> };       // ids.tfl (naptan), ids.tflIcs; read only by adapters
```
**Errors**: every adapter maps failures to `SearchError` with a new `refused` flag: quota / 429 → `rateLimited`;
403 / REQUEST_DENIED / key not enabled → `refused`; abort → `timeout`; anything else → `network`. `refused` stops
further requests like the others.

## 5. Google: Maps JS now, proxy later (one adapter + a setting)
- `google-mapsjs.js`: loads the library on first Trip use (`ensureLoaded()`, inside the adapter only), keeps a
  `Map<sessionId, AutocompleteSessionToken>`, converts SDK objects to the plain shapes above, returns matrix results in
  input order with whole seconds, maps errors.
- `google-proxy.js`: the same port over Places (New) / Routes REST via `proxy/worker.js` routes `/google/places/*` and
  `/google/routes/*` (fixed upstream hosts, fixed field masks, origin check, `GOOGLE_KEY` Worker secret). REST matrix
  elements arrive out of order with `originIndex`/`destinationIndex` and `"123s"` durations: the adapter reorders and
  converts. Built and contract-tested now; deployed when Sam moves.
- Settings → Trip: "Google: key in this browser | My proxy", like the National Rail source select. Nothing else in the
  app knows which one is in use.
- Session lifecycle lives in `trip-ui.js` (one per field focus/search, ended by `resolve`); attribution text comes from
  the port, so either adapter shows "Powered by Google".
- **Contract suite** `tests/contracts/google-ports.mjs` exports `suite(makeAdapter, backend)`, run against (1) the JS
  adapter with a stub `google.maps` namespace replaying fixtures, (2) the proxy adapter with a `fetch` mock replaying
  REST fixtures for the same queries (matrix elements shuffled), (3) the simulator adapter. Asserts identical outputs,
  input-order matrix, all four error mappings, a new session after `resolve`, attribution present, no key in any
  output or log. The switch-off test asserts "no Google port call", true for either adapter.
- Google terms: recent places keep ID and name; positions are re-fetched (none kept beyond 30 days).

## 6. Station data (bundled)
`data/stations.json` from `tools/stations.mjs` (run by hand, reviewed, committed, reruns diffed):
- Open UK stations list (name, position, CRS; ODbL 1.0, attribution in Settings → About), region box: 1,092 stations.
  Tube-only stops are not in it (consistent with "walk to a rail station"; the planner adds Tube transfers).
- `ids.tfl` / `ids.tflIcs`: TfL nearby-stations search at each position (≤ 400 m), normalised name match; all matching
  IDs kept (St Pancras has several); unmatched / ambiguous rows reported and fixed in an overrides file.
- `carPark` from TfL station detail (`Car park`; absent → unknown).
- `servicePerHour`: departures in a weekday 2-hour window from the National Rail board, measured once (≈ 1,100
  throttled requests on Sam's key). Counts both directions and Elizabeth line at shared stations; a coarse prior only.
- Keys from the environment; a test fails if any data or fixture file contains `app_key=` or `x-apikey`.

## 7. Station candidates and searches
Reach in a straight line: walk 3 km, cycle 10 km, drive 25 km. Per end:
- **Prior**: the 3 nearest within reach + up to 2 within reach with `servicePerHour` ≥ 2× the best of the nearest three,
  highest first (max 5). None within reach → the nearest, flagged "Nearest station is N km away".
- **Round 1** (concurrent, ≤ 9): nearest From × every To candidate; every From candidate × nearest To.
- **Promotion from live data**: a station within reach where a round-1 journey boards or changes (Chilham → London
  changes at Ashford International) becomes a candidate even if the prior missed it.
- **Round 2** (≤ 9): pairs of the best From and best To stations by door-to-door arrival (incl. promoted ones) not yet
  searched; then, per question, a later search for the 3 best pairs: Leave now / around: departing after the last
  journey found, until T + 100 min is covered; Arrive by: departing 100 min before T (late options come from round 1's
  "Arriving" search returning the next ones). Pairs whose best arrival is > 30 min behind the best get no round 2.
  Total ≤ 18 planner searches per plan.
- Access times: walk / cycle are time-independent; a drive to the station is timed for the set-off of the best
  journey; a drive from the station for the best journey's arrival; each re-timed when followed.
- "Other stations": up to 4, one per other station, with consequence minutes. "Close enough, no train needed" when the
  two places are within 1.5 km, any mode.

## 8. Trips with changes
- TfL adapter from recorded replies: rail rides keep their `Train`; Tube / walk between termini → `Transfer.via`;
  TfL's leading / trailing walks at a station are dropped (we add our own) and noted in diagnostics. TfL omits naptan
  IDs at change and final arrivals: ends are matched by `ids.tfl`, else `ids.tflIcs`, else within 300 m; mismatch →
  that journey refused ("TfL matched a different place"). Bus / coach rides kept and flagged. Modes asked:
  national-rail, tube, overground, elizabeth-line, dlr, walking. Later service day → `tomorrow`.
- **Change rule** (`changeStatus`, one function, planned and live): best known time at each end (live arrival if
  known, else timetabled; live departure if known, else timetabled). spare = floor((dep − arr − transfer ride
  time) / 1 min). Red "Connection at risk" when spare < 2; amber "Tight change, N min" when spare < 5 **and** spare is
  below the planned gap (live has eaten into it); otherwise neutral "Change N min". Next ride gone / cancelled while
  still on this one → red "Connection missed" + "Plan from <station>". An end without live data adds "Not live" to
  that end only; a live delay may still make it amber / red. The planned gap (TfL) or minimum connection (NR) is
  never shortened.

## 9. Live within a budget
≤ 6 Darwin boards per refresh (shell cadence ≥ 30 s), shared by (from, to): the followed journey's next 2 rides first,
then each pick's first ride, then other first rides leaving within 30 min. Board window 119 min: later rides "Not
live". A matched ride uses Service Details by ID (≈ 1 / min for the ride you're on). Proxy users: `proxy/worker.js`
today allows only `LET KGX ZFD STP`; it must accept any well-formed CRS (rate-limited, cached 20 s) — a proxy change,
GitHub-first, and Sam redeploys the Worker. Drive re-check (shell): every 5 min within 60 min of leaving; ≥ 2 min
change moves the leave time with a reason; passed → "Leave now: N min late for the 14:05".

## 10. Screen and page contract
- `trip-ui.js`: `mount(root, { ports, store, clock, net, present, onFollow })`, `net = { fetchT, logRequest, epoch }`.
  Every adapter (Google included) logs to `reqLog` (request-count goldens, simulator) and checks the source epoch.
  No page globals; Panda's DOM untouched.
- `page.html`: mode becomes three-valued; `refresh` and `render` return early for Trip (no commute requests); a mode
  switch calls `invalidateSources()`; restoring `mode: "trip"` with the switch or Signal off falls back to Commute.
  Signal's controls relocation (`journey-ui.js`) includes the Trip button. Page test: Trip makes 0 commute requests.

## 11. Speed
Target: first answer ≤ 2 serial network steps after the second place is chosen (To's place fetch → round 1 ∥ To's
matrix; From's matrix was prefetched when From was chosen), live ≤ 3 (Darwin). Drawn when round 1 completes, or at
2.5 s with what has arrived; a later journey ≥ 5 min sooner shows "Better option found" (never a silent swap).
Proof: port-level call log recording which replies had completed when each call started; tests assert causal depth
≤ 2 / ≤ 3 and request counts (deterministic). Wall-clock is a smoke bound only (≤ 8 s with 600 ms mocks).
Caches (shell wrappers): planner 5 min per (pair, 15-min slot); walk / cycle matrices for the session; drive per slot.

## 12. Saved data, keys, release
Saved (validated on restore, malformed dropped): `settings.tripMode`, `settings.googleKey`, `settings.googleVia`
("browser" | "proxy"), `settings.nrPlanner {url, key}`, `settings.tripAllow {parkMin, lockMin, stationMin, exitMin,
carBackMin}` (0–60), `trip {from, to, modeFrom, modeTo, question}`, `recentPlaces` (≤ 5, ID + name + savedAt),
`followJourney`; `mode` may be "trip". Keys shown as last 4 characters; never logged, captured, exported or in simulator
reports. Simulator snapshot / restore covers all of them. Release: GitHub-first (saved state, feeds, keys, script).

## 13. Build order (each step tested, behind the switch, commute unchanged)
0. Page mode contract (three modes, early returns, restore fallback, `invalidateSources` on switch). GitHub-first.
1. No-change extractions: `Rankable`, `runRounds`, `serviceFlags` (order kept). Goldens unchanged.
1b. Reviewed refactors with tests: `followNotices` extraction; `viewControl` injection with Trip views.
2. Station data tool + `data/stations.json` + `StationIndex`.
3. Journey core, `changeStatus`, TfL adapter from recorded replies, candidates / rounds / promotion, `tripPlan` with
   fixture ports; causal-depth test.
4. Trip views; `trip-ui.js`; switch off / on page tests; speed test.
5. Google ports: Maps JS and proxy adapters + contract suite + Worker routes (not deployed).
6. Live boards within budget; Worker CRS change; change rule live.
7. `followJourney` across rides.
8. Drive re-check; NR planner adapter from documentation (unverified until access).
Convergence later: `journeyOfOption` adapter, then commute Follow / planner on `Journey`, each proven by goldens.
Independent mutation review before merging (CLAUDE.md).

## 14. Review history
- Review 1 (rework): straight-line candidates missed Ashford; TfL reply shape; no CRS for changes; unbounded live
  boards; two tight-change rules; budget gaps; untested edges; Google claims; commute-specific views. → revision 2.
- Review 2 (approve with changes): `followRules` not a pure move → `followNotices` refactor (§3); `viewControl` treats
  `trip-*` as live → injection + `plan-trip-*` names; `searchPairs` → `runRounds`; flag order; `Station` leaked TfL and
  lacked ICS → `ids`; proxy CRS allowlist; page.html two-valued mode → §10 contract; caching out of core; Maps JS
  leaks → plain ports, contract suite (§5); speed counted 2 / 3 steps, causal-depth test; Chilham pin false on real
  counts (Faversham, Ashford) → promotion from live data, fixture pin; change rule hid a missed connection with one
  live side → best known time each end; planner's own 4-min changes were always amber → amber only when live erodes
  the planned gap; live budget priority; per-question windows; remaining numbers. → revision 3.
