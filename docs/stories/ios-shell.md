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
- Sync normalizes Capacitor 8.6.2's generated Swift 5.9 manifest to use the string form of the iOS 27 minimum;
  its generated `.v27` enum requires package tools 6.4 and fails on a clean build without this correction.
- A main push reaches internal TestFlight only after the whole Tests workflow passes, including the simulator
  check. The upload checks out that run's exact SHA. Web-only main changes also trigger it; no path filters.
- Uploads are serialized and queued, not superseded by a later push. GitHub's `queue: max` retains up to 100 pending
  runs; exceeding that limit is an operational failure to investigate, not a reason to silently skip a revision.
- Build numbers advance beyond all existing builds, across all versions. The job waits for Apple processing before
  releasing its queue slot. After an upload/processing timeout, inspect TestFlight before retrying the failed run.
- Only successful pushes from this repository's main branch may access signing inputs. PR validation has no signing
  secrets. The app is exported with `testFlightInternalTestingOnly=true`; no workflow submits for review.
- Signing happens in a temporary keychain and private directory, cleaned on success or failure; the API key's role
  remains Developer. SIGINT/SIGTERM cancel in-flight commands and API requests and still run cleanup; hard-killed
  GitHub machines are ephemeral. Only source SHA, page hash and build number are uploaded as provenance artifacts.
- Before uploading, inspect the signed IPA's identity, minimum OS, iPhone device family, build number, local URL,
  signature, source SHA and actual bundled page hash. Reject mismatches.
- The website remains complete on its own. The shell introduces no changes to engine, page or proxy behavior.
- Local full CI may set `COMMUTE_TEST_CONCURRENCY` to a positive integer to limit simultaneous web test files on a
  Mac also running Xcode. Discovery, virtual clocks and failure reporting stay identical; GitHub defaults are unchanged.
  The existing hung-request page test waits up to 5 seconds for completion instead of assuming a 600 ms startup
  delay is sufficient under load. Its injected timeout remains 150 ms, and recovery/timeout assertions are unchanged.

## Tests
- tests/app.test.mjs: "A hung request times out; the app recovers and refreshes again"
- tests/test-runner.test.mjs: "test runner discovers page and core suites and propagates either failure"
- tests/ios-shell.test.mjs: "iOS bundles the committed page verbatim and excludes credentials and stale files"
- tests/ios-shell.test.mjs: "iOS release accepts only the exact successful main push from this repository"
- tests/ios-shell.test.mjs: "iOS build numbers increase over every existing build and reject ambiguous formats"
- tests/ios-shell.test.mjs: "Apple API authentication handles pagination without exposing credentials or following foreign links"
- tests/ios-shell.test.mjs: "TestFlight queues every passing main revision with internal-only export and no PR signing secrets"
- tests/ios-shell.test.mjs: "iOS configuration stays bundled and iOS behaviour changes require documentation"
- tests/ios-release.test.mjs: "signed IPA checks reject wrong identity, substituted content, stale provenance and invalid signatures"
- tests/ios-release.test.mjs: "failed archives remove synthetic signing inputs and restore the keychain search list"
- tests/ios-release.test.mjs: "cancelled archives remove synthetic signing inputs and restore the keychain search list"
- tests/ios-release.test.mjs: "release rejects a substituted page in the exported IPA and cleans up signing inputs"
- Native XCTest: `ios/App/CommuteTests/BundledPageTests.swift`,
  `testPageBootsFromTheBundleWithoutNetwork`. Uses a real Capacitor WKWebView and WebKit network block rules.
  The offline controller is displayed in the real app window for the test, then the original controller is
  restored. A detached WKWebView can be throttled or suspended and does not represent opening the app offline.
  The test asserts window attachment and visibility while retaining a fresh nonpersistent store and network block.
  `testApplicationLaunchesTheBundledPage` separately checks the actual app window/controller and its loaded page;
  the independent review identified that the isolated offline test alone could miss a broken app entry point.
  The offline probe uses `no-cors` so a missing CORS response header cannot masquerade as the network blocker.
  Readiness waits up to 300 seconds on a monotonic clock. The first main run's 120-second budget expired before
  WebKit completed its initial navigation (the test finished at 145 seconds and navigation completed immediately
  afterwards). A separate blank WebKit app, with no Commute code or XCTest, took 57 seconds to become ready on a
  fresh simulator. These measurements show that infrastructure time cannot be treated as a phone performance
  measurement; the precise OS cause remains unresolved. The engine, screen, origin, title and offline assertions
  remain unchanged. Real-device launch performance still needs checking.
  Only one readiness evaluation may be in flight. The deadline advances independently of its callback, so a
  stalled callback cannot turn an expired wait into success or prevent the test from reporting a failure.
  Xcode test timeouts are enabled (360 seconds by default, 600 maximum); separate five-minute simulator-command
  and eighteen-minute xcodebuild limits cover bootstrap and test-manager hangs before any test starts. A timeout
  fails the run and still cleans up its disposable simulator. There are no automatic test retries.
  The simulator boot report is preserved. A terminal "Data Migration Failed" rejects the environment even when
  `simctl` exits zero, a case observed during diagnosis. The speculative debugger change was removed because
  the comparison did not explain the startup delay.
- tests/ios-simulator.test.mjs: "simulator bootstrap failure prevents app testing and removes only its disposable device"
- tests/ios-simulator.test.mjs: "simulator test failures propagate after disposable device cleanup"
- tests/ios-simulator.test.mjs: "hung simulator setup and xcodebuild fail within an outer deadline and clean up"
- Manual signing check: unsigned Release archive → manual App Store export → signed IPA inspection passed locally
  on 17 November with Xcode 27.2. Nothing uploaded by that check.

Independent review (17 Nov): [mutation evidence and corrections](../reviews/ios-shell-2026-11-17.md).
The offline blocker is attached to the final WebKit configuration after Capacitor replaces its content controller;
removing it now fails the network assertion. Synthetic signing tests verify exact keychain restoration on failure
and cancellation. Both real-startup and offline native tests passed against the released no-setup page.

## Not yet / open questions
- Independent review is complete: all 20 deliberate mutations are caught; [review evidence](../reviews/ios-shell-2026-11-17.md).
  PR #59's initial main native startup check failed on 18 November. TestFlight correctly skipped that revision;
  the website checks and deployment passed. PR #60 tracks the startup correction and its validation. Every release
  requires committed-code CI, GitHub validation and successful internal TestFlight processing;
  see Actions and its build-provenance artifact for the exact released SHA/build number.
- The green no-setup release (`af09273`) is now merged into this branch. Its live proxy accepts the bundled origin;
  the web page and its tests remain the owner's unchanged release.
- `CommuteNative`, shared offline snapshots/data-age behavior, Live Activity, AlarmKit, Wi-Fi, geofences and Siri
  remain gated on released contracts; see [ios-readiness.md](../ios-readiness.md) and issue #58. The shell does not
  advertise any native capability as implemented.
- Family account invitations must be accepted before enrollment in the internal group. Real iPhone journey and
  permission acceptance tests remain necessary for the later native features.
