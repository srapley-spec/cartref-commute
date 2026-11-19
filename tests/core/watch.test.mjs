// Commute watch (#66; Sam, 19 Nov 2026): docs/stories/commute-watch.md. Amber at 15 min later than normal, red beyond
// 45, no trains, every tube line to the stations closed, or a blocking incident notice; one notification per change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train } from "./helpers.mjs";

const DAY = "2026-11-19";   // a Thursday
const T = (hm) => at(DAY, hm);
// Trains home from King's Cross and Farringdon to Letchworth, from 17:00.
const gn = (std, o = {}) => { const dep = T(std); return train({ from: "KGX", to: "LET", std, dep: dep + (o.late || 0) * MIN, arr: dep + 35 * MIN + (o.late || 0) * MIN,
  depLate: o.late || 0, arrLate: o.late || 0, operator: "Great Northern", serviceId: "GN" + std, cancelled: !!o.cancelled, depUnknown: !!o.unknown, arrUnknown: !!o.unknown }); };
const tl = (std, o = {}) => { const dep = T(std); return train({ from: "ZFD", to: "LET", std, dep: dep + (o.late || 0) * MIN, arr: dep + 44 * MIN + (o.late || 0) * MIN,
  depLate: o.late || 0, arrLate: o.late || 0, operator: "Thameslink", serviceId: "TL" + std, cancelled: !!o.cancelled }); };
const boards = (kgx, zfd = [], msgs = []) => ({ "KGX-LET": { services: kgx, msgs }, "ZFD-LET": { services: zfd, msgs: [] }, "STP-LET": { services: [], msgs: [] } });
const line = (id, sev) => ({ id, name: id, statuses: [{ sev, desc: String(sev) }] });

test("Watch windows: weekdays 05:00–10:00 to the office and 15:00–20:00 home; never at weekends or on a bank holiday", () => {
  assert.equal(core.watchWindow(T("04:59")), null);
  assert.deepEqual(core.watchWindow(T("05:00")), { direction: "office", date: DAY, key: `${DAY}-office` });
  assert.equal(core.watchWindow(T("09:59")).direction, "office");
  assert.equal(core.watchWindow(T("10:00")), null);
  assert.equal(core.watchWindow(T("14:59")), null);
  assert.equal(core.watchWindow(T("15:00")).direction, "home");
  assert.equal(core.watchWindow(T("19:59")).direction, "home");
  assert.equal(core.watchWindow(T("20:00")), null);
  assert.equal(core.watchWindow(at("2026-11-21", "07:00")), null, "Saturday");
  assert.equal(core.watchWindow(at("2026-11-22", "16:00")), null, "Sunday");
  assert.equal(core.watchWindow(at("2026-12-25", "07:00")), null, "Christmas Day (a Friday)");
  assert.equal(core.watchWindow(at("2026-12-28", "07:00")), null, "Boxing Day substitute (Monday)");
  assert.equal(core.watchWindow(at("2026-12-29", "07:00")).direction, "office", "an ordinary Tuesday");
});

test("Lateness is how much later you'd get there, not one train: a cancellation with the next train 10 min behind is OK", () => {
  const now = T("17:00");
  const ok = core.watchVerdict("home", boards([gn("17:05"), gn("17:15"), gn("17:35")]), null, now);
  assert.equal(ok.level, "ok"); assert.equal(ok.lateMin, 0);
  const one = core.watchVerdict("home", boards([gn("17:05", { cancelled: true }), gn("17:15"), gn("17:35")]), null, now);
  assert.equal(one.level, "ok", "10 min later than normal"); assert.equal(one.lateMin, 10); assert.equal(one.cancelled, 1);
  // A faster train from another station counts: Farringdon's Thameslink is the earliest arrival.
  const other = core.watchVerdict("home", boards([gn("17:05", { late: 30 })], [tl("17:00")]), null, now);
  assert.equal(other.train.from, "ZFD"); assert.equal(other.lateMin, 4);
});

