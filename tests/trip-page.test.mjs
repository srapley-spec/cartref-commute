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
  letchworth: { id: "G-LET", primary: "Letchworth town centre", secondary: "Letchworth Garden City SG6", geo: [51.983, -0.228] },
  braham: { id: "G-OB", primary: "One Braham", secondary: "1 Braham Street, London E1 8EE", geo: [51.5139, -0.0712] },
};
// Issue #56 replies, recorded for Wed 4 Nov 07:30–09:00; moved to the test clock's day, three hours later (10:30–).
const shifted = n => JSON.parse(readFileSync(path.join(ROOT, `tests/fixtures/trip/tfl-${n}.json`), "utf8"), (k, v) =>
  typeof v === "string" && /^2026-11-04T\d\d:\d\d:\d\d$/.test(v) ? `2026-11-03T${String(Number(v.slice(11, 13)) + 3).padStart(2, "0")}${v.slice(13)}` : v).body;
const LET_TO = { 1001108: shifted("letchworth-fenchurchst"), 1000138: shifted("letchworth-liverpoolst"), 1000268: shifted("letchworth-whitechapel") };
const LET_TO_BRAHAM = shifted("letchworth-onebraham");
const ON = { provider: "tfl", tflKey: "k", followRoute: true, trip: true };
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
    if (name === "routes") return { RouteMatrix: { computeRouteMatrix: async ({ origins, destinations, travelMode, departureTime }) => { seen.matrix++;
      if (travelMode === "DRIVING") (seen.drive = seen.drive || []).push(departureTime ? departureTime.getTime() : null);
      (seen.modes = seen.modes || []).push(travelMode);
      const d = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 70) * 1300;
      const extra = travelMode === "DRIVING" && opts.driveExtraMin ? opts.driveExtraMin() * 60e3 : 0;
      const item = (a, b) => ({ distanceMeters: Math.round(d(a, b)), durationMillis: Math.round(d(a, b) / (travelMode === "DRIVING" ? 9 : 1.3)) * 1000 + extra, condition: "ROUTE_EXISTS" });
      return { matrix: { rows: origins.map(o => ({ items: destinations.map(x => item(o, x)) })) } }; } } };
  } } };
  return seen;
}
const route = (u) => {
  if (/data\/stations\.json/.test(u)) return json(STATIONS);
  if (/JourneyResults\/90000899\/to\/1001160/.test(u)) return json(BTN_CBW);
  const let_ = /JourneyResults\/1000460\/to\/(\d+)\?/.exec(u); if (let_ && LET_TO[let_[1]]) return json(LET_TO[let_[1]]);
  if (/JourneyResults\/1000460\/to\/51\.51390,-0\.07120\?/.test(u)) return json(LET_TO_BRAHAM);
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
  const app = await createApp({ settings: { provider: "tfl" }, route });
  assert.equal(app.d.querySelector("#tripModeBtn").hidden, true);
  assert.equal(app.d.querySelector("#tripRoot").hidden, true);
  assert.equal(app.d.documentElement.dataset.trip, "off");
  assert.ok(!app.calls.some(isTrip), app.calls.filter(isTrip).join("\n"));
});

