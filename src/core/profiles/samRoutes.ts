// Sam's routes, described once as segments, for the mode, direction, pace and where you are.
// Every leave and arrive time on screen is computed by the engine from these (journey.ts).
import type { Direction, StationCode } from "../types";
import type { Route, Segment, Step } from "../journey";
import { dur } from "../time";

/** Personal timings, in seconds (factors are multipliers). Edited in Settings. */
export interface Timings {
  walkHomeStationAvg: number; walkHomeStationFast: number; walkStationHomeAvg: number; walkStationHomeFast: number;
  letEntry: number; letExit: number; catchMargin: number;
  kxInterchange: number; farInterchange: number; tubeWait: number;
  rideKxAld: number; rideFarAld: number; aldPlatform: number; aldWalk: number;
  rideKxAde: number; rideFarAde: number; adePlatform: number; adeWalk: number;
  stpInterchange: number; fastFactor: number; leisureFactor: number;
}
/** The London leg going home in leisure mode (TfL journey planner), per London station group. */
export interface LondonLeg { dur: number; summary: string; disruptions: string[]; }

export interface RouteInput {
  dir: Direction; mode: "commute" | "leisure"; pace: "avg" | "fast"; timings: Timings;
  tubeFallback?: boolean;                                   // Circle and Met closed: H&C to Aldgate East
  london?: { KXSP: LondonLeg; FAR: LondonLeg } | null;      // leisure going home
  here?: { walkToStation: number | null; atHub: StationCode | null; atHome?: boolean; atOfficeTube?: boolean } | null;   // plan from where you are
  /** Any start and end point (feature toggle): going out to a London place — TfL legs from each station group to it. */
  dest?: { name: string; legs: { KXSP: LondonLeg | null; FAR: LondonLeg | null } | null } | null;
  /** Starting from another station than home (startStation.ts): its code and name. `away`: you're not at home, so
   *  the plan starts where you are (never "Leave Cartref") and ends at that station going back. Default Letchworth. */
  start?: { code: StationCode; name: string; away: boolean } | null;
}

const NAMES: Record<string, string> = { KGX: "King's Cross", STP: "St Pancras", ZFD: "Farringdon" };
// At a London station going home: the walk to each platform; between King's Cross and Farringdon by tube.
const PLATFORM_WALK: Record<string, number> = { KGX: 180, STP: 300, ZFD: 120 }, HUB_HOP = 240;
const seg = (kind: Segment["kind"], secs: number, step?: Step | null): Segment => ({ kind, secs, step: step || null });
/** A walk, with the same walk at average and fast pace (for effort levels). */
const walkSeg = (secs: number, avg: number, fast: number, step?: Step | null): Segment => ({ kind: "walk", secs, step: step || null, avg, fast });
const sec = (x: number) => x * 1000;
const paceFactor = (i: RouteInput) => (i.mode === "leisure" ? i.timings.leisureFactor : i.pace === "fast" ? i.timings.fastFactor : 1);

export function samRoutes(i: RouteInput): Route[] {
  const routes = baseRoutes(i);
  if (i.here) fromHere(routes, i);
  return routes;
}

