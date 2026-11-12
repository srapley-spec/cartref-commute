// The clean baseline of 11 Nov 2026 (issue #57, everything found 10–11 Nov): where you are on a leg from reports
// only (Sam chose option A, "One line + folded list"), the tube list's limits, and the last walk's "Next" line.
// Stories: docs/stories/journey-progress.md ("Where you are on the leg"), follow-a-route.md ("Clean baseline").
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, at, MIN, train } from "./helpers.mjs";

const time = (h) => at("2026-11-03", h), now = time("07:51");
const legs = [{ id: "walk", kind: "walk", label: "Walk", start: time("07:10"), end: time("07:28") },
  { id: "rail", kind: "rail", label: "Train", start: time("07:34"), end: time("08:08") },
  { id: "tube", kind: "tube", label: "Tube", start: time("08:15"), end: time("08:28") }];
const rail = [
  { code: "LET", name: "Letchworth Garden City", scheduledAt: time("07:30"), actualAt: time("07:34") },
  { code: "HIT", name: "Hitchin", scheduledAt: time("07:35"), actualAt: time("07:37") },
  { code: "WLW", name: "Welwyn North", scheduledAt: time("07:44"), actualAt: time("07:50") },
  { code: "FPK", name: "Finsbury Park", scheduledAt: time("07:58"), expectedAt: time("08:03") },
  { code: "KGX", name: "King's Cross", scheduledAt: time("08:03"), expectedAt: time("08:08") }];
const reported = { source: "reported", observedAt: now, identityMatched: true, expectedAt: time("08:08"), scheduledAt: time("08:03") };

test("Where you are on a train leg comes from National Rail's reports: last station passed, the next, your stop and the stops to go", () => {
  const p = core.journeyProgress({ now, legs, activeLeg: "rail", calls: rail, evidence: reported });
  assert.deepEqual(p.where, { last: 2, next: 3, yours: 4, stopsToGo: 2, approaching: false });
  assert.equal(p.sourceLine, "National Rail report, 07:51");
  assert.deepEqual(p.calls.map((c) => c.passed), [true, true, true, false, false], "passed only where reported");
  assert.equal(p.evidenceLabel, "Last reported at Welwyn North.", "no 'passing-point position' wording");
  // Nothing reported: no position is claimed from elapsed time.
  const none = core.journeyProgress({ now, legs, activeLeg: "rail", calls: rail.map(({ actualAt, ...c }) => c), evidence: { ...reported } });
  assert.equal(none.where, null); assert.equal(none.sourceLine, "");
  // A train you haven't confirmed (the evidence contradicts it): no position either.
  assert.equal(core.journeyProgress({ now, legs, activeLeg: "rail", calls: rail, evidence: reported, contradictedIdentity: true }).where, null);
  // Not your train (identity not matched): no position.
  assert.equal(core.journeyProgress({ now, legs, activeLeg: "rail", calls: rail, evidence: { ...reported, identityMatched: false } }).where, null);
});

const tube = ["King's Cross St Pancras", "Farringdon", "Barbican", "Moorgate", "Liverpool Street", "Aldgate"]
  .map((name, i) => ({ code: "T" + i, name, scheduledAt: time("08:15") + i * 2 * MIN }));
const tubeAt = (where, extra = {}) => core.journeyProgress({ now: time("08:26"), legs, activeLeg: "tube", calls: tube,
  evidence: { source: "prediction", observedAt: time("08:26"), expectedAt: time("08:28"), identityMatched: true, where, ...extra } });

test("Where you are on a tube leg comes from TfL's location text for your tube, matched to the leg's stations", () => {
  assert.deepEqual(tubeAt("Approaching Liverpool Street").where, { last: 3, next: 4, yours: 5, stopsToGo: 2, approaching: true });
  assert.equal(tubeAt("Approaching Liverpool Street").sourceLine, "TfL, 08:26");
  assert.deepEqual(tubeAt("At Barbican").where, { last: 2, next: 3, yours: 5, stopsToGo: 3, approaching: false });
  assert.deepEqual(tubeAt("Between Moorgate and Liverpool Street").where, { last: 3, next: 4, yours: 5, stopsToGo: 2, approaching: false });
  assert.deepEqual(tubeAt("Left Liverpool Street").where.next, 5);
  assert.equal(tubeAt("Somewhere odd").where, null, "TfL text that names no station on the leg: no position");
  assert.equal(tubeAt("At Moorgate", { identityMatched: false }).where, null, "not your tube: no position");
  assert.equal(tubeAt("At Moorgate", { observedAt: time("08:20") }).where, null, "a prediction over 3 minutes old: no position");
});

