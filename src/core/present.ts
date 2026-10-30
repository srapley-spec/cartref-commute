// Presentation model: what comes first on screen, and why. Pure: no DOM, no sizes, no copy about pixels.
//
// Rule (docs/architecture.md, 29 Oct 2026): the engine decides priority, the shell decides geometry. Which view you
// are in, what the headline number is, how bad things are and in what order the blocks go are decided here, once,
// from engine outputs. A screen, a widget, a Live Activity or a Watch face draws that order in its own shape; none
// of them re-decides it. A design proposal proposes how to draw these blocks, not which block comes first.
import type { RailWarnings } from "./warnings";
import { lineLevel, type LineStatus } from "./warnings";
import type { Effort } from "./types";

/** The screens. One of these is chosen from the situation; no shell has a view the model doesn't name. */
export type View =
  | "awaiting-location"   // Auto direction, no fix yet (or denied): nothing can be planned
  | "plan-now" | "plan-by" | "plan-at"
  | "on-train"            // on the line between home and London, which train worked out or asked
  | "at-hub"              // at a London station going to work: the tube connection
  | "on-tube"             // on the tube to work
  | "in-london"           // elsewhere in London going to work (walking, TfL-planned, or arrived)
  | "on-tube-home"        // on a tube from the office: where to get off
  | "nearly-home";        // the last stretch home

/** What the shell knows about the situation (every field comes from the engine or saved state). */
export interface Situation {
  plan: "now" | "by" | "at";
  awaitingLocation: boolean;
  /** Arrive by: a target is set and it is today (the verdict band applies to a journey under way). */
  byTargetToday: boolean;
  onLine: boolean;
  atHubToOffice: boolean;
  onTube: boolean;
  inLondonToOffice: boolean;
  onTubeHome: boolean;
  nearlyHome: boolean;
}

/** The big number's meaning: when to leave, when the train departs (you're at or near the station), or when you arrive. */
export type HeadlineKind = "leave" | "departs" | "arrive";

/** Named blocks, in the order a shell draws them. Each shell draws every block it has data for, in this order. */
export type Block =
  | "verdict"      // Arrive by under way: on time / late for hh:mm
  | "label"        // context line: what this is, the time, the data source
  | "headline"     // the big number (leave / departs / arrive) and its counterpart
  | "which"        // which train or tube you're on, with "not this one?" / picks
  | "progress"     // where the train is: last reported, expected at your stop, calling points
  | "options"      // the top card: best, then next best
  | "way"          // on your way: when you'll reach the station
  | "right-now"    // the train you'd catch by leaving this minute, if different
  | "hurry"        // still possible if you hurry
  | "tubes-home"   // next tubes from Aldgate and the train each gets you to
  | "then"         // the rest of the journey (onward legs)
  | "lines"        // every line on the journey with its status, good service included
  | "source"       // one line on where the numbers come from
  | "board"        // every train, in leaving order (never hide a train)
  | "why";         // why these trains: what each source returned and dropped

export interface Presentation {
  view: View;
  /** The live view is showing while an Arrive by plan for today is set: draw the verdict band first. */
  underWay: boolean;
  blocks: Block[];
}

/**
 * Which view to show. Mirrors the situation rules exactly: live situations win over planning, except that a
 * Leave around plan with no live situation, or an Arrive by plan that isn't for today, stays on its planning view.
 * Arrive by for today while under way shows the live view with the verdict on top.
 */
export function chooseView(s: Situation): Presentation {
  if (s.awaitingLocation) return { view: "awaiting-location", underWay: false, blocks: BLOCKS["awaiting-location"] };
  const live = s.onLine || s.atHubToOffice || s.onTube || s.inLondonToOffice;
  const liveView = (): View => s.inLondonToOffice ? "in-london" : s.onTube ? "on-tube" : s.onLine ? "on-train" : "at-hub";
  if (s.plan === "by" && live && s.byTargetToday) { const v = liveView(); return { view: v, underWay: true, blocks: ["verdict", ...BLOCKS[v]] }; }
  if (s.plan === "at" && !live) return { view: "plan-at", underWay: false, blocks: BLOCKS["plan-at"] };
  if (s.plan === "by") return { view: "plan-by", underWay: false, blocks: BLOCKS["plan-by"] };
  const v: View = s.inLondonToOffice ? "in-london" : s.onTube ? "on-tube" : s.atHubToOffice ? "at-hub"
    : s.onTubeHome ? "on-tube-home" : s.nearlyHome ? "nearly-home" : s.onLine ? "on-train" : "plan-now";
  return { view: v, underWay: false, blocks: BLOCKS[v] };
}

/** The canonical order of blocks per view. The headline is never below a control or a notice. */
export const BLOCKS: Record<View, Block[]> = {
  "awaiting-location": ["label", "source"],
  "plan-now": ["label", "way", "headline", "options", "right-now", "hurry", "tubes-home", "lines", "board", "why", "source"],
  "plan-by": ["label", "headline", "options", "hurry", "lines", "board", "why", "source"],
  "plan-at": ["label", "headline", "options", "lines", "board", "why", "source"],
  "on-train": ["label", "headline", "which", "progress", "then", "lines", "source"],
  "at-hub": ["label", "headline", "which", "then", "lines", "board"],
  "on-tube": ["label", "headline", "which", "then", "lines"],
  "in-london": ["label", "headline", "then", "lines"],
  "on-tube-home": ["label", "headline", "which", "then", "lines", "board"],
  "nearly-home": ["label", "headline", "then"],
};

/** What the big number means on a planning view: departs when you're at or walking to the station, else leave. */
export function headlineKind(view: View, ctx: { atStation: boolean; onWay: boolean }): HeadlineKind {
  if (view === "plan-now") return ctx.atStation || ctx.onWay ? "departs" : "leave";
  if (view === "plan-by" || view === "plan-at") return "leave";
  return "arrive";
}

