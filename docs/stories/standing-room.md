# Standing room only
Status: Done · Since: 27 Oct 2026 · Issues: #21

## Story
As a commuter who wants a seat, I want trains that are usually full flagged, so that I can choose a different one.

## Acceptance criteria
- Fast Great Northern trains (Cambridge/Ely/King's Lynn) into King's Cross arriving 08:00–08:30, Tue–Thu, term
  time only, are flagged "Usually standing room only".
- The rule is profile data (Sam's profile), not engine code.

## Tests
- tests/logic.test.mjs: "Standing-room warning: fast GN into King's Cross 08:00–08:30, Tue–Thu, term time only"
- tests/core/engine.test.mjs: "Standing-room rule is the profile's, for any corridor"

## Not yet / open questions
- #21: replace the hand-made rule with real loading and formation data if the feeds provide it.
