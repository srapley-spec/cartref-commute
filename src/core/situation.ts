// What you're doing right now, worked out from where you are, where you've been and the trains loaded:
// which way you're heading, at a London station, on the train (and which one), on a tube, nearly home.
// Pure functions: the screen passes in what it knows and stores what comes back.
import type { Board, Direction, LatLon, Profile, StationCode, Train } from "./types";
import { km, lineProgress, reportedFrac } from "./geo";

export type Mode = "commute" | "leisure";
export type Pace = "avg" | "fast";
/** A tube due at (or leaving) a station. */
export interface TubeDep { line?: string; t: number; [k: string]: unknown; }
/** The last London station you were seen at, and the tubes due there then. */
export interface HubVisit { hub: StationCode; seen: number; arrivals: TubeDep[] | null; }
/** The train you're on, once sure (or picked). */
export interface TrainLock { operator: string; std: string; from: StationCode; picked?: boolean; serviceId?: string; }
/** Where National Rail last reported a train (Service Details, parsed). */
export interface Progress {
  last: { code: string | null; t: number } | null;
  next: { code: string | null; t: number | null } | null;
  at(code: string): number | null;
}

/** Your position from the phone. `acc` in metres. */
export interface Fix { here: LatLon | null; acc: number | null; at: number | null; }

// A position counts only with a known accuracy within `maxAcc` metres (a missing accuracy is unknown, not perfect).
const pos = (f: Fix, maxAcc: number) => (f.here && typeof f.acc === "number" && isFinite(f.acc) && f.acc <= maxAcc ? f.here : null);

/** At a London station (within `atHubKm`, with a fix good to 250 m)? */
export function hubHere(f: Fix, p: Profile): StationCode | null {
  const here = pos(f, 250); if (!here) return null;
  for (const h of Object.keys(p.places.hubGeo)) if (km(here, p.places.hubGeo[h]) <= p.places.atHubKm) return h;
  return null;
}

/** On the line between the home station and London: past the first tenth (home and its area never count),
 *  short of the London end, within 1 km of the line, with a fix good to 500 m, and not at a London station. */
export function onLine(f: Fix, atHub: StationCode | null, line: LatLon[]): boolean {
  const here = pos(f, 500); if (!here || atHub) return false;
  const pr = lineProgress(here, line); return pr.offKm < 1.0 && pr.frac > 0.1 && pr.frac < 0.97;
}

/** How far along the line you were at a moment, and whether you've been seen moving along it like a train. */
export interface LineTrack { at: number | null; km: number; moving: boolean; }
const lineKm = (line: LatLon[]) => line.slice(1).reduce((t, q, i) => t + km(line[i], q), 0);
/**
 * On a train: on the line and seen moving along it — the phone's speed at 5 m/s (18 km/h) or more, or 300 m+
 * along the line at 15 km/h or more within 3 minutes. Near home (Letchworth to just past Hitchin) only right by the
 * track and at train speed. Once moving it stays on the line while you're on it
 * (a train standing at a station still counts); `keep` (a train you picked) counts as moving. Standing on a
 * platform or near the line doesn't. Returns whether you're on a train and the track to keep for next time.
 */
export function trackLine(prev: LineTrack | null, f: Fix, speed: number | null, atHub: StationCode | null, line: LatLon[], keep = false): { onLine: boolean; track: LineTrack | null } {
  if (atHub) return { onLine: false, track: null };
  // A fix too rough to place you (worse than 500 m) changes nothing: keep what we knew.
  const here = pos(f, 500); if (!here) return prev ? { onLine: prev.moving, track: prev } : { onLine: false, track: null };
  const pr = lineProgress(here, line);
  // The first tenth of the line (Letchworth to just past Hitchin, where home is) counts only right by the track
  // (300 m) and at train speed (12 m/s, about 43 km/h); beyond it, within 1 km at walking-plus speed.
  const nearHome = pr.frac > 0.01 && pr.frac <= 0.1 && pr.offKm < 0.3;
  if (!nearHome && !(pr.offKm < 1.0 && pr.frac > 0.1 && pr.frac < 0.97)) return { onLine: false, track: null };
  const along = pr.frac * lineKm(line);
  const ref = prev && !prev.moving && prev.at != null && f.at != null && f.at > prev.at && f.at - prev.at <= 180e3 ? prev : null;
  const dKm = ref ? Math.abs(along - ref.km) : 0, hours = ref ? ((f.at as number) - (ref.at as number)) / 3600e3 : 0;
  const minSpeed = nearHome ? 12 : 5, minKmh = nearHome ? 40 : 15, minKm = nearHome ? 0.5 : 0.3;
  const moving = !!(prev && prev.moving) || keep || (speed != null && speed >= minSpeed) || (!!ref && dKm >= minKm && dKm / hours >= minKmh);
  const track: LineTrack = moving || !ref ? { at: f.at, km: along, moving } : ref;
  return { onLine: moving, track };
}

