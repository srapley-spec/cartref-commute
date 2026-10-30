# Only tested code goes live
Status: Planned (low priority; accepted technical debt) · Since: 30 Oct 2026 · Issues: #30

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

## Acceptance criteria
- The live site publishes only from a commit whose GitHub Tests run passed (Pages deployed by the Tests workflow,
  Settings → Pages → Source → GitHub Actions), never from every push.
- A failed run on `main` leaves the previous live version in place.
- Every change waits for GitHub green on its branch before merging; the fast path in `CLAUDE.md` is retired, and the
  Known risks entry is closed.

## Tests
- None yet (gap). Proof would be a deliberately failing commit on a test branch that doesn't publish.

## Not yet / open questions
- When: Sam's call, once cycle time matters less than change failure rate (e.g. when others use the app).
