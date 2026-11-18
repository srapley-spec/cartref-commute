// The journey snapshot (docs/ios-app.md §6.1): what a native surface (the iPhone app's Live Activity, its leave alarm,
// Siri) shows for a followed journey, built by the engine so no journey logic lives in Swift. The page builds one from
// what its journey card shows; the proxy builds one from the followed plan while the app is closed. Pure: no clock, no
// DOM, no network. Times are epoch ms; text is final.
import type { LeaveAlertPlan, LeaveAlertState } from "./alerts";
import type { Train } from "./types";
import { trainStatus, delayStatus } from "./rules";
import { platformBy } from "./follow";
import type { Option } from "./types";
import type { FollowTrip } from "./trip/followTrip";

export const SNAPSHOT_VERSION = 1;
/** Data older than this is marked stale (the same 3 minutes as the status line's "may be out of date"). */
export const SNAPSHOT_STALE_MS = 3 * 60e3;
/** Fresh data is re-sent at least this often (inside the 3-min stale window). */
export const SNAPSHOT_REFRESH_MS = 2 * 60e3;
/** A leave alarm is dropped this long after its leave time had passed with no sign you left. */
export const LEAVE_ALARM_GRACE_MS = 2 * 60e3;
/** The leave alarm's default lead (Sam, 17 Nov: "5 mins default but configurable"). */
export const LEAVE_ALARM_DEFAULT_MIN = 5;

/** The words each left time counts down in (Sam, 12 Nov), shared by the page's card and native surfaces. */
export const COUNTDOWN_WORDS: Record<string, { calm: string; urgent: string; passed: string }> = {
  leave: { calm: "leave in", urgent: "Leave now", passed: "leave time passed" },
  platform: { calm: "on the platform in", urgent: "Head for the platform now", passed: "platform time passed" },
  arrive: { calm: "arrives in", urgent: "Arriving", passed: "" },
  next: { calm: "in", urgent: "Now", passed: "" },
};

export type SnapshotPhase = "leave" | "walk" | "platform" | "train" | "tube" | "walk-last" | "arrived" | "missed" | "cancelled";
export type SnapshotStep = "leave" | "platform" | "arrive" | "next" | "";

export interface LeaveAlarm { at: number; leadMin: number; cancelled: boolean;
  /** The geofence whose exit cancels this alarm on the phone with no network (§6.7 rule 3): where the journey starts. */
  cancelOnExit?: "home" | "office" | null }
export interface JourneySnapshot {
  v: 1; at: number; source: "page" | "proxy";
  dataAt: number | null; stale: boolean;
  /** When the data becomes stale (dataAt + 3 min): the Live Activity's stale-date (§6.7 rule 5). */
  staleAt: number | null;
  /** Boarding confirmed by the page's boarding check; the proxy never confirms (§6.7 rule 4). */
  confirmed: boolean;
  mode: string; direction: "office" | "home" | null; followId: string | null;
  phase: SnapshotPhase;
  headline: { label: string; t: number | null; countdown: { step: SnapshotStep; calm: string; urgent: string; passed: string } | null };
  arrive: { label: string; t: number | null } | null;
  train: { name: string; from: string; to: string; platform: string | null; scheduled: number | null; expected: number | null; late: number } | null;
  progress: { next: string | null; stopsToGo: number | null; line: string } | null;
  status: { level: "ok" | "info" | "warn" | "bad"; text: string } | null;
  alarm: LeaveAlarm | null;
  deepLink: string | null;
}

export interface SnapshotInput {
  now: number; source: "page" | "proxy"; dataAt?: number | null;
  mode: string; direction: "office" | "home" | null; followId?: string | null;
  phase: SnapshotPhase;
  headline: { label: string; t: number | null | undefined; step: SnapshotStep };
  arrive?: { label: string; t: number | null | undefined } | null;
  train?: JourneySnapshot["train"];
  progress?: { next?: string | null; stopsToGo?: number | null; line?: string } | null;
  status?: JourneySnapshot["status"];
  alarm?: LeaveAlarm | null;
  confirmed?: boolean;
}

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** "Be on platform 4 at Farringdon by"; "Be on the platform at Farringdon by" before it's announced (17 Nov). */
export function platformLabelText(platform: string | null | undefined, station: string | null | undefined): string {
  return `Be on ${platform ? `platform ${platform}` : "the platform"}${station ? ` at ${station}` : ""} by`;
}

/**
 * The leave alarm a shell should have scheduled: `leadMin` before leave time; cancelled once you've set off (or left
 * the place you start from). None when it's off, when there's no leave time, or when the leave time passed more than
 * LEAVE_ALARM_GRACE_MS ago without you leaving.
 */