test("Trip upgrade: an obsolete disabled Signal preference cannot hide an enabled saved Trip", async () => {
  const app=await createApp({settings:{...ON,signal:false},saved:{tripMode:{active:true}},route});
  assert.equal(app.d.documentElement.dataset.design,'signal');
  assert.equal(app.d.querySelector('#tripModeBtn').hidden,false);
  assert.equal(app.d.querySelector('#tripRoot').hidden,false);
  assert.equal(app.d.documentElement.dataset.trip,'on');
  assert.equal(app.c.state.saved.tripMode.active,true);
  assert.deepEqual(app.errors,[]);app.close();
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

test("Trip to a place near a Tube stop (#56): Letchworth → One Braham recommends alighting at Aldgate, with the Tube leg, exit and final walk shown, and Follow keeps it", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  const before = app.calls.length;
  await type(app, "from", "letchworth town"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "one braham"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => /Letchworth Garden City → Aldgate(?! East)/.test(app.text("#tripResults")), 6000);
  const text = app.text("#tripResults");
  // The recommendation itself (the first complete card), not merely some row further down the list.
  const pick = app.d.querySelector("#tripResults .trip-row[data-trip-id]").textContent.replace(/\s+/g, " ");
  assert.match(pick, /Letchworth Garden City → Aldgate(?! East)/, pick.slice(0, 300));
  assert.match(pick, /Leave by/);
  assert.ok([...app.d.querySelectorAll("#tripResults [data-trip-id]")].some(e => /Letchworth Garden City → Aldgate East/.test(e.textContent)), "the search to the place itself contributes its own journey rows (not merely a diagnostic line)");
  assert.match(text, /Metropolitan line to Aldgate|Tube/);
  assert.match(text, /Out of Aldgate/); assert.match(text, /Walk to your destination/);
  assert.match(text, /London Fenchurch Street: 3 journeys alight at Aldgate \/ Tower Hill and walk on; kept/);
  const after = app.calls.slice(before);
  assert.ok(after.some(u => /JourneyResults\/1000460\/to\/51\.51390,-0\.07120\?/.test(u)), "asked TfL for the place itself");
  assert.ok(after.filter(u => /JourneyResults/.test(u)).length <= 18);
  await until(() => app.d.querySelector("#tripResults [data-trip-follow]"));
  app.d.querySelector("#tripResults [data-trip-follow]").click();
  await until(() => app.d.querySelector("[data-trip-stop]"));
  const saved = JSON.parse(app.w.localStorage.getItem("cartrefCommute.v1")).tripMode.follow;
  assert.equal(saved.journey.toStation.name, "Aldgate"); assert.equal(saved.journey.toStation.crs, ""); assert.deepEqual(saved.journey.toStation.ids.tfl, ["940GZZLUALD"]);
  assert.match(app.text("#tripResults"), /Aldgate/);
});

test("Trip UK-wide: Letchworth → Newcastle plans through the page via Stevenage, with the total, Leave by and a York change flagged", async () => {
  PLACES.newcastle = { id: "G-NCL", primary: "Grey's Monument", secondary: "Newcastle upon Tyne NE1 7AL", geo: [54.9738, -1.6131] };
  const ncl = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/trip/tfl-letchworth-newcastle.json"), "utf8"), (k, v) =>
    typeof v === "string" && /^2026-11-04T\d\d:\d\d:\d\d$/.test(v) ? `2026-11-03T${String(Number(v.slice(11, 13)) + 2).padStart(2, "0")}${v.slice(13)}` : v).body;
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route: u => /JourneyResults\/1000460\/to\/90005367\?/.test(u) ? json(ncl) : route(u) });   // Newcastle by its ICS code
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "from", "letchworth town"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "grey's monument"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => /Letchworth Garden City → Newcastle/.test(app.text("#tripResults")), 6000);
  const pick = app.d.querySelector("#tripResults .trip-row[data-trip-id]").textContent.replace(/\s+/g, " ");
  assert.match(pick, /Leave by/); assert.match(pick, /Letchworth Garden City → Newcastle/); assert.match(pick, /3 changes/);
  assert.match(pick, /Connection at risk, 0 min/);
  assert.match(pick, /Arrive Newcastle/); assert.match(pick, /Stevenage/); assert.ok(!/Arrive London Kings Cross/.test(pick), "not via King's Cross");
  assert.ok(!/Outside the area/.test(app.text("#tripResults")));
  delete PLACES.newcastle;
});

