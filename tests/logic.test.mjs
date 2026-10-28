// Journey logic: times, delays, cancellations, door-to-door maths, flags and warnings.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, at, hm, closeAll } from "./harness.mjs";

let app, c;
before(async () => { app = await createApp({ settings: { provider: "demo" } }); c = app.c; });
after(closeAll);

const MIN = 60e3;
// Values made inside the page come from another JS realm; compare them as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false,
  platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
function useBoards(boards, saved = {}) {
  c.state.boards = boards; c.state.status = []; c.state.nrStatus = [];
  Object.assign(c.state.saved, { mode: "commute", dirMode: "office", pace: "avg", settings: { provider: "demo" } }, saved);
}

// ---------- Time boundaries ----------
test("clock() picks the nearest day across midnight", () => {
  const late = at("2026-11-03", "23:50");
  assert.equal(c.clock("00:10", late), at("2026-11-04", "00:10"));
  const early = at("2026-11-04", "00:10");
  assert.equal(c.clock("23:50", early), at("2026-11-03", "23:50"));
  assert.equal(c.clock("not a time", late), null);
});

test("resolve() handles on time, late, late across midnight, delayed and cancelled", () => {
  const now = at("2026-11-03", "23:40");
  assert.deepEqual(plain(c.resolve("23:45", "On time", now)), { t: at("2026-11-03", "23:45"), late: 0 });
  assert.equal(c.resolve("23:45", "23:52", now).late, 7);
  assert.equal(c.resolve("23:58", "00:03", now).late, 5);
  assert.equal(c.resolve("23:58", "00:03", now).t, at("2026-11-04", "00:03"));
  assert.equal(c.resolve("23:45", "Delayed", now).unknownDelay, true);
  assert.equal(c.resolve("23:45", "Cancelled", now).cancelled, true);
});

