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
No native build has been uploaded from this branch; local export is not Apple review submission.
