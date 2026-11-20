// Display mode (docs/stories/display-mode.md): ?display in the address turns the app into a read-only board for a wall
// screen or a frame in another page (a Home Assistant dashboard). No controls, no location: the next journeys from
// home to the office in Leave now. It changes nothing this browser has saved except the live-data source.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, json, closeAll, hm, at } from "./harness.mjs";
after(closeAll);

const BASE = "https://srapley-spec.github.io/cartref-commute/";
const PROXY = "https://cartref-rail.example.workers.dev";
const LS = "cartrefCommute.v1";
const stored = (app) => JSON.parse(app.w.localStorage.getItem(LS));
const shown = (app, sel) => { const el = app.d.querySelector(sel); return !!el && !el.hidden && app.w.getComputedStyle(el).display !== "none"; };
// A phone that was last planning a leisure trip home, arriving by a time, following a route, with every extra switched on.
const PHONE = { mode: "leisure", dirMode: "home", view: "by", pace: "fast", followRoute: { marker: "kept" }, viewOverride: "live" };
const EXTRAS = { provider: "tfl", followRoute: true, alongLine: true };

test("Display mode: Leave now from home to the office, whatever this browser last had on screen", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  assert.ok(app.d.documentElement.classList.contains("display-mode"));
  assert.equal(app.c.direction(), "office");
  assert.equal(app.c.state.saved.mode, "commute");
  assert.equal(app.c.state.saved.view, "now");
  assert.equal(app.c.state.saved.pace, "fast", "your walking pace is kept: it sets the leave times");
  assert.match(app.text("#hero"), /If you leave now/);
  assert.match(app.text("#hero"), /Leave by/);
  assert.match(app.text("#hero"), /At office/);
  assert.equal(app.text("#listTitle"), "Next trains, in leaving order");
  assert.ok(app.rows().length > 0 || app.d.querySelectorAll("#list > *").length > 0, "the next trains are listed");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Display mode: only the status line, the recommendation, the list and 'Updated' are shown; every control is hidden", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  for (const sel of ["#hero", "#list", "#listTitle", "#signalStatus", "#updated"]) assert.ok(shown(app, sel), `${sel} is shown`);
  for (const sel of ["header", "#signalModebar", "#signalToolbar", "#signalPlanningControls", "#dirNote", "#journeyViewControl", "#alongNavigation",
    "#followPanel", "#originRow", "#destRow", "#byForm", "#diag", "#signalNetwork", "#signalOtherJourneys", "#tripRoot", "#refreshBtn", "#build"]) {
    const el = app.d.querySelector(sel);
    if (!el) continue;                                   // not built at all is hidden enough
    let node = el, hidden = false;
    while (node && node.nodeType === 1) { if (node.hidden || app.w.getComputedStyle(node).display === "none") { hidden = true; break; } node = node.parentElement; }
    assert.ok(hidden, `${sel} is hidden`);
  }
  // (The simulator's dock sits outside the page column; jsdom doesn't apply the !important rule that hides it, so
  // check what's inside it: nothing of the simulator is on screen.)
  const controls = [...app.d.querySelectorAll(".wrap button, .wrap select, .wrap input, #simDock button, #simDock select, #simDock input")].filter((el) => {
    let node = el; while (node && node.nodeType === 1) { if (node.hidden || app.w.getComputedStyle(node).display === "none") return false; node = node.parentElement; } return true; });
  assert.deepEqual(controls.map((el) => el.id || el.textContent.trim()), [], "no button, select or input is left on screen");
  assert.equal(app.d.querySelectorAll("#hero [data-follow], #list [data-follow]").length, 0, "no Follow buttons, though Follow is on in Settings");
  app.close();
});

test("Display mode: never asks for this device's location; the normal app still does", async () => {
  const a = await createApp({ url: BASE + "?display", settings: EXTRAS });
  a.d.dispatchEvent(new a.w.Event("visibilitychange"));
  await sleep(50);
  assert.equal(a.c.state.watchId, undefined, "no location watch at start or on coming back");
  assert.equal(a.c.state.here, null);
  assert.equal(a.c.state.locStatus, "off");
  a.close();
  const b = await createApp({ url: BASE, settings: EXTRAS });
  assert.notEqual(b.c.state.watchId, undefined, "the normal app watches your location");
  assert.ok(b.c.state.here, "and has a position");
  assert.equal(b.d.documentElement.classList.contains("display-mode"), false);
  assert.ok(shown(b, "#signalModebar"), "the normal app keeps its controls");
  b.close();
});

