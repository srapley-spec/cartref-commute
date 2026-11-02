# Approved journey and leg UI
Status: Implemented · Since: 2 Nov 2026

## Story
As a traveller, I want to distinguish the complete journey from each service, keep useful access advice and
follow the same selected journey from a plan through travel and recovery.

## Where it came from
Sam identified that mixed train/journey clocks and disappearing columns obscured the planned customer journey.
He reviewed the rendered recommendation across Commute Leave now, Arrive by, Leave around, Trip and Live,
then explicitly approved implementation and required independent review. The approved design removes the
product heading, puts direction/destination beside Auto/Plan/Live, restores effort advice, puts Total journey
just below the arrow, and changes active duration to Journey remaining. This supersedes the 1 Nov Trip-only
freeze and historical original-start totals in Live.

Visual reference: [approved review](../design/approved-journey-review.html).
Binding component rules: [design system](../design-system.md#approved-journey-and-leg-ui--2-november-2026).

## Acceptance criteria
- Planning headline: canonical Leave by → final destination expected arrival; total pill immediately under the
  arrow and before countdown/next service. Both recommendations remain complete with exact owning actions.
- Active/Live: remaining from now to usable final arrival, across midnight, including waiting, transfers and
  final access. Tick without requesting a feed. Missed/cancelled/unknown final arrival has no numeric promise.
- Three fixed leg columns: timetable departure; independently qualified expected departure/status; expected
  arrival **at the alighting station**. On time, Not live, No estimate and Cancelled keep their column. Arrival
  can remain known with unknown departure, and vice versa. Advertised train destination is separate metadata.
  A cancelled or unknown-departure service is qualified in its service summary, never described as the next train.
- Unselected rail Live is a departure board with separate matched final projection and remaining duration.
  Trip Live is explicitly the loaded first connections; opening it never invents boarding or selects a route.
  Passed required access remains listed, qualified unreachable, with no enabled Follow or arrival-first claim.
- Keep existing walk/fast/run/car/cab thresholds, normal versus qualified alternatives and per-effort winners.
  Trip's selected walk/cycle/drive includes its fixed platform/locking/parking allowances. No new automatic
  Commute cycling grade or GPS inference is introduced. Show selected Trip access modes in the context control.
- Original mode, settings, refresh, direction, pace, diagnostics and simulator handlers survive compact layout.
  The visible product heading and redundant standalone route line disappear. Controls remain reachable in Trip.
  Keep each mode word intact at320px with natural button bases; enlarged text may wrap whole controls.
- Follow is optional. Existing no-Follow inferred stages, probability, correction and service identity survive.
  Exact Next best selection remains authoritative across refresh, view and appearance changes.
- Manual Plan preserves the active route, alerts, original target and return action while the independent query
  loads or fails. Trip's future question survives an unselected Live now board and returning to Plan.
- Trip's timed progression is labelled expected, never confirmed. Explicit current ride lasts until alighting or
  correction; clock-only destination arrival remains unconfirmed. Walking transfers are not boardable trains.
- Changes distinguish between-services gap, supplied transfer and spare. A delay may consume waiting without
  changing final arrival. A broken connection withdraws the final ETA and offers explicit recovery from the
  current/next alighting station after usable readiness, never an inaccessible original-origin departure.
- Explicit recovery retains completed/current legs, original arrival, notices and a reason; includes recovery's
  known access/boarding allowance when testing the next connection. It cannot silently replace a chosen route.

## Tests
- tests/core/journey-leg-contract.test.mjs: "journey remaining: full final instants include midnight, waiting and final access and tick independently of a feed"
- tests/core/journey-leg-contract.test.mjs: "Trip active journey: timetable progression suggests stages and never proves boarding or arrival"
- tests/core/journey-leg-contract.test.mjs: "Trip active journey: broken connections withdraw the final ETA without replacing the selected itinerary"
- tests/core/journey-leg-contract.test.mjs: "Trip active journey: confirmed completed legs cannot create obsolete cancellation or missed-change alerts"
- tests/core/journey-leg-contract.test.mjs: "Trip recovery: starts at the next alighting station when riding and the final station on final access"
- tests/core/journey-leg-contract.test.mjs: "Trip connections: distinguish the service gap, supplied transfer duration and spare without inventing a transfer"
- tests/core/journey-leg-contract.test.mjs: "Trip Live board: retains cancelled and unknown departures, deduplicates shared first services and keeps exact itinerary ownership"
- tests/core/journey-leg-contract.test.mjs: "Trip recovery: rejects original-origin alternatives while aboard and preserves original target, completed legs and reason on explicit replacement"
- tests/journey-leg-ui.test.mjs: "approved journey UI: compact controls keep original identities and destination beside view choices in Commute and Trip"
- tests/journey-leg-ui.test.mjs: "approved journey UI: both complete recommendations place the total immediately beneath their own arrow before countdown"
- tests/journey-leg-ui.test.mjs: "approved journey UI: Trip Live loads current departures while preserving the future planning question for return"
- tests/journey-leg-ui.test.mjs: "approved journey UI: active Trip stays available while an independent plan loads or fails"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: Follow retains rail duration and updates journey remaining through every phase"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: manual planning retains the chosen service, original arrival and active cancellation alert"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: Next best selects its own itinerary and confirmation stays separate from clock progression"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: an unreachable selected-access departure stays listed with no enabled Follow or arrival-first claim"
- tests/trip-shared-ui-review.test.mjs: "Trip shared UI review: explicit recovery preserves the completed train and original destination promise with a reason"

- tests/journey-leg-ui.test.mjs: "approved journey UI: an expired unselected Trip Live pin restores its preserved planning question and matching result"

## Limits
Live Trip boards show the connections already loaded for its station-pair plan, within the existing six-board
budget and refresh rules. Endpoint status reflects the available provider evidence. Trip stage suggestion uses
timetable and explicit answers; this release does not add a new location tracking algorithm. Independent
Chromium/mobile-layout and mutation review supplements the fixture tests; real Safari and live feed reliability
remain environment-specific checks.
