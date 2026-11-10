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
- **The walk left is set against your measured walk (10 Nov 2026, #57 H27, F1, F2).** Homeward on 10 Nov the walk
  left stayed at 19 minutes for the first three minutes after stepping off, so the home time slid 17:01 → 17:04;
  the plan's own 19 minutes door to door was exactly right. The straight-line figure from where you are is now
  scaled by (your measured walk from the station ÷ the straight-line figure from the station), kept between ×0.5
  and ×2, so it agrees with the plan as you step out; and within 150 m of the station what is left of the exit
  allowance (Settings) is added, tapering to nothing at 150 m (`walkFromStopSecs`, `STOP_EXIT_KM`). The walk to the
  office after the tube is worked out the same way from the nearer office tube stop (Aldgate or Aldgate East), its
  measured walk and platform allowance. Without a measured walk it is the straight line as before.
  Limits: right at a stop the whole exit allowance is added, because position can't say whether you are still on
  the platform or already outside (at Aldgate East the walk to the office reads 6 min, not 4, until you've moved
  about 150 m; golden `office-walking.json`). This is arithmetic from the day's figures, not a replay of the recorded positions; a late or coarse fix
  still makes the first minute or two read high (confidence that it removes most of the 3-minute slide: medium).
- Works from the train, walking, at the station, and says when it doesn't know.

## Tests
- tests/core/refresh.test.mjs: "nearlyHomeEta: from the train, at home, walking, at the station, unknown"
- tests/rules.test.mjs: "Nearly home on your train: home time = the train's expected Letchworth time + exit + walk"
- tests/rules.test.mjs: "Home location: set from where you are; Nearly home counts the walk from there, and says when you're home"
- tests/rules.test.mjs: "Nearly home: the walk counts streets (straight line × 1.3)"
- tests/core/refresh.test.mjs: "nearlyHomeEta: from the train, at home, walking, at the station, unknown"
