// UK-wide Trip (docs/stories/uk-wide-trip.md): Great Britain as the region, the national station list, Sam's 3 Nov
// journeys from recorded TfL replies, and boarding at the stop TfL walks you to from the station asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { core, fixture, at } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));
const idx = core.stationIndex(data.stations), cfg = core.tripConfig();
const st = crs => idx.byCrs(crs);
const fxb = n => fixture(`trip/tfl-${n}.json`).body;
const place = (name, geo) => ({ id: name, name, address: name, geo, kind: "address" });
// Walks: straight line × 1.3 at 1.4 m/s; drives (taxi legs): × 1.4 at 40 km/h. Stand-ins; the app asks Google.
const straight = { matrix: async (p, list, mode) => list.map(g => { const d = core.km(p, g); return mode === "drive" ? { metres: Math.round(d * 1400), secs: Math.round(d * 1400 / 11.1) } : { metres: Math.round(d * 1300), secs: Math.round(d * 1300 / 1.4) }; }) };
const hm = t => core.hhmm(t);
const day = t => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(t).getDay()];

// Public points, not Sam's addresses: the office itself and town centres.
const LON = place("London office (One Braham)", [51.5139, -0.0712]), LET = place("Letchworth town centre", [51.983, -0.228]);
const NCL = place("Grey's Monument, Newcastle", [54.9738, -1.6131]), ALM = place("Schooner Hotel, Alnmouth", [55.3872, -1.6124]);
const FTW = place("Fort William", [56.8210, -5.1048]), WASH = place("Washington NE38 8SE", [54.8874, -1.5101]);

const FX = { "FST-MAS": "fenchurchst-manors", "LST-MAS": "liverpoolst-manors", "ZLW-MAS": "whitechapel-manors", "LET-NCL": "letchworth-newcastle", "LET-ALM": "letchworth-alnmouth", "LET-FTW": "letchworth-fortwilliam", "LET-CLS": "letchworth-chesterlestreet",
  "LST-NCL": "liverpoolst-newcastle", "FST-NCL": "fenchurchst-newcastle", "LST-ALM": "liverpoolst-alnmouth", "FST-ALM": "fenchurchst-alnmouth", "LST-CLS": "liverpoolst-chesterlestreet", "FST-CLS": "fenchurchst-chesterlestreet",
  "NCL-LET": "newcastle-letchworth", "NCL-LST": "newcastle-liverpoolst", "ALM-LET": "alnmouth-letchworth", "FTW-LET": "fortwilliam-letchworth", "CLS-LET": "chesterlestreet-letchworth", "CLS-LST": "chesterlestreet-liverpoolst" };
const EVENING = { "LET-FTW": "letchworth-fortwilliam-evening", "LST-FTW": "liverpoolst-fortwilliam-evening", "FST-FTW": "fenchurchst-fortwilliam-evening", "FTW-LST": "fortwilliam-liverpoolst-evening" };
const ARRIVING = { "LET-NCL": "letchworth-newcastle-arrive", "FST-NCL": "fenchurchst-newcastle-arrive", "FST-MAS": "fenchurchst-manors-arrive", "LST-MAS": "liverpoolst-manors-arrive", "ZLW-MAS": "whitechapel-manors-arrive" };
/** A planner answering from the recorded replies by station pair; a TfL stop with no CRS (a Tube stop) is searched by its key. */
const recorded = (map = FX, log = []) => ({ name: "fixture",
  plan: async (a, b, t, timeIs) => { const k = `${a.crs || core.stationKey(a)}-${b.crs}`; log.push(`${k}${timeIs === "Arriving" ? "/A" : ""}@${hm(t)}`);
    const n = (timeIs === "Arriving" && ARRIVING[k]) || map[k];
    return n ? core.tflRailJourneys(fxb(n), a, b, idx, cfg.endMatchM) : { journeys: [], refused: ["Not recorded"] }; },
  planTo: async (a, p) => { log.push(`${a.crs}-@`); return { journeys: [], refused: [`TfL found no journey from ${a.name} to ${p.name}`] }; } });
const plan = (from, to, q, opts = {}) => core.planTrip({ from, to, modes: opts.modes || { from: "walk", to: "walk" }, question: q, now: opts.now ?? (q.kind === "by" ? q.t - 4 * 3600e3 : q.t), leisureKmh: 4.5, cfg: opts.cfg || cfg },
  { stations: idx, access: straight, planner: opts.planner || recorded(opts.map || FX, opts.log || []) });
