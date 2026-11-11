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
  // 10:05, already at the station: the time to be on the platform is a minute before the train, not the time a
  // fresh plan would have had you leave from here (which has passed, or soon will have).
  place(5, station);
  assert.match(panel(), /Be on the platform by\s*10:19/);
  assert.match(panel(), /On track · train departs in 15 min/);
  place(19, station);
  assert.match(panel(), /Be on the platform by\s*10:19/);
  place(19.5, station);
  assert.match(panel(), /Be on the platform by\s*10:20/, "inside the last minute: the departure itself, never a time that has passed");
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

test("Following, at the station on a fix only good to 200 m: the station rule still applies (it used to say 'Location unavailable' and never ask)", async () => {
  const { app, place, panel, station } = await following();
  place(19, station, { locAcc: 200 });
  assert.match(panel(), /Be on the platform by\s*10:19/);
  assert.match(panel(), /On track · train departs in 1 min|On track · train departing/);
  assert.doesNotMatch(panel(), /Location unavailable/);
  place(21, station, { locAcc: 200 });
  assert.match(panel(), /Departure just passed · confirm if you are on it/);
  place(23, station, { locAcc: 200 });
  assert.match(panel(), /You can no longer make your 10:20/);
  // 260 m: too vague to say you're at the station; the card says it doesn't know where you are.
  const vague = await following();
  vague.place(19, vague.station, { locAcc: 260 });
  assert.doesNotMatch(vague.panel(), /Be on the platform by/);
  assert.match(vague.panel(), /Location unavailable/);
  assert.deepEqual(app.errors, []);
});

