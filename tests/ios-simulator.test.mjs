import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
async function runSimulator(bootFailed, testStatus = 0, hang = '') {
  const dir = await mkdtemp(path.join(tmpdir(), 'commute-simulator-test-'));
  try {
    const calls = path.join(dir, 'calls.jsonl');
    const fake = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
import path from 'node:path';
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.SIM_FIXTURE_CALLS, JSON.stringify([command, ...args]) + '\\n');
if (process.env.SIM_FIXTURE_HANG === command || process.env.SIM_FIXTURE_HANG === args[1]) {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else {
if (command === 'xcodebuild') process.exit(Number(process.env.SIM_FIXTURE_TEST_STATUS));
if (args[1] === 'list') console.log(JSON.stringify({ runtimes: [{ isAvailable: true, version: '27.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-2', supportedDeviceTypes: [{ identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro' }] }] }));
if (args[1] === 'create') console.log('owned-fixture-device');
if (args[1] === 'bootstatus') console.log(process.env.SIM_FIXTURE_BOOT_FAILED === 'true' ? 'Status=3, isTerminal=YES\\nData Migration Failed' : 'Status=4294967295, isTerminal=YES\\nFinished');
}
`;
    // Node recognizes these extensionless scripts as ESM within their own package.
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
    for (const command of ['xcrun', 'xcodebuild']) await writeFile(path.join(dir, command), fake, { mode: 0o755 });
    const args = hang ? ['--input-type=module', '-e', "import { runSimulator } from './ios/scripts/test-simulator.mjs'; runSimulator({commandTimeoutMs: 2000, buildTimeoutMs: 500});"] : ['ios/scripts/test-simulator.mjs'];
    const result = spawnSync(process.execPath, args, {
      cwd: new URL('../', import.meta.url), encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, SIM_FIXTURE_CALLS: calls,
        SIM_FIXTURE_BOOT_FAILED: String(bootFailed), SIM_FIXTURE_TEST_STATUS: String(testStatus), SIM_FIXTURE_HANG: hang },
      timeout: 15_000, killSignal: 'SIGKILL'
    });
    return { ...result, calls: (await readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('simulator bootstrap failure prevents app testing and removes only its disposable device', async () => {
  const result = await runSimulator(true);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Data Migration Failed/);
  assert.match(result.stderr, /Simulator data migration failed before app testing/);
  assert.equal(result.calls.some(call => call[0] === 'xcodebuild'), false);
  assert.deepEqual(result.calls.slice(-2), [
    ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
    ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
  ]);
});

test('simulator test failures propagate after disposable device cleanup', async () => {
  for (const status of [0, 65]) {
    const result = await runSimulator(false, status);
    assert.equal(result.status, status);
    assert.match(result.stdout, /Finished/);
    const test = result.calls.find(call => call[0] === 'xcodebuild');
    assert.ok(test.includes('platform=iOS Simulator,id=owned-fixture-device'));
    assert.equal(test[test.indexOf('-test-timeouts-enabled') + 1], 'YES');
    assert.equal(test[test.indexOf('-default-test-execution-time-allowance') + 1], '360');
    assert.equal(test[test.indexOf('-maximum-test-execution-time-allowance') + 1], '600');
    assert.deepEqual(result.calls.slice(-2), [
      ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
      ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
    ]);
  }
});

test('hung simulator setup and xcodebuild fail within an outer deadline and clean up', { timeout: 40_000 }, async () => {
  for (const hang of ['bootstatus', 'xcodebuild']) {
    const result = await runSimulator(false, 0, hang);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ETIMEDOUT/);
    assert.deepEqual(result.calls.slice(-2), [
      ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
      ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
    ]);
    if (hang === 'bootstatus') assert.equal(result.calls.some(call => call[0] === 'xcodebuild'), false);
  }
});
