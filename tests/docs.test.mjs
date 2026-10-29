// The context-in-repo checks (tools/check-docs.mjs): stories link real tests; behaviour changes touch docs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkStories, checkChange } from "../tools/check-docs.mjs";

function repo(stories, index, testSrc) {
  const root = mkdtempSync(join(tmpdir(), "docs-"));
  mkdirSync(join(root, "docs/stories"), { recursive: true });
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests/a.test.mjs"), testSrc);
  writeFileSync(join(root, "docs/stories/README.md"), index);
  for (const [f, text] of Object.entries(stories)) writeFileSync(join(root, "docs/stories", f), text);
  return root;
}
const story = (ref) => `# X\nStatus: Done\n\n## Tests\n- tests/a.test.mjs: "${ref}"\n`;

test("Stories: the repo's own stories are complete and every linked test exists", () => {
  assert.deepEqual(checkStories(), []);
});

test("Stories: a renamed test, a missing file, an unindexed story or a missing section is reported", () => {
  const src = `test("it works: 'quoted' too", () => {});\n`;
  assert.deepEqual(checkStories(repo({ "x.md": story("it works: 'quoted' too") }, "[X](x.md)", src)), []);
  const bad = checkStories(repo({ "x.md": story("it worked"), "y.md": "# Y\n" }, "[X](x.md) [Z](z.md)", src));
  assert.ok(bad.some(p => /isn't in tests\/a\.test\.mjs: "it worked"/.test(p)));
  assert.ok(bad.some(p => /links z\.md, which doesn't exist/.test(p)));
  assert.ok(bad.some(p => /y\.md is not in the index/.test(p)));
  assert.ok(bad.some(p => /y\.md has no "Status:" line/.test(p)));
  assert.ok(bad.some(p => /y\.md has no "## Tests" section/.test(p)));
});

test("Change check: behaviour changes need docs or a 'Docs: none — reason' line; other changes pass", () => {
  assert.equal(checkChange(["src/core/rank.ts"], ["Change the card"]).ok, false);
  assert.equal(checkChange(["tests/rules.test.mjs", "proxy/worker.js"], ["x"]).ok, false);
  assert.equal(checkChange(["src/core/rank.ts", "docs/stories/top-card.md"], ["x"]).ok, true);
  assert.equal(checkChange(["src/core/rank.ts", "CLAUDE.md"], ["x"]).ok, true);
  assert.equal(checkChange(["src/core/rank.ts"], ["Tidy\n\nDocs: none — rename only"]).ok, true);
  assert.equal(checkChange(["src/core/rank.ts"], ["Tidy\n\nDocs: none - rename only"]).ok, true);
  assert.equal(checkChange(["src/core/rank.ts"], ["Tidy\n\nDocs: none"]).ok, false, "a reason is required");
  assert.equal(checkChange(["README.md", "index.html", ".github/workflows/test.yml"], ["x"]).ok, true);
});