test("Trip UK-wide: two Tube boarding stops from one London station are two planner-cache keys, so each gets its own later search", async () => {
  PLACES.office = { id: "G-OB2", primary: "One Braham (office)", secondary: "1 Braham Street, London E1 8EE", geo: [51.5139, -0.0712] };
  PLACES.newcastle = { id: "G-NCL", primary: "Grey's Monument", secondary: "Newcastle upon Tyne NE1 7AL", geo: [54.9738, -1.6131] };
  const shift = body => JSON.parse(JSON.stringify(body), (k, v) => typeof v === "string" && /^2026-11-04T\d\d:\d\d:\d\d$/.test(v) ? `2026-11-03T${String(Number(v.slice(11, 13)) + 2).padStart(2, "0")}${v.slice(13)}` : v);
  // Fenchurch Street → Newcastle: TfL walks to Aldgate first; journey 1 re-pointed to walk to Tower Hill instead (a stop TfL knows, the list doesn't)
  const fst = shift(JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/trip/tfl-fenchurchst-newcastle.json"), "utf8")).body);
  const j = fst.journeys[1]; j.legs[1].departurePoint = { naptanId: "940GZZLUTWH", commonName: "Tower Hill Underground Station", lat: 51.5098, lon: -0.0766 }; j.legs[0].arrivalPoint = { ...j.legs[1].departurePoint };
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route: u => /JourneyResults\/1001108\/to\/90005367\?/.test(u) ? json(fst) : route(u) });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  const before = app.calls.length;
  await type(app, "from", "one braham (office"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "grey's monument"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => /Aldgate → Newcastle/.test(app.text("#tripResults")) && app.d.querySelector("#tripResults .trip-row"), 6000);
  await sleep(600);
  const text = app.text("#tripResults");
  assert.match(text, /Aldgate → Newcastle/); assert.match(text, /Tower Hill → Newcastle/);
  const after = app.calls.slice(before);
  assert.ok(after.some(u => /JourneyResults\/1000003\/to\/90005367\?/.test(u)), "a later search from Aldgate (its ICS code)");
  assert.ok(after.some(u => /JourneyResults\/940GZZLUTWH\/to\/90005367\?/.test(u)), "and one from Tower Hill: not served from Aldgate's cache entry");
  delete PLACES.office; delete PLACES.newcastle;
});

