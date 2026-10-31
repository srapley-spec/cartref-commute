// Starting from another station on your line (31 Oct 2026: a demo somewhere in Hitchin, not at home).
// Generic: the profile lists stations you may start from (`startStations`, positions in `stationGeo`); this
// derives the same profile with that station as the local one. Nothing here reads a clock, the DOM or storage.
import type { LatLon, Profile, StationCode } from "./types";
import { km } from "./geo";

/** How far from a station you can be for it to count as the nearest one to start from (km). */
export const START_STATION_MAX_KM = 10;

/** Where a station is: the profile's own station position, or the home station's. */
function stationAt(p: Profile, code: StationCode): LatLon | null {
  if (code === p.home) return p.places.homeStation;
  return (p.stationGeo && p.stationGeo[code]) || null;
}

/** The stations you can start from (the home station first), with their names and positions. */
export function startStationChoices(p: Profile): { code: StationCode; name: string; geo: LatLon }[] {
  const out = [{ code: p.home, name: p.stationNames[p.home] || p.home, geo: p.places.homeStation }];
  for (const [code, s] of Object.entries(p.startStations || {})) {
    const geo = stationAt(p, code);
    if (geo && code !== p.home) out.push({ code, name: s.name, geo });
  }
  return out;
}

/** The start station nearest to `here`, within START_STATION_MAX_KM; null if none is that close. */
export function nearestStartStation(here: LatLon, p: Profile): { code: StationCode; name: string; km: number } | null {
  let best: { code: StationCode; name: string; km: number } | null = null;
  for (const s of startStationChoices(p)) {
    const d = km(here, s.geo);
    if (d <= START_STATION_MAX_KM && (!best || d < best.km)) best = { code: s.code, name: s.name, km: d };
  }
  return best;
}

/** `line` (from the home station towards London) starting at `pt` instead: the point, then every vertex after
 *  the segment `pt` is nearest to. */
export function lineFrom(line: LatLon[], pt: LatLon): LatLon[] {
  if (line.length < 2) return [pt, ...line];
  const toSeg = (a: LatLon, b: LatLon) => {
    // Flat projection is fine at this scale (a few km).
    const kx = Math.cos(pt[0] * Math.PI / 180), ax = a[1] * kx, ay = a[0], bx = b[1] * kx, by = b[0], px = pt[1] * kx, py = pt[0];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  let bi = 0, bd = Infinity;
  for (let i = 0; i < line.length - 1; i++) { const d = toSeg(line[i], line[i + 1]); if (d < bd) { bd = d; bi = i; } }
  // A vertex at the station itself (within 50 m) isn't repeated.
  const rest = line.slice(bi + 1);
  while (rest.length > 1 && km(rest[0], pt) < 0.05) rest.shift();
  return [pt, ...rest];
}

/**
 * The profile with `code` as the local station: trains from and to there, its position for "near the station",
 * the line from there to each London station, and the busy-train rule moved with it. The home station itself (or
 * an unknown code) returns the profile unchanged. Timings that are about the home station (the walk from home,
 * entry and exit allowances) stay as they are; the screen works out the walk from where you are.
 */
export function profileFromStation(p: Profile, code: StationCode | null | undefined): Profile {
  if (!code || code === p.home) return p;
  const s = p.startStations && p.startStations[code], geo = s ? stationAt(p, code) : null;
  if (!s || !geo) return p;
  const lines: Record<StationCode, LatLon[]> = {};
  for (const [hub, line] of Object.entries(p.lines)) lines[hub] = lineFrom(line, geo);
  return {
    ...p,
    home: code,
    stationNames: { ...p.stationNames, [code]: s.name },
    stationPatterns: { ...p.stationPatterns, [code]: s.pattern },
    coords: { ...p.coords, [code]: `${geo[0]},${geo[1]}` },
    lines,
    places: { ...p.places, homeStation: geo },
    busy: p.busy.from === p.home ? { ...p.busy, from: code } : p.busy,
  };
}
