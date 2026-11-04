// The proxy's time-to-leave and wake-up alerts (docs/stories/time-to-leave-alerts.md): Web Push encryption and
// VAPID, the /push routes, and the every-minute scheduler against recorded-shape boards and a fake push service.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";
import { encryptPayload, vapidAuth, validPushEndpoint, b64u } from "../proxy/webpush.js";
import { runAlerts, londonShift } from "../proxy/push.js";

const subtle = crypto.subtle;
const ORIGIN = "https://srapley-spec.github.io";
const MIN = 60e3;

// ---------- a phone's push keys, and a test-side decoder (RFC 8188 / 8291) ----------
async function phoneKeys() {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, keys: { p256dh: b64u.encode(pub), auth: b64u.encode(auth) } };
}
async function hkdf(salt, ikm, info, n) {
  const k = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) }, k, n * 8));
}
async function decrypt(body, phone) {
  const b = new Uint8Array(body), salt = b.slice(0, 16), idlen = b[20], asPub = b.slice(21, 21 + idlen), ct = b.slice(21 + idlen);
  const uaPub = b64u.decode(phone.keys.p256dh), auth = b64u.decode(phone.keys.auth);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, phone.pair.privateKey, 256));
  const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...uaPub, ...asPub]);
  const k = await subtle.importKey("raw", ecdh, "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: auth, info }, k, 256));
  const cek = await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16), nonce = await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
  const pt = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), ct));
  assert.equal(pt[pt.length - 1], 2, "last-record delimiter");
  return JSON.parse(new TextDecoder().decode(pt.slice(0, -1)));
}
async function vapidKeys() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { pair, publicKey: b64u.encode(new Uint8Array(await subtle.exportKey("raw", pair.publicKey))), privateKey: (await subtle.exportKey("jwk", pair.privateKey)).d };
}

// ---------- a Worker environment with a fake KV and fake feeds ----------
function kv() {
  const m = new Map(), log = { puts: 0 };
  return { m, log, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { log.puts++; m.set(k, v); }, async delete(k) { m.delete(k); } };
}
async function envWith() {
  const v = await vapidKeys();
  return { v, env: { ALLOW_ORIGIN: ORIGIN, RDM_BASE: "https://up.test/LDBWS/api/20220120", RDM_KEY: "rdm-secret", PUSH: kv(),
    VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_KEY: v.privateKey, VAPID_SUBJECT: "mailto:alerts@example.test" } };
}
const post = (path, body, origin = ORIGIN) => new Request(`https://proxy.test${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (path) => new Request(`https://proxy.test${path}`, { headers: { Origin: ORIGIN } });
async function withFeeds(fn, { board = () => ({ trainServices: [] }), pushStatus = () => 201 } = {}) {
  const real = globalThis.fetch, pushes = [], boards = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://web.push.apple.com/")) { pushes.push({ url, opts }); return new Response(null, { status: pushStatus(pushes.length) }); }
    if (String(url).startsWith("https://up.test/")) { boards.push({ url, opts }); return new Response(JSON.stringify(board(url)), { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
  try { return await fn({ pushes, boards }); } finally { globalThis.fetch = real; }
}
const at = (day, hm) => new Date(`${day}T${hm}:00`).getTime();
const DAY = "2026-11-03";
const gnBoard = (etd = "On time", std = "18:48") => ({ trainServices: [{ std, etd, operator: "Great Northern", serviceID: "S1848",
  subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: "19:22", et: "On time" }] }] }], nrccMessages: [] });
const PLAN = { v: 1, followId: "f1", serviceId: "S1848", from: "KGX", to: "LET", std: "18:48", operator: "Great Northern",
  dep: at(DAY, "18:48"), leaveBy: at(DAY, "18:22"), leadMs: 26 * MIN, train: "the 18:48 from King's Cross" };
const MORNING = { from: "LET", to: ["KGX", "ZFD", "STP"], time: "06:30", days: [1, 2, 3, 4, 5], names: { KGX: "King's Cross", ZFD: "Farringdon", STP: "St Pancras", LET: "Letchworth Garden City" } };

async function subscribe(env, phone, extra = {}) {
  const r = await worker.fetch(post("/push/subscribe", { subscription: { endpoint: "https://web.push.apple.com/QGuQyavXu", keys: phone.keys }, morning: MORNING, ...extra }), env);
  return { status: r.status, body: await r.json() };
}

