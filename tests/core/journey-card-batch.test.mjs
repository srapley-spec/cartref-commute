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

test("Where your tube is: TfL's own words, tidied; nothing for an empty, odd or over-long value", () => {
  assert.equal(core.tubeWhere("At Barbican Platform 1"), "At Barbican");
  assert.equal(core.tubeWhere("At Aldgate Platform 3"), "At Aldgate");
  assert.equal(core.tubeWhere("Between Liverpool Street and Aldgate"), "Between Liverpool Street and Aldgate");
  assert.equal(core.tubeWhere("Approaching Moorgate"), "Approaching Moorgate");
  assert.equal(core.tubeWhere("Left Farringdon"), "Left Farringdon");
  assert.equal(core.tubeWhere("Departed King's Cross St. Pancras"), "Left King's Cross St. Pancras");
  assert.equal(core.tubeWhere("  at  Moorgate  platform 2 "), "At Moorgate");
  assert.equal(core.tubeWhere("At Barbican Platform 1."), "At Barbican", "a full stop doesn't keep the platform");
  for (const [raw, shown] of [["Leaving Baker Street", "Leaving Baker Street"], ["Departing Vauxhall", "Departing Vauxhall"], ["Around Euston Square", "Around Euston Square"]]) assert.equal(core.tubeWhere(raw), shown);
  for (const bad of ["", "  ", "At", "Platform 2", "Unknown", "Check front of train", null, undefined, 7, "At " + "x".repeat(90)]) assert.equal(core.tubeWhere(bad), null, String(bad));
});

test("Where your tube is: read from the prediction for your vehicle (and line), from raw TfL records or the page's own", () => {
  const list = [{ vehicleId: "201", lineId: "circle", currentLocation: "At Farringdon Platform 2" }, { vehicle: "305", lineId: "metropolitan", where: "Between Moorgate and Liverpool Street" },
    { vehicle: "305", lineId: "circle", where: "At Barbican" }, { vehicle: "410", lineId: "metropolitan", where: "" }];
  assert.equal(core.followTubeWhere(list, "305", "metropolitan"), "Between Moorgate and Liverpool Street");
  assert.equal(core.followTubeWhere(list, "305", "circle"), "At Barbican");
  assert.equal(core.followTubeWhere(list, "201"), "At Farringdon");
  assert.equal(core.followTubeWhere(list, "410", "metropolitan"), null, "TfL gave no location");
  assert.equal(core.followTubeWhere(list, "999"), null); assert.equal(core.followTubeWhere(list, ""), null); assert.equal(core.followTubeWhere(null, "305"), null);
});

test("Leg progress: with a live prediction for your tube and TfL's location, the evidence line is that location and when TfL said it", () => {
  const now = at("2026-11-03", "08:16"), legs = [{ id: "tube", kind: "tube", label: "Tube", start: now - 4 * MIN, end: now + 5 * MIN }];
  const model = (evidence) => core.journeyProgress({ now, legs, activeLeg: "tube", calls: [], evidence });
  const live = { source: "prediction", observedAt: now, expectedAt: now + 5 * MIN, identityMatched: true };
  assert.equal(model({ ...live, where: "At Moorgate" }).evidenceLabel, "At Moorgate · TfL, 08:16.");
  assert.equal(model(live).evidenceLabel, "Live arrival; position is a time-based estimate.");
  assert.doesNotMatch(model({ ...live, where: "At Moorgate", identityMatched: false }).evidenceLabel, /At Moorgate/, "not your tube: no position");
  assert.doesNotMatch(model({ source: "modelled", where: "At Moorgate" }).evidenceLabel, /At Moorgate/);
});

test("Notices count minutes as shown: seconds don't make a 3-minute change of a 2-minute one, and a dismissed notice doesn't return on a flap", () => {
  const r = start(), P = r.plannedArrival;                      // the plan arrives on the minute
  const to = (route, ms) => core.updateFollowRoute(route, { now: t + 30 * MIN, phase: "after-train", dataFresh: true, onwardFresh: true, options: [], currentArrival: P + ms });
  assert.equal(to(r, 2 * MIN + 59e3).notice, null, "2 min 59 s later reads two minutes later: no notice");
  assert.ok(to(r, 3 * MIN).notice, "three minutes as shown: a notice");
  const later = to(r, 90e3);
  assert.equal(later.text, "1 min later than planned", "a minute and a half reads one minute later, as the times on the card do");
  // Told at +3 and dismissed; +2 withdraws nothing new; +3 again does not raise it again; a real move to +6 does.
  let u = to(r, 3 * MIN); const seen = core.acknowledgeFollowNotice(u.route, u.notice.id);
  u = to(seen, 2 * MIN); assert.equal(u.notice, null);
  u = to(u.route, 3 * MIN); assert.equal(u.notice, null, "the flap doesn't bring the dismissed notice back");
  u = to(u.route, 6 * MIN); assert.match(u.notice.text, /^Arriving .* \(was .*\): the rest of your journey is taking longer\.$/);
  // Right back at the plan (within a minute), what you were told is forgotten: a later 3-minute change is news again.
  u = to(u.route, 0); assert.equal(u.notice, null);
  u = to(u.route, 3 * MIN); assert.ok(u.notice);
  // An exit allowance that isn't a number adds nothing (no NaN on the card).
  const sam = core.profiles.samCommute, st = sam.places.homeStation;
  assert.ok(Number.isFinite(core.walkFromStopSecs(st, [51.9752, -0.2402], st, 1140, NaN, "avg", sam)));
});

test("A step whose own time has come is taken as done: a late train doesn't bring it back as the next thing, and at the station the next thing is the train", () => {
  const r = core.startFollowRoute({ ...option(), legs: homeLegs.map((l) => ({ ...l })), train: train({ from: "CEN", to: "RVS", std: "08:26", dep: t + 26 * MIN, arr: t + 60 * MIN, serviceId: "chosen" }) }, { now: t, direction: "home", mode: "commute" });
  const lateTrain = { ...r.option, train: { ...r.option.train, dep: t + 41 * MIN, depLate: 15, arr: t + 75 * MIN, arrLate: 15 } };
  const upd = (now, extra = {}) => core.updateFollowRoute(r, { now, phase: "before-train", dataFresh: true, options: [lateTrain], hasReliableLocation: true, ...extra });
  // Before you've left (08:00 step still ahead... at 07:59): both early steps move with the train.
  assert.equal(upd(t - MIN).nextStep.d, "Leave office"); assert.equal(upd(t - MIN).nextStep.t, t + 15 * MIN);
  // 08:15, on the way (the leave and tube steps' own times have come): next is the train, as before.
  assert.equal(upd(t + 15 * MIN).nextStep.train, true);
  // 08:05: the leave step is done, the tube step (08:12) is still ahead and moves with the train.
  assert.equal(upd(t + 5 * MIN).nextStep.d, "Circle or Met to Central"); assert.equal(upd(t + 5 * MIN).nextStep.t, t + 27 * MIN);
  // At the station the train leaves from, whatever the times say: the train.
  assert.equal(upd(t + 5 * MIN, { boarding: "at" }).nextStep.train, true);
  assert.equal(upd(t + 5 * MIN, { boarding: "was", hasReliableLocation: false }).nextStep.train, true);
  // The list without a time (other callers) still moves every early step.
  assert.equal(core.followedLegs(upd(t + 15 * MIN).route)[0].t, t + 15 * MIN);
  assert.equal(core.followedLegs(upd(t + 15 * MIN).route, t + 15 * MIN)[0].t, t);
});
