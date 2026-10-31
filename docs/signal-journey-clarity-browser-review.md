# Signal journey clarity: independent browser review

Reviewed candidate `c7320b01dd7aba8bd42eabd0fec4024f68daecee` with native Chromium through Python Playwright. The complete run passed against the unchanged built `index.html` SHA256 `52c1490bddc4594ef34475f37d25dc8b27af69c52ed6028d14caefc0a508f9c7`; the test checks this hash before and after execution. Baseline screenshots and measurements use the immutable built page from `0031e5478265f50a80c60845465e4d1fcf97e79e`.

## Reproduce

Run from the repository with Python Playwright and Chromium installed:

```sh
npm run build
python tests/browser-signal-journey-clarity.py
```

`CHROMIUM_PATH` overrides `/usr/bin/chromium`; `SIGNAL_CLARITY_ARTIFACT_DIR` overrides `/workspace/scratch`. To recreate the baseline, create `/workspace/scratch/signal-journey-clarity-baseline/`, save `git show 0031e5478265f50a80c60845465e4d1fcf97e79e:index.html` as its `index.html`, then run the same script with `--baseline-only` (use the configured artifact directory if overridden).

## Passing checks

- **20 actual simulator scenes:** walking to Letchworth, station departure board, train at Stevenage, selected Metropolitan train, and office/planning; each at 393px and 320px in light and dark. All four complete guided journeys finish with zero runtime verification failures.
- **20 text enlargement scenes:** each scene at 200% computed text size. Time groups consistently stack at this size, without horizontal page overflow or overlapping times/actions. This deliberate accessible layout differs from the three columns at standard text size.
- **60 disruption cases:** minor/background/facility/unrelated notices remain folded; 5/14-minute rail delay, 15-minute delay, cancellation, no estimate, severe Tube delay and closure remain visible before the journey. Later planning qualifies current disruption as current evidence rather than a future forecast. Full explanations and National Rail links remain accessible.
- **36 location cases:** manual and Auto directions, available/pending/denied/unavailable fixes, and stale fixes. The diagnostic remains visible without restarting the location watch; guided train/Tube/office scenes identify their current phase.
- **12 appearance overrides:** light, dark and system settings under both device appearances and widths.
- **Progress evidence:** parsed Service Details produce 3 minutes ahead and 7 minutes behind; the latter also exposes a significant rail alert despite an on-time departure board. Stale/timetable-only rail evidence loses live claims. Matching fresh Tube vehicle/line/destination/direction updates progress and the headline; wrong vehicle and stale observations change neither. Tube physical position remains qualified as estimated. Calling-point times share their row despite wrapped station names.
- **Remaining legs:** while actually riding the selected Met train, significant Met disruption shows; unused Circle/H&C disruption, completed rail cancellations and completed rail freshness warnings do not become prominent route alerts.
- **Preservation/accessibility:** Follow, explicit Plan while following, reload, Signal/Panda switching and saved route restoration, plus retaining cancelled trains in the full board. Visible controls meet 44px targets, sampled text meets 4.5:1 contrast, and page width stays within the viewport, including text enlargement.

## Measured alignment

Values are rendered glyph anchors in CSS pixels: left edge / Expected centre / destination right edge. Labels are checked against the same anchors, within 1.5px. Light and dark measurements agree.

| Width | Station row | Before | After |
| --- | --- | --- | --- |
| 393 | Primary | 26 / 176.37 / 330.16 | 25 / 196.49 / 368 |
| 393 | Next best | 88.03 / 212.62 / 340.61 | 25 / 196.49 / 368 |
| 393 | First list row | 25 / 171.78 / 317.39 | 25 / 196.50 / 368 |
| 320 | Primary | 22 / 145.32 / 273.28 | 21 / 159.99 / 299 |
| 320 | Next best | 84.03 / 182.65 / 282.67 | 21 / 159.99 / 299 |
| 320 | First list row | 21 / 146.11 / 270.06 | 21 / 159.98 / 299 |

Planning uses the same left/right anchors with no Expected field: at 393px its primary/list arrival anchors move from 290.75/222.89 to 368/368; at 320px, from 254.25/186.39 to 299/299. The next-best label sits above its time grid. Long destination labels and “No estimate” remain legible.

Restoring diagnostic text and aligning full rows increases total station page height by 34px at 393px and 52px at 320px; planning increases by 138px/148px. Train/Tube pages grow to accommodate the newly requested overall/current-leg diagrams and their evidence. The test permits vertical growth while rejecting horizontal overflow or overlapping content.

## Artifacts and limits

Artifacts remain outside the repository in `/workspace/scratch`: `signal-journey-clarity-final-run.json` (passing counts), `signal-journey-clarity-after.json` (hash-bound measurements), `signal-journey-clarity-comparison.json` (before/after), and `signal-clarity-{before,after}-*.png`. Additional `signal-clarity-review-{before,after}-dark-393-*.png` captures hide only the simulator dock during photography, so the journey card is unobscured; application state is unchanged.

These checks run the actual application/controller/engine, with coordinated simulator GPS and controlled normalized/transport-shaped observations parsed by production code. External HTTP responses are stubbed: the run proves rendering, evidence qualification and state handling, not current provider availability or the accuracy of a real phone's GPS. It covers Chromium rather than native iOS Safari. Contrast checks sample the affected UI; this is not a complete accessibility audit. Repository core/page tests and independent policy review provide the separate non-UI checks.
