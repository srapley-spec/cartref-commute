// Engine tests: pure functions, no page. Run against Sam's profile and a made-up corridor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, fixture, at, text, MIN, testville, train, option } from "./helpers.mjs";

const sam = core.profiles.samCommute;

// ---------- Time ----------
test("clock/resolve: midnight both ways, late, delayed, cancelled", () => {
  assert.equal(core.clock("00:10", at("2026-11-03", "23:50")), at("2026-11-04", "00:10"));
  assert.equal(core.clock("23:50", at("2026-11-04", "00:10")), at("2026-11-03", "23:50"));
  const now = at("2026-11-03", "23:40");
  assert.equal(core.resolve("23:58", "00:03", now).late, 5);
  assert.equal(core.resolve("23:45", "Delayed", now).unknownDelay, true);
  assert.equal(core.resolve("23:45", "Cancelled", now).cancelled, true);
  assert.equal(core.dur(83 * MIN), "1h 23m");
  assert.equal(core.dur(9 * MIN), "9 min");
});

// ---------- Adapters (fixtures are the contract a native engine must also pass) ----------
test("Darwin board fixture → trains", () => {
  const f = fixture("darwin-board-kgx-let.json");
  const b = core.parseDarwinBoard(f, "KGX", "LET", at("2026-11-03", f._now), text);
  assert.equal(b.services.length, 4);
  const [a, c, d, e] = b.services;
  assert.equal(a.depLate, 4); assert.equal(a.arr, at("2026-11-03", "18:16")); assert.equal(a.platform, "9"); assert.equal(a.origin, "London Kings Cross");
  assert.equal(c.cancelled, true); assert.equal(c.reason, "a shortage of train crew");
  assert.equal(d.depUnknown, true); assert.equal(d.arrUnknown, true);
  assert.equal(e.arr, null, "doesn't call at Letchworth");
  assert.deepEqual(b.msgs, ["Engineering works at Hitchin"]);
});

test("TfL journeys fixture → direct trains; changes are reported, not used", () => {
  const f = fixture("tfl-journeys-kgx-let.json");
  const out = f.journeys.map((j) => core.trainFromTflJourney(j, sam, text));
  assert.equal(out[0].key, "STP-LET"); assert.equal(out[0].svc.operator, "Thameslink");
  assert.equal(out[1].key, "KGX-LET"); assert.equal(out[1].svc.depLate, 3); assert.equal(out[1].svc.std, "18:06");
  assert.deepEqual(out[1].msgs, ["Signal fault between Hitchin and Stevenage"]);
  assert.equal(out[2], null);
  assert.equal(core.tflDropReason(f.journeys[2]), "change of train");
});

test("TfL adapter works for another corridor (no Letchworth assumptions)", () => {
  const leg = { mode: { id: "national-rail" }, departureTime: "2026-11-03T07:05:00", arrivalTime: "2026-11-03T07:22:00",
    departurePoint: { commonName: "Riverside Rail Station" }, arrivalPoint: { commonName: "Central Rail Station" }, instruction: { summary: "to Central" } };
  const x = core.trainFromTflJourney({ legs: [leg] }, testville, text);
  assert.equal(x.key, "RVS-CEN"); assert.equal(x.svc.operator, "Express Rail", "default operator from the profile");
  assert.equal(core.trainFromTflJourney({ legs: [leg] }, sam, text), null, "Sam's profile doesn't know these stations");
});

// ---------- Rules ----------
test("Standing-room rule is the profile's, for any corridor", () => {
  const fast = train({ from: "RVS", to: "CEN", dep: at("2026-11-03", "06:55"), arr: at("2026-11-03", "07:12") });
  assert.equal(core.standingRoomOnly(fast, testville.busy), true);
  assert.equal(core.standingRoomOnly({ ...fast, origin: "Nearby" }, testville.busy), false, "origin rule");
  assert.equal(core.standingRoomOnly({ ...fast, dep: at("2026-11-07", "06:55"), arr: at("2026-11-07", "07:12") }, testville.busy), false, "Saturday");
  const samFast = train({ from: "LET", to: "KGX", operator: "Great Northern", dep: at("2026-11-03", "07:42"), arr: at("2026-11-03", "08:10") });
  assert.equal(core.standingRoomOnly(samFast, sam.busy), true);
  assert.equal(core.standingRoomOnly({ ...samFast, dep: at("2026-10-28", "07:42"), arr: at("2026-10-28", "08:10") }, sam.busy), false, "half term");
});

