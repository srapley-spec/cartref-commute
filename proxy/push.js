// Time-to-leave and wake-up alerts: the Worker's side (docs/stories/time-to-leave-alerts.md).
// Routes (origin-checked by worker.js; JSON in and out):
//   GET  /push/key          the VAPID public key the phone subscribes with
//   POST /push/subscribe    {subscription, morning, id?, token?} → {id, token}: a new or updated phone
//   POST /push/plan         {id, token, plan|null}: the followed journey to watch (from core leaveAlertPlan), or none
//   POST /push/test         {id, token}: send "Alerts are on"
//   POST /push/unsubscribe  {id, token}
// Scheduler (cron, every minute): for each phone, its plan's train on a fresh board → core leaveAlertStep; at its
// wake-up time on its days → core morningAlert. What to say and when comes from the engine; this file only fetches,
// stores (KV binding PUSH) and sends (proxy/webpush.js).
//
// Times: the engine works in local time (the phone's), and a Worker's local time is UTC. Every engine call here runs
// in "London time": instants are shifted by London's offset from the runtime's, and shifted back when stored.
import * as C from "../dist/core.mjs";
import { b64u, sendPush, validPushEndpoint } from "./webpush.js";

const MAX_PHONES = 10;
/** /push/plan accepts one change per phone this often. */
export const PLAN_MIN_GAP_MS = 10e3;
/** A subscription's keys must be a real P-256 point and a 16-byte auth secret, or encryption would fail at send time. */
async function validKeys(keys) {
  try {
    if (b64u.decode(keys.auth).length !== 16) return false;
    await crypto.subtle.importKey("raw", b64u.decode(keys.p256dh), { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch (e) { return false; }
}
const CRS = /^[A-Z]{3}$/;
const json = (body, status, cors) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** London's offset from this runtime's local time at `now` (ms): 0 when the runtime is in London, ±1 h in UTC in summer. */
export function londonShift(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const london = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(now / 1000) * 1000;
  const runtime = -new Date(now).getTimezoneOffset() * 60e3;
  return Math.round((london - runtime) / 60e3) * 60e3;
}

async function sha256(s) { return b64u.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))); }
const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const stationOk = (env, crs, allowed) => CRS.test(crs) && (env.ALLOW_ANY_STATION === "yes" || allowed.has(crs));

/** A morning config as the page sends it, checked; null if absent or malformed. */
export function cleanMorning(m, env, allowed) {
  if (!m || typeof m !== "object") return null;
  const to = Array.isArray(m.to) ? m.to.filter(x => stationOk(env, x, allowed)).slice(0, 5) : [];
  if (!stationOk(env, m.from, allowed) || !to.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time || "")) return null;
  const days = Array.isArray(m.days) ? [...new Set(m.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  if (!days.length) return null;
  const names = {};
  for (const k of [m.from, ...to]) if (m.names && str(m.names[k], 60)) names[k] = m.names[k];
  return { from: m.from, to, time: m.time, days, names };
}
/** A plan as the page sends it (core leaveAlertPlan), checked; null if malformed. */
export function cleanPlan(p, env, allowed, now) {
  if (!p || typeof p !== "object" || p.v !== 1) return null;
  const num = k => Number.isFinite(p[k]);
  if (!str(p.followId, 100) || !stationOk(env, p.from, allowed) || !stationOk(env, p.to, allowed) || !/^\d\d:\d\d$/.test(p.std || "")) return null;
  if (!num("dep") || !num("leaveBy") || !num("leadMs") || p.leadMs < 0 || p.leadMs > 6 * 3600e3 || Math.abs(p.dep - p.leadMs - p.leaveBy) > 60e3) return null;
  if (p.dep < now - 3600e3 || p.dep > now + 24 * 3600e3 || !str(p.train, 100)) return null;
  if (p.serviceId != null && !(str(p.serviceId, 64) && /^[A-Za-z0-9+/=_-]+$/.test(p.serviceId))) return null;
  if (p.operator != null && !str(p.operator, 60)) return null;
  return { v: 1, followId: p.followId, serviceId: p.serviceId || undefined, from: p.from, to: p.to, std: p.std, operator: p.operator || undefined,
    dep: p.dep, leaveBy: p.leaveBy, leadMs: p.leadMs, train: p.train };
}

async function body(request) {
  const t = await request.text();
  if (t.length > 8192) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
async function phone(env, b) {
  if (!b || !str(b.id, 64) || !str(b.token, 128)) return null;
  const rec = await env.PUSH.get(`sub:${b.id}`, "json");
  return rec && rec.tokenHash === await sha256(b.token) ? rec : null;
}
const vapid = env => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });

