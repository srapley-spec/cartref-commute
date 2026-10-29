# Signal review package

Signal was selected by Sam on 29 October 2026. Start with [the specification](../design-system.md) and [the architecture approval register](../architecture.md#signal-presentation-architecture-29-oct-2026).

## Preview

Download or check out this branch and open `signal-preview.html` in a browser. Alternatively serve the repository with `python3 -m http.server 8000` and open `http://localhost:8000/docs/design/signal-preview.html`.

GitHub's file viewer displays source, not an interactive page. The preview is not published to the live app. It contains the selected Signal direction plus the unselected Journey comparator for review history. Use the variant picker below the phone. Change Journey state above the phone to simulate evidence; in Auto the view follows it. Pin Plan, change the journey state, then Return to Auto to test the override. Appearance supports System, Light and Dark.

All journey values are illustrative. The preview does not request location, credentials or rail APIs. Some preview helpers/icons use pinned CDN libraries, so full rendering may need internet access. It uses local preview state storage. Full Settings/Leisure and several failure states are documented rather than implemented.

## Consume

- `signal-tokens.json`: semantic colour pairs, spacing, typography and touch targets. Map semantic roles into CSS or native assets, not the prototype's raw selectors.
- `../design-system.md`: preservation matrix, component contracts, states and implementation gates.
- `../stories/signal-design-system.md`: acceptance criteria and missing implementation coverage.
- `review.md`: independent review, fixes and known limits.

Do not import the demonstration JavaScript into the production engine. The same selected service/engine outputs must feed Planner, Live, future widgets and native summaries. Proposed policies are not approval to change behaviour.
