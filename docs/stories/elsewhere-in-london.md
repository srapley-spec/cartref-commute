# Elsewhere in London
Status: Done · Since: 28 Oct 2026 · Issues: #15

## Story
As a commuter who's somewhere in London other than the expected station, I want the plan from where I actually am,
so that "leave Cartref by" or "leave the office by" never appears when it can't apply.

## Where it came from
28 Oct: "I could get to King's Cross, miss a train, and knowing when to leave the office by is useless" (#15).

## Acceptance criteria
- Walking from Aldgate to the office: planned from where you are, never from Cartref.
- Elsewhere in London on the way to work: one TfL plan from where you are, reused for 2 min unless you move 300 m.

## Tests
- tests/app.test.mjs: "Walking from Aldgate to the office: plans from where you are, never from Cartref"
- tests/app.test.mjs: "Elsewhere in London on the way to work: one TfL plan from where you are"
- tests/rules.test.mjs: "Elsewhere in London: the TfL plan to the office is reused for 2 min unless you move 300 m"
- tests/golden.test.mjs: "golden: elsewhere in London on the way to work"
- tests/golden.test.mjs: "golden: walking from Aldgate East to the office"
