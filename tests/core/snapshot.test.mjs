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
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, setOff: false, now: at(DAY, "18:00") }), { at: at(DAY, "18:31"), leadMin: 5, cancelled: false, cancelOnExit: null });
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, leadMin: 1, setOff: false, now: at(DAY, "18:00") }), { at: at(DAY, "18:35"), leadMin: 1, cancelled: false, cancelOnExit: null });
  assert.equal(core.leaveAlarm(leave, { enabled: true, leadMin: 0, setOff: false, now: at(DAY, "18:00") }).at, leave);
  // A nonsense lead falls back to the default.
  for (const leadMin of [-1, 61, NaN, "5"]) assert.equal(core.leaveAlarm(leave, { enabled: true, leadMin, setOff: false, now: at(DAY, "18:00") }).leadMin, 5);
  assert.deepEqual(core.leaveAlarm(leave, { enabled: true, setOff: true, now: at(DAY, "18:33") }), { at: at(DAY, "18:31"), leadMin: 5, cancelled: true, cancelOnExit: null });
  assert.equal(core.leaveAlarm(leave, { enabled: true, setOff: false, now: leave + 2 * MIN }).cancelled, false);
  assert.equal(core.leaveAlarm(leave, { enabled: true, setOff: false, now: leave + 2 * MIN + 1 }), null);
  assert.equal(core.leaveAlarm(leave, { enabled: false, setOff: false, now: at(DAY, "18:00") }), null);
  assert.equal(core.leaveAlarm(null, { enabled: true, setOff: false, now: at(DAY, "18:00") }), null);
});

test("Proxy snapshot before you leave: Leave by, the alarm, the train and the door arrival", () => {
  const s = core.proxySnapshot(plan(), {}, tl({ arr: at(DAY, "19:40") }), opts());
  assert.equal(s.source, "proxy"); assert.equal(s.phase, "leave"); assert.equal(s.stale, false);
  assert.deepEqual(s.headline, { label: "Leave by", t: at(DAY, "18:36"), countdown: { step: "leave", ...core.COUNTDOWN_WORDS.leave } });
  assert.deepEqual(s.alarm, { at: at(DAY, "18:31"), leadMin: 5, cancelled: false, cancelOnExit: null });
  // The journey starts at the office: its geofence exit cancels the alarm on the phone (§6.7 rule 3).
  assert.equal(core.proxySnapshot(plan({ startPlace: "office" }), {}, tl(), opts()).alarm.cancelOnExit, "office");
  assert.equal(core.proxySnapshot(plan({ startPlace: "ZFD" }), {}, tl(), opts()).alarm.cancelOnExit, null);
  // Freshness and boarding: stale at data + 3 min; the proxy never confirms boarding.
  assert.equal(s.staleAt, at(DAY, "18:22")); assert.equal(s.confirmed, false);
  assert.equal(core.proxySnapshot(plan(), {}, tl(), opts({ now: dep + 60e3 })).confirmed, false);
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
  assert.equal(s.headline.t, at(DAY, "18:39")); assert.deepEqual(s.status, { level: "bad", text: "No estimate" });
  assert.equal(s.train.expected, null);
  const none = core.proxySnapshot(plan(), {}, null, opts({ dataAt: null }));
  assert.equal(none.headline.t, at(DAY, "18:36")); assert.deepEqual(none.status, { level: "info", text: "No live times" }); assert.equal(none.stale, true);
  assert.equal(none.arrive.t, null);
  // The board failed after a 3-min-late sighting: the last one stands, and says so.
  assert.deepEqual(core.proxySnapshot(plan(), { lastDep: dep + 3 * MIN, lastLate: 3 }, null, opts()).status, { level: "ok", text: "3 min late, last known" });
});

test("Proxy snapshot: on the train it counts to the alighting station, then to the door; cancelled ends it with no alarm", () => {
  const s = core.proxySnapshot(plan(), {}, tl(), opts({ now: dep + MIN }));
  assert.equal(s.phase, "train");
  assert.deepEqual(s.headline, { label: "At Letchworth Garden City", t: at(DAY, "19:40"), countdown: { step: "arrive", ...core.COUNTDOWN_WORDS.arrive } });
  assert.equal(s.alarm, null);
  // The train has gone from the board: the last arrival and platform seen stand.
  const gone = core.proxySnapshot(plan(), { lastDep: dep, lastLate: 0, lastArr: at(DAY, "19:40"), lastPlatform: "4" }, null, opts({ now: dep + 20 * MIN }));
  assert.equal(gone.phase, "train"); assert.equal(gone.headline.t, at(DAY, "19:40")); assert.equal(gone.train.platform, "4");
  // Past the arrival: the walk home, counting to the door.
  const off = core.proxySnapshot(plan(), { lastDep: dep, lastArr: at(DAY, "19:40") }, null, opts({ now: at(DAY, "19:41") }));
  assert.equal(off.phase, "walk-last"); assert.deepEqual(off.headline, { label: "At home", t: at(DAY, "19:52"), countdown: { step: "arrive", ...core.COUNTDOWN_WORDS.arrive } });
  const c = core.proxySnapshot(plan(), {}, tl({ cancelled: true }), opts());
  assert.equal(c.phase, "cancelled"); assert.equal(c.headline.label, "Cancelled"); assert.equal(c.headline.countdown, null);
  assert.equal(c.alarm, null); assert.deepEqual(c.status, { level: "bad", text: "Cancelled" });
  // Going to the office: "At office".
  assert.equal(core.proxySnapshot(plan({ direction: "office" }), {}, tl(), opts()).arrive.label, "At office");
});

