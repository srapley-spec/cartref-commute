// Stations near a place, and which ones to try (story "Which stations"). Pure: the station list is injected data.
import { km } from "../geo";
import type { StationIndex, LatLon } from "./ports";
import type { Station } from "./journeyCore";
import type { AccessMode, TripConfig } from "./config";

/** A StationIndex over a list (data/stations.json). Positions are [lat, lon]. */
export function stationIndex(list: Station[]): StationIndex {
  const byCrs = new Map(list.map(s => [s.crs, s] as const));
  const byId = new Map<string, Station>();
  list.forEach(s => Object.entries(s.ids || {}).forEach(([p, ids]) => ids.forEach(id => byId.set(`${p}:${id}`, s))));
  return {
    near: (geo, k) => list.map(s => ({ s, d: km(geo, s.geo) })).filter(x => x.d <= k).sort((a, b) => a.d - b.d).map(x => x.s),
    byCrs: crs => byCrs.get(String(crs).toUpperCase()) || null,
    byId: (p, id) => byId.get(`${p}:${id}`) || null,
    nearestTo: (geo, m) => { let best: Station | null = null, bd = Infinity;
      for (const s of list) { const d = km(geo, s.geo) * 1000; if (d < bd) { bd = d; best = s; } }
      return bd <= m ? best : null; },
    all: () => list,
  };
}

export type CandidateWhy = "nearest" | "served" | "promoted" | "fallback";
export interface Candidate { station: Station; km: number; why: CandidateWhy }
export interface Candidates { list: Candidate[]; farKm?: number }

/**
 * Candidates for one end: the `nearest` within the mode's reach, plus up to `wellServed` within reach whose
 * servicePerHour is at least `wellServedFactor` × the best of the nearest ones (highest first). None within reach:
 * the nearest station, with how far it is.
 */
export function candidates(geo: LatLon, mode: AccessMode, idx: StationIndex, cfg: TripConfig): Candidates {
  const reach = cfg.reachKm[mode];
  const within = idx.near(geo, reach).map(s => ({ station: s, km: km(geo, s.geo) }));
  if (!within.length) {
    const all = idx.all().map(s => ({ station: s, km: km(geo, s.geo) })).sort((a, b) => a.km - b.km);
    return all.length ? { list: [{ ...all[0], why: "fallback" }], farKm: all[0].km } : { list: [] };
  }
  const nearest = within.slice(0, cfg.nearest).map(c => ({ ...c, why: "nearest" as const }));
  const bar = Math.max(0, ...nearest.map(c => c.station.servicePerHour || 0)) * cfg.wellServedFactor;
  const served = within.slice(cfg.nearest).filter(c => (c.station.servicePerHour || 0) > 0 && (c.station.servicePerHour || 0) >= bar)
    .sort((a, b) => b.station.servicePerHour - a.station.servicePerHour || a.km - b.km).slice(0, cfg.wellServed)
    .map(c => ({ ...c, why: "served" as const }));
  return { list: [...nearest, ...served] };
}

/** A station a round-1 journey boards or changes at, within reach of this end and not yet a candidate (live data). */
export function promote(geo: LatLon, mode: AccessMode, current: Candidate[], seen: Station[], cfg: TripConfig): Candidate[] {
  const have = new Set(current.map(c => c.station.crs)), out: Candidate[] = [];
  for (const s of seen) {
    if (have.has(s.crs)) continue;
    const d = km(geo, s.geo); if (d > cfg.reachKm[mode]) continue;
    have.add(s.crs); out.push({ station: s, km: d, why: "promoted" });
  }
  return out;
}

/** Round-1 station pairs: nearest From × every To candidate, and every From candidate × nearest To (≤ round1Max). */
export function roundOnePairs(from: Candidate[], to: Candidate[], cfg: TripConfig): [Station, Station][] {
  if (!from.length || !to.length) return [];
  const out: [Station, Station][] = [], seen = new Set<string>();
  const add = (a: Station, b: Station) => { const k = `${a.crs}-${b.crs}`; if (a.crs === b.crs || seen.has(k) || out.length >= cfg.round1Max) return; seen.add(k); out.push([a, b]); };
  to.forEach(t => add(from[0].station, t.station));
  from.forEach(f => add(f.station, to[0].station));
  return out;
}
