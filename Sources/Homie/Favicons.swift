import AppKit

/// Favicons by host, cached on disk in ~/Library/Caches/Homie/favicons.
enum Favicons {
    private static var memory: [String: NSImage] = [:]
    private static let dir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("Homie/favicons")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    /// The page's own icon, found after load. Replaces the host-level one (Google's
    /// service returns the same "G" for Sheets, Calendar and Gmail).
    static func update(host: String, from pageIcon: URL, completion: @escaping (NSImage) -> Void) {
        URLSession.shared.dataTask(with: pageIcon) { data, _, _ in
            guard let data, let img = NSImage(data: data), img.size.width >= 16 else { return }
            try? data.write(to: dir.appendingPathComponent(host + ".png"))
            DispatchQueue.main.async {
                memory[host] = img
                completion(img)
            }
        }.resume()
    }

    static let pageIconScript = """
    (function () {
      const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
      const score = (l) => {
        const s = parseInt((l.sizes && l.sizes.value || '0x0').split('x')[0]) || (l.rel.includes('apple') ? 180 : 32);
        return (l.href.endsWith('.svg') ? 0 : s);
      };
      links.sort((a, b) => score(b) - score(a));
      return links.length ? links[0].href : '';
    })();
    """

    static func image(for host: String, completion: @escaping (NSImage) -> Void) {
        if let img = memory[host] { completion(img); return }
        let file = dir.appendingPathComponent(host + ".png")
        if let img = NSImage(contentsOf: file) {
            memory[host] = img
            completion(img)
            return
        }
        guard let url = URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=64") else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let img = NSImage(data: data) else { return }
            try? data.write(to: file)
            DispatchQueue.main.async {
                memory[host] = img
                completion(img)
            }
        }.resume()
    }
}