test("Display mode: nothing this browser has saved is changed", async () => {
  const app = await createApp({ url: BASE + "?display", settings: EXTRAS, saved: PHONE });
  const before = JSON.stringify(stored(app));
  app.c.render(); await app.c.refresh({ force: true }); await sleep(50);
  assert.equal(JSON.stringify(stored(app)), before);
  assert.deepEqual(stored(app).followRoute, { marker: "kept" });
  assert.equal(stored(app).view, "by"); assert.equal(stored(app).dirMode, "home"); assert.equal(stored(app).mode, "leisure");
  app.close();
});

test("Display mode: a setup link asks on the page (a framed page can't show a browser dialog); Yes saves only the live-data source", async () => {
  const asked = [];
  const route = (u) => (u === PROXY + "/status" ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true, google: false, anyStation: false, alerts: false })
    : u.startsWith(PROXY) && /\/board\//.test(u) ? json({ trainServices: [], nrccMessages: [] }) : undefined);
  const app = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: EXTRAS, saved: PHONE,
    beforeScripts: (w) => { w.confirm = (m) => { asked.push(m); return true; }; }, route });
  assert.equal(asked.length, 0, "no browser dialog");
  assert.equal(app.c.S().provider, "tfl", "nothing changes until you say yes");
  assert.ok(shown(app, "#displaySetup"));
  assert.match(app.text("#displaySetup"), /Use cartref-rail\.example\.workers\.dev for all live data on this display\?/);
  app.d.querySelector('[data-display-setup="yes"]').click();
  await sleep(100);
  assert.equal(app.d.querySelector("#displaySetup"), null);
  assert.equal(app.c.S().provider, "proxy"); assert.equal(app.c.S().proxyBase, PROXY);
  assert.ok(app.calls.includes(PROXY + "/status"), "and asks the proxy what it's set up for");
  const s = stored(app);
  assert.equal(s.settings.provider, "proxy"); assert.equal(s.settings.proxyBase, PROXY);
  assert.equal(s.settings.alongLine, true, "your own switches are stored as they were, not as display mode forces them");
  assert.ok(!("followRoute" in s.settings), "the retired Follow switch is dropped (permanent since #63), not stored");
  assert.equal(s.view, "by"); assert.deepEqual(s.followRoute, { marker: "kept" });
  app.close();
});

test("Display mode: saying No to a setup link changes nothing; a look-alike address isn't offered; already set up isn't asked again", async () => {
  const no = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: EXTRAS });
  no.d.querySelector('[data-display-setup="no"]').click();
  await sleep(20);
  assert.equal(no.c.S().provider, "tfl"); assert.equal(no.d.querySelector("#displaySetup"), null);
  assert.equal(no.w.location.hash, "", "the link is cleared from the address");
  assert.equal(no.w.location.search, "?display", "and it's still display mode");
  no.close();
  const bad = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent("http://10.0.0.1:8080/x")}`, settings: EXTRAS });
  assert.equal(bad.d.querySelector("#displaySetup"), null);
  bad.close();
  const done = await createApp({ url: `${BASE}?display#setup=${encodeURIComponent(PROXY)}`, settings: { provider: "proxy", proxyBase: PROXY },
    route: (u) => (u.startsWith(PROXY) ? json(u.endsWith("/status") ? { v: 1, rail: true } : { trainServices: [], nrccMessages: [] }) : undefined) });
  assert.equal(done.d.querySelector("#displaySetup"), null);
  done.close();
});

