// Effort levels: always on (the Experimental toggle was removed 30 Oct). The engine grades the trains
// (tests/core/effort.test.mjs); these check the page asks for it and draws it. Older tests still pass
// `effort: true` in settings, as the toggle once needed; it no longer changes anything.
// Story: docs/stories/effort-levels.md
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, at, hm, sleep, closeAll } from "./harness.mjs";

after(closeAll);

const MIN = 60e3, S = 1000;
const now = at("2026-11-03", "07:00");
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false,
  platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "", from: "LET", to: "KGX" }, o);
// From home (default settings): walk 1337 s (fast 1086 s), then 120 s into the station and a 60 s margin.
// "N min short" = the walk at average pace needs N min more than you have; you set off 30 s from now.
const dep = (shortMin) => now + 30 * S + (1337 + 180) * S - shortMin * MIN;
const T = {
  V: svc({ dep: dep(-5), arr: now + 60 * MIN }),   // walk
  X: svc({ dep: dep(2), arr: now + 52 * MIN }),    // fast walk: needs 1266 s, has 1397
  Y: svc({ dep: dep(5), arr: now + 48 * MIN }),    // run: needs 180 + 1086 − 288×0.812 + 160 ≈ 1192 s, has 1217
  Z: svc({ dep: dep(10), arr: now + 45 * MIN }),   // car: needs 180 + 240 = 420 s, has 917
  W: svc({ dep: dep(20), arr: now + 35 * MIN }),   // can't make it: has 317 s
};
async function app(settings, saved = {}) {
  const a = await createApp({ now, settings: { provider: "demo", ...settings }, saved: { dirMode: "office", ...saved } });
  a.c.state.boards = { "LET-KGX": { msgs: [], services: Object.values(T).map((t) => ({ ...t })) }, "LET-ZFD": { msgs: [], services: [] } };
  a.c.state.status = []; a.c.state.nrStatus = []; a.c.render();
  return a;
}
const row = (a, std) => [...a.d.querySelectorAll("#list .row")].find((r) => r.textContent.includes(`${std} Great Northern`));

test("Effort levels always on: no toggle, and a phone that saved the toggle off still gets them", async () => {
  const a = await app({ effort: false });
  const best = a.c.ranked(now).find((o) => o.recommended === 1);
  assert.equal(best.train.std, T.X.std, "the fast-walk train tops the card");
  assert.match(a.text("#hero"), /Arrives first · fast walk/);
  assert.doesNotMatch(a.text("#hero") + a.text("#list"), /Still possible if you hurry|Leave time passed/);
  assert.match(row(a, T.Z.std).textContent, /Arrives first · by car/);
  assert.equal(a.d.querySelector("#s_effort"), null, "no toggle in Settings");
  a.close();
});

test("Effort levels on: a fast walk tops the card with its lozenge and the time to leave at a fast walk", async () => {
  const a = await app({ effort: true });
  const list = a.c.ranked(now), best = list.find((o) => o.recommended === 1);
  assert.equal(best.train.std, T.X.std, "2 min short on a 22 min walk: a fast walk, and it arrives before the walkable train");
  const hero = a.text("#hero");
  assert.match(hero, /Arrives first · fast walk/);
  assert.match(hero, new RegExp(`Leave\\s*${hm(T.X.dep - (1086 + 180) * S)}`), "leave by departure − (fast walk + station + margin)");
  assert.doesNotMatch(hero, /Still possible if you hurry|Leave time passed/);
  a.close();
});

