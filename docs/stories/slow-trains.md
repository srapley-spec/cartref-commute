# Slow trains say so
Status: Done · Since: 28 Oct 2026 (evening trip)

## Story
As a commuter about to jump on whatever is leaving, I want a stopping train named with what it costs me, so that I
don't board a slow train when a fast one is a few minutes behind.

## Where it came from
28 Oct evening trip home: a stopping train looked like the obvious choice in "Leaving right now?".

## Acceptance criteria
- In "Leaving right now?", "Next train" and "Still possible if you hurry", a slow train is named with its train
  time and how its arrival compares with the best option, e.g. "stopping train, 54 min; home 20:40, 5 min later
  than the 19:48".
- Stopping thresholds come from the profile (Sam: King's Cross 45 min, St Pancras 45, Farringdon 52).

## Tests
- tests/core/refresh.test.mjs: "compareWithBest: stopping train named, train time, minutes later or sooner"
- tests/logic.test.mjs: "Stopping-train flag thresholds"
- tests/core/engine.test.mjs: "Stopping threshold comes from the profile"
