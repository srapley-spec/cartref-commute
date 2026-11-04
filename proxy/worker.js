// Cloudflare Worker: a tiny proxy so the Cartref Commute page can read
// National Rail (Darwin) departure boards from a browser, without the key ever reaching the phone.
// It keeps the keys server-side, and works whether or not Rail Data Marketplace allows direct browser calls (CORS).
//
// Deploy with Wrangler from the repo (it bundles this file with proxy/push.js and the engine):
//   npm ci && npm run build && npx wrangler deploy --config proxy/wrangler.toml
// (docs/proxy-setup.md has every step). Pasting this file alone into the dashboard no longer works: it imports.
//
// Settings (Cloudflare dashboard → Workers & Pages → the worker):
//   Settings → Variables and Secrets:
//     RDM_KEY      (Secret)  your Rail Data Marketplace consumer key
//     RDM_BASE     (Text)    endpoint base from the product page, e.g.
//                            https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120
//     ALLOW_ORIGIN (Text)    required: your page's origin, e.g. https://srapley-spec.github.io
//                            (comma-separate several). Requests from any other origin are refused.
//     RDM_SD_KEY   (Secret)  optional: the Service Details product's own key, if different from RDM_KEY
//     RDM_SD_BASE  (Text)    optional: Service Details endpoint base (default below)
//   Optional: add a Cloudflare rate-limiting rule on the worker route as a second line of defence.
// Then put the worker URL into the page: Settings → Source → My proxy.
//
// Routes (docs/stories/live-and-timetable.md, issue #17):
//   GET /board/FROM/TO[?offset=N]  departures FROM → TO, 120 min window, starting N min from now (-120..119;
//                                  -40 when you're on the train, ahead for Leave around / Arrive by)
//   GET /service/ID                Service Details for the train you're on (where it was last reported)
//   /push/...                      time-to-leave and wake-up alerts (proxy/push.js), off unless configured:
//     KV namespace binding PUSH, VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (Secrets, from `node tools/vapid-keys.mjs`),
//     VAPID_SUBJECT (Text, e.g. mailto:you@example.com), and the Cron Trigger "* * * * *" (proxy/wrangler.toml).
//
// Security notes:
// - The Origin check stops other websites using your proxy from a browser. A non-browser client can fake
//   the Origin header, so it limits casual misuse rather than guaranteeing it. Only the four fixed
//   stations' boards can be requested (unless ALLOW_ANY_STATION), and upstream answers are cached at
//   Cloudflare for 20 seconds per board/offset and service (not verified on a *.workers.dev address).
// - The key is only ever sent upstream; it never appears in responses or logs.
//
// Trip mode (optional, docs/leisure-architecture.md §5 and §9). Off unless configured, so an existing Worker is unchanged:
//   ALLOW_ANY_STATION (Text)  "yes": boards for any well-formed station code (Trip's rides), not just the four.
//   GOOGLE_KEY        (Secret) your Google Maps key: enables /google/places/... and /google/routes/... with fixed upstream
//                              hosts and fixed field masks (which also fix what Google bills for).

import { pushRoute, runAlerts } from "./push.js";

const ALLOWED_CRS = new Set(["LET", "KGX", "ZFD", "STP"]);
const CRS = /^[A-Z]{3}$/;
// Darwin service IDs: letters, digits and the base64 / underscore characters seen in LDBWS IDs.
const SERVICE_ID = /^[A-Za-z0-9+/=_-]{1,64}$/;
const SD_BASE = "https://api1.raildata.org.uk/1010-service-details1_2/LDBWS/api/20220120";
const trimBase = u => String(u || "").trim().replace(/\/+$/, "");
// Ask Rail Data Marketplace with the key in a header; the key is never in the answer.
async function rdm(url, key, cors) {
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { "x-apikey": key },
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
}
// Google: the only paths and field masks the Worker will forward.
const GOOGLE = [
  { re: /^\/google\/places\/v1\/places:autocomplete$/, method: "POST", url: () => "https://places.googleapis.com/v1/places:autocomplete",
    mask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
  { re: /^\/google\/places\/v1\/places\/([A-Za-z0-9_-]{1,300})$/, method: "GET", url: (m, q) => `https://places.googleapis.com/v1/places/${m[1]}${q.get("sessionToken") ? `?sessionToken=${encodeURIComponent(q.get("sessionToken"))}` : ""}`,
    mask: "id,displayName,formattedAddress,location" },
  { re: /^\/google\/routes\/distanceMatrix\/v2:computeRouteMatrix$/, method: "POST", url: () => "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    mask: "originIndex,destinationIndex,status,condition,distanceMeters,duration" },
  // Trip: one transit route per plan, to show what TfL's planner misses (docs/stories/trip-taxi-and-google-gaps.md).
  { re: /^\/google\/routes\/directions\/v2:computeRoutes$/, method: "POST", url: () => "https://routes.googleapis.com/directions/v2:computeRoutes",
    mask: "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails" },
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
      // The page tells the proxy's own refusals from National Rail's (whose statuses are passed through).
      "Access-Control-Expose-Headers": "X-Proxy-Refusal",
    };
    // A refusal by this Worker itself, labelled so the page can say what to fix here rather than at the feed.
    const refuse = (kind, status, text) => new Response(text, { status, headers: { ...cors, "X-Proxy-Refusal": kind } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.startsWith("/google/")) return google(request, env, cors, reqUrl);
    if (reqUrl.pathname.startsWith("/push/")) return pushRoute(request, env, cors, reqUrl, ALLOWED_CRS);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const svc = reqUrl.pathname.match(/^\/service\/([^/]+)$/);
    if (svc) {
      let id; try { id = decodeURIComponent(svc[1]); } catch (e) { id = ""; }
      if (!SERVICE_ID.test(id)) return refuse("route", 404, "Not found");
      const key = env.RDM_SD_KEY || env.RDM_KEY;
      if (!key) return refuse("config", 500, "Proxy not configured: set RDM_KEY (or RDM_SD_KEY).");
      return rdm(`${trimBase(env.RDM_SD_BASE) || SD_BASE}/GetServiceDetails/${encodeURIComponent(id)}`, key, cors);
    }

    const m = reqUrl.pathname.match(/^\/board\/([A-Z]{3})\/([A-Z]{3})$/);
    const ok = crs => (env.ALLOW_ANY_STATION === "yes" ? CRS.test(crs) : ALLOWED_CRS.has(crs));
    if (!m || !ok(m[1]) || !ok(m[2])) return refuse("route", 404, "Not found");
    const [, from, to] = m;
    // Start offset in minutes, as Rail Data Marketplace allows: a whole number from -120 to 119.
    const offRaw = reqUrl.searchParams.get("offset");
    let off = 0;
    if (offRaw !== null) {
      if (!/^-?\d{1,3}$/.test(offRaw) || +offRaw < -120 || +offRaw > 119) return refuse("route", 400, "Bad offset");
      off = +offRaw;
    }
    const base = trimBase(env.RDM_BASE);
    if (!base || !env.RDM_KEY) return refuse("config", 500, "Proxy not configured: set RDM_BASE and RDM_KEY.");
    return rdm(`${base}/GetDepBoardWithDetails/${from}?numRows=10&filterCrs=${to}&filterType=to&timeWindow=120${off ? `&timeOffset=${off}` : ""}`, env.RDM_KEY, cors);
  },
  // Time-to-leave and wake-up alerts (proxy/push.js): a Cron Trigger every minute.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlerts(env, Date.now()));
  },
};
