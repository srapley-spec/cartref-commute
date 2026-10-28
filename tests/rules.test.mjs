// Rule tests: thresholds, windows, caches and inference rules, each pinned at its boundary with a frozen clock.
// Written after mutation testing showed these could change without any other test failing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, json, sleep, closeAll, parseJourneyUrl, NEAR_LETCHWORTH, COORDS } from "./harness.mjs";
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
test("liveAdjust: departed trains drop out; 'leave time passed' starts 30 s before the leave time", async () => {
  const now = T("16:30"), app = await open({ now });
  const opt = (dep, leave) => ({ train: tr({ from: "KGX", to: "LET", dep, arr: dep + 30 * MIN }), leave, arrive: dep + 50 * MIN, flags: [] });
  const out = app.c.liveAdjust([opt(now - MIN, now - 20 * MIN), opt(now + 40 * MIN, now + 20e3), opt(now + 40 * MIN, now + 40e3)], now);
  assert.equal(out.length, 2, "the train that left a minute ago is gone");
  assert.equal(out[0].missed, true, "leave in 20 s: too late at walking pace");
  assert.match(out[0].flags[0].txt, /^Leave time passed: 1 min short/);
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
  await app.moveTo(51.5139, -0.0710, 10);    // at the office: heading home
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
    c.state.lastHub = lh(10); assert.equal(c.onTube(now), true);
    c.state.lastHub = lh(26); assert.equal(c.onTube(now), false, "26 min ago: no longer assumed");
    c.state.lastHub = { ...lh(10), arrivals: [{ t: now + 2 * MIN }] }; assert.equal(c.onTube(now), false, "no tube has left yet");
    c.state.lastHub = lh(10); c.state.atHub = "KGX";
    c.state.lastFixAt = now - 30e3; assert.equal(c.onTube(now), false, "still at the station with a fresh fix");
    c.state.lastFixAt = now - 120e3; assert.equal(c.onTube(now), true, "no fix for 2 min underground");
    c.state.atHub = null; c.state.here = [51.5142, -0.0755]; assert.equal(c.onTube(now), false, "at Aldgate: off the tube");
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
    assert.deepEqual(plain(c.whichTrain(now)), { none: true }, "11 min off: no match");
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
