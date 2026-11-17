// The iPhone app's side of the proxy (docs/ios-app.md §6.3, docs/stories/ios-app.md). Routes (origin-checked by
// worker.js; JSON in and out):
//   POST /native/register    {apnsToken, env, prefs, id?, token?} → {id, token}: a new or updated iPhone
//   POST /native/follow      {id, token, plan|null, extra?, laToken?}: the followed journey (core leaveAlertPlan plus
//                            what the snapshot needs), its Live Activity's push token, or none
//   POST /native/evidence    {id, token, evidence}: a geofence crossed while the app was closed (core evidenceSetOff)
//   POST /native/unregister  {id, token}
// Scheduler (with the web alerts, every minute): for each iPhone with a followed journey, its train on a fresh board →
// core leaveAlertStep (the alerts, the same words as the web) and core proxySnapshot (what the Live Activity and the
// leave alarm show). A changed snapshot is pushed to the Live Activity and, as a background push, to the app (which
// moves its alarm). Nothing here decides what to show: the engine does. KV binding PUSH, keys nat:<id> and "nats".
//
// APNs: token auth (ES256 JWT) from APNS_KEY (the .p8 file's text), APNS_KEY_ID, APNS_TEAM_ID; APNS_TOPIC is the
// bundle ID. Not yet proven from a Worker against Apple (first real push: docs/ios-app.md §8).
import * as C from "../dist/core.mjs";
import { b64u } from "./webpush.js";
import { londonShift, sha256, str, cleanPlan, body, board, shiftPlan, shiftState } from "./push.js";

export const MAX_IPHONES = 10;
/** /native/follow accepts one change per iPhone this often (the page posts on a change only). */
export const FOLLOW_MIN_GAP_MS = 10e3;
/** The board is fetched from this long before Leave by (no live data sooner is worth a request a minute). */
export const NATIVE_WATCH_MS = 60 * 60e3;
/** A Live Activity ends this long after the door arrival (or the train's arrival when that isn't known). */
export const NATIVE_END_AFTER_MS = 10 * 60e3;
const APNS_TOKEN = /^[0-9a-fA-F]{64,200}$/;
const json = (b, status, cors) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const PLACE = /^(home|office|[A-Z]{3})$/;

export const nativeConfigured = env => !!(env.PUSH && env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_TOPIC);

/** The snapshot extras as the page sends them (core NativePlanExtra), checked field by field; unknown fields dropped. */
export function cleanExtra(x) {
  const out = {};
  if (!x || typeof x !== "object") return out;
  if (["commute", "leisure", "trip"].includes(x.mode)) out.mode = x.mode;
  if (["home", "office"].includes(x.direction)) out.direction = x.direction;
  for (const k of ["fromName", "toName", "arriveLabel"]) if (str(x[k], 60)) out[k] = x[k];
  for (const k of ["marginMs", "afterMs"]) if (Number.isFinite(x[k]) && x[k] >= 0 && x[k] <= 3 * 3600e3) out[k] = x[k];
  if (typeof x.startPlace === "string" && PLACE.test(x.startPlace)) out.startPlace = x.startPlace;
  return out;
}
export function cleanPrefs(p) {
  const lead = p && Number.isInteger(p.alarmLeadMin) && p.alarmLeadMin >= 0 && p.alarmLeadMin <= 60 ? p.alarmLeadMin : C.LEAVE_ALARM_DEFAULT_MIN;
  return { alarm: !(p && p.alarm === false), alarmLeadMin: lead };
}
function cleanEvidence(e, now) {
  if (!e || typeof e !== "object" || e.kind !== "region" || !["exit", "enter"].includes(e.event) || typeof e.place !== "string" || !PLACE.test(e.place)) return null;
  if (!Number.isFinite(e.at) || e.at > now + C.EVIDENCE_SKEW_MS || e.at < now - 6 * 3600e3) return null;
  return { kind: "region", place: e.place, event: e.event, at: e.at };
}
async function iphone(env, b) {
  if (!b || !str(b.id, 64) || !str(b.token, 128)) return null;
  const rec = await env.PUSH.get(`nat:${b.id}`, "json");
  return rec && rec.tokenHash === await sha256(b.token) ? rec : null;
}

