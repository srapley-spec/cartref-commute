// Follow one chosen journey. All clocks, observations and alternatives are supplied by the shell.
// Ranking may offer a replacement; it must never replace the selected journey.
import type { Direction, Option, Train } from './types';
import type { Leg } from './journey';
import { hhmm } from './time';
import { arrivalStatus, trainStatus, type TrainStatus } from './rules';

const MIN = 60e3;
export const FOLLOW_BETTER_MIN = 5;
export type FollowPhase = 'before-train' | 'on-train' | 'after-train' | 'arrived';
export interface FollowNotice {
  id: string; kind: 'cancelled' | 'unknown' | 'missed' | 'arrival' | 'platform';
  text: string; at: number; deltaMin?: number;
}
export interface FollowRoute {
  version: 1; id: string; direction: Direction; mode: 'commute' | 'leisure'; startedAt: number;
  option: Option; plannedArrival: number; expectedArrival: number;
  lastTrain: Train; phase: FollowPhase; notices: FollowNotice[];
  dismissedAlternatives: string[]; seenEvents: string[];
}
export interface FollowInput {
  now: number; options: Option[]; dataFresh?: boolean; phase?: FollowPhase;
  /** Existing Service Details/connection engine's door-to-door arrival, when available. */
  currentArrival?: number | null;
  /** Fresh onward GPS/vehicle observations are independent of the old rail board's age. */
  onwardFresh?: boolean;
  /** Expected rail-stop time from Service Details; original onward segments supply the tail. */
  currentTrainArrival?: number | null;
  /** True only for a fresh live rail-stop report, not a position-derived timetable projection. */
  trainArrivalLive?: boolean;
  /** Already graded/ranked alternatives; options above retain departed/cancelled chosen services. */
  availableOptions?: Option[];
  /** Rail-ready instants from the existing connection engine, keyed by boarding hub. */
  readyAt?: Record<string, number>;
  /** Already riding an approach leg: do not plan the office/home walk again. */
  activeConnection?: boolean;
  /** Optional current-connection steps already timed by the existing connection engine. */
  connectionSteps?: Record<string, Leg[]>;
  /** A missing/rough location must not turn a vanished departure into a missed connection. */
  hasReliableLocation?: boolean;
}
export interface FollowUpdate {
  route: FollowRoute; status: 'on-track' | 'hurry' | 'missed' | 'cancelled' | 'unknown' | 'arrived';
  level: 'ok' | 'warn' | 'bad' | 'info'; text: string; nextStep: Leg | null;
  notice: FollowNotice | null; alternative: Option | null; deltaMin: number | null; trainStatus: TrainStatus | null;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Convert an existing connection model's arrival + interchange allowance into rail-ready instants. */
export function readyAtFromConnection(reach: Record<string, number>, ready: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const hub of Object.keys(reach)) {
    const allowance = ready[hub] ?? 0;
    if (finite(reach[hub]) && finite(allowance) && allowance >= 0) result[hub] = reach[hub] + allowance;
  }
  return result;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const day = (t: Train): string => new Date(t.dep - (t.depLate || 0) * MIN).toISOString().slice(0, 10);
/** Expected departure can move; the scheduled service and selected boarding point cannot. */
export function followServiceKey(o: Option): string {
  const t = o.train;
  return `${day(t)}|${t.serviceId ? `id:${t.serviceId}` : `${t.operator}|${t.std}`}|${t.from}|${t.to}|${o.hub}`;
}
function sameService(a: Option, b: Option): boolean {
  const x = a.train, y = b.train;
  if (day(x) !== day(y) || x.from !== y.from || x.to !== y.to || a.hub !== b.hub) return false;
  return x.serviceId && y.serviceId ? x.serviceId === y.serviceId : x.std === y.std && x.operator === y.operator;
}
export function followMatchesService(route: FollowRoute, option: Option): boolean { return sameService(route.option, option); }
function validTrain(t: unknown, allowNullArrival = false): t is Train {
  return record(t) && typeof t.from === 'string' && t.from.length <= 100 && typeof t.to === 'string' && t.to.length <= 100 && typeof t.std === 'string' && /^\d\d:\d\d$/.test(t.std)
    && finite(t.dep) && (finite(t.arr) || allowNullArrival && t.arr === null) && Math.abs(t.dep) < 8.64e15 && (t.arr === null || Math.abs(t.arr as number) < 8.64e15)
    && finite(t.depLate) && Math.abs(t.depLate) < 1e6 && finite(t.arrLate) && Math.abs(t.arrLate) < 1e6 && typeof t.operator === 'string' && t.operator.length <= 500 && typeof t.cancelled === 'boolean'
    && typeof t.depUnknown === 'boolean' && typeof t.reason === 'string' && t.reason.length <= 10000
    && (t.serviceId == null || typeof t.serviceId === 'string' && t.serviceId.length <= 500) && (t.platform == null || typeof t.platform === 'string' && t.platform.length <= 100);
}
function validOption(o: unknown): o is Option {
  return record(o) && validTrain(o.train) && typeof o.hub === 'string' && finite(o.leave) && finite(o.arrive) && o.leave <= o.train.dep && o.arrive >= (o.train.arr as number)
    && Array.isArray(o.flags) && o.flags.length <= 100 && o.flags.every(f => record(f) && typeof f.txt === 'string' && ['ok', 'info', 'warn', 'bad'].includes(String(f.lvl)))
    && Array.isArray(o.legs) && o.legs.length > 0 && o.legs.length <= 200 && o.legs.every(l => record(l) && typeof l.d === 'string' && l.d.length <= 10000 && (l.t === null || finite(l.t)) && (l.note == null || typeof l.note === 'string'));
}
export function startFollowRoute(option: Option, ctx: { now: number; direction: Direction; mode: 'commute' | 'leisure' }): FollowRoute | null {
  if (!validOption(option) || !finite(ctx.now) || !['office', 'home'].includes(ctx.direction) || !['commute', 'leisure'].includes(ctx.mode)
    || option.train.dep < ctx.now || option.train.cancelled || option.train.depUnknown || option.train.arrUnknown || option.uncertain || option.effort === 'none' || option.effort === 'run' || option.effort === 'car') return null;
  const copy = clone(option);
  return { version: 1, id: followServiceKey(copy), direction: ctx.direction, mode: ctx.mode, startedAt: ctx.now,
    option: copy, plannedArrival: copy.arrive, expectedArrival: copy.arrive, lastTrain: clone(copy.train), phase: 'before-train', notices: [], dismissedAlternatives: [], seenEvents: [] };
}
/** Treat browser storage as untrusted. No key migration or deletion is needed. */
export function restoreFollowRoute(value: unknown): FollowRoute | null {
  try {
    if (!record(value) || value.version !== 1 || !['office', 'home'].includes(String(value.direction)) || !['commute', 'leisure'].includes(String(value.mode))
      || !finite(value.startedAt) || !finite(value.plannedArrival) || !finite(value.expectedArrival) || !validOption(value.option) || !validTrain(value.lastTrain, true)
      || !sameService({ ...value.option, train: value.lastTrain }, value.option)
      || typeof value.id !== 'string' || value.id !== followServiceKey(value.option) || !['before-train', 'on-train', 'after-train', 'arrived'].includes(String(value.phase))
      || !Array.isArray(value.notices) || value.notices.length > 100 || !value.notices.every(n => record(n) && typeof n.id === 'string' && typeof n.text === 'string' && finite(n.at)
        && ['cancelled', 'unknown', 'missed', 'arrival', 'platform'].includes(String(n.kind)) && (n.deltaMin == null || finite(n.deltaMin)))
      || !Array.isArray(value.seenEvents) || value.seenEvents.length > 100 || !value.seenEvents.every(x => typeof x === 'string')
      || !Array.isArray(value.dismissedAlternatives) || value.dismissedAlternatives.length > 100 || !value.dismissedAlternatives.every(x => typeof x === 'string')) return null;
    return clone(value) as unknown as FollowRoute;
  } catch { return null; }
}
export function acknowledgeFollowNotice(route: FollowRoute, id?: string): FollowRoute {
  return { ...route, notices: id ? route.notices.filter(n => n.id !== id) : [] };
}
export function dismissFollowAlternative(route: FollowRoute, option: Option): FollowRoute {
  const key = followServiceKey(option);
  return { ...route, dismissedAlternatives: [...route.dismissedAlternatives.filter(k => k !== key), key].slice(-100) };
}
function legsFor(route: FollowRoute): Leg[] {
  const before = route.option.train, after = route.lastTrain;
  const departureShift = after.dep - before.dep;
  const railShift = finite(after.arr) ? after.arr - (before.arr as number) : route.expectedArrival - route.plannedArrival;
  const source = route.option.legs as Leg[];
  const lastTimed = source.reduce((last, leg, index) => leg.t != null && !leg.calls ? index : last, -1);
  return source.map((leg, index) => {
    const l = { ...leg };
    if (l.train) {
      l.t = l.t == null ? null : l.t + departureShift;
      // Keep the scheduled service name; refresh factual expected time and platform only.
      const base = l.d.replace(/\s*\(exp \d\d:\d\d\)/, '');
      if (base.startsWith(before.std)) l.d = `${before.std}${hhmm(after.dep) !== before.std ? ` (exp ${hhmm(after.dep)})` : ''}${base.slice(before.std.length)}`;
      const platform = after.platform ? `platform ${after.platform}` : 'platform unannounced';
      l.note = /\bplatform\s+[^,·]+/i.test(l.note || '') ? (l.note || '').replace(/\bplatform\s+[^,·]+/i, platform)
        : [l.note, platform].filter(Boolean).join(', ');
    } else if (l.t != null && l.t >= (before.arr as number)) {
      // A slower final walk changes its arrival, never the completed rail arrival/interchange history.
      l.t = index === lastTimed && l.t > (before.arr as number) ? route.expectedArrival : l.t + railShift;
    }
    return l;
  });
}
/** The full saved itinerary, with observed rail changes reflected without replanning its walks/tube. */
export const followedLegs = (route: FollowRoute): Leg[] => legsFor(route);
export function updateFollowRoute(previous: FollowRoute, input: FollowInput): FollowUpdate {
  const route: FollowRoute = { ...previous, notices: previous.notices.slice(), dismissedAlternatives: previous.dismissedAlternatives.slice(), seenEvents: previous.seenEvents.slice() };
  const phase = input.phase || route.phase;
  // A transient inference blip must not take an already boarded journey back to the concourse.
  const order: FollowPhase[] = ['before-train', 'on-train', 'after-train', 'arrived'];
  route.phase = order[Math.max(order.indexOf(route.phase), order.indexOf(phase))];
  const fresh = input.dataFresh !== false;
  const onward = route.phase === 'after-train' || route.phase === 'arrived';
  const suppliedArrival = !onward && finite(input.currentTrainArrival) ? input.currentTrainArrival + (route.plannedArrival - (route.option.train.arr as number)) : input.currentArrival;
  const connectionReady = input.readyAt?.[route.option.hub];
  const connectionKnown = !!input.activeConnection && finite(connectionReady);
  const liveRailReport = route.phase === 'on-train' && input.trainArrivalLive === true && finite(input.currentTrainArrival);
  const arrivalFresh = fresh || liveRailReport;
  const sourceSelected = fresh ? input.options.find(o => sameService(o, route.option)) : undefined;
  const reportedTrain = (train: Train): Train => liveRailReport ? { ...train, arr: input.currentTrainArrival as number,
    arrLate: Math.round(((input.currentTrainArrival as number) - ((route.option.train.arr as number) - route.option.train.arrLate * MIN)) / MIN),
    cancelled: false, depUnknown: false, arrUnknown: false } : train;
  const selected = sourceSelected ? { ...sourceSelected, train: reportedTrain(sourceSelected.train) } : undefined;
  if (!selected && liveRailReport) route.lastTrain = reportedTrain(route.lastTrain);
  let status: FollowUpdate['status'] = 'on-track', level: FollowUpdate['level'] = 'ok', text = 'On track';
  const addNotice = (kind: FollowNotice['kind'], key: string, message: string, deltaMin?: number) => {
    const id = `${route.id}|${kind}|${key}`;
    if (!route.seenEvents.includes(id)) {
      route.seenEvents = [...route.seenEvents, id].slice(-100);
      route.notices = [...route.notices, { id, kind, text: message, at: input.now, ...(deltaMin != null ? { deltaMin } : {}) }].slice(-100);
    }
  };
  if (onward) {
    // Completed rail is history. Only current onward observations may change the final walk/tube ETA.
    if ((input.onwardFresh ?? fresh) && finite(suppliedArrival) && suppliedArrival !== previous.expectedArrival) {
      const delta = Math.round((suppliedArrival - previous.expectedArrival) / MIN);
      if(Math.floor(suppliedArrival/MIN)!==Math.floor(previous.expectedArrival/MIN))addNotice('arrival', String(suppliedArrival), `Your onward journey has changed; arriving ${hhmm(suppliedArrival)}`, delta);
      route.expectedArrival = suppliedArrival;
    }
  } else if (selected) {
    route.lastTrain = clone(selected.train);
    if (selected.train.platform !== previous.lastTrain.platform && selected.train.platform) addNotice('platform', selected.train.platform, `Your train now leaves from platform ${selected.train.platform}`);
    if (selected.train.cancelled) {
      status = 'cancelled'; level = 'bad'; text = `Your ${selected.train.std} is cancelled`;
      addNotice('cancelled', 'cancelled', text);
    } else if (selected.train.depUnknown || selected.train.arrUnknown || selected.train.arr == null) {
      status = 'unknown'; level = 'bad'; text = 'Your train is delayed with no estimate'; addNotice('unknown', 'no-estimate', text);
    } else {
      // Preserve the chosen onward segments; a different best route never changes this arrival.
      const arrival = finite(suppliedArrival) ? suppliedArrival : (selected.train.arr as number) + (route.plannedArrival - (route.option.train.arr as number));
      if (arrival !== previous.expectedArrival) {
        const delta = Math.round((arrival - previous.expectedArrival) / MIN);
        const late = Math.max(selected.train.depLate, selected.train.arrLate);
        const reason = arrival > previous.expectedArrival ? `Your train${late > 0 ? ` is ${late} min late` : ' is running later'}; arriving ${hhmm(arrival)}` : `Your train is running earlier; arriving ${hhmm(arrival)}`;
        if(Math.floor(arrival/MIN)!==Math.floor(previous.expectedArrival/MIN))addNotice('arrival', String(arrival), reason, delta); route.expectedArrival = arrival;
      }
    }
  } else if (arrivalFresh && finite(suppliedArrival)) {
    if (suppliedArrival !== previous.expectedArrival) {
      const delta = Math.round((suppliedArrival - previous.expectedArrival) / MIN);
      if(Math.floor(suppliedArrival/MIN)!==Math.floor(previous.expectedArrival/MIN))addNotice('arrival', String(suppliedArrival), `Your train's live arrival changed; arriving ${hhmm(suppliedArrival)}`, delta);
      route.expectedArrival = suppliedArrival;
    }
  } else { level = 'info'; text = 'Last known journey · waiting for fresh data'; }
  if (route.phase === 'arrived') { status = 'arrived'; level = 'ok'; text = 'Arrived'; }
  else if (route.phase === 'before-train' && status === 'on-track' && (input.hasReliableLocation !== false || connectionKnown) && fresh) {
    const departure = selected?.train.dep ?? route.lastTrain.dep;
    const missed = input.activeConnection ? connectionKnown && connectionReady! > departure
      : selected ? selected.missed || ['none', 'run', 'car'].includes(selected.effort || '') || departure < input.now : departure < input.now;
    if (missed) {
      status = 'missed'; level = 'bad'; text = `You can no longer make your ${route.option.train.std}`;
      addNotice('missed', 'missed', text);
    } else if (connectionKnown) {
      const spare = Math.floor(((selected?.train.dep ?? route.lastTrain.dep) - connectionReady!) / MIN);
      text = spare > 0 ? `On track · ${spare} min at your connection` : 'On track · connection is tight';
    } else if (!input.activeConnection && selected?.effort === 'fast') { status = 'hurry'; level = 'warn'; text = 'Behind · fast walk needed'; }
    else if (selected) {
      const spare = Math.floor((selected.leave - input.now) / MIN);
      text = spare > 0 ? `On track · ${spare} min to spare` : 'On track';
    }
  }
  if (route.phase === 'before-train' && input.activeConnection && !connectionKnown && status === 'on-track') { status = 'unknown'; level = 'info'; text = 'Checking your connection · keeping your chosen journey'; }
  if (route.phase === 'before-train' && input.hasReliableLocation === false && !connectionKnown && status === 'on-track') { status = 'unknown'; level = 'info'; text = 'Location unavailable · keeping your chosen journey'; }
  // Alternatives always come from the normal engine. Never invent a departure or bypass its effort checks.
  const recovery = status === 'missed' || status === 'cancelled' || (status === 'unknown' && level === 'bad') || route.lastTrain.arrLate >= 15;
  const candidate = !onward && route.phase !== 'on-train' && fresh ? (input.availableOptions || input.options).filter(o => !sameService(o, route.option)
    && !o.train.cancelled && !o.train.depUnknown && !o.train.arrUnknown && !o.uncertain
    && (input.activeConnection ? finite(input.readyAt?.[o.hub]) && o.train.dep >= input.readyAt![o.hub]
      : !o.missed && (o.effort ? ['walk', 'fast'].includes(o.effort) : o.leave >= input.now))
    && o.train.dep >= input.now && !route.dismissedAlternatives.includes(followServiceKey(o))
    && (recovery || route.expectedArrival - o.arrive >= FOLLOW_BETTER_MIN * MIN))
    .sort((a, b) => a.arrive - b.arrive || b.leave - a.leave)[0] || null : null;
  let alternative = candidate;
  if (candidate && input.activeConnection) {
    const ready = input.readyAt![candidate.hub];
    const sourceLegs = candidate.legs as Leg[];
    const railIndex = sourceLegs.findIndex(l => l.train);
    const onwardLegs = railIndex >= 0 ? sourceLegs.slice(railIndex) : sourceLegs.filter(l => l.t != null && l.t >= candidate.train.dep);
    const approach = input.connectionSteps?.[candidate.hub] || [{ t: ready, d: 'Ready at the rail platform', note: 'From your current connection' }];
    alternative = { ...candidate, leave: input.now, leaveBy: input.now, effort: 'walk', missed: false, firstAt: undefined, offer: false,
      flags: candidate.flags.filter(f => !/^(Fast walk|Run$|Car needed|Can't make it|Leave time passed|Leaving in under a minute|Arrives first)/.test(f.txt)),
      before: [], access: { walk: 0, walkAvg: 0, walkFast: 0, fixed: Math.max(0, ready - input.now) / 1000, home: false },
      legs: [...approach, ...onwardLegs] };
  }
  let railStatus: TrainStatus | null = null;
  if (!onward && (fresh || input.trainArrivalLive)) {
    const t = route.lastTrain;
    if (route.phase !== 'on-train' || t.cancelled || t.depUnknown || t.arrUnknown || t.arr == null) {
      railStatus = t.arr == null && !t.cancelled ? { level: 'bad', text: 'No estimate' } : trainStatus(t);
    } else if ((!t.timetable && !t.derived && !t.estimated) || input.trainArrivalLive) {
      const expected = finite(input.currentTrainArrival) ? input.currentTrainArrival : t.arr as number;
      railStatus = arrivalStatus(expected, (route.option.train.arr as number) - route.option.train.arrLate * MIN);
    }
  }
  const legs = legsFor(route).filter(l => l.t != null && !l.calls);
  const nextStep = route.phase === 'arrived' ? null : route.phase === 'before-train'
    ? (input.activeConnection ? legs.find(l => l.train) : legs.find(l => (l.t as number) >= input.now)) || legs[legs.length - 1] || null
    : route.phase === 'on-train' ? legs.find(l => !l.train && (l.t as number) >= (route.lastTrain.arr as number)) || null
    : legs.find(l => (l.t as number) >= input.now) || legs[legs.length - 1] || null;
  return { route, status, level, text, nextStep, trainStatus: railStatus, notice: route.notices[0] || null, alternative,
    deltaMin: alternative ? Math.round((alternative.arrive - route.expectedArrival) / MIN) : null };
}
