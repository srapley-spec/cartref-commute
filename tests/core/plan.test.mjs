// Engine: Sam's route descriptions and the Leave now list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train, option } from "./helpers.mjs";

const sam = core.profiles.samCommute, now = at("2026-11-03", "17:00");
const T = { walkHomeStationAvg: 1337, walkHomeStationFast: 1086, walkStationHomeAvg: 1332, walkStationHomeFast: 1111, letEntry: 120, letExit: 90, catchMargin: 60,
  kxInterchange: 360, farInterchange: 240, tubeWait: 180, rideKxAld: 600, rideFarAld: 420, aldPlatform: 90, aldWalk: 420,
  rideKxAde: 660, rideFarAde: 480, adePlatform: 90, adeWalk: 360, stpInterchange: 420, fastFactor: 0.82, leisureFactor: 1.15 };
const secs = (segs) => segs.reduce((t, s) => t + s.secs, 0);
const R = (o) => core.samRoutes({ dir: "office", mode: "commute", pace: "avg", timings: T, ...o });

test("Routes to work: one per London station; door to platform and platform to desk from the timings", () => {
  const rs = R({});
  assert.deepEqual(rs.map(r => r.board), ["LET-KGX", "LET-STP", "LET-ZFD"]);
  assert.equal(secs(rs[0].before), 1337 + 120 + 60);
  assert.equal(secs(rs[2].after), 240 + 180 + 420 + 90 + 420);
  const fast = R({ pace: "fast" });
  assert.equal(secs(fast[0].before), 1086 + 120 * 0.82 + 60);
  const fb = R({ tubeFallback: true });
  assert.equal(fb[0].extra.tube.stop, "Aldgate East"); assert.equal(secs(fb[0].after), 360 + 180 + 660 + 90 + 360);
  assert.match(fb[0].after[1].step.d, /^H&C to Aldgate East/);
});

