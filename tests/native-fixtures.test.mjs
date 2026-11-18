// The binding examples for the iPhone app (docs/ios-app.md §6.7): snapshots for every phase the proxy produces, the
// APNs payloads that carry them, and a Trip plan. The iOS agent tests its decoding and display against these files.
// After an intentional change: UPDATE_GOLDEN=1, read the diff, say what changed (as for tests/golden).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { core, at, MIN, train } from "./core/helpers.mjs";
import { apnsPayloads } from "../proxy/native.js";

const DAY = "2026-11-17", dep = at(DAY, "18:56");
const tl = (o = {}) => train({ from: "ZFD", to: "LET", std: "18:56", dep, arr: at(DAY, "19:40"), operator: "Thameslink", serviceId: "S1856", platform: "4", ...o });
const plan = { v: 1, followId: "f9", serviceId: "S1856", from: "ZFD", to: "LET", std: "18:56", operator: "Thameslink", dep, leaveBy: at(DAY, "18:36"), leadMs: 20 * MIN,
  train: "the 18:56 from Farringdon", mode: "commute", direction: "home", fromName: "Farringdon", toName: "Letchworth Garden City", marginMs: 2 * MIN, afterMs: 12 * MIN, startPlace: "office", arriveLabel: "At home" };
const o = (now, more = {}) => ({ now, dataAt: now - 30e3, setOff: false, alarm: { enabled: true, leadMin: 5 }, ...more });
const CASES = {
  "leave": core.proxySnapshot(plan, {}, tl(), o(at(DAY, "18:20"))),
  "leave-late": core.proxySnapshot(plan, {}, tl({ dep: dep + 7 * MIN, depLate: 7, arr: at(DAY, "19:47") }), o(at(DAY, "18:20"))),
  "platform": core.proxySnapshot(plan, {}, tl({ dep: dep + 7 * MIN, depLate: 7, arr: at(DAY, "19:47") }), o(at(DAY, "18:45"), { setOff: true })),
  "no-estimate": core.proxySnapshot(plan, { lastDep: dep + 3 * MIN, lastLate: 3 }, tl({ depUnknown: true }), o(at(DAY, "18:30"))),
  "stale": core.proxySnapshot(plan, {}, null, { ...o(at(DAY, "18:30")), dataAt: at(DAY, "18:20") }),
  "train-unconfirmed": core.proxySnapshot(plan, { lastDep: dep, lastArr: at(DAY, "19:40") }, null, o(at(DAY, "19:05"))),
  "walk-last": core.proxySnapshot(plan, { lastDep: dep, lastArr: at(DAY, "19:40") }, null, o(at(DAY, "19:42"))),
  "cancelled": core.proxySnapshot(plan, {}, tl({ cancelled: true }), o(at(DAY, "18:20"))),
  "page-train-confirmed": core.journeySnapshot({ now: at(DAY, "19:05"), source: "page", dataAt: at(DAY, "19:05"), mode: "leisure", direction: "home", followId: "f9", phase: "train", confirmed: true,
    headline: { label: "At Letchworth Garden City", t: at(DAY, "19:40"), step: "arrive" }, arrive: { label: "At home", t: at(DAY, "19:52") }, progress: { next: "Stevenage", stopsToGo: 3 } }),
};
const tripRoute = { version: 1, kind: "trip", id: "t1", startedAt: at(DAY, "09:00"), confirmed: [], journey: { id: "j1", leave: at(DAY, "09:30"), arrive: at(DAY, "11:20"),
  from: { name: "Home" }, to: { name: "Canterbury Cathedral" }, toStation: { crs: "CBW", name: "Canterbury West" }, fromStation: { crs: "BTN", name: "Brighton" },
  before: [{ kind: "walk", secs: 900 }, { kind: "station", secs: 180 }], after: [],
  rides: [{ kind: "rail", from: { crs: "BTN", name: "Brighton" }, to: { crs: "CBW", name: "Canterbury West" }, dep: at(DAY, "09:50"), arr: at(DAY, "11:05"), schedDep: at(DAY, "09:50"), schedArr: at(DAY, "11:05"), operator: "Southern", label: "Southern to Canterbury West", live: { dep: true, arr: true } }] } };

function golden(name, value) {
  const f = new URL(`./fixtures/native/${name}.json`, import.meta.url), text = JSON.stringify(value, null, 2) + "\n";
  if (process.env.UPDATE_GOLDEN || !existsSync(f)) writeFileSync(f, text);
  assert.equal(readFileSync(f, "utf8"), text, `tests/fixtures/native/${name}.json changed: UPDATE_GOLDEN=1, read the diff`);
}

test("Native fixtures: a snapshot for every phase, as the iPhone app receives them", () => {
  for (const [k, v] of Object.entries(CASES)) golden(`snapshot-${k}`, v);
  assert.equal(CASES["train-unconfirmed"].confirmed, false); assert.equal(CASES["page-train-confirmed"].confirmed, true);
  assert.equal(CASES.platform.alarm.cancelled, true); assert.equal(CASES.leave.alarm.cancelOnExit, "office");
  assert.equal(CASES.stale.stale, true);
});

test("Native fixtures: the APNs payloads (Live Activity update and end, background, alert)", () => {
  const now = at(DAY, "18:20");
  golden("apns-liveactivity-update", apnsPayloads.liveActivity(CASES.leave, false, now));
  golden("apns-liveactivity-end", apnsPayloads.liveActivity(CASES.cancelled, true, now));
  golden("apns-background", apnsPayloads.background(CASES.leave));
  golden("apns-background-stop", apnsPayloads.background(null));
  golden("apns-alert", apnsPayloads.alert({ kind: "changed", tag: "leave", title: "Leave later · by 18:43", body: "The 18:56 from Farringdon is 7 min late." }));
  assert.equal(apnsPayloads.liveActivity(CASES.leave, false, now).aps["stale-date"], Math.floor(CASES.leave.staleAt / 1000));
});

test("Trip's plan for the proxy: its first train, leave time, platform allowance and start station", () => {
  const p = core.tripNativePlan(tripRoute, () => "09:50");
  golden("trip-plan", p);
  assert.equal(p.plan.from, "BTN"); assert.equal(p.plan.leadMs, 20 * MIN); assert.equal(p.extra.marginMs, 3 * MIN);
  assert.equal(p.extra.afterMs, 15 * MIN); assert.equal(p.extra.startPlace, "BTN"); assert.equal(p.extra.arriveLabel, "At Canterbury Cathedral");
  assert.equal(core.tripNativePlan({ ...tripRoute, journey: { ...tripRoute.journey, rides: [{ ...tripRoute.journey.rides[0], cancelled: true }] } }, () => ""), null);
  assert.equal(core.tripNativePlan(null, () => ""), null);
  const s = core.proxySnapshot({ ...p.plan, ...p.extra }, {}, null, { now: at(DAY, "09:10"), dataAt: null, setOff: false, alarm: { enabled: true } });
  assert.equal(s.mode, "trip"); assert.equal(s.direction, null); assert.equal(s.alarm.cancelOnExit, null);
});
