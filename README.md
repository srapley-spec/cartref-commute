# Cartref Commute

When to leave the office or Cartref, using live National Rail trains via King's Cross (Great Northern) or Farringdon (Thameslink), Circle/Met to Aldgate, and your measured walks.

## Try the journey simulator
Open **Simulator** in the app header to replay a journey through the real application without travelling.
The [simulator user guide](docs/simulator-user-guide.md) covers starting a journey, controls, scenarios,
GPS accuracy, verification, reports and limitations. The [scenario coverage matrix](docs/simulator-scenario-coverage.md)
records the automated checks and their results.

## Context
Start with [`CLAUDE.md`](CLAUDE.md) (working rules), [`docs/architecture.md`](docs/architecture.md) (why it's built
this way, decisions, plan) and [`docs/stories/`](docs/stories/README.md) (each capability: where it came from,
acceptance criteria, the tests that prove it). These are the source of truth and are updated with every behaviour
change; CI checks that they are.

## Files
- `index.html` — the app as hosted (built from `src/`), with `manifest.webmanifest` and the icons.
- `src/` — the engine (`src/core`) and the screen (`src/page.html`); `tools/build.mjs` builds `index.html`.
- `proxy/worker.js` — optional Cloudflare Worker, only if the Darwin feed blocks browser calls.

## Host on GitHub Pages
1. The repo root is the site (`index.html`).
2. Repo → Settings → Pages → Deploy from branch → `main` / root.
3. Open the URL on your phone → Share → Add to Home Screen.

## Darwin key
1. Register at raildata.org.uk and subscribe to the **Live Arrival and Departure Boards** product (the one with `GetDepBoardWithDetails`).
2. From the product page, copy the consumer key and the endpoint base URL (ending `/LDBWS/api/20220120`).
3. In the app: Settings → Source: Rail Data Marketplace → paste both → Save.

If the app says it couldn't reach the feed (no HTTP code), the provider is blocking browser calls. Deploy `proxy/worker.js` and choose **My proxy** instead.

## Model
- Modes: **Commute** (Cartref ⇄ office) and **Leisure**: from Cartref to King's Cross or St Pancras, or from wherever you are in London home via King's Cross, St Pancras or Farringdon. The London leg comes from TfL's journey planner (slow walking); leisure walks use a 1.15× multiplier on your average times.
- Train source: Darwin (live) when a key is set; otherwise TfL journey planner timetable (not live), also used as a backup if Darwin fails.
- Rail legs: live departures and calling-point estimates from Darwin; cancelled trains are excluded and listed.
- Tube legs: modelled as interchange walk + wait allowance + typical ride time. All editable in Settings.
- Aldgate East (H&C): planned from home only when Circle and Met are both closed or suspended; at King's Cross or
  Farringdon with live tubes it competes on arrival time; going home from Aldgate it stays a fallback.
- "Fast pace" uses your measured fast walks for Cartref ⇄ Letchworth and a multiplier (0.82, from your data) for London walks.

## Architecture
See [`docs/architecture.md`](docs/architecture.md). In short:
- `src/core/` — the **engine** (TypeScript, pure functions: no screen, no network, no hard-coded places).
  - `types.ts` trains, options, flags, profiles · `time.ts` · `geo.ts`
  - `adapters/` Darwin and TfL responses → trains
  - `rules.ts` standing room, stopping trains, plannable · `rank.ts` top picks, every route, same-train merging
  - `journey.ts` door-to-door options from route segments · `alternatives.ts` the same train at the other London station
  - `situation.ts` what you're doing from where you are: direction, at a station, on the line, which train (incl.
    Service Details), on a tube, tube going home, nearly home
  - `plan.ts` the Leave now list · `search.ts` which timetable searches each plan makes (run against an injected
    journey planner) and the Leave around / Arrive by lists · `live.ts` live + timetable mixing · `warnings.ts`
    warning grading, notices, line status
  - `profiles/sam.ts` Sam's commute as data (stations, lines, places, thresholds, standing-room rule, term dates)
    · `profiles/samRoutes.ts` Sam's routes as segments, from his timings
- `src/page.html` — the **screen**: location, fetching, caching, rendering. Uses the engine through `window.CommuteCore`.
- `tools/build.mjs` — type-free bundle of the engine (esbuild) inlined into the page → `index.html` (hosted) and `dist/preview.html`.

