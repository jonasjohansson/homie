import AppKit
import WebKit
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, UNUserNotificationCenterDelegate, NSSplitViewDelegate {
    private var window: NSWindow!
    private var sidebar: SidebarView!
    private var outer: NSSplitView!
    private var sidebarView: NSView!
    private var split: NSSplitView!
    private var leftPane: NSView!
    private var rightPane: NSView!
    private var items: [TabItem] = []
    private var current: TabItem?          // left pane
    private var secondary: TabItem?        // right pane, when split
    private var sidebarHidden = UserDefaults.standard.bool(forKey: "sidebarHidden")
    private var watcher: ConfigWatcher?
    private var statusItem: NSStatusItem?
    private var tabMenu: NSMenu!

    // MARK: lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge]) { _, _ in }
        buildWindow()
        buildMenu()
        buildStatusItem()
        applyConfig(select: true)
        watcher = ConfigWatcher { [weak self] in self?.applyConfig(select: false) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    // MARK: window

    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Homie"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 600, height: 400)
        window.delegate = self
        window.setFrameAutosaveName("Homie.main")
        if !window.setFrameUsingName("Homie.main") { window.center() }

        let root = NSView()
        window.contentView = root

        let effect = NSVisualEffectView()
        effect.material = .sidebar
        effect.blendingMode = .behindWindow
        effect.state = .followsWindowActiveState
        effect.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(effect)

        sidebar = SidebarView()
        sidebar.translatesAutoresizingMaskIntoConstraints = false
        sidebar.onSelect = { [weak self] item, wantsSplit in
            guard let self else { return }
            if wantsSplit { self.select(item, pane: .right) }
            else { self.select(item, pane: self.focusedPane) }
        }
        sidebar.onContextMenu = { [weak self] item in self?.contextMenu(for: item) ?? NSMenu() }
        effect.addSubview(sidebar)

        split = NSSplitView()
        split.isVertical = true
        split.dividerStyle = .thin
        split.delegate = self
        split.translatesAutoresizingMaskIntoConstraints = false
        leftPane = NSView(); leftPane.wantsLayer = true
        rightPane = NSView(); rightPane.wantsLayer = true
        split.addArrangedSubview(leftPane)
        let content: NSView = split

        // Outer split: sidebar | content. Drag the edge to resize, width remembered per machine.
        outer = NSSplitView()
        outer.isVertical = true
        outer.dividerStyle = .thin
        outer.delegate = self
        outer.translatesAutoresizingMaskIntoConstraints = false
        outer.addArrangedSubview(effect)
        outer.addArrangedSubview(content)
        outer.setHoldingPriority(NSLayoutConstraint.Priority(260), forSubviewAt: 0)
        outer.setHoldingPriority(NSLayoutConstraint.Priority(250), forSubviewAt: 1)
        outer.autosaveName = "Homie.sidebar"
        root.addSubview(outer)
        effect.setContentHuggingPriority(.defaultLow, for: .horizontal)
        NSLayoutConstraint.activate([
            outer.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            outer.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            outer.topAnchor.constraint(equalTo: root.topAnchor),
            outer.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            sidebar.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
            sidebar.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
            sidebar.topAnchor.constraint(equalTo: effect.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: effect.bottomAnchor),
        ])
        sidebarView = effect
        if effect.frame.width == 0 { outer.setPosition(180, ofDividerAt: 0) }
        effect.isHidden = sidebarHidden
    }

    // MARK: config

    private func applyConfig(select: Bool) {
        let cfg: Config
        do {
            cfg = try ConfigStore.load()
        } catch {
            NSLog("Homie: config error: \(error)")
            if items.isEmpty { showConfigError(error) }
            return
        }

        var existing = Dictionary(uniqueKeysWithValues: items.map { ($0.spec.id, $0) })
        var next: [TabItem] = []
        for group in cfg.groups {
            for spec in group.tabs {
                if let item = existing.removeValue(forKey: spec.id) {
                    // Same URL: keep the web view, take the new label, mute and badge.
                    let muteChanged = item.spec.muted != spec.muted
                    item.spec = spec
                    item.groupName = group.name
                    if muteChanged { item.applyMute() }
                    next.append(item)
                } else {
                    let item = TabItem(spec: spec, group: group.name)
                    item.onChange = { [weak self] in self?.itemChanged() }
                    next.append(item)
                }
            }
        }
        // Tabs that left the config: drop their web views.
        for (_, gone) in existing {
            gone.webView?.removeFromSuperview()
            if gone === current { current = nil }
            if gone === secondary { closeSplit() }
        }
        items = next
        sidebar.items = items
        rebuildTabMenu()

        if current == nil || !items.contains(where: { $0 === current }) {
            if let first = items.first { self.select(first, pane: .left) }
        } else if select, let current { self.select(current, pane: .left) }
        itemChanged()
    }

    private func showConfigError(_ error: Error) {
        let a = NSAlert()
        a.messageText = "bookmarks.yml could not be read"
        a.informativeText = "\(error)\n\n\(ConfigStore.url.path)"
        a.addButton(withTitle: "Open file")
        a.addButton(withTitle: "Quit")
        if a.runModal() == .alertFirstButtonReturn {
            NSWorkspace.shared.open(ConfigStore.url)
        }
        NSApp.terminate(nil)
    }

    // MARK: selection

    enum Pane { case left, right }

    private var focusedPane: Pane {
        guard secondary != nil, let r = window.firstResponder as? NSView else { return .left }
        return r.isDescendant(of: rightPane) ? .right : .left
    }

    private func place(_ wv: WKWebView, in pane: NSView) {
        if wv.superview === pane { return }
        wv.removeFromSuperview()
        wv.translatesAutoresizingMaskIntoConstraints = false
        pane.addSubview(wv)
        NSLayoutConstraint.activate([
            wv.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            wv.topAnchor.constraint(equalTo: pane.topAnchor),
            wv.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
        ])
    }

    private func select(_ item: TabItem, pane: Pane) {
        if pane == .right {
            if item === current {
                // The left page asked to go right: swap, so both panes stay distinct.
                if let s = secondary { current = s; place(s.ensureWebView(), in: leftPane) }
                else { return }
            }
            if rightPane.superview == nil {
                split.addArrangedSubview(rightPane)
                split.setPosition(split.bounds.width / 2, ofDividerAt: 0)
            }
            secondary = item
        } else {
            if item === secondary { closeSplit(keepRight: true) }
            current = item
        }
        let wv = item.ensureWebView()
        place(wv, in: pane == .right ? rightPane : leftPane)
        for other in items where other !== current && other !== secondary { other.webView?.isHidden = true }
        current?.webView?.isHidden = false
        secondary?.webView?.isHidden = false
        sidebar.selected = current
        sidebar.secondary = secondary
        sidebar.needsDisplay = true
        window.makeFirstResponder(wv)
    }

    /// Ends the split. With keepRight the right page becomes the single page.
    private func closeSplit(keepRight: Bool = false) {
        guard let s = secondary else { return }
        secondary = nil
        if keepRight { current = s; place(s.ensureWebView(), in: leftPane) }
        else { s.webView?.isHidden = true }
        rightPane.removeFromSuperview()
        sidebar.secondary = nil
        sidebar.needsDisplay = true
    }

    private func select(index: Int, pane: Pane = .left) {
        guard items.indices.contains(index) else { return }
        select(items[index], pane: pane)
    }

    private func step(_ delta: Int) {
        guard let current, let i = items.firstIndex(where: { $0 === current }), !items.isEmpty else { return }
        select(items[(i + delta + items.count) % items.count], pane: .left)
    }

    @objc private func toggleSidebar() {
        sidebarHidden.toggle()
        UserDefaults.standard.set(sidebarHidden, forKey: "sidebarHidden")
        sidebarView.isHidden = sidebarHidden
    }

    @objc private func closeSplitAction() { closeSplit() }

    @objc private func splitTab(_ sender: NSMenuItem) { select(index: sender.tag, pane: .right) }

    private func itemChanged() {
        sidebar.needsDisplay = true
        let total = items.reduce(0) { $0 + $1.unread }
        NSApp.dockTile.badgeLabel = total > 0 ? "\(total)" : nil
        statusItem?.button?.image = NSImage(named: total > 0 ? "trayIconUnread" : "trayIcon")
    }

    // MARK: NSSplitViewDelegate (sidebar bounds)

    func splitView(_ splitView: NSSplitView, constrainMinCoordinate proposedMinimumPosition: CGFloat, ofSubviewAt dividerIndex: Int) -> CGFloat {
        splitView === outer ? 140 : 300
    }

    func splitView(_ splitView: NSSplitView, constrainMaxCoordinate proposedMaximumPosition: CGFloat, ofSubviewAt dividerIndex: Int) -> CGFloat {
        splitView === outer ? 420 : proposedMaximumPosition - 300
    }

    func splitView(_ splitView: NSSplitView, canCollapseSubview subview: NSView) -> Bool { false }

    func splitView(_ splitView: NSSplitView, shouldAdjustSizeOfSubview view: NSView) -> Bool {
        splitView === outer ? view !== sidebarView : true
    }

    // MARK: status item

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let img = NSImage(named: "trayIcon") {
            img.isTemplate = false
            statusItem?.button?.image = img
        }
        statusItem?.button?.target = self
        statusItem?.button?.action = #selector(statusClicked)
    }

    @objc private func statusClicked() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let unread = items.first(where: { $0.unread > 0 }) { select(unread, pane: .left) }
    }

    // MARK: notifications

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler handler: @escaping (UNNotificationPresentationOptions) -> Void) {
        handler([.banner, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler handler: @escaping () -> Void) {
        if let id = response.notification.request.content.userInfo["tab"] as? String,
           let item = items.first(where: { $0.spec.id == id }) {
            select(item, pane: .left)
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        handler()
    }

    // MARK: menu

    private func buildMenu() {
        let main = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Homie", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Edit Bookmarks…", action: #selector(openConfig), keyEquivalent: ",")
        appMenu.addItem(withTitle: "Reload Bookmarks", action: #selector(reloadConfig), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Homie", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Homie", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        main.addItem(submenu(appMenu, title: "Homie"))

        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        main.addItem(submenu(edit, title: "Edit"))

        tabMenu = NSMenu(title: "Tab")
        main.addItem(submenu(tabMenu, title: "Tab"))

        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        main.addItem(submenu(windowMenu, title: "Window"))
        NSApp.windowsMenu = windowMenu

        let help = NSMenu(title: "Help")
        help.addItem(withTitle: "Source Code", action: #selector(openSource), keyEquivalent: "")
        main.addItem(submenu(help, title: "Help"))
        NSApp.helpMenu = help

        NSApp.mainMenu = main
    }

    private func submenu(_ menu: NSMenu, title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = menu
        return item
    }

    private func rebuildTabMenu() {
        tabMenu.removeAllItems()
        tabMenu.addItem(withTitle: "Add Page…", action: #selector(addPage), keyEquivalent: "n")
        tabMenu.addItem(withTitle: "Pin This Page", action: #selector(pinCurrent), keyEquivalent: "d")
        tabMenu.addItem(.separator())
        tabMenu.addItem(withTitle: "Reload", action: #selector(reloadTab), keyEquivalent: "r")
        tabMenu.addItem(withTitle: "Reset to Pinned Page", action: #selector(resetTab), keyEquivalent: "R")
        tabMenu.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[")
        tabMenu.addItem(withTitle: "Forward", action: #selector(goForward), keyEquivalent: "]")
        tabMenu.addItem(withTitle: "Copy Page Address", action: #selector(copyURL), keyEquivalent: "C")
        tabMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "O")
        tabMenu.addItem(.separator())
        tabMenu.addItem(withTitle: "Actual Size", action: #selector(zoomReset), keyEquivalent: "0")
        tabMenu.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "=")
        tabMenu.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-")
        tabMenu.addItem(.separator())
        let next = tabMenu.addItem(withTitle: "Next Tab", action: #selector(nextTab), keyEquivalent: "\t")
        next.keyEquivalentModifierMask = [.control]
        let prev = tabMenu.addItem(withTitle: "Previous Tab", action: #selector(prevTab), keyEquivalent: "\t")
        prev.keyEquivalentModifierMask = [.control, .shift]
        tabMenu.addItem(.separator())
        tabMenu.addItem(withTitle: "Hide Sidebar", action: #selector(toggleSidebar), keyEquivalent: "s")
        let unsplit = tabMenu.addItem(withTitle: "Close Split", action: #selector(closeSplitAction), keyEquivalent: "\\")
        unsplit.keyEquivalentModifierMask = [.command]
        tabMenu.addItem(.separator())
        for (i, item) in items.enumerated() {
            let key = i < 9 ? "\(i + 1)" : ""
            let mi = tabMenu.addItem(withTitle: item.spec.resolvedLabel, action: #selector(selectTab(_:)), keyEquivalent: key)
            mi.tag = i
            // Hold Option: the same item opens the page on the right.
            let alt = tabMenu.addItem(withTitle: "Open \(item.spec.resolvedLabel) in Split", action: #selector(splitTab(_:)), keyEquivalent: key)
            alt.keyEquivalentModifierMask = [.command, .option]
            alt.isAlternate = true
            alt.tag = i
        }
    }

    private var groupNames: [String] {
        var seen: [String] = []
        for item in items where !seen.contains(item.groupName) { seen.append(item.groupName) }
        return seen.isEmpty ? ["Homie"] : seen
    }

    @objc private func addPage() {
        var url = ""
        if let s = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
           s.hasPrefix("http"), URL(string: s)?.host != nil { url = s }
        AddPagePanel.run(url: url, label: "", groups: groupNames, defaultGroup: current?.groupName)
    }

    @objc private func pinCurrent() {
        guard let current, let url = current.webView?.url?.absoluteString else { return }
        let title = current.webView?.title ?? ""
        AddPagePanel.run(url: url, label: title, groups: groupNames, defaultGroup: current.groupName)
    }

    // MARK: sidebar context menu

    private var menuTarget: TabItem?

    private func contextMenu(for item: TabItem) -> NSMenu {
        menuTarget = item
        let m = NSMenu()
        m.addItem(withTitle: "Open in Split", action: #selector(ctxSplit), keyEquivalent: "")
        m.addItem(.separator())
        let mute = m.addItem(withTitle: "Mute", action: #selector(ctxMute), keyEquivalent: "")
        mute.state = item.muted ? .on : .off
        let badge = m.addItem(withTitle: "Show Badge", action: #selector(ctxBadge), keyEquivalent: "")
        badge.state = item.showsBadge ? .on : .off
        m.addItem(withTitle: "Rename…", action: #selector(ctxRename), keyEquivalent: "")
        m.addItem(.separator())
        m.addItem(withTitle: "Reload", action: #selector(ctxReload), keyEquivalent: "")
        m.addItem(withTitle: "Reset to Pinned Page", action: #selector(ctxReset), keyEquivalent: "")
        m.addItem(withTitle: "Open in Browser", action: #selector(ctxBrowser), keyEquivalent: "")
        m.addItem(withTitle: "Copy Address", action: #selector(ctxCopy), keyEquivalent: "")
        m.addItem(.separator())
        m.addItem(withTitle: "Remove from Sidebar", action: #selector(ctxRemove), keyEquivalent: "")
        for mi in m.items { mi.target = self }
        return m
    }

    private func write(_ work: () throws -> Void) {
        do { try work() } catch { NSAlert(error: error).runModal() }
    }

    @objc private func ctxSplit() { if let t = menuTarget { select(t, pane: .right) } }
    @objc private func ctxMute() {
        guard let t = menuTarget else { return }
        write { try ConfigStore.set(url: t.spec.url, key: "muted", value: t.muted ? nil : "true") }
    }
    @objc private func ctxBadge() {
        guard let t = menuTarget else { return }
        write { try ConfigStore.set(url: t.spec.url, key: "badge", value: t.showsBadge ? "false" : nil) }
    }
    @objc private func ctxRename() {
        guard let t = menuTarget else { return }
        let a = NSAlert()
        a.messageText = "Rename"
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let f = NSTextField(string: t.spec.resolvedLabel)
        f.frame = NSRect(x: 0, y: 0, width: 260, height: 24)
        a.accessoryView = f
        a.window.initialFirstResponder = f
        guard a.runModal() == .alertFirstButtonReturn else { return }
        let v = f.stringValue.trimmingCharacters(in: .whitespaces)
        write { try ConfigStore.set(url: t.spec.url, key: "label", value: v.isEmpty ? nil : ConfigStore.quoted(v)) }
    }
    @objc private func ctxReload() { menuTarget?.webView?.reload() }
    @objc private func ctxReset() { menuTarget?.reset() }
    @objc private func ctxBrowser() { if let u = menuTarget?.webView?.url ?? menuTarget?.pinnedURL { NSWorkspace.shared.open(u) } }
    @objc private func ctxCopy() {
        guard let u = menuTarget?.webView?.url?.absoluteString ?? menuTarget?.spec.url else { return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(u, forType: .string)
    }
    @objc private func ctxRemove() {
        guard let t = menuTarget else { return }
        write { try ConfigStore.remove(url: t.spec.url) }
    }

    @objc private func openConfig() { NSWorkspace.shared.open(ConfigStore.url) }
    @objc private func reloadConfig() { applyConfig(select: false) }
    @objc private func openSource() { NSWorkspace.shared.open(URL(string: "https://github.com/jonasjohansson/homie")!) }
    @objc private func reloadTab() { current?.webView?.reload() }
    @objc private func resetTab() { current?.reset() }
    @objc private func goBack() { current?.webView?.goBack() }
    @objc private func goForward() { current?.webView?.goForward() }
    @objc private func zoomIn() { current?.zoom(by: 0.1) }
    @objc private func zoomOut() { current?.zoom(by: -0.1) }
    @objc private func zoomReset() { current?.zoom(by: 0) }
    @objc private func nextTab() { step(1) }
    @objc private func prevTab() { step(-1) }
    @objc private func selectTab(_ sender: NSMenuItem) { select(index: sender.tag, pane: .left) }
    @objc private func copyURL() {
        guard let url = current?.webView?.url?.absoluteString else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
    }
    @objc private func openInBrowser() {
        if let url = current?.webView?.url { NSWorkspace.shared.open(url) }
    }
}
