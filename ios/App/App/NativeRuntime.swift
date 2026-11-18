import UIKit
import CoreLocation
import Network
import NetworkExtension
import UserNotifications
import CommuteNativeCore

@MainActor
final class NativeRuntime: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let group = "group.uk.cartref.srapley.commute"
    static let shared = NativeRuntime()
    private(set) var document = NativeDocument()
    private var file: NativeFileStore?
    private let credentials = NativeCredentialStore()
    private var device: NativeCredentials?
    private let location = CLLocationManager()
    private let network = NWPathMonitor()
    private weak var plugin: CommuteNativePlugin?
    private var pageReady = false
    private var draining = false
    private var online = false
    private var retry: Task<Void, Never>?
    private var locationRequest: CheckedContinuation<Void, Never>?
    private(set) var lastError: NativeError?
    // Set by the Apple surface coordinator. State remains usable while those surfaces are disabled by iOS.
    var surfaces: NativeSurfaces?
    private let proxySession = URLSession(configuration: .ephemeral, delegate: NoProxyRedirects(), delegateQueue: nil)

    override init() {
        super.init()
        do {
            guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else { throw NativeError.unavailable }
            let store = try NativeFileStore(directory: directory.appendingPathComponent("Commute"))
            if let existing = try store.load(NativeDocument.self) {
                guard existing.v == 1 else { throw NativeError.unsupported }
                document = existing
            }
            file = store
            device = try credentials.read()
        } catch { lastError = .unavailable }
        location.delegate = self
        network.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                self.online = path.status == .satisfied
                self.refreshWifi()
                if self.online { self.startDrain() }
            }
        }
        network.start(queue: DispatchQueue(label: "commute.native.network"))
    }

    func start() {
        reconcileRegions()
        UIApplication.shared.registerForRemoteNotifications()
        refreshSurfaces()
    }

    func attach(_ plugin: CommuteNativePlugin) { self.plugin = plugin; pageStarted() }
    func pageStarted() { pageReady = false }

    func ready() {
        pageReady = true
        let pending = document.replay.ready()
        for event in pending {
            if plugin?.hasListeners(event.name) == true {
                plugin?.notifyListeners(event.name, data: (try? Wire.object(event.data)) as? [String: Any])
            } else { document.replay.retain(event, delivered: false) }
        }
        persistBestEffort()
    }

    private func emit(_ event: NativeEvent) {
        let deliver = pageReady && plugin?.hasListeners(event.name) == true
        document.replay.retain(event, delivered: deliver)
        persistBestEffort()
        if deliver { plugin?.notifyListeners(event.name, data: (try? Wire.object(event.data)) as? [String: Any]) }
    }

    func apns(_ token: Data) {
        let value = token.map { String(format: "%02x", $0) }.joined()
        let environment = Bundle.main.object(forInfoDictionaryKey: "CommuteAPNSEnvironment") as? String
        guard environment == "sandbox" || environment == "production" else { return }
        emit(.init("apns", ["token": .string(value), "env": .string(environment!)]))
    }

    func activityToken(followId: String, token: Data) {
        guard document.snapshots.current?.followId == followId else { return }
        emit(.init("liveActivity", ["followId": .string(followId), "token": .string(token.map { String(format: "%02x", $0) }.joined())]))
    }

    func activityEnded(followId: String) {
        let now = Self.now
        if document.snapshots.stop(followId: followId, at: max(now, document.snapshots.current?.at ?? now), now: now) {
            document.replay.removeActivity(followId: followId)
            surfaces?.cancelAlarm()
            persistBestEffort()
        }
    }

    func opened(_ url: URL) {
        guard url.scheme == "commute", ["next", "follow"].contains(url.host ?? "") else { return }
        emit(.init("open", ["url": .string(url.absoluteString)]))
    }

    func resumed() {
        emit(.init("resume", ["at": .number(Self.now)]))
        reconcileRegions(); refreshWifi(); refreshSurfaces(); startDrain()
    }

    func capabilities() async throws -> [String: Any] {
        let notifications = await UNUserNotificationCenter.current().notificationSettings()
        return ["v": 1, "liveActivity": surfaces?.liveActivitySupported == true,
                "alarm": surfaces?.alarmSupported == true, "geofence": file != nil && CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self),
                "wifi": true, "siri": false, "offline": file != nil,
                "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
                "auth": ["location": locationAuthorization, "notifications": Self.notificationAuthorization(notifications.authorizationStatus)]]
    }

    func configure(_ configuration: NativeConfiguration, credentials value: NativeCredentials?) throws {
        try configuration.validate(); try value?.validate()
        guard let file else { throw NativeError.unavailable }
        // A new registration or proxy must never receive events queued using an old registration's identity.
        var next = document
        if device != value || next.configuration?.proxy.origin != configuration.proxy.origin { next.outbox = [] }
        next.configuration = configuration
        try credentials.write(value)
        try file.save(next)
        device = value; document = next
        reconcileRegions(); refreshWifi(); refreshSurfaces(); startDrain()
    }

    func publish(_ snapshot: JourneySnapshot?) throws {
        guard let file else { throw NativeError.unavailable }
        var next = document
        let old = next.snapshots.current?.followId
        if let snapshot { _ = try next.snapshots.apply(snapshot, fromPage: true, now: Self.now) }
        else { next.snapshots.stopFromPage(now: Self.now) }
        let current = next.snapshots.current?.followId
        if old != current {
            if let old { next.replay.removeActivity(followId: old) }
            next.outbox = []
            surfaces?.cancelAlarm()
        }
        try file.save(next); document = next
        refreshSurfaces()
    }

    func cache(_ entries: [CacheEntry]) throws {
        guard let file else { throw NativeError.unavailable }
        var next = document
        try next.cache.replace(entries)
        try file.save(next); document = next
    }
    func cached() throws -> [CacheEntry] {
        guard file != nil else { throw NativeError.unavailable }
        return document.cache.entries
    }

    func request(_ permission: String) async throws {
        if permission == "notifications" {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            UIApplication.shared.registerForRemoteNotifications()
        } else if permission == "location" {
            guard locationRequest == nil else { throw NativeError.unavailable }
            if location.authorizationStatus == .notDetermined || location.authorizationStatus == .authorizedWhenInUse {
                await withCheckedContinuation { continuation in
                    locationRequest = continuation
                    location.requestAlwaysAuthorization()
                    // iOS can defer the second Always prompt. Do not leave a bridge Promise unresolved.
                    Task { @MainActor [weak self] in
                        try? await Task.sleep(for: .seconds(60))
                        self?.finishLocationRequest()
                    }
                }
            }
        } else { throw NativeError.unsupported }
        reconcileRegions(); refreshSurfaces()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .notDetermined { finishLocationRequest() }
        reconcileRegions(); refreshWifi()
    }
    private func finishLocationRequest() { let pending = locationRequest; locationRequest = nil; pending?.resume() }

    private var locationAuthorization: String {
        switch location.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .notDetermined: return "notDetermined"
        default: return "denied"
        }
    }
    private static func notificationAuthorization(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .notDetermined: return "notDetermined"
        default: return "denied"
        }
    }

    private func reconcileRegions() {
        let enabled = file != nil && location.authorizationStatus == .authorizedAlways && document.configuration?.alarm.alarm == true
        let desired = enabled ? document.configuration?.regions ?? [] : []
        for region in location.monitoredRegions where region.identifier.hasPrefix("commute:") {
            let same = desired.contains { value in
                guard let circle = region as? CLCircularRegion else { return false }
                return circle.identifier == "commute:\(value.place)" && circle.center.latitude == value.lat && circle.center.longitude == value.lon && circle.radius == value.radiusM
            }
            if !same { location.stopMonitoring(for: region) }
        }
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        for value in desired where !location.monitoredRegions.contains(where: { $0.identifier == "commute:\(value.place)" }) {
            let circle = CLCircularRegion(center: CLLocationCoordinate2D(latitude: value.lat, longitude: value.lon), radius: value.radiusM, identifier: "commute:\(value.place)")
            circle.notifyOnEntry = true; circle.notifyOnExit = true
            location.startMonitoring(for: circle)
        }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { regionEvent(region, event: "enter") }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { regionEvent(region, event: "exit") }
    private func regionEvent(_ region: CLRegion, event: String) {
        guard document.configuration?.alarm.alarm == true,
              let configured = document.configuration?.regions.first(where: { region.identifier == "commute:\($0.place)" }) else { return }
        let now = Self.now
        if event == "exit", document.snapshots.regionExit(place: configured.place, at: now) {
            // Cancel locally before storage/network: an offline departure must not wait for a server response.
            surfaces?.cancelAlarm()
        }
        let evidence = RegionEvidence(place: configured.place, event: event, at: now)
        if let id = document.snapshots.current?.followId, let device, let origin = document.configuration?.proxy.origin {
            document.enqueue(.init(followId: id, deviceID: device.id, origin: origin, evidence: evidence))
        }
        persistBestEffort()
        emit(.init("region", ["place": .string(configured.place), "event": .string(event), "at": .number(now)]))
        startDrain()
    }

    private func refreshWifi() {
        guard let configuration = document.configuration,
              [.authorizedAlways, .authorizedWhenInUse].contains(location.authorizationStatus) else { return }
        NEHotspotNetwork.fetchCurrent { [weak self] network in
            // Only the classification leaves this callback. Never persist, log or emit the network name.
            let place = configuration.wifi.place(for: network?.ssid)
            Task { @MainActor in self?.emit(.init("wifi", ["place": .string(place), "at": .number(Self.now)])) }
        }
    }

    func receivePush(_ payload: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        do {
            guard let value = payload["snapshot"] else { return .noData }
            if value is NSNull {
                // Remote nulls cannot identify a journey in the currently published fixture. Do not let an
                // old stop cancel a new follow. An identified stop envelope is requested on issue #58.
                return .noData
            }
            let snapshot = try Wire.decode(JourneySnapshot.self, value)
            guard try document.snapshots.apply(snapshot, fromPage: false, now: Self.now) else { return .noData }
            persistBestEffort()
            await updateSurfaces()
            return .newData
        } catch { return .failed }
    }

    private func startDrain() {
        guard !draining, online, !document.outbox.isEmpty else { return }
        draining = true
        Task { @MainActor in
            let task = UIApplication.shared.beginBackgroundTask(withName: "Commute region evidence")
            defer {
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
                draining = false
            }
            while let first = document.outbox.first, let device, online {
                guard first.followId == document.snapshots.current?.followId, first.deviceID == device.id,
                      first.origin == document.configuration?.proxy.origin else {
                    document.outbox.removeFirst(); persistBestEffort(); continue
                }
                do {
                    var request = URLRequest(url: URL(string: first.origin)!.appendingPathComponent("native/evidence"))
                    request.httpMethod = "POST"; request.timeoutInterval = 10
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("capacitor://localhost", forHTTPHeaderField: "Origin")
                    request.httpBody = try JSONSerialization.data(withJSONObject: ["id": device.id, "token": device.token, "evidence": Wire.object(first.evidence)])
                    let (data, response) = try await proxySession.data(for: request)
                    guard let http = response as? HTTPURLResponse else { throw NativeError.unavailable }
                    guard (200..<300).contains(http.statusCode) || http.statusCode == 400 else { throw NativeError.unavailable }
                    if http.statusCode == 200, first.followId == document.snapshots.current?.followId,
                       self.device == device, first.origin == document.configuration?.proxy.origin,
                       let reply = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let value = reply["snapshot"], !(value is NSNull) {
                        let snapshot = try Wire.decode(JourneySnapshot.self, value)
                        if try document.snapshots.apply(snapshot, fromPage: false, now: Self.now) { refreshSurfaces() }
                    }
                    document.outbox.removeAll { $0.id == first.id }; persistBestEffort()
                } catch {
                    retry?.cancel()
                    retry = Task { @MainActor in
                        do { try await Task.sleep(for: .seconds(60)) } catch { return }
                        self.startDrain()
                    }
                    return
                }
            }
        }
    }

    private func persistBestEffort() {
        do { guard let file else { throw NativeError.unavailable }; try file.save(document) }
        catch { lastError = .unavailable }
    }
    private func refreshSurfaces() { Task { @MainActor in await updateSurfaces() } }
    private func updateSurfaces() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await surfaces?.update(document.snapshots, configuration: document.configuration,
                               notificationsAllowed: Self.notificationAuthorization(settings.authorizationStatus) == "granted")
    }
    static var now: Double { Date().timeIntervalSince1970 * 1000 }
}

/// Redirects could leak the device credential in a POST body to a different origin. Refuse all of them.
private final class NoProxyRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor
protocol NativeSurfaces: AnyObject {
    var liveActivitySupported: Bool { get }
    var alarmSupported: Bool { get }
    func cancelAlarm()
    func update(_ state: SnapshotState, configuration: NativeConfiguration?, notificationsAllowed: Bool) async
}
