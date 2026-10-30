# Direction and arriving
Status: Done · Since: 27 Oct 2026; office arrival 29 Oct; nearby-for-10-minutes 30 Oct

## Story
As a commuter, I want the app to know whether I'm going to work or home from where I am and what I've done today,
not the time of day, so that it plans the right journey without me telling it.

## Where it came from
27 Oct: no time-of-day guessing. 28 Oct evening: near Letchworth after heading home must mean arriving ("Nearly
home"), not setting off. 29 Oct morning: reaching the office should say "you've arrived", and the journey
shouldn't turn round the moment GPS puts you near it. 30 Oct 10:16: at his desk for 80 minutes, the phone put Sam
217 m (±15 m) from the office point, outside 150 m, so the app still said "Walking to the office · about 3 min walk".

## Acceptance criteria
- With no trip, the nearest end decides; a trip keeps its direction for 3 hours.
- Near Letchworth you're heading to work, unless you've been heading home in the last 3 hours (then "Nearly home");
  the next morning it's work again.
- Once you've been at the office today, anywhere else counts as heading home; King's Cross after the office means
  heading home.
- Within 150 m of the office (Sam, 30 Oct: 150 m with the 5-minute wait is right; he had suggested 20 m): "you've arrived" (200 m is still walking, and isn't "you're at the office"); still
  the morning journey until you've been there 5 minutes, then it turns round and reloads trains. An office arrival
  from another calendar day is forgotten, so the next morning's 5 minutes start again (independent review, 29 Oct).
- Staying within 300 m of the office for 10 minutes also counts as having been there (Sam, 30 Oct), because indoor GPS
  can sit outside 150 m all day. Walking across that circle takes about 7 minutes, so passing by doesn't count;
  leaving 300 m, or a time from another day, starts the 10 minutes again. It only turns the journey round: "you've
  arrived" still needs 150 m. Known trade-off: 10+ minutes in a café within 300 m before work also turns it round
  (use "To office"). Saved as `officeNearSince`.
- Location denied: the app says so and offers a manual choice, which works.
- Missing GPS accuracy means unknown, not perfect.

## Tests
- tests/core/situation.test.mjs: "inferDirection: setting off, arriving home, after the office, mid-journey, and remembering the trip"
- tests/rules.test.mjs: "Direction: nearest end when there's no trip; a trip keeps its direction for 3 hours"
- tests/rules.test.mjs: "Coming home: near Letchworth stays 'home' (Nearly home) for 3 hours after heading home; next morning it's work again"
- tests/rules.test.mjs: "Arriving at the office: 'you've arrived', and still the morning journey until you've been there 5 minutes"
- tests/app.test.mjs: "Reaching the office switches direction to home and reloads trains"
- tests/app.test.mjs: "After the office, King's Cross means heading home (not back to the office)"
- tests/app.test.mjs: "Near Letchworth: waits for location, then plans to the office"
- tests/app.test.mjs: "In London: plans home"
- tests/app.test.mjs: "Location denied: says so and offers manual choice; manual choice works"
- tests/core/situation.test.mjs: "Missing GPS accuracy means unknown, not perfect"
- tests/rules.test.mjs: "Review: office arrival — 120 m is 'you've arrived', 200 m is still walking"
- tests/rules.test.mjs: "Review 2: 200 m from the office isn't 'you're at the office'"
- tests/core/situation.test.mjs: "inferDirection: staying within 300 m of the office for 10 minutes counts as being there (indoor GPS at the desk read 217 m)"
- tests/rules.test.mjs: "At the desk with GPS reading 217 m: after 10 minutes within 300 m the journey turns round"
- tests/core/situation.test.mjs: "whichTrain: a stale fix keeps the remembered train even when it no longer fits; an office arrival from yesterday is forgotten"
- tests/core/situation.test.mjs: "Rough fixes and office days: a rough fix while standing doesn't put you on a train; an arrival from yesterday evening is forgotten"

## Location accuracy (30 October simulator audit)
- Browser fixes pass their measured accuracy to direction inference. Missing, negative or non-finite accuracy is unknown.
- Office arrival and both dwell timers require the entire reported uncertainty circle inside the existing 150 m / 300 m radius. An uncertain fix breaks an unfinished dwell; precise recovery starts a new dwell.
- A coarse fix retains a recent journey or today's completed office visit. Without reliable memory, nearest-end direction requires non-overlapping distance bounds; otherwise await a usable fix. Near-home decisions use the same uncertainty bounds against the existing 3 km boundary.
- Coordinate-only engine callers may omit accuracy for compatibility; browser callers explicitly provide accuracy or null.
- tests/core/situation.test.mjs: "inferDirection: location uncertainty cannot manufacture office dwell or overwrite a remembered journey"
- tests/core/situation.test.mjs: "atOffice: uncertainty circle must fit inside the arrival radius, on any profile"
