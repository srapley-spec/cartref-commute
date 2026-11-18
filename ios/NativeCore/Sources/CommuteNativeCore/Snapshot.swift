import Foundation

/// An engine result, not a native journey model. The JSON shape is also ActivityKit's content-state shape.
public struct JourneySnapshot: Codable, Hashable, Sendable {
    public struct Countdown: Codable, Hashable, Sendable {
        public var step: String
        public var calm: String
        public var urgent: String
        public var passed: String?
    }
    public struct Headline: Codable, Hashable, Sendable {
        public var label: String
        public var t: Double?
        public var countdown: Countdown?
    }
    public struct Arrival: Codable, Hashable, Sendable {
        public var label: String
        public var t: Double?
    }
    public struct Train: Codable, Hashable, Sendable {
        public var name: String
        public var from: String
        public var to: String
        public var platform: String?
        public var scheduled: Double?
        public var expected: Double?
        public var late: Double?
    }
    public struct Progress: Codable, Hashable, Sendable {
        public var next: String?
        public var stopsToGo: Int?
        public var line: String?
    }
    public struct Status: Codable, Hashable, Sendable {
        public var level: String
        public var text: String
    }
    public struct Alarm: Codable, Hashable, Sendable {
        public var at: Double?
        public var leadMin: Double
        public var cancelled: Bool
        public var cancelOnExit: String?
    }
    public var v: Int
    public var at: Double
    public var source: String
    public var dataAt: Double?
    public var stale: Bool
    public var staleAt: Double?
    public var confirmed: Bool
    public var mode: String
    public var direction: String
    public var followId: String
    public var phase: String
    public var headline: Headline
    public var arrive: Arrival?
    public var train: Train?
    public var progress: Progress?
    public var status: Status?
    public var alarm: Alarm?
    public var deepLink: String

    public func validate() throws {
        guard v == 1 else { throw NativeError.unsupported }
        guard !followId.isEmpty, followId.utf8.count <= 256, at.isFinite, at >= 0,
              [dataAt, staleAt, headline.t, arrive?.t, alarm?.at].compactMap({ $0 }).allSatisfy({ $0.isFinite && $0 >= 0 })
        else { throw NativeError.invalid }
    }

    public var staleDate: Date? { staleAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
}

/// Only transport ordering and engine-issued cancellation directives live here; no train/route inference.
public struct SnapshotState: Codable, Equatable, Sendable {
    public private(set) var current: JourneySnapshot?
    public private(set) var tombstones: [String: Double] = [:]
    public private(set) var cancelledOnExit: String?
    public init() {}

    @discardableResult
    public mutating func apply(_ snapshot: JourneySnapshot, fromPage: Bool, now: Double) throws -> Bool {
        try snapshot.validate()
        tombstones = tombstones.filter { $0.value > now }
        guard tombstones[snapshot.followId] == nil else { return false }
        if let old = current, old.followId == snapshot.followId {
            guard snapshot.at >= old.at else { return false }
        } else {
            guard fromPage else { return false }
            if let old = current { tombstones[old.followId] = now + 3_600_000 }
            cancelledOnExit = nil
        }
        current = snapshot
        return true
    }

    @discardableResult
    public mutating func stop(followId: String, at: Double, now: Double) -> Bool {
        guard let old = current, old.followId == followId, at.isFinite, at >= old.at else { return false }
        tombstones[followId] = now + 3_600_000
        current = nil
        cancelledOnExit = nil
        return true
    }

    public mutating func stopFromPage(now: Double) {
        if let old = current { _ = stop(followId: old.followId, at: max(now, old.at), now: now) }
    }

    @discardableResult
    public mutating func regionExit(place: String, at: Double) -> Bool {
        guard let snapshot = current, let alarm = snapshot.alarm, !alarm.cancelled,
              alarm.cancelOnExit == place, at > snapshot.at else { return false }
        cancelledOnExit = snapshot.followId
        return true
    }

    public func scheduledAlarm(at now: Double, enabled: Bool, authorized: Bool) -> JourneySnapshot.Alarm? {
        guard enabled, authorized, let snapshot = current, cancelledOnExit != snapshot.followId,
              let alarm = snapshot.alarm, !alarm.cancelled, let time = alarm.at, time > now else { return nil }
        return alarm
    }
}
