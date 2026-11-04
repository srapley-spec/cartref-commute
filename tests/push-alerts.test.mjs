// The page's side of time-to-leave and wake-up alerts (src/push-alerts.js; docs/stories/time-to-leave-alerts.md):
// asking permission inside the Save tap, subscribing through the proxy, handing it the followed journey's plan only
// when it changes, never during a simulation, and turning off cleanly. Browser APIs are stubs; the page test below
// checks the setting is off by default and makes no requests.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { core } from "./core/helpers.mjs";
import { createApp, closeAll, sleep } from "./harness.mjs";
after(closeAll);
const require = createRequire(import.meta.url);
const pushAlerts = require("../src/push-alerts.js");

const PROXY = "https://cartref-rail.example.workers.dev";
const MIN = 60e3, NOW = Date.now();
const route = (o = {}) => ({ version: 1, id: "f1", direction: "home", mode: "commute", startedAt: NOW, phase: "before-train", notices: [],
  dismissedAlternatives: [], seenEvents: [], plannedArrival: 0, expectedArrival: 0,
  option: { id: "o1", flags: [], leave: NOW + 20 * MIN, leaveBy: NOW + 20 * MIN,
    train: { from: "KGX", to: "LET", std: "18:48", dep: NOW + 46 * MIN, arr: NOW + 80 * MIN, depLate: 0, arrLate: 0, depUnknown: false, operator: "Great Northern", cancelled: false, serviceId: "S1" } },
  lastTrain: { from: "KGX", to: "LET", std: "18:48", dep: NOW + 46 * MIN, depLate: 0, depUnknown: false, operator: "Great Northern", cancelled: false, serviceId: "S1" }, ...o });

function setup({ permission = "default", answer = "granted", settings = { proxyBase: PROXY }, sim = false, supported = true, fail = null } = {}) {
  const calls = [], statuses = [], order = [];
  const state = { saved: {}, settings: { ...settings }, followed: route(), sim };
  let existingSub = null;
  const sub = { toJSON: () => ({ endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "P", auth: "A" } }), unsubscribe: async () => { order.push("unsubscribe"); existingSub = null; return true; } };
  const reg = { unregister: async () => { order.push("unregister"); return true; }, pushManager: { getSubscription: async () => existingSub, subscribe: async (o) => { order.push(["subscribe", o.userVisibleOnly, o.applicationServerKey.length]); existingSub = sub; return sub; } } };
  const win = {
    setTimeout, clearTimeout, AbortController,
    Notification: supported ? { permission, requestPermission: () => { order.push("permission"); return Promise.resolve(answer); } } : undefined,
    PushManager: supported ? function () {} : undefined,
    navigator: supported ? { serviceWorker: { register: async (u) => { order.push(["register", u]); return reg; }, ready: Promise.resolve(reg), getRegistration: async () => reg } } : {},
    fetch: async (url, opts = {}) => {
      const body = opts.body ? JSON.parse(opts.body) : undefined; calls.push({ url, body });
      const f = fail && fail(url);
      if (f) return new Response(JSON.stringify({ error: "nope" }), { status: typeof f === "number" ? f : 500 });
      if (url.endsWith("/push/key")) return new Response(JSON.stringify({ key: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8" }));
      if (url.endsWith("/push/subscribe")) return new Response(JSON.stringify({ id: "ID1", token: "TOK" }), { status: 201 });
      return new Response(JSON.stringify({ ok: true }));
    },
  };
  const a = pushAlerts.create({ S: () => state.settings, saved: () => state.saved, save: () => {}, core, names: { KGX: "King's Cross" },
    morning: (s) => ({ from: "LET", to: ["KGX"], time: s.wakeAt || "06:30", days: [1, 2, 3, 4, 5], names: {} }),
    followed: () => state.followed, simulating: () => state.sim, win, status: (t) => statuses.push(t) });
  return { a, calls, statuses, order, state };
}
const posts = (calls, path) => calls.filter(c => c.url === PROXY + path);

test("Alerts on: permission is asked first, inside the Save tap; then the phone subscribes through the proxy and a test alert is sent", async () => {
  const t = setup();
  const done = t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY });
  assert.equal(t.order[0], "permission", "asked before anything is awaited (iPhone only asks from a tap)");
  assert.equal(await done, true);
  assert.deepEqual(t.order.slice(1, 3), [["register", "sw.js"], ["subscribe", true, 65]]);
  const sub = posts(t.calls, "/push/subscribe")[0].body;
  assert.equal(sub.subscription.endpoint, "https://web.push.apple.com/abc");
  assert.deepEqual(sub.morning, { from: "LET", to: ["KGX"], time: "06:30", days: [1, 2, 3, 4, 5], names: {} });
  assert.deepEqual({ id: t.state.saved.pushAlerts.id, token: t.state.saved.pushAlerts.token }, { id: "ID1", token: "TOK" });
  assert.deepEqual(posts(t.calls, "/push/test")[0].body, { id: "ID1", token: "TOK" });
  assert.match(t.statuses.at(-1), /^On\. A test alert is on its way; the wake-up check runs weekdays at 06:30\./);
});

