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
