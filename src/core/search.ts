// Searching the timetable: which searches to make for each kind of plan, run against an injected search function
// (the screen supplies TfL's journey planner), and which trains each plan offers. No network in here.
import type { Board, Direction, Option, Profile, StationCode, Train } from "./types";
import { hhmm } from "./time";
import { plannable } from "./rules";
import { mergeSameTrain, topPicks } from "./rank";
import { markArrivesFirst, markLatestFor, effortOffers } from "./effort";

/** What one search run returned and kept, per route, for "Why these trains?". */
export interface SearchDiag { searches: number; returned: number; kept: number; dropped: Record<string, number>; trains: string[]; }
export type Diag = Record<string, SearchDiag>;
/** A search: from, to, time, and whether the time is a departure or an arrival. */
export type SearchFn<J> = (from: StationCode, to: StationCode, t: number, timeIs: "Departing" | "Arriving") => Promise<J[]>;
/** One journey turned into a direct train (or null, with the reason it was dropped). */
export interface Converter<J> { train(j: J): { key: string; msgs: string[]; svc: Train } | null; dropReason(j: J): string; }
/** A round asks for at most one search per route: given the route's trains so far (and every route's). */
export type Round = (key: string, board: Board, all: Record<string, Board>) => { t: number; timeIs: "Departing" | "Arriving" } | null;
/** A search failure. `stop` = stop making requests (refused, timed out, unreachable). */
export interface SearchError extends Error { rateLimited?: boolean; timeout?: boolean; network?: boolean; }

/** The London station a board key is about ("LET-KGX" → "KGX"). */
export const hubOfKey = (k: string, p: Profile) => { const [a, b] = k.split("-"); return a === p.home ? b : a; };

/** Add a search's journeys to the boards (direct trains only, no duplicates); returns the latest departure added. */
export function addJourneys<J>(boards: Record<string, Board>, js: J[], key: string | null, diag: Diag | null, conv: Converter<J>, p: Profile): number {
  let last = 0;
  const d = key && diag ? (diag[key] = diag[key] || { searches: 0, returned: 0, kept: 0, dropped: {}, trains: [] }) : null;
  if (d) d.searches++;
  js.forEach(j => { const x = conv.train(j);
    if (d) { d.returned++; if (x) d.kept++; else { const r = conv.dropReason(j); d.dropped[r] = (d.dropped[r] || 0) + 1; } }
    if (!x) return;
    if (d) d.trains.push(`${x.svc.std} ${p.stationNames[x.svc.from]}`);
    const B = boards[x.key] = boards[x.key] || { services: [], msgs: [] };
    if (!B.services.some(s => s.dep === x.svc.dep && s.from === x.svc.from)) B.services.push(x.svc);
    B.msgs.push(...x.msgs); last = Math.max(last, x.svc.dep); });
  return last;
}

/**
 * Run searches in rounds: every route gets its first search before any gets a second, so a refusal can never
 * silently leave a route out. Stops making requests after a refusal, timeout or network failure.
 * Returns the boards, which routes got nothing (with why), and what each search returned.
 */
export async function searchRoutes<J>(keys: string[], rounds: Round[], search: SearchFn<J>, conv: Converter<J>, p: Profile) {
  const boards: Record<string, Board> = {}, ok: Record<string, boolean> = {}, why: Record<string, string> = {}, diag: Diag = {};
  keys.forEach(k => { boards[k] = { services: [], msgs: [] }; });
  let stopped: string | null = null;
  for (const round of rounds) for (const k of keys) {
    if (stopped) { why[k] = why[k] || stopped; continue; }
    const q = round(k, boards[k], boards); if (!q) continue;
    const [a, b] = k.split("-");
    try { addJourneys(boards, await search(a, b, q.t, q.timeIs), k, diag, conv, p); ok[k] = true; }
    catch (e) { const err = e as SearchError; why[k] = err.message; if (err.rateLimited || err.timeout || err.network) stopped = err.message; }
  }
  Object.values(boards).forEach(B => { B.services.sort((x, y) => x.dep - y.dep); B.msgs = [...new Set(B.msgs)]; });
  const failed: Record<string, string> = {}; keys.forEach(k => { if (!ok[k]) failed[k] = why[k] || "No trains found."; });
  return { boards, failed, diag };
}

/** Trains found for a route, counting a station that shares its tube stop (St Pancras with King's Cross). */
export function routeCount(k: string, all: Record<string, Board>, p: Profile): number {
  const hub = hubOfKey(k, p), twinHub = Object.keys(p.sharesTubeWith || {}).find(h => p.sharesTubeWith![h] === hub);
  const twin = twinHub ? (k.startsWith(p.home) ? `${p.home}-${twinHub}` : `${twinHub}-${p.home}`) : null;
  return (all[k] || { services: [] }).services.length + (twin && all[twin] ? all[twin].services.length : 0);
}

const lastDep = (B: Board) => (B.services.length ? B.services[B.services.length - 1].dep : 0);
export interface RoundOpts { keyed: boolean; earliestCatch: (hub: StationCode) => number; p: Profile; }

/** Leave now: from the first train you could still catch (on a train: 35 min back, to include it), then onwards. */
export function nowRounds(now: number, onTheLine: boolean, o: RoundOpts): Round[] {
  const start = (k: string) => (onTheLine ? now - 35 * 60e3 : now + Math.max(0, o.earliestCatch(hubOfKey(k, o.p)) - 15 * 60e3));
  const rounds: Round[] = [k => ({ t: start(k), timeIs: "Departing" }),
    // Without a key, a route with fewer than 2 trains gets one more search, 30 minutes later.
    (k, B, all) => (!o.keyed && routeCount(k, all, o.p) < 2 && !onTheLine ? { t: start(k) + 30 * 60e3, timeIs: "Departing" } : null)];
  if (o.keyed) for (let i = 0; i < 2; i++) rounds.push((k, B) => { const last = lastDep(B); return last && last < now + 2 * 3600e3 ? { t: last + 60e3, timeIs: "Departing" } : null; });
  return rounds;
}

