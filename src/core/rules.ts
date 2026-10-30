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
/** How late a train is, as status (Sam, 30 Oct): green under 5 min, amber 5–14, red 15+. Same bands everywhere. */
export const LATE_AMBER_MIN = 5;
export const LATE_RED_MIN = 15;
export const lateLevel = (min: number): "ok" | "warn" | "bad" => (min >= LATE_RED_MIN ? "bad" : min >= LATE_AMBER_MIN ? "warn" : "ok");

/** A train's departure status: a word with minutes, and its band. Timetable trains say so: their delay isn't known. */
export interface DepartureStatus { level: "ok" | "warn" | "bad" | "info"; word: string; late: number; }
export function departureStatus(t: Pick<Train, "cancelled" | "depUnknown" | "depLate" | "timetable">): DepartureStatus {
  if (t.cancelled) return { level: "bad", word: "Cancelled", late: 0 };
  if (t.depUnknown) return { level: "bad", word: "No estimate", late: 0 };
  if (t.timetable) return { level: "info", word: "Not live", late: 0 };
  const late = Math.max(0, Math.round(t.depLate || 0));
  return { level: lateLevel(late), word: late >= 1 ? `${late} min late` : "On time", late };
}

export const plannable = (t: Train): boolean => !t.cancelled && t.arr != null && t.dep != null && !t.depUnknown && !t.arrUnknown;