test("Web Push: RFC 8291's worked example encrypts byte for byte; VAPID is ES256-signed for the push service's origin", async () => {
  // RFC 8291 Appendix A.
  const out = await encryptPayload(new TextEncoder().encode("When I grow up, I want to be a watermelon"),
    { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
    { salt: b64u.decode("DGv6ra1nlYgDCS1FRnbzlw"), asPublic: b64u.decode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"), asPrivate: b64u.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") });
  assert.equal(b64u.encode(out), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  // A fresh message decodes with the phone's keys.
  const phone = await phoneKeys();
  assert.deepEqual(await decrypt(await encryptPayload(new TextEncoder().encode('{"title":"x"}'), phone.keys), phone), { title: "x" });
  const v = await vapidKeys(), now = at(DAY, "10:00");
  const h = await vapidAuth("https://web.push.apple.com/abc", { ...v, subject: "mailto:a@b.test" }, now);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/); const [a, b, s] = jwt.split(".");
  assert.equal(k, v.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.decode(a))), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.decode(b))), { aud: "https://web.push.apple.com", exp: now / 1000 + 12 * 3600, sub: "mailto:a@b.test" });
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, v.pair.publicKey, b64u.decode(s), new TextEncoder().encode(`${a}.${b}`)));
  // Only the known push services, over https.
  for (const ok of ["https://web.push.apple.com/x", "https://api.push.apple.com/x", "https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x"]) assert.ok(validPushEndpoint(ok), ok);
  for (const bad of ["http://web.push.apple.com/x", "https://web.push.apple.com.evil.test/x", "https://evil.test/web.push.apple.com", "https://web.push.apple.com:8443/x", "https://169.254.169.254/", "not a url"]) assert.ok(!validPushEndpoint(bad), bad);
});

test("Push routes: off until configured; origin-checked; a phone subscribes and gets an id and a token stored only as a hash", async () => {
  const { env } = await envWith(), phone = await phoneKeys();
  assert.equal((await worker.fetch(get("/push/key"), { ALLOW_ORIGIN: ORIGIN })).status, 500, "no KV or keys: not configured");
  assert.equal((await worker.fetch(post("/push/subscribe", {}, "https://evil.test"), env)).status, 403);
  const key = await worker.fetch(get("/push/key"), env);
  assert.deepEqual(await key.json(), { key: env.VAPID_PUBLIC_KEY });
  assert.ok(![...key.headers.values()].some(x => x.includes(env.VAPID_PRIVATE_KEY)));
  const s = await subscribe(env, phone);
  assert.equal(s.status, 201); assert.ok(s.body.id && s.body.token);
  const stored = env.PUSH.m.get(`sub:${s.body.id}`);
  assert.ok(!stored.includes(s.body.token), "the token isn't stored");
  assert.deepEqual(JSON.parse(stored).morning, MORNING);
  assert.deepEqual(JSON.parse(env.PUSH.m.get("subs")), [s.body.id]);
  // Re-subscribing with the id and token updates the same phone (a new wake-up time); a wrong token makes a new one.
  const again = await subscribe(env, phone, { id: s.body.id, token: s.body.token, morning: { ...MORNING, time: "07:05" } });
  assert.equal(again.status, 200); assert.equal(again.body.id, s.body.id);
  assert.equal(JSON.parse(env.PUSH.m.get(`sub:${s.body.id}`)).morning.time, "07:05");
  // Bad subscriptions: another host, plain http, missing keys; bad JSON.
  for (const endpoint of ["https://evil.test/push", "http://web.push.apple.com/x"])
    assert.equal((await worker.fetch(post("/push/subscribe", { subscription: { endpoint, keys: phone.keys } }), env)).status, 400, endpoint);
  assert.equal((await worker.fetch(post("/push/subscribe", { subscription: { endpoint: "https://web.push.apple.com/x" } }), env)).status, 400);
  assert.equal((await worker.fetch(new Request("https://proxy.test/push/subscribe", { method: "POST", headers: { Origin: ORIGIN }, body: "{" }), env)).status, 400);
  assert.equal((await worker.fetch(get("/push/subscribe"), env)).status, 405);
  assert.equal((await worker.fetch(post("/push/other", {}), env)).status, 404);
  // A malformed wake-up config is dropped, not stored half-checked.
  const odd = await subscribe(env, phone, { morning: { ...MORNING, to: ["CBG"], time: "25:00" } });
  assert.equal(JSON.parse(env.PUSH.m.get(`sub:${odd.body.id}`)).morning, null);
  // At most ten phones.
  for (let i = 0; i < 8; i++) assert.equal((await subscribe(env, phone)).status, 201);
  assert.equal((await subscribe(env, phone)).status, 429);
});

