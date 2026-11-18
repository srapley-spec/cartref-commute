import Capacitor
import WebKit
import CommuteNativeCore

final class CommuteBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(CommuteNativePlugin()) }
}

@objc(CommuteNativePlugin)
final class CommuteNativePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "CommuteNativePlugin"
    let jsName = "CommuteNative"
    let pluginMethods: [CAPPluginMethod] = ["capabilities", "ready", "publish", "configure", "cache", "cached", "request"]
        .map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private var navigation: NSKeyValueObservation?

    override func load() {
        Task { @MainActor [weak self] in
            guard let self else { return }
            NativeRuntime.shared.attach(self)
            navigation = bridge?.webView?.observe(\.isLoading, options: [.new]) { _, change in
                if change.newValue == true { Task { @MainActor in NativeRuntime.shared.pageStarted() } }
            }
        }
    }

    @objc func capabilities(_ call: CAPPluginCall) { perform(call) { try await $0.capabilities() } }
    @objc func ready(_ call: CAPPluginCall) { perform(call) { $0.ready(); return [:] } }
    @objc func publish(_ call: CAPPluginCall) {
        perform(call) { runtime in
            guard let value = call.options["snapshot"] else { throw NativeError.invalid }
            try runtime.publish(value is NSNull ? nil : Wire.decode(JourneySnapshot.self, value))
            return [:]
        }
    }
    @objc func configure(_ call: CAPPluginCall) {
        perform(call) { runtime in
            guard let device = call.options["device"] else { throw NativeError.invalid }
            let config = try Wire.decode(NativeConfiguration.self, call.options as Any)
            let credentials = device is NSNull ? nil : try Wire.decode(NativeCredentials.self, device)
            try runtime.configure(config, credentials: credentials)
            return [:]
        }
    }
    @objc func cache(_ call: CAPPluginCall) {
        perform(call) { runtime in
            guard let values = call.options["entries"] else { throw NativeError.invalid }
            try runtime.cache(Wire.decode([CacheEntry].self, values))
            return [:]
        }
    }
    @objc func cached(_ call: CAPPluginCall) {
        perform(call) { runtime in ["entries": try Wire.object(runtime.cached())] }
    }
    @objc func request(_ call: CAPPluginCall) {
        perform(call) { runtime in
            guard let permission = call.getString("permission") else { throw NativeError.invalid }
            try await runtime.request(permission)
            return try await runtime.capabilities()
        }
    }

    private func perform(_ call: CAPPluginCall, _ operation: @escaping @MainActor (NativeRuntime) async throws -> [String: Any]) {
        Task { @MainActor in
            do {
                try Wire.version(call.options as? [String: Any] ?? [:])
                call.resolve(try await operation(NativeRuntime.shared))
            } catch let error as NativeError {
                call.reject("The native operation could not be completed.", error.rawValue)
            } catch {
                // Neither credential values nor received payloads belong in errors or bridge logs.
                call.reject("The native operation could not be completed.", "invalid")
            }
        }
    }
}
