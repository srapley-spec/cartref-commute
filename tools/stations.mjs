// Build data/stations.json: the region's rail stations for Trip mode (docs/leisure-architecture.md §6).
// Run by hand (needs TFL_APP_KEY and RDM_API_KEY + RDM_BASE_URL in the environment); review the report, commit.
//   node tools/stations.mjs [--no-service]
// Sources: the open UK stations list (name, position, CRS; ODbL 1.0, github.com/davwheat/uk-railway-stations),
// TfL StopPoint (station IDs, ICS codes, car park), National Rail live departures (service level, measured once).
// Keys are read from the environment and never written: every saved string is checked for key-shaped text.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGION = { s: 50.55, w: -1.95, n: 52.75, e: 1.80 };   // must match LEISURE_DEFAULTS.region (src/core/trip/config.ts)
const LIST = "https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.json";
const TFL = process.env.TFL_APP_KEY, RDM = process.env.RDM_API_KEY, RDM_BASE = (process.env.RDM_BASE_URL || "").replace(/\/+$/, "");
const keepMeasured = process.argv.includes("--keep-measured");   // re-match TfL IDs only; keep car park / service
const withService = !keepMeasured && !process.argv.includes("--no-service");
const previous = keepMeasured ? new Map(JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8")).stations.map(s => [s.crs, s])) : new Map();
if (!TFL) throw new Error("TFL_APP_KEY is needed");
if (withService && (!RDM || !RDM_BASE)) throw new Error("RDM_API_KEY and RDM_BASE_URL are needed (or pass --no-service)");

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, headers = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
      if (!r.ok) return { status: r.status, json: null };
      return { status: 200, json: await r.json() };
    } catch { await sleep(2000 * 2 ** i); }
  }
  return { status: 0, json: null };
}
/** Run `fn` over `items` with at most `n` at once and at most `perSec` starts per second. */
async function pool(items, n, perSec, fn) {
  const out = new Array(items.length); let next = 0, done = 0;
  async function worker() {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); if (++done % 100 === 0) console.error(`  ${done}/${items.length}`); await sleep(1000 * n / perSec); }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
export const norm = s => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/ - .*$/, "").replace(/\brail station\b|\bstation\b|[^a-z0-9 ]/g, " ")
  .replace(/\bst\b/g, "saint").replace(/\s+/g, " ").trim();
const words = s => new Set(norm(s).split(" ").filter(w => w && w !== "london" && w !== "rail"));
// Words TfL adds for another line's part of the same station (Elizabeth line, East London line, low level).
const SAME_STATION = new Set(["ll", "ell", "xr", "rail-air", "air"]);
/** How well two station names agree: shared words over all words (0..1), ignoring same-station qualifiers. A
 *  subset is not a match: "Catford" is not "Catford Bridge", "Waterloo" is not "Waterloo East". */
function jaccard(A, B) { if (!A.size || !B.size) return 0; let k = 0; A.forEach(w => { if (B.has(w)) k++; }); return k / new Set([...A, ...B]).size; }
const noBrackets = s => String(s || "").replace(/\(.*?\)/g, " ");
export function nameScore(a, b) {
  const tidy = x => new Set([...words(x)].filter(w => !SAME_STATION.has(w)));
  return Math.max(...[[a, b], [noBrackets(a), b], [a, noBrackets(b)], [noBrackets(a), noBrackets(b)]].map(([x, y]) => jaccard(tidy(x), tidy(y)))); }
/** All the words of `a` are in `b` ("St Albans" in "St Albans City"). */
const within = (a, b) => { const A = words(noBrackets(a)), B = words(b); return A.size > 0 && [...A].every(w => B.has(w)); };

const list = (await (await fetch(LIST)).json()).filter(s => s.lat >= REGION.s && s.lat <= REGION.n && s.long >= REGION.w && s.long <= REGION.e && s.crsCode);
console.error(`${list.length} stations in the region`);
const overridesFile = path.join(ROOT, "data/stations-overrides.json");
const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, "utf8")) : {};

