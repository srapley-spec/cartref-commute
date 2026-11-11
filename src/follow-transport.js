// Optional approach-leg observation. Uses the existing guarded TfL fetcher; source epochs and the
// chosen route/vehicle/station are checked again after every await before any cache can be reused.
let followTransportPending = null;
function followTransportContext(now) {
  const route = S().followRoute ? C.restoreFollowRoute(state.saved.followRoute) : null;
  if (!route || route.direction !== 'home' || route.mode !== 'commute' || route.phase !== 'before-train' ||
    direction() !== 'home' || currentMode() !== 'commute') return rideTransportContext(now);
  const ride = homeRide(now);
  if (!ride || !ride.vehicle) return null;
  const hub = route.option.hub === 'STP' ? 'KGX' : route.option.hub;
  if (!TUBE_STOP[hub]) return null;
  const connection = C.tubeHomeConnections(ride.t, S(), state.saved.pace === 'fast' ? 'fast' : 'avg');
  return { routeId: route.id, vehicle: String(ride.vehicle), hub, stopId: TUBE_STOP[hub],
    lineId: lineIdOf(ride.line), direction: 'westbound', readyMs: connection.ready[route.option.hub] ?? 0 };
}
// Not following: on the tube home, the same request for your tube at the station you'll get off at, so the leg
// can say where your tube is (Sam, 11 Nov evening: "Fetch it while you're on the tube home: one TfL request per
// refresh, the same one Follow already makes"). Only while a ride is under way with a known vehicle.
function rideTransportContext(now) {
  if (direction() !== 'home' || currentMode() !== 'commute') return null;
  const ride = homeRide(now);
  if (!ride || !ride.vehicle) return null;
  const stop = rideStopHub(ride, now);
  const hub = stop === 'STP' ? 'KGX' : stop;
  if (!hub || !TUBE_STOP[hub]) return null;
  const connection = C.tubeHomeConnections(ride.t, S(), state.saved.pace === 'fast' ? 'fast' : 'avg');
  return { routeId: rideTransportId(ride), vehicle: String(ride.vehicle), hub, stopId: TUBE_STOP[hub],
    lineId: lineIdOf(ride.line), direction: 'westbound', readyMs: connection.ready[stop] ?? 0 };
}
const rideTransportId = ride => `ride:${ride.t}`;
// Where the on-tube card says to get off: the earliest home, ties to the earlier stop (as renderOnTubeHome).
function rideStopHub(ride, now) {
  const legs = homeLegs(ride.t, now).map(l => ({ ...l, stopAt: ride.t + l.rideMs, arrive: ride.t + l.rideMs + l.tailMs }))
    .sort((a, b) => a.arrive - b.arrive || a.stopAt - b.stopAt);
  return legs[0]?.o?.hub || null;
}
const sameFollowTransport = (a, b) => !!a && !!b && a.routeId === b.routeId && a.vehicle === b.vehicle &&
  a.hub === b.hub && a.lineId === b.lineId && a.direction === b.direction;

async function refreshFollowTransport(now = Date.now()) {
  const context = followTransportContext(now), epoch = sourceEpoch;
  if (!context) { state.followTransport = null; return; }
  if (state.followTransport && (state.followTransport.epoch !== epoch || !sameFollowTransport(state.followTransport, context))) state.followTransport = null;
  if (followTransportPending && followTransportPending.epoch === epoch && sameFollowTransport(followTransportPending, context)) return followTransportPending.promise;
  const pending = { ...context, epoch, promise: null };
  followTransportPending = pending;
  pending.promise = (async () => {
    try {
      const predictions = await fetchTubeArrivals(context.hub, context.direction);
      if (epoch !== sourceEpoch || !sameFollowTransport(context, followTransportContext(Date.now()))) return;
      state.followTransport = { ...context, epoch, at: Date.now(), predictions };
    } catch (error) {
      // A fresh matching previous prediction may still be used; otherwise the engine's route
      // durations remain the explicit fallback. Never carry a cache across a source epoch.
      if (epoch === sourceEpoch && state.followTransport && !sameFollowTransport(state.followTransport, followTransportContext(Date.now()))) state.followTransport = null;
    } finally {
      if (followTransportPending === pending) followTransportPending = null;
    }
  })();
  return pending.promise;
}

function followedTubeArrival(route, now) {
  const context = followTransportContext(now), cached = state.followTransport;
  if (!context || route.id !== context.routeId || !cached || cached.epoch !== sourceEpoch || !sameFollowTransport(cached, context)) return null;
  return C.followTubeArrival(cached.predictions, { ...context, now, fetchedAt: cached.at });
}
