// Display mode (docs/stories/display-mode.md): ?display in the address turns the app into a read-only board for a wall
// screen or a frame in another page (a Home Assistant dashboard). No controls, no location: the next journeys from
// home to the office in Leave now. It changes nothing this browser has saved except the live-data source.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, json, closeAll, hm, at } from "./harness.mjs";
after(closeAll);

const BASE = "https://srapley-spec.github.io/cartref-commute/";
const PROXY = "https://cartref-rail.example.workers.dev";
const LS = "cartrefCommute.v1";
const stored = (app) => JSON.parse(app.w.localStorage.getItem(LS));
const shown = (app, sel) => { const el = app.d.querySelector(sel); return !!el && !el.hidden && app.w.getComputedStyle(el).display !== "none"; };
// A phone that was last planning a leisure trip home, arriving by a time, following a route, with every extra switched on.
const PHONE = { mode: "leisure", dirMode: "home", view: "by", pace: "fast", followRoute: { marker: "kept" }, viewOverride: "live" };
const EXTRAS = { provider: "tfl", followRoute: true, alongLine: true };

test("Display mode: Leave now from home to the office, whatever this browser last had on screen", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  assert.ok(app.d.documentElement.classList.contains("display-mode"));
  assert.equal(app.c.direction(), "office");
  assert.equal(app.c.state.saved.mode, "commute");
  assert.equal(app.c.state.saved.view, "now");
  assert.equal(app.c.state.saved.pace, "fast", "your walking pace is kept: it sets the leave times");
  assert.match(app.text("#hero"), /If you leave now/);
  assert.match(app.text("#hero"), /Leave by/);
  assert.match(app.text("#hero"), /At office/);
  assert.equal(app.text("#listTitle"), "Next trains, in leaving order");
  assert.ok(app.rows().length > 0 || app.d.querySelectorAll("#list > *").length > 0, "the next trains are listed");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Display mode: only the status line, the recommendation, the list and 'Updated' are shown; every control is hidden", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  for (const sel of ["#hero", "#list", "#listTitle", "#signalStatus", "#updated"]) assert.ok(shown(app, sel), `${sel} is shown`);
  for (const sel of ["header", "#signalModebar", "#signalToolbar", "#signalPlanningControls", "#dirNote", "#journeyViewControl", "#alongNavigation",
    "#followPanel", "#originRow", "#destRow", "#byForm", "#diag", "#signalNetwork", "#signalOtherJourneys", "#tripRoot", "#refreshBtn", "#build"]) {
    const el = app.d.querySelector(sel);
    if (!el) continue;                                   // not built at all is hidden enough
    let node = el, hidden = false;
    while (node && node.nodeType === 1) { if (node.hidden || app.w.getComputedStyle(node).display === "none") { hidden = true; break; } node = node.parentElement; }
    assert.ok(hidden, `${sel} is hidden`);
  }
  // (The simulator's dock sits outside the page column; jsdom doesn't apply the !important rule that hides it, so
  // check what's inside it: nothing of the simulator is on screen.)
  const controls = [...app.d.querySelectorAll(".wrap button, .wrap select, .wrap input, #simDock button, #simDock select, #simDock input")].filter((el) => {
    let node = el; while (node && node.nodeType === 1) { if (node.hidden || app.w.getComputedStyle(node).display === "none") return false; node = node.parentElement; } return true; });
  assert.deepEqual(controls.map((el) => el.id || el.textContent.trim()), [], "no button, select or input is left on screen");
  assert.equal(app.d.querySelectorAll("#hero [data-follow], #list [data-follow]").length, 0, "no Follow buttons, though Follow is on in Settings");
  app.close();
});

test("Display mode: never asks for this device's location; the normal app still does", async () => {
  const a = await createApp({ url: BASE + "?display", settings: EXTRAS });
  a.d.dispatchEvent(new a.w.Event("visibilitychange"));
  await sleep(50);
  assert.equal(a.c.state.watchId, undefined, "no location watch at start or on coming back");
  assert.equal(a.c.state.here, null);
  assert.equal(a.c.state.locStatus, "off");
  a.close();
  const b = await createApp({ url: BASE, settings: EXTRAS });
  assert.notEqual(b.c.state.watchId, undefined, "the normal app watches your location");
  assert.ok(b.c.state.here, "and has a position");
  assert.equal(b.d.documentElement.classList.contains("display-mode"), false);
  assert.ok(shown(b, "#signalModebar"), "the normal app keeps its controls");
  b.close();
});

test("Display mode: nothing this browser has saved is changed", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  const before = JSON.stringify(stored(app));
  app.c.render(); await app.c.refresh({ force: true }); await sleep(50);
  assert.equal(JSON.stringify(stored(app)), before);
  assert.deepEqual(stored(app).followRoute, { marker: "kept" });
  assert.equal(stored(app).view, "by"); assert.equal(stored(app).dirMode, "home"); assert.equal(stored(app).mode, "leisure");
  app.close();
});

