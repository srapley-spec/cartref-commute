// Engine: effort levels — what it would take to catch each train, and "Arrives first" per level.
// Story: docs/stories/effort-levels.md. Numbers below are worked out by hand from the rule, not from the code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, testville, train } from "./helpers.mjs";

const EP = { runFactor: 1.8, runKm: 0.4, walkKmh: 5, carFromHomeSecs: 240, cabWaitSecs: 600, cabKmh: 20, stickMs: 30e3 };
const now = at("2026-11-03", "07:00"), S = 1000;
// A 10-minute walk (600 s at average pace, 492 s fast = 0.82), nothing else before the train, from home.
const A10 = { walk: 600, walkAvg: 600, walkFast: 492, fixed: 0, home: true };
let k = 0;
const opt = (depInMs, o = {}) => {
  const access = o.access === undefined ? A10 : o.access, dep = now + depInMs;
  const t = train({ from: "RVS", to: "CEN", dep, arr: dep + (o.ride ?? 30 * MIN), std: `T${++k}`, ...o.train });
  return { hub: "CEN", train: t, leave: dep - (access ? (access.walk + access.fixed) * S : 0), arrive: t.arr + (o.tail ?? 0), flags: [], access, ...o.extra };
};
// "N min short": the walk at your pace needs N min more than you have (you set off 30 s from now).
const short = (min, o) => opt(30 * S + 600 * S - min * MIN, o);
const lvl = (o, prev, atItsStation = false) => core.effortFor(o, now, EP, atItsStation, prev);

test("effortNeeds: walk, fast walk, run (400 m at 1.8×, the rest fast), own car from home, a cab elsewhere", () => {
  const n = core.effortNeeds(A10, EP);
  assert.equal(n.walk, 600e3);
  assert.equal(n.fast, 492e3);
  // Run: 400 m at 5 km/h is 288 s of walking; at 1.8× that's 160 s instead of 288 × 0.82 = 236.16 s fast.
  assert.ok(Math.abs(n.run - (492 - 236.16 + 160) * S) < 1, `run ${n.run}`);
  assert.equal(n.car, 240e3, "your own car from home: 4 min");
  // A cab: 10 min to get one, then 0.833 km at 20 km/h = 150 s: 750 s, slower than walking 600 s, so walking.
  const away = core.effortNeeds({ ...A10, home: false }, EP);
  assert.equal(away.car, 600e3, "a cab never counts as slower than walking");
  const far = core.effortNeeds({ walk: 3600, walkAvg: 3600, walkFast: 2952, fixed: 0, home: false }, EP);
  assert.equal(far.car, (600 + 5 / 20 * 3600) * S, "an hour's walk (5 km): a cab is 10 + 15 min");
});

test("effortNeeds: fixed parts are never shortened; a short walk is all run; running never slower than a fast walk", () => {
  const n = core.effortNeeds({ ...A10, fixed: 300 }, EP);
  assert.equal(n.walk, 900e3); assert.equal(n.fast, 792e3); assert.equal(n.car, 540e3, "the car replaces only the walk");
  const short2 = core.effortNeeds({ walk: 120, walkAvg: 120, walkFast: 98.4, fixed: 0, home: true }, EP);
  assert.ok(Math.abs(short2.run - 120 / 1.8 * S) < 1, "2 min walk: all of it run");
  const slowRun = core.effortNeeds(A10, { ...EP, runFactor: 1.1 });
  assert.equal(slowRun.run, 492e3, "running slower than your fast walk: the fast walk");
  const noWalk = core.effortNeeds({ walk: 0, walkAvg: 0, walkFast: 0, fixed: 240, home: true }, EP);
  assert.deepEqual([noWalk.walk, noWalk.fast, noWalk.run, noWalk.car], [240e3, 240e3, 240e3, 240e3], "nothing to speed up");
  const fastPace = core.effortNeeds({ walk: 492, walkAvg: 600, walkFast: 492, fixed: 0, home: true }, EP);
  assert.equal(fastPace.walk, 492e3, "at fast pace already, walking is the fast walk");
});

test("effortFor: Sam's examples on a 10-minute walk — 1 min short fast walk, 5 min car, 9 min can't make it", () => {
  assert.equal(lvl(short(0)), "walk");
  assert.equal(lvl(short(1)), "fast");
  assert.equal(lvl(short(3)), "run", "3 min short: 7 min left, a fast walk needs 8.2, a run 6.9");
  assert.equal(lvl(short(5)), "car");
  assert.equal(lvl(short(9)), "none");
  assert.equal(lvl(short(5, { access: { ...A10, home: false } })), "none", "away from home a cab takes 10 min: can't make it");
});

