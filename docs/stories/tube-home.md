# Tube home decides the train
Status: Done, still bespoke (plan step 2b-iv) · Since: 28 Oct 2026 (evening trip)

## Story
As a commuter leaving the office, I want the next tubes from Aldgate and, once underground, where to get off for
the earliest home time, so that the tube I catch decides the train rather than the other way round.

## Where it came from
28 Oct evening: the plan assumed a tube; which tube Sam caught changed which train home was best.

## Acceptance criteria
- Near the office: the next westbound tubes from Aldgate you can make, each with its train home and when to leave.
- Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means
  not on one; a second tube within 3 min is "or".
- Underground after Aldgate: which tube you're probably on and where to get off (Farringdon or King's Cross) for
  the earliest home time; ties go to the earlier stop.
- Arrival at each London station and the time needed there are worked out at your pace.

## Tests
- tests/rules.test.mjs: "Tube going home: at Aldgate the next tube is noted; underground the card says which tube and where to get off"
- tests/rules.test.mjs: "Tube going home: Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means not on one; a second tube within 3 min is 'or'"
- tests/core/situation.test.mjs: "onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate"
- tests/core/refresh.test.mjs: "tubeHomeConnections: arrival at each London station and the time needed there, at your pace"

## Not yet / open questions
- 2b-iv: move this onto the generic [connection model](connections.md); it's still bespoke code.
