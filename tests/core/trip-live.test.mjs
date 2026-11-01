// Engine: Trip live times within a budget, views, and Follow across rides (docs/stories/leisure-journeys.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { core, fixture, at, MIN } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const idx = core.stationIndex(JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8")).stations);
const cfg = core.tripConfig(), now = at("2026-11-03", "10:00");
const seg = (s) => [{ kind: "walk", secs: s, step: { at: "start", d: "Walk", note: "" } }];
function trips() {
  const body = fixture("trip/tfl-brighton-canterburywest.json").body;
  const rjs = core.tflRailJourneys(body, idx.byCrs("BTN"), idx.byCrs("CBW"), idx, cfg.endMatchM).journeys;
  return core.rankTrips(rjs.map(rj => core.buildJourney(rj, null, null, { from: "walk", to: "walk" }, seg(600), [], cfg, now)), { kind: "now", t: now }, now, cfg);
}
const svc = (std, dep, arr, o = {}) => ({ from: "X", to: "Y", std, dep, arr, depLate: 0, arrLate: 0, depUnknown: false, platform: o.platform ?? "3", operator: "Southern", cancelled: !!o.cancelled, reason: o.reason || "", destination: o.destination, serviceId: o.id || `id-${std}` });

test("Live budget: at most 6 boards, shared by station pair; the followed trip's next two rides come first", () => {
  const js = trips();
  const b = core.liveBudget(js, js[1], now, cfg);
  assert.ok(b.length <= 6);
  // The followed trip (the 10:28 via St Pancras) leads; its second ride leaves after 12:00 (beyond the board's 119 min)
  // so gets none; the picks' first rides come next, shared by station pair (BTN-STP once): then Brighton → Lewes.
  const f = core.mainRides(js[1].rides);
  assert.ok(f[1].schedDep - now > 119 * MIN);
  assert.deepEqual(b.map(x => x.key), ["BTN-STP", "BTN-LWS"]);
  assert.equal(new Set(b.map(x => x.key)).size, b.length);
  const tight = core.liveBudget(js, js[1], now, { ...cfg, live: { ...cfg.live, maxBoards: 2 } });
  assert.equal(tight.length, 2);
});

test("Live budget: rides more than 119 min away get no board (Not live)", () => {
  const js = trips();
  const b = core.liveBudget(js, js[0], now, cfg);
  const last = js[0].rides[js[0].rides.length - 1];   // the 12:20 from Ashford
  assert.ok(last.schedDep - now > 119 * MIN);
  assert.ok(!b.some(x => x.key === `${last.from.crs}-${last.to.crs}`));
});

test("Live: a ride matches its board by timetabled time and destination; two candidates with no way to tell them apart match none", () => {
  const r = trips()[0].rides[0];   // 10:06 Southern to Seaford
  const at1006 = r.schedDep;
  assert.equal(core.matchRide(r, { services: [svc("10:06", at1006, at1006 + 17 * MIN, { destination: "Seaford" }), svc("10:06", at1006, at1006 + 30 * MIN, { destination: "Littlehampton" })], msgs: [] }).destination, "Seaford");
  assert.equal(core.matchRide(r, { services: [svc("10:06", at1006, 0), svc("10:06", at1006, 0)], msgs: [] }), null);
  assert.equal(core.matchRide(r, undefined), null);
});

test("Live: a late first train re-times the journey, eats into the change and says so; rides without a board say Not live", () => {
  const j = trips()[0], r = j.rides[0];
  const late = core.applyLive(j, { "BTN-LWS": { services: [svc("10:06", r.schedDep + 3 * MIN, r.schedArr + 3 * MIN, { destination: "Seaford" })], msgs: [] } }, cfg);
  assert.equal(late.rides[0].live.dep, true); assert.equal(late.rides[1].live.dep, false);
  assert.equal(late.changes[0].spare, 1); assert.equal(late.changes[0].level, "bad");      // planned 4, now 1
  assert.deepEqual(late.changes[0].notLive, ["dep"]);
  assert.equal(late.leave, j.leave + 3 * MIN);
  assert.ok(late.flags.some(f => /Connection at risk, 1 min/.test(f.txt)));
});

test("Live: a cancelled next train makes the connection missed; the journey is never dropped", () => {
  const j = trips()[0], r1 = j.rides[1];
  const out = core.applyLive(j, { "LWS-HMD": { services: [svc("10:27", r1.schedDep, r1.schedArr, { cancelled: true, destination: "Eastbourne" })], msgs: [] } }, cfg);
  assert.equal(out.missed, true); assert.equal(out.changes[0].missed, true);
  assert.ok(out.flags.some(f => f.lvl === "bad"));
});

