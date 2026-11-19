import Foundation

public struct NativeConfiguration: Codable, Equatable, Sendable {
    public struct Proxy: Codable, Equatable, Sendable { public var origin: String }
    public struct Alarm: Codable, Equatable, Sendable { public var alarm: Bool; public var alarmLeadMin: Int }
    public struct Wifi: Codable, Equatable, Sendable {
        public var home: [String]
        public var office: [String]
        public func place(for ssid: String?) -> String {
            guard let ssid, !ssid.isEmpty else { return "none" }
            let h = home.contains { ssid.hasPrefix($0) }, o = office.contains { ssid.hasPrefix($0) }
            if h && !o { return "home" }
            if o && !h { return "office" }
            return "other"
        }
    }
    public struct Region: Codable, Equatable, Sendable {
        public var place: String
        public var lat: Double
        public var lon: Double
        public var radiusM: Double
    }
    public var v: Int
    public var proxy: Proxy
    public var alarm: Alarm
    public var wifi: Wifi
    public var regions: [Region]
    /// The commute watch is on (#66): the home geofence also tells the proxy you're home. Absent in older pages.
    public var watch: Bool?

    /// Geofences run for the leave alarm or the commute watch; the page decides which regions to send.
    public var geofencing: Bool { alarm.alarm || watch == true }

    public var normalizedOrigin: String { proxy.origin.hasSuffix("/") ? String(proxy.origin.dropLast()) : proxy.origin }

    public func validate() throws {
        guard v == 1 else { throw NativeError.unsupported }
        guard let url = URLComponents(string: proxy.origin), url.scheme == "https", url.host?.isEmpty == false,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/", (0...60).contains(alarm.alarmLeadMin),
              wifi.home.count <= 5, wifi.office.count <= 5,
              (wifi.home + wifi.office).allSatisfy({ !$0.isEmpty && $0.utf8.count <= 128 }),
              regions.count <= 2, Set(regions.map(\.place)).count == regions.count,
              geofencing || regions.isEmpty,
              regions.allSatisfy({ ["home", "office"].contains($0.place) && (-90...90).contains($0.lat)
                  && (-180...180).contains($0.lon) && $0.radiusM == 150 }) else { throw NativeError.invalid }
    }
}

public struct RegionEvidence: Codable, Equatable, Sendable {
    public var kind = "region"
    public var place: String
    public var event: String
    public var at: Double
    public init(place: String, event: String, at: Double) { self.place = place; self.event = event; self.at = at }
}

public struct PendingEvidence: Codable, Equatable, Sendable, Identifiable {
    public var id = UUID()
    public var followId: String
    public var deviceID: String
    public var origin: String
    public var evidence: RegionEvidence
    public init(followId: String, deviceID: String, origin: String, evidence: RegionEvidence) {
        self.followId = followId; self.deviceID = deviceID; self.origin = origin; self.evidence = evidence
    }
}

public struct NativeDocument: Codable, Equatable, Sendable {
    public var v = 1
    public var snapshots = SnapshotState()
    public var cache = OfflineCache()
    public var replay = EventReplay()
    public var configuration: NativeConfiguration?
    public var outbox: [PendingEvidence] = []
    public var activityID: String?
    public var activityFollowID: String?
    public var regionGeneration: String?
    public init() {}

    public func validate() throws {
        guard v == 1 else { throw NativeError.unsupported }
        try snapshots.current?.validate()
        try configuration?.validate()
        try cache.validate()
    }

    public mutating func enqueue(_ entry: PendingEvidence) {
        // Coalesce only identical transport event kinds in the same journey/registration. An exit remains
        // distinct from a later entry; their timestamps and the engine's cancellation rule remain intact.
        outbox.removeAll { $0.followId != entry.followId || $0.deviceID != entry.deviceID || $0.origin != entry.origin ||
            ($0.evidence.place == entry.evidence.place && $0.evidence.event == entry.evidence.event) }
        outbox.append(entry)
    }
}
