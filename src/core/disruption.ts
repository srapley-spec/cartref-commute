// One disruption policy for grading trains, route warnings and prominent service alerts.
// Inputs are observations and explicit configuration; there is no DOM, clock or routing here.
import type { RailWarnings, LineStatus } from './warnings';
import type { Train } from './types';

export interface DisruptionPolicy {
  rail: { warnMin: number; badMin: number; lookbackMin: number; affectedTrainCount: number };
  tube: { closedSeverities: readonly number[]; significantSeverities: readonly number[]; goodSeverities: readonly number[] };
}
export interface DisruptionConfig {
  rail?: Partial<DisruptionPolicy['rail']>;
  tube?: Partial<DisruptionPolicy['tube']>;
}

export const DEFAULT_DISRUPTION_POLICY: DisruptionPolicy = Object.freeze({
  rail: Object.freeze({ warnMin: 5, badMin: 15, lookbackMin: 5, affectedTrainCount: 2 }),
  tube: Object.freeze({
    closedSeverities: Object.freeze([1, 2, 3, 4, 5, 16, 20]),
    significantSeverities: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 16, 20]),
    goodSeverities: Object.freeze([10, 18, 19]),
  }),
});

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const severities = (value: readonly number[] | undefined, fallback: readonly number[]): readonly number[] =>
  Array.isArray(value) && value.every(n => finite(n) && Number.isInteger(n) && n >= 0) ? [...new Set(value)] : fallback;

/** Profile overrides are partial. Invalid/reversed delay bands fall back together. */
export function resolveDisruptionPolicy(config?: DisruptionConfig): DisruptionPolicy {
  if (!config) return DEFAULT_DISRUPTION_POLICY;
  const defaults = DEFAULT_DISRUPTION_POLICY, rail = config.rail, tube = config.tube;
  const warn = rail?.warnMin ?? defaults.rail.warnMin, bad = rail?.badMin ?? defaults.rail.badMin;
  const bandsValid = finite(warn) && finite(bad) && warn >= 1 && bad > warn;
  // A closed service is never "good". Explicit good-service overrides remove
  // codes from ordinary prominence, so mixed entries cannot promote a minor one.
  const closed = severities(tube?.closedSeverities, defaults.tube.closedSeverities);
  const good = severities(tube?.goodSeverities, defaults.tube.goodSeverities).filter(sev => !closed.includes(sev));
  const significant = [...new Set([...severities(tube?.significantSeverities, defaults.tube.significantSeverities).filter(sev => !good.includes(sev)), ...closed])];
  return {
    rail: {
      warnMin: bandsValid ? warn : defaults.rail.warnMin,
      badMin: bandsValid ? bad : defaults.rail.badMin,
      lookbackMin: finite(rail?.lookbackMin) && rail.lookbackMin >= 0 ? rail.lookbackMin : defaults.rail.lookbackMin,
      affectedTrainCount: finite(rail?.affectedTrainCount) && Number.isInteger(rail.affectedTrainCount) && rail.affectedTrainCount >= 1 ? rail.affectedTrainCount : defaults.rail.affectedTrainCount,
    },
    tube: {
      closedSeverities: closed,
      significantSeverities: significant,
      goodSeverities: good,
    },
  };
}

export type DisruptionLevel = 'ok' | 'warn' | 'bad';
export function railDelayLevel(lateMin: number, config?: DisruptionConfig): DisruptionLevel {
  const p = resolveDisruptionPolicy(config).rail;
  return lateMin >= p.badMin ? 'bad' : lateMin >= p.warnMin ? 'warn' : 'ok';
}

/** TfL severity numbers are identifiers, not a complete ordinal: 20 is closed, despite good service being 10. */
export function worstDisruptionStatus(line: LineStatus | null | undefined, config?: DisruptionConfig): LineStatus['statuses'][number] | null {
  if (!line?.statuses.length) return null;
  const p = resolveDisruptionPolicy(config).tube;
  const rank = (sev: number) => p.closedSeverities.includes(sev) ? 0 : p.significantSeverities.includes(sev) ? 1 : p.goodSeverities.includes(sev) ? 3 : 2;
  return line.statuses.reduce((a, b) => rank(a.sev) < rank(b.sev) || rank(a.sev) === rank(b.sev) && a.sev <= b.sev ? a : b);
}
export function disruptionLineLevel(line: LineStatus | null | undefined, config?: DisruptionConfig): DisruptionLevel {
  const status = worstDisruptionStatus(line, config);
  if (!status) return 'ok'; // Missing evidence is qualified separately; do not invent a disruption.
  const p = resolveDisruptionPolicy(config).tube;
  return p.closedSeverities.includes(status.sev) ? 'bad' : p.goodSeverities.includes(status.sev) ? 'ok' : 'warn';
}
export function significantLineDisruption(line: LineStatus, config?: DisruptionConfig): boolean {
  const p = resolveDisruptionPolicy(config).tube;
  return line.statuses.some(s => p.closedSeverities.includes(s.sev) || p.significantSeverities.includes(s.sev));
}

