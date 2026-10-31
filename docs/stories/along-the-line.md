# Along the line — discover the journey outside your window
Status: Behind toggle · Since: 31 Oct 2026 · Issues: #24, #16

## Story
As a passenger, I want to discover interesting places, views and railway features as I travel, at a level of
detail that suits me, so that even a familiar journey gives me something new to notice.

## Where it came from
Sam's 29 Oct idea in #24 described a scrolling railway strip and optional railway detail. On 31 Oct he asked
for an engaging feature for different people: both Sam and Laura would enjoy the view at Welwyn, while Sam
would also want the engineering story. A flat crossing on the ECML would interest Sam more than Laura.
He then authorised implementing the enhanced story, using Signal, behind its own feature toggle.

This supersedes #24's whole-feature “nerd mode” framing and assumption that existing GPS guarantees window
side or precise countdowns. It also carries forward #16's source, route/direction and uncertainty safeguards.
The repository previously indexed #24 as an idea only; this is its first capability story.

## Experience
Create anticipation, help the passenger notice something, then reward curiosity. Looking out of the window
is part of the experience. Do not fill every minute with text or force the person to keep up.

Interests and reading depth are independent, saved on this device:
- Views and landscape; places and their stories; architecture and engineering; how the railway works.
- **A glance:** hook and short invitation to notice.
- **A little more:** adds a short explanation (the default).
- **The full story:** adds deeper context. Any story can be expanded to its full text independently.

Default interests are views and places. For Laura this includes the Mimram valley at Digswell/Welwyn Viaduct.
Sam can add engineering and operations to highlight Hitchin junction and other railway context. A landscape
enthusiast may choose full depth without selecting operations. These choices do not require the future
people/trips account feature. Empty interests are valid; explain the empty highlights and offer other discoveries.

Example: **The view opens up here** → notice the valley → discover that the railway crosses Digswell Viaduct →
explore its construction and the two-track railway. Describe the valley view from the train accurately: the
viaduct is beneath the passenger, rather than a promise of seeing its arches. Hitchin's former flat-junction
conflict explains the flyover without claiming that a London-bound service traverses it.

## Acceptance criteria
- **Settings → Experimental → Along the line** is an independent boolean, off by default. It works with Signal
  or Panda and does not silently enable Signal or Follow. Disabling it immediately removes its entry and closes
  the view. Existing settings, train identity, followed journey, direction, pace and location watches are retained.
- With the flag enabled, show one clearly labelled **Along the line ›** navigation action directly below the
  app heading, in both designs. Keep it accessible while scrolling and across simulator checkpoints, including
  the initial Home/Office stage, planning, station and uncertain-location states. Before an identified train,
  open an explicitly labelled browse view; never manufacture a live position or put automatic landmark prompts
  onto station boards, walking or Tube views. Settings retains **Browse Along the line** too.
- Signal layout changes and skin switching retain this navigation below the heading. It must not be stranded
  above the app header, folded into another panel, or depend on reaching an on-train checkpoint.
- Use Signal's production light/dark palette, blue actions, system typography and compact rounded surfaces.
  The view has a labelled Back to journey action, native dialog semantics, focus return, 44px touch targets,
  reduced-motion support and text wrapping. Red/amber/green remain reserved for service status.
- A separate scrollable vertical strip combines route stations and discoveries in geographical order. A known
  journey clips to its endpoints; northbound order reverses. Stations are route references unless the existing
  progress model supplies their reported/expected/timetable times. A route reference is not a promised stop.
- Surface one matching nearby/upcoming highlight, while retaining every route point in the strip, including
  passed points and topics outside the selected interests. Nonmatching points use compact titles; **Show previews
  for every point** expands their preview text. Interests never remove points or limit access to deeper text.
- Each story has an engaging hook, a short observation, a discovery paragraph and an optional deeper story.
  Distinguish nearby places, scenery from the train and infrastructure beneath/above it. No unverified claim of
  a guaranteed view, window side, flyover traversal or current service stop.
