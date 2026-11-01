// Common journey facts for every design and view. These are presentation facts
// from an existing itinerary, never another planner or a shortest-route ranking.
import type { Option, Train } from './types';
import type { Journey } from './trip/journeyCore';

export interface JourneyFacts {
  trainDurationMs: number | null;
  totalDurationMs: number | null;
}
export interface JourneyFactsContext {
  /** A current observed train, e.g. Follow's lastTrain; omitted uses the option. */
  train?: Train | null;
  /** Existing controller's door-to-door arrival. Explicit null remains unknown. */
  arrival?: number | null;
  /** Current journey uncertainty. False is only for an already-established
   * onward leg, where a completed rail incident is historical context. */
  unavailable?: boolean;
}
export interface ConnectionJourneyFactsContext {
  /** Existing connection-board projection's latest departure from the origin. */
  leaveBy: number | null;
  /** Existing timed connection's door-to-door arrival. */
  arrive: number | null;
}
type TimingOption = Pick<Option, 'leave' | 'arrive' | 'train'>;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const interval = (start: unknown, end: unknown): number | null =>
  finite(start) && finite(end) && end >= start && finite(end - start) ? end - start : null;
const unknownTrain = (train: Train | null) => !!train &&
  (train.cancelled || train.depUnknown || train.arrUnknown === true || interval(train.dep, train.arr) === null);

/** Durations use the option's canonical start, including any effort retiming.
 * Following a route never replaces that start with the time Follow was tapped,
 * the current clock or a newly inferred walk. A known train without a complete
 * door-to-door option still has a train duration, but no invented total.
 */
export function journeyFacts(option: TimingOption | null, context: JourneyFactsContext = {}): JourneyFacts {
  const train = context.train === undefined ? option?.train ?? null : context.train;
  const arrival = Object.prototype.hasOwnProperty.call(context, 'arrival') ? context.arrival : option?.arrive;
  const unavailable = context.unavailable ?? unknownTrain(train);
  return {
    trainDurationMs: !train || unknownTrain(train) ? null : interval(train.dep, train.arr),
    totalDurationMs: !option || unavailable ? null : interval(option.leave, arrival),
  };
}

/** A Tube/bus approach is timed from the connection the user can actually take.
 * Its rail option may have been rebuilt after that departure; that option's
 * inferred access start is not the connection's start. A conditional early
 * departure has no established leaveBy and therefore no claimed total.
 */
export function connectionJourneyFacts(option: TimingOption | null, context: ConnectionJourneyFactsContext): JourneyFacts {
  return journeyFacts(option ? {train: option.train, leave: context.leaveBy ?? NaN, arrive: context.arrive ?? NaN} : null);
}

/** The same facts for a multi-ride itinerary. Rail time adds only time on trains:
 * changes, Tube/bus rides and access belong to the door-to-door total instead.
 * Missing access timing can leave rail time known without inventing a total.
 */
export function tripJourneyFacts(journey: Pick<Journey, 'rides' | 'leave' | 'arrive' | 'uncertain'>): JourneyFacts {
  const unavailable = (ride: Journey['rides'][number]) =>
    ride.cancelled || unknownTrain(ride.train ?? null) || interval(ride.dep, ride.arr) === null;
  const rail = journey.rides.filter(ride => ride.kind === 'rail');
  return {
    trainDurationMs: !rail.length || rail.some(unavailable) ? null : rail.reduce((total, ride) => total + (ride.arr - ride.dep), 0),
    totalDurationMs: journey.uncertain || !journey.rides.length || journey.rides.some(unavailable) ? null : interval(journey.leave, journey.arrive),
  };
}
