// The wrong train (docs/stories/which-train.md; issue #57 C1). 10 Nov 2026: following and riding the 07:20 fast
// train, Sam selected the late 07:15 stopper in the "which train" list. Nothing asked, and nothing warned until he
// saw it listing stops his train wasn't making. Now: selecting a train other than the one you're following asks
// first; a station report the selected train can't share with you asks which train you're on; and a doubted train's
// station reports stay hidden until you answer.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const FAST = "Thameslink|10:20|LET|FAST", SLOW = "Great Northern|10:15|LET|SLOW";

// 10:00 at home: the 10:15 stopper and the 10:20 fast train; you follow the fast one. Then 10:34, on the line,
// 1.5 km short of Knebworth with a good fix.
// `where`: how far along the line you are (default: 1.5 km short of Knebworth, where the fast train fits best).
async function aboard({ follow = true, where = null } = {}) {
  const app = await createApp({ settings: { provider: "demo", followRoute: follow }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, K = app.w.CommuteCore, P = K.profiles.samCommute, line = P.lines.KGX;
  const fast = svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton" });
  const slow = svc({ from: "LET", to: "KGX", dep: T0 + 15 * m, arr: T0 + 70 * m, operator: "Great Northern", serviceId: "SLOW", destination: "King's Cross" });
  c.state.boards = { "LET-KGX": { msgs: [], services: [slow, fast] }, "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.status = []; c.state.nrStatus = []; c.render();
  if (follow) [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const seg = line.slice(1).map((p, i) => K.km(line[i], p)), total = seg.reduce((a, b) => a + b, 0);
  const pointOn = (f) => { let d = f * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.max(0, Math.min(1, d / seg[i]));
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]; } d -= seg[i]; } };
  const frac = (code) => K.lineProgress(P.stationGeo[code], line).frac;
  const now = T0 + 34 * m; app.setNow(now);
  Object.assign(c.state, { here: pointOn(where ?? frac("KBW") - 1.5 / total), locAcc: 20, lastFixAt: now, onLine: true, atHub: null, locStatus: "ok", trainLock: null });
  c.render();
  // What National Rail reports for the stopper: stations it has left, with the time.
  const report = (leftCode, leftName, leftAt) => {
    const stops = [["LET", "Letchworth", 15], ["HIT", "Hitchin", 20], ["SVG", "Stevenage", 25], ["KBW", "Knebworth", 32], ["WLW", "Welwyn North", 36], ["WGC", "Welwyn Garden City", 40], ["KGX", "King's Cross", 70]]
      .map(([code, name, min]) => ({ code, name, scheduledAt: T0 + min * m }));
    const upTo = stops.findIndex((s) => s.code === leftCode);
    const calls = stops.map((s, i) => ({ ...s, actualAt: i < upTo ? s.scheduledAt : i === upTo ? leftAt : null, expectedAt: i > upTo ? s.scheduledAt : null, cancelled: false, noEstimate: false }));
    const next = calls[upTo + 1];
    c.state.progressById = { SLOW: { id: "SLOW", at: c.state.lastFixAt, err: null, data: { last: { name: leftName, code: leftCode, t: leftAt, late: 0 }, next: { name: next.name, code: next.code, t: next.expectedAt },
      at: (code) => { const x = calls.find((k) => k.code === code); return x ? x.actualAt ?? x.expectedAt : null; }, calls, cancelled: false, reason: "" } } };
  };
  const hero = () => app.text("#hero");
  const click = (sel) => { const b = app.d.querySelector(sel); assert.ok(b, `${sel} is on screen`); b.click(); };
  return { app, c, now, report, hero, click, pointOn, frac, total };
}

test("Wrong train: selecting a train other than the one you're following asks first; Stay changes nothing, Switch selects it", async () => {
  const { app, c, hero, click } = await aboard();
  assert.match(hero(), /Which train are you on\?10:20 Thameslink to Brighton10:15 Great Northern to King's Cross/);
  click(`[data-pick="${SLOW}"]`);
  assert.equal(c.state.trainLock, null, "not selected yet");
  assert.match(app.text("[data-pending-pick]"), /^You're following the 10:20 Thameslink to Brighton\. Switch to the 10:15 Great Northern to King's Cross\?/);
  assert.deepEqual([...app.d.querySelectorAll("[data-pending-pick] button")].map((b) => b.textContent), ["Switch to the 10:15 Great Northern to King's Cross", "Stay on the 10:20 Thameslink to Brighton"]);
  assert.equal(app.d.querySelectorAll("#hero .pick").length, 1, "the question replaces the list while it's open");
  click("[data-pick-cancel]");
  assert.equal(c.state.trainLock, null); assert.equal(app.d.querySelector("[data-pending-pick]"), null);
  assert.match(hero(), /Which train are you on\?/, "back to the list");
  // Again, and this time switch.
  click(`[data-pick="${SLOW}"]`); click("[data-pick-confirmed]");
  assert.equal(c.state.trainLock.serviceId, "SLOW"); assert.equal(c.state.trainLock.picked, true);
  assert.equal(app.d.querySelector("[data-pending-pick]"), null);
  assert.match(hero(), /You're on the 10:15 Great Northern to King's Cross.*you picked this/);
  assert.equal(c.state.saved.followRoute.option.train.serviceId, "FAST", "the route you follow is not changed by the selection");
  app.close();
});

test("Wrong train: selecting the train you're following, or any train when you follow nothing, doesn't ask", async () => {
  const a = await aboard();
  a.click(`[data-pick="${FAST}"]`);
  assert.equal(a.c.state.trainLock.serviceId, "FAST"); assert.equal(a.app.d.querySelector("[data-pending-pick]"), null);
  a.app.close();
  const b = await aboard({ follow: false });
  b.click(`[data-pick="${SLOW}"]`);
  assert.equal(b.c.state.trainLock.serviceId, "SLOW"); assert.equal(b.app.d.querySelector("[data-pending-pick]"), null);
  b.app.close();
});

test("Wrong train: the selected train left Knebworth before you got there → the card says so and asks; the train you're following is offered first; its station reports are hidden", async () => {
  const { app, c, report, hero, click } = await aboard();
  click(`[data-pick="${SLOW}"]`); click("[data-pick-confirmed]");
  report("SVG", "Stevenage", T0 + 25 * m); c.render();          // it left Stevenage, which you've passed too: no evidence
  assert.equal(app.d.querySelector("[data-wrong-train]"), null);
  assert.match(hero(), /You're on the 10:15 Great Northern/);
  assert.match(hero(), /Last reported: Stevenage/);
  assert.ok(app.d.querySelectorAll(".journey-progress .jp-stop").length >= 3, "its stations are drawn while it's your train");
  report("KBW", "Knebworth", T0 + 32 * m); c.render();          // it left Knebworth at 10:32; at 10:34 you're 1.5 km short
  const panel = app.d.querySelector("[data-wrong-train]");
  assert.ok(panel, "the question is on the card");
  assert.match(panel.textContent, /^The 10:15 Great Northern to King's Cross stopped at Knebworth at 10:32; you didn't\. Which train are you on\?/);
  assert.deepEqual([...panel.querySelectorAll("button")].map((b) => b.textContent), ["10:20 Thameslink to Brighton · the train you're following", "Keep the 10:15 Great Northern to King's Cross"]);
  assert.equal(c.state.trainLock.serviceId, "SLOW", "the app never switches for you");
  assert.match(hero(), /Probably the 10:15 Great Northern/, "and no longer says you're on it");
  assert.doesNotMatch(hero(), /Last reported: Knebworth/, "the doubted train's report isn't shown");
  assert.equal(app.d.querySelectorAll(".journey-progress .jp-stop").length, 0, "nor its stations");
  assert.match(app.text(".journey-progress"), /Train not confirmed/);
  assert.match(app.text(".journey-progress"), /Station reports are hidden until you say which train you’re on\./);
  assert.ok(app.d.querySelectorAll(".journey-progress .jp-leg").length >= 2, "Journey stages stay");
  // Answer with the train you're following: selected without a second question.
  click(`[data-wrong-train] [data-pick="${FAST}"]`);
  assert.equal(c.state.trainLock.serviceId, "FAST");
  assert.equal(app.d.querySelector("[data-wrong-train]"), null); assert.equal(app.d.querySelector("[data-pending-pick]"), null);
  assert.match(hero(), /You're on the 10:20 Thameslink to Brighton.*you picked this/);
  app.close();
});

test("Wrong train: 'Keep' answers that evidence only: not asked again for it, asked again when the next station contradicts it", async () => {
  const { app, c, report, hero, click, pointOn, frac, total } = await aboard();
  click(`[data-pick="${SLOW}"]`); click("[data-pick-confirmed]");
  report("KBW", "Knebworth", T0 + 32 * m); c.render();
  click("[data-wrong-train] [data-keep]");
  assert.equal(c.state.trainLock.serviceId, "SLOW"); assert.equal(c.state.trainLock.kept, `left-before-you|KBW|${T0 + 32 * m}`);
  assert.equal(app.d.querySelector("[data-wrong-train]"), null, "not asked again");
  assert.equal(app.d.querySelector("[data-pending-pick]"), null, "keeping the train already selected isn't a switch");
  assert.match(hero(), /You're on the 10:15 Great Northern to King's Cross.*you picked this/);
  c.render(); assert.equal(app.d.querySelector("[data-wrong-train]"), null, "still quiet on the next draw");
  // 10:38: it has left Welwyn North too (10:36); you're only just past Knebworth.
  const now = T0 + 38 * m; app.setNow(now);
  Object.assign(c.state, { here: pointOn(frac("KBW") + 0.5 / total), lastFixAt: now });
  report("WLW", "Welwyn North", T0 + 36 * m); c.render();
  assert.match(app.text("[data-wrong-train]"), /stopped at Welwyn North at 10:36; you didn't\. Which train are you on\?/);
  app.close();
});

test("Wrong train: a rough or old position can't raise the question", async () => {
  const { app, c, report, click, now } = await aboard();
  click(`[data-pick="${SLOW}"]`); click("[data-pick-confirmed]");
  report("KBW", "Knebworth", T0 + 32 * m);
  c.state.locAcc = 400; c.render();                               // a Wi-Fi or mast position
  assert.equal(app.d.querySelector("[data-wrong-train]"), null);
  c.state.locAcc = 20; c.state.lastFixAt = now - 3 * m; c.render();   // a good fix, but three minutes old
  assert.equal(app.d.querySelector("[data-wrong-train]"), null);
  c.state.lastFixAt = now; c.render();
  assert.ok(app.d.querySelector("[data-wrong-train]"), "a good, fresh fix does");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("I'm on it: when the app can't tell two trains apart it asks which, the one you follow first; your answer is taken at its word", async () => {
  // Where the stopper should be by its timetable; the fast train is two minutes of travel further on.
  const { app, c, hero, click } = await aboard({ where: 19 / 55 });
  assert.match(hero(), /Probably the 10:15 Great Northern to King's Cross .*or the 10:20 Thameslink to Brighton/);
  assert.equal(c.state.saved.followRoute.phase, "before-train");
  click('#followPanel [data-follow-action="boarded"]');
  assert.equal(c.state.trainLock, null, "nothing is confirmed yet");
  assert.equal(c.state.saved.followRoute.phase, "before-train");
  const ask = app.d.querySelector("#followPanel [data-boarding-ask]");
  assert.ok(ask, "the question is on the followed card");
  assert.match(ask.textContent, /^Which train are you on\?/);
  assert.deepEqual([...ask.querySelectorAll("button")].map((b) => b.textContent), ["10:20 Thameslink to Brighton · the train you're following", "10:15 Great Northern to King's Cross"]);
  click("#followPanel [data-boarding-ask] [data-sure]");
  assert.equal(c.state.trainLock.serviceId, "FAST"); assert.equal(c.state.trainLock.picked, true);
  assert.equal(c.state.saved.followRoute.phase, "on-train");
  assert.equal(app.d.querySelector("[data-boarding-ask]"), null);
  assert.match(hero(), /You're on the 10:20 Thameslink to Brighton.*you picked this/);
  app.close();
});

test("I'm on it: answering with the other train selects it without a second question; with nothing to doubt it confirms at once", async () => {
  const a = await aboard({ where: 19 / 55 });
  a.click('#followPanel [data-follow-action="boarded"]');
  a.click(`#followPanel [data-boarding-ask] [data-pick="${SLOW}"]`);
  assert.equal(a.c.state.trainLock.serviceId, "SLOW");
  assert.equal(a.app.d.querySelector("[data-pending-pick]"), null, "the question was already answered");
  assert.equal(a.app.d.querySelector("[data-boarding-ask]"), null);
  assert.equal(a.c.state.saved.followRoute.option.train.serviceId, "FAST", "the route you follow isn't changed");
  a.app.close();
  // Not on the line (no working-out to compare with): taken at its word, as before.
  const b = await aboard({ where: 19 / 55 });
  b.c.state.onLine = false; b.c.render();
  b.click('#followPanel [data-follow-action="boarded"]');
  assert.equal(b.app.d.querySelector("[data-boarding-ask]"), null);
  assert.equal(b.c.state.trainLock.serviceId, "FAST"); assert.equal(b.c.state.saved.followRoute.phase, "on-train");
  b.app.close();
});
