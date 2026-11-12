# Follow a route
Status: Behind toggle (independent review approved; release gates recorded in docs/signal-testing.md) · Settings → Experimental · Since: 30 Oct 2026 (evening)

## Story
As a commuter on my way, when I've decided which journey I'm aiming for, I want to tell the app with one tap and have
it follow that journey, telling me whether I'm ahead or behind, why anything changed, and whether I've missed it or
something better has turned up, so that the arrival time means something and I'm never silently re-planned.

## Where it came from
30 Oct evening, office to home:
- 18:19 at the office: best was "Leave 18:22 → 18:48 Great Northern from King's Cross, home 19:34". Sam left to make it.
- 18:32: the 18:48 was cancelled (shown lower down: the card had quietly swapped to another train).
- 18:34 at Farringdon: the card showed the 18:54 from King's Cross, home 19:52. To Sam it looked as if the app had
  decided he'd miss his train: the arrival jumped by 18 minutes and nothing on the card said why.
- The same evening the app guessed wrongly where Sam was (it had stopped working out the tube; the Met he took was
  never in its list). Guessing which of all the trains and tubes you're on is the hard, error-prone question. Checking
  whether you're where your chosen journey says you should be is a much easier one.
Sam: "I think what we need is to pick the route. I'm aiming for this route. And then the app can tell me if I'm ahead
or behind. And if I have better options or missed them." And: "You still need the live mode because I might not
click."

## Delivery boundary
Sam selected this newer behavior as the basis for Signal on 30 Oct, then authorised implementation with regular
independent reviews of behavior, tests and architecture. Signal is the sole design since 1 Nov. The Follow a route Experimental setting remains independent and off
by default; removing the design switch does not change its preference or chosen journey.

The implementation follows the existing complete route snapshot and live rail service. A caught homeward Tube
uses current connection readiness to test the chosen rail service, rather than restarting the journey from the
office. After the rail leg, fresh Tube/walk evidence updates the onward arrival with a reason without retiming
completed rail steps. A known homeward Tube vehicle can now use its matching westbound prediction at the
chosen rail hub, verified against recorded TfL snapshots. This narrowly scoped observation does not prove
provider-wide reliability or solve missing Met departures at Aldgate. Missing, stale or nonmatching predictions
retain an explicitly modelled route-duration fallback. The full acceptance criteria below remain the target,
not a claim that every criterion has already passed release verification. See [Signal testing](../signal-testing.md).

## Acceptance criteria
### Choosing and keeping a route
- Every journey option (the top card and the list) has a **Follow** button: one tap, no confirmation. It works the
  same at the office, at home, at any station and on the way, in both directions.
