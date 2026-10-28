// Engine: which timetable searches each plan makes (against a fake planner), and which trains each plan offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train, option } from "./helpers.mjs";

const sam = core.profiles.samCommute, now = at("2026-11-03", "17:00");
// A fake planner: a direct train every 20 min from `t` (as "journeys" the converter understands); logs each call.
function planner(log, fail = {}) {
  return async (from, to, t, timeIs) => {
    log.push(`${from}-${to} ${timeIs} ${core.hhmm(t)}`);
    if (fail[`${from}-${to}`]) { const e = new Error(fail[`${from}-${to}`].msg); Object.assign(e, fail[`${from}-${to}`]); throw e; }
    const base = timeIs === "Arriving" ? t - 3 * 20 * MIN - 30 * MIN : t;
    return [0, 1, 2].map(i => ({ from, to, dep: base + i * 20 * MIN, arr: base + i * 20 * MIN + 30 * MIN }));
  };
}
const conv = { train: (j) => (j.from === "XXX" ? null : { key: `${j.from}-${j.to}`, msgs: [], svc: train({ from: j.from, to: j.to, std: core.hhmm(j.dep), dep: j.dep, arr: j.arr }) }), dropReason: () => "no train" };
const opts = (keyed) => ({ keyed, earliestCatch: () => 25 * MIN, p: sam });

test("Leave now searches: one per route first, then onward pages with a key; 35 min back on the train", async () => {
  const log = [];
  const r = await core.searchRoutes(["LET-KGX", "LET-ZFD"], core.nowRounds(now, false, opts(true)), planner(log), conv, sam);
  assert.deepEqual(log, ["LET-KGX Departing 17:10", "LET-ZFD Departing 17:10", "LET-KGX Departing 17:51", "LET-ZFD Departing 17:51", "LET-KGX Departing 18:32", "LET-ZFD Departing 18:32"]);
  assert.equal(r.boards["LET-KGX"].services.length, 9); assert.deepEqual(r.failed, {});
  assert.equal(r.diag["LET-KGX"].searches, 3); assert.equal(r.diag["LET-KGX"].kept, 9);
  const log2 = [];
  await core.searchRoutes(["LET-KGX"], core.nowRounds(now, true, opts(false)), planner(log2), conv, sam);
  assert.deepEqual(log2, ["LET-KGX Departing 16:25"]);
});

test("A refusal stops further requests and every route says why; a plain failure doesn't", async () => {
  const log = [];
  const r = await core.searchRoutes(["LET-KGX", "LET-ZFD"], core.nowRounds(now, false, opts(true)), planner(log, { "LET-KGX": { msg: "TfL is rate-limiting", rateLimited: true } }), conv, sam);
  assert.deepEqual(log, ["LET-KGX Departing 17:10"]);
  assert.deepEqual(r.failed, { "LET-KGX": "TfL is rate-limiting", "LET-ZFD": "TfL is rate-limiting" });
  const log2 = [];
  const r2 = await core.searchRoutes(["LET-KGX", "LET-ZFD"], core.nowRounds(now, false, opts(false)), planner(log2, { "LET-KGX": { msg: "HTTP 500" } }), conv, sam);
  assert.deepEqual(r2.failed, { "LET-KGX": "HTTP 500" }); assert.ok(log2.includes("LET-ZFD Departing 17:10"));
});

test("Arrive by searches: arriving at the latest useful time, then after, then from early enough", async () => {
  const log = [], T = at("2026-11-03", "09:00");
  await core.searchRoutes(["LET-KGX"], core.arriveByRounds(T, () => 30 * MIN, opts(false)), planner(log), conv, sam);
  assert.deepEqual(log, ["LET-KGX Arriving 08:30", "LET-KGX Departing 07:41", "LET-KGX Departing 07:20"]);
  assert.equal(core.liveCovers("by", now + 239 * MIN, now), true); assert.equal(core.liveCovers("by", now + 240 * MIN, now), false);
  assert.equal(core.liveCovers("at", now + 134 * MIN, now), true); assert.equal(core.liveCovers("at", now + 135 * MIN, now), false);
});

test("routeCount counts St Pancras trains towards King's Cross; hubOfKey; dropped journeys explained", () => {
  const all = { "KGX-LET": { services: [1], msgs: [] }, "STP-LET": { services: [1, 2], msgs: [] }, "ZFD-LET": { services: [1], msgs: [] } };
  assert.equal(core.routeCount("KGX-LET", all, sam), 3); assert.equal(core.routeCount("ZFD-LET", all, sam), 1); assert.equal(core.routeCount("STP-LET", all, sam), 2);
  assert.equal(core.hubOfKey("LET-ZFD", sam), "ZFD"); assert.equal(core.hubOfKey("CEN-RVS", testville), "CEN");
  const boards = {}, diag = {};
  core.addJourneys(boards, [{ from: "XXX" }, { from: "KGX", to: "LET", dep: now, arr: now + 30 * MIN }, { from: "KGX", to: "LET", dep: now, arr: now + 30 * MIN }], "KGX-LET", diag, conv, sam);
  assert.equal(boards["KGX-LET"].services.length, 1, "no duplicates");
  assert.deepEqual(diag["KGX-LET"], { searches: 1, returned: 3, kept: 2, dropped: { "no train": 1 }, trains: ["17:00 King's Cross", "17:00 King's Cross"] });
});

const o = (leave, arrive, op = "A", timetable = false) => option({ hub: "CEN", leave: now + leave * MIN, arrive: now + arrive * MIN,
  train: train({ from: "RVS", to: "CEN", operator: op, std: op, dep: now + leave * MIN + 15 * MIN, arr: now + arrive * MIN - 5 * MIN, timetable }) });

test("Leave around: from 15 min before (earlier leaves flagged), card from 10 min before, leaving order", () => {
  const T = now + 60 * MIN;
  const js = core.aroundOptions([o(30, 100, "A"), o(48, 110, "B"), o(52, 105, "C"), o(70, 120, "D", true)], T, now, true, "office", testville);
  assert.deepEqual(js.map(j => j.train.operator), ["B", "C", "D"]);
  assert.equal(js[0].flags[0].txt, "Leave 12 min before 18:00"); assert.equal(js[0].recommended, undefined, "12 min early: listed, not on the card");
  assert.equal(js[1].recommended, 1);
  assert.equal(js[2].flags.at(-1).txt, "Timetable only: not live-checked");
});

test("Arrive by: on time, cutting it fine, late by N min; the latest on-time train is the pick", () => {
  const T = now + 120 * MIN;
  const js = core.arriveByOptions([o(5, 100, "A"), o(30, 117, "B"), o(40, 130, "C")], T, false, "office", testville);
  assert.deepEqual(js.map(j => j.train.operator), ["A", "B", "C"]);
  assert.equal(js[1].flags[0].txt, "Cutting it fine"); assert.equal(js[2].flags[0].txt, "Late by 10 min"); assert.equal(js[2].late, true);
  assert.equal(js[1].recommended, 1); assert.equal(js[0].recommended, undefined, "25 min earlier: outside the 20 min window");
});
