import Foundation

/// Text edits of bookmarks.yml. By text, not by re-encoding, so comments and order survive.
enum YamlEdit {
    /// Appends a tab to a group in the YAML by text, so comments and order survive.
    /// A group that does not exist is added at the end.
    static func append(file: URL, url: String, label: String?, group: String) throws {
        var lines = try String(contentsOf: file, encoding: .utf8).components(separatedBy: "\n")
        if lines.last == "" { lines.removeLast() }
        var entry = ["      - url: \(url)"]
        if let label, !label.isEmpty { entry.append("        label: \(quoted(label))") }

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
            lines.append("  - name: \(quoted(group))")
            lines.append("    tabs:")
            lines.append(contentsOf: entry)
        }
        try (lines.joined(separator: "\n") + "\n").write(to: file, atomically: true, encoding: .utf8)
    }

    /// Lines of the entry for `url`: the `- url:` line and its indented attributes.
    private static func entryRange(in lines: [String], url: String) -> (start: Int, end: Int, indent: Int)? {
        for (i, line) in lines.enumerated() {
            guard let m = line.range(of: "^(\\s*)- url:\\s*", options: .regularExpression) else { continue }
            let value = line[m.upperBound...].trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            guard value == url else { continue }
            let dash = line.distance(from: line.startIndex, to: line.firstIndex(of: "-")!)
            var end = i + 1
            while end < lines.count {
                let l = lines[end]
                let lead = l.prefix(while: { $0 == " " }).count
                if l.trimmingCharacters(in: .whitespaces).isEmpty || (lead > dash && !l.dropFirst(lead).hasPrefix("- ")) { end += 1 } else { break }
            }
            while end > i + 1, lines[end - 1].trimmingCharacters(in: .whitespaces).isEmpty { end -= 1 }
            return (i, end, dash + 2)
        }
        return nil
    }

    /// Sets (or removes, with nil) one attribute of a tab in the YAML.
    static func set(file: URL, url: String, key: String, value: String?) throws {
        var lines = try String(contentsOf: file, encoding: .utf8).components(separatedBy: "\n")
        guard let r = entryRange(in: lines, url: url) else { return }
        let pad = String(repeating: " ", count: r.indent)
        if let i = (r.start + 1..<r.end).first(where: { lines[$0].range(of: "^\\s*\(key):", options: .regularExpression) != nil }) {
            if let value { lines[i] = "\(pad)\(key): \(value)" } else { lines.remove(at: i) }
        } else if let value {
            lines.insert("\(pad)\(key): \(value)", at: r.end)
        }
        try (lines.joined(separator: "\n")).write(to: file, atomically: true, encoding: .utf8)
    }

    static func remove(file: URL, url: String) throws {
        var lines = try String(contentsOf: file, encoding: .utf8).components(separatedBy: "\n")
        guard let r = entryRange(in: lines, url: url) else { return }
        lines.removeSubrange(r.start..<r.end)
        try (lines.joined(separator: "\n")).write(to: file, atomically: true, encoding: .utf8)
    }

    static func quoted(_ s: String) -> String {
        let safe = s.range(of: "^[A-Za-z0-9 ._-]+$", options: .regularExpression) != nil
        return safe ? s : "\"" + s.replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}