test("Push routes: a plan or test needs the phone's token; only well-formed plans for the allowed stations are kept", async () => {
  const { env } = await envWith(), phone = await phoneKeys();
  const { body: me } = await subscribe(env, phone);
  assert.equal((await worker.fetch(post("/push/plan", { id: me.id, token: "wrong", plan: PLAN }), env)).status, 403);
  assert.equal((await worker.fetch(post("/push/test", { id: me.id }), env)).status, 403);
  for (const bad of [{ ...PLAN, from: "CBG" }, { ...PLAN, leadMs: -1 }, { ...PLAN, leaveBy: PLAN.leaveBy + 5 * MIN }, { ...PLAN, dep: Date.now() + 25 * 3600e3, leaveBy: Date.now() + 25 * 3600e3 - PLAN.leadMs },
    { ...PLAN, v: 2 }, { ...PLAN, std: "6:48" }, { ...PLAN, serviceId: "a b" }, { ...PLAN, train: "" }])
    assert.equal((await worker.fetch(post("/push/plan", { ...me, plan: bad }), env)).status, 400, JSON.stringify(bad));
  assert.equal((await worker.fetch(post("/push/plan", { ...me, plan: { ...PLAN, extra: "<script>" } }), env)).status, 200);
  const rec = JSON.parse(env.PUSH.m.get(`sub:${me.id}`));
  assert.deepEqual(rec.plan, PLAN, "only the plan's own fields are kept"); assert.deepEqual(rec.planState, {});
  // The same Follow keeps what's been sent; a new one starts again; null clears it.
  env.PUSH.m.set(`sub:${me.id}`, JSON.stringify({ ...rec, planState: { soonSent: true, lastLeaveBy: PLAN.leaveBy } }));
  await worker.fetch(post("/push/plan", { ...me, plan: { ...PLAN, dep: PLAN.dep + MIN, leaveBy: PLAN.leaveBy + MIN } }), env);
  assert.equal(JSON.parse(env.PUSH.m.get(`sub:${me.id}`)).planState.soonSent, true);
  await worker.fetch(post("/push/plan", { ...me, plan: { ...PLAN, followId: "f2" } }), env);
  assert.deepEqual(JSON.parse(env.PUSH.m.get(`sub:${me.id}`)).planState, {});
  await worker.fetch(post("/push/plan", { ...me, plan: null }), env);
  assert.equal(JSON.parse(env.PUSH.m.get(`sub:${me.id}`)).plan, null);
  // Test alert: encrypted for this phone, VAPID-signed, sent once.
  await withFeeds(async ({ pushes }) => {
    const r = await worker.fetch(post("/push/test", me), env);
    assert.equal(r.status, 200);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].opts.headers["Content-Encoding"], "aes128gcm");
    assert.match(pushes[0].opts.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    assert.deepEqual(await decrypt(pushes[0].opts.body, phone), { title: "Alerts are on", body: "You'll hear from Commute before Leave by, and on a disrupted morning.", tag: "test" });
  });
  // Unsubscribe forgets the phone.
  assert.equal((await worker.fetch(post("/push/unsubscribe", me), env)).status, 200);
  assert.equal(env.PUSH.m.get(`sub:${me.id}`), undefined); assert.deepEqual(JSON.parse(env.PUSH.m.get("subs")), []);
  assert.equal((await worker.fetch(post("/push/plan", { ...me, plan: PLAN }), env)).status, 403);
});

test("Scheduler: the followed 18:48 is watched with the app closed: Leave in 5 min at 18:17, Leave later when it runs late; KV written only on a change", async () => {
  const { env } = await envWith(), phone = await phoneKeys();
  const { body: me } = await subscribe(env, phone, { morning: null });
  await worker.fetch(post("/push/plan", { ...me, plan: PLAN }), env);
  let etd = "On time";
  await withFeeds(async ({ pushes, boards }) => {
    const puts = () => env.PUSH.log.puts;
    let p0 = puts();
    assert.deepEqual(await runAlerts(env, at(DAY, "17:20")), [], "over an hour before Leave by: not even a board");
    assert.equal(boards.length, 0);
    assert.deepEqual(await runAlerts(env, at(DAY, "18:16")), []);
    assert.equal(boards.length, 1); assert.match(boards[0].url, /GetDepBoardWithDetails\/KGX\?numRows=10&filterCrs=LET/);
    assert.equal(boards[0].opts.headers["x-apikey"], "rdm-secret");
    assert.equal(puts(), p0, "nothing changed, nothing written");
    let sent = await runAlerts(env, at(DAY, "18:17"));
    assert.equal(sent.length, 1);
    assert.deepEqual(await decrypt(pushes[0].opts.body, phone), { kind: "soon", tag: "leave-f1", title: "Leave in 5 min · by 18:22", body: "For the 18:48 from King's Cross (on time)." });
    assert.equal(puts(), p0 + 1);
    p0 = puts();
    assert.deepEqual(await runAlerts(env, at(DAY, "18:18")), []); assert.equal(puts(), p0);
    etd = "18:51";
    sent = await runAlerts(env, at(DAY, "18:19"));
    assert.equal((await decrypt(pushes[1].opts.body, phone)).title, "Leave later · by 18:25");
    etd = "Cancelled";
    await runAlerts(env, at(DAY, "18:20"));
    assert.equal((await decrypt(pushes[2].opts.body, phone)).title, "18:48 cancelled");
    assert.equal(JSON.parse(env.PUSH.m.get(`sub:${me.id}`)).plan, null, "a cancelled train ends the plan");
    const n = boards.length; await runAlerts(env, at(DAY, "18:21")); assert.equal(boards.length, n, "no plan, no board");
  }, { board: () => gnBoard(etd) });
});

