# Every live train says how late it is, in colour
Status: Done · Since: 30 Oct 2026 (morning trip)

## Story
As a commuter on or waiting for a train, I want each train's status (on time, a bit late, very late) at a glance,
in a colour that only ever means "is there a problem?", so that I can tell straight away whether to worry.

## Where it came from
30 Oct, on the 08:00 Great Northern (about 2 min late): the "You're on the 08:00" lozenge was orange, so being on
your own train read as a warning, and nothing said in colour how late the train was. Sam: red, amber and green are
reserved for whether there is an issue; this is critical and belongs in the design system (Panda, the then-live build,
and Signal). Sam chose: status inside the train's lozenge (option 2 of 4), amber from 2 min, Signal's blue as the
accent. Later on 30 Oct Sam moved amber to start at 5 min (with the departure-board change, [late-trains](late-trains.md)).
→ [design-system](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal),
[Panda](../design/panda.md)

## Acceptance criteria
- Bands, one configured policy in `src/core/disruption.ts`, consumed by `delayLevel` in `src/core/rules.ts`:
  defaults are green under 5 min late (and early), amber 5–14 min, red 15+ min, cancelled, or no estimate
  (Sam, 30 Oct: amber from 5, was 2). `LATE_WARN_MIN`/`LATE_BAD_MIN` remain default aliases, not a separate policy.
  A partial `Profile.disruption` override reaches train flags, departure/arrival wording, route-wide warnings,
  Follow and visual progress through the same effective configuration. See [warning configuration](warnings.md).
- Every live train's flags carry its status as a word and minutes: "On time", "3 min late" (green), "8 min late"
  (amber), "18 min late" (red); cancelled and no estimate keep their own red flags. The worse of departure and
  arrival delay counts.
- A timetable train, or a time worked out from another stop (derived or estimated), is never claimed to be on time:
  no status flag unless a delay is actually known.
- On the train (both directions) the lozenge is the train in blue with its status inside it, banded, for the
  expected arrival at the change station (King's Cross / St Pancras / Farringdon going to work; Letchworth going
  home) against the timetable: "On time" within 2 min either way (`PROJECTION_ON_TIME_MIN`: closer than a projection can
  tell), otherwise "About N min late / early", coloured by the same bands (so "About 3 min late" is green). The King's
  Cross line keeps the expected and timetabled times but no longer repeats the status. A timetable train with no
  Service Details gets no status chip (projected from where you are, but not live data). "Last reported … N min late"
  is coloured by the same bands.
- Nearly home on your train: the same lozenge, from the expected Letchworth time; none for a timetable train with no
  Service Details.
- The identity part of a lozenge, the accent, the best-row tint and the focus ring are blue, never red, amber or
  green. On the hero, text on the status chips and status text is at least 4.5:1 in light and dark (calculated from
  the tokens: 6.0–9.6:1; checked by hand, no automated test reads CSS).
- Confirmed by Sam, 30 Oct: 10–14 min late is amber (red starts at 15 everywhere); the route-wide line stays at 5
  (now the same as a train's amber);
  "Arrives first · walking" and "Latest for HH:MM" stay green, because they are status (you can make it, nothing
  wrong), not a mark of the best option.
- The route-wide status line uses the same thresholds (amber from 5 min, red from 15: [warnings](warnings.md)) but
  answers "is my route disrupted", not "is this train late".
- On a departure board (at a station, on your way) the status shows in the Expected column; an "On time" pill would
  repeat it and is left off there. → [late-trains](late-trains.md)

## Review
30 Oct, independent test review of d17daa2: 31 one-line mutants, 27 killed. The four survivors: an early-text branch
production never reaches (equivalent); the nearly-home timetable-with-Service-Details case and the nearly-home
identity lozenge (tests added, now killed); the CSS accent token (checked by hand). It also found the on-train card
called a timetable train "On time" from a projection, contradicting this story; that's fixed and tested.

## Tests
- tests/core/engine.test.mjs: "Train status: red, amber, green by minutes late (green under 5, amber 5–14, red 15+); never 'on time' without live data"
- tests/core/warnings.test.mjs: "railWarnings: red for a cancellation, no estimate or 15+ min; amber 5–14; none otherwise"
- tests/core/engine.test.mjs: "trainFlags: cancelled, standing room, stopping, delays, unknown — from the profile's rules"
- tests/rules.test.mjs: "On the train card: arrival from Service Details; 'timetable' is the scheduled time"
- tests/rules.test.mjs: "Nearly home on your train: home time = the train's expected Letchworth time + exit + walk"
- tests/logic.test.mjs: "On the train: works out which train from your position and projects arrival"
- Goldens (status flags on every live train): tests/golden.test.mjs: "golden: morning near Letchworth, live, with a delay and the standing-room rule"
