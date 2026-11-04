// The Cloudflare Worker proxy: only your page's origin, only the fixed boards, key never returned.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../proxy/worker.js";

const ENV = { ALLOW_ORIGIN: "https://srapley-spec.github.io, https://example.test", RDM_BASE: "https://up.test/LDBWS/api/20220120/", RDM_KEY: "secret-key" };
const req = (path, { origin = "https://srapley-spec.github.io", method = "GET" } = {}) =>
  new Request(`https://proxy.test${path}`, { method, headers: origin ? { Origin: origin } : {} });
async function withUpstream(fn, respond) {
  const real = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, opts) => { seen.push({ url, opts }); return respond(url, opts); };
  try { return await fn(seen); } finally { globalThis.fetch = real; }
}

test("Proxy: refuses to run without ALLOW_ORIGIN, and refuses other origins", async () => {
  assert.equal((await worker.fetch(req("/board/KGX/LET"), { ...ENV, ALLOW_ORIGIN: "" })).status, 500);
  assert.equal((await worker.fetch(req("/board/KGX/LET", { origin: "https://evil.test" }), ENV)).status, 403);
  assert.equal((await worker.fetch(req("/board/KGX/LET", { origin: "" }), ENV)).status, 403, "no Origin header");
});

test("Proxy: CORS preflight, GET only, and only the four stations", async () => {
  const pre = await worker.fetch(req("/board/KGX/LET", { method: "OPTIONS", origin: "https://example.test" }), ENV);
  assert.equal(pre.status, 200);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://example.test");
  assert.equal((await worker.fetch(req("/board/KGX/LET", { method: "POST" }), ENV)).status, 405);
  assert.equal((await worker.fetch(req("/board/KGX/CBG"), ENV)).status, 404);
  assert.equal((await worker.fetch(req("/board/kgx/LET"), ENV)).status, 404);
  assert.equal((await worker.fetch(req("/other"), ENV)).status, 404);
  assert.equal((await worker.fetch(req("/board/KGX/LET"), { ALLOW_ORIGIN: ENV.ALLOW_ORIGIN })).status, 500, "no key or base");
});

test("Proxy: asks for the board with the key in a header and passes the answer back without the key", async () => {
  await withUpstream(async (seen) => {
    const r = await worker.fetch(req("/board/ZFD/LET"), ENV);
    assert.equal(r.status, 200);
    assert.equal(seen[0].url, "https://up.test/LDBWS/api/20220120/GetDepBoardWithDetails/ZFD?numRows=10&filterCrs=LET&filterType=to&timeWindow=120");
    assert.equal(seen[0].opts.headers["x-apikey"], "secret-key");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://srapley-spec.github.io");
    const body = await r.text();
    assert.equal(body, '{"trainServices":[]}');
    assert.ok(![...r.headers.values()].some((v) => v.includes("secret-key")));
    assert.equal(r.headers.get("Cache-Control"), "no-store");
  }, () => new Response('{"trainServices":[]}', { status: 200 }));
  await withUpstream(async () => {
    assert.equal((await worker.fetch(req("/board/KGX/LET"), ENV)).status, 401, "upstream status passed through");
  }, () => new Response("no", { status: 401 }));
  await withUpstream(async () => {
    assert.equal((await worker.fetch(req("/board/KGX/LET"), ENV)).status, 504);
  }, () => { throw new Error("timeout"); });
});

test("Proxy (Trip): any station's board only with ALLOW_ANY_STATION=yes; still only well-formed codes", async () => {
  await withUpstream(async (seen) => {
    assert.equal((await worker.fetch(req("/board/BTN/LWS"), ENV)).status, 404, "default: the four stations only");
    const any = { ...ENV, ALLOW_ANY_STATION: "yes" };
    assert.equal((await worker.fetch(req("/board/BTN/LWS"), any)).status, 200);
    assert.match(seen[0].url, /GetDepBoardWithDetails\/BTN\?numRows=10&filterCrs=LWS/);
    assert.equal((await worker.fetch(req("/board/BT1/LWS"), any)).status, 404);
  }, () => new Response('{"trainServices":[]}', { status: 200 }));
});

