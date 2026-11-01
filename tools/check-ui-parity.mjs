// Supported interfaces are a release contract, not a test-name filter. Geometry
// may differ; every registered design/surface must pass its visible semantic checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

export const PARITY_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PARITY_REGISTRY = 'config/ui-parity.json';
const idPattern = /^[a-z][a-z0-9-]*$/;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const parityTestName = (design, surface) => `UI parity: ${design} / ${surface}`;
/** A design excepted from a surface must really lack it: a required negative case, so a stale exception fails. */
export const parityExceptionName = (design, surface) => `UI parity exception: ${design} / ${surface}`;
export const loadParityRegistry = (root = PARITY_ROOT) => JSON.parse(readFileSync(join(root, PARITY_REGISTRY), 'utf8'));
/** The designs a surface must pass in: every supported design, unless Sam approved a recorded exception
 *  (`designs` + `exception`, checked by parityRegistryProblems). */
export const surfaceDesigns = (registry, surface) =>
  registry.designs.filter(design => !Array.isArray(surface.designs) || surface.designs.includes(design.id));
export const exceptedDesigns = (registry, surface) =>
  Array.isArray(surface.designs) ? registry.designs.filter(design => !surface.designs.includes(design.id)) : [];
/** Every result the gate requires: each supported pair, and each excepted pair's negative case. */
export const expectedParityResults = registry => registry.surfaces.flatMap(surface => [
  ...surfaceDesigns(registry, surface).map(design => parityTestName(design.id, surface.id)),
  ...exceptedDesigns(registry, surface).map(design => parityExceptionName(design.id, surface.id))]);

/** Production design IDs are explicit literals. A new CSS/HTML selector or an
 * assignment branch cannot add a supported design outside the release registry.
 * Opaque computed assignments are rejected rather than guessed. Historical
 * prototypes under docs/ are deliberately outside the production source tree. */
export function productionDesignInventory(root = PARITY_ROOT) {
  const ids = new Set(), problems = [];
  const tokens = text => {
    for (const match of text.matchAll(/\bdata-design\s*[~|^$*]?=\s*["']?([a-z][a-z0-9-]*)/gi)) ids.add(match[1]);
  };
  const property = node => ts.isPropertyAccessExpression(node) ? node.name.text :
    ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
  const leaves = node => {
    if (!node) return null;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return leaves(node.expression);
    if (ts.isStringLiteralLike(node)) return idPattern.test(node.text) ? [node.text] : null;
    if (ts.isConditionalExpression(node)) {
      const yes = leaves(node.whenTrue), no = leaves(node.whenFalse);
      return yes && no ? [...yes, ...no] : null;
    }
    return null;
  };
  const javascript = (text, file) => {
    const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : /\.jsx$/.test(file) ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const assign = expression => {
      const values = leaves(expression);
      if (!values) problems.push(`${file}: design assignments must select explicit literal design IDs`);
      else values.forEach(value => ids.add(value));
    };
    const visit = node => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) tokens(node.text);
      if (ts.isBinaryExpression(node) && property(node.left) === 'design' && property(node.left.expression) === 'dataset' &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) problems.push(`${file}: computed design updates are not supported`);
        else assign(node.right);
      }
      if (ts.isCallExpression(node) && property(node.expression) === 'setAttribute' &&
          node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === 'data-design') assign(node.arguments[1]);
      ts.forEachChild(node, visit);
    };
    visit(source);
  };
  const scan = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.(?:html|css|[cm]?[jt]sx?)$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        if (/\.[cm]?[jt]sx?$/.test(entry.name)) javascript(text, path);
        else {
          for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) javascript(match[1], path);
          tokens(text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, ''));
        }
      }
    }
  };
  scan(join(root, 'src'));
  return {ids: [...ids].sort(), problems};
}

