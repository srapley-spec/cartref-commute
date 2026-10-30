// Shared types for the planning engine. Times are epoch milliseconds.

export type LatLon = [number, number];
export type StationCode = string;            // e.g. "LET", "KGX", "STP", "ZFD"

/** A station a train calls at. `t` is the time there when known (timetabled or live). */
export interface Call { name: string; code?: string | null; t?: number | null; actual?: boolean; }   // actual: the train was reported there

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
  serviceId?: string;      // National Rail service ID (live data), for Service Details
  derived?: boolean;       // worked out from another station's train (same train, other stop)
  estimated?: boolean;     // derived time is an estimate (timetable has no time at that stop)
}

export interface Board { services: Train[]; msgs: string[]; }

/** A flag shown on an option. Flags never hide a train. */
export interface Flag { lvl: "ok" | "info" | "warn" | "bad"; txt: string; long?: boolean; fine?: boolean; status?: boolean; }   // status: the train's on time / N min late

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
  /** Effort levels: what it takes to catch it, and "Arrives first" per level. */
  effort?: Effort;
  firstAt?: Exclude<Effort, "none">;
  leaveBy?: number;        // latest set-off at its level (walk: = leave)
  offer?: boolean;         // the card says it: needs a run or a car, and arrives sooner than the card's best
  access?: Access;         // what the time before the train is made of (from the route's segments)
  before?: unknown;        // the route's segments before the train (journey.ts Segment[]), to re-time a fast walk
  [extra: string]: unknown;
}

export type Direction = "office" | "home";

/** What it takes to catch a train, easiest first; "none" = can't make it. (effort.ts) */
export type Effort = "walk" | "fast" | "run" | "car" | "none";
/** How fast you can go. All personal; Settings override the profile's defaults. */
export interface EffortProfile {
  /** Running pace as a multiple of your average walking pace (1.8 = 1.8× as fast). */
  runFactor: number;
  /** How far you can keep that up (km). */
  runKm: number;
  /** Your average walking speed (km/h): turns a walk's time into a distance. */
  walkKmh: number;
  /** Your own car from home: door to the station entrance, parking included (s). Station allowances are added. */
  carFromHomeSecs: number;
  /** Elsewhere, a cab: time to get one (s), then driving at `cabKmh` over the walking distance. */
  cabWaitSecs: number;
  cabKmh: number;
  /** A train moves to an easier level only when it's this far inside the boundary (ms): no flicker. */
  stickMs: number;
}
/** What an option needs before the train, from its route's segments (seconds). */
export interface Access {
  walk: number;            // walking at the pace the plan uses (what `leave` is based on)
  walkAvg: number;         // the same walking at your average pace
  walkFast: number;        // … and at your fast pace
  fixed: number;           // everything else before the train: allowances, tube rides, waits, the margin
  home: boolean;           // the route starts at your home (your car is there)
}

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
  mergeHubs: StationCode[];
  sharesTubeWith?: Record<StationCode, StationCode>;  // a station using another's tube stop (St Pancras → King's Cross)                           // hubs one train can call at in turn (same train, two stops)
  operatorByHub: Record<StationCode, string>;         // default operator when the source doesn't say
  busy: BusyRule;
  topWindowMin?: number;                              // top card: alternative only if this close to the best (default 20)
  stationGeo?: Record<StationCode, LatLon>;           // stations along the line, to place a train from where it was reported
  corridorPattern: string;                            // regex source: station names on your route (notices naming them are about you)
  places: Places;                                     // where things are, for working out what you're doing
  walking: { streetFactor: number; kmh: { avg: number; fast: number; leisure: number } };
  effort?: EffortProfile;                             // how fast you can go when you're late (effort levels)
}

/** Places the app reasons about from your location. */
export interface Places {
  homeStation: LatLon;                                // e.g. Letchworth station
  office: LatLon;
  officeTube: LatLon;                                 // the tube station by the office (Aldgate)
  hubGeo: Record<StationCode, LatLon>;                // London stations where rail meets tube ("at" = within atHubKm)
  /** Stops by the office and the lines that reach them from the London stations (e.g. Aldgate: Circle and Met;
   *  Aldgate East: H&C). `fallback`: used going home only when the main lines are closed. */
  officeStops?: { id: string; name: string; geo: LatLon; lines: string[] }[];
  atHubKm: number;
}
