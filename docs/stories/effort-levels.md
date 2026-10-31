# Extra effort to catch a train (effort levels): what it would take to make each train
Status: Done (always on; the Experimental toggle was removed 30 Oct) · Since: 29 Oct 2026 (evening)

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

30 Oct: Sam hadn't known it was behind a toggle and hadn't asked for one ("The trains below should have a lozenge
on them"); the toggle was removed so it's always on. The running, car and cab times moved to Settings → "Catching a
train". The old "Still possible if you hurry… N min short" and "Leave time passed … run or bike" wording is gone from
the screen; the engine keeps it only for a caller that doesn't ask for effort levels.

## Acceptance criteria (agreed 29 Oct; thresholds are settings)
Engine: `src/core/effort.ts`. The page passes where you are, remembers last refresh's grades and draws the result.
- Only walking before the train can be sped up (route segments of kind `walk`, which carry the same walk at your
  average and fast pace). Everything else before the train is fixed: station allowances, tube rides and the tube
  wait allowance, interchanges, and your "be on platform before the train leaves" margin.
- You set off 30 s from now (as everywhere else). Each train gets the easiest level that makes it:
  - **Walk**: at the pace the plan uses. Top-box eligible. No lozenge.
  - **Fast walk**: at your measured fast pace. Top-box eligible, amber "Fast walk" lozenge. A fast walk is then the
    plan for that train: its leave time, total time and Journey steps are all at a fast walk ("walk 22 min · fast
    walk 18 min"); on your way it says "walk fast · N min to spare". In Leisure "fast walk" is your commute fast pace.
  - **Run**: up to 400 m at 1.8× your average walking pace, the rest at a fast walk (Settings: running speed, how far
    you can run); never slower than a fast walk. Not in the top box. "Run".
  - **Car**: from home, your own car: 4 min to the station entrance (Settings), plus the station allowances (6 min to
    the platform with the defaults). Anywhere else (including on your way to the station: the car is behind you) a
    cab: 10 min to get one (Settings), then the walking distance at 20 km/h. Never counted as slower than walking.
    Not in the top box. "Car needed".
  - **Can't make it**: none of the above. Stays in the list, dimmed, "Can't make it". Never in the top box.
- At the station a train leaves from: a minute or more before departure is walk, less is can't make it.
- Each boundary is exact to the millisecond (needs ≤ time in hand). No flicker: a train moves to an easier level only
  when it's 30 s inside it; to a harder one at once. Last refresh's grades are kept per view (Leave now, Arrive by),
  for the trains still listed, keyed by train, departure station and day (the same train at Farringdon and St Pancras
  is graded separately).
- Cancelled and "Delayed, no estimate" trains get no effort lozenge, are never "Arrives first" or in the top box.
- "Arrives first", per level: at each level the earliest-arriving train you could make with that much effort or less
  (ties: the later leave, as the card) is marked, only when it arrives sooner than the earliest at every easier level:
  "Arrives first" (green), "Arrives first · fast walk", "· if you run", "· by car" (amber; one lozenge, replacing
  the plain effort lozenge). When a harder level is marked too, the walking one says "Arrives first · walking".
- **All supported views/designs use this same result** (Sam, 31 Oct, evening). Live departures preserve the matched
  option's canonical arrival-first flag and effort qualifier instead of rebuilding only the train's status flags.
  Cancelled, no-estimate and impossible trains cannot inherit a fastest badge. A shorter journey duration alone
  is not “Arrives first”; existing arrival ordering and per-question eligibility remain unchanged.
- Card: "Still possible if you hurry" and "Leave time passed … run or bike" are replaced by one line per run / car
  train marked "Arrives first" that arrives sooner than the card's best, soonest first: "Arrives first if you run: the
  07:20 Great Northern leaves Letchworth, … — 4 min sooner than the 07:23".
- Arrive by: the pick says "Latest for 08:30" (the time set), or "Least late for 08:30" when nothing is on time;
  "Arrives first" per level as above.
- Leave around: "Arrives first" among the card's window (leaving from 10 min before your time), so it's the card's
  best. Leave around's trains are graded too (near now, leave times are passing): the card shows
  the next train you can still make, with a fast walk if need be (Sam, 30 Oct); a run, car or can't-make-it train is
  never the pick or "Arrives first" and is labelled in the list. If nothing is makeable even with a fast walk, the
  card says "Nothing around 07:00 you can still make, even with a fast walk." Grades are kept per view (Leave now,
  Arrive by, Leave around).
- Worked examples (10 min walk, nothing fixed, from home): 1 min short → fast walk; 3 → run; 5 → car; 9 → can't
  make it; away from home, 5 → can't make it (a cab takes 10 min). From home in the real data (22 min walk + 3 min
  fixed): fast walk to ≈ 4.2 min short, run to ≈ 5.4, car to ≈ 18.3.

## Review
Independent review (29 Oct night, a separate agent): 108 deliberate breakages, 82 caught; 15 real gaps and 11 that
can't change any output. It also found a bug (the same train at two stations shared one remembered grade, so a
walkable St Pancras train showed "Fast walk"), a fast-walk pick whose total and steps were still at walking pace,
the card and "Arrives first" breaking ties differently, and Leave around near now marking a train whose leave time
had passed. All fixed, with a test for each gap; each of those breakages re-run and now caught. Second review of the fixes (30 Oct):
verdict merge; probes confirm the fixes; its three follow-up tests added (going-home fast-walk steps, Leave around
near now with the toggle off, Arrive by's own grades). Left: three boundaries that can't matter in practice
(sub-millisecond rounding, exactly 100 m from home, 'leave now' counted from now rather than now + 30 s).

## Tests
- tests/core/effort.test.mjs: "effortNeeds: walk, fast walk, run (400 m at 1.8×, the rest fast), own car from home, a cab elsewhere"
- tests/core/effort.test.mjs: "effortNeeds: fixed parts are never shortened; a short walk is all run; running never slower than a fast walk"
- tests/core/effort.test.mjs: "effortFor: Sam's examples on a 10-minute walk — 1 min short fast walk, 5 min car, 9 min can't make it"
- tests/core/effort.test.mjs: "effortFor: each boundary to the millisecond (you set off 30 s from now)"
- tests/core/effort.test.mjs: "effortFor: at the station the train leaves from, a minute or more is walk, less is can't make it"
- tests/core/effort.test.mjs: "effortFor: no flicker — a train moves to an easier level only 30 s inside it; harder at once"
- tests/core/effort.test.mjs: "effortFor: without route detail, the leave time decides walk or can't make it"
- tests/core/effort.test.mjs: "gradeEffort: missed = harder than a fast walk; the latest set-off; one lozenge; cancelled gets none; gone trains dropped"
- tests/core/effort.test.mjs: "gradeEffort: last time's grade is looked up by the train's key (service ID, station, time, operator, day)"
- tests/core/effort.test.mjs: "gradeEffort: at a station, only trains from that station use the one-minute rule"
- tests/core/effort.test.mjs: "markArrivesFirst: each level's earliest arrival, only when it beats every easier level; amber when it takes effort; '· walking' when not alone"
- tests/core/effort.test.mjs: "markArrivesFirst: one lozenge when walking is already first; ties go to the later departure; cancelled never"
- tests/core/effort.test.mjs: "markArrivesFirst: only among the options that count (e.g. Leave around's window); options without a grade are walks"
- tests/core/effort.test.mjs: "effortOffers: run and car trains that arrive sooner than the card's best, soonest first"
- tests/core/effort.test.mjs: "markLatestFor: 'Latest for 08:30' on an on-time pick, 'Least late for 08:30' when nothing is on time"
- tests/core/effort.test.mjs: "rankNow with effort: a fast walk can top the card, a run can't; offers; without effort nothing changes"
- tests/core/effort.test.mjs: "liveAdjust: with effort it grades; without, the old 'leave time passed' flags"
- tests/core/effort.test.mjs: "arriveByOptions with effort: 'Latest for' on the pick, 'Arrives first' on the earliest arrival"
- tests/core/effort.test.mjs: "aroundOptions with effort: 'Arrives first' is the card's best (its window), not a train before it"
- tests/core/effort.test.mjs: "accessOf: walking (plan, average, fast) and the fixed rest, from the route's segments"
- tests/core/effort.test.mjs: "leftHome: 100 m plus the fix's accuracy from a saved home; without one, 3 min nearer the station"
- tests/core/effort.test.mjs: "samRoutes: from home the walk is your measured walk at both paces, from home; the rest is fixed"
- tests/core/effort.test.mjs: "samRoutes: on your way, the same share of your walk at both paces; your car is at home only if you are"
- tests/core/effort.test.mjs: "samRoutes going home: the walk to the tube at both paces, not from home; at a London station the platform walk"
- tests/effort.test.mjs: "Effort levels always on: no toggle, and a phone that saved the toggle off still gets them"
- tests/effort.test.mjs: "Effort levels on: a fast walk tops the card with its lozenge and the time to leave at a fast walk"
- tests/effort.test.mjs: "Effort levels on: the card says which run / car trains arrive sooner; the list labels every train"
- tests/effort.test.mjs: "Effort levels on: last refresh's grade holds a train back from an easier level until it's 30 s inside it"
- tests/effort.test.mjs: "Effort levels on: your car is only at home; on your way it's a cab (10 min to get one)"
- tests/effort.test.mjs: "Effort levels: Settings show and save running speed and distance, car and cab times"
- tests/effort.test.mjs: "Effort levels: the engine gets your settings (running speed and distance, car, cab)"
- tests/effort.test.mjs: "Effort levels: Arrive by's pick says 'Latest for' the time you set"
- tests/effort.test.mjs: "Effort levels on: Leave around's best says 'Arrives first'"
- tests/effort.test.mjs: "Extra effort on: Leave around near now shows the next train you can still make (a fast walk), and says so when there's none"
- tests/core/effort.test.mjs: "aroundOptions with effort, graded: Leave around near now picks the next train you can still make, with a fast walk if need be"
- tests/core/effort.test.mjs: "liveAdjust with effort: cancelled and no-estimate trains are uncertain, get no lozenge and are never picked"
- tests/core/effort.test.mjs: "gradeEffort at a station: another station's train keeps the walk rule (it isn't 'under a minute')"
- tests/core/effort.test.mjs: "effortFor: the 30 s margin only applies moving to an easier level, not to a harder one than last time"
- tests/core/effort.test.mjs: "markArrivesFirst: a harder level that only ties an easier level's arrival isn't marked"
- tests/core/effort.test.mjs: "markArrivesFirst: ties go to the later leave, as the card's pick"
- tests/core/effort.test.mjs: "aroundOptions with effort: a train before the card's window never takes 'Arrives first', and passed leave times don't count"
- tests/core/effort.test.mjs: "arriveByOptions with effort: run / car trains that get you there sooner are offered"
- tests/core/effort.test.mjs: "effortNeeds: a cab drives the walking distance at your average pace, whatever pace the plan uses"
- tests/core/effort.test.mjs: "gradeEffort: a train leaving this instant is still listed"
- tests/core/effort.test.mjs: "effortKey: the same train at two stations, or the same time another day, has its own key"
- tests/core/effort.test.mjs: "samRoutes: going out to a London place starts at home (your car)"
- tests/core/effort.test.mjs: "fastWalkLegs going home: the walk to the tube is shortened and every step after it moves with it"
- tests/core/effort.test.mjs: "aroundOptions without effort (toggle off): Leave around near now is as before — a passed leave time can still be the pick"
- tests/effort.test.mjs: "Effort levels on: a fast-walk pick's total time and steps are at a fast walk too; no 'leave now' while there's time"
- tests/effort.test.mjs: "Effort levels on: on your way, a train that needs a fast walk says 'walk fast'"
- tests/effort.test.mjs: "Effort levels on: Arrive by's card says which run / car train gets you there sooner"
- tests/effort.test.mjs: "Effort levels: the running and car settings are always shown"
- tests/golden.test.mjs: "golden: effort levels on: at home and late for the 07:38, live; Arrive by 08:30 and Leave around 07:40"
- tests/golden.test.mjs: "golden: effort levels on: on your way to Letchworth, live"

## Not yet / open questions
- Learn fast / run pace from real trips later, instead of settings only.
- A cab only replaces walking: a TfL-planned London leg (Leisure, going home) is fixed, so a cab never shortens it.
- The leave column of a run / car / can't-make-it train still shows the walking-pace leave time, struck through.
- With pace set to fast in Settings there is no separate fast-walk level: 1 min short is a run.
