// Rule tests: thresholds, windows, caches and inference rules, each pinned at its boundary with a frozen clock.
// Written after mutation testing showed these could change without any other test failing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, json, sleep, closeAll, parseJourneyUrl, NEAR_LETCHWORTH } from "./harness.mjs";
import { services, tflResponder, darwinResponder } from "./golden/feeds.mjs";

after(closeAll);
const DAY = "2026-11-03", PREV = "2026-11-02", NEXT = "2026-11-04";
const T = (h, d = DAY) => new Date(`${d}T${h}:00`).getTime();
const MIN = 60e3;
const pad = (n) => String(n).padStart(2, "0");
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const plain = (x) => JSON.parse(JSON.stringify(x));
const OFFICE = { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } };
const RDM = { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120", tflKey: "k" };
const st = (id, name, sev = 10, desc = "Good Service") => ({ id, name, lineStatuses: [{ statusSeverity: sev, statusSeverityDescription: desc }] });

/** A fresh app on the deterministic railway. `tube`: [circleSev, metSev]. `fail(u)` returns a status code to fail a request. */
async function open({ now, geo = OFFICE, settings = { provider: "tfl", tflKey: "k" }, saved = {}, disrupt = {}, tube = [10, 10], fail, extra, tflFilter } = {}) {
  const svcs = [...services(PREV, disrupt), ...services(DAY, disrupt), ...services(NEXT, disrupt)];
  const cur = { t: now };
  const tfl = tflResponder(svcs), dar = darwinResponder(svcs, () => cur.t);
  const route = (u) => {
    const code = fail && fail(u); if (code) return json({}, code);
    const x = extra && extra(u, cur.t); if (x !== undefined) return x;
    if (/darwin\.test/.test(u)) { const b = dar(u); return b ? json(b) : json({}, 404); }
    if (/Line\/circle/.test(u)) return json([st("circle", "Circle", tube[0], tube[0] === 10 ? "Good Service" : tube[0] === 20 ? "Service Closed" : "Severe Delays"),
      st("metropolitan", "Metropolitan", tube[1], tube[1] === 10 ? "Good Service" : tube[1] === 20 ? "Service Closed" : "Severe Delays"), st("hammersmith-city", "Hammersmith & City")]);
    if (/national-rail\/Status/.test(u)) return json([st("great-northern", "Great Northern"), st("thameslink", "Thameslink")]);
    const q = parseJourneyUrl(u);
    if (q && q.from && q.to) { const r = tfl(q); return json(tflFilter ? { journeys: r.journeys.filter((j) => tflFilter(q, j)) } : r); }
    return undefined;
  };
  const app = await createApp({ now, geo, settings, saved: { pace: "avg", ...saved }, route, settle: 600 });
  app.at = (t) => { cur.t = t; app.setNow(t); };
  app.since = (n) => app.calls.slice(n);
  app.moveTo = async (lat, lon, accuracy = 15) => { app.c.onPosition({ coords: { latitude: lat, longitude: lon, accuracy } }); await sleep(400); };
  // A real position update at time t, as the phone sends it (with its own timestamp, and speed when it has one).
  app.fix = async (lat, lon, accuracy, t, speed = null, taken = t) => { app.at(t); app.c.onPosition({ coords: { latitude: lat, longitude: lon, accuracy, speed }, timestamp: taken }); await sleep(300); };
  // Switch view (which first plans for its default time), then set a day and time.
  app.plan = async (v, day, time) => {
    if (app.c.state.saved.view !== v) { app.d.querySelector(`[data-view="${v}"]`).click(); await sleep(500); }
    if (day) { app.d.querySelector("#byDate").value = day; app.d.querySelector("#byTime").value = time;
      app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change")); }
    await sleep(500);
  };
  return app;
}
const darwinCalls = (calls) => calls.filter((u) => /darwin\.test/.test(u));
const journeyCalls = (calls) => calls.map(parseJourneyUrl).filter((q) => q && q.from);
const tr = (o) => Object.assign({ std: hm(o.dep), depLate: 0, arrLate: 0, depUnknown: false, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "" }, o);

// ---------- Leave now: what's kept, what's "missed" ----------
test("liveAdjust: departed trains drop out; a train you'd have to set off within 30 s for can't be made", async () => {
  const now = T("16:30"), app = await open({ now });
  const opt = (dep, leave) => ({ train: tr({ from: "KGX", to: "LET", dep, arr: dep + 30 * MIN }), leave, arrive: dep + 50 * MIN, flags: [] });
  const out = app.c.liveAdjust([opt(now - MIN, now - 20 * MIN), opt(now + 40 * MIN, now + 20e3), opt(now + 40 * MIN, now + 40e3)], now);
  assert.equal(out.length, 2, "the train that left a minute ago is gone");
  assert.equal(out[0].missed, true, "leave in 20 s: too late at walking pace");
  assert.equal(out[0].flags[0].txt, "Can't make it", "no walk to speed up (no route detail): can't make it");
  assert.equal(out[1].missed, false, "leave in 40 s: still makeable");
  app.close();
});

// ---------- Live and timetable mixing ----------
test("mergeBeyond: only timetable trains after the live horizon are added; live trains are never replaced", async () => {
  const app = await open({ now: T("09:00") }), c = app.c;
  const live = { "KGX-LET": { msgs: [], services: [tr({ from: "KGX", to: "LET", dep: T("10:00"), arr: T("10:28"), platform: "9" })] } };
  const tt = { "KGX-LET": { msgs: [], services: [tr({ from: "KGX", to: "LET", dep: T("10:00"), arr: T("10:28"), timetable: true }), tr({ from: "KGX", to: "LET", dep: T("10:01"), arr: T("10:29"), timetable: true }), tr({ from: "KGX", to: "LET", dep: T("10:30"), arr: T("10:58"), timetable: true })] },
               "ZFD-LET": { msgs: [], services: [tr({ from: "ZFD", to: "LET", dep: T("10:45"), arr: T("11:28"), timetable: true })] } };
  assert.equal(c.liveHorizon(live), T("10:00"));
  assert.equal(c.liveHorizon({}), 0);
  const out = plain(c.mergeBeyond(live, tt, T("10:00")));
  assert.deepEqual(out["KGX-LET"].services.map((t) => [hm(t.dep), !!t.timetable]), [["10:00", false], ["10:30", true]], "within a minute of the horizon is the live train");
  assert.deepEqual(out["ZFD-LET"].services.map((t) => hm(t.dep)), ["10:45"], "a board missing from live is created");
  app.close();
});

test("Arrive by with live data: under 100 min reuses the loaded boards; further ahead asks the board from 2 h before, cached 2 min", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM });
  await app.plan("by");
  let n = app.calls.length;
  await app.plan("by", DAY, "17:45");
  assert.equal(darwinCalls(app.since(n)).length, 0, "75 min ahead: the boards already loaded");
  assert.equal(journeyCalls(app.since(n)).length, 0);
  assert.match(app.text("#hero"), /To arrive by 17:45 today · live ·/);
  n = app.calls.length;
  await app.plan("by", DAY, "19:00");
  const d = darwinCalls(app.since(n));
  assert.equal(d.length, 3, "one live board per London station");
  assert.ok(d.every((u) => /timeOffset=30\b/.test(u)), d.join("\n"));
  assert.match(app.text("#hero"), /To arrive by 19:00 today · live to \d\d:\d\d, timetable after/);
  n = app.calls.length;
  await app.plan("by", DAY, "18:59"); await app.plan("by", DAY, "19:00");
  assert.equal(darwinCalls(app.since(n)).filter((u) => /timeOffset=30\b/.test(u)).length, 0, "same plan within 2 min: cached");
  app.at(now + 3 * MIN); n = app.calls.length;
  await app.plan("by", DAY, "18:59"); await app.plan("by", DAY, "19:00");
  assert.ok(darwinCalls(app.since(n)).some((u) => /timeOffset=27\b/.test(u)), "after 2 min: asked again");
  app.close();
});

test("Leave around with live data: the live board is used while its start is within 119 min; beyond that, the timetable", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM });
  await app.plan("at");
  let n = app.calls.length;
  await app.plan("at", DAY, "18:40");
  assert.ok(darwinCalls(app.since(n)).every((u) => /timeOffset=115\b/.test(u)) && darwinCalls(app.since(n)).length === 3);
  n = app.calls.length;
  await app.plan("at", DAY, "18:50");
  assert.equal(darwinCalls(app.since(n)).length, 0, "start 125 min ahead: no live board");
  assert.match(app.text("#hero"), /Leaving around 18:50 today · timetable ·/);
  app.close();
});

// ---------- Direction, stations, tube ----------
test("Direction: nearest end when there's no trip; a trip keeps its direction for 3 hours", async () => {
  const now = T("12:00"), app = await open({ now, geo: null, saved: { dirMode: "auto" } });
  await app.moveTo(51.763, -0.215, 30);     // Hatfield: nearer Letchworth
  assert.equal(app.c.direction(), "office");
  await app.moveTo(51.690, -0.180, 30);     // Potters Bar area: nearer Aldgate
  assert.equal(app.c.direction(), "home");
  app.close();
  const sticky = await open({ now, geo: null, saved: { dirMode: "auto", trip: { dir: "office", at: now - 2 * 3600e3 } } });
  await sticky.moveTo(51.690, -0.180, 30);
  assert.equal(sticky.c.direction(), "office", "trip started 2 h ago: still heading to work");
  sticky.close();
  const old = await open({ now, geo: null, saved: { dirMode: "auto", trip: { dir: "office", at: now - 4 * 3600e3 } } });
  await old.moveTo(51.690, -0.180, 30);
  assert.equal(old.c.direction(), "home", "trip 4 h old: nearest end again");
  old.close();
});

test("Direction change while planning Arrive by plans again for the new direction", async () => {
  const now = T("17:00"), app = await open({ now, geo: NEAR_LETCHWORTH });
  await app.plan("by", DAY, "18:30");
  const n = app.calls.length;
  app.c.state.saved.officeSince = now - 6 * 60e3;
  await app.moveTo(51.5139, -0.0710, 10);    // at the office for 5+ min: heading home
  await sleep(300);
  const q = journeyCalls(app.since(n));
  assert.ok(q.some((x) => x.to === "LET" && x.timeIs === "Arriving"), "arriving searches towards Letchworth:\n" + JSON.stringify(q));
  app.close();
});

test("At a London station: within 400 m, and only with a fix good to 250 m", async () => {
  const now = T("08:00"), app = await open({ now, geo: null, saved: { dirMode: "office" } });
  await app.moveTo(51.5308, -0.1238, 15); assert.equal(app.c.hubHere(), "KGX");
  await app.moveTo(51.5308 + 0.0063, -0.1238, 15); assert.equal(app.c.hubHere(), null, "700 m away");
  await app.moveTo(51.5308, -0.1238, 400); assert.equal(app.c.hubHere(), null, "poor fix");
  await app.moveTo(51.5203, -0.1053, 20); assert.equal(app.c.hubHere(), "ZFD");
  app.close();
});

test("On the tube: within 25 min of the station, a tube has left, and either you've left the station or the fix is over 90 s old", async () => {
  const now = T("08:20"), app = await open({ now, geo: null, saved: { dirMode: "office" } }), c = app.c;
  const lh = (seenAgo) => ({ hub: "KGX", seen: now - seenAgo * MIN, arrivals: [{ t: now - (seenAgo - 1) * MIN, line: "Met", lineId: "metropolitan", vehicle: "m1" }] });
  try {
    c.state.atHub = null; c.state.here = [51.52, -0.10]; c.state.lastFixAt = now;
    c.state.lastHub = lh(10); assert.equal(c.onTubeAuto(now), true);
    c.state.lastHub = lh(26); assert.equal(c.onTubeAuto(now), false, "26 min ago: no longer assumed");
    c.state.lastHub = { ...lh(10), arrivals: [{ t: now + 2 * MIN }] }; assert.equal(c.onTubeAuto(now), false, "no tube has left yet");
    c.state.lastHub = lh(10); c.state.atHub = "KGX";
    c.state.lastFixAt = now - 30e3; assert.equal(c.onTubeAuto(now), false, "still at the station with a fresh fix");
    c.state.lastFixAt = now - 120e3; assert.equal(c.onTubeAuto(now), true, "no fix for 2 min underground");
    c.state.atHub = null; c.state.here = [51.5142, -0.0755]; assert.equal(c.onTubeAuto(now), false, "at Aldgate: off the tube");
  } finally { c.state.lastHub = null; c.state.atHub = null; }
  app.close();
});

