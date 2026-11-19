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

test("Settings: no key fields or proxy address at all; what the proxy is set up for and what's still to add; keys saved on a device are deleted once (17 Nov)", async () => {
  const KEYS = { rdmKey: "R", rdmSdKey: "S", tflKey: "PHONEKEY", googleKey: "G", huxleyToken: "H" };
  // A phone set up the old way: Darwin with its key, TfL and Google keys typed in, the Google choice made.
  const app = await createApp({ settings: { keysInProxy: 0, provider: "rdm", ...KEYS, googleVia: "browser", trip: true }, route: (u) => (u.startsWith("https://cartref-rail.s-rapley.workers.dev") ? proxied()(u.replace("https://cartref-rail.s-rapley.workers.dev", PROXY)) : undefined) });
  await sleep(100);
  for (const k of Object.keys(KEYS)) assert.equal(app.c.S()[k] || "", "", `${k} gone`);
  assert.equal(app.c.S().provider, "proxy", "the phone-key source becomes the app's proxy");
  assert.equal(app.c.S().proxyBase, "https://cartref-rail.s-rapley.workers.dev", "the address built into the app");
  const stored = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).settings;
  for (const k of [...Object.keys(KEYS), "googleVia"]) assert.ok(!(k in stored), `${k} not stored either`);
  assert.equal(stored.keysInProxy, 1, "done once");
  app.d.querySelector("#settingsBtn").click();
  for (const sel of ["#s_tflKey", "#s_rdmKey", "#s_proxyBase", "#s_googleVia", "#s_googleKey", "#googleKeyRow", "#clearKeysBtn", "#proxyLinkBtn", "#s_huxleyToken"])
    assert.equal(app.d.querySelector(sel), null, `${sel} is gone`);
  assert.deepEqual([...app.d.querySelectorAll("#s_provider option")].map(o => o.value), ["proxy", "tfl", "demo"]);
  // Live data is a drop-down: a one-line summary, and each service with whether it's live (Sam, 18 Nov).
  assert.equal(app.d.querySelector("#liveDataDetails summary").textContent, "2 not live: Google: walk and drive for Trip, Any station for Trip");
  const live = Object.fromEntries([...app.d.querySelectorAll("#liveDataDetails li")].map(li => [li.dataset.service, li.dataset.live]));
  assert.deepEqual(live, { rail: "true", serviceDetails: "true", tfl: "true", google: "false", anyStation: "false" });
  assert.match(app.text("#proxyStatus"), /✗ Google: walk and drive for Trip: not set up in the proxy \(GOOGLE_KEY\)/);
  assert.match(app.text("#proxyStatus"), /add the missing secret to GitHub's Actions secrets, then run Deploy proxy/);
  // …and the home page says so at the top only in Trip (Trip's own services; review of #63: no warning for the commute).
  assert.equal(app.d.querySelector('[data-banner="not-live"]'), null, "in the commute: no warning for Trip's services");

  app.close();
  // A new device: nothing saved at all, and it starts on the app's proxy.
  const fresh = await createApp({ settings: { keysInProxy: 0 }, route: (u) => (u.startsWith("https://cartref-rail.s-rapley.workers.dev") ? proxied()(u.replace("https://cartref-rail.s-rapley.workers.dev", PROXY)) : undefined) });
  await sleep(100);
  assert.equal(fresh.c.S().provider, "proxy"); assert.equal(fresh.c.S().proxyBase, "https://cartref-rail.s-rapley.workers.dev");
  fresh.close();
  // Proxy unreachable: says so.
  const down = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: (u) => (u === PROXY + "/status" ? json({}, 503) : proxied()(u)) });
  await sleep(100);
  down.d.querySelector("#settingsBtn").click();
  assert.match(down.text("#proxyStatus"), /✗ National Rail live times: couldn't reach the proxy \(HTTP 503\)/);
  assert.match(down.text('[data-banner="not-live"]'), /National Rail live times: couldn't reach the proxy \(HTTP 503\)/);
  down.close();
});