test("Proxy (Trip): Google only when GOOGLE_KEY is set, fixed hosts and field masks, the key sent upstream only", async () => {
  const G = { ...ENV, GOOGLE_KEY: "g-secret" };
  const post = (path, body) => new Request(`https://proxy.test${path}`, { method: "POST", headers: { Origin: "https://srapley-spec.github.io", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "x" }), ENV)).status, 500, "no key: not configured");
  await withUpstream(async (seen) => {
    const r = await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "canterbury" }), G);
    assert.equal(r.status, 200); assert.equal(await r.text(), '{"ok":true}');
    assert.equal(seen[0].url, "https://places.googleapis.com/v1/places:autocomplete");
    assert.equal(seen[0].opts.headers["X-Goog-Api-Key"], "g-secret");
    assert.match(seen[0].opts.headers["X-Goog-FieldMask"], /placePrediction\.placeId/);
    const d = await worker.fetch(req("/google/places/v1/places/ChIJabc-123?sessionToken=tok"), G);
    assert.equal(d.status, 200); assert.equal(seen[1].url, "https://places.googleapis.com/v1/places/ChIJabc-123?sessionToken=tok");
    assert.equal(seen[1].opts.headers["X-Goog-FieldMask"], "id,displayName,formattedAddress,location");
    const m = await worker.fetch(post("/google/routes/distanceMatrix/v2:computeRouteMatrix", { origins: [] }), G);
    assert.equal(m.status, 200); assert.equal(seen[2].url, "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
    assert.equal(seen[2].opts.headers["X-Goog-FieldMask"], "originIndex,destinationIndex,status,condition,distanceMeters,duration");
    assert.equal(seen[0].opts.headers["X-Goog-FieldMask"], "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat");
    // Trip's one transit route per plan (what Google Maps also finds): fixed host, the steps' field mask, nothing else under routes/directions
    const t = await worker.fetch(post("/google/routes/directions/v2:computeRoutes", { travelMode: "TRANSIT" }), G);
    assert.equal(t.status, 200); assert.equal(seen[3].url, "https://routes.googleapis.com/directions/v2:computeRoutes");
    assert.equal(seen[3].opts.headers["X-Goog-FieldMask"], "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails");
    assert.equal((await worker.fetch(post("/google/routes/directions/v2:computeRoutes/other", {}), G)).status, 404);
    assert.equal(seen.length, 4);
  }, () => new Response('{"ok":true}', { status: 200 }));
  assert.equal((await worker.fetch(req("/google/places/v1/places:autocomplete"), G)).status, 405, "autocomplete is POST only");
  assert.equal((await worker.fetch(req("/google/other/thing"), G)).status, 404);
  for (const bad of ["/google/places/v1/places/a.b", "/google/places/v1/places/a%2Fb", "/google/places/v1/places/" + "x".repeat(301)])
    assert.equal((await worker.fetch(req(bad), G)).status, 404, bad);
  assert.equal((await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "x".repeat(9000) }), G)).status, 413);
  assert.equal((await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "x" }), { ...G, ALLOW_ORIGIN: "https://other.test" })).status, 403);
});

test("Proxy: the board's start offset is passed on only as a whole number the feed allows (-120 to 119)", async () => {
  await withUpstream(async (seen) => {
    assert.equal((await worker.fetch(req("/board/KGX/LET?offset=-40"), ENV)).status, 200);
    assert.equal(seen[0].url, "https://up.test/LDBWS/api/20220120/GetDepBoardWithDetails/KGX?numRows=10&filterCrs=LET&filterType=to&timeWindow=120&timeOffset=-40");
    assert.equal(seen[0].opts.cf.cacheTtl, 20, "Cloudflare caches each board and offset 20 s");
    assert.equal((await worker.fetch(req("/board/LET/KGX?offset=119"), ENV)).status, 200);
    assert.match(seen[1].url, /&timeOffset=119$/);
    assert.equal((await worker.fetch(req("/board/LET/KGX?offset=-120"), ENV)).status, 200);
    assert.match(seen[2].url, /&timeOffset=-120$/);
    assert.equal((await worker.fetch(req("/board/LET/KGX?offset=0"), ENV)).status, 200);
    assert.doesNotMatch(seen[3].url, /timeOffset/, "zero: no offset");
    for (const bad of ["120", "-121", "4.5", "abc", "", "1e2", "0x10"]) {
      assert.equal((await worker.fetch(req(`/board/LET/KGX?offset=${bad}`), ENV)).status, 400, bad);
    }
    assert.equal(seen.length, 4, "a refused offset never reaches the feed");
  }, () => new Response('{"trainServices":[]}', { status: 200 }));
});

