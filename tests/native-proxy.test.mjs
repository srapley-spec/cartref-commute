// The proxy's iPhone app routes and scheduler (docs/ios-app.md §6.3, docs/stories/ios-app.md): registration, the
// followed journey, geofence evidence, and what is pushed to APNs, against recorded-shape boards and a fake APNs.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";
import { b64u } from "../proxy/webpush.js";
import { runNative, apnsJwt, resetApnsJwt, cleanExtra, NATIVE_END_AFTER_MS } from "../proxy/native.js";

const subtle = crypto.subtle;
const ORIGIN = "capacitor://localhost";
const MIN = 60e3;
const at = (day, hm) => new Date(`${day}T${hm}:00`).getTime();
const DAY = "2026-11-03";
const TOKEN = "a".repeat(64), LA = "b".repeat(64);

function kv() {
  const m = new Map(), log = { puts: 0 };
  return { m, log, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { log.puts++; m.set(k, v); }, async delete(k) { m.delete(k); } };
}
async function apnsKey() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return { pair, pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` };
}
async function envWith(o = {}) {
  const k = await apnsKey();
  resetApnsJwt();
  return { k, env: { ALLOW_ORIGIN: `https://srapley-spec.github.io,${ORIGIN}`, RDM_BASE: "https://up.test/LDBWS/api/20220120", RDM_KEY: "rdm-secret", PUSH: kv(),
    APNS_KEY: k.pem, APNS_KEY_ID: "352Z6Z6469", APNS_TEAM_ID: "TEAM123456", APNS_TOPIC: "uk.cartref.srapley.commute", ...o } };
}
const post = (path, body, origin = ORIGIN) => new Request(`https://proxy.test${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function withFeeds(fn, { board = () => ({ trainServices: [] }), apnsStatus = () => 200 } = {}) {
  const real = globalThis.fetch, pushes = [], boards = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.push.apple.com/") || u.startsWith("https://api.sandbox.push.apple.com/")) {
      const p = { url: u, headers: opts.headers, body: JSON.parse(opts.body) }; pushes.push(p);
      const st = apnsStatus(p, pushes.length);
      return new Response(st === 200 ? null : JSON.stringify({ reason: st === 410 ? "Unregistered" : "BadDeviceToken" }), { status: st });
    }
    if (u.startsWith("https://up.test/")) { boards.push(u); return new Response(JSON.stringify(board(u)), { status: 200 }); }
    throw new Error("unexpected fetch " + u);
  };
  try { return await fn({ pushes, boards }); } finally { globalThis.fetch = real; }
}
// The 18:48 Great Northern from King's Cross home to Letchworth (the 30 Oct evening): leave the office 18:22.
const gnBoard = (etd = "On time", { platform, cancelled } = {}) => ({ trainServices: [{ std: "18:48", etd: cancelled ? "Cancelled" : etd, operator: "Great Northern", serviceID: "S1848",
  ...(platform ? { platform } : {}), ...(cancelled ? { isCancelled: true } : {}),
  subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: "19:22", et: "On time" }] }] }], nrccMessages: [] });
const PLAN = { v: 1, followId: "f1", serviceId: "S1848", from: "KGX", to: "LET", std: "18:48", operator: "Great Northern",
  dep: at(DAY, "18:48"), leaveBy: at(DAY, "18:22"), leadMs: 26 * MIN, train: "the 18:48 from King's Cross" };
const EXTRA = { mode: "commute", direction: "home", fromName: "King's Cross", toName: "Letchworth Garden City", marginMs: 2 * MIN, afterMs: 12 * MIN, startPlace: "office", arriveLabel: "At home" };
const unthrottle = (env, id) => { const r = JSON.parse(env.PUSH.m.get(`nat:${id}`)); delete r.planAt; env.PUSH.m.set(`nat:${id}`, JSON.stringify(r)); };
async function register(env, extra = {}) {
  const r = await worker.fetch(post("/native/register", { apnsToken: TOKEN, env: "production", prefs: { alarm: true, alarmLeadMin: 5 }, ...extra }), env);
  return { status: r.status, body: await r.json() };
}
async function follow(env, me, plan = PLAN, extra = EXTRA, more = {}) {
  const r = await worker.fetch(post("/native/follow", { ...me, plan, extra, laToken: LA, ...more }), env);
  unthrottle(env, me.id); return r;
}
const rec = (env, id) => JSON.parse(env.PUSH.m.get(`nat:${id}`));

test("iPhone routes: off until APNs is configured; origin-checked; registration gives an id and a token stored only as a hash", async () => {
  const { env } = await envWith();
  assert.equal((await worker.fetch(post("/native/register", {}), { ALLOW_ORIGIN: ORIGIN, PUSH: kv() })).status, 500);
  assert.equal((await worker.fetch(post("/native/register", {}, "https://evil.test"), env)).status, 403);
  const s = await register(env);
  assert.equal(s.status, 201); assert.ok(s.body.id && s.body.token);
  const stored = env.PUSH.m.get(`nat:${s.body.id}`);
  assert.ok(!stored.includes(s.body.token), "the token isn't stored");
  assert.deepEqual(JSON.parse(stored).apns, { token: TOKEN, env: "production" });
  assert.deepEqual(JSON.parse(stored).prefs, { alarm: true, alarmLeadMin: 5 });
  // Re-registering with the id and token updates the same iPhone (a new APNs token, the alarm off).
  const again = await register(env, { id: s.body.id, token: s.body.token, apnsToken: "C".repeat(64), env: "sandbox", prefs: { alarm: false, alarmLeadMin: 99 } });
  assert.equal(again.status, 200); assert.equal(again.body.id, s.body.id);
  assert.deepEqual(rec(env, s.body.id).apns, { token: "c".repeat(64), env: "sandbox" });
  assert.deepEqual(rec(env, s.body.id).prefs, { alarm: false, alarmLeadMin: 5 }, "a nonsense lead falls back to 5 min");
  for (const bad of [{ apnsToken: "xyz", env: "production" }, { apnsToken: TOKEN, env: "dev" }, { apnsToken: TOKEN.slice(1), env: "production" }])
    assert.equal((await worker.fetch(post("/native/register", bad), env)).status, 400, JSON.stringify(bad));
  assert.equal((await worker.fetch(post("/native/other", {}), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://proxy.test/native/register", { headers: { Origin: ORIGIN } }), env)).status, 405);
  for (let i = 0; i < 9; i++) assert.equal((await register(env)).status, 201);
  assert.equal((await register(env)).status, 429, "at most ten iPhones");
  // /status says so; the web page's origin still works.
  const st = await (await worker.fetch(new Request("https://proxy.test/status", { headers: { Origin: "https://srapley-spec.github.io" } }), env)).json();
  assert.equal(st.native, true);
});

test("iPhone routes: follow needs the token; plans are checked like the web's; extras field by field; none clears it", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  assert.equal((await worker.fetch(post("/native/follow", { id: me.id, token: "wrong", plan: PLAN }), env)).status, 403);
  assert.equal((await follow(env, me, { ...PLAN, from: "CBG" })).status, 400);
  assert.equal((await follow(env, me, PLAN, EXTRA, { laToken: "nope" })).status, 400);
  assert.equal((await follow(env, me)).status, 200);
  const r = rec(env, me.id);
  assert.equal(r.plan.followId, "f1"); assert.deepEqual(r.extra, EXTRA); assert.deepEqual(r.la, { token: LA });
  assert.ok(Number.isFinite(r.followedAt));
  // Fields that aren't known are dropped; out-of-range ones too.
  assert.deepEqual(cleanExtra({ mode: "rocket", direction: "up", fromName: "x".repeat(61), marginMs: -1, afterMs: 4 * 3600e3, startPlace: "../etc", evil: 1, toName: "Letchworth" }), { toName: "Letchworth" });
  // Too soon after the last change.
  assert.equal((await worker.fetch(post("/native/follow", { ...me, plan: PLAN, extra: EXTRA }), env)).status, 200);
  assert.equal((await worker.fetch(post("/native/follow", { ...me, plan: PLAN, extra: EXTRA }), env)).status, 429);
  unthrottle(env, me.id);
  assert.equal((await follow(env, me, null)).status, 200);
  assert.equal(rec(env, me.id).plan, null); assert.equal(rec(env, me.id).la, null);
  // Unregister forgets the iPhone.
  assert.equal((await worker.fetch(post("/native/unregister", me), env)).status, 200);
  assert.equal(env.PUSH.m.get(`nat:${me.id}`), undefined); assert.deepEqual(JSON.parse(env.PUSH.m.get("nats")), []);
});

test("APNs provider token: ES256, the key id and team, reused for 50 minutes then renewed", async () => {
  const { env, k } = await envWith(), now = at(DAY, "18:00");
  const jwt = await apnsJwt(env, now), [a, b, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.decode(a))), { alg: "ES256", kid: "352Z6Z6469" });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.decode(b))), { iss: "TEAM123456", iat: now / 1000 });
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.pair.publicKey, b64u.decode(s), new TextEncoder().encode(`${a}.${b}`)));
  assert.equal(await apnsJwt(env, now + 49 * MIN), jwt);
  assert.notEqual(await apnsJwt(env, now + 50 * MIN), jwt);
});

test("Scheduler: the snapshot goes to the Live Activity and the app when it changes, and only then", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  await withFeeds(async ({ pushes, boards }) => {
    // 18:00: watching (within an hour of Leave by): one board, the snapshot to both.
    await runNative(env, at(DAY, "18:00"));
    assert.equal(boards.length, 1);
    assert.deepEqual(pushes.map(p => p.headers["apns-push-type"]), ["liveactivity", "background"]);
    const la = pushes[0], bg = pushes[1];
    assert.equal(la.url, `https://api.push.apple.com/3/device/${LA}`);
    assert.equal(la.headers["apns-topic"], "uk.cartref.srapley.commute.push-type.liveactivity");
    assert.equal(bg.headers["apns-topic"], "uk.cartref.srapley.commute"); assert.equal(bg.headers["apns-priority"], "5");
    assert.match(la.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const snap = la.body.aps["content-state"];
    assert.equal(la.body.aps.event, "update");
    assert.equal(snap.phase, "leave"); assert.equal(snap.headline.label, "Leave by"); assert.equal(snap.headline.t, at(DAY, "18:22"));
    assert.deepEqual(snap.alarm, { at: at(DAY, "18:17"), leadMin: 5, cancelled: false });
    assert.deepEqual(snap.arrive, { label: "At home", t: at(DAY, "19:34") });
    assert.deepEqual(bg.body.snapshot, snap);
    // 18:01: nothing shown has changed: nothing sent.
    await runNative(env, at(DAY, "18:01"));
    assert.equal(pushes.length, 2);
  }, { board: () => gnBoard() });
  // 18:05: now 6 min late: Leave by and the alarm move (no alert yet: the web's alerts start 5 min before Leave by).
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:05"));
    assert.deepEqual(pushes.map(p => p.headers["apns-push-type"]), ["liveactivity", "background"]);
    const snap = pushes[0].body.aps["content-state"];
    assert.equal(snap.headline.t, at(DAY, "18:28")); assert.equal(snap.alarm.at, at(DAY, "18:23")); assert.equal(snap.status.text, "6 min late");
    // 18:23: the alarm's own time (the "Leave in 5 min" alert isn't sent: the alarm is the reminder).
    pushes.length = 0;
    await runNative(env, at(DAY, "18:23"));
    assert.deepEqual(pushes.map(p => p.headers["apns-push-type"]), []);
  }, { board: () => gnBoard("18:54") });
  // 18:24: back to 2 min late: Leave by 18:24, earlier by 4 min: the "Leave now" alert in the web's words.
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:24"));
    assert.deepEqual(pushes.map(p => p.headers["apns-push-type"]).sort(), ["alert", "background", "liveactivity"]);
    assert.equal(pushes.find(p => p.headers["apns-push-type"] === "alert").body.aps.alert.title, "Leave now · by 18:24");
  }, { board: () => gnBoard("18:50") });
});

