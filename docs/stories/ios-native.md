# Native iPhone journey surfaces
Status: In progress on `codex/ios-native-v1` · Since: 18 Nov 2026 · Issue: #58

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
Live Activity and alarm capabilities remain false while the Apple surface adapter is unattached. Siri is enabled;
geofences, Wi-Fi, bridge and storage are implemented. Three owner contract questions remain on
[issue #58](https://github.com/srapley-spec/cartref-commute/issues/58):
- [AlarmKit authorization](https://github.com/srapley-spec/cartref-commute/issues/58#issuecomment-6974073764)
  is independent of notification authorization. Settings needs its returned state and explicit request, or an
  agreed combined request. Notifications granted must not imply alarms granted.
- The same comment requests `followId` and `at` on remote null/stop envelopes, including evidence replies. An old
  remote stop must not cancel a newer journey. Unidentified remote nulls are currently ignored; a page-local null
  stops the current journey.
- [Countdown wording](https://github.com/srapley-spec/cartref-commute/issues/58#issuecomment-6975526255)
  includes calm/urgent/passed variants but no engine-selected current wording or transition instants. Native views
  must not invent urgency thresholds. The current timer clamps at zero and uses the engine's calm words.

The owner's nine snapshot fixtures omit a Trip snapshot and page-only missed/switch/tube/arrived phases. Swift
accepts Trip's nullable `direction` with a schema regression, but complete generated fixtures remain necessary.
After the contract changes are integrated: attach the Apple adapter, validate the complete bridge flow, perform
final committed-code CI and GitHub-first checks, then distribute through internal TestFlight for real-phone
acceptance. Test locked journeys, offline/region cancellation, stop/switch races, delayed pushes, restart,
permission denial, Siri and Wi-Fi before declaring the native app complete. No Apple review submission is configured.

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
  unsupported versions, unidentified stops, real Capacitor cache/error behavior and
  the Siri event retained until the page is listening. `BundledPageTests.swift` checks normal and blocked-network launch.
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
- At `29e89fb`, 31 Swift package tests pass and the nine-test simulator target builds. The local simulator run was
  interrupted before producing a result; it is not counted as a pass. The earlier eight-test foundation run passed
  at `5f39b01`; GitHub is running the final revision. Twelve Node release/shell tests pass. Static review approved
  Siri's foreground handling; voice invocation and actual WidgetKit layout remain to be tested on an iPhone.
