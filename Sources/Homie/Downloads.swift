import AppKit
import WebKit
import UserNotifications

/// One download, running or done. Persisted as a path plus dates; a file that no longer
/// exists is dropped on the next launch.
final class DownloadEntry: NSObject {
    let file: URL
    let source: URL?
    let started: Date
    var finished: Date?
    var error: String?
    var progress: Progress?

    init(file: URL, source: URL?, started: Date = Date(), finished: Date? = nil) {
        self.file = file; self.source = source; self.started = started; self.finished = finished
    }

    var isActive: Bool { finished == nil && error == nil }
    var size: Int64 {
        if let p = progress, isActive { return p.totalUnitCount }
        return (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int64) ?? 0
    }
}

final class DownloadManager {
    static let shared = DownloadManager()
    private(set) var entries: [DownloadEntry] = []
    var onChange: (() -> Void)?
    private var byDownload: [ObjectIdentifier: DownloadEntry] = [:]
    private var observations: [ObjectIdentifier: NSKeyValueObservation] = [:]
    private var lastTick = Date.distantPast

    private let store: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Homie/downloads.json")
    }()

    var activeCount: Int { entries.filter(\.isActive).count }

    private init() { load() }

    func begin(_ download: WKDownload, file: URL, source: URL?) {
        let e = DownloadEntry(file: file, source: source)
        e.progress = download.progress
        byDownload[ObjectIdentifier(download)] = e
        observations[ObjectIdentifier(download)] = download.progress.observe(\.fractionCompleted) { [weak self] _, _ in
            guard let self, Date().timeIntervalSince(self.lastTick) > 0.2 else { return }
            self.lastTick = Date()
            DispatchQueue.main.async { self.onChange?(); NotificationCenter.default.post(name: .homieDownloadsChanged, object: nil) }
        }
        entries.insert(e, at: 0)
        changed()
    }

    func finish(_ download: WKDownload) {
        guard let e = byDownload.removeValue(forKey: ObjectIdentifier(download)) else { return }
        observations.removeValue(forKey: ObjectIdentifier(download))
        e.finished = Date()
        e.progress = nil
        changed()
        let c = UNMutableNotificationContent()
        c.title = "Downloaded"
        c.body = e.file.lastPathComponent
        c.userInfo = ["download": e.file.path]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "dl-" + e.file.path, content: c, trigger: nil))
    }

    func fail(_ download: WKDownload, error: Error) {
        guard let e = byDownload.removeValue(forKey: ObjectIdentifier(download)) else { return }
        observations.removeValue(forKey: ObjectIdentifier(download))
        e.error = error.localizedDescription
        e.progress = nil
        changed()
    }

    func remove(_ e: DownloadEntry) {
        entries.removeAll { $0 === e }
        changed()
    }

    func clearFinished() {
        entries.removeAll { !$0.isActive }
        changed()
    }

    private func changed() {
        save()
        onChange?()
        NotificationCenter.default.post(name: .homieDownloadsChanged, object: nil)
    }

    // MARK: persistence

    private func load() {
        guard let data = try? Data(contentsOf: store),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        for r in rows {
            guard let path = r["file"] as? String, FileManager.default.fileExists(atPath: path) else { continue }
            let e = DownloadEntry(file: URL(fileURLWithPath: path),
                                  source: (r["source"] as? String).flatMap(URL.init(string:)),
                                  started: Date(timeIntervalSince1970: r["started"] as? Double ?? 0),
                                  finished: (r["finished"] as? Double).map(Date.init(timeIntervalSince1970:)))
            if e.finished == nil { e.error = "interrupted" }
            entries.append(e)
        }
    }

    private func save() {
        let rows: [[String: Any]] = entries.filter { !$0.isActive }.compactMap { e in
            guard e.error == nil else { return nil }
            var r: [String: Any] = ["file": e.file.path, "started": e.started.timeIntervalSince1970]
            if let s = e.source { r["source"] = s.absoluteString }
            if let f = e.finished { r["finished"] = f.timeIntervalSince1970 }
            return r
        }
        try? FileManager.default.createDirectory(at: store.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted]) {
            try? data.write(to: store, options: .atomic)
        }
    }
}

/// The Downloads page: a list, each row a file you can drag out, double-click to open.
final class DownloadsView: NSView, NSTableViewDataSource, NSTableViewDelegate {
    private let table = NSTableView()
    private let empty = NSTextField(labelWithString: "No downloads yet")
    private var rows: [DownloadEntry] { DownloadManager.shared.entries }