test("Scheduler: a weekday wake-up warning for disrupted morning trains, once; nothing on a good morning; a gone phone is forgotten", async () => {
  const { env } = await envWith(), phone = await phoneKeys();
  const { body: me } = await subscribe(env, phone);
  const svc = (std, etd, to, id) => ({ std, etd, operator: "Great Northern", serviceID: id, subsequentCallingPoints: [{ callingPoint: [{ crs: to, st: "08:00", et: "On time" }] }] });
  let good = false;
  await withFeeds(async ({ pushes, boards }) => {
    assert.deepEqual(await runAlerts(env, at(DAY, "06:29")), []); assert.equal(boards.length, 0);
    await runAlerts(env, at(DAY, "06:30"));
    assert.equal(boards.length, 3, "one board per London station");
    assert.equal(pushes.length, 1);
    assert.deepEqual(await decrypt(pushes[0].opts.body, phone), { kind: "morning", tag: `morning-${DAY}`, title: "Commute: 2 trains disrupted", body: "07:08 to King's Cross cancelled; 07:21 to Farringdon 9 min late." });
    assert.equal(pushes[0].opts.headers.TTL, "900"); assert.equal(pushes[0].opts.headers.Urgency, "high");
    await runAlerts(env, at(DAY, "06:31")); assert.equal(pushes.length, 1, "once a day"); assert.equal(boards.length, 3);
    // Next day, all fine: the boards are read, nothing is sent.
    good = true;
    await runAlerts(env, at("2026-11-04", "06:30")); assert.equal(boards.length, 6); assert.equal(pushes.length, 1);
  }, { board: (url) => good ? { trainServices: [] } : /KGX/.test(url) ? { trainServices: [svc("07:08", "Cancelled", "KGX", "A")] } : /ZFD/.test(url) ? { trainServices: [svc("07:21", "07:30", "ZFD", "B")] } : { trainServices: [] } });
  // The push service says the subscription is gone (410): the proxy forgets the phone.
  await withFeeds(async () => {
    await runAlerts(env, at("2026-11-05", "06:30"));
    assert.equal(env.PUSH.m.get(`sub:${me.id}`), undefined); assert.deepEqual(JSON.parse(env.PUSH.m.get("subs")), []);
  }, { board: () => ({ trainServices: [svc("07:08", "Cancelled", "KGX", "A")] }), pushStatus: () => 410 });
});

test("Scheduler in summer on a UTC machine (Cloudflare's): board times and the alert are London time", async () => {
  const realTz = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const now = Date.parse("2026-07-01T17:17:00Z");   // 18:17 in London (BST)
    assert.equal(londonShift(now), 3600e3);
    const { env } = await envWith(), phone = await phoneKeys();
    const { body: me } = await subscribe(env, phone, { morning: null });
    const dep = Date.parse("2026-07-01T17:48:00Z");
    const rec = JSON.parse(env.PUSH.m.get(`sub:${me.id}`));
    env.PUSH.m.set(`sub:${me.id}`, JSON.stringify({ ...rec, plan: { ...PLAN, dep, leaveBy: dep - PLAN.leadMs }, planState: {} }));
    await withFeeds(async ({ pushes }) => {
      assert.deepEqual(await runAlerts(env, now - MIN), [], "18:16 London: not yet");
      await runAlerts(env, now);
      assert.deepEqual(await decrypt(pushes[0].opts.body, phone), { kind: "soon", tag: "leave-f1", title: "Leave in 5 min · by 18:22", body: "For the 18:48 from King's Cross (on time)." });
      // What's stored is real time again (not shifted).
      assert.equal(JSON.parse(env.PUSH.m.get(`sub:${me.id}`)).planState.lastLeaveBy, dep - PLAN.leadMs);
    }, { board: () => gnBoard("On time") });
    process.env.TZ = "Europe/London";
    assert.equal(londonShift(Date.parse("2026-07-01T17:17:00Z")), 0, "in London's own time zone there's nothing to shift");
    process.env.TZ = "America/New_York";
    assert.equal(londonShift(Date.parse("2026-07-01T17:17:00Z")), 5 * 3600e3);
  } finally { if (realTz === undefined) delete process.env.TZ; else process.env.TZ = realTz; }
});
