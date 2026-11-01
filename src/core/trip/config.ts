// Trip mode settings: every threshold in the story (docs/stories/leisure-journeys.md), in one place.
// Profile-free on purpose: nothing here is Sam's commute. Callers may override any part.
export type AccessMode = "walk" | "cycle" | "drive";
/** The area Trip plans in: a bounding box (what Google's address search is restricted to) and, inside it, an outline
 *  ([lat, lon] points) that decides what is in. */
export interface Region { s: number; w: number; n: number; e: number; outline?: [number, number][] }
export interface TripAllowances { parkMin: number; lockMin: number; stationMin: number; exitMin: number; carBackMin: number }
export interface TripConfig {
  region: Region;
  reachKm: Record<AccessMode, number>;
  nearest: number; wellServed: number; wellServedFactor: number;
  round1Max: number; totalMax: number; behindMin: number; laterPairs: number; windowMin: number;
  closeKm: number; atStationM: number; endMatchM: number; replanMovedM: number;
  change: { riskMin: number; tightMin: number };
  live: { maxBoards: number; firstWithinMin: number; boardWindowMin: number; refreshMs: number };
  betterMin: number; otherStationsMax: number; topWindowMin: number;
  drive: { recheckMs: number; withinMin: number; moveMin: number };
  allow: TripAllowances;
}
export const TRIP_DEFAULTS: TripConfig = {
  // London, the South East and the East of England, outlined roughly along their county edges (Hampshire, Berkshire,
  // Oxfordshire, Buckinghamshire, Bedfordshire, Cambridgeshire, Norfolk): Swindon, Coventry and Northampton are out;
  // north Norfolk (Cromer, Sheringham, King's Lynn) is in. Approximate: a place within a few km of a county edge may
  // fall either side.
  region: { s: 50.55, w: -1.95, n: 53.0, e: 1.80, outline: [
    [50.55, -1.95], [51.00, -1.95], [51.20, -1.63], [51.45, -1.58], [51.60, -1.68], [51.85, -1.72], [52.10, -1.55],
    [52.17, -1.30], [52.05, -1.05], [52.20, -0.70], [52.32, -0.45], [52.55, -0.30], [52.75, -0.05], [52.80, 0.20],
    [53.00, 0.60], [53.00, 1.80], [50.55, 1.80]] },
  reachKm: { walk: 3, cycle: 10, drive: 25 },
  nearest: 3, wellServed: 2, wellServedFactor: 2,
  round1Max: 9, totalMax: 18, behindMin: 30, laterPairs: 3, windowMin: 100,
  closeKm: 1.5, atStationM: 400, endMatchM: 300, replanMovedM: 500,
  change: { riskMin: 2, tightMin: 5 },
  live: { maxBoards: 6, firstWithinMin: 30, boardWindowMin: 119, refreshMs: 30e3 },
  betterMin: 5, otherStationsMax: 4, topWindowMin: 20,
  drive: { recheckMs: 5 * 60e3, withinMin: 60, moveMin: 2 },
  allow: { parkMin: 10, lockMin: 4, stationMin: 3, exitMin: 3, carBackMin: 5 },
};
/** Defaults with any overrides; allowances are clamped to 0–60 min (Settings range). */
export function tripConfig(over: Partial<TripConfig> = {}): TripConfig {
  const allow = { ...TRIP_DEFAULTS.allow, ...(over.allow || {}) };
  (Object.keys(allow) as (keyof TripAllowances)[]).forEach(k => {
    const v = Number(allow[k]); allow[k] = Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : TRIP_DEFAULTS.allow[k]; });
  return { ...TRIP_DEFAULTS, ...over, allow,
    change: { ...TRIP_DEFAULTS.change, ...(over.change || {}) }, live: { ...TRIP_DEFAULTS.live, ...(over.live || {}) },
    drive: { ...TRIP_DEFAULTS.drive, ...(over.drive || {}) }, reachKm: { ...TRIP_DEFAULTS.reachKm, ...(over.reachKm || {}) } };
}
/** Inside the box and, when there is one, inside the outline (ray casting; a point on an edge counts as in). */
export function inRegion(geo: [number, number], r: Region): boolean {
  if (!Array.isArray(geo) || !Number.isFinite(geo[0]) || !Number.isFinite(geo[1])) return false;
  const [y, x] = geo;
  if (y < r.s || y > r.n || x < r.w || x > r.e) return false;
  const o = r.outline; if (!o || o.length < 3) return true;
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [yi, xi] = o[i], [yj, xj] = o[j];
    if ((yi > y) !== (yj > y) && x <= (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const OUTSIDE_REGION = "Outside the area this plans: London, the South East and the East of England.";
