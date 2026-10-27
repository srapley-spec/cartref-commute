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

## Development
- Edit `src/app.html`, then run `npm run build` to regenerate `index.html` (the hosted page). CI fails if they differ.
- `npm install && npm test` runs the suite in `tests/` against the built page in jsdom, with mocked network and location:
  time boundaries, delays and cancellations, door-to-door maths, direction from location, timeouts, rate limiting,
  partial failures, Arrive by, warnings and the standing-room rule.
- Fixtures follow the documented Darwin and TfL formats; replacing them with captured real responses is tracked in #9.

## Reliability and security
- Every request times out after 12 s; the app never stays stuck loading.
- Trains marked "Delayed" with no estimate are not used for planning and are listed separately.
- If a refresh fails, the last good times stay on screen and are flagged as out of date after 3 minutes.
- TfL HTTP 429 triggers a one-minute back-off. A free TfL app key (Settings) raises the limit.
- Notice text from National Rail and TfL is parsed in an inert document and reduced to plain text.
- Keys typed into Settings live in this browser's storage. The proxy keeps the National Rail key off the phone;
  it only answers origins listed in `ALLOW_ORIGIN`.
