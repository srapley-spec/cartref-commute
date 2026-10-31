# Follow a route
Status: Behind toggle (Settings → Experimental → Follow a route, off by default) · Since: 30 Oct 2026 (evening)

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
  - On the tube home: minutes in hand = your train's departure − (when your tube reaches the station + the time you
    need there). When it reaches the station comes from TfL's arrivals at that station for your tube's vehicle
    ("(TfL, by your tube)"), fetched once per refresh while following; otherwise from the ride time. Too late for the
    train: "You can't make the … now", with the best way on. Checked against TfL on 30 Oct 22:43 (recorded in
    `tests/fixtures/tfl-2026-10-30T2243Z/`): Met vehicle 441 "At Aldgate Platform 2" appeared with the same vehicle
    number in the westbound arrivals at Liverpool Street, Moorgate, Farringdon and King's Cross. Westbound Circles
    weren't predicted downstream in that snapshot, so for a Circle the ride time is the usual fallback.
  - On a train: National Rail's reported position and expected times, as on the train card today.
- **A stable arrival.** The arrival changes only for a real reason, and every change shows its reason on the card
  until you've seen it: "Your 18:48 is cancelled", "Your train is 6 min late", "You're 4 min behind: you'll miss the
  18:48", "A better option: …". Re-ranking of other trains never moves the followed arrival.

### Missed, and better options
- **Behind is not missed**: past the walking leave time but makeable with a fast walk or a run says "N min behind ·
  run", not missed (found merging main's longer King's Cross interchange, 30 Oct).
- **Missed**: when a step can no longer be made (its train or tube has left without you, or you can't reach it at a
  fast walk), the card says which and offers the best way on from where you are now, with its arrival and how much
  later it is: "Missed the 18:34 Circle. Next: the 18:40 Circle → 18:56 Thameslink from Farringdon, home 19:59 (7 min
  later). Follow this?" One tap follows it.
- **Cancelled**: same as missed, triggered by the feed, before you get there. A delay is said ("Your 18:48 Great
  Northern is now 7 min late", amber under 5 min late, red from 5; "back on time" / "now only 3 min late" in green)
  and moves the arrival; the planned arrival stays visible ("planned 19:39"). OK clears the reason.
- **I'm on it**: when the app says you missed it but you're on board (it couldn't tell), one tap picks the train.
- **Better option**: offered only when it gets you home at least 5 minutes sooner (Sam, 30 Oct) and you can make it
  at your pace; shown once per option, not repeated on every refresh. One tap switches. Smaller gains are never
  offered: live times move by a minute or two all the time, and switching for them would make the arrival jumpy.

### Edge cases (independent review, 30 Oct late evening)
- Before the trains load (reopening, a change of direction, a failed load) nothing is decided: never "missed" from
  no data. A train missing from the loaded boards counts as gone only once its last call was due to leave.
- The same train at another station counts, with shared or separate service IDs: past Farringdon, the St Pancras call
  of the same Thameslink keeps you on it.
- No better option while you're on the train or on a tube.
- A cancelled or missed reason that stops being true is replaced ("Your 18:48 Great Northern is running again", "You
  can make the … again"); OK on cancelled or missed isn't undone by the next refresh; a reason isn't re-said with a
  new time on every refresh.
- A train that was never late and is now expected earlier says "now expected earlier", not "back on time".
- Toggle off: a saved route isn't shown, no tube-position requests, and choosing a planning tab saves nothing new.
- A cancelled train has no Follow button.

### Live mode when not following
- If you seem to be on the move (at a station, on a train or tube, or walking to the station) and aren't following a
  route, the app shows where you are (station departures, the train or tube you're probably on with picks), as it
  does today. Tapping Leave now, Arrive by or Leave around goes back to planning; that choice lapses after 20 minutes
  or when your situation changes (you reach or leave a station, start or stop moving on the line).

### Generic
- Built in the engine (`src/core`) from route segments and live data, not around Aldgate or King's Cross: the same
  following works for any journey the app can plan (future: any start and end point).

## Tests
- tests/core/follow.test.mjs: "Follow, 30 Oct evening: the 18:48 is cancelled — said, and the 18:54 offered (home 19:52, 18 min later); the arrival never moves without a reason"
- tests/core/follow.test.mjs: "Follow: before the trains load nothing is decided (reopening, a change of direction): never 'missed' from no data"
- tests/core/follow.test.mjs: "Follow: the arrival changes only with a reason — 60 s is a change, 59 s isn't; 5 min late is red, 4 amber; back on time"
- tests/core/follow.test.mjs: "Follow: minutes in hand and behind; can't make it at any effort, or it has left: missed, with the best way on"
- tests/core/follow.test.mjs: "Follow: on board the train counts however late you'd be to 'leave'; on a tube, minutes in hand from when it reaches the station"
- tests/core/follow.test.mjs: "Follow: a better option only at 5+ min sooner and makeable at a walk or fast walk; once declined, never again"
- tests/core/follow.test.mjs: "Follow: the same train at another station counts (Thameslink at Farringdon, then St Pancras), with shared or separate service IDs; arrived"
- tests/rules.test.mjs: "Follow, 30 Oct evening: follow the 18:48 from the office; it's cancelled — said with its reason, the best way on offered, one tap follows it"
- tests/rules.test.mjs: "Follow: kept across reopening; a delay is said and moves the arrival; OK clears the reason; off = no Follow buttons"
- tests/rules.test.mjs: "Follow: a later train followed — a better one 5+ min sooner is offered once; No thanks never offers it again; behind and missed"
- tests/rules.test.mjs: "Follow, on the tube home: minutes in hand from when TfL says your tube (by vehicle) reaches King's Cross; too late = connection lost"
- tests/rules.test.mjs: "Follow: Arrive by chosen at the office lapses back to live when you reach King's Cross, or after 20 minutes"
- tests/rules.test.mjs: "Follow review: reopening (trains not loaded yet) or a change of direction never says 'missed'; a cancelled train has no Follow button"
- tests/rules.test.mjs: "Follow review: the tube ETA is your vehicle's, at the station you're heading for; a stale or failed one falls back to the ride time"
- tests/rules.test.mjs: "Follow review: on the train it says so and offers nothing better; toggle off ignores a saved follow, fetches nothing extra, saves nothing new"
- tests/rules.test.mjs: "Follow review: a planning tab is kept at 19 min on the move, back to live after 20"
- Toggle off: every existing test and golden is unchanged.

## Not yet / open questions
- From the second independent review (30 Oct, satisfied for merge; low risk, to cover next): no page test of OK's
  wiring to `dismissReason`, nor of following while on the train worked out (not picked); OK on "cancelled" then the
  train reinstated returns to "On track" without saying "running again"; on the tube to Farringdon with a merged
  Thameslink whose Farringdon call has gone, minutes in hand use St Pancras's departure with Farringdon's arrival and
  ready time (overstates the time in hand); untested filters in the tube-position request (westbound, line) and the
  station check on its result.
- Following a tube by vehicle is checked against one snapshot only, and only for the Met; the Circle falls back to the
  ride time. On the way to work the tube is after the train, so it isn't followed for minutes in hand yet.
- "Ahead/behind" while walking uses the option's leave time from where you are (the same as Leave now), not a
  separate walk model; on a train it says you're on it, without minutes ahead or behind.
- Only following a route that starts from where you are now (Leave now's list); Arrive by and Leave around options
  aren't followable yet.
- Notifications with Safari closed (e.g. "your train is cancelled") need the native app (#2–#7); a web page can only
  update while open.
