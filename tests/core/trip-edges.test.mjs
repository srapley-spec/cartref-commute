// Engine: Trip mode edges the independent review (31 Oct night) found untested. Every threshold at its edge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { core, fixture, at, MIN } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const real = core.stationIndex(JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8")).stations);
const cfg = core.tripConfig(), now = at("2026-11-03", "10:00");
const S = (crs, lat, lon, sph = 2, o = {}) => ({ crs, name: o.name || crs, geo: [lat, lon], carPark: o.carPark || "unknown", servicePerHour: sph, ids: {} });
// Made-up stations (fixture data): a Kent-like village and a city a long way off.
const village = [51.23, 0.97], city = [51.50, -0.10];
const STN = [S("AAA", 51.24, 0.97), S("BBB", 51.25, 1.00), S("CCC", 51.26, 0.95), S("JUN", 51.30, 0.90, 6), S("BIG", 51.14, 0.87, 10),
  S("D1", 51.505, -0.10), S("D2", 51.51, -0.12), S("D3", 51.49, -0.08), S("D4", 51.53, -0.13, 10), S("D5", 51.46, -0.17, 8)];
const idx = core.stationIndex(STN), by = c => idx.byCrs(c);
const place = (id, geo, kind = "address") => ({ id, name: id, address: id, geo, kind });
const rideOf = (a, b, dep, mins, o = {}) => ({ kind: o.kind || "rail", from: by(a) || o.fromSt, to: by(b) || o.toSt, dep, arr: dep + mins * MIN, schedDep: dep, schedArr: dep + mins * MIN,
  live: { dep: false, arr: false }, label: o.label || "Train", operator: "Op", destination: o.dest, cancelled: !!o.cancelled,
  train: (o.kind || "rail") === "rail" ? { from: a, to: b, std: core.hhmm(dep), dep, arr: dep + mins * MIN, depLate: 0, arrLate: 0, depUnknown: false, platform: null, operator: "Op", cancelled: false, reason: "", destination: o.dest } : undefined });
/** A fake planner: one journey per search. `slow` stations add minutes; `via` changes at a station. Logs every call. */
function planner({ log = [], slow = {}, via = {}, none = new Set() } = {}) {
  return { name: "fake", plan: async (a, b, t, timeIs) => {
    log.push(`${a.crs}-${b.crs} ${timeIs} ${core.hhmm(t)}`);
    if (none.has(`${a.crs}-${b.crs}`)) return { journeys: [], refused: ["none"] };
    const mins = 60 + (slow[a.crs] || 0) + (slow[b.crs] || 0), dep = timeIs === "Arriving" ? t - mins * MIN - 5 * MIN : t + 10 * MIN;
    const v = via[`${a.crs}-${b.crs}`];
    const rides = v ? [rideOf(a.crs, v, dep, 20), rideOf(v, b.crs, dep + 25 * MIN, mins - 25)] : [rideOf(a.crs, b.crs, dep, mins, { fromSt: a, toSt: b })];
    return { journeys: [{ rides, source: "fake", notes: [] }], refused: [] };
  } };
}
const access = (nulls = new Set()) => ({ calls: [], async matrix(p, list, mode, t, dir) { this.calls.push({ mode, t, dir, n: list.length });
  return list.map(g => (nulls.has(g.join(",")) ? null : { metres: Math.round(core.km(p, g) * 1300), secs: Math.round(core.km(p, g) * 1300 / (mode === "drive" ? 9 : 1.4)) })); } });
const req = (o = {}) => ({ from: place("Village", village), to: place("City", city), modes: { from: "drive", to: "drive" }, question: { kind: "now", t: now }, now, leisureKmh: 4.5, cfg, ...o });

