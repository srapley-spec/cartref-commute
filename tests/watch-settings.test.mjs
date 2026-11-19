// Commute watch in Settings (#66): docs/stories/commute-watch.md. In the iPhone app only, off until turned on; turning
// it on asks for notifications (from Settings, never at start-up) and tells the proxy; a test notification button.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00");
function shell(auth = { notifications: "notDetermined", alarm: "notDetermined", location: "notDetermined" }) {
  const calls = [];
  const plugin = { capabilities: async () => ({ v: 1, liveActivity: true, alarm: true, geofence: true, wifi: true, siri: true, offline: true, auth }),
    publish: async () => {}, configure: async (x) => { calls.push(["configure", x]); }, cache: async () => {}, addListener: () => {},
    request: async (x) => { calls.push(["request", x.permission]); } };
  return { calls, install: (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: plugin } }; } };
}
const submit = async (app) => { app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 30)); };

test("Commute watch: in the iPhone app, off by default; turning it on asks for notifications and location, and goes in what the proxy is sent", async () => {
  const sh = shell(), posts = [];
  const route = (u, o) => { if (/\/native\//.test(u)) { posts.push([u.replace(/^.*\/native\//, ""), JSON.parse(o.body)]); return new Response(JSON.stringify({ id: "i1", token: "t1", ok: true }), { status: 200 }); } return undefined; };
  const app = await createApp({ settings: { provider: "demo", leaveAlarm: true }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: T0, beforeScripts: sh.install, route });
  app.d.querySelector("#settingsBtn").click();
  assert.equal(app.d.querySelector("#watchFields").hidden, false, "shown in the iPhone app");
  assert.equal(app.d.querySelector("#s_commuteWatch").checked, false, "off until turned on");
  assert.equal(sh.calls.filter((x) => x[0] === "request").length, 0, "nothing asked at start-up");
  app.d.querySelector("#s_commuteWatch").checked = true;
  await submit(app);
  assert.equal(app.c.S().commuteWatch, true);
  assert.deepEqual(sh.calls.filter((x) => x[0] === "request").map((x) => x[1]), ["notifications", "location"], "notifications and location (the home fence), never the alarm");
  const shellCfg = sh.calls.filter((x) => x[0] === "configure").at(-1)[1];
  assert.equal("watch" in shellCfg.alarm, false, "the shell isn't told about the watch");
  // The proxy hears about it when the page registers (the bridge registers once it has an APNs token).
  assert.equal(app.c.native.prefs().watch, true);
  // Off again.
  app.d.querySelector("#settingsBtn").click();
  assert.equal(app.d.querySelector("#s_commuteWatch").checked, true);
  app.d.querySelector("#s_commuteWatch").checked = false; await submit(app);
  assert.equal(app.c.S().commuteWatch, undefined); assert.equal(app.c.native.prefs().watch, false);
  assert.deepEqual(app.errors, []); app.close();
});

test("Commute watch: the test button sends through the proxy and says what happened", async () => {
  const sh = shell({ notifications: "authorized" }), posts = [];
  const route = (u, o) => { if (/\/native\/test/.test(u)) { posts.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 }); } return undefined; };
  const app = await createApp({ settings: { provider: "proxy", proxyBase: "https://proxy.test", commuteWatch: true }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: T0, beforeScripts: sh.install, route });
  app.d.querySelector("#settingsBtn").click();
  const btn = app.d.querySelector("#watchTestBtn");
  assert.equal(btn.hidden, false);
  btn.click(); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(posts, [{ id: "i1", token: "t1" }]);
  assert.match(app.d.querySelector("#watchStatus").textContent, /^Sent/);
  assert.deepEqual(app.errors, []); app.close();
});

test("Commute watch: not in a browser, and not in display mode", async () => {
  const app = await createApp({ settings: { provider: "demo" }, geo: null, now: T0 });
  app.d.querySelector("#settingsBtn").click();
  assert.equal(app.d.querySelector("#watchFields").hidden, true);
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(app.c.S().commuteWatch, undefined, "a browser never writes it");
  assert.deepEqual(app.errors, []); app.close();
});

