# UK-wide Trip: the live run against TfL and Google (3 Nov 2026, late; for Wed 4 Nov)

The build under test: branch `feat/uk-wide-trip` at 706b0b4 (Great Britain region, national station list, boarding
where TfL's walk from your station leads). `tools/trip-compare.mjs tools/trip-compare.example.json`: 29 journeys, the
app with **Google-timed walks** and live TfL (306 TfL calls) against TfL's own answer and Google Maps transit
(103 Google calls). Homes are public points (the office itself; Letchworth town centre). Keys from the environment
and the session only; removed from everything written.

## Sam's journeys

| Journey | App | TfL | Google Maps | Verdict |
|---|---|---|---|---|
| **London office → Newcastle** 08:00 | leave 08:02, Tube from **Aldgate**, **08:30 LNER → 11:09**, at the Monument 11:23 | same trains → 11:09 | same trains → 11:18 | ✓ identical |
| Newcastle → London office 17:00 | 17:24 → King's Cross 20:11 → Tube → Aldgate → 20:39 | identical → 20:42 | identical → 20:37 | ✓ |
| **Letchworth → Newcastle** 08:00 | 08:30 → Hitchin → **Stevenage** 08:55 → York → Newcastle 11:27 → 11:41 (York's 0-min change flagged) | identical | Stevenage 08:55 → Newcastle 11:35, Metro → 11:43 | ✓ (app 2 min sooner, flagged) |
| Newcastle → Letchworth 17:00 | 17:27 → Stevenage → Letchworth 20:21 → 20:32 | identical | identical → 20:37 | ✓ |
| **London office → Alnmouth** 08:00 | Aldgate → 08:30 LNER → Newcastle → Alnmouth 11:44 → 12:15 | identical → 11:44 | identical → 12:12 | ✓ |
| Alnmouth → London office 17:00 | 18:30 direct → King's Cross 22:01 → Aldgate → 22:29 | 17:22 → Newcastle → 21:02 (needs leaving 16:51 from the hotel, before "now") | 18:30 → 22:27 | ✓ (the earlier train is unreachable from the hotel at 17:00; Google agrees) |
| Letchworth → Alnmouth | 08:30 → Stevenage → York → Alnmouth 12:04 → 12:35 | identical | identical → 12:32 | ✓ |
| Alnmouth → Letchworth | 18:30 → Doncaster → Stevenage → 22:29 → 22:40 | 17:22 → 21:29 (unreachable at 17:00) | identical to app → 22:37 | ✓ |
| **London office → Fort William** 08:00 (day) | Aldgate → 12:33 → York → Edinburgh → Glasgow Queen St → **22:06** → 22:12 | identical → 22:06 | 12:14 Lumo → Queen St → 22:06 | ✓ same arrival |
| Fort William → London office 17:00 | 17:37 → Glasgow → **Glasgow Central 23:40 sleeper** → Watford Jn → Euston → Aldgate East 07:43 | identical | Edinburgh 23:40 sleeper → Euston 07:15 → 07:44 | ✓ equivalent |
| **London office → Fort William, evening** 20:00 | 23:06 → Tower Hill → Bank → **Euston 23:45 sleeper → Glasgow Central** → Queen St → Fort William **12:12 → 12:18** | identical → 12:12 | **Euston 21:15 Caledonian Sleeper → Fort William 10:00** | ★ TfL (and so the app) lacks the direct Highland sleeper: 2 h later than Google. Known gap. |
| Letchworth → Fort William 08:00 | 12:27 → Stevenage → York → Edinburgh → Queen St → 22:06 → 22:12 | identical | 12:20 → Stevenage → Lumo → Queen St → 22:06 | ✓ |
| Letchworth → Fort William, evening | 22:28 → King's Cross → Euston 23:45 sleeper → 12:12 → 12:18 | identical | 20:20 → Finsbury Park → Euston 21:15 sleeper → 10:00 | ★ the same gap |
| Fort William → Letchworth 17:00 | 17:37 → Glasgow Central 23:40 sleeper → Euston → Highbury → Finsbury Park → Letchworth 08:09 → 08:20 | identical | 23:40 (Edinburgh) sleeper → Euston → Finsbury Park → 08:17 | ✓ |
| **London office → Washington NE38 8SE** | Aldgate → 08:30 LNER → York → **Chester-le-Street** 11:12, then the only option on foot: **94 min** → 12:48, flagged "Nearest station … 5.6 km away" | → Heworth (nearest TfL could name) 11:45 | → Chester-le-Street 11:12, then **bus 8** → 12:14 | ✓ trains identical to Google's; the last 5.6 km has no rail answer (bus, taxi, lift or drive mode) |
| Washington → London office | Chester-le-Street 19:14 → Newcastle → King's Cross 22:10 → Aldgate 22:37 (the 94-min walk first) | Heworth 17:12 → 20:42 | bus → Chester-le-Street 18:10 → 21:27 | ✓ consistent with a 94-min walk; honest, not useful: see Finding 1 |
| Letchworth → Washington | 08:45 → Stevenage → Doncaster → Newcastle → Chester-le-Street 12:10 → walk → 13:46 | → Heworth 11:45 | 09:30 King's Cross → York → Chester-le-Street 12:13 → bus → 13:14 | ✓ app reaches the station 3 min before Google's rail route |
| Washington → Letchworth | 19:14 → Newcastle → Stevenage → 23:00 → 23:11 | Heworth 17:12 → 20:21 | bus → 18:10 → Darlington → Stevenage → 21:37 | as above |
| **London office → St Leonards** | Liverpool St → Stratford → HS1 → Ashford → St Leonards WS 10:14 → 10:24 | identical trains → 10:14 | via St Pancras HS1 → 10:14 → 10:23 | ✓ |
| St Leonards → London office | 17:23 → London Bridge 18:53 → walk → 19:23 | HS1 → Aldgate East 19:23 | London Bridge → Monument → Aldgate East 19:21 | ✓ |
| Letchworth ⇄ St Leonards | 08:20 → London Bridge → 10:49 → 10:59; back 17:20 → Ashford → St Pancras → King's Cross → 19:46 → 19:57 | identical both ways | identical both ways | ✓ |
| **London office → Great Bookham** | now boards at **Bank** (TfL's walk from Fenchurch Street) → Waterloo 08:53 → Bookham 09:47 → 10:09 | Aldgate East → Monument → Bank → same train → 10:11 | District to Wimbledon → same train → 10:08 | ✓ |
| Great Bookham → London office | 18:04 → Waterloo → Bank → Liverpool St → Aldgate 19:18 → 19:25 | identical → 19:28 | 17:21 → Wimbledon → District (needs leaving 17:01; the app's Google walk is 24 min, so 17:21 is unreachable at 17:00) | ✓ |
| Letchworth ⇄ Great Bookham | 08:38 → King's Cross → Vauxhall → Bookham 10:47 → 11:09; back 18:04 → Waterloo → London Bridge → 20:09 → 20:20 | identical both ways | Google's 10:32 uses bus 478 from Leatherhead; its rail-only routes arrive 11:08; return 17:21 unreachable | ✓ |
| Letchworth → One Braham (#56), Arrive by, Brighton → Pimlico | as in the earlier runs (Aldgate 08:31; Aldgate East 08:53; Pimlico 10:26) | ✓ | ✓ | ✓ unchanged by the UK-wide change |

**Result: on every journey where TfL and the app can be compared, the app's trains and stations are TfL's; against
Google Maps, the only differences are Google's bus legs (not rail answers) and the Highland sleeper that TfL's data
lacks.** The departure-side fix did its job: every London-office journey now boards where TfL and Google start.

## Findings

1. **A place with no station within reach gets one honest but unhelpful answer on foot.** Washington is 5.6 km from
   Chester-le-Street; on foot the app shows a 94-minute walk, flagged. TfL's comparator went to Heworth (further, but
   with Metro connections TfL knows); Google took a bus. The right answer here is a different mode for the last leg
   (drive / cycle are already offered; a taxi or a lift is the real-world one). Proposal for Sam: when the nearest
   station is beyond walking reach, say so in the recommendation itself ("5.6 km from Chester-le-Street: 94 min on
   foot; consider a taxi") rather than only in a flag; and consider the two or three nearest fallbacks, not one, so
   Heworth-style alternatives appear.
2. **The Highland sleeper** (London → Fort William 21:15 → 10:00 and 19:50 back) is still missing: TfL's data. Both
   evening Fort William plans arrive 2 hours after Google's. Documented in the story; the second route source is the
   fix.
3. **Hotel-to-station walks make early trains unreachable on the hour**: Alnmouth's hotel is 28 min from the
   station, so at 17:00 the 17:22 is gone and the app (like Google) takes the 18:30. Correct behaviour; worth
   remembering when reading "Leave now" results from a hotel.
4. **Calls per plan** stayed within budget: 4–20 TfL searches (cap 18 planner searches plus the place searches TfL
   refuses outside London), 3–4 Google matrix calls.

## Not verified
Live-day running (all timetable, the evening before); first-mile cycling and driving on national journeys; stations
with no TfL ID (21 of 2,609, listed in `data/stations-report.md`).
