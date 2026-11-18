// A disposable iOS 27 simulator: no signing credentials, shared devices or user data.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function runSimulator({ commandTimeoutMs = 300_000, buildTimeoutMs = 1_080_000 } = {}) {
  function sim(...args) {
    return execFileSync('xcrun', ['simctl', ...args], {
      encoding: 'utf8', timeout: commandTimeoutMs, killSignal: 'SIGKILL'
    }).trim();
  }
  const runtimes = JSON.parse(sim('list', 'runtimes', '--json')).runtimes;
  const deviceType = 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro';
  const runtime = runtimes.find(r => r.isAvailable && r.version === '27.2' &&
    r.identifier.includes('.iOS-') && r.supportedDeviceTypes?.some(d => d.identifier === deviceType));
  if (!runtime) throw new Error('Install the iOS 27.2 simulator runtime in Xcode 27.2.');
  const device = sim('create', `Commute CI ${process.pid}`, deviceType, runtime.identifier);
  try {
    // Xcode manages destination startup and test readiness. A stock Safari migration watchdog can make
    // simctl's separate bootstatus say "Data Migration Failed" even when all app tests execute successfully.
    // This fresh device has never contained Commute; test failures and timeouts are never retried.
    console.log(`Testing on disposable iPhone simulator ${device}.`);
    const result = spawnSync('xcodebuild', [
      'test', '-project', 'ios/App/App.xcodeproj', '-scheme', 'Commute',
      '-destination', `platform=iOS Simulator,id=${device}`, '-derivedDataPath', 'ios/DerivedData',
      '-test-timeouts-enabled', 'YES', '-default-test-execution-time-allowance', '360',
      '-maximum-test-execution-time-allowance', '600',
      '-onlyUsePackageVersionsFromResolvedFile', 'CODE_SIGNING_ALLOWED=NO'
    ], { cwd: root, stdio: 'inherit', timeout: buildTimeoutMs, killSignal: 'SIGKILL' });
    if (result.error) console.error(`iPhone test command failed: ${result.error.message}`);
    process.exitCode = result.error ? 1 : (result.status ?? 1);
  } finally {
    try { sim('shutdown', device); } catch (error) {
      // A compile/launch failure may leave the device in its initial Shutdown state.
      if (!(error.status === 149 && String(error.stderr).includes('current state: Shutdown'))) {
        console.error('Could not shut down the disposable iPhone simulator.');
        process.exitCode ||= 1;
      }
    }
    try { sim('delete', device); } catch {
      console.error('Could not delete the disposable iPhone simulator.');
      process.exitCode ||= 1;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runSimulator();
