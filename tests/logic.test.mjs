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
  assert.equal(j.arrive, at("2026-11-03", "08:30") + (400 + 180 + 600 + 90 + 420) * 1000); // 08:58:10
});

test("Commute to office, fast pace scales London walks and uses measured fast walk", () => {
  const dep = at("2026-11-03", "08:00");
  useBoards({ "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep, arr: at("2026-11-03", "08:30") })] }, "LET-ZFD": { msgs: [], services: [] } }, { pace: "fast" });
  const [j] = c.buildJourneys("office", dep - 3600e3);
  assert.equal(j.leave, dep - (60 + 120 * 0.82 + 1086) * 1000);
  assert.equal(j.arrive, at("2026-11-03", "08:30") + (400 * 0.82 + 180 + 600 + 90 * 0.82 + 420 * 0.82) * 1000);
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
    assert.equal(list[0].missed, true, "07:10 is kept: too late to walk");
    assert.equal(list[0].effort, "car", "about 15 min short on a 22 min walk: you'd need the car");
    assert.equal(list[0].flags[0].txt, "Arrives first · by car");
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
test("Notices graded by your trains: yellow = on your route, no impact yet; amber = delays under 15 min; red = 15+ min, cancelled; grey = elsewhere", () => {
  const now = Date.now();
  const mk = (m, extra) => svc(Object.assign({ from: "LET", to: "KGX", dep: now + m * MIN, arr: now + (m + 30) * MIN }, extra));
  const msgs = ["Trains between Ely and King's Lynn may be delayed.", "Signal fault between Hitchin and Stevenage. Trains may be delayed by up to 10 minutes.", "Strike action on Saturday."];
  useBoards({ "LET-KGX": { msgs, services: [mk(20), mk(50)] }, "LET-ZFD": { msgs: ["Disruption at Gatwick Airport."], services: [] } });
  const banners = () => { c.render(); return [...app.d.querySelectorAll("#banners .banner")].map((b) => `${b.className.replace("banner ", "")}: ${b.querySelector("summary,b")?.textContent.trim()}`).filter((x) => !/Example trains/.test(x)); };
  let w = c.railWarnings();
  assert.deepEqual(plain(w.onRoute), [msgs[1], msgs[2]]);
  assert.deepEqual(plain(w.other), [msgs[0], "Disruption at Gatwick Airport."]);
  assert.equal(w.level, "none");
  assert.deepEqual(banners(), ["note: Signal fault between Hitchin and Stevenage", "note: Strike action on Saturday", "info: 2 notices elsewhere on the network"],
    "no impact on your trains: route notices yellow with their first sentence as title; others grey, folded");
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 8 }), mk(50)];
  assert.equal(c.railWarnings().level, "amber");
  assert.deepEqual(banners(), ["warn: Signal fault between Hitchin and Stevenage", "warn: Strike action on Saturday", "info: 2 notices elsewhere on the network"], "one train 8 min late: amber");
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 8 }), mk(50, { depLate: 6 })];
  assert.deepEqual(banners()[0], "warn: Your line is disrupted", "two trains late: the headline, amber");
  assert.match(app.banners().join(" "), /2 of the next 2 trains on your routes are delayed 5\+ min or cancelled; worst delay 8 min\./);
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 15 }), mk(50)];
  assert.equal(c.railWarnings().level, "red");
  assert.deepEqual(banners().slice(0, 2), ["bad: Signal fault between Hitchin and Stevenage", "bad: Strike action on Saturday"], "15 min late: red");
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 4 }), mk(50, { cancelled: true })];
  assert.deepEqual(banners().slice(0, 2), ["bad: 1 of your trains cancelled", "bad: Signal fault between Hitchin and Stevenage"], "a cancellation: red");
  c.state.boards["LET-KGX"].services = [mk(20, { depLate: 4 })];
  assert.equal(c.railWarnings().level, "none", "under 5 min doesn't count");
  c.state.nrStatus = [{ id: "great-northern", name: "Great Northern", statuses: [{ sev: 9, desc: "Special Service", reason: "See nationalrail.co.uk/gn." }] }];
  assert.ok(banners().includes("note: Great Northern: Special Service"), "your operator's status is a route notice too");
  c.state.nrStatus = [];
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
  assert.match(app.text("#hero"), new RegExp(`Leaving right now\\? The ${hm(now + 30 * m)} Great Northern — stopping train, 52 min; office \\d\\d:\\d\\d, \\d+ min later than the ${hm(now + 39 * m)} \\(office \\d\\d:\\d\\d\\)`));
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
  assert.ok(rows.some((r) => /Thameslink.*Arrives first · by car|Arrives first · by car.*Thameslink/.test(r)), rows.join("\n"));
  assert.match(app.text("#hero"), /Arrives first by car: the \d\d:\d\d Thameslink leaves Letchworth, train departs in \d+m/);
  assert.ok(app.d.querySelector("#list .row.missed"));
});

