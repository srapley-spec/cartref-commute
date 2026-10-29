# Warnings graded by impact
Status: Done · Since: 28 Oct 2026 (evening trip) · Issues: #20

## Story
As a commuter, I want warnings ranked by what they do to my own trains, so that real problems stand out and
irrelevant notices don't drown them.

## Where it came from
28 Oct evening: National Rail notices about elsewhere on the network looked as alarming as delays to Sam's train.

## Acceptance criteria
- **Red:** a cancellation, no estimate, or 15+ min late on your trains.
- **Amber:** 5–14 min late.
- **Yellow:** a notice about your route (or your operator's status) with no impact yet.
- **Grey:** elsewhere on the network, and station facility notices (toilets, lifts, escalators), folded; a
  facility notice that also mentions train disruption is graded normally.
- "Your line is disrupted" needs 2 affected trains; trains that left over 5 min ago don't count.
- Banners say they're about trains now when the plan on screen is later.
- Notice titles: first sentence, at most 90 characters, cut at a word. Links tappable; an opened notice stays open
  across refreshes. Notice HTML is reduced to text without running anything.
- Live cards state every line's status on the journey, including good service.

## Tests
- tests/core/warnings.test.mjs: "railWarnings: red for a cancellation, no estimate or 15+ min; amber 5–14; none otherwise"
- tests/core/warnings.test.mjs: "railWarnings: notices split into your route, elsewhere, and station facilities"
- tests/core/warnings.test.mjs: "noticeTitle: first sentence, at most 90 characters, cut at a word"
- tests/core/warnings.test.mjs: "Line status: worst, ok, level, the H&C fallback, and tube flags"
- tests/logic.test.mjs: "Notices graded by your trains: yellow = on your route, no impact yet; amber = delays under 15 min; red = 15+ min, cancelled; grey = elsewhere"
- tests/logic.test.mjs: "Disruption banners say they're about trains now when the plan on screen is later"
- tests/logic.test.mjs: "Third-party notice HTML is reduced to text without running anything"
- tests/rules.test.mjs: "'Your line is disrupted' needs 2 affected trains; trains that left over 5 min ago don't count"
- tests/app.test.mjs: "Live cards say the status of every line on the journey, including good service"

## Not yet / open questions
- #20: grade from structured incidents instead of wording.
- Facility notices (lifts) matter for the [family day out](family-day-out.md); grey only for the commute.