test("effortFor: each boundary to the millisecond (you set off 30 s from now)", () => {
  const edge = (needS) => [opt(30 * S + needS * S), opt(30 * S + needS * S - 1)];
  let [a, b] = edge(600); assert.equal(lvl(a), "walk"); assert.equal(lvl(b), "fast");
  [a, b] = edge(492); assert.equal(lvl(a), "fast"); assert.equal(lvl(b), "run");
  [a, b] = edge(492 - 236.16 + 160); assert.equal(lvl(a), "run"); assert.equal(lvl(b), "car");
  [a, b] = edge(240); assert.equal(lvl(a), "car"); assert.equal(lvl(b), "none");
});

test("effortFor: at the station the train leaves from, a minute or more is walk, less is can't make it", () => {
  assert.equal(lvl(opt(60e3), undefined, true), "walk");
  assert.equal(lvl(opt(60e3 - 1), undefined, true), "none", "no fast walk or run onto a platform in under a minute");
  assert.equal(lvl(opt(60e3 - 1, { access: null }), undefined, true), "none");
});

test("effortFor: no flicker — a train moves to an easier level only 30 s inside it; harder at once", () => {
  const o = opt(30 * S + 492 * S);                 // exactly a fast walk
  assert.equal(lvl(o), "fast");
  assert.equal(lvl(o, "run"), "run", "was a run: needs 30 s in hand to become a fast walk");
  assert.equal(lvl(opt(30 * S + 522 * S), "run"), "fast", "30 s inside: a fast walk");
  assert.equal(lvl(opt(30 * S + 522 * S - 1), "run"), "run");
  assert.equal(lvl(opt(30 * S + 492 * S - 1), "walk"), "run", "getting harder needs no margin");
  assert.equal(lvl(o, "fast"), "fast");
});

test("effortFor: without route detail, the leave time decides walk or can't make it", () => {
  const o = { hub: "CEN", train: train({ dep: now + 10 * MIN, arr: now + 40 * MIN }), leave: now + 30e3, arrive: now + 40 * MIN, flags: [] };
  assert.equal(core.effortFor(o, now, EP, false), "walk");
  assert.equal(core.effortFor({ ...o, leave: now + 30e3 - 1 }, now, EP, false), "none");
});

test("gradeEffort: missed = harder than a fast walk; the latest set-off; one lozenge; cancelled gets none; gone trains dropped", () => {
  const w = short(0), f = short(1), r = short(3), c = short(5), x = short(9), gone = opt(-1);
  const cancelled = short(9, { train: { cancelled: true } });
  const out = core.gradeEffort([w, f, r, c, x, gone, cancelled], now, EP, null, () => "Riverside", (o) => core.plannable(o.train));
  assert.equal(out.includes(gone), false, "a train that has left isn't listed");
  assert.deepEqual([w, f, r, c, x].map((o) => o.effort), ["walk", "fast", "run", "car", "none"]);
  assert.deepEqual([w, f, r, c, x].map((o) => o.missed), [false, false, true, true, true], "walk and fast walk can be on the card");
  assert.deepEqual([w, f, r, c, x].map((o) => o.flags.map((z) => z.txt).join()), ["", "Fast walk", "Run", "Car needed", "Can't make it"]);
  assert.deepEqual([f.flags[0].lvl, r.flags[0].lvl, c.flags[0].lvl, x.flags[0].lvl], ["warn", "warn", "warn", "bad"]);
  assert.equal(w.leaveBy, w.leave);
  assert.equal(f.leaveBy, f.train.dep - 492e3, "a fast walk: leave by departure − the fast walk");
  assert.equal(f.leave, f.leaveBy, "a fast walk is the plan for that train: its leave time is the fast one");
  assert.equal(cancelled.uncertain, true); assert.equal(cancelled.flags.length, 0, "no lozenge on a cancelled train");
  assert.equal(r.flags.some((z) => /Leave time passed/.test(z.txt)), false, "the old wording is gone");
});

