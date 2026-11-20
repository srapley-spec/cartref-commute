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
  While it waits, a dropped check (network failure, timeout, HTTP 429 or 5xx) is logged and retried every 15 s until
  the 30-minute deadline; Apple rejecting the build, refusing the key (4xx) or the run being cancelled is not retried.
  (19 Nov: build 14 from `4ad81b4` uploaded, then one poll failed with "fetch failed" and the release was reported
  as failed, though the upload had gone through.) Test: `tests/ios-release.test.mjs`, "TestFlight wait: a dropped
  check is retried".
- A merge made by "Merge when green" (20 Nov) is a push by GitHub's own token, which starts no workflows. So the
  pipeline dispatches Tests on main itself, and that run's last job (after the web and iPhone jobs pass) dispatches
  TestFlight with the commit and the run id. Before any signing, TestFlight checks through GitHub's API that the
  commit is on main and that this Tests run, on main for that commit, passed both jobs; the release script accepts
  only those two events (a main push's completed Tests run, or this dispatch). Tests: `tests/ios-shell.test.mjs`,
  "a pipeline merge reaches TestFlight…" and "iOS release accepts a dispatched main commit…".
- Only successful pushes from this repository's main branch (or the checked dispatch above) may access signing inputs. PR validation has no signing
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
- tests/ios-shell.test.mjs: "iOS release accepts a dispatched main commit only with its Tests run, and only from the two trusted events"
- tests/ios-shell.test.mjs: "a pipeline merge reaches TestFlight: Tests starts it only after both jobs pass on a dispatched main run"
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
  and eighteen-minute xcodebuild limits cover setup, destination startup and test-manager hangs before any test
  starts. A timeout fails the run and still cleans up its disposable simulator. There are no automatic test retries.
  **18 Nov readiness correction:** create a fresh owned device and let `xcodebuild test` manage its startup,
  as in [Apple's command-line testing workflow](https://developer.apple.com/library/archive/technotes/tn2339/_index.html).
  The former separate `simctl bootstatus` gate rejected a stock MobileSafari migration watchdog, before Commute
  installation. On the retained diagnostic device, Xcode subsequently executed all 13 app tests successfully,
  with no skips or changed assertions (15:08 on 18 Nov). This delegates readiness to Xcode; it does not repair
  Safari migration or treat OS diagnostics as app test success. The same tests must pass on a new disposable
  device and in final committed-code CI. Cleanup handles a device still Shutdown after an early compile failure;
  unexpected cleanup failures fail the run without obscuring an existing Xcode failure status.
- tests/ios-simulator.test.mjs: "Xcode manages readiness on one fresh disposable simulator, without a separate OS migration gate"
- tests/ios-simulator.test.mjs: "simulator test failures propagate after disposable device cleanup"
- tests/ios-simulator.test.mjs: "hung simulator setup and xcodebuild fail within an outer deadline and clean up"
- tests/ios-simulator.test.mjs: "the normal iPhone test command enforces its production outer deadlines"
- tests/ios-simulator.test.mjs: "a compile failure before boot keeps the Xcode failure and deletes its still-shutdown device"
- tests/ios-simulator.test.mjs: "a killed Xcode process cannot count as a passing test run and its device is cleaned up"
- tests/ios-simulator.test.mjs: "unexpected simulator cleanup failures cannot turn an Xcode failure into success or hide its status"
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
  are being implemented against the now-released `9628132` contract in draft PR #61; see [native story](ios-native.md).
  The released shell still advertises no native capability. The draft keeps Live Activity/alarm disabled
  pending the remaining owner contract answers and final integration checks.
- Family account invitations must be accepted before enrollment in the internal group. Real iPhone journey and
  permission acceptance tests remain necessary for the later native features.
