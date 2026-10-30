// End-to-end behaviour with mocked network and location: direction, failures, timeouts, rate limits, Arrive by.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, hang, json, parseJourneyUrl, tflJourney, tflTimetable, NEAR_LETCHWORTH, IN_LONDON, hm, iso, STATION_NAME, closeAll } from "./harness.mjs";

after(closeAll);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };


const pairsFetched = (calls) => [...new Set(calls.map(parseJourneyUrl).filter(Boolean).map((q) => `${q.from}-${q.to}`))].sort();

// ---------- Direction from location ----------
test("Near Letchworth: waits for location, then plans to the office", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH, geoDelay: "manual", settle: 200 });
  assert.match(app.text("#hero"), /Finding your location/);
  assert.equal(pairsFetched(app.calls).length, 0, "no trains loaded before the direction is known");
  app.giveLocation();
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

test("Reaching the office switches direction to home and reloads trains", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH });
  assert.deepEqual(pairsFetched(app.calls), ["LET-KGX", "LET-ZFD"]);
  app.calls.length = 0;
  // the phone reports a new position
  app.w.navigator.geolocation; // watch callbacks are internal; simulate by re-running locate via visibility
  const watch = app.w.navigator.geolocation.watchPosition;
  // Being at the office (5+ min there) is what turns the journey round (being near it isn't enough).
  app.c.state.saved.officeSince = Date.now() - 6 * 60e3;
  app.w.navigator.geolocation.watchPosition = (ok) => { setTimeout(() => ok({ coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } }), 10); return 2; };
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
  app.d.querySelector('[data-view="by"]').click();
  app.d.querySelector("#byDate").value = `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
  app.d.querySelector("#byTime").value = "08:16";
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
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
  app.d.querySelector('[data-view="by"]').click();
  app.d.querySelector("#byDate").value = day;
  app.d.querySelector("#byTime").value = time;
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
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
  // TfL answers the first two searches for tomorrow morning, then refuses.
  const day = tomorrow(); let calls = 0;
  const app = await createApp({ journeys: morning(day), saved: { view: "by", byTime: "08:30" }, settle: 50,
    route: (u) => { const q = parseJourneyUrl(u); if (!q) return undefined;
      if (new Date(q.t).toDateString() !== new Date(`${day}T08:00:00`).toDateString()) return undefined;
      calls++; return calls > 2 ? json({}, 429) : undefined; } });
  app.d.querySelector("#byDate").value = day;
  app.d.querySelector("#byTime").value = "08:30";
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
  await sleep(700);
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

test("Leave now lists every catchable train; the card has the best and the next best, here on the same route", async () => {
  const app = await createApp({ settings: { provider: "demo" } });
  const c = app.c, now = Date.now(), m = 60e3;
  const svc = (from, to, d, mins, op) => ({ from, to, std: hm(now + d * m), dep: now + d * m, arr: now + (d + mins) * m, depLate: 0, arrLate: 0,
    depUnknown: false, arrUnknown: false, platform: null, operator: op, cancelled: false, reason: "", origin: "" });
  c.state.saved.dirMode = "office";
  c.state.boards = { "LET-KGX": { msgs: [], services: [40, 45, 50, 55, 60, 65].map((d) => svc("LET", "KGX", d, 29, "Great Northern")) },
                     "LET-ZFD": { msgs: [], services: [svc("LET", "ZFD", 42, 44, "Thameslink")] } };
  const list = c.ranked(now);
  assert.equal(list.length, 7, "nothing hidden");
  assert.deepEqual(JSON.parse(JSON.stringify(list.filter((j) => j.recommended).map((j) => j.hub).sort())), ["KGX", "KGX"], "Farringdon arrives over 20 min later: not on the card");
  assert.deepEqual(JSON.parse(JSON.stringify(list.filter((j) => j.recommended).sort((x, y) => x.recommended - y.recommended).map((j) => hm(j.train.dep)))), [hm(now + 40 * m), hm(now + 45 * m)]);
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
  assert.equal(best.length, 2, "the best and the next best");
  assert.ok(best.some((r) => /07:20 Thameslink/.test(r)) && best.some((r) => /07:30 Great Northern/.test(r)), best.join("\n"));
  const opts = [...app.d.querySelectorAll("#hero .opt")].map((o) => o.textContent.replace(/\s+/g, " "));
  assert.match(opts[0], /07:30 Great Northern · 33 min train/, "best: the latest train that gets you there");
  assert.match(opts[1], /07:20 Thameslink · 44 min train · total 1h \d\dm/, "next best: an earlier train with more margin");
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
  assert.equal(rows.length, 4, "Met in 8 and Circle in 12, plus the Circle in 2 and the H&C in 3 if you're near the platform; not westbound");
  assert.match(rows[0], /If you're near the platform/);
  assert.match(rows[1], /H&C.*to Barking.*Aldgate East/, "the H&C goes to Aldgate East, also by the office");
  assert.match(app.text("#listTitle"), /Next tubes to Aldgate and Aldgate East/);
  assert.ok(!app.calls.some((u, i) => parseJourneyUrl(u) && i > app.calls.findIndex((x) => /Arrivals/.test(x))), "no Letchworth train searches while at King's Cross");
  app.close();
});

test("At King's Cross: the lozenge naming your tube is that line's colour (H&C pink, Circle yellow, Met magenta)", async () => {
  const t0 = Date.now();
  const app = await createApp({ geo: NEAR_LETCHWORTH,
    route: (u) => (/StopPoint\/940GZZLUKSX\/Arrivals/.test(u) ? json(tubeArrivals(t0)) : undefined) });
  await moveTo(app, AT_KINGS_CROSS);
  const lozenge = () => app.d.querySelector("#hero .slack");
  assert.match(lozenge().textContent, /^Get on the Met/);
  assert.equal(lozenge().className, "slack met");
  app.d.querySelector(`[data-tubepick^="KGX|${t0 + 3 * 60e3}|H&C"]`).click();
  assert.match(lozenge().textContent, /^You're getting the H&C to Barking/);
  assert.equal(lozenge().className, "slack hc");
  app.d.querySelector(`[data-tubepick^="KGX|${t0 + 12 * 60e3}|Circle"]`).click();
  assert.match(lozenge().textContent, /^You're getting the Circle/);
  assert.equal(lozenge().className, "slack circle");
  // Each class takes the line's own colour, the tokens the line chips use.
  const css = [...app.d.querySelectorAll("style")].map((x) => x.textContent).join("\n");
  for (const [cls, token] of [["circle", "circle"], ["met", "met"], ["hc", "hc"]])
    assert.match(css, new RegExp(`\\.hero \\.slack\\.${cls}\\{background:var\\(--${token}\\);color:var\\(--${token}-ink\\)\\}`));
  assert.match(css, /--hc:#F4A9BE/, "H&C is TfL's light pink");
  assert.match(css, /--circle:#FFD329/, "Circle is TfL's yellow");
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
  assert.match(hero, /You're at King's Cross · departures · \d\d:\d\d/);
  assert.match(hero, /^You're at King's Cross · departures · .*?Departs ?\d\d:\d\d → Arrive home/, "the big time is the departure");
  assert.match(hero, /walk to the platform by \d\d:\d\d|go to the platform now/);
  assert.match(hero, /train departs in \d+m/); assert.doesNotMatch(hero, /leave in \d/, "countdown is to the departure");
  assert.ok(!app.rows().some((r) => /leave in \d/.test(r)), app.rows().join("\n"));
  assert.ok(app.rows().filter((r) => /^(Leave|Departs)/.test(r)).every((r) => /^Departs/.test(r)), app.rows().join("\n"));
  assert.match(hero, /You're at King's Cross: go to the King's Cross platform/);
  // Farringdon trains are planned with the tube hop from King's Cross (whether or not one makes the card).
  const zfd = app.c.buildJourneys("home", Date.now(), { here: true }).find((j) => j.hub === "ZFD");
  assert.ok(zfd, "a Farringdon option exists");
  assert.match(zfd.legs.map((l) => l.d).join(" | "), /Farringdon/);
  assert.ok(app.rows().some((r) => /Farringdon/.test(r)), app.rows().join("\n"));
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
  assert.match(app.text("#hero"), /Your lines: all good service.*(Great Northern|Thameslink): Good Service.*Circle: Good Service.*Met: Good Service/);
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
    assert.equal(app.d.querySelector("#hero .slack").className, "slack met", "the ride lozenge is the line's colour too");
    const office = t0 + 19 * 60e3 + (90 + 420) * 1000;
    assert.match(hero, new RegExp(`${hm(office)} ?at the office`), "uses the live Aldgate time for that train");
    assert.match(hero, /live arrival time for this train/);
  } finally { app.w.Date.now = realNow; }
  app.close();
});

test("Walking from Aldgate to the office: plans from where you are, never from Cartref", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH });
  app.c.state.saved.dirMode = "office";
  await moveTo(app, { coords: { latitude: 51.5141, longitude: -0.0745, accuracy: 20 } });   // just east of Aldgate station
  const hero = app.text("#hero");
  assert.match(hero, /Walking to the office · \d\d:\d\d · from your location/);
  assert.match(hero, /at the office · about \d+ min walk/);
  assert.doesNotMatch(hero, /Cartref/);
  await moveTo(app, { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } });
  assert.match(app.text("#hero"), /you've arrived/);
  app.close();
});

test("Elsewhere in London on the way to work: one TfL plan from where you are", async () => {
  const t0 = Date.now();
  const app = await createApp({ geo: NEAR_LETCHWORTH, route: (u) => {
    if (/JourneyResults\/51\.5\d+,-0\.1\d+\/to\/51\.5139,-0\.071/.test(u))
      return json({ journeys: [{ arrivalDateTime: new Date(t0 + 25 * 60e3).toISOString(), legs: [{ mode: { id: "walking" }, duration: 5 }, { mode: { id: "tube" }, duration: 15, routeOptions: [{ name: "Central" }] }] }] });
    return undefined; } });
  app.c.state.saved.dirMode = "office";
  await moveTo(app, { coords: { latitude: 51.5154, longitude: -0.1410, accuracy: 20 } });   // Oxford Circus
  const hero = app.text("#hero");
  assert.match(hero, new RegExp(`In London · .*${hm(t0 + 25 * 60e3)} ?at the office · TfL journey planner`));
  assert.match(hero, /Walk 5m → Central 15m/);
  app.close();
});

test("The last London station you were seen at survives reopening the app", async () => {
  const seen = Date.now() - 5 * 60e3;
  const app = await createApp({ saved: { lastHub: { hub: "KGX", seen, arrivals: [] } } });
  assert.equal(app.c.state.lastHub.hub, "KGX");
  app.close();
});

// ---------- Office visit, St Pancras trains, diagnostics, Leave around ----------
const AT_OFFICE = { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } };

test("After the office, King's Cross means heading home (not back to the office)", async () => {
  const app = await createApp({ geo: NEAR_LETCHWORTH });
  app.c.state.saved.officeSince = Date.now() - 6 * 60e3;          // at the office for 5+ min
  await moveTo(app, AT_OFFICE);
  assert.match(app.text("#dirNote"), /Heading home · you're at the office/);
  // Hours later the morning trip has expired; the office visit still counts for today.
  app.c.state.saved.trip = { dir: "office", at: Date.now() - 5 * 3600e3 };
  await moveTo(app, AT_KINGS_CROSS);
  assert.match(app.text("#dirNote"), /Heading home · you're at King's Cross/);
  assert.match(app.text("#hero"), /You're at King's Cross/);
  assert.doesNotMatch(app.text("#hero"), /Get on the .* to Aldgate/);
  app.close();
});

test("Trains from St Pancras are kept on the King's Cross route; dropped journeys are explained", async () => {
  const now = Date.now(), m = 60e3;
  const change = (dep) => ({ legs: [
    { mode: { id: "national-rail" }, departureTime: iso(dep), arrivalTime: iso(dep + 20 * m), departurePoint: { commonName: STATION_NAME.KGX }, arrivalPoint: { commonName: "Stevenage Rail Station" } },
    { mode: { id: "national-rail" }, departureTime: iso(dep + 25 * m), arrivalTime: iso(dep + 40 * m), departurePoint: { commonName: "Stevenage Rail Station" }, arrivalPoint: { commonName: STATION_NAME.LET } } ] });
  const journeys = (q) => {
    if (q.from === "KGX") return { journeys: [
      tflJourney("STP", "LET", now + 35 * m, now + 77 * m, "Thameslink to Cambridge"),
      tflJourney("KGX", "LET", now + 40 * m, now + 74 * m, "Great Northern to Cambridge"),
      change(now + 45 * m) ] };
    return { journeys: [tflJourney("ZFD", "LET", now + 30 * m, now + 77 * m, "Thameslink to Cambridge")] };
  };
  const app = await createApp({ geo: IN_LONDON, journeys });
  const rows = app.rows();
  // The St Pancras and Farringdon Thameslink here are the same train (same arrival): one row, both stations.
  assert.ok(rows.some((r) => /via (St Pancras or Farringdon|Farringdon or St Pancras).*Thameslink.*Board at (Farringdon|St Pancras) \d\d:\d\d or (St Pancras|Farringdon) \d\d:\d\d/.test(r)), "merged Thameslink:\n" + rows.join("\n"));
  assert.ok(rows.some((r) => /via King's Cross.*Great Northern/.test(r)));
  const diag = app.text("#diagBody");
  assert.match(diag, /King's Cross → Letchworth, timetable: 1 search; TfL returned 3 journeys; 2 direct trains kept \(\d\d:\d\d St Pancras, \d\d:\d\d King's Cross\); 1 with a change of train/);
  app.close();
});

test("Leave around 17:40: the best train (alone when nothing else is close) and every train around then, in leaving order", async () => {
  const day = tomorrow(), T = (h) => new Date(`${day}T${h}:00`).getTime(), m = 60e3;
  const kgx = [["17:38", 52], ["17:52", 34], ["18:06", 29], ["18:22", 52]], zfd = [["17:56", 44], ["18:26", 44]];
  const journeys = (q) => {
    const list = (q.from === "KGX" ? kgx : q.from === "ZFD" ? zfd : []).map(([d, mm]) => ({ dep: T(d), arr: T(d) + mm * m }));
    return { journeys: list.filter((x) => x.dep >= q.t).slice(0, 3).map((x) => tflJourney(q.from, q.to, x.dep, x.arr)) };
  };
  const app = await createApp({ geo: AT_OFFICE, journeys });
  app.d.querySelector('[data-view="at"]').click();
  await sleep(50);
  assert.equal(app.d.querySelector("#byTime").value, "17:40", "defaults to 17:40");
  assert.equal(app.text("#byLabel"), "Leave around");
  app.d.querySelector("#byDate").value = day;
  app.d.querySelector("#byDate").dispatchEvent(new app.w.Event("change"));
  await sleep(500);
  const hero = app.text("#hero");
  assert.match(hero, /^Leaving around 17:40 tomorrow · timetable · best, and the next best/);
  const opts = [...app.d.querySelectorAll("#hero .opt")].map((o) => o.textContent.replace(/\s+/g, " "));
  // 18:06 fast needs leaving at 17:37 (3 min before) and gets home first. Every later train gets home over 20 min after it,
  // and Farringdon's 17:56 leaves earlier and gets home later, so the card shows the 18:06 alone; the list has the rest.
  assert.equal(opts.length, 1);
  assert.match(opts[0], /18:06 Great Northern · 29 min train · total 1h \d\dm · leave 3 min before 17:40/);
  const rows = app.rows();
  assert.ok(rows.length >= 4, rows.join("\n"));
  assert.match(app.text("#listTitle"), /Trains around 17:40, in leaving order/);
  app.close();
});

test("Live boards: only the direction you're going; Leave around within reach uses the live board from that time", async () => {
  const now = Date.now(), m = 60e3;
  const board = () => ({ locationName: "x", trainServices: [{ std: hm(now + 70 * m), etd: "On time", operator: "Great Northern", platform: "9",
    subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: hm(now + 105 * m), et: "On time" }] }] }], nrccMessages: [] });
  const app = await createApp({ geo: AT_OFFICE, settings: { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120" },
    route: (u) => (/darwin\.test/.test(u) ? json(board()) : undefined) });
  const dar = app.calls.filter((u) => /darwin\.test/.test(u));
  assert.ok(dar.length >= 3, dar.join("\n"));
  assert.ok(dar.every((u) => /GetDepBoardWithDetails\/(KGX|STP|ZFD)\?.*filterCrs=LET/.test(u)), "home boards only:\n" + dar.join("\n"));
  const t = new Date(now + 60 * m), p = (n) => String(n).padStart(2, "0");
  app.d.querySelector('[data-view="at"]').click();
  await sleep(300);
  const before = app.calls.length;
  app.d.querySelector("#byDate").value = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  app.d.querySelector("#byTime").value = `${p(t.getHours())}:${p(t.getMinutes())}`;
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
  await sleep(300);
  const later = app.calls.slice(before);
  assert.ok(later.some((u) => /darwin\.test.*timeOffset=4[45]/.test(u)), later.join("\n"));
  assert.match(app.text("#hero"), /Leaving around \d\d:\d\d \S+ · live/);
  app.close();
});

test("Timetable: a Thameslink found at one London station is looked for at the other, and merged from real results", async () => {
  const day = tomorrow(), T = (h) => new Date(`${day}T${h}:00`).getTime(), m = 60e3;
  const lists = { ZFD: [["18:56", "19:40"], ["19:26", "20:09"]], STP: [["19:01", "19:40"], ["19:31", "20:09"]], KGX: [["18:48", "19:16"], ["19:18", "19:46"]] };
  const journeys = (q) => {
    if (q.to !== "LET") return { journeys: [] };
    // Farringdon and St Pancras searches only reach 20 minutes ahead; King's Cross also returns the St Pancras 19:31.
    const span = q.from === "KGX" ? 60 : 20;
    const mk = (from, [d, a]) => ({ from, dep: T(d), arr: T(a) });
    const pool = q.from === "KGX" ? [...lists.KGX.map((x) => mk("KGX", x)), mk("STP", lists.STP[1])] : lists[q.from].map((x) => mk(q.from, x));
    return { journeys: pool.filter((x) => x.dep >= q.t && x.dep <= q.t + span * m).map((x) => tflJourney(x.from, "LET", x.dep, x.arr)) };
  };
  const app = await createApp({ geo: AT_OFFICE, journeys, settings: { provider: "tfl", tflKey: "k" } });
  app.d.querySelector('[data-view="at"]').click();
  app.d.querySelector("#byDate").value = day;
  app.d.querySelector("#byTime").value = "18:40";
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
  await sleep(600);
  const rows = app.rows().join("\n");
  assert.match(rows, /Board at Farringdon 18:56 or St Pancras 19:01/, rows);
  assert.match(rows, /Board at Farringdon 19:26 or St Pancras 19:31/, rows);
  assert.doesNotMatch(rows, /about/);
  assert.ok(app.calls.some((u) => /JourneyResults\/51\.53062,-0\.12594/.test(u)), "searched St Pancras directly");
  app.close();
});

test("Leave around: where the live board stops short, later trains come from the timetable and the heading says so", async () => {
  const now = Date.now(), m = 60e3;
  // Live board reaches only up to now + 2h whatever the offset (as observed on the real feed).
  const board = () => ({ locationName: "x", trainServices: [{ std: hm(now + 100 * m), etd: "On time", operator: "Great Northern", platform: "9",
    subsequentCallingPoints: [{ callingPoint: [{ crs: "LET", locationName: "Letchworth Garden City", st: hm(now + 130 * m), et: "On time" }] }] }], nrccMessages: [] });
  const later = now + 150 * m;
  const journeys = (q) => ({ journeys: q.to === "LET" && q.from === "KGX" && q.t <= later ? [tflJourney("KGX", "LET", later, later + 30 * m)] : [] });
  const app = await createApp({ geo: AT_OFFICE, journeys, settings: { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120" },
    route: (u) => (/darwin\.test/.test(u) ? json(board()) : undefined) });
  const t = new Date(now + 90 * m), p = (n) => String(n).padStart(2, "0");
  app.d.querySelector('[data-view="at"]').click();
  await sleep(300);
  app.d.querySelector("#byDate").value = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  app.d.querySelector("#byTime").value = `${p(t.getHours())}:${p(t.getMinutes())}`;
  app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change"));
  await sleep(500);
  assert.match(app.text("#hero"), new RegExp(`live to ${hm(now + 100 * m)}, timetable after`));
  const rows = app.rows().join("\n");
  assert.ok(rows.includes(hm(now + 100 * m)) && rows.includes(hm(later)), rows);
  const rowList = app.rows();
  assert.match(rowList.find((r) => r.includes(hm(later))), /Timetable only: not live-checked/);
  assert.doesNotMatch(rowList.find((r) => r.includes(hm(now + 100 * m))), /Timetable only/);
  assert.equal(app.d.querySelector("#diag").hidden, false, "Why these trains? is shown for a mixed plan");
  const diag = app.text("#diagBody");
  assert.match(diag, new RegExp(`King's Cross → Letchworth, live board: 1 train: ${hm(now + 100 * m)}`));
  assert.match(diag, /later trains come from TfL's timetable/);
  assert.match(diag, new RegExp(`King's Cross → Letchworth, timetable: .*${hm(later)} King's Cross`));
  app.close();
});