test("Stopping threshold comes from the profile", () => {
  const t = (to, m) => train({ from: "RVS", to, dep: 0, arr: m * MIN });
  assert.equal(core.isStopping(t("CEN", 29), testville), false);
  assert.equal(core.isStopping(t("CEN", 30), testville), true);
  assert.equal(core.isStopping(t("MKT", 34), testville), false);
  assert.equal(core.isStopping(train({ from: "LET", to: "ZFD", dep: 0, arr: 52 * MIN }), sam), true);
});

// ---------- Ranking ----------
test("topPicks: best, then the next best on any route; strictly worse options are never the alternative", () => {
  const T = at("2026-11-03", "17:00");
  const o = (hub, leave, arrive, extra) => option({ hub, leave: T + leave * MIN, arrive: T + arrive * MIN, train: train({ dep: T, arr: T }), ...extra });
  // CEN 10→45 is best. MKT 2→60 and CEN 5→50 leave earlier and arrive later: never the alternative.
  const opts = [o("CEN", 5, 50), o("CEN", 10, 45), o("MKT", 2, 60), o("MKT", 20, 55, { missed: true }), o("CEN", 0, 40, { uncertain: true })];
  assert.deepEqual(core.topPicks(opts, "now").map((j) => [j.hub, (j.arrive - T) / MIN]), [["CEN", 45]], "only one worth recommending");
  // Add later departures: the alternative is the best of those, even on the same route.
  const more = [...opts, o("MKT", 25, 80), o("CEN", 30, 62), o("MKT", 40, 70)];
  assert.deepEqual(core.topPicks(more, "now").map((j) => [j.hub, (j.arrive - T) / MIN]), [["CEN", 45], ["CEN", 62]]);
  // Outside the 20-minute window: the best alone.
  assert.deepEqual(core.topPicks([...opts, o("MKT", 40, 70)], "now").length, 1);
  // Arrive by 17:52: latest leave that's in time, then an earlier one that arrives sooner.
  const by = core.topPicks(more.map((j) => ({ ...j, late: (j.arrive - T) / MIN > 52 })), "by");
  assert.deepEqual(by.map((j) => (j.leave - T) / MIN), [10]);
  const by2 = core.topPicks([...more, o("MKT", 8, 42)].map((j) => ({ ...j, late: (j.arrive - T) / MIN > 52 })), "by");
  assert.deepEqual(by2.map((j) => [j.hub, (j.leave - T) / MIN]), [["CEN", 10], ["MKT", 8]]);
  // Nothing in time: earliest late arrival, then the best later leave.
  const late = core.topPicks(more.map((j) => ({ ...j, late: true })), "by");
  assert.deepEqual(late.map((j) => (j.arrive - T) / MIN), [45, 62]);
  // Arrive by: an earlier train more than 20 minutes before the best isn't offered as the alternative.
  const early = core.topPicks([o("CEN", 10, 45), o("MKT", -15, 30)].map((j) => ({ ...j, late: false })), "by");
  assert.equal(early.length, 1);
});

test("mergeSameTrain: same run across stations is one option; different operators never merge", () => {
  const T = at("2026-11-03", "17:00");
  const a = option({ hub: "MKT", leave: T, arrive: T + 60 * MIN, train: train({ operator: "Metro Rail", dep: T + 20 * MIN, arr: T + 55 * MIN }) });
  const b = option({ hub: "CEN", leave: T - MIN, arrive: T + 60 * MIN, train: train({ operator: "Metro Rail", dep: T + 25 * MIN, arr: T + 55 * MIN }) });
  const c = option({ hub: "CEN", leave: T, arrive: T + 58 * MIN, train: train({ operator: "Express Rail", dep: T + 22 * MIN, arr: T + 55 * MIN }) });
  const out = core.mergeSameTrain([a, b, c], "home", testville);
  assert.equal(out.length, 2);
  const merged = out.find((j) => j.alts);
  assert.equal(merged, a, "same arrival: latest leave is the main option");
  assert.deepEqual(merged.alts, [b]);
});

