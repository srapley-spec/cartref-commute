// Engine: generic connections and rides — boundaries (from the independent review, 29 Oct).
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN } from "./helpers.mjs";

const now = at("2026-11-03", "09:00"), m = MIN;
const leg = (d) => (d.line === "Blue" ? { stop: "Market", rideMs: 10 * m, tailMs: 5 * m } : d.line === "Green" ? { stop: "Quay", rideMs: 12 * m, tailMs: 3 * m } : null);
const dep = (min, line, vehicle) => ({ t: now + min * m, line, vehicle });
const plan = (o) => core.planConnection({ now, leg, walkMs: 5 * m, arrivedAt: null, departures: [], ...o });

test("Ready: never sooner than a minute from now; arrival in the future counts as now", () => {
  assert.equal(plan({ arrivedAt: now - 30 * m }).ready, now + m, "arrived long ago: still a minute");
  assert.equal(plan({ arrivedAt: now + 5 * m }).ready, now + 5 * m, "an arrival time in the future is treated as now");
  assert.equal(plan({ arrivedAt: now - 2 * m }).ready, now + 3 * m);
});

test("At most 6 departures you can make by default (or `max`); a departure exactly at ready is catchable", () => {
  const many = Array.from({ length: 10 }, (_, i) => dep(5 + i, "Blue"));
  assert.equal(plan({ departures: many }).next.length, 6);
  assert.equal(plan({ departures: many, max: 3 }).next.length, 3);
  assert.equal(plan({ departures: [dep(5, "Blue")] }).next.length, 1, "leaves exactly when you reach the platform");
});

test("Equal arrivals: the earlier departure wins; minutes to spare round down", () => {
  // Blue at 6 arrives 6+10+5 = 21; Green at 6 arrives 6+12+3 = 21: tie → the one listed first by time (Blue, same time) …
  let p = plan({ departures: [dep(7, "Green"), dep(6, "Blue")] });
  assert.equal(p.best.line, "Blue", "Blue 6 → 21, Green 7 → 22");
  p = plan({ departures: [dep(9, "Blue"), dep(7, "Green")] });     // Blue 9 → 24, Green 7 → 22
  assert.equal(p.best.line, "Green");
  p = plan({ departures: [dep(8, "Blue"), dep(6, "Green")] });     // Blue 8 → 23, Green 6 → 21
  assert.equal(p.best.line, "Green");
  // Equal arrivals from different departure times: the earlier departure wins (more time in hand at the other end).
  const tieLeg = (d) => (d.line === "Blue" ? { stop: "Market", rideMs: 10 * m, tailMs: 5 * m } : { stop: "Quay", rideMs: 12 * m, tailMs: 4 * m });
  p = core.planConnection({ now, leg: tieLeg, walkMs: 5 * m, arrivedAt: null, departures: [dep(6, "Blue", "b"), dep(5, "Green", "g")] });  // both arrive at 21
  assert.equal(p.best.vehicle, "g", "a tie goes to the earlier departure");
  p = plan({ departures: [{ t: now + 7 * m + 50e3, line: "Blue" }] });   // ready 5:00 → 2 min 50 s in hand
  assert.equal(p.spareMin, 2);
});

