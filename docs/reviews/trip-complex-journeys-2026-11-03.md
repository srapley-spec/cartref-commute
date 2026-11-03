# Trip: Sam's complex journeys against TfL and Google (3 Nov 2026, for Wed 4 Nov)

Sam's request (3 Nov, late): test "extremely robustly" with complex journeys, against the app as redesigned for #56,
TfL and Google. The six destinations, from the London office (One Braham, E1) and from Letchworth, out and back,
plus Arrive-by and evening (sleeper) variants: 32 journeys.

- **App**: branch `fix/trip-tube-final-leg-56` at 4fe75f5, live TfL through the real adapter, **Google-timed walks**
  (the production route-matrix port), walk / walk. Homes are public points (One Braham itself; Letchworth town
  centre), not Sam's address.
- **TfL**: TfL's planner door to door where it can place both ends (London), else from / to the nearest station's ID.
- **Google Maps**: Routes API transit, train / Tube / light rail requested, alternatives on. Google still returned
  buses in three routes; those are marked and are not rail answers.
- Keys: TfL from the environment; Google from the key Sam pasted in the session (used in memory, removed from every
  file). Scripts and results: the session's scratchpad (`j40/`).

## Headline

| Destination | From the London office | From Letchworth |
|---|---|---|
| **NE38 8SE, Washington** | **App refuses: outside the region.** TfL: 08:30 King's Cross → Newcastle 11:09 → Heworth 11:45 (nearest station, 6 km). Google: King's Cross → York → Chester-le-Street, then bus. | **Refused.** TfL: 08:30 → Hitchin → Stevenage 08:55 → Newcastle 11:35 → Heworth 11:45. |
| **Newcastle** (+ Arrive by 12:00) | **Refused.** TfL and Google agree: Aldgate East → King's Cross, **08:30 LNER → 11:09**; return 17:24 → King's Cross 20:11 → Aldgate 20:32. | **Refused.** TfL: 08:30 → Stevenage 08:55 → Newcastle 11:35 (or 11:27 via York); return 17:27 → Stevenage 20:05 → Letchworth 20:21. Google agrees. |
| **7 Cloudesley Rd, St Leonards** | App: Liverpool St → Stratford → HS1 → Ashford → **St Leonards Warrior Square 10:14 → 10:24**. TfL: identical trains (via Aldgate East → Mile End → Stratford). Google: via St Pancras HS1, same arrival 10:14. **Return**: app 17:23 → London Bridge 18:53 → walk → 19:23; TfL 19:23 (HS1) / 19:26; Google 19:21 (Monument → Aldgate East). ✓ | App: **08:20 → London Bridge → 10:49 → 10:59**; TfL and Google identical. Return: 17:20 → Ashford → St Pancras → King's Cross 19:18 → Letchworth 19:46 → 19:57; TfL and Google identical. ✓ |
| **Schooner Hotel, Alnmouth** | **Refused.** TfL and Google agree: 08:30 LNER → Newcastle 11:09 → Alnmouth 11:44; return 17:22 → Newcastle → King's Cross 21:02 → Aldgate 21:22 (or 18:30 direct → 22:01). | **Refused.** TfL: 08:30 → Stevenage 08:55 → York → Alnmouth 12:04; Google agrees. Return 17:22 / 18:30 → Stevenage → Letchworth 21:29 / 22:29. |
| **Fort William** (+ evening) | **Refused.** Day: TfL 12:33 → York → Edinburgh → Glasgow Queen St → **22:06**; Google 12:14 Lumo → Queen St → 22:06. **Sleeper**: Google shows the **direct 21:15 Euston → Fort William Caledonian Sleeper, arriving 10:00**; **TfL does not have it** (it offers only the 23:45 Euston → Glasgow Central sleeper, then Queen St → Fort William 12:12). Return: Google 19:50 Fort William → Crewe sleeper → Euston 07:27; TfL only the Glasgow Central → Watford/Euston sleeper after a 4-hour Glasgow wait. | **Refused.** Same shape: Letchworth → King's Cross → Euston. Google: 20:20 → Finsbury Park → Euston 21:15 sleeper → 10:00. TfL: the Glasgow sleeper only. |
| **202 Lower Rd, Great Bookham** (+ Arrive by 10:00) | App: Liverpool St → Bank → Waterloo **08:53 → Bookham 09:47 → 10:09**; TfL identical (10:11); Google same train via Wimbledon (10:08). Return: Bookham 18:04 → Waterloo → Bank → Liverpool St → **Aldgate 19:18 → 19:25**; TfL identical (19:28). Arrive by 10:00: app 08:03 → Effingham Jn → Bookham 09:00 → 09:22 "Latest"; Google's later option uses a bus. ✓ | App: 08:38 → King's Cross → Vauxhall → **Bookham 10:47 → 11:09**; TfL identical (11:11); Google's rail-only routes arrive 11:08 (its 10:32 route uses bus 478 from Leatherhead). Return and Arrive by: identical to TfL. ✓ |

