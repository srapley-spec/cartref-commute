# Cartref Commute — screen functionality inventory (from src/page.html @ docs/context-in-repo, 29 Oct 2026)

Scope for the redesign: commute planning (Leave now / Arrive by / Leave around) and the live journey states.
Everything below is what the current screen shows. A redesign must either keep each item, or list it explicitly as
"recommend drop/hide" for Sam to decide. Silent loss is a defect.

## Always on screen (planning)
1. Header: app name; route label ("Cartref → 20 Mansfield Street", flips with direction; leisure variants); Settings button.
2. Mode segmented control: Commute / Leisure (leisure hides pace; relabels "To office" → "To London").
3. Direction segmented control: Auto / To office / To home. Under Auto, a note says what it decided and from what
   ("Heading to the office · from your location" / "finding your location…").
4. Walking pace segmented control: Average / Fast (affects every walk time).
5. Origin postcode form (only when location unavailable, leisure home) and destination form (Any-place toggle, leisure).
6. Banners (stacked, each its own box, coloured by impact): example-data notice; timetable-not-live notice;
   "<station> trains not loaded" (which routes failed, retry time); generic problems; "train times may be out of date"
   (last updated time); "Circle and Met closed → H&C fallback"; each disrupted tube line (folded details with reason);
   N trains delayed with no estimate (folded, each train listed); N of your trains cancelled (folded);
   "Your line is disrupted" (affected/total, worst delay; says "about trains now" when the plan on screen is later);
   notices naming your route (folded, title = first sentence ≤90 chars, links tappable, stays open across refresh);
   operator status (GN/Thameslink); station facility notices (grey, folded, count); elsewhere on the network (grey, folded, count).
7. Plan segmented control: Leave now / Arrive by / Leave around. For by/at: Day date input + time input.
8. Hero card (dark block):
   - Label line: context + time (+ "timetable" when not live) + "best, and the next best".
   - One or two option blocks (best; next best within 20 min window; Arrive by: latest on-time + earlier with margin):
     big Leave time (or Departs time + departure station + "N min late" when at a station / on the way) → big Arrive
     <dest> time; route chips (via King's Cross / Farringdon ("or St Pancras"), Circle, Met, or H&C fallback;
     leisure: "to <station>" + TfL summary); meta line: std (+ "exp hh:mm" when late), operator, platform,
     train duration, total door-to-door, timing text ("on track · 3 min to spare" / "walk to the platform by hh:mm" /
     "leave now" / "12 min early" / "leave 5 min before hh:mm" / "N min late, no train gets you there in time"),
     live countdown ("leave in 4:12" / "train departs in …" / "leave time passed"); "Board at Farringdon 17:56 platform 2
     or St Pancras 18:01" (same train, several stations, each with platform; "too late to reach from here");
     flags as pills (full text incl. long reason); Journey steps folded (ordered legs with times and notes).
   - On the way: "At the station about hh:mm · 22 min walk from here at average pace".
   - "Leaving right now? The 07:20 Great Northern — 54 min train; office 08:31, 5 min later than the 07:08"
     (or "Next train:" at a station, "Next one you can make:" on the way); stopping trains named with cost.
   - "Still possible if you hurry: the 07:08 exp 07:09 … train departs in 2:30 — …; at walking pace you're 2 min short"
     (nearest-to-making first; stays until it leaves).
   - Tubes from Aldgate (home, near office, live): up to 3 rows "Met 17:42 → Farringdon 17:51: 17:56 Thameslink, home
     18:58 · leave the office by 17:34".
   - "Your lines" status strip: every line on the journey incl. good service; "N notices on your line, see above";
     reasons for lines not ok.
   - Empty states: loading; add key / pick example data; nothing catchable (+ hurry lines); no trains for that time;
     no direct train by then; errors.
9. List title ("Next trains, in leaving order" / "Trains around hh:mm" / "On the train" / "Trains home" / "Nearly home"…).
10. List rows: Leave (or Departs) time; route chips; meta (std exp, operator, platform, train duration, total, countdown);
    "Board at / Get off at" alt line; short pills (long reasons hidden); Arrive time. Best row highlighted; late rows
    muted; uncertain rows dimmed; missed rows strike-through red. Arrive by: a row saying "No Farringdon train gets you
    there by hh:mm". Empty: "Nothing catchable in the next two hours."
11. "Why these trains?" folded: per board live train counts (cancelled marked), live horizon, timetable searches
    (returned/kept/dropped + reasons), TfL key hint.
