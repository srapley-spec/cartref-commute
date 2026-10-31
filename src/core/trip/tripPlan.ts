// Planning a trip through the ports. Async but pure: no clock (now is an input), no network (ports are injected),
// no caching (the shell wraps the ports). Emits stages so the screen can draw before everything has arrived.
import { km } from "../geo";
import { runRounds } from "../rounds";
import type { Segment } from "../journey";
import type { AccessMode, TripConfig } from "./config";
import { inRegion, OUTSIDE_REGION } from "./config";
import type { Place, Timing, TripPorts, LatLon } from "./ports";
import type { Journey, RailJourney, Station } from "./journeyCore";
import { buildJourney, mainRides } from "./journeyCore";
import { candidates, promote, roundOnePairs, type Candidate } from "./stations";
import { beforeSegments, afterSegments } from "./access";
import { rankTrips, otherStations, type TripQuestion, type OtherStation } from "./tripRank";

export interface TripRequest {
  from: Place; to: Place; modes: { from: AccessMode; to: AccessMode };
  question: TripQuestion; now: number; leisureKmh: number; cfg: TripConfig;
}
export type TripStageName = "timetable" | "complete";
export interface TripResult {
  stage: TripStageName; journeys: Journey[]; picks: Journey[]; others: OtherStation[];
  candidates: { from: Candidate[]; to: Candidate[] }; failed: { pair: string; why: string }[];
  close: boolean; requests: { planner: number; access: number }; notes: string[];
}
export class TripError extends Error { constructor(msg: string, readonly code: "outside" | "no-stations" | "no-access") { super(msg); } }

type AccessMap = Map<string, Timing | null>;
const pairKey = (a: Station, b: Station) => `${a.crs}-${b.crs}`;

