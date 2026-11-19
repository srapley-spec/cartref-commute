// Commute watch (#66; docs/stories/commute-watch.md): on weekdays, 05:00–10:00 towards the office and from 15:00
// until you're home (01:00 at the latest), the proxy reads the live boards for the commute (and the tube lines to the office) every 2 minutes, and an
// iPhone with the watch turned on hears about it only when it turns amber or red (core watchVerdict/watchStep). No
// board is fetched when no iPhone has the watch on, or outside the windows. What to say comes from the engine.
import * as C from "../dist/core.mjs";
import { londonShift, board } from "./push.js";
import { nativeConfigured, sendApns, apnsPayloads } from "./native.js";

/** Checked every this many minutes inside a window (3 boards + 1 TfL status per check). */
export const WATCH_EVERY_MIN = 2;
/** The stations on the way, and the line on beyond Letchworth that its trains come from (Cambridge). */
export const WATCH_CORRIDOR = `${C.profiles.samCommute.corridorPattern}|ashwell|royston|cambridge`;
const PAIRS = { office: [["LET", "KGX"], ["LET", "ZFD"], ["LET", "STP"]], home: [["KGX", "LET"], ["ZFD", "LET"], ["STP", "LET"]] };

export async function tubeStatus(env) {
  try {
    const q = env.TFL_KEY ? `?app_key=${encodeURIComponent(env.TFL_KEY)}` : "";
    const r = await fetch(`https://api.tfl.gov.uk/Line/${C.WATCH_TUBE_LINES.join(",")}/Status${q}`, { cf: { cacheTtl: 60, cacheEverything: true }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return (await r.json()).map(l => ({ id: l.id, name: l.name, statuses: (l.lineStatuses || []).map(s => ({ sev: s.statusSeverity, desc: s.statusSeverityDescription, reason: s.reason || "" })) }));
  } catch (e) { return null; }
}

/** One scheduler run. Returns what was sent, for tests and logs. */
export async function runWatch(env, now) {
  if (!nativeConfigured(env)) return [];
  const d = londonShift(now), lnow = now + d;
  const w = C.watchWindow(lnow);
  if (!w || Math.floor(lnow / 60e3) % WATCH_EVERY_MIN !== 0) return [];
  const ids = (await env.PUSH.get("nats", "json")) || [];
  const recs = [];
  for (const id of ids) {
    const rec = await env.PUSH.get(`nat:${id}`, "json");
    // Home already since the afternoon window started: nothing more to watch tonight (#66).
    if (rec && rec.prefs && rec.prefs.watch && rec.apns && !C.watchHomeDone({ ...w, from: w.from - d }, rec.homeAt, rec.leftAt)) recs.push(rec);
  }
  if (!recs.length) return [];
  const boards = {};
  for (const [from, to] of PAIRS[w.direction]) boards[`${from}-${to}`] = await board(env, from, to, lnow);
  const verdict = C.watchVerdict(w.direction, boards, await tubeStatus(env), lnow, undefined, WATCH_CORRIDOR);
  const sent = [];
  for (const rec of recs) {
    try {
      const step = C.watchStep(rec.watchState, w, verdict, lnow);
      if (JSON.stringify(step.state) !== JSON.stringify(rec.watchState || null)) {
        const fresh = await env.PUSH.get(`nat:${rec.id}`, "json");
        if (!fresh) continue;
        await env.PUSH.put(`nat:${rec.id}`, JSON.stringify({ ...fresh, watchState: step.state }));
      }
      if (step.notice) {
        const r = await sendApns(env, rec.apns, "alert", apnsPayloads.alert(step.notice), now);
        sent.push({ id: rec.id, level: verdict.level, notice: step.notice, status: r.status });
      }
    } catch (e) { sent.push({ id: rec.id, error: String(e && e.message || e) }); }
  }
  return sent;
}
