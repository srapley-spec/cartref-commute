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
The initial shell, packaging and release-gate tests are listed in [ios-shell.md](ios-shell.md).

This repo's side of the v1 contract (`../ios-app.md` §6.7): the engine snapshot, the proxy's iPhone routes and APNs,
the page bridge and the page in the app (with a fake `CommuteNative`), and the binding fixtures in
`tests/fixtures/native/` (re-record with `UPDATE_GOLDEN=1` and read the diff):
- tests/core/snapshot.test.mjs: "Countdown words: one set, shared by the card and the native surfaces"
- tests/core/snapshot.test.mjs: "Snapshot: version, stale after 3 minutes, no data is stale, deep link from the followed journey"
- tests/core/snapshot.test.mjs: "Platform label: names the platform once it's announced, the station always"
- tests/core/snapshot.test.mjs: "Leave alarm: lead before leave time (5 min default), cancelled once set off, gone 2 min after a missed leave time"
- tests/core/snapshot.test.mjs: "Proxy snapshot before you leave: Leave by, the alarm, the train and the door arrival"
- tests/core/snapshot.test.mjs: "Proxy snapshot, train 7 min late: Leave by and the alarm move with it; the platform time keeps the timetable"
- tests/core/snapshot.test.mjs: "Proxy snapshot: no live estimate keeps the last one seen; none at all is the plan, said so"
- tests/core/snapshot.test.mjs: "Proxy snapshot: on the train it counts to the alighting station, then to the door; cancelled ends it with no alarm"
- tests/core/snapshot.test.mjs: "Evidence: leaving the start's geofence is set off; losing Wi-Fi, other fences and old or future events aren't"
- tests/core/snapshot.test.mjs: "Evidence: a known Wi-Fi network or entering a fence is a fix at that place; leaving one is no fix"
- tests/core/snapshot.test.mjs: "Snapshot shifted in time keeps every instant in step; what's shown ignores the build time alone"
- tests/core/snapshot.test.mjs: "Snapshot: only the page confirms boarding; a change of journey or progress is a change even with the same times"
- tests/native-proxy.test.mjs: "iPhone routes: off until APNs is configured; origin-checked; registration gives an id and a token stored only as a hash"
- tests/native-proxy.test.mjs: "iPhone routes: follow needs the token; plans are checked like the web's; extras field by field; none clears it"
- tests/native-proxy.test.mjs: "APNs provider token: ES256, the key id and team, reused for 50 minutes then renewed"
- tests/native-proxy.test.mjs: "Scheduler: the snapshot goes to the Live Activity and the app when it changes, and only then"
- tests/native-proxy.test.mjs: "Scheduler: with the leave alarm on, the web's 'Leave in 5 min' alert isn't sent as well; with it off, it is"
- tests/native-proxy.test.mjs: "Scheduler: leaving the office's geofence is set off: the alarm is cancelled and the card moves to the platform"
- tests/native-proxy.test.mjs: "Scheduler: on the train, then the walk home, then the Live Activity ends and the journey is dropped"
- tests/native-proxy.test.mjs: "Scheduler: a cancellation is said once, ends the Live Activity and the journey"
- tests/native-proxy.test.mjs: "Scheduler: a token Apple says is gone is dropped (the iPhone, or just its Live Activity); one failure doesn't stop the rest"
- tests/native-bridge.test.mjs: "Bridge in a browser: no shell, nothing happens and nothing is sent"
- tests/native-bridge.test.mjs: "Bridge: the shell gets the Settings (alarm, Wi-Fi name prefixes; defaults Panda and Ciklum)"
- tests/native-bridge.test.mjs: "Bridge: the snapshot is published when what it shows changes, not on every render; never in a simulation"
- tests/native-bridge.test.mjs: "Bridge: with an APNs token the iPhone registers with the proxy, then the followed journey goes once per change"
- tests/native-bridge.test.mjs: "Bridge: Wi-Fi and geofence events reach the page as evidence (never in a simulation); cached entries are handed over"
- tests/native-page.test.mjs: "In the iPhone app: the followed card's snapshot goes to the shell, Leave by then the platform, the alarm cancelled once set off"
- tests/native-page.test.mjs: "In the iPhone app: office Wi-Fi is a position at the office; settings saved go to the shell"
- tests/native-page.test.mjs: "In a browser: no iPhone settings, none saved, nothing published"
- tests/native-page.test.mjs: "In the iPhone app, Trip too (Sam, 18 Nov): the followed Trip's snapshot and its plan for the proxy"
- tests/native-page.test.mjs: "Siri's deep link: commute://next shows that direction now; with follow=1 it follows the best train; anything else is ignored"
- tests/native-fixtures.test.mjs: "Native fixtures: a snapshot for every phase, as the iPhone app receives them"
- tests/native-fixtures.test.mjs: "Native fixtures: the APNs payloads (Live Activity update and end, background, alert)"
- tests/native-fixtures.test.mjs: "Trip's plan for the proxy: its first train, leave time, platform allowance and start station"


## Status
See ../ios-app.md §8.
