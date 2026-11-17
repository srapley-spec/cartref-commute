// The independent review of the 17 Nov platform-time change: tests that pin its edges (exactly 2 minutes; exactly at
// the timetable time; 150 m and 200 m; the rows' exclusions; Trip's fallback order). docs/stories/follow-a-route.md,
// "Platform time and label".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll, IN_LONDON, sleep } from "./harness.mjs";
import { core, MIN } from "./core/helpers.mjs";
import { TRIP_SETTINGS, tripRoute, planBrightonCanterbury, until } from "./trip-fixtures.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
async function homeward(late = 0, kxLate = 0) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "home" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const far = svc({ from: "ZFD", to: "LET", std: "10:30", dep: T0 + (30 + late) * m, depLate: late, arr: T0 + (70 + late) * m, arrLate: late, operator: "Thameslink", serviceId: "TL", destination: "Cambridge", platform: "4" });
  const kx = svc({ from: "KGX", to: "LET", std: "10:36", dep: T0 + (36 + kxLate) * m, depLate: kxLate, arr: T0 + (68 + kxLate) * m, arrLate: kxLate, serviceId: "GN", destination: "Cambridge" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [kx] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink via Farringdon/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  const rows = () => [...app.d.querySelectorAll("#list .journey-heading")].map((h) => h.textContent.replace(/\s+/g, " "));
  const head = () => app.text("#followPanel .journey-heading");
  return { app, c, P, place, panel: () => app.text("#followPanel"), head, rows };
}
const SET_OFF = [51.5145, -0.0805];   // about 400 m from the office

// M06
test("Platform time (review): core: exactly at the timetable time the deadline is still the timetable time", () => {
  const o = { before: [{ kind: "walk", secs: 300 }, { kind: "margin", secs: 60 }] }, DEP = T0 + 30 * MIN;
  assert.equal(core.platformBy(o, DEP + 7 * MIN, DEP, DEP), DEP);
  assert.equal(core.platformBy(o, DEP + 7 * MIN, DEP + 1, DEP), DEP + 7 * MIN);
});

// M32
test("Platform time (review): rows: a late train's row is on its timetable time too", async () => {
  const { app, P, place, rows } = await homeward(7);
  place(1, P.places.office); place(8, SET_OFF);
  assert.ok(rows().some((h) => /Be on platform 4 at Farringdon by ?10:29/.test(h)), JSON.stringify(rows()));
  assert.ok(!rows().some((h) => /by ?10:36/.test(h)), JSON.stringify(rows()));
  assert.deepEqual(app.errors, []); app.close();
});

// M30
test("Platform time (review): way on: 'Instead: the …' for a late train is on its timetable time", async () => {
  const { app, P, place, panel } = await homeward(0, 5);
  place(21, P.places.office);
  place(22, P.stationGeo.KGX, { atHub: "KGX" });
  assert.match(panel(), /Instead: the 10:36 Great Northern to Cambridge Be on the platform at King's Cross by\s*10:35/);
  assert.deepEqual(app.errors, []); app.close();
});

// M12
test("Platform time (review): set off: a position exactly 2 minutes old still counts", async () => {
  const { app, P, place, head } = await homeward();
  place(1, P.places.office);
  place(8, SET_OFF, { lastFixAt: T0 + 6 * m });
  assert.match(head(), /Be on platform 4 at Farringdon by/);
  assert.deepEqual(app.errors, []); app.close();
});

// M14
test("Platform time (review): set off: a position only good to 200 m is not set off (150 m rule)", async () => {
  const { app, P, place, head } = await homeward();
  place(1, P.places.office);
  place(8, SET_OFF, { locAcc: 200 });
  assert.match(head(), /Leave by/); assert.doesNotMatch(head(), /Be on/);
  assert.deepEqual(app.errors, []); app.close();
});

// M16
test("Platform time (review): set off going home: 180 m from where you started following is not yet set off", async () => {
  const { app, P, place, head } = await homeward();
  const o = P.places.office;
  place(1, o);
  place(8, [o[0] + 0.0016, o[1]]);   // about 180 m
  assert.match(head(), /Leave by/); assert.doesNotMatch(head(), /Be on/);
  assert.deepEqual(app.errors, []); app.close();
});

// M18
test("Platform time (review): rows: at the station (the card says the platform), the rows keep Leave by", async () => {
  const { app, P, place, rows, head } = await homeward();
  place(1, P.places.office); place(8, SET_OFF);
  place(22, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.match(head(), /Be on platform 4 at Farringdon by/);
  assert.ok(rows().length > 0 && rows().every((h) => !/Be on/.test(h)), JSON.stringify(rows()));
  assert.deepEqual(app.errors, []); app.close();
});

// M20
test("Platform time (review): rows: with 'Arrive by' chosen the rows keep Leave by", async () => {
  const { app, c, P, place, rows } = await homeward();
  place(1, P.places.office); place(8, SET_OFF);
  c.state.saved.view = "by"; c.render();
  assert.ok(rows().length > 0 && rows().every((h) => /Leave by/.test(h) && !/Be on/.test(h)), JSON.stringify(rows()));
  assert.deepEqual(app.errors, []); app.close();
});

// M22, M21
const evening = Date.parse("2026-11-03T18:00:00Z");
function followDemo(a) {
  const entry = [...a.c.followChoices].find(([, o]) => o.effort === "walk" || o.recommended === 1); assert.ok(entry, "a followable journey");
  [...a.d.querySelectorAll("[data-follow]:not([disabled])")].find((b) => b.dataset.follow === entry[0]).click();
}
function fixDemo(a, now, here) { a.setNow(now); Object.assign(a.c.state, { here, lastFixAt: now, lastFixRecvAt: now, locAcc: 12, locStatus: "ok", atHub: null, onLine: false, boardsAt: now }); a.c.render(); }
const demoRows = (a) => [...a.d.querySelectorAll("#list .journey-heading")].map((h) => h.textContent.replace(/\s+/g, " "));
test("Platform time (review): rows: set off on a Leisure route, the Commute rows keep Leave by", async () => {
  const start = [IN_LONDON.coords.latitude, IN_LONDON.coords.longitude];
  const a = await createApp({ now: evening, saved: { dirMode: "home", mode: "leisure" }, geo: IN_LONDON, settings: { provider: "demo", followRoute: true } });
  await sleep(200); followDemo(a);
  fixDemo(a, evening + MIN, start); fixDemo(a, evening + 3 * MIN, [start[0] + 0.004, start[1]]);
  assert.match(a.text("#followPanel .journey-heading"), /Be on/);
  a.c.state.saved.mode = "commute"; a.c.render();
  assert.ok(demoRows(a).length > 0 && demoRows(a).every((h) => !/Be on/.test(h)), JSON.stringify(demoRows(a)));
  assert.deepEqual(a.errors, []); a.close();
});
test("Platform time (review): rows: set off on a homeward route, the rows for the office keep Leave by", async () => {
  const morning = Date.parse("2026-11-03T07:00:00Z"), HOME = [51.9752, -0.2402];
  const a = await createApp({ now: morning, saved: { dirMode: "home", home: HOME }, geo: null, settings: { provider: "demo", followRoute: true } });
  const office = a.w.CommuteCore.profiles.samCommute.places.office;
  fixDemo(a, morning, office); followDemo(a);
  fixDemo(a, morning + MIN, office); fixDemo(a, morning + 3 * MIN, [office[0] + 0.004, office[1]]);
  assert.match(a.text("#followPanel .journey-heading"), /Be on/);
  a.c.state.saved.dirMode = "office";
  fixDemo(a, morning + 4 * MIN, HOME);   // (a homeward route still before its train; rows now for the office)
  assert.equal(a.c.state.saved.followRoute?.direction, "home");
  assert.ok(demoRows(a).length > 0 && demoRows(a).every((h) => !/Be on/.test(h)), JSON.stringify(demoRows(a)));
  assert.deepEqual(a.errors, []); a.close();
});

// M35, M36
test("Platform time (review): Trip: inside the last allowance the timetable time; after it, the expected departure", async () => {
  const NOW = Date.parse("2026-11-03T09:40:00Z");
  const a = await createApp({ now: NOW, settings: TRIP_SETTINGS, route: tripRoute });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  const head = () => a.d.querySelector(".trip-follow-card .trip-headline > .journey-heading");
  const f = a.c.state.saved.tripMode.follow, j = f.journey, ride = j.rides[0], start = j.from.geo;
  const due = ride.schedDep; ride.dep = due + 6 * 60e3;
  const fixAt = (t) => { a.setNow(t); Object.assign(a.c.state, { here: [start[0] + 0.004, start[1]], locAcc: 15, lastFixAt: t, locStatus: "ok" }); a.c.render(); };
  // Seen at the start first (Trip's set off is "seen at the start, then 200 m from it", 17 Nov).
  a.setNow(due - 30e3); Object.assign(a.c.state, { here: start, locAcc: 15, lastFixAt: due - 30e3, locStatus: "ok" }); a.c.render();
  fixAt(due - 20e3);
  assert.equal(Number(head().querySelector("[data-cd]").dataset.cd), due, "inside the allowance: the timetable time");
  fixAt(due + 60e3);
  assert.equal(Number(head().querySelector("[data-cd]").dataset.cd), ride.dep, "after it: the expected departure");
  assert.deepEqual(a.errors, []); a.close();
});
