# Display mode: a read-only board for a wall screen or a Home Assistant frame
Status: Done (10 Nov 2026); the hall's next-train card (`?display=next`) built 18 Nov 2026; the hall's fastest way to London (`?display=hall`) built 20 Nov 2026

## Story
As someone at home about to leave for work, I want the next journeys from Letchworth on a screen in the house (a
frame in the Home Assistant dashboard), with no controls to set and nothing to tap, so that I can see when to leave
at a glance without opening the app on my phone.

## Where it came from
10 Nov, Sam, after the morning's trip debrief (#57): "Add a display mode to the app. I want this to hide all the
toggles and just show the next journeys in the Leave now mode from Letchworth. This is going to be used as a frame
for the Home App that will live in HA."

## Acceptance criteria
- **How it's turned on:** `?display` in the address
  (`https://srapley-spec.github.io/cartref-commute/?display`). There is no switch in Settings: a frame can only be
  given an address.
- **What it shows:** the status line, travel alerts for your route, the recommendation ("If you leave now": best and
  next best, each with Leave by, the train panel and its steps), "Next trains, in leaving order" and when it was last
  updated. It is the app's own Leave now view from home to the office in Commute, drawn by the same code: same
  ranking, effort and arrival-first rules, same refresh (every minute; countdowns every second).
- **What it hides:** every control and entry point: the title, mode, Along the line, Auto/Plan/Live, Journey
  options (direction, pace), the location line, Leave now / Arrive by / Leave around, Follow buttons and the followed
  route, Other recommendations, Why these trains, Lines & data, Trip, Settings, Simulator, Refresh and the build
  label. "Journey steps" and a notice's "Full details" stay: they unfold information and change nothing.
- **Always the same question:** Commute, To office, Leave now, from home, whatever this browser last had on screen.
  Your walking pace (Average or Fast) is kept, because it sets the leave times.
- **No location:** display mode never asks for the device's location (a framed page usually can't, and a wall screen
  is at home). The journey starts at home with your measured walk.
- **Never Follow, Along the line or the simulator**, whatever Settings say.
- **Changes nothing you've saved:** it starts from the defaults rather than this browser's saved journey state, and
  writes nothing back, so opening the display address on your phone doesn't disturb the app there. The one
  exception is the live-data source from a setup link (below), which is saved for that browser.
- **Live data in a frame:** since 17 Nov the app's proxy is built in, so a frame shows live times with nothing set up
  (`?display` alone). The setup link below still works, to point a display at a different proxy. Before 17 Nov a
  browser kept a framed page's storage separate from the same site opened directly, so the frame started with no keys
  and showed TfL timetable times until it was set up with a setup link carrying display mode: `…/cartref-commute/?display#setup=<your proxy address>`. In display
  mode the question is a panel on the page ("Use <proxy host> for all live data on this display?" · Yes, use it ·
  No), not a browser dialog, because browsers block dialogs from framed pages. Yes saves My proxy for that browser
  and reloads the data; No clears the link and changes nothing; an address that isn't a valid proxy address isn't
  offered; a display already using that proxy isn't asked again (so the link can stay in the frame's address).
