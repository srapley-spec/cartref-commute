// While you follow a route: one source of truth, live times kept after the train leaves, and one journey with no
// repeats (docs/stories/follow-a-route.md; issue #57 H15, H20, H23, C3, C5). From Sam's journeys on 10 Nov 2026.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, json, sleep, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const visible = (app, el) => { let n = el; while (n && n.nodeType === 1) { if (n.hidden || app.w.getComputedStyle(n).display === "none") return false; n = n.parentElement; } return true; };

// 10:00 at home: the 10:15 stopper and the 10:20 fast train to King's Cross; you follow the fast one.
// `shift`: run the same trains that many minutes later (so 10:00 is before you need to leave).
async function following(extra = {}, shift = 0) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0, ...extra });
  const c = app.c, K = app.w.CommuteCore, P = K.profiles.samCommute, line = P.lines.KGX;
  const fast = svc({ from: "LET", to: "KGX", dep: T0 + (shift + 20) * m, arr: T0 + (shift + 55) * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton" });
  const slow = svc({ from: "LET", to: "KGX", dep: T0 + (shift + 15) * m, arr: T0 + (shift + 70) * m, operator: "Great Northern", serviceId: "SLOW", destination: "King's Cross" });
  c.state.boards = { "LET-KGX": { msgs: [], services: [slow, fast] }, "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const seg = line.slice(1).map((p, i) => K.km(line[i], p)), total = seg.reduce((a, b) => a + b, 0);
  const pointOn = (f) => { let d = f * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.max(0, Math.min(1, d / seg[i]));
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]; } d -= seg[i]; } };
  // Put the phone somewhere at a time, with a good fresh fix unless told otherwise.
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  const panel = () => app.text("#followPanel");
  const click = (sel) => { const b = app.d.querySelector(sel); assert.ok(b, `${sel} is on screen`); b.click(); };
  return { app, c, K, P, fast, slow, pointOn, place, panel, click, station: P.stationGeo.LET };
}