test("gradeEffort: last time's grade is looked up by the train's key (service ID, station, time, operator, day)", () => {
  const o = opt(30 * S + 500 * S, { train: { serviceId: "SID1" } });
  core.gradeEffort([o], now, EP, null, () => "", () => true, { [core.effortKey(o)]: "run" });
  assert.equal(o.effort, "run", "8 s inside the fast-walk boundary: stays a run");
  const p = opt(30 * S + 500 * S);
  core.gradeEffort([p], now, EP, null, () => "", () => true, { [core.effortKey(p)]: "run" });
  assert.equal(p.effort, "run");
  assert.equal(core.effortKey(p), `|RVS|${p.train.std}|Express Rail|${new Date(p.train.dep).toDateString()}`);
  core.gradeEffort([p], now, EP, null, () => "", () => true, {});
  assert.equal(p.effort, "fast");
});

test("gradeEffort: at a station, only trains from that station use the one-minute rule", () => {
  const here = opt(50e3, { access: null }), other = opt(50e3);
  const out = core.gradeEffort([here, other], now, EP, "Central", (o) => (o === here ? "Central" : "Market Street"), () => true);
  assert.equal(out[0].effort, "none");
  assert.equal(out[1].effort, "none", "the other station's train: the walk rule (20 s left, 10 min walk)");
  const soon = opt(70e3, { access: null });
  core.gradeEffort([soon], now, EP, "Central", () => "Central", () => true);
  assert.equal(soon.effort, "walk");
});

// ---------- Arrives first, per level ----------
const graded = (specs) => specs.map(([min, arriveMin, extra]) => {
  const o = short(min, { ride: 0, train: extra && extra.train });
  o.arrive = now + arriveMin * MIN; o.train.arr = o.arrive;
  o.effort = core.effortFor(o, now, EP, false); o.uncertain = !!(extra && extra.uncertain);
  return o;
});

test("markArrivesFirst: each level's earliest arrival, only when it beats every easier level; amber when it takes effort; '· walking' when not alone", () => {
  const [w, f, r, c, x] = graded([[0, 63], [1, 50], [3, 40], [5, 45], [9, 30]]);
  const firsts = core.markArrivesFirst([w, f, r, c, x]);
  assert.deepEqual(firsts, [w, f, r]);
  assert.deepEqual([w.firstAt, f.firstAt, r.firstAt, c.firstAt, x.firstAt], ["walk", "fast", "run", undefined, undefined],
    "by car arrives after the run's train: no car lozenge; can't make it: never");
  assert.deepEqual(w.flags[0], { lvl: "ok", txt: "Arrives first · walking" }, "with harder levels shown, the walking one says so");
  assert.deepEqual(f.flags[0], { lvl: "warn", txt: "Arrives first · fast walk" });
  assert.equal(r.flags[0].txt, "Arrives first · if you run");
  const [, , , c2] = graded([[0, 63], [1, 50], [3, 40], [5, 35]]);
  core.markArrivesFirst([c2]); assert.equal(c2.flags[0].txt, "Arrives first · by car");
});

test("markArrivesFirst: one lozenge when walking is already first; ties go to the later departure; cancelled never", () => {
  const [w, f, r] = graded([[0, 30], [1, 50], [3, 40]]);
  assert.deepEqual(core.markArrivesFirst([w, f, r]), [w]);
  assert.equal(f.flags.length, 0); assert.equal(r.flags.length, 0);
  assert.equal(w.flags[0].txt, "Arrives first", "alone: just 'Arrives first'");
  const [a, b] = graded([[0, 40], [0, 40]]);
  b.train.dep = a.train.dep + 1; b.leave = a.leave + 1;
  assert.deepEqual(core.markArrivesFirst([a, b]), [b], "same arrival: the later leave (less waiting)");
  const [u, v] = graded([[0, 30, { uncertain: true }], [0, 40]]);
  assert.deepEqual(core.markArrivesFirst([u, v]), [v], "a cancelled or no-estimate train is never 'arrives first'");
  const fast = graded([[1, 30]])[0];
  core.gradeEffort([fast], now, EP, null, () => "", () => true);
  core.markArrivesFirst([fast]);
  assert.deepEqual(fast.flags.map((z) => z.txt), ["Arrives first · fast walk"], "replaces 'Fast walk': one lozenge, not two");
});

test("markArrivesFirst: only among the options that count (e.g. Leave around's window); options without a grade are walks", () => {
  const [a, b] = graded([[0, 30], [0, 40]]);
  delete a.effort; delete b.effort;
  assert.deepEqual(core.markArrivesFirst([a, b], [b]), [b]);
  assert.equal(a.firstAt, undefined);
});

