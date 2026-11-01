// The Journey core: getting to a station → one or more rides with changes → getting from a station.
// Every time on screen comes from the segments and rides here (journeyTimes, journeySteps); nothing else does
// timing arithmetic. The commute's Option is a one-ride case (convergence: docs/leisure-architecture.md §3).
import type { Flag, Train } from "../types";
import { walkSteps, serviceFlags, type Leg, type Segment } from "../journey";
import { hhmm, dur } from "../time";
import type { TripConfig, AccessMode } from "./config";
import type { Place } from "./ports";

export interface Station {
  crs: string; name: string; geo: [number, number];
  carPark: "yes" | "no" | "unknown"; servicePerHour: number;
  /** Provider IDs (e.g. tfl: naptan IDs, tflIcs: ICS codes). Read only by adapters, never by the engine. */
  ids: Record<string, string[]>;
}
export type RideKind = "rail" | "tube" | "walk" | "bus" | "other";
/** One ride. `dep` / `arr` are the best known times (live when `live` says so, else timetabled). */
export interface Ride {
  kind: RideKind; from: Station; to: Station;
  dep: number; arr: number; schedDep: number; schedArr: number;
  live: { dep: boolean; arr: boolean };
  label: string;                 // "Southern to Seaford", "Victoria line"
  operator?: string; destination?: string; platform?: string | null;
  train?: Train;                 // rail rides: the service as the rest of the app knows trains
  cancelled?: boolean;
}
/** What a planner returns between two stations. */
export interface RailJourney { rides: Ride[]; source: string; notes: string[] }
export interface ChangeStatus {
  at: string; spare: number; plannedSpare: number;
  level: "ok" | "warn" | "bad"; text: string; missed: boolean; notLive: ("arr" | "dep")[];
  via: Ride[];
}
export interface Journey {
  id: string; from: Place | null; to: Place | null; fromStation: Station; toStation: Station;
  modes: { from: AccessMode; to: AccessMode };
  before: Segment[]; rides: Ride[]; after: Segment[];
  leave: number; arrive: number; flags: Flag[]; changes: ChangeStatus[];
  tomorrow: boolean; source: string;
  recommended?: number; uncertain?: boolean; missed?: boolean; late?: boolean;
}

const secs = (xs: Segment[]) => xs.reduce((s, x) => s + x.secs, 0) * 1000;
/** Calendar days from one instant's day to another's (local time). */
export function daysBetween(a: number, b: number): number {
  const d = (t: number) => { const x = new Date(t); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };
  return Math.round((d(b) - d(a)) / 86400e3);
}
/** Rides you board on a timetable; Tube and walks between them are the way across (a transfer). */
export const isMain = (r: Ride) => r.kind === "rail" || r.kind === "bus" || r.kind === "other";
export const mainRides = (rides: Ride[]) => rides.filter(isMain);

/** Leave and arrive, from the segments and the first / last ride. */
export function journeyTimes(before: Segment[], rides: Ride[], after: Segment[]): { leave: number; arrive: number } {
  const first = rides[0], last = rides[rides.length - 1];
  return { leave: first.dep - secs(before), arrive: last.arr + secs(after) };
}

/**
 * The change between two main rides, by one rule for planned and live times (story "Changes"):
 * spare = next departure − this arrival − the way across, whole minutes rounded down, best known time at each end.
 * Under 0 or next cancelled: missed. Under riskMin: at risk. Under tightMin and below the planned spare: tight.
 */
export function changeStatus(prev: Ride, next: Ride, via: Ride[], cfg: Pick<TripConfig, "change">): ChangeStatus {
  const across = via.reduce((s, r) => s + (r.schedArr - r.schedDep), 0);
  const spare = Math.floor((next.dep - prev.arr - across) / 60e3);
  const plannedSpare = Math.floor((next.schedDep - prev.schedArr - across) / 60e3);
  const at = via.length ? `${prev.to.name} → ${next.from.name}` : next.from.name;
  const notLive: ("arr" | "dep")[] = [...(prev.live.arr ? [] : ["arr" as const]), ...(next.live.dep ? [] : ["dep" as const])];
  const base = { at, spare, plannedSpare, notLive, via };
  if (next.cancelled) return { ...base, level: "bad", missed: true, text: `Connection missed: the ${hhmm(next.schedDep)} from ${next.from.name} is cancelled` };
  if (spare < 0) return { ...base, level: "bad", missed: true, text: `Connection missed at ${next.from.name}` };
  if (spare < cfg.change.riskMin) return { ...base, level: "bad", missed: false, text: `Connection at risk, ${spare} min` };
  if (spare < cfg.change.tightMin && spare < plannedSpare) return { ...base, level: "warn", missed: false, text: `Tight change, ${spare} min` };
  return { ...base, level: "ok", missed: false, text: `Change ${spare} min` };
}

/** Every change on a journey: main ride → (Tube / walk)* → main ride. */
export function journeyChanges(rides: Ride[], cfg: Pick<TripConfig, "change">): ChangeStatus[] {
  const out: ChangeStatus[] = []; let prev: Ride | null = null, via: Ride[] = [];
  for (const r of rides) {
    if (!isMain(r)) { if (prev) via.push(r); continue; }
    if (prev) out.push(changeStatus(prev, r, via, cfg));
    prev = r; via = [];
  }
  return out;
}

