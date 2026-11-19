# Commute watch: weekday alerts only when they matter (#66)

**Modes:** Commute only. It watches Sam's own journey between Letchworth and the office, and needs no route followed.
Leisure and Trip are one-off journeys with no fixed time to watch.

## Who and why
Sam, 19 Nov 2026, on the first real iPhone commute:
- **Morning:** "I need to know whether to continue getting ready and heading to the station, or if I should consider
  making alternative arrangements and WFH."
- **In London:** "I only want to know if there is a real risk of me not getting home or getting home late. A delay of
  15 mins seems like a good threshold for an amber warning. More than 45, or closed or disrupted (person on track,
  OHL equipment failure), should trigger this immediately, because the risk of disruption is high and I'd want to rush home."
- **When:** 05:00–10:00 in the morning, and from 15:00 in the afternoon, Monday to Friday.

## Acceptance criteria
- **Windows, local time, Monday to Friday:** 05:00–10:00 to the office; 15:00–20:00 home. Not at weekends or on
  England and Wales bank holidays (`BANK_HOLIDAYS`, gov.uk dates to the end of 2027; extend yearly). The 20:00 end is
  Claude's default; Sam named only the start.
- **Lateness is "how much later you'd get there", not one train.** It is the earliest arrival the live trains still
  give, from King's Cross, St Pancras and Farringdon (or from Letchworth to all three), against the earliest the
  timetable gave for trains still to leave, over the next 90 minutes. A cancellation with the next train 10 minutes
  behind is 10 minutes. A train already due, now running late, never sets "normal". The same train on two boards
  counts once: going out, the same departure from Letchworth (one Thameslink on the Farringdon and St Pancras boards);
  coming home, the same timetabled arrival at Letchworth. Of two copies, the one that runs counts: a Thameslink
  cancelled at Farringdon may still reach St Pancras. When no
  timetable train is left to compare with, the best train's own lateness is used.
- **Amber:** at least 15 minutes later than normal (`WATCH_AMBER_MIN`).
- **Red:** any of these:
  - more than 45 minutes later than normal (`WATCH_RED_MIN`);
  - no train running (all cancelled, or none with a time, counting trains stuck at "Delayed" past their time);
  - Circle, Met and H&C all closed, suspended, planned-closed or not running (TfL 1, 2, 4, 16). "Service Closed" (20),
    which is how TfL shows the tube before it opens, is not a closure.
  - a National Rail notice on the boards of a blocking incident:
    - **Strong phrases win over any other word in the notice:** lines blocked (also "have now been blocked"), unable to
      run, no trains running, hit by a train, overhead line. "Suspended", "emergency services", "trespass" and "major
      disruption" count unless the notice is about a facility (lift, step-free, ticket office, car park).
    - **It must be on your line.** A "between X and Y" stretch counts only when both ends are stations on the way, or
      on beyond Letchworth to Cambridge. "Between Hitchin and Peterborough" is the East Coast; "between Alexandra
      Palace and Hertford North" is the Hertford loop. A notice with no stretch must name a station outside London:
      King's Cross and St Pancras carry every operator's notices.
    - **It must not be cleared or for another time.** Cleared means specific phrases only: "lines have reopened",
      "running normally", "disruption has cleared". Not today means planned engineering or works, "this weekend", or
      "on <a day other than today>". An overrun is never "planned".
    - **A station of yours named as the incident's place** counts: in the same sentence as the blocking phrase, after
      "at", "near", "north of", "south of", "outside" or "called to" ("… hit by a train at Hatfield"). It doesn't count
      as where other operators' trains call, start, stop or run fast ("LNER trains will not call at Stevenage",
      "services will start from Stevenage"), or as "via".
    - **Planned work only can be for another time.** "Expected to continue on Friday" after an incident is today's.
    - **Accepted miss:** "between Peterborough and Stevenage" includes Stevenage–Hitchin, but telling that needs route
      order, so it counts only once the trains show it.
    - **Design choice:** a blocking notice that names only King's Cross, St Pancras or Farringdon counts for nothing by
      itself. The train data shows its effect, because those trains go late or are cancelled.
- **Also amber:**
  - two or more trains stuck at "Delayed" with no estimate, from 10 minutes past their time. Darwin shows "Delayed"
    for a few minutes around departure, and often hasn't updated the trains behind a stuck one.
  - all three tube lines badly disrupted or worse (part suspended, part closure, Severe Delays, reduced service,
    replacement bus). One line alone is nothing, and Minor Delays are nothing.