test("Amber from 15 min later than normal; red beyond 45; red when nothing runs", () => {
  const now = T("17:00");
  assert.equal(core.watchVerdict("home", boards([gn("17:05", { late: 14 })]), null, now).level, "ok");
  const amber = core.watchVerdict("home", boards([gn("17:05", { late: 15 })]), null, now);
  assert.equal(amber.level, "amber"); assert.match(amber.reasons[0], /About 15 min later than normal/);
  assert.equal(core.watchVerdict("home", boards([gn("17:05", { late: 45 })]), null, now).level, "amber");
  assert.equal(core.watchVerdict("home", boards([gn("17:05", { late: 46 })]), null, now).level, "red");
  const none = core.watchVerdict("home", boards([gn("17:05", { cancelled: true }), gn("17:35", { cancelled: true })]), null, now);
  assert.equal(none.level, "red"); assert.match(none.reasons[0], /No trains running: 2 cancelled/);
  assert.equal(core.watchVerdict("home", boards([gn("17:05", { unknown: true })]), null, now).level, "red", "delayed with no estimate, nothing else");
  // A delayed train whose timetable time has passed but which hasn't left still counts as running.
  const due = core.watchVerdict("home", boards([gn("16:55", { late: 20 }), gn("17:25")]), null, now);
  assert.equal(due.train.std, "16:55");
});

test("National Rail's notices: a blocking incident is red at once; a disruption notice explains amber but doesn't raise it", () => {
  const now = T("16:00");
  const red = core.watchVerdict("home", boards([gn("16:05")], [], ["Disruption between Stevenage and Hitchin: overhead line problems. Lines may be blocked."]), null, now);
  assert.equal(red.level, "red"); assert.match(red.reasons.join(" "), /overhead line/);
  assert.equal(core.watchVerdict("home", boards([gn("16:05")], [], ["A person has been hit by a train at Hatfield."]), null, now).level, "red");
  assert.equal(core.watchVerdict("home", boards([gn("16:05")], [], ["Disruption expected until 18:00 due to a signalling fault."]), null, now).level, "ok");
  assert.equal(core.watchVerdict("home", boards([gn("16:05")], [], ["Thameslink: Special Service"]), null, now).level, "ok");
  // Only on your line: King's Cross's board also carries notices for the East Coast further north.
  const corridor = core.profiles.samCommute.corridorPattern;
  assert.equal(core.watchVerdict("home", boards([gn("16:05")], [], ["Lines are blocked between Peterborough and York."]), null, now, undefined, corridor).level, "ok");
  assert.equal(core.watchVerdict("home", boards([gn("16:05")], [], ["Lines are blocked between Stevenage and Hitchin."]), null, now, undefined, corridor).level, "red");
  const explained = core.watchVerdict("home", boards([gn("16:05", { late: 20 })], [], ["Disruption expected until 18:00 due to a signalling fault."]), null, now);
  assert.equal(explained.level, "amber"); assert.match(explained.reasons.join(" "), /signalling fault/);
});

test("The tube to the stations: all three lines closed is red; all three badly disrupted is amber; one line alone, or 'Service Closed' before opening, is nothing", () => {
  const now = T("16:00"), b = boards([gn("16:05")]);
  assert.equal(core.watchVerdict("home", b, [line("circle", 1), line("metropolitan", 2), line("hammersmith-city", 16)], now).level, "red");
  assert.equal(core.watchVerdict("home", b, [line("circle", 6), line("metropolitan", 6), line("hammersmith-city", 7)], now).level, "amber");
  assert.equal(core.watchVerdict("home", b, [line("circle", 3), line("metropolitan", 2), line("hammersmith-city", 5)], now).level, "amber", "part suspended isn't all closed");
  assert.equal(core.watchVerdict("home", b, [line("circle", 2), line("metropolitan", 10), line("hammersmith-city", 10)], now).level, "ok");
  assert.equal(core.watchVerdict("home", b, [line("circle", 9), line("metropolitan", 9), line("hammersmith-city", 9)], now).level, "ok", "Minor Delays");
  // 05:00: TfL reports the tube as "Service Closed" until it opens (independent review, 19 Nov: a red every morning).
  const early = core.watchVerdict("office", { "LET-KGX": { services: [train({ from: "LET", to: "KGX", std: "05:20", dep: at(DAY, "05:20"), arr: at(DAY, "05:55"), operator: "Great Northern" })], msgs: [] } },
    [line("circle", 20), line("metropolitan", 20), line("hammersmith-city", 20)], at(DAY, "05:00"));
  assert.equal(early.level, "ok");
});