test("effortOffers: run and car trains that arrive sooner than the card's best, soonest first", () => {
  const [w, f, r, c] = graded([[0, 63], [1, 60], [3, 50], [5, 40]]);
  const firsts = core.markArrivesFirst([w, f, r, c]);
  assert.deepEqual(core.effortOffers(firsts, f), [c, r]);
  assert.deepEqual(core.effortOffers(firsts, c), [], "nothing arrives sooner than the best");
  assert.deepEqual(core.effortOffers(firsts, undefined), [c, r], "no card: every run / car first");
});

test("markLatestFor: 'Latest for 08:30' on an on-time pick, 'Least late for 08:30' when nothing is on time", () => {
  const T = at("2026-11-03", "08:30");
  const a = { flags: [], late: false }, b = { flags: [], late: true };
  core.markLatestFor(a, T); core.markLatestFor(b, T); core.markLatestFor(undefined, T);
  assert.deepEqual(a.flags[0], { lvl: "ok", txt: "Latest for 08:30" });
  assert.deepEqual(b.flags[0], { lvl: "warn", txt: "Least late for 08:30" });
});

// ---------- Wired into the lists ----------
test("rankNow with effort: a fast walk can top the card, a run can't; offers; without effort nothing changes", () => {
  const mk = () => graded([[0, 63], [1, 50], [3, 40], [9, 20]]).map((o) => { o.missed = ["run", "car", "none"].includes(o.effort); return o; });
  const list = core.rankNow(mk(), "office", testville, true);
  const best = list.find((o) => o.recommended === 1);
  assert.equal(best.effort, "fast", "1 min short at walking pace: still the card's best, with a warning");
  assert.equal(best.flags[0].txt, "Arrives first · fast walk");
  const run = list.find((o) => o.effort === "run");
  assert.equal(run.recommended, undefined); assert.equal(run.offer, true);
  assert.equal(list.find((o) => o.effort === "none").offer, undefined);
  const off = core.rankNow(mk(), "office", testville);
  assert.equal(off.some((o) => o.flags.length || o.offer || o.firstAt), false, "toggle off: no lozenges, no offers");
});

test("liveAdjust: with effort it grades; without, the old 'leave time passed' flags", () => {
  const a = short(3), b = short(3);
  core.liveAdjust([a], now, null, () => "", { ep: EP });
  assert.equal(a.effort, "run");
  core.liveAdjust([b], now, null, () => "");
  assert.equal(b.effort, undefined); assert.equal(b.missed, true); assert.match(b.flags[0].txt, /Leave time passed/);
});

test("arriveByOptions with effort: 'Latest for' on the pick, 'Arrives first' on the earliest arrival", () => {
  const T = now + 70 * MIN;
  const js = graded([[-20, 40], [-30, 55], [-40, 75]]);
  const out = core.arriveByOptions(js, T, false, "office", testville, true);
  const pick = out.find((o) => o.recommended === 1);
  assert.equal(pick.arrive, now + 55 * MIN, "the latest on time");
  assert.equal(pick.flags[0].txt, `Latest for ${new Date(T).toTimeString().slice(0, 5)}`);
  assert.equal(out.find((o) => o.arrive === now + 40 * MIN).flags[0].txt, "Arrives first");
  const off = core.arriveByOptions(graded([[-20, 40], [-30, 55]]), T, false, "office", testville);
  assert.equal(off.some((o) => o.flags.some((z) => /Latest for|Arrives first/.test(z.txt))), false);
});

test("aroundOptions with effort: 'Arrives first' is the card's best (its window), not a train before it", () => {
  const T = now + 60 * MIN;
  const early = opt(40 * MIN, { ride: 20 * MIN }), inWin = opt(60 * MIN + 600e3, { ride: 30 * MIN });
  const out = core.aroundOptions([early, inWin], T, now, false, "office", testville, true);
  assert.equal(early.leave < T - 10 * MIN && early.leave >= T - 15 * MIN, false, "(setup) early leaves before the window");
  const best = out.find((o) => o.recommended === 1);
  assert.equal(best.flags.find((z) => /Arrives first/.test(z.txt)).txt, "Arrives first");
  assert.equal(out.filter((o) => o.firstAt).length, 1);
});