test("Effort levels on: the card says which run / car trains arrive sooner; the list labels every train", async () => {
  const a = await app({ effort: true });
  const hero = a.text("#hero");
  assert.match(hero, new RegExp(`Arrives first if you run: the ${T.Y.std} Great Northern`));
  assert.match(hero, new RegExp(`Arrives first by car: the ${T.Z.std} Great Northern`));
  assert.ok(hero.indexOf(`by car: the ${T.Z.std}`) < hero.indexOf(`if you run: the ${T.Y.std}`), "soonest arrival first");
  assert.match(row(a, T.V.std).textContent, /Arrives first · walking/, "the train you can walk to says so");
  assert.match(row(a, T.X.std).textContent, /Arrives first · fast walk/);
  assert.match(row(a, T.Y.std).textContent, /Arrives first · if you run/);
  assert.match(row(a, T.Z.std).textContent, /Arrives first · by car/);
  const w = row(a, T.W.std);
  assert.match(w.textContent, /Can't make it/); assert.ok(w.classList.contains("gone"), "dimmed, still listed");
  assert.doesNotMatch(row(a, T.V.std).className, /gone|missed/);
  assert.match(row(a, T.Y.std).className, /missed/, "a run isn't on the card");
  a.close();
});

test("Effort levels on: last refresh's grade holds a train back from an easier level until it's 30 s inside it", async () => {
  const a = await app({ effort: true });
  const y = () => a.c.ranked(now).find((o) => o.train.std === T.Y.std);
  const key = Object.keys(a.c.state.effortPrev.now).find((k) => k.includes(`|${T.Y.std}|`));
  assert.equal(a.c.state.effortPrev.now[key], "run", "the page remembers each train's grade, per view");
  assert.equal(Object.keys(a.c.state.effortPrev.now).length, 5, "only the trains listed now");
  // The 07:20 is 25 s inside the run boundary. Had it been 'car needed' last time, it stays that until 30 s inside.
  a.c.state.effortPrev = { now: { [key]: "car" }, by: { [key]: "walk" } };
  assert.equal(y().effort, "car");
  a.c.state.effortPrev = { by: { [key]: "car" } };
  assert.equal(y().effort, "run", "Arrive by's memory doesn't leak into Leave now");
  a.close();
});

test("Effort levels on: your car is only at home; on your way it's a cab (10 min to get one)", async () => {
  const q = svc({ dep: now + 30 * S + 450 * S, arr: now + 40 * MIN });   // 450 s in hand
  const home = [51.975 - 0.009, -0.23];                                   // ~1 km south of the test position
  const a = await app({ effort: true }, { home: [51.975, -0.23] });       // at home
  a.c.state.boards["LET-KGX"].services.push({ ...q }); a.c.render();
  const atHome = a.c.ranked(now).find((o) => o.train.std === q.std);
  assert.equal(atHome.access.home, true); assert.equal(atHome.effort, "car", "car from home: 180 + 240 = 420 s");
  const b = await app({ effort: true }, { home });
  b.c.state.here = [51.975, -0.23]; b.c.state.locAcc = 10;
  b.c.state.boards["LET-KGX"].services.push({ ...q }); b.c.render();
  assert.equal(b.c.atHome(), false);
  const onWay = b.c.ranked(now).find((o) => o.train.std === q.std);
  assert.equal(onWay.access.home, false);
  assert.equal(onWay.effort, "none", "a cab takes 10 min: can't make it");
  a.close(); b.close();
});

test("Effort levels: Settings show and save running speed and distance, car and cab times", async () => {
  const a = await app({ effort: true, runFactor: 2.2, runM: 600, carFromHome: 300, cabWait: 480 });
  a.d.querySelector("#settingsBtn").click();
  assert.equal(a.d.querySelector("#s_runFactor").value, "2.2");
  assert.equal(a.d.querySelector("#s_runM").value, "600");
  assert.equal(a.d.querySelector("#s_carFromHome").value, "5", "shown in minutes");
  assert.equal(a.d.querySelector("#s_cabWait").value, "8");
  a.d.querySelector("#s_runFactor").value = "1.5"; a.d.querySelector("#s_runM").value = "200";
  a.d.querySelector("#s_carFromHome").value = "3"; a.d.querySelector("#s_cabWait").value = "12";
  a.d.querySelector("#settingsForm").dispatchEvent(new a.w.Event("submit", { cancelable: true }));
  await sleep(50);
  const s = a.c.state.saved.settings;
  assert.deepEqual([s.runFactor, s.runM, s.carFromHome, s.cabWait], [1.5, 200, 180, 720]);
  a.close();
});

test("Effort levels: the engine gets your settings (running speed and distance, car, cab)", async () => {
  const a = await app({ effort: true, runFactor: 3, runM: 1000, carFromHome: 800, cabWait: 300 });
  const ep = a.c.effortProfile();
  assert.deepEqual([ep.runFactor, ep.runKm, ep.carFromHomeSecs, ep.cabWaitSecs, ep.cabKmh, ep.walkKmh, ep.stickMs], [3, 1, 800, 300, 20, 5, 30e3]);
  // The 07:15 leaves 917 s in hand. Car: 180 + 800 = 980 s, too slow. Running 1 km (720 s of walking) at 3×:
  // 180 + 1086 − 720 × 1086/1337 + 240 ≈ 921 s, just too slow; at 3.1×, ≈ 913 s: a run.
  assert.equal(a.c.ranked(now).find((o) => o.train.std === T.Z.std).effort, "none");
  a.close();
  const b = await app({ effort: true, runFactor: 3.1, runM: 1000, carFromHome: 800 });
  assert.equal(b.c.ranked(now).find((o) => o.train.std === T.Z.std).effort, "run");
  b.close();
});

test("Effort levels: Arrive by's pick says 'Latest for' the time you set", async () => {
  {
    const a = await app({}, { view: "by" });
    const Tby = now + 3 * 60 * MIN;
    const late = svc({ dep: now + 120 * MIN, arr: now + 150 * MIN }), early = svc({ dep: now + 90 * MIN, arr: now + 120 * MIN });
    a.c.state.by = { T: Tby, boards: { "LET-KGX": { msgs: [], services: [early, late] }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: false };
    a.c.render();
    const hero = a.text("#hero");
    assert.match(hero, new RegExp(`Latest for ${hm(Tby)}`)); assert.match(a.text("#list"), /Arrives first/);
    a.close();
  }
});

test("Effort levels on: Leave around's best says 'Arrives first'", async () => {
  const a = await app({ effort: true }, { view: "at" });
  const Tat = now + 4 * 60 * MIN;
  const t1 = svc({ dep: Tat + 30 * MIN, arr: Tat + 60 * MIN }), t2 = svc({ dep: Tat + 40 * MIN, arr: Tat + 65 * MIN });
  a.c.state.at = { T: Tat, boards: { "LET-KGX": { msgs: [], services: [t1, t2] }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: false };
  a.c.render();
  const best = a.c.atOptions().find((o) => o.recommended === 1);
  assert.equal(best.train.std, t1.std);
  assert.match(a.text("#hero"), /Arrives first/);
  a.close();
});

test("Effort levels on: a fast-walk pick's total time and steps are at a fast walk too; no 'leave now' while there's time", async () => {
  const a = await app({ effort: true });
  const x = a.c.ranked(now).find((o) => o.train.std === T.X.std), leave = T.X.dep - (1086 + 180) * S;
  assert.equal(x.leave, leave);
  assert.equal(x.legs[0].t, leave); assert.match(x.legs[0].d, /Leave Cartref/); assert.match(x.legs[0].note, /fast walk 18 min/);
  assert.equal(x.legs.find((l) => l.train).t, T.X.dep, "the train is unchanged");
  const hero = a.text("#hero");
  const mins = Math.round((x.arrive - leave) / 60e3);
  assert.match(hero, new RegExp(`Total journey ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`), "total from the fast-walk leave");
  assert.doesNotMatch(hero.slice(hero.indexOf("→"), hero.indexOf("Journey steps")), /leave now/, "2 min 41 s to leave at a fast walk (the label above says 'If you leave now')");
  a.close();
});

async function assertDepartureCountdown(signal) {
  const a = await app({ signal, followRoute: true });
  const pick = a.c.ranked(now).find(o => o.recommended === 1);
  assert.equal(pick.effort, 'fast', 'the real recommended journey retains its required pace');
  for (const seconds of [91, 90, 89, 86, 60, 31]) {
    a.setNow(pick.leave - seconds * S);
    a.c.render();
    const option = a.d.querySelector('#hero > .opt');
    assert.ok(option, 'the actual primary recommendation stays available');
    const counter = option.querySelector('[data-cd]');
    assert.ok(counter, 'a pre-journey option exposes its leave countdown');
    assert.equal(Number(counter.dataset.cd), pick.leave, 'removing wording cannot change the canonical leave time');
    assert.equal(counter.textContent, `leave in ${a.w.CommuteCore.countdown(seconds * S)}`);
    assert.equal(option.querySelector('.journey-countdown').textContent, counter.textContent, 'the countdown is the only departure instruction');
    assert.doesNotMatch(option.textContent, /\bleave now\b/i, `${seconds} seconds remain`);
    assert.match(option.textContent, /Arrives first · fast walk/, 'the effort qualification remains visible');
  }
  assert.deepEqual(a.errors, []);
  a.close();
}
test('Departure countdown: an obsolete disabled Signal preference retains the precise countdown', () => assertDepartureCountdown(false));
test('Departure countdown: Signal has no redundant leave-now instruction below ninety seconds', () => assertDepartureCountdown(true));

test("Effort levels on: on your way, a train that needs a fast walk says 'walk fast'", async () => {
  // ~1 km from home, 550 m from the station: 474 s of your walk left (fast 385 s), plus 180 s fixed.
  const f = svc({ dep: now + 30 * S + 600 * S, arr: now + 45 * MIN }), later = svc({ dep: now + 40 * MIN, arr: now + 70 * MIN });
  const a = await createApp({ now, settings: { provider: "demo", effort: true }, saved: { dirMode: "office", home: [51.975 - 0.009, -0.23] } });
  a.c.state.boards = { "LET-KGX": { msgs: [], services: [f, later] }, "LET-ZFD": { msgs: [], services: [] } };
  a.c.state.status = []; a.c.state.nrStatus = []; a.c.state.here = [51.975, -0.23]; a.c.state.locAcc = 10; a.c.render();
  const best = a.c.ranked(now).find((o) => o.recommended === 1);
  assert.equal(best.train.std, f.std); assert.equal(best.effort, "fast");
  assert.match(a.text("#hero"), /On your way to Letchworth/);
  assert.match(a.text("#hero"), /walk fast · (1 min to spare|keep going)/);
  a.close();
});

test("Effort levels on: Arrive by's card says which run / car train gets you there sooner", async () => {
  const a = await app({ effort: true }, { view: "by" });
  const Tby = now + 82 * MIN;          // 08:22: the 07:23 (office 08:19) is the latest on time
  a.c.state.by = { T: Tby, boards: { "LET-KGX": { msgs: [], services: Object.values(T).map((t) => ({ ...t })) }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: false };
  a.c.render();
  const hero = a.text("#hero");
  assert.match(hero, new RegExp(`Latest for ${hm(Tby)}`));
  assert.match(hero, new RegExp(`Arrives first by car: the ${T.Z.std}`));
  assert.match(hero, new RegExp(`Arrives first if you run: the ${T.Y.std}`));
  assert.ok(a.c.state.effortPrev.by && Object.keys(a.c.state.effortPrev.by).length === 5, "Arrive by keeps its own grades");
  a.c.state.effortPrev = { now: Object.fromEntries(Object.keys(a.c.state.effortPrev.by).map((k) => [k, "none"])) };
  a.c.render();
  assert.match(a.text("#hero"), /Arrives first by car/, "Leave now's memory doesn't affect Arrive by");
  a.close();
});

test("Effort levels: the running and car settings are always shown", async () => {
  const a = await app({});
  a.d.querySelector("#settingsBtn").click();
  assert.equal(a.d.querySelector("#effortFields").hidden, false);
  a.close();
});

test("Extra effort on: Leave around near now shows the next train you can still make (a fast walk), and says so when there's none", async () => {
  const a = await app({ effort: true }, { view: "at" });
  a.c.state.at = { T: now, boards: { "LET-KGX": { msgs: [], services: Object.values(T).map((t) => ({ ...t })) }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: true };
  a.c.render();
  const best = a.c.atOptions().find((o) => o.recommended === 1);
  assert.equal(best.train.std, T.X.std, "2 min short: a fast walk, and it arrives first of those you can still make");
  assert.match(a.text("#hero"), /Arrives first · fast walk/);
  assert.match(row(a, T.Y.std).textContent, /Arrives first · if you run|Run/);
  assert.ok(a.c.state.effortPrev.at, "Leave around keeps its own grades");
  a.c.state.at = { T: now, boards: { "LET-KGX": { msgs: [], services: [T.Y, T.Z, T.W].map((t) => ({ ...t })) }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: true };
  a.c.render();
  assert.match(a.text("#hero"), /Nothing around 07:00 you can still make, even with a fast walk/);
  assert.match(a.text("#list"), /Car needed/, "the list still shows them, with what they'd take");
  a.close();
});
