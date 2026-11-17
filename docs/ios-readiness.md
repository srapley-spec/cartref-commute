# iOS readiness — 17 November 2026

Preparation only. Sam asked the iOS agent to wait for the no-setup release before implementing the app. The
authoritative brief is currently `docs/ios-app.md` on `feature/no-setup` (`e0ceef1`); it is not on `main` yet.
Native preparation is on `feature/native-prep` (`cb899c9`). Read the released versions again before implementation.

## Prepared and verified

- This workspace is the actual `srapley-spec/cartref-commute` repository. Local branch `codex/ios-preflight`
  starts from `main` at `d2cca4bc9ca41e1817cef0248301a030573294d0`. Git push access was checked with a dry run;
  no branch or app source has been pushed by this preparation.
- Xcode 27.2 (`27B52`), iOS 27.2 SDK, and iPhone simulators are available. Minimum app deployment target remains 27.0.
- Node 24.22.3 and npm 11.19.1 are installed for this task, outside the repository, from the official Node archive
  with its SHA-256 checked. Local bin directory:
  `~/.local/share/cartref-commute/toolchain/node-v24.22.3-darwin-arm64/bin`.
  Add that directory to PATH when running repository commands. Capacitor's current stable CLI is 8.6.2;
  resolve and pin matching packages when implementation begins.
- `npm ci`, `npm run typecheck`, and `npm run check-docs` passed on the unchanged checkout. This is a toolchain
  check, not a full release test run. No app implementation or signing test has been performed.
- Apple Developer and App Store Connect are signed in as Sam Rapley. The registered Commute App ID is on team
  `TU7MLARY49`, matching the valid Apple Development signing identity in the local Keychain. No local Apple
  Distribution signing identity was listed.
- App ID `uk.cartref.srapley.commute` verified in Apple Developer; Access Wi-Fi Information checked on its page.
  Reuse the App Group `group.uk.cartref.srapley.commute` and other capabilities recorded in the brief, then verify
  their associations in the eventual signed profiles. No identifiers or keys were revoked.
- Created the [Cartref Commute App Store Connect record](https://appstoreconnect.apple.com/apps/6836040622):
  app ID `6836040622`, iOS, English (U.K.), SKU `cartref-commute-ios`, bundle ID above. No build uploaded or released.
- Requested App Store Connect API access and verified Apple's approval. Created team key **Cartref Commute CI**
  with the Developer role: key ID `C8865Y2UMU`, issuer ID `aedb05d9-7e5f-424f-b147-64f12ec0567a`.
  Its private .p8 has not been downloaded or read by the agent. These public IDs are not the APNs key ID/team ID.
- App Store Connect's People list currently contains only Sam (Account Holder/Admin); family internal tester
  accounts are not yet present. Names/addresses and account invitations are still needed.
- Opened [ios-contract issue #58](https://github.com/srapley-spec/cartref-commute/issues/58) for the repo owner.

## Release gate

At inspection, main's Tests run `44181357622` was still running. Its Pages and Deploy proxy jobs succeeded.
The no-setup branch's run `44176299310` failed: 1,348 tests passed and 15 failed, including saved Follow/settings,
push-alert and simulator assertions. These failures belong to the other agent's active release work; their full
root causes have not been independently established here. Native-prep runs `44177868406`, `44179088488`, and
`44179332775` failed the generated `index.html` freshness gate; the latest log shows new snapshot exports absent
from the committed page. Do not treat those drafts as released dependencies or duplicate the owner's fixes.

Begin shell/pipeline implementation after the no-setup release is on main and its exact commit has passed Tests,
Pages and the applicable proxy deployment checks. Bring this branch up to date from main first. Live Activity and
AlarmKit implementation additionally wait for released snapshot/native routes and resolution of the contracts they use.

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

## Access still needed

Secret values must never be pasted into chat, read into agent output, stored in this repository, or printed in logs.
Provision them directly in GitHub Actions secrets using the owner's secure input. The push key and upload API key
are different credentials; neither belongs in the app. Only their public identifiers may be recorded here.

| Purpose | Preparation still required |
| --- | --- |
| Proxy APNs | Sam confirms possession of `352Z6Z6469`'s .p8. If missing, create a replacement without revoking a key another app uses. Provision `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` through the existing Deploy proxy secret mechanism. |
| TestFlight upload | The CI key above is created. Sam downloads it once from [Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api), keeps a secure backup and enters its file contents directly into the repository Actions secret `ASC_API_KEY_P8`. The workflow will use `ASC_KEY_ID=C8865Y2UMU` and `ASC_ISSUER_ID=aedb05d9-7e5f-424f-b147-64f12ec0567a` as non-secret configuration. Upload permission is not yet exercised with a signed build. |
| Archive signing | Prepare an Apple Distribution certificate/private key and profiles for each target, including App Group/capabilities. Store signing inputs securely; import only into an ephemeral CI keychain and clean up after use. Final secret names belong with the actual workflow. |
| Testers | Sam identifies the intended App Store Connect users, or the people who still need accounts. Do not copy tester addresses into public repo documentation. |
| Device acceptance | Sam completes unavoidable OS permission/device-trust interactions and verifies home/office behaviour on an actual iPhone. |

The browser login is working; it does not itself give GitHub Actions upload or signing credentials. No private key
was inspected during preparation. No tester invitation has been sent from this chat.