export interface VisibleDisruption {
  id: string;
  level: 'bad' | 'warn';
  title: string;
  detail: string[];
  scope: 'data' | 'rail' | 'tube';
  /** Current-service context, not a forecast. The qualifier identifies stale observations. */
  currentOnly: boolean;
  qualifier?: string;
}
export interface VisibleDisruptionInput {
  errors?: string[];
  notLoaded?: string[];
  stale?: boolean;
  /** Already limited to the selected service / relevant remaining rail legs by the caller. */
  tiers?: RailWarnings | null;
  /** Only relevant remaining Tube lines. Unused parallel alternatives must not be supplied. */
  tubeLines?: LineStatus[];
  planLater?: boolean;
  policy?: DisruptionConfig;
}
export interface DisruptionTrainObservation {
  source: 'reported'|'prediction'|'modelled'|'stale'|'unknown';
  delayMin: number|null;
  expectedArrival?: number|null;
  cancelled?: boolean;
  noEstimate?: boolean;
  reason?: string;
}
/** An ephemeral warning observation from already validated progress evidence.
 * It never edits a board, route snapshot or planned arrival. Fresh Service Details
 * can add newer timing evidence. A residual prediction cannot clear a board's
 * explicit cancellation/no-estimate incident; the existing controller owns recovery.
 */
export function disruptionTrainObservation(train: Train, observation: DisruptionTrainObservation): Train|null {
  if (!['reported','prediction'].includes(observation.source)) return null;
  if (!finite(observation.delayMin) && !observation.cancelled && !observation.noEstimate) return null;
  const delay = finite(observation.delayMin) ? Math.max(0, observation.delayMin) : null;
  return {...train,
    depLate: delay ?? train.depLate,
    arrLate: delay ?? train.arrLate,
    arr: finite(observation.expectedArrival) ? observation.expectedArrival : train.arr,
    cancelled: train.cancelled || !!observation.cancelled,
    depUnknown: train.depUnknown || !!observation.noEstimate,
    arrUnknown: train.arrUnknown || !!observation.noEstimate,
    reason: (train.cancelled || train.depUnknown || train.arrUnknown) && train.reason ? train.reason : observation.reason ?? train.reason,
  };
}
const count = (n: number, singular: string) => `${n} ${singular}${n === 1 ? '' : 's'}`;
const trainDetail = (t: Train) => `${t.std} ${t.operator}${t.reason ? ': ' + t.reason : ''}`;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const encodedMessage = (message: string): string => {
  try { return encodeURIComponent(message); }
  catch { return 'utf16:' + message.split('').map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join(''); }
};

/** All significant route impacts, rather than only a single worst summary.
 * Severity and prominence are separate: Minor Delays stays amber wherever shown, but is not promoted here.
 * Operator/route notices without an observed train impact remain background detail.
 */
export function visibleDisruptions(input: VisibleDisruptionInput): VisibleDisruption[] {
  const out: VisibleDisruption[] = [], p = resolveDisruptionPolicy(input.policy), tiers = input.tiers;
  unique(input.errors || []).forEach(message => out.push({ id: 'data-error-' + encodedMessage(message), level: 'bad', title: message, detail: [], scope: 'data', currentOnly: false }));
  const missing = unique(input.notLoaded || []);
  if (missing.length) out.push({ id: 'data-missing', level: 'bad', title: `${missing.join(' and ')} trains not loaded`, detail: [], scope: 'data', currentOnly: false });
  if (input.stale) out.push({ id: 'data-stale', level: 'bad', title: 'Train times may be out of date', detail: [], scope: 'data', currentOnly: false });

  if (tiers && (tiers.cancelled.length || tiers.uncertain.length || tiers.late >= p.rail.warnMin)) {
    const level = tiers.cancelled.length || tiers.uncertain.length || tiers.late >= p.rail.badMin ? 'bad' : 'warn';
    const title = tiers.cancelled.length ? `${count(tiers.cancelled.length, 'train')} cancelled on your route`
      : tiers.uncertain.length ? `${count(tiers.uncertain.length, 'train')} delayed with no estimate`
      : `Delays up to ${tiers.late} min on your route`;
    const services = [
      ...tiers.cancelled.map(t => ({ train: t, text: 'Cancelled: ' + trainDetail(t) })),
      ...tiers.uncertain.map(t => ({ train: t, text: 'No estimate: ' + trainDetail(t) })),
      ...(tiers.delayed || []).map(t => ({ train: t, text: `${Math.max(t.depLate || 0, t.arrLate || 0)} min late: ${trainDetail(t)}` })),
    ];
    const detail = unique([
      ...services.filter(item => item.train.reason.trim()).map(item => item.text),
      ...tiers.onRoute,
      ...services.filter(item => !item.train.reason.trim()).map(item => item.text),
      ...(tiers.late >= p.rail.warnMin ? [`Worst train delay: ${tiers.late} min`] : []),
      ...(tiers.hit ? [`${tiers.affected} of ${tiers.total} trains are affected`] : []),
    ]);
    const qualifier = input.stale ? input.planLater ? 'Last known train information, not a forecast for your later plan' : 'Last known train information'
      : input.planLater ? 'Trains running now, not your later plan' : undefined;
    out.push({ id: 'rail-impact', level, title, detail, scope: 'rail', currentOnly: true, ...(qualifier ? { qualifier } : {}) });
  }
  for (const line of input.tubeLines || []) {
    if (!significantLineDisruption(line, input.policy)) continue;
    const status = worstDisruptionStatus(line, input.policy);
    if (!status) continue;
    const level = disruptionLineLevel(line, input.policy);
    if (level === 'ok') continue;
    out.push({ id: 'tube-' + line.id, level, title: `${line.name}: ${status.desc}`,
      detail: unique(line.statuses.filter(s => !p.tube.goodSeverities.includes(s.sev)).map(s => s.reason || s.desc)),
      scope: 'tube', currentOnly: true, ...(input.planLater ? { qualifier: 'Current service status, not a forecast for your later plan' } : {}) });
  }
  return out;
}
