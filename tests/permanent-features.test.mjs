// Finished features are permanent (Sam, 18 Nov, #63): Follow a route, Any start and end point and Trip need no switch;
// only Along the line is Experimental. Saved retired switches (missing, false or true) never turn a feature off again,
// on load, Save, reload or the iPhone app's cached settings; being available never follows a journey or enters Trip.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00");
const RETIRED = ["followRoute", "follow", "anyPlace", "trip"];
const stored = (app) => JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1"));
const submit = (app) => { app.d.querySelector("#settingsBtn").click(); app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); };
const legends = (app) => [...app.d.querySelectorAll("#settingsForm fieldset > legend")].map((l) => l.textContent.trim());
const inSection = (app, legend, id) => { const fs = [...app.d.querySelectorAll("#settingsForm fieldset")].find((f) => f.querySelector("legend")?.textContent.trim() === legend); return !!(fs && fs.querySelector("#" + id)); };

test("Fresh install: Follow, Any start and end point and Trip are there with no switch; only Along the line is Experimental", async () => {
  const app = await createApp({ settings: { provider: "demo" }, now: T0 });
  assert.ok(app.d.querySelector("[data-follow]"), "Follow is offered on the trains");
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, false, "Trip is offered as a mode");
  assert.notEqual(app.c.state.saved.tripMode?.active, true, "but you aren't put into it");
  assert.equal(app.c.state.saved.followRoute ?? null, null, "and nothing is followed");
  for (const id of ["s_followRoute", "s_anyPlace", "s_trip"]) assert.equal(app.d.getElementById(id), null, `${id} is gone`);
  const exp = [...app.d.querySelectorAll("#settingsForm fieldset")].find((f) => f.querySelector("legend").textContent.trim() === "Experimental");
  assert.deepEqual([...exp.querySelectorAll("input")].map((i) => i.id), ["s_alongLine"], "Along the line is the only Experimental switch");
  assert.ok(legends(app).includes("Appearance") && legends(app).includes("Notifications") && legends(app).includes("Simulation and testing"));
  assert.ok(inSection(app, "Appearance", "s_appearance"));
  for (const id of ["s_leaveAlerts", "s_wakeAt", "alertsTestBtn", "alertsStatus"]) assert.ok(inSection(app, "Notifications", id), id);
  for (const id of ["s_simulator", "s_simulatedFeeds"]) assert.ok(inSection(app, "Simulation and testing", id), id);
  assert.equal(app.d.querySelector("#tripFields").hidden, false, "Trip's settings are shown normally");
  assert.equal(app.c.S().leaveAlerts, undefined, "alerts stay off until you turn them on");
  assert.deepEqual(app.errors, []); app.close();
});

for (const v of [undefined, false, true]) {
  test(`Saved retired switches = ${v}: the features are there, the switches are dropped, nothing else changes`, async () => {
    const legacy = Object.fromEntries(RETIRED.filter(() => v !== undefined).map((k) => [k, v]));
    const app = await createApp({ settings: { provider: "demo", appearance: "dark", walkHomeStationAvg: 1400, alongLine: false, ...legacy },
      saved: { mode: "leisure", dirMode: "office", tripMode: { active: false } }, now: T0 });
    for (const k of RETIRED) assert.ok(!(k in app.c.state.saved.settings), `${k} dropped on load`);
    assert.ok(app.d.querySelector("[data-follow]"), "Follow offered");
    assert.equal(app.d.querySelector("#tripModeBtn").hidden, false, "Trip offered");
    assert.equal(app.c.state.saved.mode, "leisure"); assert.equal(app.c.state.saved.tripMode.active, false, "mode unchanged");
    assert.equal(app.c.S().appearance, "dark"); assert.equal(app.c.S().walkHomeStationAvg, 1400);
    assert.equal(app.d.querySelector("#destRow").hidden, false, "Any start and end point: Leisure going out asks where to");
    submit(app);
    const s = stored(app).settings;
    for (const k of RETIRED) assert.ok(!(k in s), `${k} not written back by Save`);
    assert.equal(s.appearance, "dark"); assert.equal(s.walkHomeStationAvg, 1400, "unrelated settings kept");
    // Reload from what was saved: still no retired switches, still the features.
    const { settings: _drop, ...rest } = stored(app);
    const again = await createApp({ settings: s, saved: rest, now: T0 });
    for (const k of RETIRED) assert.ok(!(k in again.c.state.saved.settings));
    assert.equal(again.d.querySelector("#tripModeBtn").hidden, false); assert.equal(again.c.S().appearance, "dark");
    assert.deepEqual(app.errors, []); assert.deepEqual(again.errors, []); app.close(); again.close();
  });
}

