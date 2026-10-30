# Nearly home
Status: Done · Since: 28 Oct 2026 (evening trip)

## Story
As a commuter coming home, I want my home time from my train and then from where I am, so that I can tell people
when I'll be in.

## Acceptance criteria
- On your train, the lozenge carries the train's status for its expected Letchworth time (none for a timetable train
  without Service Details). → [train-status](train-status.md)
- On your train: home time = the train's expected Letchworth time + station exit + walk.
- Once your home is set in Settings ("Home is where I am now"), the walk counts from where you are (straight line
  × 1.3 for streets); "You're home" within 100 m.
- Works from the train, walking, at the station, and says when it doesn't know.

## Tests
- tests/core/refresh.test.mjs: "nearlyHomeEta: from the train, at home, walking, at the station, unknown"
- tests/rules.test.mjs: "Nearly home on your train: home time = the train's expected Letchworth time + exit + walk"
- tests/rules.test.mjs: "Home location: set from where you are; Nearly home counts the walk from there, and says when you're home"
- tests/rules.test.mjs: "Nearly home: the walk counts streets (straight line × 1.3)"
