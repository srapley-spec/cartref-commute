// Explicit view choice is independent of the journey being tracked. All situation evidence and time
// are injected; switching a view never changes direction, service identity, planning times or feeds.
import { BLOCKS, type Presentation, type View } from "./present";

export const VIEW_OVERRIDE_MS = 20 * 60 * 1000;
export interface ViewOverride {
  mode: "plan" | "live";
  at: number;
  /** Stable engine situation + direction, not a GPS-fix timestamp or location freshness. */
  situationKey: string;
}
export interface ViewControlInput {
  auto: Presentation;
  /** The current live choice, computed independently of the planning question. */
  live: Presentation | null;
  /** Station/on-the-way departure boards use plan-now geometry but are active live situations. */
  hasActiveJourney?: boolean;
  /** A validated chosen route is active evidence even before a train/Tube can be inferred. */
  hasFollowedJourney?: boolean;
  plan: "now" | "by" | "at";
  override?: unknown;
  now: number;
  situationKey: string;
  previous?: Presentation | null;
  interacting?: boolean;
}
export interface ViewControlResult extends Presentation {
  mode: "auto" | "plan" | "live";
  override: ViewOverride | null;
  /** Automatic navigation was deferred; the latest situation is still available to the shell. */
  pending: boolean;
  noActiveJourney: boolean;
}

const planViews: Record<ViewControlInput["plan"], View> = { now: "plan-now", by: "plan-by", at: "plan-at" };
const isLive = (p: Presentation | null): p is Presentation => !!p &&
  p.view !== "awaiting-location" && !p.view.startsWith("plan-");

/** Accept only our small persistence contract. Ignore unknown fields rather than retaining arbitrary data. */
export function restoreViewOverride(value: unknown): ViewOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if ((v.mode !== "plan" && v.mode !== "live") || typeof v.at !== "number" || !Number.isFinite(v.at) || v.at < 0 ||
    typeof v.situationKey !== "string" || !v.situationKey.trim() || v.situationKey.length > 512) return null;
  return { mode: v.mode, at: v.at, situationKey: v.situationKey };
}

export function createViewOverride(mode: "plan" | "live", now: number, situationKey: string): ViewOverride | null {
  return restoreViewOverride({ mode, at: now, situationKey });
}

/**
 * New Follow-a-route policy: a manual planning choice lapses after 20 minutes or a genuine situation
 * change. The same bounded lifetime applies to an explicit Live view. A temporary GPS loss must not
 * change situationKey; deriving a stable movement key belongs to the existing situation model/shell.
 * Return to Auto is represented by null. Auto always considers the newest supplied situation.
 */
export function resolveViewControl(i: ViewControlInput): ViewControlResult {
  let override = restoreViewOverride(i.override);
  if (override && (!Number.isFinite(i.now) || override.at > i.now || i.now - override.at >= VIEW_OVERRIDE_MS ||
    override.situationKey !== i.situationKey)) override = null;
  const mode = override?.mode ?? "auto";
  let desired = i.auto;
  let noActiveJourney = false;
  const available = i.hasActiveJourney ?? isLive(i.live);
  const currentLive = available && i.live && i.live.view !== "awaiting-location" ? i.live : null;
  const following: Presentation = { view: "following", underWay: false, blocks: BLOCKS.following };
  // Once a manual planning pin expires, an old planning question must not keep hiding the actual
  // live situation. Retain a current arrival-deadline verdict when the existing model supplies one.
  if (mode === "auto" && currentLive && !i.auto.underWay) desired = currentLive;
  if (mode === "auto" && i.hasFollowedJourney) {
    // Retain a richer inferred view and any current deadline verdict. At the origin, render the
    // chosen route instead of pretending that no journey exists or that a particular train is boarded.
    desired = isLive(i.auto) ? i.auto : currentLive ?? following;
  }
  if (mode === "plan") {
    // Manual planning cannot invent a direction when location has not established one.
    const view = i.auto.view === "awaiting-location" ? "awaiting-location" : planViews[i.plan];
    desired = { view, underWay: false, blocks: BLOCKS[view] };
  } else if (mode === "live") {
    if (currentLive) desired = currentLive;
    else if (i.hasFollowedJourney) desired = following;
    else {
      noActiveJourney = true;
      const view = i.auto.view === "awaiting-location" ? "awaiting-location" : "plan-now";
      // The shell draws an explicit no-active-journey state; never display a planning option as a live train.
      desired = { view, underWay: false, blocks: BLOCKS[view] };
    }
  }
  const previous = i.previous;
  const pending = mode === "auto" && !!i.interacting && !!previous &&
    (previous.view !== desired.view || previous.underWay !== desired.underWay || previous.blocks.join("|") !== desired.blocks.join("|"));
  const displayed = pending && previous ? previous : desired;
  return { ...displayed, blocks: [...displayed.blocks], mode, override, pending, noActiveJourney };
}