- **Unknown, never "ok" and never an alert:** no board read, or boards read but no train listed in the next 90 minutes.
- **A notice that explains but doesn't block** (signalling fault, "disruption"), such as "Disruption expected until
  18:00", explains an amber or red but doesn't raise one.
- **One notification per change, with no flapping (independent review, 19 Nov).**
  - It notifies when the level rises above the highest sent since the last all-clear: to amber, or amber to red.
  - A drop counts only after "ok" has held for 3 checks in a row (`WATCH_CLEAR_CHECKS`, 6 minutes). Then a red sends
    "back to normal" and an amber clears quietly. Lateness steps as trains leave, so 14/15/14/15 is one amber, and
    46/44/46 one red.
  - A feed that fails, or "unknown", sends nothing and resets nothing.
  - Each window starts afresh: the morning's red doesn't silence the afternoon.
- **What the notifications say:**
  - Morning red: "Commute: consider working from home". Morning amber: "Commute: delays this morning".
  - Afternoon red: "Commute: disruption on the way home … If you can, head home now". Afternoon amber: "Commute:
    delays on the way home".
  - Every one gives the reason ("About 20 min later than normal", "No trains running: 2 cancelled", or the notice
    itself) and the best train now ("the 17:15 from KGX, arriving 17:50").
- **The iPhone app only, off until turned on.**
  - Settings → Notifications → "Commute watch" (`commuteWatch`) is shown only in the iPhone app, never in display
    mode, and a browser never writes it.
  - Turning it on asks for notifications only (not the alarm or location), from Settings, never at start-up.
  - The proxy receives it as `prefs.watch` (only `true` turns it on); the shell's configuration doesn't carry it.
  - "Send a test to this iPhone" proves the proxy → Apple → phone path (`/native/test`, at most one a minute).
  - Alerts show as a banner even while the app is open.
- **Proxy cost:**
  - Inside a window it checks every 2 minutes, only when an iPhone has the watch on: 3 boards and 1 TfL line status
    per check. That is 300 checks on a watched weekday: 900 board requests and 300 TfL requests.
  - A record is written only when the watch level changes.
  - It runs after the followed-journey run in the same minute, and writes on top of a fresh read, so a plan the page
    or that run wrote meanwhile is kept.
  - **Known risk:** Cloudflare KV is eventually consistent (about a minute). A stale read just after a level change
    could resend that alert once. A page registration racing the write could drop the stored level and resend once.
- **Not yet:**
  - National Rail's incident feed (Knowledgebase Incidents). Sam is arranging the key: `RDM_KB_KEY` and `RDM_KB_BASE`
    in `your-setup-steps.md`. Until then, incidents come from the notices on the boards.
  - The always-on morning status card on the lock screen (a Live Activity started by the proxy). It needs Apple's
    push-to-start in the iPhone shell and a new TestFlight build: #66.
  - Web push for a browser.

