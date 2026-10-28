# Cartref Commute

When to leave the office or Cartref, using live National Rail trains via King's Cross (Great Northern) or Farringdon (Thameslink), Circle/Met to Aldgate, and your measured walks.

## Files
- `site/` — the app. Host this folder as-is (GitHub Pages, Netlify, Cloudflare Pages).
- `proxy/worker.js` — optional Cloudflare Worker, only if the Darwin feed blocks browser calls.

## Host on GitHub Pages
1. Create a repo, upload the contents of `site/` to the root.
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
- Aldgate East (H&C) is used only when Circle and Met are both closed or suspended.
- "Fast pace" uses your measured fast walks for Cartref ⇄ Letchworth and a multiplier (0.82, from your data) for London walks.

## Architecture
See the architecture decision in the Commuter App project. In short:
- `src/core/` — the **engine** (TypeScript, pure functions: no screen, no network, no hard-coded places).
  - `types.ts` trains, options, flags, profiles · `time.ts` · `geo.ts`
  - `adapters/` Darwin and TfL responses → trains
  - `rules.ts` standing room, stopping trains, plannable · `rank.ts` top picks, every route, same-train merging
  - `profiles/sam.ts` Sam's commute as data (stations, lines, thresholds, standing-room rule, term dates)
- `src/page.html` — the **screen**: location, fetching, live-journey states, rendering. Uses the engine through `window.CommuteCore`.
- `tools/build.mjs` — type-free bundle of the engine (esbuild) inlined into the page → `index.html` (hosted) and `dist/preview.html`.

## Development
- `npm install` once; `npm test` builds and runs everything; `npm run typecheck` checks the engine's types.
- Edit `src/core/**` or `src/page.html`, then `npm run build` and commit `index.html`. CI fails if it is stale.
- Tests:
  - `tests/core/` — engine unit tests, run against Sam's profile **and a made-up corridor** (proves reuse), plus
    randomised checks of rules that must always hold (never hide a train, one pick per route, ordered by arrival).
  - `tests/fixtures/` — Darwin and TfL response shapes. These are the contract a future native engine must also pass.
  - `tests/*.test.mjs` — end-to-end tests of the whole page with mocked network and location.

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
- **Top card:** the best option per route, ordered by arrival. Arrive by: the latest train on each route that
  gets you there in time. Leave now: the earliest arrival on each route, plus the train you'd catch by
  setting off this minute if it's a different one. Cancelled and "Delayed, no estimate" trains are listed but
  never recommended.
- Each option shows leave time, arrival, route, train length and total door-to-door time.
- **Leave around:** pick a time (default 17:40); the card shows the best option per route for leaving within
  10 minutes before that time or any time after; the list shows every train around then.
- **Direction:** near Letchworth you're heading to work; once you've been at the office today, anywhere else
  counts as heading home for the rest of the day.
- **St Pancras:** Thameslink trains from St Pancras are part of the King's Cross route (same tube station).
- **Why these trains?** Under the list: what TfL returned for each route search and what was dropped and why.
