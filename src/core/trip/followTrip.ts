// Following a chosen trip across its rides (story "Live, and keeping you up to date"). The same principles as the
// commute's Follow (follow.ts): a stable arrival with a reason for every change, never silently replaced, an
// alternative offered only when it is at least FOLLOW_BETTER_MIN sooner or the followed trip is broken, and switching
// is an explicit Follow. Pure: time, the refreshed trip and alternatives are inputs; the shell saves the result.
import { FOLLOW_BETTER_MIN, FOLLOW_CHANGE_MS } from "../follow";
import type { Leg } from "../journey";
import { hhmm } from "../time";
import type { Journey } from "./journeyCore";
import { mainRides, journeySteps, buildJourney } from "./journeyCore";
import type { TripConfig } from './config';
import { tripRideTimingUsable } from '../journeyFacts';
import { tripCanFollow } from './tripRank';

export type TripPhase = "before" | "access" | "ride" | "change" | "final" | "arrived";
export interface TripNotice { id: string; kind: "arrival" | "cancelled" | "connection" | "missed" | "traffic"; text: string; at: number }
export interface FollowTrip {
  version: 1; kind: "trip"; id: string; startedAt: number;
  journey: Journey; plannedArrival: number; expectedArrival: number;
  /** Rides you said you're on (index into journey.rides); answers are kept for this trip. */
  confirmed: number[];
  /** Explicit current-ride correction; unlike a clock estimate it ends on alighting. */
  activeRide?: number | null;
  alightedRide?: number;
  arrivedAt?: number;
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
  /** Usable current final ETA; the saved last-known number is not a promise after an incident. */
  arrival: number | null;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export function startFollowTrip(j: Journey, now: number): FollowTrip {
  return { version: 1, kind: "trip", id: j.id, startedAt: now, journey: clone(j), plannedArrival: j.arrive, expectedArrival: j.arrive,
    confirmed: [], notices: [], dismissed: [] };
}
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const nextBoardableRide = (j: Journey, first: number) => {
  const index=j.rides.findIndex((r,i)=>i>=first&&r.kind!=='walk');
  return index<0?j.rides.length-1:index;
};
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
  const rideIndex=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<(j.rides as unknown[]).length;
  if(r.activeRide!=null&&!rideIndex(r.activeRide)||r.alightedRide!=null&&!rideIndex(r.alightedRide)||r.arrivedAt!=null&&!num(r.arrivedAt))return null;
  if(!Array.isArray(r.confirmed)||!r.confirmed.every(rideIndex))return null;
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
    if (now < r.dep && i > 0) return { phase: "change", ride: nextBoardableRide(j,i) };
    if (now < r.arr) return { phase: r.kind==='walk'?'change':'ride', ride: r.kind==='walk'?nextBoardableRide(j,i):i };
  }
  return { phase: "final", ride: rides.length - 1 };
}

/** Time suggests a stage; it cannot prove boarding or physical arrival. Explicit
 * correction remains authoritative until the person reports getting off. */
export function followedTripPhase(route: FollowTrip, now: number): { phase: TripPhase; ride: number } {
  if(route.arrivedAt!=null)return {phase:'arrived',ride:route.journey.rides.length-1};
  if(route.activeRide!=null)return {phase:'ride',ride:route.activeRide};
  const timed=tripPhase(route.journey,now,route.confirmed);
  const floor=(route.alightedRide??-1)+1;
  if(floor>=route.journey.rides.length)return {phase:'final',ride:route.journey.rides.length-1};
  if(timed.ride<floor)return {phase:'change',ride:nextBoardableRide(route.journey,floor)};
  return timed.phase==='arrived'?{...timed,phase:'final'}:timed;
}

