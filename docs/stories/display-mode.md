# Display mode: a read-only board for a wall screen or a Home Assistant frame
Status: Done (10 Nov 2026)

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
- **Live data in a frame:** a browser keeps a framed page's storage separate from the same site opened directly, so
  the frame starts with no keys and shows TfL timetable times ("Timetable times, not live") until it's set up. Set
  it up with a setup link carrying display mode: `…/cartref-commute/?display#setup=<your proxy address>`. In display
  mode the question is a panel on the page ("Use <proxy host> for all live data on this display?" · Yes, use it ·
  No), not a browser dialog, because browsers block dialogs from framed pages. Yes saves My proxy for that browser
  and reloads the data; No clears the link and changes nothing; an address that isn't a valid proxy address isn't
  offered; a display already using that proxy isn't asked again (so the link can stay in the frame's address).
- **The normal app is unchanged** without `?display`.

## Tests
- tests/display.test.mjs: "Display mode: Leave now from home to the office, whatever this browser last had on screen"
- tests/display.test.mjs: "Display mode: only the status line, the recommendation, the list and 'Updated' are shown; every control is hidden"
- tests/display.test.mjs: "Display mode: never asks for this device's location; the normal app still does"
- tests/display.test.mjs: "Display mode: nothing this browser has saved is changed"
- tests/display.test.mjs: "Display mode: a setup link asks on the page (a framed page can't show a browser dialog); Yes saves only the live-data source"
- tests/display.test.mjs: "Display mode: saying No to a setup link changes nothing; a look-alike address isn't offered; already set up isn't asked again"
- Checked in a real browser (Chromium, 420 px and 800 px wide, light and dark) with example trains: no control is
  visible; only "Journey steps" and "Full details" can be tapped.

## Not yet / open questions
- Not tried inside Home Assistant itself (Sam to add the card: [your-setup-steps.md](../your-setup-steps.md) §5).
  Unknowns there: whether the dashboard's frame keeps its storage between restarts of the HA app (if not, the setup
  question is asked again), and how the page looks at the card's size.
- An always-on screen refreshes every minute for as long as the dashboard is showing (the phone only does while the
  app is open). Not measured against the feeds' daily allowances or the Worker's free tier; if it matters, the fix is
  a slower refresh in display mode or only refreshing in the morning (a decision for Sam).
- Only this one board (home → office, Leave now). Going home, another person's commute, or a compact one-line
  layout for a small card would each need a decision.
- Until the Cloudflare Worker is deployed (setup steps §1–2) the frame can only show timetable times: keys typed into
  Settings on the phone can't reach a frame, and display mode has no Settings.
