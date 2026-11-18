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
    cache: async (x) => { calls.push(["cache", x.entries]); }, addListener: (n, fn) => { listeners[n] = fn; } };
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
  const cfg = JSON.parse(JSON.stringify(sh.calls[0]));
  assert.equal(cfg[0], "configure"); assert.equal(cfg[1].v, 1); assert.deepEqual(cfg[1].alarm, { alarm: true, alarmLeadMin: 5 });
  assert.deepEqual(cfg[1].wifi, { home: ["Panda"], office: ["Ciklum"] });
  assert.deepEqual(cfg[1].regions.map((r) => [r.place, r.radiusM]), [["home", 150], ["office", 150]], "home and office, 150 m");
  place(1, P.places.office); await flush();
  let s = lastSnap(sh);
  assert.equal(s.v, 1); assert.equal(s.source, "page"); assert.equal(s.phase, "leave"); assert.equal(s.direction, "home");
  assert.equal(s.headline.label, "Leave by"); assert.equal(s.headline.countdown.step, "leave");
  assert.equal(s.headline.t, Number(app.d.querySelector("#followPanel .journey-heading").dataset.left));
  assert.equal(s.train.platform, "4"); assert.equal(s.train.late, 7); assert.equal(s.train.scheduled, T0 + 30 * m); assert.equal(s.train.expected, T0 + 37 * m);
  assert.equal(s.alarm.cancelled, false); assert.equal(s.alarm.leadMin, 5); assert.equal(s.alarm.cancelOnExit, "office");
  assert.equal(s.confirmed, false);
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
  // Live boards are kept for a launch with no signal (only from the live proxy).
  c.setBoards({ "KGX-LET": { msgs: [], services: [] } });
  assert.equal(sh.calls.filter((x) => x[0] === "cache").length, 0, "example data isn't kept");
  c.state.saved.settings.provider = "proxy"; c.setBoards({ "KGX-LET": { msgs: [], services: [] } });
  const kept = sh.calls.filter((x) => x[0] === "cache").at(-1)[1];
  assert.deepEqual(JSON.parse(JSON.stringify(kept.map((e) => e.key))), ["snapshot", "settings", "status", "boards"], "most important first");
  const boards = kept.find((e) => e.key === "boards");
  assert.equal(boards.v, 1); assert.equal(boards.dataAt, c.state.boardsAt);
  assert.equal(kept.find((e) => e.key === "snapshot").value.followId, c.state.saved.followRoute.id);
  assert.ok(!JSON.stringify(kept.find((e) => e.key === "settings").value).match(/rdmKey|tflKey|googleKey/), "no keys");
  c.state.saved.settings.provider = "demo";
  assert.equal(c.state.locAcc, 50);
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#s_leaveAlarmMin").value = "1"; app.d.querySelector("#s_wifiHome").value = "Panda, Home";
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(c.S().leaveAlarmMin, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sh.calls.filter((x) => x[0] === "configure").at(-1)[1])).alarm, { alarm: true, alarmLeadMin: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(sh.calls.filter((x) => x[0] === "configure").at(-1)[1])).wifi, { home: ["Panda", "Home"], office: ["Ciklum"] });
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