// ---------- Location permission ----------
test("Coming back to the app doesn't restart location (which can make Safari ask again) when positions still arrive", async () => {
  let push, starts = 0;
  const app = await createApp({ geo: null, settle: 50, relocateMs: 200 });
  app.w.navigator.geolocation.watchPosition = (ok) => { starts++; push = ok; return 5; };
  app.w.navigator.geolocation.clearWatch = () => {};
  app.c.state.watchId = 1; app.c.state.locStatus = "ok";
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(250);
  assert.equal(starts, 1, "no position since coming back: restarted once");
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(20); push(NEAR_LETCHWORTH); await sleep(300);
  assert.equal(starts, 1, "a position arrived: not restarted");
  app.close();
});

test("Coming back with a cached position (taken before you came back) doesn't restart location", async () => {
  let starts = 0;
  const app = await createApp({ geo: null, settle: 50, relocateMs: 200 });
  app.w.navigator.geolocation.watchPosition = () => { starts++; return 5; };
  app.w.navigator.geolocation.clearWatch = () => {};
  app.c.state.watchId = 1; app.c.state.locStatus = "ok";
  app.d.dispatchEvent(new app.w.Event("visibilitychange"));
  await sleep(20);
  app.c.onPosition({ coords: { latitude: 51.975, longitude: -0.23, accuracy: 15 }, timestamp: Date.now() - 10e3 });
  await sleep(300);
  assert.equal(starts, 0);
  app.close();
});
