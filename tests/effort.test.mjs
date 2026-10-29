// Feature toggle: effort levels (Settings → Experimental). Off = exactly as before. The engine grades the trains
// (tests/core/effort.test.mjs); these check the page asks for it, draws it, and that off changes nothing.
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

test("Effort levels off: unchanged — trains you'd hurry for are 'Still possible if you hurry', the walkable train tops the card", async () => {
  const a = await app({});
  const best = a.c.ranked(now).find((o) => o.recommended === 1);
  assert.equal(best.train.std, T.V.std);
  assert.match(a.text("#hero"), /Still possible if you hurry/);
  assert.doesNotMatch(a.text("#hero") + a.text("#list"), /Arrives first|Fast walk|Car needed|Can't make it/);
  assert.equal(a.d.querySelector("#s_effort").checked, false);
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
  const key = Object.keys(a.c.state.effortPrev).find((k) => k.includes(T.Y.std));
  assert.equal(a.c.state.effortPrev[key], "run", "the page remembers each train's grade");
  // The 07:20 is 25 s inside the run boundary. Had it been 'car needed' last time, it stays that until 30 s inside.
  a.c.state.effortPrev = { [key]: "car" };
  assert.equal(y().effort, "car");
  a.c.state.effortPrev = {};
  assert.equal(y().effort, "run");
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

test("Effort levels: Settings show and save the toggle, running speed and distance, car and cab times", async () => {
  const a = await app({ effort: true, runFactor: 2.2, runM: 600, carFromHome: 300, cabWait: 480 });
  a.d.querySelector("#settingsBtn").click();
  assert.equal(a.d.querySelector("#s_effort").checked, true);
  assert.equal(a.d.querySelector("#s_runFactor").value, "2.2");
  assert.equal(a.d.querySelector("#s_runM").value, "600");
  assert.equal(a.d.querySelector("#s_carFromHome").value, "5", "shown in minutes");
  assert.equal(a.d.querySelector("#s_cabWait").value, "8");
  a.d.querySelector("#s_runFactor").value = "1.5"; a.d.querySelector("#s_runM").value = "200";
  a.d.querySelector("#s_carFromHome").value = "3"; a.d.querySelector("#s_cabWait").value = "12";
  a.d.querySelector("#s_effort").checked = false;
  a.d.querySelector("#settingsForm").dispatchEvent(new a.w.Event("submit", { cancelable: true }));
  await sleep(50);
  const s = a.c.state.saved.settings;
  assert.deepEqual([s.runFactor, s.runM, s.carFromHome, s.cabWait, !!s.effort], [1.5, 200, 180, 720, false]);
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

test("Effort levels on: Arrive by's pick says 'Latest for' the time you set; off, it doesn't", async () => {
  for (const effort of [true, false]) {
    const a = await app({ effort }, { view: "by" });
    const Tby = now + 3 * 60 * MIN;
    const late = svc({ dep: now + 120 * MIN, arr: now + 150 * MIN }), early = svc({ dep: now + 90 * MIN, arr: now + 120 * MIN });
    a.c.state.by = { T: Tby, boards: { "LET-KGX": { msgs: [], services: [early, late] }, "LET-ZFD": { msgs: [], services: [] } }, failed: {}, live: false };
    a.c.render();
    const hero = a.text("#hero");
    if (effort) { assert.match(hero, new RegExp(`Latest for ${hm(Tby)}`)); assert.match(a.text("#list"), /Arrives first/); }
    else assert.doesNotMatch(hero + a.text("#list"), /Latest for|Arrives first/);
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
