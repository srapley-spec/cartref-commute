# Trip: 20 journeys against TfL's own answer (3 Nov 2026, for Wed 4 Nov)

Sam asked for 20 journeys run through the app and compared with Google Maps and TfL (issue #56). What was run:

- **The app**: `planTrip` on branch `fix/trip-tube-final-leg-56` with the real TfL adapter and live TfL replies
  (245 TfL calls in all), walking at both ends. **No Google key exists in the cloud environment**, so the walks to and
  from stations used the test stand-in (straight line × 1.3 at 4.5 km/h) instead of Google's route. Every walking
  minute below is therefore an estimate; the trains, Tube legs and alighting stops are real.
- **TfL door-to-door**: TfL's journey planner from the home coordinates to the destination coordinates
  (`nationalSearch=true`, `leasttime`), which is what the TfL website shows. TfL cannot place coordinates outside its
  area (Brighton, Cambridge, Canterbury: HTTP 404), so those were re-run from the origin station's ID.
- **Google Maps: not compared.** There is no key and no API-free way to query it. Sam can spot-check the three
  journeys marked ★ below, or add a restricted Google key to the environment's secrets for a later session.

Homes are town-centre points, not Sam's address. Script and raw results: the session's scratchpad (`j20/`).

## Results

| # | Journey (walk / walk) | App's pick | TfL door-to-door | Agree? |
|---|---|---|---|---|
| 1 | Letchworth → One Braham E1, leave now 07:15 | 07:30 train → King's Cross → Met line → **Aldgate** 08:24 → arrive 08:32 | 07:38 train → **Aldgate East** → 08:34 | ★ App arrives 2 min sooner on an earlier train TfL omitted (TfL ranks by shortest duration, not earliest arrival). Both say Aldgate / Aldgate East, not Liverpool Street. |
| 2 | Same, **Arrive by 09:00** | **Before the fix below:** 07:50 → Farringdon → Elizabeth → Liverpool Street + 15 min walk, 08:59. **After:** 07:50 → Farringdon → H&C → **Aldgate East** 08:47 → 08:53 | 07:50 → Farringdon → Aldgate East → 08:53 | ✓ after the fix (see Discrepancy A) |
| 3 | Letchworth → Fitzrovia W1T | 07:30 → King's Cross → Victoria line → Warren Street → 08:24 | same trains, Warren Street → 08:28 | ✓ (walk estimate 6 min vs TfL 12) |
| 4 | Letchworth → Canary Wharf | 07:38 → King's Cross → Moorgate → Liverpool St → Elizabeth → Canary Wharf 08:36 → 08:42 | identical → 08:43 | ✓ |
| 5 | Letchworth → Parliament Square, **Arrive by 09:30** | 08:20 → Blackfriars → District → Westminster 09:23 → 09:27 | TfL's 3rd option is identical (→ 09:28); its first two leave earlier | ✓ (app picks the latest leave in time, as designed) |
| 6 | Letchworth → Granary Square N1C | 07:30 → King's Cross, walk → 08:12 | identical → 08:16 | ✓ |
| 7 | Brighton → Pimlico | 09:09 → Victoria → Victoria line → **Pimlico** → 10:27 | identical → 10:28 | ✓ |
| 8 | Brighton → Natural History Museum | 09:09 → Victoria → District → South Kensington → 10:33 | identical → 10:40 | ✓ (one of 14 searches hit a transient "couldn't reach TfL"; others covered it) |
| 9 | Cambridge → Old Street | 07:42 → King's Cross → Northern → Old Street → 08:58 | (my station ID for Cambridge was wrong; comparison void) | – |
| 10 | Reading → Queensway W2 | 07:35 → Paddington → Circle → Bayswater → 08:21 | 07:51 train (TfL's longer first walk), Bayswater → 08:39 | ✓ same alighting |
| 11 | St Albans → Islington Green | 08:03 → St Pancras → Northern → Angel → 08:52 | identical → 08:51 | ✓ |
| 12 | Hitchin → Bank | 07:55 → Finsbury Park → Moorgate → Northern → Bank → 08:49 | identical → 08:53 | ✓ |
| 13 | Oxford → Baker Street | 07:53 → Paddington → Bakerloo → Baker Street → 09:04 | identical → 09:08 | ✓ |
| 14 | Stevenage → Westfield Stratford | 08:20 → King's Cross, walk to St Pancras → HS1 → Stratford International 09:14 → 09:20 | 08:31 → Farringdon → Elizabeth → Stratford 09:20 → 09:29 | ★ Different, both valid; app's arrives 9 min sooner (TfL listed only the Farringdon route). Depends on the real walk from Stratford International. |
| 15 | Guildford → Tate Modern | 08:19 → Waterloo, walk 19 min → 09:15 | identical → 09:14 | ✓ |
| 16 | Canterbury → Tower of London | 08:23 → Stratford International, walk → Central → Mile End → District → Tower Hill → 09:50 | same shape from the next train (→ 10:32) | ✓ |
| 17 | Letchworth → Grand Arcade, Cambridge | 09:10 → Cambridge, walk 29 min → 10:10 | TfL can't plan to the place (404) | ✓ graceful: searches to the place refused and listed; station route found |
| 18 | Brighton → Canterbury Cathedral | 09:28 → St Pancras → Ashford → Canterbury West → 12:35 | 404 as above | ✓ graceful (see Discrepancy B) |
| 19 | Milton Keynes → UCL Gower St | 08:05 → Euston, walk → 08:59 | identical → 09:00 | ✓ |
| 20 | Watford → Boxpark Shoreditch | 08:32 → Euston → Northern → Old Street, walk 13 min → 09:21 | same train → TCR → Elizabeth → Whitechapel → Overground → Shoreditch High St → 09:26 | ★ Both valid; which wins depends on the real walk from Old Street (~1 km). The app lists the Shoreditch High Street journey too. |

Agreement on alighting stop and trains: 17 of 19 comparable journeys identical or the app's arrival earlier; 2 (#14, #20)
differ on route with the app's estimate earlier; none where TfL's answer beats the app's.

## Discrepancies and what was done

**A. Engine bug, fixed: the same train to different stops was collapsed into one journey.** Within one search key the
engine de-duplicated journeys by their trains' departure times, which is right for a station pair (the destination
is fixed) but wrong for searches to a place: "07:50 → Farringdon → Aldgate East" and "07:50 → Farringdon → Aldgate East
→ Tower Hill" (kept from the Fenchurch Street reply) share the trains. Whichever arrived first in the map survived,
and in journey 2 the Aldgate East version was lost, so Arrive by picked Liverpool Street + a 15-minute walk (08:59)
instead of Aldgate East (08:53). Fix: one journey per (trains, alighting stop). Regression test: "planTrip to a
place, Arrive by (#56 follow-up) …". Journey 1 had been right only by ordering luck.

**B. Wasted searches outside London, reduced.** For a place TfL can't plan to (Cambridge, Canterbury), every search to
it is refused; round 2 added more (4 for Brighton → Canterbury). Now round 2 sends none when all of round 1's were
refused (3 at most). The refusals stay listed in "Why these trains?".

**C. Walking times differ from TfL's by a few minutes in both directions.** The stand-in is not Google; in the app
Google times the real route. Not an engine matter. Worth a check once a Google key exists: TfL's walk from Warren
Street to Cleveland Street is 12 min against the stand-in's 6.

**D. TfL's door-to-door answer is not an upper bound.** TfL ranks by shortest duration and returns three options, so
it omitted the earlier-arriving 07:30 via Aldgate (journey 1) and the HS1 route (journey 14). This is the reason the
place search supplements the station-pair searches rather than replacing them.

**E. One transient failure.** One TfL call during journey 8 failed with a connection reset; the plan completed from
the other searches and the failure was listed. Nothing to change.

## Not verified
Google Maps (no key); real walking routes (no key); any journey on a day other than Wed 4 Nov.
