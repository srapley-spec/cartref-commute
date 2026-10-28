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