export const nearOffice = (here: LatLon | null, p: Profile) =>
  !!here && (km(here, p.places.office) < 1.2 || km(here, p.places.officeTube) < 1.0);

/** What the screen remembers between position updates for working out direction. */
export interface DirectionMemory { trip?: { dir: Direction; at: number } | null; officeVisit?: string | null; officeSince?: number | null; officeNearSince?: number | null; }
/** At the office: within 150 m (indoor GPS is often ±15–50 m). Counted as having been there (so anywhere else is
 *  heading home) only after 5 minutes there; arriving, or passing by, doesn't turn the journey round.
 *  Indoor GPS can sit further out all day (30 Oct: 217 m at the desk), so staying within 300 m for 10 minutes
 *  also counts; walking across that circle takes about 7. */
export const AT_OFFICE_KM = 0.15, OFFICE_DWELL_MS = 5 * 60e3, NEAR_OFFICE_KM = 0.3, NEAR_OFFICE_DWELL_MS = 10 * 60e3;

/**
 * Which way you're heading, from where you are. Near the home station you're setting off for work, unless you've
 * been heading home in the last 3 hours (arriving). Once at the office today, anywhere else is heading home.
 * In between, the direction of the journey you started (for 3 hours), else towards whichever end is further.
 * Returns the direction and the memory to keep.
 */
export function inferDirection(here: LatLon, now: number, today: string, mem: DirectionMemory, p: Profile): { dir: Direction; mem: DirectionMemory } {
  const dHome = km(here, p.places.homeStation), dTube = km(here, p.places.officeTube);
  const out: DirectionMemory = { trip: mem.trip || null, officeVisit: mem.officeVisit || null, officeSince: mem.officeSince || null, officeNearSince: mem.officeNearSince || null };
  // Time you've been within `radius` of the office since; an arrival time from another day (no fix since you
  // left) starts again; leaving resets it. Returns whether you've stayed `dwell`.
  const dOff = km(here, p.places.office), sameDay = (t: number) => new Date(t).toDateString() === new Date(now).toDateString();
  const stayed = (key: "officeSince" | "officeNearSince", radius: number, dwell: number) => {
    if (dOff >= radius) { out[key] = null; return false; }
    const since = out[key] && sameDay(out[key] as number) ? out[key] as number : now;
    out[key] = since; return now - since >= dwell;
  };
  const atDesk = stayed("officeSince", AT_OFFICE_KM, OFFICE_DWELL_MS), nearby = stayed("officeNearSince", NEAR_OFFICE_KM, NEAR_OFFICE_DWELL_MS);
  if (out.officeVisit !== today && (atDesk || nearby)) out.officeVisit = today;
  const trip = out.trip, recent = !!trip && now - trip.at < 3 * 3600e3;
  let dir: Direction;
  if (dHome < 3 && recent && trip!.dir === "home") dir = "home";
  else if (dHome < 3) { dir = "office"; out.trip = { dir: "office", at: now }; }
  else if (out.officeVisit === today) dir = "home";
  else if (recent) dir = trip!.dir;
  else dir = dHome <= dTube ? "office" : "home";
  // Heading home away from the home station: remember it, so arriving there isn't taken as setting off.
  if (dir === "home" && dHome >= 3) out.trip = { dir: "home", at: now };
  return { dir, mem: out };
}