export function leaveAlarm(leaveAt: number | null | undefined, opts: { enabled: boolean; leadMin?: number; setOff: boolean; now: number; startPlace?: string | null }): LeaveAlarm | null {
  if (!opts.enabled || !fin(leaveAt)) return null;
  const leadMin = fin(opts.leadMin) && opts.leadMin >= 0 && opts.leadMin <= 60 ? Math.round(opts.leadMin) : LEAVE_ALARM_DEFAULT_MIN;
  const at = leaveAt - leadMin * 60e3;
  const cancelOnExit = opts.startPlace === "home" || opts.startPlace === "office" ? opts.startPlace : null;
  if (opts.setOff) return { at, leadMin, cancelled: true, cancelOnExit };
  if (opts.now > leaveAt + LEAVE_ALARM_GRACE_MS) return null;
  return { at, leadMin, cancelled: false, cancelOnExit };
}

/** The snapshot itself: checked, with the countdown words, stale marking and deep link filled in. */
export function journeySnapshot(i: SnapshotInput): JourneySnapshot {
  const dataAt = fin(i.dataAt) ? i.dataAt : null;
  const words = i.headline.step ? COUNTDOWN_WORDS[i.headline.step] : null;
  const progress = i.progress && (i.progress.next || fin(i.progress.stopsToGo) || i.progress.line)
    ? { next: i.progress.next || null, stopsToGo: fin(i.progress.stopsToGo) ? i.progress.stopsToGo : null,
        line: i.progress.line || [i.progress.next ? `Next: ${i.progress.next}` : "", fin(i.progress.stopsToGo) ? `${i.progress.stopsToGo} stop${i.progress.stopsToGo === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") }
    : null;
  return {
    v: SNAPSHOT_VERSION, at: i.now, source: i.source,
    dataAt, stale: dataAt == null || i.now - dataAt > SNAPSHOT_STALE_MS, staleAt: dataAt == null ? null : dataAt + SNAPSHOT_STALE_MS,
    confirmed: i.source === "page" && !!i.confirmed,
    mode: i.mode, direction: i.direction, followId: i.followId || null,
    phase: i.phase,
    headline: { label: i.headline.label, t: fin(i.headline.t) ? i.headline.t : null, countdown: words ? { step: i.headline.step, ...words } : null },
    arrive: i.arrive ? { label: i.arrive.label, t: fin(i.arrive.t) ? i.arrive.t : null } : null,
    train: i.train || null,
    progress,
    status: i.status || null,
    alarm: i.alarm || null,
    deepLink: i.followId ? `commute://follow/${encodeURIComponent(i.followId)}` : null,
  };
}

/** What the proxy knows about a followed journey beyond the alert plan (sent with it by the page; all optional). */
export interface NativePlanExtra {
  mode?: string; direction?: "office" | "home";
  /** The station names for the label ("Farringdon"). */
  fromName?: string; toName?: string;
  /** The route's catch margin before the train (ms): the platform time is the timetable departure less this. */
  marginMs?: number;
  /** Door arrival = the train's arrival at `to` + this (the legs after the train). */
  afterMs?: number;
  /** "At home" / "At office". */
  arriveLabel?: string;
  /** Where the journey starts ("home", "office", or a station's CRS): its geofence exit is set off. */
  startPlace?: string;
}

/**
 * The proxy's snapshot of a followed journey while the app is closed: leave (or, once the app said you'd set off, the
 * platform) before the train; on the train, the arrival at the alighting station. Uses the same rules as the page:
 * a late train's platform time is its timetable time less the margin; an alarm cancelled once you've set off.
 */
export function proxySnapshot(plan: LeaveAlertPlan & NativePlanExtra, state: NativeState, observed: Train | null | undefined,
  opts: { now: number; dataAt: number | null; setOff: boolean; alarm: { enabled: boolean; leadMin?: number } }): JourneySnapshot {
  const now = opts.now;
  const live = observed && !observed.depUnknown && fin(observed.dep) ? observed : null;
  const dep = live ? live.dep : fin(state.lastDep) ? (state.lastDep as number) : plan.dep;
  const late = live ? live.depLate || 0 : state.lastLate || 0;
  const scheduled = dep - late * 60e3;
  const leaveBy = dep - plan.leadMs;
  const margin = fin(plan.marginMs) && plan.marginMs >= 0 ? plan.marginMs : 0;
  // The page's own rule (core platformBy): a late train's platform time is its timetable time less the margin.
  const platformAt = platformBy({ before: [{ kind: "margin", secs: margin / 1000 }] } as unknown as Option, dep, now, scheduled);
  // Once the train has left the board, the last arrival and platform seen stand.
  const arr = live && fin(live.arr) ? live.arr : fin(state.lastArr) ? (state.lastArr as number) : null;
  const platform = (observed && observed.platform) || state.lastPlatform || null;
  const doorArrive = arr != null && fin(plan.afterMs) ? arr + (plan.afterMs as number) : null;
  // The page's own status words (core trainStatus): "Cancelled", "No estimate", "7 min late", "On time".
  const status = observed ? trainStatus(observed) || (late >= 1 ? delayStatus(late) : null) : fin(state.lastDep) ? { ...delayStatus(late), text: `${delayStatus(late).text}, last known` } : { level: "info" as const, text: "No live times" };
  const base = { now, source: "proxy" as const, dataAt: opts.dataAt, mode: plan.mode || "commute", direction: plan.direction || (plan.mode === "trip" ? null : "home"), followId: plan.followId,
    train: { name: `${plan.std} ${plan.operator || "train"}`, from: plan.fromName || plan.from, to: plan.toName || plan.to, platform, scheduled, expected: live ? dep : null, late },
    status };
  if (observed && observed.cancelled) return journeySnapshot({ ...base, phase: "cancelled", headline: { label: "Cancelled", t: null, step: "" }, arrive: null, alarm: null });
  const arriveOut = { label: plan.arriveLabel || (plan.direction === "office" ? "At office" : "At home"), t: doorArrive };
  if (arr != null && now >= arr) return journeySnapshot({ ...base, phase: "walk-last", headline: { label: arriveOut.label, t: doorArrive, step: "arrive" }, arrive: arriveOut, alarm: null });
  if (now >= dep) return journeySnapshot({ ...base, phase: "train", headline: { label: `At ${plan.toName || plan.to}`, t: arr, step: "arrive" }, arrive: arriveOut, alarm: null });
  const alarm = leaveAlarm(leaveBy, { enabled: opts.alarm.enabled, leadMin: opts.alarm.leadMin, setOff: opts.setOff, now, startPlace: plan.startPlace });
  if (opts.setOff) return journeySnapshot({ ...base, phase: "platform", headline: { label: platformLabelText(platform, plan.fromName || plan.from), t: platformAt, step: "platform" }, arrive: arriveOut, alarm });
  return journeySnapshot({ ...base, phase: "leave", headline: { label: "Leave by", t: leaveBy, step: "leave" }, arrive: arriveOut, alarm });
}
/** What the proxy keeps between runs for a followed journey: the leave alerts' state, plus the last arrival and platform. */
export type NativeState = LeaveAlertState & { lastArr?: number; lastPlatform?: string };
/** Every instant in a snapshot moved by `d` ms (the proxy runs the engine in London time and stores real time). */
export function shiftSnapshot(s: JourneySnapshot, d: number): JourneySnapshot {
  const m = (t: number | null) => (t == null ? t : t + d);
  return { ...s, at: s.at + d, dataAt: m(s.dataAt), staleAt: m(s.staleAt), headline: { ...s.headline, t: m(s.headline.t) }, arrive: s.arrive && { ...s.arrive, t: m(s.arrive.t) },
    train: s.train && { ...s.train, scheduled: m(s.train.scheduled), expected: m(s.train.expected) }, alarm: s.alarm && { ...s.alarm, at: s.alarm.at + d } };
}
/** The parts of a snapshot a native surface shows: a change in any of them is worth a push; a new `at` alone isn't. */
export function snapshotShown(s: JourneySnapshot | null | undefined): string {
  if (!s) return "none";
  // A fresh fetch every 2 minutes counts too, so the stale-date (data + 3 min) is moved on before it passes while the
  // data is fresh (review 18 Nov: otherwise the Live Activity showed stale on a steady board).
  return JSON.stringify([s.followId, s.phase, s.confirmed, s.progress && s.progress.line, s.dataAt == null ? null : Math.floor(s.dataAt / SNAPSHOT_REFRESH_MS), s.headline.label, s.headline.t, s.arrive && s.arrive.t, s.train && [s.train.platform, s.train.expected, s.train.late],
    s.status && s.status.text, s.alarm && [s.alarm.at, s.alarm.cancelled], s.stale]);
}

/**
 * What the iPhone app reports about where you are (docs/ios-app.md §6.2): a geofence crossed, or the Wi-Fi network
 * it's on, classified by the shell from the prefixes in Settings (the name itself is never passed).
 */
export interface NativeEvidence { kind: "region" | "wifi"; place: string; event?: "exit" | "enter"; at: number }
/** Evidence is ignored if it claims to be from more than this far in the future (clock skew), or is older than the journey. */
export const EVIDENCE_SKEW_MS = 60e3;
/** How close a Wi-Fi network puts you to its place: about the reach of a home router. */
export const WIFI_ACCURACY_M = 50;

/**
 * Leaving the place you started from (its geofence) is set off: the leave alarm is cancelled, the card moves to the
 * platform. Losing home Wi-Fi alone is not (design decision, 17 Nov, docs/ios-app.md §6.2; for Sam to confirm: a router restart or a
 * phone dropping Wi-Fi would cancel the alarm you still need). `startedAt` is when following began.
 */
export function evidenceSetOff(ev: NativeEvidence | null | undefined, startPlace: string | null | undefined, startedAt: number, now: number): boolean {
  if (!ev || !startPlace || !fin(ev.at)) return false;
  return ev.kind === "region" && ev.event === "exit" && ev.place === startPlace && ev.at >= startedAt - EVIDENCE_SKEW_MS && ev.at <= now + EVIDENCE_SKEW_MS;
}
/**
 * Being on a known Wi-Fi network, or entering a geofence, is a position: a fix at that place, with the network's (or
 * the fence's) reach as its accuracy and the event's time as its age, so the page's usual fix rules apply to it.
 * Leaving a network or a fence says where you aren't, not where you are: no fix. `places` are lat/lon pairs by id
 * ("home", "office", or a station's CRS); `radiusM` the geofence radius.
 */
export function evidenceFix(ev: NativeEvidence | null | undefined, places: Record<string, [number, number] | undefined>, now: number, radiusM = 150):
  { lat: number; lon: number; acc: number; at: number } | null {
  if (!ev || !fin(ev.at) || ev.at > now + EVIDENCE_SKEW_MS) return null;
  const p = places[ev.place];
  if (!p || !fin(p[0]) || !fin(p[1])) return null;
  if (ev.kind === "wifi" && (ev.place === "home" || ev.place === "office")) return { lat: p[0], lon: p[1], acc: WIFI_ACCURACY_M, at: Math.min(ev.at, now) };
  if (ev.kind === "region" && ev.event === "enter") return { lat: p[0], lon: p[1], acc: Math.max(50, Math.round(radiusM)), at: Math.min(ev.at, now) };
  return null;
}

/**
 * Trip's plan for the proxy (§6.7 rule 4, Sam: Trip in v1): the first timetabled ride of a followed Trip, in the same
 * shape as the commute's leave-alert plan, plus the snapshot extras. None once that ride has gone or is cancelled.
 * `std` is the ride's scheduled departure as the board shows it ("18:56").
 */
export function tripNativePlan(route: FollowTrip | null | undefined, std: (t: number) => string): { plan: LeaveAlertPlan; extra: NativePlanExtra } | null {
  const j = route && route.journey;
  if (!j || !Array.isArray(j.rides)) return null;
  const ride = j.rides.find(r => r.kind === "rail");
  // The proxy watches rail boards only. A Trip starting with a tube still gets its train watched, but the platform
  // allowance and the start fence belong to the first ride, so they're left out (review 18 Nov).
  const first = !!ride && j.rides[0] === ride;
  if (!ride || ride.cancelled || !fin(ride.dep) || !fin(j.leave) || j.leave > ride.dep) return null;
  const t = ride.train;
  const s = (t && t.std) || std(fin(ride.schedDep) ? ride.schedDep : ride.dep);
  // Trip's time to reach the platform is its last "station" segment (the same allowance Trip's card uses).
  const before = Array.isArray(j.before) ? (j.before as { kind?: string; secs?: number }[]) : [];
  const plat = [...before].reverse().find(x => x.kind === "station");
  const after = j.rides.slice(j.rides.indexOf(ride) + 1);
  return {
    plan: { v: 1, followId: route!.id, serviceId: t && t.serviceId, from: ride.from.crs, to: ride.to.crs, std: s, operator: ride.operator || (t && t.operator) || undefined,
      dep: ride.dep, leaveBy: j.leave, leadMs: ride.dep - j.leave, train: `the ${s} from ${ride.from.name}` },
    extra: { mode: "trip", fromName: ride.from.name, toName: ride.to.name,
      marginMs: first && plat && fin(plat.secs) ? (plat.secs as number) * 1000 : 0,
      // With more rides after this one, the door arrival isn't this ride's arrival plus a fixed walk: leave it unknown.
      afterMs: after.length === 0 && fin(j.arrive) && fin(ride.arr) ? Math.max(0, j.arrive - ride.arr) : undefined,
      arriveLabel: `At ${(j.to && (j.to as { name?: string }).name) || j.toStation.name}`, ...(first ? { startPlace: ride.from.crs } : {}) },
  };
}