const TWH = "940GZZLUTWH", ALD = "940GZZLUALD";
/** The Fenchurch Street → Newcastle reply with journey i's leading walk re-pointed to end at Tower Hill (a stop TfL knows, the list doesn't). */
function reboard(body, i, { fromAsked = true } = {}) {
  const b = JSON.parse(JSON.stringify(body)), j = b.journeys[i];
  j.legs[1].departurePoint = { naptanId: TWH, commonName: "Tower Hill Underground Station", lat: 51.5098, lon: -0.0766 };
  j.legs[0].arrivalPoint = { ...j.legs[1].departurePoint };
  if (!fromAsked) j.legs[0].departurePoint = { naptanId: ALD, icsCode: "1000003", commonName: "Aldgate Underground Station", lat: 51.5142, lon: -0.0757 };
  return b;
}
/** A recorded planner with one pair answered differently. */
const withPair = (pair, body, log = []) => ({ ...recorded(FX, log), plan: async (a, b, t, ti) => {
  const k = `${a.crs || core.stationKey(a)}-${b.crs}`; log.push(`${k}${ti === "Arriving" ? "/A" : ""}@${hm(t)}`);
  if (k === pair) return core.tflRailJourneys(body, a, b, idx, cfg.endMatchM);
  return FX[k] ? core.tflRailJourneys(fxb(FX[k]), a, b, idx, cfg.endMatchM) : { journeys: [], refused: ["Not recorded"] }; } });
const T = (d, t) => at(`2026-11-${d}`, t);

test("Region: Great Britain; Belfast, Dublin, the Isle of Man and Calais are out; Stranraer, Penzance, Thurso, Shetland and the Hebrides are in", () => {
  const r = cfg.region, inside = g => core.inRegion(g, r);
  for (const g of [[54.974, -1.613], [55.387, -1.612], [56.821, -5.105], [54.90, -5.03], [50.12, -5.53], [58.595, -3.522], [60.15, -1.15], [58.21, -6.39], [53.31, -4.63], [50.69, -1.30], [51.98, -0.23], [52.48, -1.90]])
    assert.equal(inside(g), true, String(g));   // Newcastle, Alnmouth, Fort William, Stranraer, Penzance, Thurso, Lerwick, Stornoway, Holyhead, Isle of Wight, Letchworth, Birmingham
  for (const g of [[54.597, -5.93], [53.35, -6.26], [54.15, -4.48], [50.95, 1.86], [54.85, -5.81]])
    assert.equal(inside(g), false, String(g));  // Belfast, Dublin, Isle of Man, Calais, Larne
  assert.match(core.OUTSIDE_REGION, /Great Britain/);
});

test("Station data is national: 2,600+ stations, Newcastle / Alnmouth / Fort William / Edinburgh Waverley with TfL IDs; Chester-le-Street is Washington's nearest at 5.6 km", () => {
  assert.ok(data.stations.length >= 2600, String(data.stations.length));
  for (const [crs, id] of [["NCL", "910GNWCSTLE"], ["ALM", "910GALNMOTH"], ["FTW", "910GFRTWLM"], ["EDB", "910GEDINBUR"], ["CLS", "910GCLST"], ["LET", "910GLTCE"]]) assert.deepEqual(st(crs).ids.tfl, [id], crs);
  assert.ok(data.stations.filter(s => s.ids.tfl).length >= 2580);
  const c = core.candidates(WASH.geo, "walk", idx, cfg);
  assert.equal(c.list.length, 3, "the three nearest when none is within reach"); assert.equal(c.list[0].station.crs, "CLS"); assert.ok(c.list.every(x => x.why === "fallback")); assert.equal(c.farKm.toFixed(1), "5.6");
});

