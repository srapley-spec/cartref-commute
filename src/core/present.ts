// Presentation model: what comes first on screen, and why. Pure: no DOM, no sizes, no copy about pixels.
//
// Rule (docs/architecture.md, 29 Oct 2026): the engine decides priority, the shell decides geometry. Which view you
// are in, what the headline number is, how bad things are and in what order the blocks go are decided here, once,
// from engine outputs. A screen, a widget, a Live Activity or a Watch face draws that order in its own shape; none
// of them re-decides it. A design proposal proposes how to draw these blocks, not which block comes first.
import type { RailWarnings } from "./warnings";
import { lineLevel, worstStatus, type LineStatus } from "./warnings";
import type { Direction, Effort, Option } from "./types";
import { hhmm } from "./time";
import { resolveDisruptionPolicy, type DisruptionConfig } from './disruption';

/** The screens. One of these is chosen from the situation; no shell has a view the model doesn't name. */
export type View =
  | "awaiting-location"   // Auto direction, no fix yet (or denied): nothing can be planned
  | "plan-now" | "plan-by" | "plan-at"
  | "following"           // a chosen route exists, without inventing a current train or location
  | "on-train"            // on the line between home and London, which train worked out or asked
  | "at-hub"              // at a London station going to work: the tube connection
  | "on-tube"             // on the tube to work
  | "in-london"           // elsewhere in London going to work (walking, TfL-planned, or arrived)
  | "on-tube-home"        // on a tube from the office: where to get off
  | "nearly-home"         // the last stretch home
  // Trip mode (docs/leisure-architecture.md §7): any two places. Planning views start "plan-" like the commute's.
  | "plan-trip-now" | "plan-trip-by" | "plan-trip-at"
  | "trip-follow"         // a followed trip before anything is under way
  | "trip-access"         // on the way to the first station
  | "trip-ride"           // on a ride: headline = arrival
  | "trip-change"         // at a change: headline = next departure and the spare minutes
  | "trip-final";         // off the last train, on the way to the destination

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
  | "why"          // why these trains: what each source returned and dropped
  | "others"       // Trip: the best journey from / to each other station, with what it costs
  | "gaps";        // Trip: what Google Maps also finds that beats the best here (not in TfL's planner)

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
  "following": ["label", "headline", "which", "progress", "then", "lines", "source"],
  "on-train": ["label", "headline", "which", "progress", "then", "lines", "source"],
  "at-hub": ["label", "headline", "which", "then", "lines", "board"],
  "on-tube": ["label", "headline", "which", "then", "lines"],
  "in-london": ["label", "headline", "then", "lines"],
  "on-tube-home": ["label", "headline", "which", "then", "lines", "board"],
  "nearly-home": ["label", "headline", "then"],
  "plan-trip-now": ["label", "headline", "options", "others", "gaps", "board", "why", "source"],
  "plan-trip-by": ["label", "headline", "options", "others", "gaps", "board", "why", "source"],
  "plan-trip-at": ["label", "headline", "options", "others", "gaps", "board", "why", "source"],
  "trip-follow": ["label", "headline", "which", "then", "source"],
  "trip-access": ["label", "way", "headline", "then", "source"],
  "trip-ride": ["label", "headline", "which", "progress", "then", "source"],
  "trip-change": ["label", "headline", "which", "then", "source"],
  "trip-final": ["label", "headline", "then"],
};

/** Trip mode's situation: every field from the trip engine (followTrip) or saved state. */
export interface TripSituation {
  plan: "now" | "by" | "at";
  /** No trip followed: planning only. */
  following: boolean;
  /** The followed trip's phase (followTrip.ts). */
  phase?: "before" | "access" | "ride" | "change" | "final" | "arrived";
}
export const TRIP_VIEWS = { plan: { now: "plan-trip-now", by: "plan-trip-by", at: "plan-trip-at" } as Record<"now" | "by" | "at", View>, following: "trip-follow" as View };
/** Which Trip view: the followed trip's phase wins over planning; otherwise the planning question's view. */
export function chooseTripView(s: TripSituation): Presentation {
  const phaseView: Record<string, View> = { access: "trip-access", ride: "trip-ride", change: "trip-change", final: "trip-final" };
  const v: View = s.following && s.phase && phaseView[s.phase] ? phaseView[s.phase]
    : s.following && s.phase === "before" ? "trip-follow" : TRIP_VIEWS.plan[s.plan];
  return { view: v, underWay: false, blocks: BLOCKS[v] };
}

/** Auto/Plan keep the journey's leave headline and a separate prominent connection.
 * Explicit Live retains departure-first station/walking information. Active arrivals still lead. */
