#!/usr/bin/env node
// Keeps the project context in docs/ honest.
//
//   node tools/check-docs.mjs                 story checks only (also run by `npm test`)
//   node tools/check-docs.mjs --since <ref>   + the change since <ref> must touch docs/ or CLAUDE.md
//                                             when it touches src/, tests/ or proxy/, unless a commit
//                                             message has a line "Docs: none — <reason>"
//
// Story checks: every story is in the index, every index link resolves, each story has a Status line and a
// Tests section, and every linked test exists by its exact name in the named file.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST_REF = /^- (tests\/[\w./-]+\.test\.mjs): "(.+)"\s*$/;
const BEHAVIOUR = /^(src|tests|proxy)\//;
const CONTEXT = /^(docs\/|CLAUDE\.md$)/;
const WAIVER = /^Docs: none\s*[—–-]+\s*\S/m;

/** Problems with the stories under `root`; [] when all is well. */
export function checkStories(root = ROOT) {
  const dir = join(root, "docs/stories"), problems = [];
  if (!existsSync(dir)) return ["docs/stories/ is missing"];
  const index = readFileSync(join(dir, "README.md"), "utf8");
  const linked = new Set([...index.matchAll(/\]\(([\w-]+\.md)\)/g)].map(m => m[1]));
  const stories = readdirSync(dir).filter(f => f.endsWith(".md") && f !== "README.md");
  for (const f of linked) if (!stories.includes(f)) problems.push(`docs/stories/README.md links ${f}, which doesn't exist`);
  const sources = new Map();
  for (const f of stories) {
    const text = readFileSync(join(dir, f), "utf8"), where = `docs/stories/${f}`;
    if (!linked.has(f)) problems.push(`${where} is not in the index (docs/stories/README.md)`);
    if (!/^Status: \S/m.test(text)) problems.push(`${where} has no "Status:" line`);
    if (!/^## Tests\s*$/m.test(text)) problems.push(`${where} has no "## Tests" section`);
    text.split("\n").forEach((line, i) => {
      const m = line.match(TEST_REF);
      if (!m) return;
      const [, file, name] = m;
      if (!sources.has(file)) sources.set(file, existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : null);
      const src = sources.get(file);
      if (src == null) problems.push(`${where}:${i + 1} links ${file}, which doesn't exist`);
      else if (![`"`, `'`, "`"].some(q => src.includes(`test(${q}${name}${q}`)))
        problems.push(`${where}:${i + 1} links a test that isn't in ${file}: "${name}"`);
    });
  }
  return problems;
}

/** Whether a change (files touched, commit messages) keeps the context current. */
export function checkChange(files, messages) {
  const behaviour = files.filter(f => BEHAVIOUR.test(f));
  if (!behaviour.length) return { ok: true, why: "no change under src/, tests/ or proxy/" };
  if (files.some(f => CONTEXT.test(f))) return { ok: true, why: "docs updated with the change" };
  if (messages.some(m => WAIVER.test(m))) return { ok: true, why: "waived by a 'Docs: none — <reason>' line" };
  return {
    ok: false,
    why: `${behaviour.length} file(s) under src/, tests/ or proxy/ changed (${behaviour.slice(0, 5).join(", ")}` +
      `${behaviour.length > 5 ? ", …" : ""}) with nothing under docs/ or CLAUDE.md.\n` +
      `Update the story for the behaviour (docs/stories/) or docs/architecture.md, or, if behaviour is unchanged,\n` +
      `add a line to a commit message: "Docs: none — <reason>".`,
  };
}

function git(...args) { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  const problems = checkStories();
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) failed = true;
  else console.log("✓ stories: index complete, every linked test exists");

  const at = process.argv.indexOf("--since");
  if (at > 0) {
    const since = process.argv[at + 1];
    const base = git("merge-base", since, "HEAD");
    const files = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
    const messages = git("log", "--format=%B%x00", `${base}..HEAD`).split("\0");
    const r = checkChange(files, messages);
    (r.ok ? console.log : console.error)(`${r.ok ? "✓" : "✗"} context kept current: ${r.why}`);
    if (!r.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
