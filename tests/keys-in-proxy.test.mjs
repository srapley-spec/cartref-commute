// Every key in the proxy (docs/stories/keys-in-the-proxy.md): with Settings → National Rail → Source → My proxy, TfL
// and Google go through it too, the phone sends no key, Settings says what the proxy is set up for, and a setup link
// sets up another device in one tap.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createApp, sleep, json, closeAll } from "./harness.mjs";
import { core } from "./core/helpers.mjs";
after(closeAll);
const require = createRequire(import.meta.url);
const A = require("../src/trip-adapters.js");

const PROXY = "https://cartref-rail.example.workers.dev";
const STATUS = { v: 1, rail: true, serviceDetails: true, tflKey: true, google: false, anyStation: false, alerts: false };
const proxied = (status = STATUS) => (u) => {
  if (!u.startsWith(PROXY)) return undefined;
  if (u === PROXY + "/status") return json(status);
  if (/\/board\//.test(u)) return json({ trainServices: [], nrccMessages: [] });
  return undefined;   // /tfl/...: the harness's TfL stub answers (it matches the path, whatever the host)
};

test("My proxy: every TfL request goes to the proxy's /tfl/ route, with no key from the phone, even if one is stored", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY, tflKey: "PHONEKEY", rdmKey: "RDMKEY" }, route: proxied() });
  await sleep(200);
  const tfl = app.calls.filter(u => /tfl/i.test(u));
  assert.ok(tfl.length > 0, "TfL was asked");
  assert.ok(app.calls.every(u => !u.startsWith("https://api.tfl.gov.uk")), "nothing straight to TfL:\n" + app.calls.join("\n"));
  assert.ok(app.calls.every(u => !/PHONEKEY|RDMKEY|app_key/.test(u)), "no key in any request");
  assert.ok(tfl.some(u => u.startsWith(`${PROXY}/tfl/Line/`)), "line status through the proxy:\n" + tfl.join("\n"));
  assert.equal(app.c.tflUrl("https://api.tfl.gov.uk/Journey/JourneyResults/a/to/b?time=1000"), `${PROXY}/tfl/Journey/JourneyResults/a/to/b?time=1000`);
  assert.equal(app.c.tflUrl("https://api.tfl.gov.uk/Line/Mode/national-rail/Status"), `${PROXY}/tfl/Line/Mode/national-rail/Status`);
  // TfL counts as keyed when the proxy says it holds a key.
  assert.equal(app.calls.filter(u => u === PROXY + "/status").length, 1, "status asked once at start");
  assert.equal(app.c.tflKeyed(), true);
  app.close();
  const unkeyed = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: proxied({ ...STATUS, tflKey: false }) });
  await sleep(100);
  assert.equal(unkeyed.c.tflKeyed(), false);
  unkeyed.close();
});

test("Other sources are unchanged: TfL direct with the phone's key; simulated feeds never reach the proxy", async () => {
  const app = await createApp({ settings: { provider: "tfl", tflKey: "abc123", proxyBase: PROXY } });
  assert.equal(app.c.tflUrl("https://api.tfl.gov.uk/Line/x/Status"), "https://api.tfl.gov.uk/Line/x/Status?app_key=abc123");
  assert.ok(app.calls.every(u => !u.startsWith(PROXY)));
  app.close();
  const sim = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: proxied(), settle: 100 });
  sim.d.querySelector("#settingsBtn").click(); sim.d.querySelector("#s_simulatedFeeds").checked = true;
  sim.d.querySelector("#settingsForm").dispatchEvent(new sim.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(100);
  assert.equal(sim.c.tflUrl("https://api.tfl.gov.uk/Line/x/Status"), "https://api.tfl.gov.uk/Line/x/Status", "simulated: the simulator's TfL");
  sim.close();
});

