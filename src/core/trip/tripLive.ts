// Live times for trips, within a budget (story "Live, and keeping you up to date"). Pure: boards are supplied.
import type { Board, Train } from "../types";
import { hhmm } from "../time";
import type { TripConfig } from "./config";
import type { Journey, Ride } from "./journeyCore";
import { isMain, mainRides, journeyTimes, journeyChanges, journeyFlags } from "./journeyCore";

export interface BoardRequest { from: string; to: string; key: string }
const keyOf = (r: Ride) => `${r.from.crs}-${r.to.crs}`;
const boardable = (r: Ride, now: number, cfg: TripConfig) => r.kind === "rail" && !!r.from.crs && !!r.to.crs &&
  r.arr > now && r.schedDep - now <= cfg.live.boardWindowMin * 60e3;

/**
 * Which boards to ask for this refresh, in priority order, shared by station pair, at most `maxBoards`:
 * the followed trip's next two rides, then each pick's first ride, then other first rides leaving within 30 min.
 */
export function liveBudget(journeys: Journey[], followed: Journey | null, now: number, cfg: TripConfig): BoardRequest[] {
  const out: BoardRequest[] = [], seen = new Set<string>();
  const add = (r: Ride | undefined) => { if (!r || !boardable(r, now, cfg)) return; const k = keyOf(r);
    if (seen.has(k) || out.length >= cfg.live.maxBoards) return; seen.add(k); out.push({ from: r.from.crs, to: r.to.crs, key: k }); };
  if (followed) mainRides(followed.rides).filter(r => r.arr > now).slice(0, 2).forEach(add);
  journeys.filter(j => j.recommended).sort((a, b) => (a.recommended as number) - (b.recommended as number)).forEach(j => add(mainRides(j.rides)[0]));
  journeys.filter(j => !j.recommended).forEach(j => { const r = mainRides(j.rides)[0]; if (r && r.schedDep - now <= cfg.live.firstWithinMin * 60e3) add(r); });
  return out;
}

/** The board's service for a ride: same timetabled departure, and the same destination when both are known. Two
 *  candidates and no destination to tell them apart: none (never a guess). */
export function matchRide(r: Ride, board: Board | undefined): Train | null {
  if (!board) return null;
  const std = hhmm(r.schedDep);
  const same = board.services.filter(s => s.std === std);
  const byDest = r.destination ? same.filter(s => !s.destination || s.destination.toLowerCase().includes(r.destination!.toLowerCase()) || r.destination!.toLowerCase().includes(s.destination.toLowerCase())) : same;
  return byDest.length === 1 ? byDest[0] : null;
}

/** A journey with live times on every ride a board covers; others keep their timetable and say "Not live".
 *  Times, changes and flags are recomputed from the segments and rides (never edited in place). */
export function applyLive(j: Journey, boards: Record<string, Board | undefined>, cfg: TripConfig): Journey {
  const rides = j.rides.map(r => {
    if (!isMain(r) || r.kind !== "rail") return r;
    const t = matchRide(r, boards[keyOf(r)]);
    if (!t) return { ...r, live: { dep: false, arr: false } };
    const arrKnown = t.arr != null && !t.arrUnknown;
    return { ...r, dep: t.dep, arr: arrKnown ? (t.arr as number) : r.arr, live: { dep: !t.depUnknown, arr: arrKnown },
      platform: t.platform, cancelled: t.cancelled, train: { ...t, from: r.from.crs, to: r.to.crs } };
  });
  const { leave, arrive } = journeyTimes(j.before, rides, j.after);
  const changes = journeyChanges(rides, cfg);
  const next: Journey = { ...j, rides, leave, arrive, changes };
  // Flags that don't come from the rides (how far the nearest station is) are kept as they were.
  next.flags = [...journeyFlags(next), ...j.flags.filter(f => /^Nearest station/.test(f.txt))];
  next.uncertain = mainRides(rides).some(r => r.cancelled || (r.train && (r.train.depUnknown || r.train.arrUnknown)));
  next.missed = changes.some(c => c.missed);
  return next;
}
