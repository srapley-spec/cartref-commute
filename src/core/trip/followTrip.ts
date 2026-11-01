// Following a chosen trip across its rides (story "Live, and keeping you up to date"). The same principles as the
// commute's Follow (follow.ts): a stable arrival with a reason for every change, never silently replaced, an
// alternative offered only when it is at least FOLLOW_BETTER_MIN sooner or the followed trip is broken, and switching
// is an explicit Follow. Pure: time, the refreshed trip and alternatives are inputs; the shell saves the result.
import { FOLLOW_BETTER_MIN, FOLLOW_CHANGE_MS } from "../follow";
import type { Leg } from "../journey";
import { hhmm } from "../time";
import type { Journey } from "./journeyCore";
import { mainRides, journeySteps } from "./journeyCore";

export type TripPhase = "before" | "access" | "ride" | "change" | "final" | "arrived";
export interface TripNotice { id: string; kind: "arrival" | "cancelled" | "connection" | "missed" | "traffic"; text: string; at: number }
export interface FollowTrip {
  version: 1; kind: "trip"; id: string; startedAt: number;
  journey: Journey; plannedArrival: number; expectedArrival: number;
  /** Rides you said you're on (index into journey.rides); answers are kept for this trip. */
  confirmed: number[];
  notices: TripNotice[]; dismissed: string[];
}
export interface FollowTripInput {
  now: number;
  /** The followed trip as refreshed now (same id, live times applied), when the refresh had it. */
  current?: Journey | null;
  /** Ranked journeys for the same places, for alternatives. */
  options?: Journey[];
  /** A reason for a change in the way to the station (drive re-check): "Traffic: leave 6 min earlier". */
  accessReason?: string | null;
}
export interface FollowTripUpdate {
  route: FollowTrip; phase: TripPhase; status: "on-track" | "late" | "at-risk" | "missed" | "cancelled" | "arrived";
  level: "ok" | "warn" | "bad" | "info"; text: string; deltaMin: number;
  nextStep: Leg | null; notice: TripNotice | null; alternative: Journey | null;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export function startFollowTrip(j: Journey, now: number): FollowTrip {
  return { version: 1, kind: "trip", id: j.id, startedAt: now, journey: clone(j), plannedArrival: j.arrive, expectedArrival: j.arrive,
    confirmed: [], notices: [], dismissed: [] };
}
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
/** Saved state is checked before use; anything malformed is dropped, never partly used. */
export function restoreFollowTrip(x: unknown): FollowTrip | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>, j = r.journey as Record<string, unknown> | undefined;
  if (r.version !== 1 || r.kind !== "trip" || typeof r.id !== "string" || !num(r.startedAt) || !num(r.plannedArrival) || !num(r.expectedArrival)) return null;
  if (!j || !Array.isArray(j.rides) || !j.rides.length || !Array.isArray(j.before) || !Array.isArray(j.after) || !num(j.leave) || !num(j.arrive) || j.id !== r.id) return null;
  const station = (s: unknown) => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).name === "string" && typeof (s as Record<string, unknown>).crs === "string";
  const ride = (d: unknown) => { const x = d as Record<string, unknown>; return !!x && typeof x === "object" && num(x.dep) && num(x.arr) && num(x.schedDep) && num(x.schedArr)
    && station(x.from) && station(x.to) && typeof x.kind === "string" && typeof x.label === "string" && !!x.live && typeof x.live === "object"; };
  const seg = (d: unknown) => { const x = d as Record<string, unknown>; return !!x && typeof x === "object" && num(x.secs) && typeof x.kind === "string"; };
  if (!(j.rides as unknown[]).every(ride) || !(j.before as unknown[]).every(seg) || !(j.after as unknown[]).every(seg)) return null;
  if (!station(j.fromStation) || !station(j.toStation) || !Array.isArray(j.changes) || !Array.isArray(j.flags) || !j.modes || typeof j.modes !== "object") return null;
  if (!Array.isArray(r.confirmed) || !(r.confirmed as unknown[]).every(n => Number.isInteger(n) && (n as number) >= 0) || !Array.isArray(r.notices) || !Array.isArray(r.dismissed)) return null;
  return x as FollowTrip;
}

/** Where you are on the trip, by its times and your answers (an answer about a later ride wins over the clock). */
export function tripPhase(j: Journey, now: number, confirmed: number[] = []): { phase: TripPhase; ride: number } {
  const last = Math.max(-1, ...confirmed);
  const rides = j.rides;
  if (now >= j.arrive) return { phase: "arrived", ride: rides.length - 1 };
  if (last < 0 && now < j.leave) return { phase: "before", ride: 0 };
  if (last < 0 && now < rides[0].dep) return { phase: "access", ride: 0 };
  for (let i = Math.max(0, last); i < rides.length; i++) {
    const r = rides[i];
    if (now < r.dep && i > 0) return { phase: "change", ride: i };
    if (now < r.arr) return { phase: "ride", ride: i };
  }
  return { phase: "final", ride: rides.length - 1 };
}

