// Engine: time-to-leave and wake-up alerts (docs/stories/time-to-leave-alerts.md). Numbers worked out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train } from "./helpers.mjs";

const DAY = "2026-11-03";   // a Tuesday
const NAMES = { LET: "Letchworth Garden City", KGX: "King's Cross", ZFD: "Farringdon", STP: "St Pancras" };
// The 30 Oct evening: Leave 18:22 for the 18:48 Great Northern from King's Cross (26 min of walk and Tube first).
const dep = at(DAY, "18:48"), leaveBy = at(DAY, "18:22");
const gn = (o = {}) => train({ from: "KGX", to: "LET", std: "18:48", dep, arr: at(DAY, "19:22"), operator: "Great Northern", serviceId: "S1848", ...o });
const route = (o = {}) => ({ version: 1, id: "f1", direction: "home", mode: "commute", startedAt: at(DAY, "18:10"),
  option: { id: "o1", flags: [], train: gn(), leave: leaveBy, leaveBy }, plannedArrival: 0, expectedArrival: 0,
  lastTrain: gn(), phase: "before-train", notices: [], dismissedAlternatives: [], seenEvents: [], ...o });

test("Leave alert plan: from a followed journey before its train; the lead is the route's own time before the train", () => {
  const p = core.leaveAlertPlan(route(), NAMES);
  assert.deepEqual(p, { v: 1, followId: "f1", serviceId: "S1848", from: "KGX", to: "LET", std: "18:48", operator: "Great Northern",
    dep, leaveBy, leadMs: 26 * MIN, train: "the 18:48 from King's Cross" });
  // A fast-walk Leave by (later than the walking leave) is the one used.
  assert.equal(core.leaveAlertPlan(route({ option: { ...route().option, leave: at(DAY, "18:20"), leaveBy: at(DAY, "18:24") } }), NAMES).leadMs, 24 * MIN);
  // The train now 4 min late (lastTrain): Leave by moves with it, the lead doesn't.
  const late = core.leaveAlertPlan(route({ lastTrain: gn({ dep: dep + 4 * MIN, depLate: 4 }) }), NAMES);
  assert.equal(late.leaveBy, leaveBy + 4 * MIN); assert.equal(late.dep, dep + 4 * MIN); assert.equal(late.leadMs, 26 * MIN);
  // No plan: on the train or after it, an incident, a cancelled train, no Follow, Leave by after the train.
  for (const r of [route({ phase: "on-train" }), route({ phase: "after-train" }), route({ phase: "arrived" }), route({ incident: "cancelled" }),
    route({ option: { ...route().option, train: gn({ cancelled: true }) } }), route({ option: { ...route().option, leave: dep + MIN, leaveBy: dep + MIN } }), null, undefined])
    assert.equal(core.leaveAlertPlan(r, NAMES), null);
});

test("Leave alert: one alert 5 min before Leave by, again when Leave by moves 2 min or more, and once on a cancellation", () => {
  const plan = core.leaveAlertPlan(route(), NAMES);
  let st = {};
  const step = (t, obs) => { const r = core.leaveAlertStep(plan, st, obs, at(DAY, t)); st = r.state; return r; };
  // 18:16: 6 min before: nothing yet.
  assert.equal(step("18:16", gn()).notice, null);
  // 18:17: exactly 5 min before.
  let r = step("18:17", gn());
  assert.equal(r.notice.kind, "soon");
  assert.equal(r.notice.title, "Leave in 5 min · by 18:22");
  assert.equal(r.notice.body, "For the 18:48 from King's Cross (on time).");
  assert.equal(r.notice.tag, "leave-f1");
  assert.equal(step("18:18", gn()).notice, null, "said once");
  // 1 min late: Leave by moves by 1 min, under 2: quiet.
  assert.equal(step("18:19", gn({ dep: dep + MIN, depLate: 1 })).notice, null);
  // 2 min late (vs the alerted 18:22): Leave later · by 18:24.
  r = step("18:20", gn({ dep: dep + 2 * MIN, depLate: 2 }));
  assert.equal(r.notice.kind, "changed");
  assert.equal(r.notice.title, "Leave later · by 18:24");
  assert.equal(r.notice.body, "The 18:48 from King's Cross is now expected 18:50 (2 min late).");
  // Back to on time: Leave earlier · by 18:22.
  r = step("18:21", gn());
  assert.equal(r.notice.title, "Leave earlier · by 18:22");
  // Cancelled: said once, and the plan ends.
  r = step("18:21", gn({ cancelled: true }));
  assert.equal(r.notice.kind, "cancelled"); assert.equal(r.notice.title, "18:48 cancelled");
  assert.equal(r.notice.body, "The 18:48 from King's Cross is cancelled. Open the app for another train.");
  assert.equal(r.done, true);
});

