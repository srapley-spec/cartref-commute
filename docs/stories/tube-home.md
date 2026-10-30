# Tube home decides the train
Status: Done · Since: 28 Oct 2026 (evening trip); on the generic connection model 29 Oct afternoon (plan 2b-iv);
picks only, never worked out, 30 Oct afternoon

## Story
As a commuter leaving the office, I want the next tubes from Aldgate and, once underground, where to get off for
the earliest home time, so that the tube I catch decides the train rather than the other way round.

## Where it came from
28 Oct evening: the plan assumed a tube; which tube Sam caught changed which train home was best.
29 Oct afternoon: moved from bespoke code onto the generic [connection model](connections.md) (Sam: "generic
engine, bespoke data"), so going home gets the same pick / ride / "did you get it?" behaviour as the morning. The
golden recordings were unchanged apart from the new pick buttons.
30 Oct 15:37, at his desk: the app showed "On the tube · worked out from when you left Aldgate · Probably the Circle
that left Aldgate at 15:29" and asked "Still at Aldgate?". Cause: since that morning, sitting at the desk counts as
heading home; the desk is 313 m from Aldgate and indoor GPS drifts 200 m+ with a claimed ±15–50 m, so the phone read
him as at Aldgate; a tube left; a phone lying still gets no location update for 90 s, which the app took as being
underground. Position can't tell the desk from the station, and a quiet phone can't tell a desk from a tunnel. Sam
chose: the tube home is only ever one you picked; the app never works it out.

## Acceptance criteria
- Near the office: the next westbound tubes from Aldgate you can make, each with where to get off, its train home,
  home time and when to leave. At Aldgate, tubes you might just make are offered "if you're near the platform".
- Where to get off: Farringdon or King's Cross, whichever gets you home soonest with the trains loaded; ties go to
  the earlier stop. Arrival at each London station and the time needed there are worked out at your pace.
- Aldgate is noted only within 150 m (the tubes due then, for "On a different tube?"). Being noted there is never
  evidence that you're on a tube.
- **You're on a tube home only if you picked it.** Never worked out: not from a fix at Aldgate, not from the phone
  going quiet (no fix for 90 s+) after a tube left, not from a fresh fix away from Aldgate. A worked-out ride saved
  by an older build is ignored.
- "Which one are you getting?" near the office and at Aldgate; your pick follows its vehicle if TfL moves its time.
- Once your picked tube leaves you're on it until within 300 m of the stop the app chose, or 10 minutes after the
  ride time: passing Farringdon on the way to King's Cross doesn't end it. "Got off already? At …" ends it. "On a
  different tube?" switches to one that has left (up to 3 within 6 min of yours, nearest first; 30 Oct).
- Still at Aldgate with a good (≤50 m), fresh fix 3+ minutes after your tube left: "Did you get it?". "No, still
  here" ends the ride; nothing is assumed about the next tube until you pick one.
- A ride home is never treated as a ride to work, or the reverse.

## Tests
- tests/rules.test.mjs: "Tube going home: at Aldgate the tubes due are noted; without a pick, going quiet underground isn't taken as being on one"
- tests/rules.test.mjs: "Tube going home: Aldgate is noted only within 150 m; without a pick you're never on a tube, fresh fix or not"
- tests/rules.test.mjs: "Tube going home, 30 Oct 15:37: at the desk with GPS reading Aldgate, a tube leaving and the phone going quiet is not a ride"
- tests/rules.test.mjs: "Tube going home: a worked-out ride saved by an older build is dropped; a picked one still counts"
- tests/rules.test.mjs: "Going home: tubes from Aldgate get off where you're home soonest; pick one; once it leaves you're on it"
- tests/rules.test.mjs: "Going home: passing Farringdon doesn't end the ride to King's Cross; 'Got off at Farringdon' does"
- tests/rules.test.mjs: "Going home: still at Aldgate with a good fix 4 min after your tube left — asked; No keeps you at Aldgate"
- tests/rules.test.mjs: "Going home: your picked tube follows a delay (by vehicle)"
- tests/rules.test.mjs: "Going home 2: the ride heads for the best stop and ends there or when its time is over; morning and evening rides never mix"
- tests/rules.test.mjs: "Going home 2: 'On a different tube?' switches you to one that has left; after 'No, still here' nothing is assumed until you pick"
- tests/core/connections.test.mjs: "Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept"
- tests/core/situation.test.mjs: "onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate"
- tests/core/situation.test.mjs: "Going home by tube: noted at Aldgate within 150 m with a fix good to 150 m, only going home; never worked out"
- tests/core/refresh.test.mjs: "tubeHomeConnections: arrival at each London station and the time needed there, at your pace"

## Not yet / open questions
- If you don't pick, there's no tube card on the way home, even underground. Working it out again would need evidence
  a desk can't produce (e.g. motion, or fixes along the route); not planned.
- The morning tube from a London station is still worked out (onTube); the office isn't near those stations.
- Aldgate East (H&C) has no live departures in the app going home; the H&C stays a fallback.
