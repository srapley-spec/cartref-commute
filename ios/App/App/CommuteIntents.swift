import AppIntents
import Foundation
import CommuteNativeCore

private let nextHomeURL = URL(string: "commute://next?direction=home&follow=1")!

struct WhenToLeaveIntent: AppIntent {
    static var title: LocalizedStringResource = "When do I need to leave?"
    static var description = IntentDescription("Read the last update for your followed Commute journey, or open Commute to plan.")
    static var supportedModes: IntentModes { [.background, .foreground(.dynamic)] }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snapshot = NativeRuntime.shared.document.snapshots.current else {
            return .result(opensIntent: OpenURLIntent(nextHomeURL), dialog: "Opening Commute.")
        }
        let formatter = DateFormatter(); formatter.timeStyle = .short; formatter.dateStyle = .none
        var answer = snapshot.headline.label
        if let time = snapshot.headline.t { answer += " " + formatter.string(from: Date(timeIntervalSince1970: time / 1000)) }
        if let at = snapshot.dataAt { answer += ". As of " + formatter.string(from: Date(timeIntervalSince1970: at / 1000)) }
        else { answer += ". Not updated yet" }
        if snapshot.stale || snapshot.staleDate.map({ $0 <= Date() }) == true { answer += ". This data is out of date" }
        return .result(dialog: IntentDialog(stringLiteral: answer))
    }
}

struct FollowNextTrainHomeIntent: AppIntent {
    static var title: LocalizedStringResource = "Follow the next train home"
    static var description = IntentDescription("Open Commute to find and follow the next train home.")
    static var supportedModes: IntentModes { .foreground }

    func perform() async throws -> some IntentResult {
        .result(opensIntent: OpenURLIntent(nextHomeURL))
    }
}

struct CommuteShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: WhenToLeaveIntent(), phrases: ["When do I need to leave with \(.applicationName)?"],
            shortTitle: "When to leave", systemImageName: "clock")
        AppShortcut(intent: FollowNextTrainHomeIntent(), phrases: ["Follow the next train home with \(.applicationName)"],
            shortTitle: "Next train home", systemImageName: "tram.fill")
    }
}
