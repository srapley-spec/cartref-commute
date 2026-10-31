// Import the released Followed storage shape only after a matching real itinerary has loaded.
// The old state remains the caller's responsibility until this conversion succeeds.
import type { Option, Train } from './types';
import type { Leg } from './journey';
import { followServiceKey, legacyFollowDeclineMarker, restoreFollowRoute, type FollowRoute, type FollowNotice } from './follow';
const MIN = 60e3, DAY = 864e5;
interface LegacyTrain { operator: string; std: string; from: string; serviceId?: string; }
interface LegacyReason { kind: 'cancelled' | 'late' | 'earlier' | 'missed' | 'updated'; text: string; at: number; level: 'bad' | 'warn' | 'ok'; }
export interface LegacyFollowRoute {
  dir: 'office' | 'home'; train: LegacyTrain; calls: LegacyTrain[]; hub: string;
  lastDep: number; afterMs: number; planned: number; arrive: number; lateMin: number; followedAt: number;
  reason: LegacyReason | null; dismissed: LegacyReason['kind'] | null; declined: string[];
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const epoch = (n: unknown): n is number => finite(n) && n > 0 && n < 8.64e15;
const text = (x: unknown, max = 500): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const kinds = ['cancelled', 'late', 'earlier', 'missed', 'updated'];
function trainId(x: unknown): x is LegacyTrain {
  return record(x) && text(x.operator) && text(x.from, 100) && typeof x.std === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.std)
    && (x.serviceId === undefined || text(x.serviceId));
}
const idKey = (t: LegacyTrain): string => `${t.operator}|${t.std}|${t.from}`;
function sameId(a: LegacyTrain, b: LegacyTrain): boolean {
  return a.operator === b.operator && a.std === b.std && a.from === b.from && (!(a.serviceId && b.serviceId) || a.serviceId === b.serviceId);
}
/** A malformed saved value must not enter either the old or new journey controller. */
export function isLegacyFollowRoute(x: unknown): x is LegacyFollowRoute {
  return record(x) && (x.dir === 'office' || x.dir === 'home') && trainId(x.train) && text(x.hub, 100)
    && Array.isArray(x.calls) && x.calls.length > 0 && x.calls.length <= 20 && x.calls.every(trainId) && x.calls.some(c => sameId(c, x.train as LegacyTrain))
    && epoch(x.lastDep) && epoch(x.planned) && epoch(x.arrive) && epoch(x.followedAt)
    && finite(x.afterMs) && x.afterMs >= 0 && x.afterMs <= 2 * DAY && epoch(x.planned - x.afterMs)
    && finite(x.lateMin) && Math.abs(x.lateMin) <= 7 * 24 * 60
    && Math.abs(x.lastDep - x.followedAt) <= 2 * DAY && Math.abs(x.arrive - x.planned) <= 7 * DAY
    && (x.reason === null || record(x.reason) && kinds.includes(String(x.reason.kind)) && text(x.reason.text, 10000) && epoch(x.reason.at) && ['bad', 'warn', 'ok'].includes(String(x.reason.level)))
    && (x.dismissed === null || kinds.includes(String(x.dismissed)))
    && Array.isArray(x.declined) && x.declined.length <= 100 && x.declined.every(k => text(k, 1000) && /^.{1,500}\|(?:[01]\d|2[0-3]):[0-5]\d\|[^|]{1,100}$/.test(k));
}
function flatten(options: Option[], depth = 0): Option[] {
  if (depth > 4 || !Array.isArray(options)) return [];
  const out: Option[] = [];
  for (const o of options.slice(0, 1000)) {
    if (!record(o) || !record(o.train)) continue;
    out.push(o as unknown as Option);
    if (Array.isArray(o.alts)) out.push(...flatten(o.alts as Option[], depth + 1));
  }
  return out;
}
function matches(t: Train, id: LegacyTrain, legacy: LegacyFollowRoute): boolean {
  // Both the original scheduled name/station and the saved day matter: provider IDs can recur daily.
  return sameId(t, id) && finite(t.dep) && finite(t.depLate) && Math.abs(t.dep - legacy.lastDep) < DAY / 2;
}
/** Return null while no complete matching itinerary is available; never choose another train to fill a gap. */
export function migrateFollowRoute(value: unknown, options: Option[], ctx: { now: number; mode: 'commute' | 'leisure' }): FollowRoute | null {
  try {
    if (!isLegacyFollowRoute(value) || !epoch(ctx.now) || !['commute', 'leisure'].includes(ctx.mode)) return null;
    const legacy = value, all = flatten(options);
    const found = all.find(o => o.hub === legacy.hub && matches(o.train, legacy.train, legacy));
    if (!found || !finite(found.train.arr) || !Array.isArray(found.legs) || !found.legs.length) return null;
    const snapshot = JSON.parse(JSON.stringify(found)) as Option;
    const actualTrain = JSON.parse(JSON.stringify(found.train)) as Train;
    const baselineRail = legacy.planned - legacy.afterMs;
    const shift = baselineRail - (found.train.arr as number);
    // afterMs/planned are saved observations, not a newly modelled onward route.
    // Keep current real approach steps; only establish the historical rail/tail baseline for stable ETA updates.
    const lastTimed = (snapshot.legs as Leg[]).reduce((last, l, index) => l.t != null && !l.calls ? index : last, -1);
    snapshot.legs = (snapshot.legs as Leg[]).map((l, index) => ({ ...l, t: l.t == null || l.train || l.t < (found.train.arr as number) ? l.t
      : index === lastTimed && l.t > (found.train.arr as number) ? legacy.planned : l.t + shift }));
    snapshot.arrive = legacy.planned;
    snapshot.train.arr = baselineRail;
    snapshot.train.arrLate = Math.round((baselineRail - ((found.train.arr as number) - found.train.arrLate * MIN)) / MIN);
    // Preserve only boarding calls actually known in the old snapshot and now supplied by a real route.
    const calls = all.filter(o => o !== found && legacy.calls.some(id => matches(o.train, id, legacy)) && o.hub !== found.hub);
    snapshot.alts = calls.filter((o, index) => calls.findIndex(other => followServiceKey(other) === followServiceKey(o)) === index).slice(0, 20).map(o => JSON.parse(JSON.stringify(o)) as Option);
    const id = followServiceKey(snapshot), notices: FollowNotice[] = [], seenEvents: string[] = [];
    const reasonKind = legacy.reason?.kind === 'cancelled' ? 'cancelled' : legacy.reason?.kind === 'missed' ? 'missed' : 'arrival';
    if (legacy.reason) {
      const suffix = reasonKind === 'arrival' ? String(legacy.arrive) : reasonKind;
      const notice: FollowNotice = { id: `${id}|${reasonKind}|${suffix}`, kind: reasonKind, text: legacy.reason.text, at: legacy.reason.at };
      notices.push(notice); seenEvents.push(notice.id);
    }
    if (legacy.dismissed === 'cancelled' || legacy.dismissed === 'missed') seenEvents.push(`${id}|${legacy.dismissed}|${legacy.dismissed}`);
    const incident = legacy.reason?.kind === 'cancelled' || legacy.dismissed === 'cancelled' ? 'cancelled'
      : legacy.reason?.kind === 'missed' || legacy.dismissed === 'missed' ? 'missed' : null;
    const chosenDay = id.split('|', 1)[0];
    const dismissedAlternatives = legacy.declined.map(key => {
      const actual = all.find(o => idKey(o.train) === key);
      const serviceDay = actual ? followServiceKey(actual).split('|', 1)[0] : chosenDay;
      return legacyFollowDeclineMarker(serviceDay, key);
    });
    const result: FollowRoute = { version: 1, id, direction: legacy.dir, mode: ctx.mode, startedAt: legacy.followedAt,
      option: snapshot, plannedArrival: legacy.planned, expectedArrival: legacy.arrive, lastTrain: actualTrain,
      phase: 'before-train', notices, seenEvents: [...new Set(seenEvents)], incident,
      dismissedAlternatives: [...new Set(dismissedAlternatives)].slice(0, 100) };
    return restoreFollowRoute(result);
  } catch { return null; }
}
