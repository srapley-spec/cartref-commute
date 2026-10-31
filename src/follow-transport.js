// Optional approach-leg observation. Uses the existing guarded TfL fetcher; source epochs and the
// chosen route/vehicle/station are checked again after every await before any cache can be reused.
let followTransportPending = null;
function followTransportContext(now) {
  if (!S().followRoute) return null;
  const route = C.restoreFollowRoute(state.saved.followRoute);
  if (!route || route.direction !== 'home' || route.mode !== 'commute' || route.phase !== 'before-train' ||
    direction() !== 'home' || currentMode() !== 'commute') return null;
  const ride = homeRide(now);
  if (!ride || !ride.vehicle) return null;
  const hub = route.option.hub === 'STP' ? 'KGX' : route.option.hub;
  if (!TUBE_STOP[hub]) return null;
  const connection = C.tubeHomeConnections(ride.t, S(), state.saved.pace === 'fast' ? 'fast' : 'avg');
  return { routeId: route.id, vehicle: String(ride.vehicle), hub, stopId: TUBE_STOP[hub],
    lineId: lineIdOf(ride.line), direction: 'westbound', readyMs: connection.ready[route.option.hub] ?? 0 };
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
