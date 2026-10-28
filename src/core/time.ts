// Times and formatting. Local time throughout (the phone's time zone).

export const pad = (n: number): string => String(n).padStart(2, "0");
export const hhmm = (t: number): string => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
export const mins = (ms: number): number => Math.round(ms / 60000);
export const isoDay = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function dur(ms: number): string {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m} min`;
}
export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${pad(s % 60)}s`;
}

/** "HH:MM" → epoch ms nearest to `now` (handles midnight either way). */
export function clock(str: string | null | undefined, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(str || ""); if (!m) return null;
  const d = new Date(now); d.setHours(+m[1], +m[2], 0, 0); let t = d.getTime();
  if (t - now < -6 * 3600e3) t += 86400e3; else if (t - now > 18 * 3600e3) t -= 86400e3;
  return t;
}

export interface Resolved { t: number; late: number; cancelled?: boolean; unknownDelay?: boolean; }
/** A scheduled time plus a live estimate ("On time", "08:12", "Delayed", "Cancelled"). */
export function resolve(sched: string | null | undefined, est: string | null | undefined, now: number): Resolved | null {
  const base = clock(sched, now); if (base == null) return null;
  const e = String(est || "");
  if (/cancel/i.test(e)) return { t: base, late: 0, cancelled: true };
  if (/delay/i.test(e)) return { t: base, late: 0, unknownDelay: true };
  const et = clock(e, now); if (et != null) return { t: et, late: Math.max(0, mins(et - base)) };
  return { t: base, late: 0 };
}
