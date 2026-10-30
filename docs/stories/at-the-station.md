# At the station: departure board
Status: Done · Since: 28 Oct 2026 (evening trip)

## Story
As a commuter standing in the station, I want to know when each train leaves, so that I can choose by departure
time rather than by a "leave by" time that no longer means anything.

## Where it came from
28 Oct evening at King's Cross: "leave by" was meaningless once Sam was there. The question at a station is "when
does it leave?". GPS can't tell the concourse from the platform, so the walk to the platform is a guess.

## Acceptance criteria
- At a London station going home (within 400 m, fix good to 250 m), or at Letchworth going to work, Leave now is a
  departure board: the big time is the departure, the countdown is to the departure, "walk to the platform by" is
  small print.
- A train from that station stays catchable until a minute before it leaves; trains from another station (e.g. St
  Pancras when at King's Cross) keep the walk.
- Plans start from the station, never from the office.
- A train you'd have to set off for within 30 s is graded by effort (fast walk, run, car needed, can't make it), a
  label, not removal ([effort-levels](effort-levels.md)). At the station it leaves from, under a minute to go is
  "Can't make it".
- The last London station you were seen at survives reopening the app.

## Tests
- tests/rules.test.mjs: "At a London station: within 400 m, and only with a fix good to 250 m"
- tests/core/situation.test.mjs: "hubHere: within 400 m of a London station with a fix good to 250 m"
- tests/logic.test.mjs: "At King's Cross: a train from King's Cross stays on the card until a minute before it leaves; St Pancras trains keep the walk"
- tests/rules.test.mjs: "At Letchworth station going to work, Leave now is a departure board too"
- tests/app.test.mjs: "Evening at King's Cross: trains home planned from the station, no walk from the office"
- tests/rules.test.mjs: "liveAdjust: departed trains drop out; a train you'd have to set off within 30 s for can't be made"
- tests/app.test.mjs: "The last London station you were seen at survives reopening the app"
- tests/golden.test.mjs: "golden: at King's Cross in the evening, live"