test("Setup link: opening #setup=<proxy> asks, naming the host; yes sets up My proxy and keeps everything else; no changes nothing", async () => {
  const app = await createApp({ settings: { provider: "tfl", tflKey: "KEEP", appearance: "dark" } });
  const asked = [];
  app.w.confirm = (m) => { asked.push(m); return true; };
  app.w.location.hash = `#setup=${encodeURIComponent(PROXY + "/")}`;
  assert.equal(app.c.acceptSetupLink(), true);
  assert.match(asked[0], /^Use cartref-rail\.example\.workers\.dev for all live data on this device\?/);
  assert.match(asked[0], /Only say yes if you set this proxy up or trust whoever sent the link/);
  assert.equal(app.c.S().provider, "proxy"); assert.equal(app.c.S().proxyBase, PROXY);
  assert.equal(app.c.S().tflKey, "KEEP"); assert.equal(app.c.S().appearance, "dark", "nothing else changed");
  assert.equal(app.w.location.hash, `#setup=${encodeURIComponent(PROXY + "/")}`, "kept, so Add to Home Screen carries it");
  assert.equal(app.c.acceptSetupLink(), false, "already set up for it: not asked again");
  assert.equal(asked.length, 1);
  app.w.confirm = (m) => { asked.push(m); return false; };
  app.w.location.hash = `#setup=${encodeURIComponent("https://other.example")}`;
  assert.equal(app.c.acceptSetupLink(), false); assert.equal(app.c.S().proxyBase, PROXY, "refused: unchanged");
  assert.equal(app.w.location.hash, "", "a refused link is cleared");
  assert.equal(app.c.proxySetupLink(PROXY), `https://srapley-spec.github.io/cartref-commute/#setup=${encodeURIComponent(PROXY)}`);
  app.close();
});

test("Setup link: an address that isn't a plain https host is refused without asking (look-alikes, userinfo, IPs, ports, paths)", async () => {
  const app = await createApp({ settings: { provider: "tfl" } });
  let asked = 0;
  app.w.confirm = () => { asked++; return true; };
  for (const bad of ["http://plain.example", "javascript:alert(1)", "https://a.example/path", "https://a b.example", "https://evil.example\\.cartref-rail.sam.workers.dev",
    "https://cartref-rail.sam.workers.dev@evil.example", "https://u:p@a.example", "https://192.168.1.1", "https://[::1]", "https://x.example:8443", "https://a.example/?q=1", "https://localhost", "%E0%A4%A"]) {
    app.w.location.hash = `#setup=${bad.startsWith("%") ? bad : encodeURIComponent(bad)}`;
    assert.equal(app.c.acceptSetupLink(), false, bad);
    assert.equal(app.w.location.hash, "", `${bad}: cleared`);
  }
  assert.equal(asked, 0, "never asked");
  assert.equal(app.c.S().provider, "tfl"); assert.equal(app.c.S().proxyBase, "https://cartref-rail.s-rapley.workers.dev", "the built-in address, unchanged");
  // Punycode: a look-alike Unicode host is shown as what it is.
  assert.match(app.c.proxyOrigin("https://саrtref.example"), /^https:\/\/xn--[a-z0-9-]+\.example$/);
  app.close();
});

