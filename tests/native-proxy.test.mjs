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
  assert.deepEqual(JSON.parse(stored).prefs, { alarm: true, alarmLeadMin: 5, watch: false });
  // Re-registering with the id and token updates the same iPhone (a new APNs token, the alarm off).
  const again = await register(env, { id: s.body.id, token: s.body.token, apnsToken: "C".repeat(64), env: "sandbox", prefs: { alarm: false, alarmLeadMin: 99 } });
  assert.equal(again.status, 200); assert.equal(again.body.id, s.body.id);
  assert.deepEqual(rec(env, s.body.id).apns, { token: "c".repeat(64), env: "sandbox" });
  assert.deepEqual(rec(env, s.body.id).prefs, { alarm: false, alarmLeadMin: 5, watch: false }, "a nonsense lead falls back to 5 min");
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
    assert.equal(la.body.aps["stale-date"], Math.floor((at(DAY, "18:00") + 3 * MIN) / 1000), "stale-date = data + 3 min");
    assert.equal(snap.phase, "leave"); assert.equal(snap.headline.label, "Leave by"); assert.equal(snap.headline.t, at(DAY, "18:22"));
    assert.deepEqual(snap.alarm, { at: at(DAY, "18:17"), leadMin: 5, cancelled: false, cancelOnExit: "office" });
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
    assert.ok(!pushes.some(p => p.headers["apns-push-type"] === "alert"), "no alert (the fresh-data re-send may go)");
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
  const reply = await r.json();
  assert.equal(reply.setOff, true);
  // The reply carries the snapshot now: the alarm cancelled, no waiting for a background push (§6.7 rule 3).
  assert.equal(reply.snapshot.phase, "platform"); assert.equal(reply.snapshot.alarm.cancelled, true); assert.equal(reply.snapshot.alarm.cancelOnExit, "office");
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
    const stop = pushes.find(p => p.headers["apns-push-type"] === "background").body;
    assert.equal(stop.snapshot, null); assert.equal(stop.followId, "f1", "the stop names its journey"); assert.ok(Number.isFinite(stop.at));
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
  await withFeeds(async () => { await runNative(env, at(DAY, "18:01")); }, { board: () => gnBoard(), apnsStatus: (p) => (p.headers["apns-push-type"] === "background" ? 410 : 200) });
  assert.equal(env.PUSH.m.get(`nat:${a.id}`), undefined, "the iPhone is forgotten");
  assert.deepEqual(JSON.parse(env.PUSH.m.get("nats")), [b.id], "the other is kept (nothing new to send it)");
});

// ---- Independent review, 18 Nov: its bugs and surviving mutations ----
test("Review: a cancellation seen just after the departure time ends the journey; it isn't undone later", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me, PLAN, EXTRA, { setOff: true });
  await withFeeds(async () => { await runNative(env, at(DAY, "18:47")); }, { board: () => gnBoard("On time", { platform: "9" }) });
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:49"));
    const la = pushes.find((p) => p.headers["apns-push-type"] === "liveactivity");
    assert.equal(la.body.aps.event, "end"); assert.equal(la.body.aps["content-state"].phase, "cancelled");
  }, { board: () => gnBoard("Cancelled", { cancelled: true }) });
  assert.equal(rec(env, me.id).plan, null, "ended, so 18:52 can't bring back 'On time, last known'");
});

test("Review: on a steady board the snapshot is re-sent every 2 minutes, so the Live Activity's stale-date moves on", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  await withFeeds(async ({ pushes }) => {
    for (const hm of ["18:00", "18:01", "18:02", "18:03", "18:04", "18:05"]) await runNative(env, at(DAY, hm));
    const stale = pushes.filter((p) => p.headers["apns-push-type"] === "liveactivity").map((p) => p.body.aps["stale-date"] * 1000);
    assert.ok(stale.length >= 3, `re-sent (${stale.length})`);
    for (let i = 1; i < stale.length; i++) assert.ok(stale[i] > stale[i - 1]);
    // Between pushes the stale-date never falls behind the time of the next run.
    assert.ok(stale.every((s, i) => i === stale.length - 1 || stale[i + 1] - 3 * MIN <= s));
    // Only the first is a real change: the re-sends go to the Live Activity alone, at priority 5, with no background
    // push (Apple budgets those).
    const las = pushes.filter((p) => p.headers["apns-push-type"] === "liveactivity");
    assert.deepEqual(las.map((p) => p.headers["apns-priority"]), ["10", ...las.slice(1).map(() => "5")]);
    assert.equal(pushes.filter((p) => p.headers["apns-push-type"] === "background").length, 1);
  }, { board: () => gnBoard() });
});

