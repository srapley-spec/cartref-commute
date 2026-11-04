// Beyond walking distance, and what TfL misses (docs/stories/trip-taxi-and-google-gaps.md): a taxi leg with Google's
// driving time when a walk is over 2 miles; the nearest few stations when none is within reach; Google Maps' own route
// shown as a gap when it beats the best found here (the Highland sleeper), from recorded Routes API replies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { core, fixture, at } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const A = createRequire(import.meta.url)(path.join(ROOT, "src/trip-adapters.js"));
const data = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));
const idx = core.stationIndex(data.stations), cfg = core.tripConfig();
const st = crs => idx.byCrs(crs);
const fxb = n => fixture(`trip/tfl-${n}.json`).body;
const gfx = n => fixture(`trip/google-${n}.json`).body;
const place = (name, geo) => ({ id: name, name, address: name, geo, kind: "address" });
const hm = t => core.hhmm(t);
const T = (d, t) => at(`2026-11-${d}`, t);
const LON = place("London office (One Braham)", [51.5139, -0.0712]), LET = place("Letchworth town centre", [51.983, -0.228]);
const NCL = place("Grey's Monument, Newcastle", [54.9738, -1.6131]), FTW = place("Fort William", [56.8210, -5.1048]), WASH = place("Washington NE38 8SE", [54.8874, -1.5101]);
const FX = { "LET-CLS": "letchworth-chesterlestreet", "LET-NCL": "letchworth-newcastle", "LET-FTW": "letchworth-fortwilliam", "FST-NCL": "fenchurchst-newcastle", "LST-NCL": "liverpoolst-newcastle", "FST-MAS": "fenchurchst-manors", "LST-MAS": "liverpoolst-manors", "ZLW-MAS": "whitechapel-manors",
  "FST-FTW": "fenchurchst-fortwilliam-evening", "LST-FTW": "liverpoolst-fortwilliam-evening", "LET-FTW-eve": "letchworth-fortwilliam-evening" };
const recorded = (log = [], evening = false) => ({ name: "fixture",
  plan: async (a, b, t, timeIs) => { const k = `${a.crs || core.stationKey(a)}-${b.crs}`; log.push(`${k}@${hm(t)}`); const n = (evening && FX[`${k}-eve`]) || FX[k];
    return n ? core.tflRailJourneys(fxb(n), a, b, idx, cfg.endMatchM) : { journeys: [], refused: ["Not recorded"] }; },
  planTo: async (a, p) => { log.push(`${a.crs}-@`); return { journeys: [], refused: [`TfL found no journey from ${a.name} to ${p.name}`] }; } });
/** Walks: straight line × 1.3; drives: 1.4 × straight line at 40 km/h (a stand-in; the real app asks Google). Logs each call. */
const access = (log = []) => ({ async matrix(p, gs, mode, at, dir) { log.push(`${mode}:${dir}:${gs.length}`);
  return gs.map(g => { const d = core.km(p, g); return mode === "drive" ? { metres: Math.round(d * 1400), secs: Math.round(d * 1400 / 11.1) } : { metres: Math.round(d * 1300), secs: Math.round(d * 1300 / 1.4) }; }); } });
const plan = (from, to, q, o = {}) => core.planTrip({ from, to, modes: o.modes || { from: "walk", to: "walk" }, question: q, now: o.now ?? q.t, leisureKmh: 4.5, cfg: o.cfg || cfg },
  { stations: idx, access: access(o.accessLog), planner: recorded(o.log, o.evening), ...(o.routes ? { routes: o.routes } : {}) });

test("Config: a walk over 3.2 km becomes a taxi with 5 min to get one; 3 fallback stations; a 5-minute gap", () => {
  assert.deepEqual(core.TRIP_DEFAULTS.taxi, { fromKm: 3.2, waitMin: 5 }); assert.equal(core.TRIP_DEFAULTS.fallbacks, 3); assert.equal(core.TRIP_DEFAULTS.gapMin, 5);
  assert.equal(core.taxiWorthIt("walk", { metres: 3201, secs: 0 }, cfg.taxi), true);
  assert.equal(core.taxiWorthIt("walk", { metres: 3200, secs: 0 }, cfg.taxi), false);
  assert.equal(core.taxiWorthIt("cycle", { metres: 9000, secs: 0 }, cfg.taxi), false, "a taxi replaces a long walk only");
  assert.equal(core.taxiWorthIt("walk", null, cfg.taxi), false);
});

