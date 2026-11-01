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