test("Commute watch: hidden in display mode even inside the iPhone app; a failed test says so", async () => {
  const sh = shell({ notifications: "authorized" });
  const app = await createApp({ url: "https://srapley-spec.github.io/cartref-commute/?display", settings: { provider: "demo" }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: T0, beforeScripts: sh.install });
  const btn = app.d.querySelector("#settingsBtn"); if (btn && !btn.hidden) btn.click();
  assert.equal(app.d.querySelector("#watchFields").hidden, true);
  app.close();
  const route = (u) => /\/native\/test/.test(u) ? new Response(JSON.stringify({ ok: false, status: 400, error: "BadDeviceToken" }), { status: 502 }) : undefined;
  const b = await createApp({ settings: { provider: "proxy", proxyBase: "https://proxy.test" }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: T0, beforeScripts: shell({ notifications: "authorized" }).install, route });
  b.d.querySelector("#settingsBtn").click();
  b.d.querySelector("#watchTestBtn").click(); await new Promise((r) => setTimeout(r, 30));
  assert.match(b.d.querySelector("#watchStatus").textContent, /^Couldn't send: BadDeviceToken/);
  b.close();
});

test("The app tells the proxy you're home once per evening: home Wi-Fi or a good fix at home, only with the watch on, only in the evening window", async () => {
  const run = async ({ settings, now, act }) => {
    const posts = [], listeners = {};
    const install = (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: {
      capabilities: async () => ({ v: 1, offline: true, wifi: true, geofence: true, auth: { notifications: "authorized", location: "authorizedAlways" } }),
      publish: async () => {}, configure: async () => {}, cache: async () => {}, ready: async () => {}, addListener: (n, fn) => { listeners[n] = fn; } } } }; };
    const route = (u, o) => { if (/\/native\/evidence/.test(u)) { posts.push(JSON.parse(o.body).evidence); return new Response(JSON.stringify({ ok: true }), { status: 200 }); } return undefined; };
    const app = await createApp({ settings: { provider: "proxy", proxyBase: "https://proxy.test", ...settings }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now, beforeScripts: install, route });
    await new Promise((r) => setTimeout(r, 30));
    await act(app, listeners); await new Promise((r) => setTimeout(r, 30));
    app.close(); return posts;
  };
  const EVE = at("2026-11-19", "17:00"), MORN = at("2026-11-19", "07:00");
  const wifiHome = async (app, l) => { l.wifi({ place: "home", at: app.w.Date.now() }); l.wifi({ place: "home", at: app.w.Date.now() }); };
  const fixHome = async (app) => { app.c.onPosition({ coords: { latitude: 51.975, longitude: -0.23, accuracy: 20, speed: null }, timestamp: app.w.Date.now() }); };
  const wifiPosts = await run({ settings: { commuteWatch: true }, now: EVE, act: wifiHome });
  assert.equal(wifiPosts.length, 1, "once, though Wi-Fi was seen twice"); assert.equal(wifiPosts[0].kind, "wifi"); assert.equal(wifiPosts[0].place, "home");
  const fixPosts = await run({ settings: { commuteWatch: true }, now: EVE, act: fixHome });
  assert.equal(fixPosts.length, 1); assert.equal(fixPosts[0].kind, "place");
  assert.equal((await run({ settings: {}, now: EVE, act: wifiHome })).length, 0, "watch off: nothing");
  assert.equal((await run({ settings: { commuteWatch: true }, now: MORN, act: wifiHome })).length, 0, "morning: nothing (only the evening watch ends at home)");
  const away = await run({ settings: { commuteWatch: true }, now: EVE, act: async (app) => { app.c.onPosition({ coords: { latitude: 51.53, longitude: -0.12, accuracy: 20, speed: null }, timestamp: app.w.Date.now() }); } });
  assert.equal(away.length, 0, "a fix in London: nothing");
});

