// Ranking trips with the commute's top-card rule (rank.ts topPicks), and "Other stations" with their consequence.
import { topPicks } from "../rank";
import type { Option } from "../types";
import type { Journey } from "./journeyCore";
import type { TripConfig } from "./config";

export type TripQuestion = { kind: "now" | "at" | "by"; t: number };
const asRankable = (js: Journey[]) => js as unknown as Option[];   // topPicks reads only leave/arrive/uncertain/missed/late

/** Flags that depend on the question; the list in leaving order; the picks marked `recommended` 1 and 2. */
export function rankTrips(js: Journey[], q: TripQuestion, now: number, cfg: Pick<TripConfig, "topWindowMin">): Journey[] {
  for (const j of js) {
    j.flags = j.flags.filter(f => !/^(Leave time passed|Late by|Leave \d+ min before)/.test(f.txt));
    j.late = false; delete j.recommended;
    if (j.leave < now) j.flags.unshift({ lvl: "warn", txt: "Leave time passed" });
    if (q.kind === "by" && j.arrive > q.t) { j.late = true; j.flags.unshift({ lvl: "bad", txt: `Late by ${Math.max(1, Math.floor((j.arrive - q.t) / 60e3))} min` }); }
    if (q.kind === "at" && j.leave < q.t) j.flags.unshift({ lvl: "warn", txt: `Leave ${Math.max(1, Math.round((q.t - j.leave) / 60e3))} min before ${new Date(q.t).toTimeString().slice(0, 5)}` });
  }
  const usable = js.filter(j => j.leave >= now - 30e3 || q.kind === "by");
  const picks = topPicks(asRankable(usable), q.kind === "by" ? "by" : "now", cfg.topWindowMin) as unknown as Journey[];
  picks.forEach((j, i) => { j.recommended = i + 1; });
  return js.slice().sort((a, b) => a.leave - b.leave || a.arrive - b.arrive);
}

export interface OtherStation { end: "from" | "to"; station: string; crs: string; journey: Journey; arriveMin: number; leaveMin: number; text: string }
/** The best journey from (or to) each other station, with what it costs against the best. At most `max`. */
export function otherStations(js: Journey[], best: Journey | undefined, max: number): OtherStation[] {
  if (!best) return [];
  const out: OtherStation[] = [];
  const bestPer = (key: (j: Journey) => string) => {
    const m = new Map<string, Journey>();
    for (const j of js) { if (j.uncertain || j.missed) continue; const k = key(j); const c = m.get(k); if (!c || j.arrive < c.arrive || (j.arrive === c.arrive && j.leave > c.leave)) m.set(k, j); }
    return m;
  };
  const say = (end: "from" | "to", j: Journey): OtherStation => {
    const a = Math.round((j.arrive - best.arrive) / 60e3), l = Math.round((best.leave - j.leave) / 60e3);
    const name = end === "from" ? j.fromStation.name : j.toStation.name;
    const arr = a === 0 ? "arrive at the same time" : a > 0 ? `arrive ${a} min later` : `arrive ${-a} min sooner`;
    const lv = l === 0 ? "" : l > 0 ? `, leave ${l} min earlier` : `, leave ${-l} min later`;
    return { end, station: name, crs: end === "from" ? j.fromStation.crs : j.toStation.crs, journey: j, arriveMin: a, leaveMin: l, text: `${end === "from" ? "From" : "To"} ${name}: ${arr}${lv}` };
  };
  bestPer(j => j.fromStation.crs).forEach((j, crs) => { if (crs !== best.fromStation.crs) out.push(say("from", j)); });
  bestPer(j => j.toStation.crs).forEach((j, crs) => { if (crs !== best.toStation.crs) out.push(say("to", j)); });
  return out.sort((a, b) => a.arriveMin - b.arriveMin).slice(0, max);
}

/** A journey found later that arrives at least `betterMin` sooner than the one shown: "Better option found". */
export function betterOption(prev: Journey | undefined, next: Journey | undefined, betterMin: number): boolean {
  return !!(prev && next && prev.id !== next.id && prev.arrive - next.arrive >= betterMin * 60e3);
}
