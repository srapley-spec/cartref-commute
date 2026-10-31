// Engine: Trip mode (docs/stories/leisure-journeys.md). Thresholds pinned at their edges; TfL from recorded replies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { core, fixture, at, MIN } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));
const idx = core.stationIndex(data.stations);
const cfg = core.tripConfig();
const st = (crs) => idx.byCrs(crs);
const now = at("2026-11-03", "10:00");

// Made-up stations around a made-up village (fixture data, not measured): three small stations close by, a junction
// and a busy main-line station further out. Pins the candidate rule without depending on measured service levels.
const S = (crs, name, lat, lon, sph) => ({ crs, name, geo: [lat, lon], carPark: "unknown", servicePerHour: sph, ids: {} });
const village = [51.23, 0.97];
const kent = core.stationIndex([S("AAA", "Alpha", 51.24, 0.97, 2), S("BBB", "Bravo", 51.25, 1.00, 2), S("CCC", "Charlie", 51.26, 0.95, 2),
  S("JUN", "Junction", 51.30, 0.90, 6), S("BIG", "Big International", 51.14, 0.87, 10), S("FAR", "Far Away", 52.20, 0.10, 12)]);

test("Region: London, the South East and the East of England; Letchworth and Brighton in, Birmingham out", () => {
  assert.equal(core.inRegion(st("LET").geo, cfg.region), true);
  assert.equal(core.inRegion(st("BTN").geo, cfg.region), true);
  assert.equal(core.inRegion([52.48, -1.90], cfg.region), true);   // inside the box's west edge
  assert.equal(core.inRegion([52.48, -1.96], cfg.region), false);
  assert.equal(core.inRegion([52.76, 0.5], cfg.region), false);
  assert.match(core.OUTSIDE_REGION, /London, the South East and the East of England/);
});

test("Allowances: defaults 10 / 4 / 3 / 3 / 5 min; Settings clamp to 0–60", () => {
  assert.deepEqual(cfg.allow, { parkMin: 10, lockMin: 4, stationMin: 3, exitMin: 3, carBackMin: 5 });
  const c = core.tripConfig({ allow: { parkMin: 90, lockMin: -2, stationMin: "x" } });
  assert.equal(c.allow.parkMin, 60); assert.equal(c.allow.lockMin, 0); assert.equal(c.allow.stationMin, 3);
});

test("Station candidates: 3 nearest within reach plus up to 2 well-served (≥ 2× the best nearby); driving finds the main line", () => {
  const drive = core.candidates(village, "drive", kent, cfg).list.map(c => `${c.station.crs}:${c.why}`);
  assert.deepEqual(drive, ["AAA:nearest", "BBB:nearest", "CCC:nearest", "BIG:served", "JUN:served"]);
  const walk = core.candidates(village, "walk", kent, cfg);
  assert.deepEqual(walk.list.map(c => c.station.crs), ["AAA"]);   // only one within 3 km
  // Well-served needs at least twice the best nearby: 4 per hour nearby makes 6 not enough.
  const busier = core.stationIndex([S("AAA", "Alpha", 51.24, 0.97, 4), S("JUN", "Junction", 51.30, 0.90, 7.9), S("BIG", "Big", 51.14, 0.87, 8)]);
  assert.deepEqual(core.candidates(village, "drive", busier, { ...cfg, nearest: 1 }).list.map(c => c.station.crs), ["AAA", "BIG"]);
});

test("Station candidates: reach is 3 / 10 / 25 km; none within reach gives the nearest, flagged with its distance", () => {
  assert.deepEqual(cfg.reachKm, { walk: 3, cycle: 10, drive: 25 });
  const lonely = core.stationIndex([S("FAR", "Far Away", 51.30, 0.97, 3)]);   // 7.8 km north
  const w = core.candidates(village, "walk", lonely, cfg);
  assert.equal(w.list[0].why, "fallback"); assert.ok(w.farKm > 7 && w.farKm < 8.5);
  assert.equal(core.candidates(village, "cycle", lonely, cfg).list[0].why, "nearest");
});

