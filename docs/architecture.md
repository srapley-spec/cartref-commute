# Cartref Commute — architecture

Source of truth for why the app is built the way it is. Moved here from the claude.ai "Commuter App" Project on
29 Oct 2026; update it in the same commit as the change it describes. Behaviour detail lives in
[`stories/`](stories/README.md).

Code: github.com/srapley-spec/cartref-commute · Live: srapley-spec.github.io/cartref-commute

## Why
The planning logic (latest leave, every route, the same train from several stations, door to door with personal
timings, never hide a train, flags) is useful beyond Sam's commute: Laura's journeys, family days out (e.g.
Science Museum → home), other people on the Thameslink/Great Northern corridor. It must be reusable and heavily
tested.

The code review on 28 Oct found one 1,700-line file mixing data, planning and screen; places hard-coded; the
door-to-door timing model written out in ~7 places; same-train merging done as a patch after the fact; planning
code reading live screen state. Duplication had started (a St Pancras fix was needed in three places).

## Layers
1. **Engine** (`src/core`, TypeScript, pure functions): no screen, no network, no hard-coded places.
   Input: profile + trains (each with its stops) + a question (leave now / arrive by / leave around; from, to,
   time, who's travelling). Output: ranked journeys with flags.
2. **Adapters** (`src/core/adapters`): Darwin and TfL responses → one common train format with stops.
3. **Profile** (`src/core/profiles`): people, places, stations (incl. positions along the line), personal
   timings, rules (standing room, term dates, stopping thresholds, top-card window).
4. **Screen** (`src/page.html`): draws what the engine returns, in the order the presentation model
   (`src/core/present.ts`) gives; location, fetching and caching.

A **journey** is: getting to the station (walk, stops such as a nursery drop-off, or a TfL-planned leg) → the
train → getting from the station. A **route** is described once as segments; every time on screen is computed
from that description.

## Principles (Sam, 28–29 Oct)
- **Never hide a train.** Show it with flags (stopping, standing room only, cutting it fine, late, cancelled,
  no estimate, leave time passed, timetable only). → [never-hide-a-train](stories/never-hide-a-train.md)
- **Find options, don't store them by rote.** Alternatives (other stations, a change of train, a taxi from
  Hitchin or Stevenage, Cambridge instead of Cambridge South) are discovered from live data and the journey
  planner, each shown with its consequence ("change at Stevenage, home 14 min later"). Known examples are test
  cases, not hard-coded rules.
- **Get it right with real data rather than estimates**, spending API calls where needed.
- **Answer the real question**: when to leave, by which route, arriving when; at the station, when the train
  leaves.
- **When the app isn't sure, ask** (which train or tube you're on) and remember the answer. If your answer and
  the evidence disagree, say so or ask again; don't silently overrule.
- **Everything personal is configurable**: walking pace, stops, deadlines, places (home location in Settings).
- **Generic engine, bespoke data** (29 Oct): the commute is how the engine is honed. Behaviour that would apply
  at any station or on any service goes in the engine; only data (stations, lines, stops) and genuinely
  station-specific rules are commute-specific.
- **Fix what real trips find in the current structure, with tests, before re-architecting** (28 Oct evening);
  since then, **fix forward on the new architecture** rather than reverting (28 Oct night).
- **Toggles only when Sam chooses one** (30 Oct, replacing "new capabilities ship behind toggles"). For a very complex
  or experimental change, recommend a toggle (Settings → Experimental, off by default) and let Sam decide; otherwise
  ship it on. A toggle is tested both off and on.
- **Don't overwhelm the interface**: extra detail replaces a line or folds away rather than adding banners
  (29 Oct).
- **The engine decides priority; the shell decides geometry** (29 Oct). Which view is on screen, what the big
  number means (leave / departs / arrive), how bad things are (one status line with a fixed precedence) and the
  order of the blocks are decided once, in the engine (`src/core/present.ts`), from engine outputs. The web page, a
  widget, a Live Activity or a Watch face draws that order in its own shape; none re-decides it. A design proposal
  proposes how to draw the blocks, never which comes first. → [presentation-model](stories/presentation-model.md)


## Signal presentation architecture (29 Oct 2026)