12. Model note: data source sentence; tube wait allowance; pace; "times beyond ~2 h come from the timetable".
13. Line status grid: every tube line + NR operator with colour dot and status pill.
14. Footer: "Updated hh:mm · requests in the last minute: TfL n, National Rail n · build xxxx"; Refresh button.
15. Settings dialog: data source (RDM/proxy/Huxley/TfL/demo) + keys/URLs; walk times (4); station/interchange times (16);
    home location set; Experimental toggle (Any start and end point); reset; save.

## Flags (pills) that must survive, with level
Cancelled (bad); Usually standing room only (bad); Stopping train (warn); Delayed, no estimate: times unknown (bad);
+N min (warn <10, bad ≥10); reason text (warn, long); Timetable only: not live-checked (info); Leaving in under a
minute (bad); Leave time passed: N min short at walking pace, run or bike (bad); Leave N min before hh:mm (warn);
Cutting it fine (warn); Late by N min (bad); H&C fallback note (warn).

## Live states (hero replaces the planning card; list changes)
A. On your way to Letchworth: departures board, "At the station about hh:mm · walk", per train "on track · N min to spare"
   / "keep going"; hurry trains with countdown; refresh 30 s.
B. At Letchworth (to work) / at a London station (home): departure board — big time = departure; "walk to the platform
   by hh:mm" / "go to the platform now"; a train from this station catchable until 1 min before; other-station trains keep the walk.
C. On the train: label "On the train · hh:mm · worked out from your location" (+ "location last updated N min ago" when stale);
   big projected arrival at office/home; "You're on / Probably the 07:08 Great Northern" (+ "or the 07:00" / "you picked this");
   "Which train are you on?" / "On a different train?" pick buttons; "King's Cross 07:48 expected (live) · timetable 07:45 ·
   about 3 min late"; "Last reported: Hitchin 07:21 · 2 min late · next Stevenage 07:27"; onward legs shifted by delay;
   status strip; source note (Service Details / live expected / projection; timetable caveat). No-match state with picks.
D. At a London station to work: "You're at King's Cross · live tube times"; big office arrival + duration; "Get on / You're
   getting the Circle to Aldgate · eastbound, due hh:mm · in 2:10 · N min to spare"; legs (walk to eastbound platform from
   when you arrived; tube; Aldgate; office); "earlier than we'd expect you can reach the platform" note; "Near the platform
   already? The 08:01 Met (office 08:24)…"; "Which one are you getting?" picks; line issues; status strip; list = next tubes
   with "If you're near the platform" pill, Aldgate time, office time. Fallback estimate when no live tubes.
E. On the tube (to work): big office arrival (+ "estimate" unless live Aldgate arrival); "Probably / You're on the 08:03 Circle"
   (+ or); "Still at King's Cross? Did you get the 08:03?" Yes/No; "On a different tube?" swap; legs (Aldgate live or est; office + walk);
   status strip. List: "At Aldgate the app shows the walk to the office."
F. In London (to work, not on tube): at office "you've arrived"; near office walking (arrival, walk, straight-line metres);
   elsewhere TfL journey planner summary + arrival.
G. On the tube home: big home arrival; "Probably the Met that left Aldgate at hh:mm (or …)"; "Get off at Farringdon hh:mm →
   17:56 Thameslink · platform · home hh:mm" + "or get off at King's Cross … (N min later)"; status strip; note.
H. Nearly home: big home time; "On the 17:56 Thameslink"; "Letchworth hh:mm expected · then a 22 min walk"; walking variant
   ("About 14 min walk from where you are"); at station variant; "You're home."; unknown ("set your home in Settings").
I. Arrive by while under way: verdict band on top of the live card — "On time for 08:30 · 7 min to spare" (green) /
   "Late for 08:30 by about 4 min · office 08:34" (red).
J. Awaiting location (Auto): "Finding your location…" / "Location needed" + help; manual choice offered.

## Behaviours the design must not break
- Every catchable train listed in leaving order (never hide); problems are flags not removal.
- Late trains show "07:00 exp 07:03" everywhere.
- Same train at several stations is one entry with "Board at / Get off at" line and per-station platforms.
- Opened folded sections stay open across the 30 s redraws.
- Countdowns tick every second.
- Pick buttons (which train / which tube / did you get it) are one tap and remembered.
- Accessibility: aria-pressed on segments, aria-live on hero, focus rings, 44 px inputs.
- Dark and light themes.
