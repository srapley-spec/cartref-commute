import XCTest
@testable import CommuteNativeCore

@MainActor
final class SurfaceCoordinatorTests: XCTestCase {
    func testAnUpdateQueuedAtWorkerCompletionIsApplied() async throws {
        let platform = SurfaceProbe(), state = try following()
        let coordinator = SurfaceCoordinator(platform: platform)
        var next: Task<Void, Never>?
        platform.onCancel = {
            platform.onCancel = nil
            next = Task { @MainActor in await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true) }
        }
        await coordinator.update(SnapshotState(), alarmEnabled: false, notificationsAllowed: true)
        await next?.value
        XCTAssertEqual(platform.scheduled, ["A@3000.0"])
        XCTAssertEqual(platform.alarm, "A@3000.0")
    }

    func testDisableWhileSchedulingCancelsTheLateAlarm() async throws {
        let platform = SurfaceProbe(), state = try following()
        let coordinator = SurfaceCoordinator(platform: platform)
        let started = expectation(description: "Alarm scheduling suspended")
        platform.pauseSchedule = true; platform.onSchedule = { started.fulfill() }
        let first = Task { await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true) }
        await fulfillment(of: [started], timeout: 3)
        let disable = Task { await coordinator.update(state, alarmEnabled: false, notificationsAllowed: true) }
        // Allow the disabling call to enter the actor before releasing the platform operation.
        await Task.yield()
        platform.releaseSchedule()
        await first.value; await disable.value
        XCTAssertNil(platform.alarm)
        XCTAssertEqual(platform.scheduled.count, 1)
    }

    func testOfflineExitCancelsBeforeSuspendedSchedulingFinishes() async throws {
        let platform = SurfaceProbe(), state = try following()
        let coordinator = SurfaceCoordinator(platform: platform)
        let started = expectation(description: "Alarm scheduling suspended")
        platform.pauseSchedule = true; platform.onSchedule = { started.fulfill() }
        let first = Task { await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true) }
        await fulfillment(of: [started], timeout: 3)
        let cancels = platform.cancelCount
        coordinator.cancelAlarm()
        XCTAssertGreaterThan(platform.cancelCount, cancels, "Exit must call Apple synchronously, before network or storage.")
        platform.releaseSchedule(); await first.value
        XCTAssertNil(platform.alarm)
        XCTAssertEqual(platform.scheduled.count, 1)
    }

    func testDuplicateCleanupSelectsIdentityBeforeAnEndCallback() async throws {
        let platform = SurfaceProbe(), state = try following()
        let snapshot = try XCTUnwrap(state.current)
        platform.activities = [.init(id: "duplicate", snapshot: snapshot), .init(id: "kept", snapshot: snapshot)]
        platform.selectedActivityID = "kept"
        var stoppedSelectedJourney = false
        platform.onEnd = { id in if id == platform.selectedActivityID { stoppedSelectedJourney = true } }
        let coordinator = SurfaceCoordinator(platform: platform)
        await coordinator.update(state, alarmEnabled: false, notificationsAllowed: false)
        XCTAssertEqual(platform.selectedActivityID, "kept")
        XCTAssertEqual(platform.ended, ["duplicate"])
        XCTAssertFalse(stoppedSelectedJourney)
        XCTAssertEqual(platform.operations.first, "select:kept")
    }

    func testSwitchDuringSuspendedActivityUpdateCannotScheduleOldJourney() async throws {
        let platform = SurfaceProbe(), firstState = try following()
        var old = try XCTUnwrap(firstState.current); old.at -= 1
        platform.activities = [.init(id: "old", snapshot: old)]
        let coordinator = SurfaceCoordinator(platform: platform)
        let started = expectation(description: "Activity update suspended")
        platform.pauseActivity = true; platform.onActivity = { started.fulfill() }
        let first = Task { await coordinator.update(firstState, alarmEnabled: true, notificationsAllowed: true) }
        await fulfillment(of: [started], timeout: 3)
        let other = try following(id: "B")
        let second = Task { await coordinator.update(other, alarmEnabled: true, notificationsAllowed: true) }
        await Task.yield(); platform.releaseActivity()
        await first.value; await second.value
        XCTAssertEqual(platform.scheduled, ["B@3000.0"])
        XCTAssertEqual(platform.activities.map(\.snapshot.followId), ["B"])
        XCTAssertTrue(platform.ended.contains("old"))
    }

    func testNewerActivityContentIsNotOverwrittenAndNoBackgroundStartOccurs() async throws {
        let platform = SurfaceProbe(), state = try following()
        var newer = try XCTUnwrap(state.current); newer.at += 1
        platform.activities = [.init(id: "current", snapshot: newer)]
        let coordinator = SurfaceCoordinator(platform: platform)
        await coordinator.update(state, alarmEnabled: false, notificationsAllowed: true)
        XCTAssertEqual(platform.newer, [newer]); XCTAssertTrue(platform.updated.isEmpty)
        platform.activities = []; platform.canStartActivity = false
        await coordinator.update(state, alarmEnabled: false, notificationsAllowed: true)
        XCTAssertTrue(platform.activities.isEmpty)
    }

    func testPermissionAndOSFailureAreRespectedAndRetried() async throws {
        let platform = SurfaceProbe(), state = try following()
        let coordinator = SurfaceCoordinator(platform: platform)
        platform.alarmAuthorized = false
        await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true)
        XCTAssertTrue(platform.scheduled.isEmpty)
        platform.alarmAuthorized = true
        await coordinator.update(state, alarmEnabled: true, notificationsAllowed: false)
        XCTAssertTrue(platform.scheduled.isEmpty)
        platform.failSchedule = true
        await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true)
        XCTAssertNil(platform.alarm); XCTAssertEqual(coordinator.lastError, .unavailable)
        platform.failSchedule = false
        await coordinator.update(state, alarmEnabled: true, notificationsAllowed: true)
        XCTAssertEqual(platform.alarm, "A@3000.0")
    }

    private func following(id: String = "A") throws -> SnapshotState {
        let snapshot = try Wire.snapshot(["v": 1, "at": 1000, "source": "page", "stale": false,
            "confirmed": false, "mode": "trip", "direction": "home", "followId": id, "phase": "leave",
            "headline": ["label": "Leave by", "t": 4000], "alarm": ["at": 3000, "leadMin": 5, "cancelled": false, "cancelOnExit": "office"], "deepLink": "commute://follow/\(id)"])
        var state = SnapshotState(); try state.apply(snapshot, fromPage: true, now: 1000); return state
    }
}

