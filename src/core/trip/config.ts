// Trip mode settings: every threshold in the story (docs/stories/leisure-journeys.md), in one place.
// Profile-free on purpose: nothing here is Sam's commute. Callers may override any part.
export type AccessMode = "walk" | "cycle" | "drive";
export interface Region { s: number; w: number; n: number; e: number }
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
  region: { s: 50.55, w: -1.95, n: 52.75, e: 1.80 },          // London, the South East, the East of England
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
export const inRegion = (geo: [number, number], r: Region): boolean =>
  Array.isArray(geo) && Number.isFinite(geo[0]) && Number.isFinite(geo[1]) && geo[0] >= r.s && geo[0] <= r.n && geo[1] >= r.w && geo[1] <= r.e;
export const OUTSIDE_REGION = "Outside the area this plans: London, the South East and the East of England.";
