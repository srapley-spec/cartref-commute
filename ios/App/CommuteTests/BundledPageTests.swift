import Capacitor
import WebKit
import XCTest

/// Exercises Capacitor's real local server and the shipped page with all web traffic blocked.
@MainActor
final class BundledPageTests: XCTestCase {
    func testApplicationLaunchesTheBundledPage() async throws {
        let window = try XCTUnwrap(UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow))
        let controller = try XCTUnwrap(window.rootViewController as? CAPBridgeViewController,
            "The real app entry point must present the Capacitor screen.")
        let webView = try XCTUnwrap(controller.webView)
        try await assertPageReady(webView)
        let origin = try await webView.evaluateJavaScript("location.origin") as? String
        XCTAssertEqual(origin, "capacitor://localhost")
        let title = try await webView.evaluateJavaScript("document.title") as? String
        XCTAssertEqual(title, "Cartref Commute")
    }

    func testPageBootsFromTheBundleWithoutNetwork() async throws {
        let rules = try await WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "CommuteOfflineTest",
            encodedContentRuleList: #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]"#
        )
        let controller = OfflineBridgeViewController()
        controller.rules = rules
        controller.loadViewIfNeeded()
        let webView = try XCTUnwrap(controller.webView)
        try await assertPageReady(webView)
        let origin = try await webView.evaluateJavaScript("location.origin") as? String
        XCTAssertEqual(origin, "capacitor://localhost")
        let title = try await webView.evaluateJavaScript("document.title") as? String
        XCTAssertEqual(title, "Cartref Commute")
        // Check the test's offline condition, rather than assuming that local HTML implies no network.
        let blocked = try await webView.callAsyncJavaScript(
            "try { await fetch('https://example.com/'); return false; } catch { return true; }",
            arguments: [:], in: nil, contentWorld: .page
        ) as? Bool
        XCTAssertEqual(blocked, true)
        let manifest = try await webView.callAsyncJavaScript(
            "return (await (await fetch('manifest.webmanifest')).json()).short_name;",
            arguments: [:], in: nil, contentWorld: .page
        ) as? String
        XCTAssertEqual(manifest, "Commute")
    }

    private func assertPageReady(_ webView: WKWebView) async throws {
        for _ in 0..<200 {
            let result = try? await webView.evaluateJavaScript(
                "document.readyState === 'complete' && typeof CommuteCore === 'object' && document.body.innerText.length > 100"
            )
            if result as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTFail("The bundled engine and screen did not start.")
    }
}

private final class OfflineBridgeViewController: CAPBridgeViewController {
    var rules: WKContentRuleList?
    override func webViewConfiguration(for configuration: InstanceConfiguration) -> WKWebViewConfiguration {
        let result = super.webViewConfiguration(for: configuration)
        result.websiteDataStore = .nonPersistent()
        if let rules { result.userContentController.add(rules) }
        return result
    }
}