test("The iPhone app's cached settings can't bring a retired switch back", async () => {
  const sh = { calls: [], listeners: {} };
  const install = (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: {
    capabilities: async () => ({ v: 1, offline: true, alarm: true }), ready: async () => {}, configure: async () => {}, publish: async () => {}, cache: async () => {},
    cached: async () => ({ entries: [{ key: "settings", v: 1, dataAt: T0, savedAt: T0, value: { provider: "demo", followRoute: false, trip: false, anyPlace: false, appearance: "light" } }] }),
    addListener: (n, fn) => { sh.listeners[n] = fn; } } } }; };
  const app = await createApp({ settings: {}, now: T0, beforeScripts: install });
  await new Promise((r) => setTimeout(r, 50));
  for (const k of RETIRED) assert.ok(!(k in app.c.state.saved.settings), `${k} not restored`);
  assert.equal(app.c.S().appearance, "light", "the rest is restored");
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, false);
  assert.deepEqual(app.errors, []); app.close();
});

test("Follow and stop work with no setting, even saved as false before; Siri's follow link works too", async () => {
  const app = await createApp({ settings: { provider: "demo", followRoute: false }, saved: { dirMode: "office" }, now: T0 });
  const buttons = () => [...app.d.querySelectorAll("[data-follow]")];
  buttons()[0].click();
  const first = app.c.state.saved.followRoute;
  assert.ok(first && first.id, "followed");
  assert.equal(app.d.querySelector("#followPanel").hidden, false);
  const stop = app.d.querySelector('#followPanel [data-follow-action="stop"]');
  assert.ok(stop, "Stop following"); stop.click();
  assert.equal(app.c.state.saved.followRoute, null);
  // Siri: commute://next?direction=office&follow=1 follows the best train without any setting.
  app.c.nativeOpen("commute://next?direction=office&follow=1");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(app.c.state.saved.followRoute, "Siri's link followed");
  assert.deepEqual(app.errors, []); app.close();
});

test("Along the line keeps its own switch, off by default", async () => {
  const off = await createApp({ settings: { provider: "demo" }, now: T0 });
  assert.equal(off.c.S().alongLine, false); assert.equal(off.d.querySelector("#alongEntry").hidden, true);
  off.close();
  const on = await createApp({ settings: { provider: "demo", alongLine: true }, now: T0 });
  assert.equal(on.c.S().alongLine, true);
  assert.deepEqual(on.errors, []); on.close();
});

test("Display mode stays read-only: no Follow, no Trip, no simulation, whatever was saved", async () => {
  const app = await createApp({ settings: { provider: "demo", followRoute: true, trip: true, alongLine: true }, now: T0, url: "https://srapley-spec.github.io/cartref-commute/?display" });
  assert.equal(app.d.querySelector("[data-follow]"), null, "no Follow buttons");
  assert.ok(app.d.querySelector("#tripModeBtn").hidden, "no Trip");
  assert.equal(app.c.S().alongLine, false); assert.equal(app.c.S().simulatorEnabled, false);
  assert.deepEqual(app.errors, []); app.close();
});