test("No board read at all is 'unknown', never 'ok'", () => {
  const v = core.watchVerdict("office", { "LET-KGX": null, "LET-ZFD": null, "LET-STP": null }, null, T("07:00"));
  assert.equal(v.level, "unknown");
});

test("One notification per change: amber once, again on red; a drop counts only after 3 'ok' checks; 'back to normal' only after red; a new window starts again", () => {
  const w = { key: `${DAY}-home`, direction: "home" }, now = T("17:00");
  const v = (late, cancelled) => core.watchVerdict("home", boards(cancelled ? [gn("17:05", { cancelled: true })] : [gn("17:05", { late })]), null, now);
  let s = core.watchStep(null, w, v(0), now);
  assert.equal(s.notice, null);
  s = core.watchStep(s.state, w, v(20), now);
  assert.equal(s.notice.title, "Commute: delays on the way home"); assert.match(s.notice.body, /About 20 min later than normal.*17:05 from KGX, arriving 18:00/);
  assert.equal(s.notice.kind, "watch");
  assert.equal(core.watchStep(s.state, w, v(25), now).notice, null, "still amber: quiet");
  s = core.watchStep(s.state, w, v(0, true), now);
  assert.equal(s.notice.title, "Commute: disruption on the way home"); assert.match(s.notice.body, /head home now/);
  assert.equal(core.watchStep(s.state, w, { ...v(0), level: "unknown" }, now).notice, null, "a feed failing isn't news");
  assert.equal(core.watchStep(s.state, w, { ...v(0), level: "unknown" }, now).state.level, "red", "and doesn't forget the red");
  // Clearing: three 'ok' checks in a row, then "back to normal".
  let c = s;
  for (let i = 1; i < core.WATCH_CLEAR_CHECKS; i++) { c = core.watchStep(c.state, w, v(0), now); assert.equal(c.notice, null, `ok check ${i}: not yet`); }
  c = core.watchStep(c.state, w, v(0), now);
  assert.equal(c.notice.title, "Commute: back to normal home");
  assert.equal(c.state.level, "ok");
  // Amber clearing is quiet.
  let a = core.watchStep(null, w, v(20), now);
  for (let i = 0; i < core.WATCH_CLEAR_CHECKS; i++) { a = core.watchStep(a.state, w, v(0), now); assert.equal(a.notice, null); }
  assert.equal(a.state.level, "ok");
  // The morning's red doesn't silence the afternoon.
  const morning = { key: `${DAY}-office`, level: "red" };
  assert.ok(core.watchStep(morning, w, v(20), now).notice);
  const am = core.watchStep(null, { key: `${DAY}-office`, direction: "office" }, core.watchVerdict("office", { "LET-KGX": { services: [], msgs: ["Lines are blocked between Hitchin and Stevenage."] } }, null, T("07:00")), T("07:00"));
  assert.equal(am.notice.title, "Commute: consider working from home");
  assert.doesNotMatch(am.notice.body, /head home/, "the morning doesn't say head home");
});

test("No flapping: lateness stepping 14/15/14/15 and 46/44/46/44 sends one amber and one red", () => {
  const w = { key: `${DAY}-home`, direction: "home" }, now = T("17:00");
  const v = (late) => core.watchVerdict("home", boards([gn("17:05", { late })]), null, now);
  let st = null, sent = [];
  for (const late of [14, 15, 14, 15, 14, 15, 46, 44, 46, 44, 46]) { const r = core.watchStep(st, w, v(late), now); st = r.state; if (r.notice) sent.push(r.notice.title); }
  assert.deepEqual(sent, ["Commute: delays on the way home", "Commute: disruption on the way home"]);
});

