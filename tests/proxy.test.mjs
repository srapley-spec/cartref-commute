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
  }, () => new Response('{"ok":true}', { status: 200 }));
  assert.equal((await worker.fetch(req("/google/places/v1/places:autocomplete"), G)).status, 405, "autocomplete is POST only");
  assert.equal((await worker.fetch(req("/google/other/thing"), G)).status, 404);
  assert.equal((await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "x".repeat(9000) }), G)).status, 413);
  assert.equal((await worker.fetch(post("/google/places/v1/places:autocomplete", { input: "x" }), { ...G, ALLOW_ORIGIN: "https://other.test" })).status, 403);
});