/** The /native/... routes. `allowed` is the station allowlist the board routes use. */
export async function nativeRoute(request, env, cors, url, allowed) {
  if (!nativeConfigured(env)) return json({ error: "Proxy not configured for the iPhone app: bind KV namespace PUSH and set APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC." }, 500, cors);
  const path = url.pathname;
  if (!["/native/register", "/native/follow", "/native/evidence", "/native/unregister"].includes(path)) return json({ error: "Not found" }, 404, cors);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  const b = await body(request);
  if (!b) return json({ error: "Bad request" }, 400, cors);
  const now = Date.now();

  if (path === "/native/register") {
    if (!APNS_TOKEN.test(b.apnsToken || "") || !["sandbox", "production"].includes(b.env)) return json({ error: "Bad registration" }, 400, cors);
    const apns = { token: b.apnsToken.toLowerCase(), env: b.env }, prefs = cleanPrefs(b.prefs);
    const existing = b.id ? await iphone(env, b) : null;
    if (existing) {
      await env.PUSH.put(`nat:${existing.id}`, JSON.stringify({ ...existing, apns, prefs }));
      return json({ id: existing.id, token: b.token }, 200, cors);
    }
    const ids = (await env.PUSH.get("nats", "json")) || [];
    if (ids.length >= MAX_IPHONES) return json({ error: "Too many iPhones" }, 429, cors);
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(12))), token = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
    await env.PUSH.put(`nat:${id}`, JSON.stringify({ id, tokenHash: await sha256(token), apns, prefs, created: now }));
    await env.PUSH.put("nats", JSON.stringify([...ids, id]));
    return json({ id, token }, 201, cors);
  }
  const rec = await iphone(env, b);
  if (!rec) return json({ error: "Unknown iPhone" }, 403, cors);
  if (path === "/native/follow") {
    if (b.plan == null) {
      if (rec.plan) await env.PUSH.put(`nat:${rec.id}`, JSON.stringify({ ...rec, plan: null, extra: null, planState: null, setOff: false, la: null, shown: null, planAt: now }));
      return json({ ok: true }, 200, cors);
    }
    if (rec.planAt && now - rec.planAt < FOLLOW_MIN_GAP_MS && now >= rec.planAt) return json({ error: "Too soon" }, 429, cors);
    const plan = cleanPlan(b.plan, env, allowed, now);
    if (!plan) return json({ error: "Bad plan" }, 400, cors);
    if (b.laToken != null && !APNS_TOKEN.test(b.laToken)) return json({ error: "Bad Live Activity token" }, 400, cors);
    const keep = rec.plan && rec.plan.followId === plan.followId && rec.plan.std === plan.std && rec.plan.from === plan.from;
    const la = b.laToken ? { token: b.laToken.toLowerCase() } : keep ? rec.la || null : null;
    await env.PUSH.put(`nat:${rec.id}`, JSON.stringify({ ...rec, plan, extra: cleanExtra(b.extra), planState: keep ? rec.planState || {} : {},
      setOff: keep ? !!rec.setOff || !!b.setOff : !!b.setOff, followedAt: keep ? rec.followedAt || now : now, la, shown: keep ? rec.shown || null : null, planAt: now }));
    return json({ ok: true }, 200, cors);
  }
  if (path === "/native/evidence") {
    const ev = cleanEvidence(b.evidence, now);
    if (!ev) return json({ error: "Bad evidence" }, 400, cors);
    const setOff = !!rec.plan && C.evidenceSetOff(ev, rec.extra && rec.extra.startPlace, rec.followedAt || 0, now);
    // Only a change is written; the next scheduler run pushes the new snapshot (the alarm cancelled).
    if (setOff && !rec.setOff) await env.PUSH.put(`nat:${rec.id}`, JSON.stringify({ ...rec, setOff: true }));
    return json({ ok: true, setOff }, 200, cors);
  }
  // unregister
  await env.PUSH.delete(`nat:${rec.id}`);
  const ids = (await env.PUSH.get("nats", "json")) || [];
  await env.PUSH.put("nats", JSON.stringify(ids.filter(x => x !== rec.id)));
  return json({ ok: true }, 200, cors);
}