test("On the way to the station, the walk is worked out from where you are", () => {
  const now = Date.now(), m = 60e3;
  const mk = (to, d, mins, op) => svc({ from: "LET", to, dep: now + d * m, arr: now + (d + mins) * m, operator: op });
  useBoards({ "LET-KGX": { msgs: [], services: [mk("KGX", 40, 29, "Great Northern")] },
              "LET-ZFD": { msgs: [], services: [mk("ZFD", 12, 44, "Thameslink")] } });
  c.state.here = [51.9772, -0.2290]; c.state.locAcc = 10;    // about 300 m south of the station
  c.state.autoDir = "office";
  const savedHome = c.state.saved.home; c.state.saved.home = null;   // no home saved: straight line × 1.3
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
    // Home saved 1.6 km out: your measured walk, scaled by how much of the way is left.
    c.state.saved.home = [51.9690, -0.2440]; c.state.here = [51.9745, -0.2365];
    const r = c.km([51.9745, -0.2365], [51.9799, -0.2290]) / c.km([51.9690, -0.2440], [51.9799, -0.2290]);
    assert.ok(Math.abs(c.walkFromHere() - c.S().walkHomeStationAvg * r) < 1, "measured walk × the share of the way left");
  } finally { c.state.here = null; c.state.saved.home = savedHome; }
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
  c.state.autoDir = "office"; c.state.here = knebworth; c.state.locAcc = 20; c.state.atHub = null; c.state.lastFixAt = now;
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
    assert.match(hero, /King's Cross \d\d:\d\d expected \(live\) · timetable \d\d:\d\d/);
    // Status lives in the train's lozenge, coloured by band (red, amber and green mean status only).
    assert.match(hero, new RegExp(`You're on the ${hm(fast.dep)} Great Northern On time`));
    assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst ok");
    // Same place 5 minutes later than expected (a fresh fix), live data: still the fast train (it's behind its
    // timetable), and the arrival is National Rail's live expected time.
    c.state.lastFixAt = now + 5 * m;
    const late = c.whichTrain(now + 5 * m);
    assert.equal(late.t, fast);
    assert.equal(late.projected, fast.arr);
    // Timetable data (no live times): the delay is worked out from your position.
    fast.timetable = true; stopper.timetable = true; c.state.trainLock = null;
    const lateTt = c.whichTrain(now + 5 * m);
    assert.equal(lateTt.t, fast);
    assert.ok(Math.round((lateTt.projected - fast.arr) / m) >= 4);
    // The same position, but the phone last updated it 5 min ago: judged at that time, so no delay is inferred,
    // and the card says the location is old.
    c.state.lastFixAt = now; c.state.trainLock = null;
    const old = c.whichTrain(now + 5 * m);
    assert.equal(old.t, fast); assert.equal(old.stale, true); assert.equal(old.fixAgeMin, 5); assert.equal(old.confidence, "low");
    assert.ok(Math.abs(old.projected - fast.arr) < 60e3, "no delay inferred from an old position");
    assert.equal(c.state.trainLock, null, "an old position doesn't settle which train");
    // On a train is decided by trackLine (position along the line and movement), as the app uses it:
    const P = app.w.CommuteCore, L = P.profiles.samCommute.lines.KGX, f = (here) => ({ here, acc: 20, at: now });
    assert.equal(P.trackLine(null, f([51.9650, -0.2480]), 0, null, L).onLine, false, "near home, standing still");
    assert.equal(P.trackLine(null, f([51.9790, -0.2300]), 25, null, L).onLine, false, "at Letchworth station");
    assert.equal(P.trackLine(null, f([51.9050, -0.1750]), 25, null, L).onLine, false, "Stevenage town, 2 km off the line");
  } finally { c.state.here = null; c.state.onLine = false; }
});

