// Choosing and ordering options. Nothing here removes a train from a list.
import type { Direction, Option, Profile } from "./types";

/** Keep at least one option per route in the first n, dropping the lowest-ranked extra of another route. */
export function keepEveryRoute<T extends Option>(sorted: T[], n: number): T[] {
  const out = sorted.slice(0, n);
  for (const j of sorted) {
    if (out.some(o => o.hub === j.hub)) continue;
    for (let i = out.length - 1; i >= 0; i--) { const h = out[i].hub; if (out.filter(o => o.hub === h).length > 1) { out.splice(i, 1); break; } }
    if (out.length < n) out.push(j);
  }
  return out.sort((x, y) => sorted.indexOf(x) - sorted.indexOf(y));
}

/**
 * Best option per route for the top card, at most two, ordered by arrival.
 * "by" (Arrive by): the latest train per route that arrives in time; if none do, the earliest late one per route.
 * "now" (Leave now / Leave around): the earliest arrival per route.
 * Missed and uncertain trains are never picked. Warnings never stop a train being picked.
 */
export function topPicks<T extends Option>(options: T[], view: "by" | "now"): T[] {
  const usable = options.filter(j => !j.uncertain && !j.missed);
  const hubs = [...new Set(usable.map(j => j.hub))], picks: T[] = [];
  for (const h of hubs) {
    const mine = usable.filter(j => j.hub === h);
    if (view === "by") {
      const pick = mine.filter(j => !j.late).sort((a, b) => b.leave - a.leave)[0];
      if (pick) picks.push(pick);
    } else {
      picks.push(mine.reduce((a, b) => b.arrive < a.arrive || (b.arrive === a.arrive && b.leave > a.leave) ? b : a));
    }
  }
  if (view === "by" && !picks.length) hubs.forEach(h => { const late = usable.filter(j => j.hub === h).sort((a, b) => a.arrive - b.arrive)[0]; if (late) picks.push(late); });
  return picks.sort((a, b) => a.arrive - b.arrive || b.leave - a.leave).slice(0, 2);
}

/**
 * One train can call at several London stations in turn (e.g. Farringdon then St Pancras). Show it once:
 * the main option is the soonest arrival, then the latest leave; the others are kept as `alts`.
 * Same train = same operator and the same home-station time (departure to work, arrival home) within a minute.
 */
export function mergeSameTrain<T extends Option>(js: T[], dir: Direction, profile: Profile): T[] {
  const out: T[] = [], used = new Set<T>();
  const mergeable = (h: string) => profile.mergeHubs.includes(h);
  // Same train: one's stops include the other's station at that station's time; or (no stops known) the same
  // operator and the same home-station time.
  const callsAt = (x: T, y: T) => (x.train.calls || []).some(c => c.code === y.hub && c.t != null &&
    Math.abs(c.t - (dir === "office" ? (y.train.arr ?? 0) : y.train.dep)) <= 60e3);
  const sameRun = (a: T, b: T) => a !== b && a.train.operator === b.train.operator && a.hub !== b.hub && mergeable(a.hub) && mergeable(b.hub) &&
    (callsAt(a, b) || callsAt(b, a) ||
     Math.abs(dir === "office" ? a.train.dep - b.train.dep : (a.train.arr ?? 0) - (b.train.arr ?? 0)) <= 60e3);
  for (const j of js) {
    if (used.has(j)) continue;
    const group = [j, ...js.filter(o => !used.has(o) && sameRun(j, o))];
    group.forEach(g => used.add(g));
    if (group.length === 1) { out.push(j); continue; }
    // A boarding point you can still make comes before one you can't; then soonest arrival, then latest leave.
    const bad = (o: T) => (o.missed || o.uncertain ? 1 : 0);
    group.sort((a, b) => bad(a) - bad(b) || a.arrive - b.arrive || b.leave - a.leave || (a.hub === profile.mergeHubs[0] ? -1 : 1));
    const main = group[0]; main.alts = group.slice(1);
    out.push(main);
  }
  return out;
}
