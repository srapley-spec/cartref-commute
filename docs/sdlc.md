# How changes reach the live app (SDLC)

The single description of how a change goes from idea to the live app. For Sam to read and change, and for every
Claude session to follow (`CLAUDE.md` pulls this file in). Decided by Sam on 29–30 Oct 2026; why each rule exists is in
the [decisions log](architecture.md#decisions-log). Change a rule here, in the same commit as anything that depends on it.

**The balance (Sam, 30 Oct):** fast cycle time, so bugs found while travelling are fixed, live and retested within
minutes, carefully balanced against change failure rate. Stricter later; the gap accepted for now is in
[Known risks and technical debt](architecture.md#known-risks-and-technical-debt).

## The steps
1. **Read first.** The story for the area (`docs/stories/`) and [architecture](architecture.md). A new capability
   gets a story; a behaviour change updates its story in the same commit (`CLAUDE.md`, "Keep the context current").
2. **Branch from `main`**, never from another unmerged branch. Before merging, merge `main` in, re-run everything,
   and re-read the stories and golden diffs against what `main` now does. (29 Oct: #27–#29 were built on #26 while
   `main` moved on; their stories described the morning's app, and nothing flagged it.)
3. **Toggles are Sam's call.** For a very complex or experimental change, recommend one (Settings → Experimental,
   off by default) and ask. A toggle Sam agrees to is tested off and on, and he's told it exists and where.
4. **Bigger changes get an independent test review before merging** (Sam, 29 Oct): a separate agent that didn't
   write the code makes deliberate one-line breakages (mutation testing) and probes edge cases against the story;
   fix what it finds, re-run its survivors, and merge only once it's satisfied. Give it the commit to review (an
   agent's worktree starts at `main`). This decides whether the tests are good enough; the merge paths below decide
   when to merge.
5. **Commit messages** say what changed for the person using the app, not just the code, and name the merge path.
6. **`npm run ci` passes** on the committed code before any merge (below).
7. **Merge** by the fast path or after GitHub is green (below).
8. **GitHub tests `main`, then publishes.** The live site updates only after every check passes on that commit.
9. **Check the result** (after every push to `main`, below) before telling Sam it's done.

## The local check: `npm run ci`
Repeats every GitHub check (install, type-check, built page matches `src/`, docs kept current, all tests) on a fresh
copy of the committed code. Before it starts, it refuses:
- uncommitted changes (they wouldn't be what's pushed);
- a Node version other than GitHub's (read from `.github/workflows/test.yml`);
- a branch that doesn't contain the latest `main` (it fetches `main` from GitHub first).

When it passes it prints the merge path the changed files require (category 1 below). It can't stand in for GitHub's
machine (timing-sensitive tests), and it can't detect categories 2–6: those need judgement.

## Merging to `main`
Say which path, and why, in the commit message and in the report to Sam (before merging when possible). Sam can
always say "wait for GitHub".

**Fast path (default): merge once `npm run ci` passes; check GitHub afterwards.** For engine logic, rules,
thresholds, ranking (`src/core`); what the page draws (wording, lozenges, layout, order); tests, golden
re-recordings, docs, stories.

**Wait for GitHub green on the branch first** when the change touches something the local check can't fully stand
in for, or something a fix-forward can't repair:
1. **Build or test machinery**: `package.json`, the lockfile, `tools/`, `.github/`, `tests/harness.mjs`,
   `tests/clock.mjs` (if these are wrong, the local check itself may be wrong). `npm run ci` detects this one.
2. **Saved data on the phone**: the shape of saved settings or state, renaming or dropping keys (a bad write
   corrupts what's stored; the next commit doesn't undo it).
3. **What's fetched from live feeds**: endpoints, request counts or frequency, keys, the proxy (quotas, a refused
   key; the goldens show these as request changes).
4. **Location and permission handling** (a prompt loop makes the app unusable on the move).
5. **Timing-sensitive page tests** changed, or one failed then passed on a re-run during the work.
6. **`main` is red**, or its latest result wasn't seen: nothing merges until it's green, except a revert (below).

If unsure, take the GitHub-first path and say why.

## Publishing
GitHub Pages publishes from the Tests workflow (`.github/workflows/test.yml`, job `deploy`): only for a push to
`main`, only after every check has passed on that commit, and only if it is still the latest commit on `main` (an
older run never overwrites a newer one). A red run publishes nothing: the live app stays on the last green commit.
It publishes the committed files as they are. Requires Settings → Pages → Source → "GitHub Actions".

## After every push to `main`
1. Check GitHub's run for that exact commit (≈2–3 min): the tests, and that the `deploy` job published (or skipped
   because a newer commit superseded it) before telling Sam the change is done.
2. Never merge on top of red: before each merge, confirm the latest `main` run passed. If it failed, or wasn't
   seen, it comes first.
3. A failure is investigated to its cause, never waved off as a flake. If it's a difference between GitHub's machine
   and the local check, tell Sam: the local check has a gap.
4. Start of every session: check the latest `main` run before anything else (a session can end before a run
   finishes, and a push to `main` doesn't wake a session; only pull requests do).
5. Tell Sam about every failure found: the cause and the fix, even when the fix is already in.

## When `main` goes red, or a change breaks the live app: revert first
A red `main` blocks every publish, including the next urgent fix, so getting back to green comes before the fix.
1. **Revert** the commit that broke it (`git revert <sha>`: a new commit; never rewrite `main`'s history). The revert
   takes the fast path once `npm run ci` passes, even though `main` is red: it returns `main` to a commit GitHub
   already passed.
2. **Then fix** on a branch through the normal steps, and re-land the change with the fix.
3. Tell Sam what broke, the revert, and when the fix follows.

Fix forward without reverting only when reverting would itself do harm: the change wrote saved data or settings
the old code can't read (category 2). Then the fix takes the GitHub-first path. The same applies to a live bug a
recent change introduced while Sam is relying on the app: revert first, then fix.

## The proxy (`proxy/worker.js`)
The proxy is a Cloudflare Worker that Sam deploys by hand (Cloudflare dashboard; setup steps at the top of the
file). GitHub doesn't deploy it, and Claude never handles its keys or the Cloudflare account.
1. A proxy change takes the GitHub-first path (category 3) and has tests in `tests/proxy.test.mjs`.
2. **Old and new must work together.** The deployed proxy lags `main` until Sam deploys it, so the page must keep
   working with the proxy that's deployed now, and the new proxy with the page that's live now. A page change that
   needs the new proxy lands only after Sam confirms the new proxy is deployed.
3. After merging, tell Sam: that a proxy deploy is needed, what changed and why, any new variable or secret by
   **name** only (never a value), and how to check it worked. Record the deploy date in the story when Sam
   confirms it.
4. No proxy change goes live by itself: until Sam deploys it, the proxy in Cloudflare is still the old one.

Open question: whether Sam's phone uses the proxy at all today (Settings → Source); if not, rule 2 is moot until it
does.
