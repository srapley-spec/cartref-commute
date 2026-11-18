import ActivityKit
import AlarmKit
import SwiftUI
import UIKit
import CommuteNativeCore

/// Apple API adapter. Ordering and cancellation are exercised with an injected platform in NativeCore tests.
@MainActor
final class AppleSurfaces: NativeSurfaces, SurfacePlatform {
    let liveActivitySupported = true
    let alarmSupported = true
    static let alarmID = UUID(uuidString: "3D0FEE53-BA1C-4D6E-B826-B97248A3744A")!
    private weak var runtime: NativeRuntime?
    private lazy var coordinator = SurfaceCoordinator(platform: self)
    private var observers: [Task<Void, Never>] = []
    private(set) var selectedActivityID: String?
    var lastError: NativeError? { coordinator.lastError }

    init(runtime: NativeRuntime) {
        self.runtime = runtime
        selectedActivityID = runtime.document.activityID
        if let id = selectedActivityID, let follow = runtime.document.activityFollowID,
           !Activity<JourneyActivityAttributes>.activities.contains(where: { $0.id == id }) {
            selectedActivityID = nil
            runtime.activityEnded(followId: follow)
        }
    }

    func update(_ state: SnapshotState, configuration: NativeConfiguration?, notificationsAllowed: Bool) async {
        await coordinator.update(state, alarmEnabled: configuration?.alarm.alarm == true, notificationsAllowed: notificationsAllowed)
    }
    func cancelAlarm() { coordinator.cancelAlarm() }

    var activities: [SurfaceActivity] {
        Activity<JourneyActivityAttributes>.activities.map {
            SurfaceActivity(id: $0.id, snapshot: $0.content.state, active: $0.activityState == .active || $0.activityState == .stale)
        }
    }
    var canStartActivity: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled && UIApplication.shared.applicationState == .active
    }
    var alarmAuthorized: Bool { AlarmManager.shared.authorizationState == .authorized }
    var now: Double { NativeRuntime.now }

    func startActivity(_ snapshot: JourneySnapshot) throws -> SurfaceActivity {
        let activity = try Activity.request(attributes: JourneyActivityAttributes(followId: snapshot.followId),
            content: ActivityContent(state: snapshot, staleDate: snapshot.staleDate), pushType: .token)
        return SurfaceActivity(id: activity.id, snapshot: snapshot)
    }
    func updateActivity(_ id: String, snapshot: JourneySnapshot) async {
        await Activity<JourneyActivityAttributes>.activities.first { $0.id == id }?.update(
            ActivityContent(state: snapshot, staleDate: snapshot.staleDate))
    }
    func endActivity(_ id: String) async {
        await Activity<JourneyActivityAttributes>.activities.first { $0.id == id }?.end(nil, dismissalPolicy: .immediate)
    }
    func newerActivityContent(_ snapshot: JourneySnapshot) { runtime?.activityContent(snapshot) }

    // A separate name avoids routing an internal OS cancellation back into the coordinator's generation.
    func cancelPlatformAlarm() throws {
        if try AlarmManager.shared.alarms.contains(where: { $0.id == Self.alarmID }) {
            try AlarmManager.shared.cancel(id: Self.alarmID)
        }
    }
    func scheduleAlarm(_ snapshot: JourneySnapshot, at: Double) async throws {
        var title = snapshot.headline.label
        if let time = snapshot.headline.t {
            title += " " + Date(timeIntervalSince1970: time / 1000).formatted(date: .omitted, time: .shortened)
        }
        let presentation = AlarmPresentation(alert: .init(title: LocalizedStringResource(stringLiteral: title)))
        let attributes = AlarmAttributes(presentation: presentation, metadata: CommuteAlarmMetadata(followId: snapshot.followId),
                                        tintColor: Color(red: 20 / 255, green: 83 / 255, blue: 182 / 255))
        let config = AlarmManager.AlarmConfiguration.alarm(schedule: .fixed(Date(timeIntervalSince1970: at / 1000)), attributes: attributes)
        _ = try await AlarmManager.shared.schedule(id: Self.alarmID, configuration: config)
    }

    func selectActivity(_ selected: SurfaceActivity?) {
        if selectedActivityID == selected?.id && (selected == nil || !observers.isEmpty) { return }
        observers.forEach { $0.cancel() }; observers = []
        selectedActivityID = selected?.id
        guard let selected, let activity = Activity<JourneyActivityAttributes>.activities.first(where: { $0.id == selected.id }) else { return }
        runtime?.activityCreated(id: activity.id, followId: activity.attributes.followId)
        if let token = activity.pushToken { runtime?.activityToken(followId: activity.attributes.followId, token: token) }
        observers = [
            Task { @MainActor [weak self] in
                for await token in activity.pushTokenUpdates {
                    guard !Task.isCancelled, self?.selectedActivityID == activity.id else { return }
                    self?.runtime?.activityToken(followId: activity.attributes.followId, token: token)
                }
            },
            Task { @MainActor [weak self] in
                for await content in activity.contentUpdates {
                    guard !Task.isCancelled, self?.selectedActivityID == activity.id else { return }
                    self?.runtime?.activityContent(content.state)
                }
            },
            Task { @MainActor [weak self] in
                for await status in activity.activityStateUpdates {
                    guard !Task.isCancelled, self?.selectedActivityID == activity.id else { return }
                    if status == .ended || status == .dismissed {
                        self?.runtime?.activityEnded(followId: activity.attributes.followId)
                        self?.selectActivity(nil)
                        return
                    }
                }
            }
        ]
    }
}

private struct CommuteAlarmMetadata: AlarmMetadata { let followId: String }
