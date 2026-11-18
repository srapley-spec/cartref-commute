import Foundation

public struct CacheEntry: Codable, Equatable, Sendable {
    public var key: String
    public var v: Int
    public var dataAt: Double
    public var savedAt: Double
    public var value: JSONValue
    public init(key: String, v: Int = 1, dataAt: Double, savedAt: Double, value: JSONValue) {
        self.key = key; self.v = v; self.dataAt = dataAt; self.savedAt = savedAt; self.value = value
    }
}

public struct OfflineCache: Codable, Equatable, Sendable {
    public static let byteLimit = 512 * 1024
    public private(set) var entries: [CacheEntry] = []
    public init() {}

    /// Whole batch is transactional: overflow or malformed entries leave the previous cache intact.
    public mutating func replace(_ incoming: [CacheEntry]) throws {
        guard Set(entries.map(\.key)).count == entries.count else { throw NativeError.invalid }
        var candidate = Dictionary(uniqueKeysWithValues: entries.map { ($0.key, $0) })
        for entry in incoming {
            guard entry.v == 1 else { throw NativeError.unsupported }
            guard ["snapshot", "boards", "status", "settings"].contains(entry.key),
                  entry.dataAt.isFinite, entry.dataAt >= 0, entry.savedAt.isFinite, entry.savedAt >= 0
            else { throw NativeError.invalid }
            candidate[entry.key] = entry
        }
        let replacement = candidate.values.sorted { $0.key < $1.key }
        guard try JSONEncoder().encode(replacement).count <= Self.byteLimit else { throw NativeError.cacheFull }
        entries = replacement
    }

    public func validate() throws {
        guard Set(entries.map(\.key)).count == entries.count else { throw NativeError.invalid }
        var candidate = OfflineCache()
        try candidate.replace(entries)
    }
}

/// Atomic file replacement permits Siri/extension reads without partial JSON. The app is the sole writer.
public final class NativeFileStore {
    public let url: URL
    public init(directory: URL, name: String = "native-v1.json") throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var directory = directory
        var resource = URLResourceValues(); resource.isExcludedFromBackup = true
        try directory.setResourceValues(resource)
        self.url = directory.appendingPathComponent(name)
    }

    public func load<T: Decodable>(_ type: T.Type) throws -> T? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }

    public func save<T: Encodable>(_ state: T) throws {
        let data = try JSONEncoder().encode(state)
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