// ---------- APNs ----------
const pem = s => b64u.decode(String(s).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
let jwtCache = null;
/** The provider token: reused for 50 minutes (Apple refuses one older than an hour, and too many new ones). */
export async function apnsJwt(env, nowMs) {
  if (jwtCache && jwtCache.kid === env.APNS_KEY_ID && jwtCache.team === env.APNS_TEAM_ID && nowMs - jwtCache.at < 50 * 60e3 && nowMs >= jwtCache.at) return jwtCache.jwt;
  const key = await crypto.subtle.importKey("pkcs8", pem(env.APNS_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = o => b64u.encode(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "ES256", kid: env.APNS_KEY_ID }), claims = enc({ iss: env.APNS_TEAM_ID, iat: Math.floor(nowMs / 1000) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`)));
  const jwt = `${head}.${claims}.${b64u.encode(sig)}`;
  jwtCache = { jwt, at: nowMs, kid: env.APNS_KEY_ID, team: env.APNS_TEAM_ID };
  return jwt;
}
export const resetApnsJwt = () => { jwtCache = null; };
const host = e => (e === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
/**
 * One APNs request. kind: "alert" | "background" | "liveactivity". Returns {ok, status, gone}: gone when Apple says the
 * token is no longer valid (410, or 400 BadDeviceToken), so it's dropped.
 */
export async function sendApns(env, { token, env: apnsEnv }, kind, payload, nowMs, { expiresSec = 15 * 60, collapseId } = {}) {
  let r;
  try {
    r = await fetch(`${host(apnsEnv)}/3/device/${token}`, { method: "POST", body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), headers: {
      authorization: `bearer ${await apnsJwt(env, nowMs)}`,
      "apns-topic": kind === "liveactivity" ? `${env.APNS_TOPIC}.push-type.liveactivity` : env.APNS_TOPIC,
      "apns-push-type": kind, "apns-priority": kind === "background" ? "5" : "10",
      "apns-expiration": String(Math.floor(nowMs / 1000) + expiresSec),
      ...(collapseId ? { "apns-collapse-id": collapseId } : {}), "content-type": "application/json" } });
  } catch (e) { return { ok: false, status: 0, gone: false }; }
  let reason = "";
  if (!r.ok) { try { reason = (await r.json()).reason || ""; } catch (e) { /* no body */ } }
  return { ok: r.ok, status: r.status, reason, gone: r.status === 410 || (r.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(reason)) };
}
/** The payloads (the iPhone app decodes `snapshot` as the Live Activity's content state; docs/ios-app.md §6.3). */
export const apnsPayloads = {
  alert: n => ({ aps: { alert: { title: n.title, body: n.body }, sound: "default", "thread-id": n.tag }, kind: n.kind }),
  background: snap => ({ aps: { "content-available": 1 }, snapshot: snap }),
  liveActivity: (snap, end, nowMs) => ({ aps: { timestamp: Math.floor(nowMs / 1000), event: end ? "end" : "update", "content-state": snap,
    ...(end ? { "dismissal-date": Math.floor(nowMs / 1000) + 15 * 60 } : { "stale-date": Math.floor(nowMs / 1000) + 5 * 60 }) } }),
};

const shiftNativeState = (s, d) => {
  const out = shiftState(s, d);
  if (Number.isFinite(out.lastArr)) out.lastArr += d;
  return out;
};

/**
 * One scheduler run for the iPhones. Per iPhone with a plan: the board (from an hour before Leave by until the train
 * leaves), the alerts and the snapshot from the engine, state written before anything is sent (as runAlerts), then
 * the alert, the Live Activity update and the background push. Returns what was sent, for tests and logs.
 */
export async function runNative(env, now) {
  if (!nativeConfigured(env)) return [];
  const d = londonShift(now), lnow = now + d, sent = [];
  const ids = (await env.PUSH.get("nats", "json")) || [];
  for (const id of ids) {
    try {
      const rec = await env.PUSH.get(`nat:${id}`, "json");
      if (!rec || !rec.plan) continue;
      const plan = { ...shiftPlan(rec.plan, d), ...(rec.extra || {}) };
      let state = shiftNativeState(rec.planState, d);
      let observed = null, dataAt = Number.isFinite(rec.dataAt) ? rec.dataAt + d : null, notice = null, done = false;
      const dep = Number.isFinite(state.lastDep) ? state.lastDep : plan.dep;
      if (lnow >= plan.leaveBy - NATIVE_WATCH_MS && lnow < dep + 2 * 60e3) {
        const b = await board(env, plan.from, plan.to, lnow);
        if (b) { dataAt = lnow; observed = C.findPlannedTrain(plan, b); }
        if (lnow < dep) {
          const step = C.leaveAlertStep(plan, state, observed, lnow);
          state = step.state; notice = step.notice;
          if (observed && observed.cancelled) done = true;
        } else if (observed && !observed.depUnknown && Number.isFinite(observed.dep)) { state = { ...state, lastDep: observed.dep, lastLate: observed.depLate || 0 }; }
        if (observed && Number.isFinite(observed.arr)) state = { ...state, lastArr: observed.arr };
        if (observed && observed.platform) state = { ...state, lastPlatform: observed.platform };
      }
      const snap = C.proxySnapshot(plan, state, observed, { now: lnow, dataAt, setOff: !!rec.setOff, alarm: { enabled: rec.prefs ? rec.prefs.alarm : true, leadMin: rec.prefs ? rec.prefs.alarmLeadMin : undefined } });
      const endAt = snap.arrive && Number.isFinite(snap.arrive.t) ? snap.arrive.t : Number.isFinite(state.lastArr) ? state.lastArr : null;
      if (done || C.leaveAlertExpired(plan, lnow) || (endAt != null && lnow > endAt + NATIVE_END_AFTER_MS)) done = true;
      const real = C.shiftSnapshot(snap, -d), shown = C.snapshotShown(real);
      const changed = shown !== rec.shown;
      const newState = shiftNativeState(state, -d);
      const upd = {};
      if (done) Object.assign(upd, { plan: null, extra: null, planState: null, setOff: false, la: null, shown: null });
      else {
        if (JSON.stringify(newState) !== JSON.stringify(rec.planState || {})) upd.planState = newState;
        if (changed) upd.shown = shown;
        if (dataAt != null && (lnow - (rec.dataWrittenAt || 0) >= 5 * 60e3 || changed)) { upd.dataAt = dataAt - d; upd.dataWrittenAt = lnow; }
      }
      if (Object.keys(upd).length) {
        const fresh = await env.PUSH.get(`nat:${id}`, "json");
        if (!fresh) continue;
        // The page may have changed the plan meanwhile: then only what doesn't belong to the old plan is kept.
        if (!fresh.plan || fresh.plan.followId !== rec.plan.followId || fresh.planAt !== rec.planAt) continue;
        await env.PUSH.put(`nat:${id}`, JSON.stringify({ ...fresh, ...upd }));
      }
      const pushes = [];
      // The leave alarm is the "time to leave" reminder on the iPhone, so the web's "Leave in 5 min" alert isn't sent
      // twice; once you've set off, Leave by no longer matters (the Live Activity shows the platform time).
      const alarmOn = !rec.prefs || rec.prefs.alarm !== false;
      if (notice && !(notice.kind === "soon" && alarmOn) && !(rec.setOff && (notice.kind === "soon" || notice.kind === "changed")))
        pushes.push(["alert", apnsPayloads.alert(notice), rec.apns]);
      if (changed || done) {
        if (rec.la && rec.la.token) pushes.push(["liveactivity", apnsPayloads.liveActivity(real, done, now), { token: rec.la.token, env: rec.apns.env }]);
        pushes.push(["background", apnsPayloads.background(done ? null : real), rec.apns]);
      }
      for (const [kind, payload, to] of pushes) {
        const r = await sendApns(env, to, kind, payload, now, kind === "alert" ? {} : { collapseId: `snap-${rec.plan.followId}`.slice(0, 64) });
        sent.push({ id, kind, status: r.status, ...(kind === "alert" ? { notice } : { phase: real.phase }) });
        if (r.gone && kind !== "liveactivity") {
          await env.PUSH.delete(`nat:${id}`);
          await env.PUSH.put("nats", JSON.stringify(((await env.PUSH.get("nats", "json")) || []).filter(x => x !== id)));
          break;
        }
        if (r.gone && kind === "liveactivity") {
          const fresh = await env.PUSH.get(`nat:${id}`, "json");
          if (fresh) await env.PUSH.put(`nat:${id}`, JSON.stringify({ ...fresh, la: null }));
        }
      }
    } catch (e) { sent.push({ id, error: String(e && e.message || e) }); }
  }
  return sent;
}
