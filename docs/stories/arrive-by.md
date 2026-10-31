# Arrive by
Status: Done (earlier trains not guaranteed without a TfL key: #14) · Since: 27 Oct 2026 · Issues: #14

## Story
As a commuter with a deadline (office by 08:30), I want the latest train that gets me there, and the earlier ones,
so that I know how long I can stay and what my safer options are.

## Where it came from
28 Oct morning: Sam arrived at Letchworth early and took the 07:08 fast, which had seats. Arrive by should reliably
include earlier trains (#14).

## Acceptance criteria
- Each train is labelled on time, cutting it fine, or late by N min; the latest on-time train is the pick.
- Trains either side of the pick are listed, including late ones.
- If no train arrives in time, the earliest late one is recommended and says so.
- Both routes (King's Cross and Farringdon) are offered; a route that failed is retried on its own; a TfL refusal
  after the first searches still leaves both routes.
- Walk from where you are only when the target is within 3 hours.
- Live data: under 100 min ahead reuses the loaded boards; further ahead asks the board from 2 h before, cached
  2 min.
- Without a key, the third search per route starts early enough for that route's slowest train (+15 min).
- A direction change while planning Arrive by plans again for the new direction.
- Under way (on the train, at a London station, on the tube or walking to the office) with an Arrive by deadline
  today: the live view with "On time for hh:mm · N min to spare" or "Late for hh:mm by about N min" first, and the
  list shows the rest of the journey. A deadline on another day stays a plan: no verdict (view choice:
  [presentation-model](presentation-model.md)).

- The original question, date/time and alternative origin return after either simulator exit path; temporary input drafts stay private in diagnostic reports.

## Tests
- tests/simulator-stop-review.test.mjs: "independent simulation isolation: real planning dates and runtime origin return after dock Stop and source disable"
- tests/core/search.test.mjs: "Arrive by: on time, cutting it fine, late by N min; the latest on-time train is the pick"
- tests/core/search.test.mjs: "Arrive by searches: arriving at the latest useful time, then after, then from early enough"
- tests/app.test.mjs: "Arrive by finds the latest train, flags stopping trains and tight arrivals"
- tests/app.test.mjs: "Arrive by lists trains either side of the recommended one, including late ones"
- tests/app.test.mjs: "Arrive by 08:30 offers both the King's Cross and the Farringdon train (no TfL key)"
- tests/app.test.mjs: "A TfL refusal after the first searches still leaves both routes in Arrive by"
- tests/rules.test.mjs: "Route retry: a route that failed in Arrive by is fetched again on its own"
- tests/rules.test.mjs: "Arrive by: walk from where you are only when the target is within 3 hours"
- tests/rules.test.mjs: "Arrive by with live data: under 100 min reuses the loaded boards; further ahead asks the board from 2 h before, cached 2 min"
- tests/rules.test.mjs: "Arrive by without a key: the third search per route starts early enough for that route's slowest train (+15 min)"
- tests/rules.test.mjs: "Direction change while planning Arrive by plans again for the new direction"
- tests/logic.test.mjs: "Arrive by on the train: says whether this train gets you there on time; a deadline on another day is a plan, not a verdict"

## Not yet / open questions
- #14: guarantee earlier trains (setting "show trains from N min before", default 60) vs rely on the TfL key.