test("Leave alert: a late scheduler still says Leave now within a minute; after that, and after Leave by, the plan ends", () => {
  const plan = core.leaveAlertPlan(route(), NAMES);
  let r = core.leaveAlertStep(plan, {}, gn(), at(DAY, "18:22") + 60e3);
  assert.equal(r.notice.title, "Leave now · by 18:22");
  r = core.leaveAlertStep(plan, {}, gn(), at(DAY, "18:22") + 61e3);
  assert.equal(r.notice, null); assert.equal(r.done, true);
  // Alerted, then Leave by passes: done, nothing more.
  r = core.leaveAlertStep(plan, { soonSent: true, lastLeaveBy: leaveBy }, gn(), at(DAY, "18:24"));
  assert.equal(r.notice, null); assert.equal(r.done, true);
  // A train 10 min late keeps the plan going past the planned Leave by: the alert comes at 18:27 for 18:32.
  assert.equal(core.leaveAlertWatching(plan, at(DAY, "18:30")), true, "still watching after the planned Leave by");
  r = core.leaveAlertStep(plan, {}, gn({ dep: dep + 10 * MIN, depLate: 10 }), at(DAY, "18:27"));
  assert.equal(r.notice.title, "Leave in 5 min · by 18:32"); assert.match(r.notice.body, /\(10 min late\)/);
  // Watching: from 60 min before Leave by to 3 h after the planned departure.
  assert.equal(core.leaveAlertWatching(plan, leaveBy - 60 * MIN), true);
  assert.equal(core.leaveAlertWatching(plan, leaveBy - 60 * MIN - 1), false);
  assert.equal(core.leaveAlertWatching(plan, dep + 3 * 60 * MIN), true);
  assert.equal(core.leaveAlertExpired(plan, dep + 3 * 60 * MIN + 1), true);
});

test("Leave alert: no live times or no estimate are said, never hidden; the board's train is found by ID, else time and operator", () => {
  const plan = core.leaveAlertPlan(route(), NAMES);
  let r = core.leaveAlertStep(plan, {}, null, at(DAY, "18:18"));
  assert.equal(r.notice.title, "Leave in 4 min · by 18:22"); assert.equal(r.notice.body, "For the 18:48 from King's Cross (no live times: timetable).");
  r = core.leaveAlertStep(plan, {}, gn({ depUnknown: true }), at(DAY, "18:18"));
  assert.equal(r.notice.body, "For the 18:48 from King's Cross (delayed, no estimate)."); assert.equal(r.state.unknownSent, true);
  r = core.leaveAlertStep(plan, { soonSent: true, lastLeaveBy: leaveBy }, gn({ depUnknown: true }), at(DAY, "18:19"));
  assert.equal(r.notice.kind, "unknown"); assert.equal(r.notice.body, "The 18:48 from King's Cross is delayed with no estimate. Open the app before you go.");
  assert.equal(core.leaveAlertStep(plan, r.state, gn({ depUnknown: true }), at(DAY, "18:20")).notice, null, "said once");
  const other = gn({ serviceId: "X", std: "18:48", operator: "Thameslink" });
  assert.equal(core.findPlannedTrain(plan, { services: [other, gn()], msgs: [] }).serviceId, "S1848");
  assert.equal(core.findPlannedTrain(plan, { services: [other, gn({ serviceId: "NEWID" })], msgs: [] }).serviceId, "NEWID", "same time and operator");
  assert.equal(core.findPlannedTrain(plan, { services: [other], msgs: [] }), null);
  assert.equal(core.findPlannedTrain(plan, null), null);
});

const MORNING = { from: "LET", to: ["KGX", "ZFD", "STP"], time: "06:30", days: [1, 2, 3, 4, 5], names: NAMES };
const am = (std, to, o = {}) => train({ from: "LET", to, std, dep: at(DAY, std), arr: at(DAY, std) + 35 * MIN, ...o });

