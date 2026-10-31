// Starting from the nearest station instead of home (31 Oct 2026: a demo somewhere in Hitchin, then in Fairfield,
// between Arlesey and Letchworth).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, sleep, closeAll, json, iso, IN_LONDON, NEAR_LETCHWORTH } from "./harness.mjs";
import * as C from "../dist/core.mjs";

after(closeAll);

const P = C.profiles.samCommute;
const HITCHIN_STATION = P.stationGeo.HIT;
// Hitchin market place: about 1.2 km from the station in a straight line.
const IN_HITCHIN = { coords: { latitude: 51.9490, longitude: -0.2790, accuracy: 20 } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Values from the page are jsdom-realm objects: compare as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const HIT_TODAY = () => ({ code: "HIT", day: today() });
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/darwin-hit-2026-10-31T1130Z.json", import.meta.url)));
const ARL_FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/darwin-arl-2026-10-31.json", import.meta.url)));
const ARLESEY_STATION = [52.0260, -0.2663];   // TfL 910GARLSEY
// Around Fairfield (approximate, not geocoded): ~2.5 km from Arlesey station, ~3.2 km from Letchworth station.
const FAIRFIELD = [52.0065, -0.2480], IN_FAIRFIELD = { coords: { latitude: FAIRFIELD[0], longitude: FAIRFIELD[1], accuracy: 20 } };
const dayOf = (t) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const replay = (fx) => (u) => {
  const m = /GetDepBoardWithDetails\/(\w+)\?.*filterCrs=(\w+)/.exec(u);
  if (m) return json(fx.boards[`${m[1]}-${m[2]}`] || { trainServices: [] });
  return undefined;
};

test("Start station: the nearest station you can start from, within 10 km; none in London", () => {
  assert.equal(C.nearestStartStation([51.9490, -0.2790], P).code, "HIT");
  assert.equal(C.nearestStartStation([51.975, -0.23], P).code, "LET");
  assert.equal(C.nearestStartStation([51.515, -0.08], P), null);
  // 10 km is the limit: 0.085° of latitude south of Hitchin station is ~9.5 km, 0.095° ~10.6 km.
  assert.equal(C.nearestStartStation([HITCHIN_STATION[0] - 0.085, HITCHIN_STATION[1]], P).code, "HIT");
  assert.equal(C.nearestStartStation([HITCHIN_STATION[0] - 0.095, HITCHIN_STATION[1]], P), null);
  assert.deepEqual(C.startStationChoices(P).map(c => c.code), ["LET", "HIT", "ARL"]);
  // Fairfield: Arlesey is nearer than Letchworth; both are listed, nearest first. Nearer Letchworth, Letchworth.
  assert.equal(C.nearestStartStation(FAIRFIELD, P).code, "ARL");
  assert.deepEqual(C.startStationsNear(FAIRFIELD, P).map(s => s.code), ["ARL", "LET", "HIT"]);
  assert.equal(C.nearestStartStation([51.995, -0.235], P).code, "LET");
});

test("Start station: Arlesey's profile joins the line at Hitchin; the home station stays a choice while away", () => {
  const a = C.profileFromStation(P, "ARL");
  assert.equal(a.home, "ARL");
  assert.deepEqual(a.places.homeStation, ARLESEY_STATION);
  assert.deepEqual(a.stationGeo.ARL, ARLESEY_STATION);
  for (const hub of ["KGX", "STP", "ZFD"]) {
    assert.deepEqual(a.lines[hub][0], ARLESEY_STATION);
    assert.deepEqual(a.lines[hub][1], P.stationGeo.HIT, "Arlesey trains run to Hitchin, not via Letchworth");
  }
  assert.ok(new RegExp(a.corridorPattern, "i").test("Arlesey"), "notices naming Arlesey are about your route");
  assert.ok(!new RegExp(P.corridorPattern, "i").test("Arlesey"), "the default profile is unchanged");
  assert.deepEqual(C.startStationChoices(a).map(c => c.code), ["ARL", "HIT", "LET"]);
  assert.equal(C.startStationsNear(FAIRFIELD, a)[1].name, "Letchworth");
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
  assert.equal(app.text("#startRow"), "Your location isn't known yet. Start from: Letchworth · Hitchin · Arlesey · Cancel");
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
  const mins = (g) => Math.round(C.walkSecs([51.9490, -0.2790], g, "avg", P) / 60);
  assert.equal(app.text("#startRow"), `Starting from Hitchin (about 18 min walk) today, walking from where you are · Letchworth instead (about ${mins(P.places.homeStation)} min walk) · Arlesey instead (about ${mins(ARLESEY_STATION)} min walk) · Back to home`);
  assert.equal(mins(P.places.homeStation), 76);
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
  assert.match(app.text("#startRow"), /^Starting from Hitchin \(about 18 min walk\) today, walking from where you are · .* · Back to home$/);
  assert.match(app.text("#routeLabel"), /Near Hitchin/);
  app.close();
});

test("In Fairfield: the nearest is Arlesey, Letchworth is offered with its walk, and one tap switches", async () => {
  const app = await createApp({ settings: { provider: "demo" }, geo: IN_FAIRFIELD });
  let reloads = 0; app.w.__commuteReload = () => { reloads++; };
  app.d.querySelector('[data-start="nearest"]').click();
  assert.deepEqual(plain(app.c.state.saved.startFrom), { code: "ARL", day: today() });
  app.close();
  const arl = await createApp({ settings: { provider: "demo" }, saved: { startFrom: { code: "ARL", day: today() } }, geo: IN_FAIRFIELD });
  arl.w.__commuteReload = () => { reloads++; };
  const walkTo = (g) => Math.round(C.walkSecs(FAIRFIELD, g, "avg", P) / 60);
  assert.equal(arl.text("#startRow"), `Starting from Arlesey (about ${walkTo(ARLESEY_STATION)} min walk) today, walking from where you are · Letchworth instead (about ${walkTo(P.places.homeStation)} min walk) · Hitchin instead (about ${walkTo(P.stationGeo.HIT)} min walk) · Back to home`);
  assert.equal(walkTo(ARLESEY_STATION), 39);
  assert.equal(arl.text("#routeLabel"), "Near Arlesey → 20 Mansfield Street");
  assert.match(arl.text("#hero"), /^On your way to Arlesey/);
  arl.d.querySelector('[data-start="LET"]').click();
  assert.deepEqual(plain(arl.c.state.saved.startFrom), { code: "LET", day: today() });
  assert.equal(reloads, 2);
  arl.close();
  // Letchworth while away from home: trains from Letchworth, the walk from Fairfield, never from Cartref.
  const let_ = await createApp({ settings: { provider: "demo" }, saved: { startFrom: { code: "LET", day: today() } }, geo: IN_FAIRFIELD });
  assert.deepEqual(plain(let_.c.boardKeys()), ["LET-KGX", "LET-ZFD"]);
  assert.equal(let_.text("#routeLabel"), "Near Letchworth → 20 Mansfield Street");
  assert.ok(Math.abs(let_.c.walkFromHere() - C.walkSecs(FAIRFIELD, P.places.homeStation, "avg", P)) < 1);
  assert.equal(let_.c.atHome(), false);
  assert.match(let_.text("#hero"), /^On your way to Letchworth/);
  assert.doesNotMatch(let_.text("#hero"), /Cartref/);
  assert.match(let_.text("#startRow"), /^Starting from Letchworth \(about \d+ min walk\) today, walking from where you are · Arlesey instead/);
  let_.close();
});

test("Starting from Arlesey: boards from Arlesey, real Thameslink trains planned (31 Oct recording)", async () => {
  const now = Date.parse(ARL_FIXTURE.recorded);
  const RDM = { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120" };
  const app = await createApp({ now, settings: RDM, saved: { dirMode: "office", startFrom: { code: "ARL", day: dayOf(now) } }, geo: IN_FAIRFIELD, route: replay(ARL_FIXTURE), settle: 800 });
  const boards = app.calls.filter(u => /GetDepBoardWithDetails/.test(u));
  assert.ok(boards.length > 0 && boards.every(u => /GetDepBoardWithDetails\/ARL\?/.test(u)), boards.join("\n"));
  const opts = app.c.ranked(now);
  assert.ok(opts.length > 0);
  assert.ok(opts.every(o => o.train.from === "ARL"));
  // The 12:05 Thameslink (Peterborough): 39 min to St Pancras, 44 to Farringdon: not stopping trains.
  const t = opts.find(o => o.train.std === "12:05");
  assert.ok(t, "12:05 Thameslink is planned");
  assert.ok(!app.c.isStopping(t.train));
  assert.match(app.text("#hero"), /^On your way to Arlesey/);
  app.close();
});

// From the independent review (31 Oct), adapted to its fixes.
const southOfHitchin = (k, acc = 20) => ({ coords: { latitude: HITCHIN_STATION[0] - k / 111.2, longitude: HITCHIN_STATION[1], accuracy: acc } });

test("Starting from Hitchin, going back: boards to Hitchin, the trip ends at Hitchin with no walk to Cartref", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "home", startFrom: HIT_TODAY() }, geo: IN_LONDON, settle: 800 });
  const c = app.c;
  assert.deepEqual(plain(c.boardKeys()), ["KGX-HIT", "ZFD-HIT"]);
  assert.equal(app.text("#routeLabel"), "20 Mansfield Street → Hitchin");
  const opts = c.ranked(Date.now());
  assert.ok(opts.length > 0);
  for (const j of opts) {
    assert.equal(j.train.to, "HIT");
    assert.ok(j.arrive - j.train.arr <= 2 * 60e3, `arrives at Hitchin, not Cartref: ${(j.arrive - j.train.arr) / 60e3} min after the train`);
  }
  assert.doesNotMatch(app.text("#hero") + app.text("#list"), /Cartref|Letchworth/);
  // Review 31 Oct: the arrival was labelled "Arrive home" while it was the time at Hitchin.
  assert.doesNotMatch(app.text("#hero"), /Arrive home|at home/);
  assert.match(app.text("#hero"), /Arrive Hitchin/);
  app.close();
  // Back near Hitchin (1 km from the station, not on a train): not "Nearly home", which counts the walk to your
  // saved home; the trip ended at Hitchin.
  const near = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "home", startFrom: HIT_TODAY() }, geo: southOfHitchin(1), settle: 800 });
  assert.doesNotMatch(near.text("#hero"), /at home|Nearly home|walk home|Set your home/);
  assert.doesNotMatch(near.text("#hero"), /Cartref|Letchworth/);
  near.close();
});

