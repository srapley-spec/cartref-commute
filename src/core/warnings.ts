// Warnings: how badly your own trains are hit, which notices are about your route, and tube line status.
import type { Board, Flag, Profile, Train } from "./types";
import { LATE_AMBER_MIN, LATE_RED_MIN } from "./rules";

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
}

/**
 * Graded by what's happening to your own trains (every board loaded for your direction, from 5 min ago):
 * red = a cancellation, a train with no estimate, or 15+ min late; amber = 5–14 min late. Notices are split into
 * your route (stations on it, or network-wide), elsewhere, and station facilities.
 */
export function railWarnings(boards: Record<string, Board | null | undefined>, keys: string[], now: number, p: Profile): RailWarnings {
  const corridor = new RegExp(`\\b(${p.corridorPattern})\\b`, "i");
  const svcs = keys.flatMap(k => (boards[k] ? boards[k]!.services : [])).filter(t => t.dep >= now - 5 * 60e3);
  const cancelled = svcs.filter(t => t.cancelled);
  const affected = svcs.filter(t => t.cancelled || t.depUnknown || t.depLate >= LATE_AMBER_MIN || t.arrLate >= LATE_AMBER_MIN).length;
  const msgs = [...new Set(keys.flatMap(k => (boards[k] ? boards[k]!.msgs : [])))];
  const facilities = msgs.filter(facilityOnly);
  const onRoute = msgs.filter(m => !facilityOnly(m) && (corridor.test(m) || NETWORK_WIDE.test(m)));
  const other = msgs.filter(m => !facilityOnly(m) && !onRoute.includes(m));
  const uncertain = svcs.filter(t => !t.cancelled && (t.depUnknown || t.arrUnknown) && t.dep >= now - 5 * 60e3);
  const late = Math.max(0, ...svcs.filter(t => !t.cancelled).map(t => Math.max(t.depLate || 0, t.arrLate || 0)));
  const level: ImpactLevel = cancelled.length || uncertain.length || late >= LATE_RED_MIN ? "red" : late >= LATE_AMBER_MIN ? "amber" : "none";
  return { cancelled, uncertain, affected, total: svcs.length, hit: affected >= 2, onRoute, other, facilities, level, late };
}

/** A notice's title: its first sentence, shortened to 90 characters at a word. */
export function noticeTitle(m: string): string {
  const t = String(m).replace(/\s+/g, " ").trim(), first = (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
  return first.length > 90 ? first.slice(0, 87).replace(/\s+\S*$/, "") + "…" : first.replace(/\.$/, "");
}

// ---------- Line status (TfL format: severities; 10 good service, 18 no issues, 19 information) ----------
export interface LineStatus { id: string; name: string; statuses: { sev: number; desc: string; reason?: string }[]; }
/** Closed, suspended or part closed. */
export const BAD_SEV = new Set([1, 2, 3, 4, 5, 16, 20]);
export const worstStatus = (l: LineStatus | null | undefined) => (l && l.statuses.length ? l.statuses.reduce((a, b) => (a.sev <= b.sev ? a : b)) : null);
export const lineOk = (l: LineStatus | null | undefined) => { const w = worstStatus(l); return !w || w.sev === 10 || w.sev === 18 || w.sev === 19; };
export const lineLevel = (l: LineStatus) => (lineOk(l) ? "ok" : l.statuses.some(s => BAD_SEV.has(s.sev)) ? "bad" : "warn");

/** Both tube lines to the office closed or suspended: use the fallback (H&C to Aldgate East). */
export function tubeFallbackNeeded(status: LineStatus[] | null, ids: string[]): boolean {
  if (!status) return false;
  const bad = (l?: LineStatus) => !!l && l.statuses.some(s => BAD_SEV.has(s.sev));
  return ids.every(id => bad(status.find(l => l.id === id)));
}

/** Flags for an option's tube leg: red when every line it can use has a problem, amber when some do. */
export function tubeFlags(tube: { fallback?: boolean } | null | undefined, status: LineStatus[] | null, ids: { main: string[]; fallback: string[]; fallbackNote: string }): Flag[] {
  const f: Flag[] = [];
  if (tube && status) {
    const ls = (tube.fallback ? ids.fallback : ids.main).map(id => status.find(l => l.id === id)).filter(Boolean) as LineStatus[];
    const notOk = ls.filter(l => !lineOk(l)), txt = notOk.map(l => `${l.name}: ${worstStatus(l)!.desc}`).join(" · ");
    if (notOk.length === ls.length && ls.length) f.push({ lvl: "bad", txt });
    else if (notOk.length) f.push({ lvl: "warn", txt });
  }
  if (tube && tube.fallback) f.push({ lvl: "warn", txt: ids.fallbackNote });
  return f;
}
