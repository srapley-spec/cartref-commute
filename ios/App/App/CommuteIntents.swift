import AppIntents
import Foundation
import CommuteNativeCore

struct WhenToLeaveIntent: AppIntent {
    static var title: LocalizedStringResource = "When do I need to leave?"
    static var description = IntentDescription("Read the last update for your followed Commute journey, or open Commute to plan.")
    static var supportedModes: IntentModes { [.background, .foreground(.dynamic)] }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let formatter = DateFormatter(); formatter.timeStyle = .short; formatter.dateStyle = .none
        guard let answer = SiriPresentation.answer(NativeRuntime.shared.document.snapshots.current, now: NativeRuntime.now,
            clock: { formatter.string(from: Date(timeIntervalSince1970: $0 / 1000)) }) else {
            try await continueInForeground("Opening Commute.", alwaysConfirm: false)
            NativeRuntime.shared.opened(SiriPresentation.nextHomeURL)
            return .result(dialog: "Opening Commute.")
        }
        return .result(dialog: IntentDialog(stringLiteral: answer))
    }
}

struct FollowNextTrainHomeIntent: AppIntent {
    static var title: LocalizedStringResource = "Follow the next train home"
    static var description = IntentDescription("Open Commute to find and follow the next train home.")
    static var supportedModes: IntentModes { .foreground }

    @MainActor
    func perform() async throws -> some IntentResult {
        NativeRuntime.shared.opened(SiriPresentation.nextHomeURL)
        return .result()
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