function baseRoutes(i: RouteInput): Route[] {
  const s = i.timings, dir = i.dir, leisure = i.mode === "leisure", fast = !leisure && i.pace === "fast", k = paceFactor(i);
  const st = i.start || { code: "LET", name: "Letchworth", away: false }, LOCAL = st.code, LOCAL_NAME = st.name;
  // Away from home: set off from where you are (the screen replaces the walk with the one from here once it has a
  // location) and the trip back ends at the station you started from.
  const leaveStep = (walk: number) => st.away ? { at: "start" as const, d: "Set off from where you are", note: `walk to ${LOCAL_NAME} station ${dur(sec(walk))} (from your usual walk until your location is known)` } : { at: "start" as const, d: "Leave Cartref", note: `walk ${dur(sec(walk))}` };
  const homeEnd = (walk: number): Segment[] => st.away ? [seg("station", s.letExit * k, { at: "end", d: `Out of ${LOCAL_NAME} station`, note: "where you started" })] : [seg("station", s.letExit * k), seg("walk", walk, { at: "end", d: "Arrive Cartref", note: `walk ${dur(sec(walk))}` })];
  const ic: Record<string, number> = { KGX: s.kxInterchange, STP: s.stpInterchange, ZFD: s.farInterchange };
  const routes: Route[] = [];
  if (!leisure) {
    const tube = i.tubeFallback
      ? { stop: "Aldgate East", lines: ["hc"], ride: { KGX: s.rideKxAde, STP: s.rideKxAde, ZFD: s.rideFarAde } as Record<string, number>, plat: s.adePlatform, walk: s.adeWalk, fallback: true }
      : { stop: "Aldgate", lines: ["circle", "met"], ride: { KGX: s.rideKxAld, STP: s.rideKxAld, ZFD: s.rideFarAld } as Record<string, number>, plat: s.aldPlatform, walk: s.aldWalk, fallback: false };
    const tubeName = tube.fallback ? "H&C" : "Circle or Met";
    const walkOut = fast ? s.walkHomeStationFast : s.walkHomeStationAvg, walkBack = fast ? s.walkStationHomeFast : s.walkStationHomeAvg;
    // St Pancras (Thameslink) uses the same King's Cross St Pancras tube station.
    for (const hub of ["KGX", "STP", "ZFD"]) {
      const tubeStep = { d: `${tubeName} to ${dir === "office" ? tube.stop : NAMES[hub]}`, note: `~${dur(sec(tube.ride[hub]))}, allows ${dur(sec(s.tubeWait))} wait`, tube: true };
      if (dir === "office") routes.push({ hub, board: `${LOCAL}-${hub}`, fromName: LOCAL_NAME,
        before: [walkSeg(walkOut, s.walkHomeStationAvg, s.walkHomeStationFast, leaveStep(walkOut)), seg("station", s.letEntry * k), seg("margin", s.catchMargin)],
        after: [seg("change", ic[hub] * k), seg("wait", s.tubeWait, { at: "end", ...tubeStep }), seg("ride", tube.ride[hub]), seg("station", tube.plat * k),
          seg("walk", tube.walk * k, { at: "end", d: "Arrive office", note: `walk ${dur(sec(tube.walk * k))}` })],
        arriveLabel: `Arrive ${NAMES[hub]}`, arriveExtra: `, change ${dur(sec(ic[hub] * k))}`, extra: { tube }, startsAtHome: !st.away });
      else routes.push({ hub, board: `${hub}-${LOCAL}`, fromName: NAMES[hub],
        before: [walkSeg(tube.walk * k, tube.walk, tube.walk * s.fastFactor, { at: "start", d: "Leave office", note: `walk to ${tube.stop} ${dur(sec(tube.walk * k))}` }), seg("station", tube.plat * k), seg("wait", s.tubeWait),
          seg("ride", tube.ride[hub], { at: "start", ...tubeStep }), seg("change", ic[hub] * k), seg("margin", s.catchMargin)],
        after: homeEnd(walkBack),
        arriveLabel: `Arrive ${LOCAL_NAME}`, noPlatform: "platform not yet shown", extra: { tube },
        firstStop: { code: tube.fallback ? "ADE" : "ALD", name: tube.stop, kind: "tube" } });
    }
  } else if (dir === "office" && i.dest) {
    // Out to a London place: train to any of the three stations, then TfL's leg from there.
    const walk = s.walkHomeStationAvg * k, dest = i.dest;
    for (const hub of ["KGX", "STP", "ZFD"]) {
      const leg = dest.legs ? (hub === "ZFD" ? dest.legs.FAR : dest.legs.KXSP) : null;
      routes.push({ hub, board: `${LOCAL}-${hub}`, fromName: LOCAL_NAME,
        before: [walkSeg(walk, s.walkHomeStationAvg, s.walkHomeStationFast, leaveStep(walk)), seg("station", s.letEntry * k), seg("margin", s.catchMargin)],
        after: [seg("change", ic[hub] * k), seg("planned", leg ? leg.dur / 1000 : 0, leg ? { at: "end", d: `Arrive ${dest.name}`, note: `${leg.summary} (${dur(leg.dur)})` } : null)],
        arriveLabel: `Arrive ${NAMES[hub]}`, arriveExtra: `, change ${dur(sec(ic[hub] * k))}`,
        extra: { dest: dest.name, leisure: true, london: leg, planned: !!leg, outTo: true }, startsAtHome: !st.away });
    }
  } else if (dir === "office") {
    const walk = s.walkHomeStationAvg * k;
    for (const hub of ["KGX", "STP"]) routes.push({ hub, board: `${LOCAL}-${hub}`, fromName: LOCAL_NAME,
      before: [walkSeg(walk, s.walkHomeStationAvg, s.walkHomeStationFast, leaveStep(walk)), seg("station", s.letEntry * k), seg("margin", s.catchMargin)],
      after: [], arriveLabel: `Arrive ${NAMES[hub]}`, extra: { dest: NAMES[hub], leisure: true }, startsAtHome: !st.away });
  } else {
    const walkBack = s.walkStationHomeAvg * k;
    for (const hub of ["KGX", "STP", "ZFD"]) {
      const leg = i.london ? (hub === "ZFD" ? i.london.FAR : i.london.KXSP) : null;
      // Before the London leg is planned, assume 5 minutes (only used to size searches).
      const planned = leg ? leg.dur / 1000 : 300;
      routes.push({ hub, board: `${hub}-${LOCAL}`, fromName: NAMES[hub],
        before: [seg("planned", planned, leg ? { at: "start", d: `Set off to ${hub === "ZFD" ? "Farringdon" : "King's Cross St Pancras"}`, note: `${leg.summary} (${dur(leg.dur)})` } : null),
          seg("change", ic[hub] * k), seg("margin", s.catchMargin)],
        after: homeEnd(walkBack),
        arriveLabel: `Arrive ${LOCAL_NAME}`, depNotePrefix: `allow ${dur(sec(ic[hub] * k))} to reach the platform`, extra: { dest: "home", leisure: true, london: leg, planned: !!leg } });
    }
  }
  return routes;
}