test("accessOf: walking (plan, average, fast) and the fixed rest, from the route's segments", () => {
  const r = { before: [{ kind: "walk", secs: 500, avg: 600, fast: 492 }, { kind: "station", secs: 120 }, { kind: "margin", secs: 60 }, { kind: "walk", secs: 30 }], startsAtHome: true };
  assert.deepEqual(core.accessOf(r), { walk: 530, walkAvg: 630, walkFast: 522, fixed: 180, home: true });
  assert.equal(core.accessOf({ before: [] }).home, false);
});

test("leftHome: 100 m plus the fix's accuracy from a saved home; without one, 3 min nearer the station", () => {
  const home = [51.97, -0.24];
  assert.equal(core.leftHome([51.97 + 0.0009, -0.24], 0, home, 0, 0), true, "100 m away, perfect fix");
  assert.equal(core.leftHome([51.97 + 0.0009, -0.24], 20, home, 0, 0), false, "within 100 m + 20 m accuracy");
  assert.equal(core.leftHome([51.97, -0.24], 0, null, 1000, 1180), true);
  assert.equal(core.leftHome([51.97, -0.24], 0, null, 1001, 1180), false);
});

// ---------- Sam's routes carry the walk at both paces ----------
const TM = { walkHomeStationAvg: 1337, walkHomeStationFast: 1086, walkStationHomeAvg: 1332, walkStationHomeFast: 1111, letEntry: 120, letExit: 90, catchMargin: 60,
  kxInterchange: 360, farInterchange: 240, tubeWait: 180, rideKxAld: 600, rideFarAld: 420, aldPlatform: 90, aldWalk: 420,
  rideKxAde: 660, rideFarAde: 480, adePlatform: 90, adeWalk: 360, stpInterchange: 420, fastFactor: 0.82, leisureFactor: 1.15 };
const routes = (o) => core.samRoutes({ dir: "office", mode: "commute", pace: "avg", timings: TM, ...o });
const acc = (r) => core.accessOf(r);

test("samRoutes: from home the walk is your measured walk at both paces, from home; the rest is fixed", () => {
  const a = acc(routes({})[0]);
  assert.deepEqual(a, { walk: 1337, walkAvg: 1337, walkFast: 1086, fixed: 180, home: true });
  const fast = acc(routes({ pace: "fast" })[0]);
  assert.deepEqual([fast.walk, fast.walkAvg, fast.walkFast], [1086, 1337, 1086], "at fast pace the plan walks fast");
  const leisure = acc(core.samRoutes({ dir: "office", mode: "leisure", pace: "avg", timings: TM })[0]);
  assert.deepEqual([leisure.walk, leisure.walkAvg, leisure.walkFast, leisure.home], [1337 * 1.15, 1337, 1086, true]);
});

test("samRoutes: on your way, the same share of your walk at both paces; your car is at home only if you are", () => {
  const half = 1337 / 2;
  const a = acc(routes({ here: { walkToStation: half, atHub: null, atHome: false } })[0]);
  assert.deepEqual([a.walk, a.walkAvg, a.walkFast, a.home], [half, 1337 / 2, 1086 / 2, false]);
  assert.equal(acc(routes({ here: { walkToStation: half, atHub: null, atHome: true } })[0]).home, true);
  const f = acc(routes({ pace: "fast", here: { walkToStation: 1086 / 2, atHub: null, atHome: false } })[0]);
  assert.deepEqual([f.walk, f.walkAvg, f.walkFast], [1086 / 2, 1337 / 2, 1086 / 2]);
});

test("samRoutes going home: the walk to the tube at both paces, not from home; at a London station the platform walk", () => {
  const office = acc(core.samRoutes({ dir: "home", mode: "commute", pace: "avg", timings: TM })[0]);
  assert.deepEqual([office.walk, office.walkAvg, office.walkFast, office.home], [420, 420, 420 * 0.82, false]);
  assert.equal(office.fixed, 90 + 180 + 600 + 360 + 60, "platform, tube wait, ride, interchange, margin: fixed");
  const kx = core.samRoutes({ dir: "home", mode: "commute", pace: "avg", timings: TM, here: { walkToStation: null, atHub: "KGX" } });
  const own = acc(kx.find((r) => r.hub === "KGX")), other = acc(kx.find((r) => r.hub === "ZFD"));
  assert.deepEqual([own.walk, own.walkFast], [180, 180 * 0.82]);
  assert.equal(other.walk, 0, "to Farringdon by tube: nothing to walk faster");
});

