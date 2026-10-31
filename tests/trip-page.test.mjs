// Trip mode on the page (docs/stories/leisure-journeys.md): the switch off and on, the setup card, the address
// combobox, a plan from a recorded TfL reply, Follow, and no commute requests while Trip is on screen.
// Google is a stub of google.maps (synthetic: no Google key exists yet).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, closeAll, sleep, json } from "./harness.mjs";

after(closeAll);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIONS = JSON.parse(readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));
const BTN_CBW = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/trip/tfl-brighton-canterburywest.json"), "utf8")).body;
const PLACES = {
  brighton: { id: "G-BTN", primary: "Brighton Station", secondary: "Queens Road, Brighton BN1 3XP", geo: [50.8290, -0.1412] },
  cathedral: { id: "G-CAT", primary: "Canterbury Cathedral", secondary: "The Precincts, Canterbury CT1 2EH", geo: [51.2798, 1.0828] },
};
const ON = { provider: "tfl", tflKey: "k", signal: true, followRoute: true, trip: true };
const isTrip = u => /data\/stations\.json|JourneyResults\/\d+\/to\/\d+|maps\.googleapis|google:/.test(u);

function googleStub(w, opts = {}) {
  const seen = { suggest: [], resolve: [], matrix: 0 };
  class AutocompleteSessionToken {}
  w.google = { maps: { importLibrary: async (name) => {
    if (name === "places") return { AutocompleteSessionToken,
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async ({ input }) => {
        seen.suggest.push(input);
        if (opts.slow && opts.slow.test(input)) await sleep(opts.slowMs || 600);
        const rows = Object.values(PLACES).filter(p => (p.primary + " " + p.secondary).toLowerCase().includes(input.toLowerCase()));
        return { suggestions: rows.map(p => ({ placePrediction: { placeId: p.id, mainText: { text: p.primary }, secondaryText: { text: p.secondary }, text: { text: p.primary } } })) }; } },
      Place: class { constructor({ id }) { this.id = id; } async fetchFields() { const p = Object.values(PLACES).find(x => x.id === this.id); seen.resolve.push(this.id);
        this.displayName = p.primary; this.formattedAddress = p.secondary; this.location = { lat: () => p.geo[0], lng: () => p.geo[1] }; } } };
    if (name === "routes") return { RouteMatrix: { computeRouteMatrix: async ({ origins, destinations }) => { seen.matrix++;
      const d = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 70) * 1300;
      const item = (a, b) => ({ distanceMeters: Math.round(d(a, b)), durationMillis: Math.round(d(a, b) / 1.3) * 1000, condition: "ROUTE_EXISTS" });
      return { matrix: { rows: origins.map(o => ({ items: destinations.map(x => item(o, x)) })) } }; } } };
  } } };
  return seen;
}
const route = (u) => {
  if (/data\/stations\.json/.test(u)) return json(STATIONS);
  if (/JourneyResults\/90000899\/to\/1001160/.test(u)) return json(BTN_CBW);
  if (/JourneyResults\/\d+\/to\/\d+/.test(u)) return json({ message: "No journey found" }, 404);
  return undefined;
};
async function type(app, end, text) {
  const input = app.d.querySelector(`#tripInput-${end}`);
  input.focus(); input.value = text; input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
}
const key = (app, end, k) => app.d.querySelector(`#tripInput-${end}`).dispatchEvent(new app.w.KeyboardEvent("keydown", { key: k, bubbles: true }));
const options = (app, end) => [...app.d.querySelectorAll(`#tripList-${end} [role=option]`)].map(li => li.textContent.trim());
async function until(fn, ms = 4000) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(25); } return fn(); }

test("Trip switch off: no Trip button, the commute as before, and no Trip or Google request", async () => {
  const app = await createApp({ settings: { provider: "tfl", signal: true }, route });
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, true);
  assert.equal(app.d.querySelector("#tripRoot").hidden, true);
  assert.equal(app.d.documentElement.dataset.trip, "off");
  assert.ok(!app.calls.some(isTrip), app.calls.filter(isTrip).join("\n"));
});

test("Trip switch on without Signal: no Trip button; a saved Trip screen falls back to the commute", async () => {
  const app = await createApp({ settings: { ...ON, signal: false }, saved: { tripMode: { active: true } }, route });
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, true);
  assert.equal(app.d.querySelector("#tripRoot").hidden, true);
  assert.ok(app.d.querySelector("#list"));
  assert.ok(!app.calls.some(isTrip));
});

test("Trip without a Google key: the setup card, nothing planned, no Google script or request", async () => {
  const app = await createApp({ settings: ON, route });
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, false);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  assert.equal(app.d.querySelector("#tripRoot").hidden, false);
  assert.match(app.text("#tripSetup"), /Add a Google Maps key in Settings/);
  await type(app, "to", "Canterbury"); await sleep(400);
  assert.match(options(app, "to").join("|") + app.text("#tripList-to"), /Add a Google Maps key/);
  assert.ok(!app.calls.some(u => /maps\.googleapis/.test(u)));
  assert.equal(app.d.querySelector('script[src*="maps.googleapis"]'), null);
});

