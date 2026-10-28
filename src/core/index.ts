// Cartref Commute planning engine. Pure functions: no screen, no network, no hard-coded places.
export * from "./types";
export { pad, hhmm, mins, isoDay, dur, countdown, clock, resolve } from "./time";
export { km, lineProgress } from "./geo";
export { parseDarwinBoard } from "./adapters/darwin";
export { stationOf, trainFromTflJourney, tflDropReason } from "./adapters/tfl";
export { busyDay, standingRoomOnly, isStopping, plannable } from "./rules";
export { keepEveryRoute, topPicks, mergeSameTrain } from "./rank";
export { buildOptions, trainFlags, timeToTrain, timeFromTrain, minTimeToTrain } from "./journey";
export type { Route, Segment, Step, Leg, SegmentKind } from "./journey";
import { samCommute } from "./profiles/sam";
export const profiles = { samCommute };
export const ENGINE_VERSION = "1";
