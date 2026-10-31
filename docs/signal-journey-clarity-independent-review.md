# Independent review: Signal journey clarity

Reviewed 31 October 2026 by a separate agent that did not implement production code.

**Result: satisfied with the production changes and regression coverage. All 25 deliberate mutations were caught. No production findings remain open.**

## Reviewed checkpoint

- Production source: `c7320b01dd7aba8bd42eabd0fec4024f68daecee`.
- Generated page SHA-256: `52c1490bddc4594ef34475f37d25dc8b27af69c52ed6028d14caefc0a508f9c7`.
- The independent checkout started at current `origin/main` (`0031e54`), then checked out the exact candidate detached. Mutations ran only in that checkout; none entered the implementation branch.
- A test-only addition subsequently strengthens the existing real-page test with Signal → Panda → Signal on a selected live train. It was tested against the checkpoint, killed the feature-switch mutation, and was supplied for the final branch commit. Production source and generated page are unchanged by that addition.
- Final committed-head CI and the exact post-merge Tests/Pages checks remain the release owner's gates; this review does not substitute for them.

## Scope and conclusions

The review covered the configurable disruption policy and its train, warning, presentation, fallback, Follow and progress consumers; actual remaining-leg relevance; source freshness and identity; the Service Details adapter; location diagnostics; feature switches; and preservation of the latest main's Tube and Follow improvements.

The shared policy owns the agreed 5/15 minute bands, five-minute board lookback, affected-train count, and Tube status categories. Overrides reach actual rendered status and train flags, rather than only pure helper tests. Minor Tube delays retain their warning meaning when opened but are not promoted globally. Significant remaining-route impacts survive higher-priority feed failures.

The intended shared-behaviour corrections are explicit and tested: arrival-with-no-estimate contributes to the affected count; Service Closed (TfL code 20) outranks a simultaneous Good Service entry; and active observations overlay the same boarding service without inventing an additional affected train. Identity includes the scheduled service day and boarding point, protecting reused IDs and midnight delays.

The new progress adapter reads existing observations and itinerary outputs. It adds no fetches, endpoints, refresh frequency, service selection, routing, ranking, GPS watches or persisted schema. The latest main's terminating Metropolitan departure handling and guarded westbound homeward predictions remain intact. The generic Tube prediction helper additionally accepts the recorded Northbound Metropolitan platform at Aldgate; unknown or mismatched direction, line, vehicle or target cannot become live evidence.

## Counterexamples resolved during review

These checks exercised actual reachable states, not just the presence of text in hidden markup:

- A cloned active service previously counted twice and could falsely reach the two-train disruption threshold. The newer observation now replaces its matching board record without changing the board.
- A fresh current-train report could predict a 20-minute arrival delay while an older departure board said on time, leaving the significant alert hidden. Validated progress evidence now supplies the current impact and its cause.
- Confirmed boarding with unavailable GPS must retain the current rail problem and fold the completed homeward Tube leg. An explicitly picked train also retains its cancellation after the board lookback without enabling Follow.
- A residual arrival prediction must not clear an explicit current cancellation/no-estimate incident or erase its cause. Provider/controller recovery clears the incident; drawing the UI does not rewrite its source.
- The Tube guard permits a small provider clock offset. The headline and progress bar now share its accepted result using the validated fetch-capture time, while retaining provider freshness validation and exact cache expiry.
- Old completed outbound rail data must not produce a foreground stale-train alert on the Tube. Old onward rail data remains important on the homeward Tube.
- A canonical fast-walking itinerary must not replay its original longer access budget and overlap the train. Visual stages use the actual emitted itinerary times.
- A future `actual` value in a cached observation must never become a new report merely because the clock advances. Stale reported progress remains frozen and loses fresh ahead/behind claims.
- Manual direction must not hide location diagnostics. Stale, coarse and denied-location states remain visible without restarting location permission or watches.

## Independent tests and mutation evidence

The independent baseline passed **26 tests**: seven policy tests, eight progress tests and eleven real-page tests. Real-page visibility checks examine ancestors, computed visibility and native closed disclosures. A separate run of 52 existing/new focused core tests also passed, including released-main Follow regressions and the recorded Tube fixtures.

