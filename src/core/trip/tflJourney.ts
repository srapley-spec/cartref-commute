// TfL Journey Planner replies → RailJourney (rides with changes), checked against the stations (or the place) asked
// for. From recorded replies (tests/fixtures/trip): TfL omits naptan IDs at change and final arrivals (ICS code and
// position only), adds its own walk out of a station, and gives cross-London changes as Tube legs with gaps. A reply
// for a place (issue #56) ends with TfL's walk from the last stop, which may be a Tube stop the station list doesn't
// know: that stop is kept as a station of its own, with TfL's IDs, and becomes where the journey's final walk starts.
import type { Train } from "../types";
import { hhmm, mins } from "../time";
import { km } from "../geo";
import type { StationIndex, LatLon } from "./ports";
import type { Ride, RideKind, RailJourney, Station } from "./journeyCore";
import { isMain, stationKey } from "./journeyCore";

type J = any;
const KIND: Record<string, RideKind> = { "national-rail": "rail", "elizabeth-line": "rail", overground: "rail",
  tube: "tube", dlr: "tube", tram: "tube", walking: "walk", bus: "bus", coach: "bus", "replacement-bus": "bus" };
/** TfL's modes for Trip searches (no buses asked for; any that come back are kept and flagged). */
export const TFL_TRIP_MODES = "national-rail,tube,overground,elizabeth-line,dlr,walking";
export const cleanName = (n: string) => String(n || "").replace(/\s+(Rail|Railway|Underground|DLR)?\s*Station$/i, "").replace(/^London\s+(?=\S)/, "").trim();
/** The end a reply is checked against: the station asked for, or the place itself (its name and position). */
export type PlaceEnd = { place: { name: string; geo: LatLon } };
export type TflEnd = Station | PlaceEnd;

const NAME_NOISE = new Set(["london", "rail", "railway", "station", "underground", "dlr", "tram", "stop"]);
const nameWords = (n: string) => new Set(String(n || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/&/g, " and ")
  .replace(/[^a-z0-9 ]+/g, "").split(/\s+/).filter(w => w && !NAME_NOISE.has(w)));
/** The same place by name: one name's words are all in the other's ("King's Cross St. Pancras" ⊇ "Kings Cross";
 *  "Liverpool Street Underground Station" = "London Liverpool Street"). "Tower Hill" is never "Fenchurch Street". */
export function sameStationName(a: string, b: string): boolean {
  const A = nameWords(a), B = nameWords(b);
  if (!A.size || !B.size) return false;
  return [...A].every(w => B.has(w)) || [...B].every(w => A.has(w));
}

/** The station a TfL stop point is: by naptan ID, else ICS code, else the nearest within `m` metres *with the same
 *  name* (TfL omits IDs at some arrivals); else a station of its own (a Tube stop) carrying TfL's IDs, never another
 *  station guessed from position alone (Tower Hill is 180 m from Fenchurch Street and is not it; issue #56). */
