// Warnings: how badly your own trains are hit, which notices are about your route, and tube line status.
import type { Board, Flag, Profile, Train } from "./types";
import { DEFAULT_DISRUPTION_POLICY, disruptionLineLevel, railDelayLevel, resolveDisruptionPolicy, worstDisruptionStatus, type DisruptionConfig } from './disruption';
import { clock, isoDay } from './time';

/** Station facilities (toilets, lifts…): never about whether trains run. */
export const FACILITY = /\b(toilets?|lavator(y|ies)|escalators?|lifts?|elevators?|ticket (office|machines?|barriers?|gates?)|car ?park|parking|wi-?fi|waiting rooms?|caf[eé]s?|shops?|help points?|customer information|footbridge|entrances?|exits?|step[- ]free|baby chang\w*|accessib\w*|cycle (racks?|parking)|taxi rank)\b/i;
/** Words that make a notice about the train service. */
export const SERVICE = /\b(delay\w*|cancel\w*|disrupt\w*|suspend\w*|reduced service|special service|amended|alter\w* (service|timetable)|trains? (are|is|will|may|run|running|not)|services? (are|is|will|may|between)|line(s)? (is|are) (closed|blocked)|bus(es)? replace\w*|replacement bus\w*|engineering|signal\w*|track|power|strike|industrial action)\b/i;
/** Notices that affect everyone's route. */
export const NETWORK_WIDE = /\b(strike|industrial action|all (lines|routes|services|stations)|across the (whole )?network)\b/i;
export const facilityOnly = (m: string) => FACILITY.test(m) && !SERVICE.test(m);

export type ImpactLevel = "red" | "amber" | "none";
export interface RailWarnings {
  cancelled: Train[]; uncertain: Train[]; affected: number; total: number; hit: boolean;
  onRoute: string[]; other: string[]; facilities: string[]; level: ImpactLevel; late: number;
  /** Known delayed services preserve their own reported reason. Optional for older supplied summaries. */
  delayed?: Train[];
}
export interface RailWarningContext {
  /** Actual observed services still being ridden; a past departure does not make their remaining leg irrelevant. */
  activeTrains?: readonly Train[];
}
const scheduledServiceDay = (t: Train) => {
  const anchor = t.dep - (t.depLate || 0) * 60e3;
  return isoDay(clock(t.std, anchor) ?? anchor);
};
/** Match one boarding service only. A provider ID reused tomorrow is not today's train. */
const sameObservedService = (a: Train, b: Train): boolean => a === b ||
  a.from === b.from && a.to === b.to && a.std === b.std && scheduledServiceDay(a) === scheduledServiceDay(b) &&
  (a.serviceId || b.serviceId ? !!a.serviceId && a.serviceId === b.serviceId : a.operator === b.operator);

/**
 * Graded by what's happening to your own trains (every board loaded for your direction, from 5 min ago):
 * red = a cancellation, a train with no estimate, or 15+ min late; amber = 5–14 min late. Notices are split into
 * your route (stations on it, or network-wide), elsewhere, and station facilities.
 */
