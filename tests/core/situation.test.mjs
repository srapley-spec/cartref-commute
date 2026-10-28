// Engine: what you're doing, from where you are (src/core/situation.ts). Sam's profile and a made-up corridor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train } from "./helpers.mjs";

const sam = core.profiles.samCommute, D = "2026-11-03", T = (h) => at(D, h);
const fix = (here, acc = 20, t = null) => ({ here, acc, at: t });

test("hubHere: within 400 m of a London station with a fix good to 250 m", () => {
  assert.equal(core.hubHere(fix([51.5308, -0.1238]), sam), "KGX");
  assert.equal(core.hubHere(fix([51.5308, -0.1238], 300), sam), null);
  assert.equal(core.hubHere(fix([51.5203 + 0.0045, -0.1053]), sam), null);       // 500 m from Farringdon
  assert.equal(core.hubHere(fix([50.0, -1.0]), testville), "CEN");
});

test("onLine: between home and London, close to the line, never at home or a London station", () => {
  const L = sam.lines.KGX;
  assert.equal(core.onLine(fix([51.7638, -0.2156]), null, L), true);              // Hatfield
  assert.equal(core.onLine(fix([51.9799, -0.2290]), null, L), false);             // Letchworth
  assert.equal(core.onLine(fix([51.7638, -0.2156], 600), null, L), false);        // poor fix
  assert.equal(core.onLine(fix([51.7638, -0.2156]), "KGX", L), false);
  assert.equal(core.onLine(fix([51.7638, -0.10]), null, L), false);               // 8 km off the line
  assert.equal(core.onLine(fix([50.05, -1.05]), null, testville.lines.CEN), true);
});

test("inferDirection: setting off, arriving home, after the office, mid-journey, and remembering the trip", () => {
  const LET = [51.9799, -0.2290], OFF = [51.5139, -0.0710], KGX = [51.5308, -0.1238], now = T("08:00");
  let r = core.inferDirection(LET, now, D, {}, sam);
  assert.equal(r.dir, "office"); assert.deepEqual(r.mem.trip, { dir: "office", at: now });
  r = core.inferDirection(OFF, now, D, {}, sam);
  assert.equal(r.dir, "home"); assert.equal(r.mem.officeVisit, D); assert.deepEqual(r.mem.trip, { dir: "home", at: now });
  assert.equal(core.inferDirection([51.5139 + 0.009, -0.0710], now, D, {}, sam).mem.officeVisit, null, "1 km from the office isn't being there");
  assert.equal(core.inferDirection([51.5139 + 0.002, -0.0710], now, D, {}, sam).mem.officeVisit, D, "220 m is");
  assert.equal(core.inferDirection(KGX, now, D, { officeVisit: D }, sam).dir, "home");
  assert.equal(core.inferDirection(KGX, now, D, { trip: { dir: "office", at: now - 2 * 3600e3 } }, sam).dir, "office");
  assert.equal(core.inferDirection([51.69, -0.18], now, D, { trip: { dir: "office", at: now - 4 * 3600e3 } }, sam).dir, "home");     // Potters Bar: nearer Aldgate
  assert.equal(core.inferDirection([51.86, -0.19], now, D, { trip: { dir: "home", at: now - 4 * 3600e3 } }, sam).dir, "office");    // Knebworth: nearer Letchworth
  assert.equal(core.inferDirection(LET, now, D, { trip: { dir: "home", at: now - 2 * 3600e3 } }, sam).dir, "home");                  // arriving
  assert.equal(core.inferDirection(LET, now, D, { trip: { dir: "home", at: now - 4 * 3600e3 } }, sam).dir, "office");
  assert.equal(core.inferDirection([50.1, -1.1], now, D, {}, testville).dir, "office");
});

const toCity = (std, dep, len, op = "Express Rail", extra = {}) => train({ from: "RVS", to: "CEN", std, dep, arr: dep + len * MIN, operator: op, ...extra });

test("whichTrain: departed trains only, the nearest fit, sure when the runner-up is 4+ min worse, then remembered", () => {
  const now = T("08:00"), here = [50.05, -1.05];                                   // halfway along the made-up line
  const boards = { "RVS-CEN": { msgs: [], services: [toCity("07:50", now - 10 * MIN, 20), toCity("07:40", now - 20 * MIN, 30, "Metro Rail"), toCity("08:01", now + MIN, 20)] } };
  const r = core.whichTrain(boards, here, "office", now, null, () => null, testville);
  assert.equal(r.result.t.std, "07:50"); assert.equal(r.result.sure, true);
  assert.deepEqual(r.lock, { operator: "Express Rail", std: "07:50", from: "RVS" });
  // Not sure: two trains about as close.
  const close = { "RVS-CEN": { msgs: [], services: [toCity("07:50", now - 10 * MIN, 20), toCity("07:49", now - 11 * MIN, 22, "Metro Rail")] } };
  const u = core.whichTrain(close, here, "office", now, null, () => null, testville);
  assert.equal(u.result.sure, false); assert.equal(u.result.other.t.std, "07:49"); assert.equal(u.lock, null);
  // A picked train always wins, and nothing is a fit: "none" with others to pick from.
  const picked = core.whichTrain(close, here, "office", now, { operator: "Metro Rail", std: "07:49", from: "RVS", picked: true }, () => null, testville);
  assert.equal(picked.result.t.std, "07:49"); assert.equal(picked.result.picked, true);
  const none = core.whichTrain({ "RVS-CEN": { msgs: [], services: [toCity("07:20", now - 40 * MIN, 45)] } }, here, "office", now, null, () => null, testville);
  assert.equal(none.result.none, true); assert.equal(none.result.others.length, 1);
});

