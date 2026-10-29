# Design system proposals

Status: comparing proposals · Opened: 29 Oct 2026 · Owner: Sam

The app works but looks utilitarian. Before features grow further it needs a design system, or every new screen bakes
in more debt. Several people are producing proposals; this folder holds all of them in one shape so they can be
compared and contrasted on the same terms.

## The brief (same for every proposal)

- **Scope for this round:** commute planning (Leave now · Arrive by · Leave around) and the live journey states.
  Leisure and Settings are out of scope for restyle but must not be lost.
- **No silent regression.** [`inventory.md`](inventory.md) lists everything the current screen shows, state by state,
  flag by flag. A proposal must either show each item, or list it explicitly under "recommend drop / hide" for Sam to
  decide. Anything missing and unlisted is a defect, not a design choice.
- **Reference apps.** Commutative Live Trains: a distinctive dark interface, early platform predictions, train movement
  from signalling data, Live Activities / Dynamic Island, coach information, live ETA sharing; borrow the active-train
  tracking experience and the prominent journey status. Flighty: the live-travel experience, which we can better
  because the arrival comes from live Service Details reports rather than estimates.
- **Principles** from [`../architecture.md`](../architecture.md) still bind: never hide a train (flags, not removal);
  real data over estimates; when unsure, ask and remember; detail replaces a line or folds away; everything personal
  is configurable; new capabilities ship behind toggles.
- **The engine decides what comes first; the design decides how it looks.** Which view is on screen, what the big
  number means (leave / departs / arrive), the status line (`statusLine`, worst first) and the order of blocks on
  each view (`BLOCKS`) come from `src/core/present.ts`. A proposal draws those blocks in that order and may restyle,
  group or fold them, but not reorder them. To argue for a different order, propose a change to the model (and its
  tests) instead. → [presentation-model](../stories/presentation-model.md)
- **Phone first, used while walking to a station.** Glanceable; touch targets ≥ 44 px; small text ≥ 4.5:1 contrast;
  dark and light; iOS later (Live Activities, Dynamic Island, widgets, Watch are native extension points to design for,
  not web features to fake).
- **Honest about the data.** Service Details reports calling points only (passing points need a server, #23); platform
  predictions beyond the public board need the staff board (#19); coach loading is not available yet (#21); Live
  Activities need push from a server or the native app.

## How a proposal is laid out

```
docs/design/proposals/<name>/
  README.md     one page: the idea, what it borrows, what it drops or hides (for Sam to decide), open risks
  index.html    every screen side by side (phone-width iframes)
  *.html        self-contained static mockups, one per screen; sample data only
  review.md     an independent review against inventory.md (missing / UX / fidelity / data risk), if one was run
```

Mockups are plain HTML with inline styles and a Google Fonts link, so they render from a file:// URL or GitHub Pages
with nothing to build. Nothing here is wired to the engine.

## Comparison criteria

Score each proposal 1–5 on every row. The first row is pass/fail and comes first on purpose.

| # | Criterion | What "5" looks like |
|---|---|---|
| 0 | **No silent regression** (pass/fail) | Every inventory item is shown or in the proposal's drop/hide list. |
| 1 | Glanceable while walking | The one number that matters is readable at arm's length; status before detail. |
| 2 | Live journey (the Commutative/Flighty ask) | Which train, where it is, delay vs timetable, why, what's next, share ETA — from real reports. |
| 3 | Busy-screen fix | Three control rows, a banner stack and a status grid replaced by something that doesn't compete with the time. |
| 4 | Never hide a train | Missed, no-estimate, cancelled and standing trains still visible, with their flags. |
| 5 | Honest about data | Nothing drawn that the feeds can't supply (passing points, coach loading, predicted platforms) without a label. |
| 6 | System, not a screen | Tokens, type scale, components and slot order that the undrawn states can be built from. |
| 7 | Native-ready | Live Activity / Dynamic Island / widget designed from the same engine output. |
| 8 | Accessibility | ≥ 44 px targets, ≥ 4.5:1 small text, status not by colour alone, `aria-live` sane with ticking countdowns. |
| 9 | Build cost | How much of `src/page.html`'s rendering changes; whether the engine needs new outputs. |

## Proposals

| Name | By | Shape | Status |
|---|---|---|---|
| [original](proposals/original/) | Claude, 29 Oct | A restyle of the current layout (controls → status line → hero card → list) in two skins: dark "Signal" and light "Board". | Superseded: reviewed as too close to today's app; kept for its system board (tokens, components, drop/hide table) and its review. |
| [womble](proposals/womble/) | Claude, 29 Oct | Two structures. **A**, Flighty-shaped: a line/time diagram on top, a sheet that leads with a status word, a record of changes. **B**, Commutative-shaped: saved journeys instead of mode/direction toggles, train cards with departure progress, platform tile, coaches, "Track this train" pinned to the bottom. | Draft for feedback. Arrive by / Leave around and the other live states not yet drawn (see its README). |

Add a row per proposal. When one is chosen, its README becomes `docs/design/system.md` (tokens, components, IA) and
the decision goes in the log in `../architecture.md`.

## Comparison matrix

Fill in as proposals land. Blank = not scored yet.

| Criterion | original | womble | | |
|---|---|---|---|---|
| 0 No silent regression | fail (see review) | not yet reviewed | | |
| 1 Glanceable | | | | |
| 2 Live journey | | | | |
| 3 Busy-screen fix | | | | |
| 4 Never hide a train | | | | |
| 5 Honest about data | | | | |
| 6 System, not a screen | | | | |
| 7 Native-ready | | | | |
| 8 Accessibility | | | | |
| 9 Build cost | | | | |
