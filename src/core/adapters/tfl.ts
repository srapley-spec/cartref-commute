// TfL Journey Planner journeys → direct trains between the home station and a London station.
import type { Profile, StationCode, Train } from "../types";
import { hhmm, mins } from "../time";

type Leg = any;
type Journey = { legs?: Leg[] };

/** Which profile station a TfL station name refers to, if any. */
export function stationOf(name: string | null | undefined, profile: Profile): StationCode | null {
  const n = String(name || "");
  for (const [code, re] of Object.entries(profile.stationPatterns)) if (new RegExp(re, "i").test(n)) return code;
  return null;
}

const railLegs = (j: Journey): Leg[] => (j.legs || []).filter(l => l.mode && l.mode.id === "national-rail");

/** One direct train between the home station and a London station, or null. */
export function trainFromTflJourney(j: Journey, profile: Profile, toText: (h: string) => string): { key: string; msgs: string[]; svc: Train } | null {
  const rail = railLegs(j); if (rail.length !== 1) return null;
  const l = rail[0];
  const a = stationOf(l.departurePoint && l.departurePoint.commonName, profile), b = stationOf(l.arrivalPoint && l.arrivalPoint.commonName, profile);
  if (!a || !b || a === b || (a !== profile.home && b !== profile.home)) return null;
  const dep = new Date(l.departureTime).getTime(), arr = new Date(l.arrivalTime).getTime();
  if (!isFinite(dep) || !isFinite(arr)) return null;
  const sched = l.scheduledDepartureTime ? new Date(l.scheduledDepartureTime).getTime() : dep;
  const text = [l.instruction && l.instruction.summary, l.instruction && l.instruction.detailed,
    ...(l.routeOptions || []).map((o: any) => `${o.name || ""} ${(o.directions || []).join(" ")}`)].join(" ");
  const hub = a === profile.home ? b : a;
  const operator = /thameslink/i.test(text) ? "Thameslink" : /great northern/i.test(text) ? "Great Northern" : (profile.operatorByHub[hub] || "");
  const msgs = (l.disruptions || []).map((d: any) => toText(d.description)).filter(Boolean);
  return {
    key: `${a}-${b}`, msgs,
    svc: { from: a, to: b, std: hhmm(isFinite(sched) ? sched : dep), dep, depLate: isFinite(sched) ? Math.max(0, mins(dep - sched)) : 0, depUnknown: false,
      arr, arrLate: 0, platform: null, operator, cancelled: false, reason: "", timetable: true },
  };
}

/** Why a TfL journey isn't a direct train the app plans with. */
export function tflDropReason(j: Journey): "no train" | "change of train" | "other station" {
  const rail = railLegs(j);
  if (rail.length === 0) return "no train";
  if (rail.length > 1) return "change of train";
  return "other station";
}