// ---------- The status line ----------
export type StatusLevel = "bad" | "warn" | "note" | "info" | "ok";
export interface StatusInput {
  /** Feed health, worst first: these can never hide behind a line's status. */
  errors: string[];              // problems loading (e.g. a key refused)
  notLoaded: string[];           // routes whose trains didn't load, by name
  stale: boolean;                // no successful refresh for 3 min
  tubeFallback: boolean;         // Circle and Met both closed: H&C to Aldgate East
  /** Your trains and notices, graded by impact (railWarnings), or null before boards load. */
  tiers: RailWarnings | null;
  /** Tube lines a commute journey uses, and National Rail operators, with their status. */
  tubeLines: LineStatus[];
  operators: LineStatus[];
  /** The plan on screen is for later: train warnings describe now, not that plan. */
  planLater: boolean;
  demo: boolean;
  timetableOnly: boolean;
}
export interface StatusLine { level: StatusLevel; text: string; detail: string[]; }

const n = (k: number, one: string, many = one + "s") => `${k} ${k === 1 ? one : many}`;

/**
 * One line that says how things stand, worst first. Precedence: data you can't trust (errors, routes not loaded,
 * stale) > your own trains (cancelled, no estimate, 15+ min) > the route itself changed (H&C fallback) >
 * 5–14 min late or a tube line disrupted > a notice on your route or an operator not on good service, with no
 * impact yet > timetable or example data > all good. Lower tiers are counted in `detail`, never promoted.
 */
export function statusLine(i: StatusInput): StatusLine {
  const detail: string[] = [];
  const t = i.tiers;
  const notOk = (ls: LineStatus[]) => ls.filter(l => lineLevel(l) !== "ok");
  const tubeBad = notOk(i.tubeLines).filter(l => lineLevel(l) === "bad"), tubeWarn = notOk(i.tubeLines).filter(l => lineLevel(l) === "warn");
  const ops = notOk(i.operators);
  const nowNote = i.planLater ? " (trains now, not your plan)" : "";
  if (t) {
    if (t.cancelled.length) detail.push(n(t.cancelled.length, "train", "trains") + " cancelled");
    if (t.uncertain.length) detail.push(n(t.uncertain.length, "train", "trains") + " delayed with no estimate");
    if (t.hit) detail.push(`${t.affected} of ${t.total} delayed 5+ min or cancelled`);
    else if (t.late >= 5) detail.push(`worst delay ${t.late} min`);
    if (t.onRoute.length) detail.push(n(t.onRoute.length, "notice") + " on your route");
  }
  for (const l of [...tubeBad, ...tubeWarn, ...ops]) detail.push(`${l.name}: ${l.statuses[0] ? worstDesc(l) : "status unknown"}`);
  if (i.demo) detail.push("example data");
  if (i.timetableOnly) detail.push("timetable, not live");

  if (i.errors.length) return { level: "bad", text: i.errors[0], detail };
  if (i.notLoaded.length) return { level: "bad", text: `${i.notLoaded.join(" and ")} trains not loaded`, detail };
  if (i.stale) return { level: "bad", text: "Train times may be out of date", detail };
  if (t && t.cancelled.length) return { level: "bad", text: `${n(t.cancelled.length, "train", "trains")} cancelled on your route${nowNote}`, detail };
  if (t && t.uncertain.length) return { level: "bad", text: `${n(t.uncertain.length, "train", "trains")} delayed with no estimate${nowNote}`, detail };
  if (t && t.late >= 15) return { level: "bad", text: `Delays up to ${t.late} min on your route${nowNote}`, detail };
  if (i.tubeFallback) return { level: "bad", text: "Circle and Met closed: via Aldgate East", detail };
  if (tubeBad.length) return { level: "bad", text: `${tubeBad[0].name}: ${worstDesc(tubeBad[0])}`, detail };
  if (t && t.late >= 5) return { level: "warn", text: `Delays up to ${t.late} min on your route${nowNote}`, detail };
  if (tubeWarn.length) return { level: "warn", text: `${tubeWarn[0].name}: ${worstDesc(tubeWarn[0])}`, detail };
  if (ops.length) return { level: "note", text: `${ops[0].name}: ${worstDesc(ops[0])}`, detail };
  if (t && t.onRoute.length) return { level: "note", text: `${n(t.onRoute.length, "notice")} on your route, no train affected yet`, detail };
  if (i.demo) return { level: "info", text: "Example trains", detail };
  if (i.timetableOnly) return { level: "info", text: "Timetable times, not live", detail };
  return { level: "ok", text: "Good service on your lines", detail };
}

const worstDesc = (l: LineStatus) => l.statuses.reduce((a, b) => (a.sev <= b.sev ? a : b)).desc;

// ---------- On your way: how you're doing for the top train ----------
/** Minutes in hand to be comfortable on your way to the station (Sam, 30 Oct). */
export const WAY_COMFORT_MIN = 3;
/**
 * The colour of "At the station about …" on your way, from the top train's whole minutes to spare (the same number
 * as its "N min to spare") and the effort it needs. ok: 3+ min at your pace. warn: 1–2 min, or only at a fast walk.
 * bad: under a minute ("keep going"), or it needs more than a fast walk.
 */
export function wayLevel(spareMin: number, effort: Effort = "walk"): "ok" | "warn" | "bad" {
  if (spareMin < 1 || (effort !== "walk" && effort !== "fast")) return "bad";
  if (effort === "fast" || spareMin < WAY_COMFORT_MIN) return "warn";
  return "ok";
}
