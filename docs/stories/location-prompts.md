# Location prompts
Status: Done, limited by Safari · Since: 28 Oct 2026 · Issues: #2

## Story
As a commuter, I want the phone not to keep asking for location permission, so that the app is usable on the move.

## Where it came from
28–29 Oct: Safari asked again each time the page restarted location.

## Acceptance criteria
- Coming back to the app doesn't restart location while positions still arrive; it restarts only if no position
  arrives within 5 s.

## Tests
- tests/app.test.mjs: "Coming back to the app doesn't restart location (which can make Safari ask again) when positions still arrive"

## Not yet / open questions
- Permanent permission and background location need a native app (#2).
