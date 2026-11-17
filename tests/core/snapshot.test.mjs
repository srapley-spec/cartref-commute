// Engine: the journey snapshot for the iPhone app's Live Activity, leave alarm and Siri (docs/ios-app.md §6.1,
// docs/stories/ios-app.md). Numbers worked out by hand from the 17 Nov evening: the 18:56 Thameslink from Farringdon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train } from "./helpers.mjs";

const DAY = "2026-11-17";
const dep = at(DAY, "18:56");
const tl = (o = {}) => train({ from: "ZFD", to: "LET", std: "18:56", dep, arr: at(DAY, "19:40"), operator: "Thameslink", serviceId: "S1856", platform: null, ...o });
// Leave the office 18:36 (20 min before the train: 18 min of walk and tube, then a 2-min margin on the platform).
const plan = (o = {}) => ({ v: 1, followId: "f9", serviceId: "S1856", from: "ZFD", to: "LET", std: "18:56", operator: "Thameslink",
  dep, leaveBy: at(DAY, "18:36"), leadMs: 20 * MIN, train: "the 18:56 from Farringdon",
  mode: "commute", direction: "home", fromName: "Farringdon", toName: "Letchworth Garden City", marginMs: 2 * MIN, afterMs: 12 * MIN, ...o });
const opts = (o = {}) => ({ now: at(DAY, "18:20"), dataAt: at(DAY, "18:19"), setOff: false, alarm: { enabled: true, leadMin: 5 }, ...o });

test("Countdown words: one set, shared by the card and the native surfaces", () => {
  assert.deepEqual(Object.keys(core.COUNTDOWN_WORDS).sort(), ["arrive", "leave", "next", "platform"]);
  assert.equal(core.COUNTDOWN_WORDS.leave.urgent, "Leave now");
  assert.equal(core.COUNTDOWN_WORDS.platform.calm, "on the platform in");
});

test("Snapshot: version, stale after 3 minutes, no data is stale, deep link from the followed journey", () => {
  const now = at(DAY, "18:20");
  const base = { now, source: "page", mode: "commute", direction: "home", followId: "f 9", phase: "leave", headline: { label: "Leave by", t: at(DAY, "18:36"), step: "leave" } };
  const s = core.journeySnapshot({ ...base, dataAt: now - 3 * MIN });
  assert.equal(s.v, 1); assert.equal(s.at, now); assert.equal(s.stale, false);
  assert.deepEqual(s.headline.countdown, { step: "leave", calm: "leave in", urgent: "Leave now", passed: "leave time passed" });
  assert.equal(s.deepLink, "commute://follow/f%209");
  assert.equal(core.journeySnapshot({ ...base, dataAt: now - 3 * MIN - 1 }).stale, true);
  assert.equal(core.journeySnapshot({ ...base, dataAt: null }).stale, true);
  // No step (e.g. "Now"): no countdown; an unknown time is null, never NaN.
  const none = core.journeySnapshot({ ...base, dataAt: now, headline: { label: "Now", t: NaN, step: "" } });
  assert.equal(none.headline.countdown, null); assert.equal(none.headline.t, null);
  assert.equal(core.journeySnapshot({ ...base, followId: null }).deepLink, null);
  // Progress line built from its parts when not given; none without parts.
  assert.equal(core.journeySnapshot({ ...base, progress: { next: "St Pancras", stopsToGo: 3 } }).progress.line, "Next: St Pancras · 3 stops");
  assert.equal(core.journeySnapshot({ ...base, progress: { next: null, stopsToGo: 1 } }).progress.line, "1 stop");
  assert.equal(core.journeySnapshot({ ...base, progress: {} }).progress, null);
});

test("Platform label: names the platform once it's announced, the station always", () => {
  assert.equal(core.platformLabelText("4", "Farringdon"), "Be on platform 4 at Farringdon by");
  assert.equal(core.platformLabelText(null, "Farringdon"), "Be on the platform at Farringdon by");
  assert.equal(core.platformLabelText("", null), "Be on the platform by");
});

test("Leave alarm: lead before leave time (5 min default), cancelled once set off, gone 2 min after a missed leave time", () => {
  const leave = at(DAY, "18:36");
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, setOff: false, now: at(DAY, "18:00") }), { at: at(DAY, "18:31"), leadMin: 5, cancelled: false });
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, leadMin: 1, setOff: false, now: at(DAY, "18:00") }), { at: at(DAY, "18:35"), leadMin: 1, cancelled: false });
  assert.equal(core.leaveAlarm(leave, { enabled: true, leadMin: 0, setOff: false, now: at(DAY, "18:00") }).at, leave);
  // A nonsense lead falls back to the default.
  for (const leadMin of [-1, 61, NaN, "5"]) assert.equal(core.leaveAlarm(leave, { enabled: true, leadMin, setOff: false, now: at(DAY, "18:00") }).leadMin, 5);
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, setOff: true, now: at(DAY, "18:33") }), { at: at(DAY, "18:31"), leadMin: 5, cancelled: true });
  assert.equal(core.leaveAlarm(leave, { enabled: true, setOff: false, now: leave + 2 * MIN }).cancelled, false);
  assert.equal(core.leaveAlarm(leave, { enabled: true, setOff: false, now: leave + 2 * MIN + 1 }), null);
  assert.equal(core.leaveAlarm(leave, { enabled: false, setOff: false, now: at(DAY, "18:00") }), null);
  assert.equal(core.leaveAlarm(null, { enabled: true, setOff: false, now: at(DAY, "18:00") }), null);
});

