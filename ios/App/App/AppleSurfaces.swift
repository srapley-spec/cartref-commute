import ActivityKit
import AlarmKit
import SwiftUI
import UIKit
import CommuteNativeCore

/// Runs Apple operations serially. It receives the engine's complete directives, never a route to interpret.
@MainActor
final class AppleSurfaces: NativeSurfaces {
    let liveActivitySupported = true
    let alarmSupported = true
    static let alarmID = UUID(uuidString: "3D0FEE53-BA1C-4D6E-B826-B97248A3744A")!
    private weak var runtime: NativeRuntime?
    private var generation = 0
    private var state = SnapshotState()
    private var configuration: NativeConfiguration?
    private var notificationsAllowed = false
    private var suppressAlarm = false
    private var worker: Task<Void, Never>?
    private var observers: [String: [Task<Void, Never>]] = [:]
    private var alarmSignature: String?
    private(set) var lastError: NativeError?

    init(runtime: NativeRuntime) {
        self.runtime = runtime
        let existing = Activity<JourneyActivityAttributes>.activities
        for activity in existing { observe(activity) }
        if let id = runtime.document.activityID, let follow = runtime.document.activityFollowID,
           !existing.contains(where: { $0.id == id }) { runtime.activityEnded(followId: follow) }
    }

    func cancelAlarm() {
        generation += 1; suppressAlarm = true; alarmSignature = nil
        do {
            if try AlarmManager.shared.alarms.contains(where: { $0.id == Self.alarmID }) {
                try AlarmManager.shared.cancel(id: Self.alarmID)
            }
        } catch { lastError = .unavailable }
    }

    func update(_ state: SnapshotState, configuration: NativeConfiguration?, notificationsAllowed: Bool) async {
        self.state = state; self.configuration = configuration; self.notificationsAllowed = notificationsAllowed
        suppressAlarm = false; generation += 1
        if let worker { await worker.value; return }
        let pending = Task { @MainActor in
            var applied = -1
            while applied != self.generation {
                let revision = self.generation
                let state = self.state
                await self.updateActivity(state.current, revision: revision)
                if revision == self.generation { await self.updateAlarm(state, revision: revision) }
                applied = revision
            }
        }
        worker = pending
        await pending.value
        worker = nil
    }

    private func updateAlarm(_ state: SnapshotState, revision: Int) async {
        let allowed = notificationsAllowed && AlarmManager.shared.authorizationState == .authorized
        let directive = state.scheduledAlarm(at: NativeRuntime.now,
            enabled: configuration?.alarm.alarm == true && !suppressAlarm, authorized: allowed)
        guard let alarm = directive, let at = alarm.at, let snapshot = state.current else {
            // This internal cancellation must not change the coordinator generation.
            do {
                if try AlarmManager.shared.alarms.contains(where: { $0.id == Self.alarmID }) { try AlarmManager.shared.cancel(id: Self.alarmID) }
                alarmSignature = nil
            } catch { lastError = .unavailable }
            return
        }
        let signature = "\(snapshot.followId)|\(at)|\(snapshot.headline.label)"
        if alarmSignature == signature { return }
        do {
            if try AlarmManager.shared.alarms.contains(where: { $0.id == Self.alarmID }) { try AlarmManager.shared.cancel(id: Self.alarmID) }
            let presentation = AlarmPresentation(alert: .init(title: LocalizedStringResource(stringLiteral: snapshot.headline.label)))
            let attributes = AlarmAttributes(presentation: presentation, metadata: CommuteAlarmMetadata(followId: snapshot.followId), tintColor: .teal)
            let config = AlarmManager.AlarmConfiguration.alarm(schedule: .fixed(Date(timeIntervalSince1970: at / 1000)), attributes: attributes)
            _ = try await AlarmManager.shared.schedule(id: Self.alarmID, configuration: config)
            if revision != generation || suppressAlarm {
                // A stop/exit/switch arrived while Apple's async scheduling call was in flight.
                try AlarmManager.shared.cancel(id: Self.alarmID)
                alarmSignature = nil
            } else { alarmSignature = signature }
        } catch { lastError = .unavailable; alarmSignature = nil }
    }

    private func updateActivity(_ snapshot: JourneySnapshot?, revision: Int) async {
        let all = Activity<JourneyActivityAttributes>.activities
        let matching = all.first { $0.attributes.followId == snapshot?.followId && ($0.activityState == .active || $0.activityState == .stale) }
        for activity in all where activity.id != matching?.id {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard revision == generation, let snapshot else { return }
        let content = ActivityContent(state: snapshot, staleDate: snapshot.staleDate)
        if let matching {
            observe(matching)
            // ActivityKit can receive fresher data without a background launch of the app.
            if matching.content.state.at > snapshot.at {
                runtime?.activityContent(matching.content.state)
            } else if matching.content.state != snapshot {
                await matching.update(content)
            }
        } else if ActivityAuthorizationInfo().areActivitiesEnabled && UIApplication.shared.applicationState == .active {
            do {
                let activity = try Activity.request(attributes: JourneyActivityAttributes(followId: snapshot.followId), content: content, pushType: .token)
                runtime?.activityCreated(id: activity.id, followId: snapshot.followId)
                observe(activity)
            } catch { lastError = .unavailable }
        }
    }

    private func observe(_ activity: Activity<JourneyActivityAttributes>) {
        guard observers[activity.id] == nil else { return }
        if let token = activity.pushToken { runtime?.activityToken(followId: activity.attributes.followId, token: token) }
        observers[activity.id] = [
            Task { @MainActor [weak self] in
                for await token in activity.pushTokenUpdates {
                    guard !Task.isCancelled else { return }
                    self?.runtime?.activityToken(followId: activity.attributes.followId, token: token)
                }
            },
            Task { @MainActor [weak self] in
                for await content in activity.contentUpdates {
                    guard !Task.isCancelled else { return }
                    self?.runtime?.activityContent(content.state)
                }
            },
            Task { @MainActor [weak self] in
                for await status in activity.activityStateUpdates {
                    guard !Task.isCancelled else { return }
                    if status == .ended || status == .dismissed {
                        self?.runtime?.activityEnded(followId: activity.attributes.followId)
                        self?.observers.removeValue(forKey: activity.id)?.forEach { $0.cancel() }
                        return
                    }
                }
            }
        ]
    }
}

private struct CommuteAlarmMetadata: AlarmMetadata { let followId: String }
