#!/usr/bin/env node
// Runs every check GitHub's "Tests" workflow runs, on a fresh copy of the committed code (HEAD), before merging to
// main. What it can't stand in for: GitHub's machine (timing). See CLAUDE.md, "Merging to main".
//
//   npm run ci              checks HEAD; the docs check compares with where HEAD left origin/main
//   npm run ci -- --keep    leaves the copy and its log in place (path printed) for a look after a failure
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const keep = process.argv.includes("--keep");
const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });

// Only committed code is checked (as on GitHub), so uncommitted changes would go untested: commit them first.
const dirty = git("status", "--porcelain", "--untracked-files=no").stdout.trim();
if (dirty) { console.error(`✗ uncommitted changes (not what would be pushed); commit them first:\n${dirty}`); process.exit(1); }
const untracked = git("status", "--porcelain").stdout.split("\n").filter(l => l.startsWith("??"));
if (untracked.length) console.warn(`! untracked files are not part of the commit, so not checked:\n${untracked.join("\n")}`);

const head = git("rev-parse", "HEAD").stdout.trim();
const base = git("merge-base", "HEAD", "origin/main").stdout.trim();
const dir = mkdtempSync(join(tmpdir(), "cartref-ci-")), copy = join(dir, "repo"), log = [];
const add = git("worktree", "add", "--detach", copy, head);
if (add.status) { console.error(add.stderr); process.exit(1); }

const steps = [
  ["install (npm ci)", "npm", ["ci", "--no-audit", "--no-fund"]],
  ["type-check the engine", "npm", ["run", "typecheck"]],
  ["index.html is built from src/", "sh", ["-c", `npm run build && git diff --exit-code -I 'id="build"' index.html`]],
  ["context kept current (docs/, CLAUDE.md)", "node", base && base !== head ? ["tools/check-docs.mjs", "--since", base] : ["tools/check-docs.mjs"]],
  ["all tests", "node", ["tools/run-tests.mjs"]],
];
let failed = null;
for (const [name, cmd, args] of steps) {
  const t0 = Date.now(), r = spawnSync(cmd, args, { cwd: copy, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env } });
  const out = (r.stdout || "") + (r.stderr || "");
  log.push(`=== ${name}\n${out}`);
  const secs = Math.round((Date.now() - t0) / 1000);
  if (r.status !== 0) { failed = name; console.error(`✗ ${name} (${secs}s)`); console.error(out.split("\n").filter(l => /^not ok|✗|error|Error/.test(l)).slice(0, 30).join("\n") || out.slice(-3000)); break; }
  const summary = name.startsWith("all tests") ? ` — ${(out.match(/^# pass (\d+)/m) || [])[1]} pass` : "";
  console.log(`✓ ${name} (${secs}s)${summary}`);
}

const logFile = join(dir, "ci.log");
writeFileSync(logFile, log.join("\n"));
if (keep || failed) console.log(`Full log: ${logFile}${keep ? `; copy: ${copy}` : ""}`);
if (!keep) { git("worktree", "remove", "--force", copy); if (!failed) rmSync(dir, { recursive: true, force: true }); }
console.log(failed ? `✗ ${head.slice(0, 7)} is not ready to merge` : `✓ ${head.slice(0, 7)} passes every GitHub check locally`);
process.exit(failed ? 1 : 0);
