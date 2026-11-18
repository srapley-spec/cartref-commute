// Copy the website verbatim; Capacitor supplies its bridge at runtime.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const webAssets = ['index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'sw.js'];
export async function stageWeb(root, output) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const name of webAssets) await copyFile(path.join(root, name), path.join(output, name));
  const html = await readFile(path.join(output, 'index.html'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await writeFile(path.join(output, 'build-provenance.json'), JSON.stringify({
    sourceSHA: sha, pageSHA256: createHash('sha256').update(html).digest('hex')
  }, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await stageWeb(root, path.join(root, 'dist/ios-web'));
  console.log('Staged the website and its local assets for iOS.');
}
