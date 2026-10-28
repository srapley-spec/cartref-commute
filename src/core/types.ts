// Shared types for the planning engine. Times are epoch milliseconds.

export type LatLon = [number, number];
export type StationCode = string;            // e.g. "LET", "KGX", "STP", "ZFD"

/** A station a train calls at. `t` is the time there when known (timetabled or live). */
export interface Call { name: string; code?: string | null; t?: number | null; }

/** One train between two stations as the app uses it. */
export interface Train {
  from: StationCode;
  to: StationCode;
  std: string;             // scheduled departure, "HH:MM"
  dep: number;             // expected departure
  arr: number | null;      // expected arrival at `to`
  depLate: number;         // minutes
  arrLate: number;         // minutes
  depUnknown: boolean;     // "Delayed" with no estimate
  arrUnknown?: boolean;
  platform: string | null;
  operator: string;
  cancelled: boolean;
  reason: string;
  origin?: string;         // where the train started (Darwin only)
  timetable?: boolean;     // from the timetable, not live
  calls?: Call[];
  derived?: boolean;       // worked out from another station's train (same train, other stop)
  estimated?: boolean;     // derived time is an estimate (timetable has no time at that stop)          // every stop from `from` to `to`, in order, both ends included
}

export interface Board { services: Train[]; msgs: string[]; }

/** A flag shown on an option. Flags never hide a train. */
export interface Flag { lvl: "ok" | "info" | "warn" | "bad"; txt: string; long?: boolean; fine?: boolean; }

/** A door-to-door option built from one train. The engine only relies on these fields. */
export interface Option {
  hub: StationCode;        // the London station used
  train: Train;
  leave: number;
  arrive: number;
  flags: Flag[];
  late?: boolean;
  missed?: boolean;
  uncertain?: boolean;
  alts?: Option[];         // same train at other stations
  [extra: string]: unknown;
}

export type Direction = "office" | "home";

/** Standing-room rule: busy trains, on which days, outside which holidays. */
export interface BusyRule {
  from: StationCode; to: StationCode; operator: string;
  arrFrom: string; arrTo: string;          // "HH:MM"
  days: number[];                          // 0 = Sunday
  maxMins: number;                         // only trains this fast or faster
  origins: string;                         // regex source, case-insensitive
  holidays: [string, string][];            // inclusive "YYYY-MM-DD" ranges
}

/** Everything about one person's journeys that isn't code. */
export interface Profile {
  id: string;
  name: string;
  home: StationCode;                                  // local station, e.g. Letchworth
  stationNames: Record<StationCode, string>;          // short names used in sentences
  hubNames: Record<StationCode, string>;              // London stations
  stationPatterns: Record<StationCode, string>;       // regex sources matching TfL station names
  coords: Record<StationCode, string>;                // "lat,lon" for the TfL journey planner
  lines: Record<StationCode, LatLon[]>;               // approximate line from home station to each hub
  maxTrainMin: Record<StationCode, number>;           // slowest train per hub (search windows)
  stoppingMin: Record<StationCode, number>;           // at or above this many minutes = stopping train
  mergeHubs: StationCode[];                           // hubs one train can call at in turn (same train, two stops)
  operatorByHub: Record<StationCode, string>;         // default operator when the source doesn't say
  busy: BusyRule;
  topWindowMin?: number;                              // top card: alternative only if this close to the best (default 20)
}
