# Effort levels: what it would take to make each train
Status: Agreed, not built (behind Settings → Experimental when built) · Since: 29 Oct 2026 (evening)

## Story
As a commuter running late, I want each train labelled with what it would take to catch it (walking, a fast walk,
a run, a car, or not possible), and which one gets me there first at each level of effort, so that I go for
a train I can really make and don't chase one I can't.

## Where it came from
29 Oct evening, looking at the Leave now list: "Arrives first" should be marked in every mode. Today every train
whose leave time has passed is treated the same ("Still possible if you hurry… run or bike"), however far short you
are. Sam: 1 min behind on a 10 min walk is doable without running; 5 min behind needs something much faster than
legs (the car), still worth showing; 9 min behind is impossible. Sam can run at about 1.8× his walking pace for about
a quarter of a mile, and wants that configurable ("I'd like to get fitter"). The car is available but rarely
realistic; worth flagging. On an unusually long walk a cab is an option.

## Acceptance criteria (agreed 29 Oct; thresholds are settings)
- Only walking before the train can be sped up; tube rides, platform allowances and other fixed segments can't.
- Effort levels, easiest first; each train gets the easiest one that makes it:
  - **Walk**: at your set pace. Top-box eligible. No lozenge.
  - **Fast walk**: at your measured fast pace (factor 0.82 of your usual times). Top-box eligible, with an amber
    "Fast walk" lozenge.
  - **Run**: up to 400 m at 1.8× your normal pace, the rest at fast walk (both settings). Not in the top box.
    Lozenge "Run".
  - **Car**: from home, your car: 6 min from home to the Letchworth platform. Elsewhere, a cab: 10 min to get one
    (setting) plus driving at 20 km/h. Not in the top box. Lozenge "Car needed" either way.
    Not offered while you're already walking to the station from home (the car is behind you), only from home or
    elsewhere.
  - **Can't make it**: none of the above. Stays in the list, dimmed, lozenge "Can't make it". Never in the top box.
- "Arrives first", per level: at each level the earliest-arriving train you could make gets "Arrives first" (walk),
  "Arrives first · fast walk", "Arrives first · if you run", or "Arrives first · by car", shown only when it
  arrives sooner than the earliest at every easier level. Ties: the later departure.
- Card: "Still possible if you hurry" and "Leave time passed … run or bike" are replaced by one line per run / car
  train that arrives sooner than the top box, e.g. "Arrives first if you run: the 21:48, 4 min sooner than the 22:18".
- Arrive by: the top box's train has "Latest for 08:30" (the time set); when nothing is on time, "Least late for
  08:30". Effort levels apply only when the deadline is today and the leave time is near now.
- Leave around for later and Arrive by for another day: no effort levels ("now" doesn't apply).
- At the station a train leaves from: under 1 minute before departure is "Can't make it" (as now).
- Labels don't flicker: a train moves to an easier level only when it's 30 s inside the boundary.
- Cancelled and "Delayed, no estimate" trains are never "Arrives first" or in the top box (as now).
- Worked examples (10 min walk): 1 min short → fast walk; 5 min short → car; 9 min short → can't make it. From home
  (≈1.6 km, 22 min): fast walk to ≈4 min short; run adds ≈1.5 min; car to ≈16 min short.
- The rule is generic (`src/core`); the levels available, speeds and overheads are profile data and Settings.

## Tests
None yet: agreed, not built. Needed: each boundary (±30 s), each level's "Arrives first" shown only when it beats
easier levels, fixed segments not compressed, car only from home, Arrive by lozenges, toggle off = unchanged
(goldens identical), toggle on.

## Not yet / open questions
- Learn fast / run pace from real trips later, instead of settings only.
