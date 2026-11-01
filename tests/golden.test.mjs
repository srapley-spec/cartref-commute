// Golden (characterisation) tests: for a fixed set of situations at a frozen clock, record exactly what the app
// requests and shows, and fail on any difference. They pin today's behaviour so a refactor can't change it silently.
// After an intentional change: UPDATE_GOLDEN=1 npm test, then review the diff in tests/golden/*.json before committing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, json, sleep, closeAll, parseJourneyUrl, NEAR_LETCHWORTH } from "./harness.mjs";
import { services, tflResponder, darwinResponder, serviceDetailsResponder } from "./golden/feeds.mjs";

after(closeAll);
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const DAY = "2026-11-03", PREV = "2026-11-02", NEXT = "2026-11-04";   // a Tuesday in Hertfordshire term time
const T = (d, h) => new Date(`${d}T${h}:00`).getTime() + 5e3;
const pad = (n) => String(n).padStart(2, "0");
const hm = (t) => { if (t == null) return null; const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

const PLACES = {
  nearLetchworth: NEAR_LETCHWORTH,
  office: { coords: { latitude: 51.5139, longitude: -0.0710, accuracy: 10 } },
  kingsCross: { coords: { latitude: 51.5309, longitude: -0.1236, accuracy: 15 } },
  soho: { coords: { latitude: 51.5130, longitude: -0.1350, accuracy: 20 } },
  oxfordCircus: { coords: { latitude: 51.5154, longitude: -0.1410, accuracy: 20 } },
  aldgateEast: { coords: { latitude: 51.5141, longitude: -0.0745, accuracy: 20 } },
  knebworth: { coords: { latitude: 51.8667, longitude: -0.1876, accuracy: 30, speed: 30 } },   // moving: about 108 km/h
};
const RDM = { provider: "rdm", rdmKey: "k", rdmBase: "https://darwin.test/LDBWS/api/20220120", rdmSdBase: "https://darwin.test/SD/LDBWS/api/20220120", tflKey: "k" };

const status = (id, name, sev = 10, desc = "Good Service", reason) => ({ id, name, lineStatuses: [{ statusSeverity: sev, statusSeverityDescription: desc, reason }] });
function tubeArrivals(now) {
  const a = (lineId, platformName, dest, mins) => ({ vehicleId: `${lineId[0]}${mins}`, lineId, platformName, destinationName: dest, expectedArrival: new Date(now + mins * 60e3).toISOString(), timeToStation: mins * 60 });
  return [a("circle", "Eastbound - Platform 2", "Edgware Road (Circle Line) Underground Station", 2), a("metropolitan", "Westbound - Platform 1", "Uxbridge Underground Station", 4),
    a("metropolitan", "Eastbound - Platform 2", "Aldgate Underground Station", 8), a("circle", "Eastbound - Platform 2", "Edgware Road (Circle Line) Underground Station", 12)];
}

// Westbound tubes leaving Aldgate (towards Farringdon and King's Cross), plus an eastbound one that must be ignored.
function aldgateDepartures(now) {
  const a = (lineId, platformName, dest, mins) => ({ vehicleId: `${lineId[0]}${mins}`, lineId, platformName, destinationName: dest, expectedArrival: new Date(now + mins * 60e3).toISOString(), timeToStation: mins * 60 });
  return [a("metropolitan", "Westbound - Platform 1", "Uxbridge Underground Station", 4), a("circle", "Westbound - Platform 2", "Hammersmith (H&C Line) Underground Station", 7),
    a("metropolitan", "Westbound - Platform 1", "Amersham Underground Station", 11), a("circle", "Eastbound - Platform 3", "Tower Hill Underground Station", 2),
    a("circle", "Westbound - Platform 2", "Hammersmith (H&C Line) Underground Station", 16)];
}
async function scenario(name, { now, geo, settings, saved = {}, disrupt = {}, tubeClosed = false, extra, steps = [] }) {
  const svcs = [...services(PREV, disrupt), ...services(DAY, disrupt), ...services(NEXT, disrupt)];
  const tfl = tflResponder(svcs), darwin = darwinResponder(svcs, () => now), details = serviceDetailsResponder(svcs, () => now);
  const route = (u) => {
    const x = extra && extra(u, now); if (x !== undefined) return x;
    if (/darwin\.test\/SD\//.test(u)) { const d = details(u); return d ? json(d) : json({}, 404); }
    if (/darwin\.test/.test(u)) { const b = darwin(u); return b ? json(b) : json({}, 404); }
    if (/Line\/circle/.test(u)) return json(tubeClosed
      ? [status("circle", "Circle", 20, "Service Closed"), status("metropolitan", "Metropolitan", 20, "Service Closed"), status("hammersmith-city", "Hammersmith & City")]
      : [status("circle", "Circle"), status("metropolitan", "Metropolitan"), status("hammersmith-city", "Hammersmith & City")]);
    if (/national-rail\/Status/.test(u)) return json([status("great-northern", "Great Northern"), status("thameslink", "Thameslink")]);
    if (/StopPoint\/940GZZLUKSX\/Arrivals/.test(u)) return json(tubeArrivals(now));
    if (/StopPoint\/940GZZLUALD\/Arrivals/.test(u)) return json(aldgateDepartures(now));
    const q = parseJourneyUrl(u); if (q && q.from && q.to) return json(tfl(q));
    return undefined;
  };
  const app = await createApp({ now, geo, settings, saved: { pace: "avg", ...saved }, route, settle: 700 });
  const c = app.c, out = {};
  const snap = () => ({
    dirNote: app.text("#dirNote"), context: app.text("#signalContextSummary"), lineStatus: app.text("#signalCurrentLines"), statusSummary: app.text("#signalStatus"), significantDisruptions: app.text("#signalDisruptions"), banners: app.banners(), hero: app.text("#hero"), rows: app.rows(),
    diag: app.d.querySelector("#diag")?.hidden ? null : app.text("#diagBody"),
  });
  out.load = snap();
  // Every Leave now option in full: times, steps and flags.
  try {
    out.options = JSON.parse(JSON.stringify(c.ranked(now).map((j) => ({ hub: j.hub, train: `${j.train.std} ${j.train.operator} ${j.train.from}-${j.train.to}`,
      leave: hm(j.leave), arrive: hm(j.arrive), missed: !!j.missed, uncertain: !!j.uncertain, recommended: j.recommended || 0,
      alts: (j.alts || []).map((a) => `${a.hub} ${hm(a.train.dep)} leave ${hm(a.leave)}${a.missed ? " missed" : ""}`),
      flags: j.flags.map((f) => `${f.lvl}: ${f.txt}`), legs: (j.legs || []).map((l) => `${hm(l.t) || "-"} ${l.d}${l.note ? ` · ${l.note}` : ""}`) }))));
  } catch (e) { out.options = `error: ${e.message}`; }
  for (const [label, act] of steps) { await act(app); await sleep(700); out[label] = snap(); }
  out.requests = app.calls.map((u) => u.replace(/app_key=[^&]+/, "app_key=K")).sort();
  out.errors = app.errors;
  app.close();
  const file = path.join(DIR, `${name}.json`);
  if (UPDATE || !existsSync(file)) { writeFileSync(file, JSON.stringify(out, null, 1) + "\n"); return; }
  assert.deepEqual(out, JSON.parse(readFileSync(file, "utf8")), `${name} differs from tests/golden/${name}.json`);
}
const view = (v, day, time) => async (app) => {
  app.d.querySelector(`[data-view="${v}"]`).click(); await sleep(100);
  if (day) { app.d.querySelector("#byDate").value = day; app.d.querySelector("#byTime").value = time;
    app.d.querySelector("#byTime").dispatchEvent(new app.w.Event("change")); }
};
const click = (sel) => async (app) => { app.d.querySelector(sel).click(); };

// ---------- To work ----------
test("golden: morning near Letchworth, timetable, no TfL key", () => scenario("office-morning-tfl-keyless",
  { now: T(DAY, "07:00"), geo: PLACES.nearLetchworth, settings: { provider: "tfl" } }));
test("golden: morning near Letchworth, timetable with key, fast pace; Arrive by and Leave around", () => scenario("office-morning-tfl-keyed",
  { now: T(DAY, "07:00"), geo: PLACES.nearLetchworth, settings: { provider: "tfl", tflKey: "k" }, saved: { pace: "fast" },
    steps: [["arriveBy0830", view("by", DAY, "08:30")], ["leaveAround0745", view("at", DAY, "07:45")], ["arriveByTomorrow", view("by", NEXT, "09:00")]] }));
test("golden: the evening before, Arrive by 08:30 tomorrow", () => scenario("office-arrive-by-tomorrow",
  { now: T(PREV, "20:00"), geo: PLACES.nearLetchworth, settings: { provider: "tfl", tflKey: "k" }, saved: { dirMode: "office" },
    steps: [["arriveBy", view("by", DAY, "08:30")]] }));
test("golden: morning near Letchworth, live, with a delay and the standing-room rule", () => scenario("office-morning-live",
  { now: T(DAY, "07:00"), geo: PLACES.nearLetchworth, settings: RDM,
    disrupt: { "Great Northern 07:38 from LET": { late: 4, reason: "This train has been delayed by a signalling problem" } },
    steps: [["arriveBy0830", view("by", DAY, "08:30")], ["leaveAround0740", view("at", DAY, "07:40")]] }));
test("golden: Circle and Met closed: Aldgate East fallback", () => scenario("office-aldgate-closed",
  { now: T(DAY, "07:00"), geo: PLACES.nearLetchworth, settings: { provider: "tfl", tflKey: "k" }, tubeClosed: true }));
test("golden: on the train near Knebworth (the 07:08 is reported passing; the 07:20 hasn't left)", () => scenario("office-on-train-live",
  { now: T(DAY, "07:19"), geo: PLACES.knebworth, settings: RDM, saved: { dirMode: "office" },
    disrupt: { "Thameslink 07:20 from LET": { late: 3, reason: "This train has been delayed by a late running train in front" } } }));
test("golden: on the train, no train fits where National Rail reports them: asks which train", () => scenario("office-on-train-no-fit",
  { now: T(DAY, "07:25"), geo: PLACES.knebworth, settings: RDM, saved: { dirMode: "office" },
    disrupt: { "Thameslink 07:20 from LET": { late: 3, reason: "This train has been delayed by a late running train in front" } } }));
test("golden: at King's Cross in the morning: which tube", () => scenario("office-at-kings-cross",
  { now: T(DAY, "08:05"), geo: PLACES.kingsCross, settings: RDM, saved: { trip: { dir: "office", at: T(DAY, "07:20") } } }));
test("golden: walking from Aldgate East to the office", () => scenario("office-walking",
  { now: T(DAY, "08:20"), geo: PLACES.aldgateEast, settings: RDM, saved: { dirMode: "office" } }));
test("golden: elsewhere in London on the way to work", () => scenario("office-in-london",
  { now: T(DAY, "09:00"), geo: PLACES.oxfordCircus, settings: RDM, saved: { dirMode: "office" },
    extra: (u, now) => /JourneyResults\/51\.5\d+,-0\.1\d+\/to\/51\.5139,-0\.071/.test(u)
      ? json({ journeys: [{ arrivalDateTime: new Date(now + 25 * 60e3).toISOString(), legs: [{ mode: { id: "walking" }, duration: 5 }, { mode: { id: "tube" }, duration: 15, routeOptions: [{ name: "Central" }] }] }] })
      : undefined }));

// ---------- Home ----------
test("golden: evening at the office, timetable with key; Leave around, Arrive by", () => scenario("home-evening-tfl-keyed",
  { now: T(DAY, "16:30"), geo: PLACES.office, settings: { provider: "tfl", tflKey: "k" },
    steps: [["leaveAround1740", view("at", DAY, "17:40")], ["arriveBy1830", view("by", DAY, "18:30")], ["leaveAroundTomorrow", view("at", NEXT, "17:40")], ["backToNow", view("now")]] }));
test("golden: evening at the office, fast pace, live", () => scenario("home-evening-fast-live",
  { now: T(DAY, "17:30"), geo: PLACES.office, settings: RDM, saved: { pace: "fast" } }));
test("golden: evening at the office, timetable without key", () => scenario("home-evening-tfl-keyless",
  { now: T(DAY, "16:30"), geo: PLACES.office, settings: { provider: "tfl" } }));
test("golden: evening at the office, live, with cancellations and a delay; every planning view", () => scenario("home-evening-live",
  { now: T(DAY, "16:30"), geo: PLACES.office, settings: RDM,
    disrupt: { "Thameslink 17:26 from ZFD": { cancelled: true, reason: "This train has been cancelled because of a shortage of train crew" },
               "Great Northern 17:18 from KGX": { late: 6, reason: "This train has been delayed by a signal failure" } },
    steps: [["leaveAround1715", view("at", DAY, "17:15")], ["leaveAround1800", view("at", DAY, "18:00")], ["arriveBy1800", view("by", DAY, "18:00")],
            ["arriveBy1945", view("by", DAY, "19:45")], ["arriveByTomorrow", view("by", NEXT, "09:30")], ["backToNow", view("now")],
            ["toOfficeToggle", click('[data-dir="office"]')], ["autoAgain", click('[data-dir="auto"]')]] }));
test("golden: at King's Cross in the evening, live", () => scenario("home-at-kings-cross-live",
  { now: T(DAY, "17:00"), geo: PLACES.kingsCross, settings: RDM, saved: { officeVisit: DAY } }));
test("golden: live feed refuses the key: falls back to the timetable", () => scenario("home-live-refused",
  { now: T(DAY, "16:30"), geo: PLACES.office, settings: RDM, extra: (u) => (/darwin\.test/.test(u) ? json({}, 401) : undefined) }));

// ---------- Leisure and demo ----------
test("golden: leisure, to London from near Letchworth", () => scenario("leisure-to-london",
  { now: T(DAY, "10:00"), geo: PLACES.nearLetchworth, settings: { provider: "tfl", tflKey: "k" }, saved: { mode: "leisure" } }));
test("golden: leisure, home from Soho via the TfL journey planner", () => scenario("leisure-home",
  { now: T(DAY, "15:00"), geo: PLACES.soho, settings: { provider: "tfl", tflKey: "k" }, saved: { mode: "leisure", dirMode: "home" },
    extra: (u, now) => {
      const m = /JourneyResults\/[^/]+\/to\/(940GZZLU\w+)/.exec(u); if (!m) return undefined;
      const far = m[1] === "940GZZLUFCN";
      return json({ journeys: [{ arrivalDateTime: new Date(now + (far ? 21 : 18) * 60e3).toISOString(), duration: far ? 21 : 18,
        legs: [{ mode: { id: "walking" }, duration: 5 }, { mode: { id: far ? "bus" : "tube", name: far ? "bus" : "tube" }, duration: far ? 12 : 9, routeOptions: [{ name: far ? "341" : "Northern" }],
          isDisrupted: !far, disruptions: far ? [] : [{ description: "Northern line: minor delays." }] }, { mode: { id: "walking" }, duration: 4 }] }] });
    } }));
test("golden: demo trains", () => scenario("demo", { now: T(DAY, "07:00"), geo: PLACES.nearLetchworth, settings: { provider: "demo" } }));
test("golden: on your way to Letchworth (home saved 1.6 km out, 550 m from the station), live", () => scenario("on-your-way-live",
  { now: T(DAY, "07:10"), geo: { coords: { latitude: 51.9760, longitude: -0.2340, accuracy: 10 } }, settings: RDM, saved: { dirMode: "office", home: [51.9690, -0.2440] } }));
// Effort levels (Settings → Experimental) on: running late at home, every train graded; Arrive by and Leave around.
test("golden: effort levels on: at home and late for the 07:38, live; Arrive by 08:30 and Leave around 07:40", () => scenario("effort-levels-live",
  { now: T(DAY, "07:20"), geo: PLACES.nearLetchworth, settings: { ...RDM, effort: true }, saved: { dirMode: "office" },
    disrupt: { "Great Northern 07:38 from LET": { late: 4, reason: "This train has been delayed by a signalling problem" } },
    steps: [["arriveBy0830", view("by", DAY, "08:30")], ["leaveAround0740", view("at", DAY, "07:40")]] }));
test("golden: effort levels on: on your way to Letchworth, live", () => scenario("effort-levels-on-your-way",
  { now: T(DAY, "07:14"), geo: { coords: { latitude: 51.9760, longitude: -0.2340, accuracy: 10 } }, settings: { ...RDM, effort: true }, saved: { dirMode: "office", home: [51.9690, -0.2440] } }));