test("Proxy: Service Details by ID with its own key (else the board key), at its own base; the key never returned", async () => {
  await withUpstream(async (seen) => {
    const r = await worker.fetch(req("/service/ab%2Fc%2B1%3D"), { ...ENV, RDM_SD_KEY: "sd-key", RDM_SD_BASE: "https://sd.test/LDBWS/api/20220120/" });
    assert.equal(r.status, 200);
    assert.equal(seen[0].url, "https://sd.test/LDBWS/api/20220120/GetServiceDetails/ab%2Fc%2B1%3D");
    assert.equal(seen[0].opts.headers["x-apikey"], "sd-key");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://srapley-spec.github.io");
    assert.ok(![...r.headers.values()].some((v) => v.includes("sd-key")));
    assert.equal(await r.text(), '{"locationName":"x"}');
    assert.equal(seen[0].opts.cf.cacheTtl, 20); assert.equal(r.headers.get("Cache-Control"), "no-store", "the phone doesn't keep an old position");
    // Without its own key or base: the board key and Rail Data Marketplace's Service Details product.
    await worker.fetch(req("/service/1234567KNGX____"), ENV);
    assert.equal(seen[1].url, "https://api1.raildata.org.uk/1010-service-details1_2/LDBWS/api/20220120/GetServiceDetails/1234567KNGX____");
    assert.equal(seen[1].opts.headers["x-apikey"], "secret-key");
    // Only well-formed IDs; nothing else under /service/.
    for (const bad of ["/service/", "/service/a%20b", "/service/a/b", "/service/%E0%A4%A", `/service/${"x".repeat(65)}`, "/service/..%2F..%2Fx"]) {
      assert.equal((await worker.fetch(req(bad), ENV)).status, 404, bad);
    }
    assert.equal(seen.length, 2);
    assert.equal((await worker.fetch(req("/service/X1", { method: "POST" }), ENV)).status, 405);
  }, () => new Response('{"locationName":"x"}', { status: 200 }));
  await withUpstream(async (seen) => {
    assert.equal((await worker.fetch(req("/service/X1"), { ALLOW_ORIGIN: ENV.ALLOW_ORIGIN })).status, 500, "no key");
    assert.equal(seen.length, 0, "nothing asked upstream");
  }, () => new Response("{}", { status: 200 }));
  assert.equal((await worker.fetch(req("/service/X1", { origin: "https://evil.test" }), ENV)).status, 403);
});

test("Proxy: its own refusals are labelled X-Proxy-Refusal (readable by the page); National Rail's answers are not", async () => {
  const any = { ...ENV };
  const label = async (path, env = any) => { const r = await worker.fetch(req(path), env); return [r.status, r.headers.get("X-Proxy-Refusal")]; };
  assert.deepEqual(await label("/board/KGX/CBG"), [404, "route"]);
  assert.deepEqual(await label("/board/KGX/LET?offset=999"), [400, "route"]);
  assert.deepEqual(await label("/service/a%20b"), [404, "route"]);
  assert.deepEqual(await label("/board/KGX/LET", { ALLOW_ORIGIN: ENV.ALLOW_ORIGIN }), [500, "config"]);
  assert.deepEqual(await withUpstream(async () => label("/service/X1", { ALLOW_ORIGIN: ENV.ALLOW_ORIGIN }), () => new Response("{}")), [500, "config"]);
  await withUpstream(async () => {
    assert.deepEqual(await label("/board/KGX/LET"), [403, null], "National Rail's 403 passed through, unlabelled");
  }, () => new Response("no", { status: 403 }));
  const pre = await worker.fetch(req("/board/KGX/LET", { method: "OPTIONS" }), ENV);
  assert.equal(pre.headers.get("Access-Control-Expose-Headers"), "X-Proxy-Refusal");
});