test("Starting from Hitchin with no saved home: the walk from 2.5 km still counts as on your way, never at home", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", home: null, startFrom: HIT_TODAY() }, geo: southOfHitchin(2.5) });
  const c = app.c, w = c.walkFromHere();
  assert.ok(w > 35 * 60 && w < 45 * 60, `${w}`);   // 2.5 km × 1.3 at 5 km/h ≈ 39 min, longer than the home walk
  assert.equal(c.onWay().walk, w);
  assert.equal(c.atHome(), false);
  assert.match(app.text("#hero"), /^On your way to Hitchin/);
  assert.doesNotMatch(app.text("#hero"), /Train from/);
  app.close();
});

test("Starting from Hitchin: the walk is worked out up to 10 km (the station search's limit), not beyond", async () => {
  for (const k of [4, 9]) {
    const a = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", startFrom: HIT_TODAY() }, geo: southOfHitchin(k) });
    const d = a.c.km(a.c.state.here, HITCHIN_STATION);
    assert.ok(Math.abs(a.c.walkFromHere() - d * 1.3 / 5 * 3600) < 1, `${k} km`);
    assert.doesNotMatch(a.text("#hero"), /until your location is known/);
    a.close();
  }
  const b = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", startFrom: HIT_TODAY() }, geo: southOfHitchin(10.5) });
  assert.equal(b.c.walkFromHere(), null);
  b.close();
});

