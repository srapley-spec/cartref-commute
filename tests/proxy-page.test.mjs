// The page with Settings → National Rail → "My proxy": boards, start offsets and Service Details all go through the
// proxy's address, with no key on the phone (issue #17; docs/stories/live-and-timetable.md).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, json, hm, closeAll } from "./harness.mjs";
after(closeAll);

const AT_OFFICE = { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } };
const PROXY = "https://cartref-rail.example.workers.dev";

test("Proxy source: boards and Leave around's start offset go through the proxy, with no key sent", async () => {
  const now = Date.now(), m = 60e3, seen = [];
  const board = () => ({ locationName: "x", trainServices: [{ std: hm(now + 70 * m), etd: "On time", operator: "Great Northern", platform: "9",
    subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: hm(now + 105 * m), et: "On time" }] }] }], nrccMessages: [] });
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "proxy", proxyBase: PROXY + "/" },
    route: (u, opts) => { if (!u.startsWith(PROXY)) return undefined; seen.push({ u, opts }); return json(board()); } });
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
