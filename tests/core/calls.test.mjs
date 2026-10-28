// Calling points: every stop a train makes, from both sources, and how they're used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, text, MIN } from "./helpers.mjs";

const sam = core.profiles.samCommute;
const now = at("2026-11-03", "17:30");

test("Darwin: stops from the boarding station to the destination, with times, nothing after", () => {
  const board = { locationName: "Farringdon", trainServices: [{ std: "17:56", etd: "On time", operator: "Thameslink",
    subsequentCallingPoints: [{ callingPoint: [
      { locationName: "London St Pancras International", crs: "STP", st: "18:01", et: "On time" },
      { locationName: "Finsbury Park", crs: "FPK", st: "18:08", et: "18:10" },
      { locationName: "Letchworth Garden City", crs: "LET", st: "18:39", et: "On time" },
      { locationName: "Cambridge", crs: "CBG", st: "19:05", et: "On time" } ] }] }] };
  const t = core.parseDarwinBoard(board, "ZFD", "LET", now, text).services[0];
  assert.deepEqual(t.calls.map(c => c.code), ["ZFD", "STP", "FPK", "LET"]);
  assert.equal(t.calls[0].name, "Farringdon");
  assert.equal(t.calls[1].t, at("2026-11-03", "18:01"));
  assert.equal(t.calls[2].t, at("2026-11-03", "18:10"), "expected time, not timetabled");
});

test("TfL: stops from the leg's path, short names, times at both ends only", () => {
  const j = { legs: [{ mode: { id: "national-rail" }, departureTime: "2026-11-03T17:56:00", arrivalTime: "2026-11-03T18:39:00",
    departurePoint: { commonName: "Farringdon Rail Station" }, arrivalPoint: { commonName: "Letchworth Garden City Rail Station" },
    instruction: { summary: "Thameslink to Cambridge" },
    path: { stopPoints: [{ name: "Farringdon Rail Station" }, { name: "London St Pancras International Rail Station" },
      { name: "Finsbury Park Rail Station" }, { name: "Stevenage Rail Station" }, { name: "Letchworth Garden City Rail Station" }] } }] };
  const t = core.trainFromTflJourney(j, sam, text).svc;
  assert.deepEqual(t.calls.map(c => c.name), [sam.stationNames.ZFD, sam.stationNames.STP, "Finsbury Park", "Stevenage", sam.stationNames.LET]);
  assert.equal(t.calls[1].code, "STP");
  assert.equal(t.calls[2].t, null);
  assert.equal(t.calls[4].t, at("2026-11-03", "18:39"));
});

test("Journey steps list every stop; a train with no stops known has no such step", () => {
  const svc = { from: "ZFD", to: "LET", std: "17:56", dep: at("2026-11-03", "17:56"), arr: at("2026-11-03", "18:39"), depLate: 0, arrLate: 0,
    depUnknown: false, platform: null, operator: "Thameslink", cancelled: false, reason: "",
    calls: [{ name: "Farringdon", t: at("2026-11-03", "17:56") }, { name: "St Pancras", t: null }, { name: "Letchworth", t: at("2026-11-03", "18:39") }] };
  const route = { hub: "ZFD", board: "ZFD-LET", fromName: "Farringdon", before: [], after: [], arriveLabel: "Arrive Letchworth" };
  const [o] = core.buildOptions([route], { "ZFD-LET": { services: [svc], msgs: [] } }, sam);
  const step = o.legs.find(l => l.calls);
  assert.equal(step.t, null);
  assert.equal(step.note, "Farringdon 17:56 · St Pancras · Letchworth 18:39");
  const [o2] = core.buildOptions([route], { "ZFD-LET": { services: [{ ...svc, calls: undefined }], msgs: [] } }, sam);
  assert.ok(!o2.legs.some(l => l.calls));
});

test("Same train is recognised from its stops even when the home times differ by more than a minute", () => {
  const mk = (hub, dep, arr, calls) => ({ hub, leave: dep - 10 * MIN, arrive: arr + 25 * MIN, flags: [],
    train: { operator: "Thameslink", dep, arr, calls } });
  const dep1 = at("2026-11-03", "17:56"), dep2 = at("2026-11-03", "18:01");
  const a = mk("ZFD", dep1, at("2026-11-03", "18:39"), [{ code: "ZFD", t: dep1 }, { code: "STP", t: dep2 }, { code: "LET", t: at("2026-11-03", "18:39") }]);
  const b = mk("STP", dep2, at("2026-11-03", "18:42"), undefined);
  const out = core.mergeSameTrain([a, b], "home", sam);
  assert.equal(out.length, 1);
  assert.equal(out[0].alts.length, 1);
});

