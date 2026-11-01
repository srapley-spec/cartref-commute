# Panda retirement and Signal functionality audit — 1 November 2026

Status: latest-main reconciliation in progress; separate independent reviewer is actively reviewing the combined candidate.
This records executed evidence, not independent sign-off by the implementation author.

Approved by: Sam
Retired UI: design:panda

Sam asked to deprecate Panda, preserve it on a branch, independently check Signal for lost functionality,
and remove the Signal toggle and parity rule. This supersedes the 31 October design concurrency, registry
and switch-off restoration requirements. Follow and Along the line retain their independent preferences.

## Archived source and recovery

The remote branch [archive/panda-2026-11-01](https://github.com/srapley-spec/cartref-commute/tree/archive/panda-2026-11-01)
points at `a27b1f6af96ce133762353df3924c841e752ae94` (latest pre-retirement main). The original `0d6bf6e103246fefa68412d90f58d314af1cad9d` snapshot remains in its history.
Its GitHub Tests and Pages runs succeeded before reconciliation. The branch includes both designs, all Panda
styles/documentation, tests, build and lockfile, and the former parity machinery.

Inspect it without changing the active app:

```sh
git fetch origin archive/panda-2026-11-01
git worktree add -b restore/panda ../cartref-panda origin/archive/panda-2026-11-01
cd ../cartref-panda
npm ci
npm test
```

A future reintroduction should integrate subsequent engine fixes and follow normal release review.

## Functional inventory

The audit compared the pre-retirement Panda page, its component inventory and acceptance stories, Signal's
preservation/counterexample tests, actual rendered views and 22 recorded journey scenarios. Retirement makes no changes to the pure engine, profiles, provider adapters, endpoints or polling policy relative to the integrated main.

| Panda capability | Signal destination and retained evidence |
| --- | --- |
| Commute/Leisure, direction, pace | Original controls/handlers in Journey options; effective context in summary; app/rules/any-place/compact-control tests |
| Leave now, Arrive by, Leave around | Exposed controls, dates/deadlines, future/tomorrow goldens, planning override and focus tests |
| Best, next best, every train | Primary card, expandable Next best and full board; cancelled/no-estimate/unreachable rows and engine order retained |
| Train/Expected/Arrive, platforms, alternate stations | Shared departure semantics; station/multi-station platform tests and browser time anchors |
| Effort, standing room, slow trains, earliest arrival | Existing engine flags, effort/rules suites and qualified arrival-first counterexamples |
| Live before travel, denied location | Auto/Plan/Live with Follow off, real Live departures and awaiting-location fixtures; no invented service |
| Rail inference, selection, correction and reports | Live hero/progress, uncertain and confirmed identity, conflict and stale/unknown/cancelled report tests |
| Interchange and Tube in both directions | at-hub/on-tube/on-tube-home fixtures, original choice handlers, selected vehicle, Aldgate recorded-feed and connection tests |
| London, office arrival, final walk, unknown home | in-london/nearly-home fixtures, app/logic/goldens; unknown ETA remains unknown |
| Follow, original arrival, recovery, stop and pinning | Independent Follow setting/controller, follow/transport/migration suites and settings/reload upgrades |
| Disruption, full notices, every line's status | Significant impacts exposed; full Travel alerts and Lines & data reachable; warnings/source/browser checks |
| Demo/timetable/live, stale/partial/failed feeds | Explicit provenance, last-good data, retry/failure/rate-limit tests and unchanged requests |
| Settings, home, providers, timings, appearance | Original dialog, keyboard focus, and upgrades with absent/false/true legacy design values |
| Along the line, interests/depth and uncertainty | Independent opt-in/header entry/dialog, canonical facts/disruption, composition/review and phone-browser tests |
| Simulator and source isolation | Same production controller, routes/directions/sources, context reset, stop/reload and simulator suites |

The real semantic assertions remain as ordinary tests in `journey-views.test.mjs`,
`journey-facts-review.test.mjs` and `browser-journey-facts.py`. The registry, validator, parity-only command,
enforcement-only tests, CI comparison base and working-rule mandate are removed. Former design-duplicate
scenarios now exercise light/dark appearances or run once in the sole production design. An isolated
subprocess test proves the runner still discovers page/core tests and propagates either suite's failures.

## Findings and fixes

1. **Existing Signal gap: ambiguous Next best platform.** A service boardable at Farringdon and St Pancras
   advertised the first platform in an unqualified compact label. Panda associated each platform with its
   station. Signal now omits the misleading single-platform label and retains each station/time/platform
   alternative in the collapsed summary. The original platform regression also checks that actual summary.
2. **Caught during simplification: detached location control.** An early layout draft moved controls through
   detached containers, leaving location inside collapsed options. Chromium caught it. Layout containers now
   stay attached while original nodes move, with an additional default-page location visibility assertion.
3. **Stale expectations corrected.** Tests now verify Signal's location diagnostic and direction separately,
   and open Lines & data to check the full moved status strip. An older browser expectation of an empty Live
   screen was already superseded by the next-stop departure board and is corrected accordingly.
   The first clean full run executed 913 tests: 908 passed and five remaining Panda text-order/location/line-strip
   assertions failed. Those assertions now check the same facts in Signal's semantic blocks and accessible
   disclosures, plus explicit direction/context at the original arrival thresholds. No engine changes were needed.
   All simulator cases passed in that run; redundant former-design replay copies are removed rather than
   doubled as light/dark semantic runs. Each route/direction still runs in Signal, with 18 appearance/browser
   combinations and all four full browser journeys checked separately.

## Executed verification

- Typecheck and story-link checks passed during implementation.
- All 22 golden scenarios were regenerated and reviewed: **every engine option set (timings, ranking, flags,
  legs and boarding alternatives), request list and error list is unchanged**. Board rows, full banners and
  diagnostics also remain unchanged. Hero differences reflect compact summaries, moved line status and
  qualified progress. Recordings now separately capture context, full line status, impact summary and
  significant disruptions, so moving content cannot erase coverage.
- Targeted view/compact/status checks passed (52 tests before final platform/location refinements);
  upgrade and runner checks passed (5 tests). Final committed-code whole-suite results belong to the PR checks.
- `browser-signal.py` passed: keyboard Settings/focus, manual views, selected route, persistence/reload,
  light/dark, enlarged text and simulator entry; zero page errors.
- `browser-signal-journey-clarity.py` passed for build SHA-256
  `91bcfda2bc962d9375ea232f2f873a8b4b924609ebeea6ebda96cbee7eaa2c03`:
  20 journey-state captures, 60 disruption cases, 36 location cases, 12 appearance overrides, phone widths,
  doubled text, time anchors, touch/contrast checks, rail ahead/behind/stale/timetable and guarded Tube evidence.
- `browser-along-access.py` passed: actual opt-in, checkpoints 0–4, light/dark at 320/390 px,
  browse/onboard transition, passed-point reading, empty-interest/reopen position, focus and 44 px targets.
- `browser-journey-facts.py` passed on the same build hash: 24 view scenes and 24 doubled-text scenes,
  four Follow scenes, two active-rail scenes (also enlarged), Tube connection counterexamples and Follow-disabled
  controls. Zero page errors.
- `browser-signal-compact.py` passed all 20 layout cases: density, full board/cancellations, notices, adjustments,
  Plan, Follow and doubled text. Its old density thresholds failed unchanged archived Signal too: answer top
  330.8125 px and maximum row 202.53125 px in both builds. The candidate board starts 20.796875 px lower because
  the collapsed alternative now retains boarding station/time/platform facts. The check now measures compact
  layout overhead separately from required visible location/status/disruption evidence and the additional
  boarding facts; all significant alerts must remain visible. The row cap accommodates the current duration
  facts. No application styling was altered to satisfy this stale pre-clarity test.
- All 12 deliberate breakages were caught: defaults, migration, trip persistence, platform alternatives,
  location, canonical order, progress, status, settings/feed isolation and runner failure propagation.
  [Recorded results](panda-retirement-review-results.json) include exact failing regression names, the archive
  geometry comparison and the candidate build hash. These are author evidence, not independent sign-off.

## Remaining review and limits

A separate reviewer who did not implement the change must compare archive/candidate, probe edge cases and
mutation-test the final code before merge, as required by `CLAUDE.md`. The independent reviewer is now checking the latest-main integration; sign-off will be recorded before merge. Clean committed-HEAD local CI
and GitHub green are required because saved settings and build/test machinery change. Main remains live and
is not changed before these checks.

No live transport credentials or real iPhone/VoiceOver session were available. Chromium covers its fixtures
and geometry, not provider-wide reliability or complete hardware accessibility.

## Latest-main reconciliation (1 Nov)
Before release, main advanced to `a27b1f6`. It adds the separately enabled Trip mode, stable train/total
duration anchors and the precise departure countdown. Those changes are retained; the eight Trip view
contracts remain ordinary regression cases, and an old disabled Signal preference cannot hide an enabled Trip.
The independent review and final full checks apply to this combined candidate. The archive was fast-forwarded
without rewriting history to retain this final Panda implementation as well as its initial snapshot.
