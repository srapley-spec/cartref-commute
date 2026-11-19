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
  timetable gave for trains leaving from now, over the next 90 minutes. A cancellation with the next train 10 minutes
  behind is 10 minutes.
- **Amber:** at least 15 minutes later than normal (`WATCH_AMBER_MIN`).
- **Red:** any of these:
  - more than 45 minutes later than normal (`WATCH_RED_MIN`);
  - no train running (all cancelled, or none with a time);
  - Circle, Met and H&C all closed or suspended;
  - a National Rail notice on the boards of a blocking incident (lines blocked, overhead line, person hit by a train,
    emergency services, trespass, suspended), naming a station on the line between Letchworth and London (the
    profile's corridor). King's Cross also carries East Coast notices for further north.
- **Also amber:** all three tube lines badly disrupted (Severe Delays and worse). One line alone is nothing, and
  Minor Delays are nothing.
- **A notice that explains but doesn't block** (signalling fault, "disruption"), such as "Disruption expected until
  18:00", explains an amber or red but doesn't raise one.
- **One notification per change.**
  - It notifies when the watch turns amber or red, or amber turns red; it stays quiet while the level holds.
  - "Back to normal" is sent only after a red.
  - A feed that fails sends nothing and forgets nothing (the level is kept).
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
    per check, so about 600 board requests on a watched weekday.
  - A record is written only when the watch level changes.
  - It runs after the followed-journey run in the same minute, so the two never rewrite a record at once.
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
- tests/core/watch.test.mjs: "The tube to the stations: all three lines closed is red; all three badly disrupted is amber; one line alone is nothing"
- tests/core/watch.test.mjs: "No board read at all is 'unknown', never 'ok'"
- tests/core/watch.test.mjs: "One notification per change: amber once, quiet while amber, again on red, 'back to normal' only after red; a new window starts again"
- tests/watch-proxy.test.mjs: "Commute watch: nothing fetched with nobody watching, outside the windows, or on an odd minute"
- tests/watch-proxy.test.mjs: "Commute watch: one APNs alert when it turns red, none while it stays red, 'back to normal' when it clears"
- tests/watch-proxy.test.mjs: "Settings' test notification: the iPhone's own registration, one a minute; prefs keep 'watch' only when true"
- tests/watch-settings.test.mjs: "Commute watch: in the iPhone app, off by default; turning it on asks for notifications only, and reaches the proxy"
- tests/watch-settings.test.mjs: "Commute watch: the test button sends through the proxy and says what happened"
- tests/watch-settings.test.mjs: "Commute watch: not in a browser, and not in display mode"

Status: Built 19 Nov. Real delivery needs the next TestFlight build (for the Settings switch, the foreground banner and the
test button) and the proxy deployed. Then Sam turns it on in Settings → Notifications and sends a test.
APNs from the Worker had not been proven against Apple before this; the test button is the first proof.
