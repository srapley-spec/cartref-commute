# Earlier-train prompt: a catchable train much sooner outranks "On track"
Status: Built 24 Nov 2026 (the engine decides, the page draws; no toggle, see the first open question) · Since: 24 Nov 2026

## Story
As a commuter following a journey, when I reach the station and a train that gets me home much sooner is still
catchable, I want the app to say so at the top of the card, with how sure it is that I can catch it and a one-tap
choice, so that I make the decision knowing what it is, and never read "On track" as "nothing better to do".

## Where it came from
24 Nov 2026, homeward, King's Cross, about 18:44. Sam was following the 18:54 (home 19:56). The app's status line was
green "On track · train departs in 9 min". The 18:48 (home 19:38, 18 minutes sooner) was catchable and the app knew:
"Another option · 18 min sooner · Arrives first · Walk at your usual pace" was drawn, but below the fold, at the same
weight as any alternative, under a green line that said all was well. Sam: "The app should have highlighted this more
clearly. Give me some options." He chose the smallest: "It should be option 1. Just needs to be clear and I can make
the decision." The mock-up (a Design canvas, 24 Nov) showed the status slot taken over by the earlier train.

It also exposed a second problem: the earlier train's margin (platform by 18:47, departing 18:48, platform not yet
announced) was shown as "Walk at your usual pace", which says nothing about how likely it is you make it. The prompt
carries a catchability tier for that reason.

## Acceptance criteria
- **When (engine, `updateFollowRoute` → `prompt`):** all of: the engine's own alternative exists (so every existing
  check has run: not missed, cancelled, uncertain, dismissed, no estimate; effort walk or fast; data fresh); it
  arrives **10 minutes or more** before your followed journey's expected arrival (`FOLLOW_PROMPT_MIN`, exact:
  9 min 54 s is not enough); you are before the train (`before-train`) and **it is still ahead of you** (once the followed train has
  gone you may be aboard: "Departure just passed · confirm if you are on it" is a question, and no "Switch to … / Keep
  …" is put to you); no connection is under way (on the tube to the station an alternative stays a quiet recovery
  offer); the offer is not "Same train still possible from …" (its own recovery message stands); and the followed
  train's status is on track or "Tight · walk fast", so never for one that is missed, cancelled or has no estimate
  (those keep "A way on"). **A badly late followed train (15+ min) does get it**, measured against where you now
  expect to arrive: that is when a much better train matters most. Otherwise `prompt` is null.
- **Below ten minutes nothing changes.** From 5 minutes (`FOLLOW_BETTER_MIN`, unchanged) to under 10 it stays the
  quieter "Another option" below the card, with its own buttons, and "On track" is untouched.