// ---------- Rules that must always hold (randomised) ----------
function randomOptions(seed, n) {
  let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const T = at("2026-11-03", "17:00"), hubs = ["CEN", "MKT"], ops = ["Express Rail", "Metro Rail"];
  return Array.from({ length: n }, () => {
    const leave = T + Math.floor(rnd() * 90) * MIN, dep = leave + 20 * MIN, len = (20 + Math.floor(rnd() * 30)) * MIN;
    return option({ hub: hubs[Math.floor(rnd() * 2)], leave, arrive: dep + len + 15 * MIN, missed: rnd() < 0.1, uncertain: rnd() < 0.1,
      train: train({ operator: ops[Math.floor(rnd() * 2)], dep, arr: dep + len }) });
  });
}
test("Never hide: merging keeps every train (main + same-train alternatives)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const opts = randomOptions(seed, 12);
    for (const dir of ["home", "office"]) {
      const out = core.mergeSameTrain(opts.map((o) => ({ ...o })), dir, testville);
      const count = out.reduce((s, j) => s + 1 + (j.alts ? j.alts.length : 0), 0);
      assert.equal(count, opts.length, `seed ${seed} ${dir}`);
    }
  }
});
test("Picks: from the options, never missed or uncertain, best first, alternative never strictly worse", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const opts = randomOptions(seed, 10);
    const usable = opts.filter((j) => !j.missed && !j.uncertain);
    const p = core.topPicks(opts, "now");
    assert.ok(p.length <= 2 && p.every((j) => opts.includes(j) && !j.missed && !j.uncertain));
    if (usable.length) assert.equal(p[0].arrive, Math.min(...usable.map((j) => j.arrive)), `seed ${seed}: best arrives first`);
    if (p[1]) assert.ok(p[1].leave > p[0].leave && p[1].arrive >= p[0].arrive && p[1].arrive - p[0].arrive <= 20 * MIN, `seed ${seed}: alternative leaves later, arrives within 20 min`);
    const by = core.topPicks(opts, "by");
    assert.ok(by.length <= 2 && by.every((j) => opts.includes(j) && !j.missed && !j.uncertain));
    if (by[1]) assert.ok(by[1].arrive < by[0].arrive && by[1].leave < by[0].leave && by[0].leave - by[1].leave <= 20 * MIN, `seed ${seed}: by alternative is an earlier, safer train`);
  }
});
test("keepEveryRoute keeps a subset with every route when there is room", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const opts = randomOptions(seed, 9).sort((a, b) => a.arrive - b.arrive);
    const out = core.keepEveryRoute(opts, 5);
    assert.ok(out.every((j) => opts.includes(j)) && out.length === Math.min(5, opts.length));
    for (const h of new Set(opts.map((j) => j.hub))) assert.ok(out.some((j) => j.hub === h), `seed ${seed}`);
  }
});

// ---------- Journeys: one route description, every time computed from it ----------
test("buildOptions: leave, arrive and steps all come from the route's segments (any corridor)", () => {
  const T = at("2026-11-03", "07:00");
  const route = {
    hub: "CEN", board: "RVS-CEN", fromName: "Riverside",
    before: [ { kind: "walk", secs: 900, step: { at: "start", d: "Leave home", note: "walk 15 min" } },
              { kind: "stop", secs: 1200, step: { at: "start", d: "Nursery drop-off", note: "20 min" } },
              { kind: "walk", secs: 300 }, { kind: "margin", secs: 60 } ],
    after: [ { kind: "walk", secs: 600, step: { at: "end", d: "Arrive work", note: "walk 10 min" } } ],
    arriveLabel: "Arrive Central", extra: { custom: "kept" },
  };
  const t = train({ from: "RVS", to: "CEN", std: "07:45", dep: T + 45 * MIN, arr: T + 70 * MIN });
  const [o] = core.buildOptions([route], { "RVS-CEN": { services: [t], msgs: [] } }, testville);
  assert.equal(o.leave, t.dep - (900 + 1200 + 300 + 60) * 1000);
  assert.equal(o.arrive, t.arr + 600 * 1000);
  assert.deepEqual(o.legs.map((l) => l.d), ["Leave home", "Nursery drop-off", "07:45 Express Rail from Riverside", "Arrive Central", "Arrive work"]);
  assert.equal(o.legs[1].t, o.leave + 900 * 1000, "a stop starts after the walk before it");
  assert.equal(o.legs[3].note, "25 min on the train");
  assert.equal(o.custom, "kept");
  assert.equal(core.timeToTrain(route), (900 + 1200 + 300 + 60) * 1000);
  assert.equal(core.minTimeToTrain({ ...route, before: [...route.before, { kind: "wait", secs: 180 }] }), core.timeToTrain(route), "waits don't count towards the earliest catch");
});

