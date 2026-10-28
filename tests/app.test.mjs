// End-to-end behaviour with mocked network and location: direction, failures, timeouts, rate limits, Arrive by.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, hang, json, parseJourneyUrl, tflJourney, tflTimetable, NEAR_LETCHWORTH, IN_LONDON, hm, closeAll } from "./harness.mjs";

after(closeAll);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };


const pairsFetched = (calls) => [...new Set(calls.map(parseJourneyUrl).filter(Boolean).map((q) => `${q.from}-${q.to}`))].sort();

// ---------- Direction from location ----------
test("Near Letchworth: waits for location, then plans to the office", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH, geoDelay: 150, settle: 50 });
  assert.match(app.text("#hero"), /Finding your location/);
  assert.equal(pairsFetched(app.calls).length, 0, "no trains loaded before the direction is known");
  await sleep(500);
  assert.match(app.text("#dirNote"), /Heading to the office · you're near Letchworth \(±12 m\)/);
  assert.deepEqual(pairsFetched(app.calls), ["LET-KGX", "LET-ZFD"]);
  assert.equal(app.rows().length, 6);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("In London: plans home", async () => {
  const app = await createApp({ geo: IN_LONDON });
  assert.match(app.text("#dirNote"), /Heading home · you're in London/);
  assert.deepEqual(pairsFetched(app.calls), ["KGX-LET", "ZFD-LET"]);
  assert.equal(app.rows().length, 6);
  app.close();
});

test("Location denied: says so and offers manual choice; manual choice works", async () => {
  const app = await createApp({ geo: "denied" });
  assert.match(app.text("#hero"), /Location needed.*Location is off for this app.*choose a direction/i);
  assert.equal(pairsFetched(app.calls).length, 0);
  app.d.querySelector('[data-dir="home"]').click();
  await sleep(400);
  assert.deepEqual(pairsFetched(app.calls), ["KGX-LET", "ZFD-LET"]);
  assert.equal(app.rows().length, 6);
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
  assert.equal(app.rows().length, 6);
  assert.doesNotMatch(app.banners().join(" "), /didn't respond/);
  app.close();
});

test("TfL rate limiting backs off and keeps the last good times, then flags them as stale", async () => {
  let limited = false;
  const app = await createApp({ route: (u) => (limited && parseJourneyUrl(u) ? json({}, 429) : undefined) });
  assert.equal(app.rows().length, 6);
  limited = true;
  await app.c.refresh({ force: true });
  assert.equal(app.rows().length, 6, "previous trains kept");
  assert.match(app.banners().join(" "), /rate-limiting|limits requests/);
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
  assert.equal(app.rows().length, 6);
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
  const app = await createApp({ journeys, saved: { mode: "leisure" }, settings: { provider: "tfl", tflKey: "test-key" } });
  const p = (n) => String(n).padStart(2, "0");
  app.d.querySelector("#byDate").value = `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
  app.d.querySelector("#byTime").value = "08:16";
  app.d.querySelector('[data-view="by"]').click();
  await sleep(500);
  assert.match(app.text("#hero"), /^To arrive by 08:16 tomorrow · timetable/);
  const rows = app.rows();
  const best = [...app.d.querySelectorAll("#list .row.best")].map((r) => r.textContent).join(" ").replace(/\s+/g, " ");
  assert.match(best, /07:45 Great Northern · 29 min train/, "latest train that arrives in time is recommended");
  assert.match(best, /Cutting it fine/, "arrives 08:14, two minutes before the target");
  assert.match(app.text("#hero"), /07:45 Great Northern/);
  assert.ok(rows.some((r) => /07:15 Great Northern · 29 min train/.test(r)), "earlier option kept");
  assert.ok(rows.some((r) => /07:00 Great Northern · 52 min train.*Stopping train/.test(r)), "stopping train offered and labelled");
  assert.ok(rows.some((r) => /07:30 Great Northern.*Late by 6 min/.test(r)), "07:30 stopper arrives 08:22: shown as late");
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
  assert.equal(app.banners().filter((b) => /rate-limiting|limits requests/.test(b)).length, 1, "one banner, not duplicates");
  app.close();
});

test("Without a TfL key, a load stays within a handful of requests, one at a time", async () => {
  let inFlight = 0, maxInFlight = 0;
  const app = await createApp({ settle: 600, route: async (u) => {
    if (!/api\.tfl\.gov\.uk/.test(u)) return undefined;
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await sleep(20); inFlight--; return undefined;
  } });
  const tfl = app.calls.filter((u) => /api\.tfl\.gov\.uk/.test(u));
  assert.ok(tfl.length <= 4, `keyless first load made ${tfl.length} TfL requests (2 train searches, tube and rail status)`);
  assert.ok(!tfl.some((u) => /app_key=/.test(u)));
  assert.equal(app.rows().length, 6, "every loaded train is listed (3 per route)");
  app.close();
});

test("With a TfL key, the key is sent and the timetable covers more trains", async () => {
  const app = await createApp({ settings: { provider: "tfl", tflKey: "abc123" } });
  const journeyCalls = app.calls.filter((u) => parseJourneyUrl(u));
  assert.ok(journeyCalls.every((u) => /app_key=abc123/.test(u)));
  assert.ok(journeyCalls.length > 2);
  app.close();
});

// ---------- Both routes, every time ----------
// A realistic weekday morning: Great Northern to King's Cross (fast ~29–33 min, stopping ~52 min) and
// Thameslink to Farringdon (~44 min). TfL "Arriving" returns the last three arriving by the time;
// "Departing" the next three.
function morning(day) {
  const T = (hm) => new Date(`${day}T${hm}:00`).getTime();
  const kgx = [["06:38", 52], ["06:47", 29], ["07:00", 52], ["07:08", 29], ["07:30", 33], ["07:38", 29], ["08:00", 52]];
  const zfd = [["06:50", 44], ["07:20", 44], ["07:50", 44], ["08:20", 44]];
  const list = { KGX: kgx, ZFD: zfd, STP: zfd };
  return (q) => {
    const trains = (list[q.to] || []).map(([d, m]) => ({ dep: T(d), arr: T(d) + m * 60e3 }));
    const pick = q.timeIs === "Departing" ? trains.filter((x) => x.dep >= q.t).slice(0, 3) : trains.filter((x) => x.arr <= q.t).slice(-3);
    return { journeys: pick.map((x) => tflJourney(q.from, q.to, x.dep, x.arr)) };
  };
}

async function arriveBy(app, time, day = tomorrow()) {
  app.d.querySelector("#byDate").value = day;
  app.d.querySelector("#byTime").value = time;
  app.d.querySelector('[data-view="by"]').click();
  await sleep(500);
}

test("Arrive by 08:30 offers both the King's Cross and the Farringdon train (no TfL key)", async () => {
  // Sam's settings: 5-minute change at King's Cross, which makes the 07:30 (arr 08:03) work for 08:30.
  const app = await createApp({ journeys: morning(tomorrow()), settings: { provider: "tfl", kxInterchange: 300 } });
  await arriveBy(app, "08:30");
  const rows = app.rows();
  assert.ok(rows.some((r) => /via King's Cross.*07:30 Great Northern/.test(r)), rows.join("\n"));
  assert.ok(rows.some((r) => /via Farringdon.*07:20 Thameslink · 44 min train/.test(r)), "the 44-minute Thameslink is found:\n" + rows.join("\n"));
  assert.doesNotMatch(app.banners().join(" "), /not loaded/);
  app.close();
});

test("A TfL refusal after the first searches still leaves both routes in Arrive by", async () => {
  let journeyCalls = 0;
  const app = await createApp({ journeys: morning(tomorrow()), settle: 600,
    route: (u) => { if (!parseJourneyUrl(u)) return undefined; journeyCalls++; return journeyCalls > 2 ? json({}, 429) : undefined; } });
  journeyCalls = 0; // count only the Arrive by searches
  await arriveBy(app, "08:30");
  const rows = app.rows();
  assert.ok(rows.some((r) => /via King's Cross/.test(r)) && rows.some((r) => /via Farringdon/.test(r)), rows.join("\n"));
  assert.doesNotMatch(app.banners().join(" "), /not loaded/, "a route with data isn't reported missing");
  app.close();
});

test("If a route can't load, the app says so and names what is shown", async () => {
  // Opens on Arrive by; TfL refuses Farringdon searches for tomorrow only.
  const day = tomorrow();
  const app = await createApp({ journeys: morning(day), saved: { view: "by" },
    route: (u) => { const q = parseJourneyUrl(u); return q && q.to === "ZFD" && new Date(q.t).getDate() === new Date(`${day}T12:00:00`).getDate() ? json({}, 429) : undefined; } });
  await arriveBy(app, "08:30");
  const text = app.banners().join(" ");
  assert.match(text, /Farringdon trains not loaded.*Only King's Cross options are shown/);
  assert.match(text, /Trying again at \d\d:\d\d/);
  app.close();
});

test("Leave now lists every catchable train and puts each route's best on the card", async () => {
  const app = await createApp({ settings: { provider: "demo" } });
  const c = app.c, now = Date.now(), m = 60e3;
  const svc = (from, to, d, mins, op) => ({ from, to, std: hm(now + d * m), dep: now + d * m, arr: now + (d + mins) * m, depLate: 0, arrLate: 0,
    depUnknown: false, arrUnknown: false, platform: null, operator: op, cancelled: false, reason: "", origin: "" });
  c.state.saved.dirMode = "office";
  c.state.boards = { "LET-KGX": { msgs: [], services: [40, 45, 50, 55, 60, 65].map((d) => svc("LET", "KGX", d, 29, "Great Northern")) },
                     "LET-ZFD": { msgs: [], services: [svc("LET", "ZFD", 42, 44, "Thameslink")] } };
  const list = c.ranked(now);
  assert.equal(list.length, 7, "nothing hidden");
  assert.deepEqual(JSON.parse(JSON.stringify(list.filter((j) => j.recommended).map((j) => j.hub).sort())), ["KGX", "ZFD"], "one pick per route");
  app.close();
});

test("Arrive by lists trains either side of the recommended one, including late ones", async () => {
  const app = await createApp({ journeys: morning(tomorrow()), settings: { provider: "tfl", kxInterchange: 300 } });
  await arriveBy(app, "08:30");
  const rows = app.rows();
  assert.doesNotMatch(rows.join(" "), /Journeys appear here/, "list isn't left blank");
  const at = (re) => rows.findIndex((r) => re.test(r));
  const kx708 = at(/07:08 Great Northern/), tl720 = at(/07:20 Thameslink/), kx730 = at(/07:30 Great Northern/);
  const kx738 = at(/07:38 Great Northern.*Late by/), tl750 = at(/07:50 Thameslink.*Late by/);
  assert.ok(kx708 >= 0 && tl720 > kx708 && kx730 > tl720, "earlier options in leaving order:\n" + rows.join("\n"));
  assert.ok(kx738 > kx730 && tl750 > kx738, "late options after, labelled:\n" + rows.join("\n"));
  const best = [...app.d.querySelectorAll("#list .row.best")].map((r) => r.textContent.replace(/\s+/g, " "));
  assert.equal(best.length, 2, "one recommended option per route");
  assert.ok(best.some((r) => /07:20 Thameslink/.test(r)) && best.some((r) => /07:30 Great Northern/.test(r)), best.join("\n"));
  const opts = [...app.d.querySelectorAll("#hero .opt")].map((o) => o.textContent.replace(/\s+/g, " "));
  assert.match(opts[0], /07:20 Thameslink · 44 min train · total 1h \d\dm/, "Thameslink arrives first, so it's first on the card");
  assert.match(opts[1], /07:30 Great Northern · 33 min train/);
  assert.match(app.text("#hero"), /Arrive office ?08:\d\d.* · (\d+ min early|just in time)/);
  app.close();
});

test("If no train arrives in time, the earliest late one is recommended and says so", async () => {
  const app = await createApp({ journeys: morning(tomorrow()) });
  await arriveBy(app, "07:40");
  assert.match(app.text("#hero"), /min late, no train gets you there in time/);
  const trains = app.rows().filter((r) => /^Leave/.test(r));
  assert.ok(trains.length && trains.every((r) => /Late by/.test(r)), trains.join("\n"));
  assert.match(app.rows().join(" "), /No King's Cross or Farringdon train gets you there by 07:40/);
  app.close();
});

// ---------- At a London station ----------
const AT_KINGS_CROSS = { coords: { latitude: 51.5309, longitude: -0.1236, accuracy: 15 } };
async function moveTo(app, pos) {
  app.w.navigator.geolocation.watchPosition = (ok) => { setTimeout(() => ok(pos), 5); return 9; };
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(500);
}
function tubeArrivals(now) {
  const a = (lineId, platformName, dest, mins) => ({ vehicleId: `${lineId[0]}${mins}`, lineId, platformName, destinationName: dest, expectedArrival: new Date(now + mins * 60e3).toISOString(), timeToStation: mins * 60 });
  return [
    a("hammersmith-city", "Eastbound - Platform 2", "Barking Underground Station", 3),
    a("metropolitan", "Westbound - Platform 1", "Uxbridge Underground Station", 4),
    a("circle", "Eastbound - Platform 2", "Edgware Road (Circle Line) Underground Station", 2),
    a("metropolitan", "Eastbound - Platform 2", "Aldgate Underground Station", 8),
    a("circle", "Eastbound - Platform 2", "Edgware Road (Circle Line) Underground Station", 12),
  ];
}

test("Morning at King's Cross: which tube to get on and when you'll be at the office", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH,
    route: (u) => (/StopPoint\/940GZZLUKSX\/Arrivals/.test(u) ? json(tubeArrivals(Date.now())) : undefined) });
  assert.match(app.text("#dirNote"), /Heading to the office/);
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#dirNote"), /Heading to the office · you're at King's Cross/, "still heading to work, not flipped to home");
  const hero = app.text("#hero");
  assert.match(hero, /You're at King's Cross · \d\d:\d\d · live tube times/);
  // Default 6 min to the platform: the Circle in 2 min is too soon, so the Met in 8 min is the one.
  assert.match(hero, /Get on the Met to Aldgate eastbound, due \d\d:\d\d/);
  const due = Date.now() + 8 * 60e3, office = due + 600e3 + (90 + 420) * 1000;
  assert.match(hero, new RegExp(`${hm(office)} ?at the office`));
  const rows = app.rows();
  assert.equal(rows.length, 2, "Met in 8 and Circle in 12; not the H&C, westbound, or too-soon trains");
  assert.match(app.text("#listTitle"), /Next Circle and Met trains to Aldgate/);
  assert.ok(!app.calls.some((u, i) => parseJourneyUrl(u) && i > app.calls.findIndex((x) => /Arrivals/.test(x))), "no Letchworth train searches while at King's Cross");
  app.close();
});

test("At King's Cross without live tube times: says so and estimates", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH, route: (u) => (/Arrivals/.test(u) ? json({}, 500) : undefined) });
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#hero"), /at the office · estimate.*Get on the next Circle or Met eastbound to Aldgate.*Live tube times unavailable/);
  app.close();
});

test("Evening at King's Cross: trains home planned from the station, no walk from the office", async () => {
  const app = await createApp({ geo: IN_LONDON });
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#dirNote"), /Heading home · you're at King's Cross/);
  const hero = app.text("#hero");
  assert.match(hero, /You're at King's Cross · \d\d:\d\d/);
  assert.match(hero, /You're at King's Cross: go to the King's Cross platform/);
  assert.match(hero, /Tube from King's Cross to Farringdon|Farringdon/);
  assert.doesNotMatch(hero, /Leave office/);
  app.close();
});

test("Live cards say the status of every line on the journey, including good service", async () => {
  const st = (id, name, sev, desc, reason) => ({ id, name, lineStatuses: [{ statusSeverity: sev, statusSeverityDescription: desc, reason }] });
  let metSev = 10;
  const app = await createApp({ geo: NEAR_LETCHWORTH, route: (u) => {
    if (/StopPoint\/940GZZLUKSX\/Arrivals/.test(u)) return json(tubeArrivals(Date.now()));
    if (/Line\/circle,metropolitan/.test(u)) return json([st("circle", "Circle", 10, "Good Service"),
      metSev === 10 ? st("metropolitan", "Metropolitan", 10, "Good Service") : st("metropolitan", "Metropolitan", 9, "Minor Delays", "Minor delays due to an earlier faulty train."),
      st("hammersmith-city", "Hammersmith & City", 10, "Good Service")]);
    if (/national-rail\/Status/.test(u)) return json([st("great-northern", "Great Northern", 10, "Good Service"), st("thameslink", "Thameslink", 10, "Good Service")]);
    return undefined; } });
  assert.match(app.text("#hero"), /Your lines: all good service.*Great Northern: Good Service.*Circle: Good Service.*Met: Good Service/);
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#hero"), /Your lines: all good service.*Circle: Good Service.*Met: Good Service/);
  metSev = 9;
  await app.c.refresh({ force: true, manual: true });
  const hero = app.text("#hero");
  assert.match(hero, /Your lines Circle: Good Service Met: Minor Delays/);
  assert.match(hero, /Met: Minor delays due to an earlier faulty train/);
  app.close();
});

test("On the tube: works out which one from when you left King's Cross and follows it to Aldgate", async () => {
  const t0 = Date.now();
  const app = await createApp({ geo: NEAR_LETCHWORTH, route: (u) => {
    if (/StopPoint\/940GZZLUKSX\/Arrivals/.test(u)) return json(tubeArrivals(t0));
    // Aldgate: the Met that left King's Cross at t0+8 is due at t0+19 (one minute slower than the usual 10).
    if (/StopPoint\/940GZZLUALD\/Arrivals/.test(u)) return json([{ vehicleId: "m8", lineId: "metropolitan", expectedArrival: new Date(t0 + 19 * 60e3).toISOString(), timeToStation: 0 }]);
    return undefined; } });
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#hero"), /You're at King's Cross/);
  // Pretend 10 minutes pass, you were last seen at King's Cross just as the Met left, and GPS went quiet.
  const realNow = Date.now; const later = t0 + 10 * 60e3; app.w.Date.now = () => later;
  try {
    app.c.state.lastHub.seen = t0 + 8 * 60e3; app.c.state.lastFixAt = t0 + 8 * 60e3;
    assert.equal(app.c.onTube(later), true);
    await app.c.refresh({ force: true });
    const hero = app.text("#hero");
    assert.match(hero, /On the tube · .*worked out from when you left King's Cross/);
    assert.match(hero, /Probably the \d\d:\d\d Met/);
    const office = t0 + 19 * 60e3 + (90 + 420) * 1000;
    assert.match(hero, new RegExp(`${hm(office)} ?at the office`), "uses the live Aldgate time for that train");
    assert.match(hero, /live arrival time for this train/);
  } finally { app.w.Date.now = realNow; }
  app.close();
});
