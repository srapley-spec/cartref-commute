import { test } from "node:test";
import assert from "node:assert/strict";
import { core, train, option, MIN } from "./helpers.mjs";

// Testville (helpers.mjs): Riverside (home) ⇄ Central or Market Street. Nothing here is Letchworth.
const now = 1793700000000;
const route = (o) => ({ hub: "CEN", board: "RVS-CEN", fromName: "Riverside", before: [], after: [], arriveLabel: "Arrive Central", ...o });
const t = (o) => train({ from: "RVS", to: "CEN", dep: now + 10 * MIN, arr: now + 40 * MIN, ...o });

test("nextStops: each route's first boarding point, once each, in route order", () => {
  // Out: every route boards the train at home's station.
  assert.deepEqual(core.nextStops([route(), route({ hub: "MKT", board: "RVS-MKT" })]),
    [{ code: "RVS", name: "Riverside", kind: "rail" }]);
  // Back from the office: a tube first (the route says so), not the city station.
  const tube = { code: "OFT", name: "Office Tube", kind: "tube" };
  assert.deepEqual(core.nextStops([route({ board: "CEN-RVS", fromName: "Central", firstStop: tube }), route({ hub: "MKT", board: "MKT-RVS", fromName: "Market Street", firstStop: tube })]), [tube]);
  // Several city stations with no tube first: each one, in route order.
  assert.deepEqual(core.nextStops([route({ hub: "MKT", board: "MKT-RVS", fromName: "Market Street" }), route({ board: "CEN-RVS", fromName: "Central" })]).map(s => s.code), ["MKT", "CEN"]);
  assert.deepEqual(core.nextStops([]), []);
});

test("nextStops (Sam's routes): Letchworth to work; Aldgate from the office, Aldgate East when Circle and Met are closed; the station you're at", () => {
  const timings = { walkHomeStationAvg: 900, walkHomeStationFast: 720, walkStationHomeAvg: 900, walkStationHomeFast: 720, letEntry: 60, letExit: 60, catchMargin: 60,
    kxInterchange: 300, farInterchange: 240, tubeWait: 180, rideKxAld: 600, rideFarAld: 420, aldPlatform: 120, aldWalk: 300,
    rideKxAde: 720, rideFarAde: 540, adePlatform: 120, adeWalk: 360, stpInterchange: 360, fastFactor: 0.85, leisureFactor: 1.2 };
  const stops = (o) => core.nextStops(core.samRoutes({ mode: "commute", pace: "avg", timings, ...o }));
  assert.deepEqual(stops({ dir: "office" }), [{ code: "LET", name: "Letchworth", kind: "rail" }]);
  assert.deepEqual(stops({ dir: "home" }), [{ code: "ALD", name: "Aldgate", kind: "tube" }]);
  assert.deepEqual(stops({ dir: "home", tubeFallback: true }), [{ code: "ADE", name: "Aldgate East", kind: "tube" }]);
  assert.deepEqual(stops({ dir: "home", here: { walkToStation: null, atHub: "KGX" } }).map(s => s.code), ["KGX", "STP", "ZFD"]);
  assert.deepEqual(stops({ dir: "home", mode: "leisure" }).map(s => s.code), ["KGX", "STP", "ZFD"]);
});

test("railStationBoard: every train from the station once, in departure order, departed ones gone, cancelled and no-estimate kept", () => {
  const a = t({ std: "10:20", dep: now + 20 * MIN });
  const b = t({ std: "10:10", dep: now + 10 * MIN, to: "CEN", operator: "Metro Rail" });
  const bAlso = { ...b, to: "MKT", arr: now + 45 * MIN };                         // the same train on the other board
  const gone = t({ std: "09:59", dep: now - 31e3 });
  const justGoing = t({ std: "10:00", dep: now - 29e3 });
  const cancelled = t({ std: "10:30", dep: now + 30 * MIN, cancelled: true });
  const noEstimate = t({ std: "09:50", dep: now - 10 * MIN, depUnknown: true });
  const elsewhere = train({ from: "CEN", to: "RVS", std: "10:05", dep: now + 5 * MIN, arr: now + 35 * MIN });
  const boards = { "RVS-CEN": { services: [a, b, gone, justGoing, cancelled, noEstimate], msgs: [] }, "RVS-MKT": { services: [bAlso], msgs: [] }, "CEN-RVS": { services: [elsewhere], msgs: [] } };
  const [g, ...rest] = core.railStationBoard({ stops: [{ code: "RVS", name: "Riverside", kind: "rail" }], boards, options: [], now });
  assert.equal(rest.length, 0);
  assert.equal(g.stop.code, "RVS");
  assert.deepEqual(g.rows.map(r => r.train.std), ["09:50", "10:00", "10:10", "10:20", "10:30"]);
  assert.deepEqual(g.rows.find(r => r.train.std === "10:10").routes, ["CEN", "MKT"], "one row, both routes");
  assert.equal(g.rows.find(r => r.train.std === "10:30").reach, null, "cancelled: nothing to make");
  assert.equal(g.rows.find(r => r.train.std === "09:50").reach, "unknown", "no estimate: nobody can say");
  assert.equal(g.rows.find(r => r.train.std === "10:20").reach, "unknown", "no plan covers it");
});

