// The 10 Nov evening batch from the trip debrief (issue #57; docs/stories/follow-a-route.md, "The tube named, one
// leave time, and a card that agrees with itself"): the tube line's data, "N min later than planned", and the saved
// route's new optional fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, train, MIN, at } from "./helpers.mjs";

const t = at("2026-11-03", "08:00");
const names = { CEN: "Central" };
const tube = { stop: "Dockside", lines: ["circle", "met"], ride: { CEN: 420, MID: 600 }, toward: "eastbound", alt: { stop: "Dockside East", lines: ["hc"] } };
const outLegs = [{ t: t, d: "Leave home" }, { t: t + 20 * MIN, d: "Train", train: true }, { t: t + 50 * MIN, d: "Arrive Central" }, { t: t + 57 * MIN, d: "Circle or Met to Dockside", tube: true }, { t: t + 70 * MIN, d: "Arrive office" }];
const homeLegs = [{ t: t, d: "Leave office" }, { t: t + 12 * MIN, d: "Circle or Met to Central", tube: true }, { t: t + 26 * MIN, d: "Train", train: true }, { t: t + 60 * MIN, d: "Arrive Riverside" }, { t: t + 80 * MIN, d: "Arrive home" }];

test("The tube line going out: the lines, where to, which way, the typical ride, and a second route that may come first", () => {
  assert.deepEqual(core.tubeLine({ hub: "CEN", tube, legs: outLegs }, "office", names),
    { lines: ["circle", "met"], from: "Central", to: "Dockside", toward: "eastbound", rideMin: 7, alt: { lines: ["hc"], to: "Dockside East" } });
  assert.equal(core.tubeLine({ hub: "MID", tube, legs: outLegs }, "office", names).rideMin, 10, "the ride is the route's own, per station");
  assert.equal(core.tubeLine({ hub: "MID", tube, legs: outLegs }, "office", names).from, "MID", "an unnamed station: its code");
  const only = { ...tube, alt: undefined, toward: undefined };
  assert.deepEqual(core.tubeLine({ hub: "CEN", tube: only, legs: outLegs }, "office", names), { lines: ["circle", "met"], from: "Central", to: "Dockside", toward: null, rideMin: 7, alt: null });
});

test("The tube line coming home: the tube comes first, from the office's stop to the station your train leaves from; no direction, no second route", () => {
  assert.deepEqual(core.tubeLine({ hub: "CEN", tube, legs: homeLegs }, "home", names), { lines: ["circle", "met"], from: "Dockside", to: "Central", toward: null, rideMin: 7, alt: null });
});

test("No tube line when the journey has no such tube: already at the station, no tube data, no ride time, or the tube on the other side of the train", () => {
  const atStation = [{ t: t, d: "You're at Central: go to the platform" }, { t: t + 6 * MIN, d: "Train", train: true }, { t: t + 40 * MIN, d: "Arrive home" }];
  assert.equal(core.tubeLine({ hub: "CEN", tube, legs: atStation }, "home", names), null, "already at the London station");
  assert.equal(core.tubeLine({ hub: "CEN", legs: outLegs }, "office", names), null);
  assert.equal(core.tubeLine({ hub: "XXX", tube, legs: outLegs }, "office", names), null, "no ride time for that station");
  assert.equal(core.tubeLine({ hub: "CEN", tube: { ...tube, lines: [] }, legs: outLegs }, "office", names), null);
  assert.equal(core.tubeLine({ hub: "CEN", tube, legs: homeLegs }, "office", names), null, "going out, a tube before the train isn't the onward tube");
  assert.equal(core.tubeLine({ hub: "CEN", tube, legs: outLegs }, "home", names), null);
  assert.equal(core.tubeLine({ hub: "CEN", tube }, "office", names), null, "a route saved without its steps");
});

function option(extra = {}, trainExtra = {}) {
  const dep = t + 20 * MIN, arr = t + 50 * MIN;
  return { hub: "CEN", leave: t, arrive: t + 70 * MIN, flags: [], effort: "walk", tube,
    train: train({ from: "RVS", to: "CEN", std: "08:20", dep, arr, serviceId: "chosen", ...trainExtra }), legs: outLegs.map((l) => ({ ...l })), ...extra };
}
const start = () => core.startFollowRoute(option(), { now: t, direction: "office", mode: "commute" });
const aboard = (r, lateMin, extra = {}) => core.updateFollowRoute(r, { now: t + 30 * MIN, phase: "on-train", dataFresh: true,
  options: [option({}, { arr: t + (50 + lateMin) * MIN, arrLate: Math.max(0, lateMin) })], ...extra });

test("'On track' is kept for arriving when planned or sooner; later than planned it says by how much, in amber", () => {
  const r = start();
  const onTime = aboard(r, 0); assert.equal(onTime.text, "On track"); assert.equal(onTime.level, "ok");
  const early = aboard(r, -2); assert.equal(early.text, "On track"); assert.equal(early.level, "ok");
  const one = aboard(r, 1); assert.equal(one.text, "1 min later than planned"); assert.equal(one.level, "warn"); assert.equal(one.status, "on-track", "nothing is at risk: the status itself is unchanged");
  const six = aboard(r, 6); assert.equal(six.text, "6 min later than planned"); assert.equal(six.level, "warn");
  assert.equal(six.route.expectedArrival, r.plannedArrival + 6 * MIN);
  // Before the train, at the station, with the train four minutes late: the rest of the line is kept.
  const late = option({}, { dep: t + 24 * MIN, depLate: 4, arr: t + 54 * MIN, arrLate: 4 });
  const waiting = core.updateFollowRoute(r, { now: t + 15 * MIN, phase: "before-train", dataFresh: true, options: [late], boarding: "at" });
  assert.equal(waiting.text, "4 min later than planned · train departs in 9 min");
  // A missed or cancelled train is still said as that.
  assert.match(core.updateFollowRoute(r, { now: t + 15 * MIN, phase: "before-train", dataFresh: true, options: [option({}, { cancelled: true })] }).text, /cancelled/);
});

test("A saved route with the new fields restores; one saved before them restores too; a bad value is refused", () => {
  const r = start(), told = aboard(r, 6).route;
  assert.equal(told.toldArrival, r.plannedArrival + 6 * MIN); assert.equal(told.notices[0].was, r.plannedArrival);
  const again = core.restoreFollowRoute(JSON.parse(JSON.stringify(told)));
  assert.ok(again); assert.equal(again.toldArrival, told.toldArrival); assert.equal(again.notices[0].was, r.plannedArrival);
  assert.ok(core.restoreFollowRoute(JSON.parse(JSON.stringify(r))), "no toldArrival: the plan is what you were told");
  assert.equal(core.restoreFollowRoute({ ...JSON.parse(JSON.stringify(told)), toldArrival: "soon" }), null);
  const badNotice = JSON.parse(JSON.stringify(told)); badNotice.notices[0].was = "then";
  assert.equal(core.restoreFollowRoute(badNotice), null);
});
