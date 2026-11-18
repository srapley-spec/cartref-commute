import Foundation

public enum NativeError: String, Error {
    case unsupported, invalid, cacheFull, unavailable
}

/// JSON remains opaque when it belongs to the page. In particular, native code never interprets cached boards.
public enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self), n.isFinite { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .string(let x): try c.encode(x)
        case .array(let x): try c.encode(x)
        case .object(let x): try c.encode(x)
        }
    }
}

public enum Wire {
    public static func snapshot(_ object: Any) throws -> JourneySnapshot {
        guard let object = object as? [String: Any] else { throw NativeError.invalid }
        try version(object)
        return try decode(JourneySnapshot.self, object)
    }

    public static func entries(_ object: Any) throws -> [CacheEntry] {
        guard let entries = object as? [[String: Any]] else { throw NativeError.invalid }
        for entry in entries { try version(entry) }
        return try decode([CacheEntry].self, entries)
    }

    public static func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        guard JSONSerialization.isValidJSONObject(object) else { throw NativeError.invalid }
        return try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    public static func object<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: .fragmentsAllowed)
    }

    public static func version(_ object: [String: Any]) throws {
        guard let version = object["v"] else { return } // v1's no-argument and wrapper calls omit v.
        guard let n = version as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue == 1 else {
            throw NativeError.unsupported
        }
    }
}

/// A late completion from a previous system permission request cannot finish a newer one.
public struct RequestGate {
    public private(set) var current: UUID?
    public init() {}
    public mutating func begin() throws -> UUID {
        guard current == nil else { throw NativeError.unavailable }
        let id = UUID(); current = id; return id
    }
    public mutating func finish(_ id: UUID) -> Bool {
        guard current == id else { return false }
        current = nil; return true
    }
}