test("Trip views: planning views start plan- (never an active journey); a followed trip's phase picks its view", () => {
  assert.equal(core.chooseTripView({ plan: "now", following: false }).view, "plan-trip-now");
  assert.equal(core.chooseTripView({ plan: "by", following: true, phase: "before" }).view, "trip-follow");
  assert.equal(core.chooseTripView({ plan: "now", following: true, phase: "change" }).view, "trip-change");
  assert.ok(core.BLOCKS["plan-trip-now"].includes("others"));
  const auto = core.chooseTripView({ plan: "now", following: false });
  const res = core.resolveViewControl({ auto, live: null, plan: "at", override: core.createViewOverride("plan", now, "k"), now, situationKey: "k", views: core.TRIP_VIEWS });
  assert.equal(res.view, "plan-trip-at"); assert.equal(res.noActiveJourney, false);
  const live = core.resolveViewControl({ auto, live: null, plan: "now", override: core.createViewOverride("live", now, "k"), now, situationKey: "k", views: core.TRIP_VIEWS, hasFollowedJourney: true });
  assert.equal(live.view, "trip-follow");
  const commute = core.resolveViewControl({ auto: core.chooseView({ plan: "now" }), live: null, plan: "by", override: core.createViewOverride("plan", now, "k"), now, situationKey: "k" });
  assert.equal(commute.view, "plan-by");   // the commute's default is unchanged
});

test("Follow a trip: phases by time and answers; a confirmed ride sets the earliest you can be on, not forever", () => {
  const j = trips()[0];
  assert.equal(core.tripPhase(j, j.leave - MIN).phase, "before");
  assert.equal(core.tripPhase(j, j.rides[0].dep - MIN).phase, "access");
  assert.deepEqual(core.tripPhase(j, j.rides[0].dep + MIN), { phase: "ride", ride: 0 });
  assert.deepEqual(core.tripPhase(j, j.rides[1].dep - MIN), { phase: "change", ride: 1 });
  assert.deepEqual(core.tripPhase(j, j.rides[2].dep + MIN, [0]), { phase: "ride", ride: 2 });
  assert.equal(core.tripPhase(j, j.arrive).phase, "arrived");
});

test("Follow a trip: a later arrival is announced once with its reason; never replaced; alternatives only ≥ 5 min sooner or when broken", () => {
  const js = trips(), j = js[0];
  let f = core.startFollowTrip(j, now);
  const r = j.rides[0];
  const late = core.applyLive(j, { "BTN-LWS": { services: [svc("10:06", r.schedDep + 2 * MIN, r.schedArr + 2 * MIN, { destination: "Seaford" })], msgs: [] } }, cfg);
  // Arrival unchanged by a delay the change absorbs: no notice.
  let u = core.updateFollowTrip(f, { now, current: late, options: js });
  assert.equal(u.notice, null); assert.equal(u.route.id, j.id);
  const sooner = { ...js[2], id: "alt", arrive: j.arrive - 5 * MIN, leave: now + 5 * MIN, uncertain: false, missed: false };
  const notQuite = { ...js[2], id: "alt2", arrive: j.arrive - 4 * MIN, leave: now + 5 * MIN, uncertain: false, missed: false };
  assert.equal(core.updateFollowTrip(f, { now, current: j, options: [notQuite] }).alternative, null);
  assert.equal(core.updateFollowTrip(f, { now, current: j, options: [sooner] }).alternative.id, "alt");
  f = core.dismissTripAlternative(f, "alt");
  assert.equal(core.updateFollowTrip(f, { now, current: j, options: [sooner] }).alternative, null);
  // The last train 6 min late: announced once, with the train named; the followed trip is still the same one.
  const lr = j.rides[3];
  const later = { ...j, rides: j.rides.map((x, i) => i === 3 ? { ...x, dep: x.dep + 6 * MIN, arr: x.arr + 6 * MIN } : x), arrive: j.arrive + 6 * MIN };
  u = core.updateFollowTrip(f, { now, current: later, options: [] });
  assert.match(u.notice.text, /Now arriving .* \(6 min later\): the 12:20 from Ashford International is running late/);
  assert.equal(u.status, "late"); assert.equal(u.level, "warn"); assert.equal(u.route.id, j.id);
  assert.equal(core.updateFollowTrip(u.route, { now, current: later, options: [] }).notice, null);
  void lr;
});

test("Follow a trip: saved state is checked; malformed is dropped", () => {
  const f = core.startFollowTrip(trips()[0], now);
  assert.equal(core.restoreFollowTrip(JSON.parse(JSON.stringify(f))).id, f.id);
  assert.equal(core.restoreFollowTrip({ ...f, version: 2 }), null);
  assert.equal(core.restoreFollowTrip({ ...f, journey: { ...f.journey, rides: [] } }), null);
  assert.equal(core.restoreFollowTrip({ ...f, journey: { ...f.journey, id: "other" } }), null);
  assert.equal(core.restoreFollowTrip("x"), null);
});
