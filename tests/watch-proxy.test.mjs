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
async function withFeeds(fn, etd = () => "On time", hooks = {}) {
  const real = globalThis.fetch, pushes = [], fetched = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("push.apple.com")) { pushes.push({ url: u, headers: opts.headers, body: JSON.parse(opts.body) }); return new Response(null, { status: 200 }); }
    fetched.push(u);
    if (hooks.onBoard) await hooks.onBoard(u);
    if (u.startsWith("https://up.test/")) return new Response(JSON.stringify(/\/KGX\?/.test(u) ? { ...kgx(etd()), nrccMessages: hooks.msgs || [] } : { trainServices: [], nrccMessages: [] }), { status: 200 });
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
    // The 17:05 running again: three 'ok' checks, then it's cleared.
    assert.deepEqual(await runWatch(env, at(DAY, "17:02")), []);
    assert.deepEqual(await runWatch(env, at(DAY, "17:02")), []);
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

test("Commute watch: the alert is a visible APNs alert; East Coast notices from King's Cross don't go red; the record is written only on a change and keeps what the page wrote meanwhile", async () => {
  const env = await envWith();
  const me = await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
  let puts = 0; const put = env.PUSH.put.bind(env.PUSH); env.PUSH.put = async (k, v) => { puts++; return put(k, v); };
  await withFeeds(async ({ pushes }) => {
    await runWatch(env, at(DAY, "17:00")); await runWatch(env, at(DAY, "17:02")); await runWatch(env, at(DAY, "17:04"));
    assert.equal(pushes.length, 0, "a notice for further north on King's Cross's board is not your line");
    assert.ok(puts <= 1, `written at most once over three unchanged checks (${puts})`);
  }, () => "On time", { msgs: ["Lines are blocked between Peterborough and York."] });
  // The page follows a journey while the watch is fetching: its plan survives the watch's write.
  let wrote = false;
  await withFeeds(async ({ pushes }) => {
    await runWatch(env, at(DAY, "17:04"));
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].headers["apns-push-type"], "alert", "a visible alert, not a background push");
  }, () => "Cancelled", { onBoard: async () => { if (wrote) return; wrote = true; const r = JSON.parse(env.PUSH.m.get(`nat:${me.id}`)); r.plan = { followId: "page" }; env.PUSH.m.set(`nat:${me.id}`, JSON.stringify(r)); } });
  const stored = JSON.parse(env.PUSH.m.get(`nat:${me.id}`));
  assert.equal(stored.plan.followId, "page"); assert.equal(stored.watchState.level, "red");
});

test("Commute watch runs in London time on a UTC server in summer, and the cron runs it", async () => {
  const env = await envWith();
  await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
  const tz = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    await withFeeds(async ({ fetched }) => {
      // 1 July, 14:00 UTC is 15:00 in London: the afternoon window has started there.
      await runWatch(env, Date.UTC(2027, 6, 1, 14, 0));
      assert.ok(fetched.length > 0, "15:00 BST is inside the window");
      fetched.length = 0;
      await runWatch(env, Date.UTC(2027, 6, 2, 0, 0));
      assert.equal(fetched.length, 0, "01:00 BST is outside it");
    });
  } finally { process.env.TZ = tz; }
  // The cron: the watch's board requests come after the followed-journey run has finished.
  const order = [];
  const realNow = Date.now;
  await withFeeds(async () => {
    const waits = [];
    Date.now = () => at(DAY, "17:00");
    try { await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); } finally { Date.now = realNow; }
  }, () => "On time", { onBoard: async (u) => order.push(u) });
  assert.ok(order.some((u) => u.startsWith("https://up.test/")), "the cron runs the watch");
});