@MainActor
private final class SurfaceProbe: SurfacePlatform {
    var activities: [SurfaceActivity] = []
    var selectedActivityID: String?
    var canStartActivity = true, alarmAuthorized = true
    let now = 1001.0
    var alarm: String?
    var scheduled: [String] = [], ended: [String] = [], updated: [String] = [], operations: [String] = []
    var newer: [JourneySnapshot] = []
    var cancelCount = 0
    var onCancel: (() -> Void)?, onSchedule: (() -> Void)?, onActivity: (() -> Void)?
    var onEnd: ((String) -> Void)?
    var pauseSchedule = false, pauseActivity = false, failSchedule = false
    private var scheduleWait: CheckedContinuation<Void, Never>?
    private var activityWait: CheckedContinuation<Void, Never>?
    func selectActivity(_ activity: SurfaceActivity?) {
        selectedActivityID = activity?.id; operations.append("select:\(activity?.id ?? "nil")")
    }
    func startActivity(_ snapshot: JourneySnapshot) throws -> SurfaceActivity {
        let activity = SurfaceActivity(id: UUID().uuidString, snapshot: snapshot)
        activities.append(activity); return activity
    }
    func updateActivity(_ id: String, snapshot: JourneySnapshot) async {
        updated.append(id)
        if pauseActivity { await withCheckedContinuation { activityWait = $0; onActivity?() } }
        if let index = activities.firstIndex(where: { $0.id == id }) { activities[index].snapshot = snapshot }
    }
    func endActivity(_ id: String) async {
        operations.append("end:\(id)"); ended.append(id); onEnd?(id); activities.removeAll { $0.id == id }
    }
    func newerActivityContent(_ snapshot: JourneySnapshot) { newer.append(snapshot) }
    func cancelPlatformAlarm() throws { cancelCount += 1; alarm = nil; onCancel?() }
    func scheduleAlarm(_ snapshot: JourneySnapshot, at: Double) async throws {
        if failSchedule { throw NativeError.unavailable }
        let value = "\(snapshot.followId)@\(at)"
        scheduled.append(value)
        if pauseSchedule { await withCheckedContinuation { scheduleWait = $0; onSchedule?() } }
        alarm = value
    }
    func releaseSchedule() { pauseSchedule = false; scheduleWait?.resume(); scheduleWait = nil }
    func releaseActivity() { pauseActivity = false; activityWait?.resume(); activityWait = nil }
}