- Initial content is ten curated entries: Hitchin, Knebworth, Welwyn North, Digswell Viaduct, Welwyn Garden City,
  Hatfield, Potters Bar, Alexandra Palace, Gasworks Tunnel (King's Cross only), Canal Tunnels (Thameslink only).
  Nine are applicable to any one supported corridor. All use original text with linked factual sources and a
  review date. The linked summaries were retrieved on 31 Oct; no photos or copied Wikipedia extracts are bundled.
- Approximate nearby/upcoming/passed cues require existing onboard state, certain identity, an OK phone
  location no older than60seconds (never future-dated), accuracy0–100m and a projection within500m of the profile
  corridor. The approximate landmark area is its curated250m radius (Welwyn North200m; viaduct400m;
  tunnels350m) plus GPS accuracy. These are editorial areas, not surveyed structure boundaries.
- Distance ahead follows the profile geometry and is labelled approximate, rounded to at least1km. Do not
  interpolate a timetable into exact GPS, assert that a timed trigger was observed, invent a passing time or
  produce a precise countdown. Weak/stale/off-route/uncertain evidence leaves articles browsable, with an
  explicit uncertain-position explanation and no automatic nearby/upcoming highlight.
- User scrolling pauses following; **Back to now** resumes it and explicitly updates the position marker
  even when a story is open. Ordinary refresh continues to preserve the open story. Automatic refresh does not rebuild an open
  article, collapse it, steal focus or scroll while any story is open. Source epoch, corridor/endpoints or direction
  changes reset the strip so old simulation/journey state cannot be reused as current evidence. A changed train
  on the same route, weak location or loss of an onboard identity preserves the route, scroll and open story;
  location determines the initial focus and current marker, not whether the feature or its route points exist.
- Keep train identity, expected endpoint arrival and the current canonical train/total durations in the view; use the shared disruption model to retain
  significant journey disruption text in both Signal and Panda, and
  access to the main journey. No commentary notifications, sound or live regions repeatedly announce landmarks.
- No new requests, dependencies, API keys, GPS watches or background polling. Once the app has loaded, stories
  are bundled and work without connectivity. This does not add installation/offline app-shell caching.

## Implementation and validation
`src/core/alongLine.ts` is pure: explicit time, evidence, geometry, preferences and content are injected.
`src/core/profiles/samAlongLine.ts` supplies bespoke content/route anchors; `src/along-line.js` only adapts the
existing journey/phone state and renders the model. `src/along-line.css` is an isolated Signal surface, including
when Panda surrounds it. `settings.alongLine` is additive; validated interests/depth live in the separate
`alongLinePreferences` saved field. With Along the line enabled, Panda also computes the existing qualified
journey-progress model for station times and current-service disruption evidence, but draws no Signal diagram.
Signal and Along the line both off preserve the original Panda model path. Existing save/simulation snapshot rules apply; old data is not migrated or
removed. Native dialog state and manual following are session-only.

## Tests
- tests/core/alongLine.test.mjs: "Along: Welwyn is shared, interests and depth are independent, and malformed preferences are safe"
- tests/core/alongLine.test.mjs: "Along: route and direction scope points without claiming the wrong tunnel or flyover"
- tests/core/alongLine.test.mjs: "Along: weak stale future off-route or uncertain evidence cannot produce live landmark prompts"
- tests/core/alongLine.test.mjs: "Along: the model does not mutate frozen observations or invent times and window sides"
- tests/along-line.test.mjs: "Along UI: default off and enabled on-train entry work independently of Signal and Follow"
- tests/along-line.test.mjs: "Along UI: reading depth interests and expanded articles survive updates without losing journey state"
- tests/along-line.test.mjs: "Along UI: manual scrolling pauses follow and back to now resumes it; all stories stay available"
- tests/along-line.test.mjs: "Along UI: toggle persists without feed requests and removes the entry immediately when disabled"
- tests/along-line.test.mjs: "Along UI: browse remains available from Settings without claiming a live position"

- tests/along-line.test.mjs: "Along UI: travel disruption remains visible, stale arrival is qualified and changed journeys reset the strip"

- tests/along-line-review.test.mjs: "independent: Panda active train severe delay remains visible in commentary"
- tests/along-line-review.test.mjs: "independent: Back to now updates the frozen position when a story is open"
- tests/along-line-review.test.mjs: "independent: route reference stations never invent midnight calling times"
- tests/along-line-review.test.mjs: "independent: one glance article can reveal the full story without changing global depth"
- tests/core/alongLine-review.test.mjs: "independent: approximate landmark areas include nearby positions rather than just exact anchors"
- tests/core/alongLine-review.test.mjs: "independent: the GPS uncertainty buffer changes only the nearby boundary within the accepted fix limit"

- tests/along-line-review.test.mjs: "independent: Panda commentary promotes a fresh delayed Service Details report over its older on-time board"

- tests/along-line-review.test.mjs: "independent: a northbound journey reverses the strip and a corridor change resets tunnel content"
- tests/along-line-review.test.mjs: "independent: Panda commentary rejects stale and mismatched reports and preserves explicit current incidents"

Chromium geometry checks: [browser-along-line.py](../../tests/browser-along-line.py), run after building.
These exercise 320/390px, explicit and device light/dark (with actual palette assertions), 15/30px body text,
touch targets, dialog overflow and focus return.

The full-suite validation exposed a pre-existing wall-clock assumption in the TfL departure-board presentation
test: after enough elapsed real time, a Farringdon boarding option legitimately becomes preferred, contradicting
the test’s King’s Cross-only regex. That single presentation test now supplies a fixed10:00clock to the existing
harness; production ranking and timing rules are unchanged.

## Not yet / open questions
- Any-route discovery, Wikipedia/OSM runtime lookup and generated prose remain later stages; the first release
  is curated Letchworth–King's Cross/St Pancras/Farringdon, both directions. Newark flat crossing is outside this
  corridor; do not insert it into this journey. Its identification was illustrative, not confirmed by Sam.
- Photos, verified left/right instructions, surveyed visibility windows, precise upcoming countdowns and
  observed passing timestamps are deferred. The profile corridor and article anchors are approximate.
- Real iPhone Safari, VoiceOver and physical journeys in both directions still need device acceptance. Chromium
  geometry and simulated fixes cannot establish actual visibility from a seat or native screen-reader behaviour.
- Independent review approved source `476ed04` after four fixes; the [review record](../along-line-independent-review.md)
  contains the findings, 37-test replay, mutation evidence and limits. Full repository CI/release gates remain
  required before merge.

## Reconciliation with the 31 October UI-parity release
PR #43 landed during validation. Its shared Auto/Plan/Live controls and journey facts are retained.
The commentary header consumes the same canonical option, expected rail endpoint and already-computed
whole-journey arrival through `journeyFactsMarkup`; no second timing calculation is introduced.
The mandatory registry includes `along-the-line`, exercised for both Panda and Signal with default-off,
visible duration/disruption/story facts, stale location and unknown timing. The earlier independent source
approval remains recorded above. The follow-up independently approved reconciled source `76db650`; its
12 facts/composition checks, both new parity tuples and Chromium checks are recorded in the same
[review report](../along-line-independent-review.md). The
[current/unknown duration probes](../../tests/along-line-composition-review.test.mjs) are retained as regressions.
Final committed-head local and GitHub CI remain required before merge.

## Release validation: prediction timestamp boundary
The combined Auto-label release run passed932/933tests but exposed another pre-existing test-clock assumption
in the King's Cross arrival assertion: the mocked feed and the expected office time read a ticking clock at
different instants. Crossing the half-minute rounding boundary made the assertion one minute late. The fixture
and assertion now share the captured feed time; a frozen10:00:29.900prediction test explicitly advances the
clock across that boundary and verifies the actual arrival remains10:26. Production timing is unchanged.

- tests/app.test.mjs: "At King's Cross: a minute boundary after fetching cannot change the expected office arrival"

## Access correction after simulator use
Sam reported that enabling the flag and starting the simulator did not reveal a way into the feature.
A real guided-journey reproduction confirmed the entry was hidden until the on-train checkpoint, and Signal's
root-child reordering placed the button above its header when it finally appeared. The enabled feature now
has persistent explicit navigation below the header; GPS/identity still gate live commentary, not access.

- tests/along-line.test.mjs: "Along UI: enabled navigation stays below the heading before boarding in either design"

Sam clarified the complete journey line must stay browsable: while crossing Welwyn, he should be able to scroll
back to Hitchin and read about the junction. All route points now remain in the strip regardless of selected
interests or current position. The last established route is retained within the current source/direction/mode;
source, direction or real corridor/endpoints changes start a new view. Live cues still require fresh evidence.

- tests/along-line.test.mjs: "Along UI: passed route points and open stories survive losing the current position"

- tests/along-line.test.mjs: "Along UI: an established Thameslink route survives losing identity before opening the view"

The real opt-in and guided simulator regression is [browser-along-access.py](../../tests/browser-along-access.py).
It checks Home through Stevenage in both designs at 320/390px, visible navigation, browse/onboard transitions,
passed Hitchin reading across a further GPS checkpoint, focus return and 44px targets.