test("Proxy (TfL): only the app's TfL paths; the key is added here, never taken from the phone, and scrubbed from replies", async () => {
  const T = { ...ENV, TFL_KEY: "tfl-secret+/" };
  await withUpstream(async (seen) => {
    let r = await worker.fetch(req("/tfl/Journey/JourneyResults/51.97,-0.23/to/1000122?mode=national-rail&timeIs=Departing&app_key=phone-key"), T);
    assert.equal(r.status, 200);
    assert.equal(seen[0].url, "https://api.tfl.gov.uk/Journey/JourneyResults/51.97,-0.23/to/1000122?mode=national-rail&timeIs=Departing&app_key=tfl-secret%2B%2F");
    assert.equal(seen[0].opts.cf.cacheTtl, 60);
    const body = await r.text();
    assert.ok(!body.includes("tfl-secret") && !body.includes("tfl-secret%2B%2F"), body);
    assert.match(body, /\*\*\*/);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://srapley-spec.github.io");
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    for (const [path, ttl] of [["/tfl/StopPoint/940GZZLUALD/Arrivals", 15], ["/tfl/Line/circle,metropolitan,hammersmith-city/Status", 60], ["/tfl/Line/Mode/national-rail/Status", 60], ["/tfl/trackernet/PredictionDetailed/M/ALD", 15]]) {
      r = await worker.fetch(req(path), T);
      assert.equal(r.status, 200, path); assert.equal(seen.at(-1).url, `https://api.tfl.gov.uk${path.slice(4)}?app_key=tfl-secret%2B%2F`); assert.equal(seen.at(-1).opts.cf.cacheTtl, ttl);
    }
    // Without TFL_KEY: forwarded without a key (TfL's lower anonymous limit), and a phone's key is still dropped.
    r = await worker.fetch(req("/tfl/StopPoint/940GZZLUALD/Arrivals?app_key=phone-key&app_id=x"), ENV);
    assert.equal(seen.at(-1).url, "https://api.tfl.gov.uk/StopPoint/940GZZLUALD/Arrivals");
    const n = seen.length;
    for (const bad of ["/tfl/AccidentStats/2019", "/tfl/StopPoint/940GZZLUALD", "/tfl/Line/circle/Status/extra", "/tfl/Journey/JourneyResults/a/to/b/c", "/tfl/../BikePoint", `/tfl/StopPoint/940GZZLUALD/Arrivals?x=${"y".repeat(1001)}`]) {
      const x = await worker.fetch(req(bad), T);
      assert.equal(x.status, 404, bad); assert.equal(x.headers.get("X-Proxy-Refusal"), "route");
    }
    assert.equal(seen.length, n, "refused paths never reach TfL");
    assert.equal((await worker.fetch(req("/tfl/StopPoint/940GZZLUALD/Arrivals", { origin: "https://evil.test" }), T)).status, 403);
  }, (url) => new Response(JSON.stringify({ relativeUri: String(url).replace("https://api.tfl.gov.uk", ""), note: "tfl-secret+/" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  // TfL's own statuses pass through (300 "which place?", 429 rate limit), unlabelled.
  await withUpstream(async () => {
    const r = await worker.fetch(req("/tfl/Journey/JourneyResults/a/to/b"), T);
    assert.equal(r.status, 429); assert.equal(r.headers.get("X-Proxy-Refusal"), null);
  }, () => new Response("{}", { status: 429 }));
});

test("Proxy: /status says what it's set up for, true or false only, never a key", async () => {
  const full = { ...ENV, RDM_SD_KEY: "sd-key-1", TFL_KEY: "tfl-key-2", GOOGLE_KEY: "g-key-3", ALLOW_ANY_STATION: "yes", PUSH: {}, VAPID_PUBLIC_KEY: "pub-4", VAPID_PRIVATE_KEY: "priv-5", VAPID_SUBJECT: "mailto:x" };
  let r = await worker.fetch(req("/status"), full);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), { v: 1, rail: true, serviceDetails: true, tflKey: true, google: true, anyStation: true, alerts: true });
  for (const secret of ["secret-key", "sd-key-1", "tfl-key-2", "g-key-3", "pub-4", "priv-5"]) assert.ok(!text.includes(secret), secret);
  r = await worker.fetch(req("/status"), { ALLOW_ORIGIN: ENV.ALLOW_ORIGIN });
  assert.deepEqual(await r.json(), { v: 1, rail: false, serviceDetails: false, tflKey: false, google: false, anyStation: false, alerts: false });
  assert.equal((await worker.fetch(req("/status", { origin: "https://evil.test" }), full)).status, 403);
});
