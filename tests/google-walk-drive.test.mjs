// Google for the walk and the drive from where you are in Commute and Leisure (Sam, 12 Nov: "Surely it can give us more
// accurate information for the commuter app?"; agreed scope: walking and driving only, only when it matters).
// Story: docs/stories/google-walk-drive.md.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, closeAll, at } from "./harness.mjs";
import { core } from "./core/helpers.mjs";
after(closeAll);

const EP = { runFactor: 1.8, runKm: 0.4, walkKmh: 5, carFromHomeSecs: 240, cabWaitSecs: 600, cabKmh: 20, stickMs: 30e3 };

test("The cab's drive is Google's drive time with traffic when known; your own car from home is unchanged", () => {
  const away = { walk: 1200, walkAvg: 1200, walkFast: 980, fixed: 180, home: false };
  // Without Google: 10 min for a cab + 1.67 km at 20 km/h = 600 + 300 s.
  assert.equal(core.effortNeeds(away, EP).car, Math.round((180 + 600 + (1200 / 3600 * 5) / 20 * 3600) * 1000));
  assert.equal(core.effortNeeds({ ...away, driveSecs: 420 }, EP).car, (180 + 600 + 420) * 1000, "Google says 7 min by road");
  assert.equal(core.effortNeeds({ ...away, home: true, driveSecs: 420 }, EP).car, (180 + 240) * 1000, "your car from home: as set");
  assert.equal(core.effortNeeds({ ...away, driveSecs: NaN }, EP).car, core.effortNeeds(away, EP).car, "nonsense ignored");
});

function stubGoogle(w, { walkM = 1500, driveS = 420, homeM = 2000 } = {}) {
  const calls = [];
  w.google = { maps: { importLibrary: async () => ({ RouteMatrix: { computeRouteMatrix: async (req) => {
    calls.push({ mode: req.travelMode, origin: [req.origins[0].lat, req.origins[0].lng] });
    const fromHome = Math.abs(req.origins[0].lat - 51.9752) < 1e-6;
    const item = req.travelMode === "WALKING" ? { distanceMeters: fromHome ? homeM : walkM, durationMillis: 1, condition: "ROUTE_EXISTS" } : { distanceMeters: 2000, durationMillis: driveS * 1000, condition: "ROUTE_EXISTS" };
    return { matrix: { rows: [{ items: [item] }] } }; } } }) } };
  return calls;
}

test("On your way out, Google's street distance timed at your pace sets the walk; the drive sets the cab; asked only when it matters", async () => {
  const T0 = at("2026-11-03", "07:00"), HOME = [51.9752, -0.2402];
  const app = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: HOME }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaTESTKEY" } });
  const c = app.c, calls = stubGoogle(app.w), P = app.w.CommuteCore.profiles.samCommute, st = P.stationGeo.LET;
  const put = (here) => { Object.assign(c.state, { here, locAcc: 15, lastFixAt: app.w.Date.now(), locStatus: "ok" }); };
  // At home: nothing asked (your measured walk is the answer there).
  put(HOME); await c.refreshGoogleNear(app.w.Date.now()); assert.equal(calls.length, 0);
  // Halfway to the station: walk, drive, and the walk from home once (for your pace along the streets).
  const mid = [(HOME[0] + st[0]) / 2, (HOME[1] + st[1]) / 2]; put(mid);
  const before = c.walkFromHere();
  await c.refreshGoogleNear(app.w.Date.now());
  assert.deepEqual(calls.map((x) => x.mode).sort(), ["DRIVING", "WALKING", "WALKING"]);
  const after = c.walkFromHere();
  assert.ok(Number.isFinite(after) && after !== before, `the walk now comes from the streets (${before} → ${after})`);
  assert.ok(Math.abs(after / (1500 / 2000) - (before / (core.km(mid, st) / core.km(HOME, st)))) < 1e-6, "the street share of your measured walk");
  const access = c.ranked(app.w.Date.now()).find((o) => o.access && o.access.driveSecs != null)?.access;
  assert.equal(access?.driveSecs, 420, "the drive reaches the plan");
  // Within 150 m and 3 minutes: not asked again; the walk from home isn't asked again at all.
  await c.refreshGoogleNear(app.w.Date.now() + 60e3); assert.equal(calls.length, 3);
  put([mid[0] + 0.003, mid[1]]); await c.refreshGoogleNear(app.w.Date.now() + 61e3);
  assert.deepEqual(calls.slice(3).map((x) => x.mode).sort(), ["DRIVING", "WALKING"]);
  assert.deepEqual(app.errors, []); app.close();
});

