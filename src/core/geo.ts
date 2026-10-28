import type { LatLon } from "./types";

/** Great-circle distance in km. */
export function km(a: LatLon, b: LatLon): number {
  const R = 6371, r = (x: number) => x * Math.PI / 180;
  const dl = r(b[0] - a[0]), dn = r(b[1] - a[1]);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** How far along a line (0 = first point, 1 = last) a point is, and how far off the line (km). */
export function lineProgress(pt: LatLon, line: LatLon[]): { frac: number; offKm: number } {
  const c = Math.cos(pt[0] * Math.PI / 180), xy = (q: LatLon): [number, number] => [q[1] * 111.32 * c, q[0] * 110.57];
  const P = xy(pt); let total = 0; let best = { off: 1e9, at: 0 }; const seg: number[] = [];
  for (let i = 0; i < line.length - 1; i++) { const d = km(line[i], line[i + 1]); seg.push(d); total += d; }
  let run = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const A = xy(line[i]), B = xy(line[i + 1]), dx = B[0] - A[0], dy = B[1] - A[1], len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (len2 || 1)));
    const off = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
    if (off < best.off) best = { off, at: run + t * seg[i] };
    run += seg[i];
  }
  return { frac: total ? best.at / total : 0, offKm: best.off };
}

/**
 * Where a train is along `line` (0 = first point, 1 = last), from where it was last reported and the next stop:
 * between the two in proportion to time. Not yet departed: at its origin. Unknown stations: null.
 */
export function reportedFrac(last: { code: string | null; t: number } | null, next: { code: string | null; t: number | null } | null,
    origin: string, now: number, line: LatLon[], geo: Record<string, LatLon>): number | null {
  const f = (code: string | null) => (code && geo[code] ? lineProgress(geo[code], line).frac : null);
  if (!last) return f(origin);
  const a = f(last.code); if (a == null) return null;
  if (!next || next.t == null) return a;
  const b = f(next.code); if (b == null) return a;
  if (now >= next.t || next.t <= last.t) return b;
  return a + (b - a) * Math.max(0, Math.min(1, (now - last.t) / (next.t - last.t)));
}