test("In the iPhone app, Trip too (Sam, 18 Nov): the followed Trip's snapshot and its plan for the proxy", async () => {
  const { TRIP_SETTINGS, tripRoute, planBrightonCanterbury, until } = await import("./trip-fixtures.mjs");
  const sh = shell();
  const a = await createApp({ now: Date.parse("2026-11-03T09:40:00Z"), settings: TRIP_SETTINGS, route: tripRoute, beforeScripts: sh.install });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  const j = a.c.state.saved.tripMode.follow.journey, start = j.from.geo;
  const fix = (geo) => { a.c.state.here = geo; a.c.state.locAcc = 15; a.c.state.lastFixAt = Date.now(); a.c.state.locStatus = "ok"; a.c.render(); };
  fix(start); await flush();
  let s = lastSnap(sh);
  assert.equal(s.mode, "trip"); assert.equal(s.direction, null); assert.equal(s.phase, "leave"); assert.equal(s.headline.label, "Leave by");
  assert.equal(s.followId, a.c.state.saved.tripMode.follow.id); assert.equal(s.confirmed, false);
  const rail = j.rides.find((r) => r.kind === "rail");
  assert.equal(s.train.from, rail.from.name); assert.equal(s.train.to, rail.to.name);
  const fp = a.c.nativeFollowPlan();
  assert.equal(fp.plan.from, rail.from.crs); assert.equal(fp.plan.to, rail.to.crs); assert.equal(fp.plan.leaveBy, j.leave);
  assert.equal(fp.extra.mode, "trip"); assert.equal(fp.extra.startPlace, rail.from.crs); assert.equal(fp.setOff, false);
  assert.equal(s.alarm.cancelOnExit, null, "a Trip starts at no home/office fence");
  fix([start[0] + 0.004, start[1]]); await flush();   // about 450 m on: set off
  s = lastSnap(sh);
  assert.equal(s.phase, "platform"); assert.match(s.headline.label, /^Be on (?:the platform|platform \w+) at [A-Za-z' ]+ by$/);
  assert.equal(s.alarm.cancelled, true); assert.equal(a.c.nativeFollowPlan().setOff, true);
  // Siri's link leaves a followed Trip on screen.
  assert.equal(a.c.nativeOpen("commute://next?direction=home&follow=1"), false);
  assert.equal(a.c.state.saved.tripMode.active, true);
  assert.deepEqual(a.errors, []); a.close();
});

test("Siri's deep link: commute://next shows that direction now; with follow=1 it follows the best train; anything else is ignored", async () => {
  const sh = shell();
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0, beforeScripts: sh.install });
  const c = app.c;
  const far = svc({ from: "ZFD", to: "LET", std: "10:30", dep: T0 + 30 * m, arr: T0 + 70 * m, operator: "Thameslink", serviceId: "TL", destination: "Cambridge", platform: "4" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = [];
  assert.equal(c.nativeOpen("https://evil.example/next?direction=home"), false);
  assert.equal(c.nativeOpen("commute://next?direction=sideways"), false);
  assert.equal(c.state.saved.dirMode, "office");
  sh.listeners.open({ url: "commute://next?direction=home&follow=1" });
  assert.equal(c.state.saved.dirMode, "home"); assert.equal(c.state.saved.view, "now");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(c.state.saved.followRoute, "the best train is followed, as if its Follow button were tapped");
  assert.equal(c.state.saved.followRoute.direction, "home");
  assert.deepEqual(app.errors, []); app.close();
});

test("Review: the plan for the proxy is kept once on the train; Siri's follow doesn't follow twice", async () => {
  const sh = shell();
  const { app, c, P, place } = await homeward(sh);
  place(1, P.places.office); await flush();
  const before = c.nativeFollowPlan();
  assert.ok(before && before.plan);
  const fr = c.state.saved.followRoute; c.state.saved.followRoute = { ...fr, phase: "on-train" }; c.render(); await flush();
  const onTrain = c.nativeFollowPlan();
  assert.equal(onTrain.plan.followId, before.plan.followId, "kept after boarding"); assert.equal(onTrain.setOff, true);
  const id = c.state.saved.followRoute.id;
  c.nativeOpen("commute://next?direction=home&follow=1"); await new Promise((r) => setTimeout(r, 50));
  assert.equal(c.state.saved.followRoute.id, id, "already following: not followed again");
  assert.deepEqual(app.errors, []); app.close();
});

test("Settings asks for notifications, then alarms, then Always location, and shows each answer, refusals included", async () => {
  const sh = shell(), asked = [];
  let auth = { notifications: "notDetermined", alarm: "notDetermined", location: "notDetermined" };
  const answers = { notifications: "granted", alarm: "denied", location: "whenInUse" };
  const install = (w) => { sh.install(w); const p = w.Capacitor.Plugins.CommuteNative;
    p.capabilities = async () => ({ v: 1, liveActivity: true, alarm: true, geofence: true, wifi: true, offline: true, auth: { ...auth } });
    p.request = async ({ permission }) => { asked.push(permission); auth = { ...auth, [permission]: answers[permission] }; }; };
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, geo: null, now: T0, beforeScripts: install });
  await new Promise((r) => setTimeout(r, 30));
  const rows = () => Object.fromEntries([...app.d.querySelectorAll("#nativePermissions [data-permission]")].map((li) => [li.dataset.permission, li.textContent.replace(/\s+/g, " ").trim()]));
  assert.match(rows().alarm, /Not asked yet/);
  app.d.querySelector("#settingsBtn").click();
  app.d.querySelector("#s_leaveAlarm").checked = true;
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(asked, ["notifications", "alarm", "location"], "in that order, each once");
  const r = rows();
  assert.match(r.notifications, /^✓ Notifications.*Allowed$/);
  assert.match(r.alarm, /^✗ Alarms.*Refused: change it in the iPhone's Settings → Commute$/);
  assert.match(r.location, /While using the app only: the alarm won't cancel itself/);
  // The button asks again only for what can still be asked (location up to Always); a refusal isn't asked again.
  app.d.querySelector("#nativeAllowBtn").click(); await new Promise((r2) => setTimeout(r2, 30));
  assert.deepEqual(asked, ["notifications", "alarm", "location", "location"]);
  // Saving again doesn't ask again.
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 30));
  assert.equal(asked.length, 4);
  assert.deepEqual(app.errors, []); app.close();
});

