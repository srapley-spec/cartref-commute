# Presentation model: the engine decides what comes first
Status: Implemented in Signal, the sole design since 1 Nov · Since: 29 Oct 2026

## Story
As a commuter glancing at the phone, I want the thing that matters most to be first on every screen, however the
app is drawn, so that a redesign, a widget or a Live Activity can never bury the leave time under controls, or hide a
cancellation behind a milder notice.

## Where it came from
29 Oct, comparing design proposals: each one re-decided the screen order for itself ("Signal" put the first number
below a brand header, two control rows and an editorial title; the current page puts it below three control rows and
a banner stack). Sam: the order of what's shown is an engine decision, not a presentation one. The split is:
**priority** (which view, what the headline means, how bad things are, which block first) belongs to the engine;
**geometry** (pixels, cards, where controls sit) belongs to the shell.

Reviewed after merging (29 Oct evening): 47 deliberate one-line breakages of `present.ts` and its page wiring; 18
went unnoticed at first. The original remaining gap was the undrawn live-view order. Signal now annotates
semantic block boundaries and draws the actual live cards in the engine's order; the new page probes exercise
that integration, including a deliberate change to the model order. Panda was subsequently retired on 1 Nov; its source remains on the archive branch.

## Acceptance criteria
- `src/core/present.ts` is pure (no DOM, no sizes) and exports: `chooseView(situation)`, `headlineKind(view, ctx)`,
  `statusLine(input)`, `BLOCKS[view]`.
- **View choice** mirrors the situation rules exactly: live situations (in London, on the tube, at a London station,
  on a tube home, nearly home, on the train, in that order) win over Leave now; Leave around gives way to an
  office-bound live situation but not to the last stretch home; Arrive by for today while under way shows the live
  view with the verdict band first; an Arrive by plan for another day stays a plan; no direction yet shows nothing
  else.
- **Headline kind**: "departs" when at or walking to the station, "leave" when planning, "arrive" when under way.
- **Block order** per view: the headline is never below an option, context line, board, line status or notice; the
  board is always after the top card. Every view has an order.
- **Status line precedence**, worst first and never promoted from below: errors > routes not loaded > stale (3 min)
  > cancelled > no estimate > 15+ min late > Circle and Met closed (H&C fallback) > a tube line closed > 5–14 min
  late > a tube line with delays > an operator not on good service > a notice on your route with no impact yet >
  timetable-only / example data > good service. Lower tiers are counted in the detail, so a cancellation can never
  hide behind "minor delays". When the plan on screen is for later, train warnings say they're about trains now.
- `src/page.html` dispatches on the pure presentation result and uses `headlineKind` for the departure board
  (Train · Expected) or Leave. Signal uses semantic
  `data-block` boundaries and `src/presentation-blocks.js` to render actual live-card nodes in the supplied
  `BLOCKS` order. The shell has no second priority table. Untagged context and unknown blocks are retained;
  rearrangement preserves listeners, disclosures, focused controls and text selection.
- With Follow a route enabled, a chosen journey is an active `following` presentation even before departure.
  It does not fabricate a location or claim the passenger is on a particular service.
- Signal draws the engine's one-line impact summary and exposes all significant relevant impacts from the shared
  disruption policy, while retaining remaining full original notices under Travel alerts
  and line/source detail under Lines & data. Missing live line/operator evidence is qualified as unavailable,
  never promoted to a good-service claim. If the fallback line is unavailable as well as Circle and Met, the
  summary must not recommend that fallback as a resolution. A more important train/feed failure retains priority,
  with the current onward-travel qualification still visible. Current closures are labelled “now” when the
  planning question is for later; displayed-plan missing routes use that plan's own failures.