test("Alerts on: refused permission, no proxy, or no push support says why and subscribes nothing", async () => {
  let t = setup({ answer: "denied" });
  assert.equal(await t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY }), false);
  assert.match(t.statuses.at(-1), /Notifications are off for Commute/); assert.equal(t.calls.length, 0);
  t = setup();
  assert.equal(await t.a.onSave({}, { leaveAlerts: true, proxyBase: "" }), false);
  assert.match(t.statuses.at(-1), /Alerts need your proxy/); assert.equal(t.order.length, 0, "not even a permission prompt");
  t = setup({ supported: false });
  assert.equal(await t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY }), false);
  assert.match(t.statuses.at(-1), /open Commute from the Home Screen/);
  t = setup({ fail: (u) => u.endsWith("/push/subscribe") });
  assert.equal(await t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY }), false);
  assert.equal(t.statuses.at(-1), "Couldn't turn alerts on: nope"); assert.equal(t.state.saved.pushAlerts, undefined);
  // Already granted: no prompt.
  t = setup({ permission: "granted" });
  await t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY });
  assert.ok(!t.order.includes("permission"));
});

test("Followed journey: the plan is posted when it changes (Leave by moved a minute, Follow stopped), not on every render; never in a simulation", async () => {
  const t = setup({ settings: { proxyBase: PROXY, leaveAlerts: true } });
  t.state.saved.pushAlerts = { id: "ID1", token: "TOK", planKey: null };
  await t.a.sync();
  let p = posts(t.calls, "/push/plan");
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].body.plan, core.leaveAlertPlan(route(), { KGX: "King's Cross" }));
  assert.equal(p[0].body.token, "TOK");
  await t.a.sync(); await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 1, "unchanged: not posted again");
  t.state.followed = route({ lastTrain: { ...route().lastTrain, dep: NOW + 46 * MIN + 20e3 } });
  await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 1, "under a minute: same plan");
  t.state.followed = route({ lastTrain: { ...route().lastTrain, dep: NOW + 48 * MIN, depLate: 2 } });
  await t.a.sync();
  p = posts(t.calls, "/push/plan"); assert.equal(p.length, 2); assert.equal(p[1].body.plan.leaveBy, NOW + 22 * MIN);
  t.state.followed = route({ phase: "on-train" });
  await t.a.sync();
  p = posts(t.calls, "/push/plan"); assert.equal(p.length, 3); assert.equal(p[2].body.plan, null, "on the train: nothing to leave for");
  t.state.followed = null; await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 3, "still none");
  // A simulation never reaches the proxy.
  t.state.sim = true; t.state.followed = route({ id: "sim" });
  await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 3);
  // Alerts off: nothing.
  t.state.sim = false; t.state.settings.leaveAlerts = false;
  await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 3);
});

test("Followed journey: a failed post is retried after a minute, not on every render", async () => {
  let down = true;
  const t = setup({ settings: { proxyBase: PROXY, leaveAlerts: true }, fail: (u) => down && u.endsWith("/push/plan") });
  t.state.saved.pushAlerts = { id: "ID1", token: "TOK", planKey: null };
  await t.a.sync();
  assert.equal(t.state.saved.pushAlerts.planKey, null, "not marked as sent");
  await t.a.sync();
  assert.equal(posts(t.calls, "/push/plan").length, 1, "waits before retrying");
});

test("Alerts off: the proxy forgets the phone and the push subscription is dropped; a new wake-up time updates the same phone", async () => {
  const t = setup({ settings: { proxyBase: PROXY, leaveAlerts: true } });
  await t.a.onSave({}, { leaveAlerts: true, proxyBase: PROXY });
  await t.a.onSave({ leaveAlerts: true, proxyBase: PROXY }, { leaveAlerts: true, proxyBase: PROXY, wakeAt: "07:10" });
  const subs = posts(t.calls, "/push/subscribe");
  assert.equal(subs.length, 2); assert.equal(subs[1].body.id, "ID1"); assert.equal(subs[1].body.morning.time, "07:10");
  assert.equal(await t.a.onSave({ leaveAlerts: true, proxyBase: PROXY, wakeAt: "07:10" }, { leaveAlerts: true, proxyBase: PROXY, wakeAt: "07:10" }), null, "nothing changed");
  await t.a.onSave({ leaveAlerts: true, proxyBase: PROXY }, { proxyBase: PROXY });
  assert.deepEqual(posts(t.calls, "/push/unsubscribe")[0].body, { id: "ID1", token: "TOK" });
  assert.ok(t.order.includes("unsubscribe")); assert.ok(t.order.includes("unregister"), "the service worker goes too");
  assert.equal(t.state.saved.pushAlerts, undefined); assert.equal(t.statuses.at(-1), "Off.");
});