// ---------- Darwin parsing ----------
test("parseBoard() reads departures, calling points, cancellations and unknown delays", () => {
  const now = at("2026-11-03", "17:30");
  const board = c.parseBoard({
    trainServices: [
      { std: "17:42", etd: "17:46", platform: "9", operator: "Great Northern", origin: [{ locationName: "London Kings Cross" }],
        subsequentCallingPoints: [{ callingPoint: [{ crs: "FPK", st: "17:48", et: "17:52" }, { crs: "LET", st: "18:12", et: "18:16" }] }] },
      { std: "17:52", etd: "Cancelled", isCancelled: true, cancelReason: "crew", operator: "Great Northern",
        subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", st: "18:22", et: "Cancelled" }] }] },
      { std: "18:02", etd: "Delayed", operator: "Great Northern",
        subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", st: "18:32", et: "Delayed" }] }] },
      { std: "18:12", etd: "On time", operator: "Great Northern",
        subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", st: "18:42", et: "Delayed" }] }] },
      { std: "18:22", etd: "On time", operator: "Great Northern",
        subsequentCallingPoints: [{ callingPoint: [{ crs: "HIT", st: "18:50" }] }] },
    ],
    nrccMessages: [{ Value: "<p>Engineering <b>works</b> at Hitchin</p>" }],
  }, "KGX", "LET", now);
  const [a, b, d, e, f] = board.services;
  assert.equal(a.dep, at("2026-11-03", "17:46"));
  assert.equal(a.arr, at("2026-11-03", "18:16"));
  assert.equal(a.depLate, 4);
  assert.equal(a.platform, "9");
  assert.equal(a.origin, "London Kings Cross");
  assert.equal(b.cancelled, true);
  assert.equal(d.depUnknown, true);
  assert.equal(e.arrUnknown, true, "arrival 'Delayed' with no estimate is recorded");
  assert.equal(f.arr, null, "train that doesn't call at the destination has no arrival");
  assert.deepEqual(plain(board.msgs), ["Engineering works at Hitchin"]);
});

test("Trains without dependable times are listed and flagged but never recommended", () => {
  const dep = at("2026-11-03", "07:40");
  const good = svc({ from: "LET", to: "KGX", dep, arr: dep + 30 * MIN });
  useBoards({ "LET-KGX": { msgs: [], services: [
    good,
    svc({ from: "LET", to: "KGX", dep: dep + 10 * MIN, arr: dep + 40 * MIN, cancelled: true }),
    svc({ from: "LET", to: "KGX", dep: dep + 20 * MIN, arr: dep + 50 * MIN, depUnknown: true }),
    svc({ from: "LET", to: "KGX", dep: dep + 30 * MIN, arr: dep + 60 * MIN, arrUnknown: true }),
    svc({ from: "LET", to: "KGX", dep: dep + 40 * MIN, arr: null }),
  ] }, "LET-ZFD": { msgs: [], services: [] } });
  const js = c.buildJourneys("office", dep - 2 * 3600e3);
  assert.equal(js.length, 4, "cancelled and delayed trains are listed; only the one with no arrival time is left out");
  assert.ok(js.find((j) => j.train.cancelled).flags.some((f) => f.txt === "Cancelled"));
  assert.ok(js.filter((j) => j.train.depUnknown || j.train.arrUnknown).every((j) => j.flags.some((f) => /no estimate/.test(f.txt))));
  const realNow = Date.now; Date.now = () => dep - 2 * 3600e3;
  try {
    const list = c.ranked(dep - 2 * 3600e3);
    assert.equal(list.length, 4);
    assert.deepEqual(plain(list.filter((j) => j.recommended).map((j) => hm(j.train.dep))), ["07:40"], "only the dependable train is recommended");
  } finally { Date.now = realNow; }
});

// ---------- Door-to-door maths (defaults: walk 22:17 / 22:12, LET 2m+1m, KX 6m, tube 3m wait + 10m, Aldgate 1.5m + 7m) ----------
test("Commute to office via King's Cross, average pace", () => {
  const dep = at("2026-11-03", "08:00");
  useBoards({ "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep, arr: at("2026-11-03", "08:30") })] }, "LET-ZFD": { msgs: [], services: [] } });
  const [j] = c.buildJourneys("office", dep - 3600e3);
  assert.equal(j.leave, dep - (60 + 120 + 1337) * 1000);                       // 07:34:43
  assert.equal(j.arrive, at("2026-11-03", "08:30") + (360 + 180 + 600 + 90 + 420) * 1000); // 08:57:30
});

test("Commute to office, fast pace scales London walks and uses measured fast walk", () => {
  const dep = at("2026-11-03", "08:00");
  useBoards({ "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep, arr: at("2026-11-03", "08:30") })] }, "LET-ZFD": { msgs: [], services: [] } }, { pace: "fast" });
  const [j] = c.buildJourneys("office", dep - 3600e3);
  assert.equal(j.leave, dep - (60 + 120 * 0.82 + 1086) * 1000);
  assert.equal(j.arrive, at("2026-11-03", "08:30") + (360 * 0.82 + 180 + 600 + 90 * 0.82 + 420 * 0.82) * 1000);
});

test("Commute home via Farringdon", () => {
  const dep = at("2026-11-03", "18:04"), arr = at("2026-11-03", "18:50");
  useBoards({ "KGX-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [svc({ from: "ZFD", to: "LET", dep, arr, operator: "Thameslink" })] } }, { dirMode: "home" });
  const [j] = c.buildJourneys("home", dep - 3600e3);
  assert.equal(j.leave, dep - (60 + 240 + 420 + 180 + 90 + 420) * 1000);   // 17:38:50
  assert.equal(j.arrive, arr + (90 + 1332) * 1000);                       // 19:13:42
});

test("Leisure to London ends at the station and uses leisure pace", () => {
  const dep = at("2026-11-07", "10:07"), arr = at("2026-11-07", "10:36");
  useBoards({ "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep, arr })] }, "LET-STP": { msgs: [], services: [] } }, { mode: "leisure" });
  const [j] = c.buildLeisure("office", dep - 3600e3);
  assert.equal(j.arrive, arr);
  assert.equal(j.leave, dep - (60 + 120 * 1.15 + 1337 * 1.15) * 1000);
});

test("ranked() lists catchable trains in leaving order and marks the fastest", () => {
  const now = at("2026-11-03", "07:00");
  const mk = (d, a) => svc({ from: "LET", to: "KGX", dep: at("2026-11-03", d), arr: at("2026-11-03", a) });
  useBoards({ "LET-KGX": { msgs: [], services: [mk("07:10", "07:40"), mk("07:30", "08:20"), mk("07:40", "08:10")] }, "LET-ZFD": { msgs: [], services: [] } });
  const realNow = Date.now; Date.now = () => now;
  try {
    const list = c.ranked(now);
    assert.deepEqual(plain(list.map((j) => hm(j.train.dep))), ["07:10", "07:30", "07:40"], "leaving order; nothing hidden");
    assert.equal(list[0].missed, true, "07:10 is kept, flagged as needing a run or bike");
    assert.match(list[0].flags[0].txt, /Leave time passed: \d+ min short at walking pace, run or bike/);
    assert.ok(!list[0].recommended);
    assert.equal(list[1].first, true, "07:30 stopper is the one you'd catch by leaving now");
    assert.equal(list[2].fastest, true, "07:40 fast gets there first");
    assert.equal(list[2].recommended, 1, "07:40 is the best option for the top card");
  } finally { Date.now = realNow; }
});

// ---------- Flags ----------
test("Standing-room warning: fast GN into King's Cross 08:00–08:30, Tue–Thu, term time only", () => {
  const t = (day, d, a, extra) => svc(Object.assign({ from: "LET", to: "KGX", dep: at(day, d), arr: at(day, a), origin: "Ely" }, extra));
  assert.equal(c.standingRoomOnly(t("2026-11-03", "07:42", "08:10")), true, "Tuesday in term");
  assert.equal(c.standingRoomOnly(t("2026-11-03", "07:42", "08:10", { origin: "" })), true, "timetable source has no origin");
  assert.equal(c.standingRoomOnly(t("2026-11-03", "07:30", "08:20")), false, "stopping train");
  assert.equal(c.standingRoomOnly(t("2026-11-03", "08:07", "08:35")), false, "outside window");
  assert.equal(c.standingRoomOnly(t("2026-11-02", "07:42", "08:10")), false, "Monday");
  assert.equal(c.standingRoomOnly(t("2026-10-28", "07:42", "08:10")), false, "half term");
  assert.equal(c.standingRoomOnly(t("2026-12-22", "07:42", "08:10")), false, "Christmas holiday");
  assert.equal(c.standingRoomOnly(t("2026-11-05", "07:42", "08:10", { operator: "Thameslink" })), false, "Thameslink");
  assert.equal(c.standingRoomOnly(t("2026-11-05", "07:42", "08:10", { origin: "Letchworth Garden City" })), false, "starts at Letchworth");
});

test("Stopping-train flag thresholds", () => {
  const t = (to, m) => svc({ from: "LET", to, dep: 0, arr: m * MIN });
  assert.equal(c.isStopping(t("KGX", 44)), false);
  assert.equal(c.isStopping(t("KGX", 45)), true);
  assert.equal(c.isStopping(t("ZFD", 50)), false);
  assert.equal(c.isStopping(t("ZFD", 52)), true);
});

// ---------- Route-filtered warnings ----------
test("Notices: on-route shown, elsewhere folded unless your trains are hit", () => {
  const now = Date.now();
  const mk = (m, extra) => svc(Object.assign({ from: "LET", to: "KGX", dep: now + m * MIN, arr: now + (m + 30) * MIN }, extra));
  const msgs = ["Trains between Ely and King's Lynn may be delayed.", "Signal fault between Hitchin and Stevenage.", "Strike action on Saturday."];
  useBoards({ "LET-KGX": { msgs, services: [mk(20), mk(50)] }, "LET-ZFD": { msgs: ["Disruption at Gatwick Airport."], services: [] } });
  let w = c.railWarnings();
  assert.deepEqual(plain(w.onRoute), ["Signal fault between Hitchin and Stevenage.", "Strike action on Saturday."]);
  assert.deepEqual(plain(w.other), ["Trains between Ely and King's Lynn may be delayed.", "Disruption at Gatwick Airport."]);
  assert.equal(w.hit, false);
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 8 }), mk(50, { cancelled: true })];
  w = c.railWarnings();
  assert.equal(w.hit, true);
  c.render();
  const text = app.banners().join(" | ");
  assert.match(text, /Your line is disrupted/);
  assert.match(text, /Elsewhere on the network.*Gatwick/);
});

test("Delayed-without-estimate trains are listed as not used for planning", () => {
  const now = Date.now();
  useBoards({ "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep: now + 20 * MIN, arr: now + 50 * MIN, depUnknown: true })] }, "LET-ZFD": { msgs: [], services: [] } });
  c.render();
  assert.match(app.banners().join(" "), /1 train delayed with no estimate: listed, not recommended/);
});

// ---------- Security ----------
test("Third-party notice HTML is reduced to text without running anything", async () => {
  const out = c.stripHtml('<img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script><p>Line <b>closed</b></p>');
  assert.equal(out, "Line closed");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(app.w.__pwned, undefined);
});

test("TfL timetable: only direct trains between Letchworth and a London station are used", () => {
  const leg = (from, to, d, a, s = "Great Northern") => ({ mode: { id: "national-rail" }, departureTime: d, arrivalTime: a,
    departurePoint: { commonName: from }, arrivalPoint: { commonName: to }, instruction: { summary: s } });
  const x = c.trainFromJourney({ legs: [{ mode: { id: "walking" } }, leg("Letchworth Garden City Rail Station", "London St Pancras International Rail Station", "2026-11-03T08:00:00", "2026-11-03T08:41:00", "Thameslink to Brighton")] });
  assert.equal(x.key, "LET-STP");
  assert.equal(x.svc.operator, "Thameslink");
  assert.equal(c.trainFromJourney({ legs: [leg("Letchworth Garden City Rail Station", "Hitchin Rail Station", "2026-11-03T08:00:00", "2026-11-03T08:05:00"), leg("Hitchin Rail Station", "London Kings Cross Rail Station", "2026-11-03T08:10:00", "2026-11-03T08:40:00")] }), null);
  assert.equal(c.trainFromJourney({ legs: [leg("Cambridge Rail Station", "London Kings Cross Rail Station", "2026-11-03T08:00:00", "2026-11-03T08:50:00")] }), null);
});

test("Leave now card: best train, then the next best (same route allowed), total time, and the train you'd catch right now", () => {
  const now = Date.now(), m = 60e3;
  const mk = (to, d, mins, op) => svc({ from: "LET", to, dep: now + d * m, arr: now + (d + mins) * m, operator: op });
  // Farringdon's 33 leaves earlier and arrives later than the King's Cross 39 fast: strictly worse, not shown on the card.
  useBoards({ "LET-KGX": { msgs: [], services: [mk("KGX", 30, 52, "Great Northern"), mk("KGX", 39, 29, "Great Northern"), mk("KGX", 55, 29, "Great Northern")] },
              "LET-ZFD": { msgs: [], services: [mk("ZFD", 33, 44, "Thameslink")] } });
  c.render();
  const opts = [...app.d.querySelectorAll("#hero .opt")].map((o) => o.textContent.replace(/\s+/g, " "));
  assert.equal(opts.length, 2);
  assert.match(opts[0], new RegExp(`${hm(now + 39 * m)} Great Northern · 29 min train · total \\d+h \\d\\dm`), "best: the fast one");
  assert.match(opts[1], new RegExp(`${hm(now + 55 * m)} Great Northern · 29 min train`), "next best: the next fast one, same route");
  assert.match(app.text("#hero"), /Leaving right now\? The \d\d:\d\d Great Northern \(52 min train\)/);
  assert.equal(app.d.querySelectorAll("#list .row.best").length, 2);
});

test("A train you'd have to hurry for stays on the list and the card, with a departure countdown", () => {
  const now = Date.now(), m = 60e3;
  const mk = (to, d, mins, op) => svc({ from: "LET", to, dep: now + d * m, arr: now + (d + mins) * m, operator: op });
  useBoards({ "LET-KGX": { msgs: [], services: [mk("KGX", 40, 29, "Great Northern")] },
              "LET-ZFD": { msgs: [], services: [mk("ZFD", 12, 44, "Thameslink")] } });
  c.state.here = null;
  c.render();
  const rows = app.rows();
  assert.ok(rows.some((r) => /Thameslink.*Leave time passed.*run or bike.*|Leave time passed.*Thameslink/.test(r)), rows.join("\n"));
  assert.match(app.text("#hero"), /Still possible if you hurry: the \d\d:\d\d Thameslink leaves Letchworth, train departs in \d+m/);
  assert.ok(app.d.querySelector("#list .row.missed"));
});

test("On the way to the station, the walk is worked out from where you are", () => {
  const now = Date.now(), m = 60e3;
  const mk = (to, d, mins, op) => svc({ from: "LET", to, dep: now + d * m, arr: now + (d + mins) * m, operator: op });
  useBoards({ "LET-KGX": { msgs: [], services: [mk("KGX", 40, 29, "Great Northern")] },
              "LET-ZFD": { msgs: [], services: [mk("ZFD", 12, 44, "Thameslink")] } });
  c.state.here = [51.9772, -0.2290]; c.state.locAcc = 10;    // about 300 m south of the station
  c.state.autoDir = "office";
  try {
    const walk = c.walkFromHere();
    assert.ok(walk > 200 && walk < 400, `about 5 min walk, got ${walk}s`);
    c.render();
    const opts = [...app.d.querySelectorAll("#hero .opt")].map((o) => o.textContent.replace(/\s+/g, " "));
    assert.ok(opts.some((o) => /Thameslink/.test(o)), "the 12-minute Thameslink is catchable from here:\n" + opts.join("\n"));
    assert.match(app.text("#hero"), /Set off from where you are · about \d+ min walk to Letchworth station/);
    // At home (further than the measured walk), the measured walk is used.
    c.state.here = [51.9600, -0.2500];
    assert.equal(c.walkFromHere(), null);
  } finally { c.state.here = null; }
});

test("On the train: works out which train from your position and projects arrival", () => {
  const now = Date.now(), m = 60e3;
  const knebworth = [51.8667, -0.1876];
  const frac = c.lineProgress(knebworth, "KGX").frac;
  assert.ok(frac > 0.2 && frac < 0.35, `Knebworth is about a quarter of the way: ${frac}`);
  const fastDep = now - frac * 29 * m;                       // the fast train should be at Knebworth now
  const fast = svc({ from: "LET", to: "KGX", dep: fastDep, arr: fastDep + 29 * m });
  const stopper = svc({ from: "LET", to: "KGX", dep: now - 20 * m, arr: now + 32 * m });
  useBoards({ "LET-KGX": { msgs: [], services: [stopper, fast] }, "LET-ZFD": { msgs: [], services: [] } });
  c.state.autoDir = "office"; c.state.here = knebworth; c.state.locAcc = 20; c.state.atHub = null;
  c.state.onLine = c.onLine();
  try {
    assert.equal(c.state.onLine, true);
    const w = c.whichTrain(now);
    assert.equal(w.t, fast); assert.equal(w.sure, true);
    assert.ok(Math.abs(w.projected - fast.arr) < 60e3, "on time: projected arrival ≈ timetable");
    c.render();
    const hero = app.text("#hero");
    assert.match(hero, new RegExp(`On the train · .*You're on the ${hm(fast.dep)} Great Northern`));
    assert.match(hero, /projected at office/);
    assert.match(hero, /King's Cross \d\d:\d\d projected · timetable \d\d:\d\d · on time/);
    // Same place 5 minutes later than expected: the fast train is running about 5 min late.
    const late = c.whichTrain(now + 5 * m);
    assert.equal(late.t, fast);
    assert.ok(Math.round((late.projected - fast.arr) / m) >= 4);
    // Between Letchworth and Hitchin (where home is): never counted as on a train.
    c.state.here = [51.9650, -0.2480]; assert.equal(c.onLine(), false);
    c.state.here = [51.9790, -0.2300]; assert.equal(c.onLine(), false, "at Letchworth station");
    // Away from the line (e.g. in Stevenage town, 2 km off): not on a train.
    c.state.here = [51.9050, -0.1750]; assert.equal(c.onLine(), false);
  } finally { c.state.here = null; c.state.onLine = false; }
});

test("Arrive by on the train: says whether this train gets you there on time", () => {
  const now = Date.now(), m = 60e3, knebworth = [51.8667, -0.1876];
  const frac = c.lineProgress(knebworth, "KGX").frac, dep = now - frac * 29 * m;
  const fast = svc({ from: "LET", to: "KGX", dep, arr: dep + 29 * m });
  useBoards({ "LET-KGX": { msgs: [], services: [fast] }, "LET-ZFD": { msgs: [], services: [] } }, { view: "by" });
  c.state.autoDir = "office"; c.state.here = knebworth; c.state.locAcc = 20; c.state.atHub = null; c.state.onLine = c.onLine();
  const setTarget = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, "0");
    app.d.querySelector("#byDate").value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; app.d.querySelector("#byTime").value = `${p(d.getHours())}:${p(d.getMinutes())}`; };
  try {
    const office = c.whichTrain(now).projected + (360 + 180 + 600 + 90 + 420) * 1000;   // King's Cross → office, defaults
    setTarget(office + 20 * m); c.render();
    assert.match(app.text("#hero"), /^On time for \d\d:\d\d · (19|20|21) min to spare.*On the train.*You're on the/);
    setTarget(office - 10 * m); c.render();
    assert.match(app.text("#hero"), /^Late for \d\d:\d\d by about (9|10|11) min/);
  } finally { c.state.here = null; c.state.onLine = false; c.state.saved.view = "now"; }
});

test("The same Thameslink from Farringdon and St Pancras is one option with both boarding points", () => {
  const now = Date.now(), m = 60e3;
  const arr = now + 160 * m;
  const zfd = svc({ from: "ZFD", to: "LET", dep: now + 116 * m, arr, operator: "Thameslink" });
  const stp = svc({ from: "STP", to: "LET", dep: now + 121 * m, arr, operator: "Thameslink" });
  const gn = svc({ from: "KGX", to: "LET", dep: now + 114 * m, arr: now + 149 * m, operator: "Great Northern" });
  useBoards({ "KGX-LET": { msgs: [], services: [gn] }, "STP-LET": { msgs: [], services: [stp] }, "ZFD-LET": { msgs: [], services: [zfd] } }, { dirMode: "home" });
  const list = c.ranked(now);
  assert.equal(list.length, 2, "one Thameslink option, one Great Northern");
  const tl = list.find((j) => j.train.operator === "Thameslink");
  assert.equal(tl.alts.length, 1);
  c.render();
  const hero = app.text("#hero");
  assert.match(hero, /via (St Pancras or Farringdon|Farringdon or St Pancras)/);
  assert.match(hero, /Board at (Farringdon|St Pancras) \d\d:\d\d or (St Pancras|Farringdon) \d\d:\d\d/);
  assert.doesNotMatch(hero, /: leave \d\d:\d\d, departs/);
  assert.equal(app.d.querySelectorAll("#hero .opt").length, 2, "card shows Thameslink once plus King's Cross");
  assert.match(app.rows().join(" "), /Board at (Farringdon|St Pancras) \d\d:\d\d or (St Pancras|Farringdon) \d\d:\d\d/);
});

test("Platform is on the card and the list without expanding; with two boarding stations, each has its own", () => {
  const now = Date.now(), m = 60e3, arr = now + 160 * m;
  const zfd = svc({ from: "ZFD", to: "LET", dep: now + 116 * m, arr, operator: "Thameslink", platform: "4" });
  const stp = svc({ from: "STP", to: "LET", dep: now + 121 * m, arr, operator: "Thameslink", platform: "B" });
  const gn = svc({ from: "KGX", to: "LET", dep: now + 114 * m, arr: now + 149 * m, platform: "9" });
  useBoards({ "KGX-LET": { msgs: [], services: [gn] }, "STP-LET": { msgs: [], services: [stp] }, "ZFD-LET": { msgs: [], services: [zfd] } }, { dirMode: "home" });
  c.render();
  const hero = app.text("#hero"), rows = app.rows().join(" ");
  for (const s of [hero, rows]) {
    assert.match(s, /Great Northern · platform 9/);
    assert.match(s, /Board at Farringdon \d\d:\d\d platform 4 or St Pancras \d\d:\d\d platform B/);
    assert.doesNotMatch(s, /Thameslink · platform/);
  }
});

test("Disruption banners say they're about trains now when the plan on screen is later", () => {
  const now = Date.now(), m = 60e3;
  const late = svc({ from: "KGX", to: "LET", dep: now + 20 * m, arr: now + 55 * m, depLate: 15, cancelled: true });
  useBoards({ "KGX-LET": { msgs: [], services: [late] }, "ZFD-LET": { msgs: [], services: [] } }, { dirMode: "home", view: "now" });
  try {
    c.render();
    assert.doesNotMatch(app.text("#banners") || app.d.body.textContent, /This is about trains running now/);
    c.state.saved.view = "at"; c.state.at = { T: now + 4 * 60 * m, boards: {}, failed: {} };
    c.render();
    assert.match(app.d.body.textContent, /Now: 1 of your trains cancelled/);
  } finally { c.state.saved.view = "now"; c.state.at = null; }
});