// ---- #58 integration findings, 18 Nov ----
function delayedShell(delayMs, entries) {
  const sh = shell();
  return { ...sh, install: (w) => { sh.install(w); const p = w.Capacitor.Plugins.CommuteNative;
    p.cached = () => new Promise((r) => setTimeout(() => r({ entries }), delayMs)); } };
}
test("Offline startup: in the app nothing is fetched before the shell's cache is applied, even with a slow cached() and an early resume", async () => {
  const cachedAt = T0 - 20 * m;
  const boards = { "KGX-LET": { msgs: [], services: [svc({ from: "KGX", to: "LET", dep: T0 + 36 * m, arr: T0 + 68 * m, serviceId: "C1" })] } };
  const sh = delayedShell(600, [{ key: "boards", v: 1, dataAt: cachedAt, savedAt: cachedAt, value: boards }]);
  let app = null, atFirstFetch;
  const route = () => { if (atFirstFetch === undefined) atFirstFetch = app ? app.c.state.boardsAt : "before the page"; return undefined; };
  app = await createApp({ settings: { provider: "tfl" }, geo: null, now: T0, beforeScripts: sh.install, settle: 200, route });
  assert.equal(app.calls.length, 0, "no fetch while cached() is pending");
  sh.listeners.resume && sh.listeners.resume({ at: T0 });   // a resume before the cache: waits for it too
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(app.calls.length, 0);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(atFirstFetch, cachedAt, "the cached boards were applied before the first fetch");
  assert.ok(app.calls.length > 0, "then the first refresh runs");
  assert.deepEqual(app.errors, []); app.close();
});

test("Offline startup in a browser is unchanged: the first refresh runs at once", async () => {
  const app = await createApp({ settings: { provider: "tfl" }, geo: null, now: T0, settle: 200 });
  assert.ok(app.calls.length > 0);
  assert.deepEqual(app.errors, []); app.close();
});

test("Cache: a snapshot of unknown age is kept with dataAt null, never the save time; with no home, Settings says the alarm can't cancel on leaving home", async () => {
  const sh = shell();
  const { app, c, P, place } = await homeward(sh);
  place(1, P.places.office); await flush();
  c.state.fetchedAt = null;
  await c.nativeCacheNow();
  const snap = sh.calls.filter((x) => x[0] === "cache").at(-1)[1].find((e) => e.key === "snapshot");
  assert.equal(snap.dataAt, null); assert.equal(snap.value.dataAt, null); assert.equal(snap.value.stale, true);
  assert.ok(Number.isFinite(snap.savedAt));
  delete c.state.saved.home; c.renderNativePermissions();
  assert.match(app.text("#nativePermissions"), /Home isn't set, so leaving home can't cancel the leave alarm by itself/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.native.config().regions.map((r) => r.place))), ["office"], "no home region until home is set");
  c.state.here = [51.98, -0.23]; app.d.querySelector("#setHomeBtn").click();
  assert.doesNotMatch(app.text("#nativePermissions"), /Home isn't set/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.native.config().regions.map((r) => r.place))), ["home", "office"]);
  assert.deepEqual(app.errors, []); app.close();
});

