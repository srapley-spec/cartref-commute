// Connections: changing at a station onto a frequent service with live departures (a tube, a bus, a tram, a
// metro train). Generic: any station, any service. The profile and screen say which stations, lines and stops;
// this decides what you can catch, which one you're on, and when you'll get there.
import type { LatLon } from "./types";
import { km } from "./geo";
import type { Fix } from "./situation";

/** A live departure from the station you're at. */
export interface Departure { t: number; line: string; lineId?: string; dest?: string; platform?: string; vehicle?: string; [k: string]: unknown; }
/** Where a departure takes you on this journey: the stop you get off at, how long the ride is, and from that stop
 *  to where you're going (walk etc.), in ms. */
export interface ConnectionLeg { stop: string; rideMs: number; tailMs: number; stopGeo?: LatLon; }
export type Timed<D> = D & { leg: ConnectionLeg; stopAt: number; arrive: number; early?: boolean };

export interface ConnectionInput<D extends Departure> {
  now: number;
  departures: D[];
  /** When you arrived at the station (you're usually already walking when you look), or null if unknown. */
  arrivedAt: number | null;
  /** From arriving to standing on the platform (ms). */
  walkMs: number;
  /** The leg for each departure (different lines can mean different stops, rides and walks). Null = not useful. */
  leg: (d: D) => ConnectionLeg | null;
  /** A departure you said you're getting. Matched by vehicle when both have one, else the same line's departure
   *  nearest to the time you picked (within 3 min): live times move by seconds between refreshes. */
  pick?: { t: number; line: string; vehicle?: string } | null;
  max?: number;
}
export interface ConnectionPlan<D> {
  /** When you can be on the platform: from when you arrived plus the walk, never sooner than a minute from now. */
  ready: number;
  /** Departures you can make at your pace (soonest first). */
  next: Timed<D>[];
  /** Departures before `ready` but not within 30 s: only if you're already near the platform. */
  early: Timed<D>[];
  /** The one to get: your pick if it's still to come, else the earliest arrival among those you can make. */
  best: Timed<D> | null;
  /** True when `best` is your pick. */
  chosen: boolean;
  /** Your pick is over a minute earlier than we'd expect you can reach the platform (said, not overruled). */
  tight: boolean;
  /** Whole minutes in hand on the platform before `best` leaves (0 when none). */
  spareMin: number;
}

/**
 * Plan a connection. Departures you can make are those leaving at or after `ready`; the best is the earliest
 * arrival (a later departure on a faster line can beat an earlier one), ties going to the earlier departure.
 */
export function planConnection<D extends Departure>(i: ConnectionInput<D>): ConnectionPlan<D> {
  const since = i.arrivedAt != null && i.arrivedAt <= i.now ? i.arrivedAt : i.now;
  const ready = Math.max(i.now + 60e3, since + i.walkMs);
  const timed: Timed<D>[] = [];
  for (const d of [...i.departures].sort((a, b) => a.t - b.t)) {
    const leg = i.leg(d); if (!leg || !isFinite(d.t)) continue;
    timed.push({ ...d, leg, stopAt: d.t + leg.rideMs, arrive: d.t + leg.rideMs + leg.tailMs });
  }
  const next = timed.filter(d => d.t >= ready).slice(0, i.max ?? 6);
  const early = timed.filter(d => d.t < ready && d.t >= i.now + 30e3).map(d => ({ ...d, early: true }));
  const picked = i.pick ? matchPick([...early, ...next], i.pick) : null;
  const fastest = next.reduce<Timed<D> | null>((b, d) => (!b || d.arrive < b.arrive ? d : b), null);
  const best = picked || fastest;
  return {
    ready, next, early, best, chosen: !!picked,
    tight: !!picked && picked.t < ready - 60e3,
    spareMin: best ? Math.max(0, Math.floor((best.t - ready) / 60e3)) : 0,
  };
}

function matchPick<D extends Departure>(ds: D[], pk: { t: number; line: string; vehicle?: string }): D | null {
  if (pk.vehicle) { const v = ds.find(d => d.vehicle && d.vehicle === pk.vehicle); if (v) return v; }
  const same = ds.filter(d => d.line === pk.line && Math.abs(d.t - pk.t) <= 3 * 60e3).sort((a, b) => Math.abs(a.t - pk.t) - Math.abs(b.t - pk.t));
  return same[0] || null;
}

/** A ride on a connection: where from, the departure (when it left), how long the ride is, and where it ends. */
export interface Ride { from: string; t: number; line?: string; vehicle?: string; rideMs: number; stop?: string; stopGeo?: LatLon | null; picked?: boolean; confirmed?: boolean; }
/**
 * On the ride: from when it leaves until you're near the stop you get off at (300 m), or the ride time plus 10
 * minutes has passed. A fix at a station on the way, or a stray one at the station you left, doesn't end it.
 */
export function rideActive(r: Ride | null, now: number, f: Fix): boolean {
  if (!r || now < r.t - 30e3 || now > r.t + r.rideMs + 10 * 60e3) return false;
  return !(r.stopGeo && f.here && km(f.here, r.stopGeo) < 0.3);
}
/** Worth asking "did you get it?": a good (50 m), fresh (1 min) fix still within `radiusKm` of the station you
 *  left, 3+ min after it left, and you haven't already said yes. */
export function rideDoubtful(r: Ride | null, now: number, f: Fix, fromGeo: LatLon | null, radiusKm: number): boolean {
  if (!r || r.confirmed || !fromGeo || now < r.t + 3 * 60e3) return false;
  if (!f.here || typeof f.acc !== "number" || !(f.acc <= 50) || f.at == null || now - f.at > 60e3) return false;
  return km(f.here, fromGeo) <= radiusKm;
}
