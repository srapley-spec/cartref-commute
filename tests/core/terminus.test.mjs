// Engine: departures from a terminus that TfL lists only as arrivals (the Met at Aldgate), from the next station.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, fixture, MIN } from "./helpers.mjs";

test("Met departures from Aldgate, from TfL's real Liverpool Street arrivals (recorded 30 Oct 22:43): each westbound Met less the 2-min run", () => {
  const now = Date.parse("2026-10-30T22:43:19Z"), lvt = fixture("tfl-2026-10-30T2243Z/LVT.json");
  const deps = core.terminusDepartures(lvt, { lineId: "metropolitan", outbound: /westbound/i, runMs: 2 * MIN, now, terminus: /^aldgate\b/i });
  assert.deepEqual(deps.map((d) => [d.vehicle, d.dest, new Date(d.t).toISOString().slice(11, 19)]), [
    ["441", "Uxbridge", "22:44:11"],   // waiting at Aldgate platform 2: Liverpool Street 22:46:11
    ["435", "", "22:52:41"],           // still arriving at Aldgate (eastbound at Liverpool Street 22:47): TfL includes the turnaround
    ["474", "", "23:04:42"],
  ]);
  // Aldgate's own feed for the same moment has no Met departure except the one at the platform (as an arrival).
  const ald = fixture("tfl-2026-10-30T2243Z/ALD.json").filter((a) => a.lineId === "metropolitan" && /westbound/i.test(a.platformName));
  assert.equal(ald.length, 0, "Aldgate never labels a Met westbound");
});

test("terminusDepartures: only the line and outbound direction; past trains dropped (30 s grace); destination never the terminus or 'Check Front of Train'", () => {
  const now = Date.parse("2026-10-31T08:00:00Z"), at = (s) => new Date(now + s * 1000).toISOString();
  const a = (o) => ({ lineId: "metropolitan", platformName: "Westbound - Platform 2", vehicleId: "v", ...o });
  const deps = core.terminusDepartures([
    a({ vehicleId: "1", expectedArrival: at(300), destinationName: "Amersham Underground Station", towards: "Chesham" }),   // TfL's destination wins
    a({ vehicleId: "2", expectedArrival: at(200), destinationName: "Aldgate Underground Station", towards: "Watford" }),
    a({ vehicleId: "3", expectedArrival: at(150), towards: "Check Front of Train" }),
    a({ vehicleId: "4", platformName: "Eastbound - Platform 1", expectedArrival: at(100) }),
    a({ vehicleId: "5", lineId: "circle", expectedArrival: at(100) }),
    a({ vehicleId: "6", expectedArrival: at(120 - 30) }),    // left the terminus 30 s ago: kept
    a({ vehicleId: "7", expectedArrival: at(120 - 31) }),    // 31 s ago: dropped
    a({ vehicleId: "8", timeToStation: 600 }),               // no expectedArrival: from timeToStation
    a({ vehicleId: "9", expectedArrival: "not a time" }),     // unreadable: dropped
  ], { lineId: "metropolitan", outbound: /westbound/i, runMs: 120e3, now, terminus: /^aldgate\b/i });
  assert.deepEqual(deps.map((d) => [d.vehicle, d.dest, (d.t - now) / 1e3]), [["6", "", -30], ["3", "", 30], ["2", "Watford", 80], ["1", "Amersham", 180], ["8", "", 480]]);
});

test("terminusDepartures: anything but a list (an error page, an object) gives none", () => {
  const o = { lineId: "metropolitan", outbound: /westbound/i, runMs: 120e3, now: 0, terminus: /^aldgate\b/i };
  assert.deepEqual(core.terminusDepartures({}, o), []); assert.deepEqual(core.terminusDepartures(null, o), []); assert.deepEqual(core.terminusDepartures("<html>", o), []);
});