test("Offline startup: tokens replayed by ready() and cached Settings wait for the cache; the shell is configured from the restored Settings (#58)", async () => {
  const cachedAt = T0 - 20 * m, order = [];
  const sh = shell();
  const install = (w) => { sh.install(w); const p = w.Capacitor.Plugins.CommuteNative;
    p.cached = () => new Promise((r) => setTimeout(() => { order.push("cached"); r({ entries: [
      { key: "settings", v: 1, dataAt: cachedAt, savedAt: cachedAt, value: { provider: "demo", leaveAlarm: false, wifiHome: "Cartref", wifiOffice: "Work" } }] }); }, 400));
    p.configure = async (x) => { order.push("configure"); sh.calls.push(["configure", JSON.parse(JSON.stringify(x))]); };
    p.ready = async () => { order.push("ready"); sh.listeners.apns({ token: "a".repeat(64), env: "production" }); sh.listeners.liveActivity({ followId: "f1", token: "b".repeat(64) }); }; };
  let app = null;
  const route = (u) => { if (/\/native\//.test(u)) order.push(u.replace(/^.*\/native\//, "native/")); return undefined; };
  app = await createApp({ settings: {}, geo: null, now: T0, beforeScripts: install, settle: 100, route });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(order[0], "cached", `the cache first: ${order.join(", ")}`);
  assert.deepEqual(order.slice(1, 3), ["configure", "ready"]);
  const firstNative = order.findIndex((x) => x.startsWith("native/"));
  assert.ok(firstNative === -1 || firstNative > order.indexOf("ready"), `no proxy call before the cache and ready: ${order.join(", ")}`);
  const cfg = sh.calls.find((x) => x[0] === "configure")[1];
  assert.deepEqual(cfg.alarm, { alarm: false, alarmLeadMin: 5 }, "the restored Settings, not the defaults");
  assert.deepEqual(cfg.wifi, { home: ["Cartref"], office: ["Work"] }); assert.deepEqual(cfg.regions, [], "alarm off: no geofences");
  assert.equal(app.c.S().leaveAlarm, false);
  assert.deepEqual(app.errors, []); app.close();
});

test("Trip's snapshot age is Trip's own board fetch, not the clock or the commute's (#58 6983061034)", async () => {
  const { TRIP_SETTINGS, tripRoute, planBrightonCanterbury, until } = await import("./trip-fixtures.mjs");
  const sh = shell();
  const a = await createApp({ now: Date.parse("2026-11-03T09:40:00Z"), settings: TRIP_SETTINGS, route: tripRoute, beforeScripts: sh.install });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  a.c.state.fetchedAt = Date.parse("2026-11-03T08:00:00Z");   // an unrelated commute fetch: never borrowed
  const calls = a.calls.length;
  const first = a.c.nativeSnapshot();
  assert.notEqual(first.dataAt, a.c.state.fetchedAt);
  a.setNow(a.w.Date.now() + 10e3);
  const again = a.c.nativeSnapshot();
  assert.equal(again.dataAt, first.dataAt, "a redraw with no fetch doesn't make it fresher");
  assert.equal(a.calls.length, calls, "and fetches nothing");
  // This fixture serves no live boards: the age is unknown (null) and stale, as the agent's reproduction expected.
  assert.equal(first.dataAt, null); assert.equal(first.stale, true); assert.equal(again.stale, true);
  assert.deepEqual(a.errors, []); a.close();
});

test("Trip's snapshot age with live boards: the board's fetch time; a redraw doesn't change it; a new fetch moves it; a failed one doesn't", async () => {
  const { TRIP_SETTINGS, tripRoute, planBrightonCanterbury, until } = await import("./trip-fixtures.mjs");
  const sh = shell();
  let a = null, boardsServed = 0, failBoards = false;
  const hm2 = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const route = (u) => {
    const m = /departures\/([A-Z]{3})\/to\/([A-Z]{3})/.exec(u);
    if (m && a) {
      if (failBoards) return new Response("down", { status: 503 });
      const f = a.c.state.saved.tripMode && a.c.state.saved.tripMode.follow, rides = f ? f.journey.rides : [];
      const r = rides.find((x) => x.kind === "rail" && x.from.crs === m[1]);
      boardsServed++;
      return new Response(JSON.stringify({ trainServices: r ? [{ std: hm2(r.schedDep), etd: "On time", operator: r.operator || "Southern", serviceID: "T1",
        destination: [{ locationName: r.to.name, crs: r.to.crs }], subsequentCallingPoints: [{ callingPoint: [{ crs: r.to.crs, locationName: r.to.name, st: hm2(r.schedArr), et: "On time" }] }] }] : [], nrccMessages: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return tripRoute(u);
  };
  a = await createApp({ now: Date.parse("2026-11-03T09:40:00Z"), settings: TRIP_SETTINGS, route, beforeScripts: sh.install });
  await planBrightonCanterbury(a);
  a.d.querySelector(".trip-recommendations [data-trip-follow]").click();
  await until(() => a.d.querySelector("[data-trip-stop]"));
  const live = async () => { await a.c.tripUiFor().refresh(); await new Promise((r) => setTimeout(r, 20)); };
  a.setNow(a.w.Date.now() + 31e3); await live();
  assert.ok(boardsServed > 0, "the followed Trip's board was fetched");
  const fetchedAt = a.w.Date.now();
  const s1 = a.c.nativeSnapshot();
  assert.equal(s1.dataAt, fetchedAt, "the board's own fetch time"); assert.equal(s1.stale, false);
  a.c.state.fetchedAt = fetchedAt - 3600e3;   // an unrelated commute fetch is never borrowed
  a.setNow(fetchedAt + 10e3);
  assert.equal(a.c.nativeSnapshot().dataAt, fetchedAt, "a redraw without a fetch keeps it");
  // A new successful fetch moves it on.
  a.setNow(fetchedAt + 40e3); await live();
  assert.equal(a.c.nativeSnapshot().dataAt, fetchedAt + 40e3);
  // A failed fetch doesn't: the age is the last success, and it goes stale after 3 min.
  failBoards = true;
  a.setNow(fetchedAt + 80e3); await live();
  assert.equal(a.c.nativeSnapshot().dataAt, fetchedAt + 40e3);
  a.setNow(fetchedAt + 40e3 + 3 * 60e3 + 1);
  assert.equal(a.c.nativeSnapshot().stale, true);
  assert.deepEqual(a.errors, []); a.close();
});
