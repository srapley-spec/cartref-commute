// Following a route: you chose a journey; the engine keeps track of it against live data. The arrival changes only
// for a reason that is said (cancelled, late, missed); missed or cancelled offers the best way on from where you
// are; a better option is offered only when it gets you there at least 5 minutes sooner and you can make it.
// Generic: any journey built from route segments and a train. Story: docs/stories/follow-a-route.md
import type { Direction, Option, Train } from "./types";

/** A better option must get you there at least this much sooner (Sam, 30 Oct). */
export const BETTER_MS = 5 * 60e3;
/** A change of arrival smaller than this isn't a change (live times move by seconds). */
export const CHANGE_MS = 60e3;
/** Leaving within this long counts as not yet gone (live times move by seconds). */
const GONE_GRACE_MS = 30e3;

/** Which train: by National Rail service ID when both have one, else operator, timetabled time and station. */
export interface TrainId { operator: string; std: string; from: string; serviceId?: string; }
export const trainKey = (t: TrainId) => `${t.operator}|${t.std}|${t.from}`;
const sameTrain = (a: TrainId, b: TrainId) => (a.serviceId && b.serviceId ? a.serviceId === b.serviceId : trainKey(a) === trainKey(b));
const idOf = (t: Train): TrainId => ({ operator: t.operator, std: t.std, from: t.from, ...(t.serviceId ? { serviceId: t.serviceId } : {}) });

/** Why the arrival changed (or why the route can't be completed). */
export interface Reason { kind: "cancelled" | "late" | "earlier" | "missed" | "updated"; text: string; at: number; level: "bad" | "warn" | "ok"; }

/** The route you're following, as saved on the phone. */
export interface Followed {
  dir: Direction;
  /** The train you chose (named on the card), and every station you could board it at (the same train merged). */
  train: TrainId;
  calls: TrainId[];
  hub: string;
  /** When the last of those calls was due to leave: after that (plus 30 s) a train gone from the boards has left. */
  lastDep: number;
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
  /** A cancelled or missed you said OK to: not said again while it stays so. */
  dismissed: Reason["kind"] | null;
  /** Better options you said no to (train keys): never offered again. */
  declined: string[];
}

/** Every train an option can be boarded on (the same train at another station counts). */
const trainsOf = (o: Pick<Option, "train" | "alts">): Train[] => [o.train, ...((o.alts || []) as Option[]).map(a => a.train)];
const isMine = (f: Pick<Followed, "calls">, t: TrainId) => f.calls.some(id => sameTrain(t, id));
/** Is this option (or this train) the route you're following? */
export const followHas = (o: Pick<Option, "train" | "alts">, f: Pick<Followed, "calls">) => trainsOf(o).some(t => isMine(f, t));
export const optionHas = (o: Pick<Option, "train" | "alts">, id: TrainId) => followHas(o, { calls: [id] });

/** Start following an option. */
export function followOption(o: Option, dir: Direction, now: number): Followed {
  const t = o.train, calls = trainsOf(o);
  return {
    dir, hub: o.hub, train: idOf(t), calls: calls.map(idOf), lastDep: Math.max(...calls.map(c => c.dep)),
    afterMs: o.arrive - (t.arr as number), planned: o.arrive, arrive: o.arrive, lateMin: t.arrLate || 0, followedAt: now,
    reason: null, dismissed: null, declined: [],
  };
}

/** OK on the reason: it goes; a cancelled or missed isn't said again while it stays so. */
export const dismissReason = (f: Followed): Followed =>
  ({ ...f, reason: null, dismissed: f.reason && (f.reason.kind === "cancelled" || f.reason.kind === "missed") ? f.reason.kind : f.dismissed });

/** Find a train among loaded trains: service ID and station first, then operator/time/station, then service ID alone. */
export function findTrain(trains: Train[], id: TrainId): Train | null {
  return trains.find(t => id.serviceId && t.serviceId === id.serviceId && t.from === id.from) || trains.find(t => trainKey(t) === trainKey(id))
    || trains.find(t => id.serviceId && t.serviceId === id.serviceId) || null;
}

export interface FollowInput {
  now: number;
  /** Every train loaded (all boards), or null while they haven't loaded: then nothing is decided. */
  trains: Train[] | null;
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
  /** Your train (the call still to come when it calls at more than one station), when loaded. */
  train: Train | null;
  /** The best way on, when your route is cancelled or missed: the earliest arrival you can still make. */
  next: Option | null;
  /** An option at least 5 min sooner that you can make (not declined); never while you're on the train or a tube. */
  better: Option | null;
  /** The route, updated (arrival, reason). Save it. */
  followed: Followed;
}

const catchable = (o: Option) => !o.train.cancelled && !o.uncertain && !o.train.depUnknown && !o.missed && o.effort !== "none";
const easy = (o: Option) => catchable(o) && (o.effort == null || o.effort === "walk" || o.effort === "fast");
const earliest = (os: Option[]) => os.reduce<Option | null>((b, o) => (!b || o.arrive < b.arrive || (o.arrive === b.arrive && o.leave > b.leave) ? o : b), null);

