// Leave now: every train that hasn't left, re-timed from now, flagged (never hidden), ranked for the card.
import type { Option, Profile } from "./types";
import { plannable } from "./rules";
import { mergeSameTrain, topPicks } from "./rank";
import { gradeEffort, markArrivesFirst, effortOffers, type EffortProfile } from "./effort";
import type { Effort } from "./types";
import type { Direction } from "./types";

/**
 * Keep every train that hasn't left; flag the ones whose leave time has passed (run or bike) instead of dropping them.
 * At a station, for trains from that station, the walk to the platform is a guess (GPS can't tell concourse from
 * platform), so a train stays catchable until a minute before it leaves.
 */
export function liveAdjust<T extends Option>(opts: T[], now: number, atStation: string | null, depStation: (o: T) => string,
  effort?: { ep: EffortProfile; prev?: Record<string, Effort> } | null): T[] {
  // Effort levels (toggle): each train graded by what it takes to catch it, instead of "leave time passed".
  if (effort) return gradeEffort(opts, now, effort.ep, atStation, depStation, j => plannable(j.train), effort.prev);
  const t0 = now + 30e3;
  const keep = opts.filter(j => j.train.dep >= now);
  keep.forEach(j => {
    j.uncertain = !plannable(j.train);
    if (atStation && depStation(j) === atStation) { j.missed = j.train.dep < now + 60e3;
      if (j.missed) j.flags.unshift({ lvl: "bad", txt: "Leaving in under a minute" }); return; }
    j.missed = j.leave < t0;
    if (j.missed) j.flags.unshift({ lvl: "bad", txt: `Leave time passed: ${Math.max(1, Math.round((t0 - j.leave) / 60e3))} min short at walking pace, run or bike` });
  });
  return keep;
}

/**
 * The Leave now list: the same train at two stations merged, in leaving order. Marks the first train you can catch,
 * the fastest (earliest arrival, then latest leave), and the card's picks (`recommended` 1 and 2).
 */
export function rankNow<T extends Option>(opts: T[], dir: Direction, p: Profile, effort = false): T[] {
  if (!opts.length) return [];
  const list = (mergeSameTrain(opts, dir, p) as T[]).sort((a, b) => a.leave - b.leave || a.arrive - b.arrive);
  const usable = list.filter(j => !j.uncertain && !j.missed);
  if (usable.length) {
    (usable[0] as Option).first = true;
    (usable.reduce((a, b) => (b.arrive < a.arrive || (b.arrive === a.arrive && b.leave > a.leave) ? b : a)) as Option).fastest = true;
  }
  const picks = topPicks(list, "now", p.topWindowMin);
  picks.forEach((j, i) => { (j as Option).recommended = i + 1; });
  // Effort levels (toggle): "Arrives first" per level, and the run / car trains the card mentions.
  if (effort) effortOffers(markArrivesFirst(list), picks[0]).forEach(j => { (j as Option).offer = true; });
  return list;
}
