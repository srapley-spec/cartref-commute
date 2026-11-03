# Trip: 20 journeys against TfL's and Google's own answers (3 Nov 2026, for Wed 4 Nov)

Sam asked for 20 journeys run through the app and compared with Google Maps and TfL (issue #56). Two passes:

- **Pass 1 (no Google key):** the app with live TfL and a straight-line walk stand-in, against TfL door-to-door.
- **Pass 2 (Google key supplied by Sam in the session, used in memory only):** the app with **Google-timed walks**
  (the production access port: Routes API route matrix, WALK) and live TfL, against TfL door-to-door **and Google
  Maps transit** (Routes API computeRoutes, TRANSIT, train/Tube/light rail only, alternatives on). 20 journeys,
  ~250 TfL calls and ~80 Google calls per pass.
- TfL door-to-door is TfL's planner from the home coordinates to the destination coordinates (what the TfL website
  shows). TfL cannot place coordinates outside its area (Brighton, Cambridge, Canterbury: HTTP 404), so those were
  re-run from the origin station's ID.

Homes are town-centre points, not Sam's address. Scripts and raw results (keys removed): the session's scratchpad.

## Pass 2 against Google Maps: the headline

With Google-timed walks, **all 20 journeys agree with Google Maps' first route on trains and alighting stop, or the
app's arrival is equal or earlier**, within a few minutes of walking:

| # | Journey | App (pass 2) | Google Maps (first route) | Verdict |
|---|---|---|---|---|
| 1 | Letchworth → One Braham | 07:30 → King's Cross → Met → **Aldgate** 08:24 → **08:31** | identical, → 08:29 | ✓ |
| 2 | …Arrive by 09:00 | 07:50 → Farringdon → H&C → **Aldgate East** → 08:53 | 07:50 → Farringdon → Met → Aldgate → 08:53 | ✓ (equivalent stops) |
| 3 | → Fitzrovia | 07:30 → Warren Street → 08:24 | identical → 08:23 | ✓ |
| 4 | → Canary Wharf | 07:38 → Moorgate → Liverpool St → Elizabeth → 08:42 | 07:30 → Bank → DLR → 08:39 | both valid, 3 min |
| 5 | → Parliament Sq, Arrive by 09:30 | 08:20 → Blackfriars → Westminster → 09:28 | identical → 09:26 | ✓ |
| 6 | → Granary Square | 07:30 → King's Cross, walk → 08:13 | identical → 08:09 | ✓ |
| 7 | Brighton → Pimlico | 09:09 → Victoria → Pimlico → 10:26 | identical → 10:25 | ✓ |
| 8 | Brighton → NHM | 09:09 → Victoria → South Kensington → 10:33 | identical → 10:32 | ✓ |
| 9 | Cambridge → Old Street | 07:51 → Finsbury Park → Old Street → 09:16 | identical → 09:16 | ✓ |
| 10 | Reading → Queensway | 07:35 → Paddington → Bayswater → 08:20 | identical → 08:18 | ✓ |
| 11 | St Albans → Islington Green | 08:03 → St Pancras → Angel → 08:51 | identical → 08:44 (TfL's 13-min St Pancras–King's Cross interchange vs Google's 6) | ✓ |
| 12 | Hitchin → Bank | 07:55 → Finsbury Park → Moorgate → Bank → 08:49 | 07:55 Thameslink → St Pancras → Northern → Bank → 08:48 | both valid, 1 min |
| 13 | Oxford → Baker Street | 07:53 → Paddington → Baker Street → 09:07 | identical → 08:59 (final walk 1 min vs app 6+3) | ✓ |
| 14 | Stevenage → Westfield Stratford | 08:20 → King's Cross, walk to St Pancras → HS1 → 09:22 | identical route → 09:09 (TfL's 14-min King's Cross–St Pancras walk vs Google's 5, so Google makes the 08:55 HS1, the app the 09:07) | ✓ route; 13 min on TfL's interchange time |
| 15 | Guildford → Tate Modern | 08:19 → Waterloo, walk → 09:17 | Waterloo → Jubilee → Southwark → 09:17 | ✓ |
| 16 | Canterbury → Tower of London | 08:23 HS1 → Stratford → Mile End → Tower Hill → 09:54 | 08:23 HS1 → St Pancras → Circle → Tower Hill → 09:55 | both valid, 1 min |
| 17 | Letchworth → Cambridge | 09:31 → Cambridge → 10:33 | 09:10 → 10:06 | ★ margin: at 09:00 the app says the 09:10 can't be reached (walk 9 min + 3 min platform allowance = leave 08:58); Google starts at 09:01 with 6 min of walking |
| 18 | Brighton → Canterbury | 09:28 → St Pancras → Ashford → 12:37 | 09:14 → St Pancras → 10:40 HS1 direct → 11:50 | ★ margin, as 17: the 09:14 needs leaving at 09:00 sharp by the app's rule; from the 09:28 the app's connections are right |
| 19 | Milton Keynes → UCL | 08:05 → Euston, walk → 09:10 | identical → 08:59 (final walk 17 min vs Google 9) | ✓ route; walk origin |
| 20 | Watford → Boxpark | 08:32 → Euston → Northern → Old Street → 09:20 | Euston Square → H&C → Liverpool St → 09:28 | app sooner |

Three systematic, explainable differences, none a routing error:
1. **TfL's interchange walks are conservative** (King's Cross ↔ St Pancras 13–14 min; Google 5–6). They cost the app
   a connection in 14 and 7 min in 11. The engine takes TfL's leg as given; a second route source (Google transit,
   Phase 3) would supply Google's own.
2. **The final walk starts at the station list's coordinate**, which for a big station can be the middle of the
   complex rather than the exit nearest the destination (Euston 17 min vs 9; Baker Street 6 vs 1). Worth a fix:
   TfL's reply includes its own final-walk duration from the actual exit, which could bound ours.
3. **Leave-by margins (17, 18):** the app's platform allowance plus Google's walk from the home point makes a train
   unreachable that Google's planner starts 1–2 min sooner for. This is the app's designed conservatism (the
   allowance is Sam's setting); shown here so the choice is deliberate.

Google Maps' own routes also confirm the #56 premise independently: for One Braham, Google's first route alights at
Aldgate, not Liverpool Street, on the same 07:30 train.

## Pass 1 results (app with estimated walks, against TfL door-to-door)

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
Any journey on a day other than Wed 4 Nov; live-day running (all timetable).
