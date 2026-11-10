// The 10 Nov evening batch on the followed card (issue #57; docs/stories/follow-a-route.md, "The tube named, one leave
// time, and a card that agrees with itself"): the tube line with its lozenges, one leave time, notices only for a
// real change, "N min later than planned".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, json, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const squash = (s) => s.replace(/\s+/g, " ");

// 10:00 at home, following the 10:50 Thameslink to Farringdon (or the 10:50 Great Northern to King's Cross).
async function outbound(hub = "ZFD") {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const tr = svc({ from: "LET", to: hub, dep: T0 + 50 * m, arr: T0 + 92 * m, operator: hub === "ZFD" ? "Thameslink" : "Great Northern", serviceId: "TR", destination: hub === "ZFD" ? "Brighton" : "King's Cross" });
  c.state.boards = { "LET-KGX": { msgs: [], services: hub === "KGX" ? [tr] : [] }, "LET-ZFD": { msgs: [], services: hub === "ZFD" ? [tr] : [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  app.d.querySelector("[data-follow]").click();
  const late = (min, now) => { tr.dep = T0 + (50 + min) * m; tr.depLate = min; tr.arr = T0 + (92 + min) * m; tr.arrLate = min; app.setNow(now); c.state.boardsAt = now; c.render(); };
  return { app, c, P, tr, late, panel: () => squash(app.text("#followPanel")) };
}

test("Going out, the followed card names the onward tube with its lines in their colours, before you leave and on the train", async () => {
  const { app, c, panel } = await outbound();
  const line = app.d.querySelector('#followPanel [data-block="tube-line"]');
  assert.ok(line, "the tube line is on the card");
  assert.equal(squash(line.textContent), "Then Circle Met to Aldgate · eastbound · about 7 minor H&C to Aldgate East · if it comes first");
  assert.deepEqual([...line.querySelectorAll(".chip")].map((n) => [n.textContent, n.className]), [["Circle", "chip circle"], ["Met", "chip met"], ["H&C", "chip hc"]]);
  assert.ok(line.compareDocumentPosition(app.d.querySelector("#followPanel .follow-status")) & 4, "under the train, above the status");
  // Aboard (your word): still there.
  app.setNow(T0 + 60 * m); c.state.boardsAt = T0 + 60 * m; c.render();
  app.d.querySelector('#followPanel [data-follow-action="boarded"]').click();
  assert.equal(c.state.saved.followRoute.phase, "on-train");
  assert.match(panel(), /Then Circle Met to Aldgate · eastbound · about 7 min/);
  // Off the train: the line goes (the tube card takes over), and so does the finished train.
  c.state.saved.followRoute.phase = "after-train"; c.render();
  assert.equal(app.d.querySelector('#followPanel [data-block="tube-line"]'), null);
  assert.equal(app.d.querySelector('#followPanel [data-fact="train-duration"]'), null);
  assert.deepEqual(app.errors, []);
  // Via King's Cross the ride is that route's own.
  const kx = await outbound("KGX");
  assert.match(kx.panel(), /Then Circle Met to Aldgate · eastbound · about 10 min/);
});

test("One leave time: when the train is late, the header's Leave by and the first step move together; 'Arrives first' is said once", async () => {
  const { app, late, panel } = await outbound();
  assert.match(panel(), /Leave by ?10:24/); assert.match(panel(), /Next: 10:24 · Leave Cartref/);
  late(3, T0 + 5 * m);
  assert.match(panel(), /Leave by ?10:27/);
  assert.match(panel(), /Next: 10:27 · Leave Cartref/, "the step is re-timed with the train, not left at 10:24");
  assert.match(squash(app.text("#followPanel .steps")), /10:27 ?Leave Cartref/);
  assert.equal(panel().match(/Arrives first/g).length, 1);
  assert.doesNotMatch(panel(), /· ·/, "no stray separator");
  assert.deepEqual(app.errors, []);
});

test("Notices: nothing for a two-minute wobble; three minutes says what changed and why, and closes with ✕; back at the plan it goes", async () => {
  const { app, late, panel } = await outbound();
  late(2, T0 + 5 * m);
  assert.match(panel(), /At office ?11:56/, "the card shows the new time");
  assert.equal(app.d.querySelector("#followPanel .banner"), null, "but two minutes is not a notice");
  late(3, T0 + 6 * m);
  const banner = app.d.querySelector("#followPanel .banner");
  assert.equal(squash(banner.querySelector("span").textContent), "Arriving 11:57 (was 11:54): your train is 3 min late.");
  assert.equal(banner.querySelector("b").textContent, "Arriving 11:57");
  const close = banner.querySelector('[data-follow-action="seen"]');
  assert.equal(close.textContent, "✕"); assert.equal(close.getAttribute("aria-label"), "Dismiss this notice");
  assert.doesNotMatch(panel(), /Seen/);
  late(1, T0 + 7 * m);
  assert.equal(app.d.querySelector("#followPanel .banner"), null, "back within three minutes of the plan: the notice is withdrawn");
  late(4, T0 + 8 * m);
  app.d.querySelector('#followPanel .banner [data-follow-action="seen"]').click();
  assert.equal(app.d.querySelector("#followPanel .banner"), null, "✕ dismisses it");
  late(5, T0 + 9 * m);
  assert.equal(app.d.querySelector("#followPanel .banner"), null, "a further minute doesn't bring one back");
  assert.deepEqual(app.errors, []);
});

test("'On track' only when arriving as planned or sooner: at the station with the train six minutes late it says so, in amber", async () => {
  const { app, c, P, late } = await outbound();
  const place = (now) => { app.setNow(now); c.state.boardsAt = now; Object.assign(c.state, { here: P.stationGeo.LET, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null }); c.render(); };
  place(T0 + 40 * m);
  let status = app.d.querySelector("#followPanel .follow-status");
  assert.equal(squash(status.textContent), "On track · train departs in 10 min"); assert.ok(status.classList.contains("ok"));
  late(6, T0 + 41 * m); place(T0 + 41 * m);
  status = app.d.querySelector("#followPanel .follow-status");
  assert.equal(squash(status.textContent), "6 min later than planned · train departs in 15 min");
  assert.ok(status.classList.contains("warn") && !status.classList.contains("ok"));
  assert.deepEqual(app.errors, []);
});

// Homeward at 10:00 from the office, following the 10:30 Thameslink from Farringdon.
test("Coming home, the followed card names the tube first: 'Tube: Circle Met Aldgate → Farringdon · 7 min', until you're at a London station", async () => {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "home" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const far = svc({ from: "ZFD", to: "LET", dep: T0 + 30 * m, arr: T0 + 70 * m, operator: "Thameslink", serviceId: "TL", destination: "Cambridge" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  app.d.querySelector("[data-follow]").click();
  const line = () => app.d.querySelector('#followPanel [data-block="tube-line"]');
  assert.equal(squash(line().textContent), "Tube: Circle Met Aldgate → Farringdon · 7 min");
  assert.deepEqual([...line().querySelectorAll(".chip")].map((n) => n.className), ["chip circle", "chip met"]);
  assert.ok(line().compareDocumentPosition(app.d.querySelector("#followPanel .journey-service, #followPanel [data-block='next-service'], #followPanel .follow-status")) & 4, "before the train on the card");
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); };
  // On the tube: still named (it is where the card says which way you're going).
  c.state.saved.tubeRide = { hub: "ALD", from: "ALD", t: T0 + 10 * m, line: "Circle", vehicle: "v1", picked: true, rideMs: 8 * m, stop: "Farringdon", stopGeo: P.stationGeo.ZFD };
  place(12, [51.519, -0.094]);
  assert.ok(line());
  // At Farringdon, or at King's Cross: the tube is behind you (or not the one to take from here).
  c.state.saved.tubeRide = null;
  place(22, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.equal(line(), null);
  place(22, P.stationGeo.KGX, { atHub: "KGX" });
  assert.equal(line(), null);
  assert.deepEqual(app.errors, []);
});

test("One leave time holds after the saved leave time has passed: a much later train moves the header and the first step together, and no step already due comes back as 'Next'", async () => {
  const { app, c, P, late, panel } = await outbound();
  // 10:26, two minutes after the saved Leave by (10:24), still at home; the train is now 15 minutes late.
  late(15, T0 + 26 * m);
  assert.match(panel(), /Leave by ?10:39/);
  const steps = squash(app.text("#followPanel .steps"));
  assert.match(steps, /10:39 ?Leave Cartref/, "the first step carries the header's time");
  assert.doesNotMatch(steps, /10:24/, "not the time saved when you followed");
  // At the station as the (late) train is awaited: what's next is the train, not a step already done.
  const now = T0 + 55 * m; app.setNow(now); c.state.boardsAt = now;
  Object.assign(c.state, { here: P.stationGeo.LET, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null }); c.render();
  assert.match(panel(), /Next: 11:05 · 10:50 \(exp 11:05\) Thameslink from Letchworth/);
  assert.doesNotMatch(panel(), /Next: [^·]*· Leave Cartref/);
  assert.deepEqual(app.errors, []);
});

test("TfL's location text is kept from the live feeds (it is what 'where your tube is' is drawn from)", async () => {
  const raw = (extra) => ({ vehicleId: "217", lineId: "circle", platformName: "Eastbound - Platform 1", destinationName: "Edgware Road (Circle Line) Underground Station",
    expectedArrival: new Date(T0 + 4 * m).toISOString(), timestamp: new Date(T0).toISOString(), naptanId: "940GZZLUALD", currentLocation: "Between Liverpool Street and Aldgate", ...extra });
  const app = await createApp({ settings: { provider: "demo", tflKey: "" }, saved: { dirMode: "office" }, geo: null, now: T0,
    route: (u) => /StopPoint\/940GZZLUALD\/Arrivals/.test(u) ? json([raw({})]) : /StopPoint\/[^/]+\/Arrivals/.test(u) ? json([raw({ platformName: "Westbound - Platform 2", naptanId: "940GZZLUFCN", currentLocation: "At Barbican Platform 1" })]) : undefined });
  const office = await app.c.fetchAldgateArrivals();
  assert.equal(office[0].where, "Between Liverpool Street and Aldgate");
  const home = await app.c.fetchTubeArrivals("ZFD", "westbound");
  assert.equal(home[0].where, "At Barbican Platform 1");
  assert.equal(app.w.CommuteCore.followTubeWhere(home, "217", "circle"), "At Barbican");
  assert.deepEqual(app.errors, []);
});
