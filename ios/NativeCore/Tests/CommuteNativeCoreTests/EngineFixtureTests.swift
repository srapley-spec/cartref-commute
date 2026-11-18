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
            let snapshot = try JSONDecoder().decode(JourneySnapshot.self, from: Data(contentsOf: file))
            try snapshot.validate()
            let roundTrip = try JSONDecoder().decode(JourneySnapshot.self, from: JSONEncoder().encode(snapshot))
            XCTAssertEqual(snapshot, roundTrip, file.lastPathComponent)
        }
        let background = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("apns-background.json"))) as! [String: Any]
        let live = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("apns-liveactivity-update.json"))) as! [String: Any]
        let content = (live["aps"] as! [String: Any])["content-state"]!
        let snapshot = try Wire.decode(JourneySnapshot.self, content)
        XCTAssertEqual(snapshot, try Wire.decode(JourneySnapshot.self, background["snapshot"]!))
        let staleSeconds = (live["aps"] as! [String: Any])["stale-date"] as! Double
        XCTAssertEqual(snapshot.staleDate?.timeIntervalSince1970, staleSeconds)
    }
}
