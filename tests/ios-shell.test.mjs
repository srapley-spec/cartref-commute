import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { parse } from 'yaml';
import { stageWeb } from '../ios/scripts/stage-web.mjs';
import { nextBuildNumber, appStoreClient } from '../ios/scripts/app-store.mjs';
import { testedMainSHA, dispatchedMainSHA, releaseSHA, repository } from '../ios/scripts/release-policy.mjs';
import { checkChange } from '../tools/check-docs.mjs';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const expectedWebAssets = ['index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'sw.js'];

test('iOS bundles the committed page verbatim and excludes credentials and stale files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'commute-package-test-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']);
    for (const name of expectedWebAssets) await writeFile(path.join(dir, name), `fixture:${name}`);
    await writeFile(path.join(dir, 'private.p8'), 'not-a-real-key');
    await writeFile(path.join(dir, '.env'), 'DUMMY=not-a-real-secret');
    const output = path.join(dir, 'dist');
    await mkdir(output);
    await writeFile(path.join(output, 'old-secret.txt'), 'stale');
    await stageWeb(dir, output);
    assert.deepEqual((await readdir(output)).sort(), [...expectedWebAssets, 'build-provenance.json'].sort());
    for (const name of expectedWebAssets) assert.deepEqual(await readFile(path.join(output, name)), await readFile(path.join(dir, name)));
    const provenance = JSON.parse(await readFile(path.join(output, 'build-provenance.json')));
    assert.equal(provenance.sourceSHA, execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
    assert.equal(provenance.pageSHA256, createHash('sha256').update('fixture:index.html').digest('hex'));
    await rm(path.join(dir, 'index.html'));
    await assert.rejects(stageWeb(dir, output), /ENOENT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('iOS release accepts a dispatched main commit only with its Tests run, and only from the two trusted events', () => {
  const event = { ref: 'refs/heads/main', repository: { full_name: repository }, inputs: { source_sha: 'b'.repeat(40), tests_run_id: '123' } };
  assert.equal(dispatchedMainSHA(event), 'b'.repeat(40));
  assert.equal(releaseSHA('workflow_dispatch', event), 'b'.repeat(40));
  assert.throws(() => dispatchedMainSHA({ ...event, ref: 'refs/heads/claude/anything' }));
  assert.throws(() => dispatchedMainSHA({ ...event, repository: { full_name: 'someone/fork' } }));
  assert.throws(() => dispatchedMainSHA({ ...event, inputs: { ...event.inputs, source_sha: 'main' } }));
  assert.throws(() => dispatchedMainSHA({ ...event, inputs: { source_sha: 'b'.repeat(40) } }));
  assert.throws(() => dispatchedMainSHA({ ...event, inputs: { ...event.inputs, tests_run_id: '12; rm' } }));
  assert.throws(() => releaseSHA('push', event));
  assert.throws(() => releaseSHA('pull_request', event));
  assert.throws(() => releaseSHA('workflow_run', event));
});

test('a pipeline merge reaches TestFlight: Tests starts it only after both jobs pass on a dispatched main run', async () => {
  const job = parse(await read('.github/workflows/test.yml')).jobs.testflight;
  assert.deepEqual(job.needs, ['test', 'ios']);
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'");
  assert.deepEqual(job.permissions, { actions: 'write' });
  assert.match(job.steps[0].run, /^gh workflow run testflight\.yml .*--ref main -f source_sha="\$\{\{ github\.sha \}\}" -f tests_run_id="\$\{\{ github\.run_id \}\}"$/);
  const upload = parse(await read('.github/workflows/testflight.yml')).jobs.upload;
  const names = upload.steps.map(step => step.name ?? step.uses);
  const check = upload.steps[0];
  assert.equal(check.if, "github.event_name == 'workflow_dispatch'");
  assert.match(check.run, /compare\/\$SHA\.\.\.main/);
  assert.match(check.run, /"Tests\|\$SHA\|main\|workflow_dispatch\|\$REPO"/);
  assert.match(check.run, /"ios=success,test=success"/);
  assert.ok(names.indexOf('Sign and upload for internal testing') > 0, 'the API check runs before signing');
  const merge = parse(await read('.github/workflows/merge-when-green.yml'));
  assert.deepEqual(merge.on.workflow_run.workflows, ['Tests']);
  const steps = merge.jobs.merge.steps;
  assert.equal(steps.some(step => step.uses?.startsWith('actions/checkout')), false, 'never checks out pull request code');
  const script = steps.map(step => step.run ?? '').join('\n');
  assert.match(script, /\.github\/workflows\//, 'leaves workflow changes for Sam');
  assert.match(script, /latest Tests run on \\`main\\` is/, 'refuses to merge on a red main');
  assert.match(script, /gh workflow run test\.yml --repo "\$REPO" --ref main/);
});

test('iOS release accepts only the exact successful main push from this repository', () => {
  const event = { action: 'completed', repository: { full_name: repository }, workflow_run: {
    name: 'Tests', conclusion: 'success', event: 'push', head_branch: 'main',
    head_repository: { full_name: repository }, head_sha: 'a'.repeat(40)
  } };
  assert.equal(testedMainSHA(event), 'a'.repeat(40));
  for (const [key, value] of Object.entries({ name: 'Other', conclusion: 'failure', event: 'pull_request', head_branch: 'feature/anything', head_repository: { full_name: 'someone/fork' }, head_sha: 'main' })) {
    assert.throws(() => testedMainSHA({ ...event, workflow_run: { ...event.workflow_run, [key]: value } }));
  }
  assert.throws(() => testedMainSHA({ ...event, action: 'requested' }));
  assert.throws(() => testedMainSHA({ ...event, repository: { full_name: 'someone/fork' } }));
  assert.throws(() => testedMainSHA({}));
  const denied = spawnSync(process.execPath, ['ios/scripts/release.mjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', GITHUB_EVENT_NAME: 'pull_request' }
  });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /Uploads run only from the trusted TestFlight workflow/);
});

test('iOS build numbers increase over every existing build and reject ambiguous formats', () => {
  const builds = versions => versions.map(version => ({ attributes: { version } }));
  assert.equal(nextBuildNumber([]), '1');
  assert.equal(nextBuildNumber(builds(['2', '19', '7', '1'])), '20');
  assert.equal(nextBuildNumber(builds(['001', '10', '9'])), '11');
  for (const version of ['1.2', '-1', '', 'NaN', '1e3']) assert.throws(() => nextBuildNumber(builds([version])));
});

test('Apple API authentication handles pagination without exposing credentials or following foreign links', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'commute-apple-test-'));
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPath = path.join(dir, 'synthetic.p8');
  await writeFile(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.redirect, 'error');
    const token = options.headers.Authorization.replace('Bearer ', '');
    const [header, payload, signature] = token.split('.');
    assert.equal(verify('sha256', Buffer.from(`${header}.${payload}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.iss, 'test-issuer');
    assert.ok(claims.exp - claims.iat <= 600);
    assert.equal(claims.aud, 'appstoreconnect-v1');
    return { ok: true, status: 200, json: async () => ({
      data: [{ attributes: { version: calls === 1 ? '1' : '19' } }],
      links: { next: calls === 1 ? 'https://api.appstoreconnect.apple.com/v1/builds?cursor=next' : null }
    }) };
  });
  try {
    const client = await appStoreClient({ ASC_KEY_PATH: keyPath, ASC_KEY_ID: 'test-key', ASC_ISSUER_ID: 'test-issuer', ASC_APP_ID: 'test-app' });
    assert.equal(nextBuildNumber(await client.builds()), '20');
    assert.equal(calls, 2);
    await assert.rejects(client.request('https://other.example/'), /another origin/);
    assert.equal(calls, 2);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403, text: async () => 'sensitive upstream error' }));
    await assert.rejects(client.request('/v1/apps/test-app'), error => {
      assert.equal(error.message, 'App Store Connect request failed: HTTP 403 (/v1/apps/test-app).');
      return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('TestFlight queues every passing main revision with internal-only export and no PR signing secrets', async () => {
  const release = parse(await read('.github/workflows/testflight.yml'));
  assert.deepEqual(release.on.workflow_run, { workflows: ['Tests'], types: ['completed'], branches: ['main'] });
  assert.deepEqual(Object.keys(release.on).sort(), ['workflow_dispatch', 'workflow_run']);
  assert.deepEqual(Object.keys(release.on.workflow_dispatch.inputs).sort(), ['source_sha', 'tests_run_id']);
  assert.equal(release.concurrency.queue, 'max');
  assert.notEqual(release.concurrency['cancel-in-progress'], true);
  assert.deepEqual(release.permissions, { contents: 'read', actions: 'read' });
  const job = release.jobs.upload;
  assert.equal(job.if.replace(/\s+/g, ' ').replace(/\( /g, '(').trim(), [
    "github.repository == 'srapley-spec/cartref-commute' && ((github.event_name == 'workflow_run'",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_repository.full_name == 'srapley-spec/cartref-commute') ||",
  ].join(' && ').replace('&& ) ||', ') ||') + " (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'))");
  const checkout = job.steps.find(s => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.event.workflow_run.head_sha || inputs.source_sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  const testWorkflow = await read('.github/workflows/test.yml');
  assert.doesNotMatch(testWorkflow, /secrets\./);
  assert.ok(parse(testWorkflow).jobs.ios);
  assert.equal(job['runs-on'], parse(testWorkflow).jobs.ios['runs-on']);
  assert.equal(job.env.DEVELOPER_DIR, '/Applications/Xcode_27.2.app/Contents/Developer');
  const signing = job.steps.find(step => step.run === 'node ios/scripts/release.mjs');
  assert.equal(signing.env.IOS_ACTIVITY_PROFILE_BASE64, '${{ secrets.IOS_ACTIVITY_PROFILE_BASE64 }}');
  const exportOptions = await read('ios/ExportOptions.plist');
  assert.match(exportOptions, /<key>uk\.cartref\.srapley\.commute\.journey<\/key>\s*<string>Cartref Commute Journey App Store<\/string>/);
  assert.match(exportOptions, /<key>testFlightInternalTestingOnly<\/key>\s*<true\/>/);
  assert.match(exportOptions, /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
  assert.match(exportOptions, /<key>destination<\/key>\s*<string>export<\/string>/);
});

test('iOS configuration stays bundled and iOS behaviour changes require documentation', async () => {
  const config = JSON.parse(await read('capacitor.config.json'));
  assert.equal(config.appId, 'uk.cartref.srapley.commute');
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.hostname, 'localhost');
  assert.equal(config.server.iosScheme, 'capacitor');
  assert.equal(checkChange(['ios/App/App/SceneDelegate.swift'], []).ok, false);
  assert.equal(checkChange(['ios/App/App/SceneDelegate.swift', 'docs/stories/ios-shell.md'], []).ok, true);
});
