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
  const walkMs = 4 * MIN;
  const deps = [-31 / 60, -29 / 60, 0.4, 2, 5, 9].map((m, i) => ({ t: now + m * MIN, line: i % 2 ? "Met" : "Circle", vehicle: `v${i}` }));
  const leg = d => (d.t === now + 9 * MIN ? null : { stop: "Central", rideMs: 7 * MIN, tailMs: 30 * MIN });
  const plan = core.planConnection({ now, departures: deps, arrivedAt: null, walkMs, leg, max: Infinity });
  const rows = core.tubeStationBoard(deps, plan, now, walkMs, true);
  assert.deepEqual(rows.map(r => r.dep.vehicle), ["v1", "v2", "v3", "v4", "v5"], "left 31 s ago: gone; 29 s ago: still listed");
  assert.deepEqual(rows.map(r => r.reach), ["none", "none", "early", "walk", "walk"], "at the stop: one before you'd usually make it, only if you're near the platform");
  assert.deepEqual(core.tubeStationBoard(deps, plan, now, walkMs).map(r => r.reach), ["none", "none", "none", "walk", "walk"], "from anywhere else it's can't make it");
  assert.equal(rows[2].timed.leg.stop, "Central", "an early one keeps its connection");
  assert.equal(rows[3].timed.leg.stop, "Central"); assert.equal(rows[3].timed.arrive, now + 42 * MIN);
  assert.equal(rows[4].timed, null, "no connection: still listed");
  assert.deepEqual(rows.map(r => r.leaveBy), [null, null, null, now + 1 * MIN, now + 5 * MIN], "leave by = departure − the walk, only when you can make it");
  // Exactly when you'd reach the platform: you can make it.
  const edge = [{ t: plan.ready, line: "Circle", vehicle: "e" }];
  assert.equal(core.tubeStationBoard(edge, core.planConnection({ now, departures: edge, arrivedAt: null, walkMs, leg, max: Infinity }), now, walkMs)[0].reach, "walk");
});

test("railStationBoard: different trains at the same time stay apart; a real train beats its derived copy; other stations' trains and no-estimate reach stay out", () => {
  const gn = t({ std: "10:10", operator: "Express Rail", to: "CEN" });
  const tl = t({ std: "10:10", operator: "Metro Rail", to: "MKT" });
  const derived = t({ std: "10:20", dep: now + 20 * MIN, to: "MKT", derived: true, estimated: true });
  const real = t({ std: "10:20", dep: now + 20 * MIN, to: "CEN" });
  const stray = train({ from: "CEN", to: "RVS", std: "10:15", dep: now + 15 * MIN });
  const noEst = t({ std: "10:30", dep: now + 30 * MIN, depUnknown: true });
  const options = [option({ train: { ...noEst }, hub: "CEN", arrive: now + 70 * MIN })];
  const [g] = core.railStationBoard({ stops: [{ code: "RVS", name: "Riverside", kind: "rail" }],
    boards: { "RVS-MKT": { services: [tl, derived, stray], msgs: [] }, "RVS-CEN": { services: [gn, real, noEst], msgs: [] } }, options, now });
  assert.deepEqual(g.rows.map(r => `${r.train.std} ${r.train.operator}`).sort(), ["10:10 Express Rail", "10:10 Metro Rail", "10:20 Express Rail", "10:30 Express Rail"], "same time, different operators: two trains; another station's train on this board: left out");
  const r20 = g.rows.find(r => r.train.std === "10:20");
  assert.equal(r20.train.derived, undefined, "the real train, not the copy worked out from its stops");
  assert.deepEqual(r20.routes, ["MKT", "CEN"]);
  assert.equal(g.rows.find(r => r.train.std === "10:30").reach, "unknown", "no estimate: never a reach, even when an option matches");
});

test("railStationBoard: a train matched through another option's stop takes that stop's option; equal reach takes the earlier arrival", () => {
  const x = t({ std: "10:10", to: "CEN" });
  const atMkt = option({ train: { ...x, to: "MKT" }, hub: "MKT", arrive: now + 55 * MIN });
  const main = option({ train: train({ from: "CEN", to: "RVS", std: "09:00", dep: now + 5 * MIN }), hub: "CEN", arrive: now + 80 * MIN, alts: [atMkt] });
  const direct = option({ train: { ...x }, hub: "CEN", arrive: now + 50 * MIN });
  const stops = [{ code: "RVS", name: "Riverside", kind: "rail" }], boards = { "RVS-CEN": { services: [x], msgs: [] } };
  let [g] = core.railStationBoard({ stops, boards, options: [main], now });
  assert.equal(g.rows[0].option, atMkt, "Follow from this row follows this train, not the main option elsewhere");
  assert.equal(g.rows[0].arrive, now + 55 * MIN);
  [g] = core.railStationBoard({ stops, boards, options: [main, direct], now });
  assert.equal(g.rows[0].arrive, now + 50 * MIN, "both walk: the earlier arrival");
  assert.equal(g.rows[0].option, direct);
  [g] = core.railStationBoard({ stops, boards, options: [direct, main], now });
  assert.equal(g.rows[0].arrive, now + 50 * MIN, "whatever order the options come in");
});

test("railStationBoard: the best option's station comes first even when it boards there only as another stop", () => {
  const cen = train({ from: "CEN", to: "RVS", std: "10:10", dep: now + 10 * MIN }), mkt = train({ from: "MKT", to: "RVS", std: "10:05", dep: now + 5 * MIN });
  const stops = [{ code: "CEN", name: "Central", kind: "rail" }, { code: "MKT", name: "Market Street", kind: "rail" }];
  const best = option({ train: train({ from: "OTH", to: "RVS", std: "10:00", dep: now }), hub: "OTH", arrive: now + 30 * MIN, alts: [option({ train: { ...mkt }, hub: "MKT", arrive: now + 35 * MIN })] });
  assert.deepEqual(core.railStationBoard({ stops, boards: { "CEN-RVS": { services: [cen], msgs: [] }, "MKT-RVS": { services: [mkt], msgs: [] } }, options: [best], now }).map(g => g.stop.code), ["MKT", "CEN"]);
});

test("reachFlag: what each reach says on the board", () => {
  assert.deepEqual(["walk", "fast", "run", "car", "early", "none", "unknown"].map(r => core.reachFlag(r)), [
    { lvl: "ok", txt: "You can make it" }, { lvl: "warn", txt: "Fast walk" }, { lvl: "warn", txt: "Run" }, { lvl: "warn", txt: "Car needed" },
    { lvl: "warn", txt: "Only if you're near the platform" }, { lvl: "bad", txt: "Can't make it from here" }, { lvl: "info", txt: "Can't tell yet if you can make it" }]);
});
