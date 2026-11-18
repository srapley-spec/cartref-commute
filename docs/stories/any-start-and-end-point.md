# Any start and end point
Status: Done: permanent since 18 Nov (Sam, #63; it was behind Settings → Experimental → "Any start and end point", off by default; Sam confirmed 30 Oct: a major,
experimental change, so it stays toggled) · Since: 29 Oct 2026 · Issues: #25

## Story
As someone going into London for something other than work, I want to type where I'm going (or where I am) and get
the train plus the London leg, so that I can use the app for any trip on the corridor.

## Acceptance criteria
- Permanent (18 Nov, #63): "Where to?" is always offered in Leisure going out; with nothing typed, the plan is as before
  (King's Cross or St Pancras). Going home, "Where from?" is always offered.
- Toggle on, going out: "Where to?" plans the train to King's Cross, St Pancras or Farringdon and TfL's leg from each
  station to the place; the card names the place. No leg yet means not planned.
- A typed place is matched to TfL's best guess.
- Going home, "Where from?" is always offered. Leisure home uses the quickest TfL journey to each station; one
  station failing still plans the other; both failing says why; no trains are offered until the London leg is
  planned.
- Leisure walks at leisure pace.

## Tests
- tests/anyplace.test.mjs: "Permanent (#63): Leisure going out with no place typed plans as before (King's Cross or St Pancras), with 'Where to?' offered"
- tests/anyplace.test.mjs: "Toggle on: going out to a London place — train, then TfL's leg from the station; the place is on the card"
- tests/anyplace.test.mjs: "Toggle on: 'Where to?' plans the new place; going home, 'Where from?' is always offered"
- tests/core/plan.test.mjs: "Any start and end point: going out to a place, the leg from each station; no leg yet = not planned"
- tests/core/plan.test.mjs: "tflPickPlaces: TfL's best match for each end that needs one"
- tests/rules.test.mjs: "Leisure home: the quickest TfL journey to each station is used; one station failing still plans the other; both failing says why"
- tests/rules.test.mjs: "Leisure home: no trains are offered until the London leg is planned"
- tests/logic.test.mjs: "Leisure to London ends at the station and uses leisure pace"
- tests/golden.test.mjs: "golden: leisure, home from Soho via the TfL journey planner"

## Not yet / open questions
- Routes as profile data rather than code (2b-iii).
- A place that isn't home or the office at both ends.
- #25: searchable picker instead of TfL's first guess.
