// Google adapters for Trip mode against the shared contract: Maps JS library (stubbed google.maps), the proxy (mocked
// fetch, REST shapes, matrix elements shuffled) and the fixture/simulator adapter. Synthetic data: no Google key yet.
import { test } from "node:test";
import { createRequire } from "node:module";
import { suite, BACKEND, STATIONS } from "./contracts/google-ports.mjs";
const require = createRequire(import.meta.url);
const A = require("../src/trip-adapters.js");
const KEY = "AIzaTESTKEYDONOTUSE";
const failWith = { quota: Object.assign(new Error("RESOURCE_EXHAUSTED"), { code: "RESOURCE_EXHAUSTED" }), refused: Object.assign(new Error("REQUEST_DENIED"), { code: "REQUEST_DENIED" }),
  timeout: Object.assign(new Error("The operation was aborted"), { name: "AbortError" }), network: new TypeError("Failed to fetch") };
const net = (fetchT) => ({ fetchT, logRequest() {}, epoch: () => 1, assertEpoch() {} });

// --- Maps JS: a stub google.maps namespace answering from BACKEND in the library's shapes ---
function mapsJs(opts = {}) {
  const ended = [];
  class AutocompleteSessionToken { constructor() { this.t = Math.random(); } }
  const lastToken = new Map();
  const g = { maps: { importLibrary: async (name) => {
    if (opts.fail) throw failWith[opts.fail];
    if (name === "places") return {
      AutocompleteSessionToken,
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async ({ input, sessionToken, locationRestriction }) => {
        if (!locationRestriction || locationRestriction.south !== 50.55) throw new Error("no region");
        lastToken.set(sessionToken, true);
        return { suggestions: (BACKEND.suggestions[input] || []).map(s => ({ placePrediction: { placeId: s.id, text: { text: `${s.primary}, ${s.secondary}` }, mainText: { text: s.primary }, secondaryText: { text: s.secondary } } })) }; } },
      Place: class { constructor({ id }) { this.id = id; } async fetchFields({ sessionToken }) { const p = BACKEND.places[this.id]; ended.push(sessionToken);
        this.displayName = p.name; this.formattedAddress = p.address; this.location = { lat: () => p.geo[0], lng: () => p.geo[1] }; } },
    };
    if (name === "routes") return { RouteMatrix: { computeRouteMatrix: async ({ origins, destinations }) => {
      const m = BACKEND.matrix.walk, item = (x) => x ? { distanceMeters: x.metres, durationMillis: x.secs * 1000 + 400, condition: "ROUTE_EXISTS" } : { condition: "ROUTE_NOT_FOUND" };
      return { matrix: { rows: origins.length === 1 ? [{ items: destinations.map((_, i) => item(m[i])) }] : origins.map((_, i) => ({ items: [item(m[i])] })) } }; } } };
  } } };
  globalThis.google = g;
  const ad = A.googleMapsJs({ getKey: () => KEY, net: net(), loadScript: async () => {} });
  return { places: ad, access: ad, key: KEY, sessionsEnded: () => ended };
}
suite(test, "Maps JS library", mapsJs);

// --- Proxy: REST shapes via a mocked fetch; matrix elements come back shuffled (as the REST API streams them) ---
function proxy(opts = {}) {
  const fetchT = async (url, init = {}) => {
    if (opts.fail === "timeout" || opts.fail === "network") throw failWith[opts.fail];
    if (opts.fail) return { ok: false, status: opts.fail === "quota" ? 429 : 403, json: async () => ({}) };
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.includes("places:autocomplete")) return { ok: true, status: 200, json: async () => ({ suggestions: (BACKEND.suggestions[body.input] || []).map(s => ({ placePrediction: { placeId: s.id, text: { text: `${s.primary}, ${s.secondary}` }, structuredFormat: { mainText: { text: s.primary }, secondaryText: { text: s.secondary } } } })) }) };
    if (url.includes("/places/v1/places/")) { const id = decodeURIComponent(url.split("/places/v1/places/")[1].split("?")[0]); const p = BACKEND.places[id];
      return { ok: true, status: 200, json: async () => ({ id, displayName: { text: p.name }, formattedAddress: p.address, location: { latitude: p.geo[0], longitude: p.geo[1] } }) }; }
    if (url.includes("computeRouteMatrix")) { const to = body.origins.length === 1;
      const els = BACKEND.matrix.walk.map((x, i) => ({ originIndex: to ? 0 : i, destinationIndex: to ? i : 0, ...(x ? { condition: "ROUTE_EXISTS", distanceMeters: x.metres, duration: `${x.secs}s` } : { condition: "ROUTE_NOT_FOUND" }) }));
      return { ok: true, status: 200, json: async () => [els[2], els[0], els[1]] }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ad = A.googleProxy({ getBase: () => "https://proxy.example/", net: net(fetchT) });
  return { places: ad, access: ad };
}
suite(test, "proxy", proxy);

// --- Fixture / simulator adapter over the same backend data ---
function fixture(opts = {}) {
  const fail = async () => { throw opts.fail === "quota" ? Object.assign(new Error("q"), { rateLimited: true }) : opts.fail === "refused" ? Object.assign(new Error("r"), { refused: true }) : opts.fail === "timeout" ? Object.assign(new Error("t"), { timeout: true }) : Object.assign(new Error("n"), { network: true }); };
  const places = { attribution: A.ATTRIBUTION, newSession: (() => { let n = 0; return () => `f${++n}`; })(),
    suggest: opts.fail ? fail : async (t) => BACKEND.suggestions[t] || [], resolve: async (id) => ({ ...BACKEND.places[id] }) };
  const access = { matrix: opts.fail ? fail : async () => BACKEND.matrix.walk.map(x => x && { ...x }) };
  return { places, access };
}
suite(test, "fixture (simulator)", fixture);
void STATIONS;
