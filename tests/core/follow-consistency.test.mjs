// One source of truth while following, and live times kept once the train has left (docs/stories/follow-a-route.md;
// issue #57 H15, H20, H23). 10 Nov 2026, homeward: on the platform at Farringdon as the train drew in, the followed
// card said "You can no longer make your 15:56", because a fresh plan from the phone's position still allowed a walk
// to the platform; and after boarding underground it showed "On time" for 18 minutes while the train ran late.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, train, MIN, at } from "./helpers.mjs";

const t = at("2026-11-03", "15:30");
function option(extra = {}, trainExtra = {}) {
  const dep = t + 26 * MIN, arr = t + 69 * MIN;
  return { hub: "CEN", leave: t + 6 * MIN, arrive: t + 88 * MIN, flags: [], effort: "walk",
    train: train({ from: "CEN", to: "RVS", std: "15:56", dep, arr, serviceId: "chosen", ...trainExtra }),
    legs: [{ t: t + 6 * MIN, d: "Walk to city tube" }, { t: t + 13 * MIN, d: "Blue line", tube: true }, { t: dep, d: "Train from Central", train: true }, { t: arr, d: "Arrive Riverside" }, { t: t + 88 * MIN, d: "Arrive home" }], ...extra };
}
const start = () => core.startFollowRoute(option(), { now: t, direction: "home", mode: "commute" });
const DEP = t + 26 * MIN;
// What a fresh plan from the station says a minute before departure: the walk to the platform no longer fits.
const cantMakeIt = option({ effort: "none", missed: true, leave: DEP - 3 * MIN });
const update = (r, extra) => core.updateFollowRoute(r, { options: [cantMakeIt], availableOptions: [cantMakeIt], dataFresh: true, hasReliableLocation: true, phase: "before-train", ...extra });

test("At the boarding station, how hard you'd have to walk no longer decides: a minute before departure you are on track, not 'missed'", () => {
  const r = start(), now = DEP - 60e3;
  const elsewhere = update(r, { now });
  assert.equal(elsewhere.status, "missed", "away from the station, the plan's own grade still decides");
  assert.match(elsewhere.text, /You can no longer make your 15:56/);
  const atStation = update(r, { now, boarding: "at" });
  assert.equal(atStation.status, "on-track"); assert.equal(atStation.level, "ok");
  assert.equal(atStation.text, "On track · train departs in 1 min");
  assert.equal(atStation.notice, null, "no 'can no longer make' notice");
  assert.equal(atStation.route.expectedArrival, r.expectedArrival, "the arrival is kept");
  assert.equal(update(r, { now: DEP - 20e3, boarding: "at" }).text, "On track · train departing");
  assert.equal(update(r, { now: DEP - 9 * MIN, boarding: "at" }).text, "On track · train departs in 9 min");
  // Needing a fast walk or a run is not a warning either, once you're there.
  const hurry = option({ effort: "run", leave: DEP - 3 * MIN });
  assert.equal(core.updateFollowRoute(r, { now, options: [hurry], availableOptions: [hurry], dataFresh: true, hasReliableLocation: true, phase: "before-train" }).status, "hurry");
  assert.equal(core.updateFollowRoute(r, { now, options: [hurry], availableOptions: [hurry], dataFresh: true, hasReliableLocation: true, phase: "before-train", boarding: "at" }).status, "on-track");
});

test("At the boarding station after departure: asked for two minutes, then missed if you're still standing there", () => {
  const r = start();
  const justGone = update(r, { now: DEP + 30e3, boarding: "at" });
  assert.equal(justGone.status, "hurry"); assert.equal(justGone.level, "info");
  assert.equal(justGone.text, "Departure just passed · confirm if you are on it");
  assert.equal(update(r, { now: DEP + 120e3, boarding: "at" }).status, "hurry", "exactly two minutes: still asking");
  const stillThere = update(r, { now: DEP + 121e3, boarding: "at" });
  assert.equal(stillThere.status, "missed"); assert.match(stillThere.text, /You can no longer make your 15:56/);
});

test("Last placed at the boarding station, no fresh fix since (underground): never 'missed' on that evidence; after departure it asks", () => {
  const r = start();
  const before = update(r, { now: DEP - 60e3, boarding: "was", hasReliableLocation: false });
  assert.notEqual(before.status, "missed"); assert.equal(before.notice, null);
  const after = update(r, { now: DEP + 10 * MIN, boarding: "was", hasReliableLocation: false });
  assert.equal(after.status, "hurry"); assert.equal(after.level, "info");
  assert.equal(after.text, "Departure passed · confirm if you are on it");
  assert.equal(after.route.expectedArrival, r.expectedArrival);
  // A cancelled train is still reported as cancelled.
  const cancelled = option({}, { cancelled: true });
  assert.equal(core.updateFollowRoute(r, { now: DEP + MIN, options: [cancelled], availableOptions: [], dataFresh: true, hasReliableLocation: false, phase: "before-train", boarding: "was" }).status, "cancelled");
});

test("Riding the tube to the station is judged by that tube's arrival, as before: being 'at the station' doesn't apply", () => {
  const r = start(), now = DEP - 8 * MIN;
  const late = update(r, { now, boarding: "at", activeConnection: true, readyAt: { CEN: DEP + 2 * MIN } });
  assert.equal(late.status, "missed", "the tube gets you there after the train: still said");
  const fine = update(r, { now, boarding: "at", activeConnection: true, readyAt: { CEN: DEP - 6 * MIN } });
  assert.equal(fine.status, "on-track"); assert.match(fine.text, /On track · 6 min at your connection/);
});

test("Refresh plan: a followed train that has left is kept on the boards whether or not the phone is placed on the line", () => {
  const s = { now: t, force: false, manual: false, source: "darwin", dir: "home", mode: "commute", view: "now", awaitingLocation: false, inLondonToOffice: false, onTube: false, atHubToOffice: false,
    onTheLine: false, nearOffice: false, boards: { fit: true, at: t - MIN, source: "darwin" }, status: null, nrStatus: null, toOffice: null };
  assert.equal(core.refreshPlan({ ...s }).liveBack, 0);
  assert.equal(core.refreshPlan({ ...s, following: true }).liveBack, 0, "following alone doesn't look back (the train hasn't left)");
  assert.equal(core.refreshPlan({ ...s, following: true, followingDeparted: true }).liveBack, -40);
  assert.equal(core.refreshPlan({ ...s, onTheLine: true }).liveBack, -40, "on the line: as before");
  assert.equal(core.refreshPlan({ ...s, following: true, followingDeparted: true }).rail, core.refreshPlan({ ...s, following: true }).rail, "the same boards are asked for: no extra requests");
});