## Development
- `npm install` once; `npm test` builds and runs everything; `npm run typecheck` checks the engine's types.
- Edit `src/core/**` or `src/page.html`, then `npm run build` and commit `index.html`. CI fails if it is stale.
- Tests:
  - `tests/core/` — engine unit tests, run against Sam's profile **and a made-up corridor** (proves reuse), plus
    randomised checks of rules that must always hold (never hide a train, the card's alternative is never strictly worse and is within 20 minutes).
  - `tests/fixtures/` — Darwin and TfL response shapes. These are the contract a future native engine must also pass.
  - `tests/*.test.mjs` — end-to-end tests of the whole page with mocked network and location.
  - `tests/golden.test.mjs` — characterisation tests: 20 fixed situations on a made-up but realistic railway
    (`tests/golden/feeds.mjs`, with stops, delays and cancellations) at a frozen clock. Each records exactly what the
    app requests and shows (banners, card, every row, every option's steps and flags, "Why these trains?") in
    `tests/golden/*.json` and fails on any difference. After an intentional change: `UPDATE_GOLDEN=1 npm test`,
    then read the diff of the JSON files before committing.
  - `tests/rules.test.mjs` — each threshold, window, cache and inference rule pinned at its boundary.
  - `tests/proxy.test.mjs` — the Cloudflare Worker proxy.
  - Tests run with `TZ=Europe/London` on a virtual clock (`tests/clock.mjs`: Tue 3 Nov 2026 10:00, ticking), so
    results don't depend on when you run them. The harness can freeze and move the page clock (`now`, `app.setNow`)
    and hold location until `app.giveLocation()`.
  - Checked by mutation testing on 28 Oct: 60 deliberate one-line breakages of planning logic, all caught; then 46
    more over the evening's on-train, tube-home and nearly-home code, all caught (one rule that could never change
    the result was removed); then 37 over the new engine modules after the re-architecture, all caught.

## Reliability and security
- Every request times out after 12 s; the app never stays stuck loading.
- Trains marked "Delayed" with no estimate are not used for planning and are listed separately.
- If a refresh fails, the last good times stay on screen and are flagged as out of date after 3 minutes.
- TfL HTTP 429 triggers a one-minute back-off. A free TfL app key (Settings) raises the limit.
- Notice text from National Rail and TfL is parsed in an inert document and reduced to plain text.
- Keys typed into Settings live in this browser's storage. The proxy keeps the National Rail key off the phone;
  it only answers origins listed in `ALLOW_ORIGIN`.

## Display rules
- **Never hide a train.** Every train loaded for the routes is listed, in leaving order, with flags:
  Stopping train, Usually standing room only, Cutting it fine, Late by N min, delays, Cancelled, and
  Delayed with no estimate. Only trains already out of reach (you'd have to have left already) are left out.
- **Top card:** the best train and the next best alternative, on any route (every route is weighed; none is
  shown just because it's a different route). Leave now / Leave around: best = earliest arrival; next best =
  the best of the trains that leave later (the one to fall back on), only if it arrives within 20 minutes of
  the best (`topWindowMin` in the profile). Arrive by: best = the latest train that gets you there in time;
  next best = an earlier train with more margin, leaving no more than 20 minutes before it. A train that leaves
  earlier and arrives later than the best is never the alternative. If nothing qualifies, the card shows the
  best alone; the list always has every train. Leave now also says which train you'd catch by setting off this
  minute if it's a different one. Cancelled and "Delayed, no estimate" trains are listed but never recommended.
- Each option shows leave time, arrival, route, train length and total door-to-door time.
- **Leave around:** pick a time (default 17:40); the card shows the best train (and the next best, as above) for leaving within
  10 minutes before that time or any time after; the list shows every train around then.
- **Direction:** near Letchworth you're heading to work, unless you've been heading home in the last 3 hours
  (then you're arriving: "Nearly home"); once you've been at the office today, anywhere else counts as heading home.
- **St Pancras:** Thameslink trains from St Pancras are part of the King's Cross route (same tube station).
- **Same train, two stations:** "Board at Farringdon 16:56 platform 4 or St Pancras 17:01 platform B" on the card;
  a station you can no longer make says "(too late to reach from here)"; ties go to the earlier stop.
- **Slow trains** in "Leaving right now?", "Next train" and "Still possible if you hurry" are named ("stopping
  train, 54 min") with how their arrival compares with the best option.
- **Warnings** are graded by what's happening to your own trains: red = cancelled, no estimate or 15+ min late;
  amber = 5-14 min late; yellow = a notice about your route (or your operator's status) with no impact yet; grey =
  elsewhere on the network, and station facility notices (toilets, lifts, escalators...), folded. Opened notices
  stay open across refreshes; links in notices are tappable.
- **At the station** (a London station going home, Letchworth station going to work), Leave now is a departure
  board: the big time is the departure, the countdown is to the departure, "walk to the platform by" is small
  print. A train from that station stays catchable until a minute before it leaves.
- **On the train:** only trains that have departed count; where National Rail last reported each train (Service
  Details) settles which one you're on, and a train reported more than 6 min from you is ruled out; once sure it
  stays with your train; when unsure you pick ("Which train are you on?") and the pick is kept until you're off the
  line. Arrival comes from the train's live expected time; the card shows the last reported stop.
- **Tube going home:** near the office, the next westbound tubes from Aldgate you can make, each with its train and
  when to leave; underground after Aldgate, which tube you're probably on and where to get off (Farringdon or King's
  Cross) for the earliest home time. Same model as the morning tube: pick your tube, ride, "Did you get it?".
- **Nearly home:** home time from your train's expected Letchworth time, or the walk from where you are once your
  home is set in Settings ("Home is where I am now"); "You're home" within 100 m.
- **Any start and end point** (Settings → Experimental, off by default): in Leisure, "Where to?" plans the train to
  King's Cross, St Pancras or Farringdon and TfL's leg from there to any London place (a place name is matched to
  TfL's best guess, and the card names it); going home, "Where from?" is always offered. Off: the app as before.
- **Extra effort to catch a train** (Settings → Experimental, off by default): every train you'd have to hurry for is labelled
  with what it would take (Fast walk, Run, Car needed, Can't make it) and which arrives first at each level; a fast
  walk can top the card; Arrive by's pick says "Latest for 08:30". Off: the app as before.
- **Why these trains?** Under the list: what each source returned for the plan on screen (live boards and
  timetable searches) and what was dropped and why.
