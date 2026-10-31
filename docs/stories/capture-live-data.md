# Capture live data from the platform
Status: Done · Since: 30 Oct 2026 (evening)

## Story
As the person testing the app on real trips, when the app and the station board disagree, I want to capture what the
live feed is sending at that moment and share it, so that fixes and tests are built on real data, not guesses.

## Where it came from
30 Oct 18:24 at Aldgate: the board had a Met leaving in 2 min; the app's list had none. TfL's arrivals feed
(recorded 19:32) lists Met trains at Aldgate only as arriving, never departing. TrackerNet, TfL's per-platform feed
(probably what the boards use), needs a key, which lives only on the phone. Every Aldgate test feed until then was
invented in the shape the code expected, which is why the gap was never caught.

## Acceptance criteria
- Settings → Capture live data → "Capture Aldgate now": fetches TfL's Aldgate arrivals and TrackerNet
  PredictionDetailed for the Met (M) and Circle/H&C (H) at Aldgate, and Liverpool Street's arrivals (where the Met
  departures from Aldgate come from, 31 Oct), with your TfL key if set: four requests, only when tapped, never on a timer.
- Shows each URL, HTTP status and body (up to 30,000 characters each); a failed request says so and the others still run.
- The key is sent but removed from everything shown or shared.
- "Share capture" uses the phone's share sheet, else copies to the clipboard.

## Tests
- tests/app.test.mjs: "Capture Aldgate (Settings): three TfL requests only when tapped, bodies shown, the key never shown"

## Not yet / open questions
- Whether TrackerNet has Met departures from Aldgate: unknown until Sam captures one on the platform. If it does, it
  replaces the arrivals feed for Aldgate going home; if not, TfL's Met timetable is the fallback.
- Only Aldgate. A capture for any station (King's Cross, Farringdon) when the next mismatch happens there.