test("Display mode: an always-on screen stays inside its request budget: three boards a minute and under four requests a minute through the proxy", async () => {
  // Sam, 10 Nov: refresh every minute all day, without using up the feeds' allowances (Cloudflare's free 100,000 a
  // day; docs/stories/display-mode.md has the measured figures). A change that raises this is a decision for Sam.
  const m = 60e3, start = at("2026-11-03", "06:30");
  let clock = start;
  const board = (to) => ({ locationName: "Letchworth", trainServices: [15, 30, 45, 60, 75].map((d, i) => ({ serviceID: `S${i}${to}`, std: hm(start + d * m), etd: "On time",
    operator: "Thameslink", platform: "1", subsequentCallingPoints: [{ callingPoint: [{ crs: to, locationName: to, st: hm(start + (d + 45) * m), et: "On time" }] }] })), nrccMessages: [] });
  const app = await createApp({ url: BASE + "?display", settings: { provider: "proxy", proxyBase: PROXY }, now: start,
    route: (u) => { if (!u.startsWith(PROXY)) return undefined; const b = u.match(/\/board\/[A-Z]{3}\/([A-Z]{3})/);
      return b ? json(board(b[1])) : u.endsWith("/status") ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true }) : json([]); } });
  assert.match(app.text("#hero"), /Leave by/, "live trains are on the board");
  const atLoad = app.calls.length, perMinute = [];
  for (let i = 1; i <= 10; i++) {
    clock = start + i * m; app.setNow(clock);
    const before = app.calls.length;
    await app.c.refresh(); await sleep(30);                    // the page's own once-a-minute refresh
    const made = app.calls.slice(before);
    assert.ok(made.filter((u) => /\/board\//.test(u)).length <= 3, `minute ${i}: at most the three boards from home\n${made.join("\n")}`);
    perMinute.push(made.length);
  }
  assert.ok(app.calls.every((u) => u.startsWith(PROXY)), "everything goes through the proxy");
  assert.ok(atLoad <= 8, `at load: ${atLoad}`);
  const total = perMinute.reduce((a, b) => a + b, 0);
  assert.ok(total >= 30, `it does refresh every minute: ${perMinute.join(",")}`);
  assert.ok(total <= 40, `under four requests a minute on average (≈5,300 a day): ${perMinute.join(",")}`);
  app.close();
});

// ?display=next: the hall iPhone's one dim card (docs/stories/display-mode.md, "The hall's next train"; Cartref Hall
// contract §4, Sam 18 Nov 2026, option A). Same planning and pick as ?display; whole minutes only; moves each minute.
const M = 60e3, HALL_START = at("2026-11-03", "06:30");
const hallBoard = (to) => ({ locationName: "Letchworth", trainServices: [15, 30, 45, 60, 75].map((d, i) => ({ serviceID: `S${i}${to}`, std: hm(HALL_START + d * M), etd: "On time",
  operator: "Thameslink", platform: "1", subsequentCallingPoints: [{ callingPoint: [{ crs: to, locationName: to, st: hm(HALL_START + (d + 45) * M), et: "On time" }] }] })), nrccMessages: [] });
const hallRoute = (u) => { if (!u.startsWith(PROXY)) return undefined; const b = u.match(/\/board\/[A-Z]{3}\/([A-Z]{3})/);
  return b ? json(hallBoard(b[1])) : u.endsWith("/status") ? json({ v: 1, rail: true, serviceDetails: true, tflKey: true }) : json([]); };
const hallApp = (url, now = HALL_START) => createApp({ url: BASE + url, settings: { provider: "proxy", proxyBase: PROXY }, now, route: hallRoute });
const visible = (app, el) => { let node = el; while (node && node.nodeType === 1) { if (node.hidden || app.w.getComputedStyle(node).display === "none") return false; node = node.parentElement; } return true; };

