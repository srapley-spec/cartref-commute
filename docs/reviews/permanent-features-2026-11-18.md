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
| anyPlace | 12 Nov clean baseline: controls fold under way | Partly: "Where from?"/"Where to?" showed under way | Rows are hidden while a route is followed (`activeFollow()`). **Decision:** not in a live view without following, unlike `underWayControls`: in London going home that view is the normal one, and hiding "Where from?" there would remove the feature where it is meant to work. Hidden, not folded: opening the controls doesn't bring them back while following | permanent-features: "Leisure: 'Where from?' is offered…", "Leisure: 'Where to?' folds away while following too" (mutations M and N killed) |
| anyPlace | Leisure planning from your location | Yes (same TfL requests: 10 on both) | none | anyplace: "Permanent (#63)…"; goldens show no request changes |
| anyPlace | Off: TfL's 300 "which place?" was an error | Partly: on, it re-planned both stations per station (6 requests) | Retry only the station asked, once (4 requests); merge on the GitHub-first path (live request pattern changes) | permanent-features: "Any start and end point: an ambiguous typed place…" |
| anyPlace | (new risk) a saved `dest` from an earlier on/off use | Changed: became the Leisure destination | Dropped once when `anyPlace` wasn't on (`migratePermanent`) | permanent-features: "A device from before #63 with Any start and end point off…" |
| Follow | 41c43d9 "explicit disabled setting wins"; "feature off ignores saved follow" | No: a dormant saved route was followed on load (and reached alerts and the Live Activity) | Dropped once when Follow wasn't on (`migratePermanent`); kept when it was | permanent-features: "A device from before #63 with Follow off…" (mutation killed); follow-migration: "Follow switched off before #63…" |
| Follow | One TfL request on the tube home with nothing followed (11 Nov) | Yes | Scenario rewritten as "nothing followed" | follow-main-regression: "…while with nothing followed it makes only one Tube request…" |
| Follow | Leave by and the scheduled departure (1 Nov); 2 Nov journey/train panel | Yes: the Follow button is added after Leave by; goldens differ only by the added "Follow"/"Unavailable" text (17 files, every line checked) | goldens re-recorded | leave-by, platform-time, clean-baseline, single-card, golden |
| Follow | Display mode read-only | Yes | none | permanent-features: "Display mode stays read-only…" |
| Trip | Settings → Trip off didn't clear `tripMode.active` | No: a Trip left open while off reopened (and its followed Trip restarted the Live Activity) | `tripMode.active=false` and its `follow` dropped once when Trip wasn't on | permanent-features: "A device from before #63 with Trip off…" |
| Trip | Off: no Trip or Google requests in Commute | Yes (0 Trip calls) | test rewritten | trip-page: "Trip available but not chosen (#63)…" |
| Trip | 18 Nov live services: optional rows only when in use | No: Google/any-station rows raised a home "Not live" warning for every Commute user on a proxy without them | Counted in the home warning only in Trip; always listed in Settings | keys-in-proxy: "Settings: no key fields…", "TfL counts as keyed only…" |
| Trip | Trip settings shown | Yes | First-pass assertion couldn't fail (Settings not opened; mutation survived); now opens Settings first | permanent-features: "Fresh install…" |
| all | Marker `featuresPermanent` kept across Settings saves, fresh installs and iPhone restores (so the once-per-device migration never runs twice) | No (re-check): a restore from an older iPhone cache dropped it, and the next reload wiped the followed route, Trip and saved destination; Save and fresh-install paths worked but were untested (mutations J, K survived) | Marker set on restore (`nativeHydrate`); tests for restore→follow→reload, Save→reload, fresh→follow→reload and nothing-saved | permanent-features: "Marker: …" (4 tests; mutations K, restore and the nothing-saved line killed; J on a device with settings is equivalent: the migration sets the marker) |
| all | Retired switches dropped on load, Save and the iPhone app's cache | Yes | none | permanent-features (mutations killed) |

## Not changed
- `createTripUi.reset()` race (docs/reviews/ios-native-2026-11-18.md): this change adds no production caller; it stays a
  separate follow-up.
- Real-device APNs, Live Activity, alarm cancellation, geofences and Siri remain pending phone acceptance.

## Re-check (362ebdf)
All four blockers fixed (follow, Trip, banner; fold partly, decision above); saved-destination decision agreed;
15 mutations: A, B, D, E, F, G, H, L, M, O killed; C, I, J, K, N survived. The survivors and the iPhone-restore marker
bug were fixed with tests in the next commit (C, K, N and the restore now killed; I and J equivalent). Rewritten
older tests still guard the preserved behaviour; goldens: only the added Follow/Unavailable text. Low risk noted:
a stored state with no `settings` object skips the migration (save() always writes settings).