test("Wake-up check: weekdays at the chosen time (up to 10 min late), once a day", () => {
  assert.equal(core.morningDue(MORNING, at(DAY, "06:29"), null), false);
  assert.equal(core.morningDue(MORNING, at(DAY, "06:30"), null), true);
  assert.equal(core.morningDue(MORNING, at(DAY, "06:39") + 59e3, null), true);
  assert.equal(core.morningDue(MORNING, at(DAY, "06:40"), null), false, "a missed check isn't sent hours late");
  assert.equal(core.morningDue(MORNING, at(DAY, "06:31"), DAY), false, "already done today");
  assert.equal(core.morningDue(MORNING, at("2026-11-07", "06:30"), null), false, "Saturday");
  assert.equal(core.morningDue(MORNING, at("2026-11-08", "06:30"), null), false, "Sunday");
  assert.equal(core.morningDue(MORNING, at("2026-11-09", "06:30"), DAY), true, "Monday, last done Tuesday");
  assert.equal(core.morningDue(null, at(DAY, "06:30"), null), false);
  assert.equal(core.morningDue({ ...MORNING, time: "6:30" }, at(DAY, "06:30"), null), false);
});

test("Wake-up warning: only when a morning train is cancelled, has no estimate or is 5+ min late; a train on two boards said once", () => {
  const now = at(DAY, "06:30");
  const fine = { "LET-KGX": { services: [am("07:08", "KGX", { depLate: 4 })], msgs: [] }, "LET-ZFD": { services: [], msgs: [] }, "LET-STP": { services: [], msgs: [] } };
  assert.equal(core.morningAlert(MORNING, fine, now), null, "4 min late: no news, no alert");
  const tl = { serviceId: "TL1", operator: "Thameslink" };
  const bad = {
    "LET-KGX": { services: [am("07:08", "KGX", { cancelled: true }), am("07:38", "KGX", { depLate: 5, dep: at(DAY, "07:43") }), am("08:31", "KGX", { cancelled: true })], msgs: [] },
    "LET-ZFD": { services: [am("07:21", "ZFD", { ...tl, arrLate: 12 })], msgs: [] },
    "LET-STP": { services: [am("07:21", "STP", { ...tl, arrLate: 12 }), am("07:51", "STP", { depUnknown: true })], msgs: [] },
  };
  const n = core.morningAlert(MORNING, bad, now);
  assert.equal(n.kind, "morning"); assert.equal(n.tag, `morning-${DAY}`);
  assert.equal(n.title, "Commute: 4 trains disrupted", "08:31 is beyond the 2-hour window");
  assert.equal(n.body, "07:08 to King's Cross cancelled; 07:21 to Farringdon 12 min late; 07:38 to King's Cross 5 min late; 07:51 to St Pancras delayed, no estimate.");
  // More than four: the rest counted.
  const many = { "LET-KGX": { services: ["06:40", "06:50", "07:00", "07:10", "07:20", "07:30"].map(t => am(t, "KGX", { cancelled: true, serviceId: t })), msgs: [] } };
  assert.match(core.morningAlert(MORNING, many, now).body, /; and 2 more\.$/);
  // Trains already gone are not counted.
  assert.equal(core.morningAlert(MORNING, { "LET-KGX": { services: [am("06:20", "KGX", { cancelled: true })], msgs: [] } }, now), null);
});

test("Wake-up warning: when no board answered, it says it couldn't check (silence means nothing wrong)", () => {
  const n = core.morningAlert(MORNING, { "LET-KGX": null, "LET-ZFD": null, "LET-STP": undefined }, at(DAY, "06:30"));
  assert.equal(n.title, "Couldn't check your morning trains");
  // One board is enough to judge.
  assert.equal(core.morningAlert(MORNING, { "LET-KGX": { services: [], msgs: [] }, "LET-ZFD": null, "LET-STP": null }, at(DAY, "06:30")), null);
});

test("Leave alert: no fresh estimate (board failed, train missing, \"Delayed\") keeps the last live departure: no silent end, no flip-flop", () => {
  const plan = core.leaveAlertPlan(route(), NAMES);
  // S1: the train goes 20 min late before any alert (real Leave by 18:42); one failed board at 18:30 must not end it.
  let r = core.leaveAlertStep(plan, {}, gn({ dep: dep + 20 * MIN, depLate: 20 }), at(DAY, "18:29"));
  assert.equal(r.notice, null); assert.equal(r.done, false);
  r = core.leaveAlertStep(plan, r.state, null, at(DAY, "18:30"));
  assert.equal(r.done, false, "a blip doesn't end the plan");
  r = core.leaveAlertStep(plan, r.state, null, at(DAY, "18:37"));
  assert.equal(r.notice.title, "Leave in 5 min · by 18:42"); assert.equal(r.notice.body, "For the 18:48 from King's Cross (20 min late, last known).");
  // S3: alerted, then 5 min late (later), then a board blip: no "earlier", and no "later" again after it.
  let st = {};
  const step = (t, obs) => { const x = core.leaveAlertStep(plan, st, obs, at(DAY, t)); st = x.state; return x; };
  assert.equal(step("18:17", gn()).notice.kind, "soon");
  assert.equal(step("18:18", gn({ dep: dep + 5 * MIN, depLate: 5 })).notice.title, "Leave later · by 18:27");
  assert.equal(step("18:21", null).notice, null, "no Leave earlier on a blip");
  assert.equal(step("18:22", gn({ dep: dep + 5 * MIN, depLate: 5 })).notice, null, "and no second Leave later");
  // S3b: a blip after the planned Leave by doesn't end the plan; a later cancellation is still said.
  const b = step("18:24", null);
  assert.equal(b.done, false);
  assert.equal(step("18:25", gn({ cancelled: true })).notice.kind, "cancelled");
  // S4/S5: 8 min late, then "Delayed": said once, Leave by stays 18:30 (not back to 18:22), plan not ended.
  st = { soonSent: true, lastLeaveBy: at(DAY, "18:30"), lastDep: dep + 8 * MIN, lastLate: 8 };
  assert.equal(step("18:24", gn({ depUnknown: true })).notice.kind, "unknown");
  const q = step("18:25", gn({ depUnknown: true }));
  assert.equal(q.notice, null, "no Leave earlier"); assert.equal(q.done, false);
});

