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
  /** Walking at the far end: searches from this many origin stations to the place itself per round (0: none). */
  placeSearches: number;
  round1Max: number; totalMax: number; behindMin: number; laterPairs: number; windowMin: number;
  closeKm: number; atStationM: number; endMatchM: number; replanMovedM: number;
  change: { riskMin: number; tightMin: number };
  live: { maxBoards: number; firstWithinMin: number; boardWindowMin: number; refreshMs: number };
  betterMin: number; otherStationsMax: number; topWindowMin: number;
  drive: { recheckMs: number; withinMin: number; moveMin: number };
  allow: TripAllowances;
}
export const TRIP_DEFAULTS: TripConfig = {
  // Great Britain (UK-wide Trip, 3 Nov 2026): England, Scotland and Wales with their islands, outlined roughly along
  // the coast so that Northern Ireland, Ireland and the Isle of Man are out (no National Rail, not in the station list
  // or TfL's planner). Approximate: a point at sea near the coast may fall either side. Until 3 Nov this was London,
  // the South East and the East of England.
  region: { s: 49.85, w: -8.70, n: 60.90, e: 1.80, outline: [
    [49.85, -6.60], [50.05, -5.80], [51.15, -5.00], [51.70, -5.60], [52.20, -4.90], [52.95, -4.95], [53.45, -4.80],
    [54.00, -3.40], [54.55, -3.70], [54.65, -5.25], [55.05, -5.35], [55.40, -5.95], [56.00, -6.70], [56.70, -7.20],
    [57.60, -7.90], [58.70, -7.40], [58.80, -3.60], [59.30, -3.80], [59.50, -1.90], [60.90, -1.70], [60.90, -0.50],
    [59.10, -1.00], [57.70, -1.50], [56.00, -1.90], [55.50, -1.20], [54.40, -0.20], [53.60, 0.50], [52.90, 1.80],
    [51.30, 1.80], [50.60, 0.60], [50.40, -1.30], [49.85, -5.90]] },
  reachKm: { walk: 3, cycle: 10, drive: 25 },
  nearest: 3, wellServed: 2, wellServedFactor: 2, placeSearches: 3,
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
export const OUTSIDE_REGION = "Outside the area this plans: Great Britain (England, Scotland and Wales by rail).";