/** Leave around T: the same searches as Leave now, as if it were T, reaching 100 minutes past it. */
export function aroundRounds(T: number, o: RoundOpts): Round[] {
  const start = (k: string) => T + Math.max(0, o.earliestCatch(hubOfKey(k, o.p)) - 15 * 60e3);
  const next: Round = (k, B) => { const last = lastDep(B); return last && last < T + 100 * 60e3 ? { t: last + 60e3, timeIs: "Departing" } : null; };
  const rounds: Round[] = [k => ({ t: start(k), timeIs: "Departing" }),
    (k, B, all) => (o.keyed || B.services.length < 3 ? next(k, B, all) : null)];
  if (o.keyed) rounds.push(next);
  return rounds;
}

/**
 * Arrive by T: the last trains that get you there (arriving searches), the next ones after (to show late options),
 * and from early enough that even the slowest train is included (with a key, walking forward from 100 min back).
 */
export function arriveByRounds(T: number, postTrain: (hub: StationCode) => number, o: RoundOpts): Round[] {
  const latest = (k: string) => T - postTrain(hubOfKey(k, o.p));
  const rounds: Round[] = [
    k => ({ t: latest(k), timeIs: "Arriving" }),
    (k, B) => { const deps = B.services.filter(s => (s.arr as number) <= latest(k)).map(s => s.dep);   // as always: no arrival time compares as 0
      return { t: (deps.length ? Math.max(...deps) : latest(k) - 35 * 60e3) + 60e3, timeIs: "Departing" }; },
    k => ({ t: latest(k) - (o.keyed ? 100 : o.p.maxTrainMin[hubOfKey(k, o.p)] + 15) * 60e3, timeIs: "Departing" }),
  ];
  if (o.keyed) for (let i = 0; i < 4; i++) rounds.push((k, B) => {
    const deps = B.services.map(s => s.dep).filter(d => d < latest(k)); const last = deps.length ? Math.max(...deps) : 0;
    return last && last < latest(k) - 20 * 60e3 ? { t: last + 60e3, timeIs: "Departing" } : null; });
  return rounds;
}

/** Can the live board cover this plan? (It starts up to 119 min ahead; Leave around starts 15 min before T,
 *  Arrive by 120 min before.) */
export const liveCovers = (view: "at" | "by", T: number, now: number) => T - (view === "at" ? 15 : 120) * 60e3 - now <= 119 * 60e3;

/**
 * Leave around T: trains leaving from 15 min before T (earlier leaves flagged) that haven't left; the card picks
 * from those leaving up to 10 min before T or later. In leaving order.
 */
export function aroundOptions<T extends Option>(opts: T[], T: number, now: number, mixed: boolean, dir: Direction, p: Profile, effort = false): T[] {
  let js = opts.filter(j => j.leave >= T - 15 * 60e3 && j.train.dep >= now);
  js.forEach(j => { j.uncertain = !plannable(j.train);
    if (j.leave < T) j.flags.unshift({ lvl: "warn", txt: `Leave ${Math.max(1, Math.round((T - j.leave) / 60e3))} min before ${hhmm(T)}` }); });
  if (mixed) js.forEach(o => { if (o.train.timetable) o.flags.push({ lvl: "info", txt: "Timetable only: not live-checked" }); });
  js = mergeSameTrain(js, dir, p);
  const window = js.filter(j => j.leave >= T - 10 * 60e3);
  topPicks(window, "now", p.topWindowMin).forEach((j, i) => { (j as Option).recommended = i + 1; });
  if (effort) markArrivesFirst(js, window);     // the card's window: the lozenge and the card agree
  return js.sort((x, y) => x.leave - y.leave || x.arrive - y.arrive);
}

/**
 * Arrive by T (options already re-timed from now): every train listed; on time ones under 5 min early are
 * "Cutting it fine", late ones say by how much; the card picks; in leaving order.
 */
export function arriveByOptions<T extends Option>(opts: T[], T: number, mixed: boolean, dir: Direction, p: Profile, effort = false): T[] {
  if (mixed) opts.forEach(o => { if (o.train.timetable) o.flags.push({ lvl: "info", txt: "Timetable only: not live-checked" }); });
  const js = mergeSameTrain(opts, dir, p);
  const onTime = js.filter(j => j.arrive <= T), late = js.filter(j => j.arrive > T);
  onTime.forEach(j => { if (T - j.arrive < 5 * 60e3) j.flags.unshift({ lvl: "warn", txt: "Cutting it fine", fine: true }); });
  late.forEach(j => { j.late = true; j.flags.unshift({ lvl: "bad", txt: `Late by ${Math.max(1, Math.round((j.arrive - T) / 60e3))} min` }); });
  const picks = topPicks([...onTime, ...late], "by", p.topWindowMin);
  picks.forEach((j, i) => { (j as Option).recommended = i + 1; });
  if (effort) {
    markLatestFor(picks[0], T);
    effortOffers(markArrivesFirst([...onTime, ...late]), picks[0]).forEach(j => { (j as Option).offer = true; });
  }
  return [...onTime, ...late].sort((x, y) => x.leave - y.leave || x.arrive - y.arrive);
}
