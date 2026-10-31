# Signal compact redesign: independent design review

Reviewed 31 October 2026 against latest `main` at `0ca7d3c`, the user's live iPhone screenshots, the approved Signal preview, and the published design system. This review concerns presentation and information hierarchy. It does not propose replacing the current journey engine with prototype logic.

The user has explicitly authorized a substantial redesign, retaining Signal as a feature-switched option, and has asked for Flighty and Railboard as inspiration. The design can change meaningfully without another round of permission. Existing capability, timing and data-quality contracts still apply.

## Finding

The live Signal shown in the supplied screenshots is a larger skin over the existing dashboard. It does not recover the approved preview's hierarchy: one contextual answer, a smaller fallback, then the complete board. Controls, notices and repeated explanations consume the first screen before a useful departure appears. The problem is structural as well as typographic; reducing font sizes would leave the same repetition and narrow content columns.

The strongest direction is a compact journey instrument: a small masthead, a concise editable journey context, one clear answer, and a full-width departure board. Keep large type for the time that answers the current question. Use spacing and fine rules for ordinary rows, reserving strong surfaces and colour for the selected answer, actionable controls and actual status.

## Evidence and consequences

| Evidence | Consequence | Required response |
| --- | --- | --- |
| Live Signal uses a separate title, subtitle, Simulator/Settings row and three large segmented-control rows before disruption information. | The person must scroll past configuration before finding when to leave. | Keep Settings and Simulator reachable in a compact masthead. Present direction and pace as one compact context/control area. Put less frequent configuration behind an explicit disclosure or sheet. |
| Circle/Met closure banner, separate line closure cards, facility notice, `signalStatus`, recommendation flags, “Your lines”, departure flags and global line tiles repeat related facts. | High visual urgency becomes background noise; repeated closed-line pills dominate each journey. | Present one concise visible impact summary. Retain the complete original notices in a clearly labelled disclosure. Keep train-specific cancellation, uncertainty and delay visible on each affected occurrence. |
| The supplied overnight state says “Circle and Met closed: via Aldgate East”, while Hammersmith & City is also shown closed. | A compact fallback headline can imply that a closed onward service solves the problem. | Consolidation must describe the complete relevant status truthfully. When all relevant Tube lines are closed, say so rather than imply that H&C is a working fallback. Retain engine routes and estimates with appropriate flags. |
| Original `src/signal.css` board rows reserve `4em` for leave and `4em` for arrive, with the description in the remaining middle column. | Long interchange labels, platform details and notices wrap into a tall central stack. A wide screen becomes a narrow reading column. | Give service metadata and route details the full row width. Align the time pair in a row header or vertically aligned time rail without reserving both side gutters throughout the row. |
| Every alternative repeats a broad “Follow this route” button. | The action is visually as important as the answer and adds a large fixed height to every item. | Retain an explicit labelled action and a 44px target, but use a compact action row. Reserve the strong filled treatment for the primary action or selected journey. |
| Live Signal recommendation cards use similarly large leave and arrival times and reproduce the board content. | There is no decisive answer, and the same options are read twice at similar weight. | Give the primary contextual time the greatest weight. Make the next-best option a compact fallback. The full board remains the complete list below. |
| Heavy surfaces surround ordinary controls, warnings, hero content, repeated board rows and line-status tiles. | Every region competes; blue is overused as a background instead of indicating selection/action. | Use a small number of surface levels, restrained borders and fine separators. Do not use delay/status colours for decorative identity. |

The user's Panda screenshots are already denser than the live Signal screenshots. Panda is useful as a regression comparison for information availability, not as the visual ceiling for this redesign.

The browser reviewer also recorded the immutable pre-change built page with deterministic transport fixtures at 393×852. The ordinary fixture places the first answer at 703px and the complete board at 1,569px; its rows are 252–296px tall. The overnight closure fixture places the first answer at 1,105px and the board at 2,190px; its rows are 303–376px tall. Total document heights are 3,596px and 4,534px. These are controlled-fixture measurements, not measurements inferred from the user's screenshots. They establish a reproducible comparison for the candidate.

