// Flags derived from rules in the profile. Rules only ever add flags; they never hide a train.
import type { BusyRule, Profile, Train } from "./types";
import { hhmm, isoDay } from "./time";

/** A day the busy rule applies: right weekday and not a school holiday. */
export function busyDay(t: number, rule: BusyRule): boolean {
  const d = new Date(t), day = isoDay(t);
  return rule.days.includes(d.getDay()) && !rule.holidays.some(([a, b]) => day >= a && day <= b);
}

/** Fast long-distance trains in the busy window: usually standing room only. */
export function standingRoomOnly(t: Train, rule: BusyRule): boolean {
  if (t.from !== rule.from || t.to !== rule.to || !new RegExp(rule.operator, "i").test(t.operator || "")) return false;
  if (t.arr == null || t.arr - t.dep > rule.maxMins * 60e3) return false;
  if (t.origin && !new RegExp(rule.origins, "i").test(t.origin)) return false;   // only the live source gives the origin
  const a = hhmm(t.arr); if (a < rule.arrFrom || a > rule.arrTo) return false;
  return busyDay(t.arr, rule);
}

/** Slower trains calling at most stations, by journey time per London station. */
export function isStopping(t: Train, profile: Profile): boolean {
  if (t.arr == null || t.dep == null) return false;
  const london = t.from === profile.home ? t.to : t.from;
  const limit = profile.stoppingMin[london]; if (!limit) return false;
  return (t.arr - t.dep) >= limit * 60e3;
}

/** Only trains with known times can be recommended (they are still listed otherwise). */
export const plannable = (t: Train): boolean => !t.cancelled && t.arr != null && t.dep != null && !t.depUnknown && !t.arrUnknown;

// ---------- Train status: red, amber and green mean status only (Sam, 30 Oct) ----------
/** Minutes late at which a train turns amber ("a bit late"; Sam, 30 Oct: from 5), and red ("very late"). */
export const LATE_WARN_MIN = 5;
export const LATE_BAD_MIN = 15;
export type DelayLevel = "ok" | "warn" | "bad";
export interface TrainStatus { level: DelayLevel; text: string; }

/** The band for minutes late (negative = early): green under 5 min, amber 5–14, red 15+. */
export const delayLevel = (lateMin: number): DelayLevel =>
  lateMin >= LATE_BAD_MIN ? "bad" : lateMin >= LATE_WARN_MIN ? "warn" : "ok";

/** A projection within this many minutes of the timetable reads "On time": closer than a projection can tell. */
export const PROJECTION_ON_TIME_MIN = 2;

/**
 * A delay as a word and minutes, coloured by band. `about`: a projection rather than a reported time, so under
 * 2 min either way reads "On time" and the rest is "About N min late / early" (green until 5, as any delay).
 */
export function delayStatus(lateMin: number, about = false): TrainStatus {
  const level = delayLevel(lateMin);
  if (about) return { level, text: Math.abs(lateMin) < PROJECTION_ON_TIME_MIN ? "On time" : lateMin > 0 ? `About ${lateMin} min late` : `About ${-lateMin} min early` };
  return { level, text: lateMin >= 1 ? `${lateMin} min late` : "On time" };
}

/**
 * A train's status from the live feed: cancelled and no estimate are red; otherwise its delay band. Null when the
 * data can't say: a timetable train, or a time worked out from another stop, is never claimed to be on time.
 */
export function trainStatus(t: Train): TrainStatus | null {
  if (t.cancelled) return { level: "bad", text: "Cancelled" };
  if (t.depUnknown || t.arrUnknown) return { level: "bad", text: "No estimate" };
  const late = Math.max(t.depLate || 0, t.arrLate || 0);
  if (late >= 1) return delayStatus(late);
  return t.timetable || t.derived || t.estimated ? null : delayStatus(0);
}

/**
 * The Expected column of a departure board (Sam, 30 Oct): the expected departure time, coloured by band, whenever it
 * differs from the timetable (live data, or TfL's journey planner reporting a delay); otherwise a word. Never "On
 * time" without live data: a timetable train says "Not live", one worked out from another stop "Estimated".
 */
export interface DepartureStatus { level: DelayLevel | "info"; text: string; showTime: boolean; }
export function departureStatus(t: Train): DepartureStatus {
  if (t.cancelled) return { level: "bad", text: "Cancelled", showTime: false };
  if (t.depUnknown) return { level: "bad", text: "No estimate", showTime: false };
  if ((t.depLate || 0) >= 1) return { ...delayStatus(t.depLate), showTime: true };
  if (hhmm(t.dep) !== t.std) return { level: "ok", text: "Early", showTime: true };   // early: feeds clamp depLate to 0
  if (t.timetable) return { level: "info", text: "Not live", showTime: false };
  if (t.derived || t.estimated) return { level: "info", text: "Estimated", showTime: false };
  return { ...delayStatus(0), showTime: false };
}

/** Status of an expected arrival against the timetable (both ms), as a projection: "On time" / "About N min late". */
export const arrivalStatus = (expected: number, scheduled: number): TrainStatus =>
  delayStatus(Math.round((expected - scheduled) / 60e3), true);
