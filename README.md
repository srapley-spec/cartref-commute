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
- Rail legs: live departures and calling-point estimates from Darwin; cancelled trains are excluded and listed.
- Tube legs: modelled as interchange walk + wait allowance + typical ride time. All editable in Settings.
- Aldgate East (H&C) is used only when Circle and Met are both closed or suspended.
- "Fast pace" uses your measured fast walks for Cartref ⇄ Letchworth and a multiplier (0.82, from your data) for London walks.
