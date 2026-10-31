# Cartref — Signal design system

Signal selected by Sam, 29 October 2026; production implementation behind Settings → Experimental (independent review approved; release gates recorded in docs/signal-testing.md). iPhone-first, with automatic light/dark appearance and manual appearance overrides. Planning and live views switch automatically, with a manual override. Sam selected the newer Follow a route behavior on 30 October; its 20-minute/situation-change override replaces the earlier journey-scoped lifetime.

## Start here

- [Architecture decisions and approval status](architecture.md#signal-presentation-architecture-29-oct-2026)
- [Acceptance story](stories/signal-design-system.md)
- [Prototype instructions](design/README.md)
- [Semantic tokens](design/signal-tokens.json)
- [Independent review and resolution notes](design/review.md)

The HTML is a review simulation. Consume the tokens and component contracts; do not copy its sample timing, inference or routing logic into production. The prototype itself contains no production planning logic; production integration is documented below.

## Evidence and scope

Read `src/page.html` on main (912e0977c386789aa2a892f84bb88a18cdd16734) and the architecture and all capability stories on `docs/context-in-repo` (tree 1454801756ce71a8a9fc4d8c348027c79760c958). The context branch's screen differs from main only in the location-resume fix; main's newer fix must be retained. This is a source audit, not a claim to have tested the production app with live credentials.

Primary device: iPhone. iPad/Mac adaptation later. Scope: commute planning and live travel, including onward Tube and the final walk. Leisure, full settings, people/trips and native extensions are outside this design round; their existing entry points must survive implementation.

Reference research: [Commutative](https://apps.apple.com/gb/app/commutative-live-trains/id1312667553) for an immediately readable active train/platform; [Flighty](https://flighty.com/) for journey status, delay changes and continuity. These are inspiration, not a promise of equivalent feeds or accuracy.

Current sources are National Rail departure boards, Service Details stopping-point reports, TfL arrivals/status and timetable. Early platforms, passing points, coach formations and crowding are backlog items, not current capabilities. Do not draw an exact moving train marker from interpolated positions. Label station reports, predictions, modelled onward times and stale data separately.

## Directions

**Signal:** a decisive glance screen. A large contextual answer (leave by / departs / arrive), then the best fallback, then the complete board. On-train view gives arrival and the next action prominence. Rounded layered surfaces and cool blue/teal accents.

**Journey:** the whole trip as a readable itinerary. The recommended journey is a continuous sequence from walking to the train to the final destination. On-train mode highlights the current leg and retains onward context. Quiet paper/ink surfaces with a violet accent, firmer edges and more editorial typography.

Both use the same sample journeys and states. The data is illustrative, not an actual timetable or live feed. Interaction is a design simulation, not the production routing engine.

## Functionality inventory and preservation contract

| Existing capability | Design location / rule | Evidence |
| --- | --- | --- |
| Commute / Leisure | Commute header retains Leisure entry; destination screen out of scope | page controls; any-start-and-end-point |
| Auto / To office / To home | Always-visible direction control; manual override remains available without location | direction-and-arrival |
| Average / fast walking | Visible pace control, not hidden in general settings | page controls; on-the-way-to-the-station |
| Leave now / Arrive by / Leave around | Three explicit planning modes with date and time | arrive-by; leave-around |
| Best and next best | Kept together, across routes; no manufactured fallback if none qualifies | top-card |
| All loaded trains in leaving order | Full board below recommendation; cancellation and no-estimate rows remain | never-hide-a-train |
| Leaving right now / hurry | Explicit consequence, train duration and arrival comparison | slow-trains; top-card |
| Leave / depart / arrive distinction | Context changes the primary time, with an explicit label | at-the-station; on-the-way-to-the-station |
| Scheduled plus expected times | Both shown wherever a delayed service appears | late-trains |
| Train duration and total journey duration | Visible option metadata; steps available on expansion | page optionBlock/renderList |
| Platforms | Inline, never only in expansion; unknown shown as unannounced | same-train; page platMeta |
| Same train, multiple boarding points | One service; both station/time/platform choices visible, unreachable marked | same-train |
| Slow, standing, tight, late, cancelled, uncertain, passed, timetable flags | Inline text with semantic colour; never silently filter | never-hide-a-train; standing-room |
| Journey steps | Expanded timeline in Journey; disclosure in Signal | page optionBlock |
| Why these trains? | Disclosure beneath complete board, with route-specific coverage and exclusions | never-hide-a-train |
| Refresh and source freshness | Explicit footer control; stale warning stays near primary answer | reliability |
| Train matching and correction | Visible 'Change train'; uncertainty asks, never invents certainty | which-train |
| Last reported stop and expected arrival | Labelled station report, source and timestamp; no exact map | which-train |
| Tube selection, near-platform exceptions, spare minutes | Connection screen retains alternatives and selection | connections |
| Did you get it? / still here | Confirmation and correction retained | connections |
| Tube home determines train | Exit recommendation + alternative exit and home-time consequence | tube-home |
| Nearly home / arrival / unknown | Train + walk, then location walk; missing home does not invent an ETA | nearly-home; direction-and-arrival |
| Line status and notices | Every relevant line named, including good service; impact before background detail | warnings |
| Settings, home location and experimental controls | Settings entry retained; existing functionality remains in later implementation | page settings dialog |

## Explicit recommendations requiring Sam's decision

1. Consolidate repeated explanations of the same delay into one affected-service message, while retaining the scheduled/expected time and short delay label on every occurrence. This reduces repetition, not the available information.
2. Keep technical source diagnostics under the existing **Why these trains?** disclosure. Keep source type and freshness visible. Do not move the stale warning into that disclosure.
3. Keep unrelated network and facility notices folded, as today. No new hiding of safety-relevant or journey-impacting notices.
4. **Accepted with refinement:** automatic planning/live switching is the default. Plan and Live are manual overrides, with a visible **Return to Auto** action. Overriding the view must not reset a tracked train, direction or deadline or stop background updates.
5. Do not remove any current capability. Retain Leisure and Settings entry points while their full redesign is deferred.

## Draft shared system

- System font (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif); iOS native work should use semantic Dynamic Type styles. Hero time 48–56 px, page title 28–32, component heading 18–20, body 16, supporting text 13–14. Tabular numerals for times; no truncated station names.
- 4-point spacing scale: 4, 8, 12, 16, 20, 24, 32. Phone content inset 20 px (16 on small widths); touch controls at least 44 px. Content scrolls as a single page; overlays must support keyboard, focus return and dismissal.
- Semantic roles: canvas, surface, raised surface, primary text, secondary text, divider, accent/action, positive, caution, severe, informational. Separate light/dark values; never reuse the same warning text colour blindly on both themes.
- Signal radii 24/16/12; Journey 12/8/6. One strong primary area per screen. Colour is never the sole indicator of a state. Cancelled and uncertain services remain readable.
- A train: red when cancelled, no estimate or 15+ min late; amber 5–14 min; green under 5 min (Sam, 30 Oct; amber moved from 2 to 5 the same day). The route-wide status line uses the same thresholds. Red, amber and green are reserved for status; see [Status colour is reserved](#status-colour-is-reserved-sam-30-oct-2026-binding-on-every-build-and-every-proposal). Route notice without observed impact: caution. Background notices: neutral.
- Prefer labelled actions to mystery icons. Minimum contrast target WCAG AA (4.5:1 body, 3:1 large text/UI). Test both appearances, 320 px width, large text and VoiceOver on real iPhone before implementation acceptance.
- Appearance defaults to System; optional Light/Dark override. Changes preserve view, selected service, scroll, expanded details and entered deadline. Avoid automatic theme animation; respect Reduce Motion.
- State model: loading, empty, live, timetable only, stale, partial failure, no estimate, cancelled, location denied, uncertain train, user-confirmed train, connection, final walk, arrived. Confidence belongs to the data, not visual polish.

## Timetabled and expected departure (Sam, 30 Oct 2026): Panda and Signal

A train is named by its timetabled time ("the 08:00"): the platform board, the "Which train?" choice and "You're on the
08:00" all use it. Wherever the departure is the headline (at a station, on your way to one), the timetabled time is
as prominent as the expected time. Chosen from three options
([comparison](https://claude.ai/artifact/M5yQwasvt3bLdiFgKXXfbz)): **A, board columns.**

| Column | Content | Style |
| --- | --- | --- |
| Train | Timetabled departure; "Train from St Pancras" when you'd board elsewhere | Option-time size, neutral |
| Expected | Expected time when it differs from the timetable; else "On time" / "Not live" / "Estimated" / "No estimate" / "Cancelled" | Same size (a word a step smaller); colour = status band |
| At office / At home | One expected arrival; no timetabled door-to-door arrival exists | Same size, neutral |

- Platform-board order: timetabled, then expected. Never strike through the timetabled time (it reads as cancelled and
  hides the name you match against); never "08:00 › 08:03" in one slot (reads as a journey).
- The delay's word and minutes appear once, in the status pill; an "On time" pill is left off (Expected says it).
- Never "On time" without live data. TfL's reported delays count as data: shown as the expected time, coloured.
- Leave mode keeps Leave → Arrive as the big times, with "08:00 exp 08:03" on the train line.
- List rows use the same three columns, with route, operator and flags on a line below.
- Engine: `departureStatus` in `src/core/rules.ts`. Story: [late-trains](stories/late-trains.md).
- **Panda** (the live build): built 30 Oct; tokens `--hero-ok/warn/bad` on the card, `--ok/warn/bad` in the list.
  → [panda](design/panda.md#departure-board)
- **Signal:** `JourneyOption` and `TrainBoard` follow this. The review prototype (`design/signal-preview.html`)
  predates it and still shows "Departs" with the expected time; superseded on this point.

## Status colour is reserved (Sam, 30 Oct 2026): binding on every build and every proposal

Red, amber and green mean one thing only: **is there a problem?** Green = no problem, amber = some problem, red =
serious problem. They are never used for brand, identity ("You're on the 08:00"), selection, the best option,
emphasis, focus, tracking or actions. Why: 30 Oct, on the train, the identity lozenge was orange, so "this is your
train" read as a warning while the train was close to on time.

- **Accent / action must be a hue clearly distinct from all three.** Signal's blue (`accent` in
  [`signal-tokens.json`](design/signal-tokens.json)) complies. Identity, selection and "best" use accent or neutral
  (ink / outline), never a status colour.
- **Every train in live mode shows its status**: card, list and board, and the train you're on. Word and minutes,
  coloured by band; never colour alone ("On time", "2 min late", "18 min late", "Cancelled", "No estimate").
- **Bands (Sam, 30 Oct), one engine rule** (`delayLevel` in `src/core/rules.ts`): green under 5 min late (or
  early), amber 5–14 min, red 15+ min, cancelled or no estimate. (Amber started at 2 until later on 30 Oct.) A timetable train, or a time worked out from another
  stop, gets no status: never "On time" without live data. On the train, the band is for the expected arrival at the
  change station against the timetable, the time that matters; departure delay is history. The route-wide status
  line uses the same thresholds, but answers "is my route disrupted", not "is this train late". On a departure
  board the status is the Expected column ([below](#timetabled-and-expected-departure-sam-30-oct-2026-panda-and-signal)).
- **Caution (yellow `note`)** stays for a notice on your route with no observed impact; it must not be mistaken
  for amber.
- **Tube line colours are identity, not status** (Sam, 30 Oct): a lozenge or chip naming one tube line uses TfL's
  colour for that line (`--circle`, `--met`, `--hc`), always with the line's name in it. The Circle's yellow is
  close to caution; the name and the lozenge shape keep it distinct. Don't extend this to a status colour that
  isn't a line's own.
- **Where the status sits on the live card (Sam, 30 Oct: option 2 of 4):** inside the train's identity lozenge. The
  train name is in accent blue, with the status chip inside it in its band: `[You're on the 08:00 Great Northern
  (About 2 min late)]`. Panda nests the chip inside the lozenge so it wraps as one piece on narrow screens. The Signal preview, whose
  identity text is shorter, draws a split lozenge (name, then status segment). The status isn't repeated on the next line.
  Rejected: a chip beside the hero time (it describes the office arrival, not the train), the hero time coloured
  (alarming in red; large-digit contrast), and a full-width strip (heaviest change).
- **Accent (Sam, 30 Oct): Signal's blue**, in Signal and in [Panda](design/panda.md) (the live build).

**Where it is implemented:** Panda (`src/page.html`, 30 Oct). The accent and rail hero lozenges are blue (tube lozenges take their line's colour), late text takes
its band, and every live train has a status pill and lozenge →
[train-status](stories/train-status.md). "At the station about" on your way is green / amber / red by minutes to
spare (`wayLevel`), which is status, not identity. The Signal preview ([`signal-preview.html`](design/signal-preview.html))
is updated to match. Its countdown line is accent rather than always-green, lines with no live status say so, and
"Cancellations reported" is amber.
**Proposals:** `original` skin A and `womble` skin A use an amber accent, and `womble` skin B a green "on time /
tracking" accent. None may be carried forward without retuning. Signal complies.

## Implementation handoff

The review package supplies visual references, not production planning logic. Implementation starts from latest `main`, preserving improvements since the prototype audit. Signal changes presentation; the shared Follow a route engine supplies journey behavior. Reference existing stories and thresholds. Signal design and Follow a route are separate Experimental switches, both initially off; selecting Signal checks Follow a route, which remains independently configurable. Panda and Signal share saved journey state. See [preservation and verification](signal-testing.md).

Latest-code reconciliation also preserves the concurrent Follow a route improvements from `d330e95`: visible
original arrival, explicit recovery and boarding correction, stable same-train progress, deliberate run/car
selection, quiet ordinary alternatives during a Tube approach and a one-minute ETA-change threshold. Known
homeward Tube vehicle predictions are accepted only through the recorded-data validated stop/line/direction
matching path with three-minute freshness and source guards; modelled fallback remains explicit. This does
not solve missing Met departures at Aldgate or establish provider-wide vehicle reliability.

Implementation verification: existing engine, golden and app suites; document any intentional presentation snapshot changes; run build and commit generated index.html; typecheck and check-docs. Add targeted UI/accessibility coverage for theme persistence, manual correction, full-board retention and responsive controls. No claim of production regression protection is made by this mockup alone.

## Palette reference

Signal is selected; Journey is retained only as comparison history. Token values remain adjustable during implementation accessibility checks. Each cell is light / dark.

| Role | Signal | Journey |
| --- | --- | --- |
| Canvas | `#F1F4F7` / `#0B1017` | `#F5F3EF` / `#141318` |
| Surface | `#FFFFFF` / `#151E29` | `#FFFEFA` / `#201F26` |
| Primary text | `#17283B` / `#EDF4FC` | `#292735` / `#F1EDF7` |
| Supporting text | `#536477` / `#AEBFD1` | `#665E70` / `#C1B8CD` |
| Action | `#174EAC` / `#9ABFFF` | `#6550A7` / `#C5B2FF` |
| Accent surface | `#E4EDFF` / `#1C3557` | `#EDE7FB` / `#363047` |
| Divider | `#CFD9E3` / `#344356` | `#D7D0DB` / `#433D4D` |
| Positive text | `#12674E` / `#7CE0B7` | Shared |
| Caution text | `#835000` / `#FFD18A` | Shared |
| Severe text | `#B1293C` / `#FF9BA8` | Shared |

## Independent review and revisions

A separate agent reviewed the draft against the source stories and current rendering code. Its review was static and independent of the design rationale. It found real issues in the first mockup. Revisions include:

- Train and Tube selections now carry service-specific arrival times into subsequent screens; the early Tube selection consistently shows 08:03.
- The slow homeward train has its own identity and ETA. The two homeward views use consistent times for the same Thameslink; the cancelled 18:24 is no longer an alternative recommendation.
- The 18:44 alternative is present in the homeward board. Current Tube-to-train choices near the office and the board while on the Tube are retained.
- Location denial holds the recommendation until a starting point is chosen. The journey leg survives Plan → Live navigation.
- Fallbacks retain flags, duration and steps. Walking/station steps start from the current situation; station mode puts departure first in both directions. The homeward station duration uses the correct clock.
- Timetable platforms are unconfirmed; stale times are explicitly qualified. Report retrieval time is distinguished from the reported event time.
- Touch targets, focus restoration, Escape dismissal and planning-time retention were improved.

Browser verification: both designs rendered; light/dark previews inspected at phone widths including 390 and 320 px. All 14 scenario selections exercised without undefined/NaN values. Checked early Tube confirmation → 08:03, Plan → Live retaining that Tube, homeward alternative/cancellation visibility, home-station duration, and location-denied gating. JavaScript syntax checked after final revisions.

Limits: no live credentials, production engine integration, real iPhone hardware, VoiceOver or full contrast audit. Scenario switching is a review control, not proposed app UI. Full Settings and Leisure open explicit scope notes, not functioning replacement screens. Loading, partial-route failure, Tube-feed failure, H&C fallback, unknown-home ETA and 'elsewhere in London' remain specified by the existing stories but are not fully simulated in this prototype. They must be included in the selected system's implementation state catalogue; their omission from this preview is not approval to remove them.

Native extension points: reserve a compact journey summary using the same semantic fields (service, confidence, departure/arrival, next action, platform when available, delay and freshness) for future Live Activities, Dynamic Island and widgets. No native integration is implied by the web mockup.

## Agreed interaction: automatic view, manual override

Sam approved automatic switching, interaction deferral and tracking/important alerts while Planner is pinned on 29 October 2026. On 30 October he selected the newer [Follow a route](stories/follow-a-route.md) behavior, including its override lifetime. The architecture document records this superseding decision.

- Default `viewOverride = auto`. Derive the screen from the existing engine's situation: planning before departure, contextual walking/station boards, active rail, interchange, Tube, final walk and arrival. Do not add a second set of GPS or timetable heuristics in the view layer.
- **Auto · Plan** or **Auto · Live** makes the current automatic choice visible. Tap Plan or Live to pin that view; the Auto control becomes **Return to Auto**. No modal or confirmation is needed.
- A pinned view survives refresh, theme changes and brief loss of GPS, within its 20-minute lifetime and while the underlying situation stays the same. The active journey continues updating independently, with its train identity and deadline retained. A manual planning view must still expose a compact journey-impact alert if the tracked service is disrupted.
- When the user returns to Auto, immediately display the latest situation, not the situation from when they overrode it. Avoid moving a screen while the user is editing a date/time, choosing a service or reading an expanded notice; finish that interaction first and expose the pending live state.
- Preserve the existing inference confidence rules. If train identity is uncertain, show the candidate choice, not a confident fabricated journey. Choosing Live with no active journey shows a clear empty state.
- Keep **view override**, **direction override**, and **train/Tube confirmation** separate. Changing the screen does not change the trip. Direction controls retain the existing Auto/office/home behavior.
- Current lifecycle (Sam, 30 Oct; supersedes 29 Oct): Return to Auto clears a manual view override immediately; otherwise it expires after 20 minutes or when the underlying situation changes (reaching/leaving a station, starting/stopping rail travel). A refresh, theme change or transient location failure alone is not a situation change. The followed route itself persists independently until completion, Stop following, or explicitly following another option.
- The mockup's Journey state selector simulates new situation evidence. With Auto selected the screen follows it; with Plan pinned it stays on planning; Return to Auto shows the latest simulated situation. It does not perform real background or location detection.

## Decision

Signal is the chosen primary structure. Automatic planning/live switching with manual override, the newer 20-minute/situation-change override lifetime, interaction deferral, and ongoing tracking/alerts while Planner is pinned are required. No capability deletion is proposed. Other reductions to repeated explanatory copy remain recommendations rather than permission to remove information.

## Component contracts

| Component | Required data and behaviour |
| --- | --- |
| JourneyContext | Direction + inference/manual label; pace; keep Settings and Leisure discoverable |
| ViewControl | Auto by default; explicit Plan/Live overrides; Return to Auto; never mutate selected service |
| PlanningQuestion | Leave now / Arrive by / Leave around; retain date/time values per mode |
| PrimaryAnswer | Situation-labelled leave/depart/arrive time; data source; deadline consequence; no ETA for unplannable services |
| JourneyOption | Service identity, scheduled/expected times, station/platform, duration, total time, flags, alternatives and expandable steps |
| TrainBoard | All engine-returned options in engine order; do not filter by aesthetic preference; cancelled/unknown remain |
| ActiveJourney | Confirmed/inferred identity, source timestamp, last reported station, expected arrival and next action |
| ConnectionChoice | Station arrival, transfer allowance, candidate departures, spare time, near-platform caveat, confirm/correct actions |
| StatusAndNotices | Relevant line statuses including good/unknown; severity from existing rules; full notice retained on expansion |
| DataState | Loading/empty/timetable/stale/partial failure independent of journey stage; errors must not destroy last good data |

Missing fields are explicit unknowns, never zero, on-time or fake platform values. Interaction state (selection, expanded disclosure, scroll/focus) must survive ordinary refreshes. In production all timing arithmetic remains in route/engine outputs.
