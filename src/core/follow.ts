// Following a route: you chose a journey; the engine keeps track of it against live data. The arrival changes only
// for a reason that is said (cancelled, late, missed); missed or cancelled offers the best way on from where you
// are; a better option is offered only when it gets you there at least 5 minutes sooner and you can make it.
// Generic: any journey built from route segments and a train. Story: docs/stories/follow-a-route.md
import type { Direction, Option, Train } from "./types";

/** A better option must get you there at least this much sooner (Sam, 30 Oct). */
export const BETTER_MS = 5 * 60e3;
/** A change of arrival smaller than this isn't a change (live times move by seconds). */
export const CHANGE_MS = 60e3;

/** Which train: by National Rail service ID when known, else operator, timetabled time and station. */
export interface TrainId { operator: string; std: string; from: string; serviceId?: string; }
export const trainKey = (t: TrainId) => `${t.operator}|${t.std}|${t.from}`;
const sameTrain = (a: TrainId, b: TrainId) => (a.serviceId && b.serviceId ? a.serviceId === b.serviceId : trainKey(a) === trainKey(b));

/** Why the arrival changed (or why the route can't be completed). */
export interface Reason { kind: "cancelled" | "late" | "earlier" | "missed" | "updated"; text: string; at: number; level: "bad" | "warn" | "ok"; }

/** The route you're following, as saved on the phone. */
export interface Followed {
  dir: Direction;
  train: TrainId;
  hub: string;
  /** From the train's arrival to yours (walks, exits), fixed when you chose it. */
  afterMs: number;
  /** The arrival you were shown when you chose it, and the one shown now. */
  planned: number;
  arrive: number;
  /** The train's lateness (min) when the arrival was last shown, to say why it changed. */
  lateMin: number;
  followedAt: number;
  /** The last reason shown, until you dismiss it or another replaces it. */
  reason: Reason | null;
  /** Better options you said no to (train keys): never offered again. */
  declined: string[];
}

/** Every train an option can be boarded on (the same train at another station counts). */
const trainsOf = (o: Option): Train[] => [o.train, ...((o.alts || []) as Option[]).map(a => a.train)];
export const optionHas = (o: Option, id: TrainId) => trainsOf(o).some(t => sameTrain(t, id));

/** Start following an option. */
export function followOption(o: Option, dir: Direction, now: number): Followed {
  const t = o.train;
  return {
    dir, hub: o.hub, train: { operator: t.operator, std: t.std, from: t.from, ...(t.serviceId ? { serviceId: t.serviceId } : {}) },
    afterMs: o.arrive - (t.arr as number), planned: o.arrive, arrive: o.arrive, lateMin: t.arrLate || 0, followedAt: now, reason: null, declined: [],
  };
}

/** Find your train among loaded trains. */
export function findTrain(trains: Train[], id: TrainId): Train | null {
  return trains.find(t => id.serviceId && t.serviceId === id.serviceId) || trains.find(t => trainKey(t) === trainKey(id)) || null;
}

export interface FollowInput {
  now: number;
  /** Your train as currently loaded (null if it's gone from the boards). */
  train: Train | null;
  /** Your journey from where you are now (from the Leave now list), if it's still listed. */
  option: Option | null;
  /** Every option from where you are now (Leave now list), for the way on and better options. */
  options: Option[];
  /** You're on your train (worked out or picked). */
  onBoard: boolean;
  /** On a tube to the station: when it reaches the station and how long you need there before the train (ms). */
  tube?: { reach: number; readyMs: number } | null;
}
export type FollowState = "on" | "cancelled" | "missed" | "arrived";
export interface FollowStatus {
  state: FollowState;
  /** The arrival shown. */
  arrive: number;
  /** Whole minutes in hand before you must set off (or reach the platform); negative = behind. Null when on board. */
  spareMin: number | null;
  /** What it takes now: from the option's effort grade (walk, fast, run, car). */
  effort: Option["effort"] | null;
  /** The best way on, when your route is cancelled or missed: the earliest arrival you can still make. */
  next: Option | null;
  /** An option at least 5 min sooner that you can make (not declined). */
  better: Option | null;
  /** The route, updated (arrival, reason). Save it. */
  followed: Followed;
}

