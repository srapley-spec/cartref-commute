import Foundation

/// Reads the engine's presentation verbatim. A nil answer means the intent opens the page to plan.
public enum SiriPresentation {
    public static let nextHomeURL = URL(string: "commute://next?direction=home&follow=1")!

    public static func answer(_ snapshot: JourneySnapshot?, now: Double, clock: (Double) -> String) -> String? {
        guard let snapshot else { return nil }
        var answer = snapshot.headline.label
        if let time = snapshot.headline.t { answer += " " + clock(time) }
        if let at = snapshot.dataAt { answer += ". As of " + clock(at) }
        else { answer += ". Not updated yet" }
        if snapshot.stale || snapshot.staleAt.map({ $0 <= now }) == true { answer += ". This data is out of date" }
        return answer
    }
}
