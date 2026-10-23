import AppKit
import WebKit
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, UNUserNotificationCenterDelegate {
    private var window: NSWindow!
    private var sidebar: SidebarView!
    private var sidebarWidth: NSLayoutConstraint!
    private var content: NSView!
    private var items: [TabItem] = []
    private var current: TabItem?
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
        sidebar.onSelect = { [weak self] item in self?.select(item) }
        effect.addSubview(sidebar)

        content = NSView()
        content.translatesAutoresizingMaskIntoConstraints = false
        content.wantsLayer = true
        root.addSubview(content)

        sidebarWidth = effect.widthAnchor.constraint(equalToConstant: 180)
        NSLayoutConstraint.activate([
            effect.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            effect.topAnchor.constraint(equalTo: root.topAnchor),
            effect.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            sidebarWidth,
            sidebar.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
            sidebar.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
            sidebar.topAnchor.constraint(equalTo: effect.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: effect.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: effect.trailingAnchor),
            content.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            content.topAnchor.constraint(equalTo: root.topAnchor),
            content.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])
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
        sidebarWidth.constant = cfg.sidebarWidth

        var existing = Dictionary(uniqueKeysWithValues: items.map { ($0.spec.id, $0) })
        var next: [TabItem] = []
        for group in cfg.groups {
            for spec in group.tabs {
                if let item = existing.removeValue(forKey: spec.id), item.spec == spec {
                    item.groupName = group.name
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
        }
        items = next
        sidebar.items = items
        rebuildTabMenu()

        if current == nil || !items.contains(where: { $0 === current }) {
            if let first = items.first { self.select(first) }
        } else if select, let current { self.select(current) }
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

    private func select(_ item: TabItem) {
        let wv = item.ensureWebView()
        if wv.superview == nil {
            wv.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(wv)
            NSLayoutConstraint.activate([
                wv.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                wv.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                wv.topAnchor.constraint(equalTo: content.topAnchor),
                wv.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            ])
        }
        for other in items where other !== item { other.webView?.isHidden = true }
        wv.isHidden = false
        current = item
        sidebar.selected = item
        sidebar.needsDisplay = true
        window.makeFirstResponder(wv)
    }

    private func select(index: Int) {
        guard items.indices.contains(index) else { return }
        select(items[index])
    }

    private func step(_ delta: Int) {
        guard let current, let i = items.firstIndex(where: { $0 === current }), !items.isEmpty else { return }
        select(items[(i + delta + items.count) % items.count])
    }

    private func itemChanged() {
        sidebar.needsDisplay = true
        let total = items.reduce(0) { $0 + $1.unread }
        NSApp.dockTile.badgeLabel = total > 0 ? "\(total)" : nil
        statusItem?.button?.image = NSImage(named: total > 0 ? "trayIconUnread" : "trayIcon")
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
        if let unread = items.first(where: { $0.unread > 0 }) { select(unread) }
    }

    // MARK: notifications

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler handler: @escaping (UNNotificationPresentationOptions) -> Void) {
        handler([.banner, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler handler: @escaping () -> Void) {
        if let id = response.notification.request.content.userInfo["tab"] as? String,
           let item = items.first(where: { $0.spec.id == id }) {
            select(item)
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
        for (i, item) in items.enumerated() {
            let key = i < 9 ? "\(i + 1)" : ""
            let mi = tabMenu.addItem(withTitle: item.spec.resolvedLabel, action: #selector(selectTab(_:)), keyEquivalent: key)
            mi.tag = i
        }
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
    @objc private func selectTab(_ sender: NSMenuItem) { select(index: sender.tag) }
    @objc private func copyURL() {
        guard let url = current?.webView?.url?.absoluteString else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
    }
    @objc private func openInBrowser() {
        if let url = current?.webView?.url { NSWorkspace.shared.open(url) }
    }
}
