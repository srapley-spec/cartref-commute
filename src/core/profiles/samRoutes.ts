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
  here?: { walkToStation: number | null; atHub: StationCode | null } | null;   // plan from where you are
}

const NAMES: Record<string, string> = { KGX: "King's Cross", STP: "St Pancras", ZFD: "Farringdon" };
// At a London station going home: the walk to each platform; between King's Cross and Farringdon by tube.
const PLATFORM_WALK: Record<string, number> = { KGX: 180, STP: 300, ZFD: 120 }, HUB_HOP = 240;
const seg = (kind: Segment["kind"], secs: number, step?: Step | null): Segment => ({ kind, secs, step: step || null });
const sec = (x: number) => x * 1000;
const paceFactor = (i: RouteInput) => (i.mode === "leisure" ? i.timings.leisureFactor : i.pace === "fast" ? i.timings.fastFactor : 1);

export function samRoutes(i: RouteInput): Route[] {
  const routes = baseRoutes(i);
  if (i.here) fromHere(routes, i);
  return routes;
}

function baseRoutes(i: RouteInput): Route[] {
  const s = i.timings, dir = i.dir, leisure = i.mode === "leisure", fast = !leisure && i.pace === "fast", k = paceFactor(i);
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
      if (dir === "office") routes.push({ hub, board: `LET-${hub}`, fromName: "Letchworth",
        before: [seg("walk", walkOut, { at: "start", d: "Leave Cartref", note: `walk ${dur(sec(walkOut))}` }), seg("station", s.letEntry * k), seg("margin", s.catchMargin)],
        after: [seg("change", ic[hub] * k), seg("wait", s.tubeWait, { at: "end", ...tubeStep }), seg("ride", tube.ride[hub]), seg("station", tube.plat * k),
          seg("walk", tube.walk * k, { at: "end", d: "Arrive office", note: `walk ${dur(sec(tube.walk * k))}` })],
        arriveLabel: `Arrive ${NAMES[hub]}`, arriveExtra: `, change ${dur(sec(ic[hub] * k))}`, extra: { tube } });
      else routes.push({ hub, board: `${hub}-LET`, fromName: NAMES[hub],
        before: [seg("walk", tube.walk * k, { at: "start", d: "Leave office", note: `walk to ${tube.stop} ${dur(sec(tube.walk * k))}` }), seg("station", tube.plat * k), seg("wait", s.tubeWait),
          seg("ride", tube.ride[hub], { at: "start", ...tubeStep }), seg("change", ic[hub] * k), seg("margin", s.catchMargin)],
        after: [seg("station", s.letExit * k), seg("walk", walkBack, { at: "end", d: "Arrive Cartref", note: `walk ${dur(sec(walkBack))}` })],
        arriveLabel: "Arrive Letchworth", noPlatform: "platform not yet shown", extra: { tube } });
    }
  } else if (dir === "office") {
    const walk = s.walkHomeStationAvg * k;
    for (const hub of ["KGX", "STP"]) routes.push({ hub, board: `LET-${hub}`, fromName: "Letchworth",
      before: [seg("walk", walk, { at: "start", d: "Leave Cartref", note: `walk ${dur(sec(walk))}` }), seg("station", s.letEntry * k), seg("margin", s.catchMargin)],
      after: [], arriveLabel: `Arrive ${NAMES[hub]}`, extra: { dest: NAMES[hub], leisure: true } });
  } else {
    const walkBack = s.walkStationHomeAvg * k;
    for (const hub of ["KGX", "STP", "ZFD"]) {
      const leg = i.london ? (hub === "ZFD" ? i.london.FAR : i.london.KXSP) : null;
      // Before the London leg is planned, assume 5 minutes (only used to size searches).
      const planned = leg ? leg.dur / 1000 : 300;
      routes.push({ hub, board: `${hub}-LET`, fromName: NAMES[hub],
        before: [seg("planned", planned, leg ? { at: "start", d: `Set off to ${hub === "ZFD" ? "Farringdon" : "King's Cross St Pancras"}`, note: `${leg.summary} (${dur(leg.dur)})` } : null),
          seg("change", ic[hub] * k), seg("margin", s.catchMargin)],
        after: [seg("station", s.letExit * k), seg("walk", walkBack, { at: "end", d: "Arrive Cartref", note: `walk ${dur(sec(walkBack))}` })],
        arriveLabel: "Arrive Letchworth", depNotePrefix: `allow ${dur(sec(ic[hub] * k))} to reach the platform`, extra: { dest: "home", leisure: true, london: leg, planned: !!leg } });
    }
  }
  return routes;
}

// From where you are now: on the way to Letchworth the walk starts here; at a London station going home, trains
// from that station need only the walk to the platform, and trains from the other one the tube between.
function fromHere(routes: Route[], i: RouteInput) {
  const s = i.timings, k = paceFactor(i), dir = i.dir, at = i.here!.atHub, hw = i.here!.walkToStation;
  const ic: Record<string, number> = { KGX: s.kxInterchange, STP: s.stpInterchange, ZFD: s.farInterchange };
  for (const r of routes) {
    if (dir === "office" && hw != null) {
      r.before[0] = seg("walk", hw, { at: "start", d: "Set off from where you are", note: `about ${dur(sec(hw))} walk to Letchworth station` });
      r.extra = { ...r.extra, fromHere: true };
    } else if (dir === "home" && at) {
      const same = (at === "KGX" && (r.hub === "KGX" || r.hub === "STP")) || r.hub === at;
      r.before = same
        ? [seg("walk", PLATFORM_WALK[r.hub] * k, { at: "start", d: `You're at ${NAMES[at]}: go to the ${NAMES[r.hub]} platform`, note: `about ${dur(sec(PLATFORM_WALK[r.hub] * k))}` }), seg("margin", s.catchMargin)]
        : [seg("station", 120 * k, { at: "start", d: `Tube from ${NAMES[at]} to ${NAMES[r.hub]}`, note: `about ${dur(sec(HUB_HOP))} ride, allows ${dur(sec(s.tubeWait))} wait and the change` }),
          seg("wait", s.tubeWait), seg("ride", HUB_HOP), seg("change", ic[r.hub] * k), seg("margin", s.catchMargin)];
      r.extra = { ...r.extra, fromHere: true, planned: true };
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
