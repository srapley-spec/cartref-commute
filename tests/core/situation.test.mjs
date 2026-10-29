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
  // Arriving at the office on the way to work: still heading to the office until you've been there 5 min.
  const morning = { trip: { dir: "office", at: now - 3600e3 } };
  r = core.inferDirection(OFF, now, D, morning, sam);
  assert.equal(r.dir, "office"); assert.equal(r.mem.officeVisit, null); assert.equal(r.mem.officeSince, now);
  r = core.inferDirection(OFF, now + 4 * MIN, D, r.mem, sam);
  assert.equal(r.dir, "office", "4 min there: not yet");
  r = core.inferDirection(OFF, now + 5 * MIN, D, r.mem, sam);
  assert.equal(r.dir, "home"); assert.equal(r.mem.officeVisit, D); assert.deepEqual(r.mem.trip, { dir: "home", at: now + 5 * MIN });
  // Passing by doesn't count: leaving resets the clock.
  const away = core.inferDirection([51.5139 + 0.009, -0.0710], now + MIN, D, { ...morning, officeSince: now }, sam);
  assert.equal(away.mem.officeSince, null); assert.equal(away.mem.officeVisit, null, "1 km from the office isn't being there");
  assert.equal(core.inferDirection([51.5139 + 0.002, -0.0710], now, D, {}, sam).mem.officeSince, null, "220 m isn't at the office");
  assert.equal(core.inferDirection([51.5139 + 0.001, -0.0710], now, D, {}, sam).mem.officeSince, now, "110 m is"); 
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
  const two = { seen, deps: [{ line: "Met", t: T("17:01") }, { line: "Circle", t: T("17:03") }, { line: "Met", t: T("17:05") }] };
  assert.equal(core.whichTubeHome(two, T("17:10")).other.line, "Circle", "2 min apart: or");
  const apart = { seen, deps: [{ line: "Met", t: T("17:01") }, { line: "Circle", t: T("17:05") }] };
  assert.equal(core.whichTubeHome(apart, T("17:10")).other, undefined, "4 min apart: not or");
});

test("Nearly home, walks, in London to the office, the remembered train", () => {
  assert.equal(core.nearlyHome("home", "commute", [51.97, -0.23], false, sam), true);
  assert.equal(core.nearlyHome("home", "commute", [51.97, -0.23], true, sam), false);
  assert.equal(core.nearlyHome("office", "commute", [51.97, -0.23], false, sam), false);
  assert.equal(core.nearlyHome("home", "commute", [50.1, -1.1], false, testville), true);
  assert.equal(core.nearlyHome("home", "commute", [51.9533, -0.2635], false, sam), false, "Hitchin, 3.8 km out: not yet");
  const s = core.walkSecs([51.9799, -0.2290], [51.9752, -0.2402], "avg", sam), d = core.km([51.9799, -0.2290], [51.9752, -0.2402]);
  assert.ok(Math.abs(s - d * 1.3 / 5 * 3600) < 1e-6);
  assert.equal(core.inLondonToOffice("office", fix([51.52, -0.09]), null, false, false, sam), true);
  assert.equal(core.inLondonToOffice("office", fix([51.52, -0.09]), "ZFD", false, false, sam), false);
  assert.equal(core.inLondonToOffice("home", fix([51.52, -0.09]), null, false, false, sam), false);
  const t = toCity("07:50", T("07:50"), 20);
  assert.equal(core.lockedTrain({ a: { services: [t] } }, { operator: "Express Rail", std: "07:50", from: "RVS" }), t);
  assert.equal(core.lockedTrain({ a: { services: [t] } }, null), null);
});