test("Trains stuck at 'Delayed' past their time aren't forgotten; a timetable train due already doesn't make 'normal' unreachable", () => {
  const now = T("17:00");
  // 16:35 and 16:50 'Delayed' with no estimate; the 17:05 and 17:20 not yet updated by Darwin.
  const stuck = core.watchVerdict("home", boards([gn("16:35", { unknown: true }), gn("16:50", { unknown: true }), gn("17:05"), gn("17:20")]), null, now);
  assert.equal(stuck.level, "amber"); assert.equal(stuck.stuck, 2); assert.match(stuck.reasons.join(" "), /2 trains delayed with no estimate/);
  // Only past-due 'Delayed' trains: nothing has a time.
  assert.equal(core.watchVerdict("home", boards([gn("16:05", { unknown: true }), gn("16:35", { unknown: true }), gn("16:50", { unknown: true })]), null, now).level, "red");
  // A 16:50 running 20 late and the 17:20 on time: normal is the 17:20's timetable (the 16:50's is gone).
  const due = core.watchVerdict("home", boards([gn("16:50", { late: 20 }), gn("17:20")]), null, now);
  assert.equal(due.level, "ok"); assert.equal(due.lateMin, 0);
  // Only late trains past their time, nothing in the timetable after now: the best train's own lateness.
  const late = core.watchVerdict("home", boards([gn("16:30", { late: 80 }), gn("16:45", { late: 80 })]), null, now);
  assert.equal(late.level, "red"); assert.equal(late.lateMin, 80);
});

test("Boards read but no train listed is 'unknown', not 'ok'; 'unable to run' is red", () => {
  const now = T("17:00");
  assert.equal(core.watchVerdict("home", boards([]), null, now).level, "unknown");
  assert.equal(core.watchVerdict("home", boards([], [], ["Trains are unable to run between Hitchin and Stevenage."]), null, now, undefined, core.profiles.samCommute.corridorPattern).level, "red");
});

test("The same train on two boards is counted once", () => {
  const now = T("16:00"), dep = T("16:10");
  const atZfd = train({ from: "ZFD", to: "LET", std: "16:10", dep, arr: T("16:55"), operator: "Thameslink", serviceId: "A1@ZFD", cancelled: true });
  const atStp = train({ from: "STP", to: "LET", std: "16:14", dep: dep + 4 * MIN, arr: T("16:55"), operator: "Thameslink", serviceId: "A1@STP", cancelled: true });
  const v = core.watchVerdict("home", { "ZFD-LET": { services: [atZfd, gn("16:20")], msgs: [] }, "STP-LET": { services: [atStp], msgs: [] } }, null, now);
  assert.equal(v.cancelled, 1);
});

test("Notices that aren't a blocking incident on your line now: planned works, other routes from the London terminals, facilities, cleared", () => {
  const now = T("16:00"), corridor = core.profiles.samCommute.corridorPattern;
  const lvl = (msg) => core.watchVerdict("home", boards([gn("16:05")], [], [msg]), null, now, undefined, corridor).level;
  for (const msg of [
    "Engineering works: on Sunday 22 November no trains will run between Hitchin and Stevenage.",
    "Southeastern high speed services from London St Pancras International are suspended.",
    "Disruption between London St Pancras International and Bedford: overhead electric wires have been damaged.",
    "Trains between London Kings Cross and Edinburgh may be cancelled: a person has been hit by a train between Newcastle and Morpeth.",
    "Step-free access at Farringdon is suspended: the lift is out of order.",
    "Following a person being hit by a train earlier today at Hatfield all lines have now reopened.",
  ]) assert.equal(lvl(msg), "ok", msg);
  assert.equal(lvl("A person has been hit by a train between Hatfield and Welwyn Garden City. Lines are blocked."), "red");
  assert.equal(lvl("Overhead line problems between Stevenage and Hitchin."), "red");
});

