// A disposable iOS 27 simulator: no signing credentials, shared devices or user data.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
function sim(...args) {
  return execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
}
const runtimes = JSON.parse(sim('list', 'runtimes', '--json')).runtimes;
const deviceType = 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro';
const runtime = runtimes.find(r => r.isAvailable && r.version === '27.2' &&
  r.identifier.includes('.iOS-') && r.supportedDeviceTypes?.some(d => d.identifier === deviceType));
if (!runtime) throw new Error('Install the iOS 27.2 simulator runtime in Xcode 27.2.');
const device = sim('create', `Commute CI ${process.pid}`, deviceType, runtime.identifier);
try {
  sim('boot', device);
  sim('bootstatus', device, '-b');
  const result = spawnSync('xcodebuild', [
    'test', '-project', 'ios/App/App.xcodeproj', '-scheme', 'Commute',
    '-destination', `platform=iOS Simulator,id=${device}`, '-derivedDataPath', 'ios/DerivedData',
    '-onlyUsePackageVersionsFromResolvedFile', 'CODE_SIGNING_ALLOWED=NO'
  ], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  try { sim('shutdown', device); } finally { sim('delete', device); }
}
