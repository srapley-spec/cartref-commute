import UIKit
import CoreLocation
import Network
import NetworkExtension
import UserNotifications
import AlarmKit
import CommuteNativeCore

@MainActor
final class NativeRuntime: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let group = "group.uk.cartref.srapley.commute"
    static let shared = NativeRuntime()
    private(set) var document = NativeDocument()
    private var file: (any NativeDocumentStorage)?
    private let credentials: any NativeCredentialStorage
    private let platformEnabled: Bool
    private let alarmPermission: any NativeAlarmPermission
    private var alarmPermissionGate = RequestGate()
    private var device: NativeCredentials?
    private let location = CLLocationManager()
    private let network = NWPathMonitor()
    private weak var plugin: CommuteNativePlugin?
    private var pageReady = false
    private var draining = false
    private var online = false
    private var retry: Task<Void, Never>?
    private var locationRequest: CheckedContinuation<Void, Never>?
    private var locationGate = RequestGate()
    private var locationTimeout: Task<Void, Never>?
    private var wifiReadID = UUID()
    private(set) var lastError: NativeError?
    // Set by the Apple surface coordinator. State remains usable while those surfaces are disabled by iOS.
    var surfaces: NativeSurfaces?
    private let proxySession = URLSession(configuration: .ephemeral, delegate: NoProxyRedirects(), delegateQueue: nil)

    init(storage: (any NativeDocumentStorage)? = nil,
         credentialStore: any NativeCredentialStorage = NativeCredentialStore(), platformEnabled: Bool = true,
         alarmPermission: (any NativeAlarmPermission)? = nil) {
        self.credentials = credentialStore
        self.platformEnabled = platformEnabled
        self.alarmPermission = alarmPermission ?? SystemAlarmPermission()
        super.init()
        do {
            let store: any NativeDocumentStorage
            if let storage { store = storage }
            else {
                guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else { throw NativeError.unavailable }
                store = NativeDocumentFileStore(file: try NativeFileStore(directory: directory.appendingPathComponent("Commute")))
            }
            if let existing = try store.load() {
                try existing.validate()
                document = existing
            }
            file = store
            if let stored = try credentials.read(), stored.origin == document.configuration?.normalizedOrigin {
                device = stored.credentials
            }
        } catch { lastError = .unavailable }
        guard platformEnabled else { return }
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
        guard platformEnabled else { return }
        if surfaces == nil { surfaces = AppleSurfaces(runtime: self) }
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
            document.activityID = nil; document.activityFollowID = nil
            surfaces?.cancelAlarm()
            persistBestEffort()
        }
    }

    func activityCreated(id: String, followId: String) {
        guard document.snapshots.current?.followId == followId else { return }
        document.activityID = id; document.activityFollowID = followId
        persistBestEffort()
    }

    func activityContent(_ snapshot: JourneySnapshot) {
        guard document.snapshots.current != snapshot else { return }
        if (try? document.snapshots.apply(snapshot, fromPage: false, now: Self.now)) == true {
            persistBestEffort(); refreshSurfaces()
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
                "wifi": true, "siri": true, "offline": file != nil,
                "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
                "auth": ["location": locationAuthorization, "notifications": Self.notificationAuthorization(notifications.authorizationStatus),
                         "alarm": alarmPermission.authorization.rawValue]]
    }

    func configure(_ configuration: NativeConfiguration, credentials value: NativeCredentials?) throws {
        try configuration.validate(); try value?.validate()
        guard let file else { throw NativeError.unavailable }
        // A new registration or proxy must never receive events queued using an old registration's identity.
        var next = document
        if device != value || next.configuration?.normalizedOrigin != configuration.normalizedOrigin { next.outbox = [] }
        if next.regionGeneration == nil || next.configuration?.regions != configuration.regions ||
            next.configuration?.geofencing != configuration.geofencing { next.regionGeneration = UUID().uuidString }
        next.configuration = configuration
        // The Keychain record binds the token to the proxy independently of the JSON commit. A failure or
        // process exit between these writes cannot pair a new token with an old proxy after restart.
        try credentials.write(value, origin: configuration.normalizedOrigin)
        try file.save(next)
        device = value; document = next; wifiReadID = UUID()
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
        } else if permission == "alarm" {
            if alarmPermission.authorization == .notDetermined {
                let requestID = try alarmPermissionGate.begin()
                defer { _ = alarmPermissionGate.finish(requestID) }
                try await alarmPermission.request()
            }
        } else if permission == "location" {
            if location.authorizationStatus == .notDetermined || location.authorizationStatus == .authorizedWhenInUse {
                let requestID = try locationGate.begin()
                await withCheckedContinuation { continuation in
                    locationRequest = continuation
                    location.requestAlwaysAuthorization()
                    // iOS can defer the second Always prompt. Do not leave a bridge Promise unresolved.
                    locationTimeout = Task { @MainActor [weak self] in
                        do { try await Task.sleep(for: .seconds(60)) } catch { return }
                        self?.finishLocationRequest(requestID)
                    }
                }
            }
        } else { throw NativeError.unsupported }
        reconcileRegions(); refreshSurfaces()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        wifiReadID = UUID()
        if manager.authorizationStatus != .notDetermined, let id = locationGate.current { finishLocationRequest(id) }
        reconcileRegions(); refreshWifi()
    }
    private func finishLocationRequest(_ id: UUID) {
        guard locationGate.finish(id) else { return }
        locationTimeout?.cancel(); locationTimeout = nil
        let pending = locationRequest; locationRequest = nil; pending?.resume()
    }

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
        guard platformEnabled else { return }
        let enabled = file != nil && document.regionGeneration != nil && location.authorizationStatus == .authorizedAlways && document.configuration?.geofencing == true
        let desired = enabled ? document.configuration?.regions ?? [] : []
        for region in location.monitoredRegions where region.identifier.hasPrefix("commute:") {
            let same = desired.contains { value in
                guard let circle = region as? CLCircularRegion else { return false }
                return circle.identifier == regionIdentifier(value.place)
            }
            if !same { location.stopMonitoring(for: region) }
        }
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        for value in desired where !location.monitoredRegions.contains(where: { $0.identifier == regionIdentifier(value.place) }) {
            let circle = CLCircularRegion(center: CLLocationCoordinate2D(latitude: value.lat, longitude: value.lon), radius: value.radiusM, identifier: regionIdentifier(value.place))
            circle.notifyOnEntry = true; circle.notifyOnExit = true
            location.startMonitoring(for: circle)
        }
    }

    func regionIdentifier(_ place: String) -> String { "commute:\(document.regionGeneration ?? "unconfigured"):\(place)" }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { regionEvent(region, event: "enter") }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { regionEvent(region, event: "exit") }
    /// iOS reports no entry when monitoring starts with the phone already inside: ask once it has started (review 19 Nov).
    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        if region.identifier.hasPrefix("commute:") { manager.requestState(for: region) }
    }
    /// The answer to `requestState` (and every crossing): inside counts as arriving; an exit is left to `didExitRegion`.
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        if state == .inside { regionEvent(region, event: "enter") }
    }
    private func regionEvent(_ region: CLRegion, event: String) {
        guard document.configuration?.geofencing == true,
              document.regionGeneration != nil,
              let configured = document.configuration?.regions.first(where: { region.identifier == regionIdentifier($0.place) }) else { return }
        let now = Self.now
        if event == "exit", document.snapshots.regionExit(place: configured.place, at: now) {
            // Cancel locally before storage/network: an offline departure must not wait for a server response.
            surfaces?.cancelAlarm()
        }
        let evidence = RegionEvidence(place: configured.place, event: event, at: now)
        // Evidence for a followed journey; or, with the commute watch on and nothing followed, arriving home (#66: the
        // proxy's afternoon watch stops). Watch evidence has no journey ("").
        let follow = document.snapshots.current?.followId
        // Leaving home too: "home since 14:30 and not left" also ends the evening watch, and leaving again restarts it.
        let watchHome = follow == nil && document.configuration?.watch == true && configured.place == "home"
        if follow != nil || watchHome, let device, let origin = document.configuration?.normalizedOrigin {
            document.enqueue(.init(followId: follow ?? "", deviceID: device.id, origin: origin, evidence: evidence))
        }
        persistBestEffort()
        emit(.init("region", ["place": .string(configured.place), "event": .string(event), "at": .number(now)]))
        startDrain()
    }

    private func refreshWifi() {
        guard platformEnabled,
              [.authorizedAlways, .authorizedWhenInUse].contains(location.authorizationStatus) else { return }
        guard let receive = makeWifiReceiver() else { return }
        NEHotspotNetwork.fetchCurrent { network in
            let ssid = network?.ssid
            Task { @MainActor in receive(ssid) }
        }
    }

    func makeWifiReceiver() -> (@MainActor (String?) -> Void)? {
        guard let configuration = document.configuration else { return nil }
        let readID = UUID(), observedAt = Self.now
        wifiReadID = readID
        return { [weak self] ssid in
            // Only the classification leaves this callback. Never persist, log or emit the network name.
            let place = configuration.wifi.place(for: ssid)
            guard let self, self.wifiReadID == readID, self.document.configuration == configuration else { return }
            self.emit(.init("wifi", ["place": .string(place), "at": .number(observedAt)]))
        }
    }

    func receivePush(_ payload: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        do {
            guard let payload = payload as? [String: Any], try applyRemotePayload(payload) else { return .noData }
            await updateSurfaces()
            return .newData
        } catch NativeError.unsupported { return .noData }
        catch { return .failed }
    }

    @discardableResult
    private func applyRemotePayload(_ payload: [String: Any]) throws -> Bool {
        guard let update = try Wire.remoteSnapshot(payload),
              try document.snapshots.applyRemote(update, now: Self.now) else { return false }
        if case .stop(let followId, _) = update {
            // Cancel before persistence or any suspended platform call, even when the disk is unavailable.
            surfaces?.cancelAlarm()
            document.replay.removeActivity(followId: followId)
            document.activityID = nil; document.activityFollowID = nil
            document.outbox.removeAll { $0.followId == followId }
        }
        persistBestEffort()
        return true
    }

    @discardableResult
    func receiveEvidence(_ reply: [String: Any], for pending: PendingEvidence, credentials responseCredentials: NativeCredentials) throws -> Bool {
        guard pending.followId == document.snapshots.current?.followId, device == responseCredentials,
              pending.deviceID == device?.id, pending.origin == document.configuration?.normalizedOrigin else { return false }
        let changed = try applyRemotePayload(reply)
        if changed { refreshSurfaces() }
        return changed
    }

    private func startDrain() {
        guard platformEnabled, !draining, online, !document.outbox.isEmpty else { return }
        draining = true
        Task { @MainActor in
            let task = UIApplication.shared.beginBackgroundTask(withName: "Commute region evidence")
            defer {
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
                draining = false
            }
            while let first = document.outbox.first, let device, online {
                guard first.followId.isEmpty || first.followId == document.snapshots.current?.followId, first.deviceID == device.id,
                      first.origin == document.configuration?.normalizedOrigin else {
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
                    if http.statusCode == 200, !first.followId.isEmpty, let reply = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        try receiveEvidence(reply, for: first, credentials: device)
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
    private func refreshSurfaces() {
        guard surfaces != nil else { return }
        Task { @MainActor in await updateSurfaces() }
    }
    private func updateSurfaces() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await surfaces?.update(document.snapshots, configuration: document.configuration,
                               notificationsAllowed: Self.notificationAuthorization(settings.authorizationStatus) == "granted")
    }
    static var now: Double { Date().timeIntervalSince1970 * 1000 }
}

enum NativeAlarmAuthorization: String { case granted, denied, notDetermined }

@MainActor
protocol NativeAlarmPermission: AnyObject {
    var authorization: NativeAlarmAuthorization { get }
    func request() async throws
}

@MainActor
private final class SystemAlarmPermission: NativeAlarmPermission {
    var authorization: NativeAlarmAuthorization {
        switch AlarmManager.shared.authorizationState {
        case .authorized: return .granted
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
    func request() async throws { _ = try await AlarmManager.shared.requestAuthorization() }
}

protocol NativeDocumentStorage {
    func load() throws -> NativeDocument?
    func save(_ state: NativeDocument) throws
}

private struct NativeDocumentFileStore: NativeDocumentStorage {
    let file: NativeFileStore
    func load() throws -> NativeDocument? { try file.load(NativeDocument.self) }
    func save(_ state: NativeDocument) throws { try file.save(state) }
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