test("Arrive by on the train: says whether this train gets you there on time; a deadline on another day is a plan, not a verdict", () => {
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
    assert.equal(app.text("#listTitle"), "On the train", "under way, the list is the rest of the journey, not a board");
    // The same deadline tomorrow isn't this journey: the plan for tomorrow, no verdict.
    setTarget(office + 24 * 60 * m);
    // Planning is an explicit shared UI choice in both designs. Auto continues
    // tracking the current journey; choosing Plan exposes tomorrow's deadline.
    app.d.querySelector('[data-journey-view="plan"]').click();
    assert.doesNotMatch(app.text("#hero"), /^(On time|Late) for/);
    assert.notEqual(app.text("#listTitle"), "On the train");
  } finally { c.state.here = null; c.state.onLine = false; c.state.saved.view = "now"; c.state.saved.viewOverride = null; }
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
  const next=app.d.querySelector('.signal-alternative>summary');
  assert.ok(next,'the second train uses the actual compact summary');
  assert.match(next.textContent,/Board at Farringdon \d\d:\d\d platform 4 or St Pancras \d\d:\d\d platform B/);
  assert.doesNotMatch(next.textContent,/Thameslink · platform/);
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

test("On the train: the same train at two London stations is one candidate, so the runner-up is a different train", () => {
  const now = at("2026-11-03", "07:25"), m = 60e3;
  const tl = (to, arr) => svc({ from: "LET", to, dep: at("2026-11-03", "07:20"), arr: at("2026-11-03", arr), operator: "Thameslink" });
  useBoards({ "LET-STP": { msgs: [], services: [tl("STP", "07:59")] }, "LET-ZFD": { msgs: [], services: [tl("ZFD", "08:04")] },
              "LET-KGX": { msgs: [], services: [svc({ from: "LET", to: "KGX", dep: at("2026-11-03", "07:08"), arr: at("2026-11-03", "07:37") })] } }, { dirMode: "office" });
  const realNow = Date.now; Date.now = () => now;
  try {
    c.state.here = [51.9500, -0.2150]; c.state.locAcc = 20; c.state.onLine = true;   // just south of Letchworth
    const w = c.whichTrain(now);
    assert.equal(w.t.operator, "Thameslink");
    if (w.other) assert.notEqual(w.other.t.operator, "Thameslink", "runner-up is not the same Thameslink at the other station");
  } finally { Date.now = realNow; c.state.here = null; c.state.onLine = false; }
});

test("Station facility notices (toilets, escalators, lifts) are grey even when trains are disrupted; a facility notice that also mentions train disruption is graded", () => {
  const now = Date.now();
  const mk = (m, extra) => svc(Object.assign({ from: "LET", to: "KGX", dep: now + m * MIN, arr: now + (m + 30) * MIN }, extra));
  const msgs = ["The toilets on platform B at London St Pancras International are out of order.",
    "The escalator between the concourse and platforms at Finsbury Park is unavailable. Please use the stairs or the lift.",
    "Lifts at Stevenage are out of use. Step-free access is not available.",
    "Due to a lift fault at Hitchin, trains are not stopping at platform 4 and services may be delayed.",
    "Signal fault between Hitchin and Stevenage."];
  useBoards({ "LET-KGX": { msgs, services: [mk(20, { depLate: 16 }), mk(50, { depLate: 9 })] }, "LET-ZFD": { msgs: [], services: [] } });
  const w = c.railWarnings();
  assert.equal(w.facilities.length, 3);
  assert.deepEqual(plain(w.onRoute), [msgs[3], msgs[4]]);
  c.render();
  const b = [...app.d.querySelectorAll("#banners .banner")].map((x) => `${x.className.replace("banner ", "")}: ${x.querySelector("summary,b")?.textContent.trim()}`).filter((x) => !/Example trains/.test(x));
  assert.deepEqual(b, ["bad: Your line is disrupted", "bad: Due to a lift fault at Hitchin, trains are not stopping at platform 4 and services may…",
    "bad: Signal fault between Hitchin and Stevenage", "info: 3 station facility notices (toilets, lifts, escalators…)"]);
});

test("At King's Cross: a train from King's Cross stays on the card until a minute before it leaves; St Pancras trains keep the walk", () => {
  const now = Date.now(), m = 60e3;
  const gn = (d, mins) => svc({ from: "KGX", to: "LET", dep: now + d * m, arr: now + (d + mins) * m });
  const tl = svc({ from: "STP", to: "LET", dep: now + 3 * m, arr: now + 41 * m, operator: "Thameslink" });
  useBoards({ "KGX-LET": { msgs: [], services: [gn(2, 28), gn(8, 35)] }, "STP-LET": { msgs: [], services: [tl] }, "ZFD-LET": { msgs: [], services: [] } }, { dirMode: "home", view: "now" });
  c.state.atHub = "KGX"; c.state.here = [51.5308, -0.1238]; c.state.locAcc = 15;
  try {
    const list = c.ranked(now);
    const in2 = list.find((j) => j.train.dep === now + 2 * m), stp = list.find((j) => j.train.from === "STP");
    assert.equal(in2.missed, false, "2 min to go: still catchable from the concourse");
    assert.equal(in2.recommended, 1, "and it's the best");
    assert.equal(stp.missed, true, "St Pancras in 3 min: the walk there is real");
    c.render();
    assert.match(app.text("#hero"), new RegExp(`Train ?${hm(now + 2 * m)} Expected ?On time At home.*go to the platform now`));
    c.state.boards["KGX-LET"].services = [gn(0.5, 28), gn(8, 35)];
    const soon = c.ranked(now).find((j) => j.train.dep === now + 0.5 * m);
    assert.equal(soon.missed, true); assert.equal(soon.effort, "none"); assert.equal(soon.flags[0].txt, "Can't make it");
  } finally { c.state.atHub = null; c.state.here = null; c.state.saved.view = "now"; }
});

test("At King's Cross, a St Pancras train on the card says 'Train from St Pancras'", () => {
  const now = Date.now(), m = 60e3;
  const gn = svc({ from: "KGX", to: "LET", dep: now + 20 * m, arr: now + 52 * m });
  const tl = svc({ from: "STP", to: "LET", dep: now + 12 * m, arr: now + 50 * m, operator: "Thameslink" });
  useBoards({ "KGX-LET": { msgs: [], services: [gn] }, "STP-LET": { msgs: [], services: [tl] }, "ZFD-LET": { msgs: [], services: [] } }, { dirMode: "home", view: "now" });
  c.state.atHub = "KGX"; c.state.here = [51.5308, -0.1238]; c.state.locAcc = 15;
  try {
    c.render();
    const hero = app.text("#hero");
    assert.match(hero, new RegExp(`Train from St Pancras ?${hm(now + 12 * m)} Expected ?On time`), hero.slice(0, 200));
    assert.match(hero, new RegExp(`Train ?${hm(now + 20 * m)} Expected`), "a King's Cross train is just 'Train'");
  } finally { c.state.atHub = null; c.state.here = null; }
});

test("On the train home, the list doesn't talk about the onward tube", () => {
  const now = Date.now(), m = 60e3;
  useBoards({ "KGX-LET": { msgs: [], services: [svc({ from: "KGX", to: "LET", dep: now - 5 * m, arr: now + 23 * m })] }, "ZFD-LET": { msgs: [], services: [] } }, { dirMode: "home", view: "now" });
  c.state.here = [51.70, -0.18]; c.state.locAcc = 20; c.state.onLine = true;
  try { c.render(); assert.match(app.text("#list"), /The rest of the way home/); assert.doesNotMatch(app.text("#list"), /onward tube/); }
  finally { c.state.onLine = false; c.state.here = null; }
});

test("On the train home: a train that hasn't left can't be yours; once sure, it stays with your train when it falls behind (stop at Finsbury Park)", () => {
  const now = at("2026-10-28", "19:53"), m = 60e3;
  const g = (dep, mins, late = 0) => svc({ from: "KGX", to: "LET", std: dep, dep: at("2026-10-28", dep) + late * m, arr: at("2026-10-28", dep) + (mins + late) * m, arrLate: late, depLate: late });
  const t1948 = g("19:48", 28, 2), t1954 = g("19:54", 35);
  useBoards({ "KGX-LET": { msgs: [], services: [t1948, t1954] }, "ZFD-LET": { msgs: [], services: [] }, "STP-LET": { msgs: [], services: [] } }, { dirMode: "home" });
  const realNow = Date.now;
  try {
    c.state.trainLock = null; c.state.locAcc = 20; c.state.onLine = true; c.state.atHub = null;
    // 19:51, just out of King's Cross: the 19:48.
    Date.now = () => at("2026-10-28", "19:51");
    c.state.here = [51.5450, -0.1180];
    let w = c.whichTrain(Date.now());
    assert.equal(w.t, t1948);
    // 19:53 at Finsbury Park (an extra stop): the 19:54 hasn't left, so it can't be the one.
    Date.now = () => now; c.state.here = [51.5642, -0.1065];
    w = c.whichTrain(now);
    assert.equal(w.t, t1948); assert.equal(w.sure, true); assert.equal(w.other, null);
    assert.equal(w.projected, t1948.arr, "arrival: National Rail's live expected time");
    assert.equal(w.t.arr - w.t.arrLate * m, at("2026-10-28", "20:16"), "timetable arrival is the scheduled one");
    // 20:00, still sitting at Finsbury Park: after the 19:54 has left it still stays with the 19:48 (locked).
    Date.now = () => at("2026-10-28", "20:00");
    w = c.whichTrain(Date.now());
    assert.equal(w.t, t1948); assert.equal(w.locked, true);
    // Off the line: the lock is forgotten.
    c.state.trainLock = null;
  } finally { Date.now = realNow; c.state.here = null; c.state.onLine = false; c.state.trainLock = null; }
});

test("On the train: when unsure it asks which train you're on; your pick is kept until you're off the line", () => {
  const now = Date.now(), m = 60e3;
  const pt = [51.80, -0.20], f = c.lineProgress(pt, "KGX").frac, len = 30 * m;
  const at2 = (offMin, op, std) => { const dep = now - f * len + offMin * m; return svc({ from: "LET", to: "KGX", std, dep, arr: dep + len, operator: op }); };
  const a = at2(0.5, "Great Northern", "A1"), b = Object.assign(at2(-1.5, "Thameslink", "B2"), { serviceId: "SID-B2" });
  useBoards({ "LET-KGX": { msgs: [], services: [a, b] }, "LET-ZFD": { msgs: [], services: [] } }, { dirMode: "office", view: "now" });
  c.state.here = pt; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = null;
  try {
    c.render();
    let hero = app.text("#hero");
    assert.match(hero, /Probably the A1 Great Northern On time or the B2 Thameslink/);
    assert.match(hero, /Which train are you on\?A1 Great NorthernB2 Thameslink/);
    app.d.querySelector('[data-pick="Thameslink|B2|LET|SID-B2"]').click();
    assert.equal(c.state.trainLock.serviceId, "SID-B2", "your pick is remembered by service ID");
    hero = app.text("#hero");
    assert.match(hero, /You're on the B2 Thameslink On time · you picked this/);
    assert.match(hero, /On a different train\?A1 Great Northern/);
    const w = c.whichTrain(now + 8 * m);
    assert.equal(w.t, b, "kept even when the position fits less well");
  } finally { c.state.here = null; c.state.onLine = false; c.state.trainLock = null; }
});

test("On the train: each train is named with where it's going, as its own screens say, to tell close trains apart", () => {
  const now = Date.now(), m = 60e3;
  const pt = [51.80, -0.20], f = c.lineProgress(pt, "KGX").frac, len = 30 * m;
  const at2 = (offMin, op, std, destination) => { const dep = now - f * len + offMin * m;
    return svc({ from: "LET", to: "KGX", std, dep, arr: dep + len, operator: op, ...(destination ? { destination } : {}) }); };
  const a = at2(0.5, "Great Northern", "A1", "London Kings Cross"), b = at2(-1.5, "Thameslink", "B2", "Brighton");
  useBoards({ "LET-KGX": { msgs: [], services: [a, b] }, "LET-ZFD": { msgs: [], services: [] } }, { dirMode: "office", view: "now" });
  c.state.here = pt; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = null;
  try {
    c.render();
    assert.match(app.text("#hero"), /Probably the A1 Great Northern to London Kings Cross On time or the B2 Thameslink to Brighton/);
    assert.match(app.text("#hero"), /Which train are you on\?A1 Great Northern to London Kings CrossB2 Thameslink to Brighton/, "the picks say it too");
    delete a.destination; c.render();
    assert.match(app.text("#hero"), /Which train are you on\?A1 Great NorthernB2 Thameslink to Brighton/, "no destination: named as before");
  } finally { c.state.here = null; c.state.onLine = false; c.state.trainLock = null; }
});

test("On the train: where National Rail reported each train settles which one you're on", () => {
  const now = Date.now(), m = 60e3, P = app.w.CommuteCore;
  const pad = (n) => String(n).padStart(2, "0"), hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // You're at Stevenage. By timetable both trains could be there; reports say one is at Stevenage, the other only at Finsbury Park.
  const sv = [51.9017, -0.2071];
  const g = (id, dep, mins) => svc({ from: "KGX", to: "LET", dep, arr: dep + mins * m, serviceId: id });
  const a = g("A", now - 22 * m, 30), b = g("B", now - 20 * m, 26);
  useBoards({ "KGX-LET": { msgs: [], services: [a, b] }, "ZFD-LET": { msgs: [], services: [] }, "STP-LET": { msgs: [], services: [] } }, { dirMode: "home" });
  const rep = (lastCrs, lastT, nextCrs, nextT) => P.parseServiceDetails({ crs: "KGX", std: hhmm(now - 22 * m), atd: "On time",
    subsequentCallingPoints: [{ callingPoint: [{ crs: lastCrs, st: hhmm(lastT), at: hhmm(lastT) }, { crs: nextCrs, st: hhmm(nextT), et: hhmm(nextT) }] }] }, now);
  c.state.here = sv; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = null;
  try {
    const before = c.whichTrain(now);
    assert.equal(before.sure, false, "by timetable alone it can't tell");
    c.state.progressById = { A: { at: now, data: rep("FPK", now - 2 * m, "SVG", now + 14 * m) }, B: { at: now, data: rep("SVG", now - m, "HIT", now + 4 * m) } };
    const w = c.whichTrain(now);
    assert.equal(w.t, b); assert.equal(w.sure, true); assert.equal(w.reported, true);
  } finally { c.state.here = null; c.state.onLine = false; c.state.trainLock = null; c.state.progressById = {}; }
});

test("On the train: a train reported more than 6 min from you is ruled out; if nothing fits, you can still pick", () => {
  const now = Date.now(), m = 60e3, P = app.w.CommuteCore;
  const pad = (n) => String(n).padStart(2, "0"), hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const a = svc({ from: "KGX", to: "LET", dep: now - 22 * m, arr: now + 8 * m, serviceId: "A" });
  useBoards({ "KGX-LET": { msgs: [], services: [a] }, "ZFD-LET": { msgs: [], services: [] }, "STP-LET": { msgs: [], services: [] } }, { dirMode: "home", view: "now" });
  c.state.here = [51.9017, -0.2071]; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = null;
  try {
    assert.equal(c.whichTrain(now).t, a, "by timetable it fits");
    c.state.progressById = { A: { at: now, data: P.parseServiceDetails({ crs: "KGX", std: hhmm(a.dep), atd: "On time",
      subsequentCallingPoints: [{ callingPoint: [{ crs: "FPK", st: hhmm(now - 2 * m), at: hhmm(now - 2 * m) }, { crs: "SVG", st: hhmm(now + 14 * m), et: hhmm(now + 14 * m) }] }] }, now) } };
    const w = c.whichTrain(now);
    assert.equal(w.none, true, "reported near Finsbury Park, you're at Stevenage");
    c.render();
    assert.match(app.text("#hero"), /no train matches where you are right now.*Which train are you on\?/);
  } finally { c.state.here = null; c.state.onLine = false; c.state.trainLock = null; c.state.progressById = {}; }
});
