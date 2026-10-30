# Every live train says how late it is, in colour
Status: Done · Since: 30 Oct 2026 (morning trip)

## Story
As a commuter on or waiting for a train, I want each train's status (on time, a bit late, very late) at a glance,
in a colour that only ever means "is there a problem?", so that I can tell straight away whether to worry.

## Where it came from
30 Oct, on the 08:00 Great Northern (about 2 min late): the "You're on the 08:00" lozenge was orange, so being on
your own train read as a warning, and nothing said in colour how late the train was. Sam: red, amber and green are
reserved for whether there is an issue; this is critical and belongs in the design system (Panda, the live build,
and Signal). Sam chose: status inside the train's lozenge (option 2 of 4), amber from 2 min, Signal's blue as the
accent. → [design-system](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal),
[Panda](../design/panda.md)

## Acceptance criteria
- Bands, one rule in the engine (`delayLevel`, `LATE_WARN_MIN` = 2, `LATE_BAD_MIN` = 15 in `src/core/rules.ts`):
  green under 2 min late (and early); amber 2–14 min; red 15+ min, cancelled, or no estimate.
- Every live train's flags carry its status as a word and minutes: "On time", "1 min late" (green), "3 min late"
  (amber), "18 min late" (red); cancelled and no estimate keep their own red flags. The worse of departure and
  arrival delay counts.
- A timetable train, or a time worked out from another stop (derived or estimated), is never claimed to be on time:
  no status flag unless a delay is actually known.
- On the train (both directions) the lozenge is the train in blue with its status inside it, banded, for the
  expected arrival at the change station (King's Cross / St Pancras / Farringdon going to work; Letchworth going
  home) against the timetable: "On time" inside the green band, otherwise "About N min late / early". The King's
  Cross line keeps the expected and timetabled times but no longer repeats the status. "Last reported … N min late"
  is coloured by the same bands.
- Nearly home on your train: the same lozenge, from the expected Letchworth time; none for a timetable train with no
  Service Details.
- The identity part of a lozenge, the accent, the best-row tint and the focus ring are blue, never red, amber or
  green. Small text on every status colour is at least 4.5:1 in light and dark (measured 6.0–9.6:1).
- The route-wide status line keeps its own tiers (amber from 5 min, red from 15: [warnings](warnings.md)); it
  answers "is my route disrupted", not "is this train late".

## Tests
- tests/core/engine.test.mjs: "Train status: red, amber, green by minutes late (green under 2, amber 2–14, red 15+); never 'on time' without live data"
- tests/core/engine.test.mjs: "trainFlags: cancelled, standing room, stopping, delays, unknown — from the profile's rules"
- tests/rules.test.mjs: "On the train card: arrival from Service Details; 'timetable' is the scheduled time"
- tests/rules.test.mjs: "Nearly home on your train: home time = the train's expected Letchworth time + exit + walk"
- tests/logic.test.mjs: "On the train: works out which train from your position and projects arrival"
- Goldens (status flags on every live train): tests/golden.test.mjs: "golden: morning near Letchworth, live, with a delay and the standing-room rule"
