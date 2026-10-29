# Discovered alternatives
Status: Planned (plan step 2c) · Since: 28 Oct 2026 · Issues: #13

## Story
As a commuter on a late evening or a disrupted day, I want the app to find other ways home (another station, a
change, a taxi from Hitchin or Stevenage), each with what it costs, so that I'm not stuck waiting for a direct train.

## Where it came from
28 Oct discussion (#13). Principle: find options from live data and the journey planner, don't hard-code them.

## Acceptance criteria (agreed so far)
- Alternatives join the same ranked list, never a separate panel; the never-hide rule applies.
- Each shows its consequence, e.g. "change at Stevenage, home 14 min later".
- Sam's order of preference among examples: direct train to Hitchin then taxi (≈5 min to get a taxi + ≈10 min
  drive); Peterborough-line train to Hitchin, change on the same platform; train to Stevenage then taxi (≈5 + ≈20
  min) or change onto a train continuing to Hitchin/Letchworth (connection can be ~1 min).
- Cambridge instead of Cambridge South is the same idea for Laura.
- The known examples are test cases, not hard-coded rules.

## Tests
- None yet (planned).

## Not yet / open questions
- Open questions are in #13.