export function headlineKind(view: View, ctx: { atStation: boolean; onWay: boolean; mode?: "auto" | "plan" | "live" }): HeadlineKind {
  if (view === "plan-now") return ctx.mode === "live" && (ctx.atStation || ctx.onWay) ? "departs" : "leave";
  if (view === "plan-by" || view === "plan-at") return "leave";
  return "arrive";
}

// ---------- The status line ----------
export type StatusLevel = "bad" | "warn" | "note" | "info" | "ok";
export interface StatusInput {
  policy?: DisruptionConfig;
  /** Feed health, worst first: these can never hide behind a line's status. */
  errors: string[];              // problems loading (e.g. a key refused)
  notLoaded: string[];           // routes whose trains didn't load, by name
  stale: boolean;                // no successful refresh for 3 min
  tubeFallback: boolean;         // Circle and Met both closed: H&C to Aldgate East
  fallbackUnavailable?: boolean; // the fallback's own current service is unavailable too
  /** Your trains and notices, graded by impact (railWarnings), or null before boards load. */
  tiers: RailWarnings | null;
  /** Tube lines a commute journey uses, and National Rail operators, with their status. */
  tubeLines: LineStatus[];
  operators: LineStatus[];
  /** The plan on screen is for later: train warnings describe now, not that plan. */
  planLater: boolean;
  demo: boolean;
  timetableOnly: boolean;
  /** One or more required live line/operator status responses are absent or unusable. */
  statusUnavailable?: boolean;
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
  const policy = resolveDisruptionPolicy(i.policy).rail;
  const describe = (l: LineStatus) => worstStatus(l, i.policy)?.desc || 'status unknown';
  const notOk = (ls: LineStatus[]) => ls.filter(l => lineLevel(l, i.policy) !== "ok");
  const tubeBad = notOk(i.tubeLines).filter(l => lineLevel(l, i.policy) === "bad"), tubeWarn = notOk(i.tubeLines).filter(l => lineLevel(l, i.policy) === "warn");
  const ops = notOk(i.operators);
  const nowNote = i.planLater ? " (trains now, not your plan)" : "";
  if (t) {
    if (t.cancelled.length) detail.push(n(t.cancelled.length, "train", "trains") + " cancelled");
    if (t.uncertain.length) detail.push(n(t.uncertain.length, "train", "trains") + " delayed with no estimate");
    if (t.hit) detail.push(`${t.affected} of ${t.total} delayed ${policy.warnMin}+ min or cancelled`);
    else if (t.late >= policy.warnMin) detail.push(`worst delay ${t.late} min`);
    if (t.onRoute.length) detail.push(n(t.onRoute.length, "notice") + " on your route");
  }
  for (const l of [...tubeBad, ...tubeWarn, ...ops]) detail.push(`${l.name}: ${describe(l)}`);
  if (i.demo) detail.push("example data");
  if (i.timetableOnly) detail.push("timetable, not live");
  if (i.statusUnavailable) detail.push("live line status unavailable");

  if (i.errors.length) return { level: "bad", text: i.errors[0], detail };
  if (i.notLoaded.length) return { level: "bad", text: `${i.notLoaded.join(" and ")} trains not loaded`, detail };
  if (i.stale) return { level: "bad", text: "Train times may be out of date", detail };
  if (t && t.cancelled.length) return { level: "bad", text: `${n(t.cancelled.length, "train", "trains")} cancelled on your route${nowNote}`, detail };
  if (t && t.uncertain.length) return { level: "bad", text: `${n(t.uncertain.length, "train", "trains")} delayed with no estimate${nowNote}`, detail };
  if (t && t.late >= policy.badMin) return { level: "bad", text: `Delays up to ${t.late} min on your route${nowNote}`, detail };
  if (i.tubeFallback && i.fallbackUnavailable) return { level: "bad", text: "Tube lines closed now · check onward travel", detail };
  if (i.tubeFallback) return { level: "bad", text: "Circle and Met closed: via Aldgate East", detail };
  if (tubeBad.length) return { level: "bad", text: `${tubeBad[0].name}: ${describe(tubeBad[0])}`, detail };
  if (t && t.late >= policy.warnMin) return { level: "warn", text: `Delays up to ${t.late} min on your route${nowNote}`, detail };
  if (tubeWarn.length) return { level: "warn", text: `${tubeWarn[0].name}: ${describe(tubeWarn[0])}`, detail };
  if (ops.length) return { level: "note", text: `${ops[0].name}: ${describe(ops[0])}`, detail };
  if (t && t.onRoute.length) return { level: "note", text: `${n(t.onRoute.length, "notice")} on your route, no train affected yet`, detail };
  if (i.demo) return { level: "info", text: "Example trains", detail };
  if (i.timetableOnly) return { level: "info", text: "Timetable times, not live", detail };
  if (i.statusUnavailable) return { level: "info", text: "Live line status unavailable", detail };
  return { level: "ok", text: "Good service on your lines", detail };
}

