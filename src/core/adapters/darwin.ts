// National Rail Darwin departure board (LDBWS JSON) → trains.
import type { Board, Call, StationCode, Train } from "../types";
import { resolve } from "../time";

type Json = Record<string, unknown> | undefined | null;
const pick = (o: Json, ...ks: string[]): any => { for (const k of ks) { if (o && (o as any)[k] != null) return (o as any)[k]; } return undefined; };

function callingPoints(list: unknown): Json[] {
  const out: Json[] = [];
  ((list as Json[]) || []).forEach(g => { const cp = pick(g, "callingPoint", "CallingPoint"); if (Array.isArray(cp)) out.push(...cp); else if (g && (g as any).crs) out.push(g); });
  return out;
}

/** `toText` turns notice HTML into plain text (the screen supplies a safe parser). */
export function parseDarwinBoard(json: Json, from: StationCode, to: StationCode, now: number, toText: (h: string) => string): Board {
  const svcs: Json[] = pick(json, "trainServices", "TrainServices") || [];
  const msgs = ((pick(json, "nrccMessages", "NrccMessages") || []) as unknown[])
    .map(m => toText(typeof m === "string" ? m : pick(m as Json, "value", "Value", "xhtmlMessage"))).filter(Boolean);
  const services: Train[] = svcs.map(s => {
    const dep = resolve(pick(s, "std"), pick(s, "etd"), now);
    const after = callingPoints(pick(s, "subsequentCallingPoints"));
    const cp = after.find(c => String(pick(c, "crs") || "").toUpperCase() === to);
    const arr = cp ? resolve(pick(cp, "st"), pick(cp, "et"), now) : null;
    // Every stop from here to the destination, with the best known time at each.
    const calls: Call[] = [{ name: pick(json, "locationName") || from, code: from, t: dep ? dep.t : null }];
    for (const c of after) {
      const code = String(pick(c, "crs") || "").toUpperCase(), r = resolve(pick(c, "st"), pick(c, "et") || pick(c, "at"), now);
      const atv = pick(c, "at"); const actual = !!(atv && /^\d\d:\d\d$/.test(String(atv)));
      calls.push({ name: pick(c, "locationName") || code, code: code || null, t: r ? r.t : null, ...(actual ? { actual: true } : {}) });
      if (code === to) break;
    }
    const cancelled = pick(s, "isCancelled") === true || !!(dep && dep.cancelled) || !!(cp && (pick(cp, "isCancelled") === true || (arr && arr.cancelled)));
    return {
      from, to, std: pick(s, "std"), dep: dep ? dep.t : (null as unknown as number), depLate: dep ? dep.late : 0, depUnknown: !!(dep && dep.unknownDelay),
      arr: arr ? arr.t : null, arrLate: arr ? arr.late : 0, arrUnknown: !!(arr && arr.unknownDelay), platform: pick(s, "platform") ?? null,
      operator: pick(s, "operator") || "", cancelled, reason: pick(s, "cancelReason") || pick(s, "delayReason") || "",
      origin: ((pick(s, "origin") || [])[0] || {}).locationName || "",
      // A train that divides lists each part's destination ("Cambridge & Peterborough").
      destination: ((pick(s, "destination") || []) as Json[]).map(d => pick(d, "locationName")).filter(Boolean).join(" & ") || undefined,
      serviceId: pick(s, "serviceID", "serviceId") || undefined,
      calls: cp ? calls : undefined,
    };
  }).filter(x => x.dep != null);
  return { services, msgs };
}

/** Where a train has been reported, from Service Details. */
export interface ServiceProgress {
  last: { name: string; code: string | null; t: number; late: number } | null;   // last stop it was reported at
  next: { name: string; code: string | null; t: number | null } | null;          // next stop, expected time
  at: (code: string) => number | null;                                             // expected (or actual) time at a stop
  cancelled: boolean; reason: string;
}

/** LDBWS GetServiceDetails → progress. `at` values are actual times ("19:53"); "On time" means at the scheduled time. */
export function parseServiceDetails(json: Json, now: number): ServiceProgress {
  const prev = callingPoints(pick(json, "previousCallingPoints")), next = callingPoints(pick(json, "subsequentCallingPoints"));
  const here = { locationName: pick(json, "locationName"), crs: pick(json, "crs"), st: pick(json, "std", "sta"), at: pick(json, "atd", "ata"), et: pick(json, "etd", "eta") } as Json;
  const points = [...prev, here, ...next].filter((c) => c && pick(c, "crs"));
  let last: ServiceProgress["last"] = null, nextUp: ServiceProgress["next"] = null;
  const times: Record<string, number | null> = {};
  for (const c of points) {
    const code = String(pick(c, "crs")).toUpperCase(), st = pick(c, "st"), atv = pick(c, "at"), etv = pick(c, "et");
    const reported = atv && (/^\d\d:\d\d$/.test(String(atv)) || /^on time$/i.test(String(atv)));
    if (reported) {
      const r = resolve(st, /^on time$/i.test(String(atv)) ? "On time" : atv, now);
      if (r) { last = { name: pick(c, "locationName") || code, code, t: r.t, late: r.late }; times[code] = r.t; }
    } else {
      const r = resolve(st, etv, now);
      times[code] = r ? r.t : null;
      if (!nextUp) nextUp = { name: pick(c, "locationName") || code, code, t: r ? r.t : null };
    }
  }
  return { last, next: nextUp, at: (code) => times[code] ?? null,
    cancelled: pick(json, "isCancelled") === true, reason: pick(json, "cancelReason") || pick(json, "delayReason") || "" };
}
