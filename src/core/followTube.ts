// A prediction may adjust a chosen connection only when it names that vehicle at that stop.
// Caller-supplied hub IDs and interchange durations keep this reusable outside Sam's commute.
export const FOLLOW_TUBE_FRESH_MS = 3 * 60e3;
export interface FollowTubeRequest {
  vehicle: string;
  hub: string;
  stopId: string;
  lineId?: string;
  direction: 'eastbound' | 'westbound' | 'northbound' | 'southbound';
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
  /** TfL's location text from this same accepted prediction (null when it gave none): never from another record
   *  for the same vehicle, which may be stale (18 Nov review). */
  where: string | null;
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
  if (!Array.isArray(predictions) || !i.vehicle || !i.hub || !i.stopId || !['eastbound','westbound','northbound','southbound'].includes(i.direction) || !finite(i.now) || !finite(i.fetchedAt) ||
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
    return { vehicle: String(vehicle), hub: i.hub, arrival, readyAt: arrival + i.readyMs, at: observed, live: true, where: tubeWhere(p.where ?? p.currentLocation) };
  }
  return null;
}

/** TfL's own words for where a tube is ("At Barbican Platform 1", "Between Liverpool Street and Aldgate",
 *  "Approaching Moorgate", "Left Farringdon"), tidied for one line on the card: the platform number goes, "Departed"
 *  reads "Left". Null for anything empty, over-long or not in one of the forms recorded from TfL (30–31 Oct 2026
 *  fixtures: At, Between, Approaching, Left, Departed, Leaving, Departing, Around), so nothing unexpected is shown
 *  as a position. (10 Nov 2026, #57 E1, H11: the tube leg said only "position is a time-based estimate".) */
export function tubeWhere(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const s = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '').replace(/\s+Platform\s+\w+$/i, '');
  if (!s || s.length > 80 || !/^(At|Between|Approaching|Left|Departed|Leaving|Departing|Around)\s+\S/i.test(s)) return null;
  return s.replace(/^Departed\b/i, 'Left').replace(/^[a-z]/, c => c.toUpperCase());
}
/**
 * The location text TfL gives for the tube you're matched to. Prefer `FollowTubeArrival.where` (the accepted record's
 * own text); this is kept only for callers without a validated arrival and returns the first matching record's.
 * @deprecated 18 Nov: can pair a fresh arrival with a stale location from another record for the same vehicle.
 */
export function followTubeWhere(predictions: unknown, vehicle: string, lineId?: string): string | null {
  if (!Array.isArray(predictions) || !vehicle) return null;
  for (const p of predictions) {
    if (!record(p)) continue;
    const v = p.vehicle ?? p.vehicleId;
    if (v == null || String(v) !== String(vehicle) || (lineId && p.lineId != null && p.lineId !== lineId)) continue;
    const where = tubeWhere(p.where ?? p.currentLocation);
    if (where) return where;
  }
  return null;
}

/** A tube's destination as the passenger reads it on the train's front: TfL's name, never its placeholders. */
const usableDest = (d: unknown, notTo?: RegExp): string => {
  const s = String(d ?? '').replace(/ Underground Station/i, '').replace(/ \([^)]*Line\)/i, '').trim();
  return !s || /check front of train|^unknown$/i.test(s) || (notTo && notTo.test(s)) ? '' : s;
};
/**
 * Where your tube is going (Sam, 19 Nov: "Can we be clear here what the destination of the train is. This helps
 * confirm which one you're on / getting on"). Its own listed destination when TfL gave one; otherwise the destination
 * TfL gives the same vehicle on the same line in any other list the app already has (e.g. the arrivals at the station
 * you're riding to, when Aldgate's departures said "Check front of train"). Empty when nobody says.
 */
export function tubeDestination(tube: { dest?: string | null; vehicle?: string | null; lineId?: string | null } | null | undefined,
  lists: readonly (readonly { dest?: string | null; vehicle?: string | null; lineId?: string | null }[] | null | undefined)[], notTo?: RegExp): string {
  if (!tube) return '';
  const own = usableDest(tube.dest, notTo); if (own) return own;
  const v = String(tube.vehicle || ''); if (!v) return '';
  for (const list of lists) for (const p of list || []) {
    if (String(p.vehicle || '') !== v || (tube.lineId && p.lineId && p.lineId !== tube.lineId)) continue;
    const d = usableDest(p.dest, notTo); if (d) return d;
  }
  return '';
}