test("Display mode: a setup link asks on the page (a framed page can't show a browser dialog); Yes saves only the live-data source", async () => {
  const asked = [];
  const route = (u) => (u === PROXY + "/status" ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true, google: false, anyStation: false, alerts: false })
    : u.startsWith(PROXY) && /\/board\//.test(u) ? json({ trainServices: [], nrccMessages: [] }) : undefined);
  const app = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: EXTRAS, saved: PHONE,
    beforeScripts: (w) => { w.confirm = (m) => { asked.push(m); return true; }; }, route });
  assert.equal(asked.length, 0, "no browser dialog");
  assert.equal(app.c.S().provider, "tfl", "nothing changes until you say yes");
  assert.ok(shown(app, "#displaySetup"));
  assert.match(app.text("#displaySetup"), /Use cartref-rail\.example\.workers\.dev for all live data on this display\?/);
  app.d.querySelector('[data-display-setup="yes"]').click();
  await sleep(100);
  assert.equal(app.d.querySelector("#displaySetup"), null);
  assert.equal(app.c.S().provider, "proxy"); assert.equal(app.c.S().proxyBase, PROXY);
  assert.ok(app.calls.includes(PROXY + "/status"), "and asks the proxy what it's set up for");
  const s = stored(app);
  assert.equal(s.settings.provider, "proxy"); assert.equal(s.settings.proxyBase, PROXY);
  assert.equal(s.settings.followRoute, true, "your own switches are stored as they were, not as display mode forces them");
  assert.equal(s.view, "by"); assert.deepEqual(s.followRoute, { marker: "kept" });
  app.close();
});

test("Display mode: saying No to a setup link changes nothing; a look-alike address isn't offered; already set up isn't asked again", async () => {
  const no = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: EXTRAS });
  no.d.querySelector('[data-display-setup="no"]').click();
  await sleep(20);
  assert.equal(no.c.S().provider, "tfl"); assert.equal(no.d.querySelector("#displaySetup"), null);
  assert.equal(no.w.location.hash, "", "the link is cleared from the address");
  assert.equal(no.w.location.search, "?display", "and it's still display mode");
  no.close();
  const bad = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent("http://10.0.0.1:8080/x")}`, settings: EXTRAS });
  assert.equal(bad.d.querySelector("#displaySetup"), null);
  bad.close();
  const done = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: { provider: "proxy", proxyBase: PROXY },
    route: (u) => (u.startsWith(PROXY) ? json(u.endsWith("/status") ? { v: 1, rail: true } : { trainServices: [], nrccMessages: [] }) : undefined) });
  assert.equal(done.d.querySelector("#displaySetup"), null);
  done.close();
});

test("Display mode: an always-on screen stays inside its request budget: three boards a minute and under four requests a minute through the proxy", async () => {
  // Sam, 10 Nov: refresh every minute all day, without using up the feeds' allowances (Cloudflare's free 100,000 a
  // day; docs/stories/display-mode.md has the measured figures). A change that raises this is a decision for Sam.
  const m = 60e3, start = at("2026-11-03", "06:30");
  let clock = start;
  const board = (to) => ({ locationName: "Letchworth", trainServices: [15, 30, 45, 60, 75].map((d, i) => ({ serviceID: `S${i}${to}`, std: hm(start + d * m), etd: "On time",
    operator: "Thameslink", platform: "1", subsequentCallingPoints: [{ callingPoint: [{ crs: to, locationName: to, st: hm(start + (d + 45) * m), et: "On time" }] }] })), nrccMessages: [] });
  const app = await createApp({ url: BASE + "?display", settings: { provider: "proxy", proxyBase: PROXY }, now: start,
    route: (u) => { if (!u.startsWith(PROXY)) return undefined; const b = u.match(/\/board\/[A-Z]{3}\/([A-Z]{3})/);
      return b ? json(board(b[1])) : u.endsWith("/status") ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true }) : json([]); } });
  assert.match(app.text("#hero"), /Leave by/, "live trains are on the board");
  const atLoad = app.calls.length, perMinute = [];
  for (let i = 1; i <= 10; i++) {
    clock = start + i * m; app.setNow(clock);
    const before = app.calls.length;
    await app.c.refresh(); await sleep(30);                    // the page's own once-a-minute refresh
    const made = app.calls.slice(before);
    assert.ok(made.filter((u) => /\/board\//.test(u)).length <= 3, `minute ${i}: at most the three boards from home\n${made.join("\n")}`);
    perMinute.push(made.length);
  }
  assert.ok(app.calls.every((u) => u.startsWith(PROXY)), "everything goes through the proxy");
  assert.ok(atLoad <= 8, `at load: ${atLoad}`);
  const total = perMinute.reduce((a, b) => a + b, 0);
  assert.ok(total >= 30, `it does refresh every minute: ${perMinute.join(",")}`);
  assert.ok(total <= 40, `under four requests a minute on average (≈5,300 a day): ${perMinute.join(",")}`);
  app.close();
});
