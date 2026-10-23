import Foundation
import Yams

/// One pinned site in the sidebar.
struct TabSpec: Codable, Equatable {
    var url: String
    var label: String?
    var muted: Bool?
    var badge: Bool?

    /// Identity across config reloads: the URL string. Editing a URL makes a new tab.
    var id: String { url }

    var resolvedLabel: String {
        if let label, !label.isEmpty { return label }
        guard let host = URL(string: url)?.host else { return url }
        var h = host.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
        h = h.replacingOccurrences(of: "\\.(com|org|net|io|app|dev|se|me)$", with: "", options: .regularExpression)
        return h.prefix(1).uppercased() + h.dropFirst()
    }
}

struct GroupSpec: Codable, Equatable {
    var name: String
    var tabs: [TabSpec]
}

struct Config: Codable, Equatable {
    var groups: [GroupSpec]
    var allTabs: [TabSpec] { groups.flatMap(\.tabs) }
}

enum ConfigStore {
    /// `~/Library/Application Support/Homie/bookmarks.yml`. install.sh links this to
    /// skynet/config/homie/bookmarks.yml so every Mac reads one shared file.
    static let url: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Homie/bookmarks.yml")
    }()

    static let starter = """
    # Homie — the pinned sidebar. One file, every Mac (linked from skynet/config/homie).
    # Edits apply live. Fields per tab: url (required), label, muted, badge (default true).
    groups:
      - name: Homie
        tabs:
          - url: https://calendar.google.com/calendar/u/0/r
            label: Calendar
      - name: Social
        tabs:
          - url: https://mail.google.com/mail/
          - url: https://www.messenger.com/
            muted: true
    """

    static func load() throws -> Config {
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) {
            try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try starter.write(to: url, atomically: true, encoding: .utf8)
        }
        let text = try String(contentsOf: url, encoding: .utf8)
        var cfg = try YAMLDecoder().decode(Config.self, from: text)
        cfg.groups = cfg.groups.map { g in
            var g = g
            g.tabs = g.tabs.filter { URL(string: $0.url)?.host != nil }
            return g
        }
        return cfg
    }
}

/// Watches the directory that holds the real config file (through symlinks), because
/// editors save atomically (write temp, rename) and git replaces the file on pull.
final class ConfigWatcher {
    private var source: DispatchSourceFileSystemObject?
    private var fd: Int32 = -1
    private var pending: DispatchWorkItem?
    private let onChange: () -> Void

    init(onChange: @escaping () -> Void) {
        self.onChange = onChange
        start()
    }

    private func start() {
        let real = ConfigStore.url.resolvingSymlinksInPath()
        let dir = real.deletingLastPathComponent().path
        fd = open(dir, O_EVTONLY)
        guard fd >= 0 else { return }
        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd, eventMask: [.write, .rename, .delete, .attrib], queue: .main)
        src.setEventHandler { [weak self] in self?.schedule() }
        src.setCancelHandler { [fd] in close(fd) }
        src.resume()
        source = src
    }

    private func schedule() {
        pending?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.onChange() }
        pending = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: item)
    }

    deinit { source?.cancel() }
}

extension ConfigStore {
    static var realURL: URL { url.resolvingSymlinksInPath() }
    static func append(url: String, label: String?, group: String) throws { try YamlEdit.append(file: realURL, url: url, label: label, group: group) }
    static func set(url: String, key: String, value: String?) throws { try YamlEdit.set(file: realURL, url: url, key: key, value: value) }
    static func remove(url: String) throws { try YamlEdit.remove(file: realURL, url: url) }
    static func quoted(_ s: String) -> String { YamlEdit.quoted(s) }
}
