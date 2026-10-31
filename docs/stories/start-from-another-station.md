# Start from the nearest station (not at home)
Status: Removed (Sam, 31 Oct 2026, after the demo) · Built and live 31 Oct 2026 (e329c37) · Removed in the commit
that changed this file

## Story
As Sam, when I'm somewhere other than home (31 Oct: demoing the app in Hitchin, then Fairfield), I wanted to tap once
and have the app find the nearest station on my line, give a rough walk there from where I am, and otherwise behave
like the normal commute.

## What it was
A header line, "Not at home? Start from the nearest station", that picked the nearest of Letchworth, Hitchin and
Arlesey within 10 km, saved `startFrom: { code, day }` for that day and reloaded the page with a profile derived for
that station (`src/core/startStation.ts`, removed). The walk was the straight line × 1.3 from where you were.

## Why it was removed
Sam, 31 Oct, after the demo: "Remove the demo". It was built for one day. The general need (any start and end point
in the UK) is a bigger piece of work: see "Kept" and "What was learned".

## Kept (groundwork for any start and end point)
- The page takes the local station from the profile (`HOME = PROFILE.home`, `HOME_NAME`), never the literal `LET`
  or "Letchworth" (board keys, demo boards, labels, the Live board's station name). Behaviour for Letchworth is
  unchanged.
- `samRoutes` takes `start: { code, name }` (default Letchworth) for board keys, names and labels.

## Tests
- tests/core/plan.test.mjs: "samRoutes: the local station comes from `start` (default Letchworth); no station is written into the routes"
- The feature's own tests (tests/start-station.test.mjs, 23) and its recorded Hitchin and Arlesey boards were
  removed with it; they are in git history (e329c37) if it comes back.

## What was learned (for a future "anywhere in the UK")
- Live boards 31 Oct (Saturday): Hitchin → King's Cross 49 min (stopping), St Pancras 33–34, Farringdon 38–39;
  Arlesey → St Pancras 39, Farringdon 44, Thameslink every 30 min, no direct King's Cross train in the 2 hours shown.
  The shared stopping thresholds (45/45/52) classified these correctly; Stevenage stoppers may fall under 45.
- A station off the profile's line (Arlesey) joins it where it's nearest (Arlesey → Hitchin → London).
- "Nearest" by distance isn't "best": Fairfield is about as far from Arlesey as from Letchworth, and Letchworth
  has more trains. Offering the others with their walk times worked.
- Independent review (43 + 25 mutations) found "Arrive home" shown for an arrival at the other station: every
  "home" label needs the trip's real end. Trip-back labels, Nearly home and the Live board all assume home.
- TfL's journey planner does not plan beyond London and the South East (Letchworth → Durham: no journey), and TfL
  echoes the app key in error responses: strip it from anything saved.
- A saved `startFrom` value from 31 Oct may remain on the phone; nothing reads it, and it only ever applied on the
  day it was saved.
