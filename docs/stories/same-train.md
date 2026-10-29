# Same train from several stations
Status: Done · Since: 28 Oct 2026

## Story
As a commuter going home, I want a Thameslink that calls at both Farringdon and St Pancras shown once, with both
boarding points, so that I choose where to board rather than seeing the same train twice.

## Where it came from
27–28 Oct evenings. Merging was first done as a patch after the fact; the 28 Oct review moved it into the engine,
based on the train's stops. Sam's wording: "Board at Farringdon 16:56 platform 4 or St Pancras 17:01 platform B".

## Acceptance criteria
- The same run across stations is one option; different operators never merge.
- Recognised from the train's stops, even when home times differ by more than a minute.
- When a search missed the train at the other station, it's derived from the stops (live times; timetable stops
  without times handled).
- Going to work, getting off at the earlier station is derived the same way.
- The card says both boarding points with platforms; a station you can no longer make says "(too late to reach
  from here)"; a boarding point you can still make is the main one; ties go to the earlier stop.
- St Pancras trains count towards the King's Cross route (same tube station).
- On the train, the same train at two London stations is one candidate.

## Tests
- tests/core/engine.test.mjs: "mergeSameTrain: same run across stations is one option; different operators never merge"
- tests/core/calls.test.mjs: "Same train is recognised from its stops even when the home times differ by more than a minute"
- tests/core/calls.test.mjs: "Same train at the other station is derived from its stops when the search missed it (live times)"
- tests/core/calls.test.mjs: "To work: getting off at the earlier station is derived the same way"
- tests/core/calls.test.mjs: "Same train: a boarding point you can still make is the main one, even if the other gets you there sooner"
- tests/logic.test.mjs: "The same Thameslink from Farringdon and St Pancras is one option with both boarding points"
- tests/logic.test.mjs: "Platform is on the card and the list without expanding; with two boarding stations, each has its own"
- tests/logic.test.mjs: "On the train: the same train at two London stations is one candidate, so the runner-up is a different train"
- tests/core/search.test.mjs: "routeCount counts St Pancras trains towards King's Cross; hubOfKey; dropped journeys explained"
- tests/app.test.mjs: "Timetable: a Thameslink found at one London station is looked for at the other, and merged from real results"
- tests/core/warnings.test.mjs: "missingPairSearches: one search per station a train is missing from, merged within 10 min, at most 6"