test("Trip taxi and gaps: Letchworth → Washington shows a taxi from Chester-le-Street with distance and road time; London → Fort William in the evening shows Google Maps' direct sleeper as a gap", async () => {
  PLACES.washington = { id: "G-WASH", primary: "Washington NE38 8SE", secondary: "Washington, Tyne and Wear", geo: [54.8874, -1.5101] };
  PLACES.office = { id: "G-OB2", primary: "One Braham (office)", secondary: "1 Braham Street, London E1 8EE", geo: [51.5139, -0.0712] };
  PLACES.fortwilliam = { id: "G-FTW", primary: "Fort William", secondary: "Highland PH33", geo: [56.8210, -5.1048] };
  const shift = (name, hours) => JSON.parse(readFileSync(path.join(ROOT, `tests/fixtures/trip/${name}.json`), "utf8"), (k, v) =>
    typeof v === "string" && /^2026-11-0[45]T\d\d:\d\d:\d\d(Z?)$/.test(v) ? new Date(Date.parse(v.endsWith("Z") ? v : v + "Z") + hours * 3600e3 - 86400e3).toISOString().replace(/\.000Z$/, v.endsWith("Z") ? "Z" : "") : v).body;
  const cls = shift("tfl-letchworth-chesterlestreet", 2), back = shift("tfl-chesterlestreet-letchworth", -7), ftw = shift("tfl-fenchurchst-fortwilliam-evening", -9), gftw = shift("google-london-fortwilliam-evening", -9);
  let gapsAsked = 0;
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route: u => /JourneyResults\/1000460\/to\/90001577\?/.test(u) ? json(cls) : /JourneyResults\/90001577\/to\/1000460\?/.test(u) ? json(back) : /JourneyResults\/1001108\/to\/90002865\?/.test(u) ? json(ftw) : route(u) });
  googleStub(app.w);
  // Google's transit routes through the Maps JS stub: a DirectionsService answering in the library's shape from the recorded REST reply
  const rest = gftw.routes[0].legs[0].steps;
  app.w.google.maps.importLibrary = (orig => async name => { const lib = await orig(name); if (name !== "routes") return lib;
    return { ...lib, TravelMode: { TRANSIT: "TRANSIT" }, TransitMode: { RAIL: "RAIL", SUBWAY: "SUBWAY", TRAIN: "TRAIN", TRAM: "TRAM" },
      DirectionsService: class { async route() { gapsAsked++; return { routes: [{ legs: [{ steps: rest.map(s => s.travelMode === "TRANSIT" ? { travel_mode: "TRANSIT", transit: { departure_stop: { name: s.transitDetails.stopDetails.departureStop.name }, arrival_stop: { name: s.transitDetails.stopDetails.arrivalStop.name },
        departure_time: { value: new Date(s.transitDetails.stopDetails.departureTime) }, arrival_time: { value: new Date(s.transitDetails.stopDetails.arrivalTime) }, line: { short_name: s.transitDetails.transitLine.nameShort, vehicle: { type: s.transitDetails.transitLine.vehicle.type } } } }
        : { travel_mode: "WALKING", duration: { value: parseFloat(s.staticDuration) } }) }] }] }; } } }; })(app.w.google.maps.importLibrary);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "from", "letchworth town"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "washington ne38"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => /Taxi to your destination/.test(app.text("#tripResults")), 6000);
  const text = app.text("#tripResults");
  assert.match(text, /Taxi to your destination · 7\.\d km · about \d+ min by road, 5 min to get one · 1h \d+m on foot/);
  assert.match(text, /Taxi from Chester-Le-Street: 7\.\d km, about \d+ min by road/);
  assert.match(text, /Nearest station to where you're going is 5\.6 km away/);
  assert.ok(!/Taxi to station/.test(app.d.querySelector("#tripResults .journey-reach").textContent), "the pill says Walk to station when the taxi is at the far end");
  // The return plans from Washington: the taxi is the first leg and the access pill says so
  await type(app, "from", "washington ne38"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "letchworth town"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => /Taxi to Chester-Le-Street/.test(app.text("#tripResults")), 6000);
  const reach = app.d.querySelector("#tripResults .journey-reach").textContent;
  assert.match(reach, /Taxi to station/, reach); assert.ok(!/Walk to station/.test(reach), reach);
  // The evening Fort William plan from the office: the gap block names Google's direct sleeper and says why it can't be followed
  const choose = async (end, text, re) => { for (let i = 0; i < 3 && !re.test(app.d.querySelector(`#tripInput-${end}`).value); i++) {
    await type(app, end, text); await until(() => options(app, end).some(o => re.test(o)), 2000); key(app, end, "ArrowDown"); key(app, end, "Enter"); await sleep(150); }
    assert.match(app.d.querySelector(`#tripInput-${end}`).value, re, `${end} chosen`); };
  await choose("from", "one braham (office", /One Braham/); await choose("to", "fort william", /Fort William/);
  await until(() => /Google Maps also finds/.test(app.text("#tripResults")) && /Fort William/.test(app.text("#tripResults .trip-row") || ""), 8000);
  const gap = app.d.querySelector("#tripResults .trip-gaps"); assert.ok(gap, "gaps block present");
  assert.match(gap.textContent, /Leave \d\d:\d\d, arrive \d\d:\d\d: .*Euston \d\d:\d\d → Fort William \d\d:\d\d \(Caledonian Sleeper\)/);
  assert.match(gap.textContent, /Reaches Fort William \d+h \d+m sooner than the best found here; not in TfL's planner, so no live times or Follow for it\./);
  assert.match(gap.querySelector(".trip-attrib").textContent, /Powered by Google/);
  assert.equal(gap.querySelectorAll(".trip-gap").length, 1, "the same sleeper by another Tube is one gap");
  assert.ok(gapsAsked >= 3, `Google's transit route asked for each plan (Washington, the return, Fort William): ${gapsAsked}`);
  delete PLACES.washington; delete PLACES.office; delete PLACES.fortwilliam;
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
PLACES.dublin = { id: "G-DUB", primary: "Dublin Connolly", secondary: "Amiens Street, Dublin 1", geo: [53.3509, -6.2501] };
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
  await type(app, "to", "dublin"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter"); await sleep(100);
  assert.match(app.text("#tripResults"), /Outside the area this plans: Great Britain/);
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

// ---------- Re-review survivors (of 7e4a1ad) ----------
PLACES.westgate = { id: "G-WG", primary: "Westgate Gardens", secondary: "St Peter's Place, Kent CT1 2BX", geo: [51.2800, 1.0720] };
PLACES.dane = { id: "G-DJ", primary: "Dane John Gardens", secondary: "Watling Street, Kent CT1 2QS", geo: [51.2755, 1.0790] };
const choose = async (app, end, text) => { await type(app, end, text); await sleep(320); key(app, end, "ArrowDown"); key(app, end, "Enter"); await sleep(80); };
const boardCalls = calls => calls.filter(u => /departures\/[A-Z]{3}\/to\/[A-Z]{3}/.test(u));

test("Trip live: one plan asks for at most 6 boards, never the same pair twice within 30 s", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => app.d.querySelectorAll("#tripResults .trip-row").length);
  await sleep(1500);
  const b = boardCalls(app.calls).map(u => /departures\/([A-Z]{3})\/to\/([A-Z]{3})/.exec(u).slice(1).join("-"));
  assert.ok(b.length >= 1 && b.length <= 6, b.join(","));
  assert.equal(new Set(b).size, b.length, `a pair asked twice: ${b.join(",")}`);
});

test("Trip live: boards are asked for as soon as round 1 is drawn, before the later searches come back", async () => {
  let laterDone = null, firstBoard = null;
  const slowLater = async (u, o) => {
    if (/departures\/[A-Z]{3}\/to\//.test(u) && firstBoard == null) firstBoard = Date.now();
    if (/JourneyResults\/90000899\/to\/1001160/.test(u) && !/time=10\d\d&/.test(u)) { await sleep(1500); laterDone = Date.now(); }
    return route(u, o);
  };
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route: slowLater });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => laterDone, 5000);
  assert.ok(firstBoard != null && laterDone != null && firstBoard < laterDone, `${firstBoard} ${laterDone}`);
});