test("Routes home; from where you are (walk to Letchworth, or already at King's Cross); leisure", () => {
  const home = R({ dir: "home" });
  assert.deepEqual(home.map(r => r.board), ["KGX-LET", "STP-LET", "ZFD-LET"]);
  assert.equal(secs(home[1].before), 420 + 90 + 180 + 600 + 420 + 60);
  const walk = R({ here: { walkToStation: 300, atHub: null } });
  assert.equal(walk[0].before[0].secs, 300); assert.equal(walk[0].extra.fromHere, true);
  const kx = R({ dir: "home", here: { walkToStation: null, atHub: "KGX" } });
  assert.equal(secs(kx[0].before), 180 + 60); assert.match(kx[1].before[0].step.d, /You're at King's Cross: go to the St Pancras platform/);
  assert.equal(secs(kx[2].before), 120 + 180 + 240 + 240 + 60); assert.match(kx[2].before[0].step.d, /Tube from King's Cross to Farringdon/);
  // At Aldgate going home (30 Oct 18:24): no walk from the office; the platform walk carries the first step.
  const ald = R({ dir: "home", here: { walkToStation: null, atHub: null, atOfficeTube: true } });
  assert.equal(secs(ald[1].before), 90 + 180 + 600 + 420 + 60); assert.match(ald[0].before[0].step.d, /^You're at Aldgate: go to the platform/);
  assert.equal(ald[2].extra.fromHere, true);
  assert.equal(secs(R({ dir: "home", tubeFallback: true, here: { walkToStation: null, atHub: null, atOfficeTube: true } })[0].before), 360 + 90 + 180 + 660 + 360 + 60, "Aldgate East: the walk stays");
  assert.equal(secs(R({ dir: "office", here: { walkToStation: null, atHub: null, atOfficeTube: true } })[0].before), 1337 + 120 + 60, "going to work it changes nothing");
  assert.doesNotThrow(() => R({ dir: "home", mode: "leisure", here: { walkToStation: null, atHub: null, atOfficeTube: true } }), "leisure routes have no tube (review 30 Oct: this crashed)");
  const lo = R({ mode: "leisure" });
  assert.deepEqual(lo.map(r => r.hub), ["KGX", "STP"]);
  const lh = R({ dir: "home", mode: "leisure", london: { KXSP: { dur: 18 * MIN, summary: "Walk", disruptions: [] }, FAR: { dur: 21 * MIN, summary: "Bus", disruptions: [] } } });
  assert.equal(lh[0].before[0].secs, 18 * 60); assert.equal(lh[2].extra.planned, true);
  assert.equal(R({ dir: "home", mode: "leisure" })[0].extra.planned, false);
});

test("liveAdjust: departed trains go; leave time passed is flagged, not hidden; at the station, catchable until a minute before", () => {
  const o = (leaveMin, depMin, from = "KGX") => option({ hub: from, leave: now + leaveMin * MIN, arrive: now + 60 * MIN, train: train({ from, to: "LET", dep: now + depMin * MIN, arr: now + 50 * MIN }) });
  const name = (j) => sam.stationNames[j.train.from];
  const js = core.liveAdjust([o(-30, -1), o(-5, 10), o(5, 20), o(-20, 0.5)], now, null, name);
  assert.equal(js.length, 3);
  assert.match(js[0].flags[0].txt, /Leave time passed: 6 min short/); assert.equal(js[1].missed, false);
  const at = core.liveAdjust([o(-5, 10), o(-20, 0.5), o(-5, 10, "ZFD")], now, "King's Cross", name);
  assert.equal(at[0].missed, false); assert.equal(at[1].missed, true); assert.equal(at[1].flags[0].txt, "Leaving in under a minute");
  assert.equal(at[2].missed, true, "a train from another station still needs the trip there");
  const unc = core.liveAdjust([option({ hub: "KGX", leave: now + 5 * MIN, arrive: now + 60 * MIN, train: train({ from: "KGX", to: "LET", dep: now + 20 * MIN, arr: now + 50 * MIN, depUnknown: true }) })], now, null, name);
  assert.equal(unc[0].uncertain, true);
});

test("rankNow: leaving order; first catchable; fastest; card picks within the window", () => {
  const o = (leave, arrive, op = "Express Rail") => option({ hub: "CEN", leave: now + leave * MIN, arrive: now + arrive * MIN, train: train({ from: "RVS", to: "CEN", operator: op, dep: now + leave * MIN + 15 * MIN, arr: now + arrive * MIN - 5 * MIN }) });
  const list = core.rankNow([o(10, 70, "A"), o(2, 80, "B"), o(20, 65, "C"), o(30, 100, "D")], "office", testville);
  assert.deepEqual(list.map(j => j.train.operator), ["B", "A", "C", "D"]);
  assert.equal(list[0].first, true); assert.equal(list[2].fastest, true);
  assert.equal(list[2].recommended, 1); assert.equal(list.filter(j => j.recommended).length <= 2, true);
  assert.equal(list[3].recommended, undefined);
  assert.deepEqual(core.rankNow([], "office", testville), []);
  const tie = core.rankNow([o(10, 70, "A"), o(20, 70, "B")], "office", testville);
  assert.equal(tie.find(j => j.fastest).train.operator, "B", "same arrival: the later leave is the fastest");
});

test("Any start and end point: going out to a place, the leg from each station; no leg yet = not planned", () => {
  const legs = { KXSP: { dur: 18 * MIN, summary: "Walk 5m → Piccadilly 9m", disruptions: [] }, FAR: { dur: 25 * MIN, summary: "Elizabeth 10m", disruptions: [] } };
  const rs = R({ mode: "leisure", dest: { name: "Science Museum", legs } });
  assert.deepEqual(rs.map(r => r.board), ["LET-KGX", "LET-STP", "LET-ZFD"]);
  assert.equal(secs(rs[2].after), 240 * 1.15 + 25 * 60); assert.equal(rs[0].after[1].step.d, "Arrive Science Museum");
  assert.equal(rs[0].extra.outTo, true); assert.equal(rs[0].extra.planned, true);
  assert.equal(R({ mode: "leisure", dest: { name: "X", legs: null } })[0].extra.planned, false);
  assert.deepEqual(R({ mode: "leisure" }).map(r => r.hub), ["KGX", "STP"], "no destination: as before");
});

test("tflPickPlaces: TfL's best match for each end that needs one", () => {
  const j = { toLocationDisambiguation: { matchStatus: "list", disambiguationOptions: [
    { parameterValue: "1001", matchQuality: 500, place: { commonName: "Science Museum Library" } },
    { parameterValue: "51.497,-0.174", matchQuality: 900, place: { commonName: "Science Museum" } }] }, fromLocationDisambiguation: { matchStatus: "identified" } };
  assert.deepEqual(core.tflPickPlaces(j), { from: null, to: { value: "51.497,-0.174", name: "Science Museum" } });
  assert.deepEqual(core.tflPickPlaces({}), { from: null, to: null });
});

test("samRoutes: the local station comes from `start` (default Letchworth); no station is written into the routes", () => {
  const def = R({});
  assert.deepEqual(def.map(r => r.board), ["LET-KGX", "LET-STP", "LET-ZFD"]);
  assert.equal(def[0].fromName, "Letchworth");
  const other = R({ start: { code: "XYZ", name: "Elsewhere" } });
  assert.deepEqual(other.map(r => r.board), ["XYZ-KGX", "XYZ-STP", "XYZ-ZFD"]);
  assert.ok(other.every(r => r.fromName === "Elsewhere" && r.startsAtHome));
  const back = R({ dir: "home", start: { code: "XYZ", name: "Elsewhere" } });
  assert.deepEqual(back.map(r => r.board), ["KGX-XYZ", "STP-XYZ", "ZFD-XYZ"]);
  assert.ok(back.every(r => r.arriveLabel === "Arrive Elsewhere" && r.after.at(-1).step.d === "Arrive Cartref"));
  const here = R({ start: { code: "XYZ", name: "Elsewhere" }, here: { walkToStation: 600, atHub: null } });
  assert.match(here[0].before[0].step.note, /walk to Elsewhere station/);
});
