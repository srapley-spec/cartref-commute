// Cloudflare Worker: a tiny proxy so the Cartref Commute page can read
// National Rail (Darwin) departure boards from a browser, without the key ever reaching the phone.
// Only needed if Rail Data Marketplace refuses direct browser calls (CORS), or to keep the key server-side.
//
// Setup (Cloudflare dashboard → Workers & Pages → Create → Worker → paste this):
//   Settings → Variables and Secrets:
//     RDM_KEY      (Secret)  your Rail Data Marketplace consumer key
//     RDM_BASE     (Text)    endpoint base from the product page, e.g.
//                            https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120
//     ALLOW_ORIGIN (Text)    required: your page's origin, e.g. https://srapley-spec.github.io
//                            (comma-separate several). Requests from any other origin are refused.
//   Optional: add a Cloudflare rate-limiting rule on the worker route as a second line of defence.
// Then put the worker URL into the page: Settings → Source → My proxy.
//
// Security notes:
// - The Origin check stops other websites using your proxy from a browser. A non-browser client can fake
//   the Origin header, so it limits casual misuse rather than guaranteeing it. Only the three fixed
//   station boards can be requested, and responses are cached for 20 seconds, which caps upstream use.
// - The key is only ever sent upstream; it never appears in responses or logs.
//
// Trip mode (optional, docs/leisure-architecture.md §5 and §9). Off unless configured, so an existing Worker is unchanged:
//   ALLOW_ANY_STATION (Text)  "yes": boards for any well-formed station code (Trip's rides), not just the four.
//   GOOGLE_KEY        (Secret) your Google Maps key: enables /google/places/... and /google/routes/... with fixed upstream
//                              hosts and fixed field masks (which also fix what Google bills for).

const ALLOWED_CRS = new Set(["LET", "KGX", "ZFD", "STP"]);
const CRS = /^[A-Z]{3}$/;
// Google: the only paths and field masks the Worker will forward.
const GOOGLE = [
  { re: /^\/google\/places\/v1\/places:autocomplete$/, method: "POST", url: () => "https://places.googleapis.com/v1/places:autocomplete",
    mask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
  { re: /^\/google\/places\/v1\/places\/([A-Za-z0-9_-]{1,300})$/, method: "GET", url: (m, q) => `https://places.googleapis.com/v1/places/${m[1]}${q.get("sessionToken") ? `?sessionToken=${encodeURIComponent(q.get("sessionToken"))}` : ""}`,
    mask: "id,displayName,formattedAddress,location" },
  { re: /^\/google\/routes\/distanceMatrix\/v2:computeRouteMatrix$/, method: "POST", url: () => "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    mask: "originIndex,destinationIndex,status,condition,distanceMeters,duration" },
];
async function google(request, env, cors, url) {
  const route = GOOGLE.map(g => ({ g, m: url.pathname.match(g.re) })).find(x => x.m);
  if (!route) return new Response("Not found", { status: 404, headers: cors });
  if (request.method !== route.g.method) return new Response("Method not allowed", { status: 405, headers: cors });
  if (!env.GOOGLE_KEY) return new Response("Proxy not configured: set GOOGLE_KEY.", { status: 500, headers: cors });
  let body;
  if (route.g.method === "POST") { body = await request.text(); if (body.length > 8192) return new Response("Too large", { status: 413, headers: cors }); }
  let upstream;
  try {
    upstream = await fetch(route.g.url(route.m, url.searchParams), { method: route.g.method, body,
      headers: { "X-Goog-Api-Key": env.GOOGLE_KEY, "X-Goog-FieldMask": route.g.mask, ...(body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(10000) });
  } catch (e) { return new Response("Upstream timeout", { status: 504, headers: cors }); }
  return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOW_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";

    if (!allowed.length) return new Response("Proxy not configured: set ALLOW_ORIGIN.", { status: 500 });
    if (!allowed.includes(origin)) return new Response("Forbidden", { status: 403 });

    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.startsWith("/google/")) return google(request, env, cors, reqUrl);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const m = reqUrl.pathname.match(/^\/board\/([A-Z]{3})\/([A-Z]{3})$/);
    const ok = crs => (env.ALLOW_ANY_STATION === "yes" ? CRS.test(crs) : ALLOWED_CRS.has(crs));
    if (!m || !ok(m[1]) || !ok(m[2])) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const [, from, to] = m;
    const base = String(env.RDM_BASE || "").replace(/\/+$/, "");
    if (!base || !env.RDM_KEY) return new Response("Proxy not configured: set RDM_BASE and RDM_KEY.", { status: 500, headers: cors });
    const url = `${base}/GetDepBoardWithDetails/${from}?numRows=10&filterCrs=${to}&filterType=to&timeWindow=120`;

    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { "x-apikey": env.RDM_KEY },
        cf: { cacheTtl: 20, cacheEverything: true },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      return new Response("Upstream timeout", { status: 504, headers: cors });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  },
};