export async function planTrip(req: TripRequest, ports: TripPorts, onStage?: (r: TripResult) => void): Promise<TripResult> {
  const { from, to, modes, question: q, now, cfg } = req;
  if (!inRegion(from.geo, cfg.region) || !inRegion(to.geo, cfg.region)) throw new TripError(OUTSIDE_REGION, "outside");
  const cf = candidates(from.geo, modes.from, ports.stations, cfg), ct = candidates(to.geo, modes.to, ports.stations, cfg);
  if (!cf.list.length || !ct.list.length) throw new TripError("No railway station found near one of the places.", "no-stations");
  const close = km(from.geo, to.geo) <= cfg.closeKm;
  const requests = { planner: 0, access: 0 }, failed: { pair: string; why: string }[] = [], notes: string[] = [];
  const accFrom: AccessMap = new Map(), accTo: AccessMap = new Map();
  const setOff = q.kind === "by" ? q.t - 3 * 3600e3 : q.kind === "at" ? q.t : now;   // drive timing only
  const timeAccess = async (place: LatLon, list: Candidate[], mode: AccessMode, dir: "to" | "from", into: AccessMap) => {
    const todo = list.filter(c => !into.has(c.station.crs)); if (!todo.length) return;
    requests.access++;
    const res = await ports.access.matrix(place, todo.map(c => c.station.geo), mode, setOff, dir);
    todo.forEach((c, i) => into.set(c.station.crs, res[i] ?? null));
  };
  const rail = new Map<string, RailJourney[]>();
  const search = async (pair: [Station, Station], t: number, timeIs: "Departing" | "Arriving") => {
    requests.planner++;
    const r = await ports.planner.plan(pair[0], pair[1], t, timeIs);
    const k = pairKey(pair[0], pair[1]);
    const have = rail.get(k) || [], ids = new Set(have.map(j => mainRides(j.rides).map(x => x.schedDep).join(",")));
    r.journeys.forEach(j => { const id = mainRides(j.rides).map(x => x.schedDep).join(","); if (!ids.has(id)) { ids.add(id); have.push(j); } });
    rail.set(k, have);
    if (!r.journeys.length) throw Object.assign(new Error(r.refused[0] || "No journeys found."), {});
  };
  const timeIs: "Departing" | "Arriving" = q.kind === "by" ? "Arriving" : "Departing";
  const t0 = q.kind === "now" ? now : q.t;
  const p1 = roundOnePairs(cf.list, ct.list, cfg);
  const runPairs = async (pairs: [Station, Station][], at: (p: [Station, Station]) => number, ti: "Departing" | "Arriving") => {
    const res = await runRounds(pairs, [() => true], p => search(p, at(p), ti), { concurrency: pairs.length || 1, maxRequests: cfg.totalMax - requests.planner });
    res.why.forEach((why, p) => failed.push({ pair: `${p[0].name} → ${p[1].name}`, why }));
    return res;
  };
  // Round 1 and both ends' station times at once (the From end may already be cached by the shell's prefetch).
  await Promise.all([
    timeAccess(from.geo, cf.list, modes.from, "to", accFrom).catch(e => { notes.push(`Times to the stations: ${e.message}`); }),
    timeAccess(to.geo, ct.list, modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); }),
    runPairs(p1, () => t0, timeIs),
  ]);
  if (![...accFrom.values()].some(Boolean) || ![...accTo.values()].some(Boolean)) throw new TripError(notes[0] || "Couldn't time the way to or from the stations.", "no-access");

  const assemble = (stage: TripStageName): TripResult => {
    const js: Journey[] = [];
    const fromKm = cf.farKm, toKm = ct.farKm;
    rail.forEach(list => list.forEach(rj => {
      const a = rj.rides[0].from, b = rj.rides[rj.rides.length - 1].to;
      const ta = accFrom.get(a.crs), tb = accTo.get(b.crs); if (!ta || !tb) return;
      const atStation = from.kind === "current" && km(from.geo, a.geo) * 1000 <= cfg.atStationM;
      const before: Segment[] = beforeSegments(modes.from, ta, a, cfg.allow, req.leisureKmh, atStation);
      const after: Segment[] = afterSegments(modes.to, tb, b, cfg.allow, req.leisureKmh);
      js.push(buildJourney(rj, from, to, modes, before, after, cfg, now, { farKm: { from: fromKm, to: toKm } }));
    }));
    const list = rankTrips(js, q, now, cfg);
    const picks = list.filter(j => j.recommended).sort((x, y) => (x.recommended as number) - (y.recommended as number));
    return { stage, journeys: list, picks, others: otherStations(list, picks[0], cfg.otherStationsMax),
      candidates: { from: cf.list, to: ct.list }, failed: failed.slice(), close, requests: { ...requests }, notes: notes.slice() };
  };
  const first = assemble("timetable");
  onStage?.(first);

  // Promotion: stations within reach where round-1 journeys board or change (found from live planner data).
  const seenFrom: Station[] = [], seenTo: Station[] = [];
  rail.forEach(list => list.forEach(rj => mainRides(rj.rides).forEach(r => { if (r.from.crs) seenFrom.push(r.from); if (r.to.crs) seenTo.push(r.to); })));
  const pf = promote(from.geo, modes.from, cf.list, seenFrom, cfg), pt = promote(to.geo, modes.to, ct.list, seenTo, cfg);
  cf.list.push(...pf); ct.list.push(...pt);
  await Promise.all([
    timeAccess(from.geo, cf.list, modes.from, "to", accFrom).catch(e => { notes.push(`Times to the stations: ${e.message}`); }),
    timeAccess(to.geo, ct.list, modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); }),
  ]);
  // Round 2: untried pairs of the best stations at each end (by door-to-door arrival), then a later search for the
  // best pairs to cover the question's window. None for pairs more than behindMin behind the best.
  const ranked = first.journeys.filter(j => !j.uncertain);
  const best = ranked.reduce<Journey | undefined>((b, j) => (!b || j.arrive < b.arrive ? j : b), undefined);
  const bestBy = (key: (j: Journey) => string) => { const m = new Map<string, number>(); ranked.forEach(j => { const k = key(j); m.set(k, Math.min(m.get(k) ?? Infinity, j.arrive)); }); return m; };
  const fromRank = bestBy(j => j.fromStation.crs), toRank = bestBy(j => j.toStation.crs);
  const good = (crs: string, m: Map<string, number>, promoted: boolean) => promoted || (best ? (m.get(crs) ?? Infinity) - best.arrive <= cfg.behindMin * 60e3 : true);
  const fromGood = cf.list.filter(c => good(c.station.crs, fromRank, c.why === "promoted")), toGood = ct.list.filter(c => good(c.station.crs, toRank, c.why === "promoted"));
  const tried = new Set(p1.map(([a, b]) => pairKey(a, b)));
  const p2: [Station, Station][] = [];
  for (const a of fromGood) for (const b of toGood) { const k = pairKey(a.station, b.station); if (a.station.crs !== b.station.crs && !tried.has(k) && accFrom.get(a.station.crs) && accTo.get(b.station.crs)) { tried.add(k); p2.push([a.station, b.station]); } }
  if (p2.length) await runPairs(p2, () => t0, timeIs);
  // Later searches for the best pairs, until the window is covered (Leave around / now: to T + windowMin; Arrive by:
  // from T − windowMin).
  const bestPairs = [...new Map(assemble("timetable").journeys.filter(j => !j.uncertain).sort((x, y) => x.arrive - y.arrive)
    .map(j => [pairKey(j.fromStation, j.toStation), [j.fromStation, j.toStation] as [Station, Station]])).values()].slice(0, cfg.laterPairs);
  const later = (p: [Station, Station]) => {
    const deps = (rail.get(pairKey(p[0], p[1])) || []).map(j => mainRides(j.rides)[0].schedDep);
    if (q.kind === "by") return Math.max(now, q.t - cfg.windowMin * 60e3);
    return deps.length ? Math.max(...deps) + 60e3 : t0;
  };
  const need = bestPairs.filter(p => {
    const deps = (rail.get(pairKey(p[0], p[1])) || []).map(j => mainRides(j.rides)[0].schedDep);
    return q.kind === "by" ? !deps.some(d => d <= q.t - cfg.windowMin * 60e3 + 30 * 60e3) : !deps.some(d => d >= t0 + cfg.windowMin * 60e3);
  });
  if (need.length) await runPairs(need, later, "Departing");
  const done = assemble("complete");
  onStage?.(done);
  return done;
}