test("Trip drive: re-checked every 5 min; 2 min or more moves the leave time and says which way; 1 min doesn't", async () => {
  const T = Date.parse("2026-11-03T09:00:00");
  let extra = 0;
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route, now: T });
  googleStub(app.w, { driveExtraMin: () => extra });
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  app.d.querySelector('[data-trip-mode="from:drive"]').click(); await sleep(30);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => app.d.querySelectorAll("#tripResults .trip-row").length);
  await sleep(300);
  const step = async (min, mins) => { extra = mins; app.setNow(T + min * 60e3); app.d.querySelector("#refreshBtn").click(); await sleep(900); return app.text("#tripStage"); };
  assert.equal(await step(5.1, 2), "Traffic: leave 2 min earlier");
  assert.doesNotMatch(await step(10.2, 1), /Traffic/, "1 min less: no notice");
  assert.equal(await step(15.3, -1), "Traffic: leave 2 min later");
});

test("Trip: places close together show the 'no train needed' card", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "from", "canterbury cath"); await choose(app, "to", "westgate");
  await until(() => /Close enough/.test(app.text("#tripResults")), 3000);
  assert.match(app.text("#tripResults"), /Close enough to walk: no train needed/);
});

test("Trip search: with two rows, Up from nothing goes to the last and Down from the last wraps to the first", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "to", "kent"); await sleep(320);
  assert.equal(options(app, "to").length, 2);
  const input = app.d.querySelector("#tripInput-to");
  key(app, "to", "ArrowUp"); assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-1");
  key(app, "to", "ArrowDown"); assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-0");
  key(app, "to", "ArrowUp"); assert.equal(input.getAttribute("aria-activedescendant"), "tripOpt-to-1");
});

test("Trip search: the same field starts a new session after a choice", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route });
  googleStub(app.w);
  let tokens = 0; const g = app.w.google.maps, orig = g.importLibrary;
  g.importLibrary = async (n) => { const lib = await orig(n); if (n !== "places") return lib; const Tk = lib.AutocompleteSessionToken; return { ...lib, AutocompleteSessionToken: class extends Tk { constructor() { super(); tokens++; } } }; };
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "to", "kent");
  await type(app, "to", "westgate"); await sleep(320);
  assert.equal(tokens, 2);
});

// ---------- Round 3: the request-cadence fixes, proved ----------
test("Trip drive: the 5-min re-check asks Google again for the same set-off (traffic now, not the cached answer)", async () => {
  const T = Date.parse("2026-11-03T09:00:00");
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route, now: T });
  const g = googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  app.d.querySelector('[data-trip-mode="from:drive"]').click(); await sleep(30);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => app.d.querySelectorAll("#tripResults .trip-row").length); await sleep(300);
  const slot = t => Math.floor(t / 300e3), before = g.drive.map(slot);
  app.setNow(T + 5.1 * 60e3); app.d.querySelector("#refreshBtn").click(); await sleep(900);
  const after = g.drive.slice(before.length).map(slot);
  assert.ok(after.some(x => before.includes(x) && x !== slot(T)), `re-timed set-off asked again: before ${before} after ${after}`);
});

