// Both designs (Sam, 31 Oct: everything from 30 Oct must work in Panda and in Signal). The going-home tube and
// Aldgate rules from 30 Oct (tests/rules.test.mjs) run again here with the Signal design switched on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCENARIOS = ["Met departures from Aldgate", "Met platform at Aldgate", "Whole evening", "Aldgate's real feed", "Going home, 30 Oct 18:24", "Review 30 Oct", "Morning, 30 Oct", "Tube going home", "Going home"];

test("Both designs: the 30 Oct going-home tube and Aldgate rules pass in Signal too", () => {
  const env = { ...process.env, CARTREF_DESIGN: "signal", TZ: "Europe/London" }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--import", "./tests/clock.mjs", "--test", "--test-reporter=tap", `--test-name-pattern=${SCENARIOS.join("|")}`, "tests/rules.test.mjs"],
    { cwd: ROOT, env, encoding: "utf8", timeout: 240e3 });
  const out = r.stdout + r.stderr, pass = +(/^# pass (\d+)/m.exec(out) || [])[1], fail = +(/^# fail (\d+)/m.exec(out) || [])[1];
  assert.equal(fail, 0, out.split("\n").filter((l) => /^not ok|error:/.test(l)).join("\n"));
  assert.ok(pass >= 14, `ran ${pass} scenarios in Signal`);
  assert.equal(r.status, 0);
});
