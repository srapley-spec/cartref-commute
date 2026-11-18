// Capacitor 8.6.2 emits .iOS(.v27) with swift-tools-version 5.9, but that enum requires 6.4.
// The string overload expresses the same minimum OS without changing Swift language mode.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function compatiblePackage(source) {
  if (!source.startsWith('// swift-tools-version: 5.9\n') || !source.includes('platforms: [.iOS(.v27)]')) {
    throw new Error('Capacitor changed its generated Swift manifest; review the iOS 27 compatibility fix.');
  }
  return source.replace('platforms: [.iOS(.v27)]', 'platforms: [.iOS("27.0")]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../App/CapApp-SPM/Package.swift', import.meta.url);
  await writeFile(file, compatiblePackage(await readFile(file, 'utf8')));
}