- **Catchability tier:** `spareMin` is the whole minutes until you must be moving for it (never below 0: the same
  "to spare" the followed train's own status uses). **Comfortable**: walk at your usual pace and 3 or more minutes to
  spare (`FOLLOW_PROMPT_SPARE_MIN`, exact: 2 min 59 s is tight). **Tight**: a fast walk, or under 3 minutes. A run or
  a car is never offered as a better option, so there is no third tier today.
- **"On track" gives way.** While a prompt is shown, the followed train's own green "On track · …" line loses
  those words and the colour: "On track · train departs in 9 min" → "Train departs in 9 min" (neutral);
  "On track · N min to spare" → "N min to spare"; a bare "On track" → "Your train is unchanged". It is still true; it
  must not read as "all is well" beside a better train. Amber lines ("N min later than planned", "Tight · walk
  fast") and every other status are untouched.
- **What the page draws** (`#followPanel > .follow-prompt`, `data-block="earlier-train"`): first under "Following your
  route", above the arrival headline. In order: "Earlier train catchable" and the tier pill (amber when tight, green
  when comfortable, "Tight · walk fast", "Comfortable · N min to spare", "Tight · go now" at 0); the answer first:
  "Home 19:38" (or "Office …") and "18 min sooner"; the train named as on the platform ("18:48 Great Northern to
  Kings Lynn · Be on platform 10 at King's Cross by 18:47", and " · platform not announced yet" until it is; " · walk
  at your usual pace" when comfortable); then **Switch to 18:48** and **Keep 18:54**, the existing `switch` and
  `dismiss` actions. Switch follows the earlier train (the same path as "Follow this instead"); Keep dismisses it, and
  the prompt, and the quieter "Another option", do not return for that train.
- **Nothing is lost.** The alternative's own journey (overview, calling points, line chips, flags) is folded under
  "Details of the 18:48" inside the prompt, drawn once, with no second pair of buttons. Open state survives a refresh
  (`data-key="follow-prompt|<route id>"`).
- **Never switches for you.** The prompt offers; only Switch changes the followed journey.
- **Modes:** Commute and Leisure, outbound and homeward, since they share this followed card and engine. **Trip** has
  its own following engine (`followTrip.ts`, "Trip on the journey card" in `leisure-journeys.md`) and is not changed.

## Tests
- tests/core/earlier-train-prompt.test.mjs: "a catchable train 18 minutes sooner takes the status slot: prompt present, 'On track' gives way"
- tests/core/earlier-train-prompt.test.mjs: "the threshold is ten minutes: nine is the quieter 'Another option' and keeps 'On track'"
- tests/core/earlier-train-prompt.test.mjs: "catchability tiers: three or more minutes to spare at your usual pace is comfortable; under three, or a fast walk, is tight"
- tests/core/earlier-train-prompt.test.mjs: "a run or a car is never prompted (the engine does not offer them as better options)"
- tests/core/earlier-train-prompt.test.mjs: "no prompt for an alternative that is not catchable: missed, cancelled, uncertain or already gone"
- tests/core/earlier-train-prompt.test.mjs: "a dismissed alternative stops prompting ('Keep 18:54'); stale data never prompts"
- tests/core/earlier-train-prompt.test.mjs: "when the followed train is itself in trouble the existing recovery offer stands and no prompt is made"
- tests/core/earlier-train-prompt.test.mjs: "only before boarding and never during a connection; on the train or after it there is no prompt"
- tests/core/earlier-train-prompt.test.mjs: "once the followed train has gone there is no prompt: you may be aboard, so it is a question, not a better choice"
- tests/core/earlier-train-prompt.test.mjs: "the same train from another station is the existing recovery offer, not a prompt"
- tests/core/earlier-train-prompt.test.mjs: "a badly late followed train still gets the prompt (that is when a better train matters most), measured against the late arrival; not on the tube to the station"
- tests/core/earlier-train-prompt.test.mjs: "the words that replace 'On track' for each form it takes, and the gain is rounded as the 'N min sooner' line always was"
- tests/core/earlier-train-prompt.test.mjs: "a tight followed train keeps its own warning beside the prompt"
- tests/core/earlier-train-prompt.test.mjs: "a followed train running late stays amber and is not reworded by the prompt"
- tests/earlier-train-prompt.test.mjs: "a catchable train 15 minutes sooner is the first thing on the followed card, with Switch and Keep; 'On track' gives way"
- tests/earlier-train-prompt.test.mjs: "an unannounced platform says so, and a tight margin is amber"
- tests/earlier-train-prompt.test.mjs: "when the followed train has already left there is no prompt (you may be aboard)"
- tests/earlier-train-prompt.test.mjs: "'Switch to 10:20' follows the earlier train; the prompt is gone and the new train is 'On track'"
- tests/earlier-train-prompt.test.mjs: "'Keep 10:15' keeps the followed train and the prompt does not come back for that train"
- tests/earlier-train-prompt.test.mjs: "under ten minutes sooner it stays the quieter 'Another option' below the card, with 'On track' unchanged"
- tests/earlier-train-prompt.test.mjs: "the prompt survives a refresh with Details open"

## How it was checked
24 Nov 2026: 15 one-line breakages of the engine's conditions and 8 of the page wiring (threshold and tier boundaries,
each guard, the wording, rounding, button actions, placement, duplicate block, open state), each caught by these tests;
a first pass found four guards the tests did not pin down (a badly late train, a connection, the same train from
another station, the bare "On track" wording) and they were fixed or tested. Rendered at 390 px, light and dark, in
Chromium from the real page's own markup and CSS (not a Safari or iPhone check).

## Not yet / open questions
- **For Sam to confirm (my choices, not yet yours):** the 10-minute threshold; the 3-minute "comfortable" line; and
  shipping with no toggle. It changes what a status line says and adds one block, rather than adding a capability,
  and Keep makes it easy to ignore. Say if you'd rather have it under Settings → Experimental.
- The tier measures time to spare against *your* walk; it does not know the doors close 30 to 40 seconds before
  departure, nor how far a late-announced platform is. An unannounced platform is stated but does not lower the tier.
  Tonight's case (about 2 minutes to spare, platform unannounced) would have read "Tight · 2 min to spare".
- **Not built:** telling you without the app open (a Live Activity update or push when an earlier train becomes
  catchable); and auto-switching with Undo. Both were options 3 and 4 in the 24 Nov discussion; 4 would also have to
  respect "in London, only hear about a real risk" (`commute-watch.md`).
- Not before the station: with no fix near the platform the engine reports unknown, and there is no prompt.
- The mock-up showed no "Another option" block; it is folded under Details instead, so no journey information is lost.
