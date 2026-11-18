import Capacitor
import CommuteNativeCore
import CoreLocation
import WebKit
import XCTest
@testable import App

@MainActor
final class NativeRuntimeTests: XCTestCase {
    func testInterruptedConfigurationCannotPairNewCredentialsWithOldProxyAfterRestart() throws {
        let disk = MemoryNativeDisk(), keychain = MemoryNativeCredentials()
        let runtime = NativeRuntime(storage: disk, credentialStore: keychain, platformEnabled: false)
        try runtime.configure(configuration(origin: "https://old.example"), credentials: .init(id: "old", token: "old-test-token"))
        try runtime.publish(snapshot())
        disk.failWrites = true
        XCTAssertThrowsError(try runtime.configure(configuration(origin: "https://new.example"), credentials: .init(id: "new", token: "new-test-token")))
        XCTAssertEqual(keychain.value?.origin, "https://new.example")
        disk.failWrites = false
        let restarted = NativeRuntime(storage: disk, credentialStore: keychain, platformEnabled: false)
        XCTAssertEqual(restarted.document.configuration?.proxy.origin, "https://old.example")
        restarted.locationManager(CLLocationManager(), didExitRegion: circle(restarted.regionIdentifier("office")))
        XCTAssertTrue(restarted.document.outbox.isEmpty, "An unbound credential must not authorize any queued request.")
    }

    func testFailedKeychainWriteKeepsConfigurationAndSavedJourney() throws {
        let disk = MemoryNativeDisk(), keychain = MemoryNativeCredentials()
        let runtime = NativeRuntime(storage: disk, credentialStore: keychain, platformEnabled: false)
        try runtime.configure(configuration(), credentials: .init(id: "old", token: "test-token"))
        try runtime.publish(snapshot())
        let before = disk.state
        keychain.failWrites = true
        XCTAssertThrowsError(try runtime.configure(configuration(origin: "https://new.example"), credentials: .init(id: "new", token: "new-token")))
        XCTAssertEqual(disk.state, before)
        XCTAssertEqual(runtime.document, before)
    }

    func testSupersededRegionCannotCancelAndCurrentExitCancelsBeforeFailedDiskWrite() throws {
        let disk = MemoryNativeDisk(), keychain = MemoryNativeCredentials()
        let runtime = NativeRuntime(storage: disk, credentialStore: keychain, platformEnabled: false)
        try runtime.configure(configuration(), credentials: .init(id: "phone", token: "test-token"))
        try runtime.publish(snapshot())
        let oldRegion = circle(runtime.regionIdentifier("office"))
        var moved = try configuration(); moved.regions[0].lat = 52
        try runtime.configure(moved, credentials: .init(id: "phone", token: "test-token"))
        runtime.locationManager(CLLocationManager(), didExitRegion: oldRegion)
        XCTAssertNil(runtime.document.snapshots.cancelledOnExit)
        XCTAssertTrue(runtime.document.outbox.isEmpty)
        let calls = NativeCallLog()
        disk.onSave = { calls.values.append("save") }; disk.failWrites = true
        let surfaces = ProbeSurfaces(); surfaces.onCancel = { calls.values.append("cancel") }; runtime.surfaces = surfaces
        runtime.locationManager(CLLocationManager(), didExitRegion: circle(runtime.regionIdentifier("office"), lat: 52))
        XCTAssertEqual(calls.values.first, "cancel")
        XCTAssertEqual(runtime.document.snapshots.cancelledOnExit, "A")
        XCTAssertEqual(runtime.document.outbox.count, 1)
    }

