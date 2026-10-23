import AppKit
import WebKit
import UserNotifications

/// A pinned site: its spec, its lazily created web view, and its unread count.
final class TabItem: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var spec: TabSpec
    var groupName: String
    private(set) var webView: WKWebView?
    private var titleObservation: NSKeyValueObservation?
    var unread = 0
    var title = ""
    var favicon: NSImage?
    private var pageIconFetched = false
    var onChange: (() -> Void)?

    static let processPool = WKProcessPool()

    init(spec: TabSpec, group: String) {
        self.spec = spec
        self.groupName = group
        super.init()
        if let host = URL(string: spec.url)?.host {
            Favicons.image(for: host) { [weak self] img in
                self?.favicon = img
                self?.onChange?()
            }
        }
    }

    var isLoaded: Bool { webView != nil }
    var pinnedURL: URL { URL(string: spec.url)! }
    var showsBadge: Bool { spec.badge ?? true }

    func ensureWebView() -> WKWebView {
        if let webView { return webView }
        let cfg = WKWebViewConfiguration()
        cfg.processPool = TabItem.processPool
        cfg.websiteDataStore = .default()
        // The bare WKWebView agent lacks the Version/Safari tokens; Google and Teams
        // read it as an unknown browser. With them it is Safari.
        cfg.applicationNameForUserAgent = "Version/26.0 Safari/605.1.15"
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.preferences.isElementFullscreenEnabled = true
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let ucc = WKUserContentController()
        ucc.add(self, name: "homie")
        ucc.addUserScript(WKUserScript(source: Scripts.notifications, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if spec.muted == true && !TabItem.hasPageMute {
            ucc.addUserScript(WKUserScript(source: Scripts.mute, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        cfg.userContentController = ucc

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.allowsMagnification = true
        if #available(macOS 13.3, *) { wv.isInspectable = true }
        wv.pageZoom = CGFloat(UserDefaults.standard.double(forKey: zoomKey).nonZero ?? 1)
        titleObservation = wv.observe(\.title, options: [.new]) { [weak self] wv, _ in
            self?.titleChanged(wv.title ?? "")
        }
        webView = wv
        applyMute()
        wv.load(URLRequest(url: pinnedURL))
        return wv
    }

    /// WebKit's page mute (`_setPageMuted:`, the switch Safari's tab-audio button uses).
    /// Not public API; checked for at runtime, with the JS shim as the fallback.
    static let hasPageMute: Bool = WKWebView.instancesRespond(to: NSSelectorFromString("_setPageMuted:"))

    var muted: Bool { spec.muted == true }

    func applyMute() {
        guard let webView, TabItem.hasPageMute else { return }
        webView.setValue(muted ? 1 : 0, forKey: "_pageMuted")
    }

    private var zoomKey: String { "zoom:" + (pinnedURL.host ?? spec.url) }

    func zoom(by delta: CGFloat) {
        guard let webView else { return }
        let z = delta == 0 ? 1 : max(0.5, min(3, webView.pageZoom + delta))
        webView.pageZoom = z
        UserDefaults.standard.set(Double(z), forKey: zoomKey)
    }

    func reset() {
        webView?.load(URLRequest(url: pinnedURL))
    }

    // MARK: unread

    private func titleChanged(_ t: String) {
        title = t
        var count = 0
        if let m = t.range(of: "\\((\\d+)\\)", options: .regularExpression) {
            let digits = t[m].filter(\.isNumber)
            count = Int(digits) ?? 0
        } else if let first = t.trimmingCharacters(in: .whitespaces).first, "*!•●".contains(first) {
            count = 1
        }
        if !showsBadge { count = 0 }
        if count != unread {
            unread = count
            onChange?()
        }
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "notification" else { return }
        let content = UNMutableNotificationContent()
        content.title = (body["title"] as? String) ?? spec.resolvedLabel
        content.body = (body["body"] as? String) ?? ""
        content.userInfo = ["tab": spec.id]
        let tag = (body["tag"] as? String) ?? ""
        let id = tag.isEmpty ? UUID().uuidString : spec.id + "#" + tag
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Links that want a new window leave the app: Homie is not a browser.
        if action.targetFrame == nil, let url = action.request.url {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !pageIconFetched, let host = pinnedURL.host,
              webView.url?.host == host || webView.url?.host?.hasSuffix(host.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)) == true else { return }
        webView.evaluateJavaScript(Favicons.pageIconScript) { [weak self] result, _ in
            guard let self, let href = result as? String, let url = URL(string: href) else { return }
            self.pageIconFetched = true
            Favicons.update(host: host, from: url) { [weak self] img in
                self?.favicon = img
                self?.onChange?()
            }
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: WKDownloadDelegate — attachments land in ~/Downloads

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var dest = downloads.appendingPathComponent(suggestedFilename)
        var n = 1
        let base = dest.deletingPathExtension().lastPathComponent
        let ext = dest.pathExtension
        while FileManager.default.fileExists(atPath: dest.path) {
            n += 1
            dest = downloads.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
        }
        DownloadManager.shared.begin(download, file: dest, source: webView?.url ?? pinnedURL)
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        DownloadManager.shared.finish(download)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        DownloadManager.shared.fail(download, error: error)
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = spec.resolvedLabel; a.informativeText = message
        a.runModal(); completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = spec.resolvedLabel; a.informativeText = message
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = parameters.allowsDirectories
        p.canChooseFiles = true
        p.begin { completionHandler($0 == .OK ? p.urls : nil) }
    }
}

private extension Double {
    var nonZero: Double? { self == 0 ? nil : self }
}
