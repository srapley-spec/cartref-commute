// Starting from the nearest station instead of home (31 Oct 2026: a demo somewhere in Hitchin).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, sleep, closeAll, json, NEAR_LETCHWORTH } from "./harness.mjs";
import * as C from "../dist/core.mjs";

after(closeAll);

const P = C.profiles.samCommute;
const HITCHIN_STATION = P.stationGeo.HIT;
// Hitchin market place: about 1.2 km from the station in a straight line.
const IN_HITCHIN = { coords: { latitude: 51.9490, longitude: -0.2790, accuracy: 20 } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Values from the page are jsdom-realm objects: compare as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/darwin-hit-2026-10-31T1130Z.json", import.meta.url)));

test("Start station: the nearest station you can start from, within 10 km; none in London", () => {
  assert.equal(C.nearestStartStation([51.9490, -0.2790], P).code, "HIT");
  assert.equal(C.nearestStartStation([51.975, -0.23], P).code, "LET");
  assert.equal(C.nearestStartStation([51.515, -0.08], P), null);
  // 10 km is the limit: 0.085° of latitude south of Hitchin station is ~9.5 km, 0.095° ~10.6 km.
  assert.equal(C.nearestStartStation([HITCHIN_STATION[0] - 0.085, HITCHIN_STATION[1]], P).code, "HIT");
  assert.equal(C.nearestStartStation([HITCHIN_STATION[0] - 0.095, HITCHIN_STATION[1]], P), null);
  assert.deepEqual(C.startStationChoices(P).map(c => c.code), ["LET", "HIT"]);
});

test("Start station: Hitchin's profile has trains from Hitchin and the line from Hitchin; home and unknown codes leave it unchanged", () => {
  const h = C.profileFromStation(P, "HIT");
  assert.equal(h.home, "HIT");
  assert.equal(h.stationNames.HIT, "Hitchin");
  assert.deepEqual(h.places.homeStation, HITCHIN_STATION);
  assert.equal(h.coords.HIT, `${HITCHIN_STATION[0]},${HITCHIN_STATION[1]}`);
  assert.equal(h.busy.from, "HIT");
  for (const hub of ["KGX", "STP", "ZFD"]) {
    assert.deepEqual(h.lines[hub][0], HITCHIN_STATION);
    assert.deepEqual(h.lines[hub].at(-1), P.lines[hub].at(-1));
    assert.equal(h.lines[hub].length, P.lines[hub].length - 1, "Letchworth's point is dropped, Hitchin's replaces it");
  }
  // Stopping thresholds are shared (live 31 Oct: Hitchin → King's Cross stopping 49 min ≥ 45).
  assert.deepEqual(h.stoppingMin, P.stoppingMin);
  assert.equal(C.profileFromStation(P, "LET"), P);
  assert.equal(C.profileFromStation(P, "XYZ"), P);
  assert.equal(C.profileFromStation(P, null), P);
  assert.equal(P.home, "LET", "the original profile is not changed");
});

test("Start station: routes from Hitchin set off from where you are and come back to Hitchin, never Cartref", () => {
  const timings = { walkHomeStationAvg: 1337, walkHomeStationFast: 1086, walkStationHomeAvg: 1332, walkStationHomeFast: 1111, letEntry: 120, letExit: 90, catchMargin: 60,
    kxInterchange: 400, farInterchange: 240, tubeWait: 180, rideKxAld: 600, rideFarAld: 420, aldPlatform: 90, aldWalk: 420, rideKxAde: 660, rideFarAde: 480,
    adePlatform: 112, adeWalk: 283, stpInterchange: 420, fastFactor: 0.82, leisureFactor: 1.15 };
  const start = { code: "HIT", name: "Hitchin", away: true };
  const out = C.samRoutes({ dir: "office", mode: "commute", pace: "avg", timings, start, here: { walkToStation: 1000, atHub: null, atHome: false } });
  assert.deepEqual(out.map(r => r.board), ["HIT-KGX", "HIT-STP", "HIT-ZFD"]);
  for (const r of out) {
    assert.equal(r.fromName, "Hitchin");
    assert.equal(r.startsAtHome, false);
    assert.equal(r.before[0].secs, 1000);
    assert.match(r.before[0].step.note, /walk to Hitchin station/);
    assert.doesNotMatch(JSON.stringify(r), /Cartref|Letchworth/);
  }
  // No location yet: still "set off", never "Leave Cartref".
  const noFix = C.samRoutes({ dir: "office", mode: "commute", pace: "avg", timings, start });
  assert.equal(noFix[0].before[0].step.d, "Set off from where you are");
  assert.equal(noFix[0].startsAtHome, false);
  const back = C.samRoutes({ dir: "home", mode: "commute", pace: "avg", timings, start });
  assert.deepEqual(back.map(r => r.board), ["KGX-HIT", "STP-HIT", "ZFD-HIT"]);
  for (const r of back) {
    assert.equal(r.arriveLabel, "Arrive Hitchin");
    assert.equal(r.after.at(-1).step.d, "Arrive Hitchin");
    assert.ok(!r.after.some(s => s.kind === "walk"), "no walk to Cartref at the end");
  }
  // Leisure both ways too.
  const lo = C.samRoutes({ dir: "office", mode: "leisure", pace: "avg", timings, start });
  assert.deepEqual(lo.map(r => r.board), ["HIT-KGX", "HIT-STP"]);
  assert.equal(lo[0].startsAtHome, false);
  const lh = C.samRoutes({ dir: "home", mode: "leisure", pace: "avg", timings, start });
  assert.deepEqual(lh.map(r => r.board), ["KGX-HIT", "STP-HIT", "ZFD-HIT"]);
  // Without a start: Letchworth and Cartref, as before.
  const home = C.samRoutes({ dir: "office", mode: "commute", pace: "avg", timings });
  assert.equal(home[0].board, "LET-KGX");
  assert.equal(home[0].before[0].step.d, "Leave Cartref");
});

test("At home the header offers 'Start from the nearest station'; in Hitchin it chooses Hitchin for today and reloads", async () => {
  const app = await createApp({ settings: { provider: "demo" }, geo: IN_HITCHIN });
  let reloads = 0; app.w.__commuteReload = () => { reloads++; };
  assert.equal(app.text("#startRow"), "Not at home? Start from the nearest station");
  assert.equal(app.text("#routeLabel"), "Cartref → 20 Mansfield Street");
  app.d.querySelector('[data-start="nearest"]').click();
  assert.deepEqual(plain(app.c.state.saved.startFrom), { code: "HIT", day: today() });
  assert.deepEqual(JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).startFrom, { code: "HIT", day: today() });
  assert.equal(reloads, 1);
  app.close();
});