test("Page: time-to-leave alerts are off by default, in Settings → Experimental, and make no requests", async () => {
  const app = await createApp({ settings: { provider: "demo", followRoute: true } });
  assert.equal(app.d.querySelector("#s_leaveAlerts").checked, false);
  assert.equal(app.d.querySelector("#s_wakeAt").value, "06:30");
  assert.equal(app.d.querySelector("#s_leaveAlerts").closest("fieldset").querySelector("legend").textContent, "Experimental");
  assert.equal(app.calls.filter(u => /\/push\//.test(u)).length, 0);
  // Turned on without a proxy: says why, asks nothing (jsdom has no push support either way).
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#s_leaveAlerts").checked = true;
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { cancelable: true }));
  assert.match(app.text("#alertsStatus"), /Alerts need your proxy/);
  assert.equal(app.c.S().leaveAlerts, true, "the setting is kept");
  assert.equal(app.calls.filter(u => /\/push\//.test(u)).length, 0);
  app.close();
});

test("Followed journey: retried at a minute, not before; the proxy forgetting the phone (403) stops and says so; a refused plan (400) isn't retried", async () => {
  assert.equal(pushAlerts.RETRY_MS, 60e3, "the story's 1 min");
  let mode = 500;
  const t = setup({ settings: { proxyBase: PROXY, leaveAlerts: true }, fail: (u) => u.endsWith("/push/plan") && mode });
  t.state.saved.pushAlerts = { id: "ID1", token: "TOK", planKey: null };
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    await t.a.sync();
    clock += pushAlerts.RETRY_MS - 1; await t.a.sync();
    assert.equal(posts(t.calls, "/push/plan").length, 1, "not before a minute");
    clock += 1; mode = 0; await t.a.sync();
    assert.equal(posts(t.calls, "/push/plan").length, 2, "at a minute");
    // 400: the same plan isn't posted again.
    t.state.followed = route({ id: "f2" }); mode = 400; await t.a.sync(); await t.a.sync();
    assert.equal(posts(t.calls, "/push/plan").length, 3);
    // 403: ids dropped, the reason kept for Settings.
    t.state.followed = route({ id: "f3" }); mode = 403; await t.a.sync();
    assert.equal(t.state.saved.pushAlerts, undefined);
    assert.match(t.state.saved.pushAlertsStatus, /no longer knows this phone/);
    t.state.followed = route({ id: "f4" }); await t.a.sync();
    assert.equal(posts(t.calls, "/push/plan").length, 4, "nothing more until it's turned on again");
  } finally { Date.now = realNow; }
  // Saving with alerts on and no ids subscribes again; so does a new proxy URL.
  const u = setup({ permission: "granted" });
  await u.a.onSave({ leaveAlerts: true, proxyBase: PROXY }, { leaveAlerts: true, proxyBase: PROXY });
  assert.equal(posts(u.calls, "/push/subscribe").length, 1, "no ids: subscribe again");
  const other = "https://other.example.workers.dev";
  await u.a.onSave({ leaveAlerts: true, proxyBase: PROXY }, { leaveAlerts: true, proxyBase: other });
  assert.ok(u.calls.some(c => c.url === other + "/push/subscribe"), "a new proxy: subscribe there");
});

test("Page: with alerts on, following a journey hands the proxy its plan once; simulated feeds or GPS simulation hand over nothing", async () => {
  const base = { provider: "demo", followRoute: true, leaveAlerts: true, proxyBase: PROXY };
  const run = async (simBox) => {
    const plans = [];
    const app = await createApp({ settings: base, saved: { pushAlerts: { id: "ID1", token: "TOK", planKey: null } },
      route: (u, opts) => { if (u === PROXY + "/push/plan") { plans.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ ok: true })); } return undefined; } });
    if (simBox) {   // simulations are switched on in Settings (they're never restored from storage)
      app.d.querySelector("#settingsBtn").click(); app.d.querySelector(simBox).checked = true;
      app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
      await sleep(100);
    }
    const before = plans.length;
    const btn = app.d.querySelector("#hero .opt [data-follow]") || app.d.querySelector("[data-follow]:not([disabled])");
    assert.ok(btn, "a followable journey");
    btn.click();
    await sleep(50);
    app.c.render(); app.c.render();
    await sleep(50);
    const after = plans.slice(before);
    app.close();
    return after;
  };
  const real = (await run(null)).filter(p => p.plan);
  assert.equal(real.length, 1, "once, not on every render");
  assert.equal(real[0].token, "TOK"); assert.equal(real[0].plan.v, 1);
  for (const box of ["#s_simulatedFeeds", "#s_simulator"]) assert.deepEqual(await run(box), [], box);
});