test("planTrip: 5 candidates at each end give 9 round-1 searches at once; never more than 18 (or the configured cap)", async () => {
  const log = [], stages = [];
  const r = await core.planTrip(req(), { stations: idx, access: access(), planner: planner({ log }) }, s => stages.push(log.length));
  assert.equal(r.candidates.from.length, 5); assert.equal(r.candidates.to.length, 5);
  assert.equal(stages[0], 9, "the first answer is drawn after round 1's 9 searches");
  assert.ok(r.requests.planner <= 18 && log.length === r.requests.planner, `${log.length}`);
  const log2 = [];
  const capped = await core.planTrip(req({ cfg: core.tripConfig({ totalMax: 11 }) }), { stations: idx, access: access(), planner: planner({ log: log2 }) });
  assert.ok(log2.length <= 11 && capped.requests.planner <= 11, `${log2.length}`);
});

test("planTrip: a station a journey changes at, within reach, is promoted and searched in round 2", async () => {
  const log = [];
  const c = core.tripConfig({ nearest: 1, wellServed: 0 });
  const r = await core.planTrip(req({ cfg: c, modes: { from: "drive", to: "walk" } }), { stations: idx, access: access(), planner: planner({ log, via: { "AAA-D1": "BIG" } }) });
  assert.ok(r.candidates.from.some(x => x.station.crs === "BIG" && x.why === "promoted"));
  assert.ok(log.some(l => l.startsWith("BIG-D1")), log.join("\n"));
});

test("planTrip: round 2 skips stations more than 30 min behind the best, and searches them when within", async () => {
  const run = async (behindMin, slowBy = 40) => { const log = [];
    await core.planTrip(req({ cfg: core.tripConfig({ nearest: 2, wellServed: 0, ...(behindMin == null ? {} : { behindMin }) }) }), { stations: idx, access: access(), planner: planner({ log, slow: { BBB: slowBy } }) });
    return log; };
  const tight = await run(undefined), loose = await run(60), within = await run(undefined, 20);   // default: 30 min
  assert.ok(!tight.some(l => l.startsWith("BBB-D2")), tight.join("\n"));
  assert.ok(loose.some(l => l.startsWith("BBB-D2")), loose.join("\n"));
  assert.ok(within.some(l => l.startsWith("BBB-D2")), "20 min behind is within 30: searched");
});

