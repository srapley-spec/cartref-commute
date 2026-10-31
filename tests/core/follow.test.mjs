// Engine: following a route (docs/stories/follow-a-route.md). Generic: made-up trains are enough.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train, option } from "./helpers.mjs";

const D = "2026-10-30", T = (h) => at(D, h);
// A journey home: leave, the train from King's Cross (dep/arr), walk home 25 min after the train.
const trip = (std, leave, dep, arr, o = {}) => {
  const t = train({ from: o.from || "KGX", to: "LET", std, dep: T(dep), arr: T(arr), operator: o.op || "Great Northern", serviceId: o.sid || std, ...(o.t || {}) });
  return option({ hub: o.from || "KGX", train: t, leave: T(leave), arrive: T(arr) + 25 * MIN, effort: o.effort || "walk", ...(o.o || {}) });
};
const trainsOf = (opts) => opts.flatMap((o) => [o.train, ...(o.alts || []).map((a) => a.train)]);
const run = (f, now, opts, more = {}) => {
  const mine = opts.find((o) => core.followHas(o, f)) || null;
  return core.trackFollowed(f, { now, trains: more.trains || trainsOf(opts), option: mine, options: opts, onBoard: false, ...more });
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
  const again = run(s.followed, T("18:33"), [cancelled, o54]);
  assert.equal(again.followed.reason.at, T("18:32"), "said once: not re-said with a new time on every refresh");
  // OK: gone, and not said again while it stays cancelled.
  const ok = run(core.dismissReason(again.followed), T("18:34"), [cancelled, o54]);
  assert.equal(ok.state, "cancelled"); assert.equal(ok.followed.reason, null);
  // Reinstated: the old reason would now be wrong, so it's replaced.
  const back = run(again.followed, T("18:35"), [o48, o54]);
  assert.equal(back.state, "on"); assert.equal(back.followed.reason.text, "Your 18:48 Great Northern is running again"); assert.equal(back.followed.reason.level, "ok");
});

test("Follow: before the trains load nothing is decided (reopening, a change of direction): never 'missed' from no data", () => {
  const o = trip("18:48", "18:22", "18:48", "19:09"), f = core.followOption(o, "home", T("18:19"));
  const s = core.trackFollowed(f, { now: T("18:20"), trains: null, option: null, options: [], onBoard: false });
  assert.equal(s.state, "on"); assert.equal(s.followed.reason, null); assert.equal(s.spareMin, null);
  const empty = run(f, T("18:30"), [], { trains: [] });
  assert.equal(empty.state, "on", "loaded but not listed before it was due to leave: not missed");
  assert.equal(run(f, T("18:49"), [], { trains: [] }).state, "missed", "not listed, and past when it was due to leave: missed");
});

test("Follow: the arrival changes only with a reason — 60 s is a change, 59 s isn't; 5 min late is red, 4 amber; back on time", () => {
  const o = trip("18:54", "18:28", "18:54", "19:27"), f = core.followOption(o, "home", T("18:20"));
  const at = (arr, late = 0) => [trip("18:54", "18:28", "18:54", arr, { t: { arr: T(arr.slice(0, 5)) + (arr.length > 5 ? +arr.slice(6) * 1e3 : 0), arrLate: late } })];
  assert.equal(run(f, T("18:21"), at("19:27:59")).followed.reason, null, "59 s: not a change");
  const sixty = run(f, T("18:21"), at("19:28", 1));
  assert.equal(sixty.arrive, T("19:53"), "60 s: a change"); assert.equal(sixty.followed.reason.text, "Your 18:54 Great Northern is now 1 min late");
  let s = run(f, T("18:22"), at("19:32", 5));
  assert.equal(s.followed.reason.level, "bad", "5 min late: red");
  assert.equal(run(f, T("18:22"), at("19:31", 4)).followed.reason.level, "warn", "4 min: amber");
  s = run(s.followed, T("18:23"), at("19:30", 3));
  assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is now only 3 min late"); assert.equal(s.followed.reason.level, "ok");
  s = run(s.followed, T("18:25"), at("19:27"));
  assert.equal(s.followed.reason.text, "Your 18:54 Great Northern is back on time");
  const early = run(f, T("18:25"), at("19:25"));
  assert.equal(early.followed.reason.text, "Your 18:54 Great Northern is now expected earlier", "never late: not 'back on time'");
  // Already late when you chose it: lateness is counted from there.
  const late = core.followOption(trip("18:54", "18:28", "18:54", "19:30", { t: { arrLate: 3 } }), "home", T("18:20"));
  assert.equal(late.lateMin, 3);
  assert.equal(run(late, T("18:21"), at("19:32", 5)).followed.reason.text, "Your 18:54 Great Northern is now 5 min late");
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
  assert.ok(!core.followHas(none.next, f), "never your own train");
  const left = run(f, T("18:49"), [o54], { trains: [o.train, o54.train] });
  assert.equal(left.state, "missed"); assert.equal(left.followed.reason.text, "You've missed the 18:48 Great Northern");
  assert.equal(run(f, T("18:48") + 25e3, [o54], { trains: [o.train, o54.train] }).state, "on", "within 30 s of leaving: not yet missed");
  // The way on: only trains you can catch; ties on arrival go to the later leave.
  const bad = [trip("18:50", "18:24", "18:50", "19:20", { o: { uncertain: true } }), trip("18:51", "18:25", "18:51", "19:20", { t: { depUnknown: true } }),
    trip("18:52", "18:26", "18:52", "19:20", { o: { missed: true } }), trip("18:58", "18:31", "18:58", "19:30"), trip("18:59", "18:33", "18:59", "19:30")];
  const way = run(f, T("18:49"), bad, { trains: [o.train, ...trainsOf(bad)] });
  assert.equal(way.next.train.std, "18:59", "uncertain, no estimate and walking-time-passed skipped; a tie goes to the later leave");
});

