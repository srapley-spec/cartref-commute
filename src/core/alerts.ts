// Time-to-leave and wake-up alerts (docs/stories/time-to-leave-alerts.md).
// Pure: the page builds a plan from the followed journey; the proxy's scheduler (proxy/push.js) feeds live boards
// in and sends whatever notice comes out. No clock reads, no network, no places: stations and names are data.
import type { Board, Train, DisruptionConfig } from "./types";
import type { FollowRoute } from "./follow";
import { hhmm, mins, pad } from "./time";
import { resolveDisruptionPolicy } from "./disruption";

/** First alert this long before Leave by ("Leave in 5 min"). */
export const LEAVE_ALERT_SOON_MS = 5 * 60e3;
/** After the first alert, a Leave by that moves by this much (either way) is alerted again. */
export const LEAVE_ALERT_CHANGE_MS = 2 * 60e3;
/** The proxy starts checking the followed train this long before Leave by (catches an early cancellation). */
export const LEAVE_ALERT_WATCH_MS = 60 * 60e3;
/** A first alert is still sent this long after Leave by (a late scheduler run); after that the plan ends. */
export const LEAVE_ALERT_GRACE_MS = 60e3;
/** The wake-up check covers trains leaving within this many minutes of it. */
export const MORNING_WINDOW_MIN = 120;
/** A wake-up check missed by the scheduler is still sent up to this long after its time, never later. */
export const MORNING_LATE_MS = 10 * 60e3;

export interface LeaveAlertPlan {
  v: 1;
  /** The followed route's id: a new Follow is a new plan. */
  followId: string;
  serviceId?: string;
  from: string; to: string; std: string; operator?: string;
  /** Expected departure and Leave by when the plan was made; leadMs = dep − leaveBy (the route's own access time). */
  dep: number; leaveBy: number; leadMs: number;
  /** "the 18:48 from King's Cross" */
  train: string;
}
export interface LeaveAlertState { soonSent?: boolean; lastLeaveBy?: number; cancelledSent?: boolean; unknownSent?: boolean; }
export interface PushNotice { kind: "soon" | "changed" | "cancelled" | "unknown" | "morning"; title: string; body: string; tag: string; }

/**
 * The plan the proxy watches for a followed journey: only before the train (once you're on it there's nothing to
 * leave for), only with a Leave by and a train. `names` gives station names (profile data).
 */
export function leaveAlertPlan(route: FollowRoute | null | undefined, names: Record<string, string>): LeaveAlertPlan | null {
  if (!route || route.phase !== "before-train" || route.incident) return null;
  const o = route.option, t = o && o.train;
  if (!t || !Number.isFinite(t.dep) || t.cancelled) return null;
  const leaveBy = Number.isFinite(o.leaveBy) ? (o.leaveBy as number) : o.leave;
  if (!Number.isFinite(leaveBy) || leaveBy > t.dep) return null;
  const now = route.lastTrain && Number.isFinite(route.lastTrain.dep) && !route.lastTrain.cancelled && !route.lastTrain.depUnknown ? route.lastTrain : t;
  const leadMs = t.dep - leaveBy;
  return { v: 1, followId: route.id, serviceId: t.serviceId, from: t.from, to: t.to, std: t.std, operator: t.operator || undefined,
    dep: now.dep, leaveBy: now.dep - leadMs, leadMs, train: `the ${t.std} from ${names[t.from] || t.from}` };
}

/** The plan's train on a fresh board: by service ID, else the same scheduled time and operator. */
export function findPlannedTrain(plan: LeaveAlertPlan, board: Board | null | undefined): Train | null {
  const svcs = (board && board.services) || [];
  return (plan.serviceId && svcs.find(s => s.serviceId === plan.serviceId)) ||
    svcs.find(s => s.std === plan.std && (!plan.operator || s.operator === plan.operator)) || null;
}

/** A plan is dropped this long after its train's planned departure, whatever happened (bounds a long delay). */
export const LEAVE_ALERT_MAX_MS = 3 * 3600e3;
/** Whether the proxy should look at this plan now (and fetch its board). It keeps looking after the planned Leave by,
 *  because a delayed train moves Leave by later; `leaveAlertStep` says when it's done. */
export const leaveAlertWatching = (plan: LeaveAlertPlan, now: number): boolean =>
  now >= plan.leaveBy - LEAVE_ALERT_WATCH_MS && !leaveAlertExpired(plan, now);
export const leaveAlertExpired = (plan: LeaveAlertPlan, now: number): boolean => now > plan.dep + LEAVE_ALERT_MAX_MS;

const lateText = (t: Train) => (t.depLate >= 1 ? `${t.depLate} min late` : "on time");

/**
 * One scheduler step for a plan. `observed` is the plan's train on a fresh board (null: not found or no board).
 * Returns at most one notice, the new state, and whether the plan is finished.
 */