- **Refresh and the feeds' allowances (Sam, 10 Nov: "Ideally [every minute, all day]. But make sure we don't
  consume all our API calls / use of Cloudflare"):** the display refreshes every minute for as long as it is on
  screen, the same as the app. Measured over a simulated hour with My proxy (10 Nov, morning and overnight with no
  trains: the same): 3 train boards a minute, Tube status every 2 minutes, National Rail status every 5 — 222 requests
  an hour, about 5,300 a day for a screen that is on 24 hours. Against the allowances:
  - Cloudflare Workers free plan: 100,000 requests a day → about 5% of it. (Each visit to the Worker is one request;
    the phone's own use comes on top and is small by comparison.)
  - TfL with a key: 500 requests a minute → under 1 a minute.
  - Rail Data Marketplace boards: about 4,400 a day. **Not verified:** no published limit was found (a third-party
    guide says "no usage limit", another "fair usage"); the figure for Sam's subscription is on the product's
    Specification tab (setup steps §5).
  - Without a proxy (timetable times): about 1,600 TfL requests a day.
  The budget is held by a test: at most 4 requests a minute on average and never more than 3 boards a minute. A
  change that raises it fails the test and is a decision for Sam.
- **The normal app is unchanged** without `?display`.

## The hall's next train (`?display=next`, 18 Nov 2026)
For the hall iPhone's native app (Cartref Hall, in `srapley-spec/Ring---HA-Integration`, `docs/hall/`). Sam, 18 Nov,
chose option A: the hall app shows a Commute page rather than Commute's planning moving into the proxy. The app shows
it on its side (landscape) and in the portrait screen saver; the screen is always on, so it is built for an OLED panel.
- **Turned on by** `?display=next`. Every display-mode rule above applies (Commute, To office, Leave now, from home,
  no location, never Follow, saves nothing, same refresh and request budget).
- **One card, nothing else:** Leave by, "in N min" (or "Leave now"), the train (core `trainName`), its platform and
  status (core `trainStatus`: "On time", "7 min late", "Cancelled"…), At office, and "as of" the last update. It is
  the full display's top recommendation from the same ranked list, so the two can't disagree.
- **Kind to an always-on screen:** true black background, dim grey text, no seconds. Minutes are counted on the clock
  ("Leave by 06:34" at 06:30 says "in 4 min"), so the text changes at most once a minute; the page doesn't redraw
  the card when nothing changed. The card moves to one of nine spots (within 40 px of the middle) each minute.
- **Stale data says so:** older than 3 minutes (core `SNAPSHOT_STALE_MS`), the card greys and adds "not up to date".
  No data yet: "No train data yet" (or "Loading live trains…"); nothing catchable: "No catchable trains in the next
  two hours".
- **Plain `?display` and the normal app are unchanged.**

## The hall's fastest way to London (`?display=hall`, 20 Nov 2026)
For the hall iPhone on its stand (landscape), beside the wall screen's own clock and alarm button (Cartref Hall,
`srapley-spec/Ring---HA-Integration`, `docs/hall/CONTRACT.md` §4). Sam, 20 Nov 2026, choosing design D on the canvas
"Hall landscape options": "Instead of next train to the office as that's very specific to me … why not say the next
fastest route to London. It should also show if there is a good service or if there are issues on the train or
tubes." His choices the same day: "First arrival at any London terminal"; "Every tube line, summarised".
- **Turned on by** `?display=hall`. Every display-mode rule applies (no controls, no location, never Follow, saves
  nothing, same refresh and request budget), except the question: **Leisure, To London, Leave now, from home**, the
  same planning as the Leisure display. London means the first London terminal on the way: King's Cross (Great
  Northern) or St Pancras (Thameslink); Farringdon always comes after St Pancras on the same train. Leisure's
  walking pace applies.
- **The card:** "Fastest to London", Leave by, "in N min" (or "Leave now"), the train, its platform and status,
  "In London HH:MM at King's Cross" (or St Pancras), and "as of" the last update. It is the Leisure display's top
  recommendation from the same ranked list.