/** A candidate train you might be on. */
export interface TrainFit {
  t: Train; hub: StationCode; mine: number; offMin: number; projected: number; live: boolean; reported: boolean; ruledOut: boolean;
  sure?: boolean; other?: TrainFit | null; others?: TrainFit[]; locked?: boolean; picked?: boolean;
  /** high: picked, or sure with a reported position; medium: sure from timing alone; low: unsure or position stale. */
  confidence?: "high" | "medium" | "low";
  stale?: boolean; fixAgeMin?: number;
}
export type WhichTrain = TrainFit | { none: true; others: TrainFit[] };

/** The remembered train among `items`: by National Rail service ID (and station) when both have one, else by
 *  operator, scheduled time and station. */
function findLocked<T>(items: T[], train: (x: T) => Train, lock: TrainLock): T | undefined {
  const byFields = (t: Train) => t.operator === lock.operator && t.std === lock.std && t.from === lock.from;
  if (lock.serviceId) {
    const ids = items.filter(x => train(x).serviceId === lock.serviceId);
    const hit = ids.find(x => train(x).from === lock.from) || ids[0];
    if (hit) return hit;
  }
  return items.find(x => byFields(train(x)));
}
const lockOf = (t: Train, picked?: boolean): TrainLock => ({ operator: t.operator, std: t.std, from: t.from, ...(t.serviceId ? { serviceId: t.serviceId } : {}), ...(picked ? { picked } : {}) });
export { lockOf };

/**
 * Which train you're probably on: how far along the line you are against how far each departed train should be
 * (where National Rail last reported it when known, else its timing). Once sure it stays with that train unless
 * you're over 12 min from it or another fits 6+ min better; a train you picked always wins. Returns the answer
 * and the lock to keep.
 */
export function whichTrain(boards: Record<string, Board | null | undefined>, here: LatLon, dir: Direction, now: number,
    lock: TrainLock | null, progress: (serviceId?: string) => Progress | null, p: Profile, fixAt?: number | null): { result: WhichTrain; lock: TrainLock | null } {
  // Trains are compared with where you were when the phone took the fix, not now: an old position compared with
  // the current time makes every train look further ahead than you. Over 2 minutes old the position is stale:
  // it can't switch or settle which train you're on, only keep the one remembered.
  const at = fixAt != null && fixAt <= now ? fixAt : now, ageMin = (now - at) / 60e3, stale = ageMin > 2;
  const cands: TrainFit[] = [];
  for (const B of Object.values(boards)) {
    for (const t of (B && B.services) || []) {
      if (t.cancelled || t.dep == null || t.arr == null) continue;
      const toLondon = t.from === p.home, hub = toLondon ? t.to : t.from;
      if ((dir === "office") !== toLondon || !p.lines[hub]) continue;
      if (t.dep > now + 60e3 || t.arr < now - 120e3) continue;
      const len = t.arr - t.dep, pr = lineProgress(here, p.lines[hub]);
      const mine = toLondon ? pr.frac : 1 - pr.frac;          // how far along you are, from where the train started
      // You can't be on a train that hasn't left: clear of the station (about 1.5 km), only departed trains count.
      if (mine > 0.03 && t.dep > at) continue;
      let expected = Math.max(0, Math.min(1, (at - t.dep) / len)), reported = false;
      const pg = progress(t.serviceId);
      if (pg) { const rf = reportedFrac(pg.last, pg.next, t.from, at, p.lines[hub], p.stationGeo || {});
        if (rf != null) { expected = toLondon ? rf : 1 - rf; reported = true; } }
      // Arrival: the live expected time when the train is live; otherwise from your position.
      const projected = t.timetable ? at + (1 - mine) * len : t.arr;
      const offMin = Math.abs(expected - mine) * len / 60e3;
      // A reported position is good to a few minutes: more than 6 min from you rules the train out (still pickable).
      cands.push({ t, hub, mine, offMin, projected, live: !t.timetable, reported, ruledOut: reported && offMin > 6 });
    }
  }
  cands.sort((a, b) => a.offMin - b.offMin);
  // The same train appears once per London station it calls at: the runner-up must be a different train.
  const same = (a: TrainFit, b: TrainFit) => a.t.operator === b.t.operator && Math.abs(dir === "office" ? a.t.dep - b.t.dep : (a.t.arr as number) - (b.t.arr as number)) <= 60e3;
  const locked = lock ? findLocked(cands, c => c.t, lock) : undefined;
  const others = (c0: TrainFit) => cands.filter((c, i) => !same(c, c0) && cands.findIndex(x => same(x, c)) === i).slice(0, 3);
  const age = { stale, fixAgeMin: Math.round(ageMin) };
  // Remembering the service ID once it's known (a train remembered before live data arrived).
  const withId = (l: TrainLock, t: Train): TrainLock => (!l.serviceId && t.serviceId ? { ...l, serviceId: t.serviceId } : l);
  if (locked && lock!.picked) { Object.assign(locked, { sure: true, other: null, locked: true, picked: true, others: others(locked), confidence: "high", ...age }); return { result: locked, lock: withId(lock!, locked.t) }; }
  const keeps = locked && !locked.ruledOut && (stale || (locked.offMin <= 12 && !(cands[0] !== locked && !same(cands[0], locked) && locked.offMin - cands[0].offMin >= 6)));
  if (locked && keeps) {
    Object.assign(locked, { sure: true, other: null, locked: true, others: others(locked), confidence: stale ? "low" : locked.reported ? "high" : "medium", ...age });
    return { result: locked, lock: withId(lock!, locked.t) };
  }
  const fits = cands.filter(c => !c.ruledOut);
  if (!fits.length || fits[0].offMin > 10) {
    const nobody = { t: { operator: "", arr: -1, dep: -1 } } as unknown as TrainFit;
    return { result: { none: true, others: others(nobody) }, lock };
  }
  const best = fits[0], next = fits.find(c => !same(c, best));
  best.sure = !next || next.offMin - best.offMin >= 4;
  best.other = best.sure ? null : next;
  best.others = others(best);
  best.confidence = stale || !best.sure ? "low" : best.reported ? "high" : "medium";
  Object.assign(best, age);
  // A stale position never settles which train you're on.
  return { result: best, lock: best.sure && !stale ? lockOf(best.t) : lock };
}