test("Trip live: a redraw within 30 s reuses the boards; after 30 s they are asked for again", async () => {
  const T = Date.parse("2026-11-03T09:50:00");
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route, now: T });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => app.d.querySelector("#tripResults [data-trip-follow]")); await sleep(300);
  const pairs = () => boardCalls(app.calls).map(u => /departures\/([A-Z]{3})\/to\/([A-Z]{3})/.exec(u).slice(1).join("-"));
  const first = pairs();
  assert.ok(first.length >= 1);
  app.setNow(T + 10e3); app.d.querySelector("#tripResults [data-trip-follow]").click(); await sleep(300);
  const again10 = pairs().slice(first.length);
  assert.ok(!again10.some(p => first.includes(p)), `10 s later a pair was asked again: ${again10}`);
  app.d.querySelector("[data-trip-stop]").click(); await sleep(50);
  const n = pairs().length;
  app.setNow(T + 31e3); app.d.querySelector("#tripResults [data-trip-follow]").click(); await sleep(300);
  const again31 = pairs().slice(n);
  assert.ok(again31.some(p => first.includes(p)), `31 s later the boards are asked for again: ${again31}`);
});

test("Trip search through the proxy: the same field sends a new session after a choice", async () => {
  const tokens = [];
  const proxyRoute = async (u, o) => {
    if (/proxy\.example\/google\/places\/v1\/places:autocomplete/.test(u)) { const b = JSON.parse(o.body); tokens.push(b.sessionToken);
      return json({ suggestions: Object.values(PLACES).filter(p => (p.primary + " " + p.secondary).toLowerCase().includes(b.input.toLowerCase()))
        .map(p => ({ placePrediction: { placeId: p.id, text: { text: p.primary }, structuredFormat: { mainText: { text: p.primary }, secondaryText: { text: p.secondary } } } })) }); }
    if (/proxy\.example\/google\/places\/v1\/places\//.test(u)) { const id = decodeURIComponent(u.split("/places/v1/places/")[1].split("?")[0]); const p = Object.values(PLACES).find(x => x.id === id);
      return json({ id, displayName: { text: p.primary }, formattedAddress: p.secondary, location: { latitude: p.geo[0], longitude: p.geo[1] } }); }
    if (/proxy\.example\/google\/routes/.test(u)) return json([]);
    return route(u, o);
  };
  const app = await createApp({ settings: { ...ON, googleVia: "proxy", proxyBase: "https://proxy.example" }, route: proxyRoute });
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "to", "kent");
  await type(app, "to", "westgate"); await sleep(320);
  assert.equal(tokens.length, 2); assert.notEqual(tokens[0], tokens[1]);
});

test("Trip: changing the question clears the old journeys until the new plan arrives (never shown under the new label)", async () => {
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route: async (u, o) => { if (/JourneyResults/.test(u)) await sleep(400); return route(u, o); } });
  googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await type(app, "from", "brighton station"); await sleep(320); key(app, "from", "ArrowDown"); key(app, "from", "Enter");
  await type(app, "to", "canterbury cath"); await sleep(320); key(app, "to", "ArrowDown"); key(app, "to", "Enter");
  await until(() => app.d.querySelectorAll("#tripResults .trip-row").length, 6000);
  app.d.querySelector('[data-trip-q="by"]').click(); await sleep(50);
  assert.equal(app.d.querySelectorAll("#tripResults .trip-row").length, 0);
  assert.match(app.text("#tripStage"), /Finding trains/);
});

test("Trip: walking times are asked for once; the 5-min re-plan reuses them (only drives are asked again)", async () => {
  const T = Date.parse("2026-11-03T09:00:00");
  const app = await createApp({ settings: { ...ON, googleKey: "AIzaTEST" }, route, now: T });
  const g = googleStub(app.w);
  app.d.querySelector("#tripModeBtn").click(); await sleep(50);
  await choose(app, "from", "brighton station"); await choose(app, "to", "canterbury cath");
  await until(() => app.d.querySelectorAll("#tripResults .trip-row").length); await sleep(300);
  const before = g.modes.length;
  assert.ok(before >= 2 && g.modes.every(m => m === "WALKING"));
  app.setNow(T + 5.1 * 60e3); app.d.querySelector("#refreshBtn").click(); await sleep(900);
  assert.equal(g.modes.length, before, `re-asked: ${g.modes.slice(before)}`);
});
