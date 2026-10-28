// Boarding (or getting off) at another station the same train calls at.
// A train from Farringdon that calls at St Pancras can also be caught at St Pancras, even when the
// search that found it didn't return the St Pancras departure. Derive it from the train's stops.
import type { Board, Direction, Profile, Train } from "./types";
import { hhmm } from "./time";

const keyOf = (from: string, to: string) => `${from}-${to}`;

/**
 * Returns boards with the missing same-train departures (home) or arrivals (to work) added.
 * Times come from the stop list when known (live data). When not (timetable), from the gap seen
 * between the two stations on other trains in the same boards; marked `estimated`. Never removes a train.
 */
export function addCallingAlternatives(boards: Record<string, Board | undefined>, dir: Direction, profile: Profile): Record<string, Board | undefined> {
  const hubs = profile.mergeHubs;
  const all: Train[] = Object.values(boards).flatMap(b => (b ? b.services : []));
  const hubOf = (t: Train) => (dir === "office" ? t.to : t.from);
  const timeAt = (t: Train) => (dir === "office" ? t.arr : t.dep);
  const same = (a: Train, b: Train) => a.operator === b.operator && a.arr != null && b.arr != null &&
    Math.abs(dir === "office" ? a.dep - b.dep : a.arr - b.arr) <= 60e3;

  // Typical minutes between two hubs on the same train, learnt from pairs already present.
  const gaps: Record<string, number[]> = {};
  for (const a of all) for (const b of all) {
    const ha = hubOf(a), hb = hubOf(b);
    if (a === b || ha === hb || !hubs.includes(ha) || !hubs.includes(hb) || !same(a, b)) continue;
    const ta = timeAt(a), tb = timeAt(b); if (ta == null || tb == null) continue;
    (gaps[keyOf(ha, hb)] ||= []).push(tb - ta);
  }
  const gap = (a: string, b: string): number | null => {
    const g = (gaps[keyOf(a, b)] || []).slice().sort((x, y) => x - y);
    return g.length ? g[Math.floor(g.length / 2)] : null;
  };

  const out: Record<string, Board | undefined> = {};
  for (const [k, b] of Object.entries(boards)) out[k] = b ? { services: b.services.slice(), msgs: b.msgs } : b;
  for (const t of all) {
    const hub = hubOf(t), ht = timeAt(t);
    if (!hubs.includes(hub) || !t.calls || ht == null || t.arr == null) continue;
    t.calls.forEach((c, i) => {
      if (!c.code || c.code === hub || !hubs.includes(c.code)) return;
      let at = c.t ?? null, estimated = false;
      if (at == null) { const g = gap(hub, c.code); if (g == null) return; at = ht + g; estimated = true; }
      const from = dir === "office" ? t.from : c.code, to = dir === "office" ? c.code : t.to;
      const key = keyOf(from, to), board = out[key] || (out[key] = { services: [], msgs: [] });
      const d: Train = dir === "office"
        ? { ...t, to, arr: at, arrLate: 0, calls: t.calls!.slice(0, i + 1), estimated, derived: true }
        : { ...t, from, dep: at, std: hhmm(at), depLate: 0, platform: null, calls: t.calls!.slice(i), estimated, derived: true };
      if (board!.services.some(s => same(s, d))) return;
      board!.services.push(d);
    });
  }
  for (const b of Object.values(out)) if (b) b.services.sort((x, y) => x.dep - y.dep);
  return out;
}
