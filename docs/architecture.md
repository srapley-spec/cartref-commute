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
- **Signal is the sole supported design** (Sam, 1 Nov). Panda, the Signal feature switch and the
  cross-design parity release rule are retired. Journey information, actions and uncertainty still have
  ordinary regression coverage across planning and live views. [Decision and recovery](panda-retirement-review.md).


## Signal presentation architecture (29 Oct 2026)

Status: Signal is the default and only design as of 1 Nov 2026; Follow remains an independent Experimental option. Retirement verification is in docs/panda-retirement-review.md. See [design system](design-system.md) and
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
- View selection lives in the pure presentation model: `src/core/present.ts` supplies the automatic choice;
  `src/core/viewControl.ts` resolves an explicit Planner/Live override and its lifetime. Both are tested without
  a DOM, so the shell does not invent a second set of situation rules.
- Keep view selection separate from direction and selected service. Looking at Planner must not redefine
  which train the user is on; an appearance change must not reset the journey.
- Represent view selection explicitly: automatic versus a manual Planner/Live override. The exact field
  names in the prototype are illustrative, not a mandated production API.
- Retain the existing uncertainty rules: ask when train identity is ambiguous, label inferred versus
  reported data, and preserve the user's confirmed selection subject to existing conflict handling.
- The web design does not assume native background location, Live Activities, early platform predictions,
  passing-point data or coach formation. Those remain separate capabilities.

### Additional policies agreed by Sam
1. **Updated by Sam, 30 Oct:** use the newer Follow a route policy. A manual Planner/Live override clears on
   explicit Return to Auto, after 20 minutes, or when the underlying situation changes (for example, reaching
   or leaving a station or starting or stopping rail travel). This supersedes the 29 Oct journey/session
   lifetime. Refresh, appearance changes and a transient loss of GPS alone do not create a new situation.
2. Automatic screen transitions wait while the user edits a date/time, chooses a service or reads an
   expanded notice. A pending live state remains discoverable without discarding the interaction.
3. Tracking and important active-journey alerts continue while Planner is pinned. Do not interpret a view
   override as permission to pause refreshes or suppress a cancellation.

Sam agreed the original policies on 29 Oct and selected the newer Follow a route lifetime on 30 Oct.
Implementation and release evidence are recorded in [Signal testing](signal-testing.md); the prototype alone
is not evidence of production tracking, alert delivery or interaction deferral.

