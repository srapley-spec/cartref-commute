import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { signingTargets, verifyEntitlements } from './signing-policy.mjs';

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
  const plugins = path.join(appPath, 'PlugIns');
  const extensions = (await readdir(plugins)).filter(file => file.endsWith('.appex'));
  if (extensions.length !== 1) throw new Error('The IPA must contain exactly one journey extension.');
  const extension = path.join(plugins, extensions[0]);
  const widget = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(extension, 'Info.plist')], { encoding: 'utf8' }));
  if (widget.CFBundleIdentifier !== signingTargets[1].bundleId || widget.MinimumOSVersion !== '27.0' ||
      widget.CFBundleVersion !== buildNumber || JSON.stringify(widget.UIDeviceFamily) !== '[1]' ||
      widget.NSExtension?.NSExtensionPointIdentifier !== 'com.apple.widgetkit-extension') {
    throw new Error('Wrong journey extension identity, minimum OS, build number, device family or extension point.');
  }
  for (const [bundle, target] of [[appPath, signingTargets[0]], [extension, signingTargets[1]]]) {
    const entitlements = execFileSync('codesign', ['--display', '--entitlements', ':-', bundle], { stdio: ['ignore', 'pipe', 'pipe'] });
    const decoded = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: entitlements, encoding: 'utf8' }));
    verifyEntitlements(decoded, target);
  }
  return provenance;
}