test("planTrip: Arrive by searches 'Arriving' at the time in round 1 and covers the 100 min before; Leave now searches on after the last", async () => {
  const T = at("2026-11-03", "14:00"), log = [];
  await core.planTrip(req({ question: { kind: "by", t: T }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: access(), planner: planner({ log }) });
  assert.equal(log[0], "AAA-D1 Arriving 14:00");
  assert.ok(log.some(l => l === "AAA-D1 Departing 12:20"), log.join("\n"));
  const log2 = [];
  await core.planTrip(req({ cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: access(), planner: planner({ log: log2 }) });
  assert.deepEqual(log2, ["AAA-D1 Departing 10:00", "AAA-D1 Departing 10:11"]);
});

test("planTrip: already at a station only from your current location; an address there still walks", async () => {
  const p = { stations: idx, access: access(), planner: planner() }, c = core.tripConfig({ nearest: 1, wellServed: 0 });
  const here = await core.planTrip(req({ from: place("current", by("AAA").geo, "current"), modes: { from: "walk", to: "walk" }, cfg: c }), p);
  assert.deepEqual(here.journeys[0].before.map(s => s.kind), ["station"]);
  const addr = await core.planTrip(req({ from: place("Next to AAA", by("AAA").geo), modes: { from: "walk", to: "walk" }, cfg: c }), p);
  assert.deepEqual(addr.journeys[0].before.map(s => s.kind), ["walk", "station"]);
});

test("planTrip: a station Google can't route to is shown, flagged and never picked (not dropped)", async () => {
  const r = await core.planTrip(req({ cfg: core.tripConfig({ nearest: 2, wellServed: 0 }) }), { stations: idx, access: access(new Set([by("AAA").geo.join(",")])), planner: planner() });
  const fromA = r.journeys.filter(j => j.fromStation.crs === "AAA");
  assert.ok(fromA.length >= 1);
  assert.ok(fromA.every(j => j.uncertain && !j.recommended && j.flags.some(f => /Google found no driving route to AAA/.test(f.txt))));
  assert.ok(r.picks.length && r.picks.every(j => j.fromStation.crs !== "AAA"));
});

test("planTrip: places sharing their nearest station are close enough without a train (any distance)", async () => {
  const one = core.stationIndex([S("ONE", 51.5, 0.5), S("TWO", 51.9, 0.9)]);
  const r = await core.planTrip(req({ from: place("A", [51.48, 0.5]), to: place("B", [51.52, 0.5]), modes: { from: "cycle", to: "cycle" } }), { stations: one, access: access(), planner: planner() });
  assert.equal(r.close, true);
});

test("planTrip: a drive is re-timed once for the best journey's set-off and arrival", async () => {
  const a = access();
  const r = await core.planTrip(req({ cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: a, planner: planner() });
  const best = r.picks[0];
  const again = a.calls.filter(c => c.mode === "drive").slice(-2);
  assert.ok(again.some(c => c.dir === "to" && Math.abs(c.t - best.leave) < 15 * MIN), JSON.stringify(a.calls));
  assert.ok(again.some(c => c.dir === "from" && Math.abs(c.t - best.arrive) < 15 * MIN));
});

test("Round 1 never pairs a station with itself", () => {
  const c = s => ({ station: S(s, 51, 0), km: 1, why: "nearest" });
  assert.deepEqual(core.roundOnePairs([c("X"), c("Y")], [c("X"), c("Z")], cfg).map(([a, b]) => `${a.crs}-${b.crs}`), ["X-Z", "Y-X"]);
});

// ---------- The change rule at its edges ----------
const R = (from, to, dep, arr, o = {}) => ({ kind: o.kind || "rail", from: S(from, 51, 0), to: S(to, 51, 0), dep, arr, schedDep: o.sDep ?? dep, schedArr: o.sArr ?? arr, live: o.live || { dep: true, arr: true }, label: "T", cancelled: !!o.cancelled });
test("Changes: a spare of 0 is at risk, not missed; exactly 5 against a longer planned change is fine", () => {
  const zero = core.changeStatus(R("A", "B", now, now + 20 * MIN, { sArr: now + 10 * MIN }), R("B", "C", now + 20 * MIN, now + 50 * MIN), [], cfg);
  assert.equal(zero.spare, 0); assert.equal(zero.missed, false); assert.equal(zero.text, "Connection at risk, 0 min");
  const five = core.changeStatus(R("A", "B", now, now + 13 * MIN, { sArr: now + 10 * MIN }), R("B", "C", now + 18 * MIN, now + 50 * MIN), [], cfg);
  assert.equal(five.spare, 5); assert.equal(five.plannedSpare, 8); assert.equal(five.level, "ok");
});
test("Changes: the planned change counts the Tube across, so an on-time 4-min cross-London change is not amber", () => {
  const tube = { ...R("B", "X", now + 12 * MIN, now + 30 * MIN), kind: "tube" };
  const c = core.changeStatus(R("A", "B", now, now + 10 * MIN), R("X", "C", now + 32 * MIN, now + 60 * MIN), [tube], cfg);
  assert.equal(c.spare, 4); assert.equal(c.plannedSpare, 4); assert.equal(c.level, "ok");
});
test("Changes: Not live names the end without live data: this train's arrival", () => {
  const c = core.changeStatus(R("A", "B", now, now + 10 * MIN, { live: { dep: true, arr: false } }), R("B", "C", now + 20 * MIN, now + 50 * MIN), [], cfg);
  assert.deepEqual(c.notLive, ["arr"]);
});

// ---------- Live budget and matching ----------
const J = (rides, o = {}) => core.buildJourney({ rides, source: "t", notes: [] }, null, null, { from: o.mode || "walk", to: "walk" }, [], [], cfg, now, o.extra || {});
const one = (a, b, inMin, o = {}) => J([rideOf(a, b, now + inMin * MIN, 30)], o);
test("Live budget: at most 6 boards; the followed trip's next two rides first, then the picks, then first rides within 30 min", () => {
  const followed = J([rideOf("AAA", "BBB", now + 5 * MIN, 10), rideOf("BBB", "CCC", now + 20 * MIN, 10), rideOf("CCC", "JUN", now + 40 * MIN, 10)]);
  const picks = [one("D1", "D2", 10), one("D2", "D3", 12)]; picks[0].recommended = 1; picks[1].recommended = 2;
  const rest = [one("D3", "D4", 14), one("D4", "D5", 16), one("D5", "D1", 30), one("D1", "D3", 31), one("D2", "D4", 18)];
  const b = core.liveBudget([...rest, ...picks], followed, now, cfg).map(x => x.key);
  assert.equal(b.length, 6);
  assert.deepEqual(b.slice(0, 4), ["AAA-BBB", "BBB-CCC", "D1-D2", "D2-D3"]);
  assert.ok(!b.includes("CCC-JUN"), "only the followed trip's next two rides");
  assert.ok(!b.includes("D1-D3"), "31 min away: no board");
  assert.ok(b.includes("D3-D4") && b.includes("D4-D5"));
});
test("Live budget: a ride already arrived gets no board; 30 min exactly still does", () => {
  const followed = J([rideOf("AAA", "BBB", now - 30 * MIN, 20), rideOf("BBB", "CCC", now + 5 * MIN, 10)]);
  const b = core.liveBudget([one("D5", "D1", 30)], followed, now, cfg).map(x => x.key);
  assert.deepEqual(b, ["BBB-CCC", "D5-D1"]);
});
const svc = (std, dep, arr, o = {}) => ({ from: "X", to: "Y", std, dep, arr, depLate: 0, arrLate: 0, depUnknown: !!o.depUnknown, arrUnknown: !!o.arrUnknown, platform: "2", operator: "Op", cancelled: false, reason: "", destination: o.destination });
test("Live: an arrival with no estimate keeps the timetable and says Not live; a board that disappears makes the ride Not live again", () => {
  const j = one("AAA", "BBB", 10), r = j.rides[0];
  const a = core.applyLive(j, { "AAA-BBB": { services: [svc(core.hhmm(r.schedDep), r.dep + 2 * MIN, r.arr + 5 * MIN, { arrUnknown: true })], msgs: [] } }, cfg);
  assert.equal(a.rides[0].live.dep, true); assert.equal(a.rides[0].live.arr, false); assert.equal(a.rides[0].arr, r.arr);
  const gone = core.applyLive(a, {}, cfg);
  assert.deepEqual(gone.rides[0].live, { dep: false, arr: false });
});
test("Live: the 'Nearest station is N km away' flag survives live times", () => {
  const j = J([rideOf("AAA", "BBB", now + 10 * MIN, 30)], { extra: { farKm: { from: 7.8 } } });
  assert.ok(core.applyLive(j, {}, cfg).flags.some(f => f.txt === "Nearest station is 7.8 km away"));
});

// ---------- Ranking ----------
test("Ranking: arriving exactly on time isn't late; Late by rounds down (1 min 30 s late is 1 min)", () => {
  const T = now + 60 * MIN;
  const js = [one("AAA", "BBB", 30), one("AAA", "BBB", 31.5), one("AAA", "BBB", 32.5)];
  core.rankTrips(js, { kind: "by", t: T }, now, cfg);
  assert.equal(js[0].late, false);
  assert.ok(js[1].flags.some(f => f.txt === "Late by 1 min")); assert.ok(js[2].flags.some(f => f.txt === "Late by 2 min"));
});
test("Ranking: every journey in leaving order; one whose leave time has passed is listed but never picked", () => {
  const early = one("AAA", "BBB", -5), a = one("AAA", "BBB", 20), b = J([rideOf("AAA", "BBB", now + 10 * MIN, 60)]);
  const out = core.rankTrips([a, early, b], { kind: "now", t: now }, now, cfg);
  assert.deepEqual(out.map(j => core.hhmm(j.leave)), ["09:55", "10:10", "10:20"]);
  assert.ok(!early.recommended && early.flags.some(f => f.txt === "Leave time passed"));
});
test("Other stations: at most 4, uncertain or missed journeys skipped; a better option needs the default 5 min", () => {
  assert.equal(cfg.betterMin, 5); assert.equal(cfg.otherStationsMax, 4);
  const mk = (f, arr, o = {}) => ({ id: f + arr, fromStation: S(f, 51, 0), toStation: S("Z", 51, 0), leave: now, arrive: now + arr * MIN, flags: [], ...o });
  const best = mk("A", 60);
  const list = [best, mk("B", 61), mk("C", 62), mk("D", 63), mk("E", 64), mk("F", 65), mk("G", 50, { uncertain: true }), mk("H", 50, { missed: true })];
  const o = core.otherStations(list, best, cfg.otherStationsMax);
  assert.deepEqual(o.map(x => x.crs), ["B", "C", "D", "E"]);
});

// ---------- Follow ----------
const trip = () => J([rideOf("AAA", "BBB", now + 20 * MIN, 20), rideOf("BBB", "CCC", now + 45 * MIN, 30), rideOf("CCC", "JUN", now + 80 * MIN, 30)]);
test("Follow: a broken trip is offered any reachable alternative; one whose leave time has passed never", () => {
  const j = trip(), f = core.startFollowTrip(j, now);
  const broken = { ...j, missed: true };
  const later = { ...one("D1", "D2", 30), id: "later", arrive: j.arrive + 10 * MIN };
  assert.equal(core.updateFollowTrip(f, { now, current: broken, options: [later] }).alternative.id, "later");
  const passed = { ...later, id: "passed", leave: now - MIN };
  assert.equal(core.updateFollowTrip(f, { now, current: broken, options: [passed] }).alternative, null);
});
test("Follow: an answer about a later ride wins over the clock", () => {
  const j = trip();
  assert.deepEqual(core.tripPhase(j, j.rides[0].dep + MIN), { phase: "ride", ride: 0 });
  assert.deepEqual(core.tripPhase(j, j.rides[0].dep + MIN, [2]), { phase: "change", ride: 2 });
});
test("Follow: 5 min later is amber, 4 is not, 15 is red; a cancellation is announced once", () => {
  const j = trip(), f = core.startFollowTrip(j, now);
  const shift = m => ({ ...j, arrive: j.arrive + m * MIN });
  assert.equal(core.updateFollowTrip(f, { now, current: shift(4) }).level, "ok");
  assert.equal(core.updateFollowTrip(f, { now, current: shift(5) }).level, "warn");
  assert.equal(core.updateFollowTrip(f, { now, current: shift(15) }).level, "bad");
  const cancelled = { ...j, rides: j.rides.map((r, i) => i === 1 ? { ...r, cancelled: true } : r) };
  const u1 = core.updateFollowTrip(f, { now, current: cancelled });
  assert.match(u1.notice.text, /cancelled/);
  assert.notEqual(core.updateFollowTrip(u1.route, { now, current: cancelled }).notice?.kind, "cancelled");
});
test("Follow: restore drops a saved trip with a broken ride, bad lists or times", () => {
  const f = JSON.parse(JSON.stringify(core.startFollowTrip(trip(), now)));
  const bad = (mut) => { const x = JSON.parse(JSON.stringify(f)); mut(x); return core.restoreFollowTrip(x); };
  assert.ok(core.restoreFollowTrip(f));
  assert.equal(bad(x => { x.journey.rides[0].from = null; }), null);
  assert.equal(bad(x => { x.notices = "x"; }), null);
  assert.equal(bad(x => { x.expectedArrival = null; }), null);
  assert.equal(bad(x => { x.confirmed = [-1]; }), null);
  assert.equal(bad(x => { x.journey.before = [{ kind: "walk" }]; }), null);
});

// ---------- TfL parsing ----------
const btnCbw = () => JSON.parse(JSON.stringify(fixture("trip/tfl-brighton-canterburywest.json").body));
const parse = body => core.tflRailJourneys(body, real.byCrs("BTN"), real.byCrs("CBW"), real, cfg.endMatchM);
test("TfL: a leading walk is dropped too; a coach is a bus ride, flagged", () => {
  const body = btnCbw(), j = body.journeys[0], first = j.legs[0];
  j.legs.unshift({ ...first, mode: { id: "walking" }, instruction: { summary: "Walk to Brighton" }, arrivalTime: first.departureTime, arrivalPoint: first.departurePoint });
  j.legs[2] = { ...j.legs[2], mode: { id: "coach" } };
  const r = parse(body).journeys[0];
  assert.equal(r.rides[0].kind, "rail"); assert.equal(r.rides[1].kind, "bus");
  const built = J(r.rides);
  assert.ok(built.flags.some(f => /^Bus between Lewes and Hampden Park/.test(f.txt)), JSON.stringify(built.flags));
});
test("TfL: an end without a naptan ID is matched by its ICS code; one 500 m off with neither is refused", () => {
  const body = btnCbw(), l = body.journeys[0].legs[0];
  l.departurePoint = { ...l.departurePoint, naptanId: undefined, lat: l.departurePoint.lat + 0.1 };
  assert.equal(parse(body).journeys.length, 3);
  const b2 = btnCbw(), l2 = b2.journeys[0].legs[0];
  l2.departurePoint = { ...l2.departurePoint, naptanId: undefined, icsCode: "999", lat: l2.departurePoint.lat + 0.0045 };
  const r = parse(b2);
  assert.equal(r.journeys.length, 2); assert.match(r.refused[0], /different place/);
});
test("Flags: driving to a station with no car park, or one not known; walking says neither", () => {
  const ride = rideOf("AAA", "BBB", now + 10 * MIN, 30);
  const flags = (carPark, mode) => core.journeyFlags({ rides: [{ ...ride, from: { ...ride.from, carPark } }], changes: [], tomorrow: false, fromStation: { ...ride.from, carPark }, toStation: ride.to, modes: { from: mode, to: "walk" } }).map(f => f.txt);
  assert.ok(flags("no", "drive").includes("No station car park"));
  assert.ok(flags("unknown", "drive").includes("Car park not known"));
  assert.deepEqual(flags("no", "walk").filter(t => /car park/i.test(t)), []);
  assert.deepEqual(flags("yes", "drive").filter(t => /car park/i.test(t)), []);
});
test("Flags: a later day says Tomorrow only when it is the next day; otherwise the date", () => {
  const d3 = J([rideOf("AAA", "BBB", now + 3 * 86400e3, 30)]);
  assert.ok(d3.flags.some(f => f.txt === "Fri 6 Nov") && !d3.flags.some(f => /Tomorrow/.test(f.txt)), JSON.stringify(d3.flags));
  const d1 = J([rideOf("AAA", "BBB", now + 86400e3, 30)]);
  assert.ok(d1.flags.some(f => f.txt === "Tomorrow · Wed 4 Nov"));
  const askedTomorrow = J([rideOf("AAA", "BBB", now + 86400e3, 30)], { extra: { day: now + 86400e3 } });
  assert.equal(askedTomorrow.tomorrow, false);
});

test("Trip defaults are the story's numbers (docs/stories/leisure-journeys.md)", () => {
  const d = core.TRIP_DEFAULTS;
  assert.deepEqual(d.reachKm, { walk: 3, cycle: 10, drive: 25 });
  assert.deepEqual([d.nearest, d.wellServed, d.wellServedFactor], [3, 2, 2]);
  assert.deepEqual([d.round1Max, d.totalMax, d.behindMin, d.laterPairs, d.windowMin], [9, 18, 30, 3, 100]);
  assert.deepEqual([d.closeKm, d.atStationM, d.endMatchM, d.replanMovedM], [1.5, 400, 300, 500]);
  assert.deepEqual(d.change, { riskMin: 2, tightMin: 5 });
  assert.deepEqual(d.live, { maxBoards: 6, firstWithinMin: 30, boardWindowMin: 119, refreshMs: 30e3 });
  assert.deepEqual([d.betterMin, d.otherStationsMax, d.topWindowMin], [5, 4, 20]);
  assert.deepEqual(d.drive, { recheckMs: 5 * 60e3, withinMin: 60, moveMin: 2 });
  assert.deepEqual(d.allow, { parkMin: 10, lockMin: 4, stationMin: 3, exitMin: 3, carBackMin: 5 });
});

// ---------- Re-review survivors (31 Oct night, of 7e4a1ad) ----------
test("Follow: restore checks each part of a saved trip on its own", () => {
  const f = JSON.parse(JSON.stringify(core.startFollowTrip(trip(), now)));
  const bad = (mut) => { const x = JSON.parse(JSON.stringify(f)); mut(x); return core.restoreFollowTrip(x); };
  assert.equal(bad(x => { x.journey.rides[1].to.name = 7; }), null, "a station without a name");
  assert.equal(bad(x => { x.journey.changes = {}; }), null, "changes not a list");
  assert.equal(bad(x => { x.journey.flags = "x"; }), null, "flags not a list");
  assert.equal(bad(x => { delete x.journey.rides[0].schedDep; }), null, "no timetabled departure");
  assert.equal(bad(x => { delete x.journey.rides[2].schedArr; }), null, "no timetabled arrival");
  assert.equal(bad(x => { delete x.journey.rides[0].live; }), null, "no live marker");
  assert.equal(bad(x => { x.journey.fromStation = null; }), null, "no first station");
  assert.equal(bad(x => { x.journey.toStation = { name: "X" }; }), null, "a last station without a code");
  assert.equal(bad(x => { x.journey.modes = null; }), null, "no ways to and from the station");
});
test("Live budget: a pick whose first ride has already arrived gets no board", () => {
  const done = one("D1", "D2", -60); done.recommended = 1;
  const next = one("D3", "D4", 10); next.recommended = 2;
  assert.deepEqual(core.liveBudget([done, next], null, now, cfg).map(x => x.key), ["D3-D4"]);
});
test("planTrip: asking about a later day flags nothing as Tomorrow on that day", async () => {
  const T = at("2026-11-06", "09:00");
  const r = await core.planTrip(req({ question: { kind: "at", t: T }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: access(), planner: planner() });
  assert.ok(r.journeys.length && r.journeys.every(j => !j.tomorrow && !j.flags.some(f => /Tomorrow|Nov/.test(f.txt))), JSON.stringify(r.journeys.map(j => j.flags)));
});
test("Station reach: a station just inside the reach is a candidate, just outside is not", () => {
  const edge = core.stationIndex([S("IN", 51.23 + 2.99 / 111.2, 0.97), S("OUT", 51.23 - 3.01 / 111.2, 0.97), S("FAR", 51.40, 0.97)]);
  const c = core.candidates(village, "walk", edge, cfg);
  assert.deepEqual(c.list.map(x => `${x.station.crs}:${x.why}`), ["IN:nearest"]); assert.equal(c.farKm, undefined);
});
test("Rounds at once: a refusal in round 1 stops round 2 for every item, with the reason", async () => {
  const sent = [];
  const res = await core.runRounds(["a", "b"], [k => 1, k => 2], async (k, q) => { sent.push(`${k}${q}`); if (k === "a") throw Object.assign(new Error("refused"), { refused: true }); }, { concurrency: 2 });
  assert.deepEqual(sent.sort(), ["a1", "b1"]);
  assert.equal(res.stopped, "refused"); assert.equal(res.why.get("b"), "refused");
  const capped = []; await core.runRounds(["a", "b", "c"], [() => 1], async (k) => { capped.push(k); }, { concurrency: 3, maxRequests: 2 });
  assert.equal(capped.length, 2);
});
test("planTrip: no route from the last station is flagged too; a journey to a station never timed is not shown", async () => {
  const r = await core.planTrip(req({ cfg: core.tripConfig({ nearest: 2, wellServed: 0 }) }), { stations: idx, access: access(new Set([by("D1").geo.join(",")])), planner: planner() });
  assert.ok(r.journeys.some(j => j.toStation.crs === "D1" && j.uncertain && j.flags.some(f => /Google found no driving route from D1/.test(f.txt))));
  const odd = { name: "odd", plan: async (a, b, t) => ({ journeys: [{ rides: [rideOf(a.crs, "D5", t + 10 * MIN, 60)], source: "x", notes: [] }], refused: [] }) };
  // Walking at the To end: D5 (about 6.6 km from the city) is beyond reach, so it is neither a candidate nor promoted.
  const r2 = await core.planTrip(req({ modes: { from: "drive", to: "walk" }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: access(), planner: odd }).catch(e => e);
  assert.ok(!(r2 instanceof Error) && r2.journeys.length === 0, "a journey ending at D5 isn't timed or shown");
});
test("planTrip: sharing a station that isn't the nearest at both ends is not 'close enough'", async () => {
  const two = core.stationIndex([S("ONE", 51.50, 0.40), S("MID", 51.50, 0.45), S("TWO", 51.50, 0.50)]);
  const r = await core.planTrip(req({ from: place("A", [51.50, 0.395]), to: place("B", [51.50, 0.505]), modes: { from: "drive", to: "drive" } }), { stations: two, access: access(), planner: planner() });
  assert.equal(r.close, false);
});
test("planTrip: a drive for Arrive by is first timed 2 h before; walking is timed once per end (never re-timed)", async () => {
  const T = at("2026-11-03", "14:00"), a = access();
  await core.planTrip(req({ question: { kind: "by", t: T }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: a, planner: planner() });
  assert.equal(a.calls[0].t, T - 2 * 3600e3);
  const w = access();
  const r = await core.planTrip(req({ modes: { from: "walk", to: "walk" }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: w, planner: planner() });
  assert.equal(w.calls.length, 2); assert.equal(r.requests.access, 2);
});
test("Days count by the local calendar in summer time too (23:30 to 00:30 in July is the next day)", () => {
  const ride = rideOf("AAA", "BBB", at("2026-07-02", "00:30"), 30);
  const j = core.buildJourney({ rides: [ride], source: "t", notes: [] }, null, null, { from: "walk", to: "walk" }, [], [], cfg, at("2026-07-01", "23:30"));
  assert.equal(j.tomorrow, true); assert.ok(j.flags.some(f => /^Tomorrow · Thu 2 Jul/.test(f.txt)), JSON.stringify(j.flags));
});

test("planTrip: walking to the station and driving from it re-times only the drive (3 requests, not 4)", async () => {
  const a = access();
  const r = await core.planTrip(req({ modes: { from: "walk", to: "drive" }, question: { kind: "at", t: now + 3600e3 }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: a, planner: planner() });
  assert.ok(r.picks.length, "a journey is chosen, so its drive is re-timed");
  assert.deepEqual(a.calls.map(c => `${c.mode}:${c.dir}`), ["walk:to", "drive:from", "drive:from"]);
});

test("planTrip: driving to the station and walking from it re-times only the drive (the far end keeps its walking time)", async () => {
  const a = access();
  const r = await core.planTrip(req({ modes: { from: "drive", to: "walk" }, question: { kind: "at", t: now + 3600e3 }, cfg: core.tripConfig({ nearest: 1, wellServed: 0 }) }), { stations: idx, access: a, planner: planner() });
  assert.ok(r.picks.length);
  assert.deepEqual(a.calls.map(c => `${c.mode}:${c.dir}`), ["drive:to", "walk:from", "drive:to"]);
  assert.ok(r.journeys.every(j => j.after.some(s => s.kind === "walk")), "the way from the station is still a walk");
});
