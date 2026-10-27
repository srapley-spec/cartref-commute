// End-to-end behaviour with mocked network and location: direction, failures, timeouts, rate limits, Arrive by.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, hang, json, parseJourneyUrl, tflJourney, tflTimetable, NEAR_LETCHWORTH, IN_LONDON, hm, closeAll } from "./harness.mjs";

after(closeAll);

const pairsFetched = (calls) => [...new Set(calls.map(parseJourneyUrl).filter(Boolean).map((q) => `${q.from}-${q.to}`))].sort();

// ---------- Direction from location ----------
test("Near Letchworth: waits for location, then plans to the office", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH, geoDelay: 150, settle: 50 });
  assert.match(app.text("#hero"), /Finding your location/);
  assert.equal(pairsFetched(app.calls).length, 0, "no trains loaded before the direction is known");
  await sleep(500);
  assert.match(app.text("#dirNote"), /Heading to the office · you're near Letchworth \(±12 m\)/);
  assert.deepEqual(pairsFetched(app.calls), ["LET-KGX", "LET-ZFD"]);
  assert.equal(app.rows().length, 5);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("In London: plans home", async () => {
  const app = await createApp({ geo: IN_LONDON });
  assert.match(app.text("#dirNote"), /Heading home · you're in London/);
  assert.deepEqual(pairsFetched(app.calls), ["KGX-LET", "ZFD-LET"]);
  assert.equal(app.rows().length, 5);
  app.close();
});

test("Location denied: says so and offers manual choice; manual choice works", async () => {
  const app = await createApp({ geo: "denied" });
  assert.match(app.text("#hero"), /Location needed.*Location is off for this app.*choose a direction/i);
  assert.equal(pairsFetched(app.calls).length, 0);
  app.d.querySelector('[data-dir="home"]').click();
  await sleep(400);
  assert.deepEqual(pairsFetched(app.calls), ["KGX-LET", "ZFD-LET"]);
  assert.equal(app.rows().length, 5);
  app.close();
});

test("Moving from Letchworth to London switches direction and reloads trains", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH });
  assert.deepEqual(pairsFetched(app.calls), ["LET-KGX", "LET-ZFD"]);
  app.calls.length = 0;
  // the phone reports a new position
  app.w.navigator.geolocation; // watch callbacks are internal; simulate by re-running locate via visibility
  const watch = app.w.navigator.geolocation.watchPosition;
  app.w.navigator.geolocation.watchPosition = (ok) => { setTimeout(() => ok(IN_LONDON), 10); return 2; };
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(500);
  app.w.navigator.geolocation.watchPosition = watch;
  assert.match(app.text("#dirNote"), /Heading home/);
  assert.ok(pairsFetched(app.calls).includes("KGX-LET"));
  assert.match(app.rows()[0] || "", /Leave/);
  app.close();
});