test("Review (19 Nov): home is never reported from display mode or a simulation, from a fix 300 m away or a poor one, or from leaving the geofence; a failed report is tried again; 'while using' location is upgraded", async () => {
  const run = async ({ settings = {}, url, act, fail = false, auth = { notifications: "authorized", location: "authorizedAlways" } }) => {
    const posts = [], listeners = {}, requests = [];
    const install = (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: {
      capabilities: async () => ({ v: 1, offline: true, wifi: true, geofence: true, auth }), request: async (x) => { requests.push(x.permission); },
      publish: async () => {}, configure: async () => {}, cache: async () => {}, ready: async () => {}, addListener: (n, fn) => { listeners[n] = fn; } } } }; };
    const route = (u, o) => { if (/\/native\/evidence/.test(u)) { posts.push(JSON.parse(o.body).evidence); return fail && posts.length === 1 ? new Response("down", { status: 503 }) : new Response(JSON.stringify({ ok: true }), { status: 200 }); } return undefined; };
    const app = await createApp({ ...(url ? { url } : {}), settings: { provider: "proxy", proxyBase: "https://proxy.test", commuteWatch: true, ...settings }, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: at("2026-11-19", "17:00"), beforeScripts: install, route });
    await new Promise((r) => setTimeout(r, 30));
    await act(app, listeners); await new Promise((r) => setTimeout(r, 40));
    app.close(); return { posts, requests };
  };
  const fix = (lat, lon, accuracy) => async (app) => { app.c.onPosition({ coords: { latitude: lat, longitude: lon, accuracy, speed: null }, timestamp: app.w.Date.now() }); };
  const wifi = async (app, l) => { l.wifi({ place: "home", at: app.w.Date.now() }); };
  assert.equal((await run({ url: "https://srapley-spec.github.io/cartref-commute/?display", act: wifi })).posts.length, 0, "display mode");
  // A simulation is a session opt-in (cleared on reload): switched on after start-up, as Settings does.
  assert.equal((await run({ act: async (app) => { app.c.state.saved.settings.simulatedFeeds = true; await fix(51.975, -0.23, 20)(app); } })).posts.length, 0, "a simulation (a fix at home)");
  assert.equal((await run({ act: fix(51.9777, -0.23, 20) })).posts.length, 0, "a fix 300 m from home");
  assert.equal((await run({ act: fix(51.975, -0.23, 250) })).posts.length, 0, "a poor fix at home");
  assert.equal((await run({ act: async (app, l) => { l.region({ place: "home", event: "exit", at: app.w.Date.now() }); } })).posts.length, 0, "leaving the geofence");
  assert.equal((await run({ act: async (app, l) => { l.region({ place: "home", event: "enter", at: app.w.Date.now() }); } })).posts.length, 1, "entering it");
  const retried = await run({ fail: true, act: async (app, l) => { l.wifi({ place: "home", at: app.w.Date.now() }); await new Promise((r) => setTimeout(r, 30)); l.wifi({ place: "home", at: app.w.Date.now() }); } });
  assert.equal(retried.posts.length, 2, "the first report failed, so the next sign of home reports again");
  // Turning the watch on with location "while using": asked for Always.
  const up = await run({ settings: { commuteWatch: false, leaveAlarm: true }, auth: { notifications: "authorized", location: "whenInUse" }, act: async (app) => {
    app.d.querySelector("#settingsBtn").click(); app.d.querySelector("#s_commuteWatch").checked = true;
    app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); } });
  assert.deepEqual(up.requests, ["location"]);
});

test("Home Assistant in Settings: offered only when the app's proxy has it set up; on, it goes to the proxy (not the shell); off with the watch off; the test says what HA reads", async () => {
  const sh = shell({ notifications: "authorized" });
  const route = (u) => /\/native\/test/.test(u) ? new Response(JSON.stringify({ ok: true, status: 200, ha: "home" }), { status: 200 })
    : /proxy\.test\/status$/.test(u) ? new Response(JSON.stringify({ v: 1, rail: true, ha: true }), { status: 200 }) : undefined;
  const base = { provider: "proxy", proxyBase: "https://proxy.test", commuteWatch: true };
  const none = await createApp({ settings: base, saved: { native: { id: "i1", token: "t1" }, proxyStatus: { v: 1, rail: true, ha: false } }, geo: null, now: T0, beforeScripts: sh.install,
    route: (u) => /proxy\.test\/status$/.test(u) ? new Response(JSON.stringify({ v: 1, rail: true }), { status: 200 }) : undefined });
  none.d.querySelector("#settingsBtn").click();
  assert.equal(none.d.querySelector("#watchHaRow").hidden, true, "not set up on the proxy: not offered");
  none.close();
  const kept = await createApp({ settings: { ...base, watchHa: true }, saved: { native: { id: "i1", token: "t1" }, proxyStatus: { v: 1, rail: true, ha: false } }, geo: null, now: T0, beforeScripts: sh.install,
    route: (u) => /proxy\.test\/status$/.test(u) ? new Response(JSON.stringify({ v: 1, rail: true }), { status: 200 }) : undefined });
  kept.d.querySelector("#settingsBtn").click();
  assert.equal(kept.d.querySelector("#watchHaRow").hidden, false, "already on: still shown, so it can be turned off");
  kept.close();
  // The proxy's /status says it's set up (read at start-up): offered.
  const app = await createApp({ settings: base, saved: { native: { id: "i1", token: "t1" } }, geo: null, now: T0, beforeScripts: sh.install, route });
  await new Promise((r) => setTimeout(r, 100));
  app.d.querySelector("#settingsBtn").click();
  assert.equal(app.d.querySelector("#watchHaRow").hidden, false, "set up: offered");
  assert.equal(app.d.querySelector("#s_watchHa").checked, false, "off until turned on");
  app.d.querySelector("#s_watchHa").checked = true; await submit(app);
  assert.equal(app.c.S().watchHa, true); assert.equal(app.c.native.prefs().ha, true, "the proxy is told");
  assert.equal("ha" in sh.calls.filter((x) => x[0] === "configure").at(-1)[1].alarm, false, "the shell isn't");
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#watchTestBtn").click(); await new Promise((r) => setTimeout(r, 50));
  assert.match(app.d.querySelector("#watchStatus").textContent, /Home Assistant says you're home\./);
  app.d.querySelector("#s_commuteWatch").checked = false; await submit(app);
  assert.equal(app.c.native.prefs().ha, false, "with the watch off, Home Assistant isn't used");
  assert.deepEqual(app.errors, []); app.close();
});
