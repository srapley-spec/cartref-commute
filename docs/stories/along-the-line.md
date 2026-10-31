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
Sam can add engineering and operations to include Hitchin junction and other railway context. A landscape
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
- On an existing identified/inferred rail journey, show one **Along the line ›** entry. Do not put landmark
  prompts onto station boards, walking or Tube views, or a manually pinned planning view. Settings also offers
  **Browse Along the line** when enabled, including with location denied or no train identified.
- Use Signal's production light/dark palette, blue actions, system typography and compact rounded surfaces.
  The view has a labelled Back to journey action, native dialog semantics, focus return, 44px touch targets,
  reduced-motion support and text wrapping. Red/amber/green remain reserved for service status.
- A separate scrollable vertical strip combines route stations and discoveries in geographical order. A known
  journey clips to its endpoints; northbound order reverses. Stations are route references unless the existing
  progress model supplies their reported/expected/timetable times. A route reference is not a promised stop.
- Surface one matching nearby/upcoming highlight; hide nonmatching stories initially. **Show other discoveries
  too** makes all available stories browsable. Interest selection does not limit access to deeper text.
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
- User scrolling pauses following; **Back to now** resumes it. Automatic refresh does not rebuild an open
  article, collapse it, steal focus or scroll while any story is open. Source epoch, train/corridor or direction
  changes reset the strip so old simulation/journey state cannot be reused as current evidence.
- Keep train identity and expected endpoint arrival in the view; retain significant journey disruption text and
  access to the main journey. No commentary notifications, sound or live regions repeatedly announce landmarks.
- No new requests, dependencies, API keys, GPS watches or background polling. Once the app has loaded, stories
  are bundled and work without connectivity. This does not add installation/offline app-shell caching.

## Implementation and validation
`src/core/alongLine.ts` is pure: explicit time, evidence, geometry, preferences and content are injected.
`src/core/profiles/samAlongLine.ts` supplies bespoke content/route anchors; `src/along-line.js` only adapts the
existing journey/phone state and renders the model. `src/along-line.css` is an isolated Signal surface, including
when Panda surrounds it. `settings.alongLine` is additive; validated interests/depth live in the separate
`alongLinePreferences` saved field. Existing save/simulation snapshot rules apply; old data is not migrated or
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
- tests/along-line.test.mjs: "Along UI: browse is available offline from Settings but station boards never gain a landmark prompt"

- tests/along-line.test.mjs: "Along UI: travel disruption remains visible, stale arrival is qualified and changed journeys reset the strip"

Chromium geometry checks: [browser-along-line.py](../../tests/browser-along-line.py), run after building.
These exercise 320/390px, light/dark, 15/30px body text, touch targets, dialog overflow and focus return.

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
- Independent test review remains required before merge under the repository's release rules.