test("London office → Newcastle: boards the Tube at Aldgate after TfL's walk from Fenchurch Street, the 08:30 LNER, arrives 11:09 (what TfL and Google say)", async () => {
  const log = [];
  const r = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { log });
  const p = r.picks[0];
  assert.equal(core.stationKey(p.fromStation), "tfl:940GZZLUALD"); assert.equal(p.fromStation.name, "Aldgate"); assert.equal(p.toStation.crs, "NCL");
  assert.deepEqual(p.rides.map(x => `${x.kind}:${x.from.name}→${x.to.name} ${hm(x.dep)}`), ["tube:Aldgate→London Kings Cross 08:10", "walk:London Kings Cross→London Kings Cross 08:19", "rail:London Kings Cross→Newcastle 08:30"]);
  assert.equal(hm(p.leave), "08:01"); assert.equal(hm(p.arrive), "11:23");   // 11:09 + 3 min out + 11 min walk
  assert.equal(p.id, "tfl:940GZZLUALD|NCL|KGX08:30");
  assert.deepEqual(p.before.map(s => [s.kind, s.step && s.step.d]), [["walk", "Walk to Aldgate"], ["station", null]], "the walk from the office to Aldgate, then the platform allowance");
  assert.ok(r.notes.some(n => /^London Fenchurch Street → Newcastle: 3 journeys board at Aldgate after a walk from London Fenchurch Street; kept as journeys from there$/.test(n)), r.notes.join(" ;; "));
  // Live asks for the train's board, not the Tube's
  assert.deepEqual(core.liveBudget([p], null, T("04", "08:00"), cfg).map(b => b.key), ["KGX-NCL"]);
  // Arrive by 12:00: the latest leave in time (08:33 via York, flagged for its 0-minute change), the direct 08:30 as next best
  const by = await plan(LON, NCL, { kind: "by", t: T("04", "12:00") });
  assert.equal(hm(by.picks[0].arrive), "11:41"); assert.ok(by.picks[0].flags.some(f => f.txt === "Latest for 12:00") && by.picks[0].flags.some(f => /Connection at risk, 0 min/.test(f.txt)), by.picks[0].flags.map(f => f.txt).join("; "));
  assert.equal(hm(by.picks[1].arrive), "11:23");
});

test("Letchworth → Newcastle goes via Stevenage, not King's Cross; Alnmouth by the York change; Arrive by 12:00 picks the 08:30 as Latest", async () => {
  const r = await plan(LET, NCL, { kind: "now", t: T("04", "08:00") });
  const p = r.picks[0];
  assert.deepEqual(p.rides.map(x => `${x.from.crs}→${x.to.crs} ${hm(x.dep)}`), ["LET→HIT 08:30", "HIT→SVG 08:39", "SVG→YRK 08:55", "YRK→NCL 10:26"]);
  assert.equal(hm(p.leave), "08:21"); assert.equal(hm(p.arrive), "11:41");
  assert.ok(p.flags.some(f => /Connection at risk, 0 min/.test(f.txt)), "a 0-minute change at York is flagged, never hidden");
  assert.ok(!r.journeys.some(j => j.rides.some(x => x.to.crs === "KGX")), "no journey via King's Cross");
  const by = await plan(LET, NCL, { kind: "by", t: T("04", "12:00") });
  assert.equal(hm(by.picks[0].rides[0].schedDep), "08:30"); assert.ok(by.picks[0].flags.some(f => f.txt === "Latest for 12:00"));
  assert.ok(by.journeys.some(j => j.flags.some(f => f.txt === "Late by 14 min")));
  const a = await plan(LET, ALM, { kind: "now", t: T("04", "08:00") });
  assert.deepEqual(a.picks[0].rides.map(x => x.to.crs), ["HIT", "SVG", "YRK", "ALM"]); assert.equal(hm(a.picks[0].arrive), "12:35");
  const la = await plan(LON, ALM, { kind: "now", t: T("04", "08:00") });
  assert.deepEqual(la.picks[0].rides.filter(x => x.kind === "rail").map(x => `${x.from.crs}→${x.to.crs} ${hm(x.dep)}`), ["KGX→NCL 08:30", "NCL→ALM 11:15"]); assert.equal(hm(la.picks[0].arrive), "12:15");
});

test("Washington NE38 8SE: no station within walking reach, so the three nearest are tried, Chester-le-Street (5.6 km) first and flagged; the last leg is a taxi with the walk said", async () => {
  const r = await plan(LET, WASH, { kind: "now", t: T("04", "08:00") });
  assert.equal(r.candidates.to.map(c => `${c.station.crs}:${c.why}`).join(), "CLS:fallback,HEW:fallback,SUN:fallback");
  const p = r.picks[0];
  assert.equal(p.toStation.crs, "CLS"); assert.ok(p.flags.some(f => f.txt === "Nearest station to where you're going is 5.6 km away"), p.flags.map(f => f.txt).join("; "));
  assert.equal(p.after[1].kind, "taxi"); assert.equal(p.after[1].step.d, "Taxi to your destination"); assert.match(p.after[1].step.note, /on foot$/);
  // Return: with a taxi to Chester-le-Street the 17:13 is reachable at 17:00 (the 94-minute walk would have lost every recorded train)
  const back = await plan(WASH, LET, { kind: "now", t: T("04", "17:00") });
  assert.ok(back.picks.length >= 1, back.journeys.map(j => `${hm(j.leave)} ${j.flags.map(f => f.txt).join("/")}`).join(" | "));
  assert.equal(back.picks[0].before[0].kind, "taxi"); assert.ok(back.picks[0].flags.some(f => f.txt === "Nearest station is 5.6 km away"));
});

