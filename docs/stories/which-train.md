# Which train you're on
Status: Done · Since: 28 Oct 2026 (evening trip); near home 29 Oct (morning trip); destinations 30 Oct · Issues: #10, #11, #23

## Story
As a commuter on a train, especially when there's disruption, I want the app to know which train I'm on and when
it will really arrive, so that the rest of the journey (tube, home time) is planned from the truth.

## Where it came from
28 Oct evening: matching by timetable position broke after the train made an extra stop. 29 Oct morning: passing
Hitchin on the 07:08, the app thought Sam was at home; with the late 07:00 and the 07:08 a few minutes apart it had
to ask; Service Details needed its own key. Non-stop runs only report their two ends (passing points: #23).
30 Oct 18:58, leaving King's Cross: asked to choose between the 18:54 and 18:57 Great Northern, Sam could only tell
them apart by where each was going (the 18:57 to Cambridge), which the train's screens show and the app didn't.

## Acceptance criteria
- The train you're on is one blue lozenge with its status inside it ("On time" / "About N min late"), banded green /
  amber / red for the expected arrival at the change station. → [train-status](train-status.md)
- Only departed trains count; a train that hasn't left is never yours, even if it fits best by timetable.
- Where National Rail last reported each train (Service Details) settles which one you're on; between reported
  stops a train is placed in proportion to time. A train reported more than 6 min from you is ruled out.
- "Sure" only if the next train is 4+ min further off; nothing within 10 min means no match.
- Once sure it stays with your train, but lets go when you're more than 12 min from it.
- When unsure it asks "Which train are you on?"; your pick is kept until you're off the line; if nothing fits you
  can still pick. A fresh fix contradicting a pick (reported position more than6minutes away,
  or timing fit more than12minutes away) retains the choice but marks low confidence, warns that the selected
  train does not match current location and asks again. A fix older than2minutes cannot create a conflict.
- On the line counts only when moving along it; near home (just past Letchworth to just past Hitchin) only when by
  the track at train speed; stays on while stopped at a station.
- Trains are compared with where you were when the phone took the fix (the phone's own timestamp); "departed" means
  departed by then. A fix over 2 minutes old can't switch or settle the train but keeps the remembered one, at low
  confidence.
- Without phone speed, frequent fixes add up: 300 m+ at 15+ km/h away from home; 500 m+ at 40+ km/h by the track
  near home. A train you picked counts as moving, even stopped at a station. One fix too rough to place you (worse
  than 500 m) changes nothing.
- The train is remembered by National Rail service ID when known (a pick carries it), preferring your station when
  the same service is on two boards; if the ID isn't on the board, by operator, time and station.
- Arrival comes from Service Details' expected time at your stop; "timetable" is the scheduled time; the card shows
  the last reported stop. Service Details about once a minute.
- On the train home, the list doesn't talk about the onward tube.
- Every train on the on-train card (the lozenge, "or the …", the pick buttons) and on the nearly-home card is named
  with its destination, as the train's own screens say: "18:57 Great Northern to Cambridge". From National Rail's
  board (a dividing train names both parts: "Cambridge & Kings Lynn"); from TfL's summary ("Great Northern to
  Cambridge") only when it isn't the station you get off at, since TfL may name that instead (unverified). No
  destination known: named as before. Tubes likewise: "the 07:56 Met to Aldgate", "the Circle to Edgware Road that
  left Aldgate at 16:46" (the destination is kept with your pick and ride).

- Distinct known National Rail service IDs remain separate candidates even when their times are within one minute; time/operator deduplication is only a fallback when IDs are unavailable.

## Tests
- tests/core/situation.test.mjs: "whichTrain: keep a confirmed train but warn on fresh contradictory evidence; stale fixes cannot create a conflict"
- tests/simulator-integration.test.mjs: "simulator app: a confirmed train conflicting with reported position is retained with an explicit warning"
- tests/core/situation.test.mjs: "whichTrain: distinct service IDs stay separate even a minute apart"
- tests/core/situation.test.mjs: "whichTrain: departed trains only, the nearest fit, sure when the runner-up is 4+ min worse, then remembered"
- tests/core/situation.test.mjs: "whichTrain: a reported position beats the timetable, and more than 6 min from you rules a train out"
- tests/core/situation.test.mjs: "trackLine: on a train only when moving along the line; near home only by the track at train speed; stays on while stopped"
- tests/core/situation.test.mjs: "trackLine near home: just past Letchworth towards Hitchin, only by the track at train speed"
- tests/core/situation.test.mjs: "onLine: between home and London, close to the line, never at home or a London station"
- tests/core/situation.test.mjs: "The remembered train: by National Rail service ID when known, else operator, time and station; confidence"
- tests/core/calls.test.mjs: "Service Details: last stop reported (actual time, delay), next stop, expected time at your stop"
- tests/core/calls.test.mjs: "reportedFrac: a train between its last reported stop and the next is placed in proportion to time; not departed = at its origin"
- tests/rules.test.mjs: "On the train: 'sure' only if the next train is 4+ min further off; nothing within 10 min means no match"
- tests/rules.test.mjs: "On the train: a train that hasn't left is never yours, even if it fits best by timetable"
- tests/rules.test.mjs: "On the train: once sure it stays with your train, but lets go when you're more than 12 min from it"
- tests/rules.test.mjs: "On the train card: arrival from Service Details; 'timetable' is the scheduled time"
- tests/rules.test.mjs: "This morning: at Letchworth station, then on the 07:08 passing Hitchin — on the train, not 'leave now'"
- tests/logic.test.mjs: "On the train: works out which train from your position and projects arrival"
- tests/logic.test.mjs: "On the train: when unsure it asks which train you're on; your pick is kept until you're off the line"
- tests/logic.test.mjs: "On the train: where National Rail reported each train settles which one you're on"
- tests/logic.test.mjs: "On the train: a train reported more than 6 min from you is ruled out; if nothing fits, you can still pick"
- tests/logic.test.mjs: "On the train home: a train that hasn't left can't be yours; once sure, it stays with your train when it falls behind (stop at Finsbury Park)"
- tests/logic.test.mjs: "On the train home, the list doesn't talk about the onward tube"
- tests/golden.test.mjs: "golden: on the train near Knebworth (the 07:08 is reported passing; the 07:20 hasn't left)"
- tests/golden.test.mjs: "golden: on the train, no train fits where National Rail reports them: asks which train"
- tests/core/situation.test.mjs: "trackLine without phone speed: frequent fixes accumulate; a picked train counts; one rough fix changes nothing"
- tests/core/situation.test.mjs: "trackLine near home without phone speed: 500 m+ at 40+ km/h by the track"
- tests/core/situation.test.mjs: "whichTrain: a stale fix keeps the remembered train even when it no longer fits; an office arrival from yesterday is forgotten"
- tests/core/situation.test.mjs: "Remembered train: falls back to the fields when the ID isn't on the board; same ID at two stations prefers yours; stale lock is low confidence; departed is judged at fix time"
- tests/core/situation.test.mjs: "Rough fixes and office days: a rough fix while standing doesn't put you on a train; an arrival from yesterday evening is forgotten"
- tests/rules.test.mjs: "Review: a picked train keeps its National Rail service ID"
- tests/core/calls.test.mjs: "Destination: from Darwin (a dividing train names both parts) and TfL's summary; a train is named with it"
- tests/logic.test.mjs: "On the train: each train is named with where it's going, as its own screens say, to tell close trains apart"
- tests/rules.test.mjs: "Review 2: the page uses the phone's own fix time; a picked train counts as moving; riding doesn't move your station; a ride clears the pick"

## Not yet / open questions
- #23: passing points (Darwin real-time) for non-stop runs; needs a server.
- #10/#11: fully automatic boarding detection and arrival platform, mainly for the native app.