const report = [];
const rows = await pool(list, 4, 6, async st => {
  const o = overrides[st.crsCode] || {};
  const r = await get(`https://api.tfl.gov.uk/StopPoint?lat=${st.lat}&lon=${st.long}&stopTypes=NaptanRailStation&radius=400&app_key=${TFL}`);
  const near = (r.json && r.json.stopPoints) || [];
  let scored = near.map(p => ({ p, score: nameScore(st.stationName, p.commonName) })).filter(x => x.score >= 0.99);
  // No exact name: a lone rail station within 150 m whose name contains this one's ("St Albans City").
  if (!scored.length) { const close = near.filter(p => p.distance <= 150 && within(st.stationName, p.commonName)); if (close.length === 1) { scored = close.map(p => ({ p, score: 0.5 })); report.push(`- ${st.crsCode} ${st.stationName}: matched by position to ${close[0].id} ${close[0].commonName}`); } }
  let ids = o.tfl || scored.map(x => x.p.id);
  const ics = o.tflIcs || [...new Set(scored.map(x => x.p.icsCode).filter(Boolean))];
  if (!o.tfl && !scored.length) report.push(`- ${st.crsCode} ${st.stationName}: no TfL match within 400 m (${near.map(p => p.commonName).join("; ") || "none"})`);
  if (!o.tfl && scored.length > 1) report.push(`- ${st.crsCode} ${st.stationName}: several TfL IDs kept: ${scored.map(x => `${x.p.id} ${x.p.commonName}`).join("; ")}`);
  const prev = previous.get(st.crsCode);
  let carPark = o.carPark || (prev ? prev.carPark : "unknown");
  if (!o.carPark && !prev && ids[0]) {
    const d = await get(`https://api.tfl.gov.uk/StopPoint/${ids[0]}?app_key=${TFL}`);
    const f = ((d.json && d.json.additionalProperties) || []).find(a => /^car park$/i.test(a.key || ""));
    if (f) carPark = /^yes/i.test(String(f.value)) ? "yes" : /^no/i.test(String(f.value)) ? "no" : "unknown";
  }
  let servicePerHour = prev ? prev.servicePerHour : 0;
  if (withService) {
    const b = await get(`${RDM_BASE}/GetDepartureBoard/${st.crsCode}?numRows=150&timeWindow=120`, { "x-apikey": RDM });
    if (b.json) servicePerHour = Math.round(((b.json.trainServices || []).length / 2) * 10) / 10;
    else report.push(`- ${st.crsCode} ${st.stationName}: no departure board (HTTP ${b.status})`);
  }
  return { crs: st.crsCode, name: st.stationName, geo: [+st.lat.toFixed(5), +st.long.toFixed(5)], carPark, servicePerHour,
    ids: { ...(ids.length ? { tfl: ids } : {}), ...(ics.length ? { tflIcs: ics } : {}) } };
});

const out = { meta: { source: "UK railway stations (ODbL 1.0, github.com/davwheat/uk-railway-stations); TfL StopPoint; National Rail live departures",
  region: REGION, generated: new Date().toISOString(), servicePerHour: keepMeasured ? JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8")).meta.servicePerHour : withService ? `departures per hour over the 2 hours from ${new Date().toISOString()} (a coarse prior; re-run on a weekday)` : "not measured" },
  stations: rows.sort((a, b) => a.crs.localeCompare(b.crs)) };
const text = JSON.stringify(out);
if (/app_key=|x-apikey|[0-9a-f]{32}/i.test(text)) throw new Error("key-shaped text in the output: refusing to write");
writeFileSync(path.join(ROOT, "data/stations.json"), text.replace(/\},\{"crs"/g, '},\n{"crs"') + "\n");
writeFileSync(path.join(ROOT, "data/stations-report.md"), `# Station data report\n\nGenerated ${out.meta.generated}. ${rows.length} stations; ` +
  `${rows.filter(r => r.ids.tfl).length} with TfL IDs; car park yes/no/unknown: ${["yes", "no", "unknown"].map(k => rows.filter(r => r.carPark === k).length).join("/")}.\n` +
  `Fix rows below in data/stations-overrides.json ({"CRS": {"tfl": [...], "tflIcs": [...], "carPark": "yes"}}) and re-run.\n\n${report.sort().join("\n")}\n`);
console.error(`wrote data/stations.json (${rows.length}) and data/stations-report.md (${report.length} notes)`);
