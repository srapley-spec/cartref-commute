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
            // The leg strip (#71) replaces the one-line progress when the engine sends one. It holds its last position
            // between updates: a Live Activity doesn't animate by itself.
            if let strip = snapshot.strip { SnapshotStrip(strip: strip, ink: ink, accent: accent, card: card) }
            else if let progress = snapshot.progress?.line { Text(progress).font(.system(size: 12)).lineLimit(1) }
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

private struct SnapshotStrip: View {
    let strip: JourneySnapshot.Strip
    let ink: Color
    let accent: Color
    let card: Color
    private var line: Color { strip.rgb.map { Color(hex: $0) } ?? accent }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            GeometryReader { geo in
                let inset: CGFloat = 9, width = max(1, geo.size.width - inset * 2), mid = geo.size.height / 2
                let x = { (p: Double) in inset + width * CGFloat(strip.fraction(p)) }
                let filledTo = strip.marker.flatMap { $0.estimated ? nil : $0.at } ?? Double(strip.passed ?? 0)
                ZStack(alignment: .topLeading) {
                    Capsule().fill(line.opacity(0.35)).frame(width: width, height: 4).position(x: inset + width / 2, y: mid)
                    Capsule().fill(ink).frame(width: max(0, x(filledTo) - inset), height: 4).position(x: inset + (x(filledTo) - inset) / 2, y: mid)
                    ForEach(0..<strip.stations, id: \.self) { k in
                        let yours = k == strip.stations - 1, passed = strip.passed.map { k <= $0 } ?? false
                        Circle().fill(passed ? ink : card)
                            .overlay(Circle().stroke(yours ? ink : (passed ? ink : line), lineWidth: yours ? 3 : 2))
                            .frame(width: yours ? 12 : 8, height: yours ? 12 : 8)
                            .position(x: x(Double(k)), y: mid)
                    }
                    if let marker = strip.marker {
                        Circle().fill(marker.estimated ? card : accent)
                            .overlay(Circle().strokeBorder(accent, style: StrokeStyle(lineWidth: marker.estimated ? 2 : 0, dash: marker.estimated ? [3, 2] : [])))
                            .overlay(Circle().stroke(card, lineWidth: marker.estimated ? 0 : 2))
                            .frame(width: 16, height: 16)
                            .position(x: x(marker.at), y: mid)
                    }
                }
            }.frame(height: 18).accessibilityHidden(true)
            HStack(spacing: 6) {
                if let last = strip.last { Text(last) }
                if let next = strip.next {
                    if strip.last != nil { Spacer(minLength: 0) }
                    Text("Next: \(next)").fontWeight(.semibold).foregroundStyle(accent)
                }
                Spacer(minLength: 0)
                Text("\(strip.yours)\(strip.yoursAt.map { " " + Self.clock.string(from: Date(timeIntervalSince1970: $0 / 1000)) } ?? "")")
            }.font(.system(size: 11)).lineLimit(1)
        }.accessibilityElement(children: .combine)
    }
    private static let clock: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "HH:mm"; f.timeZone = TimeZone(identifier: "Europe/London"); return f
    }()
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
