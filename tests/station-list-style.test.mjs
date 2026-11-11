// The folded station list (option A) on a phone: 11 Nov evening, Sam's screenshots showed every name broken one letter
// per line. The old sideways stop row's rules put each part of a stop in its own grid row of a narrow column; inside the
// list they must not apply. Checked in Chromium by hand (dark and light); this guards the rules that caused it.
// Story: docs/stories/journey-progress.md ("Where you are on the leg").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/signal.css", import.meta.url), "utf8");
const rule = (sel) => { const i = css.indexOf(sel + " {"); assert.ok(i >= 0, `no rule for ${sel}`); return css.slice(i, css.indexOf("}", i)); };

test("The station list resets the old stop-row layout: one line per station, no grid rows, no sideways line", () => {
  assert.match(rule("html .journey-progress .jp-vlist .jp-stop"), /grid-row:auto;grid-template-rows:none;grid-template-columns:20px minmax\(0,1fr\) auto/);
  assert.match(rule("html .journey-progress .jp-vlist .jp-stop > *"), /grid-row:auto/);
  assert.match(rule("html .journey-progress .jp-vlist .jp-stop::after"), /content:none/);
  assert.match(rule("html .journey-progress .jp-vlist .jp-stop-name"), /overflow-wrap:normal/);
  // The old row's rules are still there for anything else that uses them, so the list must keep overriding them.
  assert.match(rule("html .journey-progress .jp-stop"), /grid-row:1\/span 5/);
});