// ---------- Naming a train ----------
/**
 * A train as people tell it apart on the platform or on board: "18:57 Great Northern to Cambridge". The destination
 * is what the train's own screens and announcements say, so it settles which of two close trains you're on.
 */
export function trainName(t: { std: string; operator: string; destination?: string }): string {
  return `${t.std} ${t.operator}${t.destination ? ` to ${t.destination}` : ""}`.trim();
}
/** The tube that belongs to a planned journey, for one line on the card (10 Nov 2026, #57 A2, H1): going out it
 *  follows the train ("Then [Circle] [Met] to Aldgate · eastbound · about 7 min", with a second route that may come
 *  first); coming home it comes before the train ("Tube: [Circle] [Met] Aldgate → Farringdon · 7 min"). Null when
 *  the journey has no such tube (already at the London station, a leisure walk, a trip to somewhere else). The
 *  lines, stops and ride times are the route's own data (profile), nothing is worked out here. */
export interface TubeLine { lines: string[]; from: string; to: string; toward: string | null; rideMin: number; alt: { lines: string[]; to: string } | null }
export function tubeLine(option: Option, direction: Direction, names: Record<string, string>): TubeLine | null {
  const tube = option.tube as { stop?: string; lines?: string[]; ride?: Record<string, number>; toward?: string; alt?: { stop: string; lines: string[] } } | undefined;
  const legs = Array.isArray(option.legs) ? option.legs as { tube?: boolean; train?: boolean }[] : [];
  const train = legs.findIndex(l => l.train), ride = legs.findIndex(l => l.tube);
  if (!tube || !tube.stop || !Array.isArray(tube.lines) || !tube.lines.length || train < 0 || ride < 0) return null;
  if (direction === "office" ? ride < train : ride > train) return null;
  const secs = tube.ride?.[option.hub], hub = names[option.hub] || option.hub;
  if (typeof secs !== "number" || !Number.isFinite(secs)) return null;
  return direction === "office"
    ? { lines: tube.lines, from: hub, to: tube.stop, toward: tube.toward || null, rideMin: Math.round(secs / 60), alt: tube.alt ? { lines: tube.alt.lines, to: tube.alt.stop } : null }
    : { lines: tube.lines, from: tube.stop, to: hub, toward: null, rideMin: Math.round(secs / 60), alt: null };
}

/**
 * The question asked when the evidence contradicts the train you selected (10 Nov 2026, #57 C1). It states the
 * evidence, then asks; the app never switches for you. Wording for a station the train left before you reached it
 * confirmed by Sam, 10 Nov ("stopped at Knebworth at 07:33; you didn't": true of that minute whether or not your own
 * train calls there later).
 */
export function wrongTrainQuestion(name: string, fit: { contradiction?: { kind: string; name: string; t: number } | null; reported?: boolean }, better?: string | null): string {
  const c = fit.contradiction;
  // Without a station to point at, and with a train that fits better: Sam's words, 11 Nov 2026.
  if (!c && better) return `You picked the ${name}, but your position fits the ${better} better. Still on the ${name}?`;
  const evidence = c && c.kind === "left-before-you" ? `The ${name} stopped at ${c.name} at ${hhmm(c.t)}; you didn't.`
    : c && c.kind === "behind-you" ? `You've passed ${c.name}; the ${name} isn't due there until ${hhmm(c.t)}.`
    : `The ${name} doesn't match where you are${fit.reported ? " or where it was last reported" : ""}.`;
  return `${evidence} Which train are you on?`;
}
/** Thameslink trains only (#57 H19; words chosen by Sam, 11 Nov 2026). */
export const thameslinkNote = (operator: string | undefined | null): string | null =>
  /thameslink/i.test(String(operator || "")) ? "Thameslink: first class at the rear is open to standard tickets." : null;
/** Asked before a train other than the one you're following is accepted (Sam, 10 Nov 2026). */
export const switchTrainQuestion = (following: string, selected: string): string => `You're following the ${following}. Switch to the ${selected}?`;
/** A tube as its front and the platform board name it: "10:03 Met to Aldgate". Line and destination as given. */
export function tubeName(timeHHMM: string, line: string | undefined, dest: string | undefined): string {
  const d = String(dest || "").replace(/ \([^)]*Line\)/i, "").trim();
  return `${timeHHMM} ${line || "tube"}${d ? ` to ${d}` : ""}`;
}

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
