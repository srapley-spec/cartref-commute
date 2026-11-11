// The 11 Nov 2026 retest (issue #57, comment "Retest, 11 Nov morning"): the warning ladder (R2), the train you picked
// holding (R1), the agreed question wording, the Thameslink note, the pick-up zone for a known train.
// Stories: docs/stories/effort-levels.md, follow-a-route.md, which-train.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, train, MIN, at } from "./helpers.mjs";

const EP = { runFactor: 1.8, runKm: 0.4, walkKmh: 5, carFromHomeSecs: 240, cabWaitSecs: 600, cabKmh: 20, stickMs: 30e3 };
const now = at("2026-11-03", "07:16"), S = 1000;
// A 10-minute walk away from home plus 3 minutes of station allowances (getting in, the catch margin).
// Running needs 180 + (492 − 236.16 + 160) = 595.84 s; without the 2 minutes of slack, 475.84 s.
const AWAY = { walk: 600, walkAvg: 600, walkFast: 492, fixed: 180, home: false };
let k = 0;
const opt = (availS, access = AWAY) => {
  const dep = now + 30 * S + availS * S;
  const t = train({ from: "RVS", to: "CEN", dep, arr: dep + 30 * MIN, std: `T${++k}` });
  return { hub: "CEN", train: t, leave: dep - (access.walk + access.fixed) * S, arrive: t.arr, flags: [], access };
};
const grade = (o, atStation = null) => core.gradeEffort([o], now, EP, atStation, (x) => x.train.from, () => true)[0];

