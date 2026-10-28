// Engine: warning grading, notices, line status, live + timetable mixing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train } from "./helpers.mjs";

const sam = core.profiles.samCommute, now = at("2026-11-03", "17:00");
const t = (o) => train({ from: "KGX", to: "LET", dep: now + 10 * MIN, arr: now + 40 * MIN, ...o });
const boards = (services, msgs = []) => ({ "KGX-LET": { services, msgs } });

test("railWarnings: red for a cancellation, no estimate or 15+ min; amber 5–14; none otherwise", () => {
  const g = (svcs) => core.railWarnings(boards(svcs), ["KGX-LET"], now, sam);
  assert.equal(g([t({}), t({ depLate: 4 })]).level, "none");
  assert.equal(g([t({ arrLate: 5 })]).level, "amber");
  assert.equal(g([t({ depLate: 14 })]).level, "amber");
  assert.equal(g([t({ depLate: 15 })]).level, "red");
  assert.equal(g([t({ cancelled: true })]).level, "red");
  assert.equal(g([t({ depUnknown: true })]).level, "red");
  assert.equal(g([t({ depLate: 30, dep: now - 6 * MIN })]).level, "none", "trains gone over 5 min ago don't count");
  const w = g([t({ depLate: 6 }), t({ cancelled: true }), t({})]);
  assert.equal(w.affected, 2); assert.equal(w.total, 3); assert.equal(w.hit, true); assert.equal(w.late, 6);
});

test("railWarnings: notices split into your route, elsewhere, and station facilities", () => {
  const msgs = ["Disruption between Hitchin and Stevenage.", "Lifts out of order at Hatfield.", "Delays at Brighton.", "Strike action across the network.", "Escalator works at King's Cross: trains are delayed.", "Delays at Hatfield.", "Delays at Hatfield."];
  const w = core.railWarnings(boards([t({})], msgs), ["KGX-LET"], now, sam);
  assert.deepEqual(w.facilities, ["Lifts out of order at Hatfield."]);
  assert.deepEqual(w.onRoute, ["Disruption between Hitchin and Stevenage.", "Strike action across the network.", "Escalator works at King's Cross: trains are delayed.", "Delays at Hatfield."]);
  assert.deepEqual(w.other, ["Delays at Brighton."]);
  const tv = core.railWarnings({ "CEN-RVS": { services: [], msgs: ["Delays at Riverside.", "Delays at Hitchin."] } }, ["CEN-RVS"], now, testville);
  assert.deepEqual(tv.onRoute, ["Delays at Riverside."]);
});

test("noticeTitle: first sentence, at most 90 characters, cut at a word", () => {
  assert.equal(core.noticeTitle("Trains are delayed.  More details at nationalrail.co.uk."), "Trains are delayed");
  const long = core.noticeTitle("Owing to a fault with the signalling system between Hitchin and Stevenage some lines are blocked today. Ok.");
  assert.ok(long.length <= 88 && long.endsWith("…") && !/\s…$/.test(long), long);
});

test("Line status: worst, ok, level, the H&C fallback, and tube flags", () => {
  const L = (id, ...sevs) => ({ id, name: id, statuses: sevs.map(sev => ({ sev, desc: `sev ${sev}` })) });
  assert.equal(core.lineOk(L("circle", 10)), true);
  assert.equal(core.lineOk(L("circle", 9)), false);
  assert.equal(core.lineLevel(L("circle", 9)), "warn");
  assert.equal(core.lineLevel(L("circle", 9, 20)), "bad");
  assert.equal(core.worstStatus(L("x", 10, 6)).sev, 6);
  assert.equal(core.tubeFallbackNeeded([L("circle", 20), L("metropolitan", 5)], ["circle", "metropolitan"]), true);
  assert.equal(core.tubeFallbackNeeded([L("circle", 20), L("metropolitan", 9)], ["circle", "metropolitan"]), false);
  assert.equal(core.tubeFallbackNeeded(null, ["circle"]), false);
  const ids = { main: ["circle", "metropolitan"], fallback: ["hammersmith-city"], fallbackNote: "Via fallback" };
  assert.deepEqual(core.tubeFlags({}, [L("circle", 9), L("metropolitan", 10)], ids), [{ lvl: "warn", txt: "circle: sev 9" }]);
  assert.deepEqual(core.tubeFlags({}, [L("circle", 9), L("metropolitan", 6)], ids), [{ lvl: "bad", txt: "circle: sev 9 · metropolitan: sev 6" }]);
  assert.deepEqual(core.tubeFlags({ fallback: true }, [L("hammersmith-city", 10)], ids), [{ lvl: "warn", txt: "Via fallback" }]);
});

test("Live + timetable: horizon, timetable only after it (live wins), offsets clamped, flags", () => {
  const live = { "KGX-LET": { msgs: [], services: [t({ dep: now + 100 * MIN }), t({ dep: now + 118 * MIN })] } };
  assert.equal(core.liveHorizon(live), now + 118 * MIN);
  assert.equal(core.liveHorizon({}), 0);
  const tt = { "KGX-LET": { msgs: [], services: [t({ dep: now + 118 * MIN, timetable: true }), t({ dep: now + 118.5 * MIN, timetable: true }), t({ dep: now + 130 * MIN, timetable: true })] }, "ZFD-LET": { msgs: [], services: [t({ dep: now + 140 * MIN, timetable: true })] } };
  const m = core.mergeBeyond(live, tt, core.liveHorizon(live));
  assert.deepEqual(m["KGX-LET"].services.map(x => (x.dep - now) / MIN), [100, 118, 130]);
  assert.equal(m["ZFD-LET"].services.length, 1);
  assert.equal(core.clampOffset(-200), -120); assert.equal(core.clampOffset(200), 119); assert.equal(core.clampOffset(10.4), 10);
  const opts = core.markTimetable([{ train: t({ timetable: true }), flags: [] }, { train: t({}), flags: [] }]);
  assert.equal(opts[0].flags[0].txt, "Timetable only: not live-checked"); assert.equal(opts[1].flags.length, 0);
});

test("missingPairSearches: one search per station a train is missing from, merged within 10 min, at most 6", () => {
  const tl = (from, dep, arr, op = "Thameslink") => train({ from, to: "LET", dep: now + dep * MIN, arr: now + arr * MIN, operator: op });
  const b = { "ZFD-LET": { msgs: [], services: [tl("ZFD", 10, 60), tl("ZFD", 15, 65)] }, "STP-LET": { msgs: [], services: [tl("STP", 15, 60)] } };
  assert.deepEqual(core.missingPairSearches(b, "home", sam), [{ key: "STP-LET", at: now }]);
  const many = { "ZFD-LET": { msgs: [], services: Array.from({ length: 10 }, (_, i) => tl("ZFD", i * 20, i * 20 + 50)) }, "STP-LET": { msgs: [], services: [] } };
  assert.equal(core.missingPairSearches(many, "home", sam).length, 6);
  const out = { "RVS-MKT": { msgs: [], services: [train({ from: "RVS", to: "MKT", dep: now, arr: now + 30 * MIN })] } };
  assert.deepEqual(core.missingPairSearches(out, "office", testville), [{ key: "RVS-CEN", at: now - MIN }]);
});