test("Station names as TfL and National Rail write them are the same station; TfL's text is read in the forms it uses", () => {
  assert.equal(core.sameStation("Kings Cross St. Pancras", "King's Cross St Pancras"), true);
  assert.equal(core.sameStation("Liverpool Street", "London Liverpool Street"), true);
  assert.equal(core.sameStation("Aldgate", "Aldgate East"), true, "loose by design (a prefix): the leg's own stop list decides");
  assert.equal(core.sameStation("Moorgate", "Barbican"), false);
  assert.equal(core.sameStation("", "Barbican"), false);
  const names = tube.map((c) => c.name);
  assert.deepEqual(core.tubePlace("Departed Farringdon", names), { last: 1, next: 2, approaching: false });
  assert.deepEqual(core.tubePlace("Leaving Aldgate", names), { last: 5, next: null, approaching: false });
  assert.equal(core.tubePlace("", names), null);
  assert.equal(core.tubePlace("At Euston", names), null);
});

test("'On a different tube?' offers each other tube for 5 minutes after the later of it and yours left, and never lists your own tube again", () => {
  const T = (h) => time(h), on = { t: T("08:16"), line: "Met", vehicle: "301" };
  const deps = [{ t: T("08:14"), line: "Circle", vehicle: "200" }, { t: T("08:17"), line: "Met", vehicle: "301" }, { t: T("08:18"), line: "H&C", vehicle: "400" }];
  assert.deepEqual(core.otherTubes(deps, on, T("08:19")).map((a) => a.vehicle), ["200", "400"], "the same vehicle under another time is your tube");
  assert.equal(core.OTHER_TUBE_OFFER_MS, 5 * MIN);
  assert.deepEqual(core.otherTubes(deps, on, T("08:21")).map((a) => a.vehicle), ["200", "400"], "five minutes on: still offered");
  assert.deepEqual(core.otherTubes(deps, on, T("08:21") + 1).map((a) => a.vehicle), ["400"], "the 08:14 goes 5 minutes after yours left; the 08:18 stays");
  assert.deepEqual(core.otherTubes(deps, on, T("08:23") + 1), [], "5 minutes after the 08:18: nothing");
});

test("On the last walk the followed card's 'Next' step is the arrival itself: flagged, so the card doesn't repeat the plan's whole walk", () => {
  const t = time("08:00");
  const o = { hub: "CEN", leave: t, arrive: t + 40 * MIN, flags: [], effort: "walk",
    train: train({ from: "RVS", to: "CEN", std: "08:05", dep: t + 5 * MIN, arr: t + 30 * MIN, serviceId: "x" }),
    legs: [{ t, d: "Leave home" }, { t: t + 5 * MIN, d: "Train", train: true }, { t: t + 30 * MIN, d: "Arrive Central" }, { t: t + 40 * MIN, d: "Arrive office", note: "walk 10 min" }] };
  const r = { ...core.startFollowRoute(o, { now: t, direction: "office", mode: "commute" }), phase: "after-train" };
  const u = core.updateFollowRoute(r, { now: t + 35 * MIN, options: [o], dataFresh: true, phase: "after-train" });
  assert.equal(u.nextStep?.d, "Arrive office"); assert.equal(u.nextIsLast, true);
  const before = core.updateFollowRoute(core.startFollowRoute(o, { now: t, direction: "office", mode: "commute" }), { now: t + MIN, options: [o], dataFresh: true, phase: "before-train" });
  assert.equal(before.nextIsLast, false);
});

test("tubePlace: 'Between X and Y' when only one of the two is on the leg", () => {
  const names = ["Aldgate", "Liverpool Street", "Moorgate", "Barbican", "Farringdon", "King's Cross St Pancras"];
  // TfL names a station before your boarding one: last is the one before Y (none), next is Y.
  assert.deepEqual(core.tubePlace("Between Tower Hill and Aldgate", names), { last: null, next: 0, approaching: false });
  assert.deepEqual(core.tubePlace("Between Tower Hill and Liverpool Street", names), { last: 0, next: 1, approaching: false });
  // TfL names a station after your stop: last is X, next is the one after X on the leg.
  assert.deepEqual(core.tubePlace("Between Moorgate and Euston Square", names), { last: 2, next: 3, approaching: false });
  assert.deepEqual(core.tubePlace("Between King's Cross St Pancras and Euston Square", names), { last: 5, next: null, approaching: false });
  // Named the other way round: still between the two, so the earlier on the leg is the one passed, never Moorgate.
  assert.deepEqual(core.tubePlace("Between Moorgate and Liverpool Street", names), { last: 1, next: 2, approaching: false });
});
