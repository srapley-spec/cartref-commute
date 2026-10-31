// TfL Journey Planner journeys → direct trains between the home station and a London station.
import type { Call, Profile, StationCode, Train } from "../types";
import { hhmm, mins } from "../time";

type Leg = any;
type Journey = { legs?: Leg[] };

/** Which profile station a TfL station name refers to, if any. */
export function stationOf(name: string | null | undefined, profile: Profile): StationCode | null {
  const n = String(name || "");
  for (const [code, re] of Object.entries(profile.stationPatterns)) if (new RegExp(re, "i").test(n)) return code;
  return null;
}

/** A TfL station name as people say it: profile short name when known, else without "Rail Station" etc. */
export function stationLabel(name: string | null | undefined, profile: Profile): string {
  const code = stationOf(name, profile); if (code && profile.stationNames[code]) return profile.stationNames[code];
  return String(name || "").replace(/\s+(Rail|Railway|Underground|DLR)?\s*Station$/i, "").replace(/^London\s+(?=\S)/, "").trim();
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
  // "Great Northern to Cambridge": the train's destination. Taken only when it isn't where you get off, since TfL
  // may name the alighting station instead (unverified), and that wouldn't tell two trains apart.
  const toM = /\bto\s+(.+?)\s*$/i.exec(String((l.instruction && l.instruction.summary) || ""));
  const destination = toM && stationOf(toM[1], profile) !== b ? stationLabel(toM[1], profile) : undefined;
  const msgs = (l.disruptions || []).map((d: any) => toText(d.description)).filter(Boolean);
  // Every stop: TfL lists them on the leg's path (no times at intermediate stops).
  const label = (n: string) => stationLabel(n, profile);
  const first = label(l.departurePoint && l.departurePoint.commonName), last = label(l.arrivalPoint && l.arrivalPoint.commonName);
  const mid = ((l.path && l.path.stopPoints) || []).map((sp: any) => label(sp.name || sp.commonName)).filter((n: string) => n && n !== first && n !== last);
  const calls: Call[] = [{ name: first, code: a, t: dep }, ...mid.map((n: string) => ({ name: n, code: stationOf(n, profile), t: null })), { name: last, code: b, t: arr }];
  return {
    key: `${a}-${b}`, msgs,
    svc: { from: a, to: b, std: hhmm(isFinite(sched) ? sched : dep), dep, depLate: isFinite(sched) ? Math.max(0, mins(dep - sched)) : 0, depUnknown: false,
      arr, arrLate: 0, platform: null, operator, cancelled: false, reason: "", timetable: true, calls, ...(destination ? { destination } : {}) },
  };
}

/** Why a TfL journey isn't a direct train the app plans with. */
export function tflDropReason(j: Journey): "no train" | "change of train" | "other station" {
  const rail = railLegs(j);
  if (rail.length === 0) return "no train";
  if (rail.length > 1) return "change of train";
  return "other station";
}

/** A place TfL matched for a journey search: what to search with, and its name. */
export interface PlaceMatch { value: string; name: string; }
/**
 * TfL's "which place did you mean?" reply (HTTP 300): the best match for each end that needs one (highest match
 * quality). Null for an end TfL already identified.
 */
export function tflPickPlaces(json: unknown): { from: PlaceMatch | null; to: PlaceMatch | null } {
  const j = (json || {}) as Record<string, unknown>;
  const pick = (d: unknown): PlaceMatch | null => {
    const opts = ((d as { disambiguationOptions?: unknown[] } | null)?.disambiguationOptions || []) as { parameterValue?: string; matchQuality?: number; place?: { commonName?: string } }[];
    const best = opts.filter(o => o && o.parameterValue).sort((a, b) => (b.matchQuality || 0) - (a.matchQuality || 0))[0];
    return best ? { value: best.parameterValue as string, name: (best.place && best.place.commonName) || (best.parameterValue as string) } : null;
  };
  return { from: pick(j.fromLocationDisambiguation), to: pick(j.toLocationDisambiguation) };
}

/** One TfL arrival prediction (StopPoint/{id}/Arrivals), the fields used here. */
export interface TflArrival { vehicleId?: string; lineId?: string; platformName?: string; destinationName?: string; towards?: string;
  expectedArrival?: string; timeToStation?: number; currentLocation?: string; }
/** A departure from a terminus, worked out from the next station's arrivals. */
export interface TerminusDeparture { vehicle: string; lineId: string; dest: string; t: number; atNext: number; currentLocation: string;
  /** "Platform 3" while the train stands at the terminus and TfL says which platform ("At Aldgate Platform 3"), else "". */
  platform: string; }

/**
 * Departures from a terminus that TfL lists only as trains arriving there (30 Oct: the Met at Aldgate). Every train
 * leaving the terminus calls next at the following station, where TfL predicts it (turnaround included), so the
 * departure is that prediction less the scheduled run between them (`runMs`, from TfL's timetable). Only the line and
 * direction given; trains already past (more than 30 s ago) are dropped. Destination: TfL's, else its "towards",
 * never the terminus itself or "Check Front of Train". Platform: while the train stands at the terminus, TfL's
 * location at the next stop names it ("At Aldgate Platform 3", recorded 30 Oct 22:43 and 31 Oct 09:00, every Met
 * standing there); `terminusName` is the station as TfL writes it there ("Aldgate", never "Aldgate East"). A train
 * not yet at the terminus has no platform: TfL lists an arriving Met under both bays (31 Oct: 432, arrived at 3).
 */
export function terminusDepartures(nextArrivals: TflArrival[], o: { lineId: string; outbound: RegExp; runMs: number; now: number; terminus: RegExp; terminusName?: string }): TerminusDeparture[] {
  const name = (s?: string) => String(s || "").replace(/ Underground Station/i, "").trim();
  const plat = (loc: string) => { const m = /^At (.+) Platform (\w+)$/i.exec(loc.trim());
    return m && o.terminusName && m[1].trim().toLowerCase() === o.terminusName.toLowerCase() ? `Platform ${m[2]}` : ""; };
  const ok = (s: string) => !!s && !o.terminus.test(s) && !/check front of train/i.test(s);
  const out: TerminusDeparture[] = [];
  for (const a of Array.isArray(nextArrivals) ? nextArrivals : []) {
    if (a.lineId !== o.lineId || !o.outbound.test(a.platformName || "")) continue;
    const atNext = a.expectedArrival ? new Date(a.expectedArrival).getTime() : o.now + (a.timeToStation || 0) * 1000;
    if (!isFinite(atNext)) continue;
    const t = atNext - o.runMs; if (t < o.now - 30e3) continue;
    const d = name(a.destinationName), tw = name(a.towards);
    out.push({ vehicle: String(a.vehicleId || ""), lineId: o.lineId, dest: ok(d) ? d : ok(tw) ? tw : "", t, atNext, currentLocation: a.currentLocation || "",
      platform: plat(String(a.currentLocation || "")) });
  }
  return out.sort((a, b) => a.t - b.t);
}
