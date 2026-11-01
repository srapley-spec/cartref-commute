# Along the line independent review — PR #42
Reviewer: /root/along_independent_review (did not implement the feature)
Original reviewed commit: 269c3c3e4e526ba524a06c89d8d4d262a5e46950
Final source reviewed: 476ed04873ee3db456108cec43cd136ac40cf772
Verdict: APPROVE the reviewed implementation after fixes; no remaining blocking finding in this scope. Final repository CI/release gates remain required.

Four verified P2 findings were resolved:
1. Dark appearance used the light palette because the base ID selector outranked both dark selectors. The fixed selectors now apply the actual dark palette; Chromium tests assert colors rather than merely recording them.
2. In Panda, a current train's significant delay disappeared in the commentary dialog because the adapter scraped only a subset of hero DOM classes. Commentary now consumes the shared qualified disruption adapter.
3. Back to now scrolled to a frozen old position while an article was open. Explicit resumption now refreshes the marker despite the reading pause, while ordinary automatic refresh still preserves the reader's article.
4. Panda commentary could still miss a newer Service Details delay while its board remained on time. The existing qualified progress model now runs when Along the line is enabled, without drawing a Signal diagram in Panda. Fresh, stale, mismatched, cancellation and no-estimate controls pass; fresh reports also outrank stale-board wording in the arrival header. Panda with Along off retains its original early return.

Independent validation on the final source:
- Clean sequential focused replay: 37/37 tests passed across authored Along tests, independent Along regression tests, existing journey-progress cases and shared Signal disruption cases.
- Chromium: 320px and 390px; explicit and device light/dark; 15px and 30px body text; 44px action targets; no dialog horizontal overflow; focus return; no page errors. Actual light/dark colors are asserted.
- Typecheck passed.
- The suspected Settings/Browse focus loss did not reproduce: real Chromium returned focus to the visible Settings button. It is not a finding.
- Independent probes also cover reverse-route ordering, corridor/tunnel content reset, unknown station references, per-article full-text expansion, approximate landmark boundaries and GPS uncertainty buffers.

Mutation testing:
The original authored Along-specific suites missed four meaningful one-line faults: zero nearby radius, removal of the GPS uncertainty buffer, invented midnight station times, and a no-op Read full story button. Independent probes were added and committed. All four mutants were killed again by the expanded committed tests on final source 476ed04. A fifth original probe accepting stale GPS was already killed by authored coverage. No former survivor remains among these four retested faults. I did not run the whole repository suite per mutant or claim exhaustive mutation coverage.
Artifacts: /workspace/scratch/along-independent-mutations.json (original comparison), /workspace/scratch/along-independent-mutants-fixed.json (first fix), /workspace/scratch/along-independent-mutants-final.json (final), /workspace/scratch/along-independent-final-tests-clean.log, /workspace/scratch/along-independent-final-browser.log.

Limits:
This is an independent code and focused regression review, not a full repository CI run. Real iPhone Safari, VoiceOver and actual window visibility in both directions remain the explicit device/content acceptance limits documented in the story. No merge, deployment or external review comment was performed by this reviewer.


## Reconciliation with PR #43

Along the line reconciliation review addendum
Reviewed source: 76db650c7c639ac99f1606eb267fe0dcc3d18c98
Merged main: 3c5d161474f08f51d298cef4b23626a81eff3df0 (PR #43)
Verdict: APPROVE the reconciled source. No blocking composition or new-header finding.

Scope and findings:
- PR43's CLAUDE parity rule, CI/gate machinery, journey-facts helper, connection/station rules and shared CSS are preserved unchanged. Core exports are additive. Existing Auto/Plan/Live controls remain shared by both designs.
- The new header uses the existing journeyFactsMarkup and canonical on-train option, observed expected rail endpoint and already-computed final arrival. No production timing arithmetic or replacement journey start was introduced.
- Independently seeded a newer matching Service Details report (09:40 timetable, 10:00 expected) over a 09:40 board. Both Panda and Signal commentary show 55 minutes from 09:05 departure, matching the current main hero rather than the stale 35-minute board duration. Total duration matches the same canonical leave/final-arrival as the hero, with no added requests.
- Explicit null whole-journey arrival preserves known train duration while showing Total time unavailable. Explicit null rail endpoint exposes neither a retained train nor total duration. These nullable-context checks use the real commentary adapter via its Back to now action; no matching HTML is injected.
- The registry adds along-the-line without removing existing designs/surfaces. Both new real-page tuples independently passed, exercising default-off, visible stories/disruption/facts, stale location and unknown timing.

Executed focused validation:
- 12/12: two independent real-page composition probes plus the ten shared journeyFacts unit cases.
- 2/2: new Along UI-parity contracts (Panda and Signal). This was a focused tuple run, not a claim to have independently rerun the full mandatory matrix.
- Committed Chromium Along checks passed at 320/390px, manual/device light/dark, 15/30px text, 44px targets, no dialog overflow, focus return and no page errors.
- Original independent source/mutation approval is retained. No exhaustive mutation or full repository suite was repeated for this small composition review. Final committed-head CI/release gates remain required.

Evidence: /workspace/scratch/along-reconciliation-facts-tests.log; /workspace/scratch/along-reconciliation-matrix-tests.log; /workspace/scratch/along-reconciliation-browser/along-browser.json; isolated tests/review-along-composition.test.mjs.
Real iPhone/VoiceOver and physical window-visibility acceptance remain the documented limits. No push, merge or deployment was performed by this reviewer.


## Independent access and route-memory correction review

Reviewed initial access candidate `d41e8e0` and source fixes `2857359`. Approve the corrected source, subject to
final committed-head CI. This review covers the clarified requirement: explicit navigation remains available
before boarding; all route points remain browsable; GPS sets initial focus rather than access.

Two further P2 edge cases were reproduced and fixed:

- With empty interests, a reliable position marker could remain below the initial strip viewport because no
  featured point triggered scrolling. Opening/reopening now explicitly focuses the current position, including
  when a previously opened article is retained. Real Chromium geometry assertions cover both cases.
- Resetting route memory on direction/mode change was insufficient while an old `followUpdate` remained
  cached. A hidden office Farringdon route could repopulate a home/leisure scope. The candidate now has to match
  the restored saved route, current direction/mode and active phase before it can seed route memory.

Independent validation on the corrected built source:

- Four focused real-page tests passed: opposite-direction Follow, another mode, stopped/arrived cached results,
  and source changes. The source test verifies old corridor/article identity are discarded. No matching HTML is injected.
- The expanded real opt-in/guided-simulator Chromium flow passed both designs at 320/390px, checkpoints0–4 and
  further GPS progress, passed Hitchin reading, navigation/focus/44px targets, and empty-interest/reopen geometry.
- Four deliberate single-change faults were all caught: dropping source epoch from the route scope, dropping
  Follow direction validation, dropping Follow mode validation, and trusting stopped cached Follow state.
  These were focused access-suite mutations, not an exhaustive repository mutation run.

Regressions are retained in [review-along-access.test.mjs](../tests/review-along-access.test.mjs) and
[browser-along-access.py](../tests/browser-along-access.py). Existing independent source/PR43 approvals remain
applicable outside this correction. Native iPhone/VoiceOver and physical visibility checks remain documented
limits; this reviewer did not push, merge or deploy.