## Fidelity to approved Signal

The approved reference is [`design/signal-preview.html`](design/signal-preview.html), whose actual prototype is stored inside nested, HTML-encoded `data-srcdoc` iframe content. Reading only its outer wrapper misses the approved screen. This review decoded and inspected that content. No separately named “v2” artifact was found; the user may be referring to this revised, selected preview. Therefore the implementation should claim fidelity to its hierarchy, not an unverified pixel-for-pixel match to a separate version.

The selected preview already includes:

- A 23px brand treatment and a single direction/pace context line, with details opened through labelled controls.
- A compact Plan/Live control, with automatic behaviour and manual override supplied by the shared journey system.
- One primary answer with an approximately 50px dominant time and 26px secondary arrival, instead of two equally dominant time columns everywhere.
- A compact fallback with a 22px time.
- A timetable whose metadata flexes across the row, using approximately 22px times, 14px service text and 12px supporting text.
- Platform identity, service state, arrival and next action as deliberate hierarchy, rather than a collection of equally weighted pills.

The approved prototype still has generous presentation spacing. Its hierarchy should be restored while making the production screen more efficient; copying its mock data, journey decisions or interaction placeholders would discard subsequent improvements. [`design-system.md`](design-system.md) expressly says that implementation begins from latest `main` and preserves all later improvements.

## Reference interpretation

**Railboard.** The user's Results screenshot is the most direct reference: consecutive readable timetable rows, visible origin/departure and destination/arrival, short direct/change and duration metadata, and fine separators. The official [Railboard site](https://www.railboard.com/) also publishes a dark Journey screenshot with full-width leg descriptions, aligned times, explicit platforms and a clear selected action. These support a disciplined timetable layout. They do not justify copying ticketing, bottom navigation or decorative station codes into this app.

**Flighty.** The public website returned HTTP 403 during this review. The official [Flighty App Store listing](https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008) was accessible, and its screenshots were inspected. Its compact Live Activity example uses paired endpoints, concise live state and a single next-action countdown. Its flight list separates identity, times and status without giving every field equal weight. The useful principles are continuity, a decisive current answer and compact status. A world map, airport motifs, animation or native Live Activities are not required for this web release, and this review did not interact with either native app.

Signal should retain its blue identity and its own journey language. The goal is the references' clarity and restraint, not a visual imitation.

## Proposed information order

1. **Masthead:** compact title with Settings and Simulator still discoverable. Target 48–56px, excluding device/browser chrome.
2. **Journey context:** direction, pace and mode controls in one concise region. Preserve Commute/Leisure and automatic/manual direction choices. Every changed value must remain visible so compactness does not conceal the active settings.
3. **Current answer:** the contextual departure/leave/arrival and destination, a short route/service line, platform where known, a truthful status, and the primary follow/continue action. In Live mode, keep the next action and arrival prominent. The engine chooses the answer and state.
4. **Impact summary:** relevant closure, feed or disruption information close to the answer. It may precede the answer when it changes how that answer should be interpreted, but it must be concise. Full notices and facility details remain available through disclosure.
5. **Fallback:** one compact alternative with enough service/platform/status context to decide whether to inspect or follow it.
6. **Complete board:** full-width rows in leaving order, including all cancelled, missed, no-estimate and alternative same-train possibilities. A compact details/action row exposes steps and follow actions.
7. **Supporting detail:** full line status, why these trains, freshness/source explanation and refresh. Keep this information accessible without repeating its full prose inside every train row.

Exact ordering of impact and answer should be checked in the overnight closure fixture and live failure states. A disruption must not be concealed by a tidier first screen.

## Preservation constraints

