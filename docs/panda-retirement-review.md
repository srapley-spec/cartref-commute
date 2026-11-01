# Panda retirement and Signal functionality audit — 1 November 2026

Status: separate independent functionality and mutation review satisfied.
This author inventory is complemented by the [independent report](panda-independent-review.md);
final committed-HEAD release checks are recorded on [change #46](https://github.com/srapley-spec/cartref-commute/pull/46).

Approved by: Sam
Retired UI: design:panda

Sam asked to deprecate Panda, preserve it on a branch, independently check Signal for lost functionality,
and remove the Signal toggle and parity rule. This supersedes the 31 October design concurrency, registry
and switch-off restoration requirements. Follow and Along the line retain their independent preferences.

## Archived source and recovery

The remote branch [archive/panda-2026-11-01](https://github.com/srapley-spec/cartref-commute/tree/archive/panda-2026-11-01)
points at `dc1918905ec6e4d12da0b95a1290c5e429a98dcf` (latest pre-retirement main). The original `0d6bf6e103246fefa68412d90f58d314af1cad9d` snapshot remains in its history.
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

The initial evidence below compares retirement against `0d6bf6e`. The latest-main reconciliation and separate
review below cover subsequent Trip, duration/countdown and progress changes.

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

## Independent review, release checks and limits

A separate agent who did not implement the retirement completed the [functionality and test review](panda-independent-review.md):
nine new upgrade/control/Trip/simulator regressions, thirteen effective deliberate breakages caught, and eight native
Chromium layouts. The reviewer independently compared archived/candidate source and all 22 option/request/error
recordings. Its [regressions](../tests/panda-independent-review.test.mjs),
[browser check](../tests/browser-panda-independent-review.py) and
[mutation evidence](panda-independent-mutation-results.json) remain in the repository.

The review's satisfied decision is separate from the author's checks. Release uses clean committed-HEAD local CI
and GitHub green first because saved settings and build/test machinery change. Once those pass, merge and verify
Tests/Pages for the exact main commit and the live app; no further routine approval is required. Final exact-commit
results belong to [change #46](https://github.com/srapley-spec/cartref-commute/pull/46).

No live transport credentials or real iPhone/VoiceOver session were available. Chromium covers its fixtures
and geometry, not provider-wide reliability or complete hardware accessibility.

## Latest-main reconciliation (1 Nov)
Before release, main advanced through `a27b1f6` and `a45f08d` to `dc19189`. These updates add the separately enabled Trip mode, stable train/total
duration anchors, the precise departure countdown and progress tied to the displayed train rather than a
different Follow selection. Stage labels, simulator verification and the centred Total journey revision remain present. Those changes are retained; the eight Trip view
contracts remain ordinary regression cases, and an old disabled Signal preference cannot hide an enabled Trip.
The independent review and final full checks apply to this combined candidate. The archive was fast-forwarded
without rewriting history to retain this final Panda implementation as well as its initial snapshot.

The reconciled source passed 65 focused Trip/retirement/view cases and all 22 regenerated golden scenarios. Five
old inline-sentence assertions exposed by main's newer duration row were corrected to check service identity,
exact numeric duration, selection/order and their existing flags. The independent reviewer replayed all five.
On the final source, the 48 progress/verification tests passed, and the new progress browser check passed light/dark
at 320, 393 and 1280 px with normal and doubled text. The pre-centred source-bound built page SHA-256 is
`9e0f6ace49346801a0a6a871b41f7c92814ef07476e77a1df14efde116f4dd99`.
The previous integrated source also passed native controls, journey clarity, journey-facts and stable-duration
checks. All current engine options, requests and errors remain identical to the final archive in all 22 goldens;
only presentation recordings changed, including the retained Done/Now/Next stage labels.

The final main integration also retains the approved centred **Total journey** lozenge and separate train caption.
It uses that wording unconditionally in the sole design, with unknown totals still explicit. Acceptance stories
and native Plan/Live/station/Follow checks follow the new centre anchors; the numerical facts are unchanged.

The old compact-density limits also failed the centred layout on unchanged archived main: 393 px board rows are
identical in archive/candidate (230.953–255.547 px), with 45 px duration blocks. The candidate board begins
20.796875 px lower because it preserves alternate boarding facts. Compact checks now measure row/board overhead
apart from visible duration blocks, bound normal 393 px duration blocks to 48 px, and retain the 220 px row-overhead
limit. Canonical facts, visibility, overflow, overlap, touch, contrast and full notices remain checked. The new native
centre-anchor checks and ordinary journey-facts browser scenes pass on final-source build SHA-256
`1f995b39e663a5fa80b9c80625c9b2d6df49359eb9b0e7d50b56d3e59a4157a4`.