test("Scheduler: with the leave alarm on, the web's 'Leave in 5 min' alert isn't sent as well; with it off, it is", async () => {
  for (const alarm of [true, false]) {
    const { env } = await envWith();
    const { body: me } = await register(env, { prefs: { alarm, alarmLeadMin: 5 } });
    await follow(env, me);
    await withFeeds(async ({ pushes }) => {
      await runNative(env, at(DAY, "18:17"));
      const alerts = pushes.filter(p => p.headers["apns-push-type"] === "alert");
      assert.equal(alerts.length, alarm ? 0 : 1, `alarm ${alarm}`);
      if (!alarm) assert.match(alerts[0].body.aps.alert.title, /^Leave in 5 min · by 18:22$/);
      const snap = pushes.find(p => p.headers["apns-push-type"] === "background").body.snapshot;
      assert.equal(snap.alarm ? snap.alarm.at : null, alarm ? at(DAY, "18:17") : null);
    }, { board: () => gnBoard() });
  }
});

test("Scheduler: leaving the office's geofence is set off: the alarm is cancelled and the card moves to the platform", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  // A Wi-Fi report, another place's fence, or entering: not set off.
  for (const evidence of [{ kind: "wifi", place: "none", at: Date.now() }, { kind: "region", place: "home", event: "exit", at: Date.now() }, { kind: "region", place: "office", event: "enter", at: Date.now() }]) {
    const r = await worker.fetch(post("/native/evidence", { ...me, evidence }), env);
    assert.equal(r.status, evidence.kind === "wifi" ? 400 : 200);
    assert.equal(rec(env, me.id).setOff, false);
  }
  const r = await worker.fetch(post("/native/evidence", { ...me, evidence: { kind: "region", place: "office", event: "exit", at: Date.now() } }), env);
  assert.deepEqual(await r.json(), { ok: true, setOff: true });
  assert.equal(rec(env, me.id).setOff, true);
  assert.equal((await worker.fetch(post("/native/evidence", { ...me, evidence: { kind: "region", place: "office", event: "exit", at: Date.now() + 2 * MIN } }), env)).status, 400, "from the future");
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:20"));
    const snap = pushes.find(p => p.headers["apns-push-type"] === "liveactivity").body.aps["content-state"];
    assert.equal(snap.phase, "platform");
    assert.equal(snap.headline.label, "Be on platform 9 at King's Cross by");
    assert.equal(snap.headline.t, at(DAY, "18:46"));
    assert.equal(snap.alarm.cancelled, true);
    assert.ok(!pushes.some(p => p.headers["apns-push-type"] === "alert"), "no Leave alerts once you've set off");
  }, { board: () => gnBoard("On time", { platform: "9" }) });
  // A new Follow says whether the page saw you set off; the same journey keeps it.
  await follow(env, me, PLAN, EXTRA, { setOff: false });
  assert.equal(rec(env, me.id).setOff, true);
  await follow(env, me, { ...PLAN, followId: "f2" }, EXTRA, { setOff: false });
  assert.equal(rec(env, me.id).setOff, false);
});

