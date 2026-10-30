# Panda: the live build's design system

Status: **live** (named by Sam, 30 Oct 2026) · Source of truth: the tokens and classes in `src/page.html`.

Panda is what the app on `main` draws today: one narrow column, an inverted "departure board" hero card, a ranked
list, banners and pills. [Signal](../design-system.md) is the selected successor and isn't built yet. Until it is,
every change to the screen follows Panda, and both systems obey the same status-colour rule.

## Status colour is reserved (Sam, 30 Oct 2026; critical)
Red, amber and green mean one thing only: **is there a problem?** Green means no problem, amber some problem, red a
serious problem. They are never used for brand, accent, identity ("You're on the 08:00"), selection, the best
option, focus or tracking. Full rule and history:
[design-system](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal).

**Train delay bands** come from the engine (`delayLevel` in `src/core/rules.ts`), never from page arithmetic:

| Band | Colour (`ok` / `warn` / `bad`) | When |
|---|---|---|
| On time | green | under 2 min late, or early |
| A bit late | amber | 2–14 min late |
| Very late | red | 15+ min late, cancelled, no estimate |

Each band is shown as a word plus minutes, never colour alone. A timetable train, or a time worked out from another
stop, gets no status: it is never claimed to be on time. → [train-status](../stories/train-status.md)

The route-wide status line has its own tiers (amber from 5 min): it answers "is my route disrupted", not "is this
train late" (→ [warnings](../stories/warnings.md)). Other status uses follow the same meaning, for example the time
to spare on your way to the station (`wayLevel`, → [on-the-way-to-the-station](../stories/on-the-way-to-the-station.md)).

## Tokens
Each cell is light / dark. Dark applies with the system setting, or with `data-theme="dark"`.

| Role | Token | Value | Use |
|---|---|---|---|
| Canvas | `--paper` | `#EDF0EC` / `#111714` | page background; text on the hero |
| Surface | `--card` | `#F8F9F6` / `#18201C` | list, banners |
| Primary text | `--ink` | `#17201B` / `#E5EBE6` | text; **also the hero's background** (the hero is inverted) |
| Supporting text | `--muted` | `#5B6760` / `#93A198` | metadata |
| Divider | `--line` | `#D2D9D3` / `#2A342F` | borders |
| Accent | `--accent`, `--accent-ink` | `#174EAC` on white / `#9ABFFF` on `#0B1017` | focus ring, best-row tint (Signal's blue, 30 Oct) |
| Hero accent | `--hero-accent`, `--hero-accent-ink` | `#9ABFFF` on `#0B1017` / `#174EAC` on white | identity lozenges on the hero |
| Positive | `--ok`, `--ok-bg` | `#2E7A4C`, `#E1EFE5` / `#6CC08C`, `#16291E` | status only |
| Caution | `--warn`, `--warn-bg` | `#9A6200`, `#F6ECD6` / `#E3B04D`, `#2B2310` | status only |
| Severe | `--bad`, `--bad-bg` | `#B42318`, `#F8E1DE` / `#F2877A`, `#321917` | status only |
| Hero status | `--hero-ok`, `--hero-warn`, `--hero-bad` | `#6CC08C`, `#E3B04D`, `#F2877A` / `#24603C`, `#7A4D00`, `#A11F15` | status text and chips on the hero |
| Notice | `--note`, `--note-bg` | `#B39B00`, `#FBF7DC` / `#E8D45C`, `#29270F` | a route notice with no observed impact; must not read as amber |
| Tube lines | `--circle`, `--met`, `--hc` (+ `-ink`) | TfL colours | line chips only (identity, not status) |

Because the hero is inverted, it uses the opposite appearance's colours: on the hero, light mode takes the dark
values and dark mode the light ones. Never put `--warn` or `--bad` text straight onto the hero.

Contrast (calculated from the tokens, 30 Oct): on the hero, text on the identity lozenge and the status chips, and
status text, is 6.0–10.2:1 in both appearances. Accent on the card is 7.3:1 (light) and 8.9:1 (dark). The list pills
(`.pill`) were not re-measured in this change.

## Type and spacing
Overpass (body and display) and Overpass Mono (every time, with tabular numerals). Body 15 px; hero time 52 px;
hero option time 34 px; hero labels 11 px uppercase; pills 11 px bold. Single column, at most 560 px wide; 16 px
side gutter (respecting safe areas).

## Components
- **Hero** (`.hero`): the one strong area. Label, big time, then lozenge, flags, steps, status strip, source note.
- **Lozenge** (`.hero .slack`): an identity or situation line in hero blue. For a train you're on, its status sits
  *inside* it as a chip (`.slackst ok|warn|bad`): `[You're on the 08:00 Great Northern (About 2 min late)]`. It
  wraps as one piece at 320 px. A lozenge whose meaning *is* a status (for example "At the station about …" on
  your way) takes `.slack ok|warn|bad` as a whole.
  A lozenge naming one tube line takes that line's TfL colour (`.slack circle|met|hc`, Sam, 30 Oct): identity, not
  status, always with the line's name in it. Circle yellow is close to caution; the name keeps it distinct.
- **Status text on the hero** (`.stat ok|warn|bad`, `.latetxt` red, `.latetxt.warn` amber).
- **Pills** (`.pill ok|warn|bad|info`): flags on options and rows. `info` is neutral (for example "Timetable only").
  Every live train has a delay pill.
- **Rows** (`.row`): the full board. `.best` is tinted with the accent; `.missed` strikes the time in red;
  `.gone` fades.
- **Banners** (`.banner warn|bad|note|info`): notices, graded by impact.
- **Chips** (`.chip rail|circle|met|hc`): route identity.

## Known gaps
- Rows show "07:00 exp 07:03" as plain text; the band is carried by the row's pill, not by the expected time.
- The Tube legs have no live delay figure, so their lozenges are identity only.
- No real-iPhone, VoiceOver or large-text check yet. Contrast was measured from the tokens, and the lozenge was
  checked in a browser at 320 px.