test("whichTrain: a reported position beats the timetable, and more than 6 min from you rules a train out", () => {
  const now = T("08:00"), here = [50.05, -1.05];
  const late = toCity("07:40", now - 20 * MIN, 30, "Express Rail", { serviceId: "S1" }), onTime = toCity("07:50", now - 10 * MIN, 20, "Metro Rail", { serviceId: "S2" });
  const boards = { "RVS-CEN": { msgs: [], services: [late, onTime] } };
  // S1 reported just at MID (halfway, where you are); S2 reported still at Riverside.
  const prog = { S1: { last: { code: "MID", t: now - MIN }, next: { code: "CEN", t: now + 15 * MIN } }, S2: { last: { code: "RVS", t: now - MIN }, next: { code: "MID", t: now + 10 * MIN } } };
  const r = core.whichTrain(boards, here, "office", now, null, (id) => prog[id] || null, testville);
  assert.equal(r.result.t.std, "07:40"); assert.equal(r.result.reported, true);
  assert.equal(r.result.others[0].ruledOut, true);
});

test("onTube / whichTube: left the station after a tube left; not while there with a fresh fix; not near Aldgate", () => {
  const now = T("08:20"), lh = { hub: "KGX", seen: T("08:15"), arrivals: [{ t: T("08:16") }, { t: T("08:18") }, { t: T("08:25") }] };
  const KGX = [51.5308, -0.1238], between = [51.523, -0.10];
  assert.equal(core.onTube(lh, "office", now, fix(between, 20, now), false, null, sam), true);
  assert.equal(core.onTube(lh, "office", now, fix(KGX, 20, now), false, "KGX", sam), false);
  assert.equal(core.onTube(lh, "office", now, fix(KGX, 20, now - 2 * MIN), false, "KGX", sam), true);       // fix stale underground
  assert.equal(core.onTube(lh, "office", now, fix([51.5142, -0.0755], 20, now), false, null, sam), false);   // at Aldgate
  assert.equal(core.onTube(lh, "home", now, fix(between, 20, now), false, null, sam), false);
  assert.equal(core.onTube({ ...lh, seen: now - 26 * MIN }, "office", now, fix(between, 20, now), false, null, sam), false);
  const w = core.whichTube(lh, now);
  assert.equal(w.best.t, T("08:16")); assert.equal(w.other.t, T("08:18"));
});

test("Going home by tube: noted at Aldgate; on a tube once one has left and you've gone; which one", () => {
  const ALD = [51.5142, -0.0755], seen = T("17:00"), v = { seen, deps: [{ line: "Met", t: T("17:01") }, { line: "Circle", t: T("17:05") }] };
  assert.equal(core.atOfficeTube("home", fix(ALD, 20), sam), true);
  assert.equal(core.atOfficeTube("home", fix(ALD, 200), sam), false);
  assert.equal(core.atOfficeTube("office", fix(ALD, 20), sam), false);
  assert.equal(core.onTubeHome(v, "home", "commute", T("17:03"), fix(ALD, 20, T("17:00")), false, null, sam), true);   // fix stale
  assert.equal(core.onTubeHome(v, "home", "commute", T("17:03"), fix(ALD, 20, T("17:03")), false, null, sam), false);  // still there
  assert.equal(core.onTubeHome(v, "home", "commute", T("17:00"), fix(ALD, 20, T("16:55")), false, null, sam), false);  // nothing left yet
  assert.equal(core.onTubeHome(v, "home", "leisure", T("17:03"), fix(ALD, 20, T("17:00")), false, null, sam), false);
  const w = core.whichTubeHome(v, T("17:03"));
  assert.equal(w.best.line, "Met"); assert.equal(w.other, undefined);
});

test("Nearly home, walks, in London to the office, the remembered train", () => {
  assert.equal(core.nearlyHome("home", "commute", [51.97, -0.23], false, sam), true);
  assert.equal(core.nearlyHome("home", "commute", [51.97, -0.23], true, sam), false);
  assert.equal(core.nearlyHome("office", "commute", [51.97, -0.23], false, sam), false);
  assert.equal(core.nearlyHome("home", "commute", [50.1, -1.1], false, testville), true);
  const s = core.walkSecs([51.9799, -0.2290], [51.9752, -0.2402], "avg", sam), d = core.km([51.9799, -0.2290], [51.9752, -0.2402]);
  assert.ok(Math.abs(s - d * 1.3 / 5 * 3600) < 1e-6);
  assert.equal(core.inLondonToOffice("office", fix([51.52, -0.09]), null, false, false, sam), true);
  assert.equal(core.inLondonToOffice("office", fix([51.52, -0.09]), "ZFD", false, false, sam), false);
  assert.equal(core.inLondonToOffice("home", fix([51.52, -0.09]), null, false, false, sam), false);
  const t = toCity("07:50", T("07:50"), 20);
  assert.equal(core.lockedTrain({ a: { services: [t] } }, { operator: "Express Rail", std: "07:50", from: "RVS" }), t);
  assert.equal(core.lockedTrain({ a: { services: [t] } }, null), null);
});