test("Fort William: by day via York, Edinburgh and Glasgow Queen Street; in the evening the Euston → Glasgow sleeper then Queen Street, arriving tomorrow (the direct Highland sleeper is not in TfL's data)", async () => {
  const d = await plan(LET, FTW, { kind: "now", t: T("04", "08:00") });
  assert.deepEqual(d.picks[0].rides.map(x => x.to.crs), ["SVG", "YRK", "EDB", "GLQ", "FTW"]); assert.equal(hm(d.picks[0].arrive), "22:10");
  const e = await plan(LET, FTW, { kind: "now", t: T("04", "20:00") }, { map: { ...FX, ...EVENING } });
  const p = e.picks[0];
  assert.equal(`${day(p.leave)} ${hm(p.leave)}`, "Wed 22:19"); assert.equal(`${day(p.arrive)} ${hm(p.arrive)}`, "Thu 12:16");
  assert.ok(p.rides.some(x => x.kind === "rail" && x.from.crs === "EUS" && x.to.crs === "GLC" && hm(x.schedDep) === "23:45"), "the Lowland sleeper, Euston 23:45 → Glasgow Central");
  assert.ok(!e.journeys.some(j => j.rides.some(x => x.from.crs === "EUS" && x.to.crs === "FTW")), "no direct Euston → Fort William: TfL lacks the Highland sleeper");
  assert.ok(e.journeys.filter(j => j !== p).every(j => j.flags.some(f => /^Tomorrow · Thu 5 Nov/.test(f.txt))), "later options are tomorrow's day trains, flagged");
  // From the London office in the evening: TfL walks from Fenchurch Street to Tower Hill; boarding there is kept
  const l = await plan(LON, FTW, { kind: "now", t: T("04", "20:00") }, { map: { ...FX, ...EVENING } });
  assert.equal(l.picks[0].fromStation.name, "Tower Hill"); assert.equal(`${day(l.picks[0].arrive)} ${hm(l.picks[0].arrive)}`, "Thu 12:16");
  assert.ok(l.notes.some(n => /journeys? boards? at Tower Hill after a walk from London Fenchurch Street/.test(n)), l.notes.join(" ;; "));
});

test("Returns: Newcastle → Letchworth via Stevenage 20:21; Newcastle → London office by King's Cross and the Tube; Fort William → Letchworth by the sleeper, arriving tomorrow", async () => {
  const n = await plan(NCL, LET, { kind: "now", t: T("04", "17:00") });
  assert.deepEqual(n.picks[0].rides.map(x => `${x.from.crs}→${x.to.crs} ${hm(x.dep)}`), ["NCL→SVG 17:27", "SVG→LET 20:09"]); assert.equal(hm(n.picks[0].arrive), "20:29");
  const o = await plan(NCL, LON, { kind: "now", t: T("04", "17:00") });
  assert.deepEqual(o.picks[0].rides.map(x => `${x.kind}:${x.to.name}`), ["rail:London Kings Cross", "walk:London Kings Cross", "tube:London Liverpool Street"]); assert.equal(hm(o.picks[0].arrive), "20:47");
  const f = await plan(FTW, LET, { kind: "now", t: T("04", "17:00") });
  const p = f.picks[0];
  assert.ok(p.rides.some(x => x.from.crs === "GLC" && x.to.crs === "EUS" && hm(x.schedDep) === "23:40"), "Glasgow Central 23:40 sleeper");
  assert.equal(`${day(p.arrive)} ${hm(p.arrive)}`, "Thu 08:17");
  const a = await plan(ALM, LET, { kind: "now", t: T("04", "17:00") });
  assert.equal(hm(a.picks[0].rides[0].schedDep), "18:30"); assert.equal(hm(a.picks[0].arrive), "22:37");
});