- The followed route is the whole journey: each walk, tube and train with its times (e.g. walk to Aldgate → the 18:34
  Circle → King's Cross → the 18:54 Great Northern → walk home). It is saved on the phone, so closing Safari and
  reopening carries on from where you are now.
- Following continues until you're home (or at the office), you follow a different route, or you tap **Stop
  following**. It is never dropped silently: if it can't be completed it says so (see Missed).
- With no route followed, the app works as it does today (Leave now; working out where you are and which train or
  tube you're probably on). Following is never required.
- Signal's [visual journey/current-leg progress](journey-progress.md) consumes the chosen route's saved timed
  legs and existing observations. It does not replace the snapshot with a fresh best option or retime completed
  history from changed Settings; the same diagram also supports inferred journeys without requiring Follow.

### What the card shows while following
- Before boarding, while still away from the station and outside an active Tube connection, expose the
  current matching option's canonical **Leave by** clock and leave countdown above the arrival. The route
  remains selected, its saved journey start stays intact, and an uncertain/unusable option has no invented
  deadline. This preserves the [core product answer](../design-system.md#protected-product-answer-when-must-i-leave-sam-1-november-2026)
  when Auto folds the other planning recommendations (Sam, 1 Nov).
- Before boarding, use the approved **Leave by → At destination** headline and prominent train panel when an
  access deadline applies (Sam, 1 Nov); keep the selected service and saved start intact. During an active Tube
  approach show the next rail panel without restarting the origin walk. Once aboard, the headline remains
  **arriving HH:MM** for the followed route, and the next step ("Walk to Aldgate: leave by 18:27",
  "Circle from Aldgate 18:34, platform 2", "Change at King's Cross: 10 min", "18:54 Great Northern, platform 10").
- Planning total starts at the chosen option's canonical leave time, never the Follow-tap time. Since the approved
  2 Nov review, Follow's exposed pill is **Journey remaining** from now to the current usable final destination ETA,
  including onward legs; uncertain arrival stays unavailable, with no retained numeric pill. The selected start
  and original arrival are kept as history. See [journey/leg UI](journey-leg-ui.md). A followed route keeps its identity
  and is not relabelled as a different fastest route merely because the alternatives have re-ranked.
- **Ahead / on track / behind** for the step you're on, in whole minutes, coloured as elsewhere (green on track or
  ahead, amber 1–2 min behind or only at a fast walk, red if you'd miss the next connection):
  - Walking: your position against the planned walk at your pace (the rule already used on the way to Letchworth).
  - On a tube: the tube's own position from TfL (by its vehicle) against its planned times, when TfL gives one;
    otherwise the modelled route times. The recorded homeward vehicle-441 case is verified below; use of an
    already-known vehicle does not guarantee reliable identity/predictions for every underground journey.
  - On a train: National Rail's reported position and expected times, as on the train card today.
- **A stable arrival.** The arrival changes only for a real reason, and every change of at least one minute
  shows its reason on the card until you've seen it: "Your 18:48 is cancelled", "Your train is 6 min late", "You're 4 min behind: you'll miss the
  18:48", "A better option: …". Re-ranking of other trains never moves the followed arrival. Sub-minute
  fluctuations keep the previous arrival baseline and do not announce a zero-minute change. The original
  planned arrival stays visible once the current arrival changes or becomes uncertain.
- **Recovery is explicit.** A new cancellation, no-estimate or missed incident supersedes obsolete reasons. If
  the service runs again, receives an estimate, or becomes catchable again, show its recovery even if the old
  incident was already acknowledged. Do not leave an obsolete cancellation on a recovered route.
- **Boarding correction.** “I’m on it” confirms the selected train when nothing says otherwise; when the working-out
  can't tell two trains apart, fits a different train best, or a report has ruled the followed train out, it asks
  which train you're on first, the followed train offered first (10 Nov 2026, #57 C2:
  [which-train](which-train.md), "The wrong train"). Selecting a train other than the followed one in the on-train
  list asks before it is accepted; the followed route is not changed by that selection.
  Known same-train calls at alternative stations may provide boarding/progress evidence, with shared or
  separate provider IDs, without silently changing the chosen boarding station or replacing its itinerary.

### Missed, and better options
- **Missed**: when a step can no longer be made (its train or tube has left without you, or you can't reach it at a
  fast walk and it was not explicitly selected at a run/car effort), the card says which and offers the best
  way on from where you are now, with its arrival and how much
  later it is: "Missed the 18:34 Circle. Next: the 18:40 Circle → 18:56 Thameslink from Farringdon, home 19:59 (7 min
  later). Follow this?" One tap follows it.
- **Explicit effort choice:** the person may Follow an otherwise plannable run/car option. It remains “Behind”
  with the required effort rather than being automatically declared missed; an impossible connection or elapsed
  departure is still missed. Automatically proposed alternatives remain limited to walking/fast-walking reachability.
- **Cancelled or badly delayed**: same as missed, triggered by the feed, before you get there.
- **Better option**: offered only when it gets you home at least 5 minutes sooner (Sam, 30 Oct) and you can make it
  at your pace; shown once per option, not repeated on every refresh. One tap switches. Smaller gains are never
  offered: live times move by a minute or two all the time, and switching for them would make the arrival jumpy.
  Ordinary better-option prompts stay quiet during an actual Tube approach; a necessary recovery can still be
  offered when cancellation, a missed connection, no estimate or a serious delay makes the chosen route unusable.

### Live mode when not following
- If you seem to be on the move (at a station, on a train or tube, or walking to the station) and aren't following a
  route, the app shows where you are (station departures, the train or tube you're probably on with picks), as it
  does today. Tapping Leave now, Arrive by or Leave around goes back to planning; that choice lapses after 20 minutes
  or when your situation changes (you reach or leave a station, start or stop moving on the line). This is the
  current policy for Signal and supersedes its older journey-scoped override. A location blip, refresh or theme
  change alone does not end the override. View selection never resets direction, train/Tube selection or the
  followed journey; tracking and important alerts continue while planning is pinned.

### Generic
- Built in the engine (`src/core`) from route segments and live data, not around Aldgate or King's Cross: the same
  following works for any journey the app can plan (future: any start and end point).

## One source of truth, live times kept, one journey (10 Nov 2026, #57 H15, H20, H23, C3, C5): built 10 Nov
From Sam's journeys that day. Homeward, the followed card said "Can't make it" on the tube beside "On track · 11 min at
your connection" (15:41, 15:43); on the platform at Farringdon, where he had stood for ten minutes, it said "You can no
longer make your 15:56" as the train drew in and offered a later journey (15:55); after boarding underground it showed
"On time" for 18 minutes while the train ran late. Outbound, a reload had wiped the live state, and two cards stated
the journey.

**Causes (read from the code):** before the train, the card's label ("Arrives first", "Can't make it") and the
engine's "missed" rule came from a fresh plan made from wherever the phone is, which knows nothing of the tube you're
riding or of your already being at the station (it still allows a walk to the platform, starting now). A departed
train was kept on the boards, and its reports fetched, only while the phone was placed on the line.

**Rules:**
- **The effort label and Leave by belong to the way ahead.** The followed card shows them only while you still have
  to get to the station: not while you ride the tube to it, and not once you're at it.
- **At the station the train leaves from** (`boardingPlace`: a fix good to 250 m, at most 90 s old, within 250 m of
  Letchworth station going out, or placed by the page at the London station the train is boarded at coming home;
  not another London station, and not while riding the tube to it): the header reads "Be on the platform by"
  (wording confirmed by Sam, 10 Nov); the status is "On track · train departs in N min" ("train departing" inside
  the last minute). How hard you'd have to walk decides nothing: no "Can't make it", no "N min behind · run needed".
  A fix good to 151–250 m is enough for this rule (elsewhere the card needs 150 m before it trusts where you are).
- **The platform time** (`platformBy`) is the train's expected departure less the route's own catch margin (1 min
  by default; its last segment before the train); inside that last minute it is the departure itself. It is never
  the leave-from-here time of a fresh plan, which at the station has already passed (the first build showed "10:17"
  at 10:19 for the 10:20, beside "On track"). The amendment says "the same canonical time"; at the station that
  time is in the past, so this is the reading built. Sam, 10 Nov 21:51, told of it: "That's ok for now".
- **After the departure, at the station:** "Departure just passed · confirm if you are on it" with "I'm on it", for
  2 minutes (`FOLLOW_STATION_GONE_MS`); only then, still placed at the station by a fresh fix, "You can no longer
  make your …".
- **Last placed at the station, no fresh fix since** (underground, the phone asleep): never "missed" on that
  evidence. Once the departure has passed: "Departure passed · confirm if you are on it". A cancelled train is still
  reported as cancelled. Before the departure it reads "On track · train departs in N min" when the card otherwise
  trusts the position, else "Location unavailable · keeping your chosen journey".
- **Riding the tube to the station** is judged, as before, by that tube's arrival against the train's departure.
- **Live times once the train has left:** while you follow a route whose train has departed (aboard, or boarding not
  yet confirmed), the boards look back 40 minutes so the train stays on them, and its station reports are fetched,
  whether or not the phone is placed on the line. The same three boards are asked for (no extra board requests); one
  train-report request per refresh is added in that state. It ends (`followLooksBack`): not before the train
  leaves; not once the route is marked missed or cancelled; and not more than 30 minutes after the train's expected
  arrival, so a route left running doesn't ask for the past all day. Aboard without being placed on the line, the card's
  arrival comes from the train's report at your stop, else its board entry. This also carries the followed card
  through a reload (the route itself was already saved); the on-train card's own selection is still lost (C3/C4).
- **One journey, no repeats** (Sam, 10 Nov: "fix … the confusion over the cards"; the cut-down step he chose toward
  the single card): while you follow a route and the live card under it is about that same journey, the followed
  card alone states it. The live card keeps its label, which train or tube you're on and the choices you tap, "got off
  already", the stations and the source note; its journey times, train panel, journey facts and step list are not
  drawn. That includes the tube card's "Get off at … or get off at …", which is worked out afresh and on 10 Nov
  named King's Cross under a route via Farringdon; where you get off stays on its stations line ("Aldgate →
  Farringdon") until the tube line is built onto the followed card. A live card about a different train (one you
  selected instead) is shown in full. Once the time to leave has
  passed (or you're past the train), the list of other trains folds into a closed "Other trains" and its heading is
  not shown; stop following and everything is as before.

**Not in this step:** the single card proper and the list's own rows (H22). (Tube lozenges, "On track" beside a
late arrival, the notices and the walking estimate followed the same evening: next section.) The followed card moving to
"on the train" on an unsure best fit is unchanged.

**Tests**
- tests/core/follow-consistency.test.mjs: "At the boarding station, how hard you'd have to walk no longer decides: a minute before departure you are on track, not 'missed'"
- tests/core/follow-consistency.test.mjs: "At the boarding station after departure: asked for two minutes, then missed if you're still standing there"
- tests/core/follow-consistency.test.mjs: "Last placed at the boarding station, no fresh fix since (underground): never 'missed' on that evidence; after departure it asks"
- tests/core/follow-consistency.test.mjs: "Riding the tube to the station is judged by that tube's arrival, as before: being 'at the station' doesn't apply"
- tests/core/follow-consistency.test.mjs: "Refresh plan: a followed train that has left is kept on the boards whether or not the phone is placed on the line"
- tests/core/follow-consistency.test.mjs: "A fix good to 151–250 m at the station is enough for the station rule: on track, then the question, then missed (it used to say 'Location unavailable' and never ask)"
- tests/core/follow-consistency.test.mjs: "Last seen at the station is never 'missed', even when the position is otherwise called reliable; and before departure it doesn't ask"
- tests/core/follow-consistency.test.mjs: "At the station or not: a fix good to 250 m, within 250 m of it (or placed at that London station), no older than 90 s"
- tests/core/follow-consistency.test.mjs: "'Be on the platform by' is the train's departure less the route's own margin, then the departure itself: never a leave-from-here time that has passed"
- tests/core/follow-consistency.test.mjs: "Looking back for a followed train ends: not before it leaves, not once it's missed or cancelled, not more than 30 minutes after it was due in"
- tests/follow-consistency.test.mjs: "Following, at the station on a fix only good to 200 m: the station rule still applies (it used to say 'Location unavailable' and never ask)"
- tests/follow-consistency.test.mjs: "Homeward: 'Be on the platform by' only at the station your followed train leaves from: not at another London station, and not on the tube to it"
- tests/follow-consistency.test.mjs: "Following, at the station before your train: 'Be on the platform by', on track until it goes; never 'Can't make it' from a plan that still has you walking there"
- tests/follow-consistency.test.mjs: "Following, away from the station with no time left to walk there: the plan's 'Can't make it' still shows (the rule only changes once you're at the station)"
- tests/follow-consistency.test.mjs: "Following, last seen at the station and then no position (underground): not 'missed'; after departure it asks whether you're on it"
- tests/follow-consistency.test.mjs: "Following, aboard but the phone isn't placed on the line (a reload, underground): the train is kept on the boards and its lateness reaches the card"
- tests/follow-consistency.test.mjs: "One journey, no repeats: aboard, the followed card alone states the journey; the card under it keeps the stations and what you tap; other trains fold away"
- Independent review (10 Nov, 30 deliberate breakages on the first build): found the past platform time, the
  151–250 m gap and the unbounded look-back, and the missing homeward, boundary and request tests; all fixed above.
- Checked in a real browser (Chromium, phone width, 10 Nov): aboard while following, the lower card shows no journey times, train panel or steps; "Other trains" is folded.

## The tube named, one leave time, and a card that agrees with itself (10 Nov 2026 evening, #57): built 10 Nov
Sam, 20:57, chose three sets from the day's findings to build together, with these answers: homeward tube wording
"Tube: [Circle] [Met] Aldgate → Farringdon · 7 min"; late status "6 min later than planned" ("On track" kept for
arriving at or before plan); one release. What was built, and what was left out, is below.

**The tube line on the followed card (A2, C7, H1).** Lines are lozenges in TfL's colours (identity, not status).
- Going out, before boarding and on the train, directly under the train panel: "Then [Circle] [Met] to Aldgate ·
  eastbound · about 7 min", and under it "or [H&C] to Aldgate East · if it comes first" (words confirmed by Sam,
  10 Nov). The ride is the route's own (about 10 min via King's Cross). It goes once you're off the train.