/** The comparison base is explicit in CI; ordinary local runs use origin/main. */
export function previousParityRegistry(root = PARITY_ROOT, requested = process.env.UI_PARITY_BASE) {
  const git = args => spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  let base = requested;
  if (base && !/^0+$/.test(base) && git(['rev-parse', '--verify', `${base}^{commit}`]).status !== 0)
    throw new Error(`UI parity comparison base is not a commit: ${base}`);
  if (!base || /^0+$/.test(base)) {
    const merge = git(['merge-base', 'HEAD', 'origin/main']);
    if (merge.status !== 0 || !merge.stdout.trim()) throw new Error('UI parity comparison requires HEAD and origin/main');
    base = merge.stdout.trim();
  }
  const prior = git(['show', `${base}:${PARITY_REGISTRY}`]);
  // The first adoption has no earlier registry. Invalid JSON in an existing
  // registry is an error, rather than a reason to discard its protected entries.
  return prior.status === 0 ? JSON.parse(prior.stdout) : null;
}

export function parityRegistryProblems(registry, {viewIds = [], previous = null, root = PARITY_ROOT, inventory = productionDesignInventory(root)} = {}) {
  const problems = [];
  if (!object(registry) || registry.version !== 1) return ['UI parity registry must use version 1'];
  for (const kind of ['designs', 'surfaces']) {
    const list = registry[kind];
    if (!Array.isArray(list) || !list.length) { problems.push(`UI parity ${kind} must not be empty`); continue; }
    const seen = new Set();
    for (const entry of list) {
      if (!object(entry) || !idPattern.test(entry.id || '')) { problems.push(`Invalid UI parity ${kind} entry`); continue; }
      if (seen.has(entry.id)) problems.push(`Duplicate UI parity ${kind} id: ${entry.id}`);
      seen.add(entry.id);
      if (kind === 'designs' && !object(entry.settings)) problems.push(`Design ${entry.id} needs explicit settings`);
      if (kind === 'surfaces' && !viewIds.includes(entry.view)) problems.push(`Surface ${entry.id} names an unknown engine view: ${entry.view}`);
      // A surface limited to some designs is an exception to "every supported UI advances together": allowed only
      // with Sam's recorded decision naming exactly this surface and these designs.
      if (kind === 'surfaces' && (entry.designs !== undefined || entry.exception !== undefined)) {
        const ids = (Array.isArray(registry.designs) ? registry.designs : []).map(d => d?.id);
        const list = entry.designs;
        if (!Array.isArray(list) || !list.length || list.some(d => !ids.includes(d)) || new Set(list).size !== list.length)
          problems.push(`Surface ${entry.id}: an exception must list registered designs`);
        else if (list.length >= ids.length) problems.push(`Surface ${entry.id}: an exception must leave out at least one design (if every design has it now, remove the exception)`);
        else {
          const path = typeof entry.exception === 'string' ? resolve(root, entry.exception) : '';
          const insideDocs = path.startsWith(resolve(root, 'docs') + sep) && path.endsWith('.md');
          const lines = insideDocs && existsSync(path) ? readFileSync(path, 'utf8').split('\n').map(l => l.trim()) : null;
          // Only a new surface can start as an exception: an existing one that every design had cannot lose a design
          // by a registry edit and an appended line (that is retirement, or a new decision with Sam).
          const before = (previous?.surfaces || []).find(old => old?.id === entry.id);
          if (before && (!Array.isArray(before.designs) || list.some(d => !before.designs.includes(d)) || before.designs.length > list.length))
            problems.push(`Surface ${entry.id}: an existing surface cannot become (or widen) a design exception`);
          if (!lines) problems.push(`Surface ${entry.id}: a design exception needs an existing decision under docs/`);
          else if (!lines.includes('Approved by: Sam') || !lines.includes(`Design exception: surface:${entry.id} designs:${[...list].sort().join(',')}`))
            problems.push(`Surface ${entry.id}: the exception decision must record Sam's approval and exactly this surface and its designs`);
        }
      }
    }
  }
  const surfaces = Array.isArray(registry.surfaces) ? registry.surfaces : [];
  for (const view of viewIds) if (!surfaces.some(s => s?.view === view)) problems.push(`Engine view has no UI parity surface: ${view}`);
  problems.push(...inventory.problems);
  const designs = Array.isArray(registry.designs) ? registry.designs : [];
  for (const id of inventory.ids) if (!designs.some(design => design?.id === id)) problems.push(`Production design is not registered for UI parity: ${id}`);
  for (const design of designs) if (!inventory.ids.includes(design?.id)) problems.push(`Registered design has no production implementation: ${design?.id}`);
  if (!Array.isArray(registry.retired)) problems.push('UI parity retired history must be an array');
  const retired = Array.isArray(registry.retired) ? registry.retired : [];
  const retirements = new Set();
  for (const entry of retired) {
    if (!object(entry) || !['design', 'surface'].includes(entry.kind) || !idPattern.test(entry.id || '')) {
      problems.push('Invalid UI retirement record'); continue;
    }
    const key = `${entry.kind}:${entry.id}`;
    if (retirements.has(key)) problems.push(`Duplicate UI retirement: ${key}`);
    retirements.add(key);
    const active = entry.kind === 'design' ? registry.designs : surfaces;
    if (Array.isArray(active) && active.some(v => v?.id === entry.id)) problems.push(`Retired UI is still supported: ${key}`);
    const path = typeof entry.decision === 'string' ? resolve(root, entry.decision) : '';
    const insideDocs = path.startsWith(resolve(root, 'docs') + sep) && path.endsWith('.md');
    if (!insideDocs || !existsSync(path)) { problems.push(`UI retirement ${key} needs an existing decision under docs/`); continue; }
    const decision = readFileSync(path, 'utf8');
    if (!decision.split('\n').some(line => line.trim() === 'Approved by: Sam') ||
        !decision.split('\n').some(line => line.trim() === `Retired UI: ${key}`))
      problems.push(`UI retirement ${key} decision must explicitly record Sam's approval and the retired UI`);
  }
  for (const [kind, listName] of [['design', 'designs'], ['surface', 'surfaces']]) {
    for (const old of previous?.[listName] || []) {
      const active = Array.isArray(registry[listName]) ? registry[listName] : [];
      if (!active.some(v => v?.id === old.id) && !retirements.has(`${kind}:${old.id}`))
        problems.push(`Supported ${kind} ${old.id} was removed without an explicit retirement decision`);
    }
  }
  for (const old of previous?.retired || []) if (!retirements.has(`${old.kind}:${old.id}`))
    problems.push(`UI retirement history was removed: ${old.kind}:${old.id}`);
  return problems;
}

