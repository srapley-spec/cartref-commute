# The iPhone app: download it and it works
Status: Proposed (17 Nov 2026); assessment and the building agent's brief in [../ios-app.md](../ios-app.md); the web app is made ready here (no setup); the app itself is built by another agent (Sam, 17 Nov) · Depends on: [keys-in-the-proxy](keys-in-the-proxy.md)

## Story
As Sam, and as family or friends he shares it with, I want to install Commute from a TestFlight link and have it
working straight away, with no keys, addresses or settings to enter, so that rolling it out to a new phone is one tap.

## Where it came from
17 Nov 2026, Sam, after moving the keys to the proxy: "I want to convert the app into a deployable iOS app and be really
easy to setup — just download. So we need to check that the web app supports that." For him and family/friends; he
has an Apple Developer Program membership and a Mac with Xcode.

## Acceptance criteria (proposed; not agreed)
- A new phone needs nothing but the install: live National Rail, TfL and Google data come from the app's own proxy.
- One location prompt, on first use.
- The app shows the same journey, rules and live data as the web app; updates arrive without reinstalling (if the
  live-site shell is chosen).
- Without a connection at start, the app says so instead of a blank screen.
- Alerts: decided separately (Web Push doesn't run inside an app; native push needs an APNs key in the proxy).

## Tests
None yet: nothing is built.

## Status
Assessment only. Decisions for Sam: live site or bundled; alerts now or later; external or internal testers
([../ios-app.md](../ios-app.md), "Decisions for Sam").