test("Station candidates: a station a journey changes at, within reach, is promoted from live planner data", () => {
  const list = core.candidates(village, "drive", kent, { ...cfg, wellServed: 0 }).list;
  const p = core.promote(village, "drive", list, [kent.byCrs("BIG"), kent.byCrs("AAA"), kent.byCrs("FAR")], cfg);
  assert.deepEqual(p.map(c => `${c.station.crs}:${c.why}`), ["BIG:promoted"]);   // FAR is beyond 25 km; AAA already in
});

test("Round 1 searches: nearest From × every To, every From × nearest To, at most 9", () => {
  const c = (crs) => ({ station: S(crs, crs, 51, 0, 1), km: 1, why: "nearest" });
  const pairs = core.roundOnePairs(["F1", "F2", "F3", "F4", "F5"].map(c), ["T1", "T2", "T3", "T4", "T5"].map(c), cfg);
  assert.equal(pairs.length, 9);
  assert.deepEqual(pairs.map(([a, b]) => `${a.crs}-${b.crs}`), ["F1-T1", "F1-T2", "F1-T3", "F1-T4", "F1-T5", "F2-T1", "F3-T1", "F4-T1", "F5-T1"]);
});

// One rule for changes, planned and live (story "Changes").
const ride = (from, to, dep, arr, o = {}) => ({ kind: "rail", from: S(from, from, 51, 0, 1), to: S(to, to, 51, 0, 1), dep, arr,
  schedDep: o.sDep ?? dep, schedArr: o.sArr ?? arr, live: o.live || { dep: true, arr: true }, label: "Train", cancelled: !!o.cancelled });
const change = (arrIn, depOut, o = {}) => core.changeStatus(ride("A", "B", now, now + arrIn), ride("B", "C", now + depOut, now + depOut + 30 * MIN, o.next || {}), o.via || [], cfg);

test("Changes: under 2 min red at risk; under 5 and below the planned change amber; a planner's own short change neutral", () => {
  assert.equal(change(10 * MIN, 15 * MIN).level, "ok");                                    // 5 min
  const four = change(10 * MIN, 14 * MIN); assert.equal(four.level, "ok"); assert.equal(four.text, "Change 4 min");   // planned 4: not eaten into
  const eaten = core.changeStatus(ride("A", "B", now, now + 13 * MIN, { sArr: now + 10 * MIN }), ride("B", "C", now + 17 * MIN, now + 47 * MIN), [], cfg);
  assert.equal(eaten.level, "warn"); assert.equal(eaten.text, "Tight change, 4 min");
  const two = core.changeStatus(ride("A", "B", now, now + 15 * MIN, { sArr: now + 10 * MIN }), ride("B", "C", now + 17 * MIN, now + 47 * MIN), [], cfg);
  assert.equal(two.level, "warn"); assert.equal(two.spare, 2);
  const one = core.changeStatus(ride("A", "B", now, now + 16 * MIN, { sArr: now + 10 * MIN }), ride("B", "C", now + 17 * MIN, now + 47 * MIN), [], cfg);
  assert.equal(one.level, "bad"); assert.equal(one.text, "Connection at risk, 1 min"); assert.equal(one.missed, false);
});

test("Changes: whole minutes rounded down; a negative spare is missed; a cancelled next train is missed", () => {
  assert.equal(change(10 * MIN, 14.9 * MIN).spare, 4);
  const late = core.changeStatus(ride("A", "B", now, now + 22 * MIN, { sArr: now + 10 * MIN }), ride("B", "C", now + 17 * MIN, now + 47 * MIN), [], cfg);
  assert.equal(late.level, "bad"); assert.equal(late.missed, true); assert.match(late.text, /Connection missed/);
  const gone = change(10 * MIN, 20 * MIN, { next: { cancelled: true } });
  assert.equal(gone.missed, true); assert.match(gone.text, /cancelled/);
});