test("'Can't make it' only when even running, eating into 2 minutes of the station allowances, misses: otherwise 'Very tight · run'", () => {
  assert.equal(core.RUN_SLACK_MS, 120e3);
  const tight = grade(opt(500));
  assert.equal(tight.effort, "run", "595.84 s needed, 500 s in hand: running eats into the allowances, so run");
  assert.equal(tight.tight, true); assert.equal(tight.missed, true, "still harder than a fast walk: never the top recommendation");
  assert.ok(tight.flags.some((f) => f.txt === "Run") && !tight.flags.some((f) => /Can't make it|Car needed/.test(f.txt)));
  assert.equal(grade(opt(476)).effort, "run", "476 s: just enough without the slack");
  const gone = grade(opt(470));
  assert.equal(gone.effort, "none", "470 s: even that misses"); assert.equal(gone.tight, false);
  assert.ok(gone.flags.some((f) => f.txt === "Can't make it"));
  assert.equal(grade(opt(600)).effort, "run", "a plain run, as before"); assert.equal(grade(opt(600)).tight, false);
  // Only up to the allowances there are: with none, there is no slack to eat into.
  assert.equal(grade(opt(450, { ...AWAY, fixed: 0, walk: 700, walkAvg: 700, walkFast: 574 })).effort, "none", "running needs 497.84 s, 450 in hand, no allowances to eat into");
  // At home your own car is real: "car" stays.
  assert.equal(grade(opt(450, { ...AWAY, home: true })).effort, "car", "your car: 180 + 240 s");
  // At the station the train leaves from, the station rule decides (walk or none), as before.
  assert.equal(grade(opt(10), "RVS").effort, "none");
  assert.equal(core.runWithoutSlack({ train: { dep: now + 600e3 } }, now, EP), false, "no access: no claim");
});

// Following, on the way to the station (not there yet).
const t = at("2026-11-03", "07:00"), DEP = t + 30 * MIN;
function fopt(extra = {}, trainExtra = {}) {
  return { hub: "CEN", leave: t + 9 * MIN, arrive: t + 87 * MIN, flags: [], effort: "walk",
    train: train({ from: "RVS", to: "CEN", std: "07:30", dep: DEP, arr: t + 63 * MIN, serviceId: "chosen", ...trainExtra }),
    legs: [{ t: t + 9 * MIN, d: "Leave home" }, { t: DEP, d: "Train", train: true }, { t: t + 63 * MIN, d: "Arrive Central" }, { t: t + 87 * MIN, d: "Arrive office" }], ...extra };
}
const later = { ...fopt({ effort: "walk", leave: t + 24 * MIN, arrive: t + 114 * MIN }, { std: "07:45", dep: t + 45 * MIN, arr: t + 90 * MIN, serviceId: "later" }) };
const start = () => core.startFollowRoute(fopt(), { now: t, direction: "office", mode: "commute" });
const upd = (r, sel, extra = {}) => core.updateFollowRoute(r, { now: t + 16 * MIN, options: [sel, later], availableOptions: [sel, later], dataFresh: true, hasReliableLocation: true, phase: "before-train", ...extra });

test("The ladder on the followed card: 'Tight · walk fast', 'Very tight · run' with the next train, 'Can't make it' only from 'none'", () => {
  const r = start();
  const fast = upd(r, fopt({ effort: "fast", missed: false }));
  assert.equal(fast.status, "hurry"); assert.equal(fast.level, "warn"); assert.equal(fast.text, "Tight · walk fast");
  assert.equal(fast.ifMissed, null, "walking fast still makes it: no 'if you miss it'");
  const run = upd(r, fopt({ effort: "run", missed: true, tight: true }));
  assert.equal(run.status, "hurry"); assert.equal(run.text, "Very tight · run");
  assert.deepEqual(run.ifMissed, { std: "07:45", arrive: t + 114 * MIN });
  assert.doesNotMatch(run.text, /behind/, "no 'N min behind' beside a Leave by that says otherwise");
  assert.equal(upd(r, fopt({ effort: "run" }), { availableOptions: [fopt({ effort: "run" })], options: [fopt({ effort: "run" })] }).ifMissed, null, "no later train: nothing to offer");
  const none = upd(r, fopt({ effort: "none", missed: true }));
  assert.equal(none.status, "missed"); assert.match(none.text, /You can no longer make your 07:30/);
});

test("The 'you confirmed' acknowledgement goes after 2 minutes, and once off the train", () => {
  const r = core.confirmFollowBoarding(start(), t + 31 * MIN);
  const has = (u) => u.route.notices.some((n) => n.id.endsWith("|recovered|boarding"));
  const soon = core.updateFollowRoute(r, { now: t + 32 * MIN, options: [fopt()], dataFresh: true, phase: r.phase });
  assert.equal(has(soon), true, "a minute on: still there");
  assert.equal(has(core.updateFollowRoute(soon.route, { now: t + 33 * MIN + 1, options: [fopt()], dataFresh: true, phase: r.phase })), false, "after 2 minutes: gone");
  assert.equal(has(core.updateFollowRoute({ ...r, phase: "after-train" }, { now: t + 32 * MIN, options: [fopt()], dataFresh: true, phase: "after-train" })), false, "off the train: gone");
});

test("A train you picked that isn't among the departures just now stays picked (no new guess in its place)", () => {
  const sam = core.profiles.samCommute, here = sam.stationGeo.HIT || [51.9531, -0.2633];
  const lock = { operator: "Great Northern", std: "07:30", from: "LET", picked: true, at: t };
  const r = core.whichTrain({}, here, "office", t + 40 * MIN, lock, {}, sam);
  assert.deepEqual(r.lock, lock, "the pick is kept");
  assert.equal(r.result.none, true, "and nothing else is claimed in its place");
});

test("The agreed question when your position fits another train better (Sam, 11 Nov): no station to point at", () => {
  assert.equal(core.wrongTrainQuestion("07:30 Great Northern", {}, "07:38 Great Northern"),
    "You picked the 07:30 Great Northern, but your position fits the 07:38 Great Northern better. Still on the 07:30 Great Northern?");
  assert.match(core.wrongTrainQuestion("07:30 Great Northern", { contradiction: { kind: "behind-you", name: "Welwyn Garden City", t: at("2026-11-03", "07:45") } }, "07:38 Great Northern"),
    /^You've passed Welwyn Garden City; the 07:30 Great Northern isn't due there until 07:45\. Which train are you on\?$/, "a station to point at keeps Monday's wording");
  assert.match(core.wrongTrainQuestion("07:30 Great Northern", {}), /doesn't match where you are\. Which train are you on\?$/);
});

test("Thameslink trains only: 'Thameslink: first class at the rear is open to standard tickets.'", () => {
  assert.equal(core.thameslinkNote("Thameslink"), "Thameslink: first class at the rear is open to standard tickets.");
  for (const op of ["Great Northern", "", null, undefined, "LNER"]) assert.equal(core.thameslinkNote(op), null, String(op));
});

test("A known train is picked up on the first stretch from Letchworth: from 300 m out and within 600 m of the track", () => {
  const sam = core.profiles.samCommute, L = sam.lines.KGX, t0 = at("2026-11-03", "07:34");
  const total = core.lineLengthKm(L);
  // About 1 km out from Letchworth along the drawn line, then 0.0045° north (≈ 500 m; the line runs west-south-west there).
  const seg = L.slice(1).map((q, i) => core.km(L[i], q));
  let d = 1, i = 0; while (d > seg[i]) { d -= seg[i]; i++; }
  const f = d / seg[i], on = [L[i][0] + (L[i + 1][0] - L[i][0]) * f, L[i][1] + (L[i + 1][1] - L[i][1]) * f];
  const off = [on[0] + 0.0045, on[1]], fix = { here: off, acc: 15, at: t0 };
  const pr = core.lineProgress(off, L);
  assert.ok(pr.frac > 0.005 && pr.frac <= 0.1 && pr.offKm > 0.3 && pr.offKm < 0.6, `the case: ${JSON.stringify(pr)} of ${total} km`);
  assert.equal(core.trackLine(null, fix, 20, null, L).onLine, false, "unknown train: by the track only (300 m)");
  assert.equal(core.trackLine(null, fix, 20, null, L, true).onLine, true, "a known train: 600 m");
});
