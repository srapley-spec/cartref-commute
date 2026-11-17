# The website bundled as an iPhone app
Status: Partly done · Since: 17 Nov 2026 · Issues: #2, #58

## Story
As Sam and family, I want Commute installed from internal TestFlight, with its screen available without signal
and the same website updates reaching the phone, so there is no separate app to configure or keep in step.

## Where it came from
Sam's iPhone brief and 17 November instruction to begin after no-setup preparation. The iOS agent owns the Apple
shell and distribution; the repo owner retains the journey engine, page, proxy and native contracts. Sam explicitly
said not to submit for Apple review until the app works. Account invitations and internal testing are authorized.

## Acceptance criteria
- The app lives under `ios/` in this repository; Capacitor 8.6.2 uses the committed `index.html` byte for byte and
  its six allowlisted local assets. No remote start URL, credentials, environment files or second journey engine.
- The iPhone deployment target is iOS 27.0. A cold WKWebView launch with HTTP/HTTPS blocked must load the engine,
  page and local manifest from `capacitor://localhost`. This proves offline **launch**, not the unfinished shared
  snapshot cache or live data while offline. Commute, Leisure and Trip use the same bundled page.
- A main push reaches internal TestFlight only after the whole Tests workflow passes, including the simulator
  check. The upload checks out that run's exact SHA. Web-only main changes also trigger it; no path filters.
- Uploads are serialized and queued, not superseded by a later push. GitHub's `queue: max` retains up to 100 pending
  runs; exceeding that limit is an operational failure to investigate, not a reason to silently skip a revision.
- Build numbers advance beyond all existing builds, across all versions. The job waits for Apple processing before
  releasing its queue slot. After an upload/processing timeout, inspect TestFlight before retrying the failed run.
- Only successful pushes from this repository's main branch may access signing inputs. PR validation has no signing
  secrets. The app is exported with `testFlightInternalTestingOnly=true`; no workflow submits for review.
- Signing happens in a temporary keychain and private directory, cleaned on success or failure; the API key's role
  remains Developer. Only source SHA, page hash and build number are uploaded as provenance artifacts.
- Before uploading, inspect the signed IPA's identity, minimum OS, iPhone device family, build number, local URL,
  signature, source SHA and actual bundled page hash. Reject mismatches.
- The website remains complete on its own. The shell introduces no changes to engine, page or proxy behavior.

## Tests
- tests/ios-shell.test.mjs: "iOS bundles the committed page verbatim and excludes credentials and stale files"
- tests/ios-shell.test.mjs: "iOS release accepts only the exact successful main push from this repository"
- tests/ios-shell.test.mjs: "iOS build numbers increase over every existing build and reject ambiguous formats"
- tests/ios-shell.test.mjs: "Apple API authentication handles pagination without exposing credentials or following foreign links"
- tests/ios-shell.test.mjs: "TestFlight queues every passing main revision with internal-only export and no PR signing secrets"
- tests/ios-shell.test.mjs: "iOS configuration stays bundled and iOS behaviour changes require documentation"
- Native XCTest: `ios/App/CommuteTests/BundledPageTests.swift`,
  `testPageBootsFromTheBundleWithoutNetwork`. Uses a real Capacitor WKWebView and WebKit network block rules.
  `testApplicationLaunchesTheBundledPage` separately checks the actual app window/controller and its loaded page;
  the independent review identified that the isolated offline test alone could miss a broken app entry point.
- Manual signing check: unsigned Release archive → manual App Store export → signed IPA inspection passed locally
  on 17 November with Xcode 27.2. Nothing uploaded by that check.

## Not yet / open questions
- Full committed-code CI, GitHub validation, independent mutation review and first TestFlight upload are pending.
- No-setup must be released on main before this shell is integrated. The owner is working on that release separately.
- `CommuteNative`, shared offline snapshots/data-age behavior, Live Activity, AlarmKit, Wi-Fi, geofences and Siri
  remain gated on released contracts; see [ios-readiness.md](../ios-readiness.md) and issue #58. The shell does not
  advertise any native capability as implemented.
- Family account invitations must be accepted before enrollment in the internal group. Real iPhone journey and
  permission acceptance tests remain necessary for the later native features.