- Coming home, under the header and above the train: "Tube: [Circle] [Met] Aldgate → Farringdon · 7 min", from
  following until you're placed at a London station (it stays while you ride the tube: with the tube card's own
  "Get off at …" not drawn, this is where the card says which way you're going).
- The data is the route's own (`tubeLine`, engine; lines, stops, direction and the second route in the profile). A
  journey with no such tube (followed from the London station, leisure, a trip elsewhere) has no line.
- Not built: the Then line turning into live tube rows 15 minutes before the change station; the single list at
  the change station (amendment §2). H18 (a plan from Farringdon via the tube to King's Cross worded as a walk):
  the app holds no line data for that hop.

**One leave time (H2).** The steps before the train that are still ahead move with the train's departure (they were
left at the time saved when you followed, so the header said 15:36 and "Next: 15:34 · Leave office"). A step whose
own saved time has come is taken as done and left where it was: a late train doesn't bring it back as the next
thing to do (found by the independent review: at the London station with the train 15 minutes late, "Next:" named
the tube). At the station the train leaves from, "Next:" is the train. While the header shows Leave by, the first
step ("Leave Cartref", "Leave office") carries that same time, in "Next:" and in the step list. The
tube rows' own "leave the office by" under the card are unchanged: each is for the tube it names.
H3 (Leave by moving 15:36 → 15:43 in three minutes) was read from the code as correct: by 15:34 the phone was at
Aldgate, and the plan from Aldgate has no walk from the office (confidence: medium–high; not replayed). The tube
line now says which tube the card means.

