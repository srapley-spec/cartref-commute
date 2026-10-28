// A deterministic railway for golden tests: one day's Great Northern and Thameslink services between
// London and Letchworth, with stops, served as TfL Journey Planner and Darwin (Rail Data Marketplace) responses.
import { COORDS } from "../harness.mjs";

const pad = (n) => String(n).padStart(2, "0");
const BY_COORD = Object.fromEntries(Object.entries(COORDS).map(([k, v]) => [v, k]));
const NAME = { KGX: "London Kings Cross", STP: "London St Pancras (Intl)", ZFD: "Farringdon", LET: "Letchworth Garden City",
  FPK: "Finsbury Park", SVG: "Stevenage", HIT: "Hitchin" };
const TFL_NAME = { KGX: "London Kings Cross Rail Station", STP: "London St Pancras International Rail Station", ZFD: "Farringdon Rail Station",
  LET: "Letchworth Garden City Rail Station", FPK: "Finsbury Park Rail Station", SVG: "Stevenage Rail Station", HIT: "Hitchin Rail Station" };

// Patterns: minutes past each hour, and stops with minutes after departure.
const PATTERNS = [
  // To Letchworth
  { op: "Great Northern", origin: "London Kings Cross", mins: [18, 48], stops: [["KGX", 0], ["FPK", 6], ["SVG", 20], ["HIT", 24], ["LET", 28]] },
  { op: "Great Northern", origin: "London Kings Cross", mins: [6, 36], stops: [["KGX", 0], ["FPK", 8], ["SVG", 38], ["HIT", 47], ["LET", 55]] },
  { op: "Thameslink", origin: "Brighton", mins: [26, 56], stops: [["ZFD", 0], ["STP", 5], ["FPK", 12], ["SVG", 33], ["HIT", 38], ["LET", 43]] },
  // To London
  { op: "Great Northern", origin: "Cambridge", mins: [8, 38], stops: [["LET", 0], ["HIT", 4], ["SVG", 9], ["FPK", 23], ["KGX", 29]] },
  { op: "Great Northern", origin: "Letchworth Garden City", mins: [0, 30], stops: [["LET", 0], ["HIT", 6], ["SVG", 16], ["FPK", 44], ["KGX", 52]] },
  { op: "Thameslink", origin: "Cambridge", mins: [20, 50], stops: [["LET", 0], ["HIT", 5], ["SVG", 10], ["FPK", 32], ["STP", 39], ["ZFD", 44]] },
];

/** Every service on `day` (YYYY-MM-DD), 05:00–23:59, as {op, origin, calls:[{crs, t}]}. Disruptions by "OP HH:MM from CRS". */
export function services(day, disrupt = {}) {
  const base = new Date(`${day}T00:00:00`).getTime(), out = [];
  for (const p of PATTERNS) for (let h = 5; h <= 23; h++) for (const m of p.mins) {
    const dep = base + (h * 60 + m) * 60e3;
    const key = `${p.op} ${pad(h)}:${pad(m)} from ${p.stops[0][0]}`;
    out.push({ op: p.op, origin: p.origin, key, day, calls: p.stops.map(([crs, d]) => ({ crs, t: dep + d * 60e3 })), ...(disrupt[key] || {}) });
  }
  return out.sort((a, b) => a.calls[0].t - b.calls[0].t);
}
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const idx = (s, crs) => s.calls.findIndex((c) => c.crs === crs);
const runs = (s, a, b) => idx(s, a) >= 0 && idx(s, b) > idx(s, a);

