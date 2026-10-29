// Loads the real built page (index.html) in jsdom with mocked network and location.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(path.join(ROOT, "index.html"), "utf8");

export const COORDS = {
  LET: "51.98002,-0.22909", KGX: "51.53197,-0.12341", STP: "51.53062,-0.12594", ZFD: "51.52036,-0.10514",
};
export const STATION_NAME = {
  LET: "Letchworth Garden City Rail Station", KGX: "London Kings Cross Rail Station",
  STP: "London St Pancras International Rail Station", ZFD: "Farringdon Rail Station",
};
const BY_COORD = Object.fromEntries(Object.entries(COORDS).map(([k, v]) => [v, k]));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
export const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
export const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const at = (day, time) => new Date(`${day}T${time}:00`).getTime();

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// A fetch that never answers until aborted, like a hung mobile connection.
export const hang = (opts) => new Promise((_, rej) => {
  const s = opts && opts.signal;
  if (s) s.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

// Parse a TfL Journey Planner request into {from, to, timeIs, t}.
export function parseJourneyUrl(u) {
  const m = /JourneyResults\/([^/]+)\/to\/([^?]+)\?.*timeIs=(\w+)&date=(\d{8})&time=(\d{4})/.exec(u);
  if (!m) return null;
  const d = m[4], h = m[5];
  return {
    from: BY_COORD[decodeURIComponent(m[1])], to: BY_COORD[decodeURIComponent(m[2])], timeIs: m[3],
    t: new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6), +h.slice(0, 2), +h.slice(2)).getTime(),
  };
}
// One direct national-rail journey in TfL's shape.
export function tflJourney(from, to, dep, arr, summary) {
  return { legs: [{ mode: { id: "national-rail" }, departureTime: iso(dep), arrivalTime: iso(arr),
    departurePoint: { commonName: STATION_NAME[from] }, arrivalPoint: { commonName: STATION_NAME[to] },
    instruction: { summary: summary || (from === "ZFD" || to === "ZFD" || from === "STP" || to === "STP" ? "Thameslink" : "Great Northern") } }] };
}
// TfL timetable mock: trains every `every` minutes, `mins` long; Departing returns the next 3.
export function tflTimetable({ every = 30, mins = 30, offset = 10 } = {}) {
  return (q) => {
    const first = Math.ceil((q.t - offset * 60e3) / (every * 60e3)) * every * 60e3 + offset * 60e3;
    const deps = q.timeIs === "Departing" ? [0, 1, 2].map((i) => first + i * every * 60e3)
      : [1, 2, 3].map((i) => first - i * every * 60e3);
    return { journeys: deps.map((dep) => tflJourney(q.from, q.to, dep, dep + mins * 60e3)) };
  };
}

// Location fixtures.
export const NEAR_LETCHWORTH = { coords: { latitude: 51.975, longitude: -0.23, accuracy: 12 } };
export const TEST_HOME = [51.975, -0.23];
export const IN_LONDON = { coords: { latitude: 51.515, longitude: -0.08, accuracy: 30 } };

// Every page made in a test; closeAll() stops their timers even when a test fails.
const open = [];
export const closeAll = () => { while (open.length) open.pop().close(); };

export async function createApp({ settings = { provider: "tfl" }, saved = {}, geo = NEAR_LETCHWORTH, geoDelay = 20,
  journeys = tflTimetable(), route = null, timeoutMs = 300, settle = 400, now = null, relocateMs = 0 } = {}) {
  const calls = [];
  const clock = { t: now };
  let pendingGeo = null;   // frozen clock; tests move it with app.setNow()
  const errors = [];
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://srapley-spec.github.io/cartref-commute/",
    beforeParse(w) {
      w.COMMUTE_FETCH_TIMEOUT_MS = timeoutMs;
      if (relocateMs != null) w.COMMUTE_RELOCATE_MS = relocateMs;   // tests swap the location source and expect a restart
      // Frozen clock (golden tests): every Date in the page reads `now`, so output is the same on every run.
      if (now != null) {
        const D = w.Date;
        class FrozenDate extends D { constructor(...a) { if (a.length) super(...a); else super(clock.t); } static now() { return clock.t; } }
        w.Date = FrozenDate;
      } else {
        // Otherwise the page follows the test run's virtual clock (tests/clock.mjs).
        const D = w.Date;
        class VirtualDate extends D { constructor(...a) { if (a.length) super(...a); else super(globalThis.Date.now()); } static now() { return globalThis.Date.now(); } }
        w.Date = VirtualDate;
      }
      // The test persona lives at NEAR_LETCHWORTH (home set in Settings), unless a test says otherwise (home: null).
      w.localStorage.setItem("cartrefCommute.v1", JSON.stringify(Object.assign({ mode: "commute", dirMode: "auto", pace: "avg", settings, home: TEST_HOME }, saved)));
      w.addEventListener("error", (e) => errors.push(e.message));
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
      Object.defineProperty(w.navigator, "geolocation", { value: {
        watchPosition(ok, err) {
          // geoDelay "manual": nothing until the test calls app.giveLocation() (no timing race under load).
          if (geoDelay === "manual") { pendingGeo = () => ok(geo); return 1; }
          setTimeout(() => { if (geo === "denied") err({ code: 1 }); else if (geo) ok(geo); }, geoDelay);
          return 1;
        },
        clearWatch() {},
      } });
      w.fetch = async (u, opts) => {
        calls.push(u);
        if (route) { const r = await route(u, opts); if (r !== undefined) return r; }
        const q = parseJourneyUrl(u);
        if (q) return json(journeys(q));
        if (/Line\/circle/.test(u)) return json([]);
        if (/national-rail\/Status/.test(u)) return json([]);
        return json({}, 404);
      };
    },
  });
  open.push(dom.window);
  await sleep(settle);
  const w = dom.window;
  return { dom, w, d: w.document, c: w.__commute, calls, errors, json,
    text: (sel) => (w.document.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim(),
    rows: () => [...w.document.querySelectorAll("#list .row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
    banners: () => [...w.document.querySelectorAll("#banners .banner")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
    setNow: (t) => { clock.t = t; },
    giveLocation: () => { if (pendingGeo) pendingGeo(); },
    close: () => w.close() };
}
export { json };
