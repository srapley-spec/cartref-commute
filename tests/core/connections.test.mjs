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