// Homeward at 10:00 from the office: the 10:30 Thameslink from Farringdon (followed) and the 10:36 from King's Cross.
async function homeward() {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "home" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const far = svc({ from: "ZFD", to: "LET", dep: T0 + 30 * m, arr: T0 + 70 * m, operator: "Thameslink", serviceId: "TL", destination: "Cambridge" });
  const kx = svc({ from: "KGX", to: "LET", dep: T0 + 36 * m, arr: T0 + 68 * m, serviceId: "GN", destination: "Cambridge" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [kx] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink via Farringdon/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  return { app, c, P, place, panel: () => app.text("#followPanel") };
}

test("Homeward: 'Be on the platform by' only at the station your followed train leaves from: not at another London station, and not on the tube to it", async () => {
  const { app, c, P, place, panel } = await homeward();
  // 10:12, on the Circle line from Aldgate: judged by the tube, as before.
  c.state.saved.tubeRide = { hub: "ALD", from: "ALD", t: T0 + 10 * m, line: "Circle", vehicle: "v1", picked: true, rideMs: 8 * m, stop: "Farringdon", stopGeo: P.stationGeo.ZFD };
  place(12, [51.519, -0.094]);
  assert.doesNotMatch(panel(), /Be on the platform by/);
  assert.match(panel(), /On track · \d+ min at your connection/);
  // The tube card under it doesn't state a different journey (10 Nov 15:39: "get off at King's Cross", following Farringdon).
  const hero = app.d.querySelector("#hero");
  assert.ok(hero.classList.contains("shares-follow"));
  for (const n of hero.querySelectorAll(':scope > [data-block="then"]')) assert.equal(visible(app, n), false, "no 'Get off at King's Cross' under a route via Farringdon");
  assert.match(app.text("#followPanel .journey-progress"), /Aldgate → Farringdon/, "where you get off is still on the card");
  // 10:22, at Farringdon: at the station.
  c.state.saved.tubeRide = null;
  place(22, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.match(panel(), /Be on the platform by\s*10:29/);
  assert.match(panel(), /On track · train departs in 8 min/);
  assert.doesNotMatch(panel(), /Can't make it|no longer make|Leave by/);
  // 10:22 at King's Cross instead: a different station, so the plan from there decides.
  const other = await homeward();
  other.place(22, other.P.stationGeo.KGX, { atHub: "KGX" });
  assert.doesNotMatch(other.panel(), /Be on the platform by/);
  assert.deepEqual(app.errors, []); assert.deepEqual(other.app.errors, []);
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
    subsequentCallingPoints: [{ callingPoint: [{ crs: "KGX", locationName: "London Kings Cross", st: "10:50", et: "On time" },
      { crs: "ZFD", locationName: "Farringdon", st: "10:55", et: late ? hm(T0 + (56 + late) * m) : "On time" }] }] });
  const route = (u) => { if (!u.startsWith(PROXY)) return undefined; const b = u.match(/\/board\/[A-Z]{3}\/([A-Z]{3})/);
    return b ? json(board(b[1])) : u.endsWith("/status") ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true }) : /\/service\//.test(u) ? json(details()) : json([]); };
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY, followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0, route });
  const c = app.c;
  await c.refresh({ force: true }); await sleep(50);
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const boards = () => app.calls.filter((u) => /\/board\//.test(u));
  assert.ok(boards().length > 0 && boards().every((u) => !/offset=/.test(u)), "before the train leaves the boards are asked for from now");
  // 10:26: the train left at 10:20 and the app doesn't know whether you got on (no position): it already looks back.
  app.setNow(T0 + 26 * m); c.render();
  let mark = app.calls.length;
  await c.refresh({ force: true }); await sleep(80);
  let asked = app.calls.slice(mark);
  assert.ok(asked.filter((u) => /\/board\//.test(u)).length === 3 && asked.filter((u) => /\/board\//.test(u)).every((u) => /\?offset=-40$/.test(u)), `before you answer, the boards look back: ${asked.join(" ")}`);
  assert.ok(asked.some((u) => u === `${PROXY}/service/FAST`), "and the train's own reports are fetched before you answer");
  assert.equal(c.state.trainLock || null, null, "(not because a train was picked)");
  // You say you're on it; the phone still has no position (not on the line).
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
  assert.match(text, /At Farringdon\s*11:00/, "the train's own report of when it reaches your stop (the board still says 10:59)");
  assert.match(text, /About 5 min late/, "the lateness reaches the card: its arrival at your stop, 11:00 against 10:55 (11 Nov: the legs' own '4 min behind' is no longer repeated in the one card, #57 H10)");
  // 12:10, the route left running long after the train was due in: the look-back and the reports stop.
  app.setNow(T0 + 130 * m); c.render(); mark = app.calls.length;
  await c.refresh({ force: true }); await sleep(80);
  asked = app.calls.slice(mark);
  assert.ok(asked.filter((u) => /\/board\//.test(u)).every((u) => !/offset=/.test(u)), `no look-back two hours on: ${asked.join(" ")}`);
  assert.ok(!asked.some((u) => /\/service\//.test(u)), "and no more requests for that train's reports");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("One journey, no repeats: aboard, the followed card alone states the journey; the card under it keeps the stations and what you tap; other trains fold away", async () => {
  const { app, c, place, pointOn, click } = await following({}, 30);     // the 10:50 fast train; leave home by 10:24
  // 10:00, before you need to leave: nothing is folded.
  assert.equal(app.d.querySelector("#signalLaterTrains").hidden, true);
  assert.ok(visible(app, app.d.querySelector("#listTitle")));
  // Leave by 10:24. A minute before: still open. A minute after, before boarding: folded.
  assert.equal(hm(c.state.saved.followRoute.option.leave), "10:24");
  app.setNow(T0 + 23 * m); c.render();
  assert.equal(app.d.querySelector("#signalLaterTrains").hidden, true);
  app.setNow(T0 + 25 * m); c.render();
  assert.equal(app.d.querySelector("#signalLaterTrains").hidden, false, "set off: other trains fold away before you board");
  assert.equal(app.d.querySelector("#list").parentElement, app.d.querySelector("#signalLaterTrains"));
  // 11:04, on the line where the fast train should be.
  place(64, pointOn(14 / 35), { onLine: true });
  const hero = app.d.querySelector("#hero");
  assert.ok(hero.classList.contains("shares-follow"));
  for (const sel of ['[data-block="headline"]', ".journey-connection", '[data-block="then"]']) assert.equal(visible(app, hero.querySelector(`:scope > ${sel}`)), false, `${sel} isn't repeated under the followed card`);
  // What the live card still had to show is in the one journey card now (11 Nov: tests/single-card.test.mjs).
  assert.equal(hero.hidden, true);
  for (const sel of ['[data-block="label"]', ".journey-progress", ".pick"]) assert.ok(app.d.querySelector(`#followPanel ${sel}`), `${sel} is in the card`);
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
