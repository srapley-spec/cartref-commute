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

// ---------- Review (29 Oct evening): edges the first tests didn't pin ----------
test("chooseView under way (Arrive by today): in London beats on the tube beats on the train beats at the station", () => {
  const by = (o) => core.chooseView(S({ plan: "by", byTargetToday: true, ...o }));
  assert.equal(by({ inLondonToOffice: true }).view, "in-london", "walking from the tube is under way too");
  assert.equal(by({ inLondonToOffice: true }).underWay, true);
  assert.equal(by({ inLondonToOffice: true, onTube: true }).view, "in-london");
  assert.equal(by({ onTube: true, onLine: true }).view, "on-tube");
  assert.equal(by({ onLine: true, atHubToOffice: true }).view, "on-train");
  assert.equal(by({ atHubToOffice: true }).view, "at-hub");
  assert.equal(view({ plan: "at", inLondonToOffice: true }), "in-london", "Leave around gives way to walking to the office");
});

test("headlineKind: Leave around is 'leave' too", () => {
  assert.equal(core.headlineKind("plan-at", { atStation: true, onWay: true }), "leave");
});

test("statusLine edges: exactly 5 min late is amber; under 5 isn't counted; a cancellation beats the Aldgate East fallback", () => {
  const five = line({ tiers: tiers([tr({ depLate: 5 })]) });
  assert.equal(five.level, "warn"); assert.match(five.text, /5 min/); assert.ok(five.detail.includes("worst delay 5 min"));
  const four = line({ tiers: tiers([tr({ depLate: 4 })]) });
  assert.equal(four.level, "ok"); assert.ok(!four.detail.some(d => /worst delay/.test(d)), "under 5 min isn't a delay worth a line");
  const both = line({ tiers: tiers([tr({ cancelled: true })]), tubeFallback: true });
  assert.match(both.text, /cancelled/, "a cancelled train is worse than the Aldgate East fallback");
});

test("statusLine edges: a tube line's delays beat an operator's; example data beats timetable; the worst of a line's statuses", () => {
  const r = line({ tubeLines: [L("Circle", 6, "Severe Delays")], operators: [L("Thameslink", 9, "Minor Delays")] });
  assert.equal(r.level, "warn"); assert.equal(r.text, "Circle: Severe Delays");
  assert.ok(r.detail.includes("Thameslink: Minor Delays"), "the operator is still in the detail");
  assert.equal(line({ demo: true, timetableOnly: true }).text, "Example trains");
  const mixed = { id: "Circle", name: "Circle", statuses: [{ sev: 10, desc: "Good Service" }, { sev: 6, desc: "Severe Delays" }, { sev: 9, desc: "Minor Delays" }] };
  assert.equal(line({ tubeLines: [mixed] }).text, "Circle: Severe Delays");
});

test("statusLine edges: a later plan says the warning is about trains now, for every train tier", () => {
  for (const svc of [{ cancelled: true }, { depUnknown: true }, { depLate: 20 }]) {
    assert.match(line({ tiers: tiers([tr(svc)]), planLater: true }).text, /\(trains now, not your plan\)$/, JSON.stringify(svc));
  }
  const s = line({ tiers: tiers([tr({ depUnknown: true })]), stale: true });
  assert.ok(s.detail.includes("1 train delayed with no estimate"), "no-estimate trains are counted in the detail");
});

test("wayLevel: on your way, green with 3+ min to spare at your pace; amber when tight or only at a fast walk; red otherwise", () => {
  assert.equal(core.WAY_COMFORT_MIN, 3);
  assert.equal(core.wayLevel(10), "ok", "no effort level: your pace");
  assert.equal(core.wayLevel(3, "walk"), "ok", "3 min is comfortable");
  assert.equal(core.wayLevel(2, "walk"), "warn", "2 min is tight");
  assert.equal(core.wayLevel(1, "walk"), "warn");
  assert.equal(core.wayLevel(0, "walk"), "bad", "under a minute: keep going");
  assert.equal(core.wayLevel(-1, "walk"), "bad");
  assert.equal(core.wayLevel(10, "fast"), "warn", "only at a fast walk is never green");
  assert.equal(core.wayLevel(0, "fast"), "bad");
  for (const e of ["run", "car", "none"]) assert.equal(core.wayLevel(10, e), "bad", `${e}: more than a fast walk`);
});
