# Journey and connection panels — 1 November 2026

Sam approved the rendered **journey + train panel** option and requested it in modes other than Live.
The [design system](design-system.md#journey--train-panel-sam-1-november-2026) and
[acceptance story](stories/signal-design-system.md#journey--train-panel-sam-1-november-2026) record the contract.

## Result

- Auto and Plan retain Leave by / destination arrival, an exposed precise leave countdown and centred
  journey-duration facts. A separate panel gives the scheduled train departure proper prominence, with
  boarding station, operator, platform and truthful running status. Changed expected departure gets its own
  equally prominent labelled clock. Unknown journeys retain their service and warnings without a usable deadline.
- Both complete recommendations and every planning row use the hierarchy, across the three planning questions,
  both directions and Commute/Leisure. The chosen pre-boarding Follow route and proposed alternatives use it too.
- Trip repeats the same injected connection component for each existing train/Tube/bus ride, retaining changes
  from the engine. Follow shows the remaining rides using the engine's ride index. Auto's homeward Tube keeps
  its arrival headline and exposes the existing next rail connections as panels.
- Explicit Live keeps its timetable/current-journey templates. Once aboard, arrival and next action still lead.
  There are no routing, timing, ranking, feed, preference-schema, location or view-override lifetime changes.
  The pure presentation headline contract now agrees with the approved Auto/Plan station/walking hierarchy.

## Verification before release

The new page probes cover the question/direction/mode matrix, scheduled/expected clocks, early running,
timetable/derived confidence, unknown platforms, unusable journeys, chosen Follow identity, explicit Live,
four-train Trip planning/Follow and the next rail connection on a homeward Tube. Existing assertions that
specified the superseded Auto station columns now check the panel or explicitly select Live to retain the
old timetable semantics. Ranking and timing assertions remain.

Executed Chromium checks cover 32 ordinary and 32 doubled-text scenes, four multi-ride Trip scenes in light/dark
at 320/393 px (including Follow and doubled text), and eight Follow/disclosure/refresh scenes. Explicit Live's
hero and board DOM match the preceding production build. The first doubled-text run caught a planning-row
implicit-column width problem; making those rows a single full-width column fixed it. An immediate countdown
update was scoped to non-Live views to preserve Live's existing rendering behavior.

All 17 changed golden recordings were audited recursively: only rendered hero/row text changes. Canonical
options, leave/arrival times, ranking, flags, legs, feed requests, errors and every other field are unchanged.
The new hierarchy moves the small inline train identity into a visible panel, changes its platform label and
retains the leave countdown. Inapplicable/unusable journey clocks now explicitly say Unavailable.

Focused regression suites and the golden suite pass. Type checking, story links and whitespace checks pass.
The full committed-code local CI, branch GitHub CI and required independent review must pass before merge;
then verify Tests and Pages for the exact main commit. **GitHub-first release path**: the page assertions exercise
station and Follow view transitions, so use both machines before publishing this cross-view presentation change.

Browser artifacts are written to `/workspace/scratch/journey-connection-panels/`; the test emits the built page's
SHA-256 with its result. These are Chromium checks; physical iPhone Safari/VoiceOver verification is separate.