/** The remembered train, from the loaded boards. */
export function lockedTrain(boards: Record<string, Board | null | undefined> | null, lock: TrainLock | null): Train | null {
  if (!lock || !boards) return null;
  return findLocked(Object.values(boards).flatMap(b => (b ? b.services : [])), t => t, lock) || null;
}

const stale = (f: Fix, now: number) => !f.at || now - f.at > 90e3;

/** How much sooner than the walk model says you could have been on the platform: a tube leaving more than this
 *  before `ready` (arrival at the station + the walk to the platform) is one you couldn't have caught. 30 Oct: GPS
 *  went quiet underground at King's Cross, the 08:40 Circle counted as "a tube has left" while Sam was still walking
 *  down, and he was put on it (then could only correct it to the 08:38 H&C); he caught the 08:46 H&C. */
export const TUBE_REACH_SLACK_MS = 60e3;
const reachable = (arrivals: TubeDep[], ready: number | null | undefined) =>
  ready == null ? arrivals : arrivals.filter(a => a.t >= ready - TUBE_REACH_SLACK_MS);

/** On the tube to work: at a London station in the last 25 min, a tube you could have caught has left since (see
 *  `ready`), and you've left the station (or your location stopped updating underground for over 90 s). Never near
 *  the office's tube station. `ready`: when you could be on the platform (arrival + walk); unknown = any tube. */
export function onTube(lastHub: HubVisit | null, dir: Direction, now: number, f: Fix, onTheLine: boolean, atHub: StationCode | null, p: Profile, ready?: number | null): boolean {
  if (!lastHub || dir !== "office" || now - lastHub.seen > 25 * 60e3 || onTheLine) return false;
  if (f.here && km(f.here, p.places.officeTube) < 0.3) return false;
  if (atHub && !stale(f, now)) return false;
  return reachable(lastHub.arrivals || [], ready).some(a => a.t <= now);
}

/** Which tube you probably took: of those you could have caught (see `ready`), the one leaving closest to when you
 *  were last seen, or to when you could be on the platform if that's later; another within 3 min is "or". If none
 *  you could have caught has left, the nearest of any that has. */