test("Display next: one card with the full display's top recommendation — Leave by, train, platform, status and arrival", async () => {
  const app = await hallApp("?display=next");
  const html = app.d.documentElement;
  assert.ok(html.classList.contains("display-next") && html.classList.contains("display-mode"), "every display rule applies");
  assert.equal(app.c.direction(), "office");
  const card = app.text("#hallNext");
  const heroLeave = app.text("#hero").match(/Leave by\s*(\d\d:\d\d)/)[1];
  assert.match(card, new RegExp(`Leave by\\s*${heroLeave}`), `the same Leave by as the full display's best (${heroLeave}): ${card}`);
  const left = card.match(/in (\d+) min/);
  const [h, m] = heroLeave.split(":").map(Number), nowMin = new Date(HALL_START).getHours() * 60 + new Date(HALL_START).getMinutes();
  assert.ok(left && Number(left[1]) === h * 60 + m - nowMin, `minutes left match the clock: ${card}`);
  assert.match(card, /Thameslink/);
  assert.match(card, /platform 1/);
  assert.match(card, /On time/);
  assert.match(card, /At office\s*\d\d:\d\d/);
  assert.match(card, /as of \d\d:\d\d/);
  assert.ok(visible(app, app.d.querySelector("#hallNext")), "the card is shown");
  assert.ok(!visible(app, app.d.querySelector(".wrap")), "the rest of the page is not");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Display next: whole minutes only, so the card's text changes at most once a minute, and it moves each minute", async () => {
  const app = await hallApp("?display=next");
  const list = app.c.ranked(HALL_START);
  const a = app.c.hallNextMarkup(list, HALL_START + 5e3), b = app.c.hallNextMarkup(list, HALL_START + 50e3);
  assert.equal(a, b, "nothing changes within a minute");
  const spots = new Set(); for (let i = 0; i < 9; i++) { const p = app.c.hallNextSpot(HALL_START + i * M); spots.add(`${p.x},${p.y}`);
    assert.ok(Math.abs(p.x) <= 40 && Math.abs(p.y) <= 40, `stays near the middle: ${p.x},${p.y}`); }
  assert.ok(spots.size >= 8, `nine minutes visit (almost) nine different spots: ${[...spots].join(" ")}`);
  const c = app.c.hallNextMarkup(list, HALL_START + M + 5e3);
  assert.notEqual(c, a, "the next minute it moves (and the minutes left go down)");
  assert.notEqual(c.match(/translate\([^)]*\)/)[0], a.match(/translate\([^)]*\)/)[0]);
  app.close();
});

test("Display next: data more than 3 minutes old is greyed and says so; no data says so", async () => {
  const app = await hallApp("?display=next");
  const list = app.c.ranked(HALL_START);
  app.c.state.fetchedAt = HALL_START - 4 * M;
  const stale = app.c.hallNextMarkup(list, HALL_START);
  assert.match(stale, /class="hn-card stale"/);
  assert.match(stale, /not up to date/);
  app.c.state.fetchedAt = HALL_START - 2 * M;
  assert.doesNotMatch(app.c.hallNextMarkup(list, HALL_START), /not up to date/, "2 minutes old is still fresh");
  const boards = app.c.state.boards; app.c.state.boards = null; app.c.state.loading = false;
  assert.match(app.c.hallNextMarkup([], HALL_START), /No train data yet/);
  app.c.state.boards = boards;
  app.close();
});

test("Display next: plain ?display and the normal app are unchanged", async () => {
  const d = await hallApp("?display");
  assert.ok(!d.d.documentElement.classList.contains("display-next"));
  assert.equal(d.c.DISPLAY_NEXT, false);
  assert.ok(!visible(d, d.d.querySelector("#hallNext")), "no card on the normal display");
  assert.match(d.text("#hero"), /Leave by/);
  d.close();
  const n = await hallApp("");
  assert.ok(!n.d.documentElement.classList.contains("display-mode"));
  assert.ok(!visible(n, n.d.querySelector("#hallNext")));
  n.close();
});

// ?display=hall: the hall iPhone on its stand (docs/stories/display-mode.md, "The hall's fastest way to London";
// Sam, 20 Nov 2026): Leisure's Leave now from home to London, with the rail and every tube line's status.
const line = (id, name, sev, desc) => ({ id, name, statuses: [{ sev, desc, reason: "" }] });
const GOOD = 10;