test("No Google route set up, example trains, or heading home: nothing is asked", async () => {
  const T0 = at("2026-11-03", "07:00"), mid = [51.9725, -0.2370];
  for (const [settings, saved] of [[{ provider: "tfl", tflKey: "k" }, { dirMode: "office" }], [{ provider: "demo", googleKey: "AIzaX" }, { dirMode: "office" }], [{ provider: "tfl", tflKey: "k", googleKey: "AIzaX" }, { dirMode: "home" }]]) {
    const app = await createApp({ now: T0, geo: null, saved, settings }), calls = stubGoogle(app.w);
    Object.assign(app.c.state, { here: mid, locAcc: 15, lastFixAt: app.w.Date.now(), locStatus: "ok" });
    await app.c.refreshGoogleNear(app.w.Date.now());
    assert.equal(calls.length, 0, JSON.stringify(settings) + JSON.stringify(saved)); app.close();
  }
});

test("Google is asked only within 3 km of the station and over 150 m from it, with a position good to 150 m, and never with simulated feeds", async () => {
  const T0 = at("2026-11-03", "07:00");
  const app = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: null }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaTESTKEY" } });
  const c = app.c, calls = stubGoogle(app.w), st = app.w.CommuteCore.profiles.samCommute.stationGeo.LET;
  const ask = async (here, acc = 15) => { c.googleNear.here = null; Object.assign(c.state, { here, locAcc: acc, lastFixAt: app.w.Date.now(), locStatus: "ok" }); const n = calls.length; await c.refreshGoogleNear(app.w.Date.now()); return calls.length - n; };
  assert.equal(await ask([st[0] + 0.0009, st[1]]), 0, "100 m from the station: at it, nothing asked");
  assert.equal(await ask([st[0] + 0.0018, st[1]]), 2, "200 m: walk and drive");
  assert.equal(await ask([st[0] + 0.026, st[1]]), 2, "2.9 km: asked");
  assert.equal(await ask([st[0] + 0.029, st[1]]), 0, "3.2 km: not on the way out");
  assert.equal(await ask([st[0] + 0.005, st[1]], 151), 0, "position worse than 150 m: not asked");
  app.close();
  const sim = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: null }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaX" } });
  sim.c.state.saved.settings.simulatedFeeds = true;   // switched on at run time (it is never loaded from storage)
  const simCalls = stubGoogle(sim.w);
  Object.assign(sim.c.state, { here: [st[0] + 0.005, st[1]], locAcc: 15, lastFixAt: sim.w.Date.now(), locStatus: "ok" });
  await sim.c.refreshGoogleNear(sim.w.Date.now()); assert.equal(simCalls.length, 0, "simulated feeds: never");
  sim.close();
});

test("Without a saved home the walk is the straight-line estimate scaled to the streets, and a walk longer than your usual one is no estimate; the result is used for 5 minutes within 150 m", async () => {
  const T0 = at("2026-11-03", "07:00");
  const app = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: null }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaTESTKEY" } });
  const c = app.c, st = app.w.CommuteCore.profiles.samCommute.stationGeo.LET, here = [st[0] + 0.004, st[1]];
  const d = core.km(here, st);
  stubGoogle(app.w, { walkM: Math.round(d * 1000 * 1.5) });   // the streets are 1.5 × the straight line
  Object.assign(c.state, { here, locAcc: 15, lastFixAt: app.w.Date.now(), locStatus: "ok" });
  const before = c.walkFromHere();                              // straight line × 1.3 at your pace
  await c.refreshGoogleNear(app.w.Date.now());
  const after = c.walkFromHere();
  assert.ok(Math.abs(after / before - 1.5 / 1.3) < 0.01, `${before} → ${after}`);
  // Five minutes on (same place): still used; just over: back to the estimate.
  app.setNow(T0 + 299e3); assert.ok(Math.abs(c.walkFromHere() - after) < 1e-6);
  app.setNow(T0 + 301e3); assert.ok(Math.abs(c.walkFromHere() - before) < 1e-6);
  // Google says the streets are very long: longer than your usual walk, so not on the way out.
  app.setNow(T0); stubGoogle(app.w, { walkM: 50000 }); c.googleNear.here = null; await c.refreshGoogleNear(app.w.Date.now());
  assert.equal(c.walkFromHere(), null);
  app.close();
});

