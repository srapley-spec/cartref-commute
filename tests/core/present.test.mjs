// Engine: the presentation model — which view, what the big number means, how bad things are, what comes first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train } from "./helpers.mjs";

const S = (o = {}) => ({ plan: "now", awaitingLocation: false, byTargetToday: false, onLine: false, atHubToOffice: false,
  onTube: false, inLondonToOffice: false, onTubeHome: false, nearlyHome: false, ...o });
const view = (o) => core.chooseView(S(o)).view;

test("chooseView: live situations win over Leave now, in the order the situations are checked", () => {
  assert.equal(view({}), "plan-now");
  assert.equal(view({ onLine: true }), "on-train");
  assert.equal(view({ nearlyHome: true, onLine: true }), "nearly-home", "nearly home (last stretch) beats on the train");
  assert.equal(view({ onTubeHome: true, nearlyHome: true }), "on-tube-home");
  assert.equal(view({ atHubToOffice: true, onTubeHome: true }), "at-hub");
  assert.equal(view({ onTube: true, atHubToOffice: true }), "on-tube");
  assert.equal(view({ inLondonToOffice: true, onTube: true }), "in-london");
  assert.equal(view({ awaitingLocation: true, onLine: true }), "awaiting-location", "no direction yet: nothing else is drawn");
});

test("chooseView: Arrive by for today while under way shows the live view with the verdict first; otherwise the plan", () => {
  const under = core.chooseView(S({ plan: "by", byTargetToday: true, onLine: true }));
  assert.equal(under.view, "on-train"); assert.equal(under.underWay, true); assert.equal(under.blocks[0], "verdict");
  assert.equal(core.chooseView(S({ plan: "by", byTargetToday: true, atHubToOffice: true })).view, "at-hub");
  assert.equal(view({ plan: "by", byTargetToday: false, onLine: true }), "plan-by", "a plan for another day stays a plan");
  assert.equal(view({ plan: "by", byTargetToday: true, onTubeHome: true }), "plan-by", "going home isn't 'under way' for an office deadline");
  assert.equal(view({ plan: "by" }), "plan-by");
  assert.equal(view({ plan: "at" }), "plan-at");
  assert.equal(view({ plan: "at", onLine: true }), "on-train", "Leave around gives way to a live situation");
  assert.equal(view({ plan: "at", nearlyHome: true }), "plan-at", "…but not to the last stretch home");
});

test("headlineKind: departs at or on the way to the station, leave when planning, arrive when under way", () => {
  assert.equal(core.headlineKind("plan-now", { atStation: false, onWay: false }), "leave");
  assert.equal(core.headlineKind("plan-now", { atStation: true, onWay: false }), "departs");
  assert.equal(core.headlineKind("plan-now", { atStation: false, onWay: true }), "departs");
  assert.equal(core.headlineKind("plan-by", { atStation: true, onWay: false }), "leave");
  for (const v of ["on-train", "at-hub", "on-tube", "in-london", "on-tube-home", "nearly-home"]) assert.equal(core.headlineKind(v, { atStation: false, onWay: false }), "arrive", v);
});

test("Blocks: every view has an order; the headline comes before any option, context line, board or notice", () => {
  for (const [v, blocks] of Object.entries(core.BLOCKS)) {
    assert.ok(blocks.length, v);
    if (v === "awaiting-location") continue;
    const h = blocks.indexOf("headline");
    assert.ok(h >= 0 && h <= 2, `${v}: headline is at ${h}`);
    for (const later of ["options", "right-now", "hurry", "board", "lines", "why", "then"]) {
      const i = blocks.indexOf(later); if (i >= 0) assert.ok(i > h, `${v}: ${later} before the headline`);
    }
    assert.equal(blocks.indexOf("board") < 0 || blocks.indexOf("board") > blocks.indexOf("options"), true, `${v}: the board is after the top card`);
  }
  assert.equal(core.chooseView(S({ plan: "by", byTargetToday: true, onLine: true })).blocks[1], "label", "verdict, then the label");
});

// ---------- The status line ----------
const now = at("2026-11-03", "17:00");
const tr = (o) => train({ from: "KGX", to: "LET", dep: now + 10 * MIN, arr: now + 40 * MIN, ...o });
const tiers = (svcs, msgs = []) => core.railWarnings({ "KGX-LET": { services: svcs, msgs } }, ["KGX-LET"], now, testville);
const L = (id, sev, desc) => ({ id, name: id, statuses: [{ sev, desc }] });
const base = () => ({ errors: [], notLoaded: [], stale: false, tubeFallback: false, tiers: tiers([tr({})]), tubeLines: [L("Circle", 10, "Good Service")], operators: [L("Great Northern", 10, "Good Service")], planLater: false, demo: false, timetableOnly: false });
const line = (o) => core.statusLine({ ...base(), ...o });

test("statusLine: all good says so; a cancellation on your route is red whatever the operator's status says", () => {
  assert.deepEqual(line({}), { level: "ok", text: "Good service on your lines", detail: [] });
  const r = line({ tiers: tiers([tr({ cancelled: true }), tr({})]), operators: [L("Great Northern", 9, "Minor Delays")] });
  assert.equal(r.level, "bad"); assert.match(r.text, /1 train cancelled/);
  assert.ok(r.detail.includes("Great Northern: Minor Delays"), "the operator's status is still counted, below");
  const u = line({ tiers: tiers([tr({ depUnknown: true })]) });
  assert.equal(u.level, "bad"); assert.match(u.text, /no estimate/);
  const big = line({ tiers: tiers([tr({ depLate: 15 })]) });
  assert.equal(big.level, "bad"); assert.match(big.text, /15 min/);
});

test("statusLine: data you can't trust comes before anything about trains", () => {
  const t = tiers([tr({ cancelled: true })]);
  assert.match(line({ tiers: t, stale: true }).text, /out of date/);
  assert.match(line({ tiers: t, notLoaded: ["Farringdon"] }).text, /^Farringdon trains not loaded/);
  assert.match(line({ tiers: t, notLoaded: ["Farringdon"], errors: ["Key refused."] }).text, /^Key refused/);
  const s = line({ tiers: t, stale: true });
  assert.ok(s.detail.some(d => /cancelled/.test(d)), "the cancellation is still in the detail");
});

test("statusLine: 5–14 min is amber, a route notice with no impact is yellow, timetable and example data are info", () => {
  const a = line({ tiers: tiers([tr({ depLate: 7 })]) });
  assert.equal(a.level, "warn"); assert.match(a.text, /7 min/);
  assert.equal(line({ tubeLines: [L("Circle", 6, "Severe Delays")] }).level, "warn");
  assert.equal(line({ tubeLines: [L("Circle", 4, "Part Closure")] }).level, "bad", "a closed line is red");
  assert.equal(line({ tubeFallback: true }).text, "Circle and Met closed: via Aldgate East");
  const y = line({ tiers: tiers([tr({})], ["Disruption at Riverside."]) });
  assert.equal(y.level, "note"); assert.match(y.text, /1 notice on your route, no train affected yet/);
  assert.equal(line({ operators: [L("Thameslink", 9, "Minor Delays")] }).level, "note");
  assert.deepEqual(line({ timetableOnly: true }), { level: "info", text: "Timetable times, not live", detail: ["timetable, not live"] });
  assert.equal(line({ demo: true }).text, "Example trains");
  assert.match(line({ tiers: tiers([tr({ depLate: 7 })]), planLater: true }).text, /trains now, not your plan/);
});