test("Without a location, or with none near, the header lets you pick the station instead", async () => {
  const app = await createApp({ settings: { provider: "demo" }, geo: null });
  let reloads = 0; app.w.__commuteReload = () => { reloads++; };
  app.d.querySelector('[data-start="nearest"]').click();
  assert.equal(app.text("#startRow"), "Your location isn't known yet. Start from: Letchworth · Hitchin · Cancel");
  assert.equal(reloads, 0);
  assert.equal(app.c.state.saved.startFrom, undefined);
  app.d.querySelector('[data-start="cancel"]').click();
  assert.equal(app.text("#startRow"), "Not at home? Start from the nearest station");
  app.d.querySelector('[data-start="nearest"]').click();
  app.d.querySelector('[data-start="HIT"]').click();
  assert.deepEqual(plain(app.c.state.saved.startFrom), { code: "HIT", day: today() });
  assert.equal(reloads, 1);
  app.close();
  const london = await createApp({ settings: { provider: "demo" }, geo: { coords: { latitude: 51.515, longitude: -0.08, accuracy: 30 } } });
  london.w.__commuteReload = () => {};
  london.d.querySelector('[data-start="nearest"]').click();
  assert.match(london.text("#startRow"), /^No station within 10 km that the app can start from\. Start from: Letchworth · Hitchin/);
  assert.equal(london.c.state.saved.startFrom, undefined);
  london.close();
});

test("Starting from Hitchin: trains from Hitchin, the walk from where you are, and 'Back to home' clears it", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "auto", startFrom: { code: "HIT", day: today() } }, geo: IN_HITCHIN });
  let reloads = 0; app.w.__commuteReload = () => { reloads++; };
  const c = app.c;
  assert.equal(app.text("#routeLabel"), "Near Hitchin → 20 Mansfield Street");
  assert.equal(app.text("#startRow"), "Starting from Hitchin today, walking from where you are · Back to home");
  assert.equal(c.direction(), "office");
  assert.deepEqual(plain(c.boardKeys()), ["HIT-KGX", "HIT-ZFD"]);
  // The walk: straight line × 1.3 at 5 km/h from where you are, even though the saved home is in Letchworth.
  const d = c.km([51.9490, -0.2790], HITCHIN_STATION), walk = c.walkFromHere();
  assert.ok(Math.abs(walk - d * 1.3 / 5 * 3600) < 1, `${walk}`);
  assert.ok(walk > 15 * 60 && walk < 21 * 60, `about 18 min: ${walk}`);
  assert.equal(c.onWay().walk, walk);
  assert.equal(c.atHome(), false);
  const hero = app.text("#hero");
  assert.match(hero, /^On your way to Hitchin/);
  assert.doesNotMatch(hero, /Cartref|Letchworth/);
  const best = c.ranked(Date.now()).find(o => o.recommended === 1);
  assert.equal(best.train.from, "HIT");
  // Fast pace: the same walk at 6 km/h.
  c.state.saved.pace = "fast"; c.render();
  assert.ok(Math.abs(c.walkFromHere() - d * 1.3 / 6 * 3600) < 1);
  app.d.querySelector('[data-start="home"]').click();
  assert.equal(c.state.saved.startFrom, undefined);
  assert.equal(JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).startFrom, undefined);
  assert.equal(reloads, 1);
  app.close();
});

