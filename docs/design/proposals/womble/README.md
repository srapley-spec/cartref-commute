# Proposal: womble

By Claude · 29 Oct 2026 · Status: **draft for feedback**. Not yet independently reviewed against the inventory (the
[original](../original/review.md) review still applies wherever womble keeps the same device).

> **Not compliant with the status-colour rule (Sam, 30 Oct):** red, amber and green are reserved for status. Skin A's amber accent and skin B's green "on time / tracking" accent must be retuned before any of this is reused. → [the rule](../../../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal)

Two structures, deliberately different, so the choice is about shape and not only skin. Both are dark-first.

## A — Flighty-shaped
- **The journey is the object.** A Journeys home replaces the mode and direction toggles: "To the office", "Home",
  "A day out", "Laura's commute". Auto puts the journey that fits your location first and labels it.
- **A diagram on top, a sheet below** (Flighty's map + card). Planning: the next hour of departures from Letchworth on
  a time axis with a "you, leaving now · at the station 07:03" marker, so catchable vs missed is visible before any
  reading. On the train: the Letchworth–London line with your train placed on it from its last report ("about here ·
  between Stevenage and King's Cross · placed by time since").
- **Status word first**: LEAVE IN 5:42 · DELAYED +3 MIN · steady over 3 reports, then the two big times, then the why
  (delay reason from National Rail), then calling points, Then (onward legs), a **Record of changes** (what moved and
  when, including "you picked the 07:08"), Your lines, source note. Share ETA at the top.
- Every train listed with a status icon (✓ best · +3 · ✕ missed with the shortfall · standing · ? no estimate).

## B — Commutative-shaped
- **Saved journeys and a From / To box** on the home screen (also where the any-place postcode form lives). A status
  pill per journey. Recents.
- **Results as train cards** with a departure-progress bar behind each one, the platform as a big tile, coach formation
  (standing-room rule as shading until loading data exists), operator and London arrival, office time on the right,
  and the leave-home time as small print. "Track this train" on the best card.
- **The tracked train pins to the bottom** of every screen and opens the live view: platform tile ("predicted early"),
  predicted arrival vs timetable, why, "You're on this train · Not this one?", where it is with calling points,
  coaches, Then, changes, Your lines, Stop tracking.

## Shared with original
Tokens and components from the original system board still apply (status levels, flag pills, chips, type scale ideas),
retuned per skin: A uses Inter Tight + JetBrains Mono with an amber accent; B uses Manrope + IBM Plex Mono with a green
"on time / tracking" accent and platform tiles.

## Recommend drop / hide (for Sam to decide)
Same list as original, plus: the three segmented control rows go entirely (journeys + one Plan selector + one pace
toggle); in A the line-status grid lives under Settings › Lines; in B under the results screen's Lines sheet.

## Not drawn yet (so not silently dropped; each is a defect until drawn or listed)
Arrive by and Leave around (date/time inputs, latest-on-time pick, "N min early" / "Late by", "No Farringdon train by
hh:mm" row) · on the way to the station · at Letchworth / at a London station departure board · at King's Cross tube
connection (original had it) · on the tube to work ("Still at King's Cross? Did you get the 08:03?") · in London ·
on the tube home ("get off at Farringdon or King's Cross, N min later") · nearly home · awaiting location · empty,
loading and error states · the red and stale-data cases of the status line · light theme.

## Data honesty and risks
- Stop rail / where-it-is shows **calling points only**; a non-stop run is placed by time since the last report
  (#23 passing points need a server). Drawn that way.
- Platform "predicted early" needs the staff board (#19). Coach loading needs real data (#21); shading is the
  standing-room rule.
- "Then … Circle or Met 07:56" is an estimate until you are at the hub; worth pre-fetching hub tube arrivals within
  ~10 min of arrival so the live card can show live tubes.
- Live Activity / Dynamic Island need push from a server or the native app; the web app cannot feed them.
- Record of changes and "steady over N reports" are derivable from successive Service Details snapshots; the engine
  does not keep them yet.
- The one-line status summary needs a precedence rule: data stale / not loaded / errors > cancelled, no estimate,
  15+ min > 5–14 min > line status > notices. Counts of lower tiers go in the secondary text. Without it an amber
  operator headline can hide a cancellation.

## Screens
[`index.html`](index.html): a1-journeys · a2-now · a3-on-train · b1-journeys · b2-trains · b3-tracking.
