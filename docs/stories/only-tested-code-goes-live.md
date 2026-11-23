# Only tested code goes live
Status: Built, waiting for Sam (workflow change he merges, then the Pages source switch) · Since: 30 Oct 2026 · Issues: #30, how-we-work #2

## Story
As Sam, once the app is stable enough that a slower release is worth it, I want a change to reach the live app only
after GitHub's tests have passed on it, so that a change that only fails on GitHub's machine is never live, even
briefly.

## Where it came from
30 Oct: removing the effort-levels toggle was merged to `main` 2 seconds after its branch was pushed; GitHub Pages
published it at 07:36, before any GitHub test result existed (all passed by 07:37). Sam chose to keep fast cycle time
for now (fixes while travelling, retested in production) and accept the gap as debt: every change passes `npm run ci`
locally first, GitHub's result on `main` is checked after every push, and nothing merges on a red `main`
(`CLAUDE.md`, "Merging to `main`"). The risk is recorded in `docs/architecture.md` (Known risks and technical debt).

Since then (18–20 Nov) how-we-work RULES 3–4 made it the rule in every repository: nothing merges before its checks
pass, and the live site publishes only after the tests pass on `main`. The merge half is built ("Merge when green",
20 Nov; the old fast path is retired). The publishing half was the gap found by the workflow audit (how-we-work #2,
23 Nov): Pages still built every push to `main` from the branch, so a merged commit went live about 20 minutes before
its Tests run on `main` finished (06b12c3, 21 Nov: published 14:26, Tests finished 14:47).

## How it works (23 Nov)
- The Tests workflow has two more jobs. `pages-source` runs after both the web job and the iPhone job pass, only on
  `main` and only for a push (Sam's own merges) or a dispatched run (the run Merge when green starts after a pipeline
  merge); never for a pull request or the nightly run. It publishes nothing if the Pages source isn't "GitHub
  Actions" yet, or if `main` has already moved on to a newer commit (that commit's own run publishes it). Then
  `pages` uploads the committed site as it is (no build step; the test job has already checked `index.html` is built
  from `src/`) and deploys it with `actions/deploy-pages`.
- A failed test or iPhone job skips both, so the previous live version stays.
- Merge when green no longer asks for the branch build once the source is "GitHub Actions"; until Sam switches it,
  it asks as before, so the site keeps publishing in the meantime (still before the tests, until the switch).
- A failed Pages deploy fails that Tests run on `main`, which Merge when green treats as a red `main` (RULES 4.3).

## Acceptance criteria
- The live site publishes only from a commit whose GitHub Tests run passed (Pages deployed by the Tests workflow,
  Settings → Pages → Source → GitHub Actions), never from every push.
- A failed run on `main` leaves the previous live version in place.
- Every change waits for GitHub green on its branch before merging; the fast path in `CLAUDE.md` is retired, and the
  Known risks entry is closed.

## Tests
- `tests/ci-workflows.test.mjs`: "Pages publishes only a main commit that passed Tests (only-tested-code-goes-live)"
  loads the production workflows and checks the Pages jobs wait for both jobs, run only on `main` for a push or
  dispatch, publish nothing from a branch source or an older commit, and that Merge when green asks for the branch
  build only while the source is a branch.
- Not proven yet: a real failing run on `main` that doesn't publish. After the switch, check the first merges: the
  `github-pages` deployment's commit and time come after that commit's Tests jobs.

## Not yet / open questions
- Sam: Settings → Pages → Build and deployment → Source → **GitHub Actions** (`docs/your-setup-steps.md`, 7). Until
  then nothing changes on the live site.
- Jekyll no longer runs on the site once the source is GitHub Actions: the files are served exactly as committed
  (Markdown files are no longer turned into pages; the app doesn't use them).
- The built-page check (GitHub's and `npm run ci`) ignores any change on the footer line, because that line also
  carries the build time; a stale footer would go unnoticed. Minor.
