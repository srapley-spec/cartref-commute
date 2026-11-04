# Trip: a taxi when the station isn't walkable, and what Google Maps finds that TfL misses

Status: built 4 Nov 2026 (branch `feat/trip-taxi-and-google-gaps`); merging after independent review.

## Story
As Sam, when the nearest station is a couple of miles or more from where I am or where I'm going, I want Trip to say
"taxi: 5.6 km, about 12 minutes" and plan around that, not show me a 94-minute walk. And when Google Maps knows a
rail route that TfL's planner doesn't (the direct Highland sleeper to Fort William), I want to see it, with its times,
so I'm not misled by the best of an incomplete set. No map needed: the distance and the driving time are enough.

## Where it came from
4 Nov 2026, early, after the UK-wide live run (`docs/reviews/trip-uk-wide-live-2026-11-03.md`). Sam: "We should be
using Google to identify these gaps and show them. If the distance to or from the station is not walkable — over a
couple of miles — why don't you recommend getting a taxi? You just need to say the distance and driving time. But you
don't need to plot it on a map like Google Maps."

Evidence from that run: Washington NE38 8SE is 5.6 km from Chester-le-Street, so on foot the app showed an honest
94-minute walk; Google used a bus. London → Fort William in the evening: TfL's planner has only the Euston → Glasgow
sleeper (arriving Fort William 12:12 via Queen Street); Google Maps has the direct 21:15 Caledonian Sleeper arriving
10:00. The app, planning from TfL alone, could not show it.

## Acceptance criteria

### A taxi leg
- A walk to or from a station that is **over 3.2 km (2 miles) by Google's walking distance** is offered as a taxi
  instead: the leg's time is **Google's driving time for that leg plus 5 minutes to get a taxi** (`taxi.waitMin`;
  Settings range later if wanted). The walk is not hidden: the step says "Taxi to your destination · 7.9 km · about
  12 min by road, 5 min to get one · 1h 38m on foot", and a flag says "Taxi from Chester-le-Street: 7.9 km, about
  12 min by road". No map; no fare.
- Each minute counts once: the journey's leave or arrive time is the train plus the station allowance plus the taxi
  leg (wait + road), as for any other access leg. "Leave by" and the countdown follow from it as usual.
- Driving times are asked from Google once per end, only for the stations whose walk is over the limit (one extra
  route-matrix request at that end); traffic-aware for the set-off or arrival time like a drive to the station.
- Only a **walk** becomes a taxi. Cycling or driving to the station stays as chosen. If Google can't time the drive,
  the walk stands and "Why these trains?" says why ("Taxi times from the stations: …").
- The access pill reads "Taxi to station" when the first leg is a taxi.

### Which stations when none is within reach
- When no station is within walking reach (3 km), the **three nearest** are tried, not one (Washington: Chester-le-
  Street 5.6 km, Heworth, Sunderland), each flagged "Nearest station … is N km away" with the nearest's distance;
  the best door-to-door journey wins as usual. With a taxi, a farther station with a faster train can be the answer.

### What Google Maps also finds
- Once per plan, Google Maps' own door-to-door transit route (train / Tube / tram only, alternatives on) is asked
  for, through the same Google adapter (Maps JS: DirectionsService; proxy: Routes API computeRoutes, which the Worker
  now forwards). One request per plan; not retried.
- A Google route is a **gap** when it has no bus leg and its last ride **reaches the last station 5 minutes or more**
  before the best journey found here reaches its last stop (compared at the station, not the door: the two sources
  estimate walks differently, and the same train with a shorter walk is not a different route), or when nothing here
  could be recommended. At most two are shown, soonest first, the same trains once, as text: "Leave 20:36, arrive
  10:03: Aldgate East 20:41 → Euston Square 20:57 (Hammersmith & City) · Euston 21:15 → Fort William 10:00 (Caledonian
  Sleeper)", with "reaches Fort William 2h 12m sooner than the best found here; not in TfL's planner, so no live times
  or Follow for it", under the heading "Google Maps also finds", with Google's attribution.
- A gap is advice, not a journey: it has no station identity for live boards or Follow, so it is never picked, never
  followed, never mixed into the list. It belongs to the complete answer, not the first.
- When Google agrees with the app (London → Newcastle: the same 08:30 LNER, reaching Newcastle 11:09 in both; Google's
  shorter walks made it "5 min sooner" at the door in the first live run, which is why the comparison is at the
  station), nothing is shown. Without a Google route (no key, or the request failed) nothing is shown and "Why these
  trains?" says why.
- For Arrive by, a Google route arriving after the time asked is not a gap.

## Not in this story
- Following or getting live times for a Google route (would need station identities: the second-route-source work).
- A fare, or a taxi firm; a map.
- Taxi to a station when cycling or driving was chosen; a taxi in the middle of a journey.

## Tests
Recorded Google Routes API replies (4 Nov, keys removed): `tests/fixtures/trip/google-{london,letchworth}-fortwilliam-evening.json`,
`google-london-newcastle.json`, `google-letchworth-washington.json`, `google-letchworth-onebraham.json`.
- tests/core/trip-taxi-gaps.test.mjs: "Config: a walk over 3.2 km becomes a taxi with 5 min to get one; 3 fallback stations; a 5-minute gap"
- tests/core/trip-taxi-gaps.test.mjs: "Washington NE38 8SE on foot: Chester-le-Street, Heworth-side stations tried as the three nearest; the 5.6 km from the station is a taxi (Google's driving time + 5 min), the walk said"
- tests/core/trip-taxi-gaps.test.mjs: "Taxi at the start too, and cycling never becomes a taxi; a drive matrix that fails leaves the walk and says so"
- tests/core/trip-taxi-gaps.test.mjs: "Gaps: Google Maps' direct Highland sleeper (Euston 21:15 → Fort William 10:00) is shown against TfL's Glasgow sleeper, 2 h sooner; buses never count; the same trains once"
- tests/core/trip-taxi-gaps.test.mjs: "Gaps: nothing shown when Google agrees (London → Newcastle: the same 08:30 LNER); nothing without a routes port; a failing routes port is a note, not a failure"
- tests/core/trip-taxi-gaps.test.mjs: "googleGaps: the same train with a shorter walk is not a gap (compared at the last station); by Arrive by, a route arriving after T is not a gap; with nothing pickable any rail-only route is; at most two, soonest first"
- tests/core/trip-taxi-gaps.test.mjs: "Adapters: the Routes API reply and the Maps JS DirectionsService reply both become the same GapRoute shape"
- tests/core/trip-taxi-gaps.test.mjs: "Proxy adapter: transit asks the Worker's computeRoutes path with the time, the question and rail-only modes, and maps the reply"
- tests/core/trip-uk.test.mjs: "Washington NE38 8SE: no station within walking reach, so the three nearest are tried, Chester-le-Street (5.6 km) first and flagged; the last leg is a taxi with the walk said"
- tests/trip-page.test.mjs: "Trip taxi and gaps: Letchworth → Washington shows a taxi from Chester-le-Street with distance and road time; London → Fort William in the evening shows Google Maps' direct sleeper as a gap"
The Maps JS DirectionsService path is built from Google's documentation and stubbed in the page test; it is
unverified in a real browser until a key is used there (the proxy / REST path is tested against recorded replies).
Live run after the build: `tools/trip-compare.mjs` now prints taxi legs and gaps; see `docs/reviews/`.
