#!/usr/bin/env node
// Compare the Trip engine's answers with TfL's own door-to-door answer and Google Maps transit, for a list of journeys.
// Run by hand after `npm run build` (docs/trip-engine.md §11):
//   TFL_APP_KEY=… GOOGLE_MAPS_KEY=… node tools/trip-compare.mjs tools/trip-compare.example.json [out.json]
// Keys come from the environment only and are removed from everything written. Without GOOGLE_MAPS_KEY the app's
// walks use a straight-line stand-in (labelled) and Google Maps is skipped. Needs curl (the proxy-friendly client).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(path.join(ROOT, "dist/core.mjs"));
const tripAdapters = createRequire(import.meta.url)(path.join(ROOT, "src/trip-adapters.js"));
const list = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8")).stations;
const idx = core.stationIndex(list), cfg = core.tripConfig();
const KEY = process.env.TFL_APP_KEY, GKEY = process.env.GOOGLE_MAPS_KEY || "";
if (!KEY) throw new Error("TFL_APP_KEY is needed");
const file = process.argv[2]; if (!file) throw new Error("usage: node tools/trip-compare.mjs journeys.json [out.json]");
const outFile = process.argv[3] || file.replace(/\.json$/, "") + ".results.json";

let tflCalls = 0, gCalls = 0;
const scrub = s => String(s).split(KEY).join("REMOVED").split(GKEY || "\u0000").join("REMOVED");
const curl = args => { const out = execFileSync("curl", ["-sS", "-A", "cartref-commute-tools", "-w", "\n%{http_code}", ...args], { maxBuffer: 50e6 }).toString();
  const i = out.lastIndexOf("\n"); return { status: Number(out.slice(i + 1)), text: out.slice(0, i) }; };
const net = { epoch: () => 1, assertEpoch() {}, async fetchT(url) { tflCalls++; const r = curl([url]); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.text) }; } };
const planner = tripAdapters.tflPlanner({ net, getKey: () => KEY, idx, endMatchM: cfg.endMatchM, core });
const gpost = (p, body, mask) => { gCalls++; const r = curl(["-X", "POST", "-H", "Content-Type: application/json", "-H", `X-Goog-Api-Key: ${GKEY}`, "-H", `X-Goog-FieldMask: ${mask}`, "-d", JSON.stringify(body), `https://routes.googleapis.com/${p}`]);
  let j; try { j = JSON.parse(r.text); } catch { j = { raw: r.text.slice(0, 300) }; } return { status: r.status, body: j }; };
const ll = g => ({ location: { latLng: { latitude: g[0], longitude: g[1] } } }), wp = g => ({ waypoint: ll(g) });
// The production access port shape (src/trip-adapters.js googleProxy.matrix): Google route matrix.
const MODE = { walk: "WALK", cycle: "BICYCLE", drive: "DRIVE" };
const googleAccess = { async matrix(place, stations, mode, at, dir) {
  const a = [wp(place)], b = stations.map(wp);
  const r = gpost("distanceMatrix/v2:computeRouteMatrix", { origins: dir === "to" ? a : b, destinations: dir === "to" ? b : a, travelMode: MODE[mode],
    ...(mode === "drive" ? { routingPreference: "TRAFFIC_AWARE", departureTime: new Date(Math.max(at, Date.now())).toISOString() } : {}) }, "originIndex,destinationIndex,duration,distanceMeters,condition,status");
  if (r.status !== 200) throw new Error(`Google matrix HTTP ${r.status}`);
  const out = stations.map(() => null);
  (Array.isArray(r.body) ? r.body : []).forEach(e => { const i = dir === "to" ? e.destinationIndex : e.originIndex; if (i == null || i >= out.length || (e.condition && e.condition !== "ROUTE_EXISTS") || (e.status && e.status.code)) return;
    out[i] = { metres: Math.round(e.distanceMeters || 0), secs: Math.floor(parseFloat(String(e.duration || "0").replace(/s$/, ""))) }; });
  return out; } };
const standIn = { async matrix(p, gs, mode) { const v = { walk: 1.4, cycle: 4.5, drive: 9 }[mode]; return gs.map(g => { const m = Math.round(core.km(p, g) * 1300); return { metres: m, secs: Math.round(m / v) }; }); } };
const access = GKEY ? googleAccess : standIn;

