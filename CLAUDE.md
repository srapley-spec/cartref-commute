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
- **Maintain every supported UI concurrently (Sam, 31 Oct).** A feature, bug fix, shared rule or new journey fact
  ships in every supported design and applicable view in the same change. Geometry may differ; availability,
  meaning, values, status and actions must remain equivalent. Do not defer another design as follow-up work.
  Reuse shared renderers and engine facts rather than duplicating calculations or making artificial file edits.
  The only exception is one Sam explicitly approves for named surfaces, recorded as below (Trip mode is Signal-only:
  `docs/decisions/trip-signal-only.md`, 1 Nov). Never assume one.
- Toggles are Sam's decision. For a very complex or experimental change, recommend a toggle (Settings → Experimental,
  off by default) and ask; don't put every new or changed feature behind one. A toggle Sam agrees to is tested off and
  on, and he's told it exists and where.

## Code rules
- `src/core` is pure: no DOM, no network, no clock reads, no hard-coded places. Data sources are injected.
- `src/page.html` fetches, caches and draws; it doesn't plan.
- Every time on screen comes from a route's segments; don't write timing arithmetic elsewhere.

## Build and test
- `npm ci` once. `npm test` builds and runs everything (≈2–3 min). `npm run typecheck` for the engine.
- `npm run check-docs` checks story test links (also part of CI).
- **UI parity is a mandatory release gate, without a waiver.** `config/ui-parity.json` registers supported designs
  and surfaces. `tests/ui-parity.test.mjs` exercises their actual visible semantic contracts. `npm test`, the clean
  committed-HEAD CI and GitHub all require every design/surface tuple to pass; missing, skipped, TODO, duplicate
  or failed cases block release. `Docs: none` does not waive parity. `npm run check-ui-parity` runs this matrix alone.
  Add a surface and its actual-page cases when adding a view; all engine views must be represented. Extend the
  shared contract when adding information or actions, including appropriate missing/stale/unknown states.
  Production `data-design` selectors and assignments under `src/` must match the registry. Select design IDs
  through explicit literals/conditional branches; opaque computed assignments fail the gate rather than evade
  inventory. Historical design proposals under `docs/` are outside the production inventory.
- A surface may be limited to some designs **only with Sam's explicit exception**: its registry entry lists `designs` and
  an `exception` decision under `docs/` containing `Approved by: Sam` and, per surface,
  `Design exception: surface:<id> designs:<ids>` (IDs sorted, comma-separated, e.g. `designs:signal`). Only a new surface
  can start as an exception (one every design already had cannot lose a design that way). The gate then requires the
  listed designs' cases and, for each left-out design, a negative case proving the surface really is absent there.
  Do not invent approval; an exception is not retirement and covers only the surfaces it names.
- A UI leaves the matrix **only after Sam explicitly retires it and the implementation is removed**. In the same
  change, retain a `retired` record (`kind`, `id`, `decision`) and a decision under `docs/` containing the exact lines
  `Approved by: Sam` and `Retired UI: design:<id>` (or `surface:<id>`). Record the real decision and its context;
  do not invent approval. CI rejects silent registry shrinkage or removed retirement history. A design being old,
  experimental or temporarily inconvenient is not retirement.
- `npm run ci` runs every check GitHub runs (install, typecheck, built page, docs, all tests) on a fresh copy of the
  committed code (HEAD). Commit first; it refuses uncommitted changes. Required before any merge to `main`.
- After editing `src/`, run `npm run build` and commit `index.html`; CI fails if it's stale.
- Golden tests: after an intentional change, `UPDATE_GOLDEN=1 npm test`, read every diff in `tests/golden/*.json`,
  and say in the commit what changed and why.
- Tests run on a virtual clock (Tue 3 Nov 2026 10:00, `TZ=Europe/London`).
- Page tests: add `after(closeAll)` (harness) to every file, or one failing test leaves a page open and the run hangs.
- In Claude Code cloud sessions `gh` GraphQL commands (`gh pr list`, `gh pr view`) are blocked: use the REST API
  (`gh api repos/srapley-spec/cartref-commute/pulls`). Never `pkill -f` a pattern that matches your own shell; kill
  by PID. A fresh clone may fetch only some branches: add a fetch refspec for a branch you need to track.

