# Signal integration with released main

Main advanced from `47c82c7` to `be1e58e` while Signal was under review. The branch merges that main commit,
preserves its simulator controls and recorded feeds, and integrates Follow into a single shared controller.

## Regression preservation

The seven engine scenarios formerly in main's `tests/core/follow.test.mjs` are all retained in
`tests/core/follow-main-regression.test.mjs`. The nine page scenarios appended to main's `tests/rules.test.mjs`
are all retained in `tests/follow-main-regression.test.mjs`. They use the same journey times and actual UI paths,
with assertions translated to the shared API and controls. Earlier rule tests and all Panda golden files remain.
The independent reviewer checks this mapping before release.

Intentional corrections are explicit: main's global 5/15-minute train bands replace the older follower's
5-minute red band; changing boarding station is proposed for consent; actual journey evidence determines
completion; uncertain departure grace asks for confirmation. Arrival improvements supersede obsolete arrival
messages while unrelated current alerts remain. All seven/nine scenario groups include these boundaries.

## Saved users

The released `settings.follow` and `follow` keys are supported. An explicit new opt-out wins. Migration waits
for a real matching service, original boarding point/day and itinerary; unavailable data cannot choose another
train or invent the missing route. The original record stays intact, with original/expected arrival, onward
allowance, explanations, acknowledgements and declined alternatives preserved. Stop clears the active and legacy
selection. Released planning pins keep their original age and are compared with reliable current situation
evidence; their planning question and time are retained. Engine and page migration suites cover these paths.

## Follow-ups from main's second review

Main recorded five low-risk follow-ups. These are now covered: Seen/ack wiring; actual inferred boarding;
reinstatement after acknowledging cancellation; same-train calls with different station timing/readiness; and
real adapter direction/line/station/freshness filtering. See the Follow, transport and independent review suites.
Recorded Met vehicle evidence is preserved; missing Met departures at Aldgate and real iPhone/VoiceOver remain
separate documented limitations.
