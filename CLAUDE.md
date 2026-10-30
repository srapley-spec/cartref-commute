# Cartref Commute — working rules

Read this first, every session. The context for this project lives in this repo, not in any chat.

## Where the context is
1. `docs/architecture.md`: what the app is for, the four layers, the principles, data sources, decisions log, plan.
2. `docs/stories/`: one file per capability: who it's for, the real trip that produced it, acceptance criteria
   with the exact thresholds, the tests that prove it, status. `docs/stories/README.md` is the index.
3. The tests: the exact behaviour. Prose explains why; tests enforce what.

Read `docs/architecture.md` and the stories for the area you're changing before changing code.
If a chat, issue or memory disagrees with these files, the files win until they're updated; say so.

## Keep the context current (enforced)
- **A behaviour change updates its story in the same commit (or PR):** acceptance criteria, thresholds, test
  links, status. A new capability gets a new story. A decision changes `docs/architecture.md` (decisions log).
- CI (`tools/check-docs.mjs`) fails when `src/`, `tests/` or `proxy/` change with nothing under `docs/` or
  this file, unless a commit message in the change has a line `Docs: none — <reason>` (refactor, test-only
  tidy, build output). Use that only when behaviour really is unchanged.
- CI also fails if a story links a test that doesn't exist. Renaming a test means updating its story.
- The check proves the docs were touched, not that they're right. Write them as if the next session has
  nothing else to go on, because it doesn't.

## Principles (summary; detail in docs/architecture.md)
- Never hide a train: show it with flags.
- Find options from live data, don't hard-code them; known examples are test cases.
- Real data over estimates; answer the real question (when to leave, which route, arriving when).
- When unsure, ask and remember; don't silently overrule the person.
- Generic engine, bespoke data: anything that would apply at any station goes in `src/core`; only data and
  genuinely station-specific rules go in `src/core/profiles/`.
- Don't overwhelm the interface: detail replaces a line or folds away.
- Toggles are Sam's decision: recommend one for a very complex or experimental change and ask; never by default
  (`docs/sdlc.md`).

## Code rules
- `src/core` is pure: no DOM, no network, no clock reads, no hard-coded places. Data sources are injected.
- `src/page.html` fetches, caches and draws; it doesn't plan.
- Every time on screen comes from a route's segments; don't write timing arithmetic elsewhere.

## Build and test
- `npm ci` once. `npm test` builds and runs everything (≈2–3 min). `npm run typecheck` for the engine.
- `npm run check-docs` checks story test links (also part of CI).
- `npm run ci` runs every check GitHub runs (install, typecheck, built page, docs, all tests) on a fresh copy of the
  committed code (HEAD), and prints the merge path the changed files require. Required before any merge to `main`.
- After editing `src/`, run `npm run build` and commit `index.html`; CI fails if it's stale.
- Golden tests: after an intentional change, `UPDATE_GOLDEN=1 npm test`, read every diff in `tests/golden/*.json`,
  and say in the commit what changed and why.
- Tests run on a virtual clock (Tue 3 Nov 2026 10:00, `TZ=Europe/London`).
- Page tests: add `after(closeAll)` (harness) to every file, or one failing test leaves a page open and the run hangs.
- In Claude Code cloud sessions `gh` GraphQL commands (`gh pr list`, `gh pr view`) are blocked: use the REST API
  (`gh api repos/srapley-spec/cartref-commute/pulls`). Never `pkill -f` a pattern that matches your own shell; kill
  by PID. A fresh clone may fetch only some branches: add a fetch refspec for a branch you need to track.

## Release: how changes reach the live app
The whole SDLC (branching, `npm run ci`, merge paths, publishing, checks after every push, revert first, the proxy)
is in `docs/sdlc.md`, pulled in here:

@docs/sdlc.md

## Working with Sam
- Direct, evidence-based; state confidence and what's unverified. Investigate root causes from code and data
  before proposing fixes. Run the tests before saying something works.
- Never ask for or handle raw API keys; they live in the phone's Settings (or GitHub secrets).
- Backlog lives in GitHub issues; anything worth keeping from an issue gets a story.