test("Review: a different train under the same follow id is a new journey: its setOff, state and Live Activity token start again", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me, PLAN, EXTRA, { setOff: true });
  assert.equal(rec(env, me.id).setOff, true);
  await follow(env, me, { ...PLAN, std: "19:18", dep: at(DAY, "19:18"), leaveBy: at(DAY, "18:52") }, EXTRA, { setOff: false, laToken: undefined });
  const r = rec(env, me.id);
  assert.equal(r.setOff, false); assert.equal(r.la, null, "the old journey's Live Activity token isn't used for the new one"); assert.deepEqual(r.planState, {});
});

test("Review: Apple's 400 BadDeviceToken drops the iPhone, another 400 doesn't; alarm off and set off: no Leave alerts", async () => {
  for (const [reason, gone] of [["BadDeviceToken", true], ["PayloadTooLarge", false]]) {
    const { env } = await envWith();
    const { body: me } = await register(env);
    await follow(env, me);
    const real = globalThis.fetch;
    globalThis.fetch = async (u) => (String(u).includes("push.apple.com") ? new Response(JSON.stringify({ reason }), { status: 400 }) : new Response(JSON.stringify(gnBoard()), { status: 200 }));
    try { await runNative(env, at(DAY, "18:00")); } finally { globalThis.fetch = real; }
    assert.equal(env.PUSH.m.has(`nat:${me.id}`), !gone, reason);
  }
  const { env } = await envWith();
  const { body: me } = await register(env, { prefs: { alarm: false } });
  await follow(env, me, PLAN, EXTRA, { setOff: true });
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:17")); await runNative(env, at(DAY, "18:24"));
    assert.equal(pushes.filter((p) => p.headers["apns-push-type"] === "alert").length, 0);
  }, { board: () => gnBoard() });
});

test("Review: evidence says the journey's set-off state; Wi-Fi and old reports are refused; a full list frees an idle iPhone", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me, PLAN, EXTRA, { setOff: true });
  const ev = (evidence) => worker.fetch(post("/native/evidence", { ...me, evidence }), env).then((r) => r.status === 200 ? r.json() : r.status);
  const r = await ev({ kind: "region", place: "office", event: "enter", at: Date.now() });
  assert.equal(r.setOff, true); assert.equal(r.snapshot.alarm.cancelled, true);
  // Wi-Fi at a place is accepted (#66: home Wi-Fi ends the evening watch) but never says the journey has set off.
  assert.equal((await ev({ kind: "wifi", place: "office", at: Date.now() })).setOff, true, "(already set off above; unchanged)");
  assert.equal(await ev({ kind: "wifi", place: "KGX", at: Date.now() }), 400, "Wi-Fi is only home or office");
  assert.equal(await ev({ kind: "teleport", place: "home", at: Date.now() }), 400);
  assert.equal(await ev({ kind: "region", place: "office", event: "exit", at: Date.now() - 7 * 3600e3 }), 400);
  await follow(env, me, null);
  const none = await ev({ kind: "region", place: "office", event: "exit", at: Date.now() });
  assert.deepEqual({ ...none, at: typeof none.at }, { ok: true, setOff: false, snapshot: null, followId: "f1", at: "number" }, "an identified, dated stop");
  // Fill the list, age one: the next registration takes its place.
  for (let i = 0; i < 9; i++) await register(env);
  assert.equal((await register(env)).status, 429);
  const old = rec(env, me.id); env.PUSH.m.set(`nat:${me.id}`, JSON.stringify({ ...old, seen: Date.now() - 31 * 86400e3 }));
  assert.equal((await register(env)).status, 201);
  assert.equal(env.PUSH.m.has(`nat:${me.id}`), false);
});

test("Review: an iPhone in daily use isn't idle: following and re-registering keep it from being replaced", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  for (let i = 0; i < 9; i++) await register(env);
  const age = () => { const r = rec(env, me.id); env.PUSH.m.set(`nat:${me.id}`, JSON.stringify({ ...r, created: Date.now() - 40 * 86400e3, seen: Date.now() - 40 * 86400e3 })); };
  age(); await follow(env, me);
  assert.equal((await register(env)).status, 429, "followed today: kept");
  age(); await register(env, { id: me.id, token: me.token });
  assert.equal((await register(env)).status, 429, "re-registered today: kept");
});

test("The proxy sends the Live Activity an update when the countdown turns urgent, at full priority", async () => {
  const { env } = await envWith();
  const { body: me } = await register(env);
  await follow(env, me);
  await withFeeds(async ({ pushes }) => {
    await runNative(env, at(DAY, "18:19"));
    pushes.length = 0;
    await runNative(env, at(DAY, "18:20") + 30e3);   // Leave by 18:22: under 2 minutes, same 2-min data bucket
    const la = pushes.find((p) => p.headers["apns-push-type"] === "liveactivity");
    assert.equal(la.body.aps["content-state"].headline.countdown.state, "urgent");
    assert.equal(la.headers["apns-priority"], "10");
  }, { board: () => gnBoard() });
});
