import ActivityKit
import CommuteNativeCore
import SwiftUI
import WidgetKit

/// This extension contains a Live Activity only. The home-screen widget remains parked.
@main
struct CommuteJourneyBundle: WidgetBundle {
    var body: some Widget { CommuteJourneyActivity() }
}

struct CommuteJourneyActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JourneyActivityAttributes.self) { context in
            JourneyLockScreen(snapshot: context.state, stale: context.isStale)
                .widgetURL(URL(string: context.state.deepLink))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.headline.label).font(.caption.weight(.semibold)).lineLimit(2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SnapshotClock(time: context.state.headline.t).font(.title2.weight(.bold)).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 5) {
                        SnapshotCountdown(snapshot: context.state)
                        if let step = context.state.step { SnapshotStep(step: step) }
                        if let progress = context.state.progress?.line { Text(progress).font(.caption).lineLimit(1) }
                        SnapshotAge(snapshot: context.state, stale: context.isStale)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: context.isStale || context.state.stale ? "clock.badge.exclamationmark" : "tram.fill")
            } compactTrailing: {
                SnapshotClock(time: context.state.headline.t).font(.caption.weight(.semibold)).monospacedDigit()
            } minimal: {
                Image(systemName: context.isStale || context.state.stale ? "clock.badge.exclamationmark" : "tram.fill")
            }
            .widgetURL(URL(string: context.state.deepLink))
            .keylineTint(Color(red: 0.61, green: 0.76, blue: 1))
        }
    }
}

private struct JourneyLockScreen: View {
    let snapshot: JourneySnapshot
    let stale: Bool
    @Environment(\.colorScheme) private var scheme
    private var ink: Color { scheme == .dark ? Color(hex: 0xf0f5fc) : Color(hex: 0x142436) }
    private var accent: Color { scheme == .dark ? Color(hex: 0x9bc3ff) : Color(hex: 0x1453b6) }
    private var card: Color { scheme == .dark ? Color(hex: 0x121c28) : .white }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.headline.label).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    if snapshot.headline.t != nil {
                        SnapshotClock(time: snapshot.headline.t).font(.system(size: 30, weight: .bold)).monospacedDigit()
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
                if let arrival = snapshot.arrive {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(arrival.label).font(.system(size: 11)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                        SnapshotClock(time: arrival.t).font(.system(size: 20, weight: .semibold)).monospacedDigit()
                    }.frame(maxWidth: 100, alignment: .trailing)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                SnapshotCountdown(snapshot: snapshot).foregroundStyle(accent)
                if let status = snapshot.status, !status.text.isEmpty {
                    Spacer(minLength: 0)
                    Text(status.text).font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(statusColor(status.level)).lineLimit(1)
                }
            }
            // What to do next (#57 H29): drawn as the page words it; the train below is gone once you're off it.
            if let step = snapshot.step { SnapshotStep(step: step) }
            if let train = snapshot.train {
                HStack(spacing: 8) {
                    Text(train.name).lineLimit(1)
                    Spacer(minLength: 0)
                    if let platform = train.platform, !platform.isEmpty { Text("Platform \(platform)").fontWeight(.semibold) }
                }.font(.system(size: 12))
            }
            if let progress = snapshot.progress?.line { Text(progress).font(.system(size: 12)).lineLimit(1) }
            SnapshotAge(snapshot: snapshot, stale: stale)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .activityBackgroundTint(card)
    }

    private func statusColor(_ level: String) -> Color {
        switch level {
        case "bad": return Color(hex: scheme == .dark ? 0xff9daf : 0xae2540)
        case "warn": return Color(hex: scheme == .dark ? 0xffd08a : 0x805000)
        case "ok": return Color(hex: scheme == .dark ? 0x82ddb8 : 0x14654c)
        default: return ink
        }
    }
}

private struct SnapshotStep: View {
    let step: JourneySnapshot.Step
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(step.text).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let detail = step.detail, !detail.isEmpty { Text(detail).font(.system(size: 12)).lineLimit(1) }
        }
    }
}

private struct SnapshotClock: View {
    let time: Double?
    var body: some View {
        if let time { Text(Date(timeIntervalSince1970: time / 1000), style: .time) }
        else { Text("—") }
    }
}

private struct SnapshotCountdown: View {
    let snapshot: JourneySnapshot
    var body: some View {
        if let time = snapshot.headline.t, let words = snapshot.headline.countdown {
            if !words.wording.isEmpty || words.showsTimer {
                Group {
                    if words.showsTimer {
                        // Inline system timer text wraps with the engine's words, without a fixed timer column.
                        // Wording changes only on a content update; Swift has no urgency rule.
                        let timer = Text(timerInterval: Date(timeIntervalSince1970: snapshot.at / 1000)...Date(timeIntervalSince1970: max(snapshot.at, time) / 1000), countsDown: true)
                        Text("\(words.wording)\(words.state == .urgent ? " · " : " ")\(timer)")
                            .monospacedDigit()
                    } else { Text(words.wording) }
                }.font(.system(size: 13, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct SnapshotAge: View {
    let snapshot: JourneySnapshot
    let stale: Bool
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        HStack(spacing: 4) {
            if stale || snapshot.stale { Text("Out of date ·").fontWeight(.semibold) }
            if let at = snapshot.dataAt {
                Text("As of")
                Text(Date(timeIntervalSince1970: at / 1000), style: .time)
                Text("·")
                Text(Date(timeIntervalSince1970: at / 1000), style: .relative)
            } else { Text("Not updated yet") }
        }.font(.system(size: 10))
            .foregroundStyle(Color(hex: scheme == .dark ? 0xaabbd0 : 0x506174)).lineLimit(1)
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
}
