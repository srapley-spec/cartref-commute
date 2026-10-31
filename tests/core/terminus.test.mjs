// Engine: departures from a terminus that TfL lists only as arrivals (the Met at Aldgate), from the next station.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, fixture, MIN } from "./helpers.mjs";

test("terminusDepartures on TfL's real Liverpool Street arrivals (recorded 30 Oct 22:43): each westbound Met less the run given (here the timetable's 2 min; the app uses the measured 90 s)", () => {
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

// ---------- 31 Oct: real feeds recorded this morning (Saturday 08:59–09:25) ----------
const ALD_STOP = () => core.profiles.samCommute.places.officeStops.find((s) => s.id === "ALD").startsHere;
const aldOpts = (now) => ({ lineId: "metropolitan", outbound: /westbound/i, runMs: ALD_STOP().runMs, now, terminus: /^aldgate\b/i, terminusName: "Aldgate" });

test("Met platform at Aldgate (recorded 31 Oct 08:59): a Met standing there has TfL's platform; one still arriving has none", () => {
  const now = Date.parse("2026-10-31T08:59:22Z"), lvt = fixture("tfl-2026-10-31T0859Z/LVT.json");
  const deps = core.terminusDepartures(lvt, aldOpts(now));
  assert.deepEqual(deps.map((d) => [d.vehicle, d.dest, new Date(d.t).toISOString().slice(11, 19), d.platform]), [
    ["431", "Uxbridge", "09:01:20", "Platform 3"],   // "At Aldgate Platform 3"; left 09:02:29–09:03:08 (running late)
    ["406", "Chesham", "09:03:51", "Platform 2"],    // "At Aldgate Platform 2"; left 09:04:47–09:05:29
    ["432", "", "09:07:51", ""],                     // approaching Liverpool Street eastbound: no platform yet (it took 3)
    ["433", "", "09:13:51", ""],
    ["407", "", "09:17:51", ""],
  ]);
  // 30 Oct 22:43: Met 441 waiting at platform 2.
  const oct30 = core.terminusDepartures(fixture("tfl-2026-10-30T2243Z/LVT.json"), aldOpts(Date.parse("2026-10-30T22:43:19Z")));
  assert.deepEqual(oct30.map((d) => [d.vehicle, d.platform]), [["441", "Platform 2"], ["435", ""], ["474", ""]]);
  // TrackerNet refused the key at the same moment (recorded): no per-platform feed to use.
  const tn = fixture("tfl-2026-10-31T0859Z/trackernet-ALD.json");
  assert.equal(tn.M.status, 401); assert.equal(tn.H.status, 401); assert.doesNotMatch(JSON.stringify(tn), /app_key=[^(]/);
});

test("Met departures from Aldgate, measured run (31 Oct 09:00–09:25, 75 polls): TfL predicts Liverpool Street 90–95 s after a Met leaves, so the profile's 90 s", () => {
  const polls = fixture("tfl-lvt-westbound-met-2026-10-31T0900Z-0925Z.json");
  const seen = {};
  for (const p of polls) for (const a of p.mets) (seen[a.vehicleId] ||= []).push({ ts: Date.parse(p.timestamp), exp: Date.parse(a.expectedArrival), loc: a.currentLocation });
  // Each departure: between the last poll "At Aldgate Platform N" and the next; TfL's first prediction after leaving bounds the run.
  const left = {}; let lo = 0, hi = Infinity;
  for (const [v, o] of Object.entries(seen)) {
    o.sort((a, b) => a.ts - b.ts);
    const i = o.findLastIndex((x) => /^At Aldgate Platform/.test(x.loc)); if (i < 0 || i === o.length - 1) continue;
    left[v] = [o[i].ts, o[i + 1].ts];
    lo = Math.max(lo, o[i + 1].exp - o[i + 1].ts); hi = Math.min(hi, o[i + 1].exp - o[i].ts);
  }
  assert.deepEqual(Object.keys(left).sort(), ["406", "431", "432", "433", "434"], "five Mets seen leaving");
  assert.ok(lo <= ALD_STOP().runMs && ALD_STOP().runMs <= hi, `run ${lo / 1e3}–${hi / 1e3} s contains the profile's ${ALD_STOP().runMs / 1e3} s`);
  assert.ok(hi < 2 * MIN, "the timetable's 2 min is longer than TfL's own run");
  // In the last 2 minutes before each left, the app's departure is at most 46 s early (Mets already waiting and running late) and 17 s late; with 2 min, up to 75 s early.
  const err = [];
  for (const p of polls) {
    const ts = Date.parse(p.timestamp);
    for (const d of core.terminusDepartures(p.mets, aldOpts(ts))) {
      const w = left[d.vehicle]; if (!w) continue; const mid = (w[0] + w[1]) / 2;
      if (ts < mid && mid - ts < 2 * MIN) err.push((d.t - mid) / 1e3);
    }
  }
  err.sort((a, b) => a - b);
  assert.ok(err.length >= 20, `${err.length} predictions`);
  assert.ok(err[0] >= -50 && err.at(-1) <= 20, `errors ${err[0]}..${err.at(-1)} s`);
  assert.ok(Math.abs(err[err.length >> 1]) <= 15, `median ${err[err.length >> 1]} s`);
});

test("terminusDepartures platform: only 'At <terminus> Platform N' for the named terminus; not Aldgate East, not approaching, not without a name", () => {
  const now = Date.parse("2026-10-31T08:00:00Z"), at = (s) => new Date(now + s * 1000).toISOString();
  const a = (v, loc) => ({ lineId: "metropolitan", platformName: "Westbound - Platform 2", vehicleId: v, expectedArrival: at(300 + +v), currentLocation: loc });
  const feed = [a("1", "At Aldgate Platform 3"), a("2", "at aldgate platform 2 "), a("3", "At Aldgate East Platform 1"), a("4", "Approaching Aldgate Platform 2"),
    a("5", "Left Aldgate"), a("6", "At Aldgate"), a("7", undefined), a("8", "At Platform"), a("9", "At Aldgate Platform A")];
  // Review 31 Oct: a two-digit platform; wording TfL isn't known to send gives none (the train still shows).
  feed.push(a("10", "At Aldgate Platform 10"), a("11", "Waiting at Aldgate Platform 2"), a("12", "At Aldgate Platform 3 (bay)"), a("13", "At  Aldgate  Platform 3"));
  const o = { lineId: "metropolitan", outbound: /westbound/i, runMs: 90e3, now, terminus: /^aldgate\b/i };
  assert.deepEqual(core.terminusDepartures(feed, { ...o, terminusName: "Aldgate" }).map((d) => [d.vehicle, d.platform]),
    [["1", "Platform 3"], ["2", "Platform 2"], ["3", ""], ["4", ""], ["5", ""], ["6", ""], ["7", ""], ["8", ""], ["9", "Platform A"],
      ["10", "Platform 10"], ["11", ""], ["12", ""], ["13", "Platform 3"]]);
  assert.deepEqual(core.terminusDepartures(feed, o).map((d) => d.platform), Array(13).fill(""), "no terminus name: no platform");
  assert.deepEqual(core.terminusDepartures(feed, { ...o, terminusName: "Aldgate East" }).map((d) => d.platform),
    ["", "", "Platform 1", "", "", "", "", "", "", "", "", "", ""], "generic: any terminus by name");
});
