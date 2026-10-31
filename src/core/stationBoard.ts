// Live before a journey: the departure board at the next stop of your journey (Sam, 31 Oct).
// Generic: the stops come from the routes (where each route first boards), the trains from the boards already
// loaded, and whether you can catch each one from the options the planner already built from where you are.
// Nothing here reads a clock, the DOM or the network; nothing hides a train.
import type { Board, Effort, Option, StationCode, Train } from "./types";
import type { Route } from "./journey";
import type { ConnectionPlan, Departure, Timed } from "./connections";

/** Where a journey first boards: a rail station (its trains come from the boards), or a stop on a frequent
 *  service with live departures (e.g. the tube from the office). */
export interface BoardStop { code: StationCode; name: string; kind: "rail" | "tube"; }

/** Can you catch it from where you are: an effort level (walk … none = can't make it), or unknown when no plan
 *  covers it (e.g. the way to the station isn't planned yet). */
export type Reach = Effort | "unknown";

export interface BoardRow {
  train: Train;
  /** The stations this train takes you to on your journey (the routes it serves), e.g. ["KGX"]. */
  routes: StationCode[];
  /** Null when the train is cancelled: it isn't running, so there's nothing to make (its flag says so). */
  reach: Reach | null;
  /** When you'd arrive on this train (door to door), when a plan covers it. */
  arrive: number | null;
  /** The option for this train at this station (an option's own train, or one of its other stops), if any. */
  option: Option | null;
}
export interface StationBoardGroup { stop: BoardStop; rows: BoardRow[]; }

/**
 * The next stop of each route, distinct, in route order. A route boards at `firstStop` when it has one (a tube
 * before the train), otherwise at its train's station (the board key's origin).
 */
export function nextStops(routes: Route[]): BoardStop[] {
  const out: BoardStop[] = [];
  for (const r of routes) {
    const s: BoardStop = r.firstStop ? { ...r.firstStop } : { code: r.board.split("-")[0], name: r.fromName, kind: "rail" };
    if (!out.some(x => x.code === s.code && x.kind === s.kind)) out.push(s);
  }
  return out;
}

const sameTrain = (a: Train, b: Train) => a.from === b.from && a.std === b.std && a.operator === b.operator;
const EASE: Reach[] = ["walk", "fast", "run", "car", "none", "unknown"];
// Graded `missed` means unsuitable for the ordinary walking recommendation;
// run/car can still be real ways to catch it. Preserve that canonical effort.
const reachOf = (o: Option): Reach => o.effort ?? (o.missed ? "none" : "walk");

/**
 * Every train leaving each rail stop, grouped by stop, in departure order. A train on two boards from the same
 * station (e.g. one Thameslink to St Pancras and Farringdon) is one row serving both routes. Trains that have
 * left (more than 30 s ago) drop off; cancelled and "Delayed" trains stay, with their own flags on the train.
 * `options` are the planner's options from where you are, best first; they give each train's reach and arrival,
 * and the stop of the best one comes first.
 */
export function railStationBoard(i: { stops: BoardStop[]; boards: Record<string, Board | undefined>; options: Option[]; now: number }): StationBoardGroup[] {
  const rail = i.stops.filter(s => s.kind === "rail");
  const groups = rail.map(stop => {
    const rows: BoardRow[] = [];
    for (const [key, b] of Object.entries(i.boards)) {
      if (!b || key.split("-")[0] !== stop.code) continue;
      for (const t of b.services) {
        if (t.from !== stop.code) continue;
        if (!t.depUnknown && t.dep < i.now - 30e3) continue;
        const row = rows.find(r => sameTrain(r.train, t));
        if (row) { if (!row.routes.includes(t.to)) row.routes.push(t.to); if (row.train.derived && !t.derived) row.train = t; continue; }
        rows.push({ train: t, routes: [t.to], reach: "unknown", arrive: null, option: null });
      }
    }
    for (const row of rows) {
      // Cancelled: nothing to catch. Delayed with no estimate: nobody can say yet.
      if (row.train.cancelled) { row.reach = null; continue; }
      if (row.train.depUnknown) continue;
      // Options for this train at this station: an option's own train, or the same train as one of its stops.
      for (const o of i.options) for (const x of [o, ...(o.alts || [])]) {
        if (!sameTrain(x.train, row.train)) continue;
        const r = reachOf(x), cur = row.reach ?? "unknown";
        if (EASE.indexOf(r) < EASE.indexOf(cur) || (r === row.reach && row.arrive != null && x.arrive < row.arrive)) {
          row.reach = r; row.arrive = x.arrive; row.option = x;   // this station's option, not the main one elsewhere
        }
      }
    }
    rows.sort((a, b) => a.train.dep - b.train.dep || a.train.std.localeCompare(b.train.std));
    return { stop, rows };
  });
  // The stop your best option boards at comes first; otherwise route order.
  const first = (g: StationBoardGroup) => {
    const k = i.options.findIndex(o => [o, ...(o.alts || [])].some(x => x.train.from === g.stop.code));
    return k < 0 ? Infinity : k;
  };
  return groups.map((g, k) => ({ g, k })).sort((a, b) => first(a.g) - first(b.g) || a.k - b.k).map(x => x.g);
}

export interface TubeBoardRow<D extends Departure> {
  dep: D;
  /** walk: you can make it from where you are; early: before you'd normally reach the platform, only if you're
   *  already near it; none: can't make it from here. */
  reach: "walk" | "early" | "none";
  /** Where to get off and the train home it connects to, when one does. */
  timed: Timed<D> | null;
  /** The latest you can set off for it from where you are (departure − the walk to the platform), when reachable. */
  leaveBy: number | null;
}

/**
 * Every departure from a tube stop that hasn't left (30 s grace), soonest first, with what it connects to and
 * whether you can make it, from the connection plan for where you are (planConnection with no limit, and the same
 * `walkMs` to the platform). One leaving
 * before you'd normally reach the platform is "early" only when you're already at the stop (`atStop`), as Auto
 * offers it; from anywhere else it's "none".
 */
export function tubeStationBoard<D extends Departure>(departures: D[], plan: ConnectionPlan<D>, now: number, walkMs: number, atStop = false): TubeBoardRow<D>[] {
  const same = (a: Departure, b: Departure) => a.t === b.t && a.line === b.line && (a.vehicle ?? "") === (b.vehicle ?? "");
  return departures.filter(d => Number.isFinite(d.t) && d.t >= now - 30e3).sort((a, b) => a.t - b.t).map(dep => {
    const next = plan.next.find(x => same(x, dep)), early = plan.early.find(x => same(x, dep));
    const reach: TubeBoardRow<D>["reach"] = dep.t >= plan.ready ? "walk" : early && atStop ? "early" : "none";
    return { dep, reach, timed: next || early || null, leaveBy: reach === "walk" ? dep.t - walkMs : null };
  });
}

/** What the board says about reaching a train from where you are. Never removes the train. */
export function reachFlag(r: Reach | TubeBoardRow<Departure>["reach"]): { lvl: "ok" | "info" | "warn" | "bad"; txt: string } {
  switch (r) {
    case "walk": return { lvl: "ok", txt: "You can make it" };
    case "fast": return { lvl: "warn", txt: "Fast walk" };
    case "run": return { lvl: "warn", txt: "Run" };
    case "car": return { lvl: "warn", txt: "Car needed" };
    case "early": return { lvl: "warn", txt: "Only if you're near the platform" };
    case "none": return { lvl: "bad", txt: "Can't make it from here" };
    default: return { lvl: "info", txt: "Can't tell yet if you can make it" };
  }
}