// From where you are now: on the way to Letchworth the walk starts here; at a London station going home, trains
// from that station need only the walk to the platform, and trains from the other one the tube between; at Aldgate
// going home (30 Oct 18:24: the card still counted the walk from the office), only the walk to the platform.
function fromHere(routes: Route[], i: RouteInput) {
  const s = i.timings, k = paceFactor(i), dir = i.dir, at = i.here!.atHub, hw = i.here!.walkToStation;
  const ic: Record<string, number> = { KGX: s.kxInterchange, STP: s.stpInterchange, ZFD: s.farInterchange };
  for (const r of routes) {
    if (dir === "office" && hw != null) {
      // The same share of your measured walk at average and fast pace.
      const chosen = r.before[0].secs, share = chosen > 0 ? hw / chosen : 1;
      r.before[0] = walkSeg(hw, s.walkHomeStationAvg * share, s.walkHomeStationFast * share, { at: "start", d: "Set off from where you are", note: `about ${dur(sec(hw))} walk to ${i.start ? i.start.name : "Letchworth"} station` });
      r.extra = { ...r.extra, fromHere: true };
      r.startsAtHome = !!i.here!.atHome && !(i.start && i.start.away);
    } else if (dir === "home" && at) {
      const same = (at === "KGX" && (r.hub === "KGX" || r.hub === "STP")) || r.hub === at;
      r.before = same
        ? [walkSeg(PLATFORM_WALK[r.hub] * k, PLATFORM_WALK[r.hub], PLATFORM_WALK[r.hub] * s.fastFactor, { at: "start", d: `You're at ${NAMES[at]}: go to the ${NAMES[r.hub]} platform`, note: `about ${dur(sec(PLATFORM_WALK[r.hub] * k))}` }), seg("margin", s.catchMargin)]
        : [seg("station", 120 * k, { at: "start", d: `Tube from ${NAMES[at]} to ${NAMES[r.hub]}`, note: `about ${dur(sec(HUB_HOP))} ride, allows ${dur(sec(s.tubeWait))} wait and the change` }),
          seg("wait", s.tubeWait), seg("ride", HUB_HOP), seg("change", ic[r.hub] * k), seg("margin", s.catchMargin)];
      r.extra = { ...r.extra, fromHere: true, planned: true };
      delete r.firstStop;   // already at the London station: the train is the next thing you board
    } else if (dir === "home" && i.here!.atOfficeTube && i.mode !== "leisure" && r.extra && (r.extra as { tube?: { fallback: boolean } }).tube && !(r.extra as { tube: { fallback: boolean } }).tube.fallback) {
      // The office walk and its step go; the platform walk carries the first step instead.
      const plat = r.before[1];
      r.before.splice(0, 2, { ...plat, step: { at: "start", d: "You're at Aldgate: go to the platform", note: `about ${dur(sec(plat.secs))}` } });
      r.extra = { ...r.extra, fromHere: true };
    }
  }
}

/** Off a tube from the office's tube station leaving at `t`: when you reach each London station, and how long
 *  after that you need before a train (interchange at your pace + margin). For the engine's bestConnections. */
export function tubeHomeConnections(t: number, s: Timings, pace: "avg" | "fast") {
  const k = pace === "fast" ? s.fastFactor : 1;
  return {
    reach: { ZFD: t + s.rideFarAld * 1000, KGX: t + s.rideKxAld * 1000, STP: t + s.rideKxAld * 1000 } as Record<string, number>,
    ready: { ZFD: (s.farInterchange * k + s.catchMargin) * 1000, KGX: (s.kxInterchange * k + s.catchMargin) * 1000, STP: (s.stpInterchange * k + s.catchMargin) * 1000 } as Record<string, number>,
  };
}