test("Changes: one live side still counts (12 min late against a 7-min change is red); the other end says Not live", () => {
  const c = core.changeStatus(ride("A", "B", now, now + 22 * MIN, { sArr: now + 10 * MIN, live: { dep: true, arr: true } }),
    ride("B", "C", now + 17 * MIN, now + 47 * MIN, { live: { dep: false, arr: false } }), [], cfg);
  assert.equal(c.level, "bad"); assert.deepEqual(c.notLive, ["dep"]);
});

test("Changes: a Tube ride across London is taken off the spare", () => {
  const tube = { ...ride("B", "X", now + 12 * MIN, now + 30 * MIN), kind: "tube" };
  const c = core.changeStatus(ride("A", "B", now, now + 10 * MIN), ride("X", "C", now + 35 * MIN, now + 60 * MIN), [tube], cfg);
  assert.equal(c.spare, 7); assert.match(c.at, /B → X/);
});

test("TfL journeys: Brighton → Canterbury West from a recorded reply; TfL's walk out of the station dropped; three changes", () => {
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  const r = core.tflRailJourneys(body, st("BTN"), st("CBW"), idx, cfg.endMatchM);
  assert.equal(r.journeys.length, 3); assert.deepEqual(r.refused, []);
  const j = r.journeys[0];
  assert.deepEqual(j.rides.map(x => `${x.kind}:${x.from.crs}-${x.to.crs}`), ["rail:BTN-LWS", "rail:LWS-HMD", "rail:HMD-AFK", "rail:AFK-CBW"]);
  assert.ok(j.notes.some(n => /Dropped TfL's walk/.test(n)));
  assert.equal(j.rides[0].label, "Southern to Seaford"); assert.equal(j.rides[0].train.std, "10:06");
  const changes = core.journeyChanges(j.rides, cfg);
  assert.deepEqual(changes.map(c => `${c.at} ${c.spare} ${c.level}`), ["Lewes 4 ok", "Hampden Park 7 ok", "Ashford International 10 ok"]);
});

test("TfL journeys: ends are checked; a reply for other stations is refused, not shown as the asked trip", () => {
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  const r = core.tflRailJourneys(body, st("BTN"), st("CBE"), idx, cfg.endMatchM);
  assert.equal(r.journeys.length, 0); assert.match(r.refused[0], /TfL matched a different place/);
});

test("TfL journeys: a 23:00 search returns tomorrow's first trains, flagged Tomorrow with the date", () => {
  const body = fixture("trip/tfl-brighton-canterburywest-2300.json").body;
  const late = at("2026-11-03", "23:00");
  const r = core.tflRailJourneys(body, st("BTN"), st("CBW"), idx, cfg.endMatchM);
  const seg = [{ kind: "walk", secs: 600, step: null }];
  const j = core.buildJourney(r.journeys[0], null, null, { from: "walk", to: "walk" }, seg, seg, cfg, late);
  assert.equal(j.tomorrow, true); assert.ok(j.flags.some(f => /^Tomorrow · Wed 4 Nov/.test(f.txt)), JSON.stringify(j.flags));
});

test("Recorded fixtures and station data hold no keys", () => {
  const files = [path.join(ROOT, "data/stations.json"), ...readdirSync(path.join(ROOT, "tests/fixtures/trip")).map(f => path.join(ROOT, "tests/fixtures/trip", f))];
  for (const f of files) { const t = readFileSync(f, "utf8"); assert.doesNotMatch(t, /app_key=(?!REMOVED)|x-apikey|[?&]key=/i, f); }
});

test("Access: walking is Google's distance at your leisure pace plus 3 min to the platform; driving adds 10 min to park", () => {
  const w = core.beforeSegments("walk", { metres: 1500, secs: 999 }, st("BTN"), cfg.allow, 4.5);
  assert.deepEqual(w.map(s => [s.kind, s.secs]), [["walk", 1200], ["station", 180]]);
  const d = core.beforeSegments("drive", { metres: 9000, secs: 840 }, st("BTN"), cfg.allow, 4.5);
  assert.deepEqual(d.map(s => [s.kind, s.secs]), [["drive", 840], ["station", 600]]);
  const c = core.beforeSegments("cycle", { metres: 4000, secs: 900 }, st("BTN"), cfg.allow, 4.5);
  assert.deepEqual(c.map(s => s.secs), [900, 240]);
  const here = core.beforeSegments("walk", { metres: 0, secs: 0 }, st("BTN"), cfg.allow, 4.5, true);
  assert.deepEqual(here.map(s => s.secs), [180]);
  const off = core.afterSegments("drive", { metres: 9000, secs: 840 }, st("CBW"), cfg.allow, 4.5);
  assert.deepEqual(off.map(s => [s.kind, s.secs]), [["station", 300], ["drive", 840]]);
});

test("Journey times come from the segments and rides: leave = first train − the way there; arrive = last train + the way on", () => {
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  const rj = core.tflRailJourneys(body, st("BTN"), st("CBW"), idx, cfg.endMatchM).journeys[0];
  const before = core.beforeSegments("walk", { metres: 1500, secs: 0 }, st("BTN"), cfg.allow, 4.5);
  const after = core.afterSegments("walk", { metres: 750, secs: 0 }, st("CBW"), cfg.allow, 4.5);
  const j = core.buildJourney(rj, null, null, { from: "walk", to: "walk" }, before, after, cfg, now);
  assert.equal(core.hhmm(j.leave), "09:43");   // 10:06 − 20 min walk − 3 min
  assert.equal(core.hhmm(j.arrive), "12:47");  // 12:34 + 3 min out + 10 min walk
  const steps = core.journeySteps(j);
  assert.equal(steps[0].d, "Walk to Brighton"); assert.equal(core.hhmm(steps[0].t), "09:43");
  assert.ok(steps.some(s => s.d === "Change at Lewes · 4 min"));
  assert.equal(steps[steps.length - 1].d, "Walk to your destination"); assert.equal(core.hhmm(steps[steps.length - 1].t), "12:47");
});

// planTrip through fixture ports: a planner that answers from the recorded Brighton → Canterbury West reply.
function ports({ log = [], fail = {}, delay = 0 } = {}) {
  const done = new Set(); let n = 0;
  const call = async (name, fn) => { const id = `${name}#${n++}`; log.push({ id, after: [...done] }); if (delay) await new Promise(r => setTimeout(r, delay)); try { return await fn(); } finally { done.add(id); } };
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  return {
    stations: idx,
    access: { matrix: (place, list, mode, at, dir) => call(`matrix:${dir}`, async () => list.map(g => ({ metres: Math.round(core.km(place, g) * 1300), secs: Math.round(core.km(place, g) * 1300 / (mode === "drive" ? 9 : mode === "cycle" ? 4.5 : 1.4)) }))) },
    planner: { name: "fixture", plan: (a, b, t, timeIs) => call(`plan:${a.crs}-${b.crs}`, async () => {
      if (fail[`${a.crs}-${b.crs}`]) throw Object.assign(new Error(fail[`${a.crs}-${b.crs}`].msg), fail[`${a.crs}-${b.crs}`]);
      const r = core.tflRailJourneys(body, idx.byCrs("BTN"), idx.byCrs("CBW"), idx, cfg.endMatchM);
      if (a.crs !== "BTN" || b.crs !== "CBW") return { journeys: [], refused: ["No journeys in the fixture"] };
      return t > at("2026-11-03", "11:00") ? { journeys: [], refused: [] } : r; }) },
  };
}
const place = (name, geo, kind = "address") => ({ id: name, name, address: name, geo, kind });
const brighton = place("Brighton Station Approach", [50.8294, -0.1412]), canterbury = place("Canterbury Cathedral", [51.2798, 1.0828]);

test("planTrip: plans door to door, picks by the top-card rule and lists every journey in leaving order", async () => {
  const r = await core.planTrip({ from: brighton, to: canterbury, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg }, ports());
  assert.equal(r.stage, "complete");
  assert.equal(r.journeys.length, 3);
  assert.deepEqual(r.journeys.map(j => core.hhmm(j.rides[0].schedDep)), ["10:06", "10:28", "11:06"]);
  assert.equal(r.picks[0].recommended, 1); assert.equal(core.hhmm(r.picks[0].rides[0].schedDep), "10:06");
  assert.ok(r.requests.planner <= cfg.totalMax);
});

test("planTrip: first answer after at most 2 steps one after another (round 1 alongside the station times)", async () => {
  const log = [];
  const stages = [];
  await core.planTrip({ from: brighton, to: canterbury, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg }, ports({ log }), s => stages.push({ stage: s.stage, calls: log.length }));
  const firstStageCalls = log.slice(0, stages[0].calls);
  // Every call before the first answer started with nothing completed: one step (the place fetch is the other).
  assert.ok(firstStageCalls.every(c => c.after.length === 0), JSON.stringify(firstStageCalls));
  assert.ok(firstStageCalls.some(c => c.id.startsWith("plan:")) && firstStageCalls.some(c => c.id.startsWith("matrix:to")) && firstStageCalls.some(c => c.id.startsWith("matrix:from")));
});

test("planTrip: one station pair failing still plans the others; a refusal is reported with the pair", async () => {
  const r = await core.planTrip({ from: brighton, to: canterbury, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg },
    ports({ fail: { "BTN-CBE": { msg: "TfL refused (HTTP 429)", rateLimited: true } } }));
  assert.ok(r.journeys.length >= 1);
  assert.ok(r.failed.some(f => /Brighton → Canterbury East/.test(f.pair) && /429/.test(f.why)), JSON.stringify(r.failed));
});

test("planTrip: a place outside the region is refused with the region named; places within 1.5 km say no train needed", async () => {
  await assert.rejects(core.planTrip({ from: place("Birmingham", [52.48, -1.99]), to: canterbury, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg }, ports()),
    /Outside the area this plans/);
  const near = place("Near the cathedral", [51.2850, 1.0800]);
  const r = await core.planTrip({ from: canterbury, to: near, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg }, ports()).catch(e => e);
  assert.ok(r instanceof Error ? true : r.close === true);
});

test("Ranking: Arrive by flags late journeys with whole minutes; the pick is the latest leave that arrives in time", () => {
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  const rjs = core.tflRailJourneys(body, st("BTN"), st("CBW"), idx, cfg.endMatchM).journeys;
  const seg = [{ kind: "walk", secs: 0, step: null }];
  const js = rjs.map(rj => core.buildJourney(rj, null, null, { from: "walk", to: "walk" }, seg, seg, cfg, now));
  const out = core.rankTrips(js, { kind: "by", t: at("2026-11-03", "13:30") }, now, cfg);
  const late = out.filter(j => j.late);
  assert.equal(late.length, 1); assert.ok(late[0].flags.some(f => f.txt === "Late by 4 min"));   // the 11:06 reaches Canterbury West 13:34 (TfL's own walk dropped)
  assert.equal(core.hhmm(out.find(j => j.recommended === 1).rides[0].schedDep), "10:28");
});

test("Other stations: each other station's best journey with what it costs; a better option needs 5 min", () => {
  const mk = (from, to, leave, arrive) => ({ id: `${from}${to}${leave}`, fromStation: S(from, from, 51, 0, 1), toStation: S(to, to, 51, 0, 1), leave, arrive, flags: [] });
  const best = mk("AAA", "ZZZ", now, now + 60 * MIN);
  const o = core.otherStations([best, mk("BIG", "ZZZ", now - 9 * MIN, now + 48 * MIN), mk("AAA", "YYY", now, now + 72 * MIN)], best, 4);
  assert.deepEqual(o.map(x => x.text), ["From BIG: arrive 12 min sooner, leave 9 min earlier", "To YYY: arrive 12 min later"]);
  assert.equal(core.betterOption(best, mk("BIG", "ZZZ", now, now + 55 * MIN), 5), true);
  assert.equal(core.betterOption(best, mk("BIG", "ZZZ", now, now + 56 * MIN), 5), false);
});
