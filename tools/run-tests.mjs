#!/usr/bin/env node
// One test execution, including the mandatory supported-UI contract matrix.
// CI calls this directly so a package-script edit cannot accidentally omit parity.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { PARITY_ROOT, loadParityRegistry, previousParityRegistry, parityRegistryProblems, parityCoverageProblems } from './check-ui-parity.mjs';

try {
  const registry = loadParityRegistry();
  const core = await import('../dist/core.mjs');
  const problems = parityRegistryProblems(registry, {viewIds: Object.keys(core.BLOCKS), previous: previousParityRegistry()});
  if (problems.length) throw new Error(problems.join('\n'));
  const onlyParity = process.argv.includes('--ui-parity-only');
  const files = onlyParity ? ['tests/ui-parity.test.mjs'] : ['tests', 'tests/core'].flatMap(dir =>
    readdirSync(join(PARITY_ROOT, dir)).filter(file => file.endsWith('.test.mjs')).sort().map(file => `${dir}/${file}`));
  const env = {...process.env, TZ: 'Europe/London'};
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--import', './tests/clock.mjs', '--test', '--test-reporter=tap', ...files],
    {cwd: PARITY_ROOT, env, stdio: ['ignore', 'pipe', 'pipe']});
  let tap = '';
  child.stdout.on('data', chunk => { tap += chunk.toString(); process.stdout.write(chunk); });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.on('error', error => { console.error(`✗ Could not run tests: ${error.message}`); process.exitCode = 1; });
  child.on('close', (code, signal) => {
    const missing = parityCoverageProblems(registry, tap);
    missing.forEach(problem => console.error(`✗ ${problem}`));
    if (signal) console.error(`✗ Test process terminated by ${signal}`);
    if (code !== 0 || signal || missing.length) process.exitCode = 1;
    else console.log(`✓ UI parity: all ${registry.designs.length * registry.surfaces.length} supported design/surface contracts passed`);
  });
} catch (error) {
  console.error(`✗ Required UI parity gate: ${error.message}`);
  process.exitCode = 1;
}
