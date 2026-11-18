#if os(iOS)
import ActivityKit

public struct JourneyActivityAttributes: ActivityAttributes {
    public typealias ContentState = JourneySnapshot
    public var followId: String
    public init(followId: String) { self.followId = followId }
}
#endif
