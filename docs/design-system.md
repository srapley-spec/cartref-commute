# Cartref — Signal design system

## Journey card amendment — 10 November 2026 (Sam, from the trip debrief #57)

**Status: agreed by Sam on 10 Nov, and the wording confirmed with him screen by screen the same day; built 10–11 Nov
except where a section says "Not yet"** (the 11 Nov "clean baseline": `stories/follow-a-route.md`, "Clean baseline").
Where an item isn't built, the production app follows the 2 November contract below. Review mockups, drawn with the app's own Signal styles:
[`design/journey-amendment-2026-11-10.html`](design/journey-amendment-2026-11-10.html). Finding IDs (A1 … F3) are
those in issue #57, which holds the evidence, root causes and the clashes between fixes. Lines marked
"Words confirmed by Sam" were read to him one screen at a time; changing them is a UI change that needs his say.

This amendment changes the 2 November design only where it says so; everything else below stands. Where it
contradicts an earlier line, this section wins, and the line is listed under "Rules this supersedes".

### 1. One journey card while you follow a route (C5, C6, D1)
**First step built 10 Nov** ("one journey, no repeats", the cut-down version Sam chose that evening): the live card
under the followed card no longer repeats the journey, and the list of other trains folds away once you've set off.
Rules and tests: [`stories/follow-a-route.md`](stories/follow-a-route.md).
**The single card built 11 Nov** (Sam: "Build the single card view as this was confusing"): one card in the order
below while the live view is about the followed journey; same story, "One journey card". **Arrival at the change
station built 11 Nov** (the listed next tube's office time). Not yet: "Another option" for the same train at another
station.
- While a route is followed and the journey is under way (on the train, at the change station, on the tube, on the
  final walk), the screen has **one** journey card. The separate live card ("On the train", "You're at Farringdon",
  "On the tube", "Walking to the office") is not drawn beside it; its content moves into the one card.
- Order inside the card, top to bottom:
  1. **The journey:** the next clock (arrival at your stop · next tube · now, walking) → final arrival, with Journey
     remaining beneath; one line naming the service you're on and its status.
  2. **The legs:** Journey stages (Walk · Train · Tube · Walk as Done / Now / Next), then the current leg's station
     line (section 5).
  3. **What's next:** the next step, then the onward connection (section 2).
  4. **Folded away:** "Not your train?" (correction), Report details, Your journey steps, Stop following.
- Everything in the card comes from the followed route: its train, its stop, its arrival. When the same train calls
  at another station that would also work, that is offered as "Another option", never mixed into the card.
- The app keeps working out where you are independently. When that disagrees with the followed train, the card asks
  (section 6); it never silently switches and never hides the doubt.
- Without Follow, the live views are unchanged.
- **Arrival at the change station:** the card's final arrival is the recommended tube's arrival, worked out with the
  same station-exit allowance and measured walk as the plan (#57 F1), so the plan and the live figure agree unless
  something real changed. Until F1 ships, the followed arrival moves only when you board a tube (as now).

### 2. The onward tube, from the start (A2, C7, D2, D3) — Sam, 10 Nov
**Built 10 Nov (first bullet only, on the followed card), plus the homeward line the amendment lacked (H1):** "Tube:
**[Circle] [Met]** Aldgate → Farringdon · 7 min", wording chosen by Sam, 10 Nov 20:57, shown from following until
you're at a London station. **The single list at the change station built 11 Nov** in the words below ("Clean
baseline"). Not yet: the live rows from 15 minutes before the change station, and the "or [H&C] … if it comes first" line. Detail and tests:
`docs/stories/follow-a-route.md`, "The tube named, one leave time, and a card that agrees with itself".
"The tube guidance earlier on the journey needs to show the best tube route or routes and the line using the standard
line colours in lozenges."
- Before boarding and on the train, directly under the train (or the next step): a **Then** line with the best onward
  tube route or routes from your stop. Each line is a lozenge in TfL's colour with its name (`--circle`, `--met`,
  `--hc`: identity, not status), then destination, direction and typical ride:
  "Then **[Circle] [Met]** to Aldgate · eastbound · about 7 min". A second route is listed when it gets you there no
  later: "or **[H&C]** to Aldgate East · if it comes first". **Words confirmed by Sam, 10 Nov.** ("If it comes
  first" is the plain-words version of the rule; the live rows nearer the change station carry each tube's arrival
  at your destination, which is what decides.)
- From about 15 minutes before you reach the change station, the Then line becomes the next tubes with live times
  (up to three rows: lozenge, destination, time, arrival at your destination). Until then it says nothing about
  particular trains.
- At the change station: **one** list of tubes, not pick buttons plus a list. A row is tapped to say "I'm getting
  this one". Rows are headed "Tube", not "Train". The position number is labelled as what it is ("1st on the
  platform board"). A Circle train that reaches Aldgate the long way round names it: "Circle via Aldgate".
  "If you're near the platform" is said once.
  The card's journey line is "Next tube 08:08 → At office 08:24"; the instruction is the line's lozenge with the
  action in it ("**[Get on the Met to Aldgate]** eastbound · Platform 1 · in 4m 47s · about 1 min to spare on the
  platform"); the list is headed "Tubes to Aldgate and Aldgate East · as on the platform board · tap the one you're
  getting"; rows read "1st · 08:06 · [Met] to Aldgate · Office 08:22", an H&C row "to Barking, for Aldgate East".
  **Words confirmed by Sam, 10 Nov.**

### 3. Before the train (A1, A3, A4, B1)
**Built 11 Nov** ("Clean baseline"): no "Next train:" line, no "Next:" naming the train before boarding, "Leave now ·
45 s" urgency. Not yet: the small "to walk to Letchworth at your usual pace" under the urgency line. **Built 12 Nov
(Sam):** "Be on the platform by" once you've set off, not only at the station. ("Arrives first" once: built 10 Nov.)
- **"Arrives first" appears once** on a recommendation.
- **The train is stated once, by the train panel** (scheduled time, expected time, arrival at your stop, operator,
  destination, platform). The separate "Next train: …" line and, before boarding, the "Next: …" line are removed.
  This touches the protected connection clock: Sam approved it on 10 Nov on the basis that the panel carries the
  same facts prominently.
- **At the station** the deadline stays (protected answer) and is worded for where you are: label "Be on the
  platform by" with the same canonical time, then "train departs in N min". No "Leave by", no walking text.
  (Built 10 Nov while following: the time is the train's expected departure less the route's catch margin, 1 min
  by default, because the leave-from-here time has already passed once you're at the station. Sam, told of it
  10 Nov: "That's ok for now".)
  **Words confirmed by Sam, 10 Nov** (he changed "On the platform by" to "Be on the platform by").
- **Urgency:** with under 2 minutes to the leave deadline, the countdown becomes the most prominent line on the card:
  "Leave now · 45 s", in the headline's weight and ink on an accent-tinted band. It does not use a status colour:
  red, amber and green keep their one meaning. Beneath it, in small type: "to walk to Letchworth at your usual
  pace". Once the deadline passes, the existing effort wording takes over. **Words confirmed by Sam, 10 Nov.**

### 4. On the train (C10, C11)
**Built 11 Nov with the single card:** the identity line, no departure panel or platform once aboard, and "Not your
train?" folded when certain and open when unsure. Not yet: "3 min to the tube platform" in the next step.
- The card leads with arrival at your stop → final arrival, and one line: "You're on the 07:20 Thameslink to
  Brighton · On time". The departure platform and the three-column departure panel are not shown once aboard; the
  panel's arrival figure is the card's first clock.
- "Not your train?" is folded while the train is confirmed or certain, and open when the app is unsure.
- The next step names the change in plain words: "Next: 08:04 · Arrive Farringdon · 3 min to the tube platform"
  (not "change 3 min").
- **Words confirmed by Sam, 10 Nov:** the identity line, "Between Stevenage and Finsbury Park" with "Last reported
  at Stevenage 07:30." beneath, the next step above, and "Not your train?".

### 5. Progress along a leg (C9, C13, E1)
**11 Nov retest (Sam):** the bar reads as a station position but is time elapsed, and the station row runs off the
right; three replacement options were mocked up (`design/leg-progress-options-2026-11-11.html`) and **Sam chose A,
"One line + folded list". Built 11 Nov:** `stories/journey-progress.md`, "Where you are on the leg". It supersedes the
station-line bullets below where they differ (no "you are here" marker drawn on a line; the one line says it).
**Built 10 Nov (first step only):** TfL's location text for the matched tube is shown as one line under the tube leg
("At Barbican · TfL, 08:16."). The stations are not yet marked from it and the bar remains:
`docs/stories/journey-progress.md`, "Where your tube is, in TfL's words".
- The continuous bar above the stations is removed. The **station line is the progress display**: a station is
  filled in when there is a report for it, and a "you are here" marker ("At Moorgate", "Between Hitchin and
  Stevenage") is drawn only when there is evidence. With no evidence the line shows the stations and times and says
  "Estimated from the timetable".
- Journey stages show Done / Now / Next without a partly filled bar.
- **Evidence for tubes:** TfL's own location text for the tube you're matched to ("At Barbican Platform 1",
  "Between Liverpool Street and Aldgate") counts as a report. This replaces the rule that a tube is never shown at
  intermediate stations.
- Copy: "Last reported at Stevenage 07:30." (no "passing-point position" wording).
- On the tube the card reads: "At Aldgate 08:21 → At office 08:28"; the line's lozenge with "You're on the 08:12 Met
  to Aldgate"; the marker "At Moorgate" (or "Between Moorgate and Liverpool Street") with "TfL, 08:16." beneath;
  stations marked "TfL report" once passed and "Expected" ahead; "Next: 08:21 · Aldgate · then about 7 min walk";
  and "Not your tube?" folded. **Words confirmed by Sam, 10 Nov.**

### 6. When the app doubts your train (C1, C2, C4, C12)
**Agreed 11 Nov (Sam), built 11 Nov:** once you've said which train you're on, the card either affirms it or questions
it openly ("You picked the 07:30 …, but your position fits the 07:38 … better. Still on the 07:30 …?"); it never
quietly goes back to "Probably …". `stories/which-train.md`, "The train you said you're on holds".
**Built 10 Nov (C1, C2)** on the existing on-train and followed cards, ahead of the single card: the question, the
station check behind it, "Keep", asking before a different train is selected, "I'm on it" asking when unsure, and
hiding a doubted train's reports. Exact rules and tests: [`stories/which-train.md`](stories/which-train.md), "The
wrong train". **Built 11 Nov:** the correction lists trains that could be yours, the rest under "More trains" (C12,
`stories/which-train.md`). Not yet: the correction control always reachable after a reload (C4).
- The question appears inside the one card as a caution panel (yellow `note`, not a status colour). It states the
  evidence, then asks, and never switches for you: "The 07:15 Great Northern stopped at Knebworth; you didn't. Which
  train are you on?" with the candidates as buttons (the train you're following first), "Keep the 07:15 Great
  Northern", and "More trains". **Words confirmed by Sam, 10 Nov.** That is the morning's real case: Sam was
  following and riding the 07:20 Thameslink to Brighton and had selected the late 07:15 Great Northern slow train to
  King's Cross in the list (#57 C1, corrected).
- **Selecting a train other than the one you're following asks before it is accepted** ("You're following the 07:20
  Thameslink. Switch to the 07:15 Great Northern?"). Agreed by Sam, 10 Nov.
- **While the train is in doubt, its station reports are not shown** on the station line ("Station reports are hidden
  until you say which train you're on"); Journey stages stay. The trains themselves stay listed as candidates
  (never hide a train). Agreed by Sam, 10 Nov.
- "I'm on it" confirms only when the app has one candidate; when it has more than one it shows them and asks.
- The correction control is always reachable from the followed card (folded when certain). It lists trains that
  could be yours; every other train stays reachable under "More trains".

### 7. Controls once a journey is under way (A5)
**Built 11 Nov** (first and third bullets; "Clean baseline"). "Along the line" folds behind the row with the other
controls rather than sitting in it (Sam, 11 Nov evening).
- While a route is followed, or Auto is showing a live view, the mode bar, Auto / Plan / Live, the location line and
  Leave now / Arrive by / Leave around collapse into **one row**: a summary ("Commute · To office · Leave now") that
  opens the full controls, with Settings and Refresh. Planning (nothing followed, not live) keeps every control
  exposed as now.
- "Along the line" is a link in that row while you're on a train, and is not pinned to the top of the screen at
  other times.
- The location line is shown outside the folded controls only when it has something you need: a position that is
  old or unavailable (section 8).

### 8. Location (C8, E4)
**Built 11 Nov:** the nearest station by name (3 km out of London, 1 km in it), "as of 08:08", and "Update location".
Not yet: the train's newer report leading the line.
- The line names the nearest known place or station ("at Aldgate", "near Stevenage"), not "near Letchworth" or "in
  London" for anywhere within 15 km. An old position says when it's from ("at Farringdon as of 08:08"). When the
  train's last report is newer than the phone's position, the report leads.
- "Update location" on the line asks the phone for a fresh position without reloading the page. It only runs when
  tapped.

### 9. Notices and small things (E2, E3, F2, F3)
**Built 10 Nov:** the notice rule and wording with ✕ (first bullet; the reason is the train's lateness or "the rest
of your journey", not yet the tube you took), and the walk left set against the measured walk (F2). Also from the
homeward findings: "N min later than planned" in place of "On track" when later than plan (H24, wording chosen by
Sam), and the finished train leaving the followed card (H26). Built 11 Nov: the status line after the train (empty
when nothing to say), the empty heading. Not yet: the walking card's wording ("About 4 min walk from Aldgate").
- A change to the followed arrival says what changed and why: "**Arriving 08:28** (was 08:24): you took the 08:12
  Met, not the 08:08." No notice when the arrival is back at the original plan, and none for a change under
  3 minutes on the final walk. It is dismissed with a plain close control (✕), not "Seen". **Words confirmed by Sam,
  10 Nov.**
- After the train, the status line shows line status (or nothing), not "Journey data not available yet".
- The walking card reads "Now · walking 08:20 → At office 08:24", then "**About 4 min walk** from Aldgate to the
  office"; a distance, if shown, is labelled "as the crow flies". The location line, when shown, reads "Position as
  of 08:17 (at Aldgate) · Update location". **Words confirmed by Sam, 10 Nov.**
- A section heading with nothing under it ("Nearly there") is not shown.

### Rules this supersedes
- 2 Nov, "an explicit next service (scheduled identity, boarding station, changed expected departure)" as a separate
  line beside the train panel → the panel alone (section 3).
- 2 Nov, the fixed three-column train panel in every active phase → not once aboard (section 4).
- 1 Nov protected answer, "At the actual station, retain the canonical platform-access deadline and platform
  instruction" → kept; its label and countdown wording are now specified (section 3).
- 31 Oct compact controls: "Auto/Plan/Live and Leave now/Arrive by/Leave around stay exposed", "Keep the existing
  inferred-location diagnostic visible", and the along-the-line story's "keep it accessible while scrolling" → apply
  to planning only; under way, section 7.
- journey-progress story: "Keep a different Follow choice intact in its own panel" and the ban on showing a tube at
  intermediate stations → sections 1 and 5.
- follow-a-route story: "every change of at least one minute shows its reason on the card until you've seen it" →
  section 9.

### Order of building (from #57)
Engine safety first (C1, then C2, then C3 with C4): a saved pick or route-driven live data must not ship before the
wrong-train check. Then this amendment's card, tube guidance and progress (E1 before or with removing the bar). The
walking rule (F1 with F2) before the station arrival in section 1 moves on live figures.

## Display mode — 10 November 2026 (Sam)

`?display` in the address shows a read-only board for a wall screen or a frame in another page (Home Assistant):
the status line, travel alerts, the Leave now recommendation from home to the office, the list of next trains and
when it was updated. Every control and entry point is hidden; "Journey steps" and a notice's "Full details" remain
because they only unfold information. It is the same view and the same styles as the app, not a second design: a
change to the planning card changes the display. A setup link is confirmed with a panel on the page, not a browser
dialog. It refreshes every minute all day (Sam, 10 Nov) inside a tested request budget. Behaviour, the measured
figures and tests: [`stories/display-mode.md`](stories/display-mode.md).

## Approved journey and leg UI — 2 November 2026

Sam approved the rendered review, its subsequent refinements, and implementation/release across Commute,
Leisure and Trip on 2 November. This is the current contract. It supersedes the earlier Trip-only/frozen-Signal
boundary, Auto/Plan-only connection panel exception, destination-as-train-arrival column, and original-start
total duration in Live wherever those older sections conflict. Further unrelated UI changes still require
explicit agreement. [Approved visual reference](design/approved-journey-review.html) contains illustrative
scenarios, not production state transitions or transport advice.

### Whole journey and individual connections

- Planning preserves **Leave by → At final destination**, canonical precise leave countdown, an explicit next
  service (scheduled identity, boarding station, changed expected departure), both complete recommendations
  and every option in the existing engine order. The requested date/deadline remains separate from the answer.
- **Total journey** is centred immediately below the arrow/time row, before countdown/next-service copy.
  It is the planned leave-to-final-arrival duration. The rail-only caption remains separately labelled.
- In **Live and active journeys**, including Auto following/travelling, that same lozenge becomes
  **Journey remaining**: current time to current expected FINAL destination arrival. It updates as time and
  the ETA change, including waits, changes, non-rail rides and final access. Unknown/missed/cancelled arrivals
  have no retained promised duration. Do not substitute a past original-start duration. Full timestamp
  arithmetic belongs to the pure engine, including midnight/day boundaries.
- Each train has fixed **Timetable departure / Expected departure or status / At [alighting station]**
  columns. The scheduled clock identifies the train even when delayed. On time/Not live/No estimate/Cancelled
  retain the Expected column; operator/platform never occupy it. Departure and arrival qualification are
  independent. The panel names boarding and alighting stations; advertised destination is separate metadata.
- The final address/office/home arrival belongs to the journey. A Live departure board's third train clock is
  arrival at the alighting station, with a separately labelled final-destination projection below where a
  complete matched itinerary exists. Live without a selection does not invent a followed route.
- Reuse the same components for Trip's ordered access, rides, transfers and final access. Show time between
  services separately from spare time after required transfers. A delay may consume waiting without moving
  the final ETA; an impossible connection withdraws its promise and offers a deliberate replacement.

### Compact controls and effort

- Remove the visible Cartref Commute title and separate route row. Keep the existing mode controls beside
  accessible Settings/Refresh controls. Direction or Trip route and selected per-end access modes belong to
  Journey options beside Auto/Plan/Live. Retain meaningful location diagnostics, simulator access, native
  editing, handlers, saved values, keyboard focus and touch targets.
- Expose the existing effort and arrival-first results on every applicable recommendation, list/board row
  and next connection. Walking can have a quiet text description; Fast walk, Run, Car needed, Can't make it
  and their combined Arrives first qualifiers retain their agreed meaning. Walk/fast walk may lead the normal
  recommendations. Run/car are explicit qualified alternatives, never an aesthetic rerank. Unreachable trains
  stay visible; cancelled/no-estimate services receive no effort or fastest claim.
- Keep the existing start allowance, fixed platform/boarding times, configurable limited run, own car only
  at home/cab elsewhere, and hysteresis. Arrive by retains Latest for/Least late; Leave around retains its
  eligible window. Once aboard, effort refers to the next uncompleted access/connection, not the origin.
- Cycling remains explicit chosen Trip access, including bicycle locking and platform allowances. This
  approval does not invent an automatic Commute cycling grade or assume that a bicycle/car is available.

### Customer-journey continuity and acceptance

- Follow is optional. Preserve unselected Live departures, inferred/probable train/Tube identities, ambiguity
  choices, confirmation and correction. A chosen route is not proof of boarding; a clock-derived Trip phase
  must be qualified rather than advertised as confirmed physical travel.
- Selecting either complete recommendation follows that exact itinerary. Refresh, theme, disclosure and
  Plan/Live navigation cannot silently choose another service. Manual planning retains the active journey,
  important alerts and a way back, using the established override lifetime and interaction deferral.
- Implement the approved Trip view/confirmation controls using its existing itinerary/controller. Retain
  explicit recovery and original-arrival reasons; do not replace this work with prototype scenario links or
  claim a new GPS matching algorithm/provider capability.
- Verify actual built-app customer journeys, 320/393px light/dark and enlarged text, not only the prototype.
  The independent implementation review must probe selected Next best, manual planning while travelling,
  no-Follow inference/correction, effort boundaries, partial/unknown timing, remaining-time ticking and
  deliberate source/CSS breakages before release. Existing source, ranking and request-budget checks remain.


Current implementation (1 Nov 2026): Signal is the only design. Panda is archived, and the Signal switch and
cross-design parity rule are removed. Follow is still an independent preference. [Retirement and audit](panda-retirement-review.md)
supersedes older references below to Panda as live, implementation pending, or design on/off restoration.

Signal selected by Sam, 29 October 2026; sole production design from 1 November (initial implementation and review recorded in docs/signal-testing.md). iPhone-first, with automatic light/dark appearance and manual appearance overrides. Planning and live views switch automatically, with a manual override. Sam selected the newer Follow a route behavior on 30 October; its 20-minute/situation-change override replaces the earlier journey-scoped lifetime.

## Start here

- [Architecture decisions and approval status](architecture.md#signal-presentation-architecture-29-oct-2026)
- [Acceptance story](stories/signal-design-system.md)
- [Prototype instructions](design/README.md)
- [Semantic tokens](design/signal-tokens.json)
- [Independent review and resolution notes](design/review.md)

The HTML is a review simulation. Consume the tokens and component contracts; do not copy its sample timing, inference or routing logic into production. The prototype itself contains no production planning logic; production integration is documented below.

## Signal is fixed; this work changes Trip only (Sam, 1 November 2026)

Sam wants to test Signal in real conditions. **Keep Signal's existing UI and every non-Trip behaviour unchanged
unless he expressly directs a change.** This includes palette, card layout, typography, controls, timings, ranking,
Follow and data handling. No adjacent refinements or restoration of an older prototype are authorised.

Trip must reuse the existing Signal components, hierarchy and colour treatment. A different card arrangement
with shared tokens or matching individual CSS values is not a shared UI. Sam rejected both the proposed commute
redesign and the separate-looking Trip proposals. Use actual Signal as the fixed comparison, with matched data
where possible, and show only proposed Trip changes for review. The previous blue-card redesign previews are
withdrawn. Sharing renderer code must preserve non-Trip output and behaviour.

Sam identified the **current commute screen** as the fixed reference (not the earlier Signal preview).
Trip recommendations therefore call the existing Signal recommendation-frame renderer and use its current
headline, duration, connection, flags, steps and Follow components without a new palette or card design.
Trip's place names replace commute context only while Trip is active; leaving Trip restores the existing context.
Trip's original address/access controls occupy the existing Journey options disclosure through an injected host.
The question and answers stay exposed; leaving Trip removes its controls from that host. This reuses the existing
Signal component without changing its appearance or behaviour in non-Trip modes.
The collapsed Trip summary retains the selected access modes (for example, **Trip · Walk to · Drive from**),
just as the commute summary retains pace. Closing the controls must not conceal those effective choices.

## Protected product answer: when must I leave? (Sam, 1 November 2026)

The product answers **when to leave from the journey's origin or current location**, then which service to
take and when it arrives. Before reaching the station, Auto and Plan must expose the route's canonical
**Leave / Leave by HH:MM** and its precise leave countdown without opening Journey steps. This applies to
Leave now, Arrive by and Leave around, both complete recommendations and the full planning list.
An active followed route must also retain its current access deadline before boarding.

In Auto and Plan, use the approved **journey + train panel** below, including while walking to the station;
retain the centred Total journey lozenge and train-duration caption. List rows retain their own leave deadline
alongside their departure information. “At the station about…”, minutes to spare, a train departure clock or
countdown, and an itinerary step do not substitute for the leave deadline. A passed leave time must remain
distinct from a train that has not departed. Use the option's engine timing and required pace; do not derive a
second deadline in CSS or the renderer, or advertise a usable one for cancelled/unknown services.

At the actual station, retain the canonical platform-access deadline and platform instruction alongside the
prominent train panel. Explicit Live is a timetable view. Once aboard, arrival and the next action lead. These contextual exceptions do not
allow Auto to hide the deadline merely because a person is somewhere near their local station.

Removing, concealing or substituting this answer is a **material product change**, which must be flagged to
Sam with its user-visible impact before shipping. A layout or copy request is not approval to make that change.
Verification must inspect visible values with disclosures closed and compare leave time against departure
time; a screenshot looking tidy or text merely existing inside Journey steps is insufficient.

## Current compact production revision — 31 October 2026

### Journey + train panel (Sam, 1 November 2026)

Sam approved option 2 of the three rendered time-hierarchy proposals: **journey + train panel**, and requested
it across modes other than Live. The train departure is a key connection to make, not secondary service metadata.

- In Auto and Plan, retain **Leave by → At destination** as the journey headline and expose the precise leave
  countdown. Then show the existing centred Total journey / train-duration facts and a distinct inset connection
  panel: **Train from [boarding station]**, a prominent **scheduled departure**, operator and platform.
- Use the same complete layout and clock sizes for the first recommendation and Next best. Apply the same
  hierarchy to the full planning list in both directions, Leave now / Arrive by / Leave around, Commute and Leisure.
  Before boarding, Follow retains the chosen connection panel and its current canonical access deadline where
  that deadline applies. An active Tube approach does not restart the journey from its original origin.
- In a delayed or early panel, label **Scheduled** and **Expected** separately at equal time size. Keep the
  scheduled identity; no strike-through or journey arrow between those clocks. Use the existing engine status
  and severity, including Not live / Estimated / Cancelled / No estimate. Unknown platforms say **Platform unannounced**.
- A multi-ride Trip repeats this panel for its existing train, Tube and bus rides in itinerary order, keeping
  each ride's boarding station, time, destination, platform and source qualification attached to that ride.
  Existing change allowances and warnings stay visible; the renderer never calculates new connections.
- **Trip uses the complete same UI (Sam, 1 Nov):** use the shared recommendation card, Leave by → At destination
  headline/countdown, centred duration rows, connection panels, route/status chips and Journey steps / Follow action
  placement. Next best has equal content and sizing; the full list uses the same compact planning rows. Do not add
  a separate repeated headline or total/operator summary. Multi-train duration sums time aboard rail services,
  excluding changes, Tube, bus and access; the total remains door to door. Unknowns remain explicit. Trip's
  address and access controls are the only form differences; before boarding Follow uses the same card primitives,
  while arrival/next action still lead once aboard. Both duration facts stay visible through access, ride, change
  and final-leg Follow phases. Journey steps retain their disclosure state on refresh.
- Explicit **Live** retains its timetable columns and current journey presentation. Once aboard in Auto or
  Follow, current arrival and next action still lead; completed departures must not replace that answer.
  Auto's homeward Tube view uses panels for the existing next rail connections while retaining its arrival headline.
- Recommendation clocks are 36 px for Leave by and the train, 32 px for arrival. Planning rows use the same
  geometry at 28 px journey clocks / 30 px train clocks. Long labels and 200% text reflow naturally. Actions
  remain at least 44×44 px. No panel, deadline or second recommendation is hidden to meet an old density target.

This supersedes the former departure-first walking/station geometry in Auto/Plan and the small inline train
time in origin planning. It does not change ranking, route timings, view selection, Follow state or live feeds.
Removing, concealing or reducing the connection clock to small metadata is a material change to flag to Sam
before shipping, just as with the protected Leave by answer. A cosmetic request does not authorise either loss.
The [acceptance story](stories/signal-design-system.md#journey--train-panel-sam-1-november-2026) records regression coverage.

### Stable information placement — 1 November 2026

Total journey time occupies a centred neutral lozenge in a dedicated row under the headline times and leave countdown,
labelled **Total journey**, with a separate centred train-duration caption beneath it. Sam approved this
placement in both Plan and Live on 1 November; it supersedes the first left/right duration anchors. Keep Live's
Expected departure in its original time column, and do not relabel total duration as time remaining. Use the
same centre in the primary answer, Next best, departure rows and followed/inferred journey facts; opening either
recommendation's Journey steps retains that row in place. Unknown totals explicitly say **Total journey time unavailable**. Longer route
labels get the full available width. Put board Follow
actions in a consistent right-aligned slot beside the countdown, away from route labels. Preserve natural
vertical growth for long details and enlarged text. See the [acceptance criteria](stories/signal-design-system.md#stable-glance-layout-sam-1-nov-2026).

### Journey facts and glanceability (Sam, 1 November)

Signal is the sole supported design. Preserve journey identity, timing, duration, ranking meaning, warnings,
uncertainty and actions across its applicable views. Ordinary [journey-fact regressions](stories/journey-facts.md)
cover these behaviours. Panda and the cross-design registry and release rule are retired; recovery and the
functionality review are recorded in the [retirement audit](panda-retirement-review.md).

Show train duration and total journey duration from the same existing itinerary wherever that journey is shown:
planning, Live departures, station cards/lists and Follow. “Arrives first” retains the engine's existing earliest
usable arrival and effort qualifiers. A later train with a shorter ride must not acquire the badge simply because
its duration is lower. Do not invent a total duration for an unplanned connection, cancellation or unknown arrival.
The shared pure `journeyFacts` helper supplies duration facts; the shell formats them and retains canonical flags.

Commuter copy must make sense at a glance: state the time, result or action in plain language. A departures heading
already explains what is shown. Do not add a paragraph explaining that no journey is underway or narrating how
the app chooses views. A short hint may explain that Auto shows when to leave. These are information/copy rules
across Signal views.

Sam authorised a substantial Flighty/Railboard-inspired redesign after comparing the live designs. The compact
revision supersedes the older prototype's sizing and always-exposed direction/pace controls below. The effective
direction and pace remain visible in a labelled context disclosure containing the actual Commute/Leisure,
Auto/office/home and pace controls. Auto/Plan/Live and Leave now/Arrive by/Leave around stay exposed.

Production geometry and tokens live in `src/signal.css`: a 21px brand, 36px leave time, 32px arrival time,
the same time sizes in both recommendations, 14px service metadata, 12px supporting labels, and at least 44×44px actions.
Times and controls reflow at enlarged text sizes. Both recommendations use the same complete card layout,
followed by full-width board rows. One impact summary stays visible;
significant route-relevant disruption is exposed, while remaining Travel alerts and Lines & data use native
disclosures. Every train and its individual problems remain
on the complete board. Additional line problems and example/timetable provenance must not be lost to consolidation.

### Complete second recommendation (Sam, 1 November 2026)

Next best is a valid choice, including an earlier Arrive by train with more arrival margin. It shows the same
content categories and type sizes as the first card: leave/arrival or departure/Expected times, train and total
duration, route/line chips, service/platform, timing margin/countdown, applicable warnings, alternate boarding
points, Journey steps and Follow when enabled. Each card uses its own canonical values and ranking flags;
the earlier train does not inherit “Latest for” from the latest-leaving train.

Show both complete cards immediately. There is no option-level disclosure; Journey steps uses the same
disclosure on each card. This supersedes the 31 Oct compact Next best summary. Reuse the existing option
renderer rather than cloning selected facts or constructing a second, reduced representation. More vertical
space for requested journey information is preferable to hiding the information to meet an old density target.

### Shared geometry and live-journey clarity (Sam, 31 October 2026)

Position carries meaning as well as type and colour. Explicit Live's repeated time fields use the same page-wide anchors in the
primary answer, Next best and the complete board: Train/Leave at the left, Expected at the centre when this is a
departure board, and destination arrival at the right. Use the same content inset and column widths; route chips,
service metadata, disclosure labels and Follow actions cannot squeeze a time into a different position. Place
Next best above its time grid. In planning the Expected slot stays empty rather than moving the arrival inward
or inventing an expected departure. The rule applies wherever these semantic fields recur. Enlarged text may
reflow in a consistent order, but may not overlap, clip or shrink controls below 44×44px.

Keep the existing inferred-location diagnostic visible outside Journey options. It must distinguish the actual
location/source/accuracy from a manually chosen direction and preserve unavailable or old-fix qualifications.
This presentation does not change location permission, watches, inference or journey state.

Disruption visibility uses the agreed [impact policy](stories/warnings.md), centrally configured and shared by
all consumers. A significant problem affecting the route must not depend on opening a disclosure. Minor,
unrelated and facility detail can remain compact/folded. A short highest-priority summary does not replace the
significant information needed to understand the impact; full notice text and source remain available.

Rail and Tube live views add an overall journey strip with its legs, followed by the current-leg calling-point
view. The [progress contract](stories/journey-progress.md) requires existing engine itinerary/times and explicit
reported/expected/modelled/stale evidence. Live delay information may qualify ahead/behind; a timer or marker
does not become a live position report. Preserve uncertainty and correction actions. The historical
[Womble diagram](design/proposals/womble/a3-on-train.html) is a geometry reference, not a source of mock timings,
continuous train positions, passing points, extra live feeds or old non-compliant accent colours.

The [compact acceptance story](stories/signal-design-system.md), [approved visual review](signal-compact-design-review.md)
and [independent regression review](signal-compact-independent-review.md) record the current contract and measured
exceptions. Earlier preview/token artifacts remain design history; they do not override the current production
geometry or justify copying old routing logic. The shared engine, status colours, source truthfulness, manual-view
lifetime and preservation rules remain binding.

## Evidence and scope

Read `src/page.html` on main (912e0977c386789aa2a892f84bb88a18cdd16734) and the architecture and all capability stories on `docs/context-in-repo` (tree 1454801756ce71a8a9fc4d8c348027c79760c958). The context branch's screen differs from main only in the location-resume fix; main's newer fix must be retained. This is a source audit, not a claim to have tested the production app with live credentials.

Primary device: iPhone. iPad/Mac adaptation later. Scope: commute planning and live travel, including onward Tube and the final walk. Leisure, full settings, people/trips and native extensions are outside this design round; their existing entry points must survive implementation.

Reference research: [Commutative](https://apps.apple.com/gb/app/commutative-live-trains/id1312667553) for an immediately readable active train/platform; [Flighty](https://flighty.com/) for journey status, delay changes and continuity. These are inspiration, not a promise of equivalent feeds or accuracy.

Current sources are National Rail departure boards, Service Details stopping-point reports, TfL arrivals/status and timetable. Early platforms, passing points, coach formations and crowding are backlog items, not current capabilities. Do not draw an exact moving train marker from interpolated positions. Label station reports, predictions, modelled onward times and stale data separately.

## Directions

**Signal:** a decisive glance screen. A large contextual answer (leave by / departs / arrive), then the best fallback, then the complete board. On-train view gives arrival and the next action prominence. Rounded layered surfaces and cool blue/teal accents.

**Journey:** the whole trip as a readable itinerary. The recommended journey is a continuous sequence from walking to the train to the final destination. On-train mode highlights the current leg and retains onward context. Quiet paper/ink surfaces with a violet accent, firmer edges and more editorial typography.

Both use the same sample journeys and states. The data is illustrative, not an actual timetable or live feed. Interaction is a design simulation, not the production routing engine.

## Functionality inventory and preservation contract

| Existing capability | Design location / rule | Evidence |
| --- | --- | --- |
| Commute / Leisure | Commute header retains Leisure entry; destination screen out of scope | page controls; any-start-and-end-point |
| Auto / To office / To home | Effective direction visible; actual manual/Auto controls in Journey options, available without location | direction-and-arrival |
| Average / fast walking | Effective pace visible; actual control in Journey options, outside general Settings | page controls; on-the-way-to-the-station |
| Leave now / Arrive by / Leave around | Three explicit planning modes with date and time | arrive-by; leave-around |
| Best and next best | Kept together, across routes; no manufactured fallback if none qualifies | top-card |
| All loaded trains in leaving order | Full board below recommendation; cancellation and no-estimate rows remain | never-hide-a-train |
| Leaving right now / hurry | Explicit consequence, train duration and arrival comparison | slow-trains; top-card |
| Leave / depart / arrive distinction | Context changes the primary time, with an explicit label | at-the-station; on-the-way-to-the-station |
| Scheduled plus expected times | Both shown wherever a delayed service appears | late-trains |
| Train duration and total journey duration | Shared facts remain visible across planning, Live, station cards/lists and Follow; steps remain available | journeyFacts; UI parity; page optionBlock/renderList/renderLiveBoard |
| Platforms | Inline, never only in expansion; unknown shown as unannounced | same-train; page platMeta |
| Same train, multiple boarding points | One service; both station/time/platform choices visible, unreachable marked | same-train |
| Slow, standing, tight, late, cancelled, uncertain, passed, timetable flags | Inline text with semantic colour; never silently filter | never-hide-a-train; standing-room |
| Journey steps | Expanded timeline in Journey; disclosure in Signal | page optionBlock |
| Why these trains? | Disclosure beneath complete board, with route-specific coverage and exclusions | never-hide-a-train |
| Refresh and source freshness | Explicit footer control; stale warning stays near primary answer | reliability |
| Train matching and correction | Visible 'Change train'; uncertainty asks, never invents certainty | which-train |
| Last reported stop and expected arrival | Labelled station report, source and timestamp; no exact map | which-train |
| Tube selection, near-platform exceptions, spare minutes | Connection screen retains alternatives and selection | connections |
| Did you get it? / still here | Confirmation and correction retained | connections |
| Tube home determines train | Exit recommendation + alternative exit and home-time consequence | tube-home |
| Nearly home / arrival / unknown | Train + walk, then location walk; missing home does not invent an ETA | nearly-home; direction-and-arrival |
| Line status and notices | Every relevant line named, including good service; impact before background detail | warnings |
| Settings, home location and experimental controls | Settings entry retained; existing functionality remains in later implementation | page settings dialog |

## Explicit recommendations requiring Sam's decision

1. Consolidate repeated explanations of the same delay into one affected-service message, while retaining the scheduled/expected time and short delay label on every occurrence. This reduces repetition, not the available information.
2. Keep technical source diagnostics under the existing **Why these trains?** disclosure. Keep source type and freshness visible. Do not move the stale warning into that disclosure.
3. Keep unrelated network and facility notices folded, as today. No new hiding of safety-relevant or journey-impacting notices.
4. **Accepted with refinement:** automatic planning/live switching is the default. Plan and Live are manual overrides, with a visible **Auto** action. Overriding the view must not reset a tracked train, direction or deadline or stop background updates.
5. Do not remove any current capability. Retain Leisure and Settings entry points while their full redesign is deferred.

## Draft shared system

- System font (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif); iOS native work should use semantic Dynamic Type styles. Hero time 48–56 px, page title 28–32, component heading 18–20, body 16, supporting text 13–14. Tabular numerals for times; no truncated station names.
- 4-point spacing scale: 4, 8, 12, 16, 20, 24, 32. Phone content inset 20 px (16 on small widths); touch controls at least 44 px. Content scrolls as a single page; overlays must support keyboard, focus return and dismissal.
- Semantic roles: canvas, surface, raised surface, primary text, secondary text, divider, accent/action, positive, caution, severe, informational. Separate light/dark values; never reuse the same warning text colour blindly on both themes.
- Signal radii 24/16/12; Journey 12/8/6. One strong primary area per screen. Colour is never the sole indicator of a state. Cancelled and uncertain services remain readable.
- A train: red when cancelled, no estimate or 15+ min late; amber 5–14 min; green under 5 min (Sam, 30 Oct; amber moved from 2 to 5 the same day). The route-wide status line uses the same thresholds. Red, amber and green are reserved for status; see [Status colour is reserved](#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal). Route notice without observed impact: caution. Background notices: neutral.
- Prefer labelled actions to mystery icons. Minimum contrast target WCAG AA (4.5:1 body, 3:1 large text/UI). Test both appearances, 320 px width, large text and VoiceOver on real iPhone before implementation acceptance.
- Appearance defaults to System; optional Light/Dark override. Changes preserve view, selected service, scroll, expanded details and entered deadline. Avoid automatic theme animation; respect Reduce Motion.
- State model: loading, empty, live, timetable only, stale, partial failure, no estimate, cancelled, location denied, uncertain train, user-confirmed train, connection, final walk, arrived. Confidence belongs to the data, not visual polish.

## Timetabled and expected departure (Sam, 30 Oct 2026): Panda and Signal

A train is named by its timetabled time ("the 08:00"): the platform board, the "Which train?" choice and "You're on the
08:00" all use it. Wherever the departure is the headline (at a station, on your way to one), the timetabled time is
as prominent as the expected time. Chosen from three options
([comparison](https://claude.ai/artifact/M5yQwasvt3bLdiFgKXXfbz)): **A, board columns.**

| Column | Content | Style |
| --- | --- | --- |
| Train | Timetabled departure; "Train from St Pancras" when you'd board elsewhere | Option-time size, neutral |
| Expected | Expected time when it differs from the timetable; else "On time" / "Not live" / "Estimated" / "No estimate" / "Cancelled" | Same size (a word a step smaller); colour = status band |
| At office / At home | One expected arrival; no timetabled door-to-door arrival exists | Same size, neutral |

- Platform-board order: timetabled, then expected. Never strike through the timetabled time (it reads as cancelled and
  hides the name you match against); never "08:00 › 08:03" in one slot (reads as a journey).
- The delay's word and minutes appear once, in the status pill; an "On time" pill is left off (Expected says it).
- Never "On time" without live data. TfL's reported delays count as data: shown as the expected time, coloured.
- Auto/Plan use the approved journey + train panel above: Leave by → Arrive, then prominent Scheduled/Expected
  connection clocks. Explicit Live list rows retain the three departure columns with route/operator/flags below.
- Engine: `departureStatus` in `src/core/rules.ts`. Story: [late-trains](stories/late-trains.md).
- **Panda** (the live build): built 30 Oct; tokens `--hero-ok/warn/bad` on the card, `--ok/warn/bad` in the list.
  → [panda](design/panda.md#departure-board)
- **Signal:** `JourneyOption` and `TrainBoard` follow this. The review prototype (`design/signal-preview.html`)
  predates it and still shows "Departs" with the expected time; superseded on this point.

## Status colour is reserved (Sam, 30 Oct 2026): binding on every build and every proposal

Red, amber and green mean one thing only: **is there a problem?** Green = no problem, amber = some problem, red =
serious problem. They are never used for brand, identity ("You're on the 08:00"), selection, the best option,
emphasis, focus, tracking or actions. Why: 30 Oct, on the train, the identity lozenge was orange, so "this is your
train" read as a warning while the train was close to on time.

- **Accent / action must be a hue clearly distinct from all three.** Signal's blue (`accent` in
  [`signal-tokens.json`](design/signal-tokens.json)) complies. Identity, selection and "best" use accent or neutral
  (ink / outline), never a status colour.
- **Every train in live mode shows its status**: card, list and board, and the train you're on. Word and minutes,
  coloured by band; never colour alone ("On time", "2 min late", "18 min late", "Cancelled", "No estimate").
- **Bands (Sam, 30 Oct), one engine rule** (`delayLevel` in `src/core/rules.ts`): green under 5 min late (or
  early), amber 5–14 min, red 15+ min, cancelled or no estimate. (Amber started at 2 until later on 30 Oct.) A timetable train, or a time worked out from another
  stop, gets no status: never "On time" without live data. On the train, the band is for the expected arrival at the
  change station against the timetable, the time that matters; departure delay is history. The route-wide status
  line uses the same thresholds, but answers "is my route disrupted", not "is this train late". On a departure
  board the status is the Expected column ([below](#timetabled-and-expected-departure-sam-30-oct-2026-panda-and-signal)).
- **Caution (yellow `note`)** stays for a notice on your route with no observed impact; it must not be mistaken
  for amber.
- **Tube line colours are identity, not status** (Sam, 30 Oct): a lozenge or chip naming one tube line uses TfL's
  colour for that line (`--circle`, `--met`, `--hc`), always with the line's name in it. The Circle's yellow is
  close to caution; the name and the lozenge shape keep it distinct. Don't extend this to a status colour that
  isn't a line's own.
- **Where the status sits on the live card (Sam, 30 Oct: option 2 of 4):** inside the train's identity lozenge. The
  train name is in accent blue, with the status chip inside it in its band: `[You're on the 08:00 Great Northern
  (About 2 min late)]`. Panda nests the chip inside the lozenge so it wraps as one piece on narrow screens. The Signal preview, whose
  identity text is shorter, draws a split lozenge (name, then status segment). The status isn't repeated on the next line.
  Rejected: a chip beside the hero time (it describes the office arrival, not the train), the hero time coloured
  (alarming in red; large-digit contrast), and a full-width strip (heaviest change).
- **Accent (Sam, 30 Oct): Signal's blue**, in Signal and in [Panda](design/panda.md) (the live build).

**Where it is implemented:** Panda (`src/page.html`, 30 Oct). The accent and rail hero lozenges are blue (tube lozenges take their line's colour), late text takes
its band, and every live train has a status pill and lozenge →
[train-status](stories/train-status.md). "At the station about" on your way is green / amber / red by minutes to
spare (`wayLevel`), which is status, not identity. The Signal preview ([`signal-preview.html`](design/signal-preview.html))
is updated to match. Its countdown line is accent rather than always-green, lines with no live status say so, and
"Cancellations reported" is amber.
**Proposals:** `original` skin A and `womble` skin A use an amber accent, and `womble` skin B a green "on time /
tracking" accent. None may be carried forward without retuning. Signal complies.

## Implementation handoff

The review package supplies visual references, not production planning logic. Implementation starts from latest `main`, preserving improvements since the prototype audit. Signal changes presentation; the shared Follow a route engine supplies journey behavior. Reference existing stories and thresholds. Signal design and Follow a route are separate Experimental switches, both initially off; selecting Signal checks Follow a route, which remains independently configurable. Panda and Signal share saved journey state. See [preservation and verification](signal-testing.md).

Latest-code reconciliation also preserves the concurrent Follow a route improvements from `d330e95`: visible
original arrival, explicit recovery and boarding correction, stable same-train progress, deliberate run/car
selection, quiet ordinary alternatives during a Tube approach and a one-minute ETA-change threshold. Known
homeward Tube vehicle predictions are accepted only through the recorded-data validated stop/line/direction
matching path with three-minute freshness and source guards; modelled fallback remains explicit. This does
not solve missing Met departures at Aldgate or establish provider-wide vehicle reliability.

Implementation verification: existing engine, golden and app suites; document any intentional presentation snapshot changes; run build and commit generated index.html; typecheck and check-docs. Add targeted UI/accessibility coverage for theme persistence, manual correction, full-board retention and responsive controls. No claim of production regression protection is made by this mockup alone.

## Palette reference

Signal is selected; Journey is retained only as comparison history. Token values remain adjustable during implementation accessibility checks. Each cell is light / dark.

| Role | Signal | Journey |
| --- | --- | --- |
| Canvas | `#F1F4F7` / `#0B1017` | `#F5F3EF` / `#141318` |
| Surface | `#FFFFFF` / `#151E29` | `#FFFEFA` / `#201F26` |
| Primary text | `#17283B` / `#EDF4FC` | `#292735` / `#F1EDF7` |
| Supporting text | `#536477` / `#AEBFD1` | `#665E70` / `#C1B8CD` |
| Action | `#174EAC` / `#9ABFFF` | `#6550A7` / `#C5B2FF` |
| Accent surface | `#E4EDFF` / `#1C3557` | `#EDE7FB` / `#363047` |
| Divider | `#CFD9E3` / `#344356` | `#D7D0DB` / `#433D4D` |
| Positive text | `#12674E` / `#7CE0B7` | Shared |
| Caution text | `#835000` / `#FFD18A` | Shared |
| Severe text | `#B1293C` / `#FF9BA8` | Shared |

## Independent review and revisions

A separate agent reviewed the draft against the source stories and current rendering code. Its review was static and independent of the design rationale. It found real issues in the first mockup. Revisions include:

- Train and Tube selections now carry service-specific arrival times into subsequent screens; the early Tube selection consistently shows 08:03.
- The slow homeward train has its own identity and ETA. The two homeward views use consistent times for the same Thameslink; the cancelled 18:24 is no longer an alternative recommendation.
- The 18:44 alternative is present in the homeward board. Current Tube-to-train choices near the office and the board while on the Tube are retained.
- Location denial holds the recommendation until a starting point is chosen. The journey leg survives Plan → Live navigation.
- Fallbacks retain flags, duration and steps. Walking/station steps start from the current situation; station mode puts departure first in both directions. The homeward station duration uses the correct clock.
- Timetable platforms are unconfirmed; stale times are explicitly qualified. Report retrieval time is distinguished from the reported event time.
- Touch targets, focus restoration, Escape dismissal and planning-time retention were improved.

Browser verification: both designs rendered; light/dark previews inspected at phone widths including 390 and 320 px. All 14 scenario selections exercised without undefined/NaN values. Checked early Tube confirmation → 08:03, Plan → Live retaining that Tube, homeward alternative/cancellation visibility, home-station duration, and location-denied gating. JavaScript syntax checked after final revisions.

Limits: no live credentials, production engine integration, real iPhone hardware, VoiceOver or full contrast audit. Scenario switching is a review control, not proposed app UI. Full Settings and Leisure open explicit scope notes, not functioning replacement screens. Loading, partial-route failure, Tube-feed failure, H&C fallback, unknown-home ETA and 'elsewhere in London' remain specified by the existing stories but are not fully simulated in this prototype. They must be included in the selected system's implementation state catalogue; their omission from this preview is not approval to remove them.

Native extension points: reserve a compact journey summary using the same semantic fields (service, confidence, departure/arrival, next action, platform when available, delay and freshness) for future Live Activities, Dynamic Island and widgets. No native integration is implied by the web mockup.

## Agreed interaction: automatic view, manual override

Sam approved automatic switching, interaction deferral and tracking/important alerts while Planner is pinned on 29 October 2026. On 30 October he selected the newer [Follow a route](stories/follow-a-route.md) behavior, including its override lifetime. The architecture document records this superseding decision.

- Default `viewOverride = auto`. Derive the screen from the existing engine's situation: planning before departure, contextual walking/station boards, active rail, interchange, Tube, final walk and arrival. Do not add a second set of GPS or timetable heuristics in the view layer.
- **Auto · Plan** or **Auto · Live** makes the current automatic choice visible. Tap Plan or Live to pin that view; the button stays labelled **Auto** in every mode (Sam, 31 Oct 2026). Tap Auto to clear the pin. No modal or confirmation is needed.
- A pinned view survives refresh, theme changes and brief loss of GPS, within its 20-minute lifetime and while the underlying situation stays the same. The active journey continues updating independently, with its train identity and deadline retained. A manual planning view must still expose a compact journey-impact alert if the tracked service is disrupted.
- When the user returns to Auto, immediately display the latest situation, not the situation from when they overrode it. Avoid moving a screen while the user is editing a date/time, choosing a service or reading an expanded notice; finish that interaction first and expose the pending live state.
- Preserve the existing inference confidence rules. If train identity is uncertain, show the candidate choice, not a confident fabricated journey. Choosing Live with no active journey shows a clear empty state.
- Keep **view override**, **direction override**, and **train/Tube confirmation** separate. Changing the screen does not change the trip. Direction controls retain the existing Auto/office/home behavior.
- Current lifecycle (Sam, 30 Oct; supersedes 29 Oct): selecting Auto clears a manual view override immediately; otherwise it expires after 20 minutes or when the underlying situation changes (reaching/leaving a station, starting/stopping rail travel). A refresh, theme change or transient location failure alone is not a situation change. The followed route itself persists independently until completion, Stop following, or explicitly following another option.
- The mockup's Journey state selector simulates new situation evidence. With Auto selected the screen follows it; with Plan pinned it stays on planning; Return to Auto shows the latest simulated situation. It does not perform real background or location detection.

## Decision

Signal is the chosen primary structure. Automatic planning/live switching with manual override, the newer 20-minute/situation-change override lifetime, interaction deferral, and ongoing tracking/alerts while Planner is pinned are required. No capability deletion is proposed. Other reductions to repeated explanatory copy remain recommendations rather than permission to remove information.

## Component contracts

| Component | Required data and behaviour |
| --- | --- |
| JourneyContext | Direction + inference/manual label; pace; visible location diagnostic; keep Settings and Leisure discoverable |
| ViewControl | Auto by default; explicit Plan/Live overrides; select Auto to clear the override; button always labelled Auto; never mutate selected service |
| PlanningQuestion | Leave now / Arrive by / Leave around; retain date/time values per mode |
| PrimaryAnswer | Before the station, exposed canonical Leave / Leave by time and leave countdown; retain it in departure-first walking layouts; contextual depart/arrive time, data source and deadline consequence; no ETA for unplannable services |
| JourneyOption | Service identity, scheduled/expected times, station/platform, duration, total time, flags, alternatives and expandable steps |
| JourneyConnection | Distinct inset panel per connection; prominent scheduled time, equally prominent separately labelled expected time when different, station/operator/platform and truthful status; repeated for multi-ride Trips; explicit Live keeps its board |
| TrainBoard | All engine-returned options in engine order; do not filter by aesthetic preference; cancelled/unknown remain |
| SharedTimeGrid | Common left Train/Leave, centre Expected when relevant, right destination arrival anchors; Next best heading and actions outside the grid |
| ActiveJourney | Confirmed/inferred identity, source timestamp, last reported station, expected arrival and next action |
| JourneyProgress | Existing complete timed itinerary and current-leg calls; reported/expected/modelled/stale source; no fabricated live position or delay |
| ConnectionChoice | Station arrival, transfer allowance, candidate departures, spare time, near-platform caveat, confirm/correct actions |
| StatusAndNotices | Central configured impact/relevance rules; significant relevant disruption exposed; full notice available; minor/unrelated detail may fold |
| DataState | Loading/empty/timetable/stale/partial failure independent of journey stage; errors must not destroy last good data |

Missing fields are explicit unknowns, never zero, on-time or fake platform values. Interaction state (selection, expanded disclosure, scroll/focus) must survive ordinary refreshes. In production all timing arithmetic remains in route/engine outputs.

## Leisure journeys extensions (proposed, 31 Oct 2026)

For the [Trip / leisure journeys story](stories/leisure-journeys.md) (revision 2: L11–L17 added after the first independent review). Signal is the base; these are the **only** additions.
Each reuses Signal tokens (no new colours; red / amber / green stay status-only). Listed for a separate designer to
review and polish, as was done for Signal. Until that review they are functional drafts.

| # | New element | What it is | Built from | Open for the designer |
| --- | --- | --- | --- | --- |
| L1 | **Place field** (From / To) | Text field with a leading label, clear button, "Current location" option for From | Signal input, 44 px | Leading glyph; how "Current location" reads |
| L2 | **Suggestion list** | Drop-down listbox under a Place field: up to 5 rows (name bold, address muted), recent places before typing, "No matches" and "Key needed" states | `--card`, `--line`, 44 px rows, focus ring | Elevation vs inline; recent vs search distinction |
| L3 | **Swap control** | Reverses From and To | Signal icon button, labelled "Swap" for VoiceOver | Glyph |
| L4 | **Access mode control** | Walk / Cycle / Drive per end, a segmented control with word labels | existing `.seg` | Glyphs alongside words; one control or two |
| L5 | **Access leg row** | First / last step in Journey steps and the journey strip: mode + time + allowance ("Drive 18 min · park 10") | step row | Mode glyph in the strip |
| L6 | **Change marker** | Between rail legs: "Change at Clapham Junction · 7 min"; amber "Tight change" / red "Connection at risk" uses status tokens | step row + status lozenge | Visual weight of a change vs a leg |
| L7 | **Multi-leg journey summary** | Change-count chip; shared centred Total journey / train-duration rows; operators on their own connection panels | approved journey + train card | Shared UI from 1 Nov supersedes the separate repeated summary |
| L8 | **Station lozenge (leisure)** | The boarding station on each journey row, as the commute's station lozenge, plus "No station car park" / "N km away" flags | existing lozenge (neutral) | none |
| L9 | **Other stations** | Disclosure under the journey list: each other station with its consequence ("arrive 12 min later") | native disclosure | Whether it sits in Next best |
| L10 | **Setup-needed card** | Empty state when the key is missing or the place is outside the region | Signal card, muted text, one action (Open Settings) | Tone |

| L11 | **Google attribution** | "Powered by Google" under the suggestion list (Google's terms when no Google map is shown) | muted 12 px text / Google's supplied mark | Placement |
| L12 | **Tomorrow / date marker** | On a journey departing on a later day: "Tomorrow · Sat 1 Nov" | neutral lozenge (not a status colour) | none |
| L13 | **Not live / unknown flags** | "Not live" on a ride or change without live data; "Car park not known" | existing info flag (neutral) | none |
| L14 | **Transfer row** | Cross-London link between rides: "Waterloo → Bank → Liverpool Street by Tube · 18 min", Tube line colours as identity | step row + line-colour lozenges (existing rule) | Distinguish from L6 |
| L15 | **Staged loading** | While a plan arrives in stages: "Finding trains…", "Checking live times…"; "Better option found" when the best changes after first draw | label line + info flag | Motion (respect Reduce Motion) |
| L16 | **Plan from here action** | "Plan from Clapham Junction" on a missed connection | Signal secondary button, 44 px | none |
| L17 | **Trip mode button** | Third mode beside Commute / Leisure | existing mode `.seg` | none |

Not added: map view, new colours, new type sizes, icons without words.
