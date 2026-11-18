import XCTest
@testable import CommuteNativeCore

final class NativeCoreTests: XCTestCase {
    private func snapshot(id: String = "A", at: Double = 1_000) -> JourneySnapshot {
        JourneySnapshot(v: 1, at: at, source: "page", dataAt: 900, stale: false, staleAt: 180_900,
            confirmed: false, mode: "trip", direction: "home", followId: id, phase: "leave",
            headline: .init(label: "Leave by", t: 4_000, countdown: nil), arrive: nil, train: nil,
            progress: nil, status: .init(level: "ok", text: "On time"),
            alarm: .init(at: 3_000, leadMin: 5, cancelled: false, cancelOnExit: "office"),
            deepLink: "commute://follow/\(id)")
    }

    func testRemoteMessagesCannotStartOrSwitchJourneyAndEqualTimestampUsesLastReceipt() throws {
        var state = SnapshotState()
        XCTAssertFalse(try state.apply(snapshot(), fromPage: false, now: 1_000))
        XCTAssertTrue(try state.apply(snapshot(), fromPage: true, now: 1_000))
        XCTAssertFalse(try state.apply(snapshot(at: 999), fromPage: false, now: 1_001))
        var equal = snapshot(); equal.headline.label = "Updated label"
        XCTAssertTrue(try state.apply(equal, fromPage: false, now: 1_002))
        XCTAssertEqual(state.current?.headline.label, "Updated label")
        XCTAssertFalse(try state.apply(snapshot(id: "B", at: 2_000), fromPage: false, now: 2_000))
        XCTAssertEqual(state.current?.followId, "A")
    }

    func testStopSwitchTombstonesSurviveRestartAndExpireAtOneHour() throws {
        var state = SnapshotState()
        try state.apply(snapshot(), fromPage: true, now: 1_000)
        try state.apply(snapshot(id: "B", at: 1_100), fromPage: true, now: 1_100)
        XCTAssertFalse(state.stop(followId: "A", at: 2_000, now: 2_000))
        XCTAssertFalse(state.stop(followId: "B", at: 1_099, now: 2_000))
        XCTAssertFalse(try state.apply(snapshot(at: 3_000), fromPage: true, now: 3_000))
        state = try JSONDecoder().decode(SnapshotState.self, from: JSONEncoder().encode(state))
        XCTAssertFalse(try state.apply(snapshot(), fromPage: true, now: 3_601_099))
        XCTAssertTrue(try state.apply(snapshot(), fromPage: true, now: 3_601_100))
        state.stopFromPage(now: 3_601_100)
        XCTAssertNil(state.current)
        XCTAssertFalse(try state.apply(snapshot(at: 4_000_000), fromPage: false, now: 4_000_000))
    }

    func testExitUsesEngineRuleAndCannotBeUndoneByLaterPush() throws {
        var state = SnapshotState()
        try state.apply(snapshot(), fromPage: true, now: 1_000)
        XCTAssertFalse(state.regionExit(place: "home", at: 1_001))
        XCTAssertFalse(state.regionExit(place: "office", at: 1_000))
        XCTAssertNotNil(state.scheduledAlarm(at: 1_001, enabled: true, authorized: true))
        XCTAssertTrue(state.regionExit(place: "office", at: 1_001))
        try state.apply(snapshot(at: 1_002), fromPage: false, now: 1_002)
        state = try JSONDecoder().decode(SnapshotState.self, from: JSONEncoder().encode(state))
        XCTAssertNil(state.scheduledAlarm(at: 1_002, enabled: true, authorized: true))
        try state.apply(snapshot(id: "B", at: 1_003), fromPage: true, now: 1_003)
        XCTAssertNotNil(state.scheduledAlarm(at: 1_003, enabled: true, authorized: true))
        XCTAssertNil(state.scheduledAlarm(at: 3_000, enabled: true, authorized: true))
        XCTAssertNil(state.scheduledAlarm(at: 1_003, enabled: false, authorized: true))
        XCTAssertNil(state.scheduledAlarm(at: 1_003, enabled: true, authorized: false))
        var cancelled = snapshot(id: "B", at: 1_004); cancelled.alarm?.cancelled = true
        try state.apply(cancelled, fromPage: false, now: 1_004)
        XCTAssertNil(state.scheduledAlarm(at: 1_004, enabled: true, authorized: true))
    }