test("Scheduler: on the train, then the walk home, then the Live Activity ends and the journey is dropped", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  await withFeeds(async () => { await runNative(env, at(DAY, "18:40")); }, { board: () => gnBoard("On time", { platform: "9" }) });
  await withFeeds(async ({ pushes, boards }) => {
    // 19:00: the train has gone; no board is asked for; the last arrival and platform stand.
    await runNative(env, at(DAY, "19:00"));
    assert.equal(boards.length, 0);
    const snap = pushes.find(p => p.headers["apns-push-type"] === "liveactivity").body.aps["content-state"];
    assert.equal(snap.phase, "train"); assert.equal(snap.headline.label, "At Letchworth Garden City"); assert.equal(snap.headline.t, at(DAY, "19:22"));
    assert.equal(snap.train.platform, "9"); assert.equal(snap.alarm, null);
    pushes.length = 0;
    await runNative(env, at(DAY, "19:23"));
    assert.equal(pushes.find(p => p.headers["apns-push-type"] === "liveactivity").body.aps["content-state"].phase, "walk-last");
    pushes.length = 0;
    // 10 min after the door arrival (19:34): ended, and dismissed 15 min later; the app is told there's nothing.
    await runNative(env, at(DAY, "19:34") + NATIVE_END_AFTER_MS + MIN);
    const end = pushes.find(p => p.headers["apns-push-type"] === "liveactivity");
    assert.equal(end.body.aps.event, "end"); assert.ok(end.body.aps["dismissal-date"]);
    assert.equal(pushes.find(p => p.headers["apns-push-type"] === "background").body.snapshot, null);
    assert.equal(rec(env, me.id).plan, null);
  });
});

