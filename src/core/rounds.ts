// Searching in rounds, shared by the commute (search.ts, one at a time) and Trip (several at once).
// Every item gets its round-1 request before any gets a round-2 one, so a refusal can never silently leave an
// item out. A refusal, timeout or network failure stops further requests: at once when one at a time; from the
// next round when several are in flight (those already sent complete).
export interface RoundError extends Error { rateLimited?: boolean; timeout?: boolean; network?: boolean; refused?: boolean }
export const stopsRequests = (e: RoundError) => !!(e && (e.rateLimited || e.timeout || e.network || e.refused));
/** A round asks for at most one request per item (or null), decided just before it is sent. */
export type RoundOf<K, Q> = (item: K) => Q | null;
export interface RoundsResult<K> { ok: Set<K>; why: Map<K, string>; stopped: string | null; requests: number }

export async function runRounds<K, Q>(items: K[], rounds: RoundOf<K, Q>[], exec: (item: K, q: Q) => Promise<void>,
  opts: { concurrency?: number; maxRequests?: number } = {}): Promise<RoundsResult<K>> {
  const conc = Math.max(1, opts.concurrency || 1), max = opts.maxRequests ?? Infinity;
  const ok = new Set<K>(), why = new Map<K, string>();
  let stopped: string | null = null, requests = 0;
  const one = async (k: K, q: Q) => {
    requests++;
    try { await exec(k, q); ok.add(k); }
    catch (e) { const err = e as RoundError; why.set(k, err.message); if (stopsRequests(err) && !stopped) stopped = err.message; }
  };
  for (const round of rounds) {
    if (conc === 1) {
      for (const k of items) {
        if (stopped) { if (!why.has(k)) why.set(k, stopped); continue; }
        if (requests >= max) break;
        const q = round(k); if (q == null) continue;
        await one(k, q);
      }
    } else {
      if (stopped) { items.forEach(k => { if (!why.has(k)) why.set(k, stopped as string); }); continue; }
      const batch: [K, Q][] = [];
      for (const k of items) { if (requests + batch.length >= max) break; const q = round(k); if (q != null) batch.push([k, q]); }
      for (let i = 0; i < batch.length; i += conc) await Promise.all(batch.slice(i, i + conc).map(([k, q]) => one(k, q)));
    }
  }
  return { ok, why, stopped, requests };
}
