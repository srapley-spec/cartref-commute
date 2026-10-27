// Cloudflare Worker: a tiny proxy so the Cartref Commute page can read
// National Rail (Darwin) departure boards from a browser.
// Only needed if Rail Data Marketplace refuses direct browser calls (CORS).
//
// Setup (Cloudflare dashboard → Workers & Pages → Create → Worker → paste this):
//   Settings → Variables and Secrets:
//     RDM_KEY    (Secret)   your Rail Data Marketplace consumer key
//     RDM_BASE   (Text)     endpoint base from the product page, e.g.
//                            https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120
//     ALLOW_ORIGIN (Text)   your page's origin, e.g. https://yourname.github.io
// Then put the worker URL into the page: Settings → Source → My proxy.

const ALLOWED = new Set(["LET", "KGX", "ZFD", "STP"]);

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const m = new URL(request.url).pathname.match(/^\/board\/([A-Z]{3})\/([A-Z]{3})$/);
    if (!m || !ALLOWED.has(m[1]) || !ALLOWED.has(m[2])) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const [, from, to] = m;
    const base = String(env.RDM_BASE || "").replace(/\/+$/, "");
    const url = `${base}/GetDepBoardWithDetails/${from}?numRows=10&filterCrs=${to}&filterType=to&timeWindow=120`;

    const upstream = await fetch(url, { headers: { "x-apikey": env.RDM_KEY } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  },
};
