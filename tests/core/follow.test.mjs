// Engine: following a route (docs/stories/follow-a-route.md). Generic: the made-up Testville corridor is enough.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train, option } from "./helpers.mjs";

const D = "2026-10-30", T = (h) => at(D, h);
// A journey home: leave, the train from King's Cross (dep/arr), walk home 25 min after the train.
const trip = (std, leave, dep, arr, o = {}) => {
  const t = train({ from: "KGX", to: "LET", std, dep: T(dep), arr: T(arr), operator: "Great Northern", serviceId: o.sid || std, ...(o.t || {}) });
  return option({ hub: "KGX", train: t, leave: T(leave), arrive: T(arr) + 25 * MIN, effort: o.effort || "walk", ...(o.o || {}) });
};
const run = (f, now, opts, more = {}) => {
  const mine = opts.find((o) => core.optionHas(o, f.train)) || null;
  return core.trackFollowed(f, { now, train: mine ? mine.train : more.train ?? null, option: mine, options: opts, onBoard: false, ...more });
};

test("Follow, 30 Oct evening: the 18:48 is cancelled — said, and the 18:54 offered (home 19:52, 18 min later); the arrival never moves without a reason", () => {
  const o48 = trip("18:48", "18:22", "18:48", "19:09"), o54 = trip("18:54", "18:28", "18:54", "19:27");
  const f = core.followOption(o48, "home", T("18:19"));
  assert.equal(f.arrive, T("19:34")); assert.equal(f.planned, T("19:34"));
  let s = run(f, T("18:21"), [o48, o54]);
  assert.equal(s.state, "on"); assert.equal(s.arrive, T("19:34")); assert.equal(s.spareMin, 1); assert.equal(s.followed.reason, null);
  const cancelled = trip("18:48", "18:22", "18:48", "19:09", { t: { cancelled: true } });
  s = run(s.followed, T("18:32"), [cancelled, o54]);
  assert.equal(s.state, "cancelled");
  assert.equal(s.followed.reason.text, "Your 18:48 Great Northern is cancelled"); assert.equal(s.followed.reason.level, "bad");
  assert.equal(s.next.train.std, "18:54"); assert.equal(s.next.arrive, T("19:52"));
  assert.equal(s.arrive, T("19:34"), "the followed arrival isn't silently replaced by the next train's");
});

test("Follow: the arrival changes only with a reason — later, back on time; under a minute is no change", () => {
  const o = trip("18:54", "18:28", "18:54", "19:27"), f = core.followOption(o, "home", T("18:20"));
  let s = run(f, T("18:21"), [trip("18:54", "18:28", "18:54", "19:27", { t: { arr: T("19:27") + 50e3 } })]);
  assert.equal(s.arrive, T("19:52"), "50 s: not a change"); assert.equal(s.followed.reason, null);
  s = run(s.followed, T("18:22"), [trip("18:54", "18:28", "18:54", "19:33", { t: { arrLate: 6 } })]);
  assert.equal(s.arrive, T("19:58")); assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is now 6 min late"); assert.equal(s.followed.reason.level, "bad");
  s = run(s.followed, T("18:23"), [trip("18:54", "18:28", "18:54", "19:30", { t: { arrLate: 3 } })]);
  assert.equal(s.arrive, T("19:55")); assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is now only 3 min late"); assert.equal(s.followed.reason.level, "ok");
  s = run(s.followed, T("18:24"), [trip("18:54", "18:28", "18:54", "19:34", { t: { arrLate: 4 } })]);
  assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is now 4 min late"); assert.equal(s.followed.reason.level, "warn", "under 5 min late: amber");
  s = run(s.followed, T("18:25"), [trip("18:54", "18:28", "18:54", "19:27")]);
  assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is back on time");
});

test("Follow: minutes in hand and behind; can't make it at any effort, or it has left: missed, with the best way on", () => {
  const o = trip("18:48", "18:22", "18:48", "19:09"), f = core.followOption(o, "home", T("18:10"));
  const o54 = trip("18:54", "18:28", "18:54", "19:27"), o56 = trip("18:56", "18:34", "18:56", "19:34");
  assert.equal(run(f, T("18:15"), [o, o54]).spareMin, 7);
  const behind = run(f, T("18:24"), [trip("18:48", "18:22", "18:48", "19:09", { effort: "run" }), o54]);
  assert.equal(behind.state, "on"); assert.equal(behind.spareMin, -2); assert.equal(behind.effort, "run");
  const passed = run(f, T("18:24"), [trip("18:48", "18:22", "18:48", "19:09", { effort: "run", o: { missed: true } }), o54]);
  assert.equal(passed.state, "on", "walking leave time passed but you can run: behind, not missed (review after merging main, 30 Oct)");
  const none = run(f, T("18:30"), [trip("18:48", "18:22", "18:48", "19:09", { effort: "none" }), o54, o56]);
  assert.equal(none.state, "missed"); assert.equal(none.followed.reason.text, "You can't make the 18:48 Great Northern now");
  assert.equal(none.next.train.std, "18:54", "the earliest arrival you can still make");
  const left = run(f, T("18:49"), [o54], { train: o.train });
  assert.equal(left.state, "missed"); assert.equal(left.followed.reason.text, "You've missed the 18:48 Great Northern");
  assert.equal(run(f, T("18:48") + 25e3, [o54], { train: o.train }).state, "on", "within 30 s of leaving: not yet missed");
  const gone = run(f, T("18:50"), [trip("18:54", "18:28", "18:54", "19:27", { effort: "none" }), trip("18:56", "18:34", "18:56", "19:34", { t: { cancelled: true } })], { train: o.train });
  assert.equal(gone.next, null, "nothing catchable: no way on offered");
});