// ---------- Independent review (29 Oct night): gaps the first tests missed ----------
test("liveAdjust with effort: cancelled and no-estimate trains are uncertain, get no lozenge and are never picked", () => {
  const ok = short(0), gone = short(9, { train: { cancelled: true } }), unk = short(1, { train: { depUnknown: true } });
  const list = core.rankNow(core.liveAdjust([ok, gone, unk], now, null, () => "", { ep: EP }), "office", testville, true);
  assert.deepEqual([gone.uncertain, unk.uncertain, ok.uncertain], [true, true, false]);
  assert.deepEqual([gone.flags.length, unk.flags.length], [0, 0], "no effort lozenge (the helper adds no train flags)");
  assert.equal(gone.effort, "none", "graded, but not labelled");
  assert.equal(list.find((o) => o.recommended === 1), ok);
});

test("gradeEffort at a station: another station's train keeps the walk rule (it isn't 'under a minute')", () => {
  const other = opt(50e3, { access: { walk: 0, walkAvg: 0, walkFast: 0, fixed: 0, home: false } });
  core.gradeEffort([other], now, EP, "Central", () => "Market Street", () => true);
  assert.equal(other.effort, "walk", "nothing to walk, 20 s in hand: catchable");
  const here = opt(50e3, { access: { walk: 0, walkAvg: 0, walkFast: 0, fixed: 0, home: false } });
  core.gradeEffort([here], now, EP, "Central", () => "Central", () => true);
  assert.equal(here.effort, "none");
});

test("effortFor: the 30 s margin only applies moving to an easier level, not to a harder one than last time", () => {
  const run = 492 - 236.16 + 160;
  assert.equal(lvl(opt(30 * S + run * S + 10 * S), "fast"), "run", "was a fast walk, now 10 s inside a run: a run");
  assert.equal(lvl(opt(30 * S + run * S + 10 * S), "car"), "car", "was a car, 10 s inside a run: still a car");
});

test("markArrivesFirst: a harder level that only ties an easier level's arrival isn't marked", () => {
  const [w, f] = graded([[0, 40], [1, 40]]);
  f.leave = w.leave + MIN;     // re-timed to a fast walk it leaves later, and arrives at the same time
  assert.deepEqual(core.markArrivesFirst([w, f]), [w], "the same arrival for more effort isn't 'arrives first'");
  assert.equal(w.flags[0].txt, "Arrives first");
  assert.equal(f.firstAt, undefined);
});

test("markArrivesFirst: ties go to the later leave, as the card's pick", () => {
  const [a, b] = graded([[0, 40], [0, 40]]);
  b.train.dep = a.train.dep + 5 * MIN; b.leave = a.leave - MIN;    // leaves Cartref earlier but its train is later
  assert.deepEqual(core.markArrivesFirst([a, b]), [a]);
});

test("aroundOptions with effort: a train before the card's window never takes 'Arrives first', and passed leave times don't count", () => {
  const T = now + 60 * MIN;
  const early = opt(60 * MIN + 600e3 - 12 * MIN, { ride: 10 * MIN }), inWin = opt(60 * MIN + 600e3, { ride: 30 * MIN });
  const out = core.aroundOptions([early, inWin], T, now, false, "office", testville, true);
  assert.ok(out.includes(early) && early.arrive < inWin.arrive, "(setup) the early train is listed and arrives sooner");
  assert.equal(early.firstAt, undefined); assert.equal(inWin.firstAt, "walk");
  const nearNow = core.aroundOptions([opt(30 * S + 600 * S - MIN), opt(30 * S + 600 * S + 5 * MIN)], now, now, false, "office", testville, true);
  const passed = nearNow.find((o) => o.leave < now + 30e3);
  assert.equal(passed.recommended, undefined); assert.equal(passed.firstAt, undefined, "its leave time has passed");
});

test("arriveByOptions with effort: run / car trains that get you there sooner are offered", () => {
  const T = now + 70 * MIN;
  const js = graded([[0, 60], [3, 45]]);
  js.forEach((o) => { o.missed = o.effort === "run"; });
  const out = core.arriveByOptions(js, T, false, "office", testville, true);
  const run = out.find((o) => o.effort === "run");
  assert.equal(run.offer, true); assert.equal(run.recommended, undefined);
});