test("Washington NE38 8SE on foot: Chester-le-Street, Heworth-side stations tried as the three nearest; the 5.6 km from the station is a taxi (Google's driving time + 5 min), the walk said", async () => {
  const accessLog = [], log = [];
  const r = await plan(LET, WASH, { kind: "now", t: T("04", "08:00") }, { accessLog, log });
  assert.deepEqual(r.candidates.to.map(c => c.why), ["fallback", "fallback", "fallback"]);
  assert.equal(r.candidates.to[0].station.crs, "CLS"); assert.equal(r.candidates.to[0].km.toFixed(1), "5.6");
  const p = r.picks[0];
  assert.equal(p.toStation.crs, "CLS");
  assert.deepEqual(p.after.map(s => [s.kind, s.step.d]), [["station", "Out of Chester-Le-Street"], ["taxi", "Taxi to your destination"]]);
  const taxi = p.after[1];
  assert.match(taxi.step.note, /^7\.\d km · about \d+ min by road, 5 min to get one · 1h \d+m on foot$/, taxi.step.note);
  const drive = Math.round(core.km(st("CLS").geo, WASH.geo) * 1400 / 11.1);
  assert.equal(taxi.secs, 5 * 60 + drive, "the taxi leg is the wait plus the driving time: each minute once");
  assert.equal(p.arrive, p.rides[p.rides.length - 1].arr + (3 * 60 + taxi.secs) * 1000, "arrival = off the train + exit + taxi");
  assert.ok(hm(p.arrive) < "13:00", `${hm(p.arrive)}: a taxi, not the 94-minute walk`);
  assert.ok(p.flags.some(f => /^Taxi from Chester-Le-Street: 7\.\d km, about \d+ min by road$/.test(f.txt)), p.flags.map(f => f.txt).join("; "));
  assert.ok(p.flags.some(f => f.txt === "Nearest station to where you're going is 5.6 km away"));
  // driving times asked once per end, only for stations beyond 3.2 km on foot: Baldock (4.2 km from the town centre) at home, all three fallbacks at the far end
  assert.deepEqual(accessLog.filter(c => c.startsWith("drive")), ["drive:to:1", "drive:from:3"], accessLog.join(" "));
  const steps = core.journeySteps(p).map(s => s.d);
  assert.equal(steps.at(-1), "Taxi to your destination");
  // From home it is still a walk: no taxi on the way to Letchworth station
  assert.deepEqual(p.before.map(s => s.kind), ["walk", "station"]);
});

test("Taxi at the start too, and cycling never becomes a taxi; a drive matrix that fails leaves the walk and says so", async () => {
  const far = place("A farm 4 km west of Letchworth station", [51.983, -0.290]);   // > 3 km from every station: Hitchin 3.8, Letchworth 4.2
  const r = await plan(far, NCL, { kind: "now", t: T("04", "08:00") });
  const p = r.picks[0];
  assert.equal(p.before[0].kind, "taxi"); assert.equal(p.before[0].step.d, "Taxi to Letchworth Garden City");
  assert.ok(p.flags.some(f => /^Taxi to Letchworth Garden City: \d\.\d km, about \d+ min by road$/.test(f.txt)));
  assert.equal(p.leave, p.rides[0].dep - (p.before[0].secs + 3 * 60) * 1000, "leave = train − taxi (wait + road) − platform minutes");
  const cyc = await plan(far, NCL, { kind: "now", t: T("04", "08:00") }, { modes: { from: "cycle", to: "walk" } });
  assert.deepEqual(cyc.picks[0].before.map(s => s.kind), ["cycle", "station"]);
  const failing = { async matrix(p, gs, mode) { if (mode === "drive") throw new Error("Google refused the travel times request"); return access().matrix(p, gs, mode); } };
  const r2 = await core.planTrip({ from: far, to: NCL, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: T("04", "08:00") }, now: T("04", "08:00"), leisureKmh: 4.5, cfg }, { stations: idx, access: failing, planner: recorded() });
  assert.equal(r2.picks[0].before[0].kind, "walk", "no driving time: the walk stands");
  assert.ok(r2.notes.some(n => /^Taxi times to the stations: Google refused/.test(n)), r2.notes.join(" ;; "));
});

