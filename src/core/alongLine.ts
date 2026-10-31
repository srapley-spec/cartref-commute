import type { LatLon } from './types';
import { km, lineProgress } from './geo';

export const ALONG_INTERESTS = ['views', 'places', 'engineering', 'operations'] as const;
export type AlongInterest = typeof ALONG_INTERESTS[number];
export type AlongPreferences = { interests: AlongInterest[]; depth: 'glance' | 'discover' | 'explore' };
export type AlongPoint = {
  kind?: 'station'; stationTime?: number | null; stationTiming?: string;
  id: string; title: string; geo: LatLon; hubs: string[]; tags: AlongInterest[];
  hook: string; notice: string; discover: string; explore: string;
  source: string; sourceTitle: string; visibility: string; radiusM?: number;
};
export function alongPreferences(value: unknown): AlongPreferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const interests = Array.isArray(v.interests) ? ALONG_INTERESTS.filter(i => (v.interests as unknown[]).includes(i)) : ['views', 'places'] as AlongInterest[];
  return { interests, depth: v.depth === 'glance' || v.depth === 'explore' ? v.depth : 'discover' };
}
export type AlongInput = {
  points: AlongPoint[]; line: LatLon[]; hub: string; reverse: boolean; now: number;
  preferences?: unknown; here?: LatLon | null; accuracy?: number; fixAt?: number;
  onboard: boolean; identityCertain: boolean; locationOK: boolean;
  from?: LatLon; to?: LatLon;
};
/** Editorial route positions are approximate. No timetable interpolation is promoted to GPS. */
export function alongLine(input: AlongInput) {
  const { line, now, here } = input, preferences = alongPreferences(input.preferences);
  const totalM = line.slice(1).reduce((sum, p, i) => sum + km(line[i], p) * 1000, 0);
  const finitePoint = (p: LatLon | null | undefined): p is LatLon => !!p && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  const usableLine = line.length > 1 && totalM > 0 && line.every(finitePoint);
  const position = usableLine && finitePoint(here) ? lineProgress(here, line) : null;
  const fresh = Number.isFinite(input.fixAt) && now >= input.fixAt! && now - input.fixAt! <= 60000;
  const reliable = !!position && fresh && input.locationOK && input.onboard && input.identityCertain &&
    Number.isFinite(input.accuracy) && input.accuracy! >= 0 && input.accuracy! <= 100 && position.offKm <= 0.5;
  const bounds = usableLine && input.from && input.to ? [lineProgress(input.from, line).frac, lineProgress(input.to, line).frac].sort((a,b) => a-b) : [0,1];
  const points = usableLine ? input.points.filter(p => p.hubs.includes(input.hub)).map(point => {
    const frac = lineProgress(point.geo, line).frac;
    const distanceM = reliable ? (frac - position!.frac) * totalM * (input.reverse ? -1 : 1) : null;
    const radius = (point.radiusM ?? 250) + (input.accuracy ?? 0);
    const state = distanceM === null ? 'browse' : distanceM > radius ? 'upcoming' : distanceM < -radius ? 'passed' : 'nearby';
    return { point, frac, distanceM, state, selected: point.kind === 'station' || point.tags.some(tag => preferences.interests.includes(tag)) };
  }).filter(p => p.frac >= bounds[0] - 0.002 && p.frac <= bounds[1] + 0.002)
    .sort((a,b) => (a.frac-b.frac) * (input.reverse ? -1 : 1)) : [];
  const relevant = points.filter(p => p.selected && p.point.kind !== 'station');
  const featured = relevant.find(p => p.state === 'nearby') ?? relevant.find(p => p.state === 'upcoming');
  return { points, preferences, reliable, markerBeforeId: reliable ? points.find(p => p.distanceM !== null && p.distanceM >= 0)?.point.id ?? null : null, featuredId: featured?.point.id ?? null,
    evidence: reliable ? 'Approximate position from your phone · route locations are approximate' :
      'Browse this route · current position unavailable or uncertain',
    empty: relevant.length === 0 };
}
