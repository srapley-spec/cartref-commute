import Foundation

public struct NativeEvent: Codable, Equatable, Sendable {
    public var name: String
    public var data: [String: JSONValue]
    public init(_ name: String, _ data: [String: JSONValue]) { self.name = name; self.data = data }
}

public struct EventReplay: Codable, Equatable, Sendable {
    private var apns: NativeEvent?
    private var activities: [String: NativeEvent] = [:]
    private var evidence: [NativeEvent] = []
    private var open: NativeEvent?
    private var resume: NativeEvent?
    public init() {}

    public mutating func retain(_ event: NativeEvent, delivered: Bool) {
        switch event.name {
        case "apns": apns = event
        case "liveActivity":
            if case .string(let id) = event.data["followId"] { activities[id] = event }
        case "wifi", "region":
            if !delivered { evidence.append(event); evidence = Array(evidence.suffix(20)) }
        case "open": if !delivered { open = event }
        case "resume": if !delivered { resume = event }
        default: break
        }
    }

    public mutating func removeActivity(followId: String) { activities.removeValue(forKey: followId) }

    public mutating func ready() -> [NativeEvent] {
        let result = [apns].compactMap { $0 } + activities.keys.sorted().compactMap { activities[$0] } + evidence + [resume, open].compactMap { $0 }
        evidence = []; resume = nil; open = nil
        return result
    }
}