test("railStationBoard: reach and arrival come from the plan from where you are; the easiest way wins; missed is can't make it", () => {
  const a = t({ std: "10:10", dep: now + 10 * MIN }), b = t({ std: "10:20", dep: now + 20 * MIN }), c = t({ std: "10:30", dep: now + 30 * MIN });
  const d = t({ std: "10:40", dep: now + 40 * MIN, to: "MKT" });
  const options = [
    option({ train: { ...b }, hub: "CEN", arrive: now + 60 * MIN, effort: "run" }),
    option({ train: { ...b, to: "MKT" }, hub: "MKT", arrive: now + 70 * MIN, effort: "fast" }),
    option({ train: { ...a }, hub: "CEN", arrive: now + 50 * MIN, missed: true }),
    option({ train: { ...c }, hub: "CEN", arrive: now + 80 * MIN }),
    // The same train as another option's stop (Market Street), listed under its alts.
    option({ train: train({ from: "CEN", to: "RVS", std: "11:00", dep: now + 60 * MIN }), hub: "CEN", arrive: now + 99 * MIN, alts: [option({ train: { ...d }, hub: "MKT", arrive: now + 90 * MIN })] }),
  ];
  const [g] = core.railStationBoard({ stops: [{ code: "RVS", name: "Riverside", kind: "rail" }], boards: { "RVS-CEN": { services: [a, b, c], msgs: [] }, "RVS-MKT": { services: [d], msgs: [] } }, options, now });
  const row = std => g.rows.find(r => r.train.std === std);
  assert.equal(row("10:10").reach, "none");
  assert.equal(row("10:20").reach, "fast", "fast walk beats a run");
  assert.equal(row("10:20").arrive, now + 70 * MIN);
  assert.equal(row("10:30").reach, "walk", "an option without effort levels you can make is a walk");
  assert.equal(row("10:30").arrive, now + 80 * MIN);
  assert.equal(row("10:40").reach, "walk"); assert.equal(row("10:40").arrive, now + 90 * MIN);
  assert.equal(row("10:30").option, options[3]);
});

test("railStationBoard: several stations are grouped, the best option's station first", () => {
  const cen = train({ from: "CEN", to: "RVS", std: "10:10", dep: now + 10 * MIN }), mkt = train({ from: "MKT", to: "RVS", std: "10:05", dep: now + 5 * MIN });
  const stops = [{ code: "CEN", name: "Central", kind: "rail" }, { code: "MKT", name: "Market Street", kind: "rail" }, { code: "OFT", name: "Office Tube", kind: "tube" }];
  const boards = { "CEN-RVS": { services: [cen], msgs: [] }, "MKT-RVS": { services: [mkt], msgs: [] } };
  assert.deepEqual(core.railStationBoard({ stops, boards, options: [], now }).map(g => g.stop.code), ["CEN", "MKT"], "route order without a plan; tubes aren't rail");
  const best = option({ train: { ...mkt }, hub: "MKT", arrive: now + 40 * MIN });
  assert.deepEqual(core.railStationBoard({ stops, boards, options: [best], now }).map(g => g.stop.code), ["MKT", "CEN"]);
  const empty = core.railStationBoard({ stops, boards: {}, options: [], now });
  assert.deepEqual(empty.map(g => [g.stop.code, g.rows.length]), [["CEN", 0], ["MKT", 0]], "a station with nothing listed still shows");
});

test("tubeStationBoard: every departure still to come, what each connects to, and whether you can make it (early only at the stop)", () => {
  const deps = [-1, 0.4, 2, 5, 9].map((m, i) => ({ t: now + m * MIN, line: i % 2 ? "Met" : "Circle", vehicle: `v${i}` }));
  const leg = d => (d.t === now + 9 * MIN ? null : { stop: "Central", rideMs: 7 * MIN, tailMs: 30 * MIN });
  const plan = core.planConnection({ now, departures: deps, arrivedAt: null, walkMs: 4 * MIN, leg, max: Infinity });
  const rows = core.tubeStationBoard(deps, plan, now, true);
  assert.deepEqual(rows.map(r => r.dep.vehicle), ["v1", "v2", "v3", "v4"], "left over 30 s ago: gone");
  assert.deepEqual(rows.map(r => r.reach), ["none", "early", "walk", "walk"], "at the stop: one before you'd usually make it, only if you're near the platform");
  assert.deepEqual(core.tubeStationBoard(deps, plan, now).map(r => r.reach), ["none", "none", "walk", "walk"], "from anywhere else it's can't make it");
  assert.equal(rows[2].timed.leg.stop, "Central"); assert.equal(rows[2].timed.arrive, now + 42 * MIN);
  assert.equal(rows[3].timed, null, "no connection: still listed");
  assert.equal(rows[0].timed, null);
});

test("reachFlag: what each reach says on the board", () => {
  assert.deepEqual(["walk", "fast", "run", "car", "early", "none", "unknown"].map(r => core.reachFlag(r)), [
    { lvl: "ok", txt: "You can make it" }, { lvl: "warn", txt: "Fast walk" }, { lvl: "warn", txt: "Run" }, { lvl: "warn", txt: "Car needed" },
    { lvl: "warn", txt: "Only if you're near the platform" }, { lvl: "bad", txt: "Can't make it from here" }, { lvl: "info", txt: "Can't tell yet if you can make it" }]);
});