export function whichTube(lastHub: HubVisit, now: number, ready?: number | null): { best: TubeDep; other?: TubeDep } | null {
  const all = (lastHub.arrivals || []).filter(a => a.t <= now + 30e3);
  const could = reachable(all, ready), gone = could.length ? could : all;
  if (!gone.length) return null;
  const at = Math.max(lastHub.seen, ready ?? -Infinity), off = (a: TubeDep) => Math.abs(a.t - at);
  gone.sort((a, b) => off(a) - off(b));
  const best = gone[0], other = gone.find(a => a !== best && off(a) - off(best) < 3 * 60e3);
  return { best, other };
}

/** "On a different tube?": the others that have left (or are leaving), within 6 min of the one you're on, nearest
 *  first, at most `max`. Earlier ones you'd have needed to be quick for are kept: never hide a train. */
export function otherTubes(deps: TubeDep[] | null | undefined, on: TubeDep, now: number, max = 3): TubeDep[] {
  return (deps || [])
    .filter(a => a.t <= now + 30e3 && a.t !== on.t && Math.abs(a.t - on.t) < 6 * 60e3)
    .sort((a, b) => Math.abs(a.t - on.t) - Math.abs(b.t - on.t) || a.t - b.t).slice(0, max);
}

/** On the way to work, somewhere in London (not at a station, on the train or a tube): plan from where you are. */
export function inLondonToOffice(dir: Direction, f: Fix, atHub: StationCode | null, onTheLine: boolean, onATube: boolean, p: Profile): boolean {
  const here = pos(f, 300); if (dir !== "office" || !here) return false;
  if (atHub || onTheLine || onATube) return false;
  return km(here, p.places.homeStation) > 15 && km(here, p.places.office) < 25;
}

/** Going home and at the office's tube station (within 150 m, fix good to 150 m): worth remembering for the tubes
 *  due then. Never evidence that you're on a tube: the office can read as here (30 Oct). */
export const atOfficeTube = (dir: Direction, f: Fix, p: Profile) => {
  const here = pos(f, 150); return dir === "home" && !!here && km(here, p.places.officeTube) <= 0.15;
};

/** Nearly home: heading home (commute) within 3 km of the home station and not on the line. */
export const nearlyHome = (dir: Direction, mode: Mode, here: LatLon | null, onTheLine: boolean, p: Profile) =>
  dir === "home" && mode !== "leisure" && !!here && !onTheLine && km(here, p.places.homeStation) < 3;

/** A walk worked out from a straight line (streets factor, walking speed), in seconds. */
export const walkSecs = (from: LatLon, to: LatLon, pace: Pace | "leisure", p: Profile) =>
  km(from, to) * p.walking.streetFactor / p.walking.kmh[pace] * 3600;

/** Nearly home: when you'll be home.
 *  train — from the train's expected time at the home station (+ exit + walk), while it hasn't arrived;
 *  home — within 100 m of home; walk — the walk from here to home; station — at the station, the usual walk;
 *  unknown — near the station but home isn't set. */
export type HomeEta = { kind: "train"; at: number; stationAt: number } | { kind: "home" } | { kind: "walk"; at: number; secs: number }
  | { kind: "station"; at: number } | { kind: "unknown" };
export function nearlyHomeEta(now: number, here: LatLon, stationAt: number | null, home: LatLon | null, exitMs: number, walkMs: number, pace: Pace, p: Profile): HomeEta {
  const atHome = !!home && km(here, home) < 0.1;
  if (stationAt && stationAt > now - 60e3 && !atHome) return { kind: "train", at: stationAt + exitMs + walkMs, stationAt };
  if (home) {
    if (atHome) return { kind: "home" };
    const secs = walkSecs(here, home, pace, p);
    return { kind: "walk", at: now + secs * 1000, secs };
  }
  return km(here, p.places.homeStation) < 0.3 ? { kind: "station", at: now + exitMs + walkMs } : { kind: "unknown" };
}


/**
 * You've left home: more than 100 m from your saved home allowing for the fix's accuracy (GPS drift at home isn't
 * leaving); without a saved home, the walk from here is at least 3 minutes shorter than the walk from home.
 */
export function leftHome(here: LatLon, accM: number, home: LatLon | null, walkHereSecs: number, homeWalkSecs: number): boolean {
  return home ? km(here, home) >= 0.1 + (accM || 0) / 1000 : walkHereSecs <= homeWalkSecs - 180;
}