test("Starting from Hitchin: live boards are requested from Hitchin, and real Hitchin trains are planned (31 Oct recording)", async () => {
  const now = Date.parse(FIXTURE.recorded);
  const RDM = { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120" };
  const day = (() => { const x = new Date(now); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();
  const route = (u) => {
    const m = /GetDepBoardWithDetails\/(\w+)\?.*filterCrs=(\w+)/.exec(u);
    if (m) return json(FIXTURE.boards[`${m[1]}-${m[2]}`] || { trainServices: [] });
    return undefined;
  };
  const app = await createApp({ now, settings: RDM, saved: { dirMode: "office", startFrom: { code: "HIT", day } }, geo: IN_HITCHIN, route, settle: 800 });
  const boards = app.calls.filter(u => /GetDepBoardWithDetails/.test(u));
  assert.ok(boards.length > 0);
  assert.ok(boards.every(u => /GetDepBoardWithDetails\/HIT\?/.test(u)), boards.join("\n"));
  assert.ok(!app.calls.some(u => /\/LET\?|LET&|filterCrs=LET/.test(u)));
  const opts = app.c.ranked(now);
  assert.ok(opts.length > 0);
  assert.ok(opts.every(o => o.train.from === "HIT"));
  // The 11:41 Thameslink (Peterborough) to St Pancras, 33 min: not a stopping train. The stopping 11:33 Great
  // Northern to King's Cross, on time, is 49 min: flagged as stopping, never hidden. (The 11:33 was 13 min late and
  // expected to make up time, 44 min: the rule uses expected times, as at Letchworth.)
  const stp = opts.find(o => o.train.std === "11:41" && o.hub !== "KGX");
  assert.ok(stp && !app.c.isStopping(stp.train), "11:41 Thameslink is not stopping");
  const kgx = Object.values(app.c.state.boards).flatMap(b => b.services).find(t => t.std === "12:33" && t.to === "KGX");
  assert.ok(kgx && app.c.isStopping(kgx), "12:33 Great Northern is stopping");
  assert.match(app.text("#hero"), /^On your way to Hitchin/);
  app.close();
});

test("Starting from a station is for today only; an unknown station is ignored", async () => {
  const old = await createApp({ settings: { provider: "demo" }, saved: { startFrom: { code: "HIT", day: "2026-10-31" } }, geo: NEAR_LETCHWORTH });
  assert.equal(old.text("#routeLabel"), "Cartref → 20 Mansfield Street");
  assert.deepEqual(plain(old.c.boardKeys()), ["LET-KGX", "LET-ZFD"]);
  assert.equal(old.text("#startRow"), "Not at home? Start from the nearest station");
  old.close();
  const bad = await createApp({ settings: { provider: "demo" }, saved: { startFrom: { code: "XYZ", day: today() } }, geo: NEAR_LETCHWORTH });
  assert.deepEqual(plain(bad.c.boardKeys()), ["LET-KGX", "LET-ZFD"]);
  assert.equal(bad.text("#startRow"), "Not at home? Start from the nearest station");
  bad.close();
});

test("Starting from Hitchin works in the Signal design too: the header line stays visible", async () => {
  const app = await createApp({ settings: { provider: "demo", signal: true }, saved: { startFrom: { code: "HIT", day: today() } }, geo: IN_HITCHIN });
  const row = app.d.querySelector("#startRow");
  for (let n = row; n; n = n.parentElement) assert.ok(!n.hidden && !(n.tagName === "DETAILS" && !n.open), "not hidden or folded");
  assert.equal(app.text("#startRow"), "Starting from Hitchin today, walking from where you are · Back to home");
  assert.match(app.text("#routeLabel"), /Near Hitchin/);
  app.close();
});
