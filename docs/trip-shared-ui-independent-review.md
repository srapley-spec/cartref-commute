# Trip shared journey UI — independent review, 1 November 2026

Candidate `c21e26e`, compared with main `c299074`, in a separate detached worktree. The reviewer did not write
the implementation. Scope: complete shared Trip cards, both recommendations, lists, Follow phases, canonical
duration facts, source qualification and per-card disclosure identity. Actual Google/live services are outside
this fixture-based UI review; the change adds no service requests or saved-state schema.

The candidate passed 19 targeted core/page tests. Six deliberate one-line source mutations were rejected:
including transfers/non-rail rides in rail duration; inventing a total when access is unknown; ignoring a
cancelled/unknown train; omitting the first connection; using the wrong Follow target; discarding the open steps
state. Logs are session artifacts under `/workspace/scratch/trip-shared-ui-review-mutations`.

An independent real-page phase probe found one gap: duration facts were exposed only before setting off. Access,
ride, change and final-leg Follow cards lost both facts, although Commute Follow retains them and the shared
journey-facts contract applies wherever the itinerary is shown. Arrival/next action should remain first, followed
by the same canonical facts; the total must not become time remaining. The independent regression is
`tests/trip-shared-ui-review.test.mjs`. Release requires that test to pass on the corrected candidate, along with
the existing unknown/cancellation/source-confidence tests and release checks.

## Later scope correction from Sam

Sam froze Signal's existing UI and all non-Trip functionality for real-world testing, requiring express direction
for changes outside Trip. The commute redesign and separate Trip proposals are withdrawn. The independent
functional review above does not constitute acceptance of their visual design.

The pending branch restores the original non-Trip CSS rules and normal countdown-rendering behaviour; remaining
stylesheet changes are confined to Trip selectors. Ten targeted Trip/source-confidence tests pass. A separate
before/after browser comparison of the saved `c299074` release and candidate produced identical full-app screenshot
hashes in 16 states: Auto, Plan, Live and preboarding Follow at 320/393 px in light/dark (build/freshness footer
metadata hidden equally). Evidence is in `/workspace/scratch/trip-only-scope/signal-freeze-check.json`.
Sam then selected the current commute screen as the fixed reference. After sharing the actual recommendation
renderer and existing Journey options host, 24 sampled full-app screenshots match the saved release, including
both recommendations' expanded Journey steps. Trip uses the current components, with no new Signal palette or
card design. Its place names and controls are scoped to Trip; returning to commute restores the existing screen.
Rerun full checks and independent review on the final Trip-only candidate before release.

## Independent review of the current-Signal Trip controls

Reviewed `4b6ef2a` in `/workspace/scratch/trip-only-final-review`, separately from the implementation worktree.
The current commute screen is the fixed reference; historical blue-card proposals are excluded. No further
implementation defect was found in the reviewed delta. Eleven existing focused checks and four independent
lifecycle regressions pass. The new probes cover the original field nodes, typed query/caret/focus and keyboard
selection through a theme redraw, a late place reply after leaving Trip, saved-active startup with simulated feeds
off/on, and feature-off/re-enable cleanup with the original access-mode handlers.

Six deliberate one-line mutations were rejected: re-appending the focused form, leaving its controls in Signal on
exit, allowing the hidden Trip error renderer to overwrite commute context, forgetting moved access controls,
not mounting saved-active Trip in the shared host, and changing the shared recommendation padding. The last
mutation fails the immutable `c299074` screenshot comparison even though both candidate modes would share the
modified padding. After restoring the source, all six independently replayed dark/393px baseline screenshots
match again. Mutation logs are under `/workspace/scratch/trip-only-final-review-mutations`.

An initial test expectation that an obsolete planner success would render after leaving Trip was corrected:
the existing source epoch rejects it. The regression instead exercises the reachable late Google-place error
render and proves that this hidden renderer cannot change the commute context. This was a test assumption,
not an application finding. Full committed CI, the remaining browser matrix and exact-main release checks are
the releasing agent's responsibility.
