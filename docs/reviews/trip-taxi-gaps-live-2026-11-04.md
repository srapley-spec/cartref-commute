# Trip: the taxi leg and Google's gaps, live (4 Nov 2026, early; for Wed 4 Nov)

Build under test: branch `feat/trip-taxi-and-google-gaps` at 5ac9ab4, then the gap rule tightened (below).
`tools/trip-compare.mjs` on the 19 journeys from the 3 Nov set that involve Washington, Newcastle, Alnmouth, Fort
William and One Braham: the app with Google-timed walks, Google-timed taxi legs and Google's transit route for gaps,
live TfL (208 TfL calls, 108 Google calls), against TfL's own answer and Google Maps.

## Taxi legs

| Journey | App's last / first leg | Door-to-door | Compared with |
|---|---|---|---|
| London office → Washington NE38 8SE | Aldgate → 08:30 LNER → York → Chester-le-Street 11:12, **taxi 9.4 km · about 16 min by road, 5 min to get one · 1h 34m on foot** | arrive **11:36** | Google: same trains, then bus 8 → 12:14; TfL: Heworth 11:45 |
| Washington → London office 17:00 | **taxi to Chester-le-Street** (same figures) → 18:10 → York → King's Cross 21:02 → Aldgate | 17:46 → 21:29 | Google: bus → 18:10 → 21:27 |
| Letchworth → Washington | 08:45 → Stevenage → Doncaster → Newcastle → Chester-le-Street 12:10, taxi 9.4 km · 15 min | 08:33 → **12:32** (was 13:46 on foot) | Google: 09:30 → York → Chester-le-Street 12:13 → bus 13:14 |
| Washington → Letchworth 17:00 | taxi → Chester-le-Street 18:10 → York → Stevenage → Letchworth 21:29 | 17:46 → 21:40 (on foot: 23:11, or unreachable) | Google: bus → 21:37 |

The taxi leg is Google's road distance and time plus the 5-minute wait, said in the step and the flag; the walk it
replaces is still shown. No other journey in the set had a leg over 3.2 km, so none grew a taxi.

## Gaps Google found

| Journey | App's best | "Google Maps also finds" | Real? |
|---|---|---|---|
| London office → Fort William, 20:00 | Euston 23:45 sleeper → Glasgow Central → Queen St → Fort William 12:12 (→ 12:18) | **Euston 21:15 → Fort William 10:00 (Caledonian Sleeper)**, reaching Fort William 2h 12m sooner | ✓ the Highland sleeper, absent from TfL |
| Letchworth → Fort William, 20:00 | same via King's Cross → Euston 23:45 | Letchworth 20:20 → Finsbury Park → Victoria line → **Euston 21:15 → Fort William 10:00** | ✓ |
| London office → Newcastle 08:00 | Aldgate → **08:30 LNER → Newcastle 11:09** → 11:23 | (first run) the same 08:30 LNER, "5 min sooner" at the door | ✗ a shorter walk, not a different route: fixed, see below |
| Letchworth → Newcastle 08:00 | 08:45 → Doncaster → Newcastle 12:00 → 12:14 (TfL's own first answer today) | (first run) 09:03 LNER → Newcastle 12:00, "5 min sooner" at the door | ✗ same station arrival: fixed |
| Alnmouth, One Braham, the returns | — | nothing | ✓ Google agrees |

**Change made after the run**: the gap rule compares arrival **at the last station**, not at the door. Google's walks
are systematically shorter than ours (it routes from the exit; we start from the station's coordinate), so the same
train looked "5 min sooner" door to door. At the station the Newcastle cases are identical (11:09 and 12:00) and are
no longer gaps; the Highland sleeper is 2h 12m sooner by either measure. Pinned by "googleGaps: the same train with a
shorter walk is not a gap …".

**A difference that is TfL's, not ours**: on 3 Nov evening TfL offered Letchworth → Newcastle 08:30 via Hitchin,
Stevenage and York (11:27); this morning its first answer for the same query is the 08:45 via Doncaster (12:00), and
the app's pick followed it exactly. The recorded fixture keeps the 08:30 for the tests.

## Budget
TfL 6–17 searches per plan; Google 5–8 calls per plan (walk matrices, one or two driving matrices for taxi legs, one
transit route). Within the budgets; the transit route adds one call per plan.

## Not verified
The Maps JS DirectionsService path in a real browser (the page test stubs it; the REST path is what this run used).
Live-day running.
