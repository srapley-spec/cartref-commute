# Reliability when feeds fail
Status: Done · Since: 27 Oct 2026 · Issues: #8, #9

## Story
As a commuter on a bad signal, I want the app never to hang and always to show the last good times, marked as old,
so that I'm never left with a spinner or wrong data presented as fresh.

## Acceptance criteria
- Every request times out after 12 s; the app recovers and refreshes again.
- A board that fails keeps its last good trains; a timetable route that fails keeps its last trains.
- Darwin partial failure keeps the boards that loaded; total failure falls back to the timetable; a refused key
  falls back to the timetable.
- "Train times may be out of date" after 3 min without an update.
- TfL 429: no TfL requests for a minute, then they resume; a rate-limited first load doesn't become a request loop.
- Location updates don't trigger requests on their own; without a TfL key a load stays within a handful of
  requests, one at a time.
- If a route can't load, the app says so and names what is shown.

## Tests
- tests/rules.test.mjs: "Requests time out after 12 s by default"
- tests/app.test.mjs: "A hung request times out; the app recovers and refreshes again"
- tests/rules.test.mjs: "Live: a board that fails keeps its last good trains; the timetable route that fails keeps its last trains too"
- tests/app.test.mjs: "Darwin partial failure keeps the boards that loaded; total failure falls back to the timetable"
- tests/rules.test.mjs: "'Train times may be out of date' after 3 minutes without an update"
- tests/rules.test.mjs: "TfL rate limit: no TfL requests for a minute, then they resume"
- tests/app.test.mjs: "TfL rate limiting backs off and keeps the last good times, then flags them as stale"
- tests/app.test.mjs: "A rate-limited first load does not turn location updates into a request loop"
- tests/app.test.mjs: "Frequent location updates do not trigger requests; automatic refreshes are throttled"
- tests/app.test.mjs: "Without a TfL key, a load stays within a handful of requests, one at a time"
- tests/app.test.mjs: "If a route can't load, the app says so and names what is shown"
- tests/golden.test.mjs: "golden: live feed refuses the key: falls back to the timetable"
- tests/proxy.test.mjs: "Proxy: refuses to run without ALLOW_ORIGIN, and refuses other origins"

## Not yet / open questions
- #9: validate against real Darwin/TfL responses and on iPhone.
