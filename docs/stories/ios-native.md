# Native iPhone journey surfaces
Status: Implemented; real-phone acceptance pending · Since: 18 Nov 2026 · Issue: #58 · Release: PR #61

## Story and contract
Sam and family need the followed journey available when the app is closed, and a leave alarm that cancels on
departure. The engine remains the sole owner of journey facts, decisions and wording. Native code transports,
persists and presents its versioned snapshot; it never plans a journey or infers a train.

Sam authorized implementation against `docs/ios-app.md` §6.7 at `385f56b`. The owner subsequently published the
implementation and initial fixtures at `9628132`, now released on main and integrated into this branch.
Decisions A/B/C include Trip, Siri's snapshot-or-open-app behavior, and Always authorization requested in Settings
for home/office region monitoring. Internal TestFlight only; no Apple review submission.

## Acceptance criteria
- `CommuteNative` implements the named v1 Promise methods and event payloads. Unknown versions reject with
  `unsupported`. Cached board/status/settings values are opaque JSON; dates and nulls retain their meaning.
- The page establishes or changes the followed journey. Remote snapshots may update only that journey, with
  `at` at least as recent as the last applied; equal timestamps use receipt order. Stop/switch/end retain a one-hour
  tombstone. An old stop must never cancel a newer journey.
- Only the engine's `alarm.cancelOnExit` authorizes local cancellation. A matching region exit strictly after the
  snapshot cancels locally before any network request. The cancellation survives restart and later pushes for that
  follow ID. No alarm is scheduled in the past or without the required authorization.
- Store native state and opaque cache entries atomically in the App Group, protected until first unlock. Cache
  entries replace by key, allow only snapshot/boards/status/settings, and total at most 512 KiB. Reject an invalid
  or oversized batch without partially replacing saved data. A corrupt file is not silently erased.
  Unknown `dataAt` is accepted and returned as explicit null rather than replaced with `savedAt`; known dates
  still require a finite nonnegative value. A null-value entry explicitly replaces an obsolete payload, while
  omitting a key retains it. Page packing must count the native JSON encoding and explicitly replace obsolete keys.
- Proxy device credentials live in the app's Keychain, accessible after first unlock on this device. They never
  enter App Group JSON, errors, bridge logging, test fixtures or build artifacts. Proxy requests use HTTPS and do
  not follow redirects. Changing proxy/device/follow scopes discards obsolete queued evidence.
- Before `ready`, retain the latest APNs token, latest activity token per follow ID, and last 20 Wi-Fi/region
  events. Preserve initial deep links until the page is listening. Navigation resets readiness.
- Geofences come only from `configure`: home/office at 150 m, only while the alarm is enabled and Always access is
  granted. No continuous background location. Wi-Fi emits only the configured-prefix classification and time;
  the SSID is neither stored nor emitted. Ambiguous overlapping prefixes classify as other.
- Supported capabilities are separate from permission state. Only Settings `request` calls may prompt. Permission
  denial and deferred Always authorization must not leave bridge calls hanging or initiate a prompt loop.

## Siri and journey views
Siri reads the last engine headline and clock with source age and staleness. Without a followed journey, or for
“Follow the next train home”, it brings the app forward and queues
`commute://next?direction=home&follow=1` through the existing `open {url}` bridge event. An already-foreground
invocation routes directly; a background invocation transitions only when Apple permits it, otherwise it asks the
person to open Commute on their iPhone. No planning event precedes that transition. App Intents foreground modes
are required because `OpenURLIntent` accepts universal links, not this custom scheme.

The WidgetKit extension contains only the journey Live Activity; the parked home-screen widget is not included.
The Signal layout retains the engine headline/clock, arrival, train/platform, status, progress and source age.
Apple's [160-point height limit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
prompted a compact layout: the initial platform fixture measured 176 points; the revised one measured 125 points
at 370-point width before a final two-point padding reduction. A long-label probe at 320-point width measures
158 points and preserves the full leading “Be on … by” label. These are macOS SwiftUI renders of the production
view with only the WidgetKit background modifier substituted, not iPhone/WidgetKit acceptance results.