    private static let sizeFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter(); f.countStyle = .file; return f
    }()
    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateStyle = .short; f.timeStyle = .short; f.doesRelativeDateFormatting = true; return f
    }()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        table.headerView = nil
        table.rowHeight = 48
        table.style = .inset
        table.backgroundColor = .clear
        table.selectionHighlightStyle = .regular
        table.allowsMultipleSelection = true
        let col = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("file"))
        col.resizingMask = .autoresizingMask
        table.addTableColumn(col)
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        table.dataSource = self
        table.delegate = self
        table.target = self
        table.doubleAction = #selector(openSelected)
        table.setDraggingSourceOperationMask(.copy, forLocal: false)
        table.setDraggingSourceOperationMask(.copy, forLocal: true)
        table.menu = contextMenu()
        scroll.documentView = table
        addSubview(scroll)

        empty.textColor = .secondaryLabelColor
        empty.font = .systemFont(ofSize: 13)
        empty.translatesAutoresizingMaskIntoConstraints = false
        addSubview(empty)

        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.topAnchor.constraint(equalTo: topAnchor, constant: 40),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            empty.centerXAnchor.constraint(equalTo: centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        DownloadManager.shared.onChange = { [weak self] in self?.reload() }
        reload()
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidChangeEffectiveAppearance() { reload() }

    func reload() {
        table.reloadData()
        empty.isHidden = !rows.isEmpty
    }

    // MARK: table

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let e = rows[row]
        let cell = NSView()
        let icon = NSImageView(image: NSWorkspace.shared.icon(forFile: e.file.path))
        icon.translatesAutoresizingMaskIntoConstraints = false
        let name = NSTextField(labelWithString: e.file.lastPathComponent)
        name.font = .systemFont(ofSize: 13)
        name.lineBreakMode = .byTruncatingMiddle
        name.translatesAutoresizingMaskIntoConstraints = false
        let detail = NSTextField(labelWithString: "")
        detail.font = .systemFont(ofSize: 11)
        detail.textColor = .secondaryLabelColor
        detail.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(icon); cell.addSubview(name); cell.addSubview(detail)

        if e.isActive, let p = e.progress {
            let bar = NSProgressIndicator()
            bar.style = .bar
            bar.isIndeterminate = p.totalUnitCount <= 0
            bar.minValue = 0; bar.maxValue = 1
            bar.doubleValue = p.fractionCompleted
            bar.translatesAutoresizingMaskIntoConstraints = false
            cell.addSubview(bar)
            if bar.isIndeterminate { bar.startAnimation(nil) }
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: name.leadingAnchor),
                bar.widthAnchor.constraint(equalToConstant: 160),
                bar.centerYAnchor.constraint(equalTo: detail.centerYAnchor),
                detail.leadingAnchor.constraint(equalTo: bar.trailingAnchor, constant: 8),
            ])
            let done = p.totalUnitCount > 0 ? DownloadsView.sizeFormatter.string(fromByteCount: p.completedUnitCount) + " of " + DownloadsView.sizeFormatter.string(fromByteCount: p.totalUnitCount) : DownloadsView.sizeFormatter.string(fromByteCount: p.completedUnitCount)
            detail.stringValue = done
        } else {
            detail.leadingAnchor.constraint(equalTo: name.leadingAnchor).isActive = true
            if let err = e.error {
                detail.stringValue = err
            } else {
                let host = e.source?.host.map { "  ·  " + $0.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) } ?? ""
                detail.stringValue = DownloadsView.sizeFormatter.string(fromByteCount: e.size) + "  ·  " + DownloadsView.timeFormatter.string(from: e.finished ?? e.started) + host
            }
        }
        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8),
            icon.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 32),
            icon.heightAnchor.constraint(equalToConstant: 32),
            name.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 10),
            name.trailingAnchor.constraint(lessThanOrEqualTo: cell.trailingAnchor, constant: -8),
            name.topAnchor.constraint(equalTo: cell.topAnchor, constant: 7),
            detail.topAnchor.constraint(equalTo: name.bottomAnchor, constant: 2),
            detail.trailingAnchor.constraint(lessThanOrEqualTo: cell.trailingAnchor, constant: -8),
        ])
        return cell
    }

    func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
        let e = rows[row]
        return e.isActive ? nil : (e.file as NSURL)
    }

    func tableView(_ tableView: NSTableView, draggingSession session: NSDraggingSession, willBeginAt screenPoint: NSPoint, forRowIndexes rowIndexes: IndexSet) {
        session.draggingFormation = .list
    }

    // MARK: actions

    private var targets: [DownloadEntry] {
        let clicked = table.clickedRow
        let sel = table.selectedRowIndexes
        let idx = clicked >= 0 && !sel.contains(clicked) ? IndexSet(integer: clicked) : sel
        return idx.compactMap { rows.indices.contains($0) ? rows[$0] : nil }
    }

    @objc private func openSelected() {
        for e in targets where !e.isActive { NSWorkspace.shared.open(e.file) }
    }

    @objc private func reveal() {
        NSWorkspace.shared.activateFileViewerSelecting(targets.map(\.file))
    }

    @objc private func removeFromList() {
        for e in targets { DownloadManager.shared.remove(e) }
    }

    @objc private func moveToTrash() {
        for e in targets where !e.isActive {
            try? FileManager.default.trashItem(at: e.file, resultingItemURL: nil)
            DownloadManager.shared.remove(e)
        }
    }

    @objc private func clearFinished() { DownloadManager.shared.clearFinished() }

    @objc private func openSource() {
        for e in targets { if let s = e.source { NSWorkspace.shared.open(s) } }
    }

    private func contextMenu() -> NSMenu {
        let m = NSMenu()
        m.addItem(withTitle: "Open", action: #selector(openSelected), keyEquivalent: "")
        m.addItem(withTitle: "Show in Finder", action: #selector(reveal), keyEquivalent: "")
        m.addItem(withTitle: "Open Source Page in Browser", action: #selector(openSource), keyEquivalent: "")
        m.addItem(.separator())
        m.addItem(withTitle: "Remove from List", action: #selector(removeFromList), keyEquivalent: "")
        m.addItem(withTitle: "Move to Trash", action: #selector(moveToTrash), keyEquivalent: "")
        m.addItem(.separator())
        m.addItem(withTitle: "Clear Finished", action: #selector(clearFinished), keyEquivalent: "")
        for mi in m.items { mi.target = self }
        return m
    }
}

extension Notification.Name {
    static let homieDownloadsChanged = Notification.Name("homieDownloadsChanged")
}
