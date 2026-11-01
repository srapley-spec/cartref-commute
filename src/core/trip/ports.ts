// The ports Trip mode is planned through. Plain data only: no provider ID formats, SDK objects, URLs or keys.
// Every port has a real adapter, a fixture adapter (tests) and a simulator adapter; swapping one changes no engine
// code (docs/leisure-architecture.md §4–§5). Errors are SearchError (search.ts) incl. `refused`.
import type { Board } from "../types";
import type { ServiceProgress } from "../adapters/darwin";
import type { AccessMode, Region } from "./config";
import type { RailJourney, Station } from "./journeyCore";

export type LatLon = [number, number];
export interface Suggestion { id: string; primary: string; secondary: string }
export interface Place { id: string; name: string; address: string; geo: LatLon; kind: "address" | "station" | "current" }
export interface PlaceSearch {
  readonly attribution: string;
  /** An opaque session ID; the adapter maps it to its own token. One per search, ended by resolve. */
  newSession(): string;
  suggest(text: string, session: string, region: Region): Promise<Suggestion[]>;
  resolve(id: string, session: string): Promise<Place>;
}
export interface Timing { metres: number; secs: number }
export interface AccessTimer {
  /** One origin to many points (dir "to": place → stations; "from": stations → place). Results in input order,
   *  whole seconds; null = no route. `at` = when you'd set off (drive times depend on it). */
  matrix(place: LatLon, stations: LatLon[], mode: AccessMode, at: number, dir: "to" | "from"): Promise<(Timing | null)[]>;
}
export interface StationIndex {
  near(geo: LatLon, km: number): Station[];
  byCrs(crs: string): Station | null;
  byId(provider: string, id: string): Station | null;
  nearestTo(geo: LatLon, metres: number): Station | null;
  all(): Station[];
}
export interface PlannerReply { journeys: RailJourney[]; refused: string[] }
export interface RailPlanner {
  readonly name: string;
  plan(from: Station, to: Station, t: number, timeIs: "Departing" | "Arriving"): Promise<PlannerReply>;
}
export interface LiveBoards {
  board(fromCrs: string, toCrs: string): Promise<Board>;
  service(id: string): Promise<ServiceProgress>;
}
export interface TripPorts { places?: PlaceSearch; access: AccessTimer; stations: StationIndex; planner: RailPlanner; live?: LiveBoards }