test("effortNeeds: a cab drives the walking distance at your average pace, whatever pace the plan uses", () => {
  const n = core.effortNeeds({ walk: 1086, walkAvg: 1337, walkFast: 1086, fixed: 0, home: false }, EP);
  assert.equal(n.car, Math.round((600 + (1337 / 3600 * 5) / 20 * 3600) * 1000));
});

test("gradeEffort: a train leaving this instant is still listed", () => {
  const o = opt(0); assert.equal(core.gradeEffort([o], now, EP, null, () => "", () => true).length, 1);
});

test("effortKey: the same train at two stations, or the same time another day, has its own key", () => {
  const a = opt(10 * MIN, { train: { serviceId: "S1", from: "ZFD" } }), b = opt(15 * MIN, { train: { serviceId: "S1", from: "STP", std: a.train.std } });
  assert.notEqual(core.effortKey(a), core.effortKey(b));
  const c = opt(10 * MIN + 24 * 3600e3, { train: { std: a.train.std, serviceId: "S1", from: "ZFD" } });
  assert.notEqual(core.effortKey(a), core.effortKey(c));
});

test("samRoutes: going out to a London place starts at home (your car)", () => {
  const r = core.samRoutes({ dir: "office", mode: "leisure", pace: "avg", timings: TM, dest: { name: "Science Museum", legs: null } });
  assert.ok(r.length && r.every((x) => core.accessOf(x).home));
});

// ---------- Follow-ups from the second review ----------
test("fastWalkLegs going home: the walk to the tube is shortened and every step after it moves with it", () => {
  const routes = core.samRoutes({ dir: "home", mode: "commute", pace: "avg", timings: TM }), r = routes.find((x) => x.hub === "KGX");
  const dep = at("2026-11-03", "18:00");
  const t = train({ from: "KGX", to: "LET", dep, arr: dep + 30 * MIN, std: "18:00", operator: "Great Northern" });
  const [o] = core.buildOptions([r], { "KGX-LET": { services: [t], msgs: [] } }, core.profiles.samCommute);
  const leave = o.leave + 76e3;                                   // 420 s walk → 344.4 s at a fast walk: 75.6 s later
  const legs = core.fastWalkLegs(o, leave);
  assert.equal(legs.length, o.legs.length);
  assert.equal(legs[0].t, leave); assert.match(legs[0].note, /fast walk 6 min/);
  const tubeOld = o.legs.find((l) => l.tube), tubeNew = legs.find((l) => l.tube);
  assert.equal(tubeNew.t, leave + (344.4 + 90 + 180) * 1000, "the tube step: fast walk + platform + wait after the new leave");
  assert.ok(tubeNew.t > tubeOld.t);
  assert.equal(legs.find((l) => l.train).t, dep, "the train is unchanged");
});

test("aroundOptions without effort (toggle off): Leave around near now is as before — a passed leave time can still be the pick", () => {
  const passed = opt(30 * S + 600 * S - MIN), later = opt(30 * S + 600 * S + 30 * MIN);
  const out = core.aroundOptions([passed, later], now, now, false, "office", testville);
  assert.equal(out.find((o) => o.recommended === 1), passed);
});

test("aroundOptions with effort, graded: Leave around near now picks the next train you can still make, with a fast walk if need be", () => {
  const fast = short(1), run = short(3), later = opt(30 * S + 600 * S + 25 * MIN);
  fast.arrive = run.arrive = later.arrive = 0;
  [fast.train.arr, run.train.arr, later.train.arr] = [now + 50 * MIN, now + 45 * MIN, now + 80 * MIN];
  [fast, run, later].forEach((o) => { o.arrive = o.train.arr; });
  const graded = core.gradeEffort([fast, run, later], now, EP, null, () => "", () => true);
  const out = core.aroundOptions(graded, now, now, false, "office", testville, true);
  assert.equal(out.find((o) => o.recommended === 1), fast, "a fast walk is a train you can still make");
  assert.equal(fast.flags[0].txt, "Arrives first · fast walk");
  assert.equal(run.recommended, undefined, "a run never tops the card");
  assert.equal(run.flags.some((f) => f.txt === "Run"), true);
  const onlyRun = core.aroundOptions(core.gradeEffort([short(3)], now, EP, null, () => "", () => true), now, now, false, "office", testville, true);
  assert.equal(onlyRun.some((o) => o.recommended), false, "nothing you can still make: no pick");
});
