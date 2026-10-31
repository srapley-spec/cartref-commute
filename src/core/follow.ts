// Follow one chosen journey. All clocks, observations and alternatives are supplied by the shell.
// Ranking may offer a replacement; it must never replace the selected journey.
import type { Direction, Option, Train } from './types';
import type { Leg } from './journey';
import { hhmm } from './time';
import { arrivalStatus, trainStatus, type TrainStatus } from './rules';

const MIN = 60e3;
export const FOLLOW_BETTER_MIN = 5;
export const FOLLOW_CHANGE_MS = 60e3;
const FOLLOW_GONE_GRACE_MS = 30e3;
export type FollowPhase = 'before-train' | 'on-train' | 'after-train' | 'arrived';
export interface FollowNotice {
  id: string; kind: 'cancelled' | 'unknown' | 'missed' | 'arrival' | 'platform' | 'recovered' | 'boarding';
  text: string; at: number; deltaMin?: number;
}
export interface FollowRoute {
  version: 1; id: string; direction: Direction; mode: 'commute' | 'leisure'; startedAt: number;
  option: Option; plannedArrival: number; expectedArrival: number;
  lastTrain: Train; phase: FollowPhase; notices: FollowNotice[];
  dismissedAlternatives: string[]; seenEvents: string[];
  incident?: 'cancelled' | 'unknown' | 'missed' | 'boarding' | null;
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
/** Compatibility identity for a declined legacy option whose provider ID was never saved. */
export const legacyFollowDeclineMarker = (serviceDay: string, key: string): string => `legacy:${serviceDay}|${key}`;
function alternativeDismissed(route: FollowRoute, option: Option): boolean {
  const train = option.train;
  return route.dismissedAlternatives.includes(followServiceKey(option)) || route.dismissedAlternatives.includes(
    legacyFollowDeclineMarker(day(train), `${train.operator}|${train.std}|${train.from}`));
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
/** Observation may progress along a same-train call already known when this route was chosen.
 * It never changes the chosen boarding point or discovers a new connection by service ID alone. */
export function followMatchesObservedTrain(route: FollowRoute, observed: Option): boolean {
  if (sameService(route.option, observed)) return true;
  return (Array.isArray(route.option.alts) ? route.option.alts : []).some(alt => record(alt) && validTrain(alt.train) && typeof alt.hub === 'string' && sameService(alt as Option, observed));
}
/** Explicit user correction; no GPS inference or silent service substitution. */
export function confirmFollowBoarding(route: FollowRoute, now: number): FollowRoute {
  const notice: FollowNotice = { id: `${route.id}|recovered|boarding`, kind: 'recovered', text: 'You confirmed you are on your selected train', at: now };
  return { ...route, phase: route.phase === 'arrived' || route.phase === 'after-train' ? route.phase : 'on-train', incident: null,
    notices: [notice, ...route.notices.filter(n => !['cancelled', 'unknown', 'missed', 'boarding', 'recovered'].includes(n.kind))],
    seenEvents: [...route.seenEvents.filter(id => id !== notice.id), notice.id].slice(-100) };
}
function validTrain(t: unknown, allowNullArrival = false): t is Train {
  return record(t) && typeof t.from === 'string' && t.from.length <= 100 && typeof t.to === 'string' && t.to.length <= 100 && typeof t.std === 'string' && /^\d\d:\d\d$/.test(t.std)
    && finite(t.dep) && (finite(t.arr) || allowNullArrival && t.arr === null) && Math.abs(t.dep) < 8.64e15 && (t.arr === null || Math.abs(t.arr as number) < 8.64e15)
    && finite(t.depLate) && Math.abs(t.depLate) < 1e6 && finite(t.arrLate) && Math.abs(t.arrLate) < 1e6 && typeof t.operator === 'string' && t.operator.length <= 500 && typeof t.cancelled === 'boolean'
    && typeof t.depUnknown === 'boolean' && typeof t.reason === 'string' && t.reason.length <= 10000
    && (t.serviceId == null || typeof t.serviceId === 'string' && t.serviceId.length <= 500) && (t.platform == null || typeof t.platform === 'string' && t.platform.length <= 100);
}
function validOption(o: unknown, depth = 0): o is Option {
  if (depth > 4) return false;
  return record(o) && validTrain(o.train) && typeof o.hub === 'string' && finite(o.leave) && finite(o.arrive) && o.leave <= o.train.dep && o.arrive >= (o.train.arr as number)
    && Array.isArray(o.flags) && o.flags.length <= 100 && o.flags.every(f => record(f) && typeof f.txt === 'string' && ['ok', 'info', 'warn', 'bad'].includes(String(f.lvl)))
    && (o.alts === undefined || Array.isArray(o.alts) && o.alts.length <= 20 && o.alts.every(alt => validOption(alt, depth + 1)))
    && Array.isArray(o.legs) && o.legs.length > 0 && o.legs.length <= 200 && o.legs.every(l => record(l) && typeof l.d === 'string' && l.d.length <= 10000 && (l.t === null || finite(l.t)) && (l.note == null || typeof l.note === 'string'));
}
export function startFollowRoute(option: Option, ctx: { now: number; direction: Direction; mode: 'commute' | 'leisure' }): FollowRoute | null {
  if (!validOption(option) || !finite(ctx.now) || !['office', 'home'].includes(ctx.direction) || !['commute', 'leisure'].includes(ctx.mode)
    || option.train.dep < ctx.now || option.train.cancelled || option.train.depUnknown || option.train.arrUnknown || option.uncertain || option.effort === 'none') return null;
  const copy = clone(option);
  return { version: 1, id: followServiceKey(copy), direction: ctx.direction, mode: ctx.mode, startedAt: ctx.now,
    option: copy, plannedArrival: copy.arrive, expectedArrival: copy.arrive, lastTrain: clone(copy.train), phase: 'before-train', notices: [], dismissedAlternatives: [], seenEvents: [], incident: null };
}
/** Treat browser storage as untrusted. No key migration or deletion is needed. */
export function restoreFollowRoute(value: unknown): FollowRoute | null {
  try {
    if (!record(value) || value.version !== 1 || !['office', 'home'].includes(String(value.direction)) || !['commute', 'leisure'].includes(String(value.mode))
      || !finite(value.startedAt) || !finite(value.plannedArrival) || !finite(value.expectedArrival) || !validOption(value.option) || !validTrain(value.lastTrain, true)
      || !sameService({ ...value.option, train: value.lastTrain }, value.option)
      || typeof value.id !== 'string' || value.id !== followServiceKey(value.option) || !['before-train', 'on-train', 'after-train', 'arrived'].includes(String(value.phase))
      || (value.incident != null && !['cancelled', 'unknown', 'missed', 'boarding'].includes(String(value.incident)))
      || !Array.isArray(value.notices) || value.notices.length > 100 || !value.notices.every(n => record(n) && typeof n.id === 'string' && typeof n.text === 'string' && finite(n.at)
        && ['cancelled', 'unknown', 'missed', 'arrival', 'platform', 'recovered', 'boarding'].includes(String(n.kind)) && (n.deltaMin == null || finite(n.deltaMin)))
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
  // An expected arrival can remain in Service Details after a cancellation/early termination.
  // A fresh cancellation is authoritative; only an obsolete board may yield to a fresh report.
  const selected = sourceSelected ? { ...sourceSelected, train: sourceSelected.train.cancelled ? sourceSelected.train : reportedTrain(sourceSelected.train) } : undefined;
  if (!selected && liveRailReport) route.lastTrain = reportedTrain(route.lastTrain);
  let status: FollowUpdate['status'] = 'on-track', level: FollowUpdate['level'] = 'ok', text = 'On track';
  const addNotice = (kind: FollowNotice['kind'], key: string, message: string, deltaMin?: number) => {
    const id = `${route.id}|${kind}|${key}`;
    if (kind === 'arrival') {
      // A newer ETA supersedes the old ETA explanation. A genuine later return to a prior ETA is still news.
      route.notices = route.notices.filter(n => n.kind !== 'arrival');
      route.seenEvents = route.seenEvents.filter(key => !key.includes('|arrival|'));
    }
    if (!route.seenEvents.includes(id)) {
      route.seenEvents = [...route.seenEvents, id].slice(-100);
      route.notices = [...route.notices, { id, kind, text: message, at: input.now, ...(deltaMin != null ? { deltaMin } : {}) }].slice(-100);
    }
  };
  if (onward) {
    // Completed rail is history. Only current onward observations may change the final walk/tube ETA.
    if ((input.onwardFresh ?? fresh) && finite(suppliedArrival) && Math.abs(suppliedArrival - previous.expectedArrival) >= FOLLOW_CHANGE_MS) {
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
      if (Math.abs(arrival - previous.expectedArrival) >= FOLLOW_CHANGE_MS) {
        const delta = Math.round((arrival - previous.expectedArrival) / MIN);
        const late = route.phase === 'on-train' ? selected.train.arrLate : Math.max(selected.train.depLate, selected.train.arrLate);
        const reason = arrival > previous.expectedArrival ? `Your train${late > 0 ? ` is ${late} min late` : ' is running later'}; arriving ${hhmm(arrival)}` : `Your train is running earlier; arriving ${hhmm(arrival)}`;
        if(Math.floor(arrival/MIN)!==Math.floor(previous.expectedArrival/MIN))addNotice('arrival', String(arrival), reason, delta); route.expectedArrival = arrival;
      }
    }
  } else if (arrivalFresh && finite(suppliedArrival)) {
    if (Math.abs(suppliedArrival - previous.expectedArrival) >= FOLLOW_CHANGE_MS) {
      const delta = Math.round((suppliedArrival - previous.expectedArrival) / MIN);
      if(Math.floor(suppliedArrival/MIN)!==Math.floor(previous.expectedArrival/MIN))addNotice('arrival', String(suppliedArrival), `Your train's live arrival changed; arriving ${hhmm(suppliedArrival)}`, delta);
      route.expectedArrival = suppliedArrival;
    }
  } else { level = 'info'; text = 'Last known journey · waiting for fresh data'; }
  if (route.phase === 'arrived') { status = 'arrived'; level = 'ok'; text = 'Arrived'; }
  else if (route.phase === 'before-train' && status === 'on-track' && (input.hasReliableLocation !== false || connectionKnown) && fresh) {
    const departure = selected?.train.dep ?? route.lastTrain.dep;
    const missed = input.activeConnection ? connectionKnown && (connectionReady! > departure || departure < input.now - FOLLOW_GONE_GRACE_MS)
      : selected ? (selected.effort === 'none' || (!selected.effort && selected.missed)) || departure < input.now - FOLLOW_GONE_GRACE_MS : departure < input.now - FOLLOW_GONE_GRACE_MS;
    if (missed) {
      status = 'missed'; level = 'bad'; text = `You can no longer make your ${route.option.train.std}`;
      addNotice('missed', 'missed', text);
    } else if (connectionKnown) {
      const spare = Math.floor(((selected?.train.dep ?? route.lastTrain.dep) - connectionReady!) / MIN);
      text = spare > 0 ? `On track · ${spare} min at your connection` : 'On track · connection is tight';
    } else if (!input.activeConnection && selected && ['fast', 'run', 'car'].includes(selected.effort || '')) { status = 'hurry'; level = 'warn'; const behind = Math.max(1, Math.ceil((input.now - selected.leave) / MIN)); text = `${behind} min behind · ${selected.effort === 'fast' ? 'fast walk' : selected.effort} needed`; }
    else if (selected) {
      const spare = Math.floor((selected.leave - input.now) / MIN);
      text = spare > 0 ? `On track · ${spare} min to spare` : 'On track';
    }
  }
  if (route.phase === 'before-train' && input.activeConnection && !connectionKnown && status === 'on-track') { status = 'unknown'; level = 'info'; text = 'Checking your connection · keeping your chosen journey'; }
  if (route.phase === 'before-train' && input.hasReliableLocation === false && !connectionKnown && status === 'on-track') { status = 'unknown'; level = 'info'; text = 'Location unavailable · keeping your chosen journey'; }
  let boardingRecovery: Option | null = null;
  if (route.phase === 'before-train' && fresh && status === 'missed') {
    const knownCalls = (Array.isArray(route.option.alts) ? route.option.alts : []).filter(alt => record(alt) && validTrain(alt.train) && typeof alt.hub === 'string');
    boardingRecovery = (input.availableOptions || input.options).filter(o => knownCalls.some(alt => sameService(alt, o))
      && finite(o.train.dep) && o.train.dep >= input.now && !o.train.cancelled && !o.train.depUnknown && !o.train.arrUnknown && !o.uncertain
      && (input.activeConnection ? finite(input.readyAt?.[o.hub]) && input.readyAt![o.hub] <= o.train.dep
        : !o.missed && (o.effort ? ['walk', 'fast'].includes(o.effort) : o.leave >= input.now)))
      .sort((a, b) => a.arrive - b.arrive || b.leave - a.leave)[0] || null;
    if (boardingRecovery) {
      status = 'hurry'; level = 'warn'; text = `Same train still possible from ${boardingRecovery.hub}`;
      route.notices = route.notices.filter(n => n.kind !== 'missed');
      route.seenEvents = route.seenEvents.filter(id => !id.includes('|missed|'));
      addNotice('boarding', followServiceKey(boardingRecovery), `Your original boarding point is no longer possible. The same train is still possible from ${boardingRecovery.hub}; choose it to change boarding point.`);
    }
  }
  if (route.phase === 'before-train' && status === 'on-track') {
    const departure = selected?.train.dep ?? route.lastTrain.dep;
    if (departure < input.now && departure >= input.now - FOLLOW_GONE_GRACE_MS) { status = 'hurry'; level = 'info'; text = 'Departure just passed · confirm if you are on it'; }
  }
  const incident = boardingRecovery ? 'boarding' : status === 'cancelled' ? 'cancelled' : status === 'missed' ? 'missed' : status === 'unknown' && level === 'bad' ? 'unknown' : null;
  const oldIncident = previous.incident !== undefined ? previous.incident : (previous.lastTrain.cancelled ? 'cancelled' : previous.lastTrain.depUnknown || previous.lastTrain.arrUnknown ? 'unknown' : previous.notices.find(n => ['cancelled', 'unknown', 'missed', 'boarding'].includes(n.kind))?.kind as FollowRoute['incident']) ?? null;
  const canResolve = onward || liveRailReport || !!selected && fresh && (oldIncident !== 'missed' || input.hasReliableLocation !== false || connectionKnown || route.phase === 'on-train');
  if (incident) {
    // A newer incident supersedes an obsolete one, instead of leaving a contradictory queue head.
    route.notices = route.notices.filter(n => !['cancelled', 'unknown', 'missed', 'boarding', 'recovered'].includes(n.kind) || n.kind === incident);
    const activeNotice = route.notices.find(n => n.kind === incident);
    if (activeNotice) route.notices = [activeNotice, ...route.notices.filter(n => n !== activeNotice)];
    route.incident = incident;
    if (incident !== oldIncident) route.seenEvents = route.seenEvents.filter(id => !id.includes('|recovered|') && (!oldIncident || !id.includes(`|${oldIncident}|`)));
  } else if (oldIncident && canResolve && !(status === 'unknown' && level === 'info')) {
    route.notices = route.notices.filter(n => !['cancelled', 'unknown', 'missed', 'boarding', 'recovered'].includes(n.kind));
    route.seenEvents = route.seenEvents.filter(id => !id.includes(`|${oldIncident}|`));
    const message = oldIncident === 'cancelled' ? `Your ${route.option.train.std} is running again` : oldIncident === 'missed' || oldIncident === 'boarding' ? `You can make your ${route.option.train.std} again` : `Your ${route.option.train.std} has an arrival estimate again`;
    addNotice('recovered', oldIncident, message);
    const recoveryNotice = route.notices.find(n => n.kind === 'recovered');
    if (recoveryNotice) route.notices = [recoveryNotice, ...route.notices.filter(n => n !== recoveryNotice)];
    route.incident = null;
  }
  // Alternatives always come from the normal engine. Never invent a departure or bypass its effort checks.
  const recovery = status === 'missed' || status === 'cancelled' || (status === 'unknown' && level === 'bad') || route.lastTrain.arrLate >= 15;
  const candidate = boardingRecovery || (!onward && route.phase !== 'on-train' && (!input.activeConnection || recovery) && fresh ? (input.availableOptions || input.options).filter(o => !sameService(o, route.option)
    && !o.train.cancelled && !o.train.depUnknown && !o.train.arrUnknown && !o.uncertain
    && (input.activeConnection ? finite(input.readyAt?.[o.hub]) && o.train.dep >= input.readyAt![o.hub]
      : !o.missed && (o.effort ? ['walk', 'fast'].includes(o.effort) : o.leave >= input.now))
    && o.train.dep >= input.now && !alternativeDismissed(route, o)
    && (recovery || route.expectedArrival - o.arrive >= FOLLOW_BETTER_MIN * MIN))
    .sort((a, b) => a.arrive - b.arrive || b.leave - a.leave)[0] || null : null);
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
  const nextStep = boardingRecovery ? ((alternative?.legs as Leg[] | undefined)?.find(l => l.train) || null) : route.phase === 'arrived' ? null : route.phase === 'before-train'
    ? (input.activeConnection ? legs.find(l => l.train) : legs.find(l => (l.t as number) >= input.now)) || legs[legs.length - 1] || null
    : route.phase === 'on-train' ? legs.find(l => !l.train && (l.t as number) >= (route.lastTrain.arr as number)) || null
    : legs.find(l => (l.t as number) >= input.now) || legs[legs.length - 1] || null;
  return { route, status, level, text, nextStep, trainStatus: railStatus, notice: route.notices[0] || null, alternative,
    deltaMin: alternative ? Math.round((alternative.arrive - route.expectedArrival) / MIN) : null };
}
