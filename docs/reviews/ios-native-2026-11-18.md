# Native iPhone independent review — 18 November 2026

Scope reviewed: `75351bdba43cd5704cc09fb337673e4bbe2e5886`, draft PR #61. A separate agent reviewed and mutated
its own worktree; it did not write production code or access private signing inputs/accounts.

Baselines: 30 Swift package tests and 12 Node release/shell tests pass. The earlier native foundation also passed
all eight simulator XCTest checks at `5f39b01`; final combined simulator/committed-code CI remains a release gate.

## Findings fixed
- Bind Keychain registration to its proxy independently of the JSON configuration commit.
- Ignore obsolete Wi-Fi/region callbacks and permission timeouts.
- Reject unsupported nested payload versions before shape decoding.
- Clear a completed surface worker before waking callers, so a queued update cannot be stranded.
- Observe only the retained Live Activity identity before ending duplicates for the same followed journey.
- Adopt validated newer ActivityKit content before alarm work; a newer cancellation must not schedule the old alarm.
- Cancel obsolete alarms immediately on accepting a directive, before waiting for ActivityKit; cancel a superseded
  in-flight schedule as soon as it returns, before the next platform operation suspends.
- Include the headline clock in the alarm presentation identity and accept Trip's nullable direction.

All eight original foundation mutation survivors are caught. All 13 critical coordinator/state probes are caught,
including intermediate-state assertions during suspended platform calls. All five signing-test survivors are
caught: bypassed release-time profile validation, extension minimum OS/device family, incorrect export profile
mapping and missing workflow secret. Additional probes catch disabled archive signing and non-null Trip direction.
Existing probes cover signing cleanup, secret isolation, extension entitlements and team identity.

The reviewer approved the implemented scope. Owner contract gaps, physical-device behavior and final full CI remain
outside that approval. The root agent separately performed the real signed export: the first attempt was rejected
for missing native entitlements, traced to an unsigned archive. Signing each target's archive with its App Store
profile fixed it; the final `75351bd` app+extension IPA passed identity, content and entitlement verification.
Apple package validation of that IPA also passed with no errors. No native build has been uploaded from this branch; local export is not Apple review submission.

## Siri follow-up
At `de3fa31`, the reviewer passed the 31-test Swift baseline and caught all ten Siri renderer mutations: missing
follow, exact URL, engine wording/clock, source age, unknown freshness and stale flag/deadline behavior. Static
review found `OpenURLIntent` unsuitable for the custom scheme; the implementation now uses foreground modes and
the existing bridge event. Review at `29e89fb` approved the already-foreground, permitted transition and unavailable
transition branches. No page planning event is emitted before a required transition completes.

Full local CI at `dada2fd` subsequently passed all 1,440 web tests and its simulator checks. This does not replace
the final combined HEAD CI or physical-device acceptance once the owner contract gaps are resolved.

## Alarm permission and identified-stop follow-up
Review of `c791024` found five additional test gaps. Regression probes now cover the remote envelope's inability
to start/switch a journey, 256-byte stop identifiers (including multibyte text), overlapping alarm requests while
the first OS prompt is suspended, removal of actual queued evidence on a stop, and the cleared state reaching the
Apple adapter before a push finishes. These are test additions; the reviewed production guards remain unchanged.
At `bb7e489`, the reviewer approved the follow-up: all five survivors now fail assertions, with 34 core and ten
copied-runtime tests passing in the inert macOS harness. Final simulator execution remains required. The preceding
local simulator attempt failed in iOS data migration before app tests started; it is not a passing app test result.

## Countdown integration and layout
The native renderer uses the supplied calm/urgent/passed state; it has no clock-based urgency rule. The owner
accepted last-received wording while offline in issue #58 comment 6977690109; state-change publishing is on their
side. Native tests cover exact words, passed/empty output, old v1 cache decoding and all expanded engine fixtures.
An urgent long-label layout probe initially exceeded 160 points (174 at 320-point width). Interpolating Apple's
system timer into the countdown text removes the fixed timer column, while explicit vertical text sizing keeps
both headline labels complete. The same production-view probe now measures 158 points with full headline,
destination, urgency, status, platform, progress and age. This is a macOS SwiftUI preview, not device acceptance.

Review at `4dc0991` passed 35 core tests and 11 inert runtime probes. Eight countdown mutations, missing production
attachment and an unexpected-null fixture were caught. Removing validation of the two transition timestamps
survived; direct model tests now cover each field with nil/zero/positive, negative, infinity and NaN values. The
expanded 36-test core baseline passes. At `9a68440`, the reviewer confirmed eight assertion failures when both
guards are removed and approved the countdown/activation scope. All nine countdown mutations are caught.

The final owner integration, real Capacitor bridge execution, committed-code CI and physical acceptance remain
separate release/testing gates; this approval does not imply those results.

