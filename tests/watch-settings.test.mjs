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

test("Commute watch: in the iPhone app, off by default; turning it on asks for notifications only, and reaches the proxy", async () => {
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
  assert.deepEqual(sh.calls.filter((x) => x[0] === "request").map((x) => x[1]), ["notifications"], "notifications only, not the alarm or location");
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