test("Trip: address drop-down after 3 characters and 250 ms; keyboard choose; a late reply for older text is ignored", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  const g = googleStub(app.w, { slow: /^cant$/i });
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "ca"); await sleep(320);
  assert.deepEqual(g.suggest, [], "fewer than 3 characters: no search");
  await type(app, "to", "cant"); await sleep(300);          // slow reply in flight
  await type(app, "to", "canterbury"); await sleep(320);
  await sleep(700);                                          // the slow "cant" reply lands after
  assert.deepEqual(options(app, "to"), ["Canterbury CathedralThe Precincts, Canterbury CT1 2EH"]);
  assert.match(app.text("#tripList-to"), /Powered by Google/);
  const input = app.d.querySelector("#tripInput-to");
  assert.equal(input.getAttribute("role"), "combobox"); assert.equal(input.getAttribute("aria-expanded"), "true");
  key(app, "to", "ArrowDown");
  assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-0");
  key(app, "to", "Enter"); await sleep(100);
  assert.equal(input.value, "Canterbury Cathedral");
  assert.deepEqual(g.resolve, ["G-CAT"]);
  key(app, "to", "Escape");
});

test("Trip: Brighton → Canterbury plans door to door from TfL, every journey listed, and makes no commute requests", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  const before = app.calls.length;
  await type(app, "from", "brighton station"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "canterbury cath"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  const rows = await until(() => app.d.querySelectorAll("#tripResults .trip-row").length);
  assert.ok(rows >= 3, app.text("#tripResults"));
  assert.match(app.text("#tripResults"), /Leave by/);
  assert.match(app.text("#tripResults"), /Every journey, in leaving order/);
  assert.match(app.text("#tripResults"), /Brighton → .*Canterbury West/);
  assert.match(app.text("#tripResults"), /3 changes/);
  const after = app.calls.slice(before);
  assert.ok(after.some(u => /JourneyResults\/90000899\/to\/1001160/.test(u)));
  assert.ok(!after.some(u => /JourneyResults\/51\.|Line\/|national-rail\/Status|GetDepBoard.*LET/.test(u)), after.filter(u => !isTrip(u)).join("\n"));
  const planner = after.filter(u => /JourneyResults/.test(u)).length;
  assert.ok(planner <= 18, `${planner} planner searches`);
});

test("Trip: Follow a journey; the followed trip is saved and shown, and Stop following clears it", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "from", "brighton station"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "canterbury cath"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => app.d.querySelector("#tripResults [data-trip-follow]"));
  app.d.querySelector("#tripResults [data-trip-follow]").click();
  await until(() => app.d.querySelector("[data-trip-stop]"));
  const saved = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1"));
  assert.equal(saved.tripMode.follow.kind, "trip");
  assert.match(app.text("#tripResults"), /Arriving \d\d:\d\d|Your trip/);
  app.d.querySelector("[data-trip-stop]").click(); await sleep(50);
  assert.equal(JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).tripMode.follow, null);
});

test("Trip: back to Commute restores the commute screen and Trip's places are kept", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "canterbury cath"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter"); await sleep(100);
  app.d.querySelector('[data-mode="commute"]').click(); await sleep(100);
  assert.equal(app.d.documentElement.dataset.trip, "off");
  assert.equal(app.d.querySelector("#tripRoot").hidden, true);
  const saved = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1"));
  assert.equal(saved.tripMode.active, false); assert.equal(saved.tripMode.to.name, "Canterbury Cathedral");
  assert.equal(saved.mode, "commute");
});

// ---------- Edges the independent review found untested ----------
PLACES.birmingham = { id: "G-BHM", primary: "Birmingham New Street", secondary: "Birmingham B2 4QA", geo: [52.4778, -1.8990] };
PLACES.lewes = { id: "G-LEW", primary: "Lewes Castle", secondary: "Lewes BN7 1YE", geo: [50.8737, 0.0076] };

test("Trip search: nothing is asked for until 250 ms after the last keystroke", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  const g = googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "canterbury"); await sleep(180);
  assert.deepEqual(g.suggest, []);
  await sleep(150);
  assert.deepEqual(g.suggest, ["canterbury"]);
});

test("Trip search: a slow reply for older text never replaces the newer one's suggestions", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w, { slow: /^lew$/i, slowMs: 700 });
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  // "lew" (slow) would list Lewes Castle; "canterbury" lists the cathedral. The slow reply lands last.
  const g = app.w.google.maps; const orig = g.importLibrary;
  g.importLibrary = async (n) => { const lib = await orig(n); if (n !== "places") return lib;
    const f = lib.AutocompleteSuggestion.fetchAutocompleteSuggestions;
    return { ...lib, AutocompleteSuggestion: { fetchAutocompleteSuggestions: async (q) => (q.input === "lew" ? (await sleep(700), f({ ...q, input: "lewes" })) : f(q)) } }; };
  await type(app, "to", "lew"); await sleep(300);
  await type(app, "to", "canterbury"); await sleep(320);
  await sleep(800);
  assert.deepEqual(options(app, "to"), ["Canterbury CathedralThe Precincts, Canterbury CT1 2EH"]);
});

