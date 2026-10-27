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

const ALLOWED_CRS = new Set(["LET", "KGX", "ZFD", "STP"]);

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOW_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";

    if (!allowed.length) return new Response("Proxy not configured: set ALLOW_ORIGIN.", { status: 500 });
    if (!allowed.includes(origin)) return new Response("Forbidden", { status: 403 });

    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const m = new URL(request.url).pathname.match(/^\/board\/([A-Z]{3})\/([A-Z]{3})$/);
    if (!m || !ALLOWED_CRS.has(m[1]) || !ALLOWED_CRS.has(m[2])) {
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
