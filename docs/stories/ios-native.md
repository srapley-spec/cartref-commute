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

## Tests
`ios/NativeCore` isolates transport/state rules from Apple APIs for fast Swift tests. Its state tests cover
ordering, stop/switch/restart, tombstone expiry, offline cancellation, transactional cache limits, file corruption,
event replay, configuration/privacy and unknown versions. `EngineFixtureTests` decodes the owner's actual snapshots
and both APNs content-state shapes, checking exact supplied stale-date values. During development, fixtures are
read from an explicitly supplied `NATIVE_CONTRACT_FIXTURES` directory extracted from the owner's commit; after
integration they come from `tests/fixtures/native/`. Absence is reported as a skipped integration test, never a pass.

The initial foundation builds for the iOS simulator and all 17 Swift tests pass against `9628132`. All eight simulator XCTest checks also passed, including six
native runtime/bridge tests. Early independent review found and prompted
fixes for interrupted credential/config writes, delayed Wi-Fi/region callbacks, permission completion identity and
future-version shape decoding. Regression probes cover these and the eight original mutation survivors. The
Keychain record is independently bound to its normalized proxy origin. Region identifiers carry a persisted
configuration generation, so callbacks queued for an old home/office cannot cancel the current alarm.
This is not a
release claim. Full committed-code CI, GitHub-first checks, independent mutation review, signing checks and real
iPhone acceptance remain required.

Two contract questions were posted to #58 on 18 November:
- AlarmKit authorization is independent of notification authorization. Settings needs its own returned state and
  explicit request (or an agreed combined request). The implementation must not pretend notifications granted
  implies alarms granted. [Apple API](https://developer.apple.com/documentation/alarmkit/alarmmanager/requestauthorization()).
- The published background stop carries only `snapshot:null`. It needs `followId` and `at` to make delayed stops
  safe. Unidentified remote nulls are currently ignored; page-local nulls stop the current journey.

Live Activity/AlarmKit adapters, the lock-screen/Dynamic Island layout and Siri intents compile, but are still being
connected and validated. The WidgetKit extension contains only the journey Live Activity; the parked home-screen
widget has not been added. The current bridge reports those capabilities false. The two contract questions above still gate complete end-to-end validation and distribution.

The owner's `9628132` is now merged into this branch from main; its Tests, Pages and Deploy proxy checks passed.
The foundation's simulator run passed all eight XCTest checks, including the real Capacitor bridge's version
errors and offline cache round trip. The surface coordinator now has seven deterministic platform-adapter tests:
updates queued at worker completion, disable/exit during suspended alarm scheduling, duplicate activity identity,
journey switching during suspended activity update, newer APNs content, background start restriction and permissions/
OS failure. Independent review identified the completed-worker and duplicate-end races; their fixes still await
mutation review. Apple surface capability flags remain disabled pending full integration and the two contract answers.


## Extension signing
The Live Activity identifier is `uk.cartref.srapley.commute.journey` (`XSV67947FQ`). Its App Store profile is
**Cartref Commute Journey App Store**, UUID `bc576c7f-d85a-4998-9da2-ee68f4a47e4c`, using the existing distribution
certificate. No new Apple API or push key was created. TestFlight needs `IOS_ACTIVITY_PROFILE_BASE64` alongside
the app profile. The release script validates both profiles before archiving, installs them with private temporary
filenames, and removes both after success, failure or cancellation. The exported IPA must contain exactly one
WidgetKit extension with the correct identifier, iOS 27 minimum and matching build number. Both code-signing
entitlement sets are validated; the app must retain production push, App Group, Wi-Fi, Siri and time-sensitive access.
`tests/ios-release.test.mjs` exercises wrong profiles, expiration, missing capabilities, wrong extension metadata,
substituted page content and cleanup. Real signed export remains to verify before release.

A further review probe caught newer ActivityKit cancellation being handed to the runtime while the coordinator
still scheduled the older alarm. The coordinator now applies the same validated ordering rule to its transport
state before alarm work, then informs the runtime. Tests cover the newer cancellation and reject unknown-version
activity content without cancelling a valid current alarm. Both original lifecycle races and all eight foundation
mutation survivors are now covered; independent review continues on the complete platform coordinator.

Engine cancellation, alarm disable, permission loss and a changed alarm directive now invalidate an existing
alarm synchronously when accepted, before waiting for ActivityKit. Review reproduced an old alarm remaining armed
through a suspended activity update; an intermediate-state regression now checks the cancellation before that
update resumes. A separate regression checks cancellation immediately after a superseded schedule returns,
while the next activity update is still suspended. The extension profile secret was provisioned and confirmed
through GitHub's encrypted-secret API on 18 November; no new Apple API/push key was needed.

The first real export of the native extension failed the capability verifier: archiving with signing disabled
caused Xcode's export to omit the app's requested native entitlements. Nothing was uploaded. Release now signs
the archive itself with the installed distribution certificate and target-specific App Store profiles, then
exports and verifies it. The real signed package is the required regression check for this Xcode behavior.

Review's five signing-test survivors now have regression probes: bad extension profile rejected before archive
with cleanup of the already-installed app profile; extension minimum OS/device family; exact export mapping; and
workflow secret wiring. The published engine schema also revealed that Trip has `direction:null`; Swift now accepts
that nullable field and tests it. The current owner's nine snapshot fixtures do not yet contain a Trip snapshot,
so this schema probe does not replace the requested generated Trip/phase fixtures.