## Integration gates
The Apple surface adapter is now attached at production startup, so Live Activity and alarm support are exposed
separately from permission state. Starting the runtime does not request permission. Siri, geofences, Wi-Fi, bridge
and storage are implemented. Release still waits for the shared-page dependencies and the checks below.
The owner answered all three contract questions on
[issue #58](https://github.com/srapley-spec/cartref-commute/issues/58#issuecomment-6976812854):
- `ea7b056` on main adds `auth.alarm` and explicit `request({permission:"alarm"})`. Native code reports AlarmKit's
  own authorization without prompting, requests it only when explicitly asked while not determined, and releases
  the request gate after an OS error. Grant/denial does not cause repeated prompts. The first compile found a
  main-actor initializer used as a nonisolated default argument; creating the default adapter inside the runtime
  initializer fixed it, and the app/extension/test target now build.
- The same commit identifies remote stops with `followId` and `at`. APNs and evidence replies use one decoder and
  the same ordering/tombstone rules. A current, non-older stop cancels the alarm before persistence or platform
  suspension, clears its activity token/identity and queued evidence, then updates the surface. Unidentified or
  never-followed nulls have no effect; malformed identified stops reject. Evidence replies additionally retain
  origin, registration credential and journey checks so an obsolete request cannot stop a current journey.
- The released owner countdown contract supplies `state`, `urgentAt` and `passedAt`, plus
  page-phase and Trip fixtures. Native decoding/rendering now uses the supplied state and exact words, including
  passed/empty wording; it never derives urgency from a clock. Older cached v1 snapshots still decode. All 18
  snapshot fixtures (including a null stopped page and nullable Trip direction) pass the binding tests from the
  committed fixture directory. Closed-app wording changes require actual
  ActivityKit updates; Apple's timer continues and clamps at zero offline, while the wording retains its last
  received state. The owner accepted this v1 limit in #58 comment 6977690109; state-change publishing is released.

The released owner changes through `88c0a67` are integrated: Settings requests and reports permissions, countdown
state changes publish, expanded fixtures are committed, delayed leave steps retain the right action and tube
location comes from the accepted prediction. Cache batches retain nullable age, explicitly clear obsolete values,
account for native JSON bytes and wait for hydration before fetch/sync. Token replay and initial configuration wait
for restored settings. Swift must not prompt from configure/publish/capabilities or infer settings to compensate
for page ordering. The owner's Trip correction (`e3e214a`, #62) uses the oldest successful fetch of the boards
watching the followed Trip, or unknown age while any has never loaded. A redraw must not invent a new fetch time
or borrow an unrelated Commute timestamp. Swift continues to preserve the supplied age without deriving it.

Release validates the complete bridge flow with committed-code CI and GitHub-first checks, then distributes
through internal TestFlight for real-phone acceptance. Exact release evidence and the build number are recorded
in [PR #61](https://github.com/srapley-spec/cartref-commute/pull/61). Test locked
journeys, offline/region cancellation, stop/switch races, delayed pushes, restart, permission denial, Siri and Wi-Fi
before declaring the native app complete. No Apple review submission is configured.

## Extension signing
The Live Activity identifier is `uk.cartref.srapley.commute.journey` (`XSV67947FQ`). Its App Store profile is
**Cartref Commute Journey App Store**, UUID `bc576c7f-d85a-4998-9da2-ee68f4a47e4c`, using the existing distribution
certificate. `IOS_ACTIVITY_PROFILE_BASE64` is provisioned alongside the app's profile secret. No new Apple API or
push key was created; the APNs secret names were confirmed on #58 and the deployed proxy reports `native:true`.

The release script validates both profiles before archiving, installs them with private temporary filenames and
removes both after success, failure or cancellation. Each archive target uses its own distribution profile. Export
must contain exactly one WidgetKit extension with the right identifier, iOS 27 minimum and matching build number.
Both signed entitlement sets are checked; the app must retain production push, App Group, Wi-Fi, Siri and
time-sensitive access. The first real export failed this verifier because an unsigned archive caused Xcode to
omit native entitlements during export. Signing both archive targets fixed the failure; nothing was uploaded.

## First internal TestFlight phone acceptance
Run these on the integrated build identified in the release report. They remain pending until checked on an
iPhone; simulator and exported-package results do not substitute for actual APNs/AlarmKit/region delivery.

1. Open online, then close and reopen with no signal. The bundled page opens and cached data shows its age;
   a fresh install with no saved data says it has not updated yet.
2. In Settings, allow notifications, alarms and Always location. Verify each displayed permission result.
   Refusing a permission must leave the app usable and explain the affected feature without repeated prompts.
   At home, use Settings → Home → "Home is where I am now" before testing home-exit alarm cancellation. A fresh
   install has no saved home region; v1 does not infer home automatically. The page explains this limitation.
3. Follow a
   journey whose leave time is more than five minutes away. Lock the phone: one Live Activity shows
   the engine's leave/platform/train/onward stages, clocks, status and age. Check the Dynamic Island where available.
4. Stay at the starting place for one alarm test: it rings at the configured lead time. On a separate journey,
   leave before the alarm deadline: crossing the configured region cancels it even offline. Wi-Fi loss alone
   must not cancel it. Stop/switch the journey and verify the obsolete activity/alarm does not return.
5. Check a closed-app live update, then go offline: the timer continues to zero and data ages; wording retains
   its last received state. Reconnect and verify the engine's current state arrives without creating a second activity.
6. Ask Siri "When do I need to leave with Commute?" while following, then
   "Follow the next train home with Commute" without a follow. The former reads the saved engine answer with age;
   the latter opens the page to plan. Check home/office Wi-Fi classification.

Record the TestFlight build number, time, journey mode and expected/observed behavior for any failure. No Apple
review is part of this acceptance process.

## What to do next on the lock screen (#57 H29, 19 Nov)
**Who and why:** Sam, first real iPhone commute, 19 Nov. At King's Cross at 08:11, off the 07:30 Great Northern, the
Live Activity said "Next action 08:15 · in 4:05" and, under it, "07:30 Great Northern to London Kings Cross · 3 min
late · Platform 1": a time with no action, and the train he had just left. The page at the same moment said "Get on the
Met to Aldgate · eastbound · Platform 2 · due 08:20". Sam (08:15): fix both sides as one change, page and Swift.

**Acceptance criteria**
- The snapshot carries `step: { text, detail }`, what to do next in the page's own words, read from the instruction
  the page marks `data-native-step` (and its `data-native-detail`). It is not reworded in Swift, and no Swift logic
  decides it.
  - At the change station: "Get on the Met to Aldgate" with "eastbound · Platform 2 · due 08:20". Parts marked
    `data-native-skip` are left out: the ticking "in 8m 38s", because the lock screen draws its own countdown, and
    "about 3 min to spare".
  - With no live tubes: "Get on the next Circle or Met eastbound to Aldgate".
  - On the tube, either way: "Your tube: …" with "Get off at Aldgate" (or Farringdon going home).
  - Trip: the followed card's "Next action" step.
  - `null` when the headline and the train already say it (before and on the train). Snapshots from before H29 have
    no `step`; the shell treats that as none.
- Once you're off the train, `train` and its `status` are `null` on the snapshot, from the page and from the proxy
  (the closed app's `walk-last`). Coming home, the train still ahead stays while you're on the tube. In Trip, the train
  shown is the current or next one, not the first of the trip, and none after the last.
- The Live Activity draws the step under the countdown (text bold, detail beneath), on the lock screen and in the
  expanded Dynamic Island. A change of step is a push-worthy change (`snapshotShown`).
- Modes: Commute and Leisure share the page's following, so both get it. In Leisure the change-station tube
  instruction isn't drawn, because it is tied to the office's stop (`follow-a-route.md`, "Modes"), so there the step
  is shown only where the page has one. Trip, as above.
- "3 min late" drawn green is the same level as the page: under 5 minutes late is `ok` (`railDelayLevel`, warn from
  5 min). Unchanged.
- Snapshot stays v1: the field is additive and optional, and older shells ignore it. The bundled page and the
  extension ship together in the next internal TestFlight build.

**Tests**
- tests/native-next-step.test.mjs: "Lock screen at the change station: the page's 'Get on the …' with its platform and due time; the train you got off has gone"
- tests/native-next-step.test.mjs: "Lock screen with no live tubes yet: 'Get on the next Circle or Met eastbound to Aldgate'"
- tests/native-next-step.test.mjs: "Lock screen on the tube to the office: 'Your tube: …' and where to get off"
- tests/native-next-step.test.mjs: "Lock screen before and on the train: no step, the train stays (it is what to do next)"
- tests/native-next-step.test.mjs: "Coming home on the tube: the step names your tube and where to get off; the train still ahead stays"
- tests/native-next-step.test.mjs: "Trip: the lock screen's step is the followed card's 'Next action', and the train is the one still ahead"
- `tests/fixtures/native/snapshot-page-at-hub-step.json` (and `snapshot-walk-last.json`, now with no train), decoded
  in `EngineFixtureTests.swift`, which also checks `step` on every fixture.

**Status:** built 19 Nov. Lock screen layout to check on the phone in the next TestFlight build.

## Tests
- `ios/NativeCore/Tests/CommuteNativeCoreTests/NativeCoreTests.swift`: state ordering, tombstones, local cancellation,
  transactional cache, corrupt files, event replay, configuration/privacy, permission completion identity, version
  preflight and Siri presentation.
- `ios/NativeCore/Tests/CommuteNativeCoreTests/EngineFixtureTests.swift`: decode and round-trip the owner's actual
  snapshots and both APNs content shapes, checking exact supplied stale dates. By default these use
  `tests/fixtures/native/`; `NATIVE_CONTRACT_FIXTURES` can supply an explicit development directory. Missing fixtures
  produce a reported skip, not a successful integration check.
- `ios/NativeCore/Tests/CommuteNativeCoreTests/SurfaceCoordinatorTests.swift`: 12 deterministic adapter tests for
  async updates, immediate cancellation, superseded scheduling, duplicate activity identity, journey switching,
  newer/unsupported ActivityKit content, background start restrictions, permissions and OS failures.
- `ios/App/CommuteTests/NativeRuntimeTests.swift`: interrupted Keychain/JSON writes, obsolete region/Wi-Fi callbacks,
  unsupported versions, identified/unidentified stops, alarm authorization, scoped evidence replies, real Capacitor cache/error behavior and
  the Siri event retained until the page is listening. `BundledPageTests.swift` checks normal and blocked-network launch.
- `tests/trip-native-age.test.mjs`: the actual Trip controller and engine board budget with deferred responses;
  oldest distinct successful source, no-fetch retention, failed older source, unknown required source and reset.
  The owner's `tests/native-page.test.mjs` also verifies the real page snapshot with absent and successful boards,
  unrelated Commute timestamps, subsequent successful/failed fetches and the three-minute stale transition.
- `tests/ios-release.test.mjs` and `tests/ios-shell.test.mjs`: profile validation before archive, cleanup, extension
  identity/OS/device family/build/entitlements, exact profile mapping, workflow secret wiring, signed archive,
  bundled-page provenance and secret isolation.

Independent review is recorded in [the review report](../reviews/ios-native-2026-11-18.md). All eight original
foundation mutation survivors, 13 critical coordinator/state probes, five signing-test survivors and ten Siri
renderer mutations are caught. Fixes bind Keychain credentials independently to their proxy, discard callbacks
from obsolete configurations, order ActivityKit content before alarm work and cancel obsolete alarms before any
suspending platform call. The reviewer approved the implemented scope, not unresolved contracts or device behavior.

## Verification recorded on 18 November
- At `dada2fd`, full committed-code `npm run ci` passed: 1,440 web tests, typecheck, build/docs checks, bundled iPhone
  offline/native tests and dependency locks. Final combined HEAD CI is still required before merge.
- At `75351bd`, the real signed app+extension export passed identity, content and entitlement checks. Apple package
  validation returned no errors. This was local validation only; no native build from this branch was uploaded.
- At `29e89fb`, both GitHub Tests runs passed, including 31 Swift package tests and all nine simulator XCTest
  checks (run `44287505165`, iOS job `134749676495`). This supplies the result missing from the interrupted local run.
  Twelve Node release/shell tests pass. Static review approved Siri's foreground handling; voice invocation and
  actual WidgetKit layout remain to be tested on an iPhone.
- After integrating `ea7b056`, all 33 Swift package tests pass, including the binding identified-stop fixture and
  malformed/delayed stop cases. The app, extension and updated twelve-test XCTest target build; simulator execution
  and independent review of these additions remain pending.
- The subsequent review regressions and countdown integration pass 35 Swift package tests, including the owner's
  expanded fixture set. App/extension/XCTest build-for-testing passes. The shipped-page check now asserts that its
  real Capacitor bridge exposes the attached Live Activity and alarm adapters; final simulator execution is pending.
- At `4dc0991`, all 13 real simulator XCTest checks passed, including normal/offline launches and real bridge
  activation. At `9a68440`, 36 core tests pass and the countdown/activation independent review is approved.
  Subsequent nullable-cache metadata and explicit null-replacement probes raise the core total to 38; independent
  review approved these at `6254bdc`. Final integrated CI remains required. All these builds remain on the native branch.
- At `9ce934f`, all 1,441 web tests passed in full local CI, but simulator OS data migration failed before app
  testing. That run is not a passing merge gate. The integrated native retry and final combined CI must succeed.
- At `c2a0325`, the Xcode-managed fresh-device run passed all 38 core and 13 app tests, including the real
  nullable-cache bridge check, without retries or skipped tests. The runner's independent review at `79c108c`
  catches all 16 mutations. Final combined CI still follows the owner integration.
- At `1847cf8`, full local CI and both GitHub runs passed with the owner's startup/cache fixes: 1,456 web tests,
  38 Swift core tests and 13 real simulator XCTest checks. The later Trip fix at `54cb185` is independently approved
  with the two additional source-age regressions from `f81b221`; all five targeted mutations are caught.
  The final combined revision and internal TestFlight result are recorded in PR #61.
