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

test("Trains without dependable times are never planned", () => {
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
  assert.equal(js.length, 1);
  assert.equal(js[0].train, good);
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

test("ranked() orders by arrival and drops trains you can no longer catch", () => {
  const now = at("2026-11-03", "07:00");
  const mk = (d, a) => svc({ from: "LET", to: "KGX", dep: at("2026-11-03", d), arr: at("2026-11-03", a) });
  useBoards({ "LET-KGX": { msgs: [], services: [mk("07:10", "07:40"), mk("07:30", "08:20"), mk("07:40", "08:10")] }, "LET-ZFD": { msgs: [], services: [] } });
  const realNow = Date.now; Date.now = () => now;
  try {
    const list = c.ranked(now);
    assert.deepEqual(plain(list.map((j) => hm(j.train.dep))), ["07:40", "07:30"], "07:10 is too soon; 07:40 fast beats 07:30 stopper");
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
  assert.match(app.banners().join(" "), /1 train delayed with no estimate, not used for planning/);
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
