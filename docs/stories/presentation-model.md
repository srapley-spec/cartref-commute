# Presentation model: the engine decides what comes first
Status: Done (status line computed, not yet drawn) · Since: 29 Oct 2026

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
- `src/page.html` dispatches on `chooseView`, uses `headlineKind` for Departs/Leave, and draws the Leave now card's
  blocks in `BLOCKS["plan-now"]` order. It does not re-decide any of these.
- What is shown does not change: the golden recordings are identical in content (the only diff when this landed was
  a space between two adjacent block `<div>`s in the extracted text).

## Tests
- tests/core/present.test.mjs: "chooseView: live situations win over Leave now, in the order the situations are checked"
- tests/core/present.test.mjs: "chooseView: Arrive by for today while under way shows the live view with the verdict first; otherwise the plan"
- tests/core/present.test.mjs: "headlineKind: departs at or on the way to the station, leave when planning, arrive when under way"
- tests/core/present.test.mjs: "Blocks: every view has an order; the headline comes before any option, context line, board or notice"
- tests/core/present.test.mjs: "statusLine: all good says so; a cancellation on your route is red whatever the operator's status says"
- tests/core/present.test.mjs: "statusLine: data you can't trust comes before anything about trains"
- tests/core/present.test.mjs: "statusLine: 5–14 min is amber, a route notice with no impact is yellow, timetable and example data are info"
- tests/golden.test.mjs: every golden recording (what is shown is unchanged by the extraction)

## Not yet / open questions
- The status line is computed and tested but not yet drawn: today's banner stack stays until the chosen design
  replaces it with the one-line summary (the banners' own order is the same precedence, by hand, in `renderBanners`).
- Only the Leave now card is assembled from `BLOCKS`; the live cards (on train, at hub, on tube, tube home, nearly
  home) still compose their own HTML in the model's order by inspection, not by iteration. Move them when the chosen
  design is implemented.
- A manual Plan/Live pin (proposed by the Signal design) would be an input to `chooseView`, with its lifecycle tested
  here; it is not implemented and not agreed.
- `docs/design/README.md` tells every design proposal to draw `BLOCKS` in this order and to use `statusLine`.
