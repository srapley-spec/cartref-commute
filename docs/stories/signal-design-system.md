# Signal design system and automatic journey presentation
Status: Default and sole design; Panda retired 1 Nov 2026 · Since: 29 Oct 2026

## Story
As a commuter, I want the appropriate planning or live journey view to appear automatically, with a manual override, so I can act quickly without losing control or information.

## Decision and evidence
Sam selected Signal after reviewing two iPhone-first mockups, requested dynamic light/dark switching, and explicitly required automatic Planner/Live switching with manual override. The source architecture remains authoritative: [decisions and proposals](../architecture.md#signal-presentation-architecture-29-oct-2026). See [specification](../design-system.md).

## Compact v2 direction (Sam, 31 Oct 2026)
Sam requested a substantial reduction in the first Signal build's bulk, taking the readable timetable density of
Railboard and Flighty's decisive current-journey hierarchy as references. This is a compact redesign of Signal,
not a new routing system. The approved hierarchy and preservation constraints are in
[compact design review](../signal-compact-design-review.md). Its reference audit and target measurements are
separate from final candidate visual approval.

This decision intentionally revises the earlier inventory's always-exposed direction and pace controls: the
**existing functional controls** now live in **Journey options**, whose closed summary shows the effective
direction/mode and pace. No duplicate state, cloned controls or mock settings are introduced. Auto / Plan / Live
and Leave now / Arrive by / Leave around remain exposed. The compact-v2 criteria below supersede older Signal
geometry where they differ; journey calculations, current features and status semantics remain authoritative.

### Journey clarity refinements (Sam, 31 Oct 2026)
The compact design remains the visual foundation. Sam's subsequent live/simulator screenshots identify six
refinements: significant route disruption must be exposed, inferred location must remain visible, station and
planning times need shared column anchors, and rail/Tube views need overall and current-leg progress.

- **Disruption:** apply the agreed [impact rules](warnings.md), with central configuration and shared consumers.
  Significant relevant disruption must not require opening Travel alerts. Minor/unrelated detail may fold;
  severity, source/freshness and individual train flags remain truthful. The full notice remains reachable.
- **Location diagnostic:** keep a compact, visible account of where the existing inference thinks the user is,
  its source/accuracy and unavailable/old-fix qualifications. It is useful in both Auto and manual direction.
  Restoring this text does not change permission prompts, GPS watches, inference or direction selection.
- **Station columns:** primary card, Next best and every departure row share the same horizontal anchors:
  Train at the left, Expected at the centre, and the destination arrival at the right. Labels and values align
  across the page; Follow and route/service metadata cannot consume the time columns.
- **Planning columns:** Leave uses the same left anchor and arrival the same right anchor. The middle remains
  reserved when no Expected departure belongs in the planning view; a decorative arrow does not change the
  column geometry or introduce a second time. Next best is a heading above its full-width time columns.
- **Journey progress:** rail and Tube views show the overall journey's legs and a current-leg view underneath,
  using the pure [journey-progress contract](journey-progress.md). Reported/expected/modelled/stale evidence
  must remain explicit, including calling points and any live ahead/behind information.
- Apply the common geometry to the rest of the Signal UI where the same semantic fields recur. Reflow enlarged
  text without overlaps; consistency must not be achieved by clipping words or shrinking touch targets.

These refinements supersede the first compact release's blanket folding of full disruption banners and its
content-sized time columns. Existing layout and data preservation constraints remain; the feature switch was removed on 1 Nov.

### Compact v2 acceptance criteria
- Before the station, Auto and Plan expose Leave / Leave by and its precise countdown as the core product
  answer, including on-the-way departure layouts and both complete recommendations. Keep the current time columns and
  centred duration geometry. Hiding/replacing the deadline is a material change that must be flagged to Sam
  before shipping; a layout refinement does not authorise it. See the [protected requirement](../design-system.md#protected-product-answer-when-must-i-leave-sam-1-november-2026).
- Show a short masthead, always-available Auto / Plan / Live and planning-mode controls, effective journey context,
  then the current answer with one dominant time. Journey options expands to the real Commute/Leisure,
  Auto/office/home and pace controls; each changed value is reflected in the closed summary.
- Keep both recommendations complete and exposed (Sam, 1 Nov; supersedes the compact second-option summary).
  Use the same renderer and time sizes for each card, with its own service/platform/status, route/line chips,
  scheduled/expected and arrival times, duration, countdown/margin, same-train boarding alternatives, flags,
  Journey steps and Follow action. Only Journey steps folds; the second option is not a reduced disclosure.
- Keep one concise network-impact line visible near the answer. Full original banners and their full notices
  remain under Travel alerts, with a reachable control from the summary. Never hide a train-specific
  cancellation, no-estimate or uncertainty flag inside only the global disclosure.
- Lines & data contains the full line-status detail, source/model explanation and technical request/build data.
  A concise freshness label and Refresh remain available outside that disclosure. Why these trains stays
  reachable, and stale, partial-failure and unknown-source qualifications remain truthful.
- Board rows use their full width for service information, with aligned Train / Expected / Arrival where
  required, readable route/operator/platform/flags and a Follow action at least 44 px high. Density comes from
  hierarchy and less repetition, not clipped details, tiny service text or removed actions.
- In Auto/Live a followed journey is the foreground answer; other recommendations may fold beneath it,
  preserving all actions and information. Explicitly choosing Plan keeps its primary planning answer visible
  outside that fold while following and its important alerts continue. Ordinary refresh cannot fold the
  requested answer away. Tube connection choices and correction controls are extracted outside folded
  recommendations, retaining their real handlers; planning navigation preserves the selected Tube.
- Controls, disclosures, notice text, focus, selected service and entered dates/times survive ordinary redraws.
  Native disclosure contents grow naturally for long text, large type and unknown/late states; no horizontal
  overflow or overlapping actions at 320 px. Themes retain contrast and status/Tube identity colours.
- When Circle, Met and H&C are all unavailable now, the impact line says to check onward travel; it must not
  present H&C/Aldgate East as a usable resolution or assert the same closure will apply to a future plan. Existing
  warning precedence is retained for more important feed or train problems, with the onward-travel qualification
  still visible. Future Arrive by/Leave around missing-route status comes from the displayed plan, even while
  its full alerts are folded.
- Signal is the sole design for new and existing phones. An absent, false or true legacy `settings.signal`
  cannot change the renderer. Remove the design checkbox, default, branching and Panda restoration machinery.
  Preserve saved journeys, provider settings, home, timings, planning inputs and the separate Follow preference.
  The two-design parity release rule is removed; useful visible-view regressions remain.

### Stable glance layout (Sam, 1 Nov 2026)
Sam's live screenshot showed total journey time wrapping through the operator/platform sentence, and Follow
squeezing the longer Farringdon / St Pancras route onto different lines. Keep the existing compact design, but
give repeated information stable homes:

- In Signal's primary recommendation, Next best and planning/station/Live departure rows, duration occupies its
  own full-width row immediately below the headline times, before route or service text. **Centred revision,
  approved by Sam on 1 Nov:** the neutral lozenge is centred and explicitly labelled **Total journey** in Plan
  and Live, with the separate train-duration caption centred beneath it. This supersedes the first revision's
  left/right duration anchors. Route names, platform length, flags, missing durations and the Follow/Unavailable
  label cannot displace the centre anchor. Do not put duration into Live's Expected departure column.
- Both complete cards keep the same duration row visible when their Journey steps are opened, closed and
  refreshed; expansion does not move the total below the route or duplicate it visually.
- Route labels get the full row width. Service/platform and countdown have separate homes; board actions share
  a consistent right-aligned 96 px slot beside the countdown instead of competing with route chips. Enlarged
  text may expand the action and use the existing single-column reflow.
- The shared duration renderer supplies the same neutral total treatment in Signal's followed and inferred
  journey surfaces. All facts still come from `journeyFacts` / `connectionJourneyFacts`; unknown values remain
  explicitly unavailable, labelled **Total journey time unavailable** where appropriate. The label always means
  the complete journey, not time remaining. Signal retains these facts and actions across planning and live views.
- Light/dark at 320, 393 and 430 px and doubled computed text must remain readable, with no horizontal page
  overflow or overlapping times/actions. Follow retains a target of at least 44 × 44 px. Long/absent platform
  text and disabled actions are exercised through the real rendered application.

Regression checks: [browser-signal-stable-layout.py](../../tests/browser-signal-stable-layout.py) measures the
actual badge centres and offsets across cards/rows, changes platform evidence, opens/refreshed disclosures and
stresses Plan, Live and station views at 200% text, including unchanged Expected columns and Follow centring.
[browser-journey-facts.py](../../tests/browser-journey-facts.py) covers the remaining planning/Live/Follow,
inferred rail and Tube surfaces across Signal views. The ordinary journey-fact regressions check
each service's facts, alternatives, flags and actions independently of sentence order.

## Acceptance criteria — agreed direction and existing constraints
- Automatic is the default view selection; manual Plan/Live and Auto are available throughout Signal. The button always reads **Auto**, including while Plan or Live is pinned (Sam, 31 Oct 2026); selecting it clears the manual override.
- Live with no journey under way shows the next stop's departure board, not an empty state (Sam, 31 Oct). → [Live before a journey](live-station-board.md)
- Situation, service identity, confidence, ranking and times come from the engine; view selection does not change trip direction or train identity.
- Uncertain identity asks for confirmation. Live without an active journey is explicit, not invented.
- Follow the device appearance by default; manual light/dark choices are available.
- Preserve all current commute capabilities in the specification inventory, including cancelled/no-estimate options, same-train boarding points, warnings, freshness, corrections, all modes, dates, pace, Settings and Leisure entry points.
- Preserve the station departure-first rule and the homeward Tube-to-train consequences. Latest-code
  reconciliation includes original arrival, incident recovery, explicit “I’m on it”, stable same-train progress,
  explicit run/car following, quiet ordinary alternatives while on a Tube, and one-minute ETA stability.
- Known-vehicle Tube predictions may update the chosen connection only through the recorded-data validated,
  source-guarded matching path; missing/stale observations remain modelled. See [Follow a route](follow-a-route.md).
- No simulated early-platform, coach or signalling-point features are presented as current capabilities.
- Red, amber and green are reserved for status (Sam, 30 Oct): never accent, identity, selection or tracking. Every
  live train, including the one you're on, shows its status as a word with minutes, coloured by band (red: cancelled,
  no estimate, 15+ min; amber: 5–14 min; green: under 5 min; Sam 30 Oct). A departure shows Train · Expected ·
  At destination at the same size ([rule](../design-system.md#timetabled-and-expected-departure-sam-30-oct-2026-panda-and-signal);
  the preview predates it). On the live card the status chip sits inside the
  train's blue identity lozenge (Sam, 30 Oct). The preview shows this; production uses the shared engine rule
  ([train-status](train-status.md)). → [specification](../design-system.md#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal)

## Additional policies agreed by Sam (29 Oct; lifetime updated 30 Oct 2026)
- Use the newer Follow a route behavior, selected by Sam on 30 Oct. Selecting Auto clears the override; otherwise
  it expires after 20 minutes or an underlying situation change. This replaces the original journey-scoped
  lifetime. Refresh, appearance changes and temporary GPS loss alone do not end it.
- Automatic transitions defer during editing, selection or expanded-notice reading.
- Tracking and important journey alerts continue while Planner is manually pinned.

## Preservation after Panda retirement
- Signal is always active; no design switch remains. Auto / Plan / Live, train/total duration and arrival-first
  facts remain available across planning, station lists, Live and Follow without another timing/ranking policy.
- Follow a route remains a separate Experimental setting, off by default. Opening Signal does not enable it.
- Theme changes and upgrades retain direction, deadlines, selected train/Tube, followed route and saved settings.
- Preserve current departure columns, effort levels, train status, corrections, Aldgate platform planning,
  interchange timings and simulator behavior. The complete prior Panda implementation is on the archive branch.

## Tests
Production-browser geometry/source checks: [browser-signal-journey-clarity.py](../../tests/browser-signal-journey-clarity.py).
These include semantic time-column anchors at phone widths, enlarged text, serious-versus-background disruption,
visible location and rail/Tube progress. The final release record must report executed results, not only test creation.

- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: serious service-specific cause is visible before opening Travel alerts"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: minor or unused-line disruption stays background while its full details remain reachable"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: feed priority cannot hide separate serious train and remaining Tube impacts"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: a profile threshold override reaches rendered status, train flag and visible card"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: manual direction keeps location diagnostics visible without restarting location"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: confirmed boarding with unavailable GPS retains old current-rail problems and folds the completed Tube"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: a fresh current-train report promotes a serious arrival delay even when its board still says on time"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: Tube headline and progress share vehicle, target-platform and freshness guards"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: an otherwise fresh arrival report preserves a current cancellation until the board explicitly recovers"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: an explicitly picked current train keeps its cancellation visible after it leaves the board lookback without Follow"
- tests/signal-journey-clarity-review.test.mjs: "independent Signal clarity: reading expanded significant details defers Auto and preserves disclosure focus across refresh"
- tests/journey-progress.test.mjs: "Signal progress: an inferred train without Follow shows complete stages, factual calling points and no additional requests"
- tests/journey-progress.test.mjs: "Signal progress: live expected arrival changes show behind and ahead against the original timetable"
- tests/journey-progress.test.mjs: "Signal progress: stale reports freeze the confirmed bar and keep report details accessible"
- tests/journey-progress.test.mjs: "Signal progress: an inferred Tube without Follow shows route stops and honest modelled progress"
- tests/journey-progress.test.mjs: "Signal progress: a location projection without a live arrival stays modelled"
- tests/journey-progress.test.mjs: "Signal progress: fresh endpoint unknown delay is explicit and residual predictions cannot clear board incidents"
- tests/journey-progress.test.mjs: "Signal progress: an exact fresh Tube destination prediction estimates position without manufacturing stop reports"
Signal is always active; Follow remains behind its own switch; compact v2 review is approved and release verification is recorded separately. [Signal testing](../signal-testing.md) records the required evidence
and hands-on morning checks; do not treat the standalone mockup as regression evidence.

Before release acceptance: run existing engine/app/golden suites, typecheck, build and check-docs on the committed
implementation. Focused UI tests now cover automatic transitions, manual pinning, Return to Auto following the
latest situation, state/focus preservation, no-active/uncertain identity, persistence, exact expiry, interaction
deferral and alert visibility while planning is pinned. Run the production-browser layout/theme checks; real
iPhone Safari and VoiceOver remain hardware acceptance. See [verification](../signal-testing.md).

- tests/core/viewControl.test.mjs: "view control: planning pins the selected question without changing the live situation or deadline"
- tests/core/viewControl.test.mjs: "view control: manual choice expires at exactly twenty minutes and immediately on a changed situation"
- tests/core/viewControl.test.mjs: "view control: Return to Auto uses the newest situation rather than the situation that was pinned"
- tests/core/viewControl.test.mjs: "view control: requesting Live without an active journey is explicit and never fabricates a service"
- tests/core/viewControl.test.mjs: "view control: automatic transitions wait during editing, selection or notice reading and then catch up"
- tests/core/viewControl.test.mjs: "view control: malformed or future saved overrides cannot trap the app in a pinned view"

- tests/signal.test.mjs: "Signal is the default with Auto Plan Live and independently disabled Follow"
- tests/signal.test.mjs: "Signal status summary follows actual engine warning precedence and handles loading"
- tests/signal.test.mjs: "manual Plan retains tracking, selection and deadline; Return to Auto uses latest situation"
- tests/signal.test.mjs: "planning override expires exactly at twenty minutes and on a reliable situation change"
- tests/signal.test.mjs: "GPS loss does not expire a planning pin or clear a confirmed train"
- tests/signal.test.mjs: "expanded journey steps defer navigation and keep disclosure and focus through refresh"
- tests/signal.test.mjs: "appearance settings persist independently of journey state"
- tests/presentation-ui.test.mjs: "Signal dispatch enforces the canonical order on the actual live hero"

Compact v2 adds independent real-page integration coverage in `tests/signal-compact-review.test.mjs` and production-browser checks
in [browser-signal-compact.py](../../tests/browser-signal-compact.py). The browser checks must inspect ordinary,
closure, followed and expanded-detail layouts in light/dark appearances at phone widths, enlarged text,
44 px actions, no overflow, saved-preference upgrades and disclosure reachability. Test creation or reference
measurements alone do not establish a passing final candidate; independent review and the committed-code
release checks remain required.

- tests/signal-compact-review.test.mjs: "compact review: repeated refresh keeps planning focus and defers navigation until editing ends"
- tests/signal-compact-review.test.mjs: "compact review: appearance changes retain the original controls handlers and input values"
- tests/signal-compact-review.test.mjs: "compact review: expanded visible alerts defer Auto and collapsing their parent releases hidden inner alerts"
- tests/signal-compact-review.test.mjs: "compact review: an open nested alert under a hidden or collapsed ancestor never pins Auto"
- tests/signal-compact-review.test.mjs: "compact review: future Arrive by and Leave around missing routes stay visible above folded alerts"
- tests/signal-compact-review.test.mjs: "compact review: a closed Hammersmith and City fallback is qualified before opening any alert"
- tests/signal-compact-review.test.mjs: "compact review: a cancellation summary cannot hide the currently closed onward fallback"
- tests/core/present.test.mjs: "statusLine: a closed fallback asks to check onward travel without claiming a future closure"
- tests/signal.test.mjs: "Signal keeps example and timetable provenance visible when train warnings take precedence"

- tests/signal-compact-plan.test.mjs: "compact Plan: explicitly choosing Plan keeps its primary answer visible while following continues"
- tests/signal-compact-plan.test.mjs: "compact Plan: live Tube choices remain outside folded recommendations and keep working while following"
- tests/presentation-ui.test.mjs: "Signal planning keeps the primary answer ahead of the accessible line-status strip"

## Panda retirement (Sam, 1 Nov 2026)
Panda and the two-design parity rule are retired. The Signal switch no longer exists. Archived source, the
functional audit, executed checks and remaining limitations are in [the retirement review](../panda-retirement-review.md).

- tests/signal.test.mjs: "Signal is the default with Auto Plan Live and independently disabled Follow"
- tests/panda-retirement.test.mjs: "Panda retirement: an existing followed trip and planning pin survive upgrade settings and reload"
- tests/test-runner.test.mjs: "test runner discovers page and core suites and propagates either failure"