test("Following, at the station before your train: 'Be on the platform by', on track until it goes; never 'Can't make it' from a plan that still has you walking there", async () => {
  const { app, c, place, panel, station } = await following();
  // 10:19, on the platform, a minute before the 10:20.
  place(19, station);
  assert.match(panel(), /Be on the platform by/);
  assert.doesNotMatch(panel(), /Leave by|leave in |Walk at your usual pace|Can't make it|no longer make/);
  assert.match(panel(), /On track · train departs in 1 min|On track · train departing/);
  assert.match(panel(), /At office/, "the arrival is still shown");
  assert.equal(c.state.saved.followRoute.incident ?? null, null);
  // 10:21: it has just gone and the app doesn't know whether you got on: it asks.
  place(21, station);
  assert.match(panel(), /Departure just passed · confirm if you are on it/);
  assert.ok(app.d.querySelector('#followPanel [data-follow-action="boarded"]'), "with 'I'm on it' to answer");
  assert.doesNotMatch(panel(), /no longer make/);
  // 10:23: still standing at the station with a fresh fix: now it is missed.
  place(23, station);
  assert.match(panel(), /You can no longer make your 10:20/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Following, away from the station with no time left to walk there: the plan's 'Can't make it' still shows (the rule only changes once you're at the station)", async () => {
  const { place, panel, pointOn } = await following();
  place(19, [51.99, -0.25]);                      // a couple of km from Letchworth station, a minute before the train
  assert.match(panel(), /Can't make it|no longer make/);
  assert.doesNotMatch(panel(), /Be on the platform by/);
});

test("Following, last seen at the station and then no position (underground): not 'missed'; after departure it asks whether you're on it", async () => {
  const { app, place, panel, station } = await following();
  place(19, station);
  place(27, station, { lastFixAt: T0 + 19 * m });   // 10:27, the last fix is eight minutes old
  assert.doesNotMatch(panel(), /no longer make|Can't make it/);
  assert.match(panel(), /Departure passed · confirm if you are on it/);
  assert.ok(app.d.querySelector('#followPanel [data-follow-action="boarded"]'));
  app.close();
});

test("Following, aboard but the phone isn't placed on the line (a reload, underground): the train is kept on the boards and its lateness reaches the card", async () => {
  const PROXY = "https://cartref-rail.example.workers.dev";
  let late = 0;
  const board = (to) => ({ locationName: "Letchworth", trainServices: [{ serviceID: "FAST", std: "10:20", etd: late ? hm(T0 + (20 + late) * m) : "On time", operator: "Thameslink", platform: "1",
    destination: [{ locationName: "Brighton" }], subsequentCallingPoints: [{ callingPoint: [{ crs: to, locationName: to, st: "10:55", et: late ? hm(T0 + (55 + late) * m) : "On time" }] }] }], nrccMessages: [] });
  const details = () => ({ locationName: "Letchworth", crs: "LET", std: "10:20", atd: late ? hm(T0 + (20 + late) * m) : "On time", operator: "Thameslink",
    subsequentCallingPoints: [{ callingPoint: [{ crs: "KGX", locationName: "London Kings Cross", st: "10:55", et: late ? hm(T0 + (55 + late) * m) : "On time" }] }] });
  const route = (u) => { if (!u.startsWith(PROXY)) return undefined; const b = u.match(/\/board\/[A-Z]{3}\/([A-Z]{3})/);
    return b ? json(board(b[1])) : u.endsWith("/status") ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true }) : /\/service\//.test(u) ? json(details()) : json([]); };
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY, followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0, route });
  const c = app.c;
  await c.refresh({ force: true }); await sleep(50);
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const boards = () => app.calls.filter((u) => /\/board\//.test(u));
  assert.ok(boards().length > 0 && boards().every((u) => !/offset=/.test(u)), "before the train leaves the boards are asked for from now");
  // 10:26: the train left at 10:20; you say you're on it; the phone has no position (not on the line).
  app.setNow(T0 + 26 * m); c.render();
  app.d.querySelector('#followPanel [data-follow-action="boarded"]').click();
  assert.equal(c.state.saved.followRoute.phase, "on-train"); assert.ok(!c.state.onLine, "the phone is not placed on the line");
  late = 4; const before = app.calls.length;
  await c.refresh({ force: true }); await sleep(80);
  const made = app.calls.slice(before);
  assert.ok(made.filter((u) => /\/board\//.test(u)).length > 0 && made.filter((u) => /\/board\//.test(u)).every((u) => /\?offset=-40$/.test(u)), `the boards look back 40 minutes: ${made.join(" ")}`);
  assert.ok(made.some((u) => u === `${PROXY}/service/FAST`), "and the train's own reports are fetched");
  assert.equal(made.filter((u) => /\/board\//.test(u)).length, 3, "the same three boards: no extra requests");
  const text = app.text("#followPanel");
  assert.doesNotMatch(text, /waiting for fresh data/);
  assert.match(text, /At Farringdon\s*10:59/, "the live arrival at your stop, four minutes late");
  assert.match(text, /4 min late/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("One journey, no repeats: aboard, the followed card alone states the journey; the card under it keeps the stations and what you tap; other trains fold away", async () => {
  const { app, c, place, pointOn, click } = await following({}, 30);     // the 10:50 fast train; leave home by 10:28
  // 10:00, before you need to leave: nothing is folded.
  assert.equal(app.d.querySelector("#signalLaterTrains").hidden, true);
  assert.ok(visible(app, app.d.querySelector("#listTitle")));
  // 11:04, on the line where the fast train should be.
  place(64, pointOn(14 / 35), { onLine: true });
  const hero = app.d.querySelector("#hero");
  assert.ok(hero.classList.contains("shares-follow"));
  for (const sel of ['[data-block="headline"]', ".journey-connection", '[data-block="then"]']) assert.equal(visible(app, hero.querySelector(`:scope > ${sel}`)), false, `${sel} isn't repeated under the followed card`);
  for (const sel of ['[data-block="label"]', ".journey-progress", ".pick"]) assert.ok(visible(app, hero.querySelector(sel)), `${sel} stays`);
  assert.match(app.text("#followPanel"), /At King's Cross\s*11:25.*At office/, "the followed card states the journey");
  // The list of other trains is folded away once you've set off.
  const later = app.d.querySelector("#signalLaterTrains");
  assert.equal(later.hidden, false); assert.equal(later.open, false);
  assert.equal(later.querySelector("summary").textContent, "Other trains");
  assert.equal(app.d.querySelector("#list").parentElement, later);
  assert.equal(visible(app, app.d.querySelector("#listTitle")), false);
  // Select a different train instead: that card is about another journey, so it is shown in full.
  click('[data-pick="Great Northern|10:45|LET|SLOW"]'); click("[data-pick-confirmed]");
  assert.equal(hero.classList.contains("shares-follow"), false);
  assert.ok(visible(app, hero.querySelector(':scope > [data-block="headline"]')));
  // Stop following: everything is back where it was.
  click('#followPanel [data-follow-action="stop"]');
  assert.equal(hero.classList.contains("shares-follow"), false);
  assert.equal(app.d.querySelector("#signalLaterTrains").hidden, true);
  assert.notEqual(app.d.querySelector("#list").parentElement, later);
  assert.ok(visible(app, app.d.querySelector("#listTitle")));
  assert.deepEqual(app.errors, []);
  app.close();
});