// ---------- Failures ----------
test("A hung request times out; the app recovers and refreshes again", async () => {
  let hangNow = true;
  const app = await createApp({ timeoutMs: 150, settle: 600,
    route: (u, opts) => (hangNow && parseJourneyUrl(u) ? hang(opts) : undefined) });
  assert.equal(app.c.state.loading, false, "not stuck loading");
  assert.match(app.banners().join(" "), /didn't respond in time/);
  hangNow = false;
  await app.c.refresh({ force: true });
  assert.equal(app.rows().length, 5);
  assert.doesNotMatch(app.banners().join(" "), /didn't respond/);
  app.close();
});

test("TfL rate limiting backs off and keeps the last good times, then flags them as stale", async () => {
  let limited = false;
  const app = await createApp({ route: (u) => (limited && parseJourneyUrl(u) ? json({}, 429) : undefined) });
  assert.equal(app.rows().length, 5);
  limited = true;
  await app.c.refresh({ force: true });
  assert.equal(app.rows().length, 5, "previous trains kept");
  assert.match(app.banners().join(" "), /rate-limiting/);
  const n = app.calls.length;
  await app.c.refresh({ force: true });
  assert.equal(app.calls.filter((u, i) => i >= n && parseJourneyUrl(u)).length, 0, "no TfL journey calls while backing off");
  app.c.state.boardsAt = Date.now() - 4 * 60e3;
  app.c.render();
  assert.match(app.banners().join(" "), /Train times may be out of date/);
  app.close();
});

test("Darwin partial failure keeps the boards that loaded; total failure falls back to the timetable", async () => {
  const now = Date.now();
  const board = (to) => ({ trainServices: [{ std: hm(now + 40 * 60e3), etd: "On time", operator: "Great Northern",
    subsequentCallingPoints: [{ callingPoint: [{ crs: to, st: hm(now + 75 * 60e3), et: "On time" }] }] }], nrccMessages: [] });
  let mode = "partial";
  const app = await createApp({ geo: IN_LONDON,
    settings: { provider: "rdm", rdmKey: "test-key", rdmBase: "https://darwin.test/LDBWS/api/20220120" },
    route: (u) => {
      if (!/darwin\.test/.test(u)) return undefined;
      if (mode === "down") return json({}, 503);
      return /GetDepBoardWithDetails\/KGX\?.*filterCrs=LET/.test(u) ? json(board("LET")) : json({}, 500);
    } });
  assert.equal(app.c.state.railSource, "darwin");
  assert.ok(app.c.state.boards["KGX-LET"].services.length === 1);
  assert.match(app.banners().join(" "), /National Rail feed error \(HTTP 500\)/);
  assert.equal(app.rows().length, 1);
  mode = "down";
  await app.c.refresh({ force: true });
  assert.equal(app.c.state.railSource, "tfl");
  assert.match(app.banners().join(" "), /live National Rail feed failed/);
  assert.equal(app.rows().length, 5);
  app.close();
});

// ---------- Arrive by ----------
test("Arrive by finds the latest train, flags stopping trains and tight arrivals", async () => {
  // Tomorrow's LET→KGX timetable: every 15 min from 06:00, alternating stopping (52 min) and fast (29 min).
  const day = new Date(); day.setDate(day.getDate() + 1); day.setHours(6, 0, 0, 0);
  const trains = Array.from({ length: 16 }, (_, i) => { const dep = day.getTime() + i * 15 * 60e3; return { dep, arr: dep + (i % 2 ? 29 : 52) * 60e3 }; });
  const journeys = (q) => {
    if (q.to !== "KGX") return { journeys: [] };
    const pick = q.timeIs === "Departing" ? trains.filter((x) => x.dep >= q.t).slice(0, 3) : trains.filter((x) => x.arr <= q.t - 25 * 60e3).slice(-3);
    return { journeys: pick.map((x) => tflJourney(q.from, q.to, x.dep, x.arr)) };
  };
  const app = await createApp({ journeys, saved: { mode: "leisure" } });
  app.d.querySelector("#byTime").value = "08:16";
  app.d.querySelector('[data-view="by"]').click();
  await sleep(500);
  assert.match(app.text("#hero"), /^To arrive by 08:16 tomorrow · timetable/);
  const rows = app.rows();
  assert.match(rows[0], /07:45 Great Northern · 29 min train/, "latest train that arrives in time comes first");
  assert.match(rows[0], /Cutting it fine/, "arrives 08:14, two minutes before the target");
  assert.match(rows[1], /07:15 Great Northern · 29 min train/, "then the next latest leave");
  assert.ok(rows.some((r) => /07:00 Great Northern · 52 min train.*Stopping train/.test(r)), "stopping train offered and labelled");
  assert.ok(!rows.some((r) => /07:30 Great Northern/.test(r)), "07:30 stopper arrives 08:22, after the target");
  app.close();
});

test("Settings save closes the sheet and keeps values", async () => {
  const app = await createApp();
  app.d.querySelector("#settingsBtn").click();
  assert.ok(app.d.querySelector("#settings").hasAttribute("open"));
  app.d.querySelector("#s_kxInterchange").value = "7.5";
  app.d.querySelector("#saveBtn").click();
  assert.ok(!app.d.querySelector("#settings").hasAttribute("open"));
  assert.equal(app.c.S().kxInterchange, 450);
  assert.equal(app.c.S().walkHomeStationAvg, 1337, "untouched measured walk preserved");
  await sleep(400); // let the refresh that Save starts finish before closing the page
  app.close();
});

// ---------- Request volume ----------
test("Frequent location updates do not trigger requests; automatic refreshes are throttled", async () => {
  let push;
  const app = await createApp({ geo: null, settle: 50 });
  // take over the location watch so the test can send many position updates
  app.w.navigator.geolocation.watchPosition = (ok) => { push = ok; return 3; };
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(20);
  push(NEAR_LETCHWORTH);
  await sleep(400);
  const afterFirst = app.calls.length;
  assert.ok(afterFirst > 0 && afterFirst <= 10, `first load made ${afterFirst} requests`);
  for (let i = 0; i < 30; i++) { push({ coords: { latitude: 51.975 + i * 1e-5, longitude: -0.23, accuracy: 10 } }); await sleep(5); }
  await sleep(300);
  assert.equal(app.calls.length, afterFirst, "position updates in the same direction made no requests");
  await app.c.refresh();               // automatic refresh inside 30 s: skipped
  assert.equal(app.calls.length, afterFirst);
  await app.c.refresh({ force: true }); // your Refresh tap: runs, but reuses status and the timetable is re-read
  assert.ok(app.calls.length > afterFirst);
  assert.match(app.text("#updated"), /requests in the last minute: TfL \d+/);
  app.close();
});

test("A rate-limited first load does not turn location updates into a request loop", async () => {
  let push;
  const app = await createApp({ geo: null, settle: 50, route: (u) => (parseJourneyUrl(u) ? json({}, 429) : undefined) });
  app.w.navigator.geolocation.watchPosition = (ok) => { push = ok; return 4; };
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(20);
  push(NEAR_LETCHWORTH);
  await sleep(400);
  const n = app.calls.length;
  for (let i = 0; i < 30; i++) { push(NEAR_LETCHWORTH); await sleep(5); }
  await sleep(300);
  assert.equal(app.calls.length, n, "no extra requests while TfL is refusing");
  assert.equal(app.banners().filter((b) => /rate-limiting/.test(b)).length, 1, "one banner, not duplicates");
  app.close();
});
