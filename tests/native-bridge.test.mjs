// The page's bridge to the iPhone app (src/native-bridge.js; docs/ios-app.md §6.2): nothing in a browser; with a fake
// CommuteNative plugin, the snapshot is published only on a change, the shell gets the Settings, and the followed
// journey reaches the proxy once the shell has an APNs token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { core } from "./core/helpers.mjs";
const nativeBridge = createRequire(import.meta.url)("../src/native-bridge.js");

function fakeShell(caps = { v: 1, liveActivity: true, alarm: true, geofence: true, wifi: true, siri: true, offline: true, appVersion: "1.0" }) {
  const calls = [], listeners = {};
  const plugin = {
    capabilities: async () => caps,
    ready: async (x) => { calls.push(["ready", x]); },
    cached: async () => ({ entries: [{ key: "boards", v: 1, dataAt: 1, savedAt: 2, value: {} }] }),
    request: async (x) => { calls.push(["request", x]); },
    publish: async (x) => { calls.push(["publish", x]); },
    configure: async (x) => { calls.push(["configure", x]); },
    cache: async (x) => { calls.push(["cache", x]); },
    addListener: (name, fn) => { listeners[name] = fn; },
  };
  return { plugin, calls, listeners, emit: (n, e) => listeners[n](e) };
}
function setup({ shell = fakeShell(), native = true, settings = {}, snapshot, followPlan, simulating = false } = {}) {
  const posts = [], store = { settings: { ...settings } }, evidence = [];
  const win = {
    Capacitor: shell ? { isNativePlatform: () => native, Plugins: { CommuteNative: shell.plugin } } : undefined,
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, opts) => {
      const body = JSON.parse(opts.body); posts.push([url, body]);
      if (url.endsWith("/native/register")) return new Response(JSON.stringify({ id: "i1", token: "t1" }), { status: 201 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  };
  let snap = snapshot || null, plan = followPlan || null;
  const b = nativeBridge.create({ win, core, S: () => store.settings, saved: () => store, save: () => {}, proxyBase: () => "https://proxy.test/",
    regions: () => [{ place: "home", lat: 51.98, lon: -0.23, radiusM: 150 }],
    snapshot: () => snap, followPlan: () => plan, simulating: () => simulating, onEvidence: (e) => evidence.push(e), status: () => {} });
  return { b, shell, posts, store, evidence, win, setSnap: (s) => { snap = s; }, setPlan: (p) => { plan = p; } };
}
const SNAP = (t = 1000, o = {}) => core.journeySnapshot({ now: 0, source: "page", dataAt: 0, mode: "commute", direction: "home", followId: "f1", phase: "leave", headline: { label: "Leave by", t, step: "leave" }, ...o });
const PLAN = { plan: { v: 1, followId: "f1", serviceId: "S1", from: "KGX", to: "LET", std: "18:48", dep: 1e6, leaveBy: 1e6 - 26 * 60e3, leadMs: 26 * 60e3, train: "the 18:48" }, extra: { direction: "home" }, setOff: false };
const tick = () => new Promise((r) => setTimeout(r, 0));

test("Bridge in a browser: no shell, nothing happens and nothing is sent", async () => {
  for (const opts of [{ shell: null }, { native: false }]) {
    const { b, posts } = setup({ ...opts, snapshot: SNAP() });
    assert.equal(await b.init(), null);
    assert.equal(b.publish(), null); assert.equal(b.sync(), null); assert.equal(b.cache([]), null); assert.equal(b.onSave(), null);
    assert.equal(b.capabilities(), null); assert.deepEqual(posts, []);
  }
});

test("Bridge: the shell gets the Settings (alarm, Wi-Fi name prefixes; defaults Panda and Ciklum)", async () => {
  const { b, shell } = setup();
  await b.init();
  assert.deepEqual(shell.calls[0], ["configure", { v: 1, proxy: { origin: "https://proxy.test" }, device: null, alarm: { alarm: true, alarmLeadMin: 5 },
    wifi: { home: ["Panda"], office: ["Ciklum"] }, regions: [{ place: "home", lat: 51.98, lon: -0.23, radiusM: 150 }] }]);
  assert.deepEqual(shell.calls[1], ["ready", { v: 1 }], "ready after listening and configuring: the shell replays what it held");
  // Alarm off: no geofences.
  const s = setup({ settings: { leaveAlarm: false, leaveAlarmMin: 1, wifiHome: "Panda, Home ,", wifiOffice: "" } });
  await s.b.init();
  assert.deepEqual(s.shell.calls[0][1], { v: 1, proxy: { origin: "https://proxy.test" }, device: null, alarm: { alarm: false, alarmLeadMin: 1 }, wifi: { home: ["Panda", "Home"], office: [] }, regions: [] });
});

test("Bridge: the snapshot is published when what it shows changes, not on every render; never in a simulation", async () => {
  const s = setup({ snapshot: SNAP(1000) });
  await s.b.init(); s.shell.calls.length = 0;
  s.b.publish(); s.b.publish();
  assert.equal(s.shell.calls.length, 1); assert.deepEqual(s.shell.calls[0], ["publish", { snapshot: SNAP(1000) }]);
  s.setSnap(SNAP(1000, { now: 30e3, dataAt: 30e3 })); s.b.publish();
  assert.equal(s.shell.calls.length, 1, "a new build time alone isn't a change");
  s.setSnap(SNAP(61e3)); s.b.publish();
  assert.equal(s.shell.calls.length, 2);
  s.setSnap(null); s.b.publish();
  assert.deepEqual(s.shell.calls[2], ["publish", { snapshot: null }], "stopped following: nothing to show");
  const sim = setup({ snapshot: SNAP(), simulating: true });
  await sim.b.init(); sim.shell.calls.length = 0;
  assert.equal(sim.b.publish(), null); assert.equal(sim.shell.calls.length, 0);
});

test("Bridge: with an APNs token the iPhone registers with the proxy, then the followed journey goes once per change", async () => {
  const s = setup({ followPlan: PLAN });
  await s.b.init();
  assert.equal(s.b.sync(), null, "no APNs token yet: not registered, nothing sent");
  s.shell.emit("apns", { token: "a".repeat(64), env: "production" });
  await tick(); await tick();
  assert.deepEqual(s.posts[0], ["https://proxy.test/native/register", { apnsToken: "a".repeat(64), env: "production", prefs: { alarm: true, alarmLeadMin: 5 } }]);
  assert.deepEqual(s.store.native, { id: "i1", token: "t1" });
  assert.deepEqual(s.shell.calls.filter((x) => x[0] === "configure").at(-1)[1].device, { id: "i1", token: "t1" }, "the shell gets the registration for Keychain");
  assert.deepEqual(s.posts[1], ["https://proxy.test/native/follow", { id: "i1", token: "t1", plan: PLAN.plan, extra: PLAN.extra, setOff: false }]);
  s.b.sync(); assert.equal(s.posts.length, 2, "no change, no post");
  // The Live Activity's own push token, then set off: each is a change.
  s.shell.emit("liveActivity", { followId: "f1", token: "b".repeat(64) }); await tick();
  assert.equal(s.posts[2][1].laToken, "b".repeat(64));
  s.setPlan({ ...PLAN, setOff: true }); s.b.sync(); await tick();
  assert.equal(s.posts[3][1].setOff, true);
  s.setPlan(null); s.b.sync(); await tick();
  assert.deepEqual(s.posts[4][1], { id: "i1", token: "t1", plan: null });
  // A bad APNs event is ignored.
  s.shell.emit("apns", { token: 5, env: "production" }); await tick();
  assert.equal(s.posts.length, 5);
});

test("Bridge: Wi-Fi and geofence events reach the page as evidence (never in a simulation); cached entries are handed over", async () => {
  const s = setup();
  await s.b.init();
  s.shell.emit("wifi", { place: "home", at: 5 });
  s.shell.emit("region", { place: "office", event: "exit", at: 6 });
  assert.deepEqual(s.evidence, [{ kind: "wifi", place: "home", event: undefined, at: 5 }, { kind: "region", place: "office", event: "exit", at: 6 }]);
  const sim = setup({ simulating: true });
  await sim.b.init(); sim.shell.emit("wifi", { place: "home", at: 5 });
  assert.deepEqual(sim.evidence, []);
  // Offline cache: only when the shell keeps one.
  s.b.cache([{ kind: "snapshot", dataAt: 1 }]);
  assert.deepEqual(s.shell.calls.at(-1), ["cache", { entries: [{ kind: "snapshot", dataAt: 1 }] }]);
  assert.deepEqual(await s.b.cached(), [{ key: "boards", v: 1, dataAt: 1, savedAt: 2, value: {} }]);
  await s.b.request("location");
  assert.deepEqual(s.shell.calls.filter((x) => x[0] === "request"), [["request", { permission: "location" }]]);
  assert.equal(await s.b.request("camera"), null, "only notifications and location");
  const noOffline = setup({ shell: fakeShell({ v: 1, offline: false }) });
  await noOffline.b.init();
  assert.equal(noOffline.b.cache([]), null);
  assert.deepEqual(await noOffline.b.cached(), []);
});

test("Review: Live Activity tokens are kept per journey; only the current one is sent; nothing registers or syncs in a simulation", async () => {
  const s = setup({ followPlan: PLAN });
  await s.b.init();
  s.shell.emit("apns", { token: "a".repeat(64), env: "production" }); await tick(); await tick();
  s.shell.emit("liveActivity", { followId: "old", token: "c".repeat(64) }); await tick();
  assert.ok(!s.posts.some(([, b]) => b.laToken === "c".repeat(64)), "an old journey's token isn't attached to this one");
  s.shell.emit("liveActivity", { token: "d".repeat(64) }); await tick();
  assert.ok(!s.posts.some(([, b]) => b.laToken), "no followId: ignored");
  s.shell.emit("liveActivity", { followId: "f1", token: "b".repeat(64) }); await tick();
  assert.equal(s.posts.at(-1)[1].laToken, "b".repeat(64));
  const sim = setup({ followPlan: PLAN, simulating: true });
  await sim.b.init();
  sim.shell.emit("apns", { token: "a".repeat(64), env: "production" }); await tick(); await tick();
  assert.deepEqual(sim.posts, []); assert.equal(sim.b.sync(), null); assert.deepEqual(await sim.b.cached(), []);
});