test("trackLine: on a train only when moving along the line; near home only by the track at train speed; stays on while stopped", () => {
  const L = sam.lines.KGX, t0 = T("07:10");
  const at = (here, t, acc = 15) => ({ here, acc, at: t });
  const hatfield = [51.7638, -0.2156], welham = [51.7363, -0.2104];
  // Standing on Hatfield platform: on the line, not moving.
  let r = core.trackLine(null, at(hatfield, t0), 0, null, L);
  assert.equal(r.onLine, false); assert.equal(r.track.moving, false);
  r = core.trackLine(r.track, at(hatfield, t0 + 60e3), 0.3, null, L);
  assert.equal(r.onLine, false, "a minute later, still on the platform");
  // The phone reports train speed: on a train.
  assert.equal(core.trackLine(null, at(hatfield, t0), 20, null, L).onLine, true);
  // No speed from the phone: 3 km along the line in 3 min (60 km/h).
  r = core.trackLine(core.trackLine(null, at(hatfield, t0), null, null, L).track, at(welham, t0 + 180e3), null, null, L);
  assert.equal(r.onLine, true);
  // Stopped at a station later: still on the train.
  assert.equal(core.trackLine(r.track, at(welham, t0 + 300e3), 0, null, L).onLine, true);
  // Off the line: off the train.
  assert.equal(core.trackLine(r.track, at([51.75, -0.10], t0 + 400e3), 20, null, L).track, null);
  // Walking along the line (5 km/h): no.
  const walk1 = core.trackLine(null, at(hatfield, t0), null, null, L);
  assert.equal(core.trackLine(walk1.track, at([51.7600, -0.2150], t0 + 180e3), null, null, L).onLine, false);
});

test("trackLine near home: just past Letchworth towards Hitchin, only by the track at train speed", () => {
  const L = sam.lines.KGX, t0 = T("07:10"), at = (here, t) => ({ here, acc: 15, at: t });
  const towardsHitchin = [51.9700, -0.2420];                       // on the line between Letchworth and Hitchin
  assert.equal(core.trackLine(null, at(towardsHitchin, t0), 20, null, L).onLine, true, "train speed by the track");
  assert.equal(core.trackLine(null, at(towardsHitchin, t0), 8, null, L).onLine, false, "cycling speed isn't enough here");
  assert.equal(core.trackLine(null, at([51.9799, -0.2290], t0), 0, null, L).onLine, false, "on Letchworth platform");
  assert.equal(core.trackLine(null, at([51.9799, -0.2290], t0), 20, null, L).onLine, false, "at Letchworth station itself");
  assert.equal(core.trackLine(null, at([51.9650, -0.2560], t0), 20, null, L).onLine, false, "half a km off the track near home");
});

test("Missing GPS accuracy means unknown, not perfect", () => {
  assert.equal(core.hubHere({ here: [51.5308, -0.1238], acc: null, at: null }, sam), null);
  assert.equal(core.hubHere({ here: [51.5308, -0.1238], acc: undefined, at: null }, sam), null);
  assert.equal(core.onLine({ here: [51.7638, -0.2156], acc: null, at: null }, null, sam.lines.KGX), false);
});

test("The remembered train: by National Rail service ID when known, else operator, time and station; confidence", () => {
  const now = T("08:00"), here = [50.05, -1.05];
  const a = toCity("07:50", now - 10 * MIN, 20, "Express Rail", { serviceId: "SID1" });
  const boards = { "RVS-CEN": { msgs: [], services: [a, toCity("07:49", now - 11 * MIN, 22, "Metro Rail")] } };
  // A lock from an earlier board with a different time label but the same service: still found.
  const r = core.whichTrain(boards, here, "office", now, { operator: "Express Rail", std: "07:48", from: "RVS", serviceId: "SID1", picked: true }, () => null, testville, now);
  assert.equal(r.result.t, a); assert.equal(r.result.confidence, "high");
  assert.equal(core.lockedTrain(boards, { operator: "x", std: "x", from: "RVS", serviceId: "SID1" }), a);
  // Without an ID, by the fields; once the train has an ID it's remembered.
  const r2 = core.whichTrain(boards, here, "office", now, { operator: "Express Rail", std: "07:50", from: "RVS" }, () => null, testville, now);
  assert.equal(r2.result.t, a); assert.equal(r2.lock.serviceId, "SID1"); assert.equal(r2.result.confidence, "medium", "sure by timing alone");
  // A fresh, sure fit remembers the service ID.
  const clear = { "RVS-CEN": { msgs: [], services: [a] } };
  const r3 = core.whichTrain(clear, here, "office", now, null, () => null, testville, now);
  assert.deepEqual(r3.lock, { operator: "Express Rail", std: "07:50", from: "RVS", serviceId: "SID1" });
  // An old position: low confidence and no new lock.
  const r4 = core.whichTrain(clear, here, "office", now + 3 * MIN, null, () => null, testville, now);
  assert.equal(r4.result.stale, true); assert.equal(r4.result.confidence, "low"); assert.equal(r4.lock, null);
});

