// Signing inputs exist only in a private temporary directory/keychain. Never submits for Apple review.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appStoreClient, nextBuildNumber } from './app-store.mjs';
import { testedMainSHA } from './release-policy.mjs';
import { verifyBundle } from './verify-bundle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exportOnly = process.argv.includes('--export-only');
const secretNames = ['ASC_API_KEY_P8', 'IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_APP_PROFILE_BASE64'];
const childEnv = { ...process.env };
for (const name of secretNames) delete childEnv[name];
const cancellation = new AbortController();
let cleaning = false;
const interrupt = () => { if (!cleaning) { process.exitCode = 1; cancellation.abort(); } };
process.on('SIGTERM', interrupt);
process.on('SIGINT', interrupt);
async function run(command, args, quiet = false) {
  if (!cleaning) cancellation.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: childEnv, stdio: quiet ? 'pipe' : 'inherit' });
    let output = '', timer;
    child.stdout?.on('data', chunk => { output += chunk; });
    // Never echo argv or captured security errors: password arguments must not enter logs.
    child.stderr?.resume();
    child.on('error', () => {}); // The close event follows both exit and spawn failure.
    const stop = () => {
      child.kill('SIGTERM');
      timer = setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    if (!cleaning) cancellation.signal.addEventListener('abort', stop, { once: true });
    child.on('close', code => {
      clearTimeout(timer);
      cancellation.signal.removeEventListener('abort', stop);
      if (code !== 0 || (!cleaning && cancellation.signal.aborted)) reject(new Error(`${command} failed or was cancelled (exit ${code ?? 'unavailable'}).`));
      else resolve(output.trim());
    });
  });
}
const security = (...args) => run('security', args, true);
let temporary, keychain, profilePath;
let originalKeychains;
try {
  const head = await run('git', ['rev-parse', 'HEAD'], true);
  if (!exportOnly) {
    if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Uploads run only from the trusted TestFlight workflow. Use --export-only for local signing checks.');
    }
    const tested = testedMainSHA(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')));
    if (head !== tested) throw new Error('Checkout differs from the exact main SHA that passed Tests.');
  }
  for (const name of secretNames) if (!process.env[name]) throw new Error(`Missing GitHub Actions secret ${name}.`);
  temporary = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'commute-signing-'));
  const keyPath = path.join(temporary, `AuthKey_${process.env.ASC_KEY_ID}.p8`);
  await writeFile(keyPath, process.env.ASC_API_KEY_P8, { mode: 0o600 });
  const p12 = path.join(temporary, 'distribution.p12');
  await writeFile(p12, Buffer.from(process.env.IOS_DISTRIBUTION_P12_BASE64, 'base64'), { mode: 0o600 });
  const profile = path.join(temporary, 'app.mobileprovision');
  await writeFile(profile, Buffer.from(process.env.IOS_APP_PROFILE_BASE64, 'base64'), { mode: 0o600 });
  const decoded = path.join(temporary, 'profile.plist');
  await writeFile(decoded, await security('cms', '-D', '-i', profile), { mode: 0o600 });
  const profileInfo = JSON.parse(await run('python3', ['-c',
    'import json,plistlib,sys; p=plistlib.load(open(sys.argv[1], "rb")); print(json.dumps({k:p[k] for k in ["Name","Entitlements","ExpirationDate","ProvisionedDevices"] if k in p},default=lambda v:v.isoformat()+"Z"))', decoded], true));
  if (profileInfo.Name !== 'Cartref Commute App Store' ||
      profileInfo.Entitlements['application-identifier'] !== 'TU7MLARY49.uk.cartref.srapley.commute' ||
      profileInfo.Entitlements['get-task-allow'] !== false || profileInfo.ProvisionedDevices ||
      !profileInfo.Entitlements['com.apple.security.application-groups']?.includes('group.uk.cartref.srapley.commute') ||
      !Number.isFinite(Date.parse(profileInfo.ExpirationDate)) ||
      Date.parse(profileInfo.ExpirationDate) <= Date.now() + 86_400_000) {
    throw new Error('Commute App Store profile is wrong, expired, or missing its App Group. Renew the profile secret.');
  }
  const profileDir = path.join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  await mkdir(profileDir, { recursive: true });
  // Use a private filename, leaving any existing local profile untouched.
  profilePath = path.join(profileDir, `commute-ci-${path.basename(temporary)}.mobileprovision`);
  await copyFile(profile, profilePath);
  originalKeychains = [...(await security('list-keychains', '-d', 'user')).matchAll(/"([^"]+)"/g)].map(m => m[1]);
  keychain = path.join(temporary, 'build.keychain-db');
  const password = randomBytes(32).toString('hex');
  await security('create-keychain', '-p', password, keychain);
  await security('set-keychain-settings', '-lut', '21600', keychain);
  await security('unlock-keychain', '-p', password, keychain);
  await security('import', p12, '-k', keychain, '-P', process.env.IOS_DISTRIBUTION_P12_PASSWORD, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security');
  await security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain);
  await security('list-keychains', '-d', 'user', '-s', keychain, ...originalKeychains);
  for (const name of secretNames) delete process.env[name];
  const apiEnv = { ...childEnv, ASC_KEY_PATH: keyPath };
  const client = await appStoreClient(apiEnv, cancellation.signal);
  const app = await client.request(`/v1/apps/${client.appId}`);
  if (app.data.attributes.bundleId !== 'uk.cartref.srapley.commute') throw new Error('Wrong App Store Connect app.');
  const build = nextBuildNumber(await client.builds());
  const output = path.join(root, 'ios/App/output');
  await rm(output, { recursive: true, force: true });
  const archive = path.join(output, 'Commute.xcarchive');
  const exported = path.join(output, 'export');
  console.log(`Archiving ${head} as internal TestFlight build ${build}.`);
  await run('xcodebuild', ['archive', '-quiet', '-project', 'ios/App/App.xcodeproj', '-scheme', 'Commute',
    '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive,
    '-derivedDataPath', 'ios/DerivedData', '-onlyUsePackageVersionsFromResolvedFile',
    'CODE_SIGNING_ALLOWED=NO', `CURRENT_PROJECT_VERSION=${build}`]);
  await run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exported,
    '-exportOptionsPlist', 'ios/ExportOptions.plist']);
  const ipas = (await readdir(exported)).filter(f => f.endsWith('.ipa'));
  if (ipas.length !== 1) throw new Error('Expected exactly one signed IPA.');
  const ipa = path.join(exported, ipas[0]);
  const unpacked = path.join(output, 'verified');
  await run('ditto', ['-x', '-k', ipa, unpacked]);
  const apps = (await readdir(path.join(unpacked, 'Payload'))).filter(f => f.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected exactly one app in the IPA.');
  const provenance = await verifyBundle(path.join(unpacked, 'Payload', apps[0]), root, head, build);
  await writeFile(path.join(output, 'build-provenance.json'), JSON.stringify({ ...provenance, buildNumber: build }, null, 2) + '\n');
  if (exportOnly) {
    console.log('Signed internal-only IPA verified. Export only: nothing uploaded.');
  } else {
    childEnv.API_PRIVATE_KEYS_DIR = temporary;
    await run('xcrun', ['altool', '--upload-app', '-f', ipa, '-t', 'ios', '--api-key', process.env.ASC_KEY_ID,
      '--api-issuer', process.env.ASC_ISSUER_ID]);
    // Hold the serialized release job until Apple's build list includes this number, avoiding reuse by the next job.
    childEnv.ASC_KEY_PATH = keyPath;
    await run('node', ['ios/scripts/app-store.mjs', 'wait', build]);
    console.log(`Internal TestFlight build ${build} processed. No review submission was requested.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  cleaning = true;
  if (originalKeychains) {
    try { await security('list-keychains', '-d', 'user', '-s', ...originalKeychains); }
    catch { console.error('Could not restore the keychain search list.'); process.exitCode = 1; }
  }
  if (keychain) { try { await security('delete-keychain', keychain); } catch { /* Directory cleanup below. */ } }
  if (profilePath) await rm(profilePath, { force: true });
  if (temporary) await rm(temporary, { recursive: true, force: true });
  process.removeListener('SIGTERM', interrupt);
  process.removeListener('SIGINT', interrupt);
}