test("Setup link: a page opened from one asks at launch and starts on My proxy; a link arriving later (hashchange) is handled too", async () => {
  const asked = [];
  const app = await createApp({ settings: { provider: "tfl" }, url: `https://srapley-spec.github.io/cartref-commute/#setup=${encodeURIComponent(PROXY)}`,
    beforeScripts: (w) => { w.confirm = (m) => { asked.push(m); return true; }; }, route: proxied() });
  assert.equal(asked.length, 1);
  assert.equal(app.c.S().provider, "proxy");
  assert.ok(app.calls.includes(PROXY + "/status"), "and asks the proxy what it's set up for");
  app.close();
  const later = await createApp({ settings: { provider: "tfl" }, route: proxied() });
  later.w.confirm = () => true;
  later.w.location.hash = `#setup=${encodeURIComponent(PROXY)}`;
  await sleep(100);
  assert.equal(later.c.S().provider, "proxy");
  later.close();
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

test("My proxy without an address yet: TfL stays direct (no relative /tfl/ requests); a trailing slash makes no //tfl/", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: "" } });
  await sleep(100);
  assert.ok(app.calls.every(u => !/^\/tfl\//.test(u) && !u.includes("/tfl/")), app.calls.join("\n"));
  assert.ok(app.calls.some(u => u.startsWith("https://api.tfl.gov.uk/")), "TfL direct");
  app.close();
  const slash = await createApp({ settings: { provider: "proxy", proxyBase: PROXY + "/" }, route: proxied() });
  await sleep(100);
  assert.ok(slash.calls.some(u => u.startsWith(PROXY + "/tfl/")));
  assert.ok(slash.calls.every(u => !u.includes("//tfl/") && !u.includes("//status")), slash.calls.join("\n"));
  // The platform capture goes through the proxy too.
  const n = slash.calls.length;
  await slash.c.captureAldgate();
  const cap = slash.calls.slice(n);
  assert.ok(cap.length >= 3 && cap.every(u => u.startsWith(PROXY + "/tfl/")), cap.join("\n"));
  assert.ok(cap.some(u => u === PROXY + "/tfl/trackernet/PredictionDetailed/M/ALD"));
  slash.close();
});

test("TfL counts as keyed only when the proxy now in use said so; the advice points at the proxy, not a hidden field", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: proxied() });
  await sleep(100);
  assert.equal(app.c.tflKeyed(), true, "no key on the phone; the proxy holds one");
  app.c.state.saved.settings.proxyBase = "https://other.example";
  assert.equal(app.c.tflKeyed(), false, "an answer from another proxy doesn't count");
  app.close();
  const unkeyed = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: proxied({ ...STATUS, tflKey: false }) });
  await sleep(100);
  unkeyed.d.querySelector("#settingsBtn").click();
  assert.match(unkeyed.text("#proxyStatus"), /✓ TfL: tubes and line status: live, without a key \(TfL's shared limit applies; TFL_KEY\)/);
  assert.doesNotMatch(unkeyed.d.querySelector("#liveDataDetails summary").textContent, /TfL/, "unkeyed TfL is still live: no warning");
  assert.equal(unkeyed.d.querySelector('[data-banner="not-live"]'), null);
  assert.match(unkeyed.text("#proxyStatus"), /Google: walk and drive for Trip/, "Trip is permanent (#63): its services are listed");
  assert.doesNotMatch(unkeyed.text("#proxyStatus"), /alerts/, "alerts are off: not listed");
  assert.equal(unkeyed.c.tflKeyAdvice(), "add TFL_KEY to GitHub's Actions secrets and run Deploy proxy");
  const shown = unkeyed.d.body.cloneNode(true); shown.querySelectorAll("script,style").forEach(n => n.remove());
  assert.doesNotMatch(shown.textContent, /free TfL (app )?key in Settings/);
  unkeyed.close();
});

test("A new proxy address (from a setup link) asks /status once; an unrelated save doesn't; an old Worker (404) says redeploy", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, route: (u) => (u === "https://new.example/status" ? json({}, 404) : proxied()(u)) });
  await sleep(100);
  const statusCalls = () => app.calls.filter(u => u.endsWith("/status")).length;
  const save = async () => { app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); await sleep(100); };
  const n = statusCalls();
  app.d.querySelector("#settingsBtn").click(); app.d.querySelector("#s_alongLine").checked = true; await save();
  assert.equal(statusCalls(), n, "unrelated save");
  assert.equal(app.c.S().proxyBase, PROXY, "a save keeps the address it doesn't show");
  app.w.confirm = () => true;
  app.w.location.hash = `#setup=${encodeURIComponent("https://new.example")}`;
  app.w.dispatchEvent(new app.w.Event("hashchange")); await sleep(100);
  assert.equal(statusCalls(), n + 1);
  assert.ok(app.calls.includes("https://new.example/status"));
  app.d.querySelector("#settingsBtn").click();
  assert.match(app.text("#proxyStatus"), /the proxy needs redeploying/);
  app.close();
});