export function leaveAlertStep(plan: LeaveAlertPlan, state: LeaveAlertState, observed: Train | null | undefined, now: number):
  { notice: PushNotice | null; state: LeaveAlertState; done: boolean } {
  const s: LeaveAlertState = { ...state };
  const tag = `leave-${plan.followId}`;
  if (observed && observed.cancelled) {
    if (s.cancelledSent) return { notice: null, state: s, done: true };
    s.cancelledSent = true;
    return { notice: { kind: "cancelled", tag, title: `${plan.std} cancelled`, body: `${cap(plan.train)} is cancelled. Open the app for another train.` }, state: s, done: true };
  }
  const live = observed && !observed.depUnknown && Number.isFinite(observed.dep) ? observed : null;
  const leaveBy = (live ? live.dep : plan.dep) - plan.leadMs;
  const left = leaveBy - now;
  if (now > leaveBy + LEAVE_ALERT_GRACE_MS) return { notice: null, state: s, done: true };
  const status = live ? ` (${lateText(live)})` : observed ? " (delayed, no estimate)" : " (no live times: timetable)";
  if (!s.soonSent) {
    if (left > LEAVE_ALERT_SOON_MS) return { notice: null, state: s, done: false };
    s.soonSent = true; s.lastLeaveBy = leaveBy; if (observed && observed.depUnknown) s.unknownSent = true;
    const m = Math.max(0, mins(left));
    return { notice: { kind: "soon", tag, title: m > 0 ? `Leave in ${m} min · by ${hhmm(leaveBy)}` : `Leave now · by ${hhmm(leaveBy)}`,
      body: `For ${plan.train}${status}.` }, state: s, done: false };
  }
  if (observed && observed.depUnknown && !s.unknownSent) {
    s.unknownSent = true;
    return { notice: { kind: "unknown", tag, title: `${plan.std} delayed`, body: `${cap(plan.train)} is delayed with no estimate. Open the app before you go.` }, state: s, done: false };
  }
  if (s.lastLeaveBy != null && Math.abs(leaveBy - s.lastLeaveBy) >= LEAVE_ALERT_CHANGE_MS) {
    const earlier = leaveBy < s.lastLeaveBy;
    s.lastLeaveBy = leaveBy;
    return { notice: { kind: "changed", tag, title: `${earlier ? "Leave earlier" : "Leave later"} · by ${hhmm(leaveBy)}`,
      body: `${cap(plan.train)} is now expected ${hhmm(live ? live.dep : plan.dep)}${status}.` }, state: s, done: false };
  }
  return { notice: null, state: s, done: false };
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export interface MorningConfig {
  /** Boarding station and the stations you go to (profile data). */
  from: string; to: string[];
  /** "HH:MM", local (London) time. */
  time: string;
  /** Days it runs, 0 = Sunday … 6 = Saturday. */
  days: number[];
  names: Record<string, string>;
}
/** "HH:MM" and day of `now` (local time). */
export const localMinute = (now: number) => ({ hm: hhmm(now), day: new Date(now).getDay(), date: isoLocal(now) });
const isoLocal = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Whether the wake-up check runs in this minute (and hasn't already run today). */
export function morningDue(cfg: MorningConfig | null | undefined, now: number, lastDate?: string | null): boolean {
  if (!cfg || !/^\d\d:\d\d$/.test(cfg.time) || !Array.isArray(cfg.days)) return false;
  const l = localMinute(now);
  const since = now - minuteOf(now, cfg.time);
  return cfg.days.includes(l.day) && l.date !== lastDate && since >= 0 && since < MORNING_LATE_MS;
}
const minuteOf = (now: number, hm: string) => { const d = new Date(now); d.setHours(+hm.slice(0, 2), +hm.slice(3, 5), 0, 0); return d.getTime(); };

/**
 * The wake-up warning: trains from `from` to any of `to` leaving within the window that are cancelled, delayed with
 * no estimate, or late by the app's own amber threshold (5 min). Null when nothing is wrong: no news, no alert.
 * The same train on two boards (a Thameslink to Farringdon and St Pancras) is said once. When no board could be
 * read at all, it says so: silence must mean "nothing wrong", never "couldn't look".
 */
export function morningAlert(cfg: MorningConfig, boards: Record<string, Board | null | undefined>, now: number, policy?: DisruptionConfig): PushNotice | null {
  const warn = resolveDisruptionPolicy(policy).rail.warnMin;
  if (cfg.to.every(to => !boards[`${cfg.from}-${to}`])) return { kind: "morning", tag: `morning-${localMinute(now).date}`,
    title: "Couldn't check your morning trains", body: "The live National Rail feed didn't answer. Check the app before you go." };
  const seen = new Set<string>(), hit: string[] = [];
  const trains = cfg.to.flatMap(to => ((boards[`${cfg.from}-${to}`] || { services: [] }).services || []).map(t => ({ t, to })))
    .filter(x => x.t.dep >= now && x.t.dep <= now + MORNING_WINDOW_MIN * 60e3).sort((a, b) => a.t.dep - b.t.dep);
  for (const { t, to } of trains) {
    const id = t.serviceId || `${t.std}|${t.operator}`;
    const name = cfg.names[to] || to, late = Math.max(t.depLate || 0, t.arrLate || 0);
    const what = t.cancelled ? "cancelled" : t.depUnknown || t.arrUnknown ? "delayed, no estimate" : late >= warn ? `${late} min late` : null;
    if (seen.has(id)) continue;
    seen.add(id);
    if (what) hit.push(`${t.std} to ${name} ${what}`);
  }
  if (!hit.length) return null;
  const shown = hit.slice(0, 4), more = hit.length - shown.length;
  return { kind: "morning", tag: `morning-${localMinute(now).date}`, title: `Commute: ${hit.length} train${hit.length > 1 ? "s" : ""} disrupted`,
    body: shown.join("; ") + (more > 0 ? `; and ${more} more` : "") + "." };
}