test("Re-review (19 Nov): a blocking phrase wins over other words; stretches count only when both ends are on your line", () => {
  const now = T("17:00"), corridor = `${core.profiles.samCommute.corridorPattern}|ashwell|royston|cambridge`;
  const lvl = (msg) => core.watchVerdict("home", boards([gn("17:05")], [], [msg]), null, now, undefined, corridor).level;
  for (const msg of [
    "Lines have now been blocked between Hitchin and Stevenage due to a person being hit by a train.",
    "A person has been hit by a train between Hitchin and Stevenage. Lines are blocked until the emergency services have cleared the area.",
    "Overrunning engineering works between Hitchin and Stevenage mean all lines are blocked.",
    "Disruption between Hatfield and Stevenage on Thursday 19 November: overhead line damage. Lines are blocked.",
    "Emergency services have been called to Welwyn North; lines are blocked. Lifts at Welwyn Garden City are also out of use.",
    "Earlier today a train hit an obstruction at Knebworth; lines are blocked while it is inspected.",
    "Lines are blocked between Hitchin and Cambridge.",
  ]) assert.equal(lvl(msg), "red", msg);
  for (const msg of [
    "Disruption between Alexandra Palace and Hertford North: lines are blocked.",
    "Lines are blocked between Hitchin and Peterborough due to overhead line damage.",
    "Trains between London Kings Cross and Peterborough via Stevenage may be cancelled: a person has been hit by a train between Huntingdon and Peterborough.",
    "Disruption between Hatfield and Stevenage on Saturday 21 November: planned engineering. Lines are blocked.",
    "Lines between Hitchin and Stevenage have now reopened.",
  ]) assert.notEqual(lvl(msg), "red", msg);
});

test("Re-review (19 Nov): one train on two morning boards counts once; one stuck train, or a 'Delayed' blip at departure, is not amber", () => {
  const now = T("07:45");
  const tlam = (from, to, o = {}) => train({ from, to, std: "07:40", dep: T("07:40"), arr: to === "ZFD" ? T("08:25") : T("08:20"), operator: "Thameslink", serviceId: `X@${to}`, ...o });
  const gnam = train({ from: "LET", to: "KGX", std: "08:05", dep: T("08:05"), arr: T("08:40"), operator: "Great Northern" });
  const am = (o) => ({ "LET-ZFD": { services: [tlam("LET", "ZFD", o)], msgs: [] }, "LET-STP": { services: [tlam("LET", "STP", o)], msgs: [] }, "LET-KGX": { services: [gnam], msgs: [] } });
  const late = core.watchVerdict("office", am({ depUnknown: true, arrUnknown: true }), null, T("07:55"));
  assert.equal(late.stuck, 1); assert.equal(late.level, "ok");
  const off = core.watchVerdict("office", am({ cancelled: true }), null, now);
  assert.equal(off.cancelled, 0, "(already due: not counted as a cancellation ahead)");
  const cx = core.watchVerdict("office", am({ cancelled: true }), null, T("07:30"));
  assert.equal(cx.cancelled, 1);
  // 16:58 and 16:59 'Delayed' at 17:00: Darwin's blip around departure, not stuck.
  assert.equal(core.watchVerdict("home", boards([gn("16:58", { unknown: true }), gn("16:59", { unknown: true }), gn("17:05")]), null, T("17:00")).level, "ok");
  // Arrival-only "Delayed" counts as stuck.
  const arrOnly = (std) => ({ ...gn(std), arrUnknown: true });
  assert.equal(core.watchVerdict("home", boards([arrOnly("16:35"), arrOnly("16:45"), gn("17:05")]), null, T("17:00")).stuck, 2);
});

test("Re-review (19 Nov): the tube part suspended on all three lines is amber, not red; 'ok' must hold 3 checks in a row", () => {
  const b = boards([gn("16:05")]);
  assert.equal(core.watchVerdict("home", b, [line("circle", 3), line("metropolitan", 3), line("hammersmith-city", 3)], T("16:00")).level, "amber");
  const w = { key: `${DAY}-home`, direction: "home" }, now = T("17:00");
  const v = (late) => core.watchVerdict("home", boards([gn("17:05", { late })]), null, now);
  let st = null, sent = [];
  for (const late of [50, 0, 0, 20, 0, 0]) { const r = core.watchStep(st, w, v(late), now); st = r.state; if (r.notice) sent.push(r.notice.title); }
  assert.deepEqual(sent, ["Commute: disruption on the way home"], "the amber broke the run: no all-clear yet");
  const r = core.watchStep(st, w, v(0), now);
  assert.equal(r.notice.title, "Commute: back to normal home");
});

