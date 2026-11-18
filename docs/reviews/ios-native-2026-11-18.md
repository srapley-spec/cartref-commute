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
