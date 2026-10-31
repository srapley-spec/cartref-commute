# Warnings graded by impact
Status: Done · Since: 28 Oct 2026 (evening trip) · Issues: #20

## Story
As a commuter, I want warnings ranked by what they do to my own trains, so that real problems stand out and
irrelevant notices don't drown them.

## Where it came from
28 Oct evening: National Rail notices about elsewhere on the network looked as alarming as delays to Sam's train.

## Acceptance criteria
- **Red:** a cancellation, no estimate, or 15+ min late on your trains.
- **Amber:** 5–14 min late.
- **Yellow:** a notice about your route (or your operator's status) with no impact yet.
- **Grey:** elsewhere on the network, and station facility notices (toilets, lifts, escalators), folded; a
  facility notice that also mentions train disruption is graded normally.
- "Your line is disrupted" needs 2 affected trains; other trains that left over 5 min ago don't count. A genuinely
  observed active service remains relevant after that window; a stale saved option alone is not active evidence.
- Banners say they're about trains now when the plan on screen is later.
- Notice titles: first sentence, at most 90 characters, cut at a word. Links tappable; an opened notice stays open
  across refreshes. Notice HTML is reduced to text without running anything.
- Live cards state every line's status on the journey, including good service.

## Shared policy and Signal visibility (Sam, 31 Oct 2026)

Sam agreed that the compact Signal screen may fold minor or irrelevant disruption, but a significant problem
affecting the displayed journey must be exposed. Colour/severity and disclosure visibility are related but
different decisions: a minor Tube delay can retain an inline warning without requiring a large global banner.

The agreed rail bands, lookback and affected-count defaults remain unchanged. Tube visibility explicitly maps
provider statuses to the significant-versus-background distinction requested here. Policy is shared by the pure engine and accepts partial overrides
through `Profile.disruption`; callers must use the same effective policy rather than repeating values in page
templates, status summaries, Follow or CSS. No new phone preference or saved-state migration is implied.

| Configuration | Default |
| --- | --- |
| `rail.warnMin` | 5 minutes |
| `rail.badMin` | 15 minutes |
| `rail.lookbackMin` | 5 minutes |
| `rail.affectedTrainCount` | 2 trains |
| `tube.closedSeverities` | 1, 2, 3, 4, 5, 16, 20 |
| `tube.significantSeverities` | Closed severities plus 6 (severe delays), 7 (reduced service), 8 (bus service) |
| `tube.goodSeverities` | 10, 18, 19 |

- Every consumer uses the configured rail bands for flags, departure/arrival wording, route summaries and
  disruption grading. Changing the policy in a profile must not leave one screen using an old literal threshold.
- Actual relevant rail impact is exposed under the agreed red/amber rules. Route/operator notices without
  demonstrated train impact, unrelated messages and facility-only notices may remain folded. A facility message
  that also reports train disruption is not downgraded to facility-only.
- Relevant closures, suspension, severe delays, reduced service and replacement-bus service are exposed. Minor
  Tube delay (severity 9) may remain in a concise status/inline warning, but does not automatically expand its
  global detail when it has no actual train impact.
- Keep significance and route relevance explicit. A disruption on an unused alternative line must not imply the
  selected leg is unavailable. Before a service is chosen, use the engine's displayed route/corridor context.
  Once an outbound journey is on the Tube, missing/stale data for its completed rail leg is background detail.
  On a homeward Tube, the rail connection is still ahead, so its missing/stale data remains relevant.
- Show all significant relevant impacts, not just whichever one wins the status headline. Cancellation, a
  simultaneous relevant Tube closure and missing data cannot erase each other's important detail.
  Prefer the actual affected service's supplied reason over broad route-notice context; do not invent a cause
  when a delay has no reason. Older supplied warning summaries without detailed delayed-service records remain
  supported.
- A closed status outranks good/information or minor-delay status in the same response, even when its TfL numeric
  code is larger. The significance category determines precedence; numeric minimum is not a reliable shortcut.
- Both departure and arrival "no estimate" count as affected trains for the configured route-disruption count.
- A fresh report for the current service outranks an older on-time board for its arrival impact. Preserve the
  actual timetable baseline so the report's delay reaches both status and visible disruption detail.
  A residual arrival prediction does not clear an explicit cancellation or no-estimate flag. Recovery still
  comes from the existing controller/provider update, not from drawing a more favourable prediction.
- An explicitly observed current rail leg survives the normal board lookback and is deduplicated if also present
  on a board. Do not drop an ongoing disruption just because the passenger's train departed over five minutes ago.
  Explicitly confirmed boarding or a current explicit train pick also establishes the current service when GPS is unavailable; use observed service
  data rather than inventing a delay from a saved option. Disruption to an already-completed access leg is
  background context, not a new onward-travel problem.
- Keep future-plan qualifications: a current warning says "now" when it is not evidence about a later plan.
  Source errors, missing routes and stale observations remain exposed rather than being presented as good service.
  Cached rail disruption is labelled last known; a separately current Tube status is not relabelled as stale rail.
- Full notice text, links and reasons stay reachable; expanded reading survives refresh. Do not solve density
  by hiding individual cancelled/no-estimate/late train flags or filtering trains from the board.

The first compact release's one-line summary remains useful, but its blanket folding of original banners is
superseded by this significance/relevance policy. Centralisation and the mixed-status/arrival-unknown corrections
require independent review because they affect shared behaviour beyond CSS.

The central implementation is `src/core/disruption.ts`: `resolveDisruptionPolicy` supplies defaults/partial
overrides, `railDelayLevel` grades minute delays, and `worstDisruptionStatus`/`disruptionLineLevel` grade provider
statuses by category. `significantLineDisruption` separates prominence from colour. `visibleDisruptions`
returns every significant relevant impact for a shell to draw; the caller supplies relevant remaining lines and
rail evidence rather than asking the pure model to infer a journey. Existing warning/status/fallback helpers
delegate to this shared policy.
`railWarnings` also accepts an explicit active-train context for an already-observed current leg; it does not
infer that evidence from an old saved journey.
The context overlays an exact matching board observation instead of appending a cloned service as a second
train. Matching retains service ID, boarding/destination, scheduled time and service day; without an ID it uses
the exact operator and scheduled service context. Different IDs, boarding points and reused service days stay
separate. Delays crossing midnight or a current-arrival projection do not change boarding-service identity.
This overlays warning observations without editing cached boards or changing existing broad-board grouping.

`disruptionTrainObservation` creates an ephemeral observation from already-validated reported/predicted
progress. Modelled, stale and unknown progress cannot manufacture a live incident. The helper preserves explicit
board incidents/reasons, does not mutate a board or followed snapshot, and does not change the planned arrival.
Invalid or reversed rail bands fall back together to the defaults; invalid lookback/count values also fall
back. Severity arrays accept non-negative integer identifiers and are deduplicated. Overrides do not mutate
the shared defaults. Connection catchability and Follow's ahead/behind-step rules still answer their existing
separate questions; they are not replaced by the rail delay bands.

## Tests
- tests/core/disruption.test.mjs: "disruption policy: agreed defaults and legacy aliases have one immutable source"
- tests/core/disruption.test.mjs: "disruption policy: train bands retain exact agreed boundaries and unknown/cancelled semantics"
- tests/core/disruption.test.mjs: "disruption policy: profile bands flow through train flags, boards, arrivals, route warnings and status"
- tests/core/disruption.test.mjs: "disruption policy: lookback and line-wide affected count are configurable, including arrival unknown"
- tests/core/disruption.test.mjs: "disruption policy: an observed active train survives the board lookback without being counted twice"
- tests/core/disruption.test.mjs: "disruption policy: a newer active clone replaces a recovered board service without mutating that board"
- tests/core/disruption.test.mjs: "disruption policy: active overlays never merge different IDs, boarding points or reused service days"
- tests/core/disruption.test.mjs: "disruption policy: no-ID active clones match exact operator and scheduled service context across delay"
- tests/core/disruption.test.mjs: "disruption policy: a departure delay crossing midnight keeps its original service day for overlays"
- tests/core/disruption.test.mjs: "disruption policy: a current delay projection near midnight does not change boarding-service identity"
- tests/core/disruption.test.mjs: "disruption policy: closure wins over good/minor entries in every line-status consumer"
- tests/core/disruption.test.mjs: "disruption policy: severity and global visibility stay separate for minor versus significant Tube service"
- tests/core/disruption.test.mjs: "disruption policy: partial severity overrides flow through line summaries, fallback and visibility"
- tests/core/disruption.test.mjs: "disruption policy: explicit good codes do not mask another warning or trigger its promotion"
- tests/core/disruption.test.mjs: "visible disruptions: all relevant significant impacts survive a higher-priority feed failure"
- tests/core/disruption.test.mjs: "visible disruptions: data-error identity survives reorder and malformed Unicode without dropping messages"
- tests/core/disruption.test.mjs: "visible disruptions: known delayed train reasons precede broad notices and follow configured bands"
- tests/core/disruption.test.mjs: "visible disruptions: older supplied rail summaries without delayed-service records remain supported"
- tests/core/disruption.test.mjs: "visible disruptions: only supplied route evidence is promoted; notices without train impact fold"
- tests/core/disruption.test.mjs: "visible disruptions: later plans qualify current observations without qualifying their own missing data as current"
- tests/core/disruption.test.mjs: "visible disruptions: cached train impacts are explicitly last known while current Tube status stays distinct"
- tests/core/disruption.test.mjs: "disruption policy: Follow recovery and its train status use the same configured red threshold"
- tests/core/disruption-review.test.mjs: "independent disruption policy: one override reaches train, option, warnings, summary, prominence and Follow"
- tests/core/disruption-review.test.mjs: "independent disruption policy: arrival no-estimate counts and configurable lookback/count remain coherent"
- tests/core/disruption-review.test.mjs: "independent disruption policy: a cloned active observation overlays its board service rather than inventing a second train"
- tests/core/disruption-review.test.mjs: "independent disruption policy: Service Closed outranks simultaneous good service in every consumer"
- tests/core/disruption-review.test.mjs: "independent disruption policy: configurable Tube categories reach flags, fallback and visible impact"
- tests/core/disruption-review.test.mjs: "independent disruption policy: a partial good-status override cannot hide or promote an unrelated minor status"
- tests/core/disruption-review.test.mjs: "independent disruption policy: simultaneous serious impacts survive precedence and later plans stay qualified"
- tests/core/active-disruption.test.mjs: "active disruption: validated current arrival evidence promotes its delay and actual reason without editing the board"
- tests/core/active-disruption.test.mjs: "active disruption: stale, modelled and unknown progress cannot manufacture a live rail incident"
- tests/core/active-disruption.test.mjs: "active disruption: residual current predictions preserve explicit board incidents until controller recovery"
- tests/core/active-disruption.test.mjs: "active disruption: fresh no-estimate evidence remains serious and signed early timing creates no delay"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: serious service-specific cause is visible before opening Travel alerts"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: minor or unused-line disruption stays background while its full details remain reachable"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: feed priority cannot hide separate serious train and remaining Tube impacts"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: a profile threshold override reaches rendered status, train flag and visible card"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: confirmed boarding with unavailable GPS retains old current-rail problems and folds the completed Tube"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: a fresh current-train report promotes a serious arrival delay even when its board still says on time"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: an otherwise fresh arrival report preserves a current cancellation until the board explicitly recovers"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: an explicitly picked current train keeps its cancellation visible after it leaves the board lookback without Follow"
- tests/core/warnings.test.mjs: "railWarnings: red for a cancellation, no estimate or 15+ min; amber 5–14; none otherwise"
- tests/core/warnings.test.mjs: "railWarnings: notices split into your route, elsewhere, and station facilities"
- tests/core/warnings.test.mjs: "noticeTitle: first sentence, at most 90 characters, cut at a word"
- tests/core/warnings.test.mjs: "Line status: worst, ok, level, the H&C fallback, and tube flags"
- tests/logic.test.mjs: "Notices graded by your trains: yellow = on your route, no impact yet; amber = delays under 15 min; red = 15+ min, cancelled; grey = elsewhere"
- tests/logic.test.mjs: "Disruption banners say they're about trains now when the plan on screen is later"
- tests/logic.test.mjs: "Third-party notice HTML is reduced to text without running anything"
- tests/rules.test.mjs: "'Your line is disrupted' needs 2 affected trains; trains that left over 5 min ago don't count"
- tests/app.test.mjs: "Live cards say the status of every line on the journey, including good service"

## Not yet / open questions
- #20: grade from structured incidents instead of wording.
- Facility notices (lifts) matter for the [family day out](family-day-out.md); grey only for the commute.
