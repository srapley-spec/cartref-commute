# Along the line (nerd mode)
Status: Planned · Since: 29 Oct 2026 · Issues: #24 (supersedes #16), depends on #23 for passing times

## Story
As a commuter on a train, I want a strip of where I am along the line, with the stations and their live times and,
if I've turned it on, what's interesting out of the window and when, so that the journey is a live progress view
and the railway is a thing to look at rather than sit through.

As Laura, I want "look down, you're on the Welwyn Viaduct" in plain words; as Sam, I want the Hitchin flyover
and why the two-track Welwyn stretch holds trains up. Same points, different text, chosen by interests.

## Where it came from
29 Oct 2026, morning trip. Sam's idea; the interface settled in chat the same day: a separate scrolling view
(not more on the on-train card), stations always, points of interest only with nerd mode on. Issue #16
(28 Oct, written via the Codex connector) was the broader version; closed as superseded on 29 Oct, carrying
over provenance, licences, side verification, confidence guards and the test list.

Independent review of the first design, 29 Oct, found four wrong claims about the code (position "exists",
"no change to the engine", the on-line window, Service Details stops), which this story corrects. Decisions
taken by Sam on 29 Oct are marked (decided).

## Acceptance criteria
### Entry and toggles
- Two toggles in Settings → Experimental, both off by default: "Along the line" (the strip) and "Nerd mode"
  (adds points of interest). Toggles off: every golden is byte-identical to today.
- With "Along the line" on, the on-train card gains one line, "Along the line ›", and nothing else changes.
- The strip opens as a dialog over the card, like Settings (decided: dialog, not a replacement of the hero).
- The link is never drawn on the station board, on the way to the station, on the tube, or when a connection
  ahead has less than the catch margin to spare (the "cutting it fine" rule; the margin is the profile's
  `catchMargin`, there is no such flag on the card today).
- The strip stays open as long as the app still holds your remembered train, including within 400 m of a hub
  and in the last 1.6 km into King's Cross where on-line detection is false; the marker is hidden there and the
  strip says "position not fresh" (decided).

### The strip
- A vertical strip, top to bottom in direction of travel, of every location the train's progress reports
  (stops and, with #23, passing points) plus curated points of interest, ordered by km along the line.
- Behind you: greyed, with the actual time reported (`ata`/`atd`, or `realtime…Actual`), or no time if none.
- Ahead: stops show the expected time from the train's progress; passing points show the forecast time when
  #23 provides it, otherwise the name with no time (decided: never a time the data doesn't have).
- Points of interest ahead show "in about N min" by interpolating by km between the two reported times either
  side (decided: option A, no distance ÷ speed, no new timing arithmetic; CLAUDE.md "times from segments").
- "You are here" is a marker at km along the line from `trackLine`, moved only on a fix fresher than 60 s
  (decided: one staleness threshold for this view). A point is passed by km with 150 m hysteresis, never by
  time, so GPS jitter at a boundary can't flip it back.
- Scroll-follow ("back to now") is out of this slice (decided: jsdom can't test it; defer).
- Each entry is one line; tapping unfolds the text, photo, tags, source line and "Read more" in place.
- Every text shows its source, licence (CC BY-SA 4.0 for Wikipedia-derived text) and checked date; every photo
  shows author credit and licence; wherever OSM-derived points appear, "© OpenStreetMap contributors".

### Points of interest (nerd mode on)
- Stage 1 points live in `src/core/profiles/samLine.ts`: id, name, coordinates (one point or a start–end pair),
  kind (over | through | beside), side `{side, verified}` for beside only, the direction it applies to
  (office | home | both), tags from {engineering, railway operations, architecture, scenery, history}, two
  texts (engineering, view), photo `{url, licence, credit}`, source `{title, url, licence, checked}`,
  confidence.
- km along the line is derived from coordinates by `lineProgress` in a test, never typed by hand.
- A point whose direction doesn't match the journey is never shown (the Hitchin flyover: home only).
- A side is shown only when `verified` is true; "over"/"through" points have no side ("look down", "you're
  on it").
- A point is shown if it has at least one tag in the person's interests; tone is engineering if the interests
  include engineering or railway operations, otherwise view.
- Interests: one set in Settings until the people model exists (decided); then per person.
- The line shape `LINE_NORTH` is kept as is for this story (decided). km error is roughly 100–400 m by stretch;
  points carry a km range where that matters. Reshaping the line is its own PR with goldens re-read.

### What stays out
- The Underground leg: no GPS in the tunnels, no progress feed.
- With the TfL timetable or demo source there is no Service Details, so stations show timetable times only,
  labelled.
- Stage 2 (live OpenStreetMap + Wikipedia for any route) and stage 3 (LLM-written tones via the #17 proxy)
  are later stories; nothing here fetches on a position update.

## Tests
None yet (gap). Planned, to be written with the code in this order (indented so check-docs doesn't look for them yet):
  - (planned) tests/core/calls.test.mjs: "Service Details: ordered locations with actual or expected times; passing points when the feed has them" (#23 adapter)
  - (planned) tests/core/alongLine.test.mjs: "alongLine: rows in km order; passed by km with 150 m hysteresis, never by time"
  - (planned) tests/core/alongLine.test.mjs: "alongLine: a fix older than 60 s doesn't move the marker; no fix means no marker"
  - (planned) tests/core/alongLine.test.mjs: "alongLine: minutes to a point interpolate by km between the reported times either side; none when one side has no time"
  - (planned) tests/core/alongLine.test.mjs: "alongLine: a point for the other direction is never shown (Hitchin flyover going to London)"
  - (planned) tests/core/alongLine.test.mjs: "alongLine: an unverified side is not shown; over and through points have no side"
  - (planned) tests/core/alongLine.test.mjs: "alongLine: interests pick the points and the tone"
  - (planned) tests/core/alongLine.test.mjs: "samLine: every point has source, licence, checked date, photo credit, direction and derived km"
  - (planned) tests/rules.test.mjs: "Along the line: the link is drawn only on the train and not when a connection ahead is cutting it fine"
  - (planned) tests/logic.test.mjs: "Along the line: toggles off, the on-train card is unchanged"
  - (planned) tests/app.test.mjs: "Frequent location updates do not trigger requests" (existing; must still pass with the strip open)
  - (planned) tests/golden.test.mjs: "golden: on the train with Along the line and nerd mode on"

## Not yet / open questions
- #23 first: passing times. Plan is the free Darwin staff board (LDBSVWS `GetServiceDetailsByRID`, `isPass`,
  `eta/etd/ata/atd`), key in Settings like Service Details; unverified whether the RDM staff product returns
  passing locations to this caller (docs: "depending on the permissions granted"). Sam to subscribe and check
  one evening train. If not, the Push Port or TRUST needs an always-on consumer.
- Whether "over" points pin the marker to the structure or keep the km marker.
- Whether passed points keep their unfolded text or collapse.
- Photos are hotlinked from Wikimedia Commons: fine for personal use, not guaranteed.
- Stage 2 needs a line shape per route, which the app has only for the commute; public Overpass is light-use
  and often down, so lookups are once per journey and cached.
- Stage 3: Claude Haiku behind #17, prompt limited to the given extract, cached per point and tone, ~1,000
  tokens in / 150 out per point; rewritten text stays CC BY-SA and says so.
- Mockups and architecture notes: the "Along the line mockup" canvas (29 Oct).
