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
    /// Appends a tab to a group in the YAML by text, so comments and order survive.
    /// A group that does not exist is added at the end.
    static func append(url: String, label: String?, group: String) throws {
        var lines = try String(contentsOf: self.url, encoding: .utf8).components(separatedBy: "\n")
        if lines.last == "" { lines.removeLast() }
        var entry = ["      - url: \(url)"]
        if let label, !label.isEmpty { entry.append("        label: \(yamlQuoted(label))") }

        var groupLine: Int? = nil
        for (i, line) in lines.enumerated() where line.hasPrefix("  - name:") {
            let name = line.dropFirst("  - name:".count).trimmingCharacters(in: .whitespaces)
            if name.trimmingCharacters(in: CharacterSet(charactersIn: "\"'")) == group { groupLine = i }
        }
        if let g = groupLine {
            var end = lines.count
            for i in (g + 1)..<lines.count where lines[i].hasPrefix("  - name:") { end = i; break }
            while end > g + 1, lines[end - 1].trimmingCharacters(in: .whitespaces).isEmpty { end -= 1 }
            lines.insert(contentsOf: entry, at: end)
        } else {
            lines.append("  - name: \(yamlQuoted(group))")
            lines.append("    tabs:")
            lines.append(contentsOf: entry)
        }
        let real = self.url.resolvingSymlinksInPath()
        try (lines.joined(separator: "\n") + "\n").write(to: real, atomically: true, encoding: .utf8)
    }

    private static func yamlQuoted(_ s: String) -> String {
        let safe = s.range(of: "^[A-Za-z0-9 ._-]+$", options: .regularExpression) != nil
        return safe ? s : "\"" + s.replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}