const catchable = (o: Option) => !o.train.cancelled && !o.uncertain && !o.train.depUnknown && !o.missed && o.effort !== "none";
const easy = (o: Option) => catchable(o) && (o.effort == null || o.effort === "walk" || o.effort === "fast");
const earliest = (os: Option[]) => os.reduce<Option | null>((b, o) => (!b || o.arrive < b.arrive || (o.arrive === b.arrive && o.leave > b.leave) ? o : b), null);

/**
 * Where you are on the route you're following. Order: arrived; cancelled; missed (not on it and it has left, it
 * can't be made at any effort, or your tube reaches the station too late); otherwise on it, with minutes in hand.
 * The arrival changes only with a reason: the train's lateness changed, or it was cancelled or missed.
 */
export function trackFollowed(f: Followed, i: FollowInput): FollowStatus {
  const out: Followed = { ...f, declined: [...f.declined] };
  const { now, train, option } = i;
  const say = (kind: Reason["kind"], text: string, level: Reason["level"]) => { out.reason = { kind, text, at: now, level }; };
  const name = `${f.train.std} ${f.train.operator}`;
  const base = { effort: option ? option.effort ?? null : null, next: null as Option | null, better: null as Option | null };
  // Arrived: past the arrival (plus 5 minutes) and not still on a late-running train.
  const arriveNow = train && train.arr != null ? train.arr + f.afterMs : f.arrive;
  if (now > Math.max(f.arrive, arriveNow) + 5 * 60e3) return { state: "arrived", arrive: f.arrive, spareMin: null, ...base, followed: out };
  const others = i.options.filter(o => !optionHas(o, f.train));
  if (train && train.cancelled) {
    if (!out.reason || out.reason.kind !== "cancelled") say("cancelled", `Your ${name} is cancelled`, "bad");
    return { state: "cancelled", arrive: f.arrive, spareMin: null, ...base, next: earliest(others.filter(catchable)), followed: out };
  }
  // Minutes in hand: on a tube, from when it reaches the station; otherwise from when you must set off.
  const spareMs = i.onBoard ? null : i.tube && train ? train.dep - (i.tube.reach + i.tube.readyMs) : option ? option.leave - now : null;
  const gone = !i.onBoard && (!train || train.dep < now - 30e3);
  // An option whose walking leave time has passed (Leave now's "missed") can still be made running: that's behind, not
  // lost. Lost is only "can't make it at any effort".
  const cantMake = !i.onBoard && (i.tube ? spareMs != null && spareMs < 0 : !!option && option.effort === "none");
  if (gone || cantMake) {
    if (!out.reason || out.reason.kind !== "missed") say("missed", gone ? `You've missed the ${name}` : `You can't make the ${name} now`, "bad");
    return { state: "missed", arrive: f.arrive, spareMin: spareMs == null ? null : Math.floor(spareMs / 60e3), ...base, next: earliest(others.filter(catchable)), followed: out };
  }
  // On it (or on track for it): the arrival follows the train, with the reason when it moves.
  const arrive = train && train.arr != null ? train.arr + f.afterMs : f.arrive;
  if (Math.abs(arrive - f.arrive) >= CHANGE_MS) {
    const late = train ? train.arrLate || 0 : 0;
    if (late > f.lateMin) say("late", late >= 1 ? `Your ${name} is now ${late} min late` : `Your ${name} is running later`, late >= 5 ? "bad" : "warn");
    else if (arrive < f.arrive) say("earlier", late >= 1 ? `Your ${name} is now only ${late} min late` : `Your ${name} is back on time`, "ok");
    else say("updated", `Your ${name}'s expected arrival changed`, "warn");
    out.arrive = arrive; out.lateMin = late;
  }
  const better = earliest(others.filter(o => easy(o) && o.arrive <= out.arrive - BETTER_MS && !out.declined.includes(trainKey(o.train))));
  return { state: "on", arrive: out.arrive, spareMin: spareMs == null ? null : Math.floor(spareMs / 60e3), ...base, better, followed: out };
}
