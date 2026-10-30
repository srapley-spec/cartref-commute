// Follow one chosen journey. All clocks, observations and alternatives are supplied by the shell.
// Ranking may offer a replacement; it must never replace the selected journey.
import type { Direction, Option, Train } from './types';
import type { Leg } from './journey';
import { hhmm } from './time';

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
  /** Expected rail-stop time from Service Details; original onward segments supply the tail. */
  currentTrainArrival?: number | null;
  /** Already graded/ranked alternatives; options above retain departed/cancelled chosen services. */
  availableOptions?: Option[];
  /** A missing/rough location must not turn a vanished departure into a missed connection. */
  hasReliableLocation?: boolean;
}
export interface FollowUpdate {
  route: FollowRoute; status: 'on-track' | 'hurry' | 'missed' | 'cancelled' | 'unknown' | 'arrived';
  level: 'ok' | 'warn' | 'bad' | 'info'; text: string; nextStep: Leg | null;
  notice: FollowNotice | null; alternative: Option | null; deltaMin: number | null;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
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
  const arrivalShift = route.expectedArrival - route.plannedArrival;
  return (route.option.legs as Leg[]).map(l => ({ ...l, t: l.t == null ? null : l.train ? l.t + departureShift : l.t >= (before.arr as number) ? l.t + arrivalShift : l.t }));
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
  const suppliedArrival = finite(input.currentTrainArrival) ? input.currentTrainArrival + (route.plannedArrival - (route.option.train.arr as number)) : input.currentArrival;
  const selected = fresh ? input.options.find(o => sameService(o, route.option)) : undefined;
  let status: FollowUpdate['status'] = 'on-track', level: FollowUpdate['level'] = 'ok', text = 'On track';
  const addNotice = (kind: FollowNotice['kind'], key: string, message: string, deltaMin?: number) => {
    const id = `${route.id}|${kind}|${key}`;
    if (!route.seenEvents.includes(id)) {
      route.seenEvents = [...route.seenEvents, id].slice(-100);
      route.notices = [...route.notices, { id, kind, text: message, at: input.now, ...(deltaMin != null ? { deltaMin } : {}) }].slice(-100);
    }
  };
  if (selected) {
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
        const reason = delta > 0 ? `Your train${late > 0 ? ` is ${late} min late` : ' is running later'}; arriving ${hhmm(arrival)}` : `Your train is running earlier; arriving ${hhmm(arrival)}`;
        addNotice('arrival', String(arrival), reason, delta); route.expectedArrival = arrival;
      }
    }
  } else if (fresh && finite(suppliedArrival)) {
    if (suppliedArrival !== previous.expectedArrival) {
      const delta = Math.round((suppliedArrival - previous.expectedArrival) / MIN);
      addNotice('arrival', String(suppliedArrival), `Your train's live arrival changed; arriving ${hhmm(suppliedArrival)}`, delta);
      route.expectedArrival = suppliedArrival;
    }
  } else { level = 'info'; text = 'Last known journey · waiting for fresh data'; }
  if (route.phase === 'arrived') { status = 'arrived'; level = 'ok'; text = 'Arrived'; }
  else if (route.phase === 'before-train' && status === 'on-track' && input.hasReliableLocation !== false && fresh) {
    const missed = selected ? selected.missed || ['none', 'run', 'car'].includes(selected.effort || '') || (selected.train.dep < input.now)
      : route.lastTrain.dep < input.now;
    if (missed) {
      status = 'missed'; level = 'bad'; text = `You can no longer make your ${route.option.train.std}`;
      addNotice('missed', 'missed', text);
    } else if (selected?.effort === 'fast') { status = 'hurry'; level = 'warn'; text = 'Behind · fast walk needed'; }
    else if (selected) {
      const spare = Math.floor((selected.leave - input.now) / MIN);
      text = spare > 0 ? `On track · ${spare} min to spare` : 'On track';
    }
  }
  if (route.phase === 'before-train' && input.hasReliableLocation === false && status === 'on-track') { status = 'unknown'; level = 'info'; text = 'Location unavailable · keeping your chosen journey'; }
  // Alternatives always come from the normal engine. Never invent a departure or bypass its effort checks.
  const recovery = status === 'missed' || status === 'cancelled' || (status === 'unknown' && level === 'bad') || route.lastTrain.arrLate >= 15;
  const alternative = route.phase !== 'arrived' && fresh ? (input.availableOptions || input.options).filter(o => !sameService(o, route.option)
    && !o.train.cancelled && !o.train.depUnknown && !o.train.arrUnknown && !o.uncertain && !o.missed
    && (o.effort ? ['walk', 'fast'].includes(o.effort) : o.leave >= input.now)
    && o.train.dep >= input.now && !route.dismissedAlternatives.includes(followServiceKey(o))
    && (recovery || route.expectedArrival - o.arrive >= FOLLOW_BETTER_MIN * MIN))
    .sort((a, b) => a.arrive - b.arrive || b.leave - a.leave)[0] || null : null;
  const legs = legsFor(route).filter(l => l.t != null && !l.calls);
  const nextStep = route.phase === 'arrived' ? null : route.phase === 'before-train'
    ? legs.find(l => (l.t as number) >= input.now) || legs[legs.length - 1] || null
    : route.phase === 'on-train' ? legs.find(l => !l.train && (l.t as number) >= (route.lastTrain.arr as number)) || null
    : legs.find(l => (l.t as number) >= input.now) || legs[legs.length - 1] || null;
  return { route, status, level, text, nextStep, notice: route.notices[0] || null, alternative,
    deltaMin: alternative ? Math.round((alternative.arrive - route.expectedArrival) / MIN) : null };
}