| Mutation | Check that caught it |
| --- | --- |
| Train rules ignore configured bands | Custom policy across public train/option/warning/Follow consumers |
| Summary ignores configured bands | Same custom policy across the presentation summary |
| Arrival unknown omitted from affected count | Unknown-arrival count and configurable threshold boundary |
| Lookback reverts to a hardcoded five minutes | Custom two-minute lookback, including its exact boundary |
| Active service matching uses object identity only | Cloned active record must overlay one physical service |
| Tube severity becomes numerical minimum | Mixed Good Service/Service Closed across all consumers |
| Minor Tube status is always promoted | Configurable significance versus semantic severity |
| Service-specific reason is dropped | Actual visible serious-service cause before opening Travel alerts |
| Missing identity is accepted as live | Explicit identity match required for live progress |
| Future cached actual becomes valid as time passes | Observation-time constraint and immovable confirmed progress |
| Stale reported bar becomes a time fraction | Frozen calling-point progress at a distinct observation fraction |
| Expected arrival becomes its own timetable baseline | Signed early/late comparison against the original schedule |
| Fast access replays its original segment budget | Frozen canonical fast-walk itinerary cannot overlap rail |
| Northbound terminus platform is rejected | Recorded Aldgate Metropolitan prediction fixture |
| Valid current Service Details impact is discarded | Real-page 20-minute arrival delay with an on-time board |
| Residual report clears a board cancellation | Actual Follow boarding, cancellation, residual report and recovery |
| Location diagnostic is hidden | Visible manual-direction diagnostic, denied/coarse/stale states |
| Completed rail staleness remains foreground | Outbound Tube completed rail versus homeward onward rail |
| Provider clock offset breaks bar evidence | Same accepted Tube observation must drive headline and bar |
| Separate serious impacts collapse into one | Simultaneous feed failure, cancellation and two Tube impacts |
| Picked cancelled train loses active context | No-Follow picked service beyond the board lookback |
| Tube line identity guard is removed | Wrong-line prediction cannot become live in either view |
| Tube cache remains accepted at exact expiry | Existing independent clock-offset/cache-expiry regression |
| Scheduled service-day identity is removed | Reused provider ID on another service day must remain distinct |
| Progress ignores the Signal feature switch | Actual selected train toggled Signal → Panda → Signal |

The first reduced test selections left two mutations alive. Removing a service reason was already caught by the existing actual-page cause assertion when that reached fixture was run. Removing the new progress feature guard exposed a coverage gap in older switch tests: they did not reach the new bar in Panda. The added toggle assertions close that gap, preserve the selected report and original Panda diagnostics, and verify unchanged request lists. Both survivors were rerun and killed; there are no unexplained survivors or invalid-build kills.

Session evidence is retained under `/workspace/scratch/signal-clarity-independent/`: `baseline.log`, `mutations-first-pass.json`, `mutations.json`, `mutant-01.log` through `mutant-25.log`, and the isolated mutation runner. The durable regression files are:

- [Policy review tests](../tests/core/disruption-review.test.mjs)
- [Progress review tests](../tests/core/journeyProgress-review.test.mjs)
- [Actual-page review tests](../tests/signal-journey-clarity-review.test.mjs)
- [Existing Tube guard regressions](../tests/core/followTube.test.mjs)
- [Policy identity, recovery and boundary tests](../tests/core/disruption.test.mjs)

## Visual evidence and limits

The separate [native Chromium review](signal-journey-clarity-browser-review.md) passed against the frozen page hash above. Primary, Next best and list text anchors agree at 393 px (`25 / 196.49–196.50 / 368`) and 320 px (`21 / 159.98–159.99 / 299`). Its 20 guided scenes also passed at 200% text size, with no overflow or time/action collision, 44 px touch targets and 4.5:1 contrast checks. Long destination labels and No estimate remain readable.

Live-data limits are represented explicitly. Rail progress marks confirmed calling points rather than inventing a position between them. Tube intermediate stations are route topology; a live destination arrival still yields estimated position, not reported passage at each stop. Missing earlier itinerary history is labelled. Stale, unmatched and modelled observations cannot make fresh ahead/behind claims. These limits are intentional and are covered by the tests; the review does not claim that finite tests prove every possible provider response or eliminate every regression.