/** The /push/... routes. `allowed` is the station allowlist the board routes use. */
export async function pushRoute(request, env, cors, url, allowed) {
  if (!env.PUSH || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT)
    return json({ error: "Proxy not configured for alerts: bind KV namespace PUSH and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT." }, 500, cors);
  const path = url.pathname;
  if (path === "/push/key") return request.method === "GET" ? json({ key: env.VAPID_PUBLIC_KEY }, 200, cors) : json({ error: "Method not allowed" }, 405, cors);
  if (!["/push/subscribe", "/push/plan", "/push/test", "/push/unsubscribe"].includes(path)) return json({ error: "Not found" }, 404, cors);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  const b = await body(request);
  if (!b) return json({ error: "Bad request" }, 400, cors);
  const now = Date.now();

  if (path === "/push/subscribe") {
    const s = b.subscription;
    if (!s || !validPushEndpoint(s.endpoint) || !s.keys || !str(s.keys.p256dh, 200) || !str(s.keys.auth, 100) || !(await validKeys(s.keys))) return json({ error: "Bad subscription" }, 400, cors);
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
    const morning = cleanMorning(b.morning, env, allowed);
    const existing = b.id ? await phone(env, b) : null;
    if (existing) {
      await env.PUSH.put(`sub:${existing.id}`, JSON.stringify({ ...existing, sub, morning }));
      return json({ id: existing.id, token: b.token }, 200, cors);
    }
    const ids = (await env.PUSH.get("subs", "json")) || [];
    if (ids.length >= MAX_PHONES) return json({ error: "Too many phones" }, 429, cors);
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(12))), token = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
    await env.PUSH.put(`sub:${id}`, JSON.stringify({ id, tokenHash: await sha256(token), sub, morning, created: now }));
    await env.PUSH.put("subs", JSON.stringify([...ids, id]));
    return json({ id, token }, 201, cors);
  }
  const rec = await phone(env, b);
  if (!rec) return json({ error: "Unknown phone" }, 403, cors);
  if (path === "/push/plan") {
    if (b.plan == null) { if (rec.plan) await env.PUSH.put(`sub:${rec.id}`, JSON.stringify({ ...rec, plan: null, planState: null, planAt: now })); return json({ ok: true }, 200, cors); }
    // The page posts only on a change (about once a minute at most); anything faster is refused, which bounds KV writes.
    if (rec.planAt && now - rec.planAt < PLAN_MIN_GAP_MS && now >= rec.planAt) return json({ error: "Too soon" }, 429, cors);
    const plan = cleanPlan(b.plan, env, allowed, now);
    if (!plan) return json({ error: "Bad plan" }, 400, cors);
    // The same followed journey keeps what's already been sent; a new one starts again.
    const keep = rec.plan && rec.plan.followId === plan.followId && rec.plan.std === plan.std && rec.plan.from === plan.from;
    await env.PUSH.put(`sub:${rec.id}`, JSON.stringify({ ...rec, plan, planState: keep ? rec.planState || {} : {}, planAt: now }));
    return json({ ok: true }, 200, cors);
  }
  if (path === "/push/test") {
    let r;
    try { r = await sendPush(rec.sub, { title: "Alerts are on", body: "You'll hear from Commute before Leave by, and on a disrupted morning.", tag: "test" }, vapid(env), now); }
    catch (e) { r = { ok: false, status: 0 }; }
    return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502, cors);
  }
  // unsubscribe
  await env.PUSH.delete(`sub:${rec.id}`);
  const ids = (await env.PUSH.get("subs", "json")) || [];
  await env.PUSH.put("subs", JSON.stringify(ids.filter(x => x !== rec.id)));
  return json({ ok: true }, 200, cors);
}