test("Which tube: the one that left nearest to when you were last seen; a second within 3 min is 'or'", async () => {
  const now = T("08:20"), app = await open({ now, geo: null, saved: { dirMode: "office" } }), c = app.c;
  const seen = now - 10 * MIN, a = (m, line) => ({ t: seen + m * MIN, line, lineId: line === "Met" ? "metropolitan" : "circle", vehicle: line + m });
  c.state.lastHub = { hub: "KGX", seen, arrivals: [a(1, "Met"), a(3, "Circle"), a(20, "Met")] };
  let w = c.whichTube(now);
  assert.equal(w.best.line, "Met"); assert.equal(w.other.line, "Circle");
  c.state.lastHub = { hub: "KGX", seen, arrivals: [a(1, "Met"), a(5, "Circle")] };
  w = c.whichTube(now);
  assert.equal(w.best.line, "Met"); assert.equal(w.other, undefined);
  c.state.lastHub = null;
  app.close();
});

test("On the train: 'sure' only if the next train is 4+ min further off; nothing within 10 min means no match", async () => {
  const now = T("07:30"), app = await open({ now, geo: null, saved: { dirMode: "office" } }), c = app.c;
  const pt = [51.80, -0.20], len = 30 * MIN, f = c.lineProgress(pt, "KGX").frac;
  const at = (offMin, op = "Great Northern") => { const dep = now - f * len + offMin * MIN; return tr({ from: "LET", to: "KGX", dep, arr: dep + len, operator: op }); };
  c.state.here = pt; c.state.locAcc = 20; c.state.onLine = true;
  try {
    c.state.boards = { "LET-KGX": { msgs: [], services: [at(0.5), at(-1.5, "Thameslink")] } };
    let w = c.whichTrain(now);
    assert.equal(w.sure, false); assert.equal(w.other.t.operator, "Thameslink");
    c.state.boards = { "LET-KGX": { msgs: [], services: [at(0.5), at(-5, "Thameslink")] } };
    w = c.whichTrain(now);
    assert.equal(w.sure, true); assert.equal(w.other, null);
    c.state.boards = { "LET-KGX": { msgs: [], services: [at(-11)] } };
    const none = c.whichTrain(now);
    assert.equal(none.none, true, "11 min off: no match");
    assert.equal(none.others.length, 1, "but it's offered to pick");
    c.state.boards = { "LET-KGX": { msgs: [], services: [at(-9)] } };
    assert.ok(!c.whichTrain(now).none, "9 min off: still a match");
  } finally { c.state.onLine = false; c.state.here = null; }
  app.close();
});

// ---------- Leave around and Arrive by windows ----------
test("Leave around: listed from 15 min before; recommended only from 10 min before", async () => {
  const now = T("15:00"), app = await open({ now });
  await app.plan("at", DAY, "17:44");
  const rows = app.rows();
  const tl = rows.find((r) => /17:56 Thameslink/.test(r));
  assert.ok(tl, rows.join("\n"));
  assert.match(tl, /Leave 1[12] min before 17:44/);
  assert.ok(!rows.some((r) => /17:48 Great Northern/.test(r)), "leaving 25 min before: not listed");
  assert.doesNotMatch(app.text("#hero"), /17:56 Thameslink/, "12 min before: listed but not on the card");
  app.close();
});

test("Arrive by: walk from where you are only when the target is within 3 hours", async () => {
  const now = T("06:00"), app = await open({ now, geo: { coords: { latitude: 51.9772, longitude: -0.2290, accuracy: 10 } }, saved: { dirMode: "office" } });
  await app.plan("by", DAY, "08:30");
  assert.match(app.text("#hero"), /Set off from where you are/);
  await app.plan("by", DAY, "09:30");
  assert.match(app.text("#hero"), /Leave Cartref/);
  app.close();
});

// ---------- Tube status ----------
test("Aldgate East only when Circle and Met are both closed; severe delays on both are a 'bad' flag", async () => {
  const one = await open({ now: T("07:00"), geo: NEAR_LETCHWORTH, tube: [20, 10] });
  assert.equal(one.c.aldgateUnusable(), false);
  assert.doesNotMatch(one.text("#hero") + one.rows().join(" "), /H&C/);
  one.close();
  const both = await open({ now: T("07:00"), geo: NEAR_LETCHWORTH, tube: [20, 20] });
  assert.equal(both.c.aldgateUnusable(), true);
  const o = both.c.buildJourneys("office", T("07:00"), {});
  assert.ok(o.every((j) => j.flags.some((f) => f.txt === "Via Aldgate East: Circle and Met closed")));
  assert.ok(o.every((j) => j.legs.some((l) => /H&C to Aldgate East/.test(l.d))));
  both.close();
  const slow = await open({ now: T("07:00"), geo: NEAR_LETCHWORTH, tube: [6, 6] });
  const s = slow.c.buildJourneys("office", T("07:00"), {});
  assert.ok(s.every((j) => j.flags.some((f) => f.lvl === "bad" && f.txt === "Circle: Severe Delays · Metropolitan: Severe Delays")));
  slow.close();
  const half = await open({ now: T("07:00"), geo: NEAR_LETCHWORTH, tube: [6, 10] });
  assert.ok(half.c.buildJourneys("office", T("07:00"), {}).every((j) => j.flags.some((f) => f.lvl === "warn" && f.txt === "Circle: Severe Delays")));
  half.close();
});

// ---------- Disruption counts ----------
test("'Your line is disrupted' needs 2 affected trains; trains that left over 5 min ago don't count", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM }), c = app.c;
  const t = (depMin, o) => tr({ from: "KGX", to: "LET", dep: now + depMin * MIN, arr: now + (depMin + 30) * MIN, ...o });
  c.state.boards = { "KGX-LET": { msgs: [], services: [t(10, { depLate: 6 }), t(40)] }, "STP-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [] } };
  let w = c.railWarnings(); assert.equal(w.affected, 1); assert.equal(w.hit, false);
  c.state.boards["KGX-LET"].services.push(t(-10, { cancelled: true }), t(-4, { cancelled: true }));
  w = c.railWarnings(); assert.equal(w.cancelled.length, 1, "the one that left 10 min ago isn't counted"); assert.equal(w.affected, 2); assert.equal(w.hit, true);
  app.close();
});

// ---------- Leisure: the London leg ----------
test("Leisure home: the quickest TfL journey to each station is used; one station failing still plans the other; both failing says why", async () => {
  const now = T("15:00");
  const leg = (mins, name) => ({ arrivalDateTime: new Date(now + mins * 60e3).toISOString(), duration: mins, legs: [{ mode: { id: "tube", name: "tube" }, duration: mins, routeOptions: [{ name }] }] });
  const plan = (far) => (u) => {
    const m = /JourneyResults\/[^/]+\/to\/(940GZZLU\w+)/.exec(u); if (!m) return undefined;
    if (m[1] === "940GZZLUFCN") return far;
    return json({ journeys: [leg(25, "Victoria"), leg(15, "Northern"), leg(20, "Piccadilly")] });
  };
  const soho = { coords: { latitude: 51.513, longitude: -0.135, accuracy: 20 } };
  const a = await open({ now, geo: soho, saved: { mode: "leisure", dirMode: "home" }, extra: plan(json({}, 500)) });
  assert.equal(a.c.state.london.KXSP.summary, "Northern 15m", "earliest arrival, not first listed");
  assert.equal(a.c.state.london.FAR, null);
  assert.ok(a.rows().some((r) => /Northern 15m/.test(r)) && !a.rows().some((r) => /via Farringdon/.test(r)));
  a.close();
  const b = await open({ now, geo: soho, saved: { mode: "leisure", dirMode: "home" },
    extra: (u) => (/JourneyResults\/[^/]+\/to\/940GZZLU/.test(u) ? json({}, 300) : undefined) });
  assert.match(b.text("#hero"), /TfL couldn't pin down that place. Try a full postcode./);
  b.close();
});

// ---------- Keeping what worked ----------
test("Live: a board that fails keeps its last good trains; the timetable route that fails keeps its last trains too", async () => {
  const now = T("16:30");
  let failKgx = false;
  const app = await open({ now, settings: RDM, fail: (u) => (failKgx && /GetDepBoardWithDetails\/KGX/.test(u) ? 500 : 0) });
  const before = app.c.state.boards["KGX-LET"].services.length;
  assert.ok(before > 0);
  failKgx = true; await app.c.refresh({ force: true });
  assert.equal(app.c.state.boards["KGX-LET"].services.length, before);
  assert.match(app.banners().join(" "), /National Rail feed error \(HTTP 500\)/);
  app.close();
  let failTt = false;
  const tt = await open({ now, fail: (u) => (failTt && /JourneyResults\/51\.53197/.test(u) ? 500 : 0) });
  const kx = tt.c.state.boards["KGX-LET"].services.length;
  failTt = true; tt.at(now + 6 * MIN); await tt.c.refresh({ force: true });
  assert.equal(tt.c.state.boards["KGX-LET"].services.length, kx, "King's Cross trains kept from the last load");
  assert.ok(tt.c.state.routeFailed["KGX-LET"]);
  tt.close();
});

test("Route retry: a route that failed in Arrive by is fetched again on its own", async () => {
  const now = T("06:00");
  let failZfd = true;
  const app = await open({ now, geo: NEAR_LETCHWORTH, saved: { dirMode: "office" }, fail: (u) => (failZfd && /\/to\/51\.52036/.test(u) ? 500 : 0) });
  await app.plan("by", DAY, "08:30");
  assert.match(app.banners().join(" "), /Farringdon trains not loaded/);
  failZfd = false; const n = app.calls.length;
  await sleep(5600);
  const q = journeyCalls(app.since(n));
  assert.ok(q.some((x) => x.to === "ZFD"), "Farringdon searched again");
  assert.ok(!q.some((x) => x.to === "KGX"), "King's Cross, which loaded, isn't searched again");
  assert.ok(q.filter((x) => x.to === "STP").length <= 3, "only St Pancras stops no other search found: " + JSON.stringify(q));
  assert.doesNotMatch(app.banners().join(" "), /not loaded/);
  app.close();
});

// ---------- Throttling and staleness ----------
test("Automatic refreshes: none within 30 s; after that, live boards again (timetable reused for 5 min)", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM });
  let n = app.calls.length;
  app.at(now + 10e3); await app.c.refresh(); assert.equal(app.since(n).length, 0);
  app.at(now + 31e3); await app.c.refresh(); assert.equal(darwinCalls(app.since(n)).length, 3);
  app.close();
  const tt = await open({ now });
  n = tt.calls.length;
  tt.at(now + 2 * MIN); await tt.c.refresh(); assert.equal(journeyCalls(tt.since(n)).length, 0, "timetable reused");
  tt.at(now + 6 * MIN); await tt.c.refresh(); assert.ok(journeyCalls(tt.since(n)).length > 0, "after 5 min, searched again");
  tt.close();
});

test("'Train times may be out of date' after 3 minutes without an update", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM });
  app.at(now + 2.5 * MIN); app.c.render(); assert.doesNotMatch(app.banners().join(" "), /may be out of date/);
  app.at(now + 3.5 * MIN); app.c.render(); assert.match(app.banners().join(" "), /Train times may be out of date/);
  app.close();
});

test("Elsewhere in London: the TfL plan to the office is reused for 2 min unless you move 300 m", async () => {
  const now = T("09:00");
  const app = await open({ now, geo: { coords: { latitude: 51.5154, longitude: -0.1410, accuracy: 20 } }, settings: RDM, saved: { dirMode: "office" },
    extra: (u, t) => (/JourneyResults\/51\.5\d+,-0\.1\d+\/to\/51\.5139,-0\.071/.test(u) ? json({ journeys: [{ arrivalDateTime: new Date(t + 25 * MIN).toISOString(), legs: [{ mode: { id: "walking" }, duration: 25 }] }] }) : undefined) });
  const toOffice = () => app.calls.filter((u) => /\/to\/51\.5139,-0\.071/.test(u)).length;
  const first = toOffice(); assert.equal(first, 1);
  app.at(now + MIN); await app.c.refresh({ force: true }); assert.equal(toOffice(), 1, "1 min later, same place: reused");
  app.at(now + 3 * MIN); await app.c.refresh({ force: true }); assert.equal(toOffice(), 2, "3 min later: planned again");
  app.close();
});

