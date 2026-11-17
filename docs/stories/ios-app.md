# The iPhone app: download it and it works
Status: Agreed (17 Nov 2026); brief and design in [../ios-app.md](../ios-app.md). This repo's agent builds the engine, page and proxy parts; an iOS agent builds the app and does all Apple work (Sam, 17 Nov) · Depends on: [keys-in-the-proxy](keys-in-the-proxy.md)

## Story
As Sam, and as family or friends he shares it with, I want to install Commute from a TestFlight link and have it
working straight away, with no keys, addresses or settings to enter, so that rolling it out to a new phone is one tap.

## Where it came from
17 Nov 2026, Sam, after moving the keys to the proxy: "I want to convert the app into a deployable iOS app and be really
easy to setup — just download. So we need to check that the web app supports that." For him and family/friends; he
has an Apple Developer Program membership and a Mac with Xcode.

## Acceptance criteria (agreed with Sam, 17 Nov; detail and owners in ../ios-app.md)
- Installed from TestFlight (internal testers on Sam's team), iOS 27 minimum. Nothing to set up: live data comes through
  the app's proxy.
- A bundled copy of the same `index.html` as the website. It opens with no signal and shows the last data with its age.
  Every change to `main` becomes a TestFlight build automatically.
- One Live Activity for a followed journey, from the leave countdown to arrival. Its times and words are the page's
  journey card's, from the engine's snapshot. Updated by the page when open, and by the proxy (APNs) when closed.
- A leave alarm, 5 minutes before leave time by default (changeable). It cancels itself when you've left (a geofence),
  stop following or switch trains, and moves when the leave time moves.
- Siri: "When do I need to leave?", "Follow the next train home".
- Wi-Fi as a location cue: home = networks starting "Panda", office = "Ciklum", both configurable.
- No journey logic in Swift; the web app stays complete without the app.
- Widget: parked.

## Tests
None yet: nothing is built.

## Status
See ../ios-app.md §8.
