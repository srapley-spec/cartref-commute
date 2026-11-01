// Shared Trip-mode page fixtures: the recorded TfL reply, the station list and a stub of google.maps (synthetic).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { json, sleep } from "./harness.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIONS = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));
const BTN_CBW = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/trip/tfl-brighton-canterburywest.json"), "utf8")).body;
export const TRIP_PLACES = {
  brighton: { id: "G-BTN", primary: "Brighton Station", secondary: "Queens Road, Brighton BN1 3XP", geo: [50.8290, -0.1412] },
  cathedral: { id: "G-CAT", primary: "Canterbury Cathedral", secondary: "The Precincts, Canterbury CT1 2EH", geo: [51.2798, 1.0828] },
};
export const TRIP_SETTINGS = { provider: "tfl", tflKey: "k", followRoute: true, trip: true, googleKey: "AIzaTEST" };
export function tripRoute(u) {
  if (/data\/stations\.json/.test(u)) return json(STATIONS);
  if (/JourneyResults\/90000899\/to\/1001160/.test(u)) return json(BTN_CBW);
  if (/JourneyResults\/\d+\/to\/\d+/.test(u)) return json({ message: "No journey found" }, 404);
  return undefined;
}
export function stubGoogle(w) {
  class AutocompleteSessionToken {}
  w.google = { maps: { importLibrary: async (name) => {
    if (name === "places") return { AutocompleteSessionToken,
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async ({ input }) => ({ suggestions: Object.values(TRIP_PLACES)
        .filter(p => (p.primary + " " + p.secondary).toLowerCase().includes(input.toLowerCase()))
        .map(p => ({ placePrediction: { placeId: p.id, mainText: { text: p.primary }, secondaryText: { text: p.secondary }, text: { text: p.primary } } })) }) },
      Place: class { constructor({ id }) { this.id = id; } async fetchFields() { const p = Object.values(TRIP_PLACES).find(x => x.id === this.id);
        this.displayName = p.primary; this.formattedAddress = p.secondary; this.location = { lat: () => p.geo[0], lng: () => p.geo[1] }; } } };
    if (name === "routes") return { RouteMatrix: { computeRouteMatrix: async ({ origins, destinations, travelMode }) => {
      const d = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 70) * 1300;
      return { matrix: { rows: origins.map(o => ({ items: destinations.map(x => ({ distanceMeters: Math.round(d(o, x)), durationMillis: Math.round(d(o, x) / (travelMode === "DRIVING" ? 9 : 1.3)) * 1000, condition: "ROUTE_EXISTS" })) })) } }; } } };
  } } };
}
async function chooseIn(a, end, text) {
  const input = a.d.querySelector(`#tripInput-${end}`);
  input.focus(); input.value = text; input.dispatchEvent(new a.w.Event("input", { bubbles: true }));
  await sleep(320);
  for (const k of ["ArrowDown", "Enter"]) input.dispatchEvent(new a.w.KeyboardEvent("keydown", { key: k, bubbles: true }));
  await sleep(80);
}
export async function until(fn, ms = 4000) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(25); } return fn(); }
/** Open Trip and plan Brighton Station → Canterbury Cathedral (walk / walk, Leave now). */
export async function planBrightonCanterbury(a) {
  stubGoogle(a.w);
  a.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await chooseIn(a, "from", "brighton station"); await chooseIn(a, "to", "canterbury cath");
  await until(() => a.d.querySelectorAll("#tripResults .trip-row").length);
}
