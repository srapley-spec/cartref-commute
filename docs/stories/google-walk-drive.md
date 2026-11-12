# Google for the walk and the drive from where you are
Status: Done (unverified on the phone: needs a working Google route) · Since: 12 Nov 2026 · Issues: #57

## Story
As Sam on the way to Letchworth station, or away from my usual route, I want the walk and a cab's drive timed from the
real streets and traffic, so that "Very tight · run" and "Can't make it" rest on how far I really have to go.

## Where it came from
12 Nov, Sam: "this shows Google is only being used for the trip app. Surely it can give us more accurate information
for the commuter app?" Agreed scope (14:20, "Agree with all that"): walking and driving only, and only when it matters.
Train and tube times stay with National Rail and TfL, which are the sources. Until now the walk from where you are was
your measured walk scaled by the straight-line share left (or the straight line × 1.3 at your pace), and a cab was 10
minutes to get one plus the walking distance at 20 km/h. Tuesday's too-pessimistic "Can't make it" (11 Nov 07:16) is the
kind of case street distances help with.

## Acceptance criteria
- Asked only on the way out: heading to the office (Commute or Leisure from home), within 3 km of Letchworth station but
  over 150 m from it, not at your saved home, position good to 150 m, and with a Google route set up (Trip's key in this
  browser, or the proxy). Not with example trains or simulated feeds, and not heading home.
- At most once per 150 m moved or 3 minutes; a result is used for 5 minutes while you're within 150 m of where it was
  asked. Each time: the walk and the drive from here to the station; the walk from your saved home, once per saved home
  (asked again if Google failed it: one failure used to turn the street walk off for the session, review 12 Nov).
- Google doesn't hold up a refresh: the trains and their reports are fetched and drawn without waiting for it; its
  walk and drive are drawn when they arrive.
- The walk is Google's street distance timed at your own pace: with your home saved, your measured walk × (street
  distance from here ÷ street distance from home); without, the straight-line estimate × (street distance ÷ straight
  line × 1.3). As before, a walk longer than your usual one means you're not on the way out (no estimate).
- A cab's drive is Google's drive time with traffic, plus the 10 minutes to get one; your own car from home stays as set.
  Google failing changes nothing: the earlier estimates stand.
- Modes: Commute and Leisure (the walk out from home is the same in both). Trip times its own access with Google
  already. Homeward legs in London use TfL's journey planner, which plans real routes already.

## Tests
- tests/google-walk-drive.test.mjs: "The cab's drive is Google's drive time with traffic when known; your own car from home is unchanged"
- tests/google-walk-drive.test.mjs: "On your way out, Google's street distance timed at your pace sets the walk; the drive sets the cab; asked only when it matters"
- tests/google-walk-drive.test.mjs: "No Google route set up, example trains, or heading home: nothing is asked"
- tests/google-walk-drive.test.mjs: "Google is asked only within 3 km of the station and over 150 m from it, with a position good to 150 m, and never with simulated feeds"
- tests/google-walk-drive.test.mjs: "Without a saved home the walk is the straight-line estimate scaled to the streets, and a walk longer than your usual one is no estimate; the result is used for 5 minutes within 150 m"
- tests/google-walk-drive.test.mjs: "The walk from your saved home is asked again if Google failed the first time"
- tests/google-walk-drive.test.mjs: "Re-asked after 3 minutes in the same place, not before; a result is only used within 150 m of where it was asked; with a home saved, streets longer than from home is no estimate"
- Independent review (12 Nov): 16 deliberate breakages, 6 caught at first; the four tests above catch the rest. It
  found the failed-walk-from-home defect (fixed), that the drive needs Trip's departure-time fix under it (Google
  refuses a past departure for driving; merged before this ships), and that a slow Google reply held up the train
  reports (no longer awaited).

## Not yet / open questions
- Unverified against Google on the phone: the proxy's `GOOGLE_KEY` is still on the setup list, and the browser key path
  had its first live failure on 12 Nov (Trip, driving; fixed the same day, `leisure-journeys.md`).
- Requests are billed by Google past a free monthly allowance; at the rates above it is a handful per journey.