// ---------- Timetable search plan ----------
test("Timetable search plan without a key: one search per route, a second 30 min later only for a route with under 2 trains", async () => {
  const now = T("16:30");
  const app = await open({ now, settings: { provider: "tfl" }, tflFilter: (q, j) => q.from !== "ZFD" || j.legs.length !== 1 || /T16:56/.test(j.legs[0].departureTime) });
  const q = journeyCalls(app.calls);
  const zfd = q.filter((x) => x.from === "ZFD"), kgx = q.filter((x) => x.from === "KGX");
  assert.equal(kgx.length, 1);
  assert.equal(zfd.length, 2, "Farringdon came back with 1 train: one more search");
  assert.equal(zfd[1].t - zfd[0].t, 30 * MIN);
  app.close();
});

test("Timetable with a key, to work: a train found only at Farringdon is looked for at St Pancras, from a minute before it leaves Letchworth", async () => {
  const now = T("06:30");
  const app = await open({ now, geo: NEAR_LETCHWORTH, saved: { dirMode: "office" },
    tflFilter: (q, j) => !(q.to === "KGX" && j.legs[0].arrivalPoint && /Pancras/.test(j.legs[0].arrivalPoint.commonName)) });
  const pairs = journeyCalls(app.calls).filter((x) => x.to === "STP");
  assert.ok(pairs.length > 0, "searched St Pancras");
  assert.ok(pairs.some((x) => hm(x.t) === "06:49"), pairs.map((x) => hm(x.t)).join(", "));
  assert.ok(app.rows().some((r) => /Get off at St Pancras 07:29 or Farringdon 07:34/.test(r)), app.rows().join("\n"));
  app.close();
});

// ---------- README rules ----------
test("TfL rate limit: no TfL requests for a minute, then they resume", async () => {
  const now = T("16:30");
  let limited = true;
  const app = await open({ now, fail: (u) => (limited && /api\.tfl\.gov\.uk/.test(u) ? 429 : 0) });
  const tflCalls = () => app.calls.filter((u) => /api\.tfl\.gov\.uk/.test(u)).length;
  const first = tflCalls(); assert.ok(first >= 1);
  limited = false;
  app.at(now + 40e3); await app.c.refresh({ force: true });
  assert.equal(tflCalls(), first, "40 s later: still backing off");
  app.at(now + 61e3); await app.c.refresh({ force: true });
  assert.ok(tflCalls() > first, "after a minute: requests again");
  assert.ok(app.rows().some((r) => /^Leave/.test(r)));
  app.close();
});

test("Requests time out after 12 s by default", async () => {
  const app = await createApp({ settings: { provider: "demo" }, timeoutMs: 0 });
  app.w.COMMUTE_FETCH_TIMEOUT_MS = undefined;
  const src = app.w.document.documentElement.innerHTML;
  assert.match(src, /const FETCH_TIMEOUT = \(\) => \(window\.COMMUTE_FETCH_TIMEOUT_MS \|\| 12000\);/);
  app.close();
});

test("Arrive by without a key: the third search per route starts early enough for that route's slowest train (+15 min)", async () => {
  const now = T("06:00"), app = await open({ now, geo: NEAR_LETCHWORTH, settings: { provider: "tfl" }, saved: { dirMode: "office" } });
  const n = app.calls.length;
  await app.plan("by", DAY, "08:30");   // also the view's default, so one plan
  const q = journeyCalls(app.since(n));
  for (const [to, slowest] of [["KGX", 55], ["ZFD", 60]]) {
    const mine = q.filter((x) => x.to === to);
    const arriving = mine.find((x) => x.timeIs === "Arriving"), early = mine.filter((x) => x.timeIs === "Departing").sort((a, b) => a.t - b.t)[0];
    assert.ok(arriving && early, JSON.stringify(mine));
    assert.equal((arriving.t - early.t) / MIN, slowest + 15, `${to}: ${JSON.stringify(mine)}`);
  }
  app.close();
});

test("Leisure home: no trains are offered until the London leg is planned", async () => {
  const now = T("15:00");
  const app = await open({ now, geo: { coords: { latitude: 51.513, longitude: -0.135, accuracy: 20 } }, saved: { mode: "leisure", dirMode: "home" },
    extra: (u) => (/JourneyResults\/[^/]+\/to\/940GZZLU/.test(u) ? json({}, 500) : undefined) });
  assert.equal(app.c.state.london, null);
  assert.equal(app.c.buildLeisure("home", now, {}).length, 0);
  assert.ok(!app.rows().some((r) => /^Leave/.test(r)), app.rows().join("\n"));
  app.close();
});

test("Live board start offset is kept within what the feed allows (-120 to 119 min)", async () => {
  const now = T("16:30"), app = await open({ now, settings: RDM });
  let n = app.calls.length;
  await app.c.fetchLiveAhead(-200); assert.ok(darwinCalls(app.since(n)).every((u) => /timeOffset=-120\b/.test(u)) && darwinCalls(app.since(n)).length === 3);
  n = app.calls.length;
  await app.c.fetchLiveAhead(300); assert.ok(darwinCalls(app.since(n)).every((u) => /timeOffset=119\b/.test(u)));
  app.close();
});

