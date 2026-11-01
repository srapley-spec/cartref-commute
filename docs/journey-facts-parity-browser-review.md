# Journey facts and UI parity: browser review

The complete native Chromium run passed against the frozen built page SHA-256
`c3e08873e2db816cdd93306ff6a1f6fce10e966b5834cc4e20ca0c5f86b69c21`.
The script checks that hash before and after the run. The immutable before-change page was taken from
`12920047c6a57055cbfccb898ef65a53e1130f96`, including the latest released Live station board and simulator changes.

## Reproduce

With Python Playwright and Chromium installed, run from the repository:

```sh
npm run build
python tests/browser-journey-facts.py
```

`CHROMIUM_PATH` overrides `/usr/bin/chromium`; `UI_PARITY_ARTIFACT_DIR` overrides `/workspace/scratch`.
The browser loads every supported design from `config/ui-parity.json`. The separate automatic parity gate
covers the complete registered surface matrix; this visual check adds actual phone geometry and visibility.

## Passing checks

- **48 before-travel scenes:** Panda and Signal × light/dark × 320/393px × home/station × Auto/Plan/Live.
  The same canonical service has identical visible train/total durations and arrival-first qualifications in
  comparable views. Checks include the new nested Live board rows and the collapsed Next best summary.
- **48 enlarged-text scenes:** the same scenes at 200% computed text size. Durations remain visible; times
  and actions do not collide; no horizontal page overflow. Signal retains its common time-column anchors at
  standard size. Enlarged rows reflow vertically instead of shrinking or hiding information.
- **Four actual guided train scenes, repeated at 200%:** Panda and Signal at 320/393px show current train and
  whole-journey durations from the established itinerary and current arrival. The production simulator,
  controller and renderers establish the journey; markup is not substituted.
- **Eight Follow cases:** the selected route exposes canonical current durations and remains selected while
  Plan is pinned. Disabling Follow still leaves Auto, Plan and Live available in every design.
- **Two actual Aldgate connection fixtures:** Panda and Signal at 393px dark, each tested in Auto/Plan/Live
  and again in Auto/Live after choosing a later Tube. These ten comparison scenes also pass at 200% text.
  Connection totals include the selected Tube and its actual waiting time, using its established latest leave
  time rather than an unrelated rail plan's access start. The 17:39 connection retains the existing
  arrival-first badge after choosing the 17:45 departure.
  Once travelling, both designs expose the qualified current-leg duration (`~7 min Tube`), without inventing
  a missing whole-journey start.
- **Readable facts, not hidden attributes:** displayed duration text and numeric values are checked against
  raw existing itinerary intervals, independently of the new fact-formatting helper. Unknown/cancelled
  durations remain explicitly unknown rather than zero; unusable services are retained.
- **Affected controls:** Auto/Plan/Live and Follow targets meet 44px width/height checks. All browser cases
  finish with no page errors.

## What changed on the phone

The released Live row omitted train duration, total duration and the route's existing arrival-first flag,
although Auto/Plan already exposed them. Both designs now expose the same facts. The rail fixture deliberately
distinguishes earliest arrival from shortest duration:

| Departure | Train time | Total time | Existing comparison |
| --- | --- | --- | --- |
| 04:55 Great Northern | 51 min | 1h 37m | Arrives first |
| 05:20 Thameslink | 44 min | 1h 25m | No arrival-first badge |

The 23-word Live explanation is now the shared five-word sentence, **“Auto shows when to leave.”**
The existing departure heading supplies its station context.

The broader parity check exposed two actual Panda accessibility gaps. Auto/Plan/Live controls were only
30.84px high; they now meet the shared 44px minimum. At 200% text, a station view overflowed to 455px on a
393px viewport and time/status fields overlapped. A Panda-only shared container query now reflows the main
card and all board/list rows in the same semantic order. A narrow-screen train arrival also cropped at 200%;
its responsive base size now allows the complete enlarged time to fit. Signal styling was not changed by
these Panda reflow rules.

## Artifacts and limits

Session artifacts are outside the repository under `/workspace/scratch`: `ui-parity-browser-final.log`,
`ui-parity-browser-results.json` (hash-bound facts and geometry), `ui-parity-before.json`, and
`ui-parity-{before-,}*.png`. Preliminary failure logs/screenshots preserve the Panda findings before their fixes.

These checks run the real application with controlled transport observations and simulator GPS. They prove
rendering, value consistency and state preservation, not current provider availability or physical GPS accuracy.
No live credentials are used. Chromium is covered; native iPhone Safari and VoiceOver remain unverified.
The 200% stress doubles visible computed text sizes; it is not a complete accessibility audit. Geometry checks
cover the commuter cards and affected view/Follow controls, not the development simulator dock.