test("trackLine without phone speed: frequent fixes accumulate; a picked train counts; one rough fix changes nothing", () => {
  const L = sam.lines.KGX, t0 = T("07:30"), hat = [51.7638, -0.2156];
  // Every 5 s at about 70 km/h southwards, no speed from the phone: detected once 300 m+ is covered (within a minute).
  let tr = null, on = false, k = 0;
  for (k = 0; k < 12 && !on; k++) {
    const r = core.trackLine(tr, { here: [hat[0] - k * 0.00087, hat[1] + k * 0.0001], acc: 15, at: t0 + k * 5e3 }, null, null, L);
    tr = r.track; on = r.onLine;
  }
  assert.equal(on, true, "detected"); assert.ok(k <= 7, `after ${k} fixes`);
  // Standing still but you picked the train: on it.
  assert.equal(core.trackLine(null, { here: hat, acc: 15, at: t0 }, 0, null, L, true).onLine, true);
  // On the train, then one fix 800 m rough: unchanged; then a good fix stopped at a station: still on.
  const moving = core.trackLine(null, { here: hat, acc: 15, at: t0 }, 25, null, L);
  const rough = core.trackLine(moving.track, { here: [51.75, -0.19], acc: 800, at: t0 + 30e3 }, null, null, L);
  assert.equal(rough.onLine, true); assert.deepEqual(rough.track, moving.track);
  assert.equal(core.trackLine(rough.track, { here: [51.7363, -0.2104], acc: 15, at: t0 + 90e3 }, 0, null, L).onLine, true);
});

test("trackLine near home without phone speed: 500 m+ at 40+ km/h by the track", () => {
  const L = sam.lines.KGX, t0 = T("07:10");
  const a = [51.9710, -0.2400], b = [51.9670, -0.2470], c = [51.9640, -0.2520];   // along the line towards Hitchin
  const first = core.trackLine(null, { here: a, acc: 15, at: t0 }, null, null, L);
  assert.equal(first.onLine, false);
  const fast = core.trackLine(first.track, { here: c, acc: 15, at: t0 + 60e3 }, null, null, L);    // ~0.95 km in 60 s
  assert.equal(fast.onLine, true, "about 57 km/h by the track");
  const slow = core.trackLine(first.track, { here: c, acc: 15, at: t0 + 150e3 }, null, null, L);   // ~23 km/h
  assert.equal(slow.onLine, false, "cycling speed near home doesn't count");
  const short = core.trackLine(first.track, { here: b, acc: 15, at: t0 + 30e3 }, null, null, L);   // ~0.6 km? only if ≥ 0.5
  assert.equal(short.onLine, core.km(a, b) >= 0.5 && core.km(a, b) / (30 / 3600) >= 40);
});

test("whichTrain: a stale fix keeps the remembered train even when it no longer fits; an office arrival from yesterday is forgotten", () => {
  const now = T("08:00"), here = [50.05, -1.05];
  const t = toCity("07:20", now - 40 * MIN, 45);                  // by timing you'd be far past here
  const boards = { "RVS-CEN": { msgs: [], services: [t] } }, lock = { operator: "Express Rail", std: "07:20", from: "RVS" };
  const fresh = core.whichTrain(boards, here, "office", now, lock, () => null, testville, now);
  assert.ok(fresh.result.none || fresh.result.t !== t || !fresh.result.locked, "a fresh fix that doesn't fit lets go");
  const old = core.whichTrain(boards, here, "office", now, lock, () => null, testville, now - 4 * MIN);
  assert.equal(old.result.t, t); assert.equal(old.result.locked, true); assert.equal(old.result.stale, true);
  // Office arrival time from 17:55 yesterday, no fix since: arriving today starts the 5 minutes again.
  const OFF = [51.5139, -0.0710], today = T("08:30"), mem = { trip: { dir: "office", at: today - 3600e3 }, officeSince: today - (14 * 60 + 35) * MIN };
  const r = core.inferDirection(OFF, today, D, mem, sam);
  assert.equal(r.dir, "office"); assert.equal(r.mem.officeSince, today); assert.equal(r.mem.officeVisit, null);
});
