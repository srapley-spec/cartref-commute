import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { verifyBundle } from '../ios/scripts/verify-bundle.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const sha = 'a'.repeat(40);
const secretNames = ['ASC_API_KEY_P8', 'IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_APP_PROFILE_BASE64'];
const plist = { CFBundleIdentifier: 'uk.cartref.srapley.commute', MinimumOSVersion: '27.0', CFBundleVersion: '4', UIDeviceFamily: [1] };
const config = { server: { hostname: 'localhost', iosScheme: 'capacitor' } };
const html = '<html><body>A synthetic committed page</body></html>';
const provenance = { sourceSHA: sha, pageSHA256: createHash('sha256').update(html).digest('hex') };

async function executable(file, text) {
  await writeFile(file, `#!${process.execPath}\n${text}`, { mode: 0o755 });
}

async function fixture(t, prefix) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('signed IPA checks reject wrong identity, substituted content, stale provenance and invalid signatures', async t => {
  const dir = await fixture(t, 'commute-bundle-check-');
  const app = path.join(dir, 'Commute.app');
  const bin = path.join(dir, 'bin');
  await mkdir(path.join(app, 'public'), { recursive: true });
  await mkdir(bin);
  // Stub only platform tools; exercise the actual verifier against real filesystem fixtures.
  await executable(path.join(bin, 'plutil'), `process.stdout.write(require('fs').readFileSync(process.argv.at(-1)));`);
  await executable(path.join(bin, 'codesign'), `
    const fs = require('fs'), path = require('path');
    if (!process.argv.includes('--verify') || !process.argv.includes('--strict')) process.exit(2);
    if (fs.existsSync(path.join(process.argv.at(-1), 'reject-signature'))) process.exit(1);
  `);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
  t.after(() => { process.env.PATH = previousPath; });
  const write = (file, value) => writeFile(path.join(app, file), typeof value === 'string' ? value : JSON.stringify(value));
  await writeFile(path.join(dir, 'index.html'), html);
  async function reset() {
    await write('Info.plist', plist);
    await write('public/index.html', html);
    await write('public/build-provenance.json', provenance);
    await write('capacitor.config.json', config);
    await rm(path.join(app, 'reject-signature'), { force: true });
  }
  await reset();
  assert.deepEqual(await verifyBundle(app, dir, sha, '4'), provenance);
  const cases = [
    ['another app', 'Info.plist', { ...plist, CFBundleIdentifier: 'example.another' }, /identity/],
    ['wrong minimum OS', 'Info.plist', { ...plist, MinimumOSVersion: '26.0' }, /minimum OS/],
    ['wrong build', 'Info.plist', { ...plist, CFBundleVersion: '3' }, /build number/],
    ['iPad instead of iPhone', 'Info.plist', { ...plist, UIDeviceFamily: [2] }, /device family/],
    ['substituted page', 'public/index.html', '<html>different</html>', /committed website verbatim/],
    ['another source revision', 'public/build-provenance.json', { ...provenance, sourceSHA: 'b'.repeat(40) }, /provenance/],
    ['wrong page hash', 'public/build-provenance.json', { ...provenance, pageSHA256: '0'.repeat(64) }, /provenance/],
    ['remote start URL', 'capacitor.config.json', { server: { ...config.server, url: 'https://example.invalid/' } }, /bundled website/],
    ['different hostname', 'capacitor.config.json', { server: { ...config.server, hostname: 'elsewhere' } }, /bundled website/],
    ['different scheme', 'capacitor.config.json', { server: { ...config.server, iosScheme: 'https' } }, /bundled website/],
    ['invalid code signature', 'reject-signature', 'reject', /Command failed/]
  ];
  for (const [name, file, value, message] of cases) {
    await reset();
    await write(file, value);
    await assert.rejects(verifyBundle(app, dir, sha, '4'), message, name);
  }
});

