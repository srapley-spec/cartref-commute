# Live and timetable data
Status: Done · Since: 28 Oct 2026 · Proxy parity (#17): 4 Nov 2026 · Issues: #17, #18

## Story
As a commuter, I want live times whenever they exist and the timetable beyond them, clearly labelled, so that I
know which times to trust.

## Acceptance criteria
- Live board (Rail Data Marketplace) reaches ~2 h; beyond it, TfL timetable trains are added and labelled
  "timetable only". Live trains are never replaced by timetable ones.
- Live board start offset is kept within what the feed allows (−120 to 119 min); starts 40 min back while on the
  train.
- Live boards only for the direction you're going.
- Without a TfL key: one search per route, a second 30 min later only for a route with under 2 trains. With a key:
  onward pages, and a train found only at Farringdon is looked for at St Pancras.
- TfL timetable: only direct trains between Letchworth and a London station are used; changes are reported, not
  used.
- A refusal stops further requests and every route says why; a plain failure doesn't.
- **Through your own proxy (#17, 4 Nov).** Settings → National Rail → "My proxy (Cloudflare Worker)" is a full live
  source, the same as a key in Settings: the start offset (−40 on the train; ahead for Leave around / Arrive by) is
  passed as `/board/FROM/TO?offset=N`, Service Details for the train you're on as `/service/ID` (ID URL-encoded), and
  no key is sent from the phone. The Worker (`proxy/worker.js`) holds `RDM_KEY` (and optionally `RDM_SD_KEY` /
  `RDM_SD_BASE`; else the board key and Rail Data Marketplace's Service Details product), passes an offset only as a
  whole number from −120 to 119 (anything else: 400, never sent upstream), a service ID only of up to 64 letters,
  digits and `+/=_-` (else 404), keeps the origin check and four-station allowlist, and caches upstream answers 20 s (the phone is told `no-store`). A client faking the Origin can still spend
  upstream quota (each offset and service ID is its own cache entry): add a Cloudflare rate-limiting rule.
  Proxy refusals say what to fix in the proxy, not on Rail Data Marketplace's product page: a board's 403 →
  `ALLOW_ORIGIN`, 401 → `RDM_KEY`, 404/400 → redeploy `proxy/worker.js`, 500 → set `RDM_BASE` and `RDM_KEY`;
  Service Details' 401/403 → "set RDM_SD_KEY in your proxy". Simulated feeds stay synthetic with the proxy source. The Rail Data Marketplace source is
  unchanged. Not verified against the live Worker: Sam deploys it; whether Cloudflare's 20 s cache applies on a
  `*.workers.dev` address (rather than a custom domain) is to check once it's live.

## Tests
- tests/core/warnings.test.mjs: "Live + timetable: horizon, timetable only after it (live wins), offsets clamped, flags"
- tests/rules.test.mjs: "mergeBeyond: only timetable trains after the live horizon are added; live trains are never replaced"
- tests/rules.test.mjs: "Live board start offset is kept within what the feed allows (-120 to 119 min)"
- tests/app.test.mjs: "Live boards: only the direction you're going; Leave around within reach uses the live board from that time"
- tests/rules.test.mjs: "Timetable search plan without a key: one search per route, a second 30 min later only for a route with under 2 trains"
- tests/core/search.test.mjs: "Leave now searches: one per route first, then onward pages with a key; 35 min back on the train"
- tests/core/search.test.mjs: "A refusal stops further requests and every route says why; a plain failure doesn't"
- tests/logic.test.mjs: "TfL timetable: only direct trains between Letchworth and a London station are used"
- tests/core/engine.test.mjs: "TfL journeys fixture → direct trains; changes are reported, not used"
- tests/core/engine.test.mjs: "TfL adapter works for another corridor (no Letchworth assumptions)"
- tests/core/engine.test.mjs: "Darwin board fixture → trains"
- tests/core/calls.test.mjs: "Darwin board: service ID kept; stops already passed are marked actual"
- tests/proxy.test.mjs: "Proxy: the board's start offset is passed on only as a whole number the feed allows (-120 to 119)"
- tests/proxy.test.mjs: "Proxy: Service Details by ID with its own key (else the board key), at its own base; the key never returned"
- tests/proxy-page.test.mjs: "Proxy source: boards and Leave around's start offset go through the proxy, with no key sent"
- tests/proxy-page.test.mjs: "Proxy source: Service Details for the train you're on go to the proxy's /service/ID, the ID encoded"
- tests/proxy-page.test.mjs: "Rail Data Marketplace source is unchanged: Service Details direct, with the key, at the product's base"
- tests/proxy-page.test.mjs: "Proxy source on the train: the board starts 40 min back and the train you're on is followed through /service/ID"
- tests/proxy-page.test.mjs: "Simulated feeds with the proxy source: Service Details stay synthetic, nothing reaches the proxy"
- tests/proxy-page.test.mjs: "Rail Data Marketplace Service Details without their own key or base: the board key and the product's default base"
- tests/proxy-page.test.mjs: "Proxy source: a board refused by the proxy says what to fix in the proxy (origin, key, redeploy, setup)"

## Not yet / open questions
- #18: National Rail timetable via a daily GitHub job instead of TfL for trains.
- #17 (done 4 Nov, pending Sam's deployment): proxy with offsets and Service Details.
