// Commute watch on the proxy (#66): docs/stories/commute-watch.md. Off unless the iPhone turned it on; nothing fetched
// outside the windows or with nobody watching; one alert per change, through APNs; Settings' test notification.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";
import { runWatch, WATCH_EVERY_MIN } from "../proxy/watch.js";
import { resetApnsJwt } from "../proxy/native.js";

const ORIGIN = "capacitor://localhost", MIN = 60e3, TOKEN = "a".repeat(64);
const at = (day, hm) => new Date(`${day}T${hm}:00`).getTime();
const DAY = "2026-11-19";   // Thursday
function kv() {
  const m = new Map();
  return { m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } };
}
async function envWith() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  resetApnsJwt();
  return { ALLOW_ORIGIN: ORIGIN, RDM_BASE: "https://up.test/LDBWS/api/20220120", RDM_KEY: "rdm-secret", TFL_KEY: "tfl-secret", PUSH: kv(),
    APNS_KEY: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`, APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_TOPIC: "uk.cartref.srapley.commute" };
}
const post = (path, body) => new Request(`https://proxy.test${path}`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
// Boards home: the 17:05 from King's Cross, cancelled or late as asked.
const kgx = (etd) => ({ trainServices: [{ std: "17:05", etd, operator: "Great Northern", serviceID: "S1705", ...(etd === "Cancelled" ? { isCancelled: true } : {}),
  subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: "17:40", et: etd === "On time" ? "On time" : etd }] }] }], nrccMessages: [] });
async function withFeeds(fn, etd = () => "On time") {
  const real = globalThis.fetch, pushes = [], fetched = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("push.apple.com")) { pushes.push({ url: u, body: JSON.parse(opts.body) }); return new Response(null, { status: 200 }); }
    fetched.push(u);
    if (u.startsWith("https://up.test/")) return new Response(JSON.stringify(/\/KGX\?/.test(u) ? kgx(etd()) : { trainServices: [], nrccMessages: [] }), { status: 200 });
    if (u.startsWith("https://api.tfl.gov.uk/")) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error("unexpected fetch " + u);
  };
  try { return await fn({ pushes, fetched }); } finally { globalThis.fetch = real; }
}
async function register(env, prefs) {
  const r = await worker.fetch(post("/native/register", { apnsToken: TOKEN, env: "production", prefs }), env);
  return r.json();
}

test("Commute watch: nothing fetched with nobody watching, outside the windows, or on an odd minute", async () => {
  const env = await envWith();
  await register(env, { alarm: true, alarmLeadMin: 5 });
  await withFeeds(async ({ fetched }) => {
    assert.deepEqual(await runWatch(env, at(DAY, "17:00")), []);
    assert.equal(fetched.length, 0, "the watch is off unless turned on");
  });
  const env2 = await envWith();
  await register(env2, { alarm: true, alarmLeadMin: 5, watch: true });
  await withFeeds(async ({ fetched }) => {
    await runWatch(env2, at(DAY, "12:00")); await runWatch(env2, at("2026-11-21", "17:00")); await runWatch(env2, at(DAY, "17:01"));
    assert.equal(fetched.length, 0, "midday, Saturday, an odd minute");
    await runWatch(env2, at(DAY, "17:00"));
    assert.equal(fetched.filter((u) => u.startsWith("https://up.test/")).length, 3, "three boards home");
    assert.ok(fetched.some((u) => /\/KGX\?.*filterCrs=LET/.test(u)) && fetched.some((u) => /\/ZFD\?/.test(u)) && fetched.some((u) => /\/STP\?/.test(u)));
    assert.equal(fetched.filter((u) => u.startsWith("https://api.tfl.gov.uk/Line/circle,metropolitan,hammersmith-city/Status")).length, 1);
  });
  assert.equal(WATCH_EVERY_MIN, 2);
});

test("Commute watch: one APNs alert when it turns red, none while it stays red, 'back to normal' when it clears", async () => {
  const env = await envWith();
  const me = await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
  let etd = "On time";
  await withFeeds(async ({ pushes }) => {
    await runWatch(env, at(DAY, "17:00"));
    assert.equal(pushes.length, 0, "on time: nothing");
    etd = "Cancelled";
    const sent = await runWatch(env, at(DAY, "17:02"));
    assert.equal(sent.length, 1); assert.equal(sent[0].level, "red");
    assert.equal(pushes[0].body.aps.alert.title, "Commute: disruption on the way home");
    assert.equal(pushes[0].body.kind, "watch");
    await runWatch(env, at(DAY, "17:04"));
    assert.equal(pushes.length, 1, "still red: quiet");
  }, () => etd);
  assert.equal(JSON.parse(env.PUSH.m.get(`nat:${me.id}`)).watchState.level, "red");
  await withFeeds(async ({ pushes }) => {
    // The 17:05 running again clears it.
    const sent = await runWatch(env, at(DAY, "17:02"));
    assert.equal(sent[0].notice.title, "Commute: back to normal home");
  }, () => "On time");
});

test("Settings' test notification: the iPhone's own registration, one a minute; prefs keep 'watch' only when true", async () => {
  const env = await envWith();
  const me = await register(env, { alarm: true, alarmLeadMin: 5, watch: "yes" });
  assert.equal(JSON.parse(env.PUSH.m.get(`nat:${me.id}`)).prefs.watch, false, "only true turns it on");
  await withFeeds(async ({ pushes }) => {
    const r = await worker.fetch(post("/native/test", { id: me.id, token: me.token }), env);
    assert.equal(r.status, 200); assert.equal(pushes.length, 1);
    assert.equal(pushes[0].body.aps.alert.title, "Alerts are on");
    assert.equal((await worker.fetch(post("/native/test", { id: me.id, token: me.token }), env)).status, 429, "one a minute");
    assert.equal((await worker.fetch(post("/native/test", { id: me.id, token: "wrong" }), env)).status, 403);
  });
});
