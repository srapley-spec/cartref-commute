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
 * The top card: the best option, and the next best alternative (any route, possibly the same one).
 * Every route is weighed; none is shown just because it's a different route.
 * "now" (Leave now / Leave around): best = earliest arrival (then latest leave). Alternative = the best of the
 *   options that leave later (the one to fall back on if you miss the best); anything leaving earlier and
 *   arriving later is strictly worse, so it's never the alternative.
 * "by" (Arrive by): best = the latest leave that arrives in time. Alternative = an earlier leave that arrives
 *   sooner (more margin). If nothing arrives in time: the earliest late arrival, then the best later leave.
 * The alternative must be close to the best: arriving within `windowMin` of it ("now"), or leaving within
 * `windowMin` before it ("by"). Otherwise the card shows the best alone; the list still has everything.
 * Missed and uncertain trains are never picked. Warnings never stop a train being picked.
 * Returns [best] or [best, alternative], in that order.
 */
export function topPicks<T extends Option>(options: T[], view: "by" | "now", windowMin = 20): T[] {
  const win = windowMin * 60e3;
  const usable = options.filter(j => !j.uncertain && !j.missed);
  if (!usable.length) return [];
  const byArrival = (a: T, b: T) => a.arrive - b.arrive || b.leave - a.leave;
  const byLeave = (a: T, b: T) => b.leave - a.leave || a.arrive - b.arrive;
  const laterLeave = (best: T) => usable.filter(j => j !== best && j.leave > best.leave && j.arrive - best.arrive <= win).sort(byArrival)[0];
  let best: T, alt: T | undefined;
  const onTime = view === "by" ? usable.filter(j => !j.late) : [];
  if (onTime.length) {
    best = onTime.slice().sort(byLeave)[0];
    alt = onTime.filter(j => j !== best && j.arrive < best.arrive && best.leave - j.leave <= win).sort(byLeave)[0];
  } else {
    best = usable.slice().sort(byArrival)[0];
    alt = laterLeave(best);
  }
  return alt ? [best, alt] : [best];
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