test("Gaps: Google Maps' direct Highland sleeper (Euston 21:15 → Fort William 10:00) is shown against TfL's Glasgow sleeper, 2 h sooner; buses never count; the same trains once", async () => {
  const routes = A.fixtureRoutes(async () => gfx("london-fortwilliam-evening"));
  const r = await plan(LON, FTW, { kind: "now", t: T("04", "20:00") }, { evening: true, routes });
  assert.equal(r.requests.routes, 1);
  assert.equal(`${hm(r.picks[0].arrive)}`, "12:16", "the best found here: the Glasgow sleeper and a connection");
  assert.ok(r.gaps.length >= 1, JSON.stringify(r.gaps));
  const g = r.gaps[0];
  assert.equal(g.source, "Google Maps");
  assert.equal(hm(g.arrive), "10:03"); assert.equal(hm(g.depart), "20:36");
  assert.ok(g.legs.some(l => l.kind === "rail" && l.from === "Euston" && l.to === "Fort William" && l.line === "Caledonian Sleeper"), JSON.stringify(g.legs));
  assert.match(g.text, /^Leave 20:36, arrive 10:03: Aldgate East 20:41 → Euston Square 20:57 \(Hammersmith & City\) · Euston 21:15 → Fort William 10:00 \(Caledonian Sleeper\)$/);
  assert.equal(g.soonerMin, 132, "at the station: Fort William 10:00 against TfL's 12:12, not door to door");
  assert.match(g.why, /^reaches Fort William 2h 12m sooner than the best found here; not in TfL's planner, so no live times or Follow for it$/, g.why);
  assert.ok(r.gaps.length <= 2);
  assert.ok(!r.gaps.some(x => x.legs.some(l => l.kind === "bus")));
  // the gaps are in the first answer too when routes came back first? No: they are part of the complete answer only
  const stages = [];
  await core.planTrip({ from: LON, to: FTW, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: T("04", "20:00") }, now: T("04", "20:00"), leisureKmh: 4.5, cfg }, { stations: idx, access: access(), planner: recorded([], true), routes }, s => stages.push(`${s.stage}:${s.gaps.length}`));
  assert.equal(stages[0], "timetable:0"); assert.match(stages[1], /^complete:[12]$/, "gaps belong to the complete answer");
});

test("Gaps: nothing shown when Google agrees (London → Newcastle: the same 08:30 LNER); nothing without a routes port; a failing routes port is a note, not a failure", async () => {
  const same = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { routes: A.fixtureRoutes(async () => gfx("london-newcastle")) });
  assert.deepEqual(same.gaps, [], JSON.stringify(same.gaps));
  assert.equal(hm(same.picks[0].arrive), "11:23");
  const none = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") });
  assert.deepEqual(none.gaps, []); assert.equal(none.requests.routes, 0);
  const broken = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { routes: { name: "Google Maps", async transit() { throw new Error("quota"); } } });
  assert.deepEqual(broken.gaps, []); assert.ok(broken.notes.includes("Google Maps: quota")); assert.ok(broken.picks.length);
});

test("googleGaps: the same train with a shorter walk is not a gap (compared at the last station); by Arrive by, a route arriving after T is not a gap; with nothing pickable any rail-only route is; at most two, soonest first", () => {
  // London → Newcastle: Google's walks are shorter, its 08:30 LNER the same; at the door 5 min sooner, at Newcastle identical
  const sameTrain = { source: "Google Maps", depart: T("04", "08:01"), arrive: T("04", "11:18"), legs: [{ kind: "tube", from: "Aldgate East", to: "King's Cross St. Pancras", dep: T("04", "08:05"), arr: T("04", "08:21") }, { kind: "rail", from: "King's Cross", to: "Newcastle", dep: T("04", "08:30"), arr: T("04", "11:09") }] };
  const appBest = { arrive: T("04", "11:23"), rides: [{ arr: T("04", "08:19") }, { arr: T("04", "08:28") }, { arr: T("04", "11:09") }] };
  assert.deepEqual(core.googleGaps([sameTrain], [appBest], { kind: "now", t: T("04", "08:00") }, 5), []);
  const q = { kind: "by", t: T("04", "10:00") };
  const leg = (from, to, dep, arr, kind = "rail") => ({ kind, from, to, dep: T("04", dep), arr: T("04", arr) });
  const routes = [
    { source: "Google Maps", depart: T("04", "08:00"), arrive: T("04", "10:05"), legs: [leg("A", "B", "08:10", "10:00")] },
    { source: "Google Maps", depart: T("04", "08:00"), arrive: T("04", "09:50"), legs: [leg("A", "B", "08:10", "09:45")] },
    { source: "Google Maps", depart: T("04", "08:05"), arrive: T("04", "09:40"), legs: [leg("A", "C", "08:15", "09:30"), leg("C", "B", "09:32", "09:38", "bus")] },
    { source: "Google Maps", depart: T("04", "08:20"), arrive: T("04", "09:55"), legs: [leg("A", "B", "08:30", "09:50")] },
    { source: "Google Maps", depart: T("04", "08:20"), arrive: T("04", "09:58"), legs: [leg("A", "B", "08:30", "09:50")] },
  ];
  const gaps = core.googleGaps(routes, [], q, 5);
  assert.deepEqual(gaps.map(g => hm(g.arrive)), ["09:50", "09:55"], JSON.stringify(gaps.map(g => g.text)));
  assert.equal(gaps[0].soonerMin, null); assert.match(gaps[0].why, /^nothing here could be recommended/);
  const best = { arrive: T("04", "09:53"), rides: [{ arr: T("04", "09:48") }] };   // its last ride reaches B at 09:48
  assert.deepEqual(core.googleGaps(routes, [best], q, 5).map(g => hm(g.arrive)), [], "3 minutes sooner at the station is not a gap at a 5-minute bar");
  assert.deepEqual(core.googleGaps(routes, [best], q, 3).map(g => hm(g.arrive)), ["09:50"]);
});

