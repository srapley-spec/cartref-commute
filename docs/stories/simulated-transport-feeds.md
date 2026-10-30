# Synthetic Darwin and TfL feeds
Status: Partly done (final release gates pending) · Since: 30 Oct 2026 · Issues: #34

## Story
As a developer I need coordinated synthetic boards, service progress and Underground predictions,
with alternatives, so that the real engine determines which service I am on and plans onward travel.

## Acceptance criteria
- Independent session-only Transport Feed Simulation switch, off by default, intercepts requests before network access. GPS simulation is independently selectable.
- Synthetic RDM, proxy and Huxley boards and Service Details pass through the production adapters. Distinct GN/TL services remain visible in both directions, including later departures and intermediate calls.
- The shared virtual epoch anchors all service dates across midnight. Actual calling-point reports appear only as their expected times pass. Delays move scheduled/expected times consistently; cancellation retains the cancelled service and usable alternatives.
- TfL vehicles keep fixed identities and expected arrival times across stations, decrease their countdown with virtual time and disappear after departure. Eastbound vehicles reach Barbican/Aldgate; westbound vehicles serve Farringdon/King's Cross. Return Circle services go to Edgware Road, Metropolitan to Uxbridge.
- Missed connections delay the passenger rather than moving every departure. Disruption changes service status and timings. Provider outage/recovery uses real application error handling.
- Source epochs guard requests, body parsing, cache writes, retries and diagnostic captures. Unsupported synthetic URLs return explicit errors without contacting live providers. Response text supports diagnostic capture; TrackerNet is explicitly unsupported.
- London Journey Planner fixtures support short walking journeys and illustrative longer journeys for bounded London coordinates and Science Museum/SW7 2DD. Unknown endpoints fail explicitly; this is not a worldwide fixture catalogue.

## Tests
- tests/simulated-feeds.test.mjs: "separate feed switch defaults off and synthetic transport requests avoid live fetch"
- tests/simulated-feeds.test.mjs: "Aldgate diagnostic capture reads synthetic text and refuses TrackerNet without live requests"
- tests/simulator-providers.test.mjs: "synthetic delay cancellation and platform changes preserve competing services"
- tests/simulator-providers.test.mjs: "TfL predictions progress by stable vehicle across stations and freeze while paused"
- tests/simulator-providers.test.mjs: "return Underground services travel west with coherent Farringdon and Kings Cross timing"
- tests/simulator-providers.test.mjs: "scenario epoch survives midnight without moving rail or TfL fixture identities"
- tests/simulator-providers.test.mjs: "provider URL variants and unknown URLs remain entirely synthetic and outages recover"
- tests/simulator-providers.test.mjs: "TfL timetable returns only trains for requested endpoints and passes production adapter"
- tests/simulator-providers.test.mjs: "uncertain scenario retains competing services with indistinguishable nearby reports"
- tests/simulator-providers.test.mjs: "local Journey Planner supports office walking and alternative London starts without rail legs"
- tests/simulator-providers.test.mjs: "missed connection preserves departure times and changes the vehicle still available to board"
- tests/simulator-providers.test.mjs: "return Circle destinations are valid for the line while Metropolitan services continue to Uxbridge"
- Parameterised production-adapter contracts cover both rail routes and directions in the same provider test file.
- Application scenario assertions and results: [coverage matrix](../simulator-scenario-coverage.md).

## Limits and release gates
GPS geometry is approximate. Synthetic service identities label fixtures, not real scheduled trains.
The eight-minute delay scenario models a corridor signalling restriction affecting competitors too;
coincident individual trains cannot always be identified from GPS. No fixture injects an engine lock.
Local London journey durations are illustrative estimates. Real device/live-data validation remains
separate from deterministic scenario verification. Full tests, committed-code CI, independent final
review, branch GitHub CI and merged-commit CI are required before marking released.
