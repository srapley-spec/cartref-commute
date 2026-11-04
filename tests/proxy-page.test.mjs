// The page with Settings → National Rail → "My proxy": boards, start offsets and Service Details all go through the
// proxy's address, with no key on the phone (issue #17; docs/stories/live-and-timetable.md).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, json, hm, closeAll, parseJourneyUrl } from "./harness.mjs";
import { services, tflResponder, darwinResponder, serviceDetailsResponder } from "./golden/feeds.mjs";
after(closeAll);

const AT_OFFICE = { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } };
const PROXY = "https://cartref-rail.example.workers.dev";

test("Proxy source: boards and Leave around's start offset go through the proxy, with no key sent", async () => {
  const now = Date.now(), m = 60e3, seen = [];
  const board = () => ({ locationName: "x", trainServices: [{ std: hm(now + 70 * m), etd: "On time", operator: "Great Northern", platform: "9",
    subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: hm(now + 105 * m), et: "On time" }] }] }], nrccMessages: [] });
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY + "/" },
    route: (u, opts) => { if (!u.startsWith(PROXY + "/board/")) return undefined; seen.push({ u, opts }); return json(board()); } });
  assert.equal(app.c.state.railSource, "darwin", "the proxy counts as a live source");
  const boards = seen.map(x => x.u);
  assert.ok(boards.length >= 3, boards.join("\n"));
  assert.ok(boards.every(u => /^https:\/\/cartref-rail\.example\.workers\.dev\/board\/(KGX|STP|ZFD)\/LET$/.test(u)), "home boards, no offset now:\n" + boards.join("\n"));
  assert.ok(seen.every(x => !Object.keys(x.opts?.headers || {}).some(h => /apikey/i.test(h))), "no key header from the phone");
  // Leave around within the live reach: the proxy is asked from that time (the offset the feed allows).
  const t = new Date(now + 60 * m), p = (n) => String(n).padStart(2, "0");
  app.d.querySelector('[data-view="at"]').click();
  await sleep(300);
  const before = seen.length;
  app.d.querySelector("#byDate").value = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  app.d.querySelector("#byTime").value = `${p(t.getHours())}:${p(t.getMinutes())}`;
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
  await sleep(300);
  const later = seen.slice(before).map(x => x.u);
  assert.ok(later.some(u => /\/board\/(KGX|STP|ZFD)\/LET\?offset=4[45]$/.test(u)), later.join("\n"));
  assert.match(app.text("#hero"), /Leaving around \d\d:\d\d \S+ · live/);
  app.close();
});

test("Proxy source: Service Details for the train you're on go to the proxy's /service/ID, the ID encoded", async () => {
  const seen = [];
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY },
    route: (u, opts) => {
      if (!u.startsWith(PROXY)) return undefined;
      seen.push({ u, opts });
      if (/\/service\//.test(u)) return json({ locationName: "x", subsequentCallingPoints: [], previousCallingPoints: [] });
      if (/\/service\//.test(u) === false && /\/board\//.test(u)) return json({ trainServices: [], nrccMessages: [] });
      return undefined;
    } });
  seen.length = 0;
  await app.c.fetchServiceDetails("ab/c+1=");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].u, `${PROXY}/service/ab%2Fc%2B1%3D`);
  assert.ok(!Object.keys(seen[0].opts?.headers || {}).some(h => /apikey/i.test(h)), "no key header from the phone");
  // A refusal from the proxy says where the key lives.
  const refusing = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY },
    route: (u) => (u.startsWith(PROXY) ? json({}, /\/service\//.test(u) ? 401 : 200) : undefined) });
  await assert.rejects(refusing.c.fetchServiceDetails("X1"), /set RDM_SD_KEY in your proxy/);
  refusing.close();
  app.close();
});

test("Rail Data Marketplace source is unchanged: Service Details direct, with the key, at the product's base", async () => {
  const seen = [];
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "rdm", rdmKey: "k1", rdmBase: "https://darwin.test/LDBWS/api/20220120", rdmSdKey: "k2", rdmSdBase: "https://sd.test/LDBWS/api/20220120/" },
    route: (u, opts) => { if (/sd\.test/.test(u)) { seen.push({ u, opts }); return json({ subsequentCallingPoints: [] }); } return /darwin\.test/.test(u) ? json({ trainServices: [] }) : undefined; } });
  await app.c.fetchServiceDetails("X1");
  assert.equal(seen[0].u, "https://sd.test/LDBWS/api/20220120/GetServiceDetails/X1");
  assert.equal(seen[0].opts.headers["x-apikey"], "k2");
  app.close();
});