## Tests
- tests/core/watch.test.mjs: "Watch windows: weekdays 05:00–10:00 to the office and 15:00–20:00 home; never at weekends or on a bank holiday"
- tests/core/watch.test.mjs: "Lateness is how much later you'd get there, not one train: a cancellation with the next train 10 min behind is OK"
- tests/core/watch.test.mjs: "Amber from 15 min later than normal; red beyond 45; red when nothing runs"
- tests/core/watch.test.mjs: "National Rail's notices: a blocking incident is red at once; a disruption notice explains amber but doesn't raise it"
- tests/core/watch.test.mjs: "The tube to the stations: all three lines closed is red; all three badly disrupted is amber; one line alone, or 'Service Closed' before opening, is nothing"
- tests/core/watch.test.mjs: "No board read at all is 'unknown', never 'ok'"
- tests/core/watch.test.mjs: "One notification per change: amber once, again on red; a drop counts only after 3 'ok' checks; 'back to normal' only after red; a new window starts again"
- tests/core/watch.test.mjs: "No flapping: lateness stepping 14/15/14/15 and 46/44/46/44 sends one amber and one red"
- tests/core/watch.test.mjs: "Trains stuck at 'Delayed' past their time aren't forgotten; a timetable train due already doesn't make 'normal' unreachable"
- tests/core/watch.test.mjs: "Boards read but no train listed is 'unknown', not 'ok'; 'unable to run' is red"
- tests/core/watch.test.mjs: "The same train on two boards is counted once"
- tests/core/watch.test.mjs: "Notices that aren't a blocking incident on your line now: planned works, other routes from the London terminals, facilities, cleared"
- tests/watch-proxy.test.mjs: "Commute watch: nothing fetched with nobody watching, outside the windows, or on an odd minute"
- tests/watch-proxy.test.mjs: "Commute watch: one APNs alert when it turns red, none while it stays red, 'back to normal' when it clears"
- tests/watch-proxy.test.mjs: "Settings' test notification: the iPhone's own registration, one a minute; prefs keep 'watch' only when true"
- tests/watch-proxy.test.mjs: "Commute watch: the alert is a visible APNs alert; East Coast notices from King's Cross don't go red; the record is written only on a change and keeps what the page wrote meanwhile"
- tests/watch-proxy.test.mjs: "Commute watch runs in London time on a UTC server in summer, and the cron runs it"
- tests/watch-settings.test.mjs: "Commute watch: in the iPhone app, off by default; turning it on asks for notifications only, and goes in what the proxy is sent"
- tests/watch-settings.test.mjs: "Commute watch: the test button sends through the proxy and says what happened"
- tests/watch-settings.test.mjs: "Commute watch: not in a browser, and not in display mode"
- tests/watch-settings.test.mjs: "Commute watch: hidden in display mode even inside the iPhone app; a failed test says so"
- tests/core/watch.test.mjs: "Re-review (19 Nov): a blocking phrase wins over other words; stretches count only when both ends are on your line"
- tests/core/watch.test.mjs: "Re-review (19 Nov): one train on two morning boards counts once; one stuck train, or a 'Delayed' blip at departure, is not amber"
- tests/core/watch.test.mjs: "Re-review (19 Nov): the tube part suspended on all three lines is amber, not red; 'ok' must hold 3 checks in a row"
- tests/watch-proxy.test.mjs: "The cron: the watch starts only after the followed-journey run has finished, and still runs if that run fails"
- tests/watch-proxy.test.mjs: "The proxy's corridor runs on beyond Letchworth: 'between Hitchin and Cambridge' is your line"
- tests/core/watch.test.mjs: "Final re-check (19 Nov): a station of yours outside a stretch counts; a follow-on day isn't another day; London-only and facility notices aren't red"
- tests/core/watch.test.mjs: "Last pass (19 Nov): East Coast notices that mention your stations as calling points or diversions aren't red"
- tests/core/watch.test.mjs: "Final re-check (19 Nov): of two copies of one morning train, the one that runs counts (cancelled at Farringdon, running to St Pancras)"

Independent review (19 Nov, of 4de82d6): 26 of 68 mutations survived, and it found false reds (the tube's
"Service Closed" every morning; planned, other-route, facility and cleared notices), missed reds (trains stuck at
"Delayed"; empty boards), flapping and a duplicate count. All are fixed above with tests. Survivors re-checked: London
time on a UTC server, the corridor passed by the proxy, the push type, the write over a fresh read, the cron calling
the watch, display mode in the app, and a failed test message. Equivalent or low: the 90-minute horizon (the earliest
times decide either way), `Math.max(0, …)`, the bridge's `!!`.

Re-review (19 Nov, of 044d28a): the earlier fixes held (42 of 62 mutations caught). It found that the "not now" filter
hid real incidents ("lines have now been blocked", "overrunning engineering … lines are blocked", "on Thursday" when
today is Thursday, "Lifts … also out of use", "emergency services have cleared the area"). It also found notices from
junction stations for other routes going red, one morning train on two boards counted twice (a false amber), and a
'Delayed' blip at departure counted as stuck. All are fixed above, with tests. Survivors now caught: tube part
suspended alone, one stuck train, arrival-only 'Delayed', 3 checks in a row, and the cron order and failure.

Final re-check (19 Nov, of b1dd52c): the second round's fixes held. It found four ways a real incident still came
out "ok": a local station named outside a stretch; a time phrase read as a stretch; "continue on Friday"; and "this
weekend" after an incident. It also found that a Thameslink cancelled at Farringdon but running to St Pancras was
counted as cancelled. All are fixed with tests, as are the low survivors it named: the overrun guard, a London-only
stretch, the facility filter, and the proxy's corridor beyond Letchworth.

Last pass (19 Nov, of 9771b40): those fixes worked, but naming a station anywhere outside a stretch brought back
false reds from East Coast notices ("will not call at Stevenage", "start from Stevenage", "tickets accepted from
Hitchin"). Now a station counts only as the incident's place in the same sentence as the blocking phrase. The
reviewer's seven notices are tests that must not be red, next to the ones that must be.

Status: Built 19 Nov. Real delivery needs the next TestFlight build (for the Settings switch, the foreground banner and the
test button) and the proxy deployed. Then Sam turns it on in Settings → Notifications and sends a test.
APNs from the Worker had not been proven against Apple before this; the test button is the first proof.
