// What to load on a refresh, for the situation you're in. The screen does the fetching; this decides what.
import type { Direction } from "./types";

export type RailSource = "darwin" | "tfl" | "demo";
/** What the rail part of a refresh loads:
 *  toOffice — a TfL journey from where you are to the office (in London on the way to work);
 *  officeTubeArrivals — tubes arriving at the office's tube station (on the tube to work);
 *  hubTubeArrivals — tubes from the London station you're at (to work);
 *  demo — made-up trains; timetable — TfL timetable searches; live — live boards (from `liveBack` minutes);
 *  none — nothing (waiting for location, reusing recent timetable trains, or Arrive by / Leave around on screen). */
export type RailLoad = "toOffice" | "officeTubeArrivals" | "hubTubeArrivals" | "demo" | "timetable" | "live" | "none";

export interface RefreshSituation {
  now: number; force: boolean; manual: boolean; source: RailSource; dir: Direction; mode: "commute" | "leisure";
  view: "now" | "by" | "at"; awaitingLocation: boolean;
  inLondonToOffice: boolean; onTube: boolean; atHubToOffice: boolean; onTheLine: boolean; nearOffice: boolean;
  /** The timetable trains on screen: when loaded, from where, and whether they cover the routes needed. */
  boards: { at: number | null; source: RailSource | null; fit: boolean };
  toOffice: { at: number; movedKm: number } | null;     // last journey to the office, and how far you've moved since
  statusAt: number | null; nrAt: number | null;
}
export interface RefreshPlan { rail: RailLoad; liveBack: number; toOfficeNeeded: boolean; officeTubeDeps: boolean; lineStatus: boolean; nrStatus: boolean; }

/** How long things are reused before reloading (ms). */
export const REUSE = { minGap: 30e3, timetable: 5 * 60e3, lineStatus: 2 * 60e3, nrStatus: 5 * 60e3, toOffice: 120e3 };

/** Automatic refreshes (timer, reopening the app) at most every 30 s; one you asked for always runs. */
export const refreshDue = (force: boolean, lastAt: number | null, now: number) => force || !lastAt || now - lastAt >= REUSE.minGap;

export function refreshPlan(s: RefreshSituation): RefreshPlan {
  let rail: RailLoad, toOfficeNeeded = false;
  if (s.inLondonToOffice) {
    rail = "toOffice";
    toOfficeNeeded = !s.nearOffice && (!s.toOffice || s.now - s.toOffice.at > REUSE.toOffice || s.toOffice.movedKm > 0.3);
  } else if (s.onTube) rail = "officeTubeArrivals";
  else if (s.atHubToOffice) rail = "hubTubeArrivals";
  else if (s.source === "demo") rail = "demo";
  else if (s.source === "tfl") {
    // Timetable times don't change minute to minute: reuse them for 5 minutes for the same routes.
    const reuse = !s.force && !s.onTheLine && s.boards.fit && !!s.boards.at && s.now - s.boards.at < REUSE.timetable && s.boards.source === "tfl";
    // Arrive by and Leave around run their own searches, so Leave now trains aren't loaded while they're on screen.
    rail = s.awaitingLocation || reuse || ((s.view === "by" || s.view === "at") && !s.onTheLine) ? "none" : "timetable";
  } else rail = s.awaitingLocation ? "none" : "live";   // live boards are for one direction: wait for location
  return {
    rail, toOfficeNeeded,
    // On a train the live board must include trains that have already left (the one you're on): start 40 min back.
    liveBack: s.onTheLine ? -40 : 0,
    // Going home near the office: the next tubes from the office's tube station.
    officeTubeDeps: s.dir === "home" && s.mode !== "leisure" && s.nearOffice && !s.onTheLine,
    lineStatus: s.manual || !s.statusAt || s.now - s.statusAt >= REUSE.lineStatus,
    nrStatus: s.manual || !s.nrAt || s.now - s.nrAt >= REUSE.nrStatus,
  };
}
