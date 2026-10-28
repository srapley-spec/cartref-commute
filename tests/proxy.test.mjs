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
