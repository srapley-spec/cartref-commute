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
      calls.push({ name: pick(c, "locationName") || code, code: code || null, t: r ? r.t : null });
      if (code === to) break;
    }
    const cancelled = pick(s, "isCancelled") === true || !!(dep && dep.cancelled) || !!(cp && (pick(cp, "isCancelled") === true || (arr && arr.cancelled)));
    return {
      from, to, std: pick(s, "std"), dep: dep ? dep.t : (null as unknown as number), depLate: dep ? dep.late : 0, depUnknown: !!(dep && dep.unknownDelay),
      arr: arr ? arr.t : null, arrLate: arr ? arr.late : 0, arrUnknown: !!(arr && arr.unknownDelay), platform: pick(s, "platform") ?? null,
      operator: pick(s, "operator") || "", cancelled, reason: pick(s, "cancelReason") || pick(s, "delayReason") || "",
      origin: ((pick(s, "origin") || [])[0] || {}).locationName || "",
      calls: cp ? calls : undefined,
    };
  }).filter(x => x.dep != null);
  return { services, msgs };
}