test("Proxy source on the train: the board starts 40 min back and the train you're on is followed through /service/ID", async () => {
  // The golden morning (tests/golden/feeds.mjs), passing Knebworth at 07:19, served through a proxy's routes.
  const DAY = "2026-11-03", now = new Date(`${DAY}T07:19:00`).getTime() + 5e3, P = "https://p.test";
  const svcs = services(DAY, {}), darwin = darwinResponder(svcs, () => now), details = serviceDetailsResponder(svcs, () => now), tfl = tflResponder(svcs), seen = [];
  const route = (u) => {
    if (u.startsWith(P)) {
      seen.push(u);
      let m = /\/board\/([A-Z]{3})\/([A-Z]{3})(?:\?offset=(-?\d+))?$/.exec(u);
      if (m) { const b = darwin(`x/GetDepBoardWithDetails/${m[1]}?filterCrs=${m[2]}${m[3] ? `&timeOffset=${m[3]}` : ""}`); return b ? json(b) : json({}, 404); }
      m = /\/service\/(.+)$/.exec(u);
      if (m) { const d = details(`x/GetServiceDetails/${decodeURIComponent(m[1])}`); return d ? json(d) : json({}, 404); }
      return json({}, 404);
    }
    const q = parseJourneyUrl(u); if (q && q.from && q.to) return json(tfl(q));
    if (/Line\/|national-rail\/Status/.test(u)) return json([]);
    return undefined;
  };
  const knebworth = { coords: { latitude: 51.8667, longitude: -0.1876, accuracy: 30, speed: 30 } };
  const app = await createApp({ now, geo: knebworth, settings: { provider: "proxy", proxyBase: P, tflKey: "k" }, saved: { pace: "avg", dirMode: "office" }, route, settle: 700 });
  assert.ok(app.c.state.onLine, "on the line");
  assert.ok(seen.some(u => /\/board\/LET\/(KGX|STP|ZFD)\?offset=-40$/.test(u)), "board from 40 min back:\n" + seen.join("\n"));
  assert.ok(seen.some(u => /\/service\/[^/]+$/.test(u)), "Service Details through the proxy:\n" + seen.join("\n"));
  app.close();
});

test("Simulated feeds with the proxy source: Service Details stay synthetic, nothing reaches the proxy", async () => {
  const app = await createApp({ settings: { provider: "proxy", proxyBase: PROXY }, settle: 100 });
  app.d.querySelector("#settingsBtn").click(); app.d.querySelector("#s_simulatedFeeds").checked = true;
  app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  const before = app.calls.length;
  const b = await (await app.c.fetchT("https://api1.raildata.org.uk/x/GetDepBoardWithDetails/LET?filterCrs=KGX")).json();
  assert.ok(await app.c.fetchServiceDetails(b.trainServices[0].serviceID), "synthetic details");
  assert.equal(app.calls.length, before, "no live request");
  await sleep(500);
  app.close();
});

test("Rail Data Marketplace Service Details without their own key or base: the board key and the product's default base", async () => {
  const seen = [];
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "rdm", rdmKey: "board-key", rdmBase: "https://darwin.test/LDBWS/api/20220120", rdmSdBase: "" },
    route: (u, opts) => { if (/raildata\.org\.uk/.test(u)) { seen.push({ u, opts }); return json({ subsequentCallingPoints: [] }); } return /darwin\.test/.test(u) ? json({ trainServices: [] }) : undefined; } });
  await app.c.fetchServiceDetails("X1");
  assert.equal(seen[0].u, "https://api1.raildata.org.uk/1010-service-details1_2/LDBWS/api/20220120/GetServiceDetails/X1");
  assert.equal(seen[0].opts.headers["x-apikey"], "board-key");
  app.close();
});

test("Proxy source: a board refused by the proxy says what to fix in the proxy; National Rail's own answers say so", async () => {
  const reply = (status, refusal) => new Response("{}", { status, headers: refusal ? { "X-Proxy-Refusal": refusal } : {} });
  for (const [status, refusal, re] of [[500, "config", /Your proxy isn't set up \(HTTP 500\)\. Set RDM_BASE and RDM_KEY/], [404, "route", /Redeploy proxy\/worker\.js/], [400, "route", /Redeploy/],
    [401, null, /National Rail refused your proxy's key \(HTTP 401\)\. Check RDM_KEY/], [403, null, /National Rail refused your proxy's key \(HTTP 403\)/],
    [404, null, /not found through your proxy \(HTTP 404\)\. Check RDM_BASE/], [500, null, /National Rail feed error through your proxy \(HTTP 500\)/]]) {
    const app = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY }, route: (u) => (u.startsWith(PROXY) ? reply(status, refusal) : undefined) });
    assert.match(app.banners().join(" "), re, `${status} ${refusal}`);
    assert.doesNotMatch(app.banners().join(" "), /product page/, "not Rail Data Marketplace's wording");
    app.close();
  }
  // Unreachable (or a wrong ALLOW_ORIGIN, which the browser hides as a network error).
  const down = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY }, route: (u) => { if (u.startsWith(PROXY)) throw new TypeError("Failed to fetch"); return undefined; } });
  assert.match(down.banners().join(" "), /Couldn't reach your proxy\. Check its URL in Settings, and that its ALLOW_ORIGIN/);
  down.close();
});

