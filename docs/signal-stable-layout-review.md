# Signal stable information placement — 1 Nov 2026

Historical review of the first left/right duration layout. Sam subsequently approved a centred **Total journey**
row in both Plan and Live; the current contract is in [Signal acceptance](stories/signal-design-system.md#stable-glance-layout-sam-1-nov-2026).

## Centred revision evidence

The centred candidate's `index.html` SHA-256 is
`1dedd8b154c6a7a1184ab1ccb6e7cf1b95d9d85f2400bdd9882195068e42f026`.

- The updated `browser-signal-stable-layout.py` passed six light/dark × 320/393/430 px combinations. It checks
  the actual Total journey centre below the time row in Plan, Live and station boards, repeats all three views
  at 200% text, and checks Follow centring. Expected departure keeps its original centre column. Long/missing
  platforms, unavailable totals, disabled actions, expanded Next best and refreshed disclosures retain their
  facts and anchors. Train duration has a separate centred caption below the lozenge.
- `browser-ui-parity.py` passed all eight design/appearance/width combinations: 48 ordinary and 48 enlarged
  view scenes, eight Follow scenes, four inferred rail scenes repeated at 200%, and two Tube fixtures. There
  were no page errors, horizontal overflow or time/action collisions.
- All 13 focused Signal page tests passed. The preservation test now compares numeric/readable duration facts
  and unavailable states independently of Signal's explicit label; Panda keeps its existing inline wording.
  Phone screenshots were visually inspected. Full committed-HEAD CI and exact main deployment checks remain
  release gates, with their final outcome recorded in the PR. Native Safari/VoiceOver remain unverified here.

This is a bounded presentation refinement of the current Signal build, requested by Sam's live screenshot.
Routing, ranking, feeds, clocks, saved data and location handling are unchanged. The release takes the default
fast path after clean committed-HEAD CI; exact post-push GitHub Tests and Pages must still be checked.

## Original candidate browser evidence

Production `index.html` SHA-256:
`4777d7341150e45fa207098ff53bbd281cced5534332c8d88a7abecdf8b9b954`.

- `python tests/browser-signal-stable-layout.py` passed six light/dark × 320/393/430 px cases, each repeated
  with long/absent platform evidence, expanded Next best, refreshed disclosures and 200% computed text.
  It measures the actual total badge's left inset, train duration's right inset and offset below headline times in the primary answer,
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
