# Live and timetable data
Status: Done · Since: 28 Oct 2026 · Issues: #17, #18

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

## Not yet / open questions
- #18: National Rail timetable via a daily GitHub job instead of TfL for trains.
- #17: proxy with offsets and Service Details.