test("trainFlags: cancelled, standing room, stopping, delays, unknown — from the profile's rules", () => {
  const T = at("2026-11-03", "06:55");
  const flags = (o) => core.trainFlags(train({ from: "RVS", to: "CEN", dep: T, arr: T + 17 * MIN, ...o }), testville).map((f) => f.txt);
  assert.deepEqual(flags({}), ["Usually standing room only", "On time"]);
  assert.deepEqual(flags({ cancelled: true, reason: "crew" }), ["Cancelled", "Usually standing room only", "crew"]);
  assert.deepEqual(flags({ arr: T + 31 * MIN }), ["Stopping train", "On time"]);
  assert.deepEqual(flags({ arr: T + 17 * MIN, depLate: 12 }), ["Usually standing room only", "12 min late"]);
  assert.deepEqual(flags({ depUnknown: true }), ["Usually standing room only", "Delayed, no estimate: times unknown"]);
  assert.deepEqual(flags({ timetable: true }), ["Usually standing room only"], "timetable: no claim to be on time");
});

test("Train status: red, amber, green by minutes late (green under 2, amber 2–14, red 15+); never 'on time' without live data", () => {
  const st = (o) => { const s = core.trainStatus(train({ dep: 0, arr: 60 * MIN, ...o })); return s && `${s.level}: ${s.text}`; };
  assert.equal(st({}), "ok: On time");
  assert.equal(st({ depLate: 1 }), "ok: 1 min late");
  assert.equal(st({ depLate: 2 }), "warn: 2 min late");
  assert.equal(st({ arrLate: 14 }), "warn: 14 min late");
  assert.equal(st({ arrLate: 15 }), "bad: 15 min late");
  assert.equal(st({ depLate: 3, arrLate: 16 }), "bad: 16 min late", "the worse of departure and arrival");
  assert.equal(st({ cancelled: true, depLate: 3 }), "bad: Cancelled");
  assert.equal(st({ depUnknown: true }), "bad: No estimate");
  assert.equal(st({ arrUnknown: true }), "bad: No estimate");
  assert.equal(st({ timetable: true }), null);
  assert.equal(st({ derived: true }), null);
  assert.equal(st({ estimated: true }), null);
  assert.equal(st({ derived: true, arrLate: 4 }), "warn: 4 min late", "a known delay is still shown");
  const a = (late) => { const s = core.arrivalStatus(T0 + late * MIN, T0); return `${s.level}: ${s.text}`; }, T0 = 1e12;
  assert.equal(a(0), "ok: On time");
  assert.equal(a(1), "ok: On time", "a projection inside the green band reads on time");
  assert.equal(a(-1), "ok: On time");
  assert.equal(a(2), "warn: About 2 min late");
  assert.equal(a(-3), "ok: About 3 min early");
  assert.equal(a(14), "warn: About 14 min late");
  assert.equal(a(15), "bad: About 15 min late");
  assert.equal(core.arrivalStatus(T0 + 1.4 * MIN, T0).level, "ok", "rounded to whole minutes");
  assert.equal(core.arrivalStatus(T0 + 1.6 * MIN, T0).level, "warn");
});

test("bestConnections: per station, the earliest arrival you can still make; ties go to the earlier stop; cancelled never", () => {
  const T = at("2026-11-03", "16:40");
  const o = (hub, dep, arrive, extra) => option({ hub, leave: 0, arrive: T + arrive * MIN, train: train({ dep: T + dep * MIN, arr: T + (arrive - 20) * MIN, ...extra }) });
  const opts = [o("CEN", 16, 82), o("MKT", 21, 82), o("MKT", 38, 75), o("CEN", 10, 70, { cancelled: true }), o("CEN", 12, 90)];
  const reach = { CEN: T + 8 * MIN, MKT: T + 11 * MIN }, ready = { CEN: 5 * MIN, MKT: 7 * MIN };
  const best = core.bestConnections(reach, ready, opts);
  assert.deepEqual(best.map((x) => [x.hub, (x.train.dep - T) / MIN]), [["MKT", 38], ["CEN", 16]]);
  const tie = core.bestConnections(reach, ready, [o("MKT", 21, 82), o("CEN", 16, 82)]);
  assert.deepEqual(tie.map((x) => x.hub), ["CEN", "MKT"], "same arrival: the train that leaves first (earlier stop)");
  assert.deepEqual(core.bestConnections({ CEN: T + 30 * MIN }, { CEN: 0 }, opts).map((x) => (x.train.dep - T) / MIN), [], "nothing left to catch");
});

