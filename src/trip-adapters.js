// Trip mode adapters: each implements one port (src/core/trip/ports.ts) with plain data in and out. The engine never
// sees which adapter is in use. Google has two (Maps JS library now; the proxy later, chosen in Settings), proved
// interchangeable by tests/contracts/google-ports.mjs. Every adapter takes `net` from the page so requests are logged,
// timed out, epoch-guarded and simulated like every other request; keys are read at call time and never returned.
// Exact Google class / field names are from Google's documentation and UNVERIFIED until a key exists.
/* exported tripAdapters */
const tripAdapters = (() => {
  "use strict";
  const err = (message, flags) => Object.assign(new Error(message), flags);
  /** Shared error mapping: quota → rateLimited; refused key / API not enabled → refused; abort → timeout; else network. */
  function googleError(e, what) {
    const s = String((e && (e.code || e.status || e.name || e.message)) || e);
    if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|429/i.test(s)) return err(`Google ${what}: too many requests for now.`, { rateLimited: true });
    if (/REQUEST_DENIED|PERMISSION_DENIED|403|API_KEY|ApiNotActivated|InvalidKey|RefererNotAllowed/i.test(s)) return err(`Google refused the ${what} request: check the key and that its APIs are enabled.`, { refused: true });
    if (/abort|timeout/i.test(s)) return err(`Google ${what} didn't respond in time.`, { timeout: true });
    return err(`Couldn't reach Google for ${what}.`, { network: true });
  }
  const httpError = (status, what) => status === 429 ? err(`${what}: too many requests for now.`, { rateLimited: true })
    : status === 401 || status === 403 ? err(`${what} refused the request (HTTP ${status}).`, { refused: true })
    : err(`${what} error (HTTP ${status}).`, { network: true });
  const MODE_JS = { walk: "WALKING", cycle: "BICYCLING", drive: "DRIVING" };
  const MODE_REST = { walk: "WALK", cycle: "BICYCLE", drive: "DRIVE" };
  const ATTRIBUTION = "Powered by Google";
  let sessions = 0;
  const newId = () => `s${Date.now().toString(36)}${(++sessions).toString(36)}`;

  /** Google through its Maps JavaScript library. `getKey()` from Settings; the library loads on first use only. */
  function googleMapsJs({ getKey, net, loadScript }) {
    let loading = null; const tokens = new Map();
    function ensureLoaded() {
      if (typeof google !== "undefined" && google.maps && google.maps.importLibrary) return Promise.resolve();
      if (!loading) loading = new Promise((resolve, reject) => {
        const key = getKey(); if (!key) { loading = null; reject(err("Add a Google Maps key in Settings.", { refused: true })); return; }
        const cb = `__tripMaps${Date.now()}`; window[cb] = () => { delete window[cb]; resolve(); };
        net.logRequest("https://maps.googleapis.com/maps/api/js?loading=async&libraries=places,routes");
        loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,routes&callback=${cb}`)
          .catch(e => { loading = null; reject(googleError(e, "maps")); });
      });
      return loading;
    }
    const lib = async name => { await ensureLoaded(); return google.maps.importLibrary(name); };
    const guarded = async (what, url, fn) => { const epoch = net.epoch(); net.logRequest(url);
      try { const v = await fn(); net.assertEpoch(epoch); return v; } catch (e) { if (e && e.sourceChanged) throw e; throw googleError(e, what); } };
    return {
      attribution: ATTRIBUTION, ensureLoaded,
      newSession() { const id = newId(); tokens.set(id, null); return id; },
      async suggest(text, session, r) {
        return guarded("address search", "google:places/autocomplete", async () => {
          const { AutocompleteSessionToken, AutocompleteSuggestion } = await lib("places");
          if (!tokens.get(session)) tokens.set(session, new AutocompleteSessionToken());
          const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: tokens.get(session),
            locationRestriction: { south: r.s, west: r.w, north: r.n, east: r.e }, includedRegionCodes: ["gb"] });
          return (suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 5).map(p => ({ id: p.placeId,
            primary: (p.mainText && p.mainText.text) || (p.text && p.text.text) || "", secondary: (p.secondaryText && p.secondaryText.text) || "" }));
        });
      },
      async resolve(id, session) {
        return guarded("place", "google:places/details", async () => {
          const { Place } = await lib("places");
          const place = new Place({ id });
          await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"], sessionToken: tokens.get(session) || undefined });
          tokens.delete(session);
          const loc = place.location; return { id, name: String(place.displayName || ""), address: String(place.formattedAddress || ""),
            geo: [typeof loc.lat === "function" ? loc.lat() : loc.lat, typeof loc.lng === "function" ? loc.lng() : loc.lng], kind: "address" };
        });
      },
      async matrix(place, stations, mode, at, dir) {
        return guarded("travel times", `google:routes/matrix/${mode}`, async () => {
          const { RouteMatrix } = await lib("routes");
          const pt = g => ({ lat: g[0], lng: g[1] });
          const a = [pt(place)], b = stations.map(pt);
          const { matrix } = await RouteMatrix.computeRouteMatrix({ origins: dir === "to" ? a : b, destinations: dir === "to" ? b : a,
            travelMode: MODE_JS[mode], fields: ["durationMillis", "distanceMeters", "condition"],
            ...(mode === "drive" ? { departureTime: new Date(Math.max(at, Date.now())), routingPreference: "TRAFFIC_AWARE" } : {}) });
          return stations.map((_, i) => { const item = dir === "to" ? matrix.rows[0].items[i] : matrix.rows[i].items[0];
            if (!item || item.condition === "ROUTE_NOT_FOUND" || item.error) return null;
            return { metres: Math.round(item.distanceMeters), secs: Math.floor(item.durationMillis / 1000) }; });
        });
      },
    };
  }

  /** Google's web APIs through the proxy (key held by the Worker). Same port, same outputs. */
  function googleProxy({ getBase, net }) {
    const base = () => String(getBase() || "").replace(/\/+$/, "");
    async function call(what, path, init) {
      if (!base()) throw err("Set your proxy's address in Settings.", { refused: true });
      const epoch = net.epoch(); let r;
      try { r = await net.fetchT(`${base()}/google/${path}`, init); } catch (e) { if (e && e.sourceChanged) throw e; throw googleError(e, what); }
      net.assertEpoch(epoch);
      if (!r.ok) throw httpError(r.status, `Google ${what}`);
      return r.json();
    }
    const post = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const ll = g => ({ waypoint: { location: { latLng: { latitude: g[0], longitude: g[1] } } } });
    return {
      attribution: ATTRIBUTION,
      newSession: () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : newId()),
      async suggest(text, session, r) {
        const j = await call("address search", "places/v1/places:autocomplete", post({ input: text, sessionToken: session, includedRegionCodes: ["gb"],
          locationRestriction: { rectangle: { low: { latitude: r.s, longitude: r.w }, high: { latitude: r.n, longitude: r.e } } } }));
        return (j.suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 5).map(p => ({ id: p.placeId,
          primary: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || (p.text && p.text.text) || "",
          secondary: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || "" }));
      },
      async resolve(id, session) {
        const j = await call("place", `places/v1/places/${encodeURIComponent(id)}?sessionToken=${encodeURIComponent(session)}`, {});
        return { id, name: String((j.displayName && j.displayName.text) || ""), address: String(j.formattedAddress || ""), geo: [j.location.latitude, j.location.longitude], kind: "address" };
      },
      async matrix(place, stations, mode, at, dir) {
        const a = [ll(place)], b = stations.map(ll);
        const j = await call("travel times", "routes/distanceMatrix/v2:computeRouteMatrix", post({ origins: dir === "to" ? a : b, destinations: dir === "to" ? b : a,
          travelMode: MODE_REST[mode], ...(mode === "drive" ? { routingPreference: "TRAFFIC_AWARE", departureTime: new Date(Math.max(at, Date.now())).toISOString() } : {}) }));
        const out = stations.map(() => null);
        (Array.isArray(j) ? j : []).forEach(e => { const i = dir === "to" ? e.destinationIndex : e.originIndex;
          if (i == null || i >= out.length || (e.condition && e.condition !== "ROUTE_EXISTS") || (e.status && e.status.code)) return;
          out[i] = { metres: Math.round(e.distanceMeters || 0), secs: Math.floor(parseFloat(String(e.duration || "0").replace(/s$/, ""))) }; });
        return out;
      },
    };
  }

  /** TfL's journey planner, station to station by each station's ICS code (one per station, unlike naptan IDs). */
  function tflPlanner({ net, getKey, idx, endMatchM, core }) {
    return {
      name: "TfL",
      async plan(from, to, t, timeIs) {
        const a = (from.ids.tflIcs || [])[0] || (from.ids.tfl || [])[0], b = (to.ids.tflIcs || [])[0] || (to.ids.tfl || [])[0];
        if (!a || !b) return { journeys: [], refused: [`TfL doesn't know ${!a ? from.name : to.name}`] };
        const d = new Date(t), p = n => String(n).padStart(2, "0");
        const key = getKey();
        const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${a}/to/${b}?date=${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}&time=${p(d.getHours())}${p(d.getMinutes())}&timeIs=${timeIs}&mode=${core.TFL_TRIP_MODES}&journeyPreference=leasttime${key ? `&app_key=${encodeURIComponent(key)}` : ""}`;
        const epoch = net.epoch(); let r;
        try { r = await net.fetchT(url); } catch (e) { if (e && e.sourceChanged) throw e; throw err(e && e.timeout ? "TfL's journey planner didn't respond in time." : "Couldn't reach TfL's journey planner.", { timeout: !!(e && e.timeout), network: true, rateLimited: !!(e && e.rateLimited) }); }
        net.assertEpoch(epoch);
        if (r.status === 404) return { journeys: [], refused: [`TfL found no journey from ${from.name} to ${to.name}`] };
        if (r.status === 300) return { journeys: [], refused: [`TfL couldn't pin down ${from.name} or ${to.name}`] };
        if (!r.ok) throw httpError(r.status, "TfL's journey planner");
        return core.tflRailJourneys(await r.json(), from, to, idx, endMatchM);
      },
    };
  }

  /** National Rail live boards for any pair of stations, through the page's existing board fetcher. */
  function darwinLive({ fetchBoard, fetchService }) {
    return { board: (from, to) => fetchBoard(from, to), service: id => fetchService(id) };
  }

  /** Fixed answers for tests and the simulator: the same port, no network. */
  function fixturePlaces(places, attribution = ATTRIBUTION) {
    return {
      attribution, newSession: newId,
      async suggest(text) { const q = text.toLowerCase(); return places.filter(p => (p.name + " " + p.address).toLowerCase().includes(q)).slice(0, 5).map(p => ({ id: p.id, primary: p.name, secondary: p.address })); },
      async resolve(id) { const p = places.find(x => x.id === id); if (!p) throw err("Unknown place.", { network: true }); return { ...p }; },
    };
  }
  /** Straight line × a factor at a typical speed: a stand-in for tests and the simulator only (never real users:
   *  Sam's decision 31 Oct is no estimated fallback). */
  function fixtureAccess(core, speeds = { walk: 1.4, cycle: 4.5, drive: 9 }) {
    return { async matrix(place, stations, mode) { return stations.map(g => { const m = Math.round(core.km(place, g) * 1300); return { metres: m, secs: Math.round(m / speeds[mode]) }; }); } };
  }
  return { googleMapsJs, googleProxy, tflPlanner, darwinLive, fixturePlaces, fixtureAccess, googleError, ATTRIBUTION };
})();
if (typeof module !== "undefined") module.exports = tripAdapters;