test("Scheduler: a cancellation is said once, ends the Live Activity and the journey", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:10"));
    const alert = pushes.find(p => p.headers["apns-push-type"] === "alert");
    assert.equal(alert.body.aps.alert.title, "18:48 cancelled");
    const la = pushes.find(p => p.headers["apns-push-type"] === "liveactivity");
    assert.equal(la.body.aps.event, "end"); assert.equal(la.body.aps["content-state"].phase, "cancelled");
    assert.equal(rec(env, me.id).plan, null);
  }, { board: () => gnBoard("Cancelled", { cancelled: true }) });
});

test("Scheduler: a token Apple says is gone is dropped (the iPhone, or just its Live Activity); one failure doesn't stop the rest", async () => {
  const { env } = await envWith();
  const { body: a } = await register(env), { body: b } = await register(env);
  await follow(env, a); await follow(env, b);
  await withFeeds(async ({ pushes }) => {
    const sent = await runNative(env, at(DAY, "18:00"));
    assert.equal(rec(env, a.id).la, null, "Live Activity token dropped");
    assert.ok(rec(env, a.id).plan, "the iPhone keeps its journey");
    assert.equal(sent.filter(s => s.kind === "background").length, 2);
  }, { board: () => gnBoard(), apnsStatus: (p) => (p.headers["apns-push-type"] === "liveactivity" && p.url.endsWith(LA) ? 410 : 200) });
  await follow(env, a, { ...PLAN, followId: "f3" });
  await withFeeds(async () => { await runNative(env, at(DAY, "18:02")); }, { board: () => gnBoard(), apnsStatus: (p) => (p.headers["apns-push-type"] === "background" ? 410 : 200) });
  assert.equal(env.PUSH.m.get(`nat:${a.id}`), undefined, "the iPhone is forgotten");
  assert.deepEqual(JSON.parse(env.PUSH.m.get("nats")), [b.id], "the other is kept (nothing new to send it)");
});
