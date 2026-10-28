// Mixing live boards with the timetable: the live board reaches about 2 hours ahead, the timetable fills in beyond.
import type { Board, Direction, Option, Profile, Train } from "./types";

/** Latest live departure across the boards (0 when none). */
export const liveHorizon = (boards: Record<string, Board | null | undefined>) =>
  Math.max(0, ...Object.values(boards).flatMap(b => (b && b.services ? b.services.map(x => x.dep) : [])));

/** Timetable trains after the live horizon (plus a minute), added to the live boards; live wins where both exist. */
export function mergeBeyond(live: Record<string, Board>, tt: Record<string, Board | null | undefined>, hz: number): Record<string, Board> {
  for (const [k, B] of Object.entries(tt)) { if (!B) continue;
    const L = live[k] = live[k] || { services: [], msgs: [] };
    B.services.filter(x => x.dep > hz + 60e3).forEach(x => L.services.push(x));
    L.services.sort((a, b) => a.dep - b.dep); }
  return live;
}

/** In a mixed list, say which trains haven't been checked against live running. */
export function markTimetable<T extends Option>(opts: T[]): T[] {
  opts.forEach(o => { if (o.train.timetable) o.flags.push({ lvl: "info", txt: "Timetable only: not live-checked" }); });
  return opts;
}

/** Live board start offset, as the feed allows (−120…119 minutes). */
export const clampOffset = (min: number) => Math.max(-120, Math.min(119, Math.round(min)));

/**
 * The timetable may find a train at one London station but not the same train at the other. Which extra searches
 * to make (at most 6): one per missing station, near when it should be there, merging asks within 10 minutes.
 */
export function missingPairSearches(boards: Record<string, Board | null | undefined>, dir: Direction, p: Profile): { key: string; at: number }[] {
  const hubs = p.mergeHubs, key = (h: string) => (dir === "office" ? `${p.home}-${h}` : `${h}-${p.home}`);
  const same = (a: Train, b: Train) => a.operator === b.operator && a.arr != null && b.arr != null && Math.abs(dir === "office" ? a.dep - b.dep : a.arr - b.arr) <= 60e3;
  const svc = (h: string) => (boards[key(h)] || { services: [] as Train[] }).services;
  const asks: { key: string; at: number }[] = [];
  for (const h of hubs) for (const t of svc(h)) for (const o of hubs) {
    if (o === h || svc(o).some(x => same(x, t))) continue;
    const at = dir === "office" ? t.dep - 60e3 : t.dep - 15 * 60e3;
    if (!asks.some(q => q.key === key(o) && Math.abs(q.at - at) < 10 * 60e3)) asks.push({ key: key(o), at });
  }
  return asks.slice(0, 6);
}