test("The cron: the watch starts only after the followed-journey run has finished, and still runs if that run fails", async () => {
  const realNow = Date.now;
  for (const failNative of [false, true]) {
    const env = await envWith();
    await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
    const get = env.PUSH.get.bind(env.PUSH);
    let natsCalls = 0, nativeDone = false, watchSawNativeDone = null;
    env.PUSH.get = async (k, t) => {
      if (k === "nats") {
        natsCalls++;
        if (natsCalls === 1) { await new Promise((r) => setTimeout(r, 30)); nativeDone = true; if (failNative) throw new Error("KV down"); return get(k, t); }
        if (watchSawNativeDone == null) watchSawNativeDone = nativeDone;
      }
      return get(k, t);
    };
    await withFeeds(async ({ fetched }) => {
      const waits = [];
      Date.now = () => at(DAY, "17:00");
      try { await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); } finally { Date.now = realNow; }
      assert.equal(watchSawNativeDone, true, `the watch waited for the followed-journey run (fail=${failNative})`);
      assert.ok(fetched.some((u) => u.startsWith("https://up.test/")), `the watch still ran (fail=${failNative})`);
    });
  }
});

test("The proxy's corridor runs on beyond Letchworth: 'between Hitchin and Cambridge' is your line", async () => {
  const env = await envWith();
  await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
  await withFeeds(async ({ pushes }) => {
    await runWatch(env, at(DAY, "17:00"));
    assert.equal(pushes.length, 1); assert.equal(pushes[0].body.aps.alert.title, "Commute: disruption on the way home");
  }, () => "On time", { msgs: ["Lines are blocked between Hitchin and Cambridge."] });
});

test("Home ends the evening watch: the geofence, home Wi-Fi or the app at home stops it for the rest of the night; tomorrow it runs again", async () => {
  for (const evidence of [{ kind: "region", place: "home", event: "enter" }, { kind: "wifi", place: "home" }, { kind: "place", place: "home" }]) {
    const env = await envWith();
    const me = await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
    const realNow = Date.now;
    try {
      Date.now = () => at(DAY, "16:40");
      const r = await worker.fetch(post("/native/evidence", { id: me.id, token: me.token, evidence: { ...evidence, at: at(DAY, "16:40") } }), env);
      assert.equal(r.status, 200, JSON.stringify(evidence));
    } finally { Date.now = realNow; }
    assert.equal(JSON.parse(env.PUSH.m.get(`nat:${me.id}`)).homeAt, at(DAY, "16:40"));
    await withFeeds(async ({ fetched, pushes }) => {
      await runWatch(env, at(DAY, "17:00")); await runWatch(env, at(DAY, "20:30"));
      assert.equal(fetched.length, 0, `${evidence.kind}: home since 16:40, so nothing is watched (or fetched) tonight`);
      assert.equal(pushes.length, 0);
      await runWatch(env, at("2026-11-20", "07:00"));
      assert.ok(fetched.length > 0, "the next morning's watch runs");
      fetched.length = 0;
      await runWatch(env, at("2026-11-20", "17:00"));
      assert.ok(fetched.length > 0, "and the next evening's");
    }, () => "Cancelled");
  }
});

test("Home this morning doesn't stop this evening's watch; away from home (leaving, or the office) changes nothing", async () => {
  const env = await envWith();
  const me = await register(env, { alarm: true, alarmLeadMin: 5, watch: true });
  const send = async (evidence, t) => { const realNow = Date.now; try { Date.now = () => t; return await worker.fetch(post("/native/evidence", { id: me.id, token: me.token, evidence: { ...evidence, at: t } }), env); } finally { Date.now = realNow; } };
  await send({ kind: "wifi", place: "home" }, at(DAY, "07:00"));
  await send({ kind: "region", place: "home", event: "exit" }, at(DAY, "07:30"));
  await send({ kind: "wifi", place: "office" }, at(DAY, "09:00"));
  assert.equal(JSON.parse(env.PUSH.m.get(`nat:${me.id}`)).homeAt, at(DAY, "07:00"), "only arrivals home are kept");
  await withFeeds(async ({ pushes }) => {
    await runWatch(env, at(DAY, "17:00"));
    assert.equal(pushes.length, 1, "still out at 17:00: the evening watch warns");
  }, () => "Cancelled");
});