test("Your pick: matched on line, by vehicle when known, and kept when the live time moves", () => {
  const ds = [dep(6, "Green", "g6"), dep(6, "Blue", "b6"), dep(12, "Blue", "b12")];
  let p = plan({ departures: ds, pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(p.best.vehicle, "b6"); assert.equal(p.chosen, true);
  // TfL moves the time by 20 s: still your pick.
  p = plan({ departures: [dep(6, "Green", "g6"), { t: now + 6 * m + 20e3, line: "Blue", vehicle: "b6" }], pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(p.chosen, true); assert.equal(p.best.vehicle, "b6");
  // Delayed by 4 min: matched by vehicle.
  p = plan({ departures: [{ t: now + 10 * m, line: "Blue", vehicle: "b6" }, dep(12, "Blue", "b12")], pick: { t: now + 6 * m, line: "Blue", vehicle: "b6" } });
  assert.equal(p.chosen, true); assert.equal(p.best.vehicle, "b6");
  // No vehicle and nothing on that line within 3 min: not your pick.
  p = plan({ departures: [dep(10, "Blue")], pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(p.chosen, false);
  // A pick never matches another line at the same time.
  p = plan({ departures: [dep(6, "Green")], pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(p.chosen, false);
});

test("Rides end 10 min after the ride time (not before); 'did you get it?' only within the station radius", () => {
  const r = { from: "X", t: now, rideMs: 10 * m, stopGeo: [50.2, -1.2] }, here = [50.05, -1.05];
  const fx = (h, acc = 20, t = now) => ({ here: h, acc, at: t });
  assert.equal(core.rideActive(r, now + 20 * m - 1e3, fx(here)), true, "+9:59 after the ride time");
  assert.equal(core.rideActive(r, now + 20 * m + 1e3, fx(here)), false, "+10:01");
  assert.equal(core.rideActive(r, now - 29e3, fx(here)), true, "from 30 s before it leaves");
  const from = [50.0, -1.0], near = [50.0 + 0.0036, -1.0], far = [50.0 + 0.0054, -1.0];   // 400 m, 600 m
  assert.equal(core.rideDoubtful(r, now + 4 * m, fx(near, 20, now + 4 * m), from, 0.45), true);
  assert.equal(core.rideDoubtful(r, now + 4 * m, fx(far, 20, now + 4 * m), from, 0.45), false, "600 m away isn't 'still there'");
  assert.equal(core.rideDoubtful(r, now + 4 * m, fx(near, 50, now + 4 * m), from, 0.45), true, "50 m accuracy counts");
  assert.equal(core.rideDoubtful(r, now + 3 * m - 1e3, fx(near, 20, now + 3 * m), from, 0.45), false, "under 3 min");
});

test("A ride ends only within 300 m of your stop", () => {
  const r = { from: "X", t: now, rideMs: 10 * m, stopGeo: [50.2, -1.2] }, fx = (h) => ({ here: h, acc: 20, at: now + 9 * m });
  assert.equal(core.rideActive(r, now + 9 * m, fx([50.2 + 0.0018, -1.2])), false, "200 m from the stop: off");
  assert.equal(core.rideActive(r, now + 9 * m, fx([50.2 + 0.0036, -1.2])), true, "400 m: still riding");
});

test("A pick with a known train never switches to a different known train", () => {
  const p = plan({ departures: [dep(6.5, "Blue", "other")], pick: { t: now + 6 * m, line: "Blue", vehicle: "mine" } });
  assert.equal(p.chosen, false, "your train left the feed: not silently replaced by the next one");
  const q = plan({ departures: [dep(6.5, "Blue")], pick: { t: now + 6 * m, line: "Blue", vehicle: "mine" } });
  assert.equal(q.chosen, true, "a departure with no vehicle on the same line nearby can still be it");
});

test("A pick without a vehicle: the same line's departure nearest to the picked time, within 3 min", () => {
  const p = plan({ departures: [dep(5, "Blue", "x"), dep(6.8, "Blue", "y")], pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(p.best.vehicle, "y", "6:48 is nearer 6:00 than 5:00 is");
  const q = plan({ departures: [dep(7.5, "Blue", "z")], pick: { t: now + 6 * m, line: "Blue" } });
  assert.equal(q.chosen, true, "90 s later is still your pick");
});

test("Several stops to get off at: the earliest arrival is the leg; ties go to the earlier stop; the others are kept", () => {
  const legs = () => [{ stop: "Far", rideMs: 9 * m, tailMs: 30 * m }, { stop: "Near", rideMs: 6 * m, tailMs: 33 * m }, { stop: "Mid", rideMs: 7 * m, tailMs: 40 * m }];
  const p = core.planConnection({ now, leg: legs, walkMs: 2 * m, arrivedAt: null, departures: [dep(5, "Blue")] });
  assert.equal(p.best.leg.stop, "Near", "both arrive at +44: the earlier stop wins");
  assert.equal(p.best.arrive, now + 44 * m);
  assert.deepEqual(p.best.others.map((o) => o.stop), ["Far", "Mid"]);
  assert.equal(core.planConnection({ now, leg: () => [], walkMs: 2 * m, arrivedAt: null, departures: [dep(5, "Blue")] }).best, null, "no stop is any use");
});

test("The platform board: a tube's place (1 = next) among those still shown, and its minutes rounded down; under 1 is 'due'", () => {
  const now = 1_000_000_000_000, M = 60e3;
  const d = (min, line, vehicle) => ({ t: now + min * M, line, ...(vehicle ? { vehicle } : {}) });
  const deps = [d(8, "Met", "m8"), d(2.5, "Circle", "c2"), d(-0.4, "H&C", "h0"), d(-1, "Met", "m-1"), d(3.9, "H&C", "h3")];
  assert.deepEqual(core.boardSpot(deps, deps[1], now), { pos: 2, ms: 2.5 * M }, "the H&C leaving 24 s ago is still shown, first");
  assert.equal(core.boardSpot(deps, deps[2], now).pos, 1);
  assert.equal(core.boardSpot(deps, deps[4], now).pos, 3);
  assert.equal(core.boardSpot(deps, deps[0], now).pos, 4, "sorted by time, not by list order");
  assert.equal(core.boardSpot(deps, deps[3], now), null, "gone from the board a minute ago");
  assert.equal(core.boardSpot(deps, { t: now + 8 * M, line: "Met", vehicle: "zz" }, now), null, "a different known vehicle is not this one");
  assert.equal(core.boardSpot(deps, { t: now + 2.5 * M, line: "Circle" }, now).pos, 2, "no vehicle: matched by time and line");
  assert.equal(core.boardSpot(deps, { t: now + 2.5 * M, line: "Met" }, now), null, "same time, different line: not it");
  assert.equal(core.boardMins(59.9e3), "due"); assert.equal(core.boardMins(0), "due"); assert.equal(core.boardMins(-20e3), "due");
  assert.equal(core.boardMins(60e3), "1 min"); assert.equal(core.boardMins(179e3), "2 min"); assert.equal(core.boardMins(180e3), "3 min");
});

test("On the tube the board is gone: a tube that left is told by how long ago (rounded down); platform numbers from TfL's names", () => {
  assert.equal(core.leftAgo(-20e3), "leaving now"); assert.equal(core.leftAgo(0), "just left"); assert.equal(core.leftAgo(59.9e3), "just left");
  assert.equal(core.leftAgo(60e3), "left 1 min ago"); assert.equal(core.leftAgo(4.9 * 60e3), "left 4 min ago");
  assert.equal(core.platformNo("Westbound - Platform 3"), "3"); assert.equal(core.platformNo("Eastbound - Platform 2"), "2");
  assert.equal(core.platformNo("Westbound"), null); assert.equal(core.platformNo(""), null); assert.equal(core.platformNo(undefined), null);
});

test('Ride completion requires fresh destination GPS with its uncertainty inside the stop radius',()=>{
 const r={from:'X',t:now,rideMs:10*m,stopGeo:[50.2,-1.2]},arr=now+10*m;
 const fix=(acc,at=arr)=>({here:r.stopGeo,acc,at});
 for(const acc of [null,NaN,Infinity,-1,300,1400]){
  assert.equal(core.rideEnded(r,arr,fix(acc)),false);
  assert.equal(core.rideActive(r,arr,fix(acc)),true,'rough fix cannot alight');
 }
 assert.equal(core.rideEnded(r,arr,fix(12)),true);
 assert.equal(core.rideActive(r,arr,fix(12)),false,'precise recovery confirms arrival');
 assert.equal(core.rideEnded(r,arr,fix(12,arr-60001)),false,'stale fix cannot end ride');
 assert.equal(core.rideEnded(r,arr,fix(12,arr+1)),false,'future fix cannot end ride');
 assert.equal(core.rideEnded(r,arr,fix(12,now-30001)),false,'old cached fix from before departure cannot end ride');
 assert.equal(core.rideEnded(r,now-30001,fix(12,now-30001)),false,'not yet started is not completed');
 assert.equal(core.rideEnded(r,arr+10*m+1,fix(1400)),true,'existing expiry works without good GPS');
});