const hm = t => (Number.isFinite(t) ? new Date(t).toTimeString().slice(0, 5) : "?");
const dayhm = t => { const d = new Date(t); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${hm(t)}`; };
const icon = k => (k === "rail" ? "🚆" : k === "tube" ? "🚇" : k === "walk" ? "🚶" : k);
const legs = j => j.rides.map(r => `${icon(r.kind)}${r.from.name}→${r.to.name} ${hm(r.dep)}-${hm(r.arr)}`).join(" | ");
const stopIds = new Map();
function stationId(name) { if (stopIds.has(name)) return stopIds.get(name); tflCalls++;
  const r = curl([`https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(name)}?modes=national-rail&app_key=${KEY}`]);
  let id = null; try { const m = (JSON.parse(r.text).matches || []).filter(x => /^910G/.test(x.id)); const exact = m.find(x => x.name.replace(/ Rail Station$/, "").toLowerCase() === name.toLowerCase()); id = (exact || m[0] || {}).id || null; } catch {}
  stopIds.set(name, id); return id; }
async function tflDoor(from, to, q) {
  const d = new Date(q.t), p = n => String(n).padStart(2, "0");
  const tail = `?date=${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}&time=${p(d.getHours())}${p(d.getMinutes())}&timeIs=${q.kind === "by" ? "Arriving" : "Departing"}&mode=${core.TFL_TRIP_MODES}&journeyPreference=leasttime&nationalSearch=true&app_key=${KEY}`;
  const ask = async (a, b, how) => { const r = await net.fetchT(`https://api.tfl.gov.uk/Journey/JourneyResults/${a}/to/${b}${tail}`); if (!r.ok) return { status: r.status, how, journeys: [] }; const bd = await r.json();
    return { status: 200, how, journeys: (bd.journeys || []).map(j => ({ start: dayhm(new Date(j.startDateTime).getTime()), arrive: dayhm(new Date(j.arrivalDateTime).getTime()), duration: j.duration,
      legs: j.legs.map(l => `${l.mode.id === "walking" ? "🚶" : /tube|dlr/.test(l.mode.id) ? "🚇" : "🚆"}${l.departurePoint.commonName.replace(/ (Rail|Underground) Station/, "")}→${l.arrivalPoint.commonName.replace(/ (Rail|Underground) Station/, "")} ${l.departureTime.slice(11, 16)}-${l.arrivalTime.slice(11, 16)}`).join(" | ") })) }; };
  let r = await ask(`${from.geo[0]},${from.geo[1]}`, `${to.geo[0]},${to.geo[1]}`, "coords");
  if (r.status === 404) { const a = from.station ? stationId(from.station) : `${from.geo[0]},${from.geo[1]}`, b = to.station ? stationId(to.station) : `${to.geo[0]},${to.geo[1]}`; if (a && b) r = await ask(a, b, `stations ${from.station || "coords"} → ${to.station || "coords"}`); }
  return r;
}
function googleTransit(from, to, q) {
  if (!GKEY) return { status: 0, routes: [], error: "no GOOGLE_MAPS_KEY" };
  const when = new Date(q.t).toISOString();
  const r = gpost("directions/v2:computeRoutes", { origin: ll(from.geo), destination: ll(to.geo), travelMode: "TRANSIT", computeAlternativeRoutes: true, languageCode: "en-GB", units: "METRIC",
    ...(q.kind === "by" ? { arrivalTime: when } : { departureTime: when }), transitPreferences: { allowedTravelModes: ["TRAIN", "SUBWAY", "LIGHT_RAIL", "RAIL"] } }, "routes.duration,routes.legs.steps");
  if (r.status !== 200) return { status: r.status, error: JSON.stringify(r.body).slice(0, 300), routes: [] };
  const secs = x => parseFloat(String(x || "0").replace(/s$/, "")) || 0, lt = s => (s ? hm(new Date(s).getTime()) : "?");
  return { status: 200, routes: (r.body.routes || []).map(rt => { const steps = rt.legs[0].steps || [], ti = steps.map((s, i) => (s.travelMode === "TRANSIT" ? i : -1)).filter(i => i >= 0);
    if (!ti.length) return { start: "?", arrive: "?", duration: rt.duration, legs: "(no transit)" };
    const firstDep = new Date(steps[ti[0]].transitDetails.stopDetails.departureTime).getTime(), lastArr = new Date(steps[ti[ti.length - 1]].transitDetails.stopDetails.arrivalTime).getTime();
    const before = steps.slice(0, ti[0]).reduce((a, s) => a + secs(s.staticDuration), 0), after = steps.slice(ti[ti.length - 1] + 1).reduce((a, s) => a + secs(s.staticDuration), 0);
    return { start: dayhm(firstDep - before * 1000), arrive: dayhm(lastArr + after * 1000), duration: rt.duration,
      legs: steps.filter(s => s.travelMode === "TRANSIT" || (s.travelMode === "WALK" && secs(s.staticDuration) >= 60)).map(s => { if (s.travelMode === "WALK") return `🚶${Math.round(secs(s.staticDuration) / 60)}m`;
        const td = s.transitDetails, v = (td.transitLine && td.transitLine.vehicle && td.transitLine.vehicle.type) || "", nm = (td.transitLine && (td.transitLine.nameShort || td.transitLine.name)) || "";
        return `${/SUBWAY|METRO/.test(v) ? "🚇" : /BUS/.test(v) ? "🚌" : "🚆"}${td.stopDetails.departureStop.name}→${td.stopDetails.arrivalStop.name} ${lt(td.stopDetails.departureTime)}-${lt(td.stopDetails.arrivalTime)}${nm ? ` (${nm})` : ""}`; }).join(" | ") }; }) };
}

