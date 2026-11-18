# iOS readiness — 17 November 2026

## Current status — 18 November 2026

The shell and automatic internal TestFlight pipeline are released (initial build `1.0 (1)` at `cfbe4f0`). The
owner's snapshot/page/proxy work is released at `9628132`; Tests, Pages, Deploy proxy and TestFlight all passed.
The live proxy reports `native:true`. APNs secret names were confirmed on issue #58; no key transfer remains.

Native implementation is on `codex/ios-native-v1`, draft PR #61. The bridge/store, Apple adapters, Live Activity
extension and Siri compile; 33 Swift and 12 release/shell tests pass. Independent review approves the implemented
scope. A real signed app+extension export at `75351bd` passes native entitlement checks and Apple package validation.
Full local CI at `dada2fd` passed all 1,440 web tests and simulator checks. Both GitHub runs at `29e89fb` passed
(including nine simulator tests); final combined HEAD CI remains required.
Live Activity and alarm stay disabled pending contract integration; Siri is enabled. Internal TestFlight will provide
the build for subsequent real-phone acceptance. Owner `ea7b056` is integrated with separate AlarmKit authorization and identified stops; native additions build
and await simulator/review checks. Owner countdown fields and Trip/page-phase fixtures are on `eea5846`, not yet
merged. The page still needs to invoke permission requests from Settings (reported on #58).
See [the native story](stories/ios-native.md) for current behavior and validation.

The extension identifier `uk.cartref.srapley.commute.journey`, App Store profile and
`IOS_ACTIVITY_PROFILE_BASE64` secret are provisioned. No Apple review submission is authorized or configured.

The sections below preserve the original 17 November preparation record; their historical branch/run references
are not the current release gates.

## Prepared and verified

- This workspace is the actual `srapley-spec/cartref-commute` repository. Local branch `codex/ios-preflight`
  starts from `main` at `d2cca4bc9ca41e1817cef0248301a030573294d0`. Git push access was checked with a dry run;
  implementation and release checks are recorded below.
- Xcode 27.2 (`27B52`), iOS 27.2 SDK, and iPhone simulators are available. Minimum app deployment target remains 27.0.
- Node 24.22.3 and npm 11.19.1 are installed for this task, outside the repository, from the official Node archive
  with its SHA-256 checked. Local bin directory:
  `~/.local/share/cartref-commute/toolchain/node-v24.22.3-darwin-arm64/bin`.
  Add that directory to PATH when running repository commands. Capacitor CLI, core and iOS packages are pinned to 8.6.2.
- The real Capacitor WKWebView passed its cold-launch test with HTTP/HTTPS blocked. A Release archive and signed
  internal-only export passed local verification, including the bundled page hash. Full committed-code CI,
  GitHub validation and internal TestFlight processing are release gates; this is not a completed native app.
  Independent review is complete, with all 20 deliberate mutations caught (docs/reviews/ios-shell-2026-11-17.md).
- Apple Developer and App Store Connect are signed in as Sam Rapley. The registered Commute App ID is on team
  `TU7MLARY49`, matching the valid Apple Development signing identity in the local Keychain. No local Apple
  Distribution signing identity was listed. Sam confirmed reuse of this team on 17 November.
- App ID `uk.cartref.srapley.commute` verified in Apple Developer; Access Wi-Fi Information checked on its page.
  The App Group existed but was unassociated; it is now assigned to Commute and present in the regenerated profile.
  Push, Siri, Wi-Fi and time-sensitive capability grants are also present. No identifiers or keys were revoked.
- Created the [Cartref Commute App Store Connect record](https://appstoreconnect.apple.com/apps/6836040622):
  app ID `6836040622`, iOS, English (U.K.), SKU `cartref-commute-ios`, bundle ID above. Internal distribution only;
  processed builds and their status are visible in TestFlight.
- Requested App Store Connect API access and verified Apple's approval. Created team key **Cartref Commute CI**
  with the Developer role: key ID `C8865Y2UMU`, issuer ID `aedb05d9-7e5f-424f-b147-64f12ec0567a`.
  At Sam's request, downloaded its private file once into a protected local signing directory and transferred it
  opaquely to `ASC_API_KEY_P8`. API authentication and app identity are verified; no private value entered chat or logs.
  These public IDs are not the APNs key ID/team ID.
- Sam supplied three family accounts for internal testing. Account invitations use the Marketing role, access
  limited to Cartref Commute, with Create Apps and Generate Individual API Keys disabled. Keep addresses out of
  public repository documentation. All three account invitations were confirmed sent by App Store Connect;
  acceptance is pending. Sam confirmed the third account's Gmail address; the earlier iCloud variant in Cartref
  Home's tester list was incorrect and must not be reused.
- At Sam's request, corrected the same account in Cartref Home: deleted its incorrect external tester entry
  from All Testers and added the confirmed Gmail account to the existing external Family group. Verified five
  Family testers with the corrected address and no old entry. No build or review submission was changed.
- Created Commute's internal **Family** group (`04d6fd12-7207-488c-bbec-bff4050404ce`) with automatic build
  distribution enabled, as required for main builds. Sam is enrolled. The
  invited family accounts are not yet eligible in the add-testers list and must first accept their account invites.
- Found the existing APNs key (`352Z6Z6469`) through Cartref Home's setup documentation. At Sam's request,
  transferred it opaquely to `APNS_KEY` and added `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` in Actions secrets.
  Its existing protected Cartref copy remains intact. No replacement key needed; proxy deployment remains separate.
- Cloud export failed because the Developer API key lacks cloud certificate permission. Created a separate Apple
  Distribution certificate (`4LB2LF4N9T`) and **Cartref Commute App Store** profile, expiring 17 November 2027. Their
  protected signing inputs are now in Actions secrets. Manual signing/export passed; the API key retains Developer
  access. Local backup: `~/Library/Application Support/Cartref Commute/Signing/` (outside the repository).
- Opened [ios-contract issue #58](https://github.com/srapley-spec/cartref-commute/issues/58) for the repo owner.

## Release gate

The no-setup release is now main at `af09273`: Tests `44193296849`, Pages `44193295352` and Deploy proxy
`44193296935` all succeeded. Its live `/status` answers HTTP 200 with `Access-Control-Allow-Origin:
capacitor://localhost`, so the bundled page can reach its proxy without device setup.
Native-prep run `44186930189` at `3c45da8` failed the generated `index.html` freshness gate: snapshot exports are
absent from the committed page. Do not treat those drafts as released dependencies or duplicate the owner's fixes.

The green no-setup release has been merged into the iOS branch. Integration now waits for all required checks
on the combined revision. The independent review passed after its findings were fixed. Live Activity and AlarmKit additionally wait
for released snapshot/native routes and resolution of the contracts they use.

Sam clarified on 17 November: do not submit Cartref Commute for Apple review until the app is working. Account
invitations and internal TestFlight preparation are authorized to continue. Commute builds are for internal testing only; no review submission is configured. Cartref Home's external Family test group is a separate app and setup; its testers are
not automatically App Store Connect users eligible for Commute's internal group.

## Implementation sequence

1. Add the Capacitor project under `ios/`, with the existing built page and its local assets staged into the app.
   No remote `server.url`, no second screen implementation, no journey logic in Swift. Verify a cold offline launch
   and unchanged browser operation. Follow the approved Signal design for native surfaces.
2. Add native build validation and a TestFlight upload workflow. Every passing main revision must produce its own
   build, including web-only changes. Build the exact tested SHA, use unique increasing build numbers, and do not
   cancel an older upload merely because a newer main commit arrives. PR builds must not receive signing secrets.
   Use a verified Xcode 27 runner/SDK and pin dependencies. Include the source SHA in build provenance.
3. Implement `CommuteNative`, App Group persistence and lifecycle handling against the agreed versioned contract
   and recorded engine fixtures. Report only implemented capabilities and handle denied permissions without loops.
4. After dependencies ship, add the single journey Live Activity, AlarmKit scheduling, geofences, Wi-Fi and App
   Intents. Native code performs platform operations; the engine supplies decisions, times, wording and alarm directives.
5. Validate on a real iPhone: locked morning journey, leave cancellation, stale/offline data, stop/switch races,
   delayed/old APNs updates, restart, permission denial, Siri, Wi-Fi and Settings. Perform the required independent
   test review, full committed-code CI, GitHub-first release and verification on main before declaring completion.

## Contract questions

[Issue #58](https://github.com/srapley-spec/cartref-commute/issues/58) is the reviewable handoff. It covers the
brief/draft bridge mismatch, native registration credentials, region configuration, closed/offline alarm cancellation,
whole-journey state in all modes, ordering/token ownership/freshness, both Siri operations, offline bootstrap, and
permission/simulation semantics. Swift must not fill these gaps with a second journey engine.

Apple does not guarantee delivery of [background pushes](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app).
An already scheduled AlarmKit alarm is different from successfully changing it later. The accepted design and device
tests must distinguish those cases. Wi-Fi disconnection alone is not proof of leaving home or the office.

## Access and remaining steps

Sam explicitly authorized secure transfer of the existing files. Secret values must never be pasted into chat,
read into agent output, stored in this repository or printed in logs. They have been transferred directly from
protected files into GitHub Actions secret inputs, with the clipboard cleared after each operation. APNs and
App Store Connect keys are separate credentials; neither belongs in the app.

| Purpose | Current state |
| --- | --- |
| Proxy APNs | `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` provisioned. Repo owner must wire/deploy native routes and APNs; issue #58 updated. |
| TestFlight upload | `ASC_API_KEY_P8` provisioned; authentication verified. Public identifiers are in the workflow. Successful upload/processing is verified by the TestFlight workflow before declaring a release. |
| Archive signing | `IOS_DISTRIBUTION_P12_BASE64`, `IOS_DISTRIBUTION_P12_PASSWORD`, `IOS_APP_PROFILE_BASE64` provisioned. Manual export verified. Temporary keychain/files are removed afterward. Renew before 17 Nov 2027. |
| Testers | All three account invitations sent; acceptance pending. Use the owner-confirmed Gmail account. Add accepted accounts to the internal Family group. Sam is enrolled. Keep addresses out of public docs. |
| Device acceptance | Sam completes OS permission/device-trust interactions and verifies later home/office journey behavior on an actual iPhone. |

Account invitations, local exports and internal TestFlight uploads do not request Apple review. Review submission
is not configured or authorized at this stage.
