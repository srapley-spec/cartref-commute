// Journeys: getting to the station → the train → getting from the station.
// A route is described once, as segments with durations; every time on screen is computed from it.
import type { Board, Flag, Option, Profile, StationCode, Train } from "./types";
import { dur, hhmm } from "./time";
import { standingRoomOnly, isStopping } from "./rules";

/** A step shown in "Journey steps", at the start or end of a segment. */
export interface Step { at: "start" | "end"; d: string; note?: string; tube?: boolean; }
export type SegmentKind = "walk" | "station" | "margin" | "change" | "wait" | "ride" | "stop" | "planned";
/** Part of getting to or from the train. `secs` is final (pace already applied). */
export interface Segment { kind: SegmentKind; secs: number; step?: Step | null; }

export interface Route {
  hub: StationCode;            // the station that identifies the route (e.g. King's Cross)
  board: string;               // which trains: board key, e.g. "LET-KGX"
  fromName: string;            // where the train leaves from, in sentences
  before: Segment[];           // from where you are to standing on the platform
  after: Segment[];            // from stepping off the train to where you're going
  arriveLabel: string;         // e.g. "Arrive King's Cross"
  arriveExtra?: string;        // appended to "N min on the train", e.g. ", change 5 min"
  depNotePrefix?: string;      // e.g. "allow 6 min to reach the platform"
  noPlatform?: string;         // shown when no platform is known
  extra?: Record<string, unknown>;   // carried onto each option (screen-specific data)
}

export interface Leg { t: number; d: string; note?: string; tube?: boolean; train?: boolean; }

const total = (segs: Segment[]): number => segs.reduce((s, x) => s + x.secs, 0) * 1000;
/** Time from leaving to standing on the platform (ms). */
export const timeToTrain = (r: Route): number => total(r.before);
/** Time from stepping off the train to arriving (ms). */
export const timeFromTrain = (r: Route): number => total(r.after);
/** Shortest time to the platform if nothing has to be waited for (ms): skips "wait" segments. */
export const minTimeToTrain = (r: Route): number => total(r.before.filter(s => s.kind !== "wait"));

/** Flags that come from the train itself. Flags never hide a train. */
export function trainFlags(t: Train, profile: Profile): Flag[] {
  const f: Flag[] = [];
  if (t.cancelled) f.push({ lvl: "bad", txt: "Cancelled" });
  if (standingRoomOnly(t, profile.busy)) f.push({ lvl: "bad", txt: "Usually standing room only" });
  if (isStopping(t, profile)) f.push({ lvl: "warn", txt: "Stopping train" });
  if (t.depUnknown || t.arrUnknown) f.push({ lvl: "bad", txt: "Delayed, no estimate: times unknown" });
  else if (t.depLate >= 1 || t.arrLate >= 1) f.push({ lvl: t.arrLate >= 10 || t.depLate >= 10 ? "bad" : "warn", txt: `+${Math.max(t.depLate, t.arrLate)} min` });
  if (t.reason) f.push({ lvl: "warn", txt: t.reason, long: true });
  return f;
}

function walkSteps(segs: Segment[], from: number, legs: Leg[]): number {
  let cur = from;
  for (const s of segs) {
    if (s.step && s.step.at === "start") legs.push({ t: cur, d: s.step.d, note: s.step.note, tube: s.step.tube });
    cur += s.secs * 1000;
    if (s.step && s.step.at === "end") legs.push({ t: cur, d: s.step.d, note: s.step.note, tube: s.step.tube });
  }
  return cur;
}

/** Every train on every route, as a door-to-door option. Trains without a time at either end are skipped. */
export function buildOptions(routes: Route[], boards: Record<string, Board | undefined>, profile: Profile): Option[] {
  const out: Option[] = [];
  for (const r of routes) {
    const b = boards[r.board]; if (!b) continue;
    for (const t of b.services) {
      if (t.arr == null || t.dep == null) continue;
      const leave = t.dep - timeToTrain(r), arrive = t.arr + timeFromTrain(r);
      const legs: Leg[] = [];
      walkSteps(r.before, leave, legs);
      const depNote = [r.depNotePrefix || "", t.platform ? `platform ${t.platform}` : (r.noPlatform || "")].filter(Boolean).join(", ");
      legs.push({ t: t.dep, d: `${t.std}${t.depLate ? ` (exp ${hhmm(t.dep)})` : ""} ${t.operator || "train"} from ${r.fromName}`, note: depNote, train: true });
      legs.push({ t: t.arr, d: r.arriveLabel, note: `${dur(t.arr - t.dep)} on the train${r.arriveExtra || ""}` });
      walkSteps(r.after, t.arr, legs);
      out.push({ ...(r.extra || {}), hub: r.hub, train: t, leave, arrive, legs, flags: trainFlags(t, profile) } as Option);
    }
  }
  return out;
}
