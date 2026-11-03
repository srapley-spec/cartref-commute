// Planning a trip through the ports. Async but pure: no clock (now is an input), no network (ports are injected),
// no caching (the shell wraps the ports). Emits stages so the screen can draw before everything has arrived.
import { km } from "../geo";
import { runRounds } from "../rounds";
import type { Segment } from "../journey";
import type { AccessMode, TripConfig } from "./config";
import { inRegion, OUTSIDE_REGION } from "./config";
import type { Place, Timing, TripPorts, LatLon } from "./ports";
import type { Journey, RailJourney, Station } from "./journeyCore";
import { buildJourney, mainRides, stationKey } from "./journeyCore";
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
/** What a search goes to: a station, or (walking at the far end) the place itself, where the planner can. */
type Target = { station: Station; place?: undefined } | { place: Place; station?: undefined };
type Pair = [Station, Target];
const targetName = (t: Target) => (t.station ? t.station.name : t.place.name);
const pairKey = (a: Station, t: Target) => `${a.crs}-${t.station ? t.station.crs : "@place"}`;
const toStation = (s: Station): Target => ({ station: s });

export async function planTrip(req: TripRequest, ports: TripPorts, onStage?: (r: TripResult) => void): Promise<TripResult> {
  const { from, to, modes, question: q, now, cfg } = req;
  if (!inRegion(from.geo, cfg.region) || !inRegion(to.geo, cfg.region)) throw new TripError(OUTSIDE_REGION, "outside");
  const cf = candidates(from.geo, modes.from, ports.stations, cfg), ct = candidates(to.geo, modes.to, ports.stations, cfg);
  if (!cf.list.length || !ct.list.length) throw new TripError("No railway station found near one of the places.", "no-stations");
  // Close enough not to need a train: within closeKm, or both places' nearest station is the same one.
  const close = km(from.geo, to.geo) <= cfg.closeKm || cf.list[0].station.crs === ct.list[0].station.crs;
  const requests = { planner: 0, access: 0 }, failed: { pair: string; why: string }[] = [], notes: string[] = [];
  const note = (s: string) => { if (!notes.includes(s)) notes.push(s); };
  const accFrom: AccessMap = new Map(), accTo: AccessMap = new Map();
  // Searches to the place itself (issue #56): only walking at the far end, only where the planner can; the stop you
  // alight at may be a Tube stop the station list doesn't know, and the final walk is timed from it like any station.
  const toPlace: Target | null = modes.to === "walk" && ports.planner.planTo && cfg.placeSearches > 0 ? { place: to } : null;
  // Drive times depend on the time: first timed for a first guess (Leave now / around: then; Arrive by: 2 h before),
  // then re-timed once for the best journey's real set-off / arrival (below).
  const firstGuess = q.kind === "by" ? q.t - 2 * 3600e3 : q.kind === "at" ? q.t : now;
  const timeAccess = async (place: LatLon, list: Station[], mode: AccessMode, dir: "to" | "from", into: AccessMap, at = firstGuess, again = false) => {
    const todo = list.filter(s => again || !into.has(stationKey(s))); if (!todo.length) return;
    requests.access++;
    const res = await ports.access.matrix(place, todo.map(s => s.geo), mode, at, dir);
    todo.forEach((s, i) => into.set(stationKey(s), res[i] ?? null));
  };
  const stationsOf = (list: Candidate[]) => list.map(c => c.station);
  const rail = new Map<string, RailJourney[]>();
  const search = async (pair: Pair, t: number, timeIs: "Departing" | "Arriving") => {
    requests.planner++;
    const r = pair[1].station ? await ports.planner.plan(pair[0], pair[1].station, t, timeIs) : await ports.planner.planTo!(pair[0], pair[1].place, t, timeIs);
    // One journey per (trains, alighting stop) for a search key: to a place, the same trains can alight at different
    // stops (Farringdon → Aldgate East, or on to Tower Hill), and each is a journey of its own.
    const sig = (j: RailJourney) => `${mainRides(j.rides).map(x => x.schedDep).join(",")}→${stationKey(j.rides[j.rides.length - 1].to)}`;
    const keep = (k: string, js: RailJourney[]) => {
      const have = rail.get(k) || [], ids = new Set(have.map(sig));
      js.forEach(j => { const id = sig(j); if (!ids.has(id)) { ids.add(id); have.push(j); } });
      rail.set(k, have);
    };
    keep(pairKey(pair[0], pair[1]), r.journeys);
    // Journeys that alight at another stop and walk on to the station asked for: when the far end is on foot, kept
    // as journeys to the place from that stop (its own walk, timed from there), within walking reach of the place.
    const kept = toPlace && pair[1].station ? (r.elsewhere || []).filter(e => km(e.journey.rides[e.journey.rides.length - 1].to.geo, to.geo) <= cfg.reachKm.walk) : [];
    if (kept.length) keep(pairKey(pair[0], toPlace!), kept.map(e => e.journey));
    if (!r.journeys.length && !kept.length) throw Object.assign(new Error(r.refused[0] || "No journeys found."), {});
    // Some of a reply refused (its ends weren't the ones asked for): said, never silently dropped.
    const keptWhy = new Set(kept.map(e => e.why));
    r.refused.forEach(why => { if (!keptWhy.has(why)) note(`${pair[0].name} → ${targetName(pair[1])}: ${why}`); });
    if (kept.length) note(`${pair[0].name} → ${targetName(pair[1])}: ${kept.length === 1 ? "a journey alights" : `${kept.length} journeys alight`} at ${[...new Set(kept.map(e => e.journey.rides[e.journey.rides.length - 1].to.name))].join(" / ")} and walk on; kept as journeys to ${to.name} from there`);
  };
  const timeIs: "Departing" | "Arriving" = q.kind === "by" ? "Arriving" : "Departing";
  const t0 = q.kind === "now" ? now : q.t;
  const p1: Pair[] = roundOnePairs(cf.list, ct.list, cfg).map(([a, b]) => [a, toStation(b)]);
  if (toPlace) cf.list.slice(0, cfg.placeSearches).forEach(c => p1.push([c.station, toPlace]));
  const runPairs = async (pairs: Pair[], at: (p: Pair) => number, ti: "Departing" | "Arriving") => {
    const res = await runRounds(pairs, [() => true], p => search(p, at(p), ti), { concurrency: pairs.length || 1, maxRequests: cfg.totalMax - requests.planner });
    res.why.forEach((why, p) => failed.push({ pair: `${p[0].name} → ${targetName(p[1])}`, why }));
    return res;
  };
  // Round 1 and both ends' station times at once (the From end may already be cached by the shell's prefetch).
  await Promise.all([
    timeAccess(from.geo, stationsOf(cf.list), modes.from, "to", accFrom).catch(e => { notes.push(`Times to the stations: ${e.message}`); }),
    timeAccess(to.geo, stationsOf(ct.list), modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); }),
    runPairs(p1, () => t0, timeIs),
  ]);
  if (![...accFrom.values()].some(Boolean) || ![...accTo.values()].some(Boolean)) throw new TripError(notes[0] || "Couldn't time the way to or from the stations.", "no-access");

  /** Where searches to the place alight (not timed yet): timed with the promoted stations, before the next round. */
  const endStops = (): Station[] => {
    const seen = new Map<string, Station>();
    rail.forEach((list, k) => { if (!k.endsWith("-@place")) return;
      list.forEach(rj => { const s = rj.rides[rj.rides.length - 1].to, key = stationKey(s); if (!accTo.has(key) && !seen.has(key)) seen.set(key, s); }); });
    return [...seen.values()];
  };
  const pairOf = new WeakMap<Journey, Pair>();
  const assemble = (stage: TripStageName): TripResult => {
    const byId = new Map<string, Journey>();
    const fromKm = cf.farKm, toKm = ct.farKm;
    rail.forEach((list, k) => list.forEach(rj => {
      const a = rj.rides[0].from, b = rj.rides[rj.rides.length - 1].to, ka = stationKey(a), kb = stationKey(b);
      if (!accFrom.has(ka) || !accTo.has(kb)) return;       // a station this plan never timed (not a candidate, or not yet)
      const ta = accFrom.get(ka), tb = accTo.get(kb), noRoute: string[] = [];
      const word = { walk: "walking", cycle: "cycling", drive: "driving" };
      if (!ta) noRoute.push(`Google found no ${word[modes.from]} route to ${a.name}: door-to-door times unknown`);
      if (!tb) noRoute.push(`Google found no ${word[modes.to]} route from ${b.name}: door-to-door times unknown`);
      const atStation = from.kind === "current" && km(from.geo, a.geo) * 1000 <= cfg.atStationM;
      const before: Segment[] = ta ? beforeSegments(modes.from, ta, a, cfg.allow, req.leisureKmh, atStation) : [];
      const after: Segment[] = tb ? afterSegments(modes.to, tb, b, cfg.allow, req.leisureKmh) : [];
      const j = buildJourney(rj, from, to, modes, before, after, cfg, now, { farKm: { from: fromKm, to: toKm }, day: q.kind === "now" ? now : q.t, noRoute });
      // The same trains to the same stop found by two searches (a station pair, and the place): one journey.
      if (byId.has(j.id)) return;
      byId.set(j.id, j);
      pairOf.set(j, [a, k.endsWith("-@place") && toPlace ? toPlace : toStation(b)]);
    }));
    const list = rankTrips([...byId.values()], q, now, cfg);
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
    timeAccess(from.geo, stationsOf(cf.list), modes.from, "to", accFrom).catch(e => { notes.push(`Times to the stations: ${e.message}`); }),
    timeAccess(to.geo, [...stationsOf(ct.list), ...endStops()], modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); }),
  ]);
  // Round 2: untried pairs of the best stations at each end (by door-to-door arrival), then a later search for the
  // best pairs to cover the question's window. None for pairs more than behindMin behind the best.
  const ranked = assemble("timetable").journeys.filter(j => !j.uncertain);
  const best = ranked.reduce<Journey | undefined>((b, j) => (!b || j.arrive < b.arrive ? j : b), undefined);
  const bestBy = (key: (j: Journey) => string) => { const m = new Map<string, number>(); ranked.forEach(j => { const k = key(j); m.set(k, Math.min(m.get(k) ?? Infinity, j.arrive)); }); return m; };
  const fromRank = bestBy(j => j.fromStation.crs), toRank = bestBy(j => j.toStation.crs);
  const good = (crs: string, m: Map<string, number>, promoted: boolean) => promoted || (best ? (m.get(crs) ?? Infinity) - best.arrive <= cfg.behindMin * 60e3 : true);
  const fromGood = cf.list.filter(c => good(c.station.crs, fromRank, c.why === "promoted")), toGood = ct.list.filter(c => good(c.station.crs, toRank, c.why === "promoted"));
  const tried = new Set(p1.map(([a, b]) => pairKey(a, b)));
  // No more searches to the place once round 1's all came back empty (TfL plans to places around London only).
  const placeWorks = !!toPlace && [...rail.keys()].some(k => k.endsWith("-@place") && (rail.get(k) || []).length > 0);
  const p2: Pair[] = []; let places = 0;
  for (const a of fromGood) {
    if (!accFrom.get(a.station.crs)) continue;
    for (const b of toGood) { const k = pairKey(a.station, toStation(b.station)); if (a.station.crs !== b.station.crs && !tried.has(k) && accTo.get(b.station.crs)) { tried.add(k); p2.push([a.station, toStation(b.station)]); } }
    if (toPlace && placeWorks && places < cfg.placeSearches && !tried.has(pairKey(a.station, toPlace))) { tried.add(pairKey(a.station, toPlace)); p2.push([a.station, toPlace]); places++; }
  }
  if (p2.length) await runPairs(p2, () => t0, timeIs);
  // Stops that round 2's place searches alight at: timed before the final answer.
  await timeAccess(to.geo, endStops(), modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); });
  // Later searches for the best pairs, until the window is covered (Leave around / now: to T + windowMin; Arrive by:
  // from T − windowMin).
  const bestPairs = [...new Map(assemble("timetable").journeys.filter(j => !j.uncertain).sort((x, y) => x.arrive - y.arrive)
    .map(j => { const p = pairOf.get(j) as Pair; return [pairKey(p[0], p[1]), p] as const; })).values()].slice(0, cfg.laterPairs);
  const later = (p: Pair) => {
    const deps = (rail.get(pairKey(p[0], p[1])) || []).map(j => mainRides(j.rides)[0].schedDep);
    if (q.kind === "by") return Math.max(now, q.t - cfg.windowMin * 60e3);
    return deps.length ? Math.max(...deps) + 60e3 : t0;
  };
  const need = bestPairs.filter(p => {
    const deps = (rail.get(pairKey(p[0], p[1])) || []).map(j => mainRides(j.rides)[0].schedDep);
    return q.kind === "by" ? !deps.some(d => d <= q.t - cfg.windowMin * 60e3 + 30 * 60e3) : !deps.some(d => d >= t0 + cfg.windowMin * 60e3);
  });
  if (need.length) await runPairs(need, later, "Departing");
  await timeAccess(to.geo, endStops(), modes.to, "from", accTo).catch(e => { notes.push(`Times from the stations: ${e.message}`); });
  // Drives re-timed once for the best journey's real set-off (to the station) and arrival (from it).
  const chosen = assemble("timetable").picks[0];
  if (chosen && (modes.from === "drive" || modes.to === "drive")) {
    await Promise.all([
      modes.from === "drive" ? timeAccess(from.geo, stationsOf(cf.list), "drive", "to", accFrom, chosen.leave, true).catch(e => { notes.push(`Drive re-timed: ${e.message}`); }) : null,
      modes.to === "drive" ? timeAccess(to.geo, stationsOf(ct.list), "drive", "from", accTo, chosen.arrive, true).catch(e => { notes.push(`Drive re-timed: ${e.message}`); }) : null,
    ]);
  }
  const done = assemble("complete");
  onStage?.(done);
  return done;
}