// ---------- Notices ----------
test("Notices: links are tappable (with or without https://, full stop left outside); an opened notice stays open when the screen refreshes", async () => {
  const now = T("17:30"), app = await open({ now, settings: RDM }), c = app.c;
  c.state.boards["KGX-LET"].msgs = ["Disruption between Hitchin and Stevenage. See nationalrail.co.uk/status/gn for details.",
    "Engineering at Finsbury Park: https://www.nationalrail.co.uk/travel-updates/engineering?x=1&y=2."];
  c.render();
  const isNotice = (d) => /Hitchin|Finsbury Park/.test(d.querySelector("summary").textContent);
  const banner = [...app.d.querySelectorAll("#banners details")].filter(isNotice);
  assert.equal(banner.length, 2);
  const links = [...app.d.querySelectorAll("#banners a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(links, ["https://nationalrail.co.uk/status/gn", "https://www.nationalrail.co.uk/travel-updates/engineering?x=1&y=2"]);
  assert.match(banner[0].textContent, /National Rail details for details\./);
  // Open the second notice and a card's Journey steps, then redraw twice.
  banner[1].open = true; banner[1].dispatchEvent(new app.w.Event("toggle"));
  const steps = app.d.querySelector("#hero details.steps"); steps.open = true; steps.dispatchEvent(new app.w.Event("toggle"));
  c.render(); app.at(now + 20e3); c.render();
  const after = [...app.d.querySelectorAll("#banners details")].filter(isNotice);
  assert.deepEqual(after.map((d) => d.open), [false, true], "the one you opened is still open, the other still closed");
  assert.equal(app.d.querySelector("#hero details.steps").open, true);
  // Closing it sticks too.
  after[1].open = false; after[1].dispatchEvent(new app.w.Event("toggle")); c.render();
  assert.equal([...app.d.querySelectorAll("#banners details")].filter(isNotice)[1].open, false);
  app.close();
});

test("Coming home: near Letchworth stays 'home' (Nearly home) for 3 hours after heading home; next morning it's work again", async () => {
  const now = T("19:40"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto" } });
  await app.moveTo(51.5139, -0.0710, 10);          // at the office
  assert.equal(app.c.direction(), "home");
  await app.moveTo(51.690, -0.180, 30);            // on the way
  app.at(T("20:20"));
  await app.moveTo(51.9700, -0.2400, 20);          // near Letchworth, just off the line
  assert.equal(app.c.direction(), "home", "arriving, not setting off");
  assert.match(app.text("#hero"), /^Nearly home · 20:20/);
  assert.doesNotMatch(app.text("#hero"), /Arrive office/);
  app.close();
  const morning = await open({ now: T("07:00", NEXT), geo: null, settings: RDM, saved: { dirMode: "auto", trip: { dir: "home", at: T("20:20") } } });
  await morning.moveTo(51.9700, -0.2400, 20);
  assert.equal(morning.c.direction(), "office", "11 hours later: setting off for work");
  morning.close();
});

test("Nearly home on your train: home time = the train's expected Letchworth time + exit + walk", async () => {
  const now = T("20:14"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home" } }), c = app.c;
  const t = { from: "KGX", to: "LET", std: "19:48", dep: T("19:50"), arr: T("20:18"), depLate: 2, arrLate: 2, depUnknown: false, platform: "1", operator: "Great Northern", cancelled: false, reason: "" };
  c.state.boards = { "KGX-LET": { msgs: [], services: [t] }, "STP-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [] } };
  c.state.trainLock = { operator: "Great Northern", std: "19:48", from: "KGX" };
  c.state.here = [51.9700, -0.2400]; c.state.locAcc = 20; c.state.onLine = false;
  c.render();
  const s = c.S(), walk = s.walkStationHomeAvg + s.letExit;
  assert.match(app.text("#hero"), new RegExp(`Nearly home · 20:14 ?${hm(T("20:18") + walk * 1000)} ?at home On the 19:48 Great Northern About 2 min late Letchworth 20:18 expected`));
  assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst ok", "2 min late is green (amber from 5, Sam 30 Oct)");
  t.arr = T("20:21"); t.arrLate = 5; c.render();
  assert.match(app.text("#hero"), /On the 19:48 Great Northern About 5 min late/);
  assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst warn", "5 min late is amber");
  t.arr = T("20:17"); t.arrLate = 1; c.render();
  assert.match(app.text("#hero"), /On the 19:48 Great Northern On time Letchworth 20:17 expected/, "1 min: green, on time");
  assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst ok");
  t.timetable = true; c.render();
  assert.equal(app.w.document.querySelector("#hero .slackst"), null, "a timetable train is never claimed on time");
  assert.equal(app.w.document.querySelector("#hero .slack").className, "slack", "the identity part is never a status colour");
  t.serviceId = "S1"; c.state.progressById = { S1: { at: now, data: app.w.CommuteCore.parseServiceDetails({ crs: "KGX", std: "19:48", atd: "19:50", subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: "20:16", et: "20:21" }] }] }, now) } };
  c.render();
  assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst warn", "a timetable train with Service Details does get its status");
  c.state.progressById = {};
  c.state.here = null; c.state.trainLock = null;
  app.close();
});

test("Home location: set from where you are; Nearly home counts the walk from there, and says when you're home", async () => {
  const now = T("20:25"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home", home: null } }), c = app.c;
  await app.moveTo(51.9752, -0.2402, 200);
  app.d.querySelector("#setHomeBtn").click();
  assert.equal(c.state.saved.home, null, "fix not good enough");
  await app.moveTo(51.9752, -0.2402, 10);
  app.d.querySelector("#setHomeBtn").click();
  assert.deepEqual(plain(c.state.saved.home), [51.9752, -0.2402]);
  await app.moveTo(51.9799, -0.2290, 10);          // Letchworth station, about 900 m away
  const d = 0.9; // km, roughly
  const hero = app.text("#hero");
  assert.match(hero, /^Nearly home · 20:25/);
  const m = /About (\d+) min walk from where you are/.exec(hero); assert.ok(m, hero);
  assert.ok(+m[1] >= 11 && +m[1] <= 16, `walk ${m[1]} min for ~${d} km × 1.3 at 5 km/h`);
  await app.moveTo(51.9753, -0.2401, 10);
  assert.match(app.text("#hero"), /You're home\./);
  app.close();
});

test("Tube going home: at Aldgate the next tube is noted; underground the card says which tube and where to get off", async () => {
  const t0 = T("16:36");
  const deps = (now) => [["metropolitan", "Westbound - Platform 1", "Uxbridge", T("16:41")], ["circle", "Westbound - Platform 2", "Hammersmith", T("16:46")], ["circle", "Eastbound - Platform 3", "Tower Hill", T("16:40")]]
    .map(([lineId, platformName, dest, t]) => ({ vehicleId: lineId + t, lineId, platformName, destinationName: dest + " Underground Station", expectedArrival: new Date(t).toISOString(), timeToStation: Math.round((t - now) / 1000) }));
  const app = await open({ now: t0, geo: OFFICE, settings: RDM, extra: (u, now) => (/StopPoint\/940GZZLUALD\/Arrivals/.test(u) ? json(deps(now)) : undefined) });
  assert.equal(app.c.direction(), "home");
  // 16:36 at the office: the 16:41 Met needs leaving by 16:32, too late; the 16:46 Circle is the next you can make.
  assert.match(app.text("#hero"), /Tubes from Aldgate \(live\)Circle 16:46 → King's Cross 16:56: 17:18 Great Northern, home \d\d:\d\d · leave the office by 16:37/);
  assert.doesNotMatch(app.text("#hero"), /Met 16:41 →/);
  assert.doesNotMatch(app.text("#hero"), /Tower Hill|16:40/, "eastbound tubes ignored");
  app.at(T("16:39")); await app.moveTo(51.5142, -0.0755, 10);        // at Aldgate
  await app.c.refresh({ force: true });
  assert.ok(app.c.state.saved.aldHome && app.c.state.saved.aldHome.seen === T("16:39"));
  app.at(T("16:45")); app.c.render();                                   // underground: no fix for 6 min
  const hero = app.text("#hero");
  assert.match(hero, /^On the tube · 16:45 · worked out from when you left Aldgate/);
  assert.match(hero, /Probably the Met to Uxbridge that left Aldgate at 16:41/);
  assert.match(hero, /Get off at Farringdon 16:48 → 16:56 Thameslink · platform 4 · home (\d\d:\d\d)/);
  assert.match(hero, /or get off at King's Cross 16:51 → .* \(\d+ min later\)/);
  app.close();
});

test("Going home, 30 Oct 18:24: at Aldgate the card plans from the platform, not the office; the status line says Aldgate", async () => {
  const app = await open({ now: T("16:36"), geo: OFFICE, settings: RDM }), c = app.c;
  assert.equal(c.direction(), "home");
  const leaveFor = (o) => { const j = c.ranked(Date.now()).find(x => x.train.std === o.train.std && x.train.from === o.train.from); return j && j.leave; };
  const first = c.ranked(Date.now()).find(o => o.recommended === 1), atDesk = leaveFor(first);
  assert.match(app.text("#hero"), /Leave office/);
  await app.moveTo(51.5142, -0.0755, 7);                                  // on the platform at Aldgate, ±7 m
  assert.match(app.text("#dirNote"), /^Heading home · you're at Aldgate \(±7 m\)/);
  assert.equal(leaveFor(first), atDesk + 420e3, "the 7-minute walk from the office is gone; the platform walk stays");
  const steps = c.routesFor("home", "commute", { here: true });
  assert.ok(steps.every(r => /^You're at Aldgate: go to the platform/.test(r.before[0].step.d)), steps.map(r => r.before[0].step && r.before[0].step.d).join());
  await app.moveTo(51.5142, -0.0755, 200);                                // a rough fix doesn't place you at Aldgate
  assert.doesNotMatch(app.text("#dirNote"), /Aldgate/);
  assert.equal(leaveFor(first), atDesk);
  app.close();
});

// ---------- Gaps found by deliberately breaking tonight's code ----------
const trn = (o) => Object.assign({ depLate: 0, arrLate: 0, depUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "" }, o);

test("At Letchworth station going to work, Leave now is a departure board too", async () => {
  const app = await open({ now: T("07:00"), geo: { coords: { latitude: 51.9800, longitude: -0.2292, accuracy: 15 } }, settings: RDM, saved: { dirMode: "office" } });
  assert.match(app.text("#hero"), /^You're at Letchworth · departures · 07:00/);
  assert.match(app.text("#hero"), /Train ?07:\d\d Expected ?On time At office ?\d\d:\d\d/);
  app.close();
});

test("On the train: a train that hasn't left is never yours, even if it fits best by timetable", async () => {
  const now = T("20:00"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home" } }), c = app.c, m = 60e3;
  // You're ~2.5 km out of King's Cross. The 20:01 hasn't left; the 19:48 is well behind its timetable.
  c.state.boards = { "KGX-LET": { msgs: [], services: [trn({ from: "KGX", to: "LET", std: "20:01", dep: T("20:01"), arr: T("20:29") }), trn({ from: "KGX", to: "LET", std: "19:48", dep: T("19:48"), arr: T("20:16") })] }, "STP-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [] } };
  c.state.here = [51.5530, -0.1120]; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = null;
  const w = c.whichTrain(now);
  assert.ok(w.none || w.t.std === "19:48", JSON.stringify(w.t && w.t.std));
  assert.notEqual(w.t && w.t.std, "20:01");
  c.state.onLine = false; c.state.here = null; app.close();
});

test("On the train: once sure it stays with your train, but lets go when you're more than 12 min from it", async () => {
  const now = T("19:50"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c, m = 60e3;
  const pt = [51.80, -0.20], f = c.lineProgress(pt, "KGX").frac, len = 30 * m;
  const at = (offMin, std, op) => { const dep = now - f * len + offMin * m; return trn({ from: "LET", to: "KGX", std, dep, arr: dep + len, operator: op }); };
  c.state.boards = { "LET-KGX": { msgs: [], services: [at(0, "A", "Great Northern"), at(-14, "B", "Thameslink")] }, "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.here = pt; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = { operator: "Great Northern", std: "A", from: "LET" };
  assert.equal(c.whichTrain(now).t.std, "A");
  c.state.boards["LET-KGX"].services = [at(-15, "A", "Great Northern"), at(-0.5, "B", "Thameslink")];
  assert.equal(c.whichTrain(now).t.std, "B", "15 min off: let go");
  c.state.trainLock = { operator: "Great Northern", std: "A", from: "LET" };
  c.state.boards["LET-KGX"].services = [at(-15, "A", "Great Northern"), at(-9.5, "B", "Thameslink")];
  assert.equal(c.whichTrain(now).t.std, "B", "15 min off lets go even when nothing is 6 min nearer");
  c.state.trainLock = { operator: "Great Northern", std: "A", from: "LET" };
  c.state.boards["LET-KGX"].services = [at(-11, "A", "Great Northern"), at(-6, "B", "Thameslink")];
  assert.equal(c.whichTrain(now).t.std, "A", "11 min off, nothing 6 min nearer: kept");
  c.state.onLine = false; c.state.here = null; c.state.trainLock = null; app.close();
});

test("On the train card: arrival from Service Details; 'timetable' is the scheduled time", async () => {
  const now = T("20:03"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home" } }), c = app.c, P = app.w.CommuteCore;
  const t = trn({ from: "KGX", to: "LET", std: "19:48", dep: T("19:50"), arr: T("20:18"), depLate: 2, arrLate: 2, serviceId: "S1" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [t] }, "STP-LET": { msgs: [], services: [] }, "ZFD-LET": { msgs: [], services: [] } };
  c.state.here = [51.7638, -0.2156]; c.state.locAcc = 20; c.state.onLine = true; c.state.trainLock = { operator: "Great Northern", std: "19:48", from: "KGX", picked: true };
  c.state.progressById = { S1: { at: now, data: P.parseServiceDetails({ crs: "KGX", std: "19:48", atd: "19:50", subsequentCallingPoints: [{ callingPoint: [
    { crs: "HAT", locationName: "Hatfield", st: "19:59", at: "20:02" }, { crs: "LET", locationName: "Letchworth Garden City", st: "20:16", et: "20:21" }] }] }, now) } };
  c.render();
  const hero = app.text("#hero");
  assert.match(hero, /Letchworth 20:21 expected \(live\) · timetable 20:16/);
  assert.match(hero, /You're on the 19:48 Great Northern About 5 min late/, "status in the lozenge, from Service Details");
  const st = app.w.document.querySelector("#hero .slackst");
  assert.equal(st.className, "slackst warn", "5 min late is amber");
  assert.match(hero, /Last reported: Hatfield 20:02 · 3 min late · next Letchworth Garden City 20:21/);
  assert.equal(app.w.document.querySelector("#hero .stat").className, "stat ok", "the last report's 3 min late is green (under 5)");
  c.state.progressById.S1.data = P.parseServiceDetails({ crs: "KGX", std: "19:48", atd: "19:50", subsequentCallingPoints: [{ callingPoint: [
    { crs: "HAT", locationName: "Hatfield", st: "19:59", at: "20:16" }, { crs: "LET", locationName: "Letchworth Garden City", st: "20:16", et: "20:34" }] }] }, now);
  c.render();
  assert.match(app.text("#hero"), /About 18 min late/);
  assert.equal(app.w.document.querySelector("#hero .stat").className, "stat bad", "the last report's 17 min late is red");
  assert.equal(app.w.document.querySelector("#hero .slackst").className, "slackst bad", "15+ min late is red");
  // The identity part of the lozenge is never a status colour.
  assert.equal(app.w.document.querySelector("#hero .slack").className, "slack");
  // A timetable train with no Service Details: projected from where you are, but never claimed on time.
  t.timetable = true; delete t.serviceId; c.state.progressById = {}; c.render();
  assert.match(app.text("#hero"), /You're on the 19:48 Great Northern/);
  assert.equal(app.w.document.querySelector("#hero .slackst"), null, "no status without live data");
  c.state.onLine = false; c.state.here = null; c.state.trainLock = null; c.state.progressById = {}; app.close();
});

test("Nearly home: the walk counts streets (straight line × 1.3)", async () => {
  const now = T("20:25"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home", home: [51.9752, -0.2402] } }), c = app.c;
  await app.moveTo(51.9799, -0.2290, 10);
  const d = c.km([51.9799, -0.2290], [51.9752, -0.2402]), mins = Math.round(d * 1.3 / 5 * 60);
  assert.match(app.text("#hero"), new RegExp(`About ${mins} min walk from where you are`));
  app.close();
});

test("Tube going home: Aldgate is noted only within 150 m; at Aldgate with a fresh fix you're not on a tube; no tube has left yet means not on one; a second tube within 3 min is 'or'", async () => {
  const now = T("16:40"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "home" } }), c = app.c, m = 60e3;
  c.state.aldDeps = { at: now, list: [{ line: "Met", t: T("16:41") }, { line: "Circle", t: T("16:43") }, { line: "Met", t: T("16:50") }] };
  await app.moveTo(51.5142 + 0.0045, -0.0755, 10);     // 500 m from Aldgate
  assert.equal(c.state.saved.aldHome, undefined);
  await app.moveTo(51.5142, -0.0755, 10);              // at Aldgate
  assert.equal(c.state.saved.aldHome.seen, now);
  c.state.saved.aldHome.deps = [{ line: "Met", t: T("16:41") }, { line: "Circle", t: T("16:43") }, { line: "Met", t: T("16:50") }];
  app.at(now + 30e3); c.state.lastFixAt = now + 20e3;
  assert.equal(c.onTubeHome(now + 30e3), false, "still at Aldgate, fix fresh");
  assert.equal(c.onTubeHome(now + 30e3 - 2 * m), false, "no tube has left yet");
  c.state.lastFixAt = now - 5 * m;
  assert.equal(c.onTubeHome(now + 30e3), false, "fix stale but no tube has left yet");
  app.at(T("16:44")); c.state.lastFixAt = now;
  assert.equal(c.onTubeHome(T("16:44")), true, "no fix for 4 min after the 16:41 left");
  const w = c.whichTubeHome(T("16:44"));
  assert.equal(w.best.line, "Met"); assert.equal(w.other.line, "Circle");
  c.state.saved.aldHome.deps = [{ line: "Met", t: T("16:41") }, { line: "Met", t: T("16:50") }];
  assert.equal(c.whichTubeHome(T("16:44")).other, undefined);
  app.close();
});

test("On your way to Letchworth: departures, when you'll reach the station, and whether you're on track", async () => {
  const now = T("06:50"), home = [51.9690, -0.2440];                 // ~1.4 km from the station
  const app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office", home, pace: "fast" } }), c = app.c;
  await app.moveTo(51.9690, -0.2440, 10);                            // at home: planning to leave
  assert.match(app.text("#hero"), /^If you leave now/);
  await app.moveTo(51.9760, -0.2340, 10);                            // ~550 m from the station, on the way
  const hero = app.text("#hero");
  assert.match(hero, /^On your way to Letchworth · 06:50/);
  const walk = c.walkFromHere(), at = new Date(now + walk * 1000);
  assert.match(hero, new RegExp(`At the station about ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`));
  assert.match(hero, /Train ?0[67]:\d\d Expected ?(0[67]:\d\d|On time) At office ?\d\d:\d\d/);
  assert.match(hero, /on track · (\d+ min to spare|keep going)/);
  assert.doesNotMatch(hero, /If you leave now/);
  // Without a saved home: on the way only when clearly nearer the station than home is (3+ min of walking).
  c.state.saved.home = null; c.render();
  assert.match(app.text("#hero"), /^On your way to Letchworth/);
  await app.moveTo(51.9700, -0.2400, 10);                            // ~1.2 km out: not clearly on the way
  assert.match(app.text("#hero"), /^If you leave now/);
  app.close();
});

test("This morning: at Letchworth station, then on the 07:08 passing Hitchin — on the train, not 'leave now'", async () => {
  const now = T("07:08"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto" } }), c = app.c;
  const fixAt = (lat, lon, speed, t) => { app.at(t); c.onPosition({ coords: { latitude: lat, longitude: lon, accuracy: 15, speed }, timestamp: t }); };
  fixAt(51.9799, -0.2290, 0, now);                                   // on the platform
  await sleep(500);
  assert.match(app.text("#hero"), /^You're at Letchworth · departures/);
  assert.equal(c.state.onLine, false);
  fixAt(51.9560, -0.2600, 25, T("07:13"));                           // just short of Hitchin, at speed
  await sleep(500);
  assert.equal(c.state.onLine, true);
  assert.match(app.text("#hero"), /^On the train/);
  assert.doesNotMatch(app.text("#hero"), /If you leave now/);
  // Stopped at Hitchin: still on the train.
  fixAt(51.9533, -0.2635, 0, T("07:15"));
  await sleep(300);
  assert.equal(c.state.onLine, true);
  app.close();
});

test("At King's Cross: the walk to the tube counts from when you arrived; tubes you might just make are listed, marked", async () => {
  const app = await open({ now: T("07:42"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c, m = 60e3;
  await app.moveTo(51.5309, -0.1236, 15);                            // off the train at King's Cross, 07:42
  assert.equal(c.state.hubSince.at, T("07:42"));
  app.at(T("07:44")); c.state.lastFixAt = T("07:44");
  await app.moveTo(51.5310, -0.1235, 15);                            // two minutes later, still in the station
  assert.equal(c.state.hubSince.at, T("07:42"), "arrival time kept");
  const tube = (min, line) => ({ t: T("07:44") + min * m, line, lineId: line === "Circle" ? "circle" : "metropolitan", dest: "Aldgate", platform: "Eastbound - Platform 2" });
  c.state.tube = { hub: "KGX", at: T("07:44"), arrivals: [tube(0.3, "Circle"), tube(1, "Met"), tube(2.5, "Circle"), tube(6, "Met")], err: null };
  c.render();
  // Fast pace: about 5 min to the platform from 07:42 → ready about 07:47: the 07:46:30 Circle is "near the platform", the 07:50 Met is the pick.
  const hero = app.text("#hero");
  assert.match(hero, /Get on the Met/);
  assert.match(hero, /about 3 min to spare on the platform/);
  assert.match(hero, /Near the platform already\? The 07:45 Met \(office 08:01\) or the 07:46 Circle/);
  assert.match(hero, /Walk to the eastbound platform · about \d min, from when you arrived \(07:42\)/);
  assert.match(app.text("#list"), /07:46.*If you're near the platform/);
  assert.doesNotMatch(app.text("#list"), /07:44/, "a tube leaving within 30 s isn't listed");
  app.close();
});

test("Tube ride: pick your tube at King's Cross; once it leaves you're on it, passing Farringdon or a stray fix doesn't undo it; asked if you're clearly still there", async () => {
  const now = T("07:44"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c, m = 60e3;
  await app.moveTo(51.5309, -0.1236, 15);                            // at King's Cross
  const tube = (min, line, v) => ({ t: now + min * m, line, lineId: line === "Circle" ? "circle" : "metropolitan", dest: "Aldgate", platform: "Eastbound - Platform 2", vehicle: v });
  c.state.tube = { hub: "KGX", at: now, arrivals: [tube(6, "Circle", "c6"), tube(12, "Met", "m12")], err: null };
  c.render();
  assert.match(app.text("#hero"), /Which one are you getting\?/);
  app.d.querySelector('[data-tubepick^="KGX|' + (now + 12 * m) + '|Met"]').click();
  assert.match(app.text("#hero"), /You're getting the Met to Aldgate/);
  assert.match(app.text("#hero"), /Getting a different one\?/);
  // The Met leaves at 07:56: on the tube from then.
  app.at(now + 12.5 * m); c.state.lastFixAt = now + 12.5 * m; c.render();
  assert.match(app.text("#hero"), /^On the tube · 07:56 · the tube you picked/);
  assert.match(app.text("#hero"), /You're on the 07:56 Met to Aldgate · you picked this/);
  // A fix at Farringdon on the way: still on the tube, not "you're at Farringdon".
  app.at(now + 15 * m); await app.moveTo(51.5203, -0.1053, 20);
  assert.match(app.text("#hero"), /^On the tube/);
  // A stray, rough fix back at King's Cross: still on the tube, no question.
  app.at(now + 16 * m); await app.moveTo(51.5309, -0.1236, 80);
  assert.match(app.text("#hero"), /^On the tube/); assert.doesNotMatch(app.text("#hero"), /Did you get/);
  // A good, fresh fix at King's Cross 4 min after your tube left: asked.
  app.at(now + 16.5 * m); await app.moveTo(51.5309, -0.1236, 15);
  assert.match(app.text("#hero"), /Still at King's Cross\? Did you get the 07:56 Met\?/);
  app.d.querySelector('[data-ride="no"]').click();
  assert.match(app.text("#hero"), /^You're at King's Cross/);
  // Near Aldgate the ride is over.
  c.state.saved.tubeRide = { hub: "KGX", t: now + 12 * m, line: "Met", picked: true };
  app.at(now + 22 * m); await app.moveTo(51.5142, -0.0755, 15);
  assert.equal(c.currentRide(now + 22 * m), null);
  app.close();
});

test("Arriving at the office: 'you've arrived', and still the morning journey until you've been there 5 minutes", async () => {
  const now = T("08:04"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto", trip: { dir: "office", at: T("07:00") } } }), c = app.c;
  await app.moveTo(51.5139 + 0.003, -0.0710, 15);                    // 330 m away: walking to the office
  assert.match(app.text("#hero"), /^Walking to the office/);
  await app.moveTo(51.5139 + 0.0005, -0.0710, 14);                   // at the door (55 m)
  assert.match(app.text("#dirNote"), /^Heading to the office · you're at the office/);
  assert.match(app.text("#hero"), /At the office · 08:04.*you've arrived/);
  app.at(T("08:08")); await app.moveTo(51.5139, -0.0710, 30);
  assert.match(app.text("#dirNote"), /^Heading to the office/, "4 min: still arriving");
  app.at(T("08:10")); await app.moveTo(51.5139, -0.0711, 30);
  assert.match(app.text("#dirNote"), /^Heading home · you're at the office/, "6 min there: the journey turns round");
  app.close();
});

test("At King's Cross: an H&C to Aldgate East is the pick when it gets you to the office sooner", async () => {
  const now = T("08:00"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c, m = 60e3;
  await app.moveTo(51.5309, -0.1236, 15);
  const tube = (min, line, lineId, dest) => ({ t: now + min * m, line, lineId, dest, platform: "Eastbound - Platform 2", vehicle: line + min });
  // Default timings: Circle/Met to Aldgate 10 min + 1.5 + 7 walk; H&C to Aldgate East 11 min + 1.5 + 6 walk.
  c.state.tube = { hub: "KGX", at: now, arrivals: [tube(8, "H&C", "hammersmith-city", "Barking"), tube(9, "Met", "metropolitan", "Aldgate")], err: null };
  c.render();
  const hero = app.text("#hero");
  assert.match(hero, /Get on the H&C to Barking/);
  assert.match(hero, /Aldgate East · about 11 min ride/);
  assert.match(app.text("#listTitle"), /Next tubes to Aldgate and Aldgate East/);
  app.close();
});

// ---------- From the independent review (29 Oct): real position updates, no internal state set by hand ----------
const KX = [51.5309, -0.1236], ZFD = [51.5203, -0.1053];
const tubeAt = (base, min, line, v) => ({ t: base + min * MIN, line, lineId: { Circle: "circle", Met: "metropolitan", "H&C": "hammersmith-city" }[line],
  dest: line === "H&C" ? "Barking" : "Aldgate", platform: "Eastbound - Platform 2", vehicle: v || line + min });

test("Review A: back at King's Cross after a gap of minutes is 'you're at King's Cross', not 'on the tube' you missed", async () => {
  const t0 = T("07:42"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  // Live tubes known when you arrive (the 07:43 Met will leave while the phone is in your pocket).
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 1, "Met", "m1"), tubeAt(t0, 9, "Circle", "c9")], err: null };
  await app.fix(...KX, 15, t0);
  assert.equal(c.state.lastHub.arrivals.length, 2, "the departures are remembered with your arrival");
  await app.fix(...KX, 80, T("07:46"));                              // next update 4 min later, still at the station
  assert.match(app.text("#hero"), /^You're at King's Cross/);
  assert.equal(c.state.saved.tubeRide || null, null, "no ride saved for the tube that left");
  app.close();
});

test("Review B: coming back with a cached position (taken before you came back) doesn't restart location", async () => {
  let push, starts = 0;
  const app = await createApp({ geo: null, settle: 50, relocateMs: 200 });
  app.w.navigator.geolocation.watchPosition = (ok) => { starts++; push = ok; return 5; };
  app.w.navigator.geolocation.clearWatch = () => {};
  app.c.state.watchId = 1; app.c.state.locStatus = "ok";
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(20);
  // The existing watch delivers iOS's cached fix, taken 10 s before you came back.
  app.c.onPosition({ coords: { latitude: 51.975, longitude: -0.23, accuracy: 15 }, timestamp: Date.now() - 10e3 });
  await sleep(300);
  assert.equal(starts, 0, "a position arrived after coming back: no restart (no new permission prompt)");
  app.close();
});

test("Review: at Farringdon with live tubes, office times use Farringdon's rides (Circle 7 min, H&C 8 min)", async () => {
  const t0 = T("08:00"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...ZFD, 15, t0);
  c.state.tube = { hub: "ZFD", at: t0, arrivals: [tubeAt(t0, 8, "Circle"), tubeAt(t0, 15, "H&C")], err: null };
  c.render();
  // Circle 08:08 + 7 min ride + (90 + 420) s → 08:23:30; H&C 08:15 + 8 min + (90 + 360) s → 08:30:30.
  const list = app.text("#list");
  assert.match(list, /08:08.*Aldgate 08:15.*Office ?08:23/);
  assert.match(list, /08:15.*Aldgate East 08:23.*Office ?08:30/);
  app.close();
});

test("Review: H&C to Aldgate East is the pick when it arrives sooner even though it leaves later", async () => {
  const t0 = T("08:00"), app = await open({ now: t0, geo: null, settings: { ...RDM, rideKxAde: 420 }, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 8, "Met"), tubeAt(t0, 9, "H&C")], err: null };
  c.render();
  // Met 08:08 + 10 + 8.5 → 08:26:30; H&C 08:09 + 7 + 7.5 → 08:23:30.
  assert.match(app.text("#hero"), /Get on the H&C to Barking/);
  app.close();
});

test("Review: 'Did you get it?' — No resets the walk: the next tube a minute or two away is the pick", async () => {
  const t0 = T("07:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 6, "Met", "m6"), tubeAt(t0, 12, "Circle", "c12"), tubeAt(t0, 13.5, "Met", "m13")], err: null };
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 6 * MIN) + '|Met"]').click();
  await app.fix(...KX, 15, t0 + 10 * MIN);                          // 4 min after it left, good fix, still here
  assert.match(app.text("#hero"), /Did you get the 07:50 Met\?/);
  app.d.querySelector('[data-ride="no"]').click();
  const hero = app.text("#hero");
  assert.match(hero, /^You're at King's Cross/);
  assert.match(hero, /Get on the Circle .*due 07:56/, "on the platform: the 07:56 (2 min away) is catchable");
  app.close();
});

test("Review: tapping a tube that's leaving now makes it your ride; picks expire; 'On a different tube?' offers the others", async () => {
  const t0 = T("07:50"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 0.4, "Circle", "c0"), tubeAt(t0, 2, "Met", "m2"), tubeAt(t0, 7, "Met", "m7")], err: null };
  c.state.lastHub = { hub: "KGX", seen: t0, arrivals: c.state.tube.arrivals }; c.state.saved.lastHub = c.state.lastHub;
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 2 * MIN) + '|Met"]').click();
  await app.fix(51.5260, -0.1110, 30, t0 + 3 * MIN);                // between stations
  assert.match(app.text("#hero"), /You're on the 07:52 Met to Aldgate · you picked this/);
  assert.match(app.text("#hero"), /On a different tube\?\s*Circle Aldgate · left 2 min ago/, "the board is gone: told by how long ago it left");
  // Tapping a tube that has already left: it's your ride, confirmed.
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 0.4 * MIN) + '|Circle"]').click();
  assert.equal(c.state.saved.tubeRide.vehicle, "c0"); assert.equal(c.state.saved.tubeRide.confirmed, true);
  // A pick from 26 min ago for a tube long gone never becomes a ride.
  c.state.saved.tubeRide = null; c.state.saved.tubePick = { hub: "KGX", t: t0 - 26 * MIN, line: "Met" };
  c.state.lastHub = null; c.state.saved.lastHub = null;            // (so only the pick could start a ride)
  assert.equal(c.currentRide(t0 + 3 * MIN), null);
  app.close();
});

test("Review: at King's Cross the list's best row is the tube on the card; after you pick, 'near the platform' isn't offered", async () => {
  const t0 = T("07:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 2, "Circle", "c2"), tubeAt(t0, 8, "Met", "m8"), tubeAt(t0, 12, "Met", "m12")], err: null };
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 2 * MIN) + '|Circle"]').click();
  assert.match(app.text("#hero"), /You're getting the Circle/);
  assert.doesNotMatch(app.text("#hero"), /Near the platform already/);
  let best = app.d.querySelector("#list .row.best");
  assert.equal(best && best.querySelector(".leave .t").textContent, "07:46", "the picked 07:46 Circle is the highlighted row");
  // Pick a later one (not the first row): that row is the highlighted one.
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 12 * MIN) + '|Met"]').click();
  best = app.d.querySelector("#list .row.best");
  assert.equal(best && best.querySelector(".leave .t").textContent, "07:56", "the picked 07:56 Met (third row) is highlighted");
  assert.equal(app.d.querySelectorAll("#list .row.best").length, 1);
  app.close();
});

test("Review: H&C problems are shown at King's Cross; the line strip on a tube is that line's", async () => {
  const t0 = T("08:00"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" },
    extra: (u) => (/Line\/circle/.test(u) ? json([{ id: "circle", name: "Circle", lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }] },
      { id: "metropolitan", name: "Metropolitan", lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }] },
      { id: "hammersmith-city", name: "Hammersmith & City", lineStatuses: [{ statusSeverity: 9, statusSeverityDescription: "Minor Delays" }] }]) : undefined) }), c = app.c;
  await c.refresh({ force: true, manual: true }); await sleep(300);
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 8, "H&C")], err: null };
  c.render();
  assert.match(app.text("#hero"), /Hammersmith & City: Minor Delays/);
  app.close();
});

test("Review: on your way — exact minutes to spare, and 'on your way' starts 100 m from your saved home", async () => {
  const now = T("06:50"), home = [51.9690, -0.2440];
  const app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office", home, pace: "fast" } }), c = app.c;
  await app.fix(home[0] + 0.0008, home[1], 10, now);                 // 90 m from home: not yet
  assert.match(app.text("#hero"), /^If you leave now/);
  await app.fix(home[0] + 0.0012, home[1], 10, now);                 // 130 m
  assert.match(app.text("#hero"), /^On your way to Letchworth/);
  const j = c.ranked(now).find((o) => o.recommended === 1), k = Math.floor((j.leave - now) / MIN);
  assert.match(app.text("#hero"), k >= 1 ? new RegExp(`on track · ${k} min to spare`) : /on track · keep going/);
  assert.equal(c.fastRefresh(), true, "refresh every 30 s on your way");
  await app.fix(...home, 10, now);
  assert.equal(c.fastRefresh(), false, "not at home");
  app.close();
});

test("On your way: 'At the station about' is green with 3+ min to spare for the top train, amber at 1–2, red under 1", async () => {
  const now = T("06:50"), home = [51.9690, -0.2440], here = [home[0] + 0.0012, home[1]];   // 130 m out: on your way
  const app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office", home } }), c = app.c;
  await app.fix(...here, 10, now);
  const top = (t) => c.ranked(t).find((o) => o.recommended === 1);
  const j = top(now);
  // Walk the clock towards the top train's leave time: 5, 3, 2, 1 and 0 whole minutes in hand.
  for (const [k, want] of [[5, "ok"], [3, "ok"], [2, "warn"], [1, "warn"], [0, "bad"]]) {
    const t = j.leave - k * MIN - 30e3;
    await app.fix(...here, 10, t);
    assert.equal(top(t).train.dep, j.train.dep, "still the same top train");
    const el = app.d.querySelector("#hero .slack");
    assert.match(el.textContent, /^At the station about/);
    assert.deepEqual([...el.classList], ["slack", want], `${k} min in hand: ${want}`);
    assert.match(app.text("#hero"), k >= 1 ? new RegExp(`on track · ${k} min to spare`) : /on track · keep going/, "colour and text use the same number");
  }
  app.close();
});

test("At Letchworth station a late train shows Train and Expected side by side, coloured by status band; refreshes every 30 s", async () => {
  for (const [late, level] of [[0, "ok"], [3, "ok"], [8, "warn"], [16, "bad"]]) {
    const now = T("07:00"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office" },
      disrupt: late ? { "Great Northern 07:08 from LET": { late, reason: "late" } } : {} }), c = app.c;
    await c.refresh({ force: true }); await sleep(400);
    await app.fix(51.9799, -0.2290, 10, now);
    assert.equal(c.fastRefresh(), true);
    const j = c.ranked(now).find((o) => o.train.std === "07:08");
    assert.ok(j, "the 07:08 is listed");
    const exp = late ? `07:${String(8 + late).padStart(2, "0")}` : "On time";
    const row = app.rows().find((r) => /^Train ?07:08/.test(r));
    assert.match(row, new RegExp(`^Train ?07:08 ?Expected ?${exp}`), `list: the timetabled time names the train, Expected beside it (${late} min)`);
    const cells = [...app.d.querySelectorAll("#list .row .exp .exp, #hero .exp")].filter((e) => e.textContent === exp);
    assert.ok(cells.length >= 1 && cells.every((e) => e.classList.contains(level)), `${late} min late is ${level}`);
    if (j.recommended) assert.match(app.text("#hero"), new RegExp(`Train ?07:08 ?Expected ?${exp}`), "card: same columns");
    const pills = [...app.d.querySelectorAll(".pill")].map((p) => p.textContent);
    if (late) {
      const pill = [...app.d.querySelectorAll(".pill")].find((p) => p.textContent === `${late} min late`);
      assert.ok(pill && pill.classList.contains(level), `the status word says ${late} min late once, ${level}`);
    } else assert.ok(!pills.includes("On time"), "an 'On time' pill would repeat the Expected column");
    assert.ok(![...app.d.querySelectorAll("#list .row.board .leave .t")].some((e) => app.w.getComputedStyle(e).textDecorationLine === "line-through"), "the train's name is never struck through");
    app.close();
  }
});


test("At the desk with GPS reading 217 m: after 10 minutes within 300 m the journey turns round", async () => {
  const now = T("09:10"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto", trip: { dir: "office", at: T("08:00") } } });
  await app.moveTo(51.5139 + 0.00195, -0.0710, 15);                  // 217 m, ±15 m (30 Oct screenshot)
  assert.match(app.text("#hero"), /^Walking to the office/);
  app.at(T("09:19")); await app.moveTo(51.5139 + 0.00196, -0.0710, 15);
  assert.match(app.text("#dirNote"), /^Heading to the office/, "9 min: still arriving");
  app.at(T("09:21")); await app.moveTo(51.5139 + 0.00195, -0.0711, 15);
  assert.match(app.text("#dirNote"), /^Heading home/, "11 min nearby: heading home");
  assert.doesNotMatch(app.text("#hero"), /Walking to the office/);
  app.close();
});

test("Review: office arrival — 120 m is 'you've arrived', 200 m is still walking", async () => {
  const now = T("08:04"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto", trip: { dir: "office", at: T("07:00") } } });
  await app.fix(51.5139 + 0.0018, -0.0710, 15, now);                 // 200 m
  assert.match(app.text("#hero"), /^Walking to the office/);
  await app.fix(51.5139 + 0.0011, -0.0710, 15, now + 30e3);          // 120 m
  assert.match(app.text("#hero"), /you've arrived/);
  assert.match(app.text("#dirNote"), /you're at the office/);
  app.close();
});

test("Review: a picked train keeps its National Rail service ID", async () => {
  const now = T("07:20"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await c.refresh({ force: true }); await sleep(300);
  await app.fix(51.8667, -0.1876, 20, now, 30);                      // Knebworth at speed: on the train
  const btn = app.d.querySelector("[data-pick]");
  if (!btn) { assert.ok(c.state.trainLock && c.state.trainLock.serviceId, "sure without asking, and remembered by service ID"); app.close(); return; }
  btn.click();
  assert.ok(c.state.trainLock.picked); assert.ok(c.state.trainLock.serviceId, "pick carries the service ID");
  app.close();
});

test("Review 2: the page uses the phone's own fix time; a picked train counts as moving; riding doesn't move your station; a ride clears the pick", async () => {
  const t0 = T("07:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0, null, t0 - 20e3);
  assert.equal(c.state.lastFixAt, t0 - 20e3, "when the phone took it");
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 3, "Met", "m3"), tubeAt(t0, 9, "Circle", "c9")], err: null };
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 3 * MIN) + '|Met"]').click();
  const since = c.state.hubSince.at;
  await app.fix(51.5260, -0.1110, 30, t0 + 4 * MIN);                // on the tube
  assert.equal(c.state.saved.tubePick, null, "the ride replaces the pick");
  await app.fix(...ZFD, 20, t0 + 6 * MIN);                          // passing Farringdon
  assert.equal(c.state.lastHub.hub, "KGX", "passing Farringdon doesn't make it your station");
  assert.equal(c.state.hubSince.hub, "KGX"); assert.equal(c.state.hubSince.at, since);
  app.close();
  // A train you picked: on the train even standing still at a station on the line.
  const n2 = T("07:30"), app2 = await open({ now: n2, geo: null, settings: RDM, saved: { dirMode: "office" } });
  app2.c.state.trainLock = { operator: "Great Northern", std: "07:08", from: "LET", picked: true };
  await app2.fix(51.9017, -0.2071, 15, n2, 0);                       // Stevenage platform, stopped
  assert.equal(app2.c.state.onLine, true);
  app2.close();
});

test("Review 2: 200 m from the office isn't 'you're at the office'", async () => {
  const now = T("08:04"), app = await open({ now, geo: null, settings: RDM, saved: { dirMode: "auto", trip: { dir: "office", at: T("07:00") } } });
  await app.fix(51.5139 + 0.0018, -0.0710, 15, now);
  assert.doesNotMatch(app.text("#dirNote"), /you're at the office/);
  app.close();
});

test("Review 3: a picked tube that's delayed starts your ride at its new time; GPS drift at home isn't leaving", async () => {
  const t0 = T("07:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 5, "Met", "m5"), tubeAt(t0, 11, "Circle", "c11")], err: null };
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 5 * MIN) + '|Met"]').click();
  app.at(t0 + MIN);
  c.state.tube = { hub: "KGX", at: t0 + MIN, arrivals: [{ ...tubeAt(t0, 8, "Met", "m5") }, tubeAt(t0, 11, "Circle", "c11")], err: null };   // the Met is 3 min late
  c.render();
  assert.equal(c.state.saved.tubePick.t, t0 + 8 * MIN, "your pick follows the train");
  app.at(t0 + 6 * MIN); c.render();
  assert.equal(c.currentRide(t0 + 6 * MIN), null, "07:50: your train (now 07:52) hasn't left yet");
  assert.match(app.text("#hero"), /^You're at King's Cross/);
  app.close();
  const home = [51.9690, -0.2440], app2 = await open({ now: T("06:50"), geo: null, settings: RDM, saved: { dirMode: "office", home } });
  await app2.fix(home[0] + 0.0010, home[1], 80, T("06:50"));          // 112 m off, ±80 m
  assert.match(app2.text("#hero"), /^If you leave now/, "within the fix's accuracy of home");
  await app2.fix(home[0] + 0.0010, home[1], 10, T("06:51"));          // same place, ±10 m
  assert.match(app2.text("#hero"), /^On your way to Letchworth/);
  app2.close();
});

test("Review 3: on an H&C ride, 'Your lines' is the H&C", async () => {
  const t0 = T("07:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  c.state.tube = { hub: "KGX", at: t0, arrivals: [tubeAt(t0, 7, "H&C", "h7"), tubeAt(t0, 9, "Met", "m9")], err: null };
  c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + (t0 + 7 * MIN) + '|H&C"]').click();
  await app.fix(51.5260, -0.1110, 30, t0 + 8 * MIN);
  const hero = app.text("#hero");
  assert.match(hero, /You're on the 07:51 H&C/);
  assert.match(hero, /Aldgate East/);
  assert.match(hero, /H&C: /); assert.doesNotMatch(hero, /Circle: |Met: /);
  app.close();
});

// ---------- Going home: the tube from Aldgate on the generic connection model ----------
test("Aldgate's real feed (recorded 30 Oct 19:32): westbound Circles are kept; Met arrivals ending at Aldgate, phantom H&C and eastbound Circles are not", async () => {
  const t0 = T("16:30"), raw = JSON.parse(readFileSync(new URL("./fixtures/tfl-aldgate-arrivals-2026-10-30T1932Z.json", import.meta.url), "utf8"));
  // Plus two made-up entries that only the line and destination checks exclude.
  const extra = [{ lineId: "hammersmith-city", platformName: "Westbound - Platform 1", destinationName: "Hammersmith (H&C Line) Underground Station", timeToStation: 300, vehicleId: "x1" },
    { lineId: "circle", platformName: "Westbound - Platform 4", destinationName: "Aldgate Underground Station", timeToStation: 360, vehicleId: "x2" }];
  const feed = (now) => [...raw, ...extra].map(a => ({ ...a, expectedArrival: new Date(t0 + a.timeToStation * 1000).toISOString() }));
  const app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "home" }, extra: (u, now) => (/940GZZLUALD\/Arrivals/.test(u) ? json(feed(now)) : undefined) });
  await app.fix(...OFFICE_PT, 15, t0); await app.c.refresh({ force: true }); await sleep(300);
  const list = app.c.state.aldDeps.list.map(d => `${d.line} ${d.dest} ${Math.floor((d.t - t0) / MIN)}`);
  assert.deepEqual(list, ["Circle Hammersmith (H&C Line) 7", "Circle Hammersmith (H&C Line) 15"], "no Met: TfL gives no Met departures from Aldgate");
  app.close();
});

test("Whole evening, 30 Oct: desk, Aldgate, underground, Moorgate, Farringdon — once you've left, the card never times from the office", async () => {
  const MOORGATE = [51.5186, -0.0886], FARRINGDON = [51.5203, -0.1053];
  const { app, c } = await homeApp(T("16:30"));
  const fromOffice = () => /Leave office|leave the office/.test(app.text("#hero"));
  await app.fix(...OFFICE_PT, 15, T("16:30"));
  assert.ok(fromOffice(), "at the desk: timed from the office");
  await app.fix(...ALD, 7, T("16:44"));                                // on the platform at Aldgate
  assert.match(app.text("#hero"), /You.re at Aldgate: go to the platform/); assert.ok(!fromOffice(), "at Aldgate");
  app.at(T("16:48")); c.render();                                      // underground, no fix since 16:44, no pick
  assert.match(app.text("#hero"), /^On the tube.*Probably the Circle to Edgware Road that left Aldgate at 16:46/); assert.ok(!fromOffice(), "underground");
  await app.fix(...MOORGATE, 30, T("16:50"));                          // a fix at Moorgate on the way
  assert.match(app.text("#hero"), /^On the tube/); assert.ok(!fromOffice(), "at Moorgate");
  await app.fix(...FARRINGDON, 24, T("16:53"));                        // passing Farringdon, heading for King's Cross
  assert.match(app.text("#hero"), /^On the tube.*Get off at King's Cross/); assert.ok(!fromOffice(), "passing Farringdon");
  [...app.d.querySelectorAll('[data-ride="off"]')].find(b => /Farringdon/.test(b.textContent)).click();   // got off here
  assert.match(app.text("#hero"), /^You're at Farringdon/); assert.ok(!fromOffice(), "at Farringdon");
  app.close();
});


const ALD = [51.5142, -0.0755], OFFICE_PT = [51.5139, -0.0710];
// Invented Aldgate departures (westbound Circle and Met) for the going-home rules. Not the real feed's shape: TfL lists
// no Met departures at Aldgate (see the recorded feed test below). `late` moves a vehicle later.
function aldgateFeed(late = {}) {
  const a = (hhmm, lineId, v) => ({ vehicleId: v, lineId, platformName: "Westbound - Platform 1", destinationName: "Edgware Road (Circle Line) Underground Station",
    expectedArrival: new Date(T(hhmm) + (late[v] || 0) * MIN).toISOString(), timeToStation: 60 });
  return [a("16:41", "metropolitan", "m41"), a("16:46", "circle", "c46"), a("16:52", "metropolitan", "m52")];
}
async function homeApp(t0, late = {}) {
  const app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "home" },
    extra: (u) => (/940GZZLUALD\/Arrivals/.test(u) ? json(aldgateFeed(late)) : undefined) }), c = app.c;
  await c.refresh({ force: true }); await sleep(400);
  return { app, c };
}

test("Review 30 Oct: an old finished ride doesn't stop tonight's tube being worked out; a pick that hasn't left wins", async () => {
  const MOORGATE = [51.5186, -0.0886];
  let { app, c } = await homeApp(T("16:30"));
  c.state.saved.tubeRide = { hub: "ALD", from: "ALD", t: T("15:29"), line: "Circle", rideMs: 10 * MIN, stop: "King's Cross", stopGeo: null };
  await app.fix(...OFFICE_PT, 15, T("16:30"));
  await app.fix(...ALD, 7, T("16:44"));
  app.at(T("16:48")); c.render();
  assert.match(app.text("#hero"), /^On the tube.*Probably the Circle to Edgware Road that left Aldgate at 16:46/);
  await app.fix(...MOORGATE, 30, T("16:50"));
  assert.doesNotMatch(app.text("#hero"), /Leave office|leave the office/);
  app.close();
  ({ app, c } = await homeApp(T("16:30")));
  await app.fix(...ALD, 7, T("16:44"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:52") + '|Met"]').click();
  app.at(T("16:48")); c.render();                                     // quiet on the platform, waiting for the 16:52
  assert.equal(c.homeRide(T("16:48")), null); assert.equal(c.state.saved.tubePick.t, T("16:52"));
  assert.doesNotMatch(app.text("#hero"), /^On the tube/);
  app.at(T("16:53")); c.render();
  assert.match(app.text("#hero"), /You're on the Met to Edgware Road that left Aldgate at 16:52 · you picked this/);
  app.close();
});

test("Review 30 Oct: underground, a refresh doesn't re-note Aldgate from the old fix; got off ends it for good; never going to work or in leisure", async () => {
  let { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 7, T("16:44"));
  app.at(T("16:50")); await c.refresh({ force: true }); await sleep(300);
  assert.equal(c.state.saved.aldHome.seen, T("16:44"), "the 16:44 fix is old: not seen again at 16:50");
  assert.match(app.text("#hero"), /^On the tube.*Probably the Circle to Edgware Road that left Aldgate at 16:46/);
  [...app.d.querySelectorAll('[data-ride="off"]')][0].click();
  app.at(T("16:58")); c.render();
  assert.equal(c.homeRide(T("16:58")), null); assert.equal(c.state.saved.aldHome, null);
  app.close();
  for (const saved of [{ mode: "leisure" }, { dirMode: "office" }]) {
    ({ app, c } = await homeApp(T("16:30")));
    Object.assign(c.state.saved, saved);
    await app.fix(...ALD, 7, T("16:44"));
    app.at(T("16:48")); c.render();
    assert.equal(c.homeRide(T("16:48")), null, JSON.stringify(saved));
    assert.doesNotMatch(app.text("#hero"), /^On the tube/, JSON.stringify(saved));
    app.close();
  }
});

test("Going home: tubes from Aldgate get off where you're home soonest; pick one; once it leaves you're on it", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...OFFICE_PT, 15, T("16:30"));
  let hero = app.text("#hero");
  assert.match(hero, /Tubes from Aldgate \(live\)Met 16:41 → Farringdon 16:48: 16:56 Thameslink/);
  assert.match(hero, /Which one are you getting\?/);
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:46") + '|Circle"]').click();
  assert.match(app.text("#hero"), /Circle 16:46 → King's Cross 16:56.*you're getting this one/);
  // At Aldgate, then the tube leaves and you're gone (no fix underground for 2+ min).
  await app.fix(...ALD, 15, T("16:44"));
  app.at(T("16:49")); c.render();
  hero = app.text("#hero");
  assert.match(hero, /^On the tube · 16:49 · the tube you picked/);
  assert.match(hero, /You're on the Circle to Edgware Road that left Aldgate at 16:46 · you picked this/);
  assert.match(hero, /Get off at King's Cross 16:56/);
  app.close();
});

test("Going home: passing Farringdon doesn't end the ride to King's Cross; 'Got off at Farringdon' does", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 15, T("16:44"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:46") + '|Circle"]').click();
  app.at(T("16:49")); c.render();
  assert.equal(c.homeRide(T("16:49")).stop, "King's Cross");
  await app.fix(51.5203, -0.1053, 20, T("16:53"));                   // at Farringdon, passing through
  assert.match(app.text("#hero"), /^On the tube/);
  app.d.querySelector('[data-ride="off"]').click();
  assert.equal(c.state.saved.tubeRide, null);
  assert.doesNotMatch(app.text("#hero"), /^On the tube/);
  app.close();
});

test("Going home: still at Aldgate with a good fix 4 min after your tube left — asked; No keeps you at Aldgate", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 15, T("16:38"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:41") + '|Met"]').click();
  await app.fix(...ALD, 15, T("16:45"));
  assert.match(app.text("#hero"), /Still at Aldgate\? Did you get the 16:41 Met\?/);
  app.d.querySelector('[data-ride="no"]').click();
  assert.equal(c.homeRide(T("16:45")), null);
  assert.doesNotMatch(app.text("#hero"), /^On the tube/);
  app.close();
});

test("Going home: your picked tube follows a delay (by vehicle)", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...OFFICE_PT, 15, T("16:30"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:46") + '|Circle"]').click();
  c.state.aldDeps = { ...c.state.aldDeps, list: c.state.aldDeps.list.map((d) => (d.vehicle === "c46" ? { ...d, t: T("16:48") } : d)) };   // next refresh: 2 min late
  c.render();
  assert.equal(c.state.saved.tubePick.t, T("16:48"));
  assert.match(app.text("#hero"), /Circle 16:48 →.*you're getting this one/);
  app.close();
});

test("Going home 2: the ride heads for the best stop and ends there or when its time is over; morning and evening rides never mix", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 15, T("16:38"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:41") + '|Met"]').click();
  app.at(T("16:43")); c.render();
  const r = c.homeRide(T("16:43"));
  assert.equal(r.stop, "Farringdon", "the 16:41 Met: Farringdon for the 16:56 Thameslink is the soonest home");
  assert.equal(c.currentRide(T("16:43")), null, "an evening ride is never a morning one");
  c.state.saved.dirMode = "office";
  assert.equal(c.currentRide(T("16:43")), null, "even if you switch to 'To office'");
  c.state.saved.dirMode = "home";
  await app.fix(51.5203, -0.1053, 20, T("16:48"));                   // at Farringdon: the ride is over
  assert.equal(c.homeRide(T("16:48")), null);
  c.state.saved.tubeRide = r;                                         // and one that runs past its time
  assert.equal(c.homeRide(r.t + r.rideMs + 11 * MIN), null);
  // A pick at Aldgate is never treated as a morning pick.
  c.state.saved.tubeRide = null; c.state.saved.tubePick = { hub: "ALD", t: T("16:52"), line: "Met" }; c.state.saved.dirMode = "office";
  assert.equal(c.currentRide(T("16:53")), null);
  app.close();
});

test("Going home 2: 'On a different tube?' switches you to one that has left; after 'No, still here' the app looks for the next one", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 15, T("16:44"));                             // at Aldgate at 16:44
  app.at(T("16:48")); c.render();                                    // underground since: worked out as the 16:46
  assert.match(app.text("#hero"), /Probably the Circle to Edgware Road that left Aldgate at 16:46/);
  assert.match(app.text("#hero"), /On a different tube\?\s*Met Edgware Road · left 7 min ago/, "told by how long ago it left, not the clock");
  assert.equal(app.d.querySelector("#hero [data-leftago]").dataset.leftago, String(T("16:41")), "ticks");
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:41") + '|Met"]').click();   // actually on the 16:41 Met
  assert.equal(c.state.saved.tubeRide.from, "ALD");
  assert.match(app.text("#hero"), /You're on the Met to Edgware Road that left Aldgate at 16:41/);
  app.close();
  // Picked the 16:41, still at Aldgate at 16:45 (good fix): asked; say no; then underground as the 16:46 leaves.
  const h = await homeApp(T("16:30"));
  await h.app.fix(...ALD, 15, T("16:38"));
  h.app.d.querySelector('[data-tubepick^="ALD|' + T("16:41") + '|Met"]').click();
  await h.app.fix(...ALD, 15, T("16:45"));
  h.app.d.querySelector('[data-ride="no"]').click();
  h.app.at(T("16:48")); h.c.render();
  const r = h.c.homeRide(T("16:48"));
  assert.ok(r && r.t === T("16:46"), "the 16:46 Circle, not the 16:41 you missed: " + JSON.stringify(r && r.t));
  h.app.close();
});

test("30 Oct: GPS goes quiet walking down at King's Cross: not on a tube you couldn't reach; then the H&C you caught, others nearest first", async () => {
  const t0 = T("08:39") + 20e3, app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(51.5420, -0.1180, 30, t0 - 10e3);                  // on the train, coming in: fixes seconds apart
  await app.fix(...KX, 15, t0);                                      // in the station (still on the train): "arrived"
  const base = T("08:00"), deps = [tubeAt(base, 38 + 50 / 60, "H&C", "h38"), tubeAt(base, 40, "Circle", "c40"), tubeAt(base, 42, "Met", "m42"),
    tubeAt(base, 45, "H&C", "h45"), tubeAt(base, 46, "Met", "m46"), tubeAt(base, 48, "Met", "m48")];
  await app.fix(...KX, 15, T("08:41"));                              // the last fix: then quiet underground
  c.state.tube = { hub: "KGX", at: T("08:41"), arrivals: deps, err: null };
  c.state.lastHub = { hub: "KGX", seen: T("08:41"), arrivals: deps }; c.state.saved.lastHub = c.state.lastHub;
  assert.equal(c.state.hubSince.at, t0, "arrived when first seen in the station");
  assert.equal(c.state.hubSince.away, t0 - 10e3, "and when it last saw you away from the station (on the train)");
  app.at(T("08:42") + 40e3); c.render();
  assert.equal(c.onTubeAuto(T("08:42") + 40e3), false, "the 08:40 Circle and 08:42 Met left before you could reach the platform");
  assert.match(app.text("#hero"), /^You're at King's Cross/);
  app.at(T("08:47")); c.render();
  const hero = app.text("#hero");
  assert.match(hero, /^On the tube/);
  assert.match(hero, /Probably the 08:45 H&C/);
  assert.equal(app.d.querySelector("#hero .slack").className, "slack hc");
  assert.match(hero, /On a different tube\?\s*Met Aldgate · left 1 min ago\s*Met Aldgate · left 5 min ago/, "nearest first (08:46, then 08:42); the earlier Met is still offered");
  assert.doesNotMatch(hero, /H&C Barking · left/, "the 08:38 H&C is 7 min off: not offered");
  app.close();
});

// Review (30 Oct): "arrived" is only as good as what the app saw.
const kxDeps = () => { const base = T("08:00"); return [tubeAt(base, 40, "Circle", "c40"), tubeAt(base, 42, "Met", "m42"), tubeAt(base, 45, "H&C", "h45"), tubeAt(base, 48, "Met", "m48"), tubeAt(base, 52, "Circle", "c52")]; };
const atKx = (c, deps, seen) => { c.state.tube = { hub: "KGX", at: seen, arrivals: deps, err: null }; c.state.lastHub = { hub: "KGX", seen, arrivals: deps }; c.state.saved.lastHub = c.state.lastHub; };

test("Review: the app opened on the platform: no walk added (you may have arrived long before), so the tube you caught counts", async () => {
  const t0 = T("08:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(...KX, 15, t0);                                      // the first fix this session: already at King's Cross
  assert.equal(c.state.hubSince.away, undefined, "arriving wasn't seen");
  atKx(c, kxDeps(), t0);                                             // boards the 08:45 H&C; GPS goes quiet
  app.at(T("08:47")); c.render();
  assert.equal(c.onTubeAuto(T("08:47")), true);
  assert.match(app.text("#hero"), /Probably the 08:45 H&C/);
  assert.doesNotMatch(app.text("#hero"), /Probably the 08:4[02]/, "but not one that left before the app first saw you here (over a minute)");
  app.close();
});

test("Review 2: opened on the platform, the earliest is when it first saw you, not 'anything that left'", async () => {
  const t0 = T("08:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  const base = T("08:00"), deps = [tubeAt(base, 42.5, "Met", "m42"), tubeAt(base, 46, "H&C", "h46")];
  await app.fix(...KX, 15, t0); atKx(c, deps, t0);
  app.at(T("08:47")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:46 H&C/, "the 08:42:30 left 90 s before it first saw you");
  app.close();
});

test("Review: after 'No, still here', a tube that had already left never becomes your ride", async () => {
  const t0 = T("08:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(...KX, 15, t0);
  atKx(c, kxDeps(), t0); c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + T("08:45") + '|H&C"]').click();
  await app.fix(...KX, 15, T("08:48") + 30e3);                      // still here, good fix; the 08:48 Met left 30 s ago
  atKx(c, kxDeps(), T("08:48") + 30e3);
  assert.match(app.text("#hero"), /Did you get the 08:45 H&C\?/);
  app.d.querySelector('[data-ride="no"]').click();
  assert.equal(c.state.hubSince.still, true);
  await app.fix(...KX, 15, T("08:49")); atKx(c, kxDeps(), T("08:49"));   // one more fix here, then quiet
  app.at(T("08:50") + 30e3); c.render();                             // GPS quiet; nothing has left since you said no
  assert.equal(c.onTubeAuto(T("08:50") + 30e3), false, "the 08:48 Met had gone before you said no");
  app.at(T("08:53")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:52 Circle/);
  app.close();
});

test("Review 2: after 'No, still here' a tube leaving 30 s later is catchable (no slack, but no extra margin either)", async () => {
  const t0 = T("08:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  const base = T("08:00"), deps = [tubeAt(base, 45, "H&C", "h45"), tubeAt(base, 49, "Met", "m49"), tubeAt(base, 55, "Circle", "c55")];
  await app.fix(...KX, 15, t0); atKx(c, deps, t0); c.render();
  app.d.querySelector('[data-tubepick^="KGX|' + T("08:45") + '|H&C"]').click();
  await app.fix(...KX, 15, T("08:48") + 30e3); atKx(c, deps, T("08:48") + 30e3);
  app.d.querySelector('[data-ride="no"]').click();
  await app.fix(...KX, 15, T("08:48") + 40e3); atKx(c, deps, T("08:48") + 40e3);
  app.at(T("08:51")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:49 Met/);
  app.close();
});

test("Review: arrival at a different station (Farringdon) doesn't limit the tubes at King's Cross", async () => {
  const t0 = T("08:44"), app = await open({ now: t0, geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  c.state.hubSince = { hub: "ZFD", at: T("08:42"), away: T("08:39") };
  atKx(c, kxDeps(), T("08:41")); c.state.atHub = "KGX"; c.state.here = KX; c.state.lastFixAt = T("08:41");
  assert.equal(c.onTubeAuto(T("08:42") + 40e3), true, "as before: a tube has left and you've gone quiet");
  app.close();
});

test("Review: going home, 'On a different tube?' at Aldgate lists the nearest to yours first", async () => {
  const { app, c } = await homeApp(T("16:30"));
  await app.fix(...ALD, 15, T("16:44"));
  app.d.querySelector('[data-tubepick^="ALD|' + T("16:46") + '|Circle"]').click();
  const d = (hm, line, v) => ({ t: T(hm), line, lineId: line === "Met" ? "metropolitan" : "circle", vehicle: v, dest: "Baker Street" });
  c.state.saved.aldHome = { seen: T("16:44"), deps: [d("16:41", "Met", "m41"), d("16:43", "Circle", "c43"), d("16:46", "Circle", "c46"), d("16:47", "Met", "m47")] };
  app.at(T("16:48")); c.render();
  const btns = [...app.d.querySelectorAll("#hero [data-tubepick]")].map((b) => b.dataset.tubepick.split("|")[1]);
  assert.deepEqual(btns, [T("16:47"), T("16:43"), T("16:41")].map(String), "1 min, 3 min, 5 min from yours");
  app.close();
});

test("Review 2: locked on the train, unlocked on the platform: the walk counts from when you were last seen away, so the tube you caught counts", async () => {
  const app = await open({ now: T("08:39"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(51.5420, -0.1180, 30, T("08:39"));                  // last fix on the train; phone locked
  await app.fix(...KX, 15, T("08:43"));                              // unlocked on the platform
  assert.equal(c.state.hubSince.away, T("08:39"));
  atKx(c, kxDeps(), T("08:43"));                                     // boards the 08:45 H&C; GPS goes quiet
  app.at(T("08:47")); c.render();
  assert.equal(c.onTubeAuto(T("08:47")), true, "the 08:45 is one you could have caught (08:39 + 4 min 55 s)");
  app.at(T("08:50")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:45 H&C/);
  app.close();
});

test("Review 2: the app asleep for a long time: no earlier than when it first saw you here; via Farringdon, the last fix away from any station", async () => {
  let app = await open({ now: T("08:10"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(51.80, -0.20, 30, T("08:10"));                       // half an hour ago, near home
  await app.fix(...KX, 15, T("08:44"));
  atKx(c, kxDeps(), T("08:44"));
  app.at(T("08:47")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:45 H&C/, "not the 08:42 Met (2 min before it first saw you)");
  app.close();
  // The floor decides it: a Met 70 s before it first saw you is nearer than the next H&C, but you weren't here yet.
  app = await open({ now: T("08:10"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }); c = app.c;
  await app.fix(51.80, -0.20, 30, T("08:10"));
  await app.fix(...KX, 15, T("08:44") + 50e3);
  const base = T("08:00"); atKx(c, [tubeAt(base, 43 + 40 / 60, "Met", "m43"), tubeAt(base, 46.5, "H&C", "h46")], T("08:44") + 50e3);
  app.at(T("08:48")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:46 H&C/);
  app.close();
  app = await open({ now: T("08:30"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }); c = app.c;
  await app.fix(51.5250, -0.1100, 30, T("08:30"));                   // between stations
  await app.fix(...ZFD, 15, T("08:36"));                             // at Farringdon
  await app.fix(...KX, 15, T("08:39"));                              // then King's Cross
  assert.equal(c.state.hubSince.hub, "KGX"); assert.equal(c.state.hubSince.away, T("08:30"), "Farringdon isn't 'away'");
  app.close();
});



test("Review 3: opened on the platform with a coarse first fix (400 m), then a good one: the coarse fix isn't 'away', so the tube you caught counts", async () => {
  const app = await open({ now: T("08:44"), geo: null, settings: RDM, saved: { dirMode: "office", pace: "fast" } }), c = app.c;
  await app.fix(...KX, 400, T("08:44"));                             // first fix after opening, underground: coarse
  assert.equal(c.state.atHub, null, "too coarse to say you're at King's Cross");
  await app.fix(...KX, 15, T("08:44") + 20e3);
  assert.equal(c.state.hubSince.away, undefined, "never seen away");
  atKx(c, kxDeps(), T("08:44") + 20e3);                              // boards the 08:45 H&C; GPS goes quiet
  app.at(T("08:47")); c.render();
  assert.match(app.text("#hero"), /Probably the 08:45 H&C/);
  app.close();
});