- Keep both feature switches, their current persistence and the independent Follow a route control. Signal/Panda must share selected journey state. A presentation redesign must not silently change saved settings or reselect a journey.
- Preserve latest `main` improvements, including the guided simulator, independent switches, dark/light appearance, delay bands, timetabled and expected times, same-train alternatives, station estimates and the newer 20-minute/situation-change manual-override lifetime. In particular, the latest simulator release keeps trains moving until the real station stop, times stop inference from the phone's fix, resets its speed watch, preserves guided journeys through both designs, and restores real planning dates and alternative origins on Stop. These are production behaviours absent from the older visual prototype.
- Preserve automatic Plan/Live refinement and manual override, tracking and alerts while Planner is pinned, view deferral during interaction, cancellation and stale/unknown data treatment, source/freshness labels and no-fabricated-live-data rules.
- Show every train. Keep each affected train's individual cancellation, no-estimate, lateness and uncertainty visible. A route-wide notice may be summarised; a train-specific warning may not disappear into a global disclosure.
- Full notice text and reason must remain reachable. Expanding a notice or Journey steps must survive periodic redraws. Keyboard focus and screen-reader reading order must follow the visible hierarchy.
- Use the pure shared engine's semantic fields. Do not introduce timing arithmetic, ranking, route selection, live-state invention or hard-coded service examples into the presentation layer.
- Delay/status colours retain the agreed thresholds: under five minutes green, five to fourteen amber, fifteen or more/cancelled/no estimate red. Identity and actions use blue, distinct from status colours. Text labels carry the meaning as well as colour.

## Measurable acceptance targets

These are targets for controlled ordinary and overnight-closure fixtures at standard text size. Arbitrary long notices, expanded details and 200% text must be allowed to grow naturally rather than be clipped to meet a height quota.

| Check | 393×852 CSS px | 320×700 CSS px |
| --- | --- | --- |
| Primary answer begins | At or before 210px | At or before 250px |
| Primary answer plus compact fallback | About 300px or less | About 360px or less |
| Complete board begins in representative ordinary/closure fixture | At or before 560px | At or before 650px |
| Representative ordinary board row | Approximately 108–140px | Approximately 130–170px |
| Disrupted row with long interchange/same-train detail | Aim at or below 190px, without clipping | Aim at or below 230px, without clipping |
| Initial viewport utility | Main answer and useful next alternative; first two board options should be reachable within roughly one screen of content | Main answer and next alternative should be visible/reachable without scrolling through a warning wall |
| Interactions | At least 44×44px, including icon controls and disclosures | Same |
| Horizontal overflow | None | None |

Further acceptance requirements:

- Supporting journey information remains legible, generally 14–16px. Do not meet density targets by turning core service details into tiny labels. The design system permits smaller supporting labels when contrast and scaling are verified.
- One strong primary region per screen; ordinary alternatives are not all large filled cards.
- Use tabular numerals for aligned times. Scheduled and expected labels remain unambiguous and both values remain visible when the story requires them.
- At least WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and essential UI. Verify light and dark themes, including muted metadata and all status bands.
- Native disclosure contents are not clipped by fixed heights. At 200% text, long station names, large platforms, delayed expected times and long notice headings wrap without overlap or loss of actions.
- Safe-area insets and mobile browser chrome do not cover the final row/action. No essential sticky control may obscure content while scrolling.
- Expanded details, focus and active selection survive refresh. A row must not be a nested-button trap or steal taps from “Journey steps” or “Follow”.
- Closure grouping reduces repetition while retaining all affected lines and reasons. The all-Tube-lines-closed case must not advertise H&C as a valid resolution.

## Verification and release evidence

Before visual approval, inspect actual browser screenshots of the candidate at 393×852 and 320×700, in light and dark appearances. Inspect the ordinary planning board, all-relevant-Tube-lines-closed overnight fixture, long same-train interchange row, delayed/cancelled/no-estimate rows, followed route on-train state, and expanded notices/steps. Compare the primary-answer position and complete-board start against the table above. Run enlarged text and keyboard interaction separately; screenshots alone do not prove accessible behaviour.

Automated coverage must show both Signal enabled and disabled retain planning, route following, preferences, simulator controls and status semantics. Engine tests alone cannot prove DOM availability, control reachability or layout. Presentation tests should exercise the rendered shell and confirm all previously available route/notice data remains available after consolidation. A separate agent must review meaningful edge cases and deliberate mutations before merge, as required by `CLAUDE.md`.

## Candidate visual review and decision