- Compact v2 foregrounds the current answer and uses a compact expandable Next best rather than two equally
  large recommendation cards. The shell may consolidate repeated geometry and reparent the existing controls,
  but may not change priority, ranking, current selection or the complete set of journey/notice information.
  In Auto/Live, active followed-route presentation leads and unrelated recommendations may fold. Explicit Plan
  keeps its primary answer exposed while following/alerts continue. Tube choices/corrections are extracted
  outside folded recommendations with their existing handlers and selection intact. The approved compact layout is specified by the
  [Signal story](signal-design-system.md#compact-v2-direction-sam-31-oct-2026).
- Journey identity, times, duration, arrival-first meaning, flags and source requests stay correct when
  Follow is off. Auto / Plan / Live and their override lifetime are always available. Follow remains independent.

## Tests
- tests/core/present.test.mjs: "chooseView: live situations win over Leave now, in the order the situations are checked"
- tests/core/present.test.mjs: "chooseView: Arrive by for today while under way shows the live view with the verdict first; otherwise the plan"
- tests/core/present.test.mjs: "headlineKind: departs at or on the way to the station, leave when planning, arrive when under way"
- tests/core/present.test.mjs: "Blocks: every view has an order; the headline comes before any option, context line, board or notice"
- tests/core/present.test.mjs: "statusLine: all good says so; a cancellation on your route is red whatever the operator's status says"
- tests/core/present.test.mjs: "statusLine: data you can't trust comes before anything about trains"
- tests/core/present.test.mjs: "statusLine: 5–14 min is amber, a route notice with no impact is yellow, timetable and example data are info"
- tests/core/present.test.mjs: "chooseView under way (Arrive by today): in London beats on the tube beats on the train beats at the station"
- tests/core/present.test.mjs: "headlineKind: Leave around is 'leave' too"
- tests/core/present.test.mjs: "statusLine edges: exactly 5 min late is amber; under 5 isn't counted; a cancellation beats the Aldgate East fallback"
- tests/core/present.test.mjs: "statusLine edges: a tube line's delays beat an operator's; example data beats timetable; the worst of a line's statuses"
- tests/core/present.test.mjs: "statusLine edges: a later plan says the warning is about trains now, for every train tier"
- tests/logic.test.mjs: "Arrive by on the train: says whether this train gets you there on time; a deadline on another day is a plan, not a verdict"
- tests/golden.test.mjs: every golden recording (what is shown is unchanged by the extraction)

- tests/presentation-ui.test.mjs: "live block rendering consumes the engine order and retains every real train-card node"
- tests/presentation-ui.test.mjs: "actual station, Tube, final-walk and London templates expose semantic blocks in model order"
- tests/presentation-ui.test.mjs: "canonical rendering preserves unknown content, untagged context, listeners, disclosure and focus"
- tests/presentation-ui.test.mjs: "Signal dispatch enforces the canonical order on the actual live hero"
- tests/signal.test.mjs: "Signal status summary follows actual engine warning precedence and handles loading"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: reading expanded significant details defers Auto and preserves disclosure focus across refresh"
- tests/follow-journey-review.test.mjs: "journey review: absent live line-status evidence never becomes a good-service claim"

- tests/core/present.test.mjs: "statusLine: a closed fallback asks to check onward travel without claiming a future closure"
- tests/signal-compact-review.test.mjs: "compact review: future Arrive by and Leave around missing routes stay visible above folded alerts"
- tests/signal-compact-review.test.mjs: "compact review: a cancellation summary cannot hide the currently closed onward fallback"

- tests/signal-compact-plan.test.mjs: "compact Plan: explicitly choosing Plan keeps its primary answer visible while following continues"
- tests/signal-compact-plan.test.mjs: "compact Plan: live Tube choices remain outside folded recommendations and keep working while following"
- tests/presentation-ui.test.mjs: "Signal planning keeps the primary answer ahead of the accessible line-status strip"

## Current implementation and limits
Signal is the only design. [Journey facts](journey-facts.md) records functional requirements and ordinary
regressions across views. The former Panda concurrency and parity gate requirements were removed on 1 Nov;
see [retirement evidence](../panda-retirement-review.md). Native surfaces remain future work.