const stripTags = h => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
/** A live board through Rail Data Marketplace, parsed by the engine at London time `lnow`; null if it fails. */
async function board(env, from, to, lnow) {
  const base = String(env.RDM_BASE || "").trim().replace(/\/+$/, "");
  if (!base || !env.RDM_KEY) return null;
  try {
    const r = await fetch(`${base}/GetDepBoardWithDetails/${from}?numRows=10&filterCrs=${to}&filterType=to&timeWindow=120`,
      { headers: { "x-apikey": env.RDM_KEY }, cf: { cacheTtl: 20, cacheEverything: true }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return C.parseDarwinBoard(await r.json(), from, to, lnow, stripTags);
  } catch (e) { return null; }
}
const shiftPlan = (p, d) => ({ ...p, dep: p.dep + d, leaveBy: p.leaveBy + d });
const shiftState = (s, d) => (s && s.lastLeaveBy != null ? { ...s, lastLeaveBy: s.lastLeaveBy + d } : { ...(s || {}) });

/**
 * One scheduler run (every minute). Returns what was sent, for tests and logs.
 * Per phone: work out the notices and the new state, write the state first, then send. If the write fails nothing is
 * sent (a notice whose "sent" can't be recorded would repeat every minute). One phone's failure never stops the rest.
 * KV is written only when something changed (KV's free tier allows 1,000 writes a day). The write re-reads the record
 * and keeps a plan or wake-up time the page changed meanwhile.
 */
export async function runAlerts(env, now) {
  if (!env.PUSH || !env.VAPID_PRIVATE_KEY) return [];
  const d = londonShift(now), lnow = now + d, sent = [];
  const ids = (await env.PUSH.get("subs", "json")) || [];
  for (const id of ids) {
    try {
      const rec = await env.PUSH.get(`sub:${id}`, "json");
      if (!rec) continue;
      const notices = [], upd = {};
      if (rec.plan) {
        const plan = shiftPlan(rec.plan, d);
        if (C.leaveAlertExpired(plan, lnow)) { upd.plan = null; upd.planState = null; }
        else if (C.leaveAlertWatching(plan, lnow)) {
          const b = await board(env, plan.from, plan.to, lnow);
          const step = C.leaveAlertStep(plan, shiftState(rec.planState, d), b ? C.findPlannedTrain(plan, b) : null, lnow);
          if (step.notice) notices.push(step.notice);
          const state = shiftState(step.state, -d);
          if (step.done) { upd.plan = null; upd.planState = null; }
          else if (JSON.stringify(state) !== JSON.stringify(rec.planState || {})) upd.planState = state;
        }
      }
      if (C.morningDue(rec.morning, lnow, rec.morningLast)) {
        const m = rec.morning, boards = {};
        for (const to of m.to) boards[`${m.from}-${to}`] = await board(env, m.from, to, lnow);
        const notice = C.morningAlert(m, boards, lnow);
        upd.morningLast = C.localMinute(lnow).date;
        if (notice) notices.push(notice);
      }
      if (Object.keys(upd).length) {
        const fresh = await env.PUSH.get(`sub:${id}`, "json");
        if (!fresh) continue;
        const samePlan = !!fresh.plan === !!rec.plan && (!rec.plan || (fresh.plan.followId === rec.plan.followId && fresh.plan.std === rec.plan.std && fresh.planAt === rec.planAt));
        const merged = { ...fresh, ...(upd.morningLast ? { morningLast: upd.morningLast } : {}) };
        if (samePlan && "plan" in upd) { merged.plan = upd.plan; merged.planState = upd.planState; }
        else if (samePlan && "planState" in upd) merged.planState = upd.planState;
        await env.PUSH.put(`sub:${id}`, JSON.stringify(merged));
      }
      for (const notice of notices) {
        const r = await sendPush(rec.sub, notice, vapid(env), now);
        sent.push({ id, notice, status: r.status });
        if (r.gone) {
          await env.PUSH.delete(`sub:${id}`);
          await env.PUSH.put("subs", JSON.stringify(((await env.PUSH.get("subs", "json")) || []).filter(x => x !== id)));
          break;
        }
      }
    } catch (e) { sent.push({ id, error: String(e && e.message || e) }); }
  }
  return sent;
}
