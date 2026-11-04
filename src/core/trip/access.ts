// Getting to and from the station as segments (story "Getting to and from the station"). Times come from the
// AccessTimer port (Google) plus the allowances; walking uses your leisure pace over the route's distance.
import type { Segment } from "../journey";
import { dur } from "../time";
import type { AccessMode, TripAllowances, TaxiRule } from "./config";
import type { Timing } from "./ports";
import type { Station } from "./journeyCore";

const MODE_WORD: Record<AccessMode, string> = { walk: "Walk", cycle: "Cycle", drive: "Drive" };
/** Seconds to get between the place and the station by this mode (no allowances). */
export function travelSecs(mode: AccessMode, t: Timing, leisureKmh: number): number {
  if (mode === "walk") return Math.round((t.metres / 1000) / leisureKmh * 3600);
  return Math.round(t.secs);
}
/** A walk too long to walk (over `taxi.fromKm` by Google's walking distance) and a driving time for it: a taxi leg. */
export const taxiWorthIt = (mode: AccessMode, walk: Timing | null | undefined, taxi: TaxiRule) => mode === "walk" && !!walk && walk.metres > taxi.fromKm * 1000;
const kmText = (m: number) => `${(m / 1000).toFixed(1)} km`;
/** Taxi to the station: Google's driving time plus the wait for one; the walk it replaces is said. */
function taxiSegment(at: "start" | "end", drive: Timing, walk: Timing, st: Station, taxi: TaxiRule, leisureKmh: number): Segment {
  const walkMin = Math.round(travelSecs("walk", walk, leisureKmh) / 60);
  return { kind: "taxi", secs: taxi.waitMin * 60 + Math.round(drive.secs), step: { at, d: at === "start" ? `Taxi to ${st.name}` : "Taxi to your destination",
    note: `${kmText(drive.metres)} · about ${dur(drive.secs * 1000)} by road, ${taxi.waitMin} min to get one · ${dur(walkMin * 60e3)} on foot` } };
}
/** Place → standing on the platform. `atStation`: you're already there (0 travel, no allowance but the platform).
 *  `taxi`: a driving time for a walk too long to walk; the leg becomes a taxi (the walk stays in the note). */
export function beforeSegments(mode: AccessMode, t: Timing, st: Station, a: TripAllowances, leisureKmh: number, atStation = false, taxi?: { drive: Timing; rule: TaxiRule }): Segment[] {
  const plat = { kind: "station" as const, secs: a.stationMin * 60, step: null };
  if (atStation) return [{ kind: "station", secs: a.stationMin * 60, step: { at: "start", d: `At ${st.name}: to the platform`, note: `${a.stationMin} min` } }];
  if (taxi && mode === "walk") return [taxiSegment("start", taxi.drive, t, st, taxi.rule, leisureKmh), plat];
  const s = travelSecs(mode, t, leisureKmh);
  const go: Segment = { kind: mode === "walk" ? "walk" : mode, secs: s, step: { at: "start", d: `${MODE_WORD[mode]} to ${st.name}`, note: dur(s * 1000) } };
  if (mode === "walk") return [go, plat];
  const extra = mode === "drive" ? a.parkMin : a.lockMin;
  return [go, { kind: "station", secs: extra * 60, step: { at: "start", d: mode === "drive" ? "Park and reach the platform" : "Lock the bike and reach the platform", note: `${extra} min` } }];
}
/** Stepping off the train → the place. `taxi`: as for beforeSegments. */
export function afterSegments(mode: AccessMode, t: Timing, st: Station, a: TripAllowances, leisureKmh: number, here = false, taxi?: { drive: Timing; rule: TaxiRule }): Segment[] {
  if (here) return [{ kind: "station", secs: a.exitMin * 60, step: { at: "end", d: `Out of ${st.name}`, note: `${a.exitMin} min` } }];
  if (taxi && mode === "walk") return [{ kind: "station", secs: a.exitMin * 60, step: { at: "end", d: `Out of ${st.name}`, note: `${a.exitMin} min` } }, taxiSegment("end", taxi.drive, t, st, taxi.rule, leisureKmh)];
  const s = travelSecs(mode, t, leisureKmh);
  const off = mode === "drive" ? a.carBackMin : a.exitMin;
  return [{ kind: "station", secs: off * 60, step: { at: "end", d: mode === "drive" ? "Back to the car" : `Out of ${st.name}`, note: `${off} min` } },
    { kind: mode === "walk" ? "walk" : mode, secs: s, step: { at: "end", d: `${MODE_WORD[mode]} to your destination`, note: dur(s * 1000) } }];
}
