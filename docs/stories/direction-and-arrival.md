# Direction and arriving
Status: Done · Since: 27 Oct 2026; office arrival 29 Oct

## Story
As a commuter, I want the app to know whether I'm going to work or home from where I am and what I've done today,
not the time of day, so that it plans the right journey without me telling it.

## Where it came from
27 Oct: no time-of-day guessing. 28 Oct evening: near Letchworth after heading home must mean arriving ("Nearly
home"), not setting off. 29 Oct morning: reaching the office should say "you've arrived", and the journey
shouldn't turn round the moment GPS puts you near it.

## Acceptance criteria
- With no trip, the nearest end decides; a trip keeps its direction for 3 hours.
- Near Letchworth you're heading to work, unless you've been heading home in the last 3 hours (then "Nearly home");
  the next morning it's work again.
- Once you've been at the office today, anywhere else counts as heading home; King's Cross after the office means
  heading home.
- Within 150 m of the office: "you've arrived"; still the morning journey until you've been there 5 minutes, then
  it turns round and reloads trains.
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
