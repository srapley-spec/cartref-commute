// Home Assistant presence for the evening watch (Sam, 19 Nov: "The phone always knows where I am. And we can use Home
// Assistant to be doubly sure"). docs/stories/commute-watch.md, "Home Assistant". The proxy reads one person entity,
// read-only, with a token from its secrets; "home" ends the evening watch, anything else keeps it; no reading falls
// back to the phone's geofence. Only for an iPhone that opted in.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";
import { runWatch } from "../proxy/watch.js";
import { haPresence, haConfigured } from "../proxy/ha.js";
import { cleanPrefs, resetApnsJwt } from "../proxy/native.js";
import { core } from "./core/helpers.mjs";

const ORIGIN = "capacitor://localhost", TOKEN = "b".repeat(64);
const at = (day, hm) => new Date(`${day}T${hm}:00`).getTime();
const DAY = "2026-11-19";
function kv() { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; }
async function envWith(extra = {}) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  resetApnsJwt();
  return { ALLOW_ORIGIN: ORIGIN, RDM_BASE: "https://up.test/LDBWS/api/20220120", RDM_KEY: "rdm-secret", TFL_KEY: "tfl-secret", PUSH: kv(),
    APNS_KEY: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`, APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_TOPIC: "uk.cartref.srapley.commute", ...extra };
}
const post = (path, body) => new Request(`https://proxy.test${path}`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function withFeeds(fn) {
  const real = globalThis.fetch, pushes = [], fetched = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("push.apple.com")) { pushes.push(JSON.parse(opts.body)); return new Response(null, { status: 200 }); }
    fetched.push(u);
    if (u.startsWith("https://up.test/")) return new Response(JSON.stringify({ trainServices: [{ std: "17:05", etd: "Cancelled", isCancelled: true, operator: "Great Northern", serviceID: "S1",
      subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: "17:40", et: "Cancelled" }] }] }], nrccMessages: [] }), { status: 200 });
    if (u.startsWith("https://api.tfl.gov.uk/")) return new Response("[]", { status: 200 });
    throw new Error("unexpected fetch " + u);
  };
  try { return await fn({ pushes, fetched }); } finally { globalThis.fetch = real; }
}
const register = async (env, prefs) => (await worker.fetch(post("/native/register", { apnsToken: TOKEN, env: "production", prefs }), env)).json();
const boards = (f) => f.filter((u) => u.startsWith("https://up.test/")).length;

test("Watch with Home Assistant (engine): home ends the evening watch, out keeps it whatever the geofence said, no reading falls back; never the morning", () => {
  const evening = { direction: "home", from: at(DAY, "15:00") }, morning = { direction: "office", from: at(DAY, "05:00") };
  assert.equal(core.watchDone(evening, null, null, { state: "home", since: at(DAY, "09:00") }), true, "home all day (working from home): no evening alerts");
  assert.equal(core.watchDone(evening, at(DAY, "16:00"), null, { state: "not_home", since: at(DAY, "16:30") }), false, "out, though the geofence said home");
  assert.equal(core.watchDone(evening, null, null, { state: "Office", since: null }), false, "a zone is out");
  assert.equal(core.watchDone(evening, at(DAY, "16:00"), null, null), true, "no reading: the geofence decides (home)");
  assert.equal(core.watchDone(evening, null, null, null), false, "no reading, no geofence: watch");
  for (const state of ["unknown", "unavailable", ""]) assert.equal(core.watchDone(evening, at(DAY, "16:00"), null, { state, since: null }), true, `${state || "empty"}: not a reading; the geofence decides`);
  assert.equal(core.watchDone(morning, null, null, { state: "home", since: null }), false, "the morning watch is never ended by being home");
});

test("Home Assistant reading: one GET of the person entity with the token; https only; any failure is no reading", async () => {
  const seen = [];
  const ok = async (url, opts) => { seen.push({ url, auth: opts.headers.Authorization, method: opts.method || "GET" }); return new Response(JSON.stringify({ state: "home", last_changed: "2026-11-19T16:40:00+00:00" }), { status: 200 }); };
  const env = { HA_BASE_URL: "https://ha.example/", HA_TOKEN: "ha-secret" };
  assert.deepEqual(await haPresence(env, ok), { state: "home", since: Date.parse("2026-11-19T16:40:00Z") });
  assert.deepEqual(seen, [{ url: "https://ha.example/api/states/person.sam_rapley", auth: "Bearer ha-secret", method: "GET" }]);
  assert.equal((await haPresence({ ...env, HA_PERSON: "person.alex" }, ok)) && seen[1].url, "https://ha.example/api/states/person.alex");
  assert.equal(await haPresence({ ...env, HA_PERSON: "light.kitchen" }, ok), null, "a person entity only");
  assert.equal(await haPresence({ ...env, HA_BASE_URL: "http://ha.example" }, ok), null, "https only: the token never goes in the clear");
  assert.equal(await haPresence({ HA_BASE_URL: "https://ha.example" }, ok), null, "no token: not set up");
  assert.equal(haConfigured({ HA_BASE_URL: "https://x", HA_TOKEN: "t" }), true); assert.equal(haConfigured({ HA_TOKEN: "t" }), false);
  assert.equal(await haPresence(env, async () => new Response("no", { status: 401 })), null, "refused");
  assert.equal(await haPresence(env, async () => { throw new Error("timeout"); }), null, "unreachable");
  assert.equal(await haPresence(env, async () => new Response("{}", { status: 200 })), null, "no state");
});

