# Journey simulator user guide

Use the simulator to try a commute without travelling. It supplies location observations, National Rail
Darwin responses and TfL responses to the **real Cartref Commute application**. The app still chooses
routes, identifies trains, estimates arrivals and displays warnings through its normal journey engine.
The simulator does not tell that engine which train you boarded.

Go to: [quick start](#start-your-first-journey) · [playback](#move-through-the-journey) ·
[verification](#understand-checkpoint-verification) · [scenarios](#available-scenarios) ·
[Advanced diagnostics](#advanced-diagnostics) · [reports](#save-results-for-investigation) ·
[limitations](#limitations-what-this-can-and-cannot-establish) · [troubleshooting](#troubleshooting).

## Start your first journey

For consistent train times, run the app with your browser/device timezone set to **Europe/London**.
The simulator bar displays British time, but the production Darwin time parser still uses the device
timezone. Testing abroad with a different device timezone can shift parsed departures and invalidate
train-identification results; the British display alone does not correct that difference.

1. Open [Cartref Commute](https://srapley-spec.github.io/cartref-commute/) and select **Simulator** in the
   application header. **Journey mode** opens without starting a simulation.
2. Choose **To London / Office** or **To Letchworth / Home**, then **Great Northern via King’s Cross** or
   **Thameslink via Farringdon**. Leave **What should happen?** on **Everything operates normally** for
   your first run. The description and **Watch for** text explain other scenarios.
3. Select **Start journey**. This enables simulated GPS, synthetic Darwin and TfL feeds, and their shared
   virtual clock. It starts **paused at the first checkpoint** and collapses the configuration panel.

After opening Journey mode, choosing direction, choosing route and starting takes three actions. Your
previous direction, route and scenario choices are remembered; an active simulation is never remembered.
The real application remains the main screen. The bottom bar clearly says when simulation is active.
Synthetic feeds do not require real transport API keys.

The simulator uses the app’s existing profile and settings. If you have saved a home location, the home
and approach-to-home waypoints use it. Without one, a fixture near Letchworth is used and the final
home-arrival assertion is **INCONCLUSIVE**. Save your home through the normal app if you want that check;
the simulator does not save a replacement home for you.

## Move through the journey

| Control | What it does |
| --- | --- |
| **Continue** | Plays towards the next checkpoint at the selected speed. The same button becomes **Pause** while moving. |
| **Pause** | Stops playback immediately. With synthetic feeds enabled, simulated time freezes too. |
| **Next checkpoint** | Advances sequentially to the next checkpoint, processing intermediate observations and refreshes. It can take a moment; it is not an arbitrary teleport. |
| **Back** | Returns one waypoint, deliberately forgets journey state, and pauses for fresh inference. Between waypoints, returns to the last one reached. Requires simulated GPS and feeds. |
| **Show controls / Hide controls** | Opens or collapses the panel without changing playback, time or journey state. |
| Progress count, such as **4 / 14** | Opens the expandable journey timeline. |
| Verification badge | Opens **Expected and actual** to explain the current result and recorded failures. |
| **Stop** | Ends simulation and restores normal operation. |

Playback **automatically pauses at every checkpoint**, at every speed, and stays there until you continue.
You can inspect the actual application for as long as you need. **Next checkpoint** is temporarily disabled
while a step or checkpoint verification is settling. When the journey ends, it offers **Results** instead.

The bar shows the simulated location, British local time, progress, and the next checkpoint. For **1×**,
**5×** or **20×**, open **Show controls → Advanced → Playback speed**. At 20×, one real second advances
20 simulated seconds during normal playback. The separate Next checkpoint control moves through the
intervening journey quickly regardless of that speed selection.

Open **Journey timeline** to see completed, current and upcoming steps and their simulated times. Tap a
step to inspect its recorded assertions. Inspecting a future step does not travel there or count it as
verified. Next preserves sequential history; Back deliberately discards it, as described below.

## Test recovery after losing journey state

**Back** is a fresh-start test at an earlier waypoint. It rewinds the shared GPS/provider clock together,
clears the app’s journey memory and pauses. It does **not** replay earlier movement or restore your old
train, Underground or Follow choices. At the first waypoint it is disabled; during a segment it returns
to the last waypoint reached. It is also disabled with live GPS or live transport feeds, because those
cannot be rewound, and while a changed scenario is waiting for Restart.

To test the same loss of memory **without moving**, use **Show controls → Reset journey state**.
This pauses playback but keeps the current position, accuracy and time. It preserves the observation’s
original age: a stale fix stays stale, and unavailable Underground GPS stays unavailable. It works with
independent simulation sources too; real GPS and device time continue naturally in those combinations.
With live feeds, Reset preserves real TfL backoff and request accounting; it does not reset API allowances.

Both controls discard train locks, boarding and tube choices, Follow, inferred direction, station/office
visits, movement history, presentation pins and cached transport results. A transient typed London origin
is cleared so the app can plan from its actual current GPS. Permanent settings, home, destination and
the configured Letchworth profile are preserved. Stop still restores the real pre-simulation context.

This tests whether the real app can pick up a journey with no earlier evidence. It may ask for a direction
or service choice, offer a different route, or wait for GPS. The simulator does not supply those answers.
Verification checks that the old state was actually cleared, tests current location facts where possible,
and reports history-dependent conclusions as **INCONCLUSIVE** until new evidence supports them. Normal
service-identity assertions resume after new movement and journey context are established; they can fail
if the real engine identifies a different service.

Each Back or Reset starts a new diagnostic attempt. Future waypoints are no longer marked verified.
Open **Journey results → Previous attempt(s)** to compare earlier expected/actual observations and cards;
Copy results and Export JSON include them too. The last ten attempts are retained, with a visible warning
and a truncation count if older attempts exceed that limit. Export before repeated resets to keep a full
investigation history.

The temporary nearest-station demo has been removed from the application. Old saved demo origins
remain ignored; Reset does not reactivate them or change the configured Letchworth profile.
Leisure mode is preserved too; its real planning response remains visible, while commute-specific
checkpoint assertions are inconclusive until you choose Commute again.

At the final checkpoint you can inspect **Journey results**, export the report, or restart. **Restart**
starts a fresh run from its first checkpoint and clears simulated journey choices and results. Export
anything you want to keep first. Stopping retains the last report in memory; starting another journey or
reloading replaces or loses it.

## Let the real application make decisions

The selected route describes the **passenger’s simulated movements**. It does not force the app to
recommend that route or select its train. Other plausible trains and Underground departures remain in
the synthetic boards. If the app recommends a different service, compare its recommendation with the
scenario rather than treating the route selector as a promise about the top card.

Use the app’s normal train selection, Underground selection, Follow and alighting controls when needed.
The uncertain-train scenario deliberately leaves room for an explicit choice. The different-train
scenario follows a later service; to examine a conflict with a confirmed choice, choose the earlier
service through the app’s own control before the later GPS progress contradicts it.

On the return Thameslink route, the planner may prefer continuing towards King’s Cross. If the simulated
passenger gets off at Farringdon, use the actual app’s **At Farringdon** control when offered. The harness
must not silently make that passenger decision for the engine.

The outbound journey includes an office dwell: after arrival, the app can naturally switch to planning
the next homeward journey. That direction change is expected, rather than a failure to retain the
outbound direction forever.

You can also use the real **Arrive by**, **Leave around** and **Leisure** controls while testing. Choose
times relative to the simulated date and clock. An explicit planning question can make current-journey
checkpoint checks inconclusive; it is not itself an inference failure. Alternative London origins are
supported within the fixture limits described below.

## Understand checkpoint verification

The simulator reads the application’s inferred state and displayed output after refreshes settle. It
compares them with explicit expectations for that checkpoint. **Reaching a checkpoint alone never earns
a pass.** While refreshes settle, the badge may say **Checking**.

| Result | Meaning | What to do |
| --- | --- | --- |
| **PASS** | The defined expectation was observed in the real app’s state and/or display. | Compare the app with the recorded evidence; continue when ready. |
| **FAIL** | Observed behaviour contradicted an explicit assertion. | Open the details, inspect the real screen and export the report before restarting. |
| **INCONCLUSIVE** | Evidence is insufficient, the assertion is not applicable, or no explicit check is defined. | Read the explanation. This is neither a pass nor proof of a defect. |

**Expected and actual** shows the individual assertions, their evidence, and **What the real app showed**,
including the main card and any Follow card or notices. Results can be updated as observations settle;
recorded failures remain discoverable rather than disappearing when the app later recovers. Within an attempt, the badge
continues to flag failures elsewhere in the run even if the current checkpoint passes.
Back and Reset create a fresh attempt, retaining those earlier failures under Previous attempt(s).

Common reasons for an inconclusive result include rough or missing GPS, unresolved train identity,
missing boarding/alighting evidence, a manually pinned Plan or Live view, independent simulation sources,
or manually edited coordinates/context. Use **Auto** in the real app when you want its automatic
current-journey presentation again. A deliberately uncertain scenario need not produce a PASS at every
checkpoint to be useful.

A failure is evidence to investigate. It can expose an application defect, an unsuitable assertion or a
fixture assumption; the report preserves the expected and actual behaviour so those can be distinguished.

## Available scenarios

Each choice is available for both rail routes and both directions. Read its **Watch for** description;
not every observation has an automatic assertion, and some require your normal application interactions.

| Category | Scenario | What changes and what to inspect |
| --- | --- | --- |
| Normal journey | Everything operates normally | Complete the journey with competing services present; check progress, identification and onward planning. |
| Rail disruption | Delayed train | A signalling restriction delays rail services by eight minutes. Check updated expected times and alternatives. |
| Rail disruption | Cancelled train | The first service is cancelled and the passenger takes a later one. Cancellation should remain visible without being recommended. |
| Rail disruption | Take a later train | GPS and service progress follow the later departure, not the first train on the board. |
| Rail disruption | Board a different train | Compare the actual later service with the app’s inference; a conflicting confirmed train should produce a warning. |
| Rail disruption | Platform change | The rail service moves platform. Inspect the updated departure information. |
| Underground and connections | Miss an Underground connection | The passenger reaches the service too late; the app should offer a reachable later connection. |
| Underground and connections | Underground disruption | Services are delayed and line status changes. Inspect warnings and connection estimates. |
| Location and data problems | GPS signal lost underground | Tunnel fixes disappear, then return at exposed checkpoints such as Barbican. A known journey should survive the gap. |
| Location and data problems | Poor indoor and train accuracy | Fixes carry larger accuracy radii. Check that rough observations do not invent precise arrivals or boarding. |
| Location and data problems | Train identity uncertain | Close departures and an initial rail GPS gap leave multiple candidates. Inspect uncertainty and normal selection controls. |
| Location and data problems | Location permission denied | The simulated provider reports denial. Inspect the app’s explanation and manual direction controls. |
| Location and data problems | Waiting for a location | No usable fix arrives. The app should wait rather than invent a direction. |
| Location and data problems | Transport provider outage | Providers fail during the station approach and later recover. Inspect the error, retained information and recovery. |

Normal playback also includes periods without usable Underground GPS. These are intentional; a dot at
every instant would give the app unrealistic evidence.

## Advanced diagnostics

Select **Advanced**, or expand **Advanced diagnostics**, to use the same simulation session with more
control. Opening or closing this section does not restart, pause or otherwise change the journey.

### Independent sources and clocks

The two switches are available under **Settings → Experimental** and in Advanced diagnostics. Both default
to off and are session-only. **Journey mode → Start journey** enables both automatically.

| GPS simulation | Transport feed simulation | Location | Transport and application time |
| --- | --- | --- | --- |
| Off | Off | Real GPS | Real providers and device time. No simulation playback. |
| On | Off | Synthetic GPS | Live providers and device time. Playback speed moves coordinates only; it cannot accelerate live trains. |
| Off | On | Real GPS continues | Synthetic Darwin/TfL and virtual time. Real fixes are timestamped into that time domain; pausing does not freeze the person or native GPS. |
| On | On | Synthetic GPS | Synthetic Darwin/TfL and the same virtual clock. Use this for coherent, repeatable complete journeys. |

The independent combinations are useful for diagnosing a provider or GPS behaviour. They do not supply
all the evidence needed for the guided scenario’s expected journey, so its assertions can be inconclusive.
GPS-only operation uses your real provider settings, network and API allowances.

Changing either source switch ends the current run and restores its baseline before configuring the new
sources. Start again for a fresh run; source switching is not the same as opening Advanced diagnostics.
With an independent source combination, **Next checkpoint** falls back to normal playback rather than
the accelerated full-simulation step.

The main simulator display uses **British local time**, including GMT/BST. Default journeys use fixed,
reproducible fixture dates, not today’s real timetable. Advanced **Scenario start (UTC)** accepts UTC even
if your phone’s date picker looks local: for example, 08:44 UTC in summer is 09:44 BST. Change this value
and restart to test another date or a journey crossing midnight. Browser/device time is never changed.

With synthetic feeds enabled, the virtual clock advances only during playback and freezes at checkpoints
or on Pause. Hiding controls does not freeze a moving journey. Browser background throttling can slow
delivery of playback ticks; it is not a promise of precise wall-clock playback while the app is suspended.

### Location, accuracy and loss of signal

With GPS simulation enabled, choose **Jump to location**, or enter **Latitude**, **Longitude** and
**Manual location accuracy (metres)**, then **Apply coordinates**. These controls pause playback and
submit a normal location observation. Larger accuracy numbers mean less certainty; negative values are
rejected. Manual fixes do not reconstruct a completed journey history or advance its transport timetable.

**Playback accuracy** offers:

- **Good fixes (12 m walking, 45 m train)** for the normal playback profile.
- **Poor indoor/train fixes (180–1400 m)** for broader uncertainty in buildings and on trains.
- **Use manual accuracy** to apply the entered radius to playback observations.

The poor-accuracy scenario uses rough fixes even with the normal good-fix profile selected. Changing the
accuracy selection affects subsequent emitted fixes; it does not rewrite earlier observations. A
previously established train may legitimately remain known through a rough fix. The important question
is whether the app invents new certainty from insufficient evidence. Precision-dependent assertions can
be inconclusive, while an unsupported confident inference can still fail.

Applying manual coordinates or jumping leaves ordinary guided checkpoint history unsupported. Use the
new **Reset journey state** to test fresh inference at that manual position, or restart a coherent
scenario. Subsequent normal playback can restore applicable verification as new evidence arrives.
Repeated resets retain the manual-position marker; they cannot silently turn arbitrary coordinates
into a verified scenario waypoint. The dock says Manual location until a new playback fix arrives,
Towards the next checkpoint when paused between steps, and Real GPS for independent real location.

Advanced **Reset and restart** retains the older reset capability: it applies the selected configuration
and starts at its first waypoint. It changes the simulated time and position, unlike Reset journey state.

### Changing a run

Advanced direction, route, scenario and start-time changes pause playback and mark it for restart. Follow
the visible **Restart** instruction to apply them as a new coherent run. Journey mode selections are
drafts until you press **Start journey** or **Restart journey**. Switching between Journey mode and
Advanced does not apply those drafts or create a separate session.

Source diagnostics show the enabled providers, clock, playback and observed application state. Synthetic
services, delays, cancellations, outages and disruptions come from the selected scenario; the app’s
normal boards and warnings remain available for inspecting them.

## Save results for investigation

Open **Show controls → Journey results**, or **Results** at the end. The summary separates checkpoints
completed from assertions passed, failed and inconclusive, and lists significant events. A journey can
finish playback with failures or inconclusive checks.

Use **Copy results** to copy the JSON report or **Export JSON** to download `cartref-commute-simulation.json`. If clipboard
access is unavailable, a selectable text fallback is offered. Reports include scenario configuration,
source settings, relevant timestamps, checkpoint expectations, actual observations, display evidence
and diagnostic events. After Stop, reopen **Simulator → Journey results** to inspect the retained report.
Start/Restart and reload discard the in-memory report. Back/Reset retain bounded previous attempts;
results are not a permanent history, so export anything needed for investigation.

Reports use a restricted set of diagnostic fields and redact known credentials, precise coordinates,
postcodes and address-like text. They omit raw saved settings. This filtering can shorten or redact useful
wording too; it is not a complete copy of application memory. Review the exported content before sharing.
Reports also have size limits, including 500 events and 30 observation revisions per checkpoint; the
JSON records truncation counts if these limits are reached.
For investigation in Codex, attach the report and describe what the visible app did differently from what
you expected, including any manual train, tube or presentation choices.

## Stop, reload and saved data

**Stop**, or disabling both source switches, restores real GPS, real providers, device time and the
pre-simulation saved journey context. It also restores the in-memory planning inputs and existing real
Follow state captured when simulation began. Real context is checked against device time: station visits
that have expired while you tested are not revived as fresh evidence. Old provider requests and caches
are invalidated so that late synthetic or live responses cannot cross into the new source session.

Synthetic journey changes and settings edits made during simulation are not written over your saved
real settings or journey. Only the convenience choices for the guided setup are remembered separately.
Stop before making a settings change that you intend to keep for real operation.

**Reload exits simulation** and starts normal operation from persisted real settings. It does not resume
the virtual clock, location or report. Unlike Stop, reload also loses unsaved form drafts and other
memory-only state, just as a normal reload would. You may still see an ordinary browser location prompt
when real GPS resumes; a simulated denial does not change the browser’s actual permission setting.

## Limitations: what this can and cannot establish

- **Fixtures are illustrative, not live travel advice.** Service identities, departure times and vehicle
  progress are coordinated test data. They do not certify a real timetable, platform or future service.
- **Timezone and clock-change limits apply.** Use Europe/London for consistent Darwin parsing. Ordinary
  midnight playback is tested, but Darwin’s date-less `HH:mm` cannot reliably distinguish the repeated
  autumn London hour when clocks go back. Do not use that overnight interval to validate exact service
  identity. The normal daytime commute fixtures avoid it.
- **Geometry is approximate.** Rail positions interpolate corridor waypoints, not surveyed tracks.
  Alternative-origin TfL fixtures support a bounded London area and named examples, not arbitrary
  worldwide journeys or full live geocoding.
- **Accuracy is an input model.** Radius, speed and missing-fix observations exercise inference gates.
  They do not recreate every indoor reflection, GPS drift pattern, sensor fusion behaviour or radio
  condition on a physical train or iPhone.
- **Identification can remain ambiguous.** Competing services are intentional. The delay fixture models
  a corridor restriction affecting competitors too; it does not prove that every combination of
  overlapping, independently delayed trains can be distinguished. An existing confident choice and
  passenger selections also affect what the app can know.
- **Verification is bounded by its assertions.** A PASS proves the defined observed expectation, not
  every possible journey decision or a guarantee about the next real commute. Inconclusive results
  remain explicit. See the [scenario coverage matrix](simulator-scenario-coverage.md) for executed tests,
  expected outcomes and results, rather than assuming a fixture is proof of coverage.
- **Mobile browser tests are not physical-device certification.** Automated DOM and Chromium mobile
  checks cover application responses, layouts and controls. Real iPhone Safari permission prompts,
  background execution, VoiceOver and real poor-signal delivery still require device testing.
- **Live-source combinations are not deterministic full journeys.** With either synthetic source off,
  real-world location or provider data may disagree with the scenario. Use both switches on for the
  coordinated experiment and inspect independent combinations as targeted diagnostics.

## Troubleshooting

| Symptom | Explanation or next action |
| --- | --- |
| The setup panel disappeared after Start. | Expected: the real app takes priority. Use **Show controls** in the bottom bar. |
| Nothing moves after starting. | The first checkpoint starts paused. Select **Continue** or **Next checkpoint**. |
| Next checkpoint is temporarily disabled. | A step or application refresh is settling. Wait for its check to finish. |
| A changed route or scenario has not taken effect. | Guided choices apply on Start/Restart; Advanced changes require the indicated Restart. |
| Back is disabled. | It needs both synthetic sources, an earlier reachable waypoint, and no pending configuration restart. |
| The app no longer knows which train or tube I am on after Back/Reset. | Expected: earlier evidence was deliberately discarded. Inspect the actual response, continue for new fixes, or use the app’s normal choices. |
| The app recommends a different route. | The selector controls passenger movements, not recommendations. Inspect the real board and use the app’s normal choice/alighting controls. |
| The app keeps showing a planning view. | Check whether you pinned Plan or Live. Use **Auto** for automatic journey presentation. |
| Home arrival is inconclusive. | A saved home is required for that assertion. Configure it outside simulation, then start again. |
| Many checks became inconclusive. | Read **Expected and actual**. Check source switches, accuracy, missing passenger choices and manual overrides; restart for a clean comparison. |
| A checkpoint fails, then the app recovers. | The earlier failure remains recorded. Export before restarting so the evidence is retained. |
| Copy results does not use the clipboard. | Use the selectable fallback or **Export JSON**. |
| You want real operation back immediately. | Select **Stop**. Reload also exits simulation, but discards the in-memory report and unsaved drafts. |

For the engineering contract and evidence, see the [capability story](stories/journey-simulator.md),
[scenario coverage](simulator-scenario-coverage.md), [staged UX and technical review](simulator-ux-review.md)
and [architecture](architecture.md).