test("Adapters: the Routes API reply and the Maps JS DirectionsService reply both become the same GapRoute shape", () => {
  const rest = A.gapRouteFromRest(gfx("london-fortwilliam-evening").routes[0]);
  assert.equal(hm(rest.depart), "20:36"); assert.equal(hm(rest.arrive), "10:03");
  assert.deepEqual(rest.legs.filter(l => l.kind !== "walk").map(l => `${l.kind}:${l.from}→${l.to}:${l.line}`), ["tube:Aldgate East→Euston Square:Hammersmith & City", "rail:Euston→Fort William:Caledonian Sleeper"]);
  assert.ok(rest.legs.filter(l => l.kind === "walk").every(l => l.secs >= 60));
  const js = A.gapRouteFromJs({ legs: [{ steps: [
    { travel_mode: "WALKING", duration: { value: 120 } },
    { travel_mode: "TRANSIT", duration: { value: 900 }, transit: { departure_stop: { name: "Aldgate East" }, arrival_stop: { name: "Euston Square" }, departure_time: { value: new Date(T("04", "20:41")) }, arrival_time: { value: new Date(T("04", "20:57")) }, line: { short_name: "Hammersmith & City", vehicle: { type: "SUBWAY" } } } },
    { travel_mode: "WALKING", duration: { value: 540 } },
    { travel_mode: "TRANSIT", duration: { value: 45900 }, transit: { departure_stop: { name: "Euston" }, arrival_stop: { name: "Fort William" }, departure_time: { value: new Date(T("04", "21:15")) }, arrival_time: { value: new Date(T("05", "10:00")) }, line: { short_name: "Caledonian Sleeper", vehicle: { type: "HEAVY_RAIL" } } } },
    { travel_mode: "WALKING", duration: { value: 180 } }] }] });
  assert.equal(hm(js.depart), "20:39"); assert.equal(hm(js.arrive), "10:03");
  assert.deepEqual(js.legs.filter(l => l.kind !== "walk").map(l => `${l.kind}:${l.from}→${l.to}:${l.line}`), rest.legs.filter(l => l.kind !== "walk").map(l => `${l.kind}:${l.from}→${l.to}:${l.line}`));
  assert.equal(A.gapRouteFromRest({ legs: [{ steps: [{ travelMode: "WALK", staticDuration: "600s" }] }] }), null, "a walk-only route is not a route");
  assert.equal(A.gapRouteFromJs({ legs: [] }), null);
});

test("Proxy adapter: transit asks the Worker's computeRoutes path with the time, the question and rail-only modes, and maps the reply", async () => {
  const calls = [];
  const net = { epoch: () => 1, assertEpoch() {}, logRequest() {}, async fetchT(url, init) { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => gfx("london-newcastle") }; } };
  const ad = A.googleProxy({ getBase: () => "https://proxy.example", net });
  const routes = await ad.transit([51.5139, -0.0712], [54.9738, -1.6131], T("04", "08:00"), "Departing");
  assert.equal(calls[0].url, "https://proxy.example/google/routes/directions/v2:computeRoutes");
  assert.equal(calls[0].body.travelMode, "TRANSIT"); assert.deepEqual(calls[0].body.transitPreferences.allowedTravelModes, ["TRAIN", "SUBWAY", "LIGHT_RAIL", "RAIL"]);
  assert.equal(calls[0].body.origin.location.latLng.latitude, 51.5139); assert.ok(calls[0].body.departureTime);
  assert.ok(routes.length >= 3); assert.ok(routes[0].legs.some(l => l.kind === "rail" && /Newcastle/.test(l.to)));
  const by = await ad.transit([51.5139, -0.0712], [54.9738, -1.6131], T("04", "12:00"), "Arriving");
  assert.equal(calls[1].body.arrivalTime, new Date(T("04", "12:00")).toISOString()); assert.ok(!calls[1].body.departureTime); assert.ok(by.length);
});