## Nullable cache metadata follow-up
At `9ce934f`, the independent reviewer passed all 38 core tests and caught eight of nine cache mutations.
The surviving mutation substituted `savedAt` for a nil source age in the public initializer; the wire decoding
tests did not exercise that construction path. A direct constructor and persistence round-trip assertion now
cover it. At `6254bdc`, the reviewer confirmed three assertion failures from that mutation and approved the native
cache changes: all 38 tests pass and all nine mutations are caught. The reviewer also identified Swift's escaped-slash byte
counting difference from JavaScript; the page owner addresses packing against that native encoding in
`fix/native-cache-boot`, alongside explicit null replacements and hydration before fetching.
The review of its first revision (`d050266`) found token listeners could still sync before hydration and that
initial configure used defaults before restoring cached settings. Both findings were handed to the page owner
on #58; native code must not invent a workaround for the page's configuration order.
The reviewer confirmed `88c0a67` addresses both: early tokens cause no configuration/proxy calls, and completion
orders cache application before configuration, ready/replay and proxy calls, with restored settings throughout.

## Simulator readiness diagnosis
Local OS bootstrap failed repeatedly before Commute installation, including with no other simulator running.
Retained diagnostic logs identify a 30.0226-second MobileSafari migration watchdog; restarting that device retains
the failed migration status. Runtime cache and temporary-directory permissions are valid. Running Xcode's test
operation on that device nevertheless executed all 13 app tests successfully at 15:08, with no skips.
The independent reviewer endorsed delegating readiness to Xcode in principle, conditional on this evidence and
fresh-device validation. The runner now creates its own device and goes directly to `xcodebuild test`; all XCTest
assertions, per-test/outer deadlines, failure propagation and no-retry behavior remain. CLI regressions cover
cleanup when a device never booted and unexpected cleanup failures. Review and a fresh complete CI remain required.
The first runner review found two test gaps: restricting execution to only the bundled-page tests, and treating
a killed Xcode child (no exit status) as success. The CLI probes now reject both forms of `only-testing` and run
an actual SIGKILL child case, verifying failure and cleanup. Production already handles these correctly; survivor
rechecks passed at `79c108c`. The reviewer approved the runner implementation and tests: seven baseline tests pass
and all 16 mutations are caught, including test filtering, signal termination, deadlines, retries, destination
ownership and cleanup failures. Fresh-device execution and final combined CI remain separate release gates.
The fresh-device gate subsequently passed at `c2a0325` with the production runner: all 38 core tests and all 13
XCTest checks passed, no skips, at 15:25. Xcode managed startup of a newly created simulator, and the runner removed
that device afterward. Final combined CI after owner integration remains required.

## Final Trip source-age integration
Full local CI and both GitHub runs at `1847cf8` passed with the released owner startup/cache fixes: 1,456 web tests,
38 Swift core tests and 13 simulator XCTest checks. A subsequent page finding (#62) showed Trip's age being replaced
by the redraw time or an unrelated Commute fetch. The owner corrected this in `e3e214a` and added successful/failed
board regressions at `54cb185`; native code continues to preserve the supplied metadata without interpreting it.

Independent review of `54cb185` passed the 13-test native-page baseline. Its two added tests (`f81b221`) use the
actual Trip controller and engine board budget with deferred responses to cover distinct fetch times and a missing
required board. Both tests pass. All five mutations are caught: always-unknown age, newest instead of oldest source,
counting a failed fetch as success, ignoring a missing required board and retaining ages on reset. The reviewer
approved the bounded production fix with these tests included; final combined CI and the owner's reported checks
remain release gates, with release evidence recorded in PR #61.

Nonblocking follow-up for the page owner: `createTripUi.reset()` currently has no production caller. A controlled
probe found that a response started before reset can advance the new `boardOkAt` after a newer response completes,
because the board assignment captured the old object while the following timestamp update reads the new object.
Any future production use of reset needs request-generation handling. This is not a reproduced current user path
and was not expanded into this release.

**Closed 19 Nov (Sam's follow-up).** The exact cause, in `live()`:
- `liveBoards[b.key] = await fetchBoard(…)` evaluates `liveBoards` before the await, so a late success wrote into the
  old, discarded object. The `boardOkAt[b.key] = now()` that follows read the new object, so it advanced the new age.
- A late failure's `liveBoards[b.key] = undefined` ran after the await, against the new object, so it cleared a
  newer request's board.

Fix: a request generation (`liveGen`), increased by `reset()`. A response from an older generation writes nothing,
and the rest of that `live()` run stops. `reset()` also clears the 30 s spacing, so the next refresh loads at once.
Ordinary successes and failures are unchanged. Tests: `tests/trip-reset-race.test.mjs`, which resets during an
outstanding request, starts a newer one, then delivers the old response as both a success and a failure. Both failed
before the fix.

**Independent review of the fix (19 Nov):**
- 11 Trip mutations, 7 killed.
- It found the same overlap could happen without a reset: an old request still out when a newer one starts for the
  same board, after the iPhone suspends the app and the clock jumps past the 30 s spacing. A late failure then cleared
  the newer board while its age still said fresh. Fixed with a per-board request number, and tested.
- A board that loads and later fails is still cleared (now tested).
- Survivors:
  - the check after all responses (the rest of that run only recomputes from the cleared state, so nothing
    observable changes; kept as a guard);
  - `const`/`let`;
  - a duplicate check.
- **`reset()` still has no production caller**: only the tests call it. The fix is correct but latent. Whether a change
  of live-data source should reset Trip (as `invalidateSources` does for the commute) is an open question for Sam.
  **Closed 19 Nov:** Sam said yes. `invalidateSources()` now calls `tripUi.reset()`, and the next refresh plans the
  trip again from the new source (`docs/stories/leisure-journeys.md`, "Live, and keeping you up to date").
