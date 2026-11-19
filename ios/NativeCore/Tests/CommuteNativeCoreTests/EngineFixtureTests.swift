import XCTest
@testable import CommuteNativeCore

final class EngineFixtureTests: XCTestCase {
    func testPublishedEngineAndAPNsFixturesDecodeWithoutNativeJourneyInference() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let path = ProcessInfo.processInfo.environment["NATIVE_CONTRACT_FIXTURES"]
        let directory = path.map { URL(fileURLWithPath: $0) } ?? root.appendingPathComponent("tests/fixtures/native")
        guard FileManager.default.fileExists(atPath: directory.path) else {
            throw XCTSkip("Owner's native fixtures have not reached main; supply NATIVE_CONTRACT_FIXTURES for development checks.")
        }
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("snapshot-") && $0.pathExtension == "json" }
        XCTAssertGreaterThanOrEqual(files.count, 9)
        for file in files {
            let data = try Data(contentsOf: file)
            guard let snapshot = try JSONDecoder().decode(JourneySnapshot?.self, from: data) else {
                XCTAssertEqual(file.lastPathComponent, "snapshot-page-stopped.json", "Only a stopped page fixture is null.")
                continue
            }
            try snapshot.validate()
            let roundTrip = try JSONDecoder().decode(JourneySnapshot.self, from: JSONEncoder().encode(snapshot))
            XCTAssertEqual(snapshot, roundTrip, file.lastPathComponent)
            let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            if let headline = raw["headline"] as? [String: Any], let countdown = headline["countdown"] as? [String: Any] {
                XCTAssertEqual(snapshot.headline.countdown?.state?.rawValue, countdown["state"] as? String, file.lastPathComponent)
                XCTAssertEqual(snapshot.headline.countdown?.urgentAt, countdown["urgentAt"] as? Double, file.lastPathComponent)
                XCTAssertEqual(snapshot.headline.countdown?.passedAt, countdown["passedAt"] as? Double, file.lastPathComponent)
            }
            // #57 H29: the step is the engine's words, carried as they are (absent or null decodes as none).
            let rawStep = raw["step"] as? [String: Any]
            XCTAssertEqual(snapshot.step?.text, rawStep?["text"] as? String, file.lastPathComponent)
            XCTAssertEqual(snapshot.step?.detail, rawStep?["detail"] as? String, file.lastPathComponent)
        }
        let atHub = try JSONDecoder().decode(JourneySnapshot.self, from: Data(contentsOf: directory.appendingPathComponent("snapshot-page-at-hub-step.json")))
        XCTAssertEqual(atHub.step, .init(text: "Get on the Met to Aldgate", detail: "eastbound · Platform 2 · due 18:40"))
        XCTAssertNil(atHub.train, "off the train, the train has left the card")
        // #71: the leg strip is the engine's, drawn as it comes: dots, marker, colour, labels.
        let tube = try JSONDecoder().decode(JourneySnapshot.self, from: Data(contentsOf: directory.appendingPathComponent("snapshot-page-tube-strip.json")))
        let strip = try XCTUnwrap(tube.strip)
        XCTAssertEqual(strip.stations, 6); XCTAssertEqual(strip.passed, 1)
        XCTAssertEqual(strip.marker, .init(at: 1.5, kind: "reported")); XCTAssertEqual(strip.marker?.estimated, false)
        XCTAssertEqual(strip.rgb, 0x9B0058); XCTAssertEqual(strip.fraction(1.5), 0.3, accuracy: 1e-9)
        XCTAssertEqual([strip.last, strip.next, strip.yours], ["Farringdon", "Barbican", "Aldgate"])
        XCTAssertNil(atHub.strip, "snapshots without a strip decode as none")
        var bad = tube; bad.strip?.marker?.at = 9
        XCTAssertThrowsError(try bad.validate(), "a marker beyond your stop is refused")
        bad = tube; bad.strip?.stations = 1
        XCTAssertThrowsError(try bad.validate(), "a strip needs two stations")
        let background = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("apns-background.json"))) as! [String: Any]
        let live = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("apns-liveactivity-update.json"))) as! [String: Any]
        let content = (live["aps"] as! [String: Any])["content-state"]!
        let snapshot = try Wire.decode(JourneySnapshot.self, content)
        XCTAssertEqual(snapshot, try Wire.decode(JourneySnapshot.self, background["snapshot"]!))
        let staleSeconds = (live["aps"] as! [String: Any])["stale-date"] as! Double
        XCTAssertEqual(snapshot.staleDate?.timeIntervalSince1970, staleSeconds)
        let stop = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("apns-background-stop.json"))) as! [String: Any]
        XCTAssertEqual(try Wire.remoteSnapshot(stop), .stop(followId: "f9", at: 1794939600000))
    }
}