/** One refresh of a followed trip. */
export function updateFollowTrip(route: FollowTrip, i: FollowTripInput): FollowTripUpdate {
  const r = clone(route);
  const notices: TripNotice[] = [];
  const say = (kind: TripNotice["kind"], id: string, text: string) => { if (!r.notices.some(n => n.id === id)) { const n = { id, kind, text, at: i.now }; r.notices.push(n); notices.push(n); } };
  if (i.current && i.current.id === r.id) {
    const cur = i.current;
    mainRides(cur.rides).forEach(x => { if (x.cancelled) say("cancelled", `cancel:${x.from.crs}:${x.schedDep}`, `The ${hhmm(x.schedDep)} from ${x.from.name} is cancelled`); });
    cur.changes.forEach(c => {
      if (c.missed) say("missed", `missed:${c.at}`, c.text);
      else if (c.level === "bad") say("connection", `risk:${c.at}`, `${c.text} at ${c.at}`);
    });
    if (Math.abs(cur.arrive - r.expectedArrival) >= FOLLOW_CHANGE_MS) {
      const d = Math.round((cur.arrive - r.expectedArrival) / 60e3);
      const why = i.accessReason || (() => { const late = mainRides(cur.rides).find(x => x.dep !== x.schedDep || x.arr !== x.schedArr);
        return late ? `the ${hhmm(late.schedDep)} from ${late.from.name} is ${late.arr > late.schedArr ? "running late" : "running early"}` : "times changed"; })();
      say(i.accessReason ? "traffic" : "arrival", `arr:${cur.arrive}`, `Now arriving ${hhmm(cur.arrive)} (${d > 0 ? `${d} min later` : `${-d} min sooner`}): ${why}`);
      r.expectedArrival = cur.arrive;
    }
    r.journey = clone(cur);
  }
  const j = r.journey;
  const { phase } = tripPhase(j, i.now, r.confirmed);
  const broken = j.missed || mainRides(j.rides).some(x => x.cancelled);
  const deltaMin = Math.round((r.expectedArrival - r.plannedArrival) / 60e3);
  // An alternative only when broken or ≥ 5 min sooner; still reachable (leave not passed); not one you dismissed.
  const alternative = (i.options || []).filter(o => o.id !== r.id && !r.dismissed.includes(o.id) && !o.uncertain && !o.missed && o.leave >= i.now)
    .filter(o => broken || o.arrive <= r.expectedArrival - FOLLOW_BETTER_MIN * 60e3).sort((a, b) => a.arrive - b.arrive)[0] || null;
  const steps = journeySteps(j), nextStep = steps.find(s => s.t != null && s.t >= i.now) || null;
  let status: FollowTripUpdate["status"] = "on-track", level: FollowTripUpdate["level"] = "ok", text = `Arriving ${hhmm(r.expectedArrival)}`;
  if (phase === "arrived") { status = "arrived"; level = "info"; text = `Arrived ${hhmm(r.expectedArrival)}`; }
  else if (mainRides(j.rides).some(x => x.cancelled)) { status = "cancelled"; level = "bad"; text = "A train on your trip is cancelled"; }
  else if (j.missed) { status = "missed"; level = "bad"; text = j.changes.find(c => c.missed)?.text || "Connection missed"; }
  else if (j.changes.some(c => c.level === "bad")) { status = "at-risk"; level = "bad"; text = `Arriving ${hhmm(r.expectedArrival)} · ${j.changes.find(c => c.level === "bad")!.text}`; }
  else if (deltaMin >= 1) { status = "late"; level = deltaMin >= 15 ? "bad" : deltaMin >= 5 ? "warn" : "ok"; text = `Arriving ${hhmm(r.expectedArrival)} · ${deltaMin} min later than planned`; }
  return { route: r, phase, status, level, text, deltaMin, nextStep, notice: notices[0] || null, alternative };
}
export const confirmTripRide = (route: FollowTrip, ride: number): FollowTrip => ({ ...clone(route), confirmed: [...new Set([...route.confirmed, ride])] });
export const dismissTripAlternative = (route: FollowTrip, id: string): FollowTrip => ({ ...clone(route), dismissed: [...new Set([...route.dismissed, id])] });