test("Same train at the other station is derived from its stops when the search missed it (live times)", () => {
  const d = at("2026-11-03", "18:56"), s = at("2026-11-03", "19:01"), arr = at("2026-11-03", "19:40");
  const zfd = { from: "ZFD", to: "LET", std: "18:56", dep: d, arr, depLate: 0, arrLate: 0, depUnknown: false, platform: "4", operator: "Thameslink", cancelled: false, reason: "",
    calls: [{ name: "Farringdon", code: "ZFD", t: d }, { name: "St Pancras", code: "STP", t: s }, { name: "Letchworth", code: "LET", t: arr }] };
  const out = core.addCallingAlternatives({ "ZFD-LET": { services: [zfd], msgs: [] } }, "home", sam);
  const stp = out["STP-LET"].services[0];
  assert.equal(stp.dep, s); assert.equal(stp.std, "19:01"); assert.equal(stp.platform, null);
  assert.equal(stp.estimated, false); assert.equal(stp.derived, true);
  assert.equal(stp.calls[0].code, "STP");
  // Already there: nothing added. Original boards untouched.
  const again = core.addCallingAlternatives(out, "home", sam);
  assert.equal(again["STP-LET"].services.length, 1);
  assert.equal(out["ZFD-LET"].services.length, 1);
});

test("Timetable stops have no times: the other station's time is estimated from pairs seen, or not derived at all", () => {
  const mk = (from, dep, arr, calls) => ({ from, to: "LET", std: "", dep, arr, depLate: 0, arrLate: 0, depUnknown: false, platform: null, operator: "Thameslink", cancelled: false, reason: "", calls });
  const T = (h) => at("2026-11-03", h);
  const callsZ = (d, a) => [{ name: "Farringdon", code: "ZFD", t: d }, { name: "St Pancras", code: "STP", t: null }, { name: "Letchworth", code: "LET", t: a }];
  const boards = { "ZFD-LET": { msgs: [], services: [mk("ZFD", T("17:56"), T("18:39"), callsZ(T("17:56"), T("18:39"))), mk("ZFD", T("18:56"), T("19:40"), callsZ(T("18:56"), T("19:40")))] },
    "STP-LET": { msgs: [], services: [mk("STP", T("18:01"), T("18:39"), undefined)] } };
  const out = core.addCallingAlternatives(boards, "home", sam);
  const added = out["STP-LET"].services.find(t => t.derived);
  assert.equal(added.dep, T("19:01")); assert.equal(added.estimated, true);
  assert.equal(out["STP-LET"].services.length, 2, "17:56's St Pancras stop already present: not duplicated");
  // No pair to learn from: nothing derived.
  const none = core.addCallingAlternatives({ "ZFD-LET": boards["ZFD-LET"] }, "home", sam);
  assert.equal(none["STP-LET"], undefined);
});

test("To work: getting off at the earlier station is derived the same way", () => {
  const d = at("2026-11-04", "07:20"), s = at("2026-11-04", "08:01"), z = at("2026-11-04", "08:05");
  const t = { from: "LET", to: "ZFD", std: "07:20", dep: d, arr: z, depLate: 0, arrLate: 0, depUnknown: false, platform: "1", operator: "Thameslink", cancelled: false, reason: "",
    calls: [{ name: "Letchworth", code: "LET", t: d }, { name: "St Pancras", code: "STP", t: s }, { name: "Farringdon", code: "ZFD", t: z }] };
  const out = core.addCallingAlternatives({ "LET-ZFD": { services: [t], msgs: [] } }, "office", sam);
  const stp = out["LET-STP"].services[0];
  assert.equal(stp.arr, s); assert.equal(stp.dep, d); assert.equal(stp.platform, "1", "Letchworth platform kept");
});