test("Follow: on board the train counts however late you'd be to 'leave'; on a tube, minutes in hand from when it reaches the station", () => {
  const o = trip("18:54", "18:28", "18:54", "19:27"), f = core.followOption(o, "home", T("18:20"));
  const s = core.trackFollowed(f, { now: T("19:00"), train: o.train, option: null, options: [], onBoard: true });
  assert.equal(s.state, "on"); assert.equal(s.spareMin, null);
  const tube = (reach) => core.trackFollowed(f, { now: T("18:40"), train: o.train, option: o, options: [o], onBoard: false, tube: { reach: T(reach), readyMs: 7 * MIN } });
  assert.equal(tube("18:44").spareMin, 3, "reach 18:44, 7 min to the platform, train 18:54");
  assert.equal(tube("18:47").spareMin, 0);
  assert.equal(tube("18:48").state, "missed", "a minute short: the connection is lost");
});

test("Follow: a better option only at 5+ min sooner and makeable at a walk or fast walk; once declined, never again", () => {
  const mine = trip("18:56", "18:34", "18:56", "19:34"), f = core.followOption(mine, "home", T("18:20"));
  const four = trip("18:50", "18:30", "18:50", "19:30"), five = trip("18:51", "18:31", "18:51", "19:29"), ran = trip("18:45", "18:21", "18:45", "19:20", { effort: "run" });
  assert.equal(run(f, T("18:25"), [mine, four]).better, null, "4 min sooner: not offered");
  assert.equal(run(f, T("18:25"), [mine, four, five]).better.train.std, "18:51", "5 min sooner: offered");
  assert.equal(run(f, T("18:20"), [mine, ran]).better, null, "only with a run: not offered");
  const fast = trip("18:51", "18:31", "18:51", "19:29", { effort: "fast" });
  assert.equal(run(f, T("18:25"), [mine, fast]).better.train.std, "18:51", "a fast walk is fine");
  const no = { ...f, declined: [core.trainKey(five.train)] };
  assert.equal(run(no, T("18:25"), [mine, five]).better, null, "declined");
  assert.equal(run(f, T("18:25"), [mine, trip("18:51", "18:31", "18:51", "19:29", { t: { cancelled: true } })]).better, null, "cancelled never");
});

test("Follow: the same train at another station still counts (Thameslink at Farringdon or St Pancras); found by service ID; arrived", () => {
  const far = option({ hub: "ZFD", train: train({ from: "ZFD", to: "LET", std: "18:56", dep: T("18:56"), arr: T("19:37"), operator: "Thameslink", serviceId: "TL1" }), leave: T("18:34"), arrive: T("19:59"), effort: "walk" });
  const stp = option({ hub: "STP", train: train({ from: "STP", to: "LET", std: "19:01", dep: T("19:01"), arr: T("19:37"), operator: "Thameslink", serviceId: "TL1" }), leave: T("18:39"), arrive: T("19:59"), effort: "walk" });
  const merged = { ...far, alts: [stp] }, f = core.followOption(stp, "home", T("18:20"));
  assert.ok(core.optionHas(merged, f.train));
  assert.equal(core.findTrain([far.train, stp.train], { operator: "Thameslink", std: "99:99", from: "X", serviceId: "TL1" }), far.train, "by service ID first");
  assert.equal(core.findTrain([far.train], { operator: "Thameslink", std: "19:01", from: "STP" }), null);
  const s = core.trackFollowed(f, { now: T("20:05"), train: stp.train, option: null, options: [], onBoard: false });
  assert.equal(s.state, "arrived");
  assert.equal(core.trackFollowed(f, { now: T("20:03"), train: stp.train, option: null, options: [], onBoard: true }).state, "on", "within 5 min of arriving");
  assert.equal(core.BETTER_MS, 5 * MIN);
});
