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
