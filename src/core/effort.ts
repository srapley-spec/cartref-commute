// Effort levels: what it would take to catch each train, and which train gets you there first at each level.
// Generic: any route, any person. The profile says how fast you can go (fast walk, run, car or cab); the route's
// segments say which part of the time before the train is walking (the only part effort can shorten).
// Story: docs/stories/effort-levels.md
import type { Access, Effort, EffortProfile, Option } from "./types";
export type { Access, Effort, EffortProfile };
import { hhmm } from "./time";
import { fastWalkLegs } from "./journey";

export const EFFORTS: Effort[] = ["walk", "fast", "run", "car", "none"];
const rank = (e: Effort) => EFFORTS.indexOf(e);



/** Time needed from now to be ready for the train at each level (ms), or Infinity when the level doesn't apply. */
export function effortNeeds(a: Access, ep: EffortProfile): Record<Exclude<Effort, "none">, number> {
  const fixed = a.fixed, W = a.walkAvg, F = a.walkFast;
  // Running: up to runKm at runFactor × average pace, the rest at a fast walk; never slower than a fast walk.
  const runBudget = (ep.runKm / ep.walkKmh) * 3600;            // seconds of average-pace walking that runKm takes
  const p = Math.min(runBudget, W), fastRatio = W > 0 ? F / W : 1;
  const run = Math.min(F, F - p * fastRatio + p / ep.runFactor);
  // A car replaces the walking: your own from home, else a cab. No walking means nothing to replace.
  const km = (W / 3600) * ep.walkKmh;
  const car = W <= 0 ? Infinity : a.home ? ep.carFromHomeSecs : ep.cabWaitSecs + (km / ep.cabKmh) * 3600;
  const ms = (secs: number) => (isFinite(secs) ? Math.round(secs * 1000) : Infinity);   // whole ms, like every other time
  return {
    walk: ms(fixed + a.walk),
    fast: ms(fixed + Math.min(a.walk, F)),
    run: ms(fixed + Math.min(a.walk, run)),
    car: Math.min(ms(fixed + a.walk), ms(fixed + car)),
  };
}

/**
 * The easiest level that makes the train, leaving 30 s from now (`now + 30 s` is when you can set off, as everywhere
 * else). At the station the train leaves from, only "walk" (it leaves in a minute or more) or "none".
 * `prev`: the level last time; moving to an easier one needs `stickMs` in hand.
 */
export function effortFor(o: Option, now: number, ep: EffortProfile, atItsStation: boolean, prev?: Effort): Effort {
  const dep = o.train.dep;
  if (atItsStation) return dep >= now + 60e3 ? "walk" : "none";
  const a = o.access; if (!a) return o.leave >= now + 30e3 ? "walk" : "none";
  const avail = dep - (now + 30e3), need = effortNeeds(a, ep);
  for (const e of ["walk", "fast", "run", "car"] as const) {
    const slack = prev && rank(e) < rank(prev) ? ep.stickMs : 0;
    if (need[e] <= avail - slack) return e;
  }
  return "none";
}

/** The latest time you can set off at a level (ms), for "Leave by". Only for walk and fast. */
export function leaveBy(o: Option, e: Effort, ep: EffortProfile): number {
  if (e !== "fast" || !o.access) return o.leave;
  return o.train.dep - effortNeeds(o.access, ep).fast;
}

const LOZENGE: Record<Effort, { lvl: "warn" | "bad"; txt: string } | null> = {
  walk: null, fast: { lvl: "warn", txt: "Fast walk" }, run: { lvl: "warn", txt: "Run" },
  car: { lvl: "warn", txt: "Car needed" }, none: { lvl: "bad", txt: "Can't make it" },
};
/** A stable key for a train at one station on one day, across refreshes (for `prev`). The same train at two
 *  stations (one service ID) gets two keys: they leave at different times and need different walks. */
export const effortKey = (o: Option) =>
  `${o.train.serviceId || ""}|${o.train.from}|${o.train.std}|${o.train.operator || ""}|${new Date(o.train.dep).toDateString()}`;

