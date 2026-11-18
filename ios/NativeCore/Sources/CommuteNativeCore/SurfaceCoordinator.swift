import Foundation

/// A platform handle, not a journey decision. Content is always supplied by the engine.
public struct SurfaceActivity: Equatable {
    public var id: String
    public var snapshot: JourneySnapshot
    public var active: Bool
    public init(id: String, snapshot: JourneySnapshot, active: Bool = true) {
        self.id = id; self.snapshot = snapshot; self.active = active
    }
}

@MainActor
public protocol SurfacePlatform: AnyObject {
    var activities: [SurfaceActivity] { get }
    var selectedActivityID: String? { get }
    var canStartActivity: Bool { get }
    var alarmAuthorized: Bool { get }
    var now: Double { get }
    /// Switch observers before ending duplicates, so their end events cannot stop the selected journey.
    func selectActivity(_ activity: SurfaceActivity?)
    func startActivity(_ snapshot: JourneySnapshot) throws -> SurfaceActivity
    func updateActivity(_ id: String, snapshot: JourneySnapshot) async
    func endActivity(_ id: String) async
    func newerActivityContent(_ snapshot: JourneySnapshot)
    func cancelPlatformAlarm() throws
    func scheduleAlarm(_ snapshot: JourneySnapshot, at: Double) async throws
}

/// Serializes asynchronous OS operations; a newer engine directive always wins, including while scheduling.
@MainActor
public final class SurfaceCoordinator {
    // The platform adapter owns this coordinator and outlives its operations.
    private unowned let platform: any SurfacePlatform
    private var generation = 0
    private var state = SnapshotState()
    private var alarmEnabled = false
    private var notificationsAllowed = false
    private var suppressAlarm = false
    private var worker: Task<Void, Never>?
    private struct AlarmSignature: Equatable {
        let followId: String
        let at: Double
        let headline: JourneySnapshot.Headline
    }
    private var alarmSignature: AlarmSignature?
    public private(set) var lastError: NativeError?

    public init(platform: any SurfacePlatform) { self.platform = platform }

    public func cancelAlarm() {
        generation += 1; suppressAlarm = true; alarmSignature = nil
        do { try platform.cancelPlatformAlarm() } catch { lastError = .unavailable }
    }

    public func update(_ state: SnapshotState, alarmEnabled: Bool, notificationsAllowed: Bool) async {
        self.state = state; self.alarmEnabled = alarmEnabled; self.notificationsAllowed = notificationsAllowed
        suppressAlarm = false; generation += 1
        invalidateObsoleteAlarm()
        if let worker { await worker.value; return }
        let pending = Task { @MainActor in
            var applied = -1
            while applied != self.generation {
                let revision = self.generation, state = self.state
                await self.updateActivity(state.current, revision: revision)
                if revision == self.generation { await self.updateAlarm(state, revision: revision) }
                applied = revision
            }
            // Clear ownership in this actor turn, before waking callers. A new update must never join
            // a finished worker whose loop can no longer notice the new generation.
            self.worker = nil
        }
        worker = pending
        await pending.value
    }

    private func updateActivity(_ snapshot: JourneySnapshot?, revision: Int) async {
        let all = platform.activities
        let candidates = all.filter { $0.active && $0.snapshot.followId == snapshot?.followId }
        let matching = candidates.first { $0.id == platform.selectedActivityID } ?? candidates.first
        platform.selectActivity(matching)
        for activity in all where activity.id != matching?.id {
            await platform.endActivity(activity.id)
            guard revision == generation else { return }
        }
        guard revision == generation, let snapshot else { return }
        if let matching {
            if matching.snapshot.at > snapshot.at {
                // A Live Activity push can precede the background push. Adopt that validated transport
                // state before touching the alarm; notifying the runtime alone leaves an async hand-off gap.
                var newer = state
                if (try? newer.apply(matching.snapshot, fromPage: false, now: platform.now)) == true {
                    state = newer; generation += 1
                    invalidateObsoleteAlarm()
                    platform.newerActivityContent(matching.snapshot)
                }
            }
            else if matching.snapshot != snapshot { await platform.updateActivity(matching.id, snapshot: snapshot) }
        } else if platform.canStartActivity {
            do { platform.selectActivity(try platform.startActivity(snapshot)) }
            catch { lastError = .unavailable }
        }
    }

    private func invalidateObsoleteAlarm() {
        let directive = state.scheduledAlarm(at: platform.now, enabled: alarmEnabled && !suppressAlarm,
                                            authorized: notificationsAllowed && platform.alarmAuthorized)
        let desired: AlarmSignature?
        if let at = directive?.at, let snapshot = state.current {
            desired = AlarmSignature(followId: snapshot.followId, at: at, headline: snapshot.headline)
        } else { desired = nil }
        // Cancel synchronously when accepting a change. ActivityKit may suspend for a long time, during
        // which an obsolete alarm must not remain armed. A pending schedule is also cancelled on return.
        if desired == nil || desired != alarmSignature {
            do { try platform.cancelPlatformAlarm(); alarmSignature = nil }
            catch { lastError = .unavailable }
        }
    }

    private func updateAlarm(_ state: SnapshotState, revision: Int) async {
        let directive = state.scheduledAlarm(at: platform.now, enabled: alarmEnabled && !suppressAlarm,
                                            authorized: notificationsAllowed && platform.alarmAuthorized)
        guard let at = directive?.at, let snapshot = state.current else {
            do { try platform.cancelPlatformAlarm(); alarmSignature = nil } catch { lastError = .unavailable }
            return
        }
        let signature = AlarmSignature(followId: snapshot.followId, at: at, headline: snapshot.headline)
        if alarmSignature == signature { return }
        do {
            try platform.cancelPlatformAlarm()
            try await platform.scheduleAlarm(snapshot, at: at)
            if revision != generation || suppressAlarm {
                try platform.cancelPlatformAlarm(); alarmSignature = nil
            } else { alarmSignature = signature }
        } catch { lastError = .unavailable; alarmSignature = nil }
    }
}
