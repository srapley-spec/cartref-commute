# Commute for iPhone

This is a bundled Capacitor shell around the repository's committed website. The journey engine remains in
`src/core`; native code must not reproduce its decisions. Read `../CLAUDE.md`, the released `../docs/ios-app.md`
when present, and `../docs/stories/ios-shell.md` before making changes. Current gates: `../docs/ios-readiness.md`.

## Local build

Use Node 22 or newer and Xcode 27.2 with the iOS 27.2 simulator runtime:

```sh
npm ci
npm run ios:sync
npm run ios:test
open ios/App/App.xcodeproj
```

Choose the shared **Commute** scheme. The app requires iOS 27.0 and an iPhone. Simulator validation needs no signing
credentials. `ios:test` creates and removes its own simulator. `ios:sync` stages only the committed website's six
assets; it does not rebuild the page. When changing web sources, follow the normal build/freshness rules first.
Capacitor 8.6.2 emits `.iOS(.v27)` in a Swift 5.9 manifest, although that enum needs Swift package tools 6.4.
The sync script replaces it with the equivalent `.iOS("27.0")`; review/remove this workaround when upgrading
Capacitor. The committed package is the normalized output, and CI checks it stays unchanged after sync.

`npm run ci` also performs the native checks on a Mac. Linux sessions run the complete web checks and must wait for
GitHub's iOS job before merging. Native signing/upload is a separate integration check, not part of PR validation.
On a Mac running other builds, `COMMUTE_TEST_CONCURRENCY=2 npm run ci` limits simultaneous web test files without
changing which suites run. This avoids running out of memory while Xcode and simulators are active.

## Internal TestFlight

`.github/workflows/testflight.yml` follows successful **Tests** runs for main pushes. It checks out the tested SHA,
queues every revision, archives, exports an internal-only signed IPA, verifies its contents, uploads and waits for
Apple processing. It never submits for App Store or external beta review. Commute's internal **Family** group has
automatic distribution enabled. Accepted App Store Connect users must be added to that group separately.

Public configuration: team `TU7MLARY49`, app `6836040622`, bundle `uk.cartref.srapley.commute`, CI key `C8865Y2UMU`,
issuer `aedb05d9-7e5f-424f-b147-64f12ec0567a`. Signing profile: **Cartref Commute App Store**.

Repository Actions secrets (never commit values):

| Secret | Purpose |
| --- | --- |
| `ASC_API_KEY_P8` | Developer-role App Store Connect API key for upload and build status |
| `IOS_DISTRIBUTION_P12_BASE64` | Base64-encoded Apple Distribution certificate and private key |
| `IOS_DISTRIBUTION_P12_PASSWORD` | Password protecting that signing bundle |
| `IOS_APP_PROFILE_BASE64` | Base64-encoded Commute App Store provisioning profile |

The signing certificate and profile expire 17 November 2027; renew both secrets before expiry. Adding an extension
or changing capabilities requires its identifier/profile and an explicit update to the export mapping and checks.
The App Group `group.uk.cartref.srapley.commute` is associated with the app ID. App code will request native
entitlements only as the corresponding capabilities are implemented and tested.

APNs secrets belong to the owner's proxy workflow, not the app or TestFlight upload: `APNS_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID`, `APNS_TOPIC`. They have been provisioned; native-route deployment is still the owner's work.

For a local signing check, provide the same four secrets through a secure local process and the three public
`ASC_*` identifiers, then run `node ios/scripts/release.mjs --export-only`. The signed IPA is ignored under
`ios/App/output/`. Uploads are deliberately restricted to the trusted GitHub workflow.

If Apple upload or processing fails, inspect the failed run and TestFlight before rerunning it. Build numbers are
allocated from Apple's complete build list inside the serialized job. A previously uploaded build can still finish
processing after a timeout. GitHub's queue holds at most 100 pending releases; monitor failures and re-run missing
revisions instead of treating a dropped run as a successful release.