test("Boarding elsewhere needs the first mile on foot and the stop within walking reach; cycling to the station keeps the strict match; a journey wrong at both ends is refused", async () => {
  const log = [];
  const cyc = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { modes: { from: "cycle", to: "walk" }, log });
  assert.ok(cyc.journeys.every(j => j.fromStation.crs), "every journey boards at a listed station when cycling");
  assert.ok(cyc.notes.some(n => /not from London Fenchurch Street/.test(n)) || cyc.failed.some(f => /not from London Fenchurch Street/.test(f.why)), "the refusal is said");
  // Beyond reach: the far end stays Newcastle (the place is the station itself), Aldgate (≈ 300 m from the office) is beyond a 200 m reach
  const atNcl = place("Newcastle Central", st("NCL").geo);
  const tight = await plan(LON, atNcl, { kind: "now", t: T("04", "08:00") }, { cfg: core.tripConfig({ reachKm: { walk: 0.2, cycle: 10, drive: 25 } }) });
  assert.equal(tight.candidates.to[0].station.crs, "NCL");
  // Every reply from Fenchurch Street boards at Aldgate, so none of those is kept; what remains boards at listed stations (the fallbacks), and the refusal is said
  assert.ok(tight.journeys.length > 0 && tight.journeys.every(j => j.fromStation.crs), tight.journeys.map(j => core.stationKey(j.fromStation)).join());
  assert.ok(tight.notes.some(n => /not from London Fenchurch Street/.test(n)) || tight.failed.some(f => /not from London Fenchurch Street/.test(f.why)));
  // Parser edges: boards elsewhere with no walk from the asked station is refused; a walk from somewhere else is not a walk from it; no position, no keeping
  const noWalk = JSON.parse(JSON.stringify(fxb("fenchurchst-newcastle"))); noWalk.journeys.forEach(j => { j.legs = j.legs.slice(1); });
  const r1 = core.tflRailJourneys(noWalk, st("FST"), st("NCL"), idx, cfg.endMatchM);
  assert.equal(r1.elsewhereFrom.length, 0); assert.deepEqual(r1.refused, Array(3).fill("TfL matched a different place (Aldgate → Newcastle)"));
  const r2 = core.tflRailJourneys(reboard(fxb("fenchurchst-newcastle"), 0, { fromAsked: false }), st("FST"), st("NCL"), idx, cfg.endMatchM);
  assert.equal(r2.elsewhereFrom.length, 2, "a walk from somewhere other than the asked station is not a walk from it");
  const noGeo = JSON.parse(JSON.stringify(fxb("fenchurchst-newcastle"))); noGeo.journeys.forEach(j => { const d = j.legs[1].departurePoint; delete d.lat; delete d.lon; });
  const r3 = core.tflRailJourneys(noGeo, st("FST"), st("NCL"), idx, cfg.endMatchM);
  assert.equal(r3.elsewhereFrom.length, 0); assert.equal(r3.refused.length, 3, "a stop with no position is refused, never kept at 0,0");
  const r4 = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") });
  assert.ok(!r4.notes.some(n => /not from London Fenchurch Street/.test(n)), "a kept refusal is not repeated as a note");
  const r = core.tflRailJourneys(fxb("fenchurchst-newcastle"), st("FST"), st("MAS"), idx, cfg.endMatchM);
  assert.equal(r.journeys.length, 0); assert.equal(r.elsewhereFrom.length, 0, "boards elsewhere and ends elsewhere: refused outright"); assert.ok(r.refused.length);
  const ok = core.tflRailJourneys(fxb("fenchurchst-newcastle"), st("FST"), st("NCL"), idx, cfg.endMatchM);
  assert.equal(ok.journeys.length, 0); assert.equal(ok.elsewhereFrom.length, 3); assert.equal(ok.elsewhereFrom[0].journey.rides[0].from.name, "Aldgate");
  assert.match(ok.refused[0], /^TfL matched a different place \(Aldgate → Newcastle, not from London Fenchurch Street\)$/);
  assert.ok(ok.elsewhereFrom[0].journey.notes.includes("Boards at Aldgate, not London Fenchurch Street"));
});

test("Outside Great Britain is refused with the area named; a Great Britain place far from any station still plans", async () => {
  await assert.rejects(plan(place("Belfast", [54.597, -5.93]), LET, { kind: "now", t: T("04", "08:00") }), /Outside the area this plans: Great Britain/);
  await assert.rejects(plan(LET, place("Dublin", [53.35, -6.26]), { kind: "now", t: T("04", "08:00") }), /Great Britain/);
});