- **The status row:** "Trains: good service" (Thameslink and Great Northern) and "Tube: good service" (every tube
  line), or each line with a problem by name ("Great Northern: Severe Delays"), at most two per group, then
  "+N more". A problem carries a mark as well as a colour. **Never "good" while unknown** (tightened after the
  independent review, 20 Nov): no answer yet says "checking…"; a failed or empty answer says "unavailable"; an answer
  more than 15 minutes old (3× the slowest status refresh, rail's 5 minutes) says "not up to date"; a line with no
  status, Thameslink or Great Northern missing from the answer, or fewer than the 11 tube lines, says "not every
  line known" (any named problems still show, then "others unknown"). A line closed overnight that also has a delay
  is named for the delay. Line names are escaped.
- **The tube overnight:** TfL's "Service Closed" (severity 20) is routine, not a problem: no line is named for it.
  All closed says "Tube: closed for the night"; some closed with the rest good says "Tube: good service · N closed".
  Other closures and suspensions are still problems. (Sam confirmed, 21 Nov 2026: at any hour.)
- **Every tube line in one request:** the hall board asks TfL for the whole tube mode instead of three lines, in the
  same single status request, so the request budget is unchanged (held by a test).
- **Kind to an always-on screen:** text changes at most once a minute; the whole board drifts up to 3 px each minute
  (a big static picture would mark an OLED panel) by moving the board, not by rewriting its text, and unchanged text
  isn't redrawn; stale data (over 3 minutes) is greyed and says "not up to date"; 2 minutes old is fresh. The board
  isn't a live region: a screen reader isn't made to re-read it each minute.
- **Not yet tested:** the choice between King's Cross and St Pancras when the two boards differ (the fixture gives both
  the same Thameslink trains; the ranking is the shared Leisure code, and the pick is checked against Leisure's own).
- **Decided (Sam, 21 Nov 2026):** "Service Closed" is routine at any hour, so a line closed all day (Waterloo & City
  on a Sunday) is counted ("· 1 closed"), not warned.
- **Plain `?display`, `?display=next` and the normal app are unchanged.**

## Tests
- tests/display.test.mjs: "Display mode: Leave now from home to the office, whatever this browser last had on screen"
- tests/display.test.mjs: "Display mode: only the status line, the recommendation, the list and 'Updated' are shown; every control is hidden"
- tests/display.test.mjs: "Display mode: never asks for this device's location; the normal app still does"
- tests/display.test.mjs: "Display mode: nothing this browser has saved is changed"
- tests/display.test.mjs: "Display mode: a setup link asks on the page (a framed page can't show a browser dialog); Yes saves only the live-data source"
- tests/display.test.mjs: "Display mode: saying No to a setup link changes nothing; a look-alike address isn't offered; already set up isn't asked again"
- tests/display.test.mjs: "Display mode: an always-on screen stays inside its request budget: three boards a minute and under four requests a minute through the proxy"
- tests/display.test.mjs: "Display next: one card with the full display's top recommendation — Leave by, train, platform, status and arrival"
- tests/display.test.mjs: "Display next: whole minutes only, so the card's text changes at most once a minute, and it moves each minute"
- tests/display.test.mjs: "Display next: data more than 3 minutes old is greyed and says so; no data says so"
- tests/display.test.mjs: "Display next: plain ?display and the normal app are unchanged"
- tests/display.test.mjs: "Display hall: the fastest way to London from home, the same pick as the Leisure display, arriving at a London terminal"
- tests/display.test.mjs: "Display hall: the status row says good service only when every line is known to be good, and names each problem"
- tests/display.test.mjs: "Display hall: an old answer, a line with no status or a missing rail line is unknown, never good service"
- tests/display.test.mjs: "Display hall: the tube closed overnight is routine, not a problem"
- tests/display.test.mjs: "Display hall: the hall actually fetches every tube line, and the row shows the answer"
- tests/display.test.mjs: "Display hall: when the status feeds fail, an old good service turns into 'not up to date', and recovers"
- tests/display.test.mjs: "Display hall: the board's times are the pick's, in whole minutes against the clock"
- tests/display.test.mjs: "Display hall: every tube line's status in the same single request; the other displays keep their three lines"
- tests/display.test.mjs: "Display hall: an always-on screen stays inside its request budget, like the other displays"
- tests/display.test.mjs: "Display hall: whole minutes only, a few pixels' drift each minute, stale data greyed and said"
- tests/display.test.mjs: "Display hall: ?display, ?display=next and the normal app are unchanged"
- Checked in a real browser (Chromium, 420 px and 800 px wide, light and dark) with example trains: no control is
  visible; only "Journey steps" and "Full details" can be tapped.

## Not yet / open questions
- Not tried inside Home Assistant itself (Sam to add the card: [your-setup-steps.md](../your-setup-steps.md) §5).
  Unknowns there: whether the dashboard's frame keeps its storage between restarts of the HA app (if not, the setup
  question is asked again), and how the page looks at the card's size.
- The Rail Data Marketplace allowance for Sam's subscription isn't confirmed (above). If it turns out to be tight,
  the options are a slower refresh in display mode outside the morning, or a longer cache for boards in the Worker.
- Only this one board (home → office, Leave now). Going home, another person's commute, or a compact one-line
  layout for a small card would each need a decision.
- Until the Cloudflare Worker is deployed (setup steps §1–2) the frame can only show timetable times: keys typed into
  Settings on the phone can't reach a frame, and display mode has no Settings.