/** TfL Journey Planner: {from,to,timeIs,t} → journeys. From King's Cross coordinates TfL also offers St Pancras trains. */
export function tflResponder(svcs) {
  return (q) => {
    if (!q.from || !q.to) return { journeys: [] };
    const starts = q.from === "KGX" ? ["KGX", "STP"] : [q.from];
    const ends = q.to === "KGX" ? ["KGX", "STP"] : [q.to];
    const found = [];
    for (const s of svcs) for (const a of starts) for (const b of ends) if (runs(s, a, b)) {
      if (s.cancelled) continue;
      found.push({ s, a, b, dep: s.calls[idx(s, a)].t, arr: s.calls[idx(s, b)].t });
    }
    const pick = q.timeIs === "Arriving" ? found.filter((x) => x.arr <= q.t).sort((x, y) => x.arr - y.arr).slice(-3)
      : found.filter((x) => x.dep >= q.t).sort((x, y) => x.dep - y.dep).slice(0, 3);
    const journeys = pick.map(({ s, a, b, dep, arr }) => ({ legs: [{ mode: { id: "national-rail" },
      departureTime: iso(dep), scheduledDepartureTime: iso(dep), arrivalTime: iso(arr),
      departurePoint: { commonName: TFL_NAME[a] }, arrivalPoint: { commonName: TFL_NAME[b] },
      instruction: { summary: `${s.op} to ${q.to === "LET" ? "Cambridge" : "London"}` },
      path: { stopPoints: s.calls.slice(idx(s, a), idx(s, b) + 1).map((c) => ({ name: TFL_NAME[c.crs] })) } }] }));
    // Farringdon searches also return one journey with a change of train (dropped, and explained).
    if (q.from === "ZFD" && journeys.length) journeys.push({ legs: [{ mode: { id: "national-rail" } }, { mode: { id: "national-rail" } }] });
    return { journeys };
  };
}

/** Darwin GetDepBoardWithDetails. The window reaches 120 min from now whatever the offset (as seen on the real feed). */
export function darwinResponder(svcs, nowFn) {
  return (u) => {
    const m = /GetDepBoardWithDetails\/([A-Z]{3})\?(.*)$/.exec(u); if (!m) return null;
    const from = m[1], qs = new URLSearchParams(m[2]), to = qs.get("filterCrs");
    const now = nowFn(), off = Number(qs.get("timeOffset") || 0);
    const lo = now + off * 60e3, hi = now + 120 * 60e3;
    const list = svcs.filter((s) => runs(s, from, to) && s.calls[idx(s, from)].t >= lo && s.calls[idx(s, from)].t <= hi).slice(0, 10);
    return { locationName: NAME[from], nrccMessages: [], trainServices: list.map((s) => {
      const i = idx(s, from), late = s.late || 0, et = (t) => (s.cancelled ? "Cancelled" : late ? hm(t + late * 60e3) : "On time");
      return { serviceID: serviceId(s), std: hm(s.calls[i].t), etd: et(s.calls[i].t), platform: s.platform?.[from] ?? (from === "ZFD" ? "4" : from === "STP" ? "B" : from === "LET" ? "2" : "9"),
        operator: s.op, origin: [{ locationName: s.origin }], isCancelled: !!s.cancelled, cancelReason: s.cancelled ? s.reason : undefined,
        delayReason: !s.cancelled && late ? s.reason : undefined,
        subsequentCallingPoints: [{ callingPoint: s.calls.slice(i + 1).map((c) => ({ locationName: NAME[c.crs], crs: c.crs, st: hm(c.t), et: et(c.t) })) }] };
    }) };
  };
}

const serviceId = (s) => (s.day + s.key).replace(/[^A-Za-z0-9]/g, "");   // unique per day, like real service IDs

/** Darwin GetServiceDetails: stops already passed are reported (actual times, with any delay); the rest expected. */
export function serviceDetailsResponder(svcs, nowFn) {
  return (u) => {
    const m = /GetServiceDetails\/([A-Za-z0-9]+)/.exec(u); if (!m) return null;
    const s = svcs.find((x) => serviceId(x) === m[1]); if (!s) return null;
    const now = nowFn(), late = s.late || 0;
    const pt = (c) => {
      const t = c.t + late * 60e3, passed = t <= now;
      return { locationName: NAME[c.crs], crs: c.crs, st: hm(c.t), ...(passed ? { at: late ? hm(t) : "On time" } : { et: late ? hm(t) : "On time" }) };
    };
    const pts = s.calls.map(pt);
    return { locationName: pts[0].locationName, crs: pts[0].crs, operator: s.op, isCancelled: !!s.cancelled, delayReason: late ? s.reason : undefined,
      previousCallingPoints: [], subsequentCallingPoints: [{ callingPoint: pts.slice(1) }], std: pts[0].st, ...(pts[0].at ? { atd: pts[0].at } : { etd: pts[0].et }) };
  };
}