test("Journeys boarding at a Tube stop are keyed by that stop: the later search asks from it, after the last one found; two stops are two keys", async () => {
  const log = [];
  await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { log });
  assert.deepEqual(log.filter(k => k.startsWith(`tfl:${ALD}-NCL`)), [`tfl:${ALD}-NCL@09:04`], log.join(" "));
  const log2 = [];
  // Five later searches instead of three, so both Tube stops (not only the three best pairs) get theirs
  const r = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { planner: withPair("FST-NCL", reboard(fxb("fenchurchst-newcastle"), 0), log2), cfg: core.tripConfig({ laterPairs: 5 }) });
  assert.deepEqual([...new Set(r.journeys.map(j => j.fromStation.name))].filter(n => /Aldgate|Tower Hill/.test(n)).sort(), ["Aldgate", "Tower Hill"]);
  assert.ok(r.notes.some(n => /board at (Aldgate \/ Tower Hill|Tower Hill \/ Aldgate) after a walk from London Fenchurch Street/.test(n)), r.notes.join(" ;; "));
  // Each Tube stop's later search asks from that stop, after the last departure found from it (08:30 at Tower Hill; 09:03 at Aldgate)
  const tube = log2.filter(k => /^tfl:.*-NCL@/.test(k)).sort();
  assert.ok(tube.includes(`tfl:${TWH}-NCL@08:31`), log2.join(" "));
  assert.ok(tube.every(k => k === `tfl:${TWH}-NCL@08:31` || k === `tfl:${ALD}-NCL@09:04`), "a later search from a Tube stop asks from that stop, after its own last departure");
  assert.ok(!log2.some(k => /^-NCL@/.test(k)), "never a search keyed by an empty CRS");
});

test("A boarding stop first seen in a later search is timed and listed, not silently dropped", async () => {
  const log = [];
  const r = await plan(LON, NCL, { kind: "now", t: T("04", "08:00") }, { planner: withPair(`tfl:${ALD}-NCL`, reboard(fxb("fenchurchst-newcastle"), 2, { fromAsked: false }), log) });
  assert.ok(log.includes(`tfl:${ALD}-NCL@09:04`), log.join(" "));
  const th = r.journeys.filter(j => j.fromStation.name === "Tower Hill");
  assert.equal(th.length, 1, r.journeys.map(j => `${core.stationKey(j.fromStation)} ${hm(j.leave)}`).join(", "));
  assert.equal(th[0].before[0].step.d, "Walk to Tower Hill");
});

test("The page's planner-cache key tells two Tube boarding stops apart, and a place from a station; same stop, direction and 15-minute slot share one", () => {
  const ald = { crs: "", name: "Aldgate", geo: [51.5142, -0.0757], carPark: "unknown", servicePerHour: 0, ids: { tfl: ["940GZZLUALD"], tflIcs: ["1000003"] } };
  const twh = { crs: "", name: "Tower Hill", geo: [51.5098, -0.0766], carPark: "unknown", servicePerHour: 0, ids: { tfl: ["940GZZLUTWH"] } };
  const t = T("04", "09:01");   // slots are 15 minutes from the epoch: 09:00–09:14 is one
  assert.notEqual(core.plannerCacheKey(ald, st("NCL"), t, "Departing"), core.plannerCacheKey(twh, st("NCL"), t, "Departing"));
  assert.equal(core.plannerCacheKey(ald, st("NCL"), t, "Departing"), `tfl:940GZZLUALD-NCL|Departing|${Math.floor(t / (15 * 60e3))}`);
  assert.equal(core.plannerCacheKey(ald, st("NCL"), t, "Departing"), core.plannerCacheKey(ald, st("NCL"), t + 13 * 60e3, "Departing"), "the same 15-minute slot");
  assert.notEqual(core.plannerCacheKey(ald, st("NCL"), t, "Departing"), core.plannerCacheKey(ald, st("NCL"), t + 15 * 60e3, "Departing"));
  assert.notEqual(core.plannerCacheKey(ald, st("NCL"), t, "Departing"), core.plannerCacheKey(ald, st("NCL"), t, "Arriving"));
  assert.notEqual(core.plannerCacheKey(ald, NCL, t, "Departing"), core.plannerCacheKey(twh, NCL, t, "Departing"), "a place target too");
  assert.equal(core.plannerCacheKey(st("LET"), NCL, t, "Departing"), `LET-@${NCL.geo.join(",")}|Departing|${Math.floor(t / (15 * 60e3))}`);
});