test("Follow: on board the train counts however late you'd be to 'leave'; on a tube, minutes in hand from when it reaches the station", () => {
  const o = trip("18:54", "18:28", "18:54", "19:27"), f = core.followOption(o, "home", T("18:20"));
  const s = core.trackFollowed(f, { now: T("19:00"), trains: [o.train], option: null, options: [], onBoard: true });
  assert.equal(s.state, "on"); assert.equal(s.spareMin, null);
  const gone = trip("18:54", "18:28", "18:54", "19:27", { effort: "none", o: { missed: true } });
  assert.equal(core.trackFollowed(f, { now: T("18:50"), trains: [gone.train], option: gone, options: [gone], onBoard: true }).state, "on", "on board: an option you 'can't make' doesn't matter");
  const sooner = trip("19:00", "18:40", "19:00", "19:15");
  assert.equal(core.trackFollowed(f, { now: T("18:58"), trains: [o.train, sooner.train], option: null, options: [sooner], onBoard: true }).better, null, "never a better option while on the train");
  const tube = (reach) => core.trackFollowed(f, { now: T("18:40"), trains: [o.train], option: o, options: [o], onBoard: false, tube: { reach: T(reach), readyMs: 7 * MIN } });
  assert.equal(tube("18:44").spareMin, 3, "reach 18:44, 7 min to the platform, train 18:54");
  assert.equal(tube("18:47").spareMin, 0); assert.equal(tube("18:47").state, "on", "no time to spare isn't missed");
  assert.equal(tube("18:47").better, null, "never a better option while on a tube");
  const short = tube("18:48");
  assert.equal(short.state, "missed", "a minute short: the connection is lost");
  // The tube speeds up: the old reason is replaced.
  const back = core.trackFollowed(short.followed, { now: T("18:41"), trains: [o.train], option: o, options: [o], onBoard: false, tube: { reach: T("18:45"), readyMs: 7 * MIN } });
  assert.equal(back.followed.reason.text, "You can make the 18:54 Great Northern again");
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

test("Follow: the same train at another station counts (Thameslink at Farringdon, then St Pancras), with shared or separate service IDs; arrived", () => {
  for (const ids of [["TL1", "TL1"], ["TL1", "TL2"]]) {
    const far = trip("18:56", "18:34", "18:56", "19:37", { from: "ZFD", op: "Thameslink", sid: ids[0] });
    const stp = trip("19:01", "18:39", "19:01", "19:37", { from: "STP", op: "Thameslink", sid: ids[1] });
    const f = core.followOption({ ...far, alts: [stp] }, "home", T("18:20"));
    assert.equal(f.calls.length, 2); assert.equal(f.lastDep, T("19:01"));
    // 18:57: Farringdon's call has left; St Pancras's can still be made at a walk.
    const s = core.trackFollowed(f, { now: T("18:57"), trains: [far.train, stp.train], option: stp, options: [stp], onBoard: false });
    assert.equal(s.state, "on", `IDs ${ids}: still on it at St Pancras`); assert.equal(s.train.from, "STP");
    assert.equal(core.trackFollowed(f, { now: T("19:02"), trains: [far.train, stp.train], option: null, options: [], onBoard: false }).state, "missed", "both calls gone");
  }
  const far = trip("18:56", "18:34", "18:56", "19:37", { from: "ZFD", op: "Thameslink", sid: "TL1" }), stp = trip("19:01", "18:39", "19:01", "19:37", { from: "STP", op: "Thameslink", sid: "TL1" });
  assert.equal(core.findTrain([far.train, stp.train], { operator: "Thameslink", std: "19:01", from: "STP", serviceId: "TL1" }), stp.train, "service ID and station first");
  assert.equal(core.findTrain([far.train], { operator: "Thameslink", std: "99:99", from: "X", serviceId: "TL1" }), far.train, "then service ID alone");
  const f = core.followOption(stp, "home", T("18:20"));
  // Home 20:02: arrived after 20:07.
  assert.equal(core.trackFollowed(f, { now: T("20:08"), trains: [stp.train], option: null, options: [], onBoard: false }).state, "arrived");
  assert.equal(core.trackFollowed(f, { now: T("20:06"), trains: [stp.train], option: null, options: [], onBoard: true }).state, "on", "within 5 min of arriving");
  const late = trip("19:01", "18:39", "19:01", "19:50", { from: "STP", op: "Thameslink", sid: "TL1" });
  assert.equal(core.trackFollowed(f, { now: T("20:08"), trains: [late.train], option: null, options: [], onBoard: true }).state, "on", "still on a late train: not arrived");
  assert.equal(core.BETTER_MS, 5 * MIN); assert.equal(core.CHANGE_MS, 60e3);
});
