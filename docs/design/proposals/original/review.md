# Independent review: Cartref Commute redesign mockups (Directions A "Signal" and B "Board")

Reviewed cold against: `inventory.md`, `src/page.html` (renderHero, optionBlock, renderList, renderOnTrain, renderAtHub, renderOnTube, renderOnTubeHome, renderNearlyHome, renderInLondon, renderBanners, renderByHero, renderAtHero, renderInner), `src/core/adapters/darwin.ts`, `CLAUDE.md`, and the stories (arrive-by, top-card, which-train, warnings, never-hide-a-train, on-the-way-to-the-station).

Files: `canvas/project/Main.dc.html`, `A-OnTrain`, `A-AtStation`, `A-Lines`, `A-Widget`, `B-LeaveNow`, `B-OnTrain`, `B-AtStation`, `B-Lines`, `B-Widget`, `System.dc.html`.

**Headline.** The boards draw three of the eleven screen states (Leave now, On train to work, At King's Cross to work, plus a KGX-home departure-board variant) and a Lines screen. Arrive by and Leave around, which are explicitly in scope, are not drawn at all. Seven live states (A on-the-way, E on-tube, F in-London, G on-tube-home, H nearly-home, J awaiting location, and all empty/error/loading states) are absent from both directions and absent from the System board's drop/hide table. Under the owner's no-silent-regression rule those are defects, not omissions. The System board's "Nothing else moves" box asserts coverage the artboards do not demonstrate. The two directions are two skins of one design (identical slot order, copy, sample data); the only structural difference is tab bar vs single scroll.

One thing the inventory itself missed, checked against code: `renderAtHub` has three further variants not in the inventory and not in the mocks: the "That's earlier than we'd expect you can reach the platform" note when your pick is tight; "You're getting the X / Getting a different one?" after a pick; and the no-live-tubes fallback ("Get on the next Circle or Met eastbound", with the allowance maths). `renderOnTrain` also has a no-match state ("no train matches where you are right now" + picks) and a Service Details error note. `renderInner` adds the "Times further ahead than about 2 hours always come from the timetable" sentence to the model note in Arrive by. None are in the mocks.

---

## 1. Functionality audit

Legend: **Both** = present in A and B · **A only / B only** · **Table** = missing but in System §5 drop/hide · **DEFECT** = missing and not in the table.

### Always on screen (planning)

| # | Item | Status | Detail |
|---|---|---|---|
| 1 | Header: app name, route label, Settings | Partial, Both | App name: B only (masthead "Cartref Commute"); A has no app name anywhere on Now. Route label "Cartref → 20 Mansfield Street" replaced by "To the office" (table: direction kept). Settings: A tab bar, B footer link. Leisure route variants ("Cartref → King's Cross or St Pancras", "Wherever you are → Cartref") not shown. **DEFECT (minor)**: leisure labels. |
| 2 | Mode Commute/Leisure | Table | Behind context button, sheet not drawn. Acceptable per table, but the sheet is a new component with no mock. |
| 3 | Direction Auto/manual + note | Table (partial) | Button label "Auto, from your location". The current note carries *where you are and the fix accuracy* ("you're near Letchworth (±25 m)", "location is off for this app", "finding your location…"). Mock drops the where/accuracy text. Table says "Auto note moves into the button label" but the label shown is shorter than the note. **DEFECT (minor)**: the accuracy/where diagnostic and the denied/unavailable wording have no home. |
| 4 | Pace Average/Fast | Both | One toggle, aria-pressed. OK. |
| 5 | Origin postcode form; destination form (Any-place) | **DEFECT** | Not drawn, not in the table. Leisure is out of scope for restyle but "must not be lost"; the table lists Mode but not these forms. Say where they live (in the sheet? on the card?). |
| 6 | Banners (all tiers) | Partial → see §1a | Collapsed to one status line + Lines screen. Lines screen shows: amber summary, "no cancellations" line, route notices (folded, link tappable, `open` kept), NR/tube line grid, grey facilities + elsewhere tiers, Data block. **Missing and not in table**: example-data notice; "<station> trains not loaded" (which routes, retry time); generic "Problem" banners; **"Train times may be out of date" (last updated, couldn't refresh)**; "Circle and Met closed → H&C fallback"; per-tube-line disrupted banner with folded reason; the folded *list* of delayed-no-estimate trains and cancelled trains; "Your line is disrupted" with the **"about trains now, not your hh:mm plan"** note; operator status reason text. **DEFECT (P0 for stale/not-loaded; P1 for the rest)**. |
| 7 | Plan selector + Day/time inputs | **DEFECT** | Selector drawn in both. **No Arrive by or Leave around view is drawn in either direction**, and no date/time inputs appear anywhere. These are in scope. |
| 8 | Hero card | | |
| 8.1 | Label: context + time + "timetable" + "best, and the next best" | Both | A: "If you leave now · 06:41 · live" (timetable per table). B: "best, then next best". OK. Arrive by / Leave around labels ("To arrive by 08:30 today · live to 09:10, timetable after") not drawn. |
| 8.2 | Option blocks: Leave/Departs + "N min late", Arrive, chips, meta (std exp, operator, platform, train duration, total), timing text, countdown | Both (Leave now only) | Present. "Departs <station> · N min late" variant: A-AtStation/B-AtStation evening card shows Departs but not the "N min late" suffix. Timing text "on track · 3 min to spare" / "leave now" / "12 min early" / "N min late, no train gets you there in time" / "leave 5 min before hh:mm": only "walk to the platform by 17:58" is drawn. **DEFECT**: by/at timing texts. |
| 8.3 | Board at / Get off at with per-station platforms, "too late to reach from here" | Both | Main/B-LeaveNow (Get off at), AtStation evening (Board at + too late). OK. Note: the evening sample attaches a St Pancras alternative to a *Great Northern* train from King's Cross; the engine only merges the same Thameslink train at Farringdon/St Pancras. Sample is impossible (P2, but suggests the rule wasn't understood). |
| 8.4 | Flags as pills incl. long reason | Both | Pills drawn; the long reason pill (flag.long, e.g. delay reason) is not drawn on any card. System says "show on the card, as today". Not demonstrated. |
| 8.5 | Journey steps folded | Both | Present. |
| 8.6 | On the way: "At the station about hh:mm · 22 min walk" | **DEFECT** | Not drawn in either (state A below). |
| 8.7 | "Leaving right now? The 07:00 … stopping train …" / "Next train:" / "Next one you can make:" | Both (first variant) | "Leaving right now?" drawn. Other two wordings not drawn (board/way states). |
| 8.8 | "Still possible if you hurry" with countdown and "N min short" | **DEFECT** | Not drawn in either. System §3 slot 7 names "hurry" and §5 says it "has a slot", but no artboard shows it. The missed list row exists (strike-through), the card line does not. |
| 8.9 | Tubes from Aldgate (live) rows | **DEFECT** | Not drawn in either. Same situation as 8.8. |
| 8.10 | "Your lines" strip: every line incl. good service; "N notices on your line, see above"; reasons for not-ok lines | Partial, Both | A: "Great Northern: minor delays · Thameslink: good service…" OK. **B drops the status word for ok lines** ("Thameslink", "Circle") and relies on green colour alone, which breaks the acceptance criterion "state every line's status including good service" and WCAG 1.4.1. Both omit the "N notices on your line" pill and the `.sreason` reason lines. **DEFECT (B wording; both for notices pill/reasons)**. |
| 8.11 | Empty states: loading; add key / example data; nothing catchable (+ hurry lines); no trains for that time; no direct train by then; errors | **DEFECT** | None drawn in either direction. |
| 9 | List titles | Both ("Next trains, in leaving order"; "Next eastbound tubes") | "Trains around hh:mm, in leaving order", "On the train", "Trains home", "Nearly home", "Arrived", "Nearly there", "To the office" not drawn. |
| 10 | List rows | Both | Leave/Departs, chips, meta, short pills, Arrive; best highlighted; late muted; uncertain dimmed; missed strike-through red. "Board at / Get off at" alt line **not drawn on any list row** (current `renderList` shows `altText` as a meta line). Total dropped from rows (table). **Arrive by "No Farringdon train gets you there by hh:mm" row: DEFECT**. Empty "Nothing catchable in the next two hours": not drawn. At-hub rows: present. |
| 11 | "Why these trains?" | Both, reduced | Folded, merged with model note (table). The mock text drops: cancelled marked in the per-board list, live horizon line, timetable searches returned/kept/dropped with reasons, TfL key hint. Table covers the merge, not the content loss. **DEFECT (minor)**: say the full diag text survives inside the fold. |
| 12 | Model note | Table | Folded in. The Arrive by addendum ("Times further ahead than ~2 h always come from the timetable; check Leave now on the day") not shown anywhere. |
| 13 | Line status grid | Table | Moved to Lines. Present in A-Lines/B-Lines. |
| 14 | Footer: Updated, request counts, build, Refresh | Table / Partial | Updated + Refresh on Main/B-LeaveNow and B live screens. **A-OnTrain, A-AtStation, A-Lines have no Updated/Refresh** (only the tab bar). "Updated" is a trust signal on the live card; A loses it. **DEFECT (A)**. |
| 15 | Settings dialog | Out of scope | Reachable in both; content undrawn. Say "unchanged". |

### Flags (System §3 pills) — all 13 inventory flags are drawn as pills except: "Leaving in under a minute" (not drawn), the long reason text pill (not drawn), the H&C fallback note (not drawn; chip exists). Levels match `src/core` (`journey.ts`, `plan.ts`, `search.ts`, `live.ts`). **Minor DEFECT**: three pills undrawn.

### Live states

| State | Status | Detail |
|---|---|---|
| A. On your way to Letchworth | **DEFECT** | Not drawn. No "At the station about hh:mm · walk", no "on track · N min to spare / keep going", no hurry-with-countdown. The context button in A-OnTrain shows the pattern ("· on the train") so a "· walking to Letchworth" label is implied, but the card isn't. |
| B. At Letchworth (to work) / at a London station (home) | Both (home variant only) | AtStation evening card: Departs big, Home big, platform, "departs in", "walk to the platform by", Board at. "Go to the platform now" and the at-Letchworth-to-work variant not drawn. Acceptable if declared the same component. |
| C. On the train | Both | Label (context button + sub-line), projected arrival, +N vs timetable, "You're on the 07:08", "Not this one?", stop rail/strip, "Then" legs, Your lines, source note with last fix. Unsure variant with picks drawn. **Missing in both**: bold **stale-location warning** ("location last updated N min ago" in the label; the source note's "last fix 07:22" is not the warning); **"you picked this"**; "or the 07:00" on the sure card; "Last reported … next …" as text is replaced by the rail (OK); the **no-match state** ("no train matches where you are" + picks); Service Details error note; "timetable data: delays before this train left aren't known" caveat. Sure-card has "Not this one?" but what it opens (the pick list) isn't drawn. **DEFECT (stale warning, you-picked-this, no-match)**. |
| D. At a London station to work | Both | Big office arrival + "in 32 min"; instruction block; legs incl. "from when you arrived (07:47)"; "Near the platform already?"; "Which one are you getting?" picks; Your lines; tube list with "If you're near the platform", Aldgate time, office time. **Missing**: the tight-pick note; the after-pick "You're getting / Getting a different one?" wording; line-issue pills (`issues`); the **no-live-tubes fallback estimate** card; "Live tube times will appear here" empty list. **DEFECT (fallback + empty)**. |
| E. On the tube (to work) | **DEFECT** | Not drawn. Includes "Still at King's Cross? Did you get the 08:03?" Yes/No, "On a different tube?" swap, "estimate" suffix when no live Aldgate arrival, "At Aldgate the app shows the walk" list line. |
| F. In London (to work) | **DEFECT** | Not drawn: at office "you've arrived"; walking (arrival, walk, straight-line metres); TfL journey-planner summary; planning/error state. |
| G. On the tube home | **DEFECT** | Not drawn: "Probably the Met that left Aldgate at hh:mm (or …)"; "Get off at Farringdon hh:mm → 17:56 Thameslink · platform · home hh:mm"; "or get off at King's Cross … (N min later)"; couldn't-tell / no-train-found empties. This is the one live state where the Flighty-style "connection at risk" framing matters most and it is absent. |
| H. Nearly home | **DEFECT** | Not drawn: train variant ("Letchworth hh:mm expected · then a 22 min walk"), walking variant, at-station variant, "You're home.", home-not-set. |
| I. Arrive by verdict band | Both | Green "On time for 08:30 · 7 min to spare" drawn. Red "Late for 08:30 by about 4 min · office 08:34" and "just in time" not drawn. Minor. |
| J. Awaiting location | **DEFECT** | Not drawn: "Finding your location…" / "Location needed" + LOC_HELP text + manual direction offer; list placeholder. |

### Behaviours
- Never hide: list rows keep missed/uncertain/late trains. OK in both.
- Late trains "07:00 exp 07:03": drawn in both (A: amber `exp`; B: amber bold). OK.
- Same train, several stations: card line OK; **list row alt line missing** (see #10).
- Opened folded sections stay open: Lines uses `<details open>` and the Journey-steps fold has no `data-key` in the mocks; implementation detail, but moving notices to a separate screen changes what "stays open across refresh" means in A (tab) vs B (navigation). Not a defect, needs a sentence.
- Countdowns tick: drawn as static text; OK.
- Picks one tap and remembered: pick buttons 44 px. OK.
- Accessibility: `aria-pressed`, `aria-live` on card, `role=group`. Plan buttons in A are 40 px (below the System's own ≥44 rule). See §2.
- Dark and light: System says each direction carries its opposite theme; **no opposite-theme artboard exists for either** (A light, B dark). The owner cannot judge A-light or B-dark. **DEFECT (P1)** given the current app ships both.

### 1a. Could the status line hide a red behind an amber headline? Yes.
`Main.dc.html` / `B-LeaveNow.dc.html` status line: bold headline = operator status ("Great Northern: minor delays", amber), secondary grey text = "1 of 6 trains late · 2 notices". In `renderBanners`, the following are **bad/red regardless of operator status**: any cancelled train on your routes (`tiers.cancelled`), any delayed-no-estimate train, "trains not loaded", "times may be out of date", "Circle and Met closed", any error. Operator status can be "Good service" while one of your trains is cancelled. The System board says "worst level + counts" but the only drawn example puts the NR status feed in the headline slot and relegates train-level facts to grey secondary text. Nothing specifies the precedence. **P0**: write the rule (dot and headline = worst of {data stale / not loaded / error} > {cancelled, no-estimate, 15+ min} > {5–14 min} > {line status} > {notices}; counts for the lower tiers in the secondary text) and draw at least the red case and the stale-data case. Also: "Circle and Met closed → H&C" is a *route change*, not a notice; it must stay on the card (the chips flip to H&C, but the reason must be visible without leaving Now).

---

## 2. UX problems

**Hierarchy**
- A: the status line sits above the plan selector and the card, so the first 44 px band under the context button is always a line-status row even when everything is fine. For "Leave now while walking" the first glance should be the Leave time. Consider collapsing to a dot in the top bar when level is ok/yellow.
- B: masthead ("Cartref Commute" + 24 px "To the office" + sub-line) spends ~90 px before any time. The 3 px rule and 4 px card top-border are strong; combined with underlined plan tabs it reads as four horizontal rules before the hero. Dense for a 390 px phone.
- Next best in B (22 px "06:52 → 08:21" right-aligned) is visually subordinate enough; in A it is 30 px mono, close to the 44 px best: fine.
- On-train A: the stop rail puts the big projected arrival (56 px) above, and the "You're on the…" confirmation in a raised box. Good. B puts the +3 pill in the label row at 11 px, which under-weights the one Flighty-style number that matters.

**Legibility / contrast (computed, WCAG 2.x)**
- All base token pairs pass 4.5:1 (A muted #7C8696 on #141820 = 4.83; B muted #6B665C on #F4F1EA = 5.06; pills 5.5–8.9; accents 6.4–7.2).
- **Dimmed rows fail**: A `opacity:.55` missed row → meta text 3.5:1, strike-through time 3.2:1, bad-pill text 3.1:1; A `.6` uncertain row → 3.9:1. B `.6` missed row → meta 2.6:1, strike time 3.1:1, bad pill 2.9:1. These rows carry the "Leave time passed: 3 min short" and "Delayed, no estimate" flags, i.e. the safety-relevant ones. Use a colour change (muted ink) rather than opacity, or keep opacity ≥ .8.
- B yellow "notice" dot #E3CF4A on #F4F1EA = 1.4:1: invisible. A's equivalent (#E8D45C on #141820 = 11.9) is fine. B amber dot #C98A00 on cream = 2.6:1 (below 3:1 for UI components).
- Font sizes: section labels 11 px caps, row meta 12 px, "Near the platform already?" 12 px, source note 11 px, Live Activity captions 10 px. For a phone used while walking, 12 px meta carrying "07:14 exp 07:17 … leave in 10:42" is small; the countdown in list rows in A is 12 px #AEB6C2 mono. The current app's meta is the same size, so not a regression, but the brief is "glanceable".

**Touch targets** (System says ≥44)
- A plan selector buttons: `min-height:40px`.
- A "Not this one?": 36 px. B "Not this one?": 36 px underlined text link.
- B Refresh / Settings / Lines footer pills: 36 px. B "‹ Now" 40 px. B pace toggle 40 px.
- `<details>` summaries 28–32 px ("Journey steps", "Why these trains?", every notice on Lines).
- Lines-screen notice `summary` rows are 28 px with a 10 px dot; tapping to unfold a notice while walking is fiddly.

**Confusing / inconsistent**
- A tab bar has **Now · Plan · Lines · Settings**, but Main already contains the plan selector and "Plan" links back to Main. What is Plan? Either it is the Arrive by/Leave around screen (then the in-card selector is redundant) or it should not exist. Undefined.
- A-OnTrain "Then" legs: train at KGX 07:47, "07:53 Walk to the eastbound Circle/Met · 6 min" (walk starts 6 min after arrival?), "07:56 tube · 3 min wait, 10 min ride", "08:16 Aldgate" (07:56+10 = 08:06), "08:23 office · 7 min walk" (08:06+7 = 08:13). Main's Journey steps: "07:53 tube · 3 min wait, 10 min ride" → "08:14 Aldgate" (should be 08:06) and office 08:14 = Aldgate time. A-AtStation: 07:56 tube → 08:06 Aldgate → "08:21 office · 7 min walk" (should be 08:13); "07:53 Met gets you there 08:19" (should be 08:10). The sample arithmetic is wrong on every live card. The owner will read these numbers as the design's promise; fix before he reviews.
- A-Lines: "1 of 6 trains delayed 5+ min · worst 3 min" is self-contradictory. B-Lines repeats it.
- Status line says "1 of 6 trains late"; `railWarnings` counts affected = 5+ min or cancelled; "late" (≥1 min) is not a current count. Define which.
- Evening departure-board card: Great Northern 18:01 from King's Cross "or St Pancras 18:06" (impossible, see 8.3).
- B "Your lines" pills drop status text; A keeps it. Inconsistent between directions and B fails the criterion.
- B on-train header is "On the train" (state) with "To the office" demoted to the sub-line; A keeps "To the office · on the train". Both fine, but the B button then opens a mode/direction sheet from a label that reads as a status: unclear affordance.
- Live Activity in A-Widget: "Then Circle to Aldgate · 07:56" — plan can't name Circle vs Met before you are at KGX (current engine says "Circle or Met"). Sample over-commits.

**Principles (CLAUDE.md)**
- Never hide a train: list OK. But the card's hurry line and the tubes-from-Aldgate rows, both "show it with flags" devices, are undrawn.
- Detail replaces a line or folds away: honoured (steps fold, Why fold, Lines screen). The Lines screen itself is detail that moved *off* the screen rather than folding; acceptable if the status line is trustworthy (see 1a).
- When unsure ask, don't overrule: "Which train are you on?" drawn; "Still at King's Cross? Did you get the 08:03?" (the clearest instance) is not drawn (state E).
- Real data over estimates: "Office · projected" label honest; A-AtStation says "live tube times". OK.

**Are the directions genuinely distinct?** Partly. They share every slot, every line of copy, every number and every state choice; the differences are palette, type (mono vs Archivo), radius, nav (tabs vs scroll), and the progress device (vertical rail vs horizontal strip + table). That is a skin choice plus one IA choice (tabs). It is a real choice on *look*, but it is not two answers to "what does the busy screen become". If the owner is choosing a direction, the honest framing is: pick a skin (A/B) and separately pick tabs vs single scroll; they are orthogonal.

**Is the IA sound for a phone used while walking?**
- Context button + single status line + Lines screen: sound in principle; the status line precedence (1a) is the whole risk.
- Tab bar (A) vs single scroll (B): a tab bar makes Lines one tap and keeps Settings off the Now screen; good while walking. "Plan" tab is undefined (above). Single scroll (B) keeps the current app's model; "Lines ›" at the top and footer links are fine. B's "Lines" link in the footer of live screens is below the fold on a 1180 px artboard; on a real 844 px viewport it is two scrolls away.
- The Arrive by / Leave around views are the one place the current app shows a form (date/time). With a tab bar in A, these naturally belong on the undefined "Plan" tab; in B they would sit under the plan tabs. Neither is drawn, so this cannot be judged.

---

## 3. Fidelity to the brief (Commutative-style status, Flighty-style live travel)

What the on-train card delivers: a big projected arrival at the *destination* (not the station) with delta vs timetable; a confirmation chip "You're on the 07:08"; a stop rail with actual/expected times, delay per stop, a "now" marker and "last reported"; onward legs; share ETA; a lock-screen/Dynamic Island treatment. That is the Flighty vocabulary, and the claim "delta from Service Details reports, not an estimate" is backed by `parseServiceDetails` (actual `at` times per calling point, expected `et` for the rest).

What is missing against the brief:
1. **The reason.** Flighty always says *why* ("ATC hold"). `ServiceProgress.reason` and `Train.reason` exist (delay/cancel reason) and the current card renders `flag.long` on the planning card but nothing on the on-train card. The mocks show no reason anywhere on the live cards.
2. **Trend / stability.** Flighty shows whether the delay is growing. Not drawn; derivable by comparing successive Service Details (last 3 refreshes).
3. **Connection framing.** Flighty's core value on a connecting itinerary is "you will/won't make the connection". To work the tube is turn-up-and-go so it matters little; **going home it matters** (Farringdon vs King's Cross choice, "or get off at King's Cross (4 min later)"), and that state (G) is undrawn. The on-tube-home card is where a Flighty-style design would shine and it is the one missed.
4. **Countdown to next event.** "Arriving King's Cross in 24 min" / "next stop in 6 min" is absent on the on-train card (A-AtStation has "in 32 min" to the office; good). The stop rail shows clock times only.
5. **Stale-location honesty.** Flighty shows data age prominently. The bold "location last updated N min ago" warning is dropped (only "last fix 07:22" in 11 px muted).
6. **Cancellation / no-estimate on the train you're on.** `ServiceProgress.cancelled` exists; no mock shows the card when your own train gets cancelled mid-journey or loses its estimate.
7. "Live Activity" claims "no new data is needed"; true for content, but Live Activities need push updates (server or app-side background), which the current GitHub-Pages web app has no path to. Say so on the board.

Commutative-style: the accent instruction block ("Get on the Circle to Aldgate · in 2:10") is the strongest single element in the set and does the job. The "You're on the…" chip is good. The Leave now card does not get the same treatment (no single instruction line; "leave in 5:42" is a pill in A, blue text in B).

---

## 4. Implementation risk (claims the data cannot back)

1. **Stop rail intermediate stops.** `parseServiceDetails` only knows *calling points*. For a train that does not call at Finsbury Park, there is no "Finsbury Park 07:42 expected" row and no "Between Stevenage and Finsbury Park"; the marker can only say "Between Stevenage and King's Cross" (placed by `reportedFrac`, time proportion). Story which-train.md #23: passing points need a server. A-OnTrain, B-OnTrain, A-Widget and B-Widget ("next Finsbury Park 07:42") all draw a non-stop train as if passing points were known. Label the rail "calling points" or draw the non-stop case.
2. **"Last reported" at a stop vs between stops.** Darwin reports actual times at calling points only, so "last reported Stevenage 07:23" is right; the "now" marker position is an interpolation, not a report. Fine if the copy says "about here".
3. **Delay per stop ("+2" at Hitchin).** Backed: `resolve(st, at)` gives `late` per reported call. OK.
4. **Tube platform ("platform 1") and destination ("towards Hammersmith").** Backed: TfL arrivals carry `platformName` and `destinationName`; `renderAtHub` already prints `n.platform`. OK.
5. **"vs timetable 08:20" at the office.** Backed: `j.arrive` vs `j.arrive+shift`. OK.
6. **Live Activity progress to KGX and "Circle to Aldgate 07:56"** before arrival: the Circle/Met choice and 07:56 are estimates (3 min wait allowance) until you are at the hub; the mock states them as facts. The engine does not pre-fetch hub arrivals while on the train (`refreshPlan` only loads `hubTubeArrivals` when `atHub`). Either label as estimate or add a pre-fetch within ~10 min of arrival (cheap, worth doing).
7. **Status line counts** ("1 of 6 trains late", "2 notices"): `railWarnings` provides affected/total (5+ min or cancelled), cancelled[], uncertain[], onRoute[], other[], facilities[]. A plain "late" (≥1 min) count does not exist; "notices" needs a definition (onRoute only? plus NR status?).
8. **"Your trains · next 2 hours" on Lines**: live boards cover the live horizon (`liveHorizon`), which is not always 2 h; the label should come from the data.
9. **Lines › Data rows** ("Live from National Rail · 06:41", "Tube: live arrivals · line status 06:40"): `state.boardsAt`, `state.statusAt`, `state.nrAt` exist. OK. But the row set does not include the *failure* states (Darwin failed → TfL timetable, route failed + retry time, stale). Those are the states that matter.
10. **Share ETA**: Web Share API works on iOS Safari; fine.
11. **Context button sub-label "· on the train" / "· at King's Cross"**: derived from the same predicates that choose the render function; cheap.
12. **"+3 min" pill on B-OnTrain in the label row and A's "vs timetable"**: when `Math.abs(delay)<2` the current card says "on time"; the design has no on-time variant drawn.

---

## 5. Prioritised list

**P0 — before the owner chooses**
1. Draw **Arrive by** and **Leave around** for at least one direction (date/time inputs; label "To arrive by 08:30 today · live to…"; latest-on-time pick with "N min early"/"just in time"; late pick with "N min late, no train gets you there in time" + Late-by pill; "Leave N min before" pill; "No Farringdon train gets you there by 08:30" list row; "No direct train gets you there by then"; the model-note addendum). They are in scope and absent.
2. Specify and draw the **status line precedence** (worst tier wins; cancelled/no-estimate/stale/not-loaded are red regardless of operator status) and draw the red, stale-data and "Circle and Met closed → H&C" cases. Today's banner stack can't hide a cancellation; the one-line summary can.
3. Add the undrawn live states to the drop/hide table or draw them: **A on-the-way, E on-tube (with "Still at King's Cross? Did you get the 08:03?"), F in-London, G on-tube-home, H nearly-home, J awaiting-location**, plus empty/loading/error states. Under the owner's rule each is currently a defect.
4. Fix the sample arithmetic on every live card and the "5+ min · worst 3 min" contradiction; the owner judges the design through these numbers.
5. Draw (or table) the card lines the System board claims have slots but no artboard shows: **"Still possible if you hurry"**, **tubes from Aldgate**, stale-location warning, "you picked this", no-match state, at-hub no-live-tubes fallback.

**P1 — before writing into the repo**
6. Opposite-theme artboard for each direction (A light, B dark); the current app ships both.
7. Define or remove the **"Plan" tab** in A.
8. B "Your lines" pills must carry the status word for ok lines; both directions need the "N notices on your line" pill and the not-ok reason lines.
9. Dimmed rows: replace opacity with muted ink so flag text on missed/uncertain rows stays ≥4.5:1; fix B's yellow and amber dots (≥3:1).
10. Touch targets to the System's own ≥44 px: A plan buttons (40), "Not this one?" (36), B footer pills (36), details summaries (28–32).
11. A live screens: add Updated + Refresh (A-OnTrain, A-AtStation, A-Lines have none).
12. List rows: draw the "Board at / Get off at" alt line (same-train rule) and the "Leaving in under a minute" / long-reason / H&C-note pills.
13. Stop rail: either label as calling points and draw the non-stop case ("between Stevenage and King's Cross"), or note the #23 server dependency on the board. Remove "next Finsbury Park" from the widget sample.
14. Lines › Data: add the failure rows (Darwin failed → timetable; route not loaded + retry; stale since hh:mm; example data) since those are the banners being removed from Now.
15. State where the leisure origin/destination forms and leisure route labels live.
16. On-train card: show the delay/cancel reason (`ServiceProgress.reason`), the on-time variant, and the cancelled-mid-journey variant.

**P2 — nice to have**
17. Frame the choice honestly: skin (A/B) × nav (tabs/scroll) are independent; the boards present them as bundled.
18. Countdown to next stop / to KGX on the on-train card; delay trend from successive Service Details.
19. Pre-fetch hub tube arrivals within ~10 min of arrival so "Then" can show live tubes rather than the 3-min allowance; label the Live Activity's "Circle 07:56" as an estimate until then.
20. Keep the auto-direction where/accuracy text somewhere reachable (it was how the 29 Oct location bugs were diagnosed).
21. "Why these trains?" fold: confirm the full diagnostic text (returned/kept/dropped reasons, cancelled marked, TfL key hint) survives inside the fold.
22. Collapse the status line to a dot in the top bar when level is ok/yellow so Leave now's first band is the time.
23. aria-live on a card whose countdown ticks every second will chatter in VoiceOver; put the countdown outside the live region (pre-existing, but the redesign is the moment to fix it).
