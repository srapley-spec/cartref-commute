# Native iPhone journey surfaces
Status: In progress on `codex/ios-native-v1` · Since: 18 Nov 2026 · Issue: #58

## Story and contract
Sam and family need the followed journey available when the app is closed, and a leave alarm that cancels on
departure. The engine remains the sole owner of journey facts, decisions and wording. Native code transports,
persists and presents its versioned snapshot; it never plans a journey or infers a train.

Sam authorized implementation against `docs/ios-app.md` §6.7 at `385f56b`. The owner subsequently published the
implementation and initial fixtures at `9628132` on `feature/native-prep`. Those changes are not yet on main.
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

## Checks and current limits
`ios/NativeCore` isolates transport/state rules from Apple APIs for fast Swift tests. Its eight unit tests cover
ordering, stop/switch/restart, tombstone expiry, offline cancellation, transactional cache limits, file corruption,
event replay, configuration/privacy and unknown versions. `EngineFixtureTests` decodes the owner's actual snapshots
and both APNs content-state shapes, checking exact supplied stale-date values. During development, fixtures are
read from an explicitly supplied `NATIVE_CONTRACT_FIXTURES` directory extracted from the owner's commit; after
integration they come from `tests/fixtures/native/`. Absence is reported as a skipped integration test, never a pass.

The initial foundation builds for the iOS simulator and all nine tests pass against `9628132`. This is not a
release claim. Full committed-code CI, GitHub-first checks, independent mutation review, signing checks and real
iPhone acceptance remain required.

Two contract questions were posted to #58 on 18 November:
- AlarmKit authorization is independent of notification authorization. Settings needs its own returned state and
  explicit request (or an agreed combined request). The implementation must not pretend notifications granted
  implies alarms granted. [Apple API](https://developer.apple.com/documentation/alarmkit/alarmmanager/requestauthorization()).
- The published background stop carries only `snapshot:null`. It needs `followId` and `at` to make delayed stops
  safe. Unidentified remote nulls are currently ignored; page-local nulls stop the current journey.

Live Activity, AlarmKit and Siri adapters are still being connected. The current bridge reports those capabilities
false. The native contract changes must be released and integrated before end-to-end validation or distribution.
