// What Google Maps finds that the app's planner did not (docs/stories/trip-taxi-and-google-gaps.md). Pure: Google's
// routes come in through a port as plain data; this only compares them with the app's best and words the gap.
// A gap is shown, never silently merged: it has no station identity for live boards or Follow, so it is advice.
import { hhmm, dur } from "../time";
import type { Journey } from "./journeyCore";
import type { TripQuestion } from "./tripRank";

export type GapLegKind = "rail" | "tube" | "bus" | "walk" | "other";
/** One leg of a route from another planner, as plain data. Times are epoch ms; names are the planner's. */
export interface GapLeg { kind: GapLegKind; from: string; to: string; dep: number; arr: number; line?: string; secs?: number }
/** A door-to-door route from another planner. `depart` / `arrive` include its own walks. */
export interface GapRoute { depart: number; arrive: number; legs: GapLeg[]; source: string }
export interface Gap {
  source: string; depart: number; arrive: number; soonerMin: number | null; legs: GapLeg[];
  /** One line for the screen: the rides, with their times. */
  text: string; why: string;
}

const rideText = (l: GapLeg) => `${l.from} ${hhmm(l.dep)} → ${l.to} ${hhmm(l.arr)}${l.line ? ` (${l.line})` : ""}`;

/**
 * Routes from another planner that beat the app's best by `gapMin` minutes or more, or any rail-only route when the
 * app found nothing it could pick. Routes with a bus leg are not rail answers and are ignored. At most `max`,
 * soonest arrival first; the same trains listed once.
 */
export function googleGaps(routes: GapRoute[], picks: Journey[], q: TripQuestion, gapMin: number, max = 2): Gap[] {
  const best = picks[0];
  const seen = new Set<string>();
  const out: Gap[] = [];
  for (const r of routes.slice().sort((a, b) => a.arrive - b.arrive)) {
    const rides = r.legs.filter(l => l.kind !== "walk");
    if (!rides.length || rides.some(l => l.kind === "bus")) continue;
    if (q.kind === "by" && r.arrive > q.t) continue;
    const key = rides.map(l => `${l.from}|${l.dep}|${l.to}`).join(",");
    if (seen.has(key)) continue;
    const soonerMin = best ? Math.round((best.arrive - r.arrive) / 60e3) : null;
    if (best && soonerMin !== null && soonerMin < gapMin) continue;
    seen.add(key);
    const why = best ? `arrives ${dur(best.arrive - r.arrive)} sooner than the best found here; not in TfL's planner, so no live times or Follow for it`
      : "nothing here could be recommended; not in TfL's planner, so no live times or Follow for it";
    out.push({ source: r.source, depart: r.depart, arrive: r.arrive, soonerMin, legs: r.legs, why,
      text: `Leave ${hhmm(r.depart)}, arrive ${hhmm(r.arrive)}: ${rides.map(rideText).join(" · ")}` });
    if (out.length >= max) break;
  }
  return out;
}
