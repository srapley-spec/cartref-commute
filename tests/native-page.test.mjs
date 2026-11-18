// The page inside the iPhone app (docs/ios-app.md §6.2, docs/stories/ios-app.md): with a fake CommuteNative shell,
// the followed card's snapshot reaches the shell (Leave by, then the platform once set off, with the alarm cancelled),
// the iPhone settings appear only in the app, and Wi-Fi at the office is a position. In a browser nothing changes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
function shell() {
  const calls = [], listeners = {};
  const plugin = { capabilities: async () => ({ v: 1, liveActivity: true, alarm: true, geofence: true, wifi: true, siri: true, offline: true }),
    publish: async (x) => { calls.push(["publish", x.snapshot]); }, configure: async (x) => { calls.push(["configure", x]); },
    cache: async () => {}, addListener: (n, fn) => { listeners[n] = fn; } };
  return { calls, listeners, install: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: plugin } }; } };
}
async function homeward(sh) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "home" }, geo: null, now: T0, beforeScripts: sh ? sh.install : null });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const far = svc({ from: "ZFD", to: "LET", std: "10:30", dep: T0 + 37 * m, depLate: 7, arr: T0 + 77 * m, arrLate: 7, operator: "Thameslink", serviceId: "TL", destination: "Cambridge", platform: "4" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.fetchedAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink via Farringdon/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now; c.state.fetchedAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  return { app, c, P, place };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const lastSnap = (sh) => sh.calls.filter((x) => x[0] === "publish").at(-1)[1];

test("In the iPhone app: the followed card's snapshot goes to the shell, Leave by then the platform, the alarm cancelled once set off", async () => {
  const sh = shell();
  const { app, P, place } = await homeward(sh);
  assert.deepEqual(JSON.parse(JSON.stringify(sh.calls[0])), ["configure", { alarm: { alarm: true, alarmLeadMin: 5 }, wifi: { home: ["Panda"], office: ["Ciklum"] } }]);
  place(1, P.places.office); await flush();
  let s = lastSnap(sh);
  assert.equal(s.v, 1); assert.equal(s.source, "page"); assert.equal(s.phase, "leave"); assert.equal(s.direction, "home");
  assert.equal(s.headline.label, "Leave by"); assert.equal(s.headline.countdown.step, "leave");
  assert.equal(s.headline.t, Number(app.d.querySelector("#followPanel .journey-heading").dataset.left));
  assert.equal(s.train.platform, "4"); assert.equal(s.train.late, 7); assert.equal(s.train.scheduled, T0 + 30 * m); assert.equal(s.train.expected, T0 + 37 * m);
  assert.equal(s.alarm.cancelled, false); assert.equal(s.alarm.leadMin, 5);
  assert.equal(s.stale, false);
  const n = sh.calls.length;
  place(1.1, P.places.office); await flush();
  assert.equal(sh.calls.length, n, "nothing shown changed: not published again");
  place(8, [51.5145, -0.0805]); await flush();   // 400 m on: set off
  s = lastSnap(sh);
  assert.equal(s.phase, "platform"); assert.equal(s.headline.label, "Be on platform 4 at Farringdon by"); assert.equal(s.headline.t, T0 + 29 * m);
  assert.equal(s.alarm.cancelled, true);
  // The iPhone settings are shown in the app.
  assert.equal(app.d.querySelector("#nativeSettings").hidden, false);
  assert.deepEqual(app.errors, []); app.close();
});

test("In the iPhone app: office Wi-Fi is a position at the office; settings saved go to the shell", async () => {
  const sh = shell();
  const { app, c, P } = await homeward(sh);
  c.state.here = null; c.state.lastFixAt = null;
  sh.listeners.wifi({ place: "office", at: Date.now() });
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.here)), JSON.parse(JSON.stringify(P.places.office)));
  assert.equal(c.state.locAcc, 50);
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#s_leaveAlarmMin").value = "1"; app.d.querySelector("#s_wifiHome").value = "Panda, Home";
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(c.S().leaveAlarmMin, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sh.calls.filter((x) => x[0] === "configure").at(-1)[1])), { alarm: { alarm: true, alarmLeadMin: 1 }, wifi: { home: ["Panda", "Home"], office: ["Ciklum"] } });
  assert.deepEqual(app.errors, []); app.close();
});

test("In a browser: no iPhone settings, none saved, nothing published", async () => {
  const { app, c, P, place } = await homeward(null);
  place(1, P.places.office);
  assert.equal(app.d.querySelector("#nativeSettings").hidden, true);
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  for (const k of ["leaveAlarm", "leaveAlarmMin", "wifiHome", "wifiOffice"]) assert.ok(!(k in c.state.saved.settings), `${k} not saved`);
  assert.equal(c.native.capabilities(), null);
  assert.deepEqual(app.errors, []); app.close();
});
