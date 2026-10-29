# Never hide a train
Status: Done · Since: 27 Oct 2026

## Story
As anyone planning a journey, I want every train I could catch listed, with what's wrong with it, so that I
decide and the app doesn't silently decide for me.

## Where it came from
Sam's first principle for the app (27–28 Oct). Filtering trains out (late, stopping, standing) made the list
untrustworthy: a train he could see on the platform wasn't in the app.

## Acceptance criteria
- Every loaded train for the routes in play is listed, in leaving order.
- Problems are flags, not removal: stopping train, usually standing room only, cutting it fine, late by N min,
  delays, cancelled, delayed with no estimate, leave time passed, timetable only.
- The only trains left out are ones already out of reach (already departed, or you'd have had to leave already
  and it isn't a station you're at).
- Cancelled and "Delayed, no estimate" trains are listed but never recommended, and are not used for planning.
- Merging the same train at several stations never loses a train.
- "Why these trains?" under the list says what each source returned and what was dropped and why.

## Tests
- tests/core/engine.test.mjs: "Never hide: merging keeps every train (main + same-train alternatives)"
- tests/logic.test.mjs: "Trains without dependable times are listed and flagged but never recommended"
- tests/logic.test.mjs: "Delayed-without-estimate trains are listed as not used for planning"
- tests/app.test.mjs: "Leave now lists every catchable train; the card has the best and the next best, here on the same route"
- tests/app.test.mjs: "Trains from St Pancras are kept on the King's Cross route; dropped journeys are explained"
- tests/core/plan.test.mjs: "liveAdjust: departed trains go; leave time passed is flagged, not hidden; at the station, catchable until a minute before"
- tests/core/engine.test.mjs: "trainFlags: cancelled, standing room, stopping, delays, unknown — from the profile's rules"

## Not yet / open questions
- Discovered alternatives (#13) must follow the same rule: they join the list, they don't replace it.
