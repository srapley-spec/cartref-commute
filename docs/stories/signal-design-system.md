# Signal design system and automatic journey presentation
Status: Planned (design selected; production implementation pending) · Since: 29 Oct 2026

## Story
As a commuter, I want the appropriate planning or live journey view to appear automatically, with a manual override, so I can act quickly without losing control or information.

## Decision and evidence
Sam selected Signal after reviewing two iPhone-first mockups, requested dynamic light/dark switching, and explicitly required automatic Planner/Live switching with manual override. The source architecture remains authoritative: [decisions and proposals](../architecture.md#signal-presentation-architecture-29-oct-2026). See [specification](../design-system.md).

## Acceptance criteria — agreed direction and existing constraints
- Automatic is the default view selection; manual Planner/Live and Return to Auto are available.
- Situation, service identity, confidence, ranking and times come from the engine; view selection does not change trip direction or train identity.
- Uncertain identity asks for confirmation. Live without an active journey is explicit, not invented.
- Follow the device appearance by default; manual light/dark choices are available.
- Preserve all current commute capabilities in the specification inventory, including cancelled/no-estimate options, same-train boarding points, warnings, freshness, corrections, all modes, dates, pace, Settings and Leisure entry points.
- Preserve the station departure-first rule and the homeward Tube-to-train consequences.
- No simulated early-platform, coach or signalling-point features are presented as current capabilities.
- Red, amber and green are reserved for status (Sam, 30 Oct): never accent, identity, selection or tracking. Every
  live train, including the one you're on, shows its status as a word with minutes, coloured by band (red: cancelled,
  no estimate, 15+ min; green: on time; amber: between, lower edge 2 or 5 min awaiting Sam). Placement on the live
  card awaiting Sam. → [specification](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal)

## Additional policies agreed by Sam (29 Oct 2026)
- Override duration ends at Return to Auto or a genuinely new journey.
- Automatic transitions defer during editing, selection or expanded-notice reading.
- Tracking and important journey alerts continue while Planner is manually pinned.

## Tests
None yet (implementation gap). This change supplies documentation, tokens and a standalone review simulation; it does not implement production behaviour.

Before implementation acceptance: run existing engine/app/golden suites, typecheck, build and check-docs. Add focused UI coverage for automatic transitions, manual pinning, Return to Auto following the latest situation, state/focus preservation, no-active/uncertain identity and light/dark accessibility. Add tests for the three approved policies, including refresh/reopen persistence, interaction deferral and active-journey alert visibility while Planner is pinned. Test real iPhone, large text and VoiceOver. See specification for browser checks already performed on the mockup.
