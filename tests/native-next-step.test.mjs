// The lock screen says what to do next (#57 H29, 19 Nov 2026). At King's Cross off the 07:30 Great Northern, the
// iPhone's Live Activity showed "Next action 08:15 · in 4:05" and, under it, the train already left ("07:30 Great
// Northern · 3 min late · Platform 1"), while the page said "Get on the Met to Aldgate · eastbound · Platform 2 · due
// 08:20". The snapshot now carries the page's instruction (`step`) and drops the train once you're off it.
// docs/stories/ios-native.md, "What to do next on the lock screen".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);

// Following the 10:20 Thameslink to King's Cross (office), or the 10:30 from Farringdon (home).
async function journey(dir = "office") {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: dir }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const boards = dir === "home"
    ? { "KGX-LET": [], "ZFD-LET": [svc({ from: "ZFD", to: "LET", dep: T0 + 30 * m, arr: T0 + 70 * m, operator: "Thameslink", serviceId: "TL", destination: "Cambridge", platform: "4" })], "STP-LET": [] }
    : { "LET-KGX": [svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton", platform: "4", depLate: 3, arrLate: 3 })], "LET-ZFD": [], "LET-STP": [] };
  c.state.boards = Object.fromEntries(Object.entries(boards).map(([k, services]) => [k, { msgs: [], services }]));
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now; c.state.fetchedAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  return { app, c, P, place };
}

test("Lock screen at the change station: the page's 'Get on the …' with its platform and due time; the train you got off has gone", async () => {
  const { app, c, P, place } = await journey();
  c.state.saved.followRoute.phase = "after-train";
  c.state.tube = { hub: "KGX", at: T0 + 57 * m, arrivals: [{ t: T0 + 70 * m, line: "Metropolitan", lineId: "metropolitan", platform: "Eastbound - Platform 2", dest: "Aldgate", vehicle: "v2" }] };
  place(57, P.stationGeo.KGX, { atHub: "KGX" });
  const s = c.nativeSnapshot();
  assert.ok(s, "a snapshot while following");
  assert.match(app.d.querySelector("#followPanel").textContent.replace(/\s+/g, " "), /Get on the Metropolitan to Aldgate/, "(the page says it)");
  assert.equal(s.step && s.step.text, "Get on the Metropolitan to Aldgate", "the instruction, in the page's words");
  assert.equal(s.step.detail, `eastbound · Platform 2 · due ${hm(T0 + 70 * m)}`, "with direction, platform and due time; no ticking countdown or 'to spare'");
  assert.equal(s.train, null, "the train you got off is not on the lock screen");
  assert.equal(s.status, null, "nor its '3 min late'");
  assert.deepEqual(app.errors, []);
});

test("Lock screen with no live tubes yet: 'Get on the next Circle or Met eastbound to Aldgate'", async () => {
  const { app, c, P, place } = await journey();
  c.state.saved.followRoute.phase = "after-train";
  c.state.tube = { hub: "KGX", at: T0 + 57 * m, arrivals: [] };
  place(57, P.stationGeo.KGX, { atHub: "KGX" });
  const s = c.nativeSnapshot();
  assert.equal(s.step && s.step.text, "Get on the next Circle or Met eastbound to Aldgate");
  assert.equal(s.step.detail, null);
  assert.deepEqual(app.errors, []);
});

test("Lock screen on the tube to the office: 'Your tube: …' and where to get off", async () => {
  const { app, c, place } = await journey();
  c.state.saved.followRoute.phase = "after-train";
  c.state.saved.tubeRide = { hub: "KGX", from: "KGX", t: T0 + 63 * m, line: "Metropolitan", vehicle: "v2", picked: true, rideMs: 9 * m, stop: "Aldgate", stopGeo: [51.5142, -0.0755] };
  place(66, [51.5205, -0.097]);
  const s = c.nativeSnapshot();
  assert.match(s.step && s.step.text, /^Your tube: /);
  assert.equal(s.step.detail, "Get off at Aldgate");
  assert.equal(s.train, null);
  assert.deepEqual(app.errors, []);
});

test("Lock screen before and on the train: no step, the train stays (it is what to do next)", async () => {
  const { app, c, place } = await journey();
  place(5, null);
  const s = c.nativeSnapshot();
  assert.equal(s.step, null, "the headline and the train already say it");
  assert.ok(s.train && /Thameslink/.test(s.train.name), "the train you're following");
  assert.equal(s.status && s.status.text, "3 min late");
  assert.deepEqual(app.errors, []);
});

test("Coming home on the tube: the step names your tube and where to get off; the train still ahead stays", async () => {
  const { app, c, P, place } = await journey("home");
  c.state.saved.tubeRide = { hub: "ALD", from: "ALD", t: T0 + 10 * m, line: "Circle", vehicle: "v1", picked: true, rideMs: 8 * m, stop: "Farringdon", stopGeo: P.stationGeo.ZFD };
  place(12, [51.519, -0.094]);
  const s = c.nativeSnapshot();
  assert.match(s.step && s.step.text, /^Your tube: the Circle/);
  assert.equal(s.step.detail, "Get off at Farringdon");
  assert.ok(s.train && /Thameslink/.test(s.train.name), "the train home is still ahead, so it stays");
  // Off the train at Letchworth: the train leaves the lock screen.
  c.state.saved.tubeRide = null; c.state.saved.followRoute.phase = "after-train"; place(75, P.stationGeo.LET);
  const off = c.nativeSnapshot();
  assert.equal(off.train, null); assert.equal(off.status, null);
  assert.deepEqual(app.errors, []);
});

test("Trip: the lock screen's step is the followed card's 'Next action', and the train is the one still ahead", async () => {
  const { TRIP_SETTINGS, tripRoute, planBrightonCanterbury, until } = await import("./trip-fixtures.mjs");
  const a = await createApp({ now: Date.parse("2026-11-03T09:40:00Z"), settings: TRIP_SETTINGS, route: tripRoute });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  const shown = a.d.querySelector("#tripRoot .trip-follow-card [data-native-step]");
  assert.ok(shown, "(the followed Trip card has a Next action)");
  const s = a.c.nativeSnapshot();
  assert.equal(s.step && s.step.text, shown.textContent.replace(/\s+/g, " ").trim());
  const f = a.c.state.saved.tripMode.follow, firstRail = f.journey.rides.find((x) => x.kind === "rail");
  assert.ok(s.train && s.train.from === firstRail.from.name, "before setting off, the first train");
  // After the last train: no train on the lock screen.
  f.arrivedAt = null; f.alightedRide = f.journey.rides.length - 1;
  const after = a.c.nativeSnapshot();
  assert.equal(after.train, null, "off the last train it leaves the lock screen");
  assert.deepEqual(a.errors, []); a.close();
});