test("Evidence: leaving the start's geofence is set off; losing Wi-Fi, other fences and old or future events aren't", () => {
  const start = at(DAY, "18:10"), now = at(DAY, "18:30");
  const exit = (o = {}) => ({ kind: "region", place: "office", event: "exit", at: at(DAY, "18:29"), ...o });
  assert.equal(core.evidenceSetOff(exit(), "office", start, now), true);
  assert.equal(core.evidenceSetOff(exit({ at: start - 60e3 }), "office", start, now), true);
  assert.equal(core.evidenceSetOff(exit({ at: start - 60e3 - 1 }), "office", start, now), false);
  assert.equal(core.evidenceSetOff(exit({ at: now + 60e3 + 1 }), "office", start, now), false);
  assert.equal(core.evidenceSetOff(exit({ event: "enter" }), "office", start, now), false);
  assert.equal(core.evidenceSetOff(exit({ place: "home" }), "office", start, now), false);
  assert.equal(core.evidenceSetOff({ kind: "wifi", place: "none", at: at(DAY, "18:29") }, "office", start, now), false);
  assert.equal(core.evidenceSetOff(exit(), null, start, now), false);
  assert.equal(core.evidenceSetOff(null, "office", start, now), false);
});

test("Evidence: a known Wi-Fi network or entering a fence is a fix at that place; leaving one is no fix", () => {
  const now = at(DAY, "19:55"), places = { home: [51.98, -0.23], office: [51.51, -0.08], LET: [51.98, -0.229] };
  assert.deepEqual(core.evidenceFix({ kind: "wifi", place: "home", at: now - 5e3 }, places, now), { lat: 51.98, lon: -0.23, acc: 50, at: now - 5e3 });
  assert.equal(core.evidenceFix({ kind: "wifi", place: "other", at: now }, places, now), null);
  assert.equal(core.evidenceFix({ kind: "wifi", place: "none", at: now }, places, now), null);
  assert.deepEqual(core.evidenceFix({ kind: "region", place: "LET", event: "enter", at: now }, places, now, 200), { lat: 51.98, lon: -0.229, acc: 200, at: now });
  assert.equal(core.evidenceFix({ kind: "region", place: "LET", event: "exit", at: now }, places, now), null);
  // A place with no coordinates (no home set), or a time from the future: nothing.
  assert.equal(core.evidenceFix({ kind: "wifi", place: "home", at: now }, { office: places.office }, now), null);
  assert.equal(core.evidenceFix({ kind: "wifi", place: "home", at: now + 60e3 + 1 }, places, now), null);
  // Up to a minute ahead (clock skew) is taken, at now.
  assert.equal(core.evidenceFix({ kind: "wifi", place: "home", at: now + 30e3 }, places, now).at, now);
});

test("Snapshot shifted in time keeps every instant in step; what's shown ignores the build time alone", () => {
  const s = core.proxySnapshot(plan(), {}, tl({ platform: "4" }), opts());
  const t = core.shiftSnapshot(s, 3600e3);
  for (const [a, b] of [[t.at, s.at], [t.dataAt, s.dataAt], [t.headline.t, s.headline.t], [t.arrive.t, s.arrive.t], [t.train.scheduled, s.train.scheduled], [t.train.expected, s.train.expected], [t.alarm.at, s.alarm.at]])
    assert.equal(a - b, 3600e3);
  assert.equal(core.snapshotShown({ ...s, at: s.at + 30e3 }), core.snapshotShown(s));
  assert.notEqual(core.snapshotShown(core.proxySnapshot(plan(), {}, tl({ platform: "5" }), opts())), core.snapshotShown(s));
  assert.equal(core.snapshotShown(null), "none");
});

test("Snapshot: only the page confirms boarding; a change of journey or progress is a change even with the same times", () => {
  const base = { now: 0, dataAt: 0, mode: "commute", direction: "home", followId: "f1", phase: "train", headline: { label: "At Letchworth", t: 5e6, step: "arrive" } };
  assert.equal(core.journeySnapshot({ ...base, source: "page", confirmed: true }).confirmed, true);
  assert.equal(core.journeySnapshot({ ...base, source: "proxy", confirmed: true }).confirmed, false);
  const a = core.journeySnapshot({ ...base, source: "page" });
  assert.notEqual(core.snapshotShown({ ...a, followId: "f2" }), core.snapshotShown(a));
  assert.notEqual(core.snapshotShown(core.journeySnapshot({ ...base, source: "page", progress: { next: "Stevenage", stopsToGo: 2 } })), core.snapshotShown(a));
  assert.notEqual(core.snapshotShown(core.journeySnapshot({ ...base, source: "page", confirmed: true })), core.snapshotShown(a));
});
