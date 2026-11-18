import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { runSimulator as runNativeSimulator } from '../ios/scripts/test-simulator.mjs';

test('the normal iPhone test command enforces its production outer deadlines', t => {
  const options = [];
  const previousExitCode = process.exitCode;
  t.mock.method(childProcess, 'execFileSync', (command, args, settings) => {
    options.push({ command, settings });
    if (args[1] === 'list') return JSON.stringify({ runtimes: [{
      isAvailable: true, version: '27.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-2',
      supportedDeviceTypes: [{ identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro' }]
    }] });
    if (args[1] === 'create') return 'owned-fixture-device';
    return '';
  });
  t.mock.method(childProcess, 'spawnSync', (command, args, settings) => {
    options.push({ command, settings });
    return { status: 0 };
  });
  syncBuiltinESMExports();
  try {
    runNativeSimulator();
    assert.ok(options.some(call => call.command === 'xcodebuild'));
    for (const { command, settings } of options) {
      assert.equal(settings.timeout, command === 'xcodebuild' ? 1_080_000 : 300_000);
      assert.equal(settings.killSignal, 'SIGKILL');
    }
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    process.exitCode = previousExitCode;
  }
});

async function runSimulator(testStatus = 0, hang = '', shutdown = '', deleteFails = false, killBuild = false) {
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
if (command === 'xcodebuild') {
  if (process.env.SIM_FIXTURE_KILL_BUILD === 'true') process.kill(process.pid, 'SIGKILL');
  process.exit(Number(process.env.SIM_FIXTURE_TEST_STATUS));
}
if (args[1] === 'list') console.log(JSON.stringify({ runtimes: [{ isAvailable: true, version: '27.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-2', supportedDeviceTypes: [{ identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro' }] }] }));
if (args[1] === 'create') console.log('owned-fixture-device');
if (['boot', 'bootstatus'].includes(args[1])) { console.error('Xcode must manage startup'); process.exit(2); }
if (args[1] === 'shutdown' && process.env.SIM_FIXTURE_SHUTDOWN) {
  console.error(process.env.SIM_FIXTURE_SHUTDOWN === 'already' ? 'Unable to shutdown device in current state: Shutdown' : 'Simulator service unavailable');
  process.exit(149);
}
if (args[1] === 'delete' && process.env.SIM_FIXTURE_DELETE_FAILS === 'true') process.exit(1);
}
`;
    // Node recognizes these extensionless scripts as ESM within their own package.
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
    for (const command of ['xcrun', 'xcodebuild']) await writeFile(path.join(dir, command), fake, { mode: 0o755 });
    const args = hang ? ['--input-type=module', '-e', "import { runSimulator } from './ios/scripts/test-simulator.mjs'; runSimulator({commandTimeoutMs: 2000, buildTimeoutMs: 500});"] : ['ios/scripts/test-simulator.mjs'];
    const result = spawnSync(process.execPath, args, {
      cwd: new URL('../', import.meta.url), encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, SIM_FIXTURE_CALLS: calls,
        SIM_FIXTURE_TEST_STATUS: String(testStatus), SIM_FIXTURE_HANG: hang,
        SIM_FIXTURE_SHUTDOWN: shutdown, SIM_FIXTURE_DELETE_FAILS: String(deleteFails), SIM_FIXTURE_KILL_BUILD: String(killBuild) },
      timeout: 15_000, killSignal: 'SIGKILL'
    });
    return { ...result, calls: (await readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('Xcode manages readiness on one fresh disposable simulator, without a separate OS migration gate', async () => {
  const result = await runSimulator();
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls.map(call => call[0] === 'xcrun' ? call[2] : call[0]),
    ['list', 'create', 'xcodebuild', 'shutdown', 'delete']);
  const build = result.calls.find(call => call[0] === 'xcodebuild');
  assert.equal(build[1], 'test');
  assert.equal(build[build.indexOf('-scheme') + 1], 'Commute');
  assert.ok(build.includes('platform=iOS Simulator,id=owned-fixture-device'));
  assert.ok(build.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(!build.some(arg => /retry|repetition|(?:skip|only)-testing/i.test(arg)));
});

test('simulator test failures propagate after disposable device cleanup', async () => {
  for (const status of [0, 65]) {
    const result = await runSimulator(status);
    assert.equal(result.status, status);
    assert.equal(result.calls.filter(call => call[0] === 'xcodebuild').length, 1);
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
  for (const hang of ['list', 'xcodebuild']) {
    const result = await runSimulator(0, hang);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ETIMEDOUT/);
    if (hang === 'list') {
      assert.equal(result.calls.some(call => call[0] === 'xcodebuild' || call[2] === 'create'), false);
      assert.equal(result.calls.length, 1, 'No device was created, so no device may be removed.');
    } else {
      assert.equal(result.calls.filter(call => call[0] === 'xcodebuild').length, 1);
      assert.deepEqual(result.calls.slice(-2), [
        ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
        ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
      ]);
    }
  }
});

test('a compile failure before boot keeps the Xcode failure and deletes its still-shutdown device', async () => {
  const result = await runSimulator(65, '', 'already');
  assert.equal(result.status, 65);
  assert.equal(result.calls.filter(call => call[0] === 'xcodebuild').length, 1);
  assert.deepEqual(result.calls.slice(-2), [
    ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
    ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
  ]);
  assert.doesNotMatch(result.stderr, /Could not shut down/);
});

test('a killed Xcode process cannot count as a passing test run and its device is cleaned up', async () => {
  const result = await runSimulator(0, '', '', false, true);
  assert.equal(result.status, 1);
  assert.equal(result.calls.filter(call => call[0] === 'xcodebuild').length, 1);
  assert.deepEqual(result.calls.slice(-2), [
    ['xcrun', 'simctl', 'shutdown', 'owned-fixture-device'],
    ['xcrun', 'simctl', 'delete', 'owned-fixture-device']
  ]);
});

test('unexpected simulator cleanup failures cannot turn an Xcode failure into success or hide its status', async () => {
  for (const [status, shutdown, deleteFails, expected] of [[0, 'broken', false, 1], [0, '', true, 1], [65, '', true, 65]]) {
    const result = await runSimulator(status, '', shutdown, deleteFails);
    assert.equal(result.status, expected);
    assert.match(result.stderr, /Could not (shut down|delete)/);
    assert.deepEqual(result.calls.at(-1), ['xcrun', 'simctl', 'delete', 'owned-fixture-device']);
  }
});