test("Starting from Hitchin without a location: set off from where you are, never 'Leave Cartref'", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", startFrom: HIT_TODAY() }, geo: null });
  const best = app.c.ranked(Date.now())[0];
  assert.equal(best.train.from, "HIT");
  assert.doesNotMatch(app.text("#hero"), /Cartref/);
  assert.match(app.text("#hero"), /Set off from where you are/);
  app.close();
});

test("Starting from Hitchin, at Hitchin station: departures from Hitchin", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", startFrom: HIT_TODAY() },
    geo: { coords: { latitude: HITCHIN_STATION[0], longitude: HITCHIN_STATION[1], accuracy: 15 } } });
  assert.match(app.text("#hero"), /^You're at Hitchin · departures/);
  app.close();
});

test("Starting from Hitchin on TfL timetables: Hitchin's position in the request, Hitchin trains planned", async () => {
  const H = HITCHIN_STATION, HC = `${H[0]},${H[1]}`;
  const NAME = { [HC]: "Hitchin Rail Station", "51.53197,-0.12341": "London Kings Cross Rail Station", "51.52036,-0.10514": "Farringdon Rail Station", "51.53062,-0.12594": "London St Pancras International Rail Station" };
  const route = (u) => {
    const m = /JourneyResults\/([^/]+)\/to\/([^?]+)\?.*date=(\d{8})&time=(\d{4})/.exec(u); if (!m) return undefined;
    const a = NAME[decodeURIComponent(m[1])], b = NAME[decodeURIComponent(m[2])];
    const t = new Date(+m[3].slice(0, 4), +m[3].slice(4, 6) - 1, +m[3].slice(6), +m[4].slice(0, 2), +m[4].slice(2)).getTime();
    const journeys = !a || !b ? [] : [10, 40, 70].map(o => { const dep = t + o * 60e3; return { legs: [{ mode: { id: "national-rail" },
      departureTime: iso(dep), arrivalTime: iso(dep + 35 * 60e3), departurePoint: { commonName: a }, arrivalPoint: { commonName: b },
      instruction: { summary: /Farringdon|Pancras/.test(b) ? "Thameslink" : "Great Northern" } }] }; });
    return { ok: true, status: 200, json: async () => ({ journeys }) };
  };
  const app = await createApp({ settings: { provider: "tfl" }, saved: { dirMode: "office", startFrom: HIT_TODAY() }, geo: southOfHitchin(1), route, settle: 1200 });
  const rail = app.calls.filter(u => /JourneyResults\/51\.9/.test(u));
  assert.ok(rail.length > 0 && rail.every(u => u.includes(`JourneyResults/${HC}/to/`)), rail.join("\n"));
  const opts = app.c.ranked(Date.now());
  assert.ok(opts.length > 0 && opts.every(o => o.train.from === "HIT"));
  app.close();
});

