# CI-COST-01: avoid duplicate checks without reducing coverage

Sam requested CI cost savings on 19 November 2026.

Status: implemented for owner workflow review, not merged/released.

## Architecture and decision

The Tests workflow runs for pull requests targeting main, pushes to main, manual dispatches and nightly main checks. Feature-branch push events no longer start a second copy of the same PR checks. Only superseded PR checks are cancelled. Event/ref-specific groups keep manual and nightly checks from cancelling main release checks. No test selection or suite reduction is introduced: type checking, generated page, docs checks, complete page/engine tests, NativeCore and simulator tests all remain.

The existing TestFlight workflow is unchanged: it consumes successful same-repository main **push** Tests runs, checks out their exact SHA, preserves its release queue and never signs PR/nightly runs. Every tested main app revision remains eligible. Web files are bundled into the app, so web-only changes are not excluded from native validation or releases.

## Tests

- An open PR receives one complete gate per new revision, not both branch-push and PR gates.
- A newer PR revision can cancel obsolete tests; it cannot skip any test in the final revision.
- Main releases cannot be cancelled by a PR or nightly run. Failed checks cannot initiate TestFlight.
- Nightly and manual runs retain the full pack and introduce no new deployments.
- `tests/ci-workflows.test.mjs` loads the production YAML and asserts trigger restrictions, cancellation scope, unchanged full commands, exact-source signing boundary and preserved release queue. It runs in the normal regression pack.
- Complete web/typecheck/docs and GitHub iOS checks plus independent workflow review are required. Physical acceptance NOT RUN: product UI and behaviour unchanged.

## Release and user journey

No screen, journey, permission, proxy, Pages configuration or signing credential changes. Sam merges workflow changes under canonical how-we-work RULES 3.3; no agent merge or branch release. Confirm main checks after merge. Existing Pages/proxy publishing mechanisms are unchanged by this cost-only change.

Independent source/policy review passed; deliberate duplicate-push and PR-signing mutations were killed. Full test/CI evidence is recorded in the PR; no release is claimed here.
