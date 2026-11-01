// Trip mode's saved state (src/trip-ui.js validTripState): checked on restore; malformed parts dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { core } from "./core/helpers.mjs";
const require = createRequire(import.meta.url);
globalThis.tripAdapters = require("../src/trip-adapters.js");
const { validTripState } = require("../src/trip-ui.js");

test("Trip saved state: at most 5 recent places; a bad way to the station or question falls back to the defaults", () => {
  const recent = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, savedAt: i }));
  const s = validTripState({ active: true, recent, modes: { from: "teleport", to: "drive" }, question: { kind: "soon", t: 5 } }, core);
  assert.equal(s.recent.length, 5); assert.deepEqual(s.modes, { from: "walk", to: "drive" }); assert.deepEqual(s.question, { kind: "now", t: 0 });
  assert.equal(s.active, true);
});
test("Trip saved state: a place without a proper position is dropped; Current location keeps no position", () => {
  const s = validTripState({ from: { id: "current", name: "Current location", kind: "current", geo: [51, 0] }, to: { id: "x", name: "X", kind: "address", geo: [51, "a"] } }, core);
  assert.deepEqual(s.from.geo, [0, 0]); assert.equal(s.to, null);
});
test("Trip saved state: a followed trip is only kept when it passes the engine's checks", () => {
  assert.equal(validTripState({ follow: { version: 1, kind: "trip", id: "x" } }, core).follow, null);
  assert.equal(validTripState("nonsense", core).active, false);
});