/**
 * Where you are on the route you're following. Order: not loaded (nothing decided); arrived; cancelled; missed (not
 * on it and every station's call has left, it can't be made at any effort, or your tube reaches the station too
 * late); otherwise on it, with minutes in hand. The arrival changes only with a reason: the train's lateness
 * changed, it was cancelled or missed, or it's back.
 */
export function trackFollowed(f: Followed, i: FollowInput): FollowStatus {
  const out: Followed = { ...f, declined: [...f.declined], calls: f.calls || [f.train], dismissed: f.dismissed ?? null };
  const { now, option } = i;
  const say = (kind: Reason["kind"], text: string, level: Reason["level"]) => { out.reason = { kind, text, at: now, level }; };
  // Said once: not again while it's still on the card, nor after OK while it stays so.
  const sayOnce = (kind: "cancelled" | "missed", text: string) => { if ((!out.reason || out.reason.kind !== kind) && out.dismissed !== kind) say(kind, text, "bad"); };
  const name = `${f.train.std} ${f.train.operator}`;
  const base = { effort: option ? option.effort ?? null : null, next: null as Option | null, better: null as Option | null };
  // Not loaded yet (reopening, a change of direction, a failed load): nothing can be decided.
  if (!i.trains) return { state: "on", arrive: out.arrive, spareMin: null, ...base, train: null, followed: out };
  const mine = i.trains.filter(t => isMine(out, t)).sort((a, b) => a.dep - b.dep);
  const toCome = mine.filter(t => t.dep >= now - GONE_GRACE_MS);
  const train = toCome[0] || mine[mine.length - 1] || null;
  // Arrived: past the arrival (plus 5 minutes) and not still on a late-running train.
  const arriveNow = train && train.arr != null ? train.arr + f.afterMs : f.arrive;
  if (now > Math.max(f.arrive, arriveNow) + 5 * 60e3) return { state: "arrived", arrive: out.arrive, spareMin: null, ...base, train, followed: out };
  const others = i.options.filter(o => !followHas(o, out));
  if (train && train.cancelled) {
    sayOnce("cancelled", `Your ${name} is cancelled`);
    return { state: "cancelled", arrive: out.arrive, spareMin: null, ...base, train, next: earliest(others.filter(catchable)), followed: out };
  }
  // Minutes in hand: on a tube, from when it reaches the station; otherwise from when you must set off.
  const spareMs = i.onBoard ? null : i.tube && train ? train.dep - (i.tube.reach + i.tube.readyMs) : option ? option.leave - now : null;
  // Gone: no call still to come; a train missing from the boards counts only once its last call was due to leave.
  const gone = !i.onBoard && !toCome.length && (mine.length > 0 || now > out.lastDep + GONE_GRACE_MS);
  // Past the walking leave time but makeable running is behind, not lost. Lost is only "can't make it at any effort".
  const cantMake = !i.onBoard && (i.tube ? spareMs != null && spareMs < 0 : !!option && option.effort === "none");
  if (gone || cantMake) {
    sayOnce("missed", gone ? `You've missed the ${name}` : `You can't make the ${name} now`);
    return { state: "missed", arrive: out.arrive, spareMin: spareMs == null ? null : Math.floor(spareMs / 60e3), ...base, train, next: earliest(others.filter(catchable)), followed: out };
  }
  // Back on it after a cancellation or a missed connection: said, so the old reason doesn't stay wrong.
  if (out.reason && (out.reason.kind === "cancelled" || out.reason.kind === "missed"))
    say("updated", out.reason.kind === "cancelled" ? `Your ${name} is running again` : `You can make the ${name} again`, "ok");
  out.dismissed = null;
  // On it (or on track for it): the arrival follows the train, with the reason when it moves.
  const arrive = train && train.arr != null ? train.arr + f.afterMs : out.arrive;
  if (Math.abs(arrive - out.arrive) >= CHANGE_MS) {
    const late = train ? train.arrLate || 0 : 0;
    if (late > out.lateMin) say("late", late >= 1 ? `Your ${name} is now ${late} min late` : `Your ${name} is running later`, late >= 5 ? "bad" : "warn");
    else if (arrive < out.arrive) say("earlier", late >= 1 ? `Your ${name} is now only ${late} min late` : out.lateMin >= 1 ? `Your ${name} is back on time` : `Your ${name} is now expected earlier`, "ok");
    else say("updated", `Your ${name}'s expected arrival changed`, "warn");
    out.arrive = arrive; out.lateMin = late;
  }
  const better = i.onBoard || i.tube ? null
    : earliest(others.filter(o => easy(o) && o.arrive <= out.arrive - BETTER_MS && !out.declined.includes(trainKey(o.train))));
  return { state: "on", arrive: out.arrive, spareMin: spareMs == null ? null : Math.floor(spareMs / 60e3), ...base, train, better, followed: out };
}
