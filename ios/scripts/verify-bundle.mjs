import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function verifyBundle(appPath, root, sourceSHA, buildNumber) {
  const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Info.plist')], { encoding: 'utf8' }));
  if (plist.CFBundleIdentifier !== 'uk.cartref.srapley.commute' || plist.MinimumOSVersion !== '27.0' ||
      plist.CFBundleVersion !== buildNumber || JSON.stringify(plist.UIDeviceFamily) !== '[1]') {
    throw new Error('The signed app has the wrong identity, minimum OS, device family or build number.');
  }
  const shipped = await readFile(path.join(appPath, 'public/index.html'));
  const committed = await readFile(path.join(root, 'index.html'));
  if (!shipped.equals(committed)) throw new Error('The app does not contain the committed website verbatim.');
  const provenance = JSON.parse(await readFile(path.join(appPath, 'public/build-provenance.json'), 'utf8'));
  if (provenance.sourceSHA !== sourceSHA || provenance.pageSHA256 !== createHash('sha256').update(shipped).digest('hex')) {
    throw new Error('The signed app provenance does not match its tested source.');
  }
  const config = JSON.parse(await readFile(path.join(appPath, 'capacitor.config.json'), 'utf8'));
  if (config.server?.url || config.server?.hostname !== 'localhost' || config.server?.iosScheme !== 'capacitor') {
    throw new Error('The app must use its bundled website, not a remote start URL.');
  }
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  return provenance;
}