test("Proxy snapshot before you leave: Leave by, the alarm, the train and the door arrival", () => {
  const s = core.proxySnapshot(plan(), {}, tl({ arr: at(DAY, "19:40") }), opts());
  assert.equal(s.source, "proxy"); assert.equal(s.phase, "leave"); assert.equal(s.stale, false);
  assert.deepEqual(s.headline, { label: "Leave by", t: at(DAY, "18:36"), countdown: { step: "leave", ...core.COUNTDOWN_WORDS.leave } });
  assert.deepEqual(s.alarm, { at: at(DAY, "18:31"), leadMin: 5, cancelled: false });
  assert.deepEqual(s.arrive, { label: "At home", t: at(DAY, "19:52") });
  assert.deepEqual(s.train, { name: "18:56 Thameslink", from: "Farringdon", to: "Letchworth Garden City", platform: null, scheduled: dep, expected: dep, late: 0 });
  assert.deepEqual(s.status, { level: "ok", text: "On time" });
  // Alarm off in Settings: none.
  assert.equal(core.proxySnapshot(plan(), {}, tl(), opts({ alarm: { enabled: false } })).alarm, null);
});

test("Proxy snapshot, train 7 min late: Leave by and the alarm move with it; the platform time keeps the timetable", () => {
  const late = tl({ dep: dep + 7 * MIN, depLate: 7, arr: at(DAY, "19:47"), platform: "4" });
  const s = core.proxySnapshot(plan(), {}, late, opts());
  assert.equal(s.headline.t, at(DAY, "18:43")); assert.equal(s.alarm.at, at(DAY, "18:38"));
  assert.equal(s.train.scheduled, dep); assert.equal(s.train.expected, dep + 7 * MIN); assert.equal(s.train.late, 7); assert.equal(s.train.platform, "4");
  assert.deepEqual(s.status, { level: "warn", text: "7 min late" });
  // Set off (the app said so): the platform at the timetable time less the margin (18:54), not 19:01 (Sam, 17 Nov).
  const off = core.proxySnapshot(plan(), {}, late, opts({ now: at(DAY, "18:45"), setOff: true }));
  assert.equal(off.phase, "platform");
  assert.equal(off.headline.label, "Be on platform 4 at Farringdon by");
  assert.equal(off.headline.t, at(DAY, "18:54"));
  assert.equal(off.headline.countdown.step, "platform");
  assert.equal(off.alarm.cancelled, true);
  // Past the margin: the timetable time; past that, the expected departure.
  assert.equal(core.proxySnapshot(plan(), {}, late, opts({ now: at(DAY, "18:55"), setOff: true })).headline.t, dep);
  assert.equal(core.proxySnapshot(plan(), {}, late, opts({ now: at(DAY, "18:57"), setOff: true })).headline.t, dep + 7 * MIN);
});

test("Proxy snapshot: no live estimate keeps the last one seen; none at all is the plan, said so", () => {
  const s = core.proxySnapshot(plan(), { lastDep: dep + 3 * MIN, lastLate: 3 }, tl({ depUnknown: true }), opts());
  assert.equal(s.headline.t, at(DAY, "18:39")); assert.deepEqual(s.status, { level: "warn", text: "Delayed, no estimate" });
  assert.equal(s.train.expected, null);
  const none = core.proxySnapshot(plan(), {}, null, opts({ dataAt: null }));
  assert.equal(none.headline.t, at(DAY, "18:36")); assert.deepEqual(none.status, { level: "ok", text: "No live times" }); assert.equal(none.stale, true);
  assert.equal(none.arrive.t, null);
});

test("Proxy snapshot: on the train it counts to the alighting station; cancelled ends it with no alarm", () => {
  const s = core.proxySnapshot(plan(), {}, tl(), opts({ now: dep + MIN }));
  assert.equal(s.phase, "train");
  assert.deepEqual(s.headline, { label: "At Letchworth Garden City", t: at(DAY, "19:40"), countdown: { step: "arrive", ...core.COUNTDOWN_WORDS.arrive } });
  assert.equal(s.alarm, null);
  const c = core.proxySnapshot(plan(), {}, tl({ cancelled: true }), opts());
  assert.equal(c.phase, "cancelled"); assert.equal(c.headline.label, "Cancelled"); assert.equal(c.headline.countdown, null);
  assert.equal(c.alarm, null); assert.deepEqual(c.status, { level: "bad", text: "Cancelled" });
  // Going to the office: "At office".
  assert.equal(core.proxySnapshot(plan({ direction: "office" }), {}, tl(), opts()).arrive.label, "At office");
});