async function releaseProbe(t, cancel, tampered = false) {
  const dir = await fixture(t, 'commute-release-probe-');
  const root = path.join(dir, 'repo');
  const bin = path.join(dir, 'bin');
  const scratch = path.join(dir, 'scratch');
  const fakeHome = path.join(dir, 'synthetic-home');
  const scripts = path.join(root, 'ios/scripts');
  await Promise.all([mkdir(scripts, { recursive: true }), mkdir(bin), mkdir(scratch), mkdir(fakeHome)]);
  // Copy the production entry point and helpers so a probe never modifies a real build's output directory.
  for (const name of await readdir(path.join(sourceRoot, 'ios/scripts'))) {
    if (name.endsWith('.mjs')) await copyFile(path.join(sourceRoot, 'ios/scripts', name), path.join(scripts, name));
  }
  await writeFile(path.join(root, 'index.html'), html);
  const profile = {
    Name: 'Cartref Commute App Store', ExpirationDate: '2099-01-01T00:00:00Z',
    Entitlements: { 'application-identifier': 'TU7MLARY49.uk.cartref.srapley.commute', 'get-task-allow': false,
      'com.apple.security.application-groups': ['group.uk.cartref.srapley.commute'] }
  };
  await executable(path.join(bin, 'git'), `console.log('${sha}');`);
  await executable(path.join(bin, 'security'), `
    const fs = require('fs'), path = require('path');
    const args = process.argv.slice(2), command = args[0], base = process.env.COMMUTE_PROBE;
    fs.appendFileSync(path.join(base, 'security.log'), command + String.fromCharCode(10));
    if (command === 'cms') process.stdout.write('synthetic-profile');
    if (command === 'list-keychains' && !args.includes('-s')) console.log('"/synthetic/original.keychain-db"');
    if (command === 'create-keychain') fs.writeFileSync(args.at(-1), 'synthetic');
    if (command === 'delete-keychain') fs.rmSync(args.at(-1), { force: true });
  `);
  await executable(path.join(bin, 'python3'), `process.stdout.write(${JSON.stringify(JSON.stringify(profile))});`);
  await executable(path.join(bin, 'xcodebuild'), `
    const fs = require('fs'), path = require('path');
    const base = process.env.COMMUTE_PROBE;
    fs.writeFileSync(path.join(base, 'archive-entered.json'), JSON.stringify({
      leakedSecretNames: ${JSON.stringify(secretNames)}.filter(name => process.env[name] !== undefined)
    }));
    if (process.env.COMMUTE_PROBE_TAMPER === 'true') {
      const args = process.argv.slice(2);
      if (args.includes('-exportArchive')) {
        const exported = args[args.indexOf('-exportPath') + 1];
        fs.mkdirSync(exported, { recursive: true });
        fs.writeFileSync(path.join(exported, 'App.ipa'), 'synthetic');
      }
    } else if (process.env.COMMUTE_PROBE_CANCEL === 'true') setInterval(() => {}, 1000);
    else process.exit(1);
  `);
  await executable(path.join(bin, 'plutil'), `process.stdout.write(require('fs').readFileSync(process.argv.at(-1)));`);
  await executable(path.join(bin, 'codesign'), 'process.exit(0);');
  await executable(path.join(bin, 'ditto'), `
    const fs = require('fs'), path = require('path');
    const app = path.join(process.argv.at(-1), 'Payload', 'App.app');
    fs.mkdirSync(path.join(app, 'public'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Info.plist'), ${JSON.stringify(JSON.stringify({ ...plist, CFBundleVersion: '1' }))});
    fs.writeFileSync(path.join(app, 'capacitor.config.json'), ${JSON.stringify(JSON.stringify(config))});
    fs.writeFileSync(path.join(app, 'public/build-provenance.json'), ${JSON.stringify(JSON.stringify(provenance))});
    fs.writeFileSync(path.join(app, 'public/index.html'), '<html>A substituted page</html>');
  `);
  const preload = path.join(dir, 'preload.mjs');
  await writeFile(preload, `
    import os from 'node:os';
    import { syncBuiltinESMExports } from 'node:module';
    os.homedir = () => ${JSON.stringify(fakeHome)};
    syncBuiltinESMExports();
    globalThis.fetch = async url => ({ ok: true, status: 200, json: async () =>
      String(url).includes('/v1/apps/') ? { data: { attributes: { bundleId: 'uk.cartref.srapley.commute' } } } : { data: [], links: {} }
    });
  `);
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const child = spawn(process.execPath, ['--import', preload, path.join(scripts, 'release.mjs'), '--export-only'], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: scratch,
      COMMUTE_PROBE: dir, COMMUTE_PROBE_CANCEL: String(cancel), COMMUTE_PROBE_TAMPER: String(tampered), ASC_KEY_ID: 'SYNTHETIC',
      ASC_ISSUER_ID: 'synthetic-issuer', ASC_APP_ID: 'synthetic-app', ASC_API_KEY_P8: key,
      IOS_DISTRIBUTION_P12_BASE64: Buffer.from('synthetic').toString('base64'),
      IOS_DISTRIBUTION_P12_PASSWORD: 'synthetic-password', IOS_APP_PROFILE_BASE64: Buffer.from('synthetic').toString('base64')
    }
  });
  // Drain output without storing or printing key material, even if a future mutant logs it.
  let sawTamperedPageError = false;
  child.stdout.resume();
  child.stderr.on('data', chunk => {
    if (String(chunk).includes('committed website verbatim')) sawTamperedPageError = true;
  });
  const exited = once(child, 'exit');
  t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ } });
  const marker = path.join(dir, 'archive-entered.json');
  const deadline = Date.now() + 120_000;
  while (true) {
    try { await stat(marker); break; } catch {
      assert.equal(child.exitCode, null, 'Release must reach the mocked archive before the probe is meaningful.');
      assert.ok(Date.now() < deadline, 'Timed out reaching the mocked archive.');
      await delay(50);
    }
  }
  assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')).leakedSecretNames, [], 'Build subprocess must not inherit signing secret values.');
  if (cancel) child.kill('SIGTERM');
  let timer;
  const [code, signal] = await Promise.race([
    exited,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Release did not stop after cancellation.')), 10_000); })
  ]).finally(() => clearTimeout(timer));
  assert.ok(code !== 0 || signal, 'Failed or cancelled archives cannot report release success.');
  if (tampered) assert.equal(sawTamperedPageError, true, 'Release must call the signed-IPA verifier before reporting success.');
  assert.deepEqual(await readdir(scratch), [], 'Signing key files and the temporary keychain must be removed.');
  const profiles = path.join(fakeHome, 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  assert.deepEqual(await readdir(profiles), [], 'The installed temporary profile must be removed.');
  const commands = (await readFile(path.join(dir, 'security.log'), 'utf8')).trim().split('\n');
  assert.ok(commands.includes('delete-keychain'), 'Remove the temporary keychain from Keychain Services.');
  assert.equal(commands.filter(command => command === 'list-keychains').length, 3, 'Read, update and restore the search list.');
}

test('failed archives remove synthetic signing inputs and restore the keychain search list', { timeout: 180_000 }, async t => {
  await releaseProbe(t, false);
});

test('cancelled archives remove synthetic signing inputs and restore the keychain search list', { timeout: 180_000 }, async t => {
  await releaseProbe(t, true);
});


test('release rejects a substituted page in the exported IPA and cleans up signing inputs', { timeout: 180_000 }, async t => {
  await releaseProbe(t, false, true);
});