test("Final re-check (19 Nov): a station of yours outside a stretch counts; a follow-on day isn't another day; London-only and facility notices aren't red", () => {
  const now = T("17:00"), corridor = `${core.profiles.samCommute.corridorPattern}|ashwell|royston|cambridge`;
  const lvl = (msg) => core.watchVerdict("home", boards([gn("17:05")], [], [msg]), null, now, undefined, corridor).level;
  for (const msg of [
    "Disruption between London Kings Cross and Peterborough. A person has been hit by a train at Hatfield.",
    "Lines are blocked at Stevenage. Disruption is expected between now and the end of the day.",
    "Lines are blocked between Hitchin and Stevenage due to damaged overhead wires. Disruption is expected to continue on Friday.",
    "Lines are blocked between Hitchin and Stevenage. Disruption may continue this weekend.",
    "Planned engineering works between Hitchin and Stevenage have overrun: lines are blocked.",
  ]) assert.equal(lvl(msg), "red", msg);
  for (const msg of [
    "Lines are blocked between London St Pancras and Farringdon.",
    "Step-free access at Stevenage is suspended.",
  ]) assert.notEqual(lvl(msg), "red", msg);
});

test("Final re-check (19 Nov): of two copies of one morning train, the one that runs counts (cancelled at Farringdon, running to St Pancras)", () => {
  const now = T("07:00");
  const tl = (to, std, o = {}) => train({ from: "LET", to, std, dep: T(std), arr: T(std) + (to === "ZFD" ? 45 : 40) * MIN, operator: "Thameslink", ...o });
  const gnm = (std) => train({ from: "LET", to: "KGX", std, dep: T(std), arr: T(std) + 35 * MIN, operator: "Great Northern" });
  const v = core.watchVerdict("office", {
    "LET-ZFD": { services: [tl("ZFD", "07:05", { cancelled: true }), tl("ZFD", "07:35", { cancelled: true })], msgs: [] },
    "LET-STP": { services: [tl("STP", "07:05"), tl("STP", "07:35")], msgs: [] },
    "LET-KGX": { services: [gnm("07:25"), gnm("07:50")], msgs: [] } }, null, now);
  assert.equal(v.cancelled, 0); assert.equal(v.train.to, "STP"); assert.equal(v.level, "ok");
});

test("Last pass (19 Nov): East Coast notices that mention your stations as calling points or diversions aren't red", () => {
  const now = T("17:00"), corridor = `${core.profiles.samCommute.corridorPattern}|ashwell|royston|cambridge`;
  const lvl = (msg) => core.watchVerdict("home", boards([gn("17:05")], [], [msg]), null, now, undefined, corridor).level;
  for (const msg of [
    "Lines are blocked between Newcastle and Morpeth. LNER trains to Edinburgh will not call at Stevenage.",
    "Trains between London Kings Cross and Leeds, calling at Stevenage, may be cancelled: a person has been hit by a train between Doncaster and Wakefield.",
    "Lines are blocked between Peterborough and Grantham. Hull Trains services will start from Stevenage.",
    "A person has been hit by a train between Doncaster and Retford. LNER tickets are accepted on Great Northern services from Stevenage and Hitchin.",
    "Overhead line damage between York and Darlington. Customers at Stevenage should use the next available train.",
    "Lines are blocked between Peterborough and York. Trains towards York will run fast from Stevenage.",
    "Lines are blocked between Ely and King's Lynn. Trains from Cambridge to King's Lynn may be cancelled.",
    "Lines are blocked between Peterborough and York, and LNER trains will be terminated at Stevenage.",
    "A person has been hit by a train at Huntingdon; the next train only stops at Stevenage.",
    "Overhead line damage between York and Darlington: LNER trains will turn back at Stevenage.",
  ]) assert.notEqual(lvl(msg), "red", msg);
  assert.equal(lvl("A person has been hit by a train in the Stevenage area."), "red");
  assert.equal(lvl("Disruption in the Hitchin area: lines are blocked."), "red");
  assert.equal(lvl("Disruption between London Kings Cross and Peterborough. A person has been hit by a train at Hatfield."), "red");
  assert.equal(lvl("Lines are blocked at Stevenage. Disruption is expected between now and the end of the day."), "red");
  assert.equal(lvl("Emergency services have been called to Welwyn North; lines are blocked. Lifts at Welwyn Garden City are also out of use."), "red");
});