export function railWarnings(boards: Record<string, Board | null | undefined>, keys: string[], now: number, p: Profile, context: RailWarningContext = {}): RailWarnings {
  const policy = resolveDisruptionPolicy(p.disruption).rail;
  const corridor = new RegExp(`\\b(${p.corridorPattern})\\b`, "i");
  const fromBoards = keys.flatMap(k => (boards[k] ? boards[k]!.services : []));
  // Active observations overlay matching board records; adding a cloned Service
  // Details observation must not turn one physical service into two affected trains.
  // This does not deduplicate the existing board rows or other boarding stations.
  const active: Train[] = [];
  for (const observation of context.activeTrains || []) {
    const previous = active.findIndex(t => sameObservedService(t, observation));
    if (previous < 0) active.push(observation); else active[previous] = observation;
  }
  const overlaid = fromBoards.map(t => active.find(observation => sameObservedService(t, observation)) || t);
  const additional = active.filter(observation => !fromBoards.some(t => sameObservedService(t, observation)));
  const svcs = [...overlaid, ...additional].filter(t => active.includes(t) || t.dep >= now - policy.lookbackMin * 60e3);
  const cancelled = svcs.filter(t => t.cancelled);
  const affected = svcs.filter(t => t.cancelled || t.depUnknown || t.arrUnknown || t.depLate >= policy.warnMin || t.arrLate >= policy.warnMin).length;
  const msgs = [...new Set(keys.flatMap(k => (boards[k] ? boards[k]!.msgs : [])))];
  const facilities = msgs.filter(facilityOnly);
  const onRoute = msgs.filter(m => !facilityOnly(m) && (corridor.test(m) || NETWORK_WIDE.test(m)));
  const other = msgs.filter(m => !facilityOnly(m) && !onRoute.includes(m));
  const uncertain = svcs.filter(t => !t.cancelled && (t.depUnknown || t.arrUnknown));
  const delayed = svcs.filter(t => !t.cancelled && !t.depUnknown && !t.arrUnknown && t.arr != null && (t.depLate >= policy.warnMin || t.arrLate >= policy.warnMin));
  const late = Math.max(0, ...svcs.filter(t => !t.cancelled).map(t => Math.max(t.depLate || 0, t.arrLate || 0)));
  const delay = railDelayLevel(late, p.disruption);
  const level: ImpactLevel = cancelled.length || uncertain.length || delay === 'bad' ? "red" : delay === 'warn' ? "amber" : "none";
  return { cancelled, uncertain, delayed, affected, total: svcs.length, hit: affected >= policy.affectedTrainCount, onRoute, other, facilities, level, late };
}

/** A notice's title: its first sentence, shortened to 90 characters at a word. */
export function noticeTitle(m: string): string {
  const t = String(m).replace(/\s+/g, " ").trim(), first = (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
  return first.length > 90 ? first.slice(0, 87).replace(/\s+\S*$/, "") + "…" : first.replace(/\.$/, "");
}

// ---------- Line status (TfL format: severities; 10 good service, 18 no issues, 19 information) ----------
export interface LineStatus { id: string; name: string; statuses: { sev: number; desc: string; reason?: string }[]; }
/** Closed, suspended or part closed. */
export const BAD_SEV = new Set(DEFAULT_DISRUPTION_POLICY.tube.closedSeverities);
export const worstStatus = (l: LineStatus | null | undefined, policy?: DisruptionConfig) => worstDisruptionStatus(l, policy);
export const lineOk = (l: LineStatus | null | undefined, policy?: DisruptionConfig) => disruptionLineLevel(l, policy) === 'ok';
export const lineLevel = (l: LineStatus, policy?: DisruptionConfig) => disruptionLineLevel(l, policy);

/** Both tube lines to the office closed or suspended: use the fallback (H&C to Aldgate East). */
export function tubeFallbackNeeded(status: LineStatus[] | null, ids: string[], policy?: DisruptionConfig): boolean {
  if (!status) return false;
  const closed = resolveDisruptionPolicy(policy).tube.closedSeverities;
  const bad = (l?: LineStatus) => !!l && l.statuses.some(s => closed.includes(s.sev));
  return ids.every(id => bad(status.find(l => l.id === id)));
}

/** Flags for an option's tube leg: red when every line it can use has a problem, amber when some do. */
export function tubeFlags(tube: { fallback?: boolean } | null | undefined, status: LineStatus[] | null, ids: { main: string[]; fallback: string[]; fallbackNote: string }, policy?: DisruptionConfig): Flag[] {
  const f: Flag[] = [];
  if (tube && status) {
    const ls = (tube.fallback ? ids.fallback : ids.main).map(id => status.find(l => l.id === id)).filter(Boolean) as LineStatus[];
    const notOk = ls.filter(l => !lineOk(l, policy)), txt = notOk.map(l => `${l.name}: ${worstStatus(l, policy)!.desc}`).join(" · ");
    if (notOk.length === ls.length && ls.length) f.push({ lvl: "bad", txt });
    else if (notOk.length) f.push({ lvl: "warn", txt });
  }
  if (tube && tube.fallback) f.push({ lvl: "warn", txt: ids.fallbackNote });
  return f;
}