**In the region (St Leonards, Great Bookham; 12 journeys): every app answer matches TfL on trains and alighting stop,
and matches Google's rail-only routes within walking minutes. No engine defect found.**

**Outside the region (20 journeys): the app refuses them.** This is the Trip region box (`TRIP_DEFAULTS.region`), not
a routing failure; TfL answers every one by station ID, so UK-wide Trip on TfL (Phase 2 in the 3 Nov decisions log) is
what unblocks them. The TfL and Google answers above are the acceptance targets for that work.

## Findings for the engine and the plan

1. **The sleeper: TfL's planner lacks the Highland Caledonian Sleeper portions** (Euston → Fort William 21:15, Fort
   William → Euston 19:50). It has the Lowland sleeper (Euston ⇄ Glasgow Central) and chains a day train to Fort
   William after it. Google has the direct Highland sleeper both ways. Sam expects to see the sleeper: **with TfL as the
   only route source, Trip would show a 13-hour sleeper-plus-connection and miss the 12½-hour direct one.** This is
   the strongest evidence yet for Google transit as a second route source for long-distance trips (Phase 3), or for
   National Rail's own planner.
2. **The origin side has no place search (the mirror of #56).** From the London office the app walks to a mainline
   station first (Liverpool Street, 15 min) because boarding is station-based by design; TfL and Google start at
   Aldgate East (6 min). It cost 3 min of leave time on every London-office journey and never changed the train, but
   for an office next to a Tube stop it is the same shape of gap as #56. Related: TfL's reply for Fenchurch Street →
   Bookham begins with a walk to Bank, so the parser refuses it ("matched a different place (Bank → Bookham)"); the
   journey itself is fine. Proposed: searches *from* the place's position when the first mile is on foot, with the
   same identity rules as the destination side. Needs Sam's direction (first-mile mode and allowances are his).
3. **Walking reach decides candidates, and 3 km is a hard edge.** Leatherhead (3.47 km from Lower Road) was never a
   candidate; Google reached it only by bus, so no harm here, but a station at 3.1 km with a fast service would be
   missed while one at 2.9 km with an hourly service is searched. Worth a "well-served just beyond reach" rule when
   the national list is in (frequency data exists only for the South East at present).
4. **Transients.** One TfL 503 (Fort William return, evening); handled as a failed pair. Nothing to change.
5. **The 20-journey pass-2 findings stand** (TfL's conservative interchange walks; the final walk starting at the
   station's list coordinate; leave-by margins): see `trip-20-journeys-2026-11-03.md`.

## What UK-wide Trip must get right (acceptance for Phase 2, from these runs)
- London office → Newcastle: 08:30 LNER from King's Cross, arriving 11:09; Arrive by 12:00 picks the same train.
- Letchworth → Newcastle: via Stevenage (08:30 → 08:55 LNER), not via King's Cross.
- Alnmouth: the Newcastle change (11:15 → 11:44) or the York → Alnmouth CrossCountry.
- Washington NE38 8SE: Heworth as nearest station with the "Nearest station to where you're going is 6 km away" flag,
  and no invented walk; drive / cycle at the far end offered.
- Fort William by day: → Glasgow Queen Street → 18:24 → 22:06; the Lowland sleeper listed; the Highland sleeper
  flagged as missing from TfL until a second source exists.
- Returns mirror the outbound answers above.
- Places TfL can't plan to by position (everything outside London) fall back to station-based planning without
  wasted searches (already the case: ≤ 3 refused searches, listed).
