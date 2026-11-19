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

/** National Rail notices of a blocked or broken railway. Strong: these win over any other word in the notice. */
const STRONG_NOTICE = /(lines? (are|is|have been|have now been|has been|has now been) blocked|all lines (are )?blocked|unable to run|no trains (are |will be )?(running|able)|hit by a train|person (has been )?hit|overhead (line|electric|wire))/i;
/** Weaker: count unless the notice is about a facility ("step-free access … suspended"). */
const WEAK_NOTICE = /(suspended|emergency services|trespass|major disruption)/i;
const FACILITY_NOTICE = /(step-free|\blifts?\b|escalator|toilet|ticket (office|machine)|car park|waiting room)/i;
const AMBER_NOTICE = /(disruption|signall?ing (problem|fault|failure)|a fault|reduced service|severe delays)/i;
/** Cleared: specific phrases only (independent review, 19 Nov: "lines have now been blocked" is not cleared). */
const CLEARED_NOTICE = /(lines? (have|has|are|is) (now )?re-?opened|running (as )?normal(ly)?|disruption (has|is) (now )?(cleared|ended|over)|services (have|are) (now )?resumed|has been resolved)/i;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/**
 * Planned work for another time: only a notice about planned work ("engineering", "no trains will run", "planned
 * closure") can be for another day; an incident "expected to continue on Friday" is today's. Never when it has overrun.
 */
function notToday(m: string, now: number): boolean {
  if (/overrun/i.test(m) || !/(planned|engineering|improvement works|no trains will run)/i.test(m)) return false;
  if (/(planned (engineering|closure|works)|improvement works|this weekend)/i.test(m)) return true;
  const today = DAYS[new Date(now).getDay()];
  const day = /\bon (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(m);
  return !!day && day[1].toLowerCase() !== today;
}
/** The tube before it opens is "Service Closed" (20): not a closure. Closed, suspended, planned closure, not running. */
const TUBE_CLOSED = [1, 2, 4, 16];
/** Part suspended, part closure, severe delays, reduced service, bus service. */
const TUBE_BAD = [3, 5, 6, 7, 8];
/** Trains past their time with no estimate, looked back this far; stuck from this long past their time. */
const STUCK_LOOKBACK_MIN = 60;
const STUCK_AFTER_MIN = 10;

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
 * Whether a blocking notice is on your line. `corridor`: the profile's stations on the way (with the line beyond
 * Letchworth, so "between Hitchin and Cambridge" counts). A "between X and Y" stretch counts only when both ends are
 * on it ("between Hitchin and Peterborough" is the East Coast; "between Alexandra Palace and Hertford North" the
 * Hertford loop). A notice with no stretch must name a station outside London: the London terminals carry every
 * operator's notices (St Pancras: Southeastern, East Midlands; King's Cross: the East Coast to Edinburgh).
 */
function onYourLine(m: string, corridor: string | undefined): boolean {
  if (!corridor) return true;
  const all = new RegExp(`^(london )?(${corridor})`, "i");
  const local = new RegExp(corridor.split("|").filter(x => !/king|pancras|farringdon/i.test(x)).join("|"), "i");
  const stretches = [...m.matchAll(/between ([A-Za-z][A-Za-z' .&-]*?) and ([A-Za-z][A-Za-z' .&-]*?)(?=[.,:;]| via| due| because| mean| until| while| for| following| after| may| is| are| has| have|$)/gi)];
  if (stretches.some(x => all.test(x[1].trim()) && all.test(x[2].trim()) && (local.test(x[1]) || local.test(x[2])))) return true;
  // A station of yours named outside any stretch ("… at Hatfield"), but not as a "via" on someone else's route.
  let rest = m;
  for (const x of stretches) rest = rest.replace(x[0], " ");
  rest = rest.replace(/\bvia [A-Za-z][A-Za-z' .&-]*?(?=[.,:;]| may| will| is| are|$)/gi, " ");
  return local.test(rest);
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
  const horizon = now + WATCH_WINDOW_MIN * 60e3, back = now - STUCK_LOOKBACK_MIN * 60e3;
  // The same train on two boards (a Thameslink at Farringdon and at St Pancras) is one train: same operator, same
  // timetabled arrival. Service IDs differ by station in newer feeds.
  // Going out it is the same departure from Letchworth (on the LET-ZFD and LET-STP boards); coming home, the same
  // arrival at Letchworth.
  // Of two copies, the one that runs: a Thameslink cancelled at Farringdon may still reach St Pancras (re-review, 19 Nov).
  const keyOf = (t: Train) => { const sa = schedArr(t); return direction === "office" ? `${t.operator}|${t.from}|${schedDep(t)}` : sa != null ? `${t.operator}|${t.to}|${sa}` : t.serviceId || `${t.std}|${t.operator}|${t.to}`; };
  const runs = (t: Train) => !t.cancelled && !t.depUnknown && !t.arrUnknown && t.arr != null;
  const better = (a: Train, b: Train) => runs(b) && (!runs(a) || (b.arr as number) < (a.arr as number));
  const chosen = new Map<string, Train>();
  for (const t of read.flatMap(b => b.services || [])) { const k = keyOf(t), had = chosen.get(k); if (!had || better(had, t)) chosen.set(k, t); }
  const trains = [...chosen.values()].filter(t => {
    const sd = schedDep(t);
    return sd <= horizon && (sd >= now || (!t.cancelled && (t.dep >= now || ((t.depUnknown || t.arrUnknown) && sd >= back))));
  });
  out.cancelled = trains.filter(t => t.cancelled && schedDep(t) >= now).length;
  // Darwin shows "Delayed" for a few minutes around departure: a train counts as stuck from 10 min past its time.
  out.stuck = trains.filter(t => !t.cancelled && (t.depUnknown || t.arrUnknown) && schedDep(t) <= now - STUCK_AFTER_MIN * 60e3).length;
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
  const blocking = (m: string) => STRONG_NOTICE.test(m) || (WEAK_NOTICE.test(m) && !FACILITY_NOTICE.test(m));
  const redMsg = msgs.find(m => blocking(m) && !CLEARED_NOTICE.test(m) && !notToday(m, now) && onYourLine(m, corridor));
  const amberMsg = msgs.find(m => AMBER_NOTICE.test(m) && !CLEARED_NOTICE.test(m) && !notToday(m, now));
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