    func testDelayedWifiCallbackCannotApplyNewTimestampOrOldConfiguration() throws {
        let runtime = NativeRuntime(storage: MemoryNativeDisk(), credentialStore: MemoryNativeCredentials(), platformEnabled: false)
        try runtime.configure(configuration(), credentials: nil)
        let stale = try XCTUnwrap(runtime.makeWifiReceiver())
        var changed = try configuration(); changed.wifi.home = ["Different"]
        try runtime.configure(changed, credentials: nil)
        stale("Panda Net")
        var replay = runtime.document.replay
        XCTAssertTrue(replay.ready().isEmpty)
        let first = try XCTUnwrap(runtime.makeWifiReceiver()), second = try XCTUnwrap(runtime.makeWifiReceiver())
        first("Different")
        replay = runtime.document.replay; XCTAssertTrue(replay.ready().isEmpty)
        let before = NativeRuntime.now
        second("Ciklum")
        replay = runtime.document.replay
        let event = try XCTUnwrap(replay.ready().first)
        XCTAssertEqual(event.name, "wifi"); XCTAssertEqual(event.data["place"], .string("office"))
        if case .number(let observed)? = event.data["at"] { XCTAssertLessThanOrEqual(observed, before) }
        else { XCTFail("Missing observation time") }
        XCTAssertEqual(Set(event.data.keys), ["place", "at"])
    }

    func testUnknownVersionAndUnidentifiedRemoteStopCannotClearTheCurrentJourney() async throws {
        let runtime = NativeRuntime(storage: MemoryNativeDisk(), credentialStore: MemoryNativeCredentials(), platformEnabled: false)
        try runtime.publish(snapshot())
        let unknown = await runtime.receivePush(["snapshot": ["v": 2]])
        XCTAssertEqual(unknown, .noData)
        let stop = await runtime.receivePush(["snapshot": NSNull()])
        XCTAssertEqual(stop, .noData)
        XCTAssertEqual(runtime.document.snapshots.current?.followId, "A")
    }