test("Trip search: choosing a place ends the search session; the next search starts a new one; recent places keep no position", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  let tokens = 0; const g = app.w.google.maps, orig = g.importLibrary;
  g.importLibrary = async (n) => { const lib = await orig(n); if (n !== "places") return lib; const T = lib.AutocompleteSessionToken; return { ...lib, AutocompleteSessionToken: class extends T { constructor() { super(); tokens++; } } }; };
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "canterbury cath"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter"); await sleep(100);
  await type(app, "from", "brighton station"); await sleep(320);
  assert.equal(tokens, 2);
  const saved = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).tripMode;
  assert.equal(saved.recent[0].name, "Canterbury Cathedral"); assert.equal(saved.recent[0].geo, undefined);
});

test("Trip search: arrow keys wrap round; Escape closes the list and keeps the text", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "canterbury"); await sleep(320);
  const input = app.d.querySelector("#tripInput-to");
  key(app, "to", "ArrowUp"); assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-0");   // one row: up wraps to it
  key(app, "to", "ArrowDown"); assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-0");
  key(app, "to", "Escape");
  assert.equal(app.d.querySelector("#tripList-to").hidden, true); assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(input.value, "canterbury");
});

test("Trip: a place outside the region is refused when chosen, with the region named", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "birmingham"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter"); await sleep(100);
  assert.match(app.text("#tripResults"), /Outside the area this plans: London, the South East and the East of England/);
  assert.equal(JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).tripMode.to, undefined);
});

test("Trip: the setup card shows without a key and hides with one; without a key nothing is planned from saved places", async () => {
  const saved = { tripMode: { active: true, from: { id: "G-BTN", name: "Brighton Station", address: "", geo: PLACES.brighton.geo, kind: "address" }, to: { id: "G-CAT", name: "Canterbury Cathedral", address: "", geo: PLACES.cathedral.geo, kind: "address" } } };
  const none = await createApp({ settings: ON, saved, route }); await sleep(200);
  assert.equal(none.d.querySelector("#tripSetup").hidden, false);
  assert.ok(!none.calls.some(u => /JourneyResults|stations\.json|maps\.googleapis/.test(u)), none.calls.join("\n"));
  const withKey = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, saved, route }); googleStub(withKey.w);
  withKey.d.querySelector('[data-trip-q="now"]').click(); await sleep(100);
  assert.equal(withKey.d.querySelector("#tripSetup").hidden, true);
});

test("Trip: Current location is used only within 200 m and 2 minutes", async () => {
  const saved = { tripMode: { active: true, from: { id: "current", name: "Current location", address: "", geo: [0, 0], kind: "current" }, to: { id: "G-CAT", name: "Canterbury Cathedral", address: "", geo: PLACES.cathedral.geo, kind: "address" } } };
  const rough = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, saved, route, geo: { coords: { latitude: 50.829, longitude: -0.141, accuracy: 500 } } });
  googleStub(rough.w); rough.d.querySelector('[data-trip-q="now"]').click(); await sleep(150);
  assert.match(rough.text("#tripResults"), /only known to 500 m/);
  const T = Date.parse("2026-11-03T10:00:00");
  const old = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, saved, route, now: T, geo: { coords: { latitude: 50.829, longitude: -0.141, accuracy: 20 } } });
  googleStub(old.w); old.setNow(T + 2 * 60e3 + 1000); old.d.querySelector('[data-trip-q="now"]').click(); await sleep(150);
  assert.match(old.text("#tripResults"), /more than 2 minutes old/);
});

test("Trip: choosing From starts timing its stations before To is chosen", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  const g = googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  const mark = app.calls.length;
  await type(app, "from", "brighton station"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await until(() => g.matrix > 0, 2000);
  assert.equal(g.matrix, 1);
  assert.ok(!app.calls.slice(mark).some(u => /JourneyResults/.test(u)), "no trains before To");
});

test("Trip: Refresh while Trip is on screen makes no commute request", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(100);
  const before = app.calls.length;
  app.d.querySelector("#refreshBtn").click(); await sleep(300);
  const after = app.calls.slice(before);
  assert.ok(!after.some(u => !isTrip(u)), after.join("\n"));
});

test("Trip settings: the Google key is never shown back, only its last 4 characters", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaSECRET1234" }, route });
  app.d.querySelector("#settingsBtn").click(); await sleep(50);
  assert.equal(app.d.querySelector("#s_googleKey").value, "");
  assert.match(app.text("#googleKeyNote"), /ends …1234/);
  assert.ok(!app.d.querySelector("#settings").innerHTML.includes("AIzaSECRET"));
});