**Notices (E2, H16, H25; words confirmed by Sam).** A change to the arrival is a notice only when it leaves the
arrival 3 minutes or more (as shown) from the original plan and 3 minutes or more from the time you were last told
(`FOLLOW_NOTICE_MIN`). It reads "**Arriving 08:28** (was 08:24): your train is 4 min late." ("your train is running
later / earlier"; after the train, "the rest of your journey is taking longer / is quicker") and closes with ✕,
not "Seen". Back within 3 minutes of the plan, a notice still showing is withdrawn, and what you were last told
becomes the time the card settled at (so an arrival flapping across the 3-minute line doesn't raise a dismissed
notice again, and the next notice's "was" is that time). A smaller move while a notice is showing re-words it where
it stands (it must not contradict the card) without raising it again; once dismissed, nothing returns until a
further 3 minutes. Minutes are counted as shown (2 min 59 s later is two minutes). The card's own times always move. Saved with the route: `toldArrival`
and, on an arrival notice, `was` (both optional; a route saved before them restores).
- Not built: the reason naming the tube you took ("you took the 08:12 Met, not the 08:08").

**"N min later than planned" (H24).** "On track" is kept for arriving when planned or sooner. Later than planned by
a minute or more as shown, the same line reads "6 min later than planned" (with what followed, e.g. "· train departs
in 15 min") in amber; the status itself is unchanged (nothing is at risk). Train lozenges ("4 min late") keep the
shared 5/15-minute colour rule.

**Off the train (H26).** The finished train leaves the followed card (no train lozenge, no "46 min train"), and once
the only step left is arriving the header reads "Now → At home" (or "At office"), not the arrival on both sides.

**"Arrives first" once (H6).** The followed card no longer repeats "Arrives first" after the train time (it stood
after a stray "·"); the effort line says it while the way to the station is still ahead.

The walk left after the train is in [nearly-home](nearly-home.md); where your tube is, in
[journey-progress](journey-progress.md).

**Tests**
- tests/core/journey-card-batch.test.mjs: "The tube line going out: the lines, where to, which way, the typical ride, and a second route that may come first"
- tests/core/journey-card-batch.test.mjs: "The tube line coming home: the tube comes first, from the office's stop to the station your train leaves from; no direction, no second route"
- tests/core/journey-card-batch.test.mjs: "No tube line when the journey has no such tube: already at the station, no tube data, no ride time, or the tube on the other side of the train"
- tests/core/journey-card-batch.test.mjs: "'On track' is kept for arriving when planned or sooner; later than planned it says by how much, in amber"
- tests/core/journey-card-batch.test.mjs: "A saved route with the new fields restores; one saved before them restores too; a bad value is refused"
- tests/core/journey-card-batch.test.mjs: "Notices count minutes as shown: seconds don't make a 3-minute change of a 2-minute one, and a dismissed notice doesn't return on a flap"
- tests/core/journey-card-batch.test.mjs: "A step whose own time has come is taken as done: a late train doesn't bring it back as the next thing, and at the station the next thing is the train"
- tests/journey-card-batch.test.mjs: "One leave time holds after the saved leave time has passed: a much later train moves the header and the first step together, and no step already due comes back as 'Next'"
- tests/core/follow.test.mjs: "follow: newer arrival reasons replace obsolete ETA wording and returning to an earlier ETA is announced"
- tests/core/follow.test.mjs: "follow: sub-minute ETA fluctuations hold the baseline and do not emit zero-minute announcements"
- tests/core/follow.test.mjs: "follow: real train delays change arrival with a retained reason until acknowledged"
- tests/core/follow-main-regression.test.mjs: "released-main follow arrival boundary:59 seconds stays stable,60 changes with reason; canonical5/15 status bands replace legacy5-red4-amber"
- tests/journey-card-batch.test.mjs: "Going out, the followed card names the onward tube with its lines in their colours, before you leave and on the train"
- tests/journey-card-batch.test.mjs: "One leave time: when the train is late, the header's Leave by and the first step move together; 'Arrives first' is said once"
- tests/journey-card-batch.test.mjs: "Notices: nothing for a two-minute wobble; three minutes says what changed and why, and closes with ✕; back at the plan it goes"
- tests/journey-card-batch.test.mjs: "'On track' only when arriving as planned or sooner: at the station with the train six minutes late it says so, in amber"
- tests/journey-card-batch.test.mjs: "Coming home, the followed card names the tube first: 'Tube: Circle Met Aldgate → Farringdon · 7 min', until you're at a London station"
- tests/follow-journey-review.test.mjs: "journey review: the home walk updates the followed ETA with a reason even when rail boards are old"
- tests/follow-journey-review.test.mjs: "journey review: final-walk following cannot offer original-origin trains or revive a completed rail cancellation"
- Independent review (10 Nov, 40 deliberate breakages): found a step already done returning as "Next:" with a late
  train, a dismissed notice returning on a one-minute flap, and the un-recorded golden; all fixed above, with tests
  for the breakages that had survived.
- Checked in a real browser (Chromium, phone width, 10 Nov): the outbound card with the train 4 minutes late shows the lozenges in colour, one leave time, and the notice with ✕.

## One journey card (11 Nov 2026; amendment §1, #57 C5, C6, D1): built 11 Nov
Sam, 11 Nov 01:30, after two days of two cards saying different things: "Build the single card view as this was
confusing". The design is amendment §1 (agreed and worded with him on 10 Nov); the evening before he had chosen
the cut-down "one journey, no repeats" as a first step.

**When.** While a route is followed and the live card under it is about that same journey and is a live view (on
the train, at the change station, on the tube, on the final walk, nearly home), the live card is not drawn: what it
still showed is inside the followed card. Not merged, and unchanged: a plan under the followed card (before you
set off, and the departures shown at the station your train leaves from); the wait for a position; a live card
about a different train (one you selected instead), which is shown in full; and everything without Follow.

**Order inside the card.**
1. The journey: the two clocks with Journey remaining; one line saying what you're on ("You're on the 07:20
   Thameslink to Brighton · On time", or "Probably … or …" while the app is unsure; on the tube "You're on the 11:37
   Circle"; at the change station the instruction, "Get on the next Circle or Met eastbound to Aldgate"); the status
   line; any notice; anything the app is asking you (the wrong-train question, "Switch to …?", "I'm on it").
2. The legs: Journey stages and the current leg, with their own "Report details", which now also holds where the
   figures come from ("On the train · 10:34 · worked out from your location" and the source note). Where no legs
   are drawn (at the change station) only the live card's title goes into a "Report details" fold of its own; its
   notes ("Loading live tube times…", the allowances) stay in view under what's next.
3. What's next: the next step, the onward tube line, then whatever else the live card offers to do next (the tubes
   you can board at the change station, "Got off already?" on the tube).
4. Folded: "Not your train?" (the other candidates; it stands open by itself only while the app is unsure which
   train you're on; that is not remembered as your choice, and it doesn't count as you reading something, so it
   never holds back a change of view), Your journey steps, Stop following.
- An arrive-by verdict ("On time for 09:00 · 6 min to spare") sits with the status (placed from the code; not
  staged in a test).
- **Never two cards claiming two trains.** When the live card is about a different train (you selected it and
  confirmed the switch), it is shown in full and says "You're on the 10:15 Great Northern"; the followed card then
  names the train it follows as a lozenge with its status, without "You're on".
- Once aboard, the three-column departure panel and the departure platform are not drawn (amendment §4); before the
  train, including on the tube to it coming home, the panel with the scheduled departure stays.
- Which train you're on is said once. The live card's own headline, train panel, steps and "Get off at …" stay
  undrawn as before (one journey, no repeats).
- How it's put together (`singleCard`, `src/journey-ui.js`): the live card is still worked out and drawn as before
  (so every view, handler and test of it without Follow is untouched); its parts are then moved into the followed
  card, each group in a box that carries the live card's class so its styles apply. When nothing has changed since
  the last redraw the card's parts are left as they are (a tap that began before a redraw still lands on its
  button); only the legs, which are redrawn on every pass, are taken in afresh.

**Not built (amendment §1, §4, §7) at the time** (the change-station arrival and the one-row controls were built
11 Nov, "Clean baseline"): "Another option" for the same train calling at another station;
"3 min to the tube platform" in the next step; "35 min train" still
stands on a line of its own. At the station your train leaves from, the departures card under the followed card
is still drawn (it is a plan, and it repeats your train as its first option): to raise with Sam.

**Tests**
- tests/single-card.test.mjs: "On the train: one journey card, in order: the journey and the train you're on, the legs, what's next, then the fold-aways"
- tests/single-card.test.mjs: "On the train and unsure which: the card says 'Probably', and 'Not your train?' stands open; choosing folds it"
- tests/single-card.test.mjs: "At the change station, on the tube and on the walk to the office: still one card, with the tube choices in view"
- tests/single-card.test.mjs: "Coming home on the tube: one card, 'Got off already?' in view; at the station your train leaves from the plan card is still its own; walking home, one card"
- tests/single-card.test.mjs: "Not one card when the live card is about something else: a different train selected, or no route followed"
- tests/single-card.test.mjs: "A doubt about the train you're following is asked inside the one card, in view, never folded"
- Independent review (11 Nov, 30 deliberate breakages, 6 probes): nothing the live card showed is lost in any
  under-way view, the card is restored on every way out, no duplicate keys. It found the followed card saying
  "You're on" beside a live card naming a different train, the self-opened fold delaying a view change, and the
  notes folded at the change station; fixed above, with tests for those and for the breakages that had survived
  (the platform once aboard, the legs kept when pinned to Plan, the homeward order, empty leftovers).
- Checked in a real browser (Chromium, phone width, 11 Nov): aboard while following, one card in the order above.

## From the 11 Nov retest: the warning ladder, the moment the train leaves, small fixes (built 11 Nov)
Sam's retest to work on 11 Nov (#57 comment "Retest, 11 Nov morning"). Independent review deferred to after his
homeward test, at his direction ("We can relax the rules on the independent reviewer for this round").
- **The warning ladder** (wording agreed by Sam, 11 Nov): on the way to the station the followed card says
  "Tight · walk fast", then "Very tight · run" with a line under it, "If you miss it: 07:45, office 08:54" (the next
  train you could take, at walking pace), then "You can no longer make your 07:30" only when no level makes it, even
  eating into the station allowances (effort-levels.md). No more "N min behind · run needed" beside a Leave by that
  said otherwise. (A car at home: "Very tight · car needed".)
- **As the train pulls out:** seen at the station the train leaves from (fix good to 250 m) in the last 10 minutes,
  then neither at the station nor placed on the line: "last seen there" (`boarding: 'was'`), so never "missed": after
  departure it asks "Departure passed · confirm if you are on it". (11 Nov, 07:34: declared missed while aboard.)
  The same evidence counts as a known train for picking you up on the line, and with a known train the first stretch
  from Letchworth counts from 300 m out and within 600 m of the track (it used to need 300 m and train speed, and
  nothing looked for the train until past Stevenage).
- "You confirmed you are on your selected train" goes after 2 minutes and once off the train (it was still showing on
  the walk to the office).
- On the tube, a tube you picked reads "Your tube: 08:15 Met to Aldgate" (Sam: whether you're on it or waiting for it
  can't be told so soon); unpicked guesses still say "Probably …".
- Thameslink trains carry "Thameslink: first class at the rear is open to standard tickets." under the train panel
  and on the on-train line (#57 H19; words chosen by Sam, 11 Nov).
- Under way on a followed route (after the train), the empty status strip ("Journey data not available yet",
  "Loading journey data…") is not drawn (#57 E3).
- Journey stages: "N min behind" is never green (amber at least).
- **Not built from the retest** at the time: the leg progress redesign, the header going blank when it gives up,
  the 08:44 headline at King's Cross, two "behind" figures (H10), tubes that left offered (H9), "Next:" naming a step
  in hand. All built the same afternoon: "Clean baseline" below.

**Tests**
- tests/core/retest-fixes.test.mjs: "The ladder on the followed card: 'Tight · walk fast', 'Very tight · run' with the next train, 'Can't make it' only from 'none'"
- tests/core/retest-fixes.test.mjs: "The 'you confirmed' acknowledgement goes after 2 minutes, and once off the train"
- tests/core/retest-fixes.test.mjs: "Thameslink trains only: 'Thameslink: first class at the rear is open to standard tickets.'"
- tests/core/retest-fixes.test.mjs: "A known train is picked up on the first stretch from Letchworth: from 300 m out and within 600 m of the track"
- tests/retest-fixes.test.mjs: "Seen at the station, then the train pulls out and the phone is neither at the station nor placed on the line: never 'missed', it asks"
- tests/retest-fixes.test.mjs: "Thameslink trains carry the note in the train panel; others don't"

## Clean baseline: everything found 10–11 Nov (built 11 Nov 2026)
Sam, 11 Nov 12:10: "Why don't you fix all of them and then we have a clean baseline against which to test tonight and
tomorrow?" Independent review deferred to 12 Nov, after his homeward and morning trips (his direction). The leg
progress redesign is in [journey-progress](journey-progress.md) ("Where you are on the leg"); the correction list in
[which-train](which-train.md) (C12); the nearly-home screen in [nearly-home](nearly-home.md) (H28).
- **Before the train.** No "Next train: …" line, on a recommendation or on the followed card: the train panel states
  the train once (amendment §3, approved by Sam 10 Nov). Before boarding, "Next:" is not shown when the next step is
  the train itself.
- **Urgency** (amendment §3, words confirmed 10 Nov): with under 2 minutes to the leave deadline the countdown reads
  "Leave now · 45 s" (seconds under a minute, "1m 31s" above) on an accent band (`.journey-countdown.urgent`), not a
  status colour. Still the one departure instruction. The small "to walk to Letchworth at your usual pace" beneath
  it is not built.
- **Once you've set off, "Be on the platform by"** (Sam, 12 Nov: "yes. Be on the platform by"; from 11 Nov 07:21,
  "Leave by" while already halfway there, and #57 H4 homeward). The followed card's deadline is the platform time (the
  same one used at the station), with no countdown to leaving. Set off: on the tube to the station; or outbound, the
  app's left-home rule (over 100 m from the saved home, or 3 minutes nearer the station than home is); homeward, over
  200 m from the office; position good to 150 m. At home or at the office it is Leave by, as before.
- **The trains home under the tube you're on** lead with "Be on the platform by" too, with no countdown (Sam, 12 Nov:
  "why wouldn't this also be 'be on the platform by'?").
- **When it can no longer be made** (07:16, the header went to "Unavailable"): the header shows the way on: "Instead:
  the 07:45 Great Northern", its own Leave by → arrival, and its own journey figures, under "You can no longer make
  your 07:30".
- **At the change station** (amendment §2, words confirmed 10 Nov; 11 Nov at King's Cross): one list of tubes,
  headed "Tubes to Aldgate and Aldgate East · as on the platform board · tap the one you're getting"; each row "1st ·
  08:06 · [Met] to Aldgate · Office 08:22" (a Circle the long way round "via Aldgate"; an H&C "to Barking, for
  Aldgate East"), "✓ getting this one" on the one you tapped. Tubes you could only catch if already near the platform
  come first under "If you're near the platform" (said once; never hidden, since GPS can't tell the concourse from the
  platform); then "Then". Once you've tapped one, it's one plain list (no "If you're near the platform"). The instruction reads "Get on the Met to Aldgate · eastbound · Platform 2 · due 08:06
  · in 3 min …". The headline's left side is "Next tube". The trains list under it is not drawn there.
- **The followed card at the change station uses the same tubes**: its arrival is the listed next tube's office time
  (under 2 minutes old), not TfL's journey planner (11 Nov: 08:44 in the headline while the list said 08:30). Source
  line "Next tube and measured onward walk". The saved "Next: Circle or Met to Aldgate" is not shown beside the live
  "Get on the H&C …".
- **One "behind" figure** (H10): the legs' own status is not drawn inside the one journey card.
- **On the last walk** the plan's "Next: 08:38 · Arrive office · walk 6 min" is not shown beside "Journey remaining
  5 min": the next step is the arrival itself (`nextIsLast` from the engine).
- **"On a different tube?"** offers each other tube for 5 minutes after the later of it and yours left (it was still
  offered a quarter of an hour into the ride), and never your own tube under another time (H9).
- **Delays said once**: when the disruption card right under the status strip has the strip's words as its heading
  ("Delays up to 9 min on your route"), the strip says it and the card keeps its details without the heading.
- **Controls under way** (amendment §7, A5): while a route is followed or a live view is showing, the mode, direction,
  pace, Auto/Plan/Live and Leave now/Arrive by/Leave around controls fold behind one row, "Commute · To office ·
  Leave now", beside Settings and Refresh; tapping it opens them. Planning keeps every control in view. The controls
  and their handlers are unchanged (only hidden by style). The location line stays out of the fold only when it
  needs you: an old position or no location. "Along the line" folds with them, behind the same row (Sam, 11 Nov 18:46:
  "hide the along the line button under the drop down at the top").
- **Location line** (amendment §8, C8, E4): names the nearest station on the line, by name ("near Hitchin"), within
  3 km out of London and 1 km in London (else "in London"); an old position reads "as of 08:08" (was "stale fix");
  then "Update location", which restarts the phone's location watch and runs only when tapped.
- **Small things:** "you picked this" without a stray "·" at the start of a line (H12); a route that takes the tube
  before the train says "Tube and walk at your usual pace", not "Walk at your usual pace" (H18); a Met with no
  destination on Aldgate's homeward board reads "westbound" (H7); no "Nearly there" heading over nothing (F3).
- **Not fixed, explained to Sam:** the tube's timing offset at King's Cross (D4, one observation, not enough to set
  a rule); a wrong pick not flagged when the phone's position was stale (no fresh evidence to question it with).

**Tests**
- tests/clean-baseline.test.mjs: "Once you've set off the deadline is the platform ('Be on the platform by'); at home Leave by; a train you can't make shows the way on ('Instead: …')"
- tests/clean-baseline.test.mjs: "Under way the controls fold into one row: 'Commute · To office · Leave now', which opens them; planning keeps them all"
- tests/clean-baseline.test.mjs: "Under way, 'Along the line' folds under the one-row controls with everything else; open them and it's there"
- tests/clean-baseline.test.mjs: "The location line names the nearest station out of London, says 'as of' an old position, and offers 'Update location' only then"
- tests/clean-baseline.test.mjs: "Delays are said once: the status strip says it, and the disruption card under it keeps its details without repeating the heading"
- tests/core/clean-baseline.test.mjs: "'On a different tube?' offers each other tube for 5 minutes after the later of it and yours left, and never lists your own tube again"
- tests/core/clean-baseline.test.mjs: "On the last walk the followed card's 'Next' step is the arrival itself: flagged, so the card doesn't repeat the plan's whole walk"
- tests/app.test.mjs: "At King's Cross: one list of tubes, as on the platform board: place, time, line and where it goes, office time"
- tests/effort.test.mjs: "Departure countdown: Signal has no redundant leave-now instruction below ninety seconds"

## Agreed 10 Nov 2026, not yet built
From the trip debrief (#57) and the [journey card amendment](../design-system.md#journey-card-amendment--10-november-2026-sam-from-the-trip-debrief-57): one journey card while following (C5, C6, D1), the station wording and urgency (A1, B1), the train stated once (A3, A4), the aboard card (C10, C11), the wrong-train question and "I'm on it" (C1, C2, C4), state kept across a reload (C3) and arrival notices (E2). The criteria above describe the app as built; update them, with tests, as each item ships.

## Tests
- tests/wrong-train.test.mjs: "I'm on it: when the app can't tell two trains apart it asks which, the one you follow first; your answer is taken at its word"
- tests/wrong-train.test.mjs: "I'm on it: answering with the other train selects it without a second question; with nothing to doubt it confirms at once"
- tests/wrong-train.test.mjs: "Wrong train: selecting a train other than the one you're following asks first; Stay changes nothing, Switch selects it"
- tests/leave-by.test.mjs: "Leave by: following a route keeps the access deadline exposed until you set off, then the platform (Sam, 12 Nov)"
- Every scenario in tests/follow-main-regression.test.mjs runs against the production Signal presentation.
  With Follow off, Arrive by still saves the planning override. View pins do not enable Follow, reset the selected
  train, change direction or pause tracking. The old cross-design parity rule is retired.
- Implementation tests include the pure engine, real built-page integration and independent whole-journey probes.
  Release verification and final review are pending. Required evidence includes stable arrival despite
  re-ranking, an explicit reason for live changes, cancellation/missed recovery without automatic replacement,
  the exact 5-minute alternative threshold, persistence validation, switch preservation, simulation isolation,
  and planning override expiry. See [verification record](../signal-testing.md).
- The 30 Oct evening (18:19 → 18:48 cancelled → 18:54) remains a whole-journey acceptance case: following the
  18:22 route, the card says the 18:48 is cancelled and offers the 18:54 (home 19:52, 18 min later); the arrival
  never changes without a reason shown.

- tests/core/follow.test.mjs: "follow: snapshots the entire journey and never changes the selected route when rankings change"
- tests/core/follow.test.mjs: "follow: refreshed approach routes cannot silently change arrival or the saved tube/walk"
- tests/core/follow.test.mjs: "follow: real train delays change arrival with a retained reason until acknowledged"
- tests/core/follow.test.mjs: "follow: whole evening cancellation offers explicit replacement with later arrival, never swaps it"
- tests/core/follow.test.mjs: "follow: better option boundary is five minutes, only walking/fast reachable, once dismissed"
- tests/core/follow.test.mjs: "follow: missing or stale feeds retain chosen arrival; missing location never proves missed"
- tests/core/follow.test.mjs: "follow: service ID survives delay and platform changes but cannot change boarding station or date"
- tests/core/follow.test.mjs: "follow: persisted journey restores as independent data and rejects malformed browser state"
- tests/core/viewControl.test.mjs: "view control: manual choice expires at exactly twenty minutes and immediately on a changed situation"

- tests/follow.test.mjs: "follow page: chosen itinerary and arrival survive re-ranking, refreshed access and approach location"
- tests/follow.test.mjs: "follow page: cancellation keeps selected service and offers an explicit way on; switching and Stop are deliberate"
- tests/follow.test.mjs: "follow page: no-estimate null arrival remains selected through repeated renders and persisted reload"
- tests/follow.test.mjs: "follow page: an actual departed selected train continues through movement inference, never becomes missed"
- tests/follow.test.mjs: "follow page: appearance changes and reload retain route, full steps and planning question"
- tests/follow.test.mjs: "follow page: simulator restart clears simulated selection and Stop restores the real followed route"
- tests/independent-signal-review.test.mjs: "independent review: a Follow selection is saved immediately before any later interaction"
- tests/independent-signal-review.test.mjs: "independent review: planning pin retains the followed-route cancellation alert"
- tests/follow-journey-review.test.mjs: "journey review: a caught Circle still reaches the followed Thameslink, rather than replanning from the office"
- tests/follow-journey-review.test.mjs: "journey review: final-walk following cannot offer original-origin trains or revive a completed rail cancellation"
- tests/follow-journey-review.test.mjs: "journey review: a missed selected train no longer promises its old arrival"
- tests/follow-journey-review.test.mjs: "journey review: stale Darwin boards are not called live, while a fresh Service Details report updates the followed ETA"
- tests/follow-journey-review.test.mjs: "journey review: the home walk updates the followed ETA with a reason even when rail boards are old"

- tests/core/follow.test.mjs: "follow: an obsolete cancelled, no-estimate or missed reason is replaced by explicit recovery even after Seen"
- tests/core/follow.test.mjs: "follow: observed known same-train calls progress with shared or separate IDs without changing chosen boarding"
- tests/core/follow.test.mjs: "follow: explicit boarding correction keeps service and resolves missed without ambiguous inference"
- tests/core/follow.test.mjs: "follow: explicitly selecting a run or car is allowed but such alternatives are never proposed"
- tests/core/follow.test.mjs: "follow: sub-minute ETA fluctuations hold the baseline and do not emit zero-minute announcements"
- tests/core/follow.test.mjs: "follow: ordinary better options stay quiet during a Tube approach; only a real recovery is proposed"
- tests/core/followTube.test.mjs: "follow Tube: recorded441 westbound Met gives exact Farringdon and Kings Cross predictions"
- tests/core/followTube.test.mjs: "follow Tube: vehicle, direction, line and target station must all match"
- tests/core/followTube.test.mjs: "follow Tube: cache and provider timestamp expire at exactly three minutes"
- tests/core/followTube.test.mjs: "follow Tube: malformed, missing and already passed predictions fall back without invented ETAs"
- tests/core/followTube.test.mjs: "follow Tube: normalized guarded adapter records retain provider timestamp and exact prediction"
- tests/core/followTube.test.mjs: "follow Tube: a timestamp-less prediction uses guarded endpoint provenance and never another explicit stop"
- tests/follow-transport.test.mjs: "follow transport: a followed homeward Tube, or a tube home under way without Follow, requests the target-stop feed; nothing else does"
- tests/follow-transport.test.mjs: "follow transport: stale predictions and a different vehicle never replace the route-duration fallback"
- tests/follow-transport.test.mjs: "follow transport: concurrent refreshes share one request and a source switch discards its delayed body"

## Recorded Tube evidence and request policy
- Five actual TfL arrival snapshots from 30 Oct 22:43 (`tests/fixtures/tfl-2026-10-30T2243Z/`: ALD, MGT, LVT,
  FCN, KSX) supply evidence for the known-vehicle case. Vehicle 441's westbound Metropolitan predictions are
  Farringdon 22:49:42Z and King's Cross St Pancras 22:52:41Z; tests assert those exact instants.
- Pure `src/core/followTube.ts` accepts a prediction only when vehicle, target stop, line and westbound direction
  match, both cache and provider observation are younger than three minutes, and arrival is no more than
  30 seconds in the past.
  The caller supplies station identity and existing interchange allowance; the generic engine hard-codes neither.
- `src/follow-transport.js` uses the existing guarded target-stop arrivals fetcher. Only an enabled followed
  homeward commute, before its rail leg, with a known current Tube vehicle requests this observation: one
  target-stop request per refresh, with concurrent calls sharing the same pending request. No new endpoint,
  broad vehicle polling, or request for feature-off/no-route/no-vehicle cases is introduced.
- Source epoch, chosen route, vehicle, line and target context are checked after asynchronous work. Stale,
  malformed, wrong-vehicle and source-switched results cannot revise the chosen connection. Missing evidence
  falls back to the measured route model; it is not a live claim.

## Not yet / open questions
- The recorded known-vehicle case does not establish reliable vehicle availability for every live Tube journey.
  Missing Met departures at Aldgate remain unsolved; matching an already-known vehicle at the rail hub does not
  manufacture a Met departure or make it pickable at Aldgate.
- Notifications with Safari closed (e.g. "your train is cancelled") need the native app (#2–#7); a web page can only
  update while open.
- Release verification remains pending for the integrated implementation, including the selected latest-branch
  improvements and conditional Tube observation. The recorded vehicle case is narrower than provider-wide
  live journey validation.

Source precedence: a fresh selected-board cancellation remains an alert even when a recent Service Details
response still contains an expected arrival (a train can be terminated early). An obsolete board does not
outvote a genuinely fresh train report. Regression: tests/core/follow.test.mjs: "independent review: fresh cancellation remains visible despite a recent live arrival prediction".

### Released-state compatibility
The released Follow switch (`settings.follow`) and saved selection (`follow`) are restored into the shared
controller only once a real matching itinerary is available. The old record remains intact; missing data shows
restoration in progress. Explicit opt-out wins over the old switch and Stop cannot revive the backup selection.
Original planned/expected arrival, onward duration, boarding identity, acknowledgements and declined alternatives
survive migration. Old planning-pin age and reliable situation changes are preserved while question/time remain
separate from the displayed view. See `tests/core/followMigration.test.mjs`, `tests/follow-migration.test.mjs`,
`tests/core/follow-main-regression.test.mjs` and `tests/follow-main-regression.test.mjs`.
When the previous version did not store detailed onward times and current timings differ, restored intermediate
step times are explicitly unknown. Saved rail/final arrival facts are retained; migration cannot create a Tube
step after the saved destination arrival.
A selected-row Following marker applies only to the same mode and direction as the active saved journey. The same
rail service remains selectable for a different Leisure or Commute journey; changing mode never traps that row.
Current timetable refresh is independent of a pinned planning question while following/restoring a journey. This
also allows the released saved selection to restore while Arrive by is selected; future planning searches do not
stand in for current route data. Tests cover both the pure refresh decision and the real page restoration path.
