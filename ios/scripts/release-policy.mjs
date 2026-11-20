export const repository = 'srapley-spec/cartref-commute';

export function testedMainSHA(event) {
  const run = event.workflow_run;
  if (event.action !== 'completed' || run?.name !== 'Tests' || run.conclusion !== 'success' ||
      run.event !== 'push' || run.head_branch !== 'main' || run.head_repository?.full_name !== repository ||
      event.repository?.full_name !== repository || !/^[a-f0-9]{40}$/.test(run.head_sha)) {
    throw new Error('TestFlight requires successful Tests on a main push in the Commute repository.');
  }
  return run.head_sha;
}

// A run that Merge when green dispatched creates no workflow_run event, so Tests dispatches TestFlight itself once its
// web and iPhone jobs pass on main. The workflow's first step checks that run through GitHub's API before this runs.
export function dispatchedMainSHA(event) {
  const sha = event.inputs?.source_sha;
  if (event.ref !== 'refs/heads/main' || event.repository?.full_name !== repository ||
      !/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[0-9]+$/.test(event.inputs?.tests_run_id ?? '')) {
    throw new Error('A dispatched TestFlight needs a main commit and the Tests run that passed it, in the Commute repository.');
  }
  return sha;
}

export function releaseSHA(eventName, event) {
  if (eventName === 'workflow_run') return testedMainSHA(event);
  if (eventName === 'workflow_dispatch') return dispatchedMainSHA(event);
  throw new Error('Uploads run only from the trusted TestFlight workflow.');
}