/** One refresh of a followed trip. */
export function updateFollowTrip(route: FollowTrip, i: FollowTripInput): FollowTripUpdate {
  const r = clone(route);
  const notices: TripNotice[] = [];
  const remainingParts = (j: Journey) => {
    const passed=Math.max(r.activeRide??-1,r.alightedRide??-1);
    const passedMain=mainRides(j.rides.slice(0,passed+1)).length;
    const changes=j.changes.slice(Math.max(0,passedMain-1));
    const remaining=j.rides.slice(Math.max(0,r.activeRide??((r.alightedRide??-1)+1)));
    const cancelled=remaining.some(x=>x.cancelled||x.train?.cancelled);
    const missed=changes.some(c=>c.missed)||passed<0&&j.missed===true;
    const unknown=remaining.some(x=>!tripRideTimingUsable(x,x!==j.rides[r.activeRide??-1]))
      ||!Number.isFinite(j.arrive)||r.arrivedAt==null&&j.arrive<i.now;
    return {changes,remaining,cancelled,missed,unknown};
  };
  const say = (kind: TripNotice["kind"], id: string, text: string) => { if (!r.notices.some(n => n.id === id)) { const n = { id, kind, text, at: i.now }; r.notices.push(n); notices.push(n); } };
  if (i.current && i.current.id === r.id && r.arrivedAt==null) {
    const cur = i.current;
    const currentParts=remainingParts(cur);
    mainRides(currentParts.remaining).forEach(x => { if (x.cancelled||x.train?.cancelled) say("cancelled", `cancel:${x.from.crs}:${x.schedDep}`, `The ${hhmm(x.schedDep)} from ${x.from.name} is cancelled`); });
    currentParts.changes.forEach(c => {
      if (c.missed) say("missed", `missed:${c.at}`, c.text);
      else if (c.level === "bad") say("connection", `risk:${c.at}`, `${c.text} at ${c.at}`);
    });
    if (!currentParts.cancelled&&!currentParts.missed&&!currentParts.unknown&&Math.abs(cur.arrive - r.expectedArrival) >= FOLLOW_CHANGE_MS) {
      const d = Math.round((cur.arrive - r.expectedArrival) / 60e3);
      const why = i.accessReason || (() => { const late = mainRides(currentParts.remaining).find(x => x.dep !== x.schedDep || x.arr !== x.schedArr);
        return late ? `the ${hhmm(late.schedDep)} from ${late.from.name} is ${late.arr > late.schedArr ? "running late" : "running early"}` : "times changed"; })();
      say(i.accessReason ? "traffic" : "arrival", `arr:${cur.arrive}`, `Now arriving ${hhmm(cur.arrive)} (${d > 0 ? `${d} min later` : `${-d} min sooner`}): ${why}`);
      r.expectedArrival = cur.arrive;
    }
    if(!currentParts.cancelled&&!currentParts.missed&&!currentParts.unknown)r.expectedArrival=cur.arrive;
    r.journey = clone(cur);
  }
  const j = r.journey;
  const { phase } = followedTripPhase(r, i.now);
  const {changes,cancelled,missed,unknown}=remainingParts(j);
  const broken = missed || cancelled || unknown;
  const deltaMin = Math.round((r.expectedArrival - r.plannedArrival) / 60e3);
  // An alternative only when broken or ≥ 5 min sooner; still reachable (leave not passed); not one you dismissed.
  const recovery=tripRecoveryStart(r,i.now),underWay=phase!=='before'&&phase!=='access'||r.activeRide!=null||r.alightedRide!=null;
  const alternative = (phase==='arrived'?[]:i.options || []).filter(o => o.id !== r.id && !r.dismissed.includes(o.id) && tripCanFollow(o,i.now))
    .filter(o=>!underWay||o.fromStation.crs===recovery.station.crs&&o.leave>=recovery.readyAt)
    .filter(o => broken || o.arrive <= r.expectedArrival - FOLLOW_BETTER_MIN * 60e3).sort((a, b) => a.arrive - b.arrive)[0] || null;
  const steps = journeySteps(j), nextStep = steps.find(s => s.t != null && s.t >= i.now) || null;
  let status: FollowTripUpdate["status"] = "on-track", level: FollowTripUpdate["level"] = "ok", text = `Arriving ${hhmm(r.expectedArrival)}`;
  if (phase === "arrived") { status = "arrived"; level = "info"; text = `Arrived ${hhmm(r.expectedArrival)}`; }
  else if (cancelled) { status = "cancelled"; level = "bad"; text = "A train on your trip is cancelled"; }
  else if (missed) { status = "missed"; level = "bad"; text = changes.find(c => c.missed)?.text || "Connection missed"; }
  else if (unknown) { status = "at-risk"; level = "bad"; text = phase==='final'?"Arrival estimate passed · confirm arrival or update your journey":"Arrival uncertain · waiting for a usable train estimate"; }
  else if (changes.some(c => c.level === "bad")) { status = "at-risk"; level = "bad"; text = `Arriving ${hhmm(r.expectedArrival)} · ${changes.find(c => c.level === "bad")!.text}`; }
  else if (deltaMin >= 1) { status = "late"; level = deltaMin >= 15 ? "bad" : deltaMin >= 5 ? "warn" : "ok"; text = `Arriving ${hhmm(r.expectedArrival)} · ${deltaMin} min later than planned`; }
  const arrival=phase==='arrived'?r.arrivedAt??r.expectedArrival:broken||!Number.isFinite(r.expectedArrival)?null:r.expectedArrival;
  return { route: r, phase, status, level, text, deltaMin, nextStep, notice: notices[0] || null, alternative,arrival };
}
export function confirmTripRide(route: FollowTrip, ride: number): FollowTrip {
  if(!Number.isInteger(ride)||ride<0||ride>=route.journey.rides.length||route.journey.rides[ride].kind==='walk')return clone(route);
  const next=clone(route);next.confirmed=[...new Set([...next.confirmed.filter(n=>n<=ride),ride])];
  next.activeRide=ride;delete next.arrivedAt;
  if(next.alightedRide!=null&&next.alightedRide>=ride)next.alightedRide=ride-1;
  if(next.alightedRide===-1)delete next.alightedRide;
  return next;
}
export function alightTripRide(route: FollowTrip): FollowTrip {
  const next=clone(route);
  if(next.activeRide!=null){next.alightedRide=next.activeRide;next.activeRide=null;}
  return next;
}
export function completeFollowTrip(route: FollowTrip, now: number): FollowTrip {
  const next=clone(route);if(!Number.isFinite(now))return next;
  next.arrivedAt=now;next.activeRide=null;next.expectedArrival=now;return next;
}
/** Recovery starts where the selected journey can actually reach, never back at its origin. */
export function tripRecoveryStart(route: FollowTrip, now: number) {
  const phase=followedTripPhase(route,now),ride=route.journey.rides[phase.ride];
  const station=phase.phase==='ride'?ride.to:phase.phase==='change'?ride.from:phase.phase==='final'||phase.phase==='arrived'?route.journey.toStation:route.journey.fromStation;
  const readyAt=phase.phase==='ride'&&ride.arr>now?ride.arr:now;
  return {station,readyAt};
}
/** Explicitly choose a usable recovery while keeping the original target and earlier legs. */
export function recoverFollowTrip(route: FollowTrip, next: Journey, now: number, cfg: Pick<TripConfig,'change'>): FollowTrip | null {
  const start=tripRecoveryStart(route,now),phase=followedTripPhase(route,now);
  const underWay=phase.phase!=='before'&&phase.phase!=='access'||route.activeRide!=null||route.alightedRide!=null;
  if(!tripCanFollow(next,now)||next.leave<start.readyAt||underWay&&next.fromStation.crs!==start.station.crs)return null;
  if((route.journey.to?.id||route.journey.toStation.crs)!==(next.to?.id||next.toStation.crs))return null;
  const count=underWay?(phase.phase==='ride'?phase.ride+1:phase.phase==='change'?phase.ride:route.journey.rides.length):0;
  const prior=route.journey.rides.slice(0,count);
  const allowance=next.before.reduce((ms,s)=>ms+s.secs*1000,0);
  const transfer:Journey['rides']=count&&allowance>0?[{kind:'walk',from:start.station,to:next.fromStation,dep:next.leave,arr:next.rides[0].dep,
    schedDep:next.rides[0].schedDep-allowance,schedArr:next.rides[0].schedDep,live:{dep:false,arr:false},label:`Transfer and boarding at ${start.station.name}`}]:[];
  const journey=count?buildJourney({rides:[...clone(prior),...transfer,...clone(next.rides)],source:next.source,notes:[]},route.journey.from,next.to,
    {from:route.journey.modes.from,to:next.modes.to},clone(route.journey.before),clone(next.after),cfg,now):clone(next);
  journey.id=next.id;
  const r:FollowTrip={...clone(route),id:next.id,journey,expectedArrival:next.arrive,
    confirmed:route.confirmed.filter(n=>n<count),notices:[...clone(route.notices),{id:`recovery:${next.id}:${now}`,kind:'connection',at:now,
      text:`You chose a new route from ${start.station.name}. Original arrival ${hhmm(route.plannedArrival)}; now ${hhmm(next.arrive)}.`}]};
  delete r.arrivedAt;
  if(count&&route.activeRide!=null)r.activeRide=route.activeRide;
  else {r.activeRide=null;if(count)r.alightedRide=count-1;else delete r.alightedRide;}
  return r;
}
export const dismissTripAlternative = (route: FollowTrip, id: string): FollowTrip => ({ ...clone(route), dismissed: [...new Set([...route.dismissed, id])] });
