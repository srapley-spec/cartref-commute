# Signal stable information placement — 1 Nov 2026

This is a bounded presentation refinement of the current Signal build, requested by Sam's live screenshot.
Routing, ranking, feeds, clocks, saved data and location handling are unchanged. The release takes the default
fast path after clean committed-HEAD CI; exact post-push GitHub Tests and Pages must still be checked.

## Candidate browser evidence

Production `index.html` SHA-256:
`aa19bf204f3d1c3f52ea7e2fec47f6eb73fa11113c5e47a285018fa18e5b957a`.

- `python tests/browser-signal-stable-layout.py` passed six light/dark × 320/393/430 px cases, each repeated
  with long/absent platform evidence, expanded Next best, refreshed disclosures and 200% computed text.
  It measures the actual total badge's left inset and offset below headline times in the primary answer,
  Next best and every planning row. Platform changes preserve the exact anchors and canonical duration values.
  Cancelled/unknown durations remain explicitly unavailable, disabled Follow is retained, and affected actions
  meet the 44 × 44 px minimum. Results and screenshots are `signal-stable-*` in the session artifact directory.
- `python tests/browser-ui-parity.py` passed eight design/appearance/width combinations: 48 ordinary view
  scenes, 48 enlarged-text scenes, eight Follow scenes, four inferred rail scenes repeated at 200%, and two
  Tube connection fixtures. Source facts, status and actions remain equivalent in Panda and Signal. There
  were no page errors, horizontal overflow or time/action collisions. Its report is
  `ui-parity-browser-results.json` in the session artifact directory.
- Screenshots at 320 and 393 px were visually inspected in light and dark appearances. The neutral total pill
  sits first on its own duration row. Route labels have the full card width, and the action sits beside the
  countdown. Narrow-screen review caught a wrapped “Unavailable” label; the consistent 96 px action slot
  fixes it, and the final browser checks above passed afterwards.

## Regression evidence and limits

All 22 existing golden scenarios passed without re-recording. Focused tests passed for field preservation,
compact planning, disclosure restoration and all 26 supported design/surface parity contracts. The old Signal
field-preservation assertion compared the exact inline sentence order; it failed on the intentionally moved
duration. It now compares each service's facts, flags, alternative stops and actions, while keeping exact
request, alert and diagnostic checks. No timing-sensitive test behavior was changed.

The historical compact-v2 browser density quotas predate subsequent exposed-disruption and duration changes.
This refinement uses measured anchor stability and the current parity browser checks; it does not claim the
older fixed-height quotas pass. Long service details and enlarged text retain natural vertical growth. Native
iPhone Safari and VoiceOver were not available; Chromium text stress is not a full hardware/accessibility audit.
The final committed-HEAD CI result and exact GitHub Tests/Pages outcomes belong in the release report.