test("Proxy watch with Home Assistant: only an iPhone that opted in; HA home stops it, HA out overrides the geofence, HA down falls back; read once a run, never in the morning", async () => {
  let reads = 0; const ha = (r) => async () => { reads++; return r; };
  // Opted in, HA says home: nothing fetched tonight.
  let env = await envWith(); await register(env, { alarm: true, watch: true, ha: true });
  await withFeeds(async ({ fetched }) => { await runWatch(env, at(DAY, "17:00"), ha({ state: "home", since: at(DAY, "16:00") })); assert.equal(boards(fetched), 0); });
  assert.equal(reads, 1);
  // Opted in, the geofence says home but HA says out: watched (and alerted: the 17:05 is cancelled).
  env = await envWith(); const me = await register(env, { alarm: true, watch: true, ha: true });
  const rec = JSON.parse(env.PUSH.m.get(`nat:${me.id}`)); env.PUSH.m.set(`nat:${me.id}`, JSON.stringify({ ...rec, homeAt: at(DAY, "16:00") }));
  await withFeeds(async ({ fetched, pushes }) => { await runWatch(env, at(DAY, "17:00"), ha({ state: "not_home", since: at(DAY, "16:30") })); assert.equal(boards(fetched), 3); assert.equal(pushes.length, 1); });
  // HA can't be read: the geofence (home since 16:00) decides.
  env.PUSH.m.set(`nat:${me.id}`, JSON.stringify({ ...JSON.parse(env.PUSH.m.get(`nat:${me.id}`)), homeAt: at(DAY, "16:00"), watchState: null }));
  await withFeeds(async ({ fetched }) => { await runWatch(env, at(DAY, "17:02"), ha(null)); assert.equal(boards(fetched), 0); });
  // Not opted in: HA is never read, and its "out" changes nothing.
  env = await envWith(); const other = await register(env, { alarm: true, watch: true });
  const r2 = JSON.parse(env.PUSH.m.get(`nat:${other.id}`)); env.PUSH.m.set(`nat:${other.id}`, JSON.stringify({ ...r2, homeAt: at(DAY, "16:00") }));
  reads = 0;
  await withFeeds(async ({ fetched }) => { await runWatch(env, at(DAY, "17:00"), ha({ state: "not_home", since: null })); assert.equal(boards(fetched), 0); });
  assert.equal(reads, 0, "not opted in: not read");
  // Morning: never read.
  env = await envWith(); await register(env, { alarm: true, watch: true, ha: true }); reads = 0;
  await withFeeds(async () => { await runWatch(env, at(DAY, "07:00"), ha({ state: "home", since: null })); });
  assert.equal(reads, 0, "the morning watch doesn't ask");
  // Two iPhones opted in: one read.
  env = await envWith(); await register(env, { alarm: true, watch: true, ha: true });
  await worker.fetch(post("/native/register", { apnsToken: "c".repeat(64), env: "production", prefs: { alarm: true, watch: true, ha: true } }), env); reads = 0;
  await withFeeds(async () => { await runWatch(env, at(DAY, "17:00"), ha({ state: "not_home", since: null })); });
  assert.equal(reads, 1, "once a run");
});

test("Home Assistant prefs and status: 'ha' kept only when true and with the watch on; /status says whether it's set up (booleans only); the test says what HA reads", async () => {
  assert.equal(cleanPrefs({ watch: true, ha: true }).ha, true);
  assert.equal(cleanPrefs({ watch: false, ha: true }).ha, false); assert.equal(cleanPrefs({ watch: true, ha: "yes" }).ha, false);
  const env = await envWith({ HA_BASE_URL: "https://ha.example", HA_TOKEN: "ha-secret" });
  const s = await (await worker.fetch(new Request("https://proxy.test/status", { headers: { Origin: ORIGIN } }), env)).text();
  assert.equal(JSON.parse(s).ha, true); assert.ok(!s.includes("ha-secret") && !s.includes("ha.example"));
  const me = await register(env, { alarm: true, watch: true, ha: true });
  const real = globalThis.fetch, pushes = [];
  globalThis.fetch = async (url, opts = {}) => { const u = String(url);
    if (u.includes("push.apple.com")) { pushes.push(JSON.parse(opts.body)); return new Response(null, { status: 200 }); }
    if (u === "https://ha.example/api/states/person.sam_rapley") return new Response(JSON.stringify({ state: "not_home", last_changed: "2026-11-19T08:00:00Z" }), { status: 200 });
    throw new Error("unexpected " + u); };
  try {
    const r = await worker.fetch(post("/native/test", { id: me.id, token: me.token }), env);
    assert.equal((await r.json()).ha, "out");
    assert.match(pushes[0].aps.alert.body, /Home Assistant says you're out\.$/);
  } finally { globalThis.fetch = real; }
});