Status: design selected; implementation not started. See [design system](design-system.md) and
[acceptance story](stories/signal-design-system.md). The prototype is illustrative, not production logic.

### Agreed by Sam
- Signal is the chosen visual direction, iPhone first. iPad/Mac are later priorities.
- Appearance switches dynamically between light and dark, with manual overrides.
- Planner and Live switch automatically, with a manual override. The manual controls are not the normal
  way to advance through a journey.
- Preserve functionality. Any proposed removal or concealment must be explicit and approved.

### Architectural consequences within the existing structure
- Situation inference, service identity, ranking, timings and confidence remain engine responsibilities.
  The presentation layer consumes their results; it must not introduce duplicate GPS/timetable heuristics.
- View selection lives in the presentation model (`src/core/present.ts`, `chooseView`): the automatic choice
  and a manual Planner/Live override are its inputs, tested there, so every shell gets the same answer.
- Keep view selection separate from direction and selected service. Looking at Planner must not redefine
  which train the user is on; an appearance change must not reset the journey.
- Represent view selection explicitly: automatic versus a manual Planner/Live override. The exact field
  names in the prototype are illustrative, not a mandated production API.
- Retain the existing uncertainty rules: ask when train identity is ambiguous, label inferred versus
  reported data, and preserve the user's confirmed selection subject to existing conflict handling.
- The web design does not assume native background location, Live Activities, early platform predictions,
  passing-point data or coach formation. Those remain separate capabilities.

### Additional policies agreed by Sam
1. A manual view override lasts for the current journey/session and clears on explicit Return to Auto
   or a genuinely new journey. The engine's new-journey boundary needs definition and tests.
2. Automatic screen transitions wait while the user edits a date/time, chooses a service or reads an
   expanded notice. A pending live state remains discoverable without discarding the interaction.
3. Tracking and important active-journey alerts continue while Planner is pinned. Do not interpret a view
   override as permission to pause refreshes or suppress a cancellation.

Sam agreed to all three policies on 29 Oct 2026. Their implementation is still pending; the prototype
is not evidence that production background tracking, alert delivery or interaction deferral is implemented.

## Data sources
- **Live board**: Rail Data Marketplace Live Departure Board, direct from the phone (key in Settings). Reaches
  ~2 h from now even with a start offset; beyond that TfL's timetable fills in, labelled "timetable only".
  Starts 40 min back while on the train.
- **Service Details**: Rail Data Marketplace (1010-service-details1_2), its own consumer key; for the train
  you're on, about once a minute. Reports only stations where the train stops (a non-stop run shows just its
  ends; passing points are #23).
