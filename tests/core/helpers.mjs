// Shared helpers for engine tests. The engine is the built ES module (npm run build).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const core = await import(path.join(ROOT, "dist/core.mjs"));
export const fixture = (name) => JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures", name), "utf8"));
export const at = (day, time) => new Date(`${day}T${time}:00`).getTime();
export const text = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
export const MIN = 60e3;

// A made-up corridor, to prove nothing in the engine is tied to Letchworth:
// Riverside (home) ⇄ Central or Market Street in the city; one operator calls at both city stations.
export const testville = {
  id: "testville", name: "Test: Riverside ⇄ city", home: "RVS",
  stationNames: { RVS: "Riverside", CEN: "Central", MKT: "Market Street" },
  hubNames: { CEN: "Central", MKT: "Market Street" },
  stationPatterns: { RVS: "riverside", CEN: "central", MKT: "market street" },
  coords: { RVS: "50.1,-1.1", CEN: "50.0,-1.0", MKT: "50.01,-1.01" },
  lines: { CEN: [[50.1, -1.1], [50.05, -1.05], [50.0, -1.0]], MKT: [[50.1, -1.1], [50.05, -1.05], [50.01, -1.01]] },
  maxTrainMin: { CEN: 40, MKT: 45 }, stoppingMin: { CEN: 30, MKT: 35 },
  mergeHubs: ["MKT", "CEN"], operatorByHub: { CEN: "Express Rail", MKT: "Metro Rail" },
  busy: { from: "RVS", to: "CEN", operator: "express", arrFrom: "07:00", arrTo: "07:30", days: [1, 2, 3, 4, 5], maxMins: 20, origins: "faraway", holidays: [] },
};

let n = 0;
export function train(o) {
  return Object.assign({ std: "00:00", depLate: 0, arrLate: 0, depUnknown: false, arrUnknown: false, platform: null, operator: "Express Rail", cancelled: false, reason: "" }, o);
}
export function option(o) { n++; return Object.assign({ flags: [] }, o, { id: o.id || `o${n}` }); }