**Visual approval: approved for the compact Signal option**, following inspection of the rebuilt implementation on 31 October. This is visual approval of the inspected layout; the independent integration/mutation review, exact-commit CI and deployment checks remain separate release gates.

The reviewer independently opened the actual built application in Chromium with deterministic transport fixtures and captured 393×852 and 320×700 in both appearances. The latest closure screenshots include the corrected expanded banner: all three relevant Tube lines are currently closed, with a warning to check onward travel before relying on the estimate. The ordinary fixture was additionally captured at both widths. Browser-reported page errors were empty in these captures.

The reviewed candidate has the intended compact context row even at 320px, a single strong recommendation, a compact collapsed fallback with visible train identity and platform, readable full-width service/platform details, a subdued unavailable action, and an alerts disclosure sharing the board-heading area. Relevant rail cancellation and current Tube closure remain visible together above the recommendation; the complete notice bodies remain reachable. The first render's oversized fallback, wrapped 320px toolbar, equally bright unavailable button and contradictory expanded H&C fallback wording were raised during review and corrected before approval.

Measured against the same immutable 393px baseline:

| Controlled fixture | Before | Reviewed compact candidate |
| --- | --- | --- |
| Ordinary: first answer time row starts | 703px | 247px |
| Ordinary: complete board starts | 1,569px | 613px |
| Ordinary: total document height | 3,596px | 1,592px |
| Overnight closures: first answer time row starts | 1,105px | 265px |
| Overnight closures: complete board starts | 2,190px | 632px |
| Overnight closures: total document height | 4,534px | 1,611px |
| Complete-board row heights | 252–376px across the two fixtures | 148–171px |

The first answer's **surface** starts at 208px in the ordinary fixture and 226px with simultaneous cancellation/Tube closure; its time row starts later because the contextual heading and labels remain readable. At 320px, the corresponding surfaces start at 208/226px, boards at 605/623px, and rows are approximately 150px or 192px for the longer same-train interchange detail. Primary plus fallback surfaces measure 343px at 393px and 335px at 320px.

The 393px candidate accepts limited exceptions to the aspirational table: the disrupted answer surface is 16px below the 210px target, the board is 53–72px below the 560px target, and primary plus fallback is 43px above the 300px target. The initial 852px viewport shows the complete main answer, compact fallback and first board row, with part of the following row; it does not show two complete repeated board rows. These exceptions are accepted because two distinct journey options and the fallback's service identity are already available in the answer/fallback, service details retain 14px legibility, and urgent status remains visible. Relative to the disrupted baseline, the first time row is about 76% earlier, the complete board about 71% earlier, and total page height about 64.5% smaller. The 320px compactness targets are met for answer/fallback/board position, with long interchange text allowed to occupy its natural extra line.

Expanded fallback and alerts were inspected, as were actual Follow interactions before departure and after the browser reviewer advanced the fixed clock and confirmed “I'm on it” through the real app. The on-train state gives the arrival and next action prominence, retains journey steps and Stop, and folds other recommendations while leaving other journeys accessible. These are deterministic browser scenarios, not a claim of a real live train journey.

Audit captures are in the session artifact directory as `auditor-final-{light|dark}-{393|320}.png`, `auditor-final-alerts-dark-393.png` and `auditor-final-normal-{light|dark}-{393|320}.png`; accompanying `auditor-final-metrics.json` records all eight final geometries, including the visible fallback service-identity line. The browser reviewer's refreshed `signal-compact-expanded-nextbest-dark-393.png`, `signal-compact-followed-beforetrain-dark-393.png` and `signal-compact-followed-confirmed-ontrain-dark-393.png` provide the interaction states. The checked-in [`browser-signal-compact.py`](../tests/browser-signal-compact.py) recreates the controlled fixture family for future reviews.

Core token contrast was also checked mathematically: muted text on cards is 6.36:1 light / 8.78:1 dark, accent text on cards 7.14:1 / 9.52:1, and status text on pill backgrounds at least 5.71:1 / 7.00:1. This is evidence for those pairs, not a full computed-style or real-device accessibility audit. Real iPhone Safari, VoiceOver and production feed reliability remain outside this visual approval.
