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

    func testSiriReadsEngineWordingAndItsDataAgeWithoutPlanning() {
        var value = snapshot()
        let clock: (Double) -> String = { "clock:\(Int($0))" }
        XCTAssertNil(SiriPresentation.answer(nil, now: 1000, clock: clock))
        XCTAssertEqual(SiriPresentation.nextHomeURL.absoluteString, "commute://next?direction=home&follow=1")
        XCTAssertEqual(SiriPresentation.answer(value, now: 1000, clock: clock), "Leave by clock:4000. As of clock:900")
        value.headline.label = "The engine's current next action"; value.headline.t = nil
        XCTAssertEqual(SiriPresentation.answer(value, now: 180900, clock: clock), "The engine's current next action. As of clock:900. This data is out of date")
        value.dataAt = nil; value.staleAt = nil; value.stale = true
        XCTAssertEqual(SiriPresentation.answer(value, now: 1000, clock: clock), "The engine's current next action. Not updated yet. This data is out of date")
    }

    func testCountdownUsesEngineStateAndExactWordsWithoutAClockRule() throws {
        var value = try XCTUnwrap(Wire.object(snapshot()) as? [String: Any])
        let labels = ["calm": "Engine calm words", "urgent": "Engine urgent words", "passed": "Engine passed words"]
        for state in ["calm", "urgent", "passed"] {
            value["headline"] = ["label": "Engine next step", "t": 4000,
                "countdown": ["step": "anything", "calm": labels["calm"]!, "urgent": labels["urgent"]!, "passed": labels["passed"]!,
                              "state": state, "urgentAt": 5000, "passedAt": 6000]] as [String: Any]
            let decoded = try Wire.snapshot(value)
            XCTAssertEqual(decoded.headline.countdown?.wording, labels[state])
            XCTAssertEqual(decoded.headline.countdown?.showsTimer, state != "passed")
            XCTAssertEqual(decoded.headline.countdown?.urgentAt, 5000)
            XCTAssertEqual(decoded.headline.countdown?.passedAt, 6000)
        }
        // The supplied state wins even when transition instants do not match this snapshot's clock.
        var words: [String: Any] = ["step": "leave", "calm": "Old calm", "urgent": "Old urgent"]
        value["headline"] = ["label": "Leave by", "t": 4000, "countdown": words]
        let legacy = try Wire.snapshot(value)
        XCTAssertNil(legacy.headline.countdown?.state)
        XCTAssertEqual(legacy.headline.countdown?.wording, "Old calm")
        XCTAssertEqual(legacy.headline.countdown?.showsTimer, true)
        words["state"] = "passed"
        value["headline"] = ["label": "Leave by", "t": 4000, "countdown": words]
        let passed = try Wire.snapshot(value)
        XCTAssertEqual(passed.headline.countdown?.wording, "")
        XCTAssertEqual(passed.headline.countdown?.showsTimer, false)
        words["state"] = "invented"
        value["headline"] = ["label": "Leave by", "t": 4000, "countdown": words]
        XCTAssertThrowsError(try Wire.snapshot(value))
    }

    func testCountdownTransitionInstantsValidateBeforePlatformUse() throws {
        var value = snapshot()
        value.headline.countdown = .init(step: "leave", calm: "in", urgent: "now", passed: "passed",
                                        state: .calm, urgentAt: nil, passedAt: nil)
        let fields: [WritableKeyPath<JourneySnapshot.Countdown, Double?>] = [\.urgentAt, \.passedAt]
        for field in fields {
            for time: Double? in [nil, 0, 5000] {
                value.headline.countdown![keyPath: field] = time
                XCTAssertNoThrow(try value.validate())
            }
            for time in [-1, Double.infinity, -Double.infinity, Double.nan] {
                value.headline.countdown![keyPath: field] = time
                XCTAssertThrowsError(try value.validate())
            }
            value.headline.countdown![keyPath: field] = nil
        }
    }

    func testRemoteStopEnvelopeRejectsUnidentifiedOrMalformedStops() throws {
        XCTAssertNil(try Wire.remoteSnapshot(["snapshot": NSNull()]))
        XCTAssertNil(try Wire.remoteSnapshot(["snapshot": NSNull(), "followId": NSNull(), "at": NSNull()]))
        for fields: [String: Any] in [["followId": "A"], ["at": 1000], ["followId": "", "at": 1000],
            ["followId": "A", "at": true], ["followId": "A", "at": "1000"], ["followId": "A", "at": -1]] {
            XCTAssertThrowsError(try Wire.remoteSnapshot(fields.merging(["snapshot": NSNull()]) { _, new in new }))
        }
        XCTAssertEqual(try Wire.remoteSnapshot(["snapshot": NSNull(), "followId": "A", "at": 1000]), .stop(followId: "A", at: 1000))
        for id in [String(repeating: "a", count: 256), String(repeating: "λ", count: 128)] {
            XCTAssertEqual(try Wire.remoteSnapshot(["snapshot": NSNull(), "followId": id, "at": 1000]), .stop(followId: id, at: 1000))
        }
        for id in [String(repeating: "a", count: 257), String(repeating: "λ", count: 129)] {
            XCTAssertThrowsError(try Wire.remoteSnapshot(["snapshot": NSNull(), "followId": id, "at": 1000]))
        }
        XCTAssertEqual(try Wire.remoteSnapshot(["snapshot": Wire.object(snapshot())]), .snapshot(snapshot()))
        XCTAssertThrowsError(try Wire.remoteSnapshot(["snapshot": ["v": 2]])) { XCTAssertEqual($0 as? NativeError, .unsupported) }
    }

    func testRemoteStopUsesJourneyAndTimestampThenPersistsItsTombstone() throws {
        var state = SnapshotState()
        try state.apply(snapshot(), fromPage: true, now: 1000)
        XCTAssertFalse(try state.applyRemote(.stop(followId: "B", at: 2000), now: 2000))
        XCTAssertFalse(try state.applyRemote(.stop(followId: "A", at: 999), now: 2000))
        XCTAssertTrue(try state.applyRemote(.stop(followId: "A", at: 1000), now: 2000))
        XCTAssertNil(state.current)
        state = try JSONDecoder().decode(SnapshotState.self, from: JSONEncoder().encode(state))
        XCTAssertFalse(try state.applyRemote(.snapshot(snapshot(at: 3000)), now: 3000))
        XCTAssertFalse(try state.apply(snapshot(at: 4000), fromPage: true, now: 3_601_999))
        XCTAssertTrue(try state.apply(snapshot(at: 4000), fromPage: true, now: 3_602_000))
    }

    func testRemoteEnvelopeCannotStartOrReplaceThePageJourney() throws {
        var state = SnapshotState()
        XCTAssertFalse(try state.applyRemote(.snapshot(snapshot()), now: 1000))
        XCTAssertNil(state.current)
        try state.apply(snapshot(), fromPage: true, now: 1000)
        XCTAssertFalse(try state.applyRemote(.snapshot(snapshot(id: "B", at: 2000)), now: 2000))
        XCTAssertEqual(state.current?.followId, "A")
        XCTAssertTrue(state.tombstones.isEmpty, "A rejected remote replacement must not tombstone the page's journey.")
        XCTAssertTrue(try state.applyRemote(.snapshot(snapshot(at: 2000)), now: 2000))
        XCTAssertEqual(state.current?.at, 2000)
    }

    func testTripSnapshotAcceptsNullDirectionFromThePublishedEngineSchema() throws {
        var value = try XCTUnwrap(Wire.object(snapshot()) as? [String: Any])
        value["mode"] = "trip"; value["direction"] = NSNull()
        let trip = try Wire.snapshot(value)
        XCTAssertEqual(trip.mode, "trip"); XCTAssertNil(trip.direction)
        var state = SnapshotState()
        XCTAssertTrue(try state.apply(trip, fromPage: true, now: 1000))
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

    func testUnknownCacheAgeRoundTripsAsNullWithoutBorrowingTheSaveTime() throws {
        let constructed = CacheEntry(key: "snapshot", dataAt: nil, savedAt: 500,
                                     value: .object(["unknownAge": .bool(true)]))
        XCTAssertNil(constructed.dataAt, "The public initializer must not invent a source timestamp.")
        let constructedRoundTrip = try JSONDecoder().decode(CacheEntry.self, from: JSONEncoder().encode(constructed))
        XCTAssertNil(constructedRoundTrip.dataAt)
        XCTAssertEqual(constructedRoundTrip.savedAt, 500)
        let entries = try Wire.entries([["key": "snapshot", "v": 1, "dataAt": NSNull(), "savedAt": 500,
                                       "value": ["unknownAge": true]]])
        XCTAssertEqual(entries, [constructed])
        var cache = OfflineCache()
        try cache.replace(entries)
        XCTAssertNil(cache.entries.first?.dataAt)
        XCTAssertEqual(cache.entries.first?.savedAt, 500)
        let returned = try XCTUnwrap(Wire.object(cache.entries) as? [[String: Any]])
        XCTAssertTrue(returned[0]["dataAt"] is NSNull, "Unknown age must remain explicit null across the bridge.")
        let restored = try JSONDecoder().decode(OfflineCache.self, from: JSONEncoder().encode(cache))
        XCTAssertEqual(restored, cache)
        for time in [-1, Double.infinity, -Double.infinity, Double.nan] {
            var invalid = entries[0]; invalid.dataAt = time
            XCTAssertThrowsError(try cache.replace([invalid]))
            XCTAssertEqual(cache, restored)
        }
        var known = entries[0]; known.dataAt = 0
        XCTAssertNoThrow(try cache.replace([known]))
        XCTAssertEqual(cache.entries.first?.dataAt, 0)
    }

    func testExplicitNullReplacementFreesRetainedCacheSpaceAndClearsStoppedSnapshot() throws {
        var cache = OfflineCache()
        let boards = CacheEntry(key: "boards", dataAt: 1, savedAt: 2, value: .string(String(repeating: "b", count: 480 * 1024)))
        try cache.replace([boards, .init(key: "snapshot", dataAt: 1, savedAt: 2, value: .object(["followId": .string("A")]))])
        let before = cache
        let settings = CacheEntry(key: "settings", dataAt: 3, savedAt: 4, value: .string(String(repeating: "s", count: 40 * 1024)))
        XCTAssertThrowsError(try cache.replace([settings]), "Omitting a key does not evict its retained value.")
        XCTAssertEqual(cache, before)
        try cache.replace([settings, .init(key: "boards", dataAt: nil, savedAt: 4, value: .null),
                           .init(key: "snapshot", dataAt: nil, savedAt: 4, value: .null)])
        XCTAssertEqual(cache.entries.first(where: { $0.key == "settings" }), settings)
        XCTAssertEqual(cache.entries.first(where: { $0.key == "boards" })?.value, .null)
        XCTAssertEqual(cache.entries.first(where: { $0.key == "snapshot" })?.value, .null)
        XCTAssertLessThan(try JSONEncoder().encode(cache.entries).count, 512 * 1024)
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
        XCTAssertThrowsError(try state.apply(s, fromPage: true, now: 1_000)) { XCTAssertEqual($0 as? NativeError, .unsupported) }
        XCTAssertNil(state.current)
    }

    func testLocalStopRejectsPageResurrectionForTheWholeHour() throws {
        var state = SnapshotState()
        try state.apply(snapshot(), fromPage: true, now: 1_000)
        state.stopFromPage(now: 2_000)
        XCTAssertFalse(try state.apply(snapshot(at: 3_000), fromPage: true, now: 2_001))
        XCTAssertFalse(try state.apply(snapshot(at: 3_000), fromPage: true, now: 3_601_999))
        XCTAssertTrue(try state.apply(snapshot(at: 3_000), fromPage: true, now: 3_602_000))
    }

    func testCacheLimitIsTheContract512KiBNotAnImplementationDerivedLimit() throws {
        var cache = OfflineCache()
        XCTAssertEqual(OfflineCache.byteLimit, 512 * 1024)
        try cache.replace([.init(key: "boards", dataAt: 1, savedAt: 2, value: .string(String(repeating: "x", count: 500 * 1024)))])
        let before = cache
        XCTAssertThrowsError(try cache.replace([.init(key: "boards", dataAt: 1, savedAt: 2, value: .string(String(repeating: "x", count: 513 * 1024)))])) { XCTAssertEqual($0 as? NativeError, .cacheFull) }
        XCTAssertThrowsError(try cache.replace([.init(key: "boards", dataAt: 1, savedAt: 2, value: .string(String(repeating: "é", count: 300 * 1024)))]))
        XCTAssertEqual(cache, before)
    }

    func testConfigurationRejectsHTTPAndChangedRadiusAndDoesNotResolveAmbiguousWifi() throws {
        let json = #"{"v":1,"proxy":{"origin":"https://proxy.example"},"alarm":{"alarm":true,"alarmLeadMin":5},"wifi":{"home":["Panda"],"office":["Panda"]},"regions":[{"place":"home","lat":51,"lon":-0.1,"radiusM":150}]}"#
        var config = try JSONDecoder().decode(NativeConfiguration.self, from: Data(json.utf8))
        XCTAssertEqual(config.wifi.place(for: "Panda Mobile"), "other")
        config.proxy.origin = "http://proxy.example"
        XCTAssertThrowsError(try config.validate())
        config.proxy.origin = "https://proxy.example"; config.regions[0].radiusM = 151
        XCTAssertThrowsError(try config.validate())
    }

    func testQueuedEvidenceIsBoundToJourneyDeviceAndOrigin() throws {
        var document = NativeDocument()
        func entry(_ follow: String, _ device: String = "phone", _ origin: String = "https://one.example", _ event: String = "exit", _ at: Double = 1) -> PendingEvidence {
            .init(followId: follow, deviceID: device, origin: origin, evidence: .init(place: "home", event: event, at: at))
        }
        document.enqueue(entry("A")); document.enqueue(entry("A", "phone", "https://one.example", "enter", 2))
        XCTAssertEqual(document.outbox.count, 2)
        document.enqueue(entry("A", "phone", "https://one.example", "exit", 3))
        XCTAssertEqual(document.outbox.count, 2)
        XCTAssertEqual(document.outbox.last?.evidence.at, 3)
        document.enqueue(entry("B")); XCTAssertEqual(document.outbox.map(\.followId), ["B"])
        document.enqueue(entry("B", "new-phone")); XCTAssertEqual(document.outbox.map(\.deviceID), ["new-phone"])
        document.enqueue(entry("B", "new-phone", "https://two.example")); XCTAssertEqual(document.outbox.map(\.origin), ["https://two.example"])
    }

    func testDeliveredLocationEvidenceIsNotReplayed() {
        var replay = EventReplay()
        replay.retain(.init("wifi", ["place": .string("home")]), delivered: true)
        replay.retain(.init("region", ["place": .string("home"), "event": .string("exit")]), delivered: true)
        XCTAssertTrue(replay.ready().isEmpty)
    }

    func testMinimalFutureVersionPayloadRejectsUnsupportedBeforeShapeDecoding() {
        XCTAssertThrowsError(try Wire.snapshot(["v": 2])) { XCTAssertEqual($0 as? NativeError, .unsupported) }
        XCTAssertThrowsError(try Wire.entries([["v": 2]])) { XCTAssertEqual($0 as? NativeError, .unsupported) }
    }

    func testOldPermissionCompletionCannotCompleteTheNextRequest() throws {
        var gate = RequestGate()
        let first = try gate.begin()
        XCTAssertThrowsError(try gate.begin())
        XCTAssertTrue(gate.finish(first))
        let second = try gate.begin()
        XCTAssertFalse(gate.finish(first))
        XCTAssertEqual(gate.current, second)
        XCTAssertTrue(gate.finish(second))
    }

    func testCorruptButValidJSONCannotIntroduceDuplicateCacheKeys() throws {
        let json = #"{"entries":[{"key":"boards","v":1,"dataAt":1,"savedAt":1,"value":null},{"key":"boards","v":1,"dataAt":2,"savedAt":2,"value":null}]}"#
        var cache = try JSONDecoder().decode(OfflineCache.self, from: Data(json.utf8))
        XCTAssertThrowsError(try cache.validate())
        XCTAssertThrowsError(try cache.replace([]))
    }
}
