# Developer journey simulator
Status: Partly done (feature branch, pending independent review and CI) · Since: 30 Oct 2026 · Issues: #32

## Story
As a developer, I want to inject manual coordinates or replay a representative route in the real app, so that I can exercise journey inference with genuine transport feeds while at my desk.

## Where it came from
30 Oct 2026: repeated physical commuting is too slow for validating GPS-dependent app transitions. Existing deterministic jsdom and golden tests remain essential.

## Acceptance criteria
- Settings → Experimental → Developer journey simulator enables the panel, off by default. Disabling ends any active simulation and returns to real GPS. This is a user-facing feature switch, not authentication.
- Enable in Settings. Jump among six sample positions or enter valid latitude/longitude.
- GPS fixes pass through the existing `onPosition` handler. Browser GPS watch is stopped; late real watch callbacks must not override injected fixes.
- Real clock and existing API endpoints remain in use; playback does **not** represent historical departures.
- Select and replay either direction (Letchworth→office and office→Letchworth), with 1×, 5×, 20× speeds for both; the route is straight-line waypoint interpolation, NOT mapped tracks, and can cross unrealistic terrain.
- Visual bar must remain present while simulated and offer Stop & reset.
- In simulation the normal `save()` is suppressed. On exit restore pre-simulation `state.saved`, clear transient inferred train/hub state and request a real GPS watch.
- Reload exits simulation. No historical replay, virtual clock, map tap, recorded network data, fault injection or trace export yet.

## Tests
- tests/simulator.test.mjs: "developer simulator defaults off and toggles from Settings"
- tests/simulator.test.mjs: "simulated fixes do not overwrite persisted journey context"
- tests/simulator.test.mjs: "playback starts at the selected end and supports multiple speeds"
- Gaps: stale callbacks, rapid provider toggling, async requests, GPS permission changes and refresh-count limits still require tests **before merge**.
- Existing `npm run ci`, golden, mutation and GitHub Actions required before merge.

## Modular implementation
- `src/simulator/controller.js`: dependency-injected simulation lifecycle, GPS generation guards, playback, state reset and panel handlers.
- `src/simulator/panel.html`: developer controls and styles.
- `src/page.html`: settings switch, GPS handler integration, simulator factory initialization and two build placeholders.
- `tools/build.mjs`: embeds the two simulator assets into the static `index.html` / preview build, preserving GitHub Pages deployment.
- No simulator functionality is added to `src/core/`; the underlying inference engine remains reusable.

## Known risks / review blockers
- Session-level in-memory persistence isolation must be independently tested across all user interactions and pending asynchronous callbacks.
- The Settings feature switch is **not a security boundary**. It must default off; risk of accidental enablement requires review.
- Location interpolation is a crude approximation; inference accuracy cannot be validated against track geometry.
- App time is actual current time, so speeding coordinates will not speed timetable or real train movement.
- Review all pending in-flight API responses and retry timers for contamination after reset.
- No reviewer has signed off; do not merge yet.
