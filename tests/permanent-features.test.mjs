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

// ---- Historical compatibility review (18 Nov): what someone had switched off stays unused ----
test("A device from before #63 with Follow off: a route left saved isn't followed now (nor sent to alerts or the iPhone app)", async () => {
  const route = { id: "dormant", phase: "before-train", direction: "office", mode: "commute" };
  for (const followRoute of [false, undefined]) {
    const app = await createApp({ settings: { provider: "demo", featuresPermanent: 0, ...(followRoute === undefined ? {} : { followRoute }) },
      saved: { dirMode: "office", followRoute: route, follow: { train: { std: "08:00" } } }, now: T0 });
    assert.equal(app.c.state.saved.followRoute ?? null, null, `followRoute ${followRoute}: not followed`);
    assert.equal(app.c.state.saved.follow ?? null, null, "the legacy record too");
    assert.equal(app.d.querySelector("#followPanel").hidden, true);
    assert.equal(app.c.nativeFollowPlan(), null, "nothing for the iPhone app");
    assert.equal(app.c.state.saved.settings.featuresPermanent, 1, "done once");
    assert.ok(app.d.querySelector("[data-follow]"), "Follow is offered");
    app.close();
  }
  // Follow was on: the journey is kept.
  const on = await createApp({ settings: { provider: "demo", featuresPermanent: 0, followRoute: true }, saved: { dirMode: "office" }, now: T0 });
  [...on.d.querySelectorAll("[data-follow]")][0].click();
  const kept = JSON.parse(on.w.localStorage.getItem("cartrefCommute.v1")); on.close();
  kept.settings.featuresPermanent = 0; kept.settings.followRoute = true;
  const { settings: ks, ...krest } = kept;
  const again = await createApp({ settings: ks, saved: krest, now: T0 });
  assert.ok(again.c.state.saved.followRoute, "Follow was on: still followed");
  assert.deepEqual(again.errors, []); again.close();
  // A device already migrated keeps a route followed after the change, whatever else is saved.
  const after = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, now: T0 });
  [...after.d.querySelectorAll("[data-follow]")][0].click();
  const st = JSON.parse(after.w.localStorage.getItem("cartrefCommute.v1")); after.close();
  const { settings: s2, ...r2 } = st;
  const reload = await createApp({ settings: s2, saved: r2, now: T0 });
  assert.ok(reload.c.state.saved.followRoute, "followed after #63: kept on reload");
  reload.close();
});

test("A device from before #63 with Trip off: an open Trip isn't reopened and its followed Trip is dropped; with Trip on, it is kept", async () => {
  const tripMode = { active: true, from: { name: "Home" }, follow: { id: "t-old", journey: { rides: [] } } };
  const off = await createApp({ settings: { provider: "demo", featuresPermanent: 0, trip: false }, saved: { tripMode }, now: T0 });
  assert.equal(off.c.state.saved.tripMode.active, false); assert.equal(off.c.state.saved.tripMode.follow, undefined);
  assert.equal(off.d.documentElement.dataset.trip, "off"); assert.deepEqual(JSON.parse(JSON.stringify(off.c.state.saved.tripMode.from)), { name: "Home" }, "the rest kept");
  off.close();
  const on = await createApp({ settings: { provider: "demo", featuresPermanent: 0, trip: true }, saved: { tripMode }, now: T0 });
  assert.equal(on.c.state.saved.tripMode.active, true); assert.equal(on.c.state.saved.tripMode.follow.id, "t-old");
  on.close();
});

test("A device from before #63 with Any start and end point off: a 'Where to?' place left saved isn't planned to", async () => {
  const off = await createApp({ settings: { provider: "demo", featuresPermanent: 0 }, saved: { mode: "leisure", dirMode: "office", dest: "Science Museum" }, now: T0 });
  assert.equal(off.c.state.saved.dest, undefined);
  assert.equal(off.text("#routeLabel"), "Cartref → King's Cross or St Pancras");
  off.close();
  const on = await createApp({ settings: { provider: "demo", featuresPermanent: 0, anyPlace: true }, saved: { mode: "leisure", dirMode: "office", dest: "Science Museum" }, now: T0 });
  assert.equal(on.c.state.saved.dest, "Science Museum"); on.close();
});

test("Leisure: 'Where from?' is offered with location, and folds away with the controls while following", async () => {
  const london = (u) => { const m = /JourneyResults\/[^/]+\/to\/(940GZZLU\w+)/.exec(u); if (!m) return undefined;
    return new Response(JSON.stringify({ journeys: [{ arrivalDateTime: new Date(Date.now() + 18 * 60e3).toISOString(), duration: 18, legs: [{ mode: { id: "walking" }, duration: 18 }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  const app = await createApp({ settings: { provider: "tfl", tflKey: "k" }, saved: { mode: "leisure", dirMode: "home" }, now: at("2026-11-03", "15:00"),
    geo: { coords: { latitude: 51.5136, longitude: -0.1365, accuracy: 20 } }, route: london, settle: 600 });
  assert.equal(app.d.querySelector("#originRow").hidden, false, "offered even with location (Any start and end point is permanent)");
  const b = app.d.querySelector("[data-follow]:not([disabled])");
  assert.ok(b, "a train to follow");
  b.click();
  assert.ok(app.c.state.saved.followRoute);
  assert.equal(app.d.querySelector("#originRow").hidden, true, "under way: folded away with the controls (12 Nov)");
  app.d.querySelector('#followPanel [data-follow-action="stop"]').click();
  assert.equal(app.d.querySelector("#originRow").hidden, false, "stopped: offered again");
  assert.deepEqual(app.errors, []); app.close();
});

test("Any start and end point: an ambiguous typed place takes TfL's best guess once per station (4 requests, not 6)", async () => {
  const j = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "Content-Type": "application/json" } });
  const route = (u) => {
    if (/JourneyResults\/Soho\/to\//.test(u)) return j({ fromLocationDisambiguation: { disambiguationOptions: [{ parameterValue: "1000123", matchQuality: 900, place: { commonName: "Soho Square" } }] } }, 300);
    if (/JourneyResults\/1000123\/to\//.test(u)) return j({ journeys: [{ arrivalDateTime: new Date(Date.now() + 20 * 60e3).toISOString(), duration: 20, legs: [{ mode: { id: "walking" }, duration: 20 }] }] });
    return undefined;
  };
  const app = await createApp({ settings: { provider: "tfl", tflKey: "k" }, saved: { mode: "commute" }, now: T0, route });
  const before = app.calls.length;
  const r = await app.c.fetchLondon("Soho");
  const asked = app.calls.slice(before).filter((u) => /JourneyResults/.test(u));
  assert.equal(asked.length, 4, asked.join("\n"));
  assert.equal(asked.filter((u) => /\/Soho\//.test(u)).length, 2); assert.equal(asked.filter((u) => /\/1000123\//.test(u)).length, 2);
  assert.ok(r.KXSP && r.FAR, "both stations planned from the guessed place");
  assert.deepEqual(app.errors, []); app.close();
});