/** Flags for a journey. Never hides it: every problem is a flag. */
export function journeyFlags(j: Pick<Journey, "rides" | "changes" | "tomorrow" | "fromStation" | "toStation" | "modes">,
  extra: { farKm?: { from?: number; to?: number }; day?: number } = {}): Flag[] {
  const f: Flag[] = [];
  const mains = mainRides(j.rides);
  mains.forEach((r, i) => {
    if (r.kind === "bus") f.push({ lvl: "warn", txt: `Bus between ${r.from.name} and ${r.to.name}` });
    if (!r.train) return;
    serviceFlags(r.train).forEach(x => f.push(i === 0 ? x : { ...x, txt: `${hhmm(r.schedDep)} from ${r.from.name}: ${x.txt}` }));
  });
  j.changes.forEach(c => { if (c.level !== "ok") f.push({ lvl: c.level, txt: c.text }); });
  if (j.tomorrow) {
    const dep = (mains[0] || j.rides[0]).schedDep, date = new Date(dep).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    f.push({ lvl: "info", txt: extra.day != null && daysBetween(extra.day, dep) === 1 ? `Tomorrow · ${date}` : date });
  }
  if (j.modes.from === "drive") {
    if (j.fromStation.carPark === "no") f.push({ lvl: "warn", txt: "No station car park" });
    else if (j.fromStation.carPark === "unknown") f.push({ lvl: "info", txt: "Car park not known" });
  }
  const far = extra.farKm || {};
  if (far.from != null) f.push({ lvl: "info", txt: `Nearest station is ${far.from.toFixed(1)} km away` });
  if (far.to != null) f.push({ lvl: "info", txt: `Nearest station to where you're going is ${far.to.toFixed(1)} km away` });
  return f;
}

/** Put a journey together from a planner's rides and the access segments. Times only from segments and rides. */
export function buildJourney(rail: RailJourney, from: Place | null, to: Place | null, modes: Journey["modes"],
  before: Segment[], after: Segment[], cfg: Pick<TripConfig, "change">, now: number,
  extra: { farKm?: { from?: number; to?: number }; day?: number; noRoute?: string[] } = {}): Journey {
  const rides = rail.rides, mains = mainRides(rides);
  const fromStation = rides[0].from, toStation = rides[rides.length - 1].to;
  const { leave, arrive } = journeyTimes(before, rides, after);
  const changes = journeyChanges(rides, cfg);
  // A later day than the one asked about (Leave now: today).
  const day = extra.day ?? now;
  const tomorrow = daysBetween(day, (mains[0] || rides[0]).schedDep) > 0;
  const id = [fromStation.crs, toStation.crs, ...mains.map(r => `${r.from.crs}${hhmm(r.schedDep)}`)].join("|");
  const j: Journey = { id, from, to, fromStation, toStation, modes, before, rides, after, leave, arrive, flags: [], changes, tomorrow, source: rail.source };
  j.flags = [...journeyFlags(j, { ...extra, day }), ...(extra.noRoute || []).map(txt => ({ lvl: "bad" as const, txt }))];
  // No route to or from a station: shown (never hidden) but never picked, since its door-to-door times are unknown.
  j.uncertain = !!(extra.noRoute && extra.noRoute.length) || mains.some(r => r.cancelled || (r.train && (r.train.depUnknown || r.train.arrUnknown)));
  j.missed = changes.some(c => c.missed);
  return j;
}

/** Journey steps for the screen: the way to the station, each ride, each change, the way from the station. */
export function journeySteps(j: Journey): Leg[] {
  const legs: Leg[] = [];
  walkSteps(j.before, j.leave, legs);
  let ci = 0, prevMain: Ride | null = null;
  for (const r of j.rides) {
    if (isMain(r)) {
      if (prevMain) { const c = j.changes[ci++]; if (c) legs.push({ t: null, d: c.text.startsWith("Change") ? `Change at ${c.at} · ${c.spare} min` : c.text, note: c.notLive.length ? "Not live" : undefined }); }
      const late = r.dep !== r.schedDep ? ` (exp ${hhmm(r.dep)})` : "";
      legs.push({ t: r.dep, d: `${hhmm(r.schedDep)}${late} ${r.label} from ${r.from.name}`, note: [r.platform ? `platform ${r.platform}` : "", r.live.dep ? "" : "Not live"].filter(Boolean).join(" · ") || undefined, train: r.kind === "rail" });
      legs.push({ t: r.arr, d: `Arrive ${r.to.name}`, note: `${dur(r.arr - r.dep)} on the ${r.kind === "bus" ? "bus" : "train"}` });
      prevMain = r;
    } else {
      legs.push({ t: r.dep, d: r.kind === "walk" ? `Walk to ${r.to.name}` : `${r.label}: ${r.from.name} → ${r.to.name}`, note: dur(r.schedArr - r.schedDep), tube: r.kind === "tube" });
    }
  }
  walkSteps(j.after, j.arrive - secs(j.after), legs);
  return legs;
}
