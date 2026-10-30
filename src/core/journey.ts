// Journeys: getting to the station → the train → getting from the station.
// A route is described once, as segments with durations; every time on screen is computed from it.
import type { Access, Board, Flag, Option, Profile, StationCode, Train } from "./types";
import { dur, hhmm } from "./time";
import { standingRoomOnly, isStopping, trainStatus } from "./rules";

/** A step shown in "Journey steps", at the start or end of a segment. */
export interface Step { at: "start" | "end"; d: string; note?: string; tube?: boolean; }
export type SegmentKind = "walk" | "station" | "margin" | "change" | "wait" | "ride" | "stop" | "planned";
/** Part of getting to or from the train. `secs` is final (pace already applied). */
export interface Segment { kind: SegmentKind; secs: number; step?: Step | null;
  /** Walks: the same walk at your average and fast pace (s), for effort levels. Default: `secs`. */
  avg?: number; fast?: number; }

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
  startsAtHome?: boolean;      // the route starts at your home (effort levels: your car is there)
}

export interface Leg { t: number | null; d: string; note?: string; tube?: boolean; train?: boolean; calls?: boolean; }

/** "Farringdon 17:56 · St Pancras 18:01 · Finsbury Park · … · Letchworth 18:39" */
export function callsText(t: Train, profile?: Profile): string {
  const name = (c: { name: string; code?: string | null }) => (profile && c.code && profile.stationNames[c.code]) || c.name;
  return (t.calls || []).map(c => c.t != null ? `${name(c)} ${hhmm(c.t)}` : name(c)).join(" · ");
}

const total = (segs: Segment[]): number => segs.reduce((s, x) => s + x.secs, 0) * 1000;
/** Arrival after supplied route segments, from an observed or planned start instant. */
export const segmentArrival = (start: number, segments: Segment[]): number => start + total(segments);
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
  else if (!t.cancelled) { const s = trainStatus(t); if (s) f.push({ lvl: s.level, txt: s.text, status: true }); }
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

/**
 * The same journey with every walk before the train at your fast pace, leaving at `leave`: the steps before the train
 * are re-timed from the route's segments (and say "fast walk"); the train and everything after are unchanged.
 */
export function fastWalkLegs(o: Option, leave: number): Leg[] {
  const before = o.before as Segment[] | undefined; if (!before) return o.legs as Leg[];
  const segs = before.map(s => s.kind === "walk" && s.fast != null
    ? { ...s, secs: Math.min(s.secs, s.fast), step: s.step ? { ...s.step, note: `${s.step.note ? s.step.note + " · " : ""}fast walk ${dur(Math.min(s.secs, s.fast) * 1000)}` } : s.step }
    : s);
  const pre: Leg[] = []; walkSteps(segs, leave, pre);
  return [...pre, ...(o.legs as Leg[]).slice(before.filter(s => s.step).length)];
}

/** What the time before the train is made of: walking (at the plan's, average and fast pace) and the rest. */
export function accessOf(r: Route): Access {
  const walks = r.before.filter(s => s.kind === "walk"), sum = (f: (s: Segment) => number, xs: Segment[]) => xs.reduce((t, s) => t + f(s), 0);
  return { walk: sum(s => s.secs, walks), walkAvg: sum(s => s.avg ?? s.secs, walks), walkFast: sum(s => s.fast ?? s.secs, walks),
    fixed: sum(s => s.secs, r.before.filter(s => s.kind !== "walk")), home: !!r.startsAtHome };
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
      if (t.calls && t.calls.length > 2) legs.push({ t: null, d: "Calls at", note: callsText(t, profile), calls: true });
      legs.push({ t: t.arr, d: r.arriveLabel, note: `${dur(t.arr - t.dep)} on the train${r.arriveExtra || ""}` });
      walkSteps(r.after, t.arr, legs);
      out.push({ ...(r.extra || {}), hub: r.hub, train: t, leave, arrive, legs, flags: trainFlags(t, profile), access: accessOf(r), before: r.before } as Option);
    }
  }
  return out;
}

/**
 * Off a tube (or any other way of reaching London stations): given when you reach each station (`reach`) and how
 * long until you're ready to board there (`ready`, ms), the best train per station — the earliest arrival among
 * trains you can still make — sorted by arrival. Cancelled and no-estimate trains are never picked.
 */
export function bestConnections<T extends Option>(reach: Record<string, number>, ready: Record<string, number>, options: T[]): T[] {
  const per: Record<string, T> = {};
  for (const o of options) {
    const r = reach[o.hub]; if (r == null || o.uncertain || o.train.cancelled || o.train.depUnknown) continue;
    if (o.train.dep < r + (ready[o.hub] || 0)) continue;
    if (!per[o.hub] || o.arrive < per[o.hub].arrive || (o.arrive === per[o.hub].arrive && o.train.dep < per[o.hub].train.dep)) per[o.hub] = o;
  }
  // Same arrival (often the same train at two stations): the one that leaves first, i.e. the earlier stop.
  return Object.values(per).sort((a, b) => a.arrive - b.arrive || a.train.dep - b.train.dep);
}

/** How an option compares with the best: a stopping train is named, with the train time and minutes later/sooner. */
export function compareWithBest(o: Option, best: Option | null, profile: Profile): { stopping: boolean; trainMs: number; deltaMin: number | null } {
  const t = o.train;
  return { stopping: isStopping(t, profile), trainMs: (t.arr as number) - t.dep, deltaMin: !best || best === o ? null : Math.round((o.arrive - best.arrive) / 60e3) };
}
