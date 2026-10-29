# Location prompts
Status: Done, limited by Safari · Since: 28 Oct 2026 · Issues: #2

## Story
As a commuter, I want the phone not to keep asking for location permission, so that the app is usable on the move.

## Where it came from
28–29 Oct: Safari asked again each time the page restarted location. 29 Oct afternoon (independent review): iOS
can hand over cached positions taken before you came back, which looked like "no position since coming back" and
restarted location anyway; fixed and shipped the same day.

## Acceptance criteria
- Coming back to the app doesn't restart location while positions still arrive; it restarts only if no position
  arrives within 5 s. "Arrives" means received after coming back, even if the phone took it earlier.

## Tests
- tests/app.test.mjs: "Coming back to the app doesn't restart location (which can make Safari ask again) when positions still arrive"
- tests/app.test.mjs: "Coming back with a cached position (taken before you came back) doesn't restart location"
- tests/rules.test.mjs: "Review B: coming back with a cached position (taken before you came back) doesn't restart location"

## Not yet / open questions
- Permanent permission and background location need a native app (#2).