## Release
- `main` is live (GitHub Pages publishes every push at once, before GitHub's tests finish). Work on a branch; merge
  to `main` as below.
- **Bigger changes get an independent test review before merging** (Sam, 29 Oct): a separate agent that didn't
  write the code makes deliberate one-line breakages (mutation testing) and probes edge cases against the story;
  fix what it finds, re-run its survivors, and merge only once it's satisfied. Give it the commit to review (an
  agent's worktree starts at `main`).
- **Branch from `main`, never from another unmerged branch.** Before merging, merge `main` in, re-run everything,
  and re-read the stories and golden diffs against what `main` now does. (29 Oct: #27–#29 were built on #26 while
  `main` moved on; their stories described the morning's app, and nothing flagged it.)
- Commit messages say what changed for the person using the app, not just the code.

### Merging to `main` (Sam, 30 Oct: fast cycle time, carefully balanced against change failure rate)
Every change: `npm run ci` passes before merging. Then one of two paths. Say which, and why, in the commit message
and in the report to Sam (before merging when possible); Sam can always say "wait for GitHub".

**Fast path (default): merge once `npm run ci` passes; verify GitHub afterwards.** For changes to engine logic,
rules, thresholds, ranking (`src/core`); what the page draws (wording, lozenges, layout, order); tests, golden
re-recordings, docs, stories.

**Wait for GitHub green on the branch first** when the change touches something the local check can't fully stand
in for, or something a fix-forward can't repair:
1. Build or test machinery: `package.json`, the lockfile, `tools/`, `.github/`, `tests/harness.mjs`,
   `tests/clock.mjs` (if these are wrong, the local check itself may be wrong).
2. Saved data on the phone: the shape of saved settings or state, renaming or dropping keys (a bad write corrupts
   what's stored; the next commit doesn't undo it).
3. What's fetched from live feeds: endpoints, request counts or frequency, keys, the proxy (quotas, a refused key;
   the goldens show these as request changes).
4. Location and permission handling (a prompt loop makes the app unusable on the move).
5. Timing-sensitive page tests changed, or one failed then passed on a re-run during the work.
6. `main` is red, or its latest result wasn't seen: nothing merges until it's green.

If unsure, take the GitHub-first path and say why. This is separate from the independent review above (whether the
tests are good enough); this decides when to merge. The fast path is accepted technical debt: `docs/architecture.md`
(Known risks and technical debt), issue #30.

### After every push to `main`
1. Check GitHub's Tests run for that exact commit (≈2–3 min) before telling Sam the change is done.
2. Never merge on top of red: before each merge, confirm the latest `main` run passed. If it failed, or wasn't
   seen, fixing it comes first.
3. A failure is investigated to its cause, never waved off as a flake; fix forward through the same steps. If it's
   a difference between GitHub's machine and the local check, tell Sam: the local check has a gap.
4. Start of every session: check the latest `main` run before anything else (a session can end before a run
   finishes, and a push to `main` doesn't wake this session; only pull requests do).
5. Tell Sam about every failure found: the cause and the fix, even when the fix is already pushed.

## Working with Sam
- Direct, evidence-based; state confidence and what's unverified. Investigate root causes from code and data
  before proposing fixes. Run the tests before saying something works.
- Never ask for or handle raw API keys: never in chat, the repo, test data, logs or commit messages. They live in the
  phone's Settings, GitHub secrets, or (Sam, 31 Oct) the Claude Code cloud environment's secrets, so a session can call
  the live feeds to prove data instead of guessing: `TFL_APP_KEY`, `RDM_API_KEY`, `RDM_SD_API_KEY`, `RDM_BASE_URL`,
  `RDM_SD_BASE_URL`. Read them from the environment; strip them from anything saved (e.g. recorded feeds).
- Backlog lives in GitHub issues; anything worth keeping from an issue gets a story.