- **Timetable**: TfL Journey Planner (keyed). Planned: National Rail timetable via a daily GitHub job (#18).
- **Tube**: TfL arrivals (King's Cross/Farringdon eastbound Circle, Met and H&C to work; Aldgate westbound going
  home) and line status.
- **Places** (Any start and end point toggle): TfL Journey Planner, its "which place did you mean?" replies
  matched to the best guess. Searchable picker considered (#25).
- **Planned/considered**: proxy with offsets and Service Details (#17), staff board for early platforms (#19),
  structured incidents (#20), train length and crowding (#21), passing points via Darwin real-time (#23).
- **Lift status**: TfL lift outages are available for TfL stations; no known live lift feed for National Rail
  stations (step-free access is known, outages are not).

## Code layout (29 Oct)
Engine (`src/core`): `situation.ts` (direction, at a station, on the line incl. movement, which train, on a tube,
tube home, nearly home, office arrival), `connections.ts` (generic connection at any station: planConnection, Ride),
`effort.ts` (what it takes to catch each train: walk, fast walk, run, car, can't; "Arrives first" per level),
`plan.ts` (Leave now list), `search.ts` (timetable searches per plan against an injected planner; Leave around /
Arrive by lists), `refresh.ts` (what each refresh loads), `live.ts` (live + timetable mixing), `warnings.ts`
(grading, notices, line status), `present.ts` (presentation model: which view, headline kind, the status line's
precedence, block order per view), `journey.ts`, `rank.ts`, `rules.ts`, `alternatives.ts`, `geo.ts`, `time.ts`,
`adapters/`, `profiles/sam.ts` (data incl. places, office stops and their lines, walking speeds, route stations) and
`profiles/samRoutes.ts` (Sam's routes as segments from his timings). The page (`src/page.html`) fetches, caches and
draws.

## Testing
- Engine unit tests incl. a made-up corridor and made-up interchanges (proves reuse) and randomised rule checks.
- End-to-end tests (simulated phone, mocked feeds), including real trips replayed as scenarios.
- Golden tests: fixed situations on a deterministic railway at a frozen clock record everything requested and
  shown; changed only deliberately, with each diff checked.
- Rule tests: each threshold pinned at its edge. Proxy tests. Feature toggles (when Sam chooses one) tested both off (unchanged) and on.
- All tests run on a virtual clock (Tue 3 Nov 2026 10:00, ticking).
- Mutation testing: 60/60 (28 Oct afternoon); 46/46 (28 Oct night); 37/37 over the new engine modules after
  closing 5 gaps (29 Oct). 29 Oct afternoon, independent review by a separate agent that hadn't written the code:
  76 breakages over the day's changes, then a second round of 59 after fixes; all caught except agreed equivalents
  (P22, P31, N10, H15: changes that can't alter any result). Probes found 3 bugs and 4 smaller defects, all fixed
  with tests. The going-home refactor: 15 breakages, 14 caught, 1 equivalent. Presentation model (#29), reviewed
  after merging: 47 breakages, 18 unnoticed at first; 15 now caught, 2 equivalent, 1 not yet drawn. 249 tests
  (29 Oct evening, incl. 3 for the docs check); 303 with effort levels (30 Oct).
- Test cases kept as data files are the contract any future native (Swift) engine must also pass.
- Stories link the tests that prove them; CI checks the links exist.

## Release
GitHub Pages, same URL, single page. A build step compiles the engine and inlines it into the page; CI
type-checks, rebuilds, tests and checks the docs on every push. Push to `main` only when every test passes.
Bigger changes are made on a branch and merged when green.

## iOS
The same engine can run on iPhone (JavaScriptCore) for the native app and widgets, or be ported to Swift against
the shared test cases. A native app also fixes repeated location prompts and allows background location.
Native backlog: #2–#7, #10–#12.

## Plan (status 29 Oct)
1. Done: TypeScript engine; adapters; rules; merging; ranking; Sam's profile.
2a. Done: one route description per route.
2b-i. Done: stops on trains; same-train merging and derivation; top-card rule; best connections off a tube;
   train placement from reported position.
2b-ii. Done and live (#22): planning moved into the engine behind injected data sources.
2b-iii. Started (live, behind the "Any start and end point" toggle): Leisure to any London place and home from
   anywhere typed. Still to do: routes as profile data rather than code; a place that isn't home or the office at
   both ends. → [any-start-and-end-point](stories/any-start-and-end-point.md)
2b-iv. Done and live (29 Oct afternoon): going-home tubes (from Aldgate, which tube you're on, where to get off) on
   the generic connection model. → [tube-home](stories/tube-home.md)
2c. Discovered alternatives (changes, taxi from Hitchin/Stevenage, #13). → [discovered-alternatives](stories/discovered-alternatives.md)
3. People, trips, stops, deadlines; Laura's profile. → [people-and-trips](stories/people-and-trips.md), [laura-commute](stories/laura-commute.md)
4. Family day out. → [family-day-out](stories/family-day-out.md)
Design: Signal selected ([`design/`](design/README.md), [design system](design-system.md)); implementation pending. Ideas: "Along the line" nerd mode (#24, supersedes #16).

## Decisions log
Newest first. One line each; the story or issue holds the detail.
- **30 Oct** Toggles are Sam's call: recommend one for a very complex or experimental change, never add one by
  default. Why: effort levels went behind a toggle Sam hadn't asked for and didn't know about, so he thought the
  feature was missing. The effort-levels toggle removed (always on). Sam confirmed "Any start and end point" stays
  behind its toggle (major and experimental). → [effort-levels](stories/effort-levels.md),
  [any-start-and-end-point](stories/any-start-and-end-point.md)
- **30 Oct** "Extra effort to catch a train" (effort levels) built behind a toggle after two independent reviews; Leave
  around graded too, so near now its card shows the next train you can still make (first: one bug, 15 test gaps, all
  fixed; second: merge). → [effort-levels](stories/effort-levels.md)
- **29 Oct night** Process: branch from `main`, not from an unmerged branch; bring `main` in and re-check stories and
  goldens before merging. Why: #27–#29 were built on #26 while `main` moved (review fixes, going-home tubes); their
  stories were stale and #29 was merged before review (reviewed after). Bigger changes get an independent test review
  before merging (Sam). → `CLAUDE.md`
- **29 Oct evening** Trains you'd hurry for are graded by effort (walk, fast walk, run, car, can't make it);
  "Arrives first" per effort level; Arrive by's pick says "Latest for 08:30". Built in the engine (`effort.ts`), behind
  an Experimental toggle.
  → [effort-levels](stories/effort-levels.md)
- **29 Oct** Sam selects Signal, iPhone first, dynamic appearance and automatic Planner/Live switching with manual override. Sam also approves override lifetime, interaction deferral and ongoing tracking/alerts while Planner is pinned. → [design system](design-system.md)
- **29 Oct** The engine decides priority, the shell decides geometry: a presentation model (`present.ts`) owns view
  choice, headline kind, status-line precedence and block order; `page.html` draws in that order. Design proposals
  are judged on how they draw the blocks. → [presentation-model](stories/presentation-model.md)
- **29 Oct** A design system before more features. Several proposals, all held to one brief and one inventory of the
  current screen (no silent regression), compared in `docs/design/`. Claude's first proposal ("original") set aside as
  too close to today's layout; its second ("womble") is a draft for feedback. → [design](design/README.md)
- **29 Oct afternoon** Going-home tubes moved onto the generic connection model (2b-iv), after the independent
  review was satisfied. → [tube-home](stories/tube-home.md)
- **29 Oct afternoon** Independent test review before further refactoring (Sam). Fixes: phantom tube ride after a
  gap, cached fix restarting location (hotfixed), pick lost when TfL moves its time (match by vehicle, else same
  line within 3 min), rough fix dropping the train, yesterday's office arrival. → [connections](stories/connections.md),
  [location-prompts](stories/location-prompts.md), [which-train](stories/which-train.md),
  [direction-and-arrival](stories/direction-and-arrival.md)
- **29 Oct afternoon** H&C to Aldgate East competes from King's Cross and Farringdon going to work; going home it
  stays a fallback (service frequency). Office "direction turns" needs 5 minutes at the office.
- **29 Oct afternoon** With a saved home, the walk to the station is the measured walk scaled by distance left.
  → [on-the-way-to-the-station](stories/on-the-way-to-the-station.md)
- **29 Oct** Project context moves into this repo (`CLAUDE.md`, `docs/`); CI enforces docs touched with behaviour
  changes. Build work moves to Claude Code; the claude.ai Project stays for trip debriefs, and anything decided
  there is written here.
- **29 Oct** Connections are a generic engine model (`connections.ts`), used at any station with live departures.
  → [connections](stories/connections.md)
- **29 Oct** Morning trip: late trains say so everywhere; on-the-way view; on-train detection near home; office
  arrival. → [late-trains](stories/late-trains.md), [on-the-way-to-the-station](stories/on-the-way-to-the-station.md),
  [which-train](stories/which-train.md), [direction-and-arrival](stories/direction-and-arrival.md)
- **29 Oct** Generic engine, bespoke data; don't overwhelm the interface; nerd mode and passing points logged
  (#24, #23), not a priority.
- **28 Oct night** Fix forward on the new architecture rather than reverting; new capabilities behind toggles.
- **28 Oct evening** Trip home: departure board at the station, slow trains say so, warnings graded by impact,
  which-train by reported position, Nearly home, tube home decides the train. → [at-the-station](stories/at-the-station.md),
  [slow-trains](stories/slow-trains.md), [warnings](stories/warnings.md), [which-train](stories/which-train.md),
  [nearly-home](stories/nearly-home.md), [tube-home](stories/tube-home.md)
- **28 Oct** Top-card rule. → [top-card](stories/top-card.md)
- **28 Oct** Four-layer re-architecture, in steps that keep the live app unchanged and all tests green.
- **28 Oct** People and trips requirements (Laura, nursery, day out). → [people-and-trips](stories/people-and-trips.md)
