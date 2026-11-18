# Permanent features (#63): historical compatibility review, 18 Nov 2026

Sam required (18 Nov) that removing each Experimental toggle keep every improvement made to the normal, feature-off app
since the toggle was introduced, checked by a separate agent that did not implement the change, with targeted
mutations. Reviewer: an independent agent; first pass on `e701c5c` against released `main` `65e9efd` (TestFlight
1.0 (8)); its re-check result is recorded at the end.

## Toggle-introduction commits
| Feature | Toggle introduced | Notes |
|---|---|---|
| Any start and end point (`anyPlace`) | 766bdfb (28 Oct) | |
| Follow a route (`followRoute`) | 75ad60c (30 Oct); 4d64b53 (30 Oct, "Follow a route (Settings → Experimental, off by default)"); 41c43d9 (31 Oct, migration from the released `follow` switch) | |
| Trip (`trip`) | 710f527 (31 Oct) | |

## Review table
| Feature | Later fix or improvement | Preserved on the first pass? | Corrective change | Supporting test |
|---|---|---|---|---|
| anyPlace | 12 Nov clean baseline: controls fold under way | No: "Where from?"/"Where to?" showed under way | Rows fold while following (`underWay` in the route-label render) | permanent-features: "Leisure: 'Where from?' is offered with location, and folds away with the controls while following" (mutation killed) |
| anyPlace | Leisure planning from your location | Yes (same TfL requests: 10 on both) | none | anyplace: "Permanent (#63)…"; goldens show no request changes |
| anyPlace | Off: TfL's 300 "which place?" was an error | Partly: on, it re-planned both stations per station (6 requests) | Retry only the station asked, once (4 requests) | permanent-features: "Any start and end point: an ambiguous typed place…" |
| anyPlace | (new risk) a saved `dest` from an earlier on/off use | Changed: became the Leisure destination | Dropped once when `anyPlace` wasn't on (`migratePermanent`) | permanent-features: "A device from before #63 with Any start and end point off…" |
| Follow | 41c43d9 "explicit disabled setting wins"; "feature off ignores saved follow" | No: a dormant saved route was followed on load (and reached alerts and the Live Activity) | Dropped once when Follow wasn't on (`migratePermanent`); kept when it was | permanent-features: "A device from before #63 with Follow off…" (mutation killed); follow-migration: "Follow switched off before #63…" |
| Follow | One TfL request on the tube home with nothing followed (11 Nov) | Yes | Scenario rewritten as "nothing followed" | follow-main-regression: "…while with nothing followed it makes only one Tube request…" |
| Follow | Leave by and the scheduled departure (1 Nov); 2 Nov journey/train panel | Yes: the Follow button is added after Leave by; goldens differ only by the added "Follow"/"Unavailable" text (17 files, every line checked) | goldens re-recorded | leave-by, platform-time, clean-baseline, single-card, golden |
| Follow | Display mode read-only | Yes | none | permanent-features: "Display mode stays read-only…" |
| Trip | Settings → Trip off didn't clear `tripMode.active` | No: a Trip left open while off reopened (and its followed Trip restarted the Live Activity) | `tripMode.active=false` and its `follow` dropped once when Trip wasn't on | permanent-features: "A device from before #63 with Trip off…" |
| Trip | Off: no Trip or Google requests in Commute | Yes (0 Trip calls) | test rewritten | trip-page: "Trip available but not chosen (#63)…" |
| Trip | 18 Nov live services: optional rows only when in use | No: Google/any-station rows raised a home "Not live" warning for every Commute user on a proxy without them | Counted in the home warning only in Trip; always listed in Settings | keys-in-proxy: "Settings: no key fields…", "TfL counts as keyed only…" |
| Trip | Trip settings shown | Yes | none | permanent-features: "Fresh install…" (`#tripFields` visible) |
| all | Retired switches dropped on load, Save and the iPhone app's cache | Yes | none | permanent-features (mutations killed) |

## Not changed
- `createTripUi.reset()` race (docs/reviews/ios-native-2026-11-18.md): this change adds no production caller; it stays a
  separate follow-up.
- Real-device APNs, Live Activity, alarm cancellation, geofences and Siri remain pending phone acceptance.

## Re-check
See issue #63 for the reviewer's re-check of the fixes and its final assessment.