// ---------- Connections (generic: any station, any frequent service) ----------
test("planConnection: walk counted from arrival; near-platform departures; fastest arrival wins; your pick; spare time", () => {
  const now = at("2026-11-03", "09:00"), m = MIN;
  const dep = (min, line) => ({ t: now + min * m, line });
  // A made-up interchange: the Blue line takes 10 min + 5 walk; the Green line goes to a nearer stop, 12 min + 1 walk.
  const leg = (d) => (d.line === "Blue" ? { stop: "Market", rideMs: 10 * m, tailMs: 5 * m } : d.line === "Green" ? { stop: "Quay", rideMs: 12 * m, tailMs: 1 * m } : null);
  const deps = [dep(0.2, "Blue"), dep(2, "Blue"), dep(5, "Blue"), dep(6, "Green"), dep(9, "Red")];
  let p = core.planConnection({ now, departures: deps, arrivedAt: now - 2 * m, walkMs: 5 * m, leg });
  assert.equal(p.ready, now + 3 * m, "arrived 2 min ago, 5 min walk");
  assert.deepEqual(p.early.map((d) => d.t), [now + 2 * m], "within 30 s isn't offered; before you can reach the platform is 'near the platform'");
  assert.deepEqual(p.next.map((d) => d.line), ["Blue", "Green"], "a line that doesn't take you there is left out");
  assert.equal(p.best.line, "Green", "a later departure that arrives sooner wins (6+12+1 < 5+10+5)");
  assert.equal(p.spareMin, 3); assert.equal(p.chosen, false);
  p = core.planConnection({ now, departures: deps, arrivedAt: null, walkMs: 5 * m, leg });
  assert.equal(p.ready, now + 5 * m, "arrival unknown: from now");
  p = core.planConnection({ now, departures: deps, arrivedAt: now - 2 * m, walkMs: 5 * m, leg, pick: { t: now + 2 * m, line: "Blue" } });
  assert.equal(p.best.t, now + 2 * m); assert.equal(p.chosen, true); assert.equal(p.tight, false, "1 min early isn't flagged");
  p = core.planConnection({ now, departures: [dep(1.5, "Blue"), dep(6, "Blue")], arrivedAt: null, walkMs: 5 * m, leg, pick: { t: now + 1.5 * m, line: "Blue" } });
  assert.equal(p.tight, true, "picked well before you could reach the platform: said, not overruled"); assert.equal(p.best.t, now + 1.5 * m);
  p = core.planConnection({ now, departures: [], arrivedAt: null, walkMs: 5 * m, leg });
  assert.equal(p.best, null);
});

test("Rides: last until your stop or the ride time is over; asked only on a good, fresh fix back where you started", () => {
  const t = at("2026-11-03", "09:00"), m = MIN, from = [50.0, -1.0], stop = [50.02, -1.05];
  const r = { from: "X", t, rideMs: 10 * m, stopGeo: stop };
  const fx = (here, acc, ago, now) => ({ here, acc, at: now - ago });
  assert.equal(core.rideActive(r, t - 60e3, fx(from, 10, 0, t - 60e3)), false, "not left yet");
  assert.equal(core.rideActive(r, t + 5 * m, fx([50.01, -1.02], 30, 0, t + 5 * m)), true);
  assert.equal(core.rideActive(r, t + 9 * m, fx(stop, 15, 0, t + 9 * m)), false, "at your stop");
  assert.equal(core.rideActive(r, t + 21 * m, fx([50.01, -1.02], 30, 0, t + 21 * m)), false, "ride time + 10 min over");
  assert.equal(core.rideDoubtful(r, t + 2 * m, fx(from, 10, 0, t + 2 * m), from, 0.4), false, "too soon to ask");
  assert.equal(core.rideDoubtful(r, t + 4 * m, fx(from, 10, 0, t + 4 * m), from, 0.4), true);
  assert.equal(core.rideDoubtful(r, t + 4 * m, fx(from, 80, 0, t + 4 * m), from, 0.4), false, "rough fix");
  assert.equal(core.rideDoubtful(r, t + 4 * m, fx(from, 10, 2 * m, t + 4 * m), from, 0.4), false, "old fix");
  assert.equal(core.rideDoubtful({ ...r, confirmed: true }, t + 4 * m, fx(from, 10, 0, t + 4 * m), from, 0.4), false, "you said yes");
});
