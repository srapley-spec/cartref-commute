# Journey simulator scenario coverage audit
Status: Audited against source; **NOT end-to-end validated** (30 October 2026).

## Sources examined
- `src/core/present.ts`: available presentation states
- `src/core/situation.ts`: direction, station, rail/tube identity and location inference
- `src/core/refresh.ts`: source-specific refreshing and caching
- `src/core/adapters/darwin.ts` and `tfl.ts`: expected provider payloads
- `src/page.html`: provider selection, network calls, settings, manual overrides, GPS and persistence
- `src/core/profiles/sam.ts`: station, line and place geometry
- `src/simulator/controller.js`, `feeds.js`, `clock.js`

## State/scenario matrix
| App state or behaviour | Simulator capability | Verification status |
| --- | --- | --- |
| Awaiting GPS / permission denied | Not yet injected | GAP |
| Home, leaving now/by/at | Home fix; synthetic clock and boards | UNVERIFIED |
| Walk to Letchworth; at LET | Checkpoints; 09:00 arrival fixture | UNVERIFIED |
| Train available versus missed | Multiple GN/TL train IDs | UNVERIFIED |
| Wrong train, ambiguous train, manually selected train | Multiple candidates but no selection/identity test | GAP |
| On National Rail, progress and arrival | Linear GPS + Darwin Service Details | UNVERIFIED / fixture consistency requires tests |
| GN → King's Cross interchange | Waypoints and metro responses | UNVERIFIED |
| Thameslink → Farringdon interchange | Waypoints and metro responses | UNVERIFIED |
| Underground eastbound, passing Barbican, reaching Aldgate | Approximate waypoint + tube arrivals | UNVERIFIED |
| Walk from Aldgate; arrive office | Checkpoints | UNVERIFIED |
| Reverse office→LET through either hub | Reversed checkpoints + afternoon rail candidates | UNVERIFIED |
| On tube home / choose correct London station | TfL arrivals, but no vehicle continuity assertions | GAP |
| Near home after leaving train | Reverse home endpoint | UNVERIFIED |
| Cancellation / unknown delay / disruption warnings | Not yet injected | GAP |
| Speed/accuracy jitter, underground loss, teleportation | Not yet injected | GAP |
| TfL rate limit, Darwin failure, offline recovery | Existing test suite; synthetic provider not exercising failures | GAP |
| Alternate routes and leisure/any-point | Synthetic route set is commute-only | GAP |
| Stale in-flight live responses across switch | No generation isolation at transport boundary | GAP |
| Real clock live-feed-only GPS simulation | Existing mode; no regression proof | UNVERIFIED |

## Architectural requirements and acceptance
1. Virtual clock must drive both page `Date.now` / `new Date` and synthetic feed `now`; pause must freeze simulation time and only continue advances it. In the web shell a scoped `Date` is used, *not* global override. Verify every clock-sensitive dependency.
2. Scenario time and provider arrivals must be consistent. At 09:00 LET, GN 09:05 vs 09:17 and TL 09:12 vs 09:27 remain identifiable. Reverse services should be afternoon departures, not already departed morning services.
3. A route branch and direction should select a *particular* service with a tracked identity; feeds must still offer alternatives. No direct engine bypass.
4. All network requests when simulated feeds enabled must return synthetic data, or explicit unsupported-error fixtures; never silently leak to live API.
5. Validate cancellation, delay, out-of-service, missed boarding, uncertain train, train selection, tube loss, switching sources and stale async responses.
6. Restore original clock and cached state when turning feed switch off, including after background/reload.
7. Run `npm run build && npm run ci` and independent mutation/review tests before marking ready.

## Current implementation warning
Initial synchronization is a **prototype**, not yet a verified complete scenario harness. It has a clock module, clocked page time and feed timestamps, and route checkpoint advancement. GPS waypoint coordinates are coarse; network responses and clock/route schedule are not yet proven mutually consistent for every state. Existing generated `index.html` is stale (connector blocked generated file update). Do not merge.