test("Starting from Hitchin, going back on live boards: King's Cross, St Pancras and Farringdon to Hitchin", async () => {
  const RDM = { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120" };
  const route = (u) => /GetDepBoardWithDetails/.test(u) ? { ok: true, status: 200, json: async () => ({ trainServices: [] }) } : undefined;
  const app = await createApp({ settings: RDM, saved: { dirMode: "home", startFrom: HIT_TODAY() }, geo: IN_LONDON, route, settle: 800 });
  const boards = app.calls.filter(u => /GetDepBoardWithDetails/.test(u)).map(u => /GetDepBoardWithDetails\/(\w+)\?.*filterCrs=(\w+)/.exec(u).slice(1).join("-"));
  assert.deepEqual([...new Set(boards)].sort(), ["KGX-HIT", "STP-HIT", "ZFD-HIT"]);
  app.close();
});

test("Starting from Hitchin, leisure out: trains from Hitchin to King's Cross and St Pancras", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { mode: "leisure", dirMode: "office", startFrom: HIT_TODAY() }, geo: southOfHitchin(1) });
  assert.deepEqual(plain(app.c.boardKeys()), ["HIT-KGX", "HIT-STP"]);
  assert.equal(app.text("#routeLabel"), "Near Hitchin → King's Cross or St Pancras");
  app.close();
});

test("At home, 'nearest' says the commute already starts here; near Letchworth but not at home, it picks Letchworth", async () => {
  // The test persona's saved home is NEAR_LETCHWORTH: tapping there changes nothing (review 31 Oct).
  const app = await createApp({ settings: { provider: "demo" }, geo: NEAR_LETCHWORTH });
  let reloads = 0; app.w.__commuteReload = () => { reloads++; };
  app.d.querySelector('[data-start="nearest"]').click();
  assert.equal(app.c.state.saved.startFrom, undefined);
  assert.equal(reloads, 0);
  assert.match(app.text("#startRow"), /^You're at home: the commute already starts here\. Start from: Letchworth · Hitchin · Arlesey · Cancel$/);
  app.close();
  // A friend's house in Letchworth, 1.5 km from the saved home: Letchworth, walking from there.
  const away = await createApp({ settings: { provider: "demo" }, geo: { coords: { latitude: 51.988, longitude: -0.215, accuracy: 20 } } });
  away.w.__commuteReload = () => {};
  away.d.querySelector('[data-start="nearest"]').click();
  assert.deepEqual(plain(away.c.state.saved.startFrom), { code: "LET", day: today() });
  away.close();
});