/** A successful test process is insufficient: skipped, omitted or renamed matrix
 * cases must not silently reduce release coverage. Other test suites may use skips. */
export function parityCoverageProblems(registry, tap) {
  const expected = new Set(expectedParityResults(registry));
  const seen = new Set(), problems = [];
  for (const line of tap.split('\n')) {
    const result = /^(not ok|ok) \d+ - (UI parity(?: exception)?: .+?)(?:\s+#\s*(SKIP|TODO)\b.*)?\s*$/.exec(line);
    if (!result) continue;
    const [, status, name, skipped] = result;
    if (!expected.has(name)) problems.push(`Unexpected UI parity case: ${name}`);
    if (seen.has(name)) problems.push(`Duplicate UI parity result: ${name}`);
    seen.add(name);
    if (status !== 'ok' || skipped) problems.push(`UI parity case did not pass: ${name}${skipped ? ` (${skipped})` : ''}`);
  }
  for (const name of expected) if (!seen.has(name)) problems.push(`Missing UI parity result: ${name}`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const core = await import('../dist/core.mjs');
    const problems = parityRegistryProblems(loadParityRegistry(), {viewIds: Object.keys(core.BLOCKS), previous: previousParityRegistry()});
    if (problems.length) { problems.forEach(p => console.error(`✗ ${p}`)); process.exitCode = 1; }
    else console.log('✓ supported UI registry covers every engine view; run npm run check-ui-parity for visible contracts');
  } catch (error) { console.error(`✗ UI parity registry: ${error.message}`); process.exitCode = 1; }
}