/**
 * Leave now (live): every train that hasn't left, graded. Sets `effort`, `missed` (anything harder than a fast walk:
 * never on the top card), `leaveBy` (latest set-off at its level) and the lozenge. Cancelled and no-estimate
 * trains are `uncertain` and get no lozenge. Replaces liveAdjust's "Leave time passed" when the toggle is on.
 */
export function gradeEffort<T extends Option>(opts: T[], now: number, ep: EffortProfile,
  atStation: string | null, depStation: (o: T) => string, plannable: (o: T) => boolean, prev: Record<string, Effort> = {}): T[] {
  const keep = opts.filter(j => j.train.dep >= now);
  for (const j of keep) {
    j.uncertain = !plannable(j);
    const e = effortFor(j, now, ep, !!atStation && depStation(j) === atStation, prev[effortKey(j)]);
    j.effort = e; j.missed = rank(e) > rank("fast"); j.leaveBy = leaveBy(j, e, ep);
    // A fast walk is the plan for this train: leave, total time and the steps are all at a fast walk.
    if (e === "fast" && j.leaveBy !== j.leave) { (j as Option).legs = fastWalkLegs(j, j.leaveBy); j.leave = j.leaveBy; }
    const z = LOZENGE[e]; if (z && !j.uncertain) j.flags.unshift({ ...z });
  }
  return keep;
}

const FIRST_TXT: Record<Exclude<Effort, "none">, string> = {
  walk: "Arrives first", fast: "Arrives first · fast walk", run: "Arrives first · if you run", car: "Arrives first · by car",
};
/**
 * "Arrives first", per level of effort: at each level, the earliest arrival you could make with that much effort or
 * less (ties: the later leave, as the card) is marked — only if it beats every easier level's. `among`: the options that
 * count (e.g. Leave around's window); default all. Cancelled and no-estimate never. Sets `firstAt` and a lozenge
 * ("Arrives first", or "Arrives first · walking" when a harder level's lozenge is shown too);
 * returns the marked options, easiest level first. Options without `effort` count as "walk".
 */
export function markArrivesFirst<T extends Option>(list: T[], among: T[] = list): T[] {
  const ok = among.filter(j => !j.uncertain && j.effort !== "none");
  const out: T[] = []; let bestSoFar: T | null = null;
  for (const e of ["walk", "fast", "run", "car"] as const) {
    const can = ok.filter(j => rank(j.effort || "walk") <= rank(e));
    // Ties: the later leave (less waiting), as the card does.
    const w = can.reduce<T | null>((b, j) => (!b || j.arrive < b.arrive || (j.arrive === b.arrive && j.leave > b.leave) ? j : b), null);
    if (!w || (bestSoFar && !(w.arrive < bestSoFar.arrive))) continue;
    if (w === bestSoFar) continue;
    w.firstAt = e;
    // Walking: green. Needing more effort: amber, and it replaces the plain effort lozenge (one lozenge, not two).
    if (e !== "walk") { const z = LOZENGE[e]; w.flags = w.flags.filter(f => !(z && f.txt === z.txt)); }
    w.flags.unshift({ lvl: e === "walk" ? "ok" : "warn", txt: FIRST_TXT[e] });
    out.push(w); bestSoFar = w;
  }
  // With a harder level's lozenge too, the walking one says so: "Arrives first" alone would read as overall first.
  if (out.length > 1 && out[0].firstAt === "walk") { const f = out[0].flags.find(z => z.txt === FIRST_TXT.walk); if (f) f.txt = "Arrives first · walking"; }
  return out;
}

/**
 * Arrive by: the card's pick says what it is. "Latest for 08:30" when it's on time, "Least late for 08:30" when
 * nothing gets you there in time.
 */
export function markLatestFor<T extends Option>(best: T | undefined, T: number): void {
  if (!best) return;
  best.flags.unshift(best.late ? { lvl: "warn", txt: `Least late for ${hhmm(T)}` } : { lvl: "ok", txt: `Latest for ${hhmm(T)}` });
}

/** The card's extra lines: trains that need a run or a car and arrive sooner than the card's best. Soonest first. */
export function effortOffers<T extends Option>(firsts: T[], best: T | undefined): T[] {
  return firsts.filter(j => (j.firstAt === "run" || j.firstAt === "car") && (!best || j.arrive < best.arrive))
    .sort((a, b) => a.arrive - b.arrive);
}
