# Which train you're on
Status: Done · Since: 28 Oct 2026 (evening trip); near home 29 Oct (morning trip); destinations 30 Oct · Issues: #10, #11, #23

## Story
As a commuter on a train, especially when there's disruption, I want the app to know which train I'm on and when
it will really arrive, so that the rest of the journey (tube, home time) is planned from the truth.

## Where it came from
28 Oct evening: matching by timetable position broke after the train made an extra stop. 29 Oct morning: passing
Hitchin on the 07:08, the app thought Sam was at home; with the late 07:00 and the 07:08 a few minutes apart it had
to ask; Service Details needed its own key. Non-stop runs only report their two ends (passing points: #23).
30 Oct 18:58, leaving King's Cross: asked to choose between the 18:54 and 18:57 Great Northern, Sam could only tell
them apart by where each was going (the 18:57 to Cambridge), which the train's screens show and the app didn't.

## Acceptance criteria
- The train you're on is one blue lozenge with its status inside it ("On time" / "About N min late"), banded green /
  amber / red for the expected arrival at the change station. → [train-status](train-status.md)
- Only departed trains count; a train that hasn't left is never yours, even if it fits best by timetable.
- Where National Rail last reported each train (Service Details) settles which one you're on; between reported
  stops a train is placed in proportion to time. A train reported more than 6 min from you is ruled out.
- "Sure" only if the next train is 4+ min further off; nothing within 10 min means no match.
- Once sure it stays with your train, but lets go when you're more than 12 min from it.
- When unsure it asks "Which train are you on?"; your pick is kept until you're off the line; if nothing fits you
  can still pick. A fresh fix contradicting a pick (reported position more than6minutes away,
  timing fit more than12minutes away, or a station report it can't share with you: "The wrong train" below)
  retains the choice but marks low confidence, says what the evidence is and asks again. A fix older
  than2minutes cannot create a conflict.
- On the line counts only when moving along it; near home (just past Letchworth to just past Hitchin) only when by
  the track at train speed; stays on while stopped at a station.
- Trains are compared with where you were when the phone took the fix (the phone's own timestamp); "departed" means
  departed by then. A fix over 2 minutes old can't switch or settle the train but keeps the remembered one, at low
  confidence.
- Without phone speed, frequent fixes add up: 300 m+ at 15+ km/h away from home; 500 m+ at 40+ km/h by the track
  near home. A train you picked counts as moving, even stopped at a station. One fix too rough to place you (worse
  than 500 m) changes nothing.
- The train is remembered by National Rail service ID when known (a pick carries it), preferring your station when
  the same service is on two boards; if the ID isn't on the board, by operator, time and station.
- Arrival comes from Service Details' expected time at your stop; "timetable" is the scheduled time; the card shows
  the last reported stop. Service Details about once a minute.
- Signal's [journey-progress diagram](journey-progress.md) draws the existing inferred/confirmed service and
  itinerary, plus its reported/expected calls. It does not introduce another matching algorithm or claim an exact
  live location between reports. The ordinary identity/correction controls remain available.
- On the train home, the list doesn't talk about the onward tube.
- Every train on the on-train card (the lozenge, "or the …", the pick buttons) and on the nearly-home card is named
  with its destination, as the train's own screens say: "18:57 Great Northern to Cambridge". From National Rail's
  board (a dividing train names both parts: "Cambridge & Kings Lynn"); from TfL's summary ("Great Northern to
  Cambridge") only when it isn't the station you get off at, since TfL may name that instead (unverified). No
  destination known: named as before. Tubes likewise: "the 07:56 Met to Aldgate", "the Circle to Edgware Road that
  left Aldgate at 16:46" (the destination is kept with your pick and ride).

- Distinct known National Rail service IDs remain separate candidates even when their times are within one minute; time/operator deduplication is only a fallback when IDs are unavailable.

- A service already identified by the normal engine does not become an Underground interchange merely because a fresh, precise train-speed fix passes within a nearby station radius. Its own profile corridor and ordered calling points decide whether the station is intermediate. A shared interchange is profile data, not an operator or service-ID rule.
- Through-station continuation requires an established moving track no older than3minutes, fix age at most1minute, accuracy at most250m and speed at least12m/s. The complete GPS uncertainty must remain outside the actual destination's existing station radius. A stopped or stale fix, cancellation, unrelated station, unknown service or destination arrival keeps the ordinary station rules. The final3% corridor remains trackable after the intermediate station only while this evidence remains valid.

- When the same known service is recorded on several boards with different alighting endpoints, only an identical service ID, origin, scheduled departure and ordered calling-point prefix may extend its physical corridor. Matching operator/time alone or divergent calling points never selects another train.

- Going home, the short final3% corridor just outside a recently observed departure hub can establish rail movement before identity is settled: a fresh fix good to250m, measured speed12m/s or more, within300m of that hub's profile line, outside every hub radius including uncertainty, and a plausible noncancelled departure towards home in the previous10minutes. The visit must be within10minutes and a known or selected Underground ride vetoes this inference. This supplies movement geometry only; normal train comparison still determines identity and confidence. An unknown service cannot use this rule to force passage inside another hub.

## The wrong train (10 Nov 2026, #57 C1 and C2): built 10 Nov
**What happened:** Sam was following, and riding, the 07:20 Thameslink to Brighton. In the "which train" list he had
selected the 07:15 Great Northern slow train to King's Cross, which was running late. The app listed that train's
stops; his train overtook it at 07:39; nothing warned him, and nothing compared the selection with the route he was
following. (#57 C1's first version had this the wrong way round; corrected there.)

**Why the existing rule stayed quiet:** it needs the selected train to be more than 6 minutes of travel from you.
Replayed as a model (the stopper's real times weren't recorded; perfect phone position every minute): the two trains
are under 6 minutes apart until about 5–7 minutes after the overtake, so the earliest warning was around 07:45, after
Sam had noticed. A reload had also wiped the selection (C3, not yet built), and the phone's position was coarse or
old for much of the journey, which switches the warning off.

**Rules (engine: `stationContradiction`, `whichTrain`, `boardingCheck`, `followIsTrain`):**
- **Station check.** A train is not yours when a station report says so, however close the two trains are:
  - *It left a station before you got there:* the train has an actual time at a station, the phone's fix was taken
    60 s or more after that reported minute (reports are whole minutes), and you were still more than 1 km short of
    that station.
  - *You've passed a station it hasn't reached:* you are more than 1 km past the train's next stop after its last
    report (in calling order; a station whose report never arrived is skipped once a later one has reported; a
    cancelled stop and a station the profile doesn't know are passed over), it has no actual time there, and its
    expected time there is more than 2 minutes after your fix.
  - Only a fix good to 250 m and no more than 2 minutes old counts (a Wi-Fi or mast position never does). Stations
    the profile doesn't know, or more than 1 km off the line, are never evidence.
  - A train ruled out this way is no longer chosen for you, and a train that was yours by inference is let go. A
    train **you selected** is kept: the card asks.
- **The question** is a caution panel on the on-train card: the evidence, then "Which train are you on?", then the
  trains that could be yours (the one you're following first, labelled "· the train you're following") and "Keep the
  …". Words (confirmed by Sam, 10 Nov): "The 07:15 Great Northern to King's Cross stopped at Knebworth at 07:33; you
  didn't. Which train are you on?" For the second kind: "You've passed Welwyn Garden City; the 07:15 Great Northern
  isn't due there until 07:45. Which train are you on?" (confirmed by Sam, 10 Nov). For the
  older distance evidence: "The … doesn't match where you are or where it was last reported. Which train are you on?"
- **"Keep"** answers the evidence it was shown with, which means that kind of evidence at that station (or the
  distance evidence as a whole): the same station doesn't ask again, however the feed revises its minute or the
  train's estimate (a late train's estimate moves most minutes); another station asks again. The train stays
  selected, at low confidence while the evidence stands. The answer stays with the selection (through a stale fix,
  the position wobbling across the 1 km line, and the selection learning the train's service ID).
- **An answer in the question's panel is an answer:** choosing another train there selects it without also asking
  whether to switch from the train you're following.
- **While the question is open, the doubted train's station reports are not shown** (no "Last reported", no stations
  on the station line: "Station reports are hidden until you say which train you're on."); Journey stages stay and
  the status reads "Train not confirmed". The trains themselves stay listed (never hide a train).
- **Selecting a train other than the one you're following asks first:** "You're following the 07:20 Thameslink to
  Brighton. Switch to the 07:15 Great Northern to King's Cross?" · Switch to the … · Stay on the …. Stay changes
  nothing. Switch selects that train for the on-train card; the route you follow is not changed by it (Follow's own
  rules decide what happens to the route). Selecting the followed train, re-selecting the train already selected, or
  selecting when nothing is followed doesn't ask. The question belongs to the route it was asked about: stop
  following, follow something else or change direction and it is gone. A route saved by an older version of the app
  (no train to compare) never asks and never breaks selecting.
- **"I'm on it"** (followed card) is taken at its word only when nothing says otherwise: you're not on the line or no
  train fits where you are (nothing to compare with), or the working-out is sure it is the followed train. When the
  working-out can't tell two trains apart, when its best fit is a different train, or when a report has ruled the
  followed train out, it asks "Which train are you on?" on the followed card, the followed train first. Your answer is
  then taken at its word (the followed train: boarding confirmed; another train: selected without a second question).

**Known limits and things not verified** (independent review, 10 Nov: 111 deliberate breakages; 960 simulated rides
on the selected train raised no false question):
- A confident but wrong phone position (good accuracy, fresh timestamp, wrong place) would raise the question
  wrongly; it costs a question, never a switch. 10 Nov's bad positions were coarse (±167 m to ±1.4 km); only the
  ±167 m one is good enough to count.
- Not confirmed against real feed data: a live estimate that is several minutes pessimistic together with a report
  that lags could raise "you've passed …" for someone on the train; reports that arrive 1.5–2 minutes early are
  tolerated, more is not known to happen. The age of the report data is not considered.
- Follow moves itself to "on the train" on the best-fitting train even when the working-out is unsure ("Probably the
  … or the …"), so "I'm on it" is not offered then (older behaviour, unchanged here; it limits how often the C2
  question is reached). For Sam to decide with the single-card work.
- A train name or service ID containing "|" breaks selecting it (the selection format is older than this change; not
  seen in real data).
- The selection is still lost on a reload (C3). The list still offers up to three nearest trains whether or not
  they could be yours (C12).

## The train you said you're on holds (11 Nov 2026, #57 retest R1): built 11 Nov
On the 11 Nov retest Sam said which train he was on three times (once "I'm on it", twice by picking the 07:30) and
each time, within minutes, the card went back to "Probably the 07:38 … or the 07:30". Cause (traced from the code):
the page dropped any picked train whenever the phone wasn't placed on the line (`state.onLine` false: the first
stretch near home, a tunnel, a coarse fix), and the boards only looked back for departed trains while on the line,
so the picked train could also fall off them. Rule agreed by Sam, 07:54: **once you've said which train you're on,
the card either affirms it or questions it openly; it never quietly goes back to "Probably …".**
- A picked train (from "I'm on it" or the list) stays picked while the phone isn't on the line. It goes: at a London
  station other than where it left from, unless it's still found on the boards going on further (a Thameslink through
  St Pancras to Farringdon); 30 minutes after its arrival; 4 hours after it was picked; or when you pick another.
- While a pick holds, the boards keep looking back 40 minutes (as on the line), so the train stays findable. If it's
  still not among the departures, the pick is kept and nothing else is claimed in its place.
- The pick survives a reload: saved with when it was made (`saved.trainPick`), restored if under 4 hours old,
  ignored if malformed, cleared when dropped (#57 C3/C4).
- When your position fits another train better and there's no station to point at, the question reads (Sam's
  words): "You picked the 07:30 Great Northern, but your position fits the 07:38 Great Northern better. Still on the
  07:30 Great Northern?" With a station to point at, Monday's wording stands.
- Not built: Follow boarding itself on an unsure fit; the review of these rules is deferred to after Sam's homeward
  test (Sam, 11 Nov: "We can relax the rules on the independent reviewer for this round").

## Tests
- tests/retest-fixes.test.mjs: "A train you picked stays picked while the phone isn't placed on the line; it goes at the station it takes you to, or 30 min after its arrival"
- tests/retest-fixes.test.mjs: "The pick survives a reload: kept with when it was made, restored if under 4 hours old, cleared when dropped"
- tests/core/retest-fixes.test.mjs: "A train you picked that isn't among the departures just now stays picked (no new guess in its place)"
- tests/core/retest-fixes.test.mjs: "The agreed question when your position fits another train better (Sam, 11 Nov): no station to point at"
- tests/core/wrong-train.test.mjs: "Station check: the train left a station a minute or more ago and you still hadn't reached it → not your train"
- tests/core/wrong-train.test.mjs: "Station check: you're past a station the train isn't due at for two minutes yet → not your train"
- tests/core/wrong-train.test.mjs: "Station check: going home it reads the line the other way"
- tests/core/wrong-train.test.mjs: "whichTrain: a selected train contradicted by a station asks, though it is under 6 minutes away; a stale fix never does"
- tests/core/wrong-train.test.mjs: "whichTrain: 'Keep' answers the evidence it was asked about (that station); another station asks again; the answer stays with the selection"
- tests/core/wrong-train.test.mjs: "whichTrain: 'Keep' answers distance evidence too (no station report): key \"far\""
- tests/core/wrong-train.test.mjs: "whichTrain: the station check uses when the fix was taken, not when the card is drawn"
- tests/core/wrong-train.test.mjs: "whichTrain: with nothing selected, a train contradicted by a station is ruled out, so the other is yours"
- tests/core/wrong-train.test.mjs: "10 Nov replay (model): the late 07:15 stopper selected, the 07:20 fast train ridden: asked at the first station it leaves ahead of you, minutes before the distance rule"
- tests/core/wrong-train.test.mjs: "The questions' words: the evidence, then the question (wording confirmed by Sam, 10 Nov)"
- tests/core/wrong-train.test.mjs: "Journey progress: a train the evidence contradicts shows no station reports until you've answered; the stages stay"
- tests/core/wrong-train.test.mjs: "followIsTrain: the train you follow by service ID when both have one, else by operator, time and station; whichever city station it's listed for"
- tests/core/wrong-train.test.mjs: "boardingCheck: 'I'm on it' is taken at its word only when nothing says otherwise"
- tests/wrong-train.test.mjs: "Wrong train: selecting a train other than the one you're following asks first; Stay changes nothing, Switch selects it"
- tests/wrong-train.test.mjs: "Wrong train: selecting the train you're following, or any train when you follow nothing, doesn't ask"
- tests/wrong-train.test.mjs: "Wrong train: the selected train left Knebworth before you got there → the card says so and asks; the train you're following is offered first; its station reports are hidden"
- tests/wrong-train.test.mjs: "Wrong train: 'Keep' answers that evidence only: not asked again for it, asked again when the next station contradicts it"
- tests/wrong-train.test.mjs: "Wrong train: a rough or old position can't raise the question"
- tests/wrong-train.test.mjs: "Wrong train: with several trains about, the one you're following is offered first; answering with another train isn't questioned a second time"
- tests/wrong-train.test.mjs: "Wrong train: you've passed a station the selected train isn't due at yet → the card says so; 'Keep' holds while its estimate moves"
- tests/wrong-train.test.mjs: "Wrong train: a far-away selected train with no station report asks in the same way, and 'Keep' answers it"
- tests/wrong-train.test.mjs: "Wrong train: an open 'Switch to…?' question goes when you stop following, and doesn't come back with the next route"
- tests/wrong-train.test.mjs: "Wrong train: a route saved by an older version (no train to compare) never breaks selecting a train or the question"
- tests/wrong-train.test.mjs: "I'm on it: when the app can't tell two trains apart it asks which, the one you follow first; your answer is taken at its word"
- tests/wrong-train.test.mjs: "I'm on it: answering with the other train selects it without a second question; with nothing to doubt it confirms at once"
- tests/core/situation.test.mjs: "railTrackingContext: a provisional observed train preserves movement without resolving its identity"
- tests/core/situation.test.mjs: "railTrackingContext: a recent departure can establish rail movement in the end-corridor gap without choosing a train"
- tests/core/situation.test.mjs: "railTrackingContext: departure gap inference is generic and cannot override a known tube"
- tests/core/situation.test.mjs: "railTrackingContext: same-service board variants extend only an identical ordered calling sequence"
- tests/core/situation.test.mjs: "railTrackingContext: a known moving through service passes an overlapping interchange and keeps its own corridor"
- tests/core/situation.test.mjs: "railTrackingContext: train knowledge cannot override its own destination or unrelated station arrival"
- tests/core/situation.test.mjs: "railTrackingContext: stale rough slow or unestablished evidence cannot force through-station inference"
- tests/core/situation.test.mjs: "railTrackingContext: another corridor and shared station names use only profile data"
- tests/core/situation.test.mjs: "whichTrain: keep a confirmed train but warn on fresh contradictory evidence; stale fixes cannot create a conflict"
- tests/simulator-integration.test.mjs: "simulator app: a confirmed train conflicting with reported position is retained with an explicit warning"
- tests/core/situation.test.mjs: "whichTrain: distinct service IDs stay separate even a minute apart"
- tests/core/situation.test.mjs: "whichTrain: departed trains only, the nearest fit, sure when the runner-up is 4+ min worse, then remembered"
- tests/core/situation.test.mjs: "whichTrain: a reported position beats the timetable, and more than 6 min from you rules a train out"
- tests/core/situation.test.mjs: "trackLine: on a train only when moving along the line; near home only by the track at train speed; stays on while stopped"
- tests/core/situation.test.mjs: "trackLine near home: just past Letchworth towards Hitchin, only by the track at train speed"
- tests/core/situation.test.mjs: "onLine: between home and London, close to the line, never at home or a London station"
- tests/core/situation.test.mjs: "The remembered train: by National Rail service ID when known, else operator, time and station; confidence"
- tests/core/calls.test.mjs: "Service Details: last stop reported (actual time, delay), next stop, expected time at your stop"
- tests/core/calls.test.mjs: "reportedFrac: a train between its last reported stop and the next is placed in proportion to time; not departed = at its origin"
- tests/rules.test.mjs: "On the train: 'sure' only if the next train is 4+ min further off; nothing within 10 min means no match"
- tests/rules.test.mjs: "On the train: a train that hasn't left is never yours, even if it fits best by timetable"
- tests/rules.test.mjs: "On the train: once sure it stays with your train, but lets go when you're more than 12 min from it"
- tests/rules.test.mjs: "On the train card: arrival from Service Details; 'timetable' is the scheduled time"
- tests/rules.test.mjs: "This morning: at Letchworth station, then on the 07:08 passing Hitchin — on the train, not 'leave now'"
- tests/logic.test.mjs: "On the train: works out which train from your position and projects arrival"
- tests/logic.test.mjs: "On the train: when unsure it asks which train you're on; your pick is kept until you're off the line"
- tests/logic.test.mjs: "On the train: where National Rail reported each train settles which one you're on"
- tests/logic.test.mjs: "On the train: a train reported more than 6 min from you is ruled out; if nothing fits, you can still pick"
- tests/logic.test.mjs: "On the train home: a train that hasn't left can't be yours; once sure, it stays with your train when it falls behind (stop at Finsbury Park)"
- tests/logic.test.mjs: "On the train home, the list doesn't talk about the onward tube"
- tests/golden.test.mjs: "golden: on the train near Knebworth (the 07:08 is reported passing; the 07:20 hasn't left)"
- tests/golden.test.mjs: "golden: on the train, no train fits where National Rail reports them: asks which train"
- tests/core/situation.test.mjs: "trackLine without phone speed: frequent fixes accumulate; a picked train counts; one rough fix changes nothing"
- tests/core/situation.test.mjs: "trackLine near home without phone speed: 500 m+ at 40+ km/h by the track"
- tests/core/situation.test.mjs: "whichTrain: a stale fix keeps the remembered train even when it no longer fits; an office arrival from yesterday is forgotten"
- tests/core/situation.test.mjs: "Remembered train: falls back to the fields when the ID isn't on the board; same ID at two stations prefers yours; stale lock is low confidence; departed is judged at fix time"
- tests/core/situation.test.mjs: "Rough fixes and office days: a rough fix while standing doesn't put you on a train; an arrival from yesterday evening is forgotten"
- tests/rules.test.mjs: "Review: a picked train keeps its National Rail service ID"
- tests/core/calls.test.mjs: "Destination: from Darwin (a dividing train names both parts) and TfL's summary; a train is named with it"
- tests/logic.test.mjs: "On the train: each train is named with where it's going, as its own screens say, to tell close trains apart"
- tests/rules.test.mjs: "Review 2: the page uses the phone's own fix time; a picked train counts as moving; riding doesn't move your station; a ride clears the pick"

## Not yet / open questions
- #23: passing points (Darwin real-time) for non-stop runs; needs a server.
- #10/#11: fully automatic boarding detection and arrival platform, mainly for the native app.

The Journey Simulator's expected-versus-actual assertion exposed this production defect: a Thameslink
service at St Pancras was treated as arriving at the neighbouring King's Cross hub, and rail tracking
used the King's Cross corridor even though the inferred service continued to Farringdon. The fix uses
only existing inferred service data and generic profile geometry; simulation never supplies an identity.
A first unidentified train or a stopped service at an intermediate station remains ambiguous; this rule
does not invent a train identity or assume that the passenger stayed aboard.
