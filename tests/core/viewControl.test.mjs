import { test } from "node:test";
import assert from "node:assert/strict";
import { core, MIN } from "./helpers.mjs";

const now = 1793700000000;
const presentation = (view, underWay = false) => ({ view, underWay, blocks: underWay ? ["verdict", ...core.BLOCKS[view]] : [...core.BLOCKS[view]] });
const input = (o = {}) => ({ auto: presentation("on-train"), live: presentation("on-train"), plan: "now", now,
  situationKey: "office:on-train", ...o });
const resolve = (o) => core.resolveViewControl(input(o));
const pin = (mode = "plan", at = now, situationKey = "office:on-train") => core.createViewOverride(mode, at, situationKey);

test("view control: planning pins the selected question without changing the live situation or deadline", () => {
  const i = input({ override: pin(), plan: "by", auto: presentation("on-train", true) });
  const before = JSON.stringify(i), shown = core.resolveViewControl(i);
  assert.equal(shown.view, "plan-by"); assert.equal(shown.mode, "plan"); assert.equal(shown.underWay, false);
  assert.equal(JSON.stringify(i), before, "the decision cannot mutate tracking or its inputs");
  assert.deepEqual(shown.blocks, core.BLOCKS["plan-by"]);
  assert.equal(resolve({ override: pin(), plan: "at" }).view, "plan-at");
  assert.equal(resolve({ override: pin(), plan: "now" }).view, "plan-now");
});

test("view control: manual choice expires at exactly twenty minutes and immediately on a changed situation", () => {
  const override = pin();
  assert.equal(resolve({ override, now: now + 20 * MIN - 1 }).mode, "plan");
  const expired = resolve({ override, now: now + 20 * MIN });
  assert.equal(expired.mode, "auto"); assert.equal(expired.override, null); assert.equal(expired.view, "on-train");
  assert.equal(resolve({ override, situationKey: "office:at-hub", auto: presentation("at-hub") }).view, "at-hub");
  assert.equal(resolve({ override, situationKey: "home:on-train" }).override, null, "direction change is a new situation");
});

test("view control: refresh and transient GPS loss with the stable situation key retain the manual choice", () => {
  const override = JSON.parse(JSON.stringify(pin("plan", now - MIN)));
  const shown = resolve({ override, now: now + MIN, live: null });
  assert.equal(shown.mode, "plan"); assert.deepEqual(shown.override, override);
  assert.equal(shown.view, "plan-now");
});

test("view control: Return to Auto uses the newest situation rather than the situation that was pinned", () => {
  const shown = resolve({ override: null, auto: presentation("nearly-home"), live: presentation("nearly-home") });
  assert.equal(shown.view, "nearly-home"); assert.equal(shown.mode, "auto");
  assert.equal(shown.override, null); assert.equal(shown.pending, false);
});

test("view control: Live uses current live evidence independently of a future planning question", () => {
  const shown = resolve({ override: pin("live"), auto: presentation("plan-by"), live: presentation("on-tube-home"), plan: "by" });
  assert.equal(shown.mode, "live"); assert.equal(shown.view, "on-tube-home"); assert.equal(shown.noActiveJourney, false);
  assert.deepEqual(shown.blocks, core.BLOCKS["on-tube-home"]);
});

test("view control: requesting Live without an active journey is explicit and never fabricates a service", () => {
  for (const live of [null, presentation("plan-now"), presentation("awaiting-location")]) {
    const shown = resolve({ override: pin("live"), live, auto: presentation("plan-now") });
    assert.equal(shown.noActiveJourney, true); assert.equal(shown.underWay, false); assert.equal(shown.mode, "live");
  }
  assert.equal(resolve({ auto: presentation("plan-now"), live: null }).noActiveJourney, false,
    "ordinary automatic planning remains ordinary planning");
});

test("view control: station and on-the-way boards are live even though their geometry is plan-now", () => {
  const shown = resolve({ override: pin("live"), auto: presentation("plan-at"), live: presentation("plan-now"), hasActiveJourney: true });
  assert.equal(shown.view, "plan-now"); assert.equal(shown.mode, "live"); assert.equal(shown.noActiveJourney, false);
  assert.equal(resolve({ override: pin("live"), hasActiveJourney: false }).noActiveJourney, true,
    "explicit unavailable evidence cannot display an old live view as current");
  assert.equal(resolve({ override: pin("live"), live: presentation("awaiting-location"), hasActiveJourney: true }).noActiveJourney, true,
    "an active-route hint cannot invent a location-derived view");
});

test("view control: manual planning and Live preserve the location-needed gate", () => {
  for (const mode of ["plan", "live"]) {
    const shown = resolve({ override: pin(mode), auto: presentation("awaiting-location"), live: null });
    assert.equal(shown.view, "awaiting-location"); assert.equal(shown.underWay, false);
  }
});

test("view control: automatic transitions wait during editing, selection or notice reading and then catch up", () => {
  const previous = presentation("plan-at");
  const shown = resolve({ previous, interacting: true });
  assert.equal(shown.view, "plan-at"); assert.equal(shown.pending, true); assert.equal(shown.mode, "auto");
  assert.equal(resolve({ previous, interacting: false }).view, "on-train");
  assert.equal(resolve({ previous: presentation("on-train"), interacting: true }).pending, false);
  const verdict = resolve({ previous: presentation("on-train"), interacting: true, auto: presentation("on-train", true) });
  assert.equal(verdict.pending, true); assert.equal(verdict.underWay, false, "do not insert a verdict while editing");
});

test("view control: explicit manual navigation is immediate even during an interaction", () => {
  const shown = resolve({ previous: presentation("on-train"), interacting: true, override: pin(), plan: "at" });
  assert.equal(shown.view, "plan-at"); assert.equal(shown.pending, false);
  assert.equal(resolve({ previous: presentation("plan-now"), interacting: true, override: pin("live") }).view, "on-train");
});

test("view control: an expiring override defers the resulting automatic transition until editing finishes", () => {
  const shown = resolve({ override: pin("plan", now - 20 * MIN), previous: presentation("plan-by"), interacting: true });
  assert.equal(shown.override, null); assert.equal(shown.mode, "auto"); assert.equal(shown.pending, true); assert.equal(shown.view, "plan-by");
});

test("view control: malformed or future saved overrides cannot trap the app in a pinned view", () => {
  for (const value of [null, {}, [], "plan", { mode: "auto", at: now, situationKey: "office:on-train" },
    { mode: "plan", at: NaN, situationKey: "x" }, { mode: "plan", at: -1, situationKey: "x" },
    { mode: "live", at: Infinity, situationKey: "x" }, { mode: "plan", at: now, situationKey: "" },
    { mode: "plan", at: now, situationKey: "x".repeat(513) }]) {
    assert.equal(core.restoreViewOverride(value), null);
    assert.equal(resolve({ override: value }).mode, "auto");
  }
  assert.equal(resolve({ override: pin("plan", now + 1) }).mode, "auto");
  assert.equal(core.createViewOverride("plan", NaN, "x"), null);
  assert.equal(resolve({ override: pin(), now: NaN }).mode, "auto");
  assert.deepEqual(core.restoreViewOverride({ ...pin(), extra: "discard me" }), pin());
});

test("view control: returned block arrays are independent of both input and canonical model", () => {
  const i = input(), shown = core.resolveViewControl(i);
  shown.blocks.splice(0);
  assert.ok(i.auto.blocks.length); assert.ok(core.BLOCKS["on-train"].length);
});
