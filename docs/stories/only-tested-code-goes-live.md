# Only tested code goes live
Status: Partly done (publishing waits for green since 30 Oct; merging still doesn't: low priority, accepted debt) · Since: 30 Oct 2026 · Issues: #30

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

Later on 30 Oct Sam asked for the first two criteria now: the live site publishes from the Tests workflow, only after
every check passes ([sdlc.md](../sdlc.md), Publishing).

## Acceptance criteria
- Done (30 Oct): the live site publishes only from a commit whose GitHub Tests run passed (job `deploy` in
  `.github/workflows/test.yml`; Settings → Pages → Source → GitHub Actions), never from every push.
- Done (30 Oct): a failed run on `main` leaves the previous live version in place; an older commit never overwrites
  a newer one.
- Open: every change waits for GitHub green on its branch before merging; the fast path in `CLAUDE.md` is retired, and the
  Known risks entry is closed.

## Tests
- None automated (it's the release pipeline itself). Verified 30 Oct on the first publish from the workflow: see the
  commit that merged it. Not yet proven: a red run on `main` publishing nothing (it would need a deliberately failing
  commit on `main`).

## Not yet / open questions
- The built-page check (GitHub's and `npm run ci`) ignores any change on the footer line, because that line also
  carries the build time; a stale footer would go unnoticed. Minor.
- When: Sam's call, once cycle time matters less than change failure rate (e.g. when others use the app).