export function tflStation(p: J, idx: StationIndex, m: number): { station: Station; known: boolean } {
  const byId = (p && p.naptanId && idx.byId("tfl", p.naptanId)) || (p && p.icsCode && idx.byId("tflIcs", String(p.icsCode))) || null;
  if (byId) return { station: byId, known: true };
  const geo: LatLon | null = p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? [p.lat, p.lon] : null;
  const near = geo ? idx.nearestTo(geo, m) : null;
  if (near && sameStationName(near.name, p.commonName)) return { station: near, known: true };
  const ids: Record<string, string[]> = {};
  if (p && p.naptanId) ids.tfl = [String(p.naptanId)];
  if (p && p.icsCode) ids.tflIcs = [String(p.icsCode)];
  return { station: { crs: "", name: cleanName(p && p.commonName), geo: geo || [0, 0], carPark: "unknown", servicePerHour: 0, ids }, known: false };
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

const isPlace = (e: TflEnd): e is PlaceEnd => !!(e as PlaceEnd).place;

/**
 * Parse one reply. Journeys whose ends aren't the asked ones are refused with the reason: for a station, the last
 * ride must end at it; for a place, TfL's final walk must end within `endMatchM` of it, and the ride before that walk
 * ends wherever you alight (a station, or a Tube stop of its own). TfL's own walks into and out of the stations are
 * dropped: Trip adds its own access and exit from the segments.
 */
export interface TflParsed { journeys: RailJourney[]; refused: string[];
  /** Journeys to a station that alight somewhere else and walk on (TfL's walk dropped): refused as the asked trip,
   *  but a usable journey to that other stop when the far end is on foot (issue #56: Letchworth → Fenchurch Street
   *  alights at Aldgate). Each with the reason it was refused. */
  elsewhere: { journey: RailJourney; why: string }[];
  /** Journeys that begin with TfL's walk from the station asked for to another stop and board there (Fenchurch
   *  Street → walk → Aldgate → Tube): refused as the asked trip, but a usable journey boarding at that stop when
   *  the first mile is on foot (UK-wide Trip, 3 Nov). Each with the reason. */
  elsewhereFrom: { journey: RailJourney; why: string }[] }
export function tflRailJourneys(body: J, from: Station, to: TflEnd, idx: StationIndex, endMatchM: number): TflParsed {
  const out: RailJourney[] = [], refused: string[] = [], elsewhere: TflParsed["elsewhere"] = [], elsewhereFrom: TflParsed["elsewhereFrom"] = [];
  for (const j of (body && body.journeys) || []) {
    const notes: string[] = [];
    const legs = (j.legs || []) as J[];
    let rides = legs.map(l => rideOf(l, idx, endMatchM)).filter((r): r is Ride => !!r);
    // A leading walk that starts at the station asked for and ends somewhere else: TfL boards there instead.
    const walkedFromAsked = rides.length > 0 && rides[0].kind === "walk" && stationKey(rides[0].from) === stationKey(from);
    while (rides.length && rides[0].kind === "walk") { notes.push(`Dropped TfL's walk: ${rides[0].label}`); rides = rides.slice(1); }
    while (rides.length && rides[rides.length - 1].kind === "walk") { notes.push(`Dropped TfL's walk: ${rides[rides.length - 1].label}`); rides = rides.slice(0, -1); }
    const mains = rides.filter(isMain);
    if (!mains.length) { refused.push("No train in TfL's journey"); continue; }
    const last = rides[rides.length - 1];
    const other = () => `TfL matched a different place (${rides[0].from.name || "?"} → ${last.to.name || "?"})`;
    const boardsElsewhere = stationKey(rides[0].from) !== stationKey(from);
    if (boardsElsewhere && !(walkedFromAsked && (rides[0].from.geo[0] || rides[0].from.geo[1]))) { refused.push(other()); continue; }
    if (isPlace(to)) {
      const endPt = legs.length ? legs[legs.length - 1].arrivalPoint : null;
      const endGeo: LatLon | null = endPt && Number.isFinite(endPt.lat) && Number.isFinite(endPt.lon) ? [endPt.lat, endPt.lon] : last.to.geo;
      if (!endGeo || km(endGeo, to.place.geo) * 1000 > endMatchM) { refused.push(other()); continue; }
      notes.push(`Alight at ${last.to.name} for ${to.place.name}`);
    }
    legs.forEach((l: J) => (l.disruptions || []).forEach((d: J) => { if (d && d.description) notes.push(String(d.description)); }));
    if (boardsElsewhere) {
      // The far end must still be right; a journey wrong at both ends is refused outright.
      const endOk = isPlace(to) ? true : stationKey(last.to) === stationKey(to);
      const why = `TfL matched a different place (${rides[0].from.name || "?"} → ${last.to.name || "?"}, not from ${from.name})`;
      refused.push(why);
      if (endOk) elsewhereFrom.push({ journey: { rides, source: "tfl", notes: [...notes, `Boards at ${rides[0].from.name}, not ${from.name}`] }, why });
      continue;
    }
    if (!isPlace(to) && stationKey(last.to) !== stationKey(to)) {
      const why = `TfL matched a different place (${rides[0].from.name || "?"} → ${last.to.name || "?"}, not ${to.name})`;
      refused.push(why);
      if (last.to.geo[0] || last.to.geo[1]) elsewhere.push({ journey: { rides, source: "tfl", notes: [...notes, `Alights at ${last.to.name}, not ${to.name}`] }, why });
      continue;
    }
    out.push({ rides, source: "tfl", notes });
  }
  return { journeys: out, refused, elsewhere, elsewhereFrom };
}