test("Same train: a boarding point you can still make is the main one, even if the other gets you there sooner", () => {
  const T = (h) => at("2026-11-03", h), mk = (hub, dep, leave, missed) => ({ hub, leave: T(leave), arrive: T("19:59"), flags: [], missed,
    train: { operator: "Thameslink", dep: T(dep), arr: T("19:40"), calls: [] } });
  const zfd = mk("ZFD", "18:56", "18:34", true), stp = mk("STP", "19:01", "18:36", false);
  const [main] = core.mergeSameTrain([zfd, stp], "home", sam);
  assert.equal(main.hub, "STP"); assert.equal(main.alts[0].hub, "ZFD");
});

test("Service Details: last stop reported (actual time, delay), next stop, expected time at your stop", () => {
  const now = at("2026-10-28", "19:58");
  const d = core.parseServiceDetails({ locationName: "London Kings Cross", crs: "KGX", std: "19:48", atd: "19:50",
    previousCallingPoints: [], subsequentCallingPoints: [{ callingPoint: [
      { locationName: "Finsbury Park", crs: "FPK", st: "19:54", at: "19:57" },
      { locationName: "Stevenage", crs: "SVG", st: "20:08", et: "20:10" },
      { locationName: "Hitchin", crs: "HIT", st: "20:12", et: "20:14" },
      { locationName: "Letchworth Garden City", crs: "LET", st: "20:16", et: "20:18" } ] }] }, now);
  assert.equal(d.last.name, "Finsbury Park"); assert.equal(d.last.t, at("2026-10-28", "19:57")); assert.equal(d.last.late, 3);
  assert.equal(d.next.code, "SVG"); assert.equal(d.next.t, at("2026-10-28", "20:10"));
  assert.equal(d.at("LET"), at("2026-10-28", "20:18"));
  const onTime = core.parseServiceDetails({ crs: "KGX", std: "19:48", atd: "On time", subsequentCallingPoints: [{ callingPoint: [{ crs: "FPK", st: "19:54", at: "On time" }, { crs: "LET", st: "20:16", et: "On time" }] }] }, now);
  assert.equal(onTime.last.code, "FPK"); assert.equal(onTime.last.late, 0); assert.equal(onTime.at("LET"), at("2026-10-28", "20:16"));
  const none = core.parseServiceDetails({ crs: "KGX", std: "19:48", etd: "On time", subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", st: "20:16", et: "On time" }] }] }, now);
  assert.equal(none.last, null, "not left yet: nothing reported");
});

test("Darwin board: service ID kept; stops already passed are marked actual", () => {
  const board = { locationName: "London Kings Cross", trainServices: [{ serviceID: "abc123", std: "19:48", etd: "19:50", operator: "Great Northern",
    subsequentCallingPoints: [{ callingPoint: [{ locationName: "Finsbury Park", crs: "FPK", st: "19:54", at: "19:57" }, { locationName: "Letchworth Garden City", crs: "LET", st: "20:16", et: "20:18" }] }] }] };
  const t = core.parseDarwinBoard(board, "KGX", "LET", at("2026-10-28", "19:58"), text).services[0];
  assert.equal(t.serviceId, "abc123");
  assert.deepEqual(t.calls.map((c) => [c.code, !!c.actual]), [["KGX", false], ["FPK", true], ["LET", false]]);
});

test("reportedFrac: a train between its last reported stop and the next is placed in proportion to time; not departed = at its origin", () => {
  const sam = core.profiles.samCommute, line = sam.lines.KGX, geo = sam.stationGeo, f = (c) => core.lineProgress(geo[c], line).frac;
  const T = (h) => at("2026-10-28", h);
  const mid = core.reportedFrac({ code: "SVG", t: T("20:00") }, { code: "HIT", t: T("20:04") }, "KGX", T("20:02"), line, geo);
  assert.ok(Math.abs(mid - (f("SVG") + f("HIT")) / 2) < 1e-9);
  assert.equal(core.reportedFrac(null, { code: "FPK", t: T("20:00") }, "KGX", T("19:58"), line, geo), f("KGX"), "not departed");
  assert.equal(core.reportedFrac({ code: "FPK", t: T("19:57") }, { code: "SVG", t: T("20:10") }, "KGX", T("20:12"), line, geo), f("SVG"), "due at the next stop");
  assert.equal(core.reportedFrac({ code: "XXX", t: T("19:57") }, null, "KGX", T("20:00"), line, geo), null, "unknown station");
  assert.ok(f("LET") < f("HIT") && f("HIT") < f("SVG") && f("SVG") < f("FPK") && f("FPK") < f("KGX"), "stations in order along the line");
});
