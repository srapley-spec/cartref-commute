// Engine: what a refresh loads, Nearly home, how an option compares with the best, tube connections home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train, option } from "./helpers.mjs";

const sam = core.profiles.samCommute, now = at("2026-11-03", "17:00");
const base = { now, force: false, manual: false, source: "darwin", dir: "home", mode: "commute", view: "now", awaitingLocation: false,
  inLondonToOffice: false, onTube: false, atHubToOffice: false, onTheLine: false, nearOffice: false,
  boards: { at: null, source: null, fit: false }, toOffice: null, statusAt: null, nrAt: null };
const plan = (o) => core.refreshPlan({ ...base, ...o });

test("refreshPlan: what the rail part loads, in order of situation", () => {
  assert.equal(plan({}).rail, "live"); assert.equal(plan({ awaitingLocation: true }).rail, "none");
  assert.equal(plan({ onTheLine: true }).liveBack, -40); assert.equal(plan({}).liveBack, 0);
  assert.equal(plan({ source: "demo" }).rail, "demo");
  assert.equal(plan({ source: "tfl" }).rail, "timetable");
  assert.equal(plan({ source: "tfl", view: "by" }).rail, "none", "Arrive by runs its own searches");
  assert.equal(plan({ source: "tfl", view: "by", onTheLine: true }).rail, "timetable");
  const fresh = { source: "tfl", boards: { at: now - 4 * MIN, source: "tfl", fit: true } };
  assert.equal(plan(fresh).rail, "none", "timetable reused for 5 min");
  assert.equal(plan({ ...fresh, force: true }).rail, "timetable");
  assert.equal(plan({ ...fresh, boards: { at: now - 5 * MIN, source: "tfl", fit: true } }).rail, "timetable");
  assert.equal(plan({ ...fresh, boards: { at: now - MIN, source: "tfl", fit: false } }).rail, "timetable", "other routes needed");
  assert.equal(plan({ atHubToOffice: true }).rail, "hubTubeArrivals");
  assert.equal(plan({ onTube: true, atHubToOffice: true }).rail, "officeTubeArrivals");
  const lon = plan({ inLondonToOffice: true, onTube: true });
  assert.equal(lon.rail, "toOffice"); assert.equal(lon.toOfficeNeeded, true);
  assert.equal(plan({ inLondonToOffice: true, toOffice: { at: now - MIN, movedKm: 0.1 } }).toOfficeNeeded, false);
  assert.equal(plan({ inLondonToOffice: true, toOffice: { at: now - MIN, movedKm: 0.4 } }).toOfficeNeeded, true);
  assert.equal(plan({ inLondonToOffice: true, toOffice: { at: now - 3 * MIN, movedKm: 0 } }).toOfficeNeeded, true);
  assert.equal(plan({ inLondonToOffice: true, nearOffice: true }).toOfficeNeeded, false);
});

test("refreshPlan: office tubes going home; line status reused 2 min, National Rail status 5 min; at most every 30 s", () => {
  assert.equal(plan({ nearOffice: true }).officeTubeDeps, true);
  assert.equal(plan({ nearOffice: true, dir: "office" }).officeTubeDeps, false);
  assert.equal(plan({ nearOffice: true, mode: "leisure" }).officeTubeDeps, false);
  assert.equal(plan({ statusAt: now - 1.9 * MIN }).lineStatus, false); assert.equal(plan({ statusAt: now - 2 * MIN }).lineStatus, true);
  assert.equal(plan({ statusAt: now - MIN, manual: true }).lineStatus, true);
  assert.equal(plan({ nrAt: now - 4.9 * MIN }).nrStatus, false); assert.equal(plan({ nrAt: now - 5 * MIN }).nrStatus, true);
  assert.equal(core.refreshDue(false, now - 29e3, now), false); assert.equal(core.refreshDue(false, now - 30e3, now), true);
  assert.equal(core.refreshDue(true, now - 1e3, now), true); assert.equal(core.refreshDue(false, null, now), true);
});

test("nearlyHomeEta: from the train, at home, walking, at the station, unknown", () => {
  const LET = [51.9799, -0.2290], HOME = [51.9752, -0.2402], near = [51.97, -0.22];
  const w = 19 * MIN, x = 90e3;
  assert.deepEqual(core.nearlyHomeEta(now, near, now + 5 * MIN, HOME, x, w, "avg", sam), { kind: "train", at: now + 5 * MIN + x + w, stationAt: now + 5 * MIN });
  assert.equal(core.nearlyHomeEta(now, near, now - 2 * MIN, HOME, x, w, "avg", sam).kind, "walk", "train arrived: walk from here");
  assert.equal(core.nearlyHomeEta(now, HOME, now + 5 * MIN, HOME, x, w, "avg", sam).kind, "home");
  const walk = core.nearlyHomeEta(now, near, null, HOME, x, w, "fast", sam);
  assert.equal(walk.at, now + core.walkSecs(near, HOME, "fast", sam) * 1000);
  assert.deepEqual(core.nearlyHomeEta(now, LET, null, null, x, w, "avg", sam), { kind: "station", at: now + x + w });
  assert.deepEqual(core.nearlyHomeEta(now, near, null, null, x, w, "avg", sam), { kind: "unknown" });
  assert.equal(core.nearlyHomeEta(now, [50.1, -1.1], null, null, x, w, "avg", testville).kind, "station");
});

test("compareWithBest: stopping train named, train time, minutes later or sooner", () => {
  const o = (dep, arr, arrive) => option({ hub: "KGX", leave: now, arrive: now + arrive * MIN, train: train({ from: "KGX", to: "LET", dep: now + dep * MIN, arr: now + arr * MIN }) });
  const best = o(0, 30, 50), slow = o(5, 59, 75);
  assert.deepEqual(core.compareWithBest(slow, best, sam), { stopping: true, trainMs: 54 * MIN, deltaMin: 25 });
  assert.deepEqual(core.compareWithBest(best, best, sam), { stopping: false, trainMs: 30 * MIN, deltaMin: null });
  assert.equal(core.compareWithBest(o(0, 30, 45), best, sam).deltaMin, -5);
});

test("tubeHomeConnections: arrival at each London station and the time needed there, at your pace", () => {
  const T = { rideKxAld: 600, rideFarAld: 420, kxInterchange: 360, farInterchange: 240, stpInterchange: 420, catchMargin: 60, fastFactor: 0.82 };
  const c = core.tubeHomeConnections(now, T, "avg");
  assert.deepEqual(c.reach, { ZFD: now + 7 * MIN, KGX: now + 10 * MIN, STP: now + 10 * MIN });
  assert.deepEqual(c.ready, { ZFD: 300e3, KGX: 420e3, STP: 480e3 });
  assert.equal(core.tubeHomeConnections(now, T, "fast").ready.KGX, (360 * 0.82 + 60) * 1000);
});