test("Settings with My proxy: no key fields; what the proxy is set up for and what's still to set; remove keys from this phone", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY, tflKey: "PHONEKEY", googleKey: "G", trip: true }, route: proxied() });
  await sleep(100);
  app.d.querySelector("#settingsBtn").click();
  assert.equal(app.d.querySelector("#s_tflKey").closest("label").hidden, true, "no TfL key field");
  assert.equal(app.d.querySelector("#s_googleVia").closest("label").hidden, true, "no Google choice");
  assert.equal(app.d.querySelector("#googleKeyRow").hidden, true, "no Google key field");
  const st = app.text("#proxyStatus");
  assert.match(st, /National Rail ✓ · TfL ✓ keyed · Google ✗ · Alerts ✗/);
  assert.match(st, /Still to set in Cloudflare: Google for Trip \(GOOGLE_KEY\); any station for Trip \(ALLOW_ANY_STATION=yes\)/);
  assert.match(st, /This phone still holds keys you can remove/);
  const btn = app.d.querySelector("#clearKeysBtn");
  assert.equal(btn.hidden, false);
  btn.click();
  assert.equal(app.c.S().tflKey, "", "TfL key gone"); assert.equal(app.c.S().googleKey || "", "");
  assert.equal(btn.hidden, true);
  const stored = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).settings;
  assert.ok(!("tflKey" in stored) && !("googleKey" in stored), "not stored either");
  app.close();
  // Proxy unreachable: says so.
  const down = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: (u) => (u === PROXY + "/status" ? json({}, 503) : proxied()(u)) });
  await sleep(100);
  down.d.querySelector("#settingsBtn").click();
  assert.match(down.text("#proxyStatus"), /Couldn't reach your proxy \(HTTP 503\)/);
  down.close();
});

test("Setup link: opening #setup=<proxy> sets up this device for My proxy after a confirmation; refused or malformed changes nothing", async () => {
  const app = await createApp({ settings: { provider: "tfl" } });
  let asked = "";
  app.w.confirm = (m) => { asked = m; return true; };
  app.w.location.hash = `#setup=${encodeURIComponent(PROXY + "/")}`;
  assert.equal(app.c.acceptSetupLink(), true);
  assert.match(asked, /Use https:\/\/cartref-rail\.example\.workers\.dev for all live data on this device\?/);
  assert.equal(app.c.S().provider, "proxy"); assert.equal(app.c.S().proxyBase, PROXY);
  assert.equal(app.w.location.hash, "", "the link is cleared from the address");
  app.w.confirm = () => false; app.w.location.hash = `#setup=${encodeURIComponent("https://other.example")}`;
  assert.equal(app.c.acceptSetupLink(), false); assert.equal(app.c.S().proxyBase, PROXY, "refused: unchanged");
  app.w.confirm = () => { throw new Error("must not ask"); };
  for (const bad of ["http://plain.example", "javascript:alert(1)", "https://a.example/path", "https://a b.example"]) {
    app.w.location.hash = `#setup=${encodeURIComponent(bad)}`;
    assert.equal(app.c.acceptSetupLink(), false, bad);
  }
  assert.equal(app.c.S().proxyBase, PROXY);
  app.close();
});

test("Trip with My proxy: TfL's planner asks through the page's tflUrl (no key in the URL)", async () => {
  const urls = [];
  const ad = A.tflPlanner({ net: { fetchT: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ journeys: [] }) }; }, epoch: () => 1, assertEpoch() {} },
    getKey: () => "PHONEKEY", urlFor: (u) => u.replace("https://api.tfl.gov.uk/", `${PROXY}/tfl/`), idx: {}, endMatchM: 300, core });
  await ad.plan({ name: "A", ids: { tflIcs: ["1000001"] } }, { name: "B", ids: { tflIcs: ["1000002"] } }, Date.now(), "Departing");
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith(`${PROXY}/tfl/Journey/JourneyResults/1000001/to/1000002?`), urls[0]);
  assert.doesNotMatch(urls[0], /app_key|PHONEKEY/);
});

test("Trip with My proxy: Google goes through the proxy too, so no Google key is asked for", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY, trip: true }, route: proxied({ ...STATUS, google: true }) });
  await sleep(100);
  app.d.querySelector("#tripModeBtn").click();
  await sleep(300);
  assert.doesNotMatch(app.text("#tripRoot"), /Add a Google Maps key/);
  assert.ok(app.calls.every(u => !/maps\.googleapis\.com/.test(u)), "no Maps JS library loaded");
  app.close();
});