// journeys.json: [{ title, from: { name, geo: [lat, lon], station? }, to: { … }, modes?: { from, to }, question: { kind, at: "2026-11-04T08:00" } }]
const J = JSON.parse(readFileSync(file, "utf8"));
const place = p => ({ id: p.name, name: p.name, address: p.address || "", geo: p.geo, kind: p.kind || "address", station: p.station || null });
const results = [];
for (const [i, jn] of J.entries()) {
  const from = place(jn.from), to = place(jn.to), modes = jn.modes || { from: "walk", to: "walk" };
  const q = { kind: jn.question.kind, t: new Date(jn.question.at).getTime() };
  const now = jn.now ? new Date(jn.now).getTime() : q.kind === "by" ? q.t - 4 * 3600e3 : q.t;
  const c0 = tflCalls, g0 = gCalls; let app, err = null;
  try { app = await core.planTrip({ from, to, modes, question: q, now, leisureKmh: jn.leisureKmh || 4.5, cfg }, { stations: idx, access, planner }); } catch (e) { err = `${e.code || ""} ${e.message}`; }
  const tfl = await tflDoor(from, to, q), g = googleTransit(from, to, q), pick = app && app.picks[0];
  const row = { title: jn.title, question: `${q.kind} ${dayhm(q.t)}`, walks: GKEY ? "Google route matrix" : "straight-line stand-in",
    app: err ? { error: err } : { pick: pick ? { leave: dayhm(pick.leave), arrive: dayhm(pick.arrive), alight: pick.toStation.name, alightKey: core.stationKey(pick.toStation), legs: legs(pick), after: pick.after.map(s => `${s.step.d} ${Math.round(s.secs / 60)}m`).join("; "), flags: pick.flags.map(f => f.txt) } : null,
      next: app.picks[1] ? { leave: dayhm(app.picks[1].leave), arrive: dayhm(app.picks[1].arrive), alight: app.picks[1].toStation.name } : null,
      boardings: [...new Set(app.journeys.map(j => j.fromStation.name))], alightings: [...new Set(app.journeys.map(j => j.toStation.name))], journeys: app.journeys.length, requests: app.requests, failed: app.failed, notes: app.notes },
    tfl: tfl.status === 200 ? { how: tfl.how, journeys: tfl.journeys.slice(0, 3) } : { how: tfl.how, status: tfl.status }, google: g.status === 200 ? g.routes.slice(0, 3) : { status: g.status, error: g.error }, calls: { tfl: tflCalls - c0, google: gCalls - g0 } };
  results.push(row);
  console.log(`\n## ${i + 1}. ${jn.title} [${row.question}]  (TfL ${row.calls.tfl}, Google ${row.calls.google} calls; walks: ${row.walks})`);
  if (err) console.log("  APP ERROR:", err); else { console.log("  APP pick:", pick ? `leave ${dayhm(pick.leave)} → arrive ${dayhm(pick.arrive)} alight ${pick.toStation.name} :: ${legs(pick)} :: ${row.app.pick.after}` : "none");
    if (app.picks[1]) console.log(`  APP next: ${dayhm(app.picks[1].leave)} → ${dayhm(app.picks[1].arrive)} alight ${app.picks[1].toStation.name}`);
    console.log(`  APP boardings: ${row.app.boardings.join(", ")} | alightings: ${row.app.alightings.join(", ")} | journeys ${app.journeys.length} | requests ${JSON.stringify(app.requests)}`);
    if (app.failed.length) console.log("  APP failed:", app.failed.map(f => `${f.pair}: ${f.why}`).join(" ;; ")); if (app.notes.length) console.log("  APP notes:", app.notes.join(" ;; ")); }
  if (tfl.status !== 200) console.log(`  TFL (${tfl.how}): HTTP`, tfl.status); else tfl.journeys.slice(0, 3).forEach(j => console.log(`  TFL (${tfl.how}): ${j.start} → ${j.arrive} (${j.duration}m) :: ${j.legs}`));
  if (g.status !== 200) console.log("  GOOGLE:", g.error || `HTTP ${g.status}`); else g.routes.slice(0, 3).forEach(r => console.log(`  GOOGLE: ${r.start} → ${r.arrive} (${r.duration}) :: ${r.legs}`));
  writeFileSync(outFile, scrub(JSON.stringify(results, null, 1)));
}
console.log(`\nTotal calls: TfL ${tflCalls}, Google ${gCalls}. Written: ${outFile}`);
