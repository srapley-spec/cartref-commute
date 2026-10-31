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