test("The walk from your saved home is asked again if Google failed the first time", async () => {
  const T0 = at("2026-11-03", "07:00"), HOME = [51.9752, -0.2402];
  const app = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: HOME }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaTESTKEY" } });
  const c = app.c, st = app.w.CommuteCore.profiles.samCommute.stationGeo.LET;
  let fail = true; const calls = [];
  app.w.google = { maps: { importLibrary: async () => ({ RouteMatrix: { computeRouteMatrix: async (req) => {
    const fromHome = Math.abs(req.origins[0].lat - HOME[0]) < 1e-6; calls.push(fromHome);
    if (fromHome && fail) throw new Error("UNAVAILABLE");
    return { matrix: { rows: [{ items: [{ condition: "ROUTE_EXISTS", distanceMeters: fromHome ? 2000 : 1500, durationMillis: 1000 }] }] } }; } } }) } };
  const mid = [(HOME[0] + st[0]) / 2, (HOME[1] + st[1]) / 2];
  Object.assign(c.state, { here: mid, locAcc: 15, lastFixAt: app.w.Date.now(), locStatus: "ok" });
  await c.refreshGoogleNear(app.w.Date.now());
  fail = false; app.setNow(T0 + 4 * 60e3); c.state.lastFixAt = app.w.Date.now();
  await c.refreshGoogleNear(app.w.Date.now());
  assert.equal(calls.filter(Boolean).length, 2, "the walk from home is asked again after a failure");
  assert.equal(c.googleNear.homeM, 2000);
  app.close();
});

test("Re-asked after 3 minutes in the same place, not before; a result is only used within 150 m of where it was asked; with a home saved, streets longer than from home is no estimate", async () => {
  const T0 = at("2026-11-03", "07:00"), HOME = [51.9752, -0.2402];
  const app = await createApp({ now: T0, geo: null, saved: { dirMode: "office", home: HOME }, settings: { provider: "tfl", tflKey: "k", googleKey: "AIzaTESTKEY" } });
  const c = app.c, st = app.w.CommuteCore.profiles.samCommute.stationGeo.LET, mid = [(HOME[0] + st[0]) / 2, (HOME[1] + st[1]) / 2];
  let calls = stubGoogle(app.w);
  const put = (here) => Object.assign(c.state, { here, locAcc: 15, lastFixAt: app.w.Date.now(), locStatus: "ok" });
  put(mid); await c.refreshGoogleNear(app.w.Date.now()); const n = calls.length;
  app.setNow(T0 + 2 * 60e3); put(mid); await c.refreshGoogleNear(app.w.Date.now());
  assert.equal(calls.length, n, "2 minutes on, same place: not asked again");
  app.setNow(T0 + 3 * 60e3 + 1e3); put(mid); await c.refreshGoogleNear(app.w.Date.now());
  assert.ok(calls.length > n, "over 3 minutes: asked again");
  // 300 m on with no new answer: the street figure is not used there (back to the share of the straight line).
  const g = c.walkFromHere(); put([mid[0] + 0.0027, mid[1]]);
  const straight = c.walkFromHere(); assert.ok(Math.abs(straight - g) > 1, `${g} vs ${straight}`);
  // Google: 2.5 km of streets from here, 2 km from home: further than from home, so not on the way out.
  app.setNow(T0 + 10 * 60e3); calls = stubGoogle(app.w, { walkM: 2500, homeM: 2000 }); put(mid);
  c.googleNear.here = null; await c.refreshGoogleNear(app.w.Date.now());
  assert.equal(c.walkFromHere(), null);
  assert.deepEqual(app.errors, []); app.close();
});
