// Commute watch (#66; Sam, 19 Nov 2026): on weekdays the proxy watches the commute without anything followed and
// tells you only when it matters.
// - Morning, 05:00–10:00, to the office: "keep getting ready, or work from home?"
// - Afternoon, from 15:00, home: "is there a real risk I get home late, or not at all?"
// Lateness is measured against getting there, not one train: the earliest arrival the live trains still give, against
// the earliest the timetable gave for the same trains (a cancelled train with another 10 min behind costs 10 min).
// Amber: 15 min or more later than normal. Red: more than 45 min, no train running, every tube line to the stations
// closed, or a National Rail notice of a blocking incident (overhead line, person hit by a train, lines blocked).
// Pure: boards, line statuses and the time are passed in; nothing here fetches or reads the clock.
import type { Board, Train } from "./types";
import type { LineStatus } from "./warnings";
import type { DisruptionConfig } from "./disruption";
import { hhmm, pad } from "./time";
import type { PushNotice } from "./alerts";

export type WatchDirection = "office" | "home";
export type WatchLevel = "ok" | "amber" | "red" | "unknown";

/** Sam, 19 Nov: amber at 15 minutes later than normal; red beyond 45. */
export const WATCH_AMBER_MIN = 15;
export const WATCH_RED_MIN = 45;
/** Trains considered: those leaving in this window from now. */
export const WATCH_WINDOW_MIN = 90;
/** The windows (local time, Monday–Friday): morning to the office, afternoon home. */
export const WATCH_WINDOWS: { direction: WatchDirection; from: string; to: string }[] = [
  { direction: "office", from: "05:00", to: "10:00" },
  { direction: "home", from: "15:00", to: "20:00" },
];
/** England and Wales bank holidays: no watch (gov.uk; profile-style data, extend each year). */
export const BANK_HOLIDAYS = new Set([
  "2026-12-25", "2026-12-28", "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);
/** Tube lines between the London stations and the office (profile data). */
export const WATCH_TUBE_LINES = ["circle", "metropolitan", "hammersmith-city"];

const isoLocal = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const minutesOf = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);

/** Which watch runs now (local time), or null: weekdays only, never on a bank holiday. */
export function watchWindow(now: number): { direction: WatchDirection; date: string; key: string } | null {
  const d = new Date(now), day = d.getDay(), date = isoLocal(now);
  if (day === 0 || day === 6 || BANK_HOLIDAYS.has(date)) return null;
  const m = d.getHours() * 60 + d.getMinutes();
  const w = WATCH_WINDOWS.find(x => m >= minutesOf(x.from) && m < minutesOf(x.to));
  return w ? { direction: w.direction, date, key: `${date}-${w.direction}` } : null;
}

/** National Rail notices that mean a blocked or broken railway (red), or a disruption worth a look (amber). */
const RED_NOTICE = /(lines? (are|is|have been) blocked|all lines|no trains (are|will be )?(running|able)|unable to run|suspended|overhead (line|electric|wire)|person (has been )?hit|hit by a train|emergency services|trespass|major disruption)/i;
const AMBER_NOTICE = /(disruption|signall?ing (problem|fault|failure)|a fault|reduced service|severe delays)/i;
/** Not a blocking incident now: planned work, another day, a facility, or one that has cleared (independent review, 19 Nov). */
const NOT_NOW_NOTICE = /(engineering|planned|improvement works|on (mon|tues|wednes|thurs|fri|satur|sun)day|this weekend|step-free|lift|escalator|toilet|ticket (office|machine)|car park|reopened|re-opened|have now|has now|resumed|now running|earlier today|cleared)/i;
/** The tube before it opens is "Service Closed" (20): not a closure. Closed, suspended, planned closure, not running. */
const TUBE_CLOSED = [1, 2, 4, 16];
/** Part suspended, part closure, severe delays, reduced service, bus service. */
const TUBE_BAD = [3, 5, 6, 7, 8];
/** Trains past their time with no estimate, looked back this far. */
const STUCK_LOOKBACK_MIN = 60;

export interface WatchVerdict {
  direction: WatchDirection; level: WatchLevel;
  /** How much later than normal the earliest arrival is (minutes), when known. */
  lateMin: number | null;
  normalArrive: number | null; expectedArrive: number | null;
  /** The train giving the earliest arrival now. */
  train: Train | null;
  cancelled: number;
  /** Trains past their timetable time showing "Delayed" with no estimate. */
  stuck: number;
  reasons: string[];
}

const schedArr = (t: Train) => t.arr == null ? null : t.arr - (t.arrLate || 0) * 60e3;
const schedDep = (t: Train) => t.dep - (t.depLate || 0) * 60e3;

/**
 * The stations a blocking notice must name to count: the profile's corridor without the London terminals, which carry
 * every operator's notices (St Pancras: Southeastern, East Midlands; King's Cross: the East Coast to Edinburgh).
 */
function localPattern(corridor: string | undefined): RegExp | null {
  if (!corridor) return null;
  const parts = corridor.split("|").filter(x => !/king|pancras|farringdon/i.test(x));
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
}

/**
 * The verdict for one direction from the live boards (`"LET-KGX"`, …: from Letchworth going to the office, to
 * Letchworth going home) and the tube lines' statuses. `unknown` when no board could be read or no train is listed in
 * the next 90 minutes: silence must mean "nothing wrong", never "couldn't look".
 */
export function watchVerdict(direction: WatchDirection, boards: Record<string, Board | null | undefined>, tube: LineStatus[] | null | undefined, now: number,
  policy?: DisruptionConfig, corridor?: string): WatchVerdict {
  void policy;
  const read = Object.values(boards).filter((b): b is Board => !!b);
  const out: WatchVerdict = { direction, level: "ok", lateMin: null, normalArrive: null, expectedArrive: null, train: null, cancelled: 0, stuck: 0, reasons: [] };
  if (!read.length) return { ...out, level: "unknown", reasons: ["The live National Rail feed didn't answer."] };
  const horizon = now + WATCH_WINDOW_MIN * 60e3, back = now - STUCK_LOOKBACK_MIN * 60e3, seen = new Set<string>();
  // The same train on two boards (a Thameslink at Farringdon and at St Pancras) is one train: same operator, same
  // timetabled arrival. Service IDs differ by station in newer feeds.
  const trains = read.flatMap(b => b.services || []).filter(t => {
    const sa = schedArr(t), id = sa != null ? `${t.operator}|${t.to}|${sa}` : t.serviceId || `${t.std}|${t.operator}|${t.to}`;
    if (seen.has(id)) return false; seen.add(id);
    const sd = schedDep(t);
    return sd <= horizon && (sd >= now || (!t.cancelled && (t.dep >= now || ((t.depUnknown || t.arrUnknown) && sd >= back))));
  });
  out.cancelled = trains.filter(t => t.cancelled && schedDep(t) >= now).length;
  out.stuck = trains.filter(t => !t.cancelled && (t.depUnknown || t.arrUnknown) && schedDep(t) < now).length;
  // Normal: the timetable for trains still to leave (one already due would make "normal" earlier than you can reach).
  const normal = trains.filter(t => schedDep(t) >= now).map(schedArr).filter((x): x is number => x != null);
  const running = trains.filter(t => !t.cancelled && !t.depUnknown && !t.arrUnknown && t.arr != null && t.dep >= now);
  const best = running.reduce<Train | null>((a, t) => !a || (t.arr as number) < (a.arr as number) ? t : a, null);
  let level: WatchLevel = "ok";
  const raise = (l: WatchLevel) => { if (l === "red" || (l === "amber" && level === "ok")) level = l; };
  if (normal.length) out.normalArrive = Math.min(...normal);
  if (best) { out.train = best; out.expectedArrive = best.arr; }
  if (!trains.length) level = "unknown";
  else if (!best) { raise("red"); out.reasons.push(out.cancelled ? `No trains running: ${out.cancelled} cancelled` : "No train has a time"); }
  else {
    // With no timetable left to compare (only late trains past their time), the best train's own lateness.
    out.lateMin = out.normalArrive != null ? Math.max(0, Math.round(((best.arr as number) - out.normalArrive) / 60e3)) : Math.max(best.depLate || 0, best.arrLate || 0);
    if (out.lateMin > WATCH_RED_MIN) raise("red"); else if (out.lateMin >= WATCH_AMBER_MIN) raise("amber");
    if (out.lateMin >= WATCH_AMBER_MIN) out.reasons.push(`About ${out.lateMin} min later than normal`);
  }
  // Trains stuck at "Delayed" (Darwin often hasn't updated the ones behind them): two or more is at least amber.
  if (out.stuck >= 2) { raise("amber"); out.reasons.push(`${out.stuck} trains delayed with no estimate`); }
  if (out.cancelled && best) out.reasons.push(`${out.cancelled} cancelled`);
  // Notices on the boards (National Rail's own words).
  const msgs = [...new Set(read.flatMap(b => b.msgs || []))];
  // A blocking incident counts only when it names a station on your line outside London, isn't planned or for
  // another day, isn't about a lift or a ticket office, and hasn't cleared.
  const local = localPattern(corridor);
  const redMsg = msgs.find(m => RED_NOTICE.test(m) && !NOT_NOW_NOTICE.test(m) && (!corridor || (!!local && local.test(m))));
  const amberMsg = msgs.find(m => AMBER_NOTICE.test(m) && !NOT_NOW_NOTICE.test(m));
  if (redMsg) { raise("red"); out.reasons.push(redMsg); } else if (amberMsg && level !== "ok" && level !== "unknown") out.reasons.push(amberMsg);
  // The tube between the stations and the office: every line closed is red; every line badly disrupted is amber.
  const lines = (tube || []).filter(l => WATCH_TUBE_LINES.includes(l.id));
  if (lines.length === WATCH_TUBE_LINES.length) {
    const closed = lines.every(l => l.statuses.some(s => TUBE_CLOSED.includes(s.sev)));
    const bad = lines.every(l => l.statuses.some(s => TUBE_CLOSED.includes(s.sev) || TUBE_BAD.includes(s.sev)));
    if (closed) { raise("red"); out.reasons.push("Circle, Met and H&C all closed or suspended"); }
    else if (bad) { raise("amber"); out.reasons.push("Circle, Met and H&C all disrupted"); }
  }
  out.level = level;
  return out;
}

/** A level holds only once "ok" has been seen this many checks in a row (2-minute checks: 6 minutes). */
export const WATCH_CLEAR_CHECKS = 3;
/** What was sent this window: the highest level since the last all-clear, and how many "ok" checks in a row. */
export interface WatchState { key: string; level: WatchLevel; okRun?: number }

/**
 * What to send for a verdict, given what was sent this window: a notification when it rises above the highest level
 * sent since the last all-clear (amber, or amber to red). A drop doesn't count until "ok" has held for
 * WATCH_CLEAR_CHECKS checks: then a red sends "back to normal" and an amber clears quietly. Lateness steps as trains
 * leave, so 14/15/14/15 is one amber, and 46/44/46 one red (independent review, 19 Nov). Nothing for "unknown": a feed
 * failing isn't news and doesn't reset anything. Each window starts afresh.
 */
export function watchStep(prev: WatchState | null | undefined, window: { key: string; direction: WatchDirection }, v: WatchVerdict, now: number): { notice: PushNotice | null; state: WatchState } {
  void now;
  const same = !!prev && prev.key === window.key;
  const peak: WatchLevel = same && (prev!.level === "amber" || prev!.level === "red") ? prev!.level : "ok";
  const okRun = same ? prev!.okRun || 0 : 0;
  const keep = (level: WatchLevel, run: number): WatchState => run ? { key: window.key, level, okRun: run } : { key: window.key, level };
  if (v.level === "unknown") return { notice: null, state: keep(peak, okRun) };
  const rank = (l: WatchLevel) => l === "red" ? 2 : l === "amber" ? 1 : 0;
  const tag = `watch-${window.key}`;
  const going = window.direction === "office" ? "to the office" : "home";
  const way = v.train && v.expectedArrive != null ? `Best now: the ${v.train.std} from ${v.train.from}, arriving ${hhmm(v.expectedArrive)}.` : "";
  const why = v.reasons.slice(0, 2).join(". ");
  if (rank(v.level) > rank(peak)) {
    const title = v.level === "red"
      ? (window.direction === "office" ? "Commute: consider working from home" : "Commute: disruption on the way home")
      : (window.direction === "office" ? "Commute: delays this morning" : "Commute: delays on the way home");
    const act = v.level === "red" && window.direction === "home" ? " If you can, head home now." : "";
    return { notice: { kind: "watch", tag, title, body: [why, way].filter(Boolean).join(". ").replace(/\.\./g, ".") + act }, state: keep(v.level, 0) };
  }
  if (v.level !== "ok") return { notice: null, state: keep(peak, 0) };
  const run = peak === "ok" ? 0 : okRun + 1;
  if (peak !== "ok" && run >= WATCH_CLEAR_CHECKS) {
    const notice: PushNotice | null = peak === "red" ? { kind: "watch", tag, title: `Commute: back to normal ${going}`, body: way || "Trains are running close to normal again." } : null;
    return { notice, state: keep("ok", 0) };
  }
  return { notice: null, state: keep(peak, run) };
}
