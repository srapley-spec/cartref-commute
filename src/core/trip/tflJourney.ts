// TfL Journey Planner replies → RailJourney (rides with changes), checked against the stations asked for.
// From recorded replies (tests/fixtures/trip): TfL omits naptan IDs at change and final arrivals (ICS code and
// position only), adds its own walk out of a station, and gives cross-London changes as Tube legs with gaps.
import type { Train } from "../types";
import { hhmm, mins } from "../time";
import type { StationIndex } from "./ports";
import type { Ride, RideKind, RailJourney, Station } from "./journeyCore";
import { isMain } from "./journeyCore";

type J = any;
const KIND: Record<string, RideKind> = { "national-rail": "rail", "elizabeth-line": "rail", overground: "rail",
  tube: "tube", dlr: "tube", tram: "tube", walking: "walk", bus: "bus", coach: "bus", "replacement-bus": "bus" };
/** TfL's modes for Trip searches (no buses asked for; any that come back are kept and flagged). */
export const TFL_TRIP_MODES = "national-rail,tube,overground,elizabeth-line,dlr,walking";
export const cleanName = (n: string) => String(n || "").replace(/\s+(Rail|Railway|Underground|DLR)?\s*Station$/i, "").replace(/^London\s+(?=\S)/, "").trim();

/** The station a TfL stop point is: by naptan ID, else ICS code, else the nearest within `m` metres; else a
 *  station of its own (a Tube stop), never another station guessed by name. */
export function tflStation(p: J, idx: StationIndex, m: number): { station: Station; known: boolean } {
  const s = (p && p.naptanId && idx.byId("tfl", p.naptanId)) || (p && p.icsCode && idx.byId("tflIcs", String(p.icsCode)))
    || (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? idx.nearestTo([p.lat, p.lon], m) : null);
  if (s) return { station: s, known: true };
  return { station: { crs: "", name: cleanName(p && p.commonName), geo: [p?.lat ?? 0, p?.lon ?? 0], carPark: "unknown", servicePerHour: 0, ids: {} }, known: false };
}
const t = (s: string | undefined) => (s ? new Date(s).getTime() : NaN);

function rideOf(l: J, idx: StationIndex, m: number): Ride | null {
  const kind = KIND[l.mode && l.mode.id] || "other";
  const dep = t(l.departureTime), arr = t(l.arrivalTime);
  if (!Number.isFinite(dep) || !Number.isFinite(arr)) return null;
  const sDep = Number.isFinite(t(l.scheduledDepartureTime)) ? t(l.scheduledDepartureTime) : dep;
  const sArr = Number.isFinite(t(l.scheduledArrivalTime)) ? t(l.scheduledArrivalTime) : arr;
  const from = tflStation(l.departurePoint, idx, m).station, to = tflStation(l.arrivalPoint, idx, m).station;
  const opt = (l.routeOptions || [])[0] || {};
  const operator = String(opt.name || (l.mode && l.mode.name) || "");
  const destination = cleanName((opt.directions || [])[0] || "") || undefined;
  const label = kind === "rail" ? `${operator || "Train"}${destination ? ` to ${destination}` : ""}` : String((l.instruction && l.instruction.summary) || operator || kind);
  const ride: Ride = { kind, from, to, dep, arr, schedDep: sDep, schedArr: sArr, live: { dep: false, arr: false }, label, operator, destination, platform: null };
  if (kind === "rail") {
    const train: Train = { from: from.crs, to: to.crs, std: hhmm(sDep), dep, arr, depLate: Math.max(0, mins(dep - sDep)), arrLate: Math.max(0, mins(arr - sArr)),
      depUnknown: false, platform: null, operator, cancelled: false, reason: "", timetable: true, ...(destination ? { destination } : {}) };
    ride.train = train;
  }
  return ride;
}

/** Parse one reply. Journeys whose ends aren't the asked stations are refused with the reason. */
export function tflRailJourneys(body: J, from: Station, to: Station, idx: StationIndex, endMatchM: number): { journeys: RailJourney[]; refused: string[] } {
  const out: RailJourney[] = [], refused: string[] = [];
  for (const j of (body && body.journeys) || []) {
    const notes: string[] = [];
    let rides = ((j.legs || []) as J[]).map(l => rideOf(l, idx, endMatchM)).filter((r): r is Ride => !!r);
    // TfL's own walks into and out of the stations: dropped (Trip adds its own access and exit).
    while (rides.length && rides[0].kind === "walk") { notes.push(`Dropped TfL's walk: ${rides[0].label}`); rides = rides.slice(1); }
    while (rides.length && rides[rides.length - 1].kind === "walk") { notes.push(`Dropped TfL's walk: ${rides[rides.length - 1].label}`); rides = rides.slice(0, -1); }
    const mains = rides.filter(isMain);
    if (!mains.length) { refused.push("No train in TfL's journey"); continue; }
    if (rides[0].from.crs !== from.crs || rides[rides.length - 1].to.crs !== to.crs) {
      refused.push(`TfL matched a different place (${rides[0].from.name || "?"} → ${rides[rides.length - 1].to.name || "?"})`); continue;
    }
    (j.legs || []).forEach((l: J) => (l.disruptions || []).forEach((d: J) => { if (d && d.description) notes.push(String(d.description)); }));
    out.push({ rides, source: "tfl", notes });
  }
  return { journeys: out, refused };
}