    func testCacheIsOpaqueAtomicBoundedAndPreservesDataAge() throws {
        var cache = OfflineCache()
        let original = CacheEntry(key: "boards", dataAt: 10, savedAt: 50, value: .object(["nested": .array([.null, .bool(false), .number(3), .string("λ")])]))
        try cache.replace([original])
        try cache.replace([.init(key: "status", dataAt: 20, savedAt: 60, value: .null)])
        XCTAssertEqual(cache.entries.first, original)
        let before = cache
        XCTAssertThrowsError(try cache.replace([.init(key: "boards", dataAt: 30, savedAt: 70, value: .string(String(repeating: "x", count: OfflineCache.byteLimit)))]))
        XCTAssertEqual(cache, before)
        XCTAssertThrowsError(try cache.replace([.init(key: "boards", dataAt: 30, savedAt: 70, value: .null), .init(key: "credentials", dataAt: 30, savedAt: 70, value: .null)]))
        XCTAssertEqual(cache, before)
        XCTAssertThrowsError(try cache.replace([.init(key: "boards", v: 2, dataAt: 30, savedAt: 70, value: .null)]))
        let copy = try JSONDecoder().decode(OfflineCache.self, from: JSONEncoder().encode(cache))
        XCTAssertEqual(copy, before)
        XCTAssertEqual(copy.entries.first?.dataAt, 10)
    }

    func testFileRoundTripAndCorruptionDoesNotSilentlyEraseState() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try NativeFileStore(directory: directory)
        XCTAssertNil(try store.load(NativeDocument.self))
        var state = NativeDocument()
        try state.snapshots.apply(snapshot(), fromPage: true, now: 1_000)
        try store.save(state)
        XCTAssertEqual(try store.load(NativeDocument.self), state)
        try Data("broken".utf8).write(to: store.url)
        XCTAssertThrowsError(try store.load(NativeDocument.self))
        XCTAssertEqual(try String(contentsOf: store.url), "broken")
    }

    func testReplayReplacesTokensBoundsEvidenceAndSurvivesPageReload() throws {
        var replay = EventReplay()
        replay.retain(.init("apns", ["token": .string("old")]), delivered: false)
        replay.retain(.init("apns", ["token": .string("new")]), delivered: true)
        replay.retain(.init("liveActivity", ["followId": .string("A"), "token": .string("one")]), delivered: false)
        replay.retain(.init("liveActivity", ["followId": .string("A"), "token": .string("two")]), delivered: false)
        replay.retain(.init("liveActivity", ["followId": .string("B"), "token": .string("three")]), delivered: false)
        for n in 0..<25 { replay.retain(.init("region", ["at": .number(Double(n))]), delivered: false) }
        replay.retain(.init("open", ["url": .string("commute://next?direction=home&follow=1")]), delivered: false)
        replay = try JSONDecoder().decode(EventReplay.self, from: JSONEncoder().encode(replay))
        let events = replay.ready()
        XCTAssertEqual(events.count, 24)
        XCTAssertEqual(events[0].data["token"], .string("new"))
        XCTAssertEqual(events[1].data["token"], .string("two"))
        XCTAssertEqual(events[3].data["at"], .number(5))
        XCTAssertEqual(events.last?.name, "open")
        XCTAssertEqual(replay.ready().count, 3)
        replay.removeActivity(followId: "A")
        XCTAssertEqual(replay.ready().count, 2)
    }

    func testConfigurationUsesOnlyPageRegionsAndSendsNoSSID() throws {
        let json = #"{"v":1,"proxy":{"origin":"https://proxy.example"},"alarm":{"alarm":true,"alarmLeadMin":5},"wifi":{"home":["Panda"],"office":["Ciklum"]},"regions":[{"place":"home","lat":51,"lon":-0.1,"radiusM":150}]}"#
        var c = try JSONDecoder().decode(NativeConfiguration.self, from: Data(json.utf8))
        try c.validate()
        XCTAssertEqual(c.wifi.place(for: "Panda Mobile"), "home")
        XCTAssertEqual(c.wifi.place(for: "Ciklum"), "office")
        XCTAssertEqual(c.wifi.place(for: "Public"), "other")
        XCTAssertEqual(c.wifi.place(for: nil), "none")
        c.proxy.origin = "https://proxy.example@elsewhere.example/path"
        XCTAssertThrowsError(try c.validate())
        c.proxy.origin = "https://proxy.example"; c.alarm.alarm = false
        XCTAssertThrowsError(try c.validate())
        c.regions = []; try c.validate()
        c.wifi.home = [""]
        XCTAssertThrowsError(try c.validate())
    }

    func testUnknownVersionDoesNotMutateState() throws {
        try Wire.version([:]); try Wire.version(["v": 1])
        for v: Any in [2, true, "1", NSNull()] { XCTAssertThrowsError(try Wire.version(["v": v])) }
        var state = SnapshotState(); var s = snapshot(); s.v = 2
        XCTAssertThrowsError(try state.apply(s, fromPage: true, now: 1_000))
        XCTAssertNil(state.current)
    }
}
