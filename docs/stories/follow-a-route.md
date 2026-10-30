# Follow a route
Status: Behind toggle (release verification pending) · Settings → Experimental · Since: 30 Oct 2026 (evening)

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
independent reviews of behavior, tests and architecture. The selected route is shared by Panda and Signal; the
Follow a route Experimental setting is independent of the Signal design switch. Both start off.

The implementation follows the existing complete route snapshot and live rail service. A caught homeward Tube
uses current connection readiness to test the chosen rail service, rather than restarting the journey from the
office. After the rail leg, fresh Tube/walk evidence updates the onward arrival with a reason without retiming
completed rail steps. Planned Tube legs remain estimates unless existing live evidence says otherwise; verified
by-vehicle Tube following remains a separate feed-reliability gate. The full acceptance criteria below remain the target, not a claim that every
criterion has already passed verification. See [Signal testing](../signal-testing.md).

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

### What the card shows while following
- One headline: **arriving HH:MM** for the followed route, and the next step ("Walk to Aldgate: leave by 18:27",
  "Circle from Aldgate 18:34, platform 2", "Change at King's Cross: 10 min", "18:54 Great Northern, platform 10").
- **Ahead / on track / behind** for the step you're on, in whole minutes, coloured as elsewhere (green on track or
  ahead, amber 1–2 min behind or only at a fast walk, red if you'd miss the next connection):
  - Walking: your position against the planned walk at your pace (the rule already used on the way to Letchworth).
  - On a tube: the tube's own position from TfL (by its vehicle) against its planned times, when TfL gives one;
    otherwise the planned times. Underground without GPS this still works if TfL reports the vehicle. (Unverified:
    to be checked with a recorded feed before building.)
  - On a train: National Rail's reported position and expected times, as on the train card today.
- **A stable arrival.** The arrival changes only for a real reason, and every change shows its reason on the card
  until you've seen it: "Your 18:48 is cancelled", "Your train is 6 min late", "You're 4 min behind: you'll miss the
  18:48", "A better option: …". Re-ranking of other trains never moves the followed arrival.

### Missed, and better options
- **Missed**: when a step can no longer be made (its train or tube has left without you, or you can't reach it at a
  fast walk), the card says which and offers the best way on from where you are now, with its arrival and how much
  later it is: "Missed the 18:34 Circle. Next: the 18:40 Circle → 18:56 Thameslink from Farringdon, home 19:59 (7 min
  later). Follow this?" One tap follows it.
- **Cancelled or badly delayed**: same as missed, triggered by the feed, before you get there.
- **Better option**: offered only when it gets you home at least 5 minutes sooner (Sam, 30 Oct) and you can make it
  at your pace; shown once per option, not repeated on every refresh. One tap switches. Smaller gains are never
  offered: live times move by a minute or two all the time, and switching for them would make the arrival jumpy.

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

## Tests
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
- tests/follow.test.mjs: "follow page: Signal to Panda and reload retain route, full steps and planning question"
- tests/follow.test.mjs: "follow page: simulator restart clears simulated selection and Stop restores the real followed route"
- tests/independent-signal-review.test.mjs: "independent review: a Follow selection is saved immediately before any later interaction"
- tests/independent-signal-review.test.mjs: "independent review: planning pin retains the followed-route cancellation alert"
- tests/follow-journey-review.test.mjs: "journey review: a caught Circle still reaches the followed Thameslink, rather than replanning from the office"
- tests/follow-journey-review.test.mjs: "journey review: final-walk following cannot offer original-origin trains or revive a completed rail cancellation"
- tests/follow-journey-review.test.mjs: "journey review: a missed selected train no longer promises its old arrival"
- tests/follow-journey-review.test.mjs: "journey review: stale Darwin boards are not called live, while a fresh Service Details report updates the followed ETA"
- tests/follow-journey-review.test.mjs: "journey review: the home walk updates the followed ETA with a reason even when rail boards are old"

## Not yet / open questions
- Whether TfL reports tube positions by vehicle reliably enough to follow a tube underground (check against a recorded
  feed first).
- Notifications with Safari closed (e.g. "your train is cancelled") need the native app (#2–#7); a web page can only
  update while open.
- Order of work: (1) Follow button, saved route, stable arrival with reasons, ahead/behind; (2) missed, cancelled,
  better option; (3) following a tube by vehicle.
