// Getting to and from the station as segments (story "Getting to and from the station"). Times come from the
// AccessTimer port (Google) plus the allowances; walking uses your leisure pace over the route's distance.
import type { Segment } from "../journey";
import { dur } from "../time";
import type { AccessMode, TripAllowances } from "./config";
import type { Timing } from "./ports";
import type { Station } from "./journeyCore";

const MODE_WORD: Record<AccessMode, string> = { walk: "Walk", cycle: "Cycle", drive: "Drive" };
/** Seconds to get between the place and the station by this mode (no allowances). */
export function travelSecs(mode: AccessMode, t: Timing, leisureKmh: number): number {
  if (mode === "walk") return Math.round((t.metres / 1000) / leisureKmh * 3600);
  return Math.round(t.secs);
}
/** Place → standing on the platform. `atStation`: you're already there (0 travel, no allowance but the platform). */
export function beforeSegments(mode: AccessMode, t: Timing, st: Station, a: TripAllowances, leisureKmh: number, atStation = false): Segment[] {
  const plat = { kind: "station" as const, secs: a.stationMin * 60, step: null };
  if (atStation) return [{ kind: "station", secs: a.stationMin * 60, step: { at: "start", d: `At ${st.name}: to the platform`, note: `${a.stationMin} min` } }];
  const s = travelSecs(mode, t, leisureKmh);
  const go: Segment = { kind: mode === "walk" ? "walk" : mode, secs: s, step: { at: "start", d: `${MODE_WORD[mode]} to ${st.name}`, note: dur(s * 1000) } };
  if (mode === "walk") return [go, plat];
  const extra = mode === "drive" ? a.parkMin : a.lockMin;
  return [go, { kind: "station", secs: extra * 60, step: { at: "start", d: mode === "drive" ? "Park and reach the platform" : "Lock the bike and reach the platform", note: `${extra} min` } }];
}
/** Stepping off the train → the place. */
export function afterSegments(mode: AccessMode, t: Timing, st: Station, a: TripAllowances, leisureKmh: number, here = false): Segment[] {
  if (here) return [{ kind: "station", secs: a.exitMin * 60, step: { at: "end", d: `Out of ${st.name}`, note: `${a.exitMin} min` } }];
  const s = travelSecs(mode, t, leisureKmh);
  const off = mode === "drive" ? a.carBackMin : a.exitMin;
  return [{ kind: "station", secs: off * 60, step: { at: "end", d: mode === "drive" ? "Back to the car" : `Out of ${st.name}`, note: `${off} min` } },
    { kind: mode === "walk" ? "walk" : mode, secs: s, step: { at: "end", d: `${MODE_WORD[mode]} to your destination`, note: dur(s * 1000) } }];
}