    func testSiriPageHandoffIsQueuedUntilThePageIsListening() throws {
        let runtime = NativeRuntime(storage: MemoryNativeDisk(), credentialStore: MemoryNativeCredentials(), platformEnabled: false)
        runtime.opened(URL(string: "https://example.invalid/")!)
        runtime.opened(URL(string: "commute://unrecognized")!)
        runtime.opened(SiriPresentation.nextHomeURL)
        var replay = runtime.document.replay
        let pending = replay.ready()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.name, "open")
        XCTAssertEqual(pending.first?.data["url"], .string("commute://next?direction=home&follow=1"))
        XCTAssertTrue(replay.ready().isEmpty)
    }

    func testRealCapacitorPluginCacheAndVersionErrors() async throws {
        let runtime = NativeRuntime(storage: MemoryNativeDisk(), credentialStore: MemoryNativeCredentials(), platformEnabled: false)
        let rules = try await WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "CommuteNativeProbe",
            encodedContentRuleList: #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]"#)
        let controller = NativeBridgeProbe(); controller.runtime = runtime; controller.rules = rules
        let window = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow))
        let original = window.rootViewController
        defer { window.rootViewController = original; window.makeKeyAndVisible() }
        window.rootViewController = controller; window.makeKeyAndVisible(); window.layoutIfNeeded()
        let webView = try XCTUnwrap(controller.webView)
        let deadline = ContinuousClock.now.advanced(by: .seconds(300))
        var loaded = false, evaluating = false
        while ContinuousClock.now < deadline && !loaded {
            if !evaluating {
                evaluating = true
                webView.evaluateJavaScript("document.readyState === 'complete' && !!window.Capacitor?.Plugins?.CommuteNative") { value, _ in
                    loaded = value as? Bool == true; evaluating = false
                }
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(loaded)
        guard loaded else { return }
        let result = try await webView.callAsyncJavaScript(#"""
            const p = window.Capacitor.Plugins.CommuteNative;
            const errorCode = async f => { try { await f(); return 'NO_ERROR'; } catch (e) { return e.code; } };
            const snapshot = await errorCode(() => p.publish({snapshot:{v:2}}));
            const cache = await errorCode(() => p.cache({entries:[{v:2}]}));
            const wrapper = await errorCode(() => p.configure({v:2}));
            await p.cache({entries:[{key:'boards',v:1,dataAt:10,savedAt:50,value:{opaque:[false,null,'λ']}}]});
            const saved = await p.cached({});
            await p.ready({v:1});
            return {snapshot,cache,wrapper,entries:saved.entries};
            """#, arguments: [:], in: nil, contentWorld: .page) as? [String: Any]
        XCTAssertEqual(result?["snapshot"] as? String, "unsupported")
        XCTAssertEqual(result?["cache"] as? String, "unsupported")
        XCTAssertEqual(result?["wrapper"] as? String, "unsupported")
        let entries = try Wire.entries(XCTUnwrap(result?["entries"]))
        XCTAssertEqual(entries.first?.dataAt, 10)
        XCTAssertEqual(entries.first?.value, .object(["opaque": .array([.bool(false), .null, .string("λ")])]))
    }

    private func configuration(origin: String = "https://proxy.example") throws -> NativeConfiguration {
        try Wire.decode(NativeConfiguration.self, ["v": 1, "proxy": ["origin": origin], "alarm": ["alarm": true, "alarmLeadMin": 5],
            "wifi": ["home": ["Panda"], "office": ["Ciklum"]], "regions": [["place": "office", "lat": 51.0, "lon": 0.0, "radiusM": 150.0]]])
    }
    private func snapshot() throws -> JourneySnapshot {
        try Wire.snapshot(["v": 1, "at": 1000, "source": "page", "dataAt": 900, "stale": false, "staleAt": 180900,
            "confirmed": false, "mode": "trip", "direction": "home", "followId": "A", "phase": "leave",
            "headline": ["label": "Leave by", "t": 4000], "alarm": ["at": 3000, "leadMin": 5, "cancelled": false, "cancelOnExit": "office"], "deepLink": "commute://follow/A"])
    }
    private func circle(_ id: String, lat: Double = 51) -> CLCircularRegion {
        CLCircularRegion(center: .init(latitude: lat, longitude: 0), radius: 150, identifier: id)
    }
}

private final class MemoryNativeDisk: NativeDocumentStorage {
    var state: NativeDocument?
    var failWrites = false
    var onSave: (() -> Void)?
    func load() throws -> NativeDocument? { state }
    func save(_ state: NativeDocument) throws {
        onSave?()
        if failWrites { throw NativeError.unavailable }
        self.state = state
    }
}
private final class MemoryNativeCredentials: NativeCredentialStorage {
    var value: BoundRegistration?
    var failWrites = false
    func read() throws -> BoundRegistration? { value }
    func write(_ value: NativeCredentials?, origin: String) throws {
        if failWrites { throw NativeError.unavailable }
        self.value = value.map { BoundRegistration(origin: origin, credentials: $0) }
    }
}
@MainActor private final class NativeCallLog { var values: [String] = [] }
@MainActor private final class ProbeSurfaces: NativeSurfaces {
    let liveActivitySupported = true, alarmSupported = true
    var onCancel: (() -> Void)?
    func cancelAlarm() { onCancel?() }
    func update(_ state: SnapshotState, configuration: NativeConfiguration?, notificationsAllowed: Bool) async {}
}
private final class NativeBridgeProbe: CAPBridgeViewController {
    var runtime: NativeRuntime!
    var rules: WKContentRuleList?
    override func capacitorDidLoad() {
        let plugin = CommuteNativePlugin(); plugin.runtimeOverride = runtime
        bridge?.registerPluginInstance(plugin)
    }
    override func webViewConfiguration(for configuration: InstanceConfiguration) -> WKWebViewConfiguration {
        let result = super.webViewConfiguration(for: configuration); result.websiteDataStore = .nonPersistent(); return result
    }
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        if let rules { configuration.userContentController.add(rules) }
        return super.webView(with: frame, configuration: configuration)
    }
}