test("Leave alert: a train back on time after a Leave later still says Leave now, even when the new Leave by has passed", () => {
  const plan = core.leaveAlertPlan(route(), NAMES);
  let r = core.leaveAlertStep(plan, {}, gn({ dep: dep + 10 * MIN, depLate: 10 }), at(DAY, "18:27"));
  assert.equal(r.notice.title, "Leave in 5 min · by 18:32");
  r = core.leaveAlertStep(plan, r.state, gn(), at(DAY, "18:28"));
  assert.equal(r.notice.kind, "changed"); assert.equal(r.notice.title, "Leave now · by 18:22");
  assert.equal(r.notice.body, "The 18:48 from King's Cross is now expected 18:48 (on time).");
  r = core.leaveAlertStep(plan, r.state, gn(), at(DAY, "18:29"));
  assert.equal(r.notice, null); assert.equal(r.done, true, "then it ends");
});

test("Leave alert plan: Leave by may equal the departure; without leaveBy the walking leave; 'Delayed' keeps the plan; 1 min late is said", () => {
  assert.ok(core.leaveAlertPlan(route({ option: { ...route().option, leave: dep, leaveBy: dep } }), NAMES), "at its station: Leave by = departure");
  const { leaveBy: _drop, ...noLeaveBy } = route().option;
  assert.equal(core.leaveAlertPlan(route({ option: { ...noLeaveBy, leave: at(DAY, "18:20") } }), NAMES).leaveBy, at(DAY, "18:20"));
  assert.ok(core.leaveAlertPlan(route({ incident: "unknown" }), NAMES), "delayed, no estimate: still watched");
  for (const incident of ["cancelled", "missed", "boarding"]) assert.equal(core.leaveAlertPlan(route({ incident }), NAMES), null, incident);
  // The last known train has no estimate: the plan's times stay the option's own.
  assert.equal(core.leaveAlertPlan(route({ lastTrain: gn({ dep: dep + 9 * MIN, depUnknown: true }) }), NAMES).dep, dep);
  const r = core.leaveAlertStep(core.leaveAlertPlan(route(), NAMES), {}, gn({ dep: dep + MIN, depLate: 1 }), at(DAY, "18:18"));
  assert.match(r.notice.body, /\(1 min late\)/);
});

test("Wake-up warning: trains up to 120 min ahead; a train 'Delayed' with no estimate due shortly before still counts; a cancelled one gone doesn't", () => {
  const now = at(DAY, "06:30");
  const one = (t) => core.morningAlert(MORNING, { "LET-KGX": { services: [t], msgs: [] } }, now);
  assert.match(one(am("08:25", "KGX", { cancelled: true })).body, /^08:25 to King's Cross cancelled/, "115 min ahead");
  assert.equal(one(am("08:31", "KGX", { cancelled: true })), null, "121 min ahead");
  assert.equal(one(am("08:30", "KGX", { cancelled: true })).title, "Commute: 1 train disrupted", "exactly 120 min");
  assert.match(one(am("07:00", "KGX", { arrUnknown: true })).body, /07:00 to King's Cross delayed, no estimate/);
  assert.match(one(am("06:25", "KGX", { depUnknown: true })).body, /06:25 to King's Cross delayed, no estimate/, "still waiting");
  assert.equal(one(am("05:59", "KGX", { depUnknown: true })), null, "over 30 min before: gone");
  assert.equal(one(am("06:29", "KGX", { cancelled: true })), null, "a cancelled train already due isn't the one to catch");
});