### Compact Signal v2 (Sam, 31 Oct 2026)
- Sam requested substantially less bulk, informed by Flighty's current-journey hierarchy and Railboard's readable
  timetable rows. This intentionally changes the older Signal geometry; the latest engine, status thresholds,
  route-following, simulator and source behavior remain shared. See the
  [Signal acceptance story](stories/signal-design-system.md#compact-v2-direction-sam-31-oct-2026) and
  [compact design review](signal-compact-design-review.md).
- Existing mode/direction/pace controls move into a native Journey options disclosure; its summary exposes
  effective direction/mode and pace. Auto / Plan / Live and the planning question stay exposed. This supersedes
  the older always-visible direction/pace control requirement for Signal only. Move the same DOM controls and
  retain their handlers/values instead of cloning inputs or creating a second saved state.
- One primary answer leads; Next best is a compact expandable option retaining all metadata, steps and actions.
  Board rows use full-width information and a Follow target of at least 44 px. All trains and individual
  cancellation/no-estimate/uncertainty flags survive; no aesthetics-based filtering is introduced.
- One impact summary remains visible, with its existing severity precedence. The subsequent journey-clarity
  refinement exposes significant route-relevant disruption instead of folding it behind Travel alerts; remaining
  full notices and line/source/technical detail stay available. Freshness and Refresh remain available.
  `statusLine` receives whether the fallback is unavailable: all relevant Tube lines closed must not advertise
  H&C/Aldgate East as a usable resolution. This qualification belongs in the pure engine, not shell wording rules.
- In Auto/Live the active followed route stays foregrounded; other recommendations can fold without losing
  information or actions. An explicit Plan request keeps the primary planning answer visible outside that
  fold while following and alerts continue. Tube selection/correction controls are extracted outside the fold
  with their original handlers and chosen vehicle intact. Notice/detail reading, focus and planning values
  survive redraw; long text and enlarged type wrap rather than clip.
- Existing controls are arranged once, retaining handlers and entered values. Theme changes preserve requests,
  ranking and the selected journey; there is no alternate-design restoration path.
- Latest `main` regression contract (`8789a50`) adds six Tube-change checks in both Panda and Signal, with no
  application-source change. Integration must retain these new tests alongside the existing production source
  and compact-layout probes; the redesign does not replace the latest source with older branch behavior.
- Compact-v2 page tests and browser screenshots must prove availability, density and preservation together.
  Engine tests alone cannot prove reachable controls or responsive layout. Independent review must check tests,
  architectural boundaries, deliberate breakages and final screenshot targets before release approval.

### Signal journey clarity (Sam, 31 Oct 2026)
- Significant route impact follows the existing graded warning rules. Severity, relevance and visibility policy
  belong in the shared pure core with explicit configuration/defaults; a screen consumes the result instead of
  maintaining its own thresholds or CSS severity decisions. Centralisation preserves the agreed defaults and
  makes overrides testable. Changes beyond drawing require independent engine/integration review.
  `src/core/disruption.ts` owns `DisruptionConfig`, effective policy, delay/line grading and visible impacts;
  `Profile.disruption` supplies optional partial overrides. Legacy 5/15 constants are default aliases.
  `disruptionTrainObservation` builds an ephemeral, non-mutating warning view of validated live progress.
  It can promote a newly observed delay/cause but cannot clear explicit board cancellation/no-estimate state;
  the existing controller/provider recovery path remains authoritative. Active observations overlay an exact
  matching board service/day instead of inventing a second affected train.
- Keep the existing inferred-location/source/accuracy diagnostic visible, including unavailable and old-fix
  qualifications, in Auto and manual direction. This is evidence display, not a change to permission handling,
  location watches or inference.
- A repeated semantic time has a shared horizontal anchor across the primary answer, Next best and board:
  Train/Leave left, Expected centre for departure boards, destination arrival right. Planning reserves the
  centre without manufacturing Expected. Labels, route metadata and actions cannot change the grid geometry.
  Next best labels its grid from above; enlarged text retains readable order without overlap.
- Overall and current-leg progress reuse the existing itinerary, chosen/inferred identity, timed segments and
  observations. Progress arithmetic and evidence qualification are pure engine responsibilities; the renderer
  supplies geometry and accessible labels. Do not introduce a second planner, retime completed followed legs,
  invent passing points, or relabel clock interpolation as an exact live position.
- Fresh train reports can identify a reported calling point; future calls remain expected. Known-vehicle Tube
  target predictions can qualify arrival but do not establish intermediate live position. Missing/stale data,
  unknown identity and modelled Tube legs stay explicit. Preserve the current terminus-departure adapter and
  its recorded-data validation when integrating Tube visualisation.
  Service Details retains separate ordered scheduled/expected/actual call times so signed ahead/behind evidence
  is not reconstructed from the legacy clamped-lateness field. Existing adapter APIs and requests stay compatible.
  `Profile.tubeCorridors` supplies static station topology; `places.officeStops` supplies stop IDs and per-line
  platform directions. These are profile data, not fetched live position/calling-point evidence. Tube headline
  and progress use the same guarded destination prediction; the recorded Aldgate Met platform is northbound.
- Relevance follows the remaining journey. Completed outbound-rail missing/stale data can fold once on the Tube;
  homeward rail data remains important while its connection is still ahead. Unknown or missing source evidence
  is not rewritten as good service merely because an irrelevant earlier problem is folded.
- Behaviour and geometry are tested together, including significant-versus-background alerts, manual-location
  diagnostics, common time anchors, inferred/followed rail and Tube, source freshness and saved-preference
  upgrades. See [journey progress](stories/journey-progress.md) and the [Signal story](stories/signal-design-system.md).

### Followed journey and design boundaries
- Signal is always active, including for existing phones whose obsolete `settings.signal` value was false
  or absent. The old key is ignored on load and omitted from subsequent normal saves. Follow remains
  independently configurable, off by default; no automatic Follow opt-in is introduced. Existing routes,
  home, timings, providers, pins and planning values are retained.
- `src/core/follow.ts` owns the chosen journey snapshot, service identity, stable arrival, progress, reasons
  and alternative eligibility. It receives explicit time, unfiltered current options and existing situation
  evidence; it reads no clock, DOM, browser storage or network. The shell fetches, persists and draws.
- The snapshot includes the complete route's existing timed legs. Live rail updates amend the chosen route,
  with a visible reason; re-ranking another service never silently replaces it. Switching to an alternative
  takes an explicit Follow action. Better alternatives must arrive at least 5 minutes sooner and be reachable
  at walking or fast-walking pace. Missing or stale feed data is not cancellation.
- View override, direction override, selected train/Tube and followed route remain separate state. Planning
  does not stop tracking or hide an important alert about the followed journey.
- New saved fields must be validated on restore, preserved when changing appearance, and included in simulator
  reset/isolation: simulated following must not write to the real phone journey, and Stop restores its snapshot.
- Signal live templates emit semantic block boundaries; `src/presentation-blocks.js` renders their existing
  nodes in the engine-supplied canonical order without a second priority table or dropping unknown content.
  Auto / Plan / Live and journey facts remain available when Follow is off. Signal draws the tested
  status summary and qualifies missing live line-status evidence.
- Following a caught Tube uses current connection readiness for rail catchability. After rail, fresh onward
  Tube/walk evidence can revise the arrival with a visible reason without changing completed rail-step times.
  Fresh Service Details arrival evidence remains authoritative even if departure boards are stale.
- `src/core/followTube.ts` validates an already-known homeward Tube vehicle against its westbound arrival
  prediction at the chosen rail hub. Five recorded 30 Oct 22:43 TfL snapshots provide a concrete vehicle-441
  case; they do not prove provider-wide vehicle reliability. Both cache and provider observation expire at
  exactly three minutes. Station IDs and interchange allowance remain caller-supplied profile data.
- `src/follow-transport.js` adds at most one existing target-stop arrivals request per refresh only for an enabled
  followed homeward Tube with a known vehicle, before rail boarding. Concurrent work is shared; source epochs
  and route/vehicle/target identity guard the response. Absent/stale/nonmatching data keeps the explicit modelled
  fallback. Met departures at Aldgate come from Liverpool Street's predictions ([tube-home](stories/tube-home.md)); no
  Tube identity is invented.
- Chosen arrival stability uses a one-minute threshold; the original plan remains visible after a change.
  Incident recovery supersedes obsolete cancellation/no-estimate/missed notices. Explicit “I’m on it” confirms
  boarding; known same-train call evidence can track progress without changing chosen boarding. A person can
  explicitly follow a run/car option as “Behind”, while automatically proposed alternatives stay walking/fast
  only and ordinary better-option prompts stay quiet during a Tube approach unless recovery is needed.
- Saved-state and build integration changes take the GitHub-first release path in `CLAUDE.md`. Independent
  review must check architecture, feature-off compatibility, meaningful regression tests and mutation results.

## Data sources
- **Live board**: Rail Data Marketplace Live Departure Board, direct from the phone (key in Settings). Reaches
  ~2 h from now even with a start offset; beyond that TfL's timetable fills in, labelled "timetable only".
  Starts 40 min back while on the train.
- **Service Details**: Rail Data Marketplace (1010-service-details1_2), its own consumer key; for the train
  you're on, about once a minute. Reports only stations where the train stops (a non-stop run shows just its
  ends; passing points are #23).
- **Timetable**: TfL Journey Planner (keyed). Planned: National Rail timetable via a daily GitHub job (#18).
- **Tube**: TfL arrivals (King's Cross/Farringdon eastbound Circle, Met and H&C to work; Aldgate westbound going
  home, the Met from Liverpool Street's westbound predictions less a measured 90 s, with its platform once it's standing
  at Aldgate) and line status. TrackerNet (per-platform) refuses the key we have (31 Oct, 401): a separate TfL product.
- **Places** (Any start and end point toggle): TfL Journey Planner, its "which place did you mean?" replies
  matched to the best guess. Searchable picker considered (#25).
- **Planned/considered**: proxy with offsets and Service Details (#17), staff board for early platforms (#19),
  structured incidents (#20), train length and crowding (#21), passing points via Darwin real-time (#23).
- **Google Maps Platform** (Trip mode; Sam's key, set up 31 Oct night; the key lives only in the phone's Settings or,
  later, as the proxy's `GOOGLE_KEY` secret, never in the repo or chat). APIs enabled on the key:
  - **Used by Trip now**: Maps JavaScript API (loads the library in the browser), Places API (New) (address search
    and place details), Routes API (walk / cycle / drive times to and from stations, route matrix).
  - **Used by Trip via the proxy later**: the same Places API (New) and Routes API, as web services
    ([leisure architecture §5](leisure-architecture.md#5-google-maps-js-now-proxy-later-one-adapter--a-setting)).
  - **Enabled, not used**: Address Validation, Aerial View, Air Quality, Geocoding, Geolocation, Isochrones, Map
    Management, Map Tiles, Maps 3D SDK for Android, Maps 3D SDK for iOS, Maps Elevation, Maps Embed, Maps Experience
    agent tools, Maps Platform Datasets, Maps SDK for Android, Maps SDK for iOS, Maps Static, Navigation Connect,
    Navigation SDK, Places Aggregate, Places UI Kit, Pollen, Roads, Route Optimization, Solar, Street View Publish,
    Street View Static, Time Zone, Weather. Candidates later: Maps SDK for iOS / Navigation SDK (native app #2–#7),
    Time Zone (none needed in the region), Weather (a day out). Use one only with a story; each is billed separately.
  - Not yet verified from code: no session has the key, so class names and limits in `src/trip-adapters.js` are from
    Google's documentation until a check on the phone (or a session given the key as an environment secret).
- **Lift status**: TfL lift outages are available for TfL stations; no known live lift feed for National Rail
  stations (step-free access is known, outages are not).

## Code layout (29 Oct)
Engine (`src/core`): `situation.ts` (direction, at a station, on the line incl. movement, which train, on a tube,
tube home, nearly home, office arrival), `connections.ts` (generic connection at any station: planConnection, Ride),
`effort.ts` (what it takes to catch each train: walk, fast walk, run, car, can't; "Arrives first" per level),
`plan.ts` (Leave now list), `search.ts` (timetable searches per plan against an injected planner; Leave around /
Arrive by lists), `refresh.ts` (what each refresh loads), `live.ts` (live + timetable mixing), `warnings.ts`
(grading, notices, line status), `present.ts` (presentation model: which view, headline kind, the status line's
precedence, block order per view, the on-your-way colour), `stationBoard.ts` (Live before a journey: next stops and their departure boards with reach), `journeyFacts.ts` (guarded train and whole-journey durations from the existing option), `journey.ts`, `rank.ts`, `rules.ts`, `alternatives.ts`, `geo.ts`, `time.ts`,
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
- `tests/journey-views.test.mjs` exercises actual production journey views and visible canonical facts;
  `tests/journey-facts-review.test.mjs` probes duration, reachability and earliest-arrival ownership.
  These ordinary regressions remain in the full test suite after the two-design registry, matrix validator,
  enforcement tests and parity CI requirement were removed on 1 Nov. Browser checks cover both appearances,
  phone widths and enlarged text. See [journey facts](stories/journey-facts.md).

## Release
GitHub Pages, same URL, single page. A build step compiles the engine and inlines it into the page; CI
type-checks, rebuilds, tests and checks the docs on every push. Pages publishes every push to `main` at once,
independently of the tests. Every change passes `npm run ci` (all of GitHub's checks on a fresh copy of the commit)
before merging; most then merge without waiting for GitHub (fast path), and GitHub's result on `main` is checked
after every push. The rules, and which changes must wait for GitHub, are in `CLAUDE.md` ("Merging to `main`").
Once authorised work meets its testing and independent-review requirements, carry it through to `main` and verify
the live deployment. Do not leave completed changes waiting on a PR or introduce another approval step (Sam, 1 Nov).

## Known risks and technical debt
Accepted on purpose, with a plan to resolve. Each has a story or issue.
- **Changes go live before GitHub has tested them** (accepted 30 Oct, Sam; low priority to resolve). For fast cycle
  time while trips find bugs, most changes merge once the local check passes, and Pages publishes `main` at once.
  Risk: a change that passes locally but fails on GitHub's machine (e.g. a timing-sensitive page test) is live for a
  few minutes until fixed forward; large changes such as engine refactors go live before GitHub checks them (their
  protection is the independent review). Mitigations: the local check repeats every GitHub check on the committed
  code; GitHub's result is checked after every push; nothing merges on a red `main`. Resolve: publish only after the
  tests pass, and every change waits for GitHub. → [only-tested-code-goes-live](stories/only-tested-code-goes-live.md), #30

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
3b. Leisure journeys: any address to any address in the region by rail (design 31 Oct; behind a switch). → [leisure-journeys](stories/leisure-journeys.md), [design](leisure-architecture.md)
4. Family day out. → [family-day-out](stories/family-day-out.md)
Design: Signal selected ([`design/`](design/README.md), [design system](design-system.md)); the sole design (Panda retired 1 Nov; see retirement review). Ideas: "Along the line" nerd mode (#24, supersedes #16).

## Decisions log

Newest first. Each entry records the decision and its consequences; linked stories and reviews hold the detail.

- **1 Nov, finish completed changes** Sam: leaving completed items on PRs raises risk. Once the authorised work
  and required testing/review are complete, merge to `main` and verify Tests/Pages and the live app. Branches and
  PRs support those checks; their existence is not a reason to stop or ask for routine merge approval. Preserve
  explicit wait instructions and report genuine blockers. The existing independent review and release checks
  still apply. → [working rules](../CLAUDE.md#release).
- **1 Nov, Panda retirement** Sam no longer sees enough value in maintaining Panda alongside Signal.
  Retire Panda and make Signal the sole supported design; preserve the complete pre-retirement implementation
  on [`archive/panda-2026-11-01`](https://github.com/srapley-spec/cartref-commute/tree/archive/panda-2026-11-01),
  commit `a45f08d704bbe59e7b7fa0bd044ce29bae2dbd4f`, so it can be recovered later. Remove the Signal feature
  toggle, Panda restoration path, supported-UI concurrency rule and design-parity registry/release gate.
  This supersedes the 31 Oct parity and feature-off restoration decisions below. Retain ordinary journey-view,
  duration, action and uncertainty regressions. Old saved Signal on/off values must not select another design;
  preserve trips, planning pins, home, provider/timing settings and the independent Trip, Follow and Along the line
  preferences. Retirement requires checking Signal against Panda's full functionality inventory.
  → [Signal story](stories/signal-design-system.md), [journey facts](stories/journey-facts.md),
  [archive recovery and audit](panda-retirement-review.md).
- **1 Nov, retirement audit and release** The author audit found an ambiguous platform in collapsed Next best
  for services boardable at Farringdon and St Pancras; each station's boarding time and platform is now visible.
  All 22 recorded scenarios preserve their engine options, request lists and errors. The separate reviewer is
  satisfied after nine new regression probes, thirteen effective mutations caught and eight native browser layouts;
  it also independently checked archive/candidate source and the goldens. Retain main's Trip mode, stable duration
  anchors, precise countdown and latest displayed-train progress fix. The archive includes this final pre-retirement
  main. Five old sentence-order assertions were corrected to check the same facts in the new duration row and
  independently replayed. Initial implementation `8267055` passed local/GitHub CI (905 tests); the combined release
  additionally requires exact committed-HEAD local CI and GitHub branch green because saved settings and test/build
  machinery change. Then merge and verify exact-main Tests/Pages and the live app, without another approval gate.
  → [Independent review](panda-independent-review.md), [inventory and recovery](panda-retirement-review.md),
  [final commit checks and release evidence](https://github.com/srapley-spec/cartref-commute/pull/46).
- **1 Nov, early hours** Trip mode stays Signal-only as an explicit exception to "every supported UI advances together"
  (Sam, asked when merging `main`'s new parity gate into the Trip branch: build Trip in Panda, a Signal-only exception,
  or hold it; chose the exception). The parity gate gains a recorded-exception mechanism (`designs` + `exception`
  decision with Sam's approval line per surface); Panda stays supported for everything else.
  This earlier exception is superseded by Panda retirement; Trip keeps its own opt-in in the sole Signal design.
  → [decision](decisions/trip-signal-only.md), [journey facts](stories/journey-facts.md)
- **31 Oct, Along access correction** Sam: location chooses the initial position on Along the line, never
  whether it is available. Keep navigation visible whenever enabled and every route point browsable regardless
  of interests. Retain the established corridor and open article through GPS/identity loss; reset on source,
  direction, mode or actual corridor/endpoints changes. → [Along the line](stories/along-the-line.md).
- **31 Oct** Sam authorises Along the line as a Signal-based journey companion, with a separate Experimental
  toggle off by default. Interests and reading depth are independent. Start with bundled curated
  Letchworth–London stories and approximate phone-led cues, never exact position from timetable interpolation.
  The pure model consumes injected evidence and profile content; the shell starts no extra feeds or location
  watches. Preferences are additive saved data, with existing simulation isolation.
  → [Along the line](stories/along-the-line.md).
- **31 Oct, night** Leisure journeys (Sam): door to door by rail between any two addresses in London, the South East
  and the East of England; walk / cycle / drive to and from the station, timed by Google (key required, no estimated
  fallback); stations discovered and ranked door to door; trips with changes; National Rail's journey planner, TfL
  station to station until access arrives (TfL returns 404 for coordinates outside London; a guessed ID was matched to
  a Feltham bus stop, so IDs are looked up and replies checked); live times per leg and at each change; Follow across
  legs; Signal only, behind Settings → Experimental, off by default. Independent review of the design before building.
  Revision 2 after that review (verdict "rework") and Sam's brief "reuse, loose coupling and speed": a third mode,
  **Trip** (Leisure unchanged); Google via its Maps JS library; one shared `Journey` core (the commute's `Option` a
  one-ride case, converging step by step) instead of a parallel type; providers behind ports; bundled station data
  (CRS + TfL IDs + car park + departures per hour); stations = nearest + well-served; first answer ≤ 4 s.
  Revision 3 after the second review (approve with changes): page mode contract first; Follow notices and view
  switching are reviewed refactors, not moves; plain-data Google ports with a contract suite so Maps JS → proxy is one
  adapter and a setting (Sam); stations promoted from live round-1 data; one change rule using the best known time at
  each end; speed proved by call order, not wall-clock.
  → [leisure-journeys](stories/leisure-journeys.md), [leisure architecture](leisure-architecture.md)
- **31 Oct, evening, UI parity** Sam: Live must show the same duration and fastest-route information as every
  other view, and all supported designs/UIs must be updated together until explicitly retired. Duration comes
  from the same canonical option or concrete connection projection, not a second Live calculation. Existing “Arrives first” means earliest usable
  arrival at each achievable effort level, not the shortest elapsed trip; ranking and catchability stay shared.
  An existing run/car grade survives a missed walking leave time. Tube `fastest` remains distinct from an explicit
  selected `best`; actual connection totals use projected leave-by to timed final arrival.
  Add an unconditional design × surface contract gate and concise glanceable commuter copy. This supersedes any
  earlier preservation-only interpretation that allowed a new feature to remain exclusive to one supported UI.
  → [UI parity](stories/journey-facts.md), [Live board](stories/live-station-board.md)
- **31 Oct, evening** Start from the nearest station removed after the demo (Sam). Kept: the page and routes take
  the local station from the profile (`PROFILE.home`), never the literal `LET`, as groundwork for any start and end
  point. Next for that: National Rail's journey planner (Sam has access; key and docs pending) for multi-train
  journeys, with Darwin live times on each leg. → [start-from-another-station](stories/start-from-another-station.md)
- **31 Oct** Starting from another station (Sam, for a demo in Hitchin): the local station is a parameter of the
  profile, not a constant. The engine derives the profile for a start station (`startStation.ts`, generic; the
  stations offered are profile data, only Hitchin so far, checked against live times); the page uses `PROFILE.home`
  instead of `LET` throughout. Opt-in from the header for today only, so not an Experimental toggle: the default
  commute is unchanged. Walk from where you are is the straight line × 1.3. Same day: Arlesey added (a demo in
  Fairfield, between Arlesey and Letchworth); nearest is by distance, with the other nearby stations one tap away.
  → [start-from-another-station](stories/start-from-another-station.md)
- **31 Oct, Live before a journey** Sam: with no journey selected or detected, Live is the departure board at the
  next stop of the journey (Letchworth from home, Aldgate from the office); Auto still answers when to leave. Every
  train listed with whether you can make it and by which route; several boarding stations grouped, with station
  lozenges; Commute in your direction only; Leisure all departures until a destination is chosen (not yet: needs an
  unfiltered board request and a proxy change); no toggle. The next stop comes from the routes (`Route.firstStop`,
  else the train's station), reach from the existing options and connection plan: no second timing model, no new
  requests. → [Live before a journey](stories/live-station-board.md)
- **31 Oct** TrackerNet proved unusable with Sam's TfL key (401 on every endpoint; a separate "TrackernetFeedPublic"
  product, probably its own key), so Met departures from Aldgate stay derived from Liverpool Street, improved only
  where 25 minutes of live polling justify it: run 90 s (measured; was the timetable's 2 min, ~30 s early) and the
  platform for a Met standing at Aldgate (TfL's location "At Aldgate Platform N"). TfL's timetable from Aldgate exists
  but adds nothing a live train doesn't. TrackerNet becomes primary only once a key gets it and live data proves it.
  → [tube-home](stories/tube-home.md)
- **31 Oct, journey clarity** Sam requires significant relevant disruption to show, existing inferred-location
  diagnostics to remain visible, shared time-column anchors across Signal, and overall/current-leg rail and Tube
  progress from real evidence. Central warning policy/configuration and pure progress calculations are shared
  engine responsibilities; independent review is required beyond UI-only changes. This refines the initial
  compact layout without removing controls, routing behaviour, source honesty or Panda's switch-off contract.
  → [Warnings](stories/warnings.md), [Signal](stories/signal-design-system.md), [progress](stories/journey-progress.md).
- **31 Oct** API keys may also live in the Claude Code cloud environment's secrets (Sam), so sessions can call TfL
  (incl. TrackerNet) and Rail Data Marketplace directly to prove endpoints and record real feeds; never in chat, the
  repo or recorded data. Names in CLAUDE.md.
- **31 Oct** Met departures from Aldgate come from TfL's westbound arrivals at Liverpool Street less the timetabled
  2-minute run (TfL lists the Met at Aldgate only as arriving; Sam: it must be available). One extra request per Aldgate
  fetch. Generic engine rule: departures from a terminus from the next stop's arrivals. → [tube-home](stories/tube-home.md)
- **31 Oct** Sam approves a radical compact Signal direction, inspired by Flighty/Railboard: real Journey options
  controls with effective context visible, exposed Auto/Plan/Live and planning question, primary answer plus
  expandable Next best, one visible network-impact summary, full Travel alerts and Lines & data, readable full-width
  rows and 44 px Follow actions. Active followed route foregrounds other recommendations; Tube controls remain
  outside their fold. Preserve Panda's original DOM, behavior, requests and ranking when Signal is off.
  This supersedes older Signal geometry, not its shared engine or preservation contract. Independent design,
  behavior, architecture and mutation review remain release requirements. → [Signal story](stories/signal-design-system.md),
  [compact design review](signal-compact-design-review.md)
- **30 Oct night, latest-code reconciliation** Premerge review found concurrent `origin/follow-a-route`
  (`d330e95`). Port its current journey improvements selectively: visible original arrival, incident recovery,
  explicit boarding correction, same-train observation continuity, explicit run/car choice, quiet Tube-approach
  alternatives and one-minute ETA stability. Retain current 5/15 status thresholds and latest simulator fixes
  rather than bulk-merging older page handling. Add recorded known-vehicle Tube prediction validation with a
  conditional, source-guarded existing-stop request. → [Follow a route](stories/follow-a-route.md)
- **30 Oct night** Sam authorises implementing Signal as an optional design against latest `main`, using the new
  Follow a route behavior. Manual planning returns to Auto after 20 minutes or a situation change, superseding
  the 29 Oct journey-scoped override. Panda and Signal share followed state and the engine; both switches start
  off. Preserve recent improvements and obtain regular independent behavior, testing and architecture reviews.
  → [Follow a route](stories/follow-a-route.md), [Signal](stories/signal-design-system.md),
  [verification and morning testing](signal-testing.md)
- **30 Oct evening** At a London station the walk to the tube counts from the train stopping (GPS speed ≤ 0.5 m/s
  after ≥ 5 m/s; engine `watchStop`), else from the first fix as before (Sam). Unverified under the King's Cross
  roof. → [connections](stories/connections.md)
- **30 Oct evening** Interchange timings from Sam's measurements: King's Cross rail → tube 400 s from the train
  stopping (30 s off + double the 185 s best, both paces); Aldgate East 112 s + 283 s (as measured). Next: start the
  King's Cross walk when the train stops (GPS speed), not at the first fix. → [connections](stories/connections.md)
- **30 Oct evening** Revert 15:48: the tube home is worked out again (picks still win), because on the 18:24 trip
  the Met he took wasn't pickable and the app timed his journey from the office at Moorgate. The two mistakes aren't
  equal: a false alarm at the desk is harmless, missing that you're travelling isn't. Sam's direction (planned, not
  built): follow a chosen route (one tap): ahead/behind, a stable arrival, every change announced with its reason
  (cancelled, delayed, missed, better option), tube followed by its vehicle. Without a chosen route, live mode works
  out where you are (this revert), switching on by itself when you seem to be on the move; you can switch back to
  planning and that choice lapses after 20 min or a change of situation. Leave now stays as now minus the "on a
  train/tube" views. Both directions, eventually any location. Behind Settings → Experimental first. → [tube-home](stories/tube-home.md)
- **30 Oct evening** TfL's Aldgate arrivals have no Met departures (recorded feed in `tests/fixtures/`); test data
  must come from recorded feeds where possible, marked as such. → [tube-home](stories/tube-home.md)
- **30 Oct** Working out which tube you're on counts only tubes you could have caught (the later of last-seen-away +
  walk and first seen there; 1 min slack), and "On a different tube?" is nearest first. Why: GPS went quiet underground and Sam was put on the 08:40 Circle
  while still walking down; the office time was 9 min early. → [connections](stories/connections.md)
- **30 Oct** A train's timetabled time is as prominent as its expected time (Sam): at a station or on the way, card
  and list show Train · Expected · At destination, platform-board order (option A of three), in Panda and Signal.
  Amber now starts at 5 min late (was 2): one rule for trains, the Expected column and route warnings. TfL's
  reported delays show as expected times, coloured. One expected arrival; no timetabled door-to-door arrival. Why:
  on the way to Letchworth a big "08:03" hid that the train was the 08:00.
  → [late-trains](stories/late-trains.md), [design-system](design-system.md#timetabled-and-expected-departure-sam-30-oct-2026-panda-and-signal)
- **30 Oct** Tubes to pick on the platform are labelled as the dot-matrix board shows them (place, line, destination,
  minutes), not by clock time (Sam); at Aldgate by its single combined list, with the platform; on the tube, by how
  long ago each left. → [connections](stories/connections.md), [tube-home](stories/tube-home.md)
- **30 Oct** Status colour follow-ups (Sam): 10–14 min late is amber (red from 15 everywhere); the route-wide status
  line stays amber from 5 min; "Arrives first · walking" and "Latest for HH:MM" stay green (status: you can make
  it). → [train-status](stories/train-status.md)
- **30 Oct** The tube home is only one you picked; never worked out (Sam, 15:48), after the desk read as Aldgate at
  15:37. **Reverted the same evening** (see above). → [tube-home](stories/tube-home.md)
- **30 Oct** Office arrival also counts after staying within 300 m for 10 minutes (Sam). At his desk the phone read
  217 m (±15 m) for over an hour, outside the 150 m circle, so the app kept saying "Walking to the office". 150 m /
  5 min still decides "you've arrived"; the wider, slower rule only turns the journey round. Office point unverified
  (geocoders blocked from the build machine); to be replaced with the phone's reading at the desk.
  → [direction-and-arrival](stories/direction-and-arrival.md)
- **30 Oct** A lozenge naming a tube line is that line's colour (Sam): line colours are identity, not status. King's
  Cross rail → subsurface measured at 185 s from stepping off (best case); not applied, because the walk counts from
  the first fix within 400 m, so 185 s would have recommended a Met Sam missed. The choice is with Sam.
  → [connections](stories/connections.md), [design-system](design-system.md)
- **30 Oct** Red, amber and green are reserved for status (Sam; critical, binding on this build, Signal and every
  proposal): never brand, accent, identity or selection; every live train shows on time / a bit late / very late as
  word, minutes and colour. Why: on the train the "You're on the 08:00" lozenge was orange and read as a warning.
  Sam then chose amber from 2 min (per train; the route-wide line stays at 5), the status inside the train's
  lozenge, and Signal's blue as the accent. Built in Panda (the live build's design system, named that day) and
  in the Signal preview. → [train-status](stories/train-status.md), [Panda](design/panda.md), [design-system](design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal)
- **30 Oct** Fast cycle time over a strict release gate, for now (Sam): `npm run ci` (every GitHub check, on a fresh
  copy of the commit) before every merge; most changes then merge without waiting for GitHub; GitHub's result on
  `main` is checked after every push and a red `main` is fixed before anything else merges. Changes to build/test
  machinery, saved phone data, live-feed requests, location handling or timing-sensitive tests wait for GitHub.
  Why: 30 Oct a merge went live before GitHub's tests finished; Sam values quick fixes while travelling, so the gap
  is accepted as debt (Known risks), not closed yet. → `CLAUDE.md`, #30
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

## Journey simulator
The web shell injects independent session-only GPS and transport providers from `src/simulator`.
The simulator clock supplies a scoped Date wrapper; the global browser clock is unchanged. GPS-only
playback uses device time; feed simulation uses a selectable frozen virtual epoch advanced only by
playback. Native GPS observation timestamps are translated into that epoch in feed-only mode.

GPS (`gps.js`), scenario definitions (`scenarios.js`), provider fixtures, controller/UI and virtual clock are separate from the pure production engine.
`tools/build.mjs` embeds their modules into the static page. Routes have separate outbound/return
schedules, explicit checkpoints, service alternatives and Underground vehicle progress. Accuracy
and no-fix scenarios exercise the normal location and inference paths.

Simulation sessions snapshot saved journey memory, suppress persistence and reset transient caches.
A source epoch guards requests, response bodies, asynchronous callbacks and retries across switches,
restart and Stop. Reload always restores real operation. See [journey simulator](stories/journey-simulator.md),
[coverage](simulator-scenario-coverage.md), and [independent UX review](simulator-ux-review.md) for verification;
[PR #37](https://github.com/srapley-spec/cartref-commute/pull/37) records exact release evidence. GitHub-first release applies because this changes location, timing,
feed requests, saved-state isolation and generated build integration.

### Deliberate context loss and Back (31 October)
Back is a cold-start experiment, not a replay of prior decisions: it pauses, invalidates source/playback
and observation epochs, moves the shared synthetic inputs to the previous waypoint and discards inferred
journey state. Reset journey state performs the same discard without moving the clock or raw fix.
The shell captures raw observations with their original age and clears rendered/presentation/progress
evidence before the normal location handler runs again. Unavailable GPS remains unavailable. The configured
profile and permanent settings are preserved; real session snapshots remain untouched.
The observational verifier distinguishes missing historical evidence from failures and resumes ordinary
checks after fresh movement/context. Reports archive bounded sanitized attempts, including earlier failures,
without treating future checkpoints as verified after rewind. No simulation decisions enter `src/core`.

### Simulator time audit
The shell's lexical Date wrapper supplies current time to board parsing, service matching, direction
memory, arrival/leave date inputs, stale-fix checks, request counts, cache ages, backoff and refresh
throttling. Core functions receive current instants; their Date construction formats or derives dates
from explicit inputs. No core function reads Date.now. Simulator provider times use the same supplied
epoch and remain anchored across midnight. Native location timestamps carry observation age into the
virtual epoch in feed-only mode. Browser intervals schedule work but do not themselves advance virtual
time: only playback ticks do. A paused or backgrounded scenario does not catch up to wall time.
Source changes, restart and Stop abort old requests, invalidate response-body epochs, invalidate planner
tokens/retry timers, clear progress and all timestamped caches and reset throttles. Global browser Date
and device time remain unchanged; old virtual timestamps never return to real cache reuse decisions.

Synthetic Underground runs include plausible dwell and running variability: actual GPS/TfL vehicle
progress takes14minutes KGX–Aldgate or9minutes Farringdon–Aldgate in the normal fixtures. Profile
ride durations remain fallback estimates; live vehicle predictions correct the expected arrival.

### Journey Mode UX and observational verification (31 October redesign)
Journey Mode and Advanced are presentations of one existing simulator controller. Guided setup is draft state; only Start atomically enables the coordinated sources and resets the scenario. Active provider configuration is immutable until an explicit restart, preserving coherence while draft controls are edited. Remembered choices live in a separate validated preference key, without active state.

`catalog.js` describes grouped scenarios; `journey-ui.js` renders guided setup, the compact overlay, timeline and progressive Advanced diagnostics. `session.js` observes the real shell's already-computed presentation after refresh, invokes pure simulator assertions from `verification.js`, and records bounded allowlisted results in `report.js`. No expected identity is injected into the production engine. Session/playback tokens guard asynchronous observations, and export sanitization retains all private values encountered during the session even after Stop. The actual app remains the main interface.

The subsequent main-branch Follow-a-route capability shares these safeguards: original followed-route and planning-lifetime memory are snapshot/restored, synthetic Follow choices remain in memory, and follow-option/vehicle-ETA caches are cleared at source boundaries. Diagnostics observe the normal rendered Follow model; they never call the production follower or train inference a second time. Its cache ages, planning expiry and event timestamps use the same lexical clock as the rest of the web shell.

Main's subsequent Signal release (`4ee24c7`, PR #36) replaces the original Follow controller with the shared `src/journey-ui.js` shell. The simulator preserves that controller and records its already-computed train/ride and Follow result. Its separate Follow panel is sanitized into `actualDisplay.followCard`. Snapshot/reset covers `followRoute`, `viewOverride`, `planInputs` and legacy migration metadata; source epochs also clear the Follow Map and presentation/transport state. Explicit presentation pins have separate inconclusive expectations, while actual followed rail phase is checked independently of whether the main card chooses `following` or the richer `on-train` view.

The later train-stop release (`cdf6ecd`) is retained. Synthetic stationary waits have zero speed, and rail fixes stay moving until the final arrival; normal `watchStop` derives the stop from the shared clock. Runtime assertions compare the actual stopped timestamp and the selected service's arrival at the actual destination board. Leaving simulation resets transient state before restoring saved real station visits, with device-time age validation; the speed watch stays empty until fresh native observations. This preserves an existing real stopped visit through both Stop and Settings source-disable without restoring any synthetic timestamps.

Real planning input values and runtime alternative origin are session-snapshotted separately from saved JSON. The shell's planners read these DOM inputs, so restoring only saved metadata is insufficient. Both exit paths restore them before normal refreshing; the normal location dispatcher resumes the selected planner, including Leave-around. Original unsaved origin/destination strings join the private-value history for sanitized reports. No input snapshot is persisted or exported.

### Reconcile the released Follow controller (31 Oct)
`main` released Follow a route at `be1e58e` during Signal implementation. Both designs now consume one shared
pure follower and presentation controller; the older internal API/HTML assertions are translated into the seven
engine and nine page regression scenarios in `tests/core/follow-main-regression.test.mjs` and
`tests/follow-main-regression.test.mjs`. There is no parallel legacy planner. Saved `settings.follow`, `follow`,
and planning-pin metadata have a validated compatibility boundary; old records are retained until actual loaded
itineraries can restore them. Source freshness, current 5/15-minute bands, explicit boarding-point consent and
observed completion take precedence over the old implementation's conflicting assumptions. All original scenario
boundaries remain tested; see the reconciliation record below.
