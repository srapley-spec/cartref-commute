// A prediction may adjust a chosen connection only when it names that vehicle at that stop.
// Caller-supplied hub IDs and interchange durations keep this reusable outside Sam's commute.
export const FOLLOW_TUBE_FRESH_MS = 3 * 60e3;
export interface FollowTubeRequest {
  vehicle: string;
  hub: string;
  stopId: string;
  lineId?: string;
  direction: 'eastbound' | 'westbound';
  now: number;
  fetchedAt: number;
  /** Existing route segments supply the time from the Tube platform to the chosen rail train. */
  readyMs: number;
}
export interface FollowTubeArrival {
  vehicle: string;
  hub: string;
  arrival: number;
  readyAt: number;
  at: number;
  live: true;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const parsedTime = (v: unknown): number | null => {
  if (finite(v)) return v;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v); return finite(t) ? t : null;
};

/** Accept raw recorded TfL predictions or the existing arrival adapter's normalized records. */
export function followTubeArrival(predictions: unknown, i: FollowTubeRequest): FollowTubeArrival | null {
  if (!Array.isArray(predictions) || !i.vehicle || !i.hub || !i.stopId || !['eastbound','westbound'].includes(i.direction) || !finite(i.now) || !finite(i.fetchedAt) ||
    !finite(i.readyMs) || i.readyMs < 0 || i.now < i.fetchedAt || i.now - i.fetchedAt >= FOLLOW_TUBE_FRESH_MS) return null;
  for (const p of predictions) {
    if (!record(p)) continue;
    const vehicle = p.vehicle ?? p.vehicleId;
    if (vehicle == null || String(vehicle) !== String(i.vehicle)) continue;
    if (i.lineId && p.lineId !== i.lineId) continue;
    if (!String(p.platform ?? p.platformName ?? '').toLowerCase().split(/[^a-z]+/).includes(i.direction)) continue;
    const stop = p.stopId ?? p.naptanId;
    // Endpoint provenance establishes the stop when the provider omits it. An explicit different
    // station always loses, even when the same vehicle appears in both stations' prediction feeds.
    if (stop != null && stop !== i.stopId) continue;
    const observedValue = p.observedAt ?? p.timestamp;
    const observed = observedValue == null ? i.fetchedAt : parsedTime(observedValue);
    if (observed == null || observed > i.now + 30e3 || i.now - observed >= FOLLOW_TUBE_FRESH_MS) continue;
    const explicit = p.t ?? p.expectedArrival;
    const arrival = explicit != null ? parsedTime(explicit)
      : finite(p.timeToStation) && p.timeToStation >= 0 ? observed + p.timeToStation * 1000 : null;
    if (arrival == null || arrival < i.now - 30e3) continue;
    return { vehicle: String(vehicle), hub: i.hub, arrival, readyAt: arrival + i.readyMs, at: observed, live: true };
  }
  return null;
}
