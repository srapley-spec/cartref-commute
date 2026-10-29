# Tube home decides the train
Status: Done · Since: 28 Oct 2026 (evening trip); on the generic connection model 29 Oct afternoon (plan 2b-iv)

## Story
As a commuter leaving the office, I want the next tubes from Aldgate and, once underground, where to get off for
the earliest home time, so that the tube I catch decides the train rather than the other way round.

## Where it came from
28 Oct evening: the plan assumed a tube; which tube Sam caught changed which train home was best.
29 Oct afternoon: moved from bespoke code onto the generic [connection model](connections.md) (Sam: "generic
engine, bespoke data"), so going home gets the same pick / ride / "did you get it?" behaviour as the morning. The
golden recordings were unchanged apart from the new pick buttons.

## Acceptance criteria
- Near the office: the next westbound tubes from Aldgate you can make, each with where to get off, its train home,
  home time and when to leave. At Aldgate, tubes you might just make are offered "if you're near the platform".
- Where to get off: Farringdon or King's Cross, whichever gets you home soonest with the trains loaded; ties go to
  the earlier stop. Arrival at each London station and the time needed there are worked out at your pace.
- Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means
  not on one; a second tube within 3 min is "or".
- "Which one are you getting?" at Aldgate; your pick follows its vehicle if TfL moves its time.
- Once your tube leaves (picked, or worked out) you're on it until within 300 m of the stop the app chose, or 10
  minutes after the ride time: passing Farringdon on the way to King's Cross doesn't end it. "Got off already? At
  …" ends it. "On a different tube?" switches to one that has left.
- Still at Aldgate with a good (≤50 m), fresh fix 3+ minutes after your tube left: "Did you get it?". "No, still
  here" looks for the next tube, not the one you missed.
- A ride home is never treated as a ride to work, or the reverse.

## Tests
- tests/rules.test.mjs: "Tube going home: at Aldgate the next tube is noted; underground the card says which tube and where to get off"
- tests/rules.test.mjs: "Tube going home: Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means not on one; a second tube within 3 min is 'or'"
- tests/rules.test.mjs: "Going home: tubes from Aldgate get off where you're home soonest; pick one; once it leaves you're on it"
- tests/rules.test.mjs: "Going home: passing Farringdon doesn't end the ride to King's Cross; 'Got off at Farringdon' does"
- tests/rules.test.mjs: "Going home: still at Aldgate with a good fix 4 min after your tube left — asked; No keeps you at Aldgate"
- tests/rules.test.mjs: "Going home: your picked tube follows a delay (by vehicle)"
- tests/rules.test.mjs: "Going home 2: the ride heads for the best stop and ends there or when its time is over; morning and evening rides never mix"
- tests/rules.test.mjs: "Going home 2: 'On a different tube?' switches you to one that has left; after 'No, still here' the app looks for the next one"
- tests/core/connections.test.mjs: "Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept"
- tests/core/situation.test.mjs: "onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate"
- tests/core/refresh.test.mjs: "tubeHomeConnections: arrival at each London station and the time needed there, at your pace"

## Not yet / open questions
- Aldgate East (H&C) has no live departures in the app going home; the H&C stays a fallback.