test("Display hall: the fastest way to London from home, the same pick as the Leisure display, arriving at a London terminal", async () => {
  const app = await hallApp("?display=hall");
  const html = app.d.documentElement;
  assert.ok(html.classList.contains("display-hall") && html.classList.contains("display-mode"), "every display rule applies");
  assert.ok(!html.classList.contains("display-next"));
  assert.equal(app.c.state.saved.mode, "leisure", "Leisure: home to London, not the office");
  assert.equal(app.c.direction(), "office");
  const board = app.text("#hallBoard");
  assert.match(board, /Fastest to London/);
  const heroLeave = app.text("#hero").match(/Leave by\s*(\d\d:\d\d)/)[1];
  assert.match(board, new RegExp(`Leave by\\s*${heroLeave}`), `the same Leave by as Leisure's best (${heroLeave}): ${board}`);
  assert.match(board, /in \d+ min|Leave now/);
  assert.match(board, /Thameslink/);
  assert.match(board, /platform 1/);
  assert.match(board, /In London\s*\d\d:\d\d at (King's Cross|St Pancras)/, board);
  assert.doesNotMatch(board, /office/i, "nothing about Sam's office");
  assert.ok(visible(app, app.d.querySelector("#hallBoard")), "the board is shown");
  assert.ok(!visible(app, app.d.querySelector(".wrap")) && !visible(app, app.d.querySelector("#hallNext")), "nothing else is");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Display hall: the status row says good service only when every line is known to be good, and names each problem", async () => {
  const app = await hallApp("?display=hall");
  const s = app.c.state, now = HALL_START;
  const pills = () => app.c.hallStatusPills(now);
  s.nrStatus = null; s.status = null;
  let row = pills();
  assert.match(row, /Trains: checking…/); assert.match(row, /Tube: checking…/);
  assert.doesNotMatch(row, /good service/, "never 'good' while unknown");
  s.nrStatus = []; s.status = [];
  row = pills();
  assert.match(row, /Trains: unavailable/); assert.match(row, /Tube: unavailable/, "a failed fetch says so, not 'checking…' for ever");
  assert.doesNotMatch(row, /good service/, "an empty answer isn't good service either");
  s.nrStatus = [line("thameslink", "Thameslink", GOOD, "Good Service"), line("great-northern", "Great Northern", GOOD, "Good Service")];
  s.status = ["bakerloo", "central", "circle", "victoria"].map((id) => line(id, id[0].toUpperCase() + id.slice(1), GOOD, "Good Service"));
  s.nrOkAt = s.statusAt = now - 2 * M;
  row = pills();
  assert.match(row, /Trains: good service/); assert.match(row, /Tube: good service/);
  assert.doesNotMatch(row, /hb-pill warn/);
  s.nrStatus[1] = line("great-northern", "Great Northern", 6, "Severe Delays");
  s.status[2] = line("circle", "Circle", 9, "Minor Delays");
  row = pills();
  assert.match(row, /Great Northern: Severe Delays/); assert.match(row, /Circle: Minor Delays/);
  assert.doesNotMatch(row, /Trains: good service/); assert.doesNotMatch(row, /Tube: good service/);
  assert.match(row, /hb-pill warn/, "a problem looks different, not only by colour: it carries a mark");
  assert.match(row, /hb-warn/);
  s.status = ["bakerloo", "central", "circle", "victoria"].map((id) => line(id, id, 5, "Part Closure"));
  row = pills();
  assert.equal((row.match(/: Part Closure/g) || []).length, 2, "at most two tube lines by name");
  assert.match(row, /\+2 more tube lines/);
  app.close();
});

test("Display hall: an old answer, a line with no status or a missing rail line is unknown, never good service", async () => {
  const app = await hallApp("?display=hall");
  const s = app.c.state, now = HALL_START;
  const good = (id, name) => line(id, name, GOOD, "Good Service");
  const rail = () => [good("thameslink", "Thameslink"), good("great-northern", "Great Northern")];
  const tube = () => ["bakerloo", "central", "circle"].map((id) => good(id, id));
  s.nrStatus = rail(); s.status = tube(); s.nrOkAt = s.statusAt = now - app.c.HALL_STATUS_STALE_MS + M;
  assert.match(app.c.hallStatusPills(now), /Trains: good service.*Tube: good service/, "fresh enough");
  s.nrOkAt = s.statusAt = now - app.c.HALL_STATUS_STALE_MS - M;
  let row = app.c.hallStatusPills(now);
  assert.match(row, /Trains: not up to date/); assert.match(row, /Tube: not up to date/);
  assert.doesNotMatch(row, /good service/, "an old 'good' is not shown as current");
  s.nrOkAt = s.statusAt = now - M;
  s.status = [...tube(), { id: "victoria", name: "Victoria", statuses: [] }];
  row = app.c.hallStatusPills(now);
  assert.match(row, /Tube: not every line known/); assert.doesNotMatch(row, /Tube: good service/);
  s.status = tube(); s.nrStatus = [good("thameslink", "Thameslink")];
  row = app.c.hallStatusPills(now);
  assert.match(row, /Trains: not every line known/, "Great Northern missing from the answer");
  assert.doesNotMatch(row, /Trains: good service/);
  s.nrStatus = [good("thameslink", "Thameslink"), line("great-northern", "Great Northern", 6, "Severe Delays")];
  s.status = [...tube(), { id: "victoria", name: "Victoria", statuses: [] }];
  row = app.c.hallStatusPills(now);
  assert.match(row, /Great Northern: Severe Delays/); assert.doesNotMatch(row, /Trains: good service/);
  assert.match(row, /Tube: not every line known/);
  s.status = [good("x", "<img src=x onerror=alert(1)>")]; s.status[0].statuses[0].sev = 6; s.status[0].statuses[0].desc = "Severe Delays";
  assert.doesNotMatch(app.c.hallStatusPills(now), /<img/, "line names are escaped");
  app.close();
});

test("Display hall: the tube closed overnight is routine, not a problem", async () => {
  const app = await hallApp("?display=hall");
  const s = app.c.state, now = HALL_START;
  s.nrStatus = [line("thameslink", "Thameslink", GOOD, "Good Service"), line("great-northern", "Great Northern", GOOD, "Good Service")];
  s.nrOkAt = s.statusAt = now - M;
  s.status = ["bakerloo", "central", "circle"].map((id) => line(id, id, 20, "Service Closed"));
  let row = app.c.hallStatusPills(now);
  assert.match(row, /Tube: closed for the night/); assert.doesNotMatch(row, /Tube: good service/);
  assert.doesNotMatch(row, /Service Closed/, "no line is named as a problem");
  s.status = [line("bakerloo", "Bakerloo", 20, "Service Closed"), line("central", "Central", GOOD, "Good Service"), line("victoria", "Victoria", GOOD, "Good Service")];
  row = app.c.hallStatusPills(now);
  assert.match(row, /Tube: good service · 1 closed/);
  s.status[1] = line("central", "Central", 2, "Suspended");
  assert.match(app.c.hallStatusPills(now), /Central: Suspended/, "a suspension is still a problem");
  app.close();
});

test("Display hall: the hall actually fetches every tube line, and the row shows the answer", async () => {
  const app = await hallApp("?display=hall");
  assert.ok(app.calls.some((u) => u.includes("/Line/Mode/tube/Status")), `the whole tube mode is fetched:\n${app.calls.join("\n")}`);
  assert.ok(!app.calls.some((u) => u.includes("/Line/circle,metropolitan,hammersmith-city/Status")), "not only the three lines");
  app.close();
});

test("Display hall: the board's times are the pick's, in whole minutes against the clock", async () => {
  const app = await hallApp("?display=hall");
  const now = HALL_START;
  app.c.state.fetchedAt = now - 2 * M;
  const list = app.c.ranked(now), j = list.filter((o) => o.recommended).sort((a, b) => a.recommended - b.recommended)[0];
  const html = app.c.hallBoardMarkup(list, now);
  const mins = Math.floor(j.leave / M) - Math.floor(now / M);
  assert.match(html, new RegExp(mins >= 1 ? `in ${mins} min` : "Leave now"));
  assert.match(html, new RegExp(`In London <b class="t">${hm(j.arrive)}</b>`), "the arrival, not the leave time");
  assert.match(html, /as of \d\d:\d\d/);
  assert.doesNotMatch(html, /not up to date/, "2 minutes old is still fresh");
  assert.doesNotMatch(html, /class="hb stale"/);
  app.close();
});

test("Display hall: every tube line's status in the same single request; the other displays keep their three lines", async () => {
  const h = await hallApp("?display=hall");
  assert.equal(h.c.TFL_STATUS_URL, "https://api.tfl.gov.uk/Line/Mode/tube/Status");
  h.close();
  for (const url of ["?display", "?display=next", ""]) {
    const a = await hallApp(url);
    assert.equal(a.c.TFL_STATUS_URL, "https://api.tfl.gov.uk/Line/circle,metropolitan,hammersmith-city/Status", url || "the app");
    assert.equal(a.c.DISPLAY_HALL, false);
    a.close();
  }
});

test("Display hall: an always-on screen stays inside its request budget, like the other displays", async () => {
  const start = HALL_START;
  const app = await hallApp("?display=hall", start);
  const atLoad = app.calls.length, perMinute = [];
  for (let i = 1; i <= 10; i++) {
    app.setNow(start + i * M);
    const before = app.calls.length;
    await app.c.refresh(); await sleep(30);
    const made = app.calls.slice(before);
    assert.ok(made.filter((u) => /\/board\//.test(u)).length <= 3, `minute ${i}: at most three boards\n${made.join("\n")}`);
    perMinute.push(made.length);
  }
  assert.ok(app.calls.every((u) => u.startsWith(PROXY)), "everything goes through the proxy");
  assert.ok(atLoad <= 8, `at load: ${atLoad}`);
  const total = perMinute.reduce((a, b) => a + b, 0);
  assert.ok(total <= 40, `under four requests a minute on average: ${perMinute.join(",")}`);
  app.close();
});

test("Display hall: whole minutes only, a few pixels' drift each minute, stale data greyed and said", async () => {
  const app = await hallApp("?display=hall");
  const list = app.c.ranked(HALL_START);
  const a = app.c.hallBoardMarkup(list, HALL_START + 5e3), b = app.c.hallBoardMarkup(list, HALL_START + 50e3);
  assert.equal(a, b, "nothing changes within a minute");
  assert.doesNotMatch(a, /translate/, "the drift moves the board, not its text");
  const board = app.d.querySelector("#hallBoard");
  app.c.renderHallBoard(list, HALL_START); const t0 = board.style.transform, h0 = board.innerHTML;
  app.c.renderHallBoard(list, HALL_START + M); const t1 = board.style.transform;
  assert.match(t0, /translate\(-?\dpx, ?-?\dpx\)/); assert.notEqual(t0, t1, "it moves each minute");
  board.innerHTML = "kept"; app.c.renderHallBoard(list, HALL_START + M + 5e3);
  assert.equal(board.innerHTML, "kept", "unchanged text isn't redrawn");
  board.innerHTML = h0;
  const spots = new Set();
  for (let i = 0; i < 7; i++) { const p = app.c.hallBoardSpot(HALL_START + i * M); spots.add(`${p.x},${p.y}`);
    assert.ok(Math.abs(p.x) <= 3 && Math.abs(p.y) <= 3, `only a few pixels: ${p.x},${p.y}`); }
  assert.ok(spots.size >= 6, `it does move: ${[...spots].join(" ")}`);
  app.c.state.fetchedAt = HALL_START - 4 * M;
  const stale = app.c.hallBoardMarkup(list, HALL_START);
  assert.match(stale, /class="hb stale"/); assert.match(stale, /not up to date/);
  const boards = app.c.state.boards; app.c.state.boards = null; app.c.state.loading = false;
  assert.match(app.c.hallBoardMarkup([], HALL_START), /No train data yet/);
  app.c.state.boards = boards;
  app.close();
});

test("Display hall: ?display, ?display=next and the normal app are unchanged", async () => {
  for (const url of ["?display", "?display=next"]) {
    const a = await hallApp(url);
    assert.equal(a.c.state.saved.mode, "commute", url);
    assert.ok(!a.d.documentElement.classList.contains("display-hall"), url);
    assert.ok(!visible(a, a.d.querySelector("#hallBoard")), `${url}: no hall board`);
    a.close();
  }
  const n = await hallApp("");
  assert.ok(!visible(n, n.d.querySelector("#hallBoard")));
  n.close();
});
