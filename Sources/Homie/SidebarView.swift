import AppKit

/// The pinned list. Draws itself: group names, favicon, label, unread count.
/// Strict grid, no hover states. Empty space drags the window.
final class SidebarView: NSView {
    struct Row {
        enum Kind { case header(String), tab(TabItem) }
        let kind: Kind
        let frame: NSRect
    }

    var items: [TabItem] = [] { didSet { needsDisplay = true } }
    var selected: TabItem?
    var onSelect: ((TabItem) -> Void)?

    static let rowHeight: CGFloat = 28
    static let headerHeight: CGFloat = 24
    static let gap: CGFloat = 12
    static let top: CGFloat = 52          // room for the traffic lights
    static let inset: CGFloat = 12

    override var isFlipped: Bool { true }
    override var mouseDownCanMoveWindow: Bool { false }

    private var rows: [Row] {
        var out: [Row] = []
        var y = SidebarView.top
        var lastGroup: String? = nil
        for item in items {
            if item.groupName != lastGroup {
                if lastGroup != nil { y += SidebarView.gap }
                out.append(Row(kind: .header(item.groupName),
                               frame: NSRect(x: 0, y: y, width: bounds.width, height: SidebarView.headerHeight)))
                y += SidebarView.headerHeight
                lastGroup = item.groupName
            }
            out.append(Row(kind: .tab(item), frame: NSRect(x: 0, y: y, width: bounds.width, height: SidebarView.rowHeight)))
            y += SidebarView.rowHeight
        }
        return out
    }

    override func draw(_ dirtyRect: NSRect) {
        let inset = SidebarView.inset
        let headerFont = NSFont.systemFont(ofSize: 11, weight: .semibold)
        let labelFont = NSFont.systemFont(ofSize: 13)
        let countFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium)

        for row in rows {
            switch row.kind {
            case .header(let name):
                let attrs: [NSAttributedString.Key: Any] = [.font: headerFont, .foregroundColor: NSColor.secondaryLabelColor]
                let s = NSAttributedString(string: name, attributes: attrs)
                s.draw(at: NSPoint(x: inset, y: row.frame.minY + (row.frame.height - s.size().height) / 2 + 2))

            case .tab(let item):
                var r = row.frame.insetBy(dx: 6, dy: 1)
                if item === selected {
                    NSColor.unemphasizedSelectedContentBackgroundColor.setFill()
                    NSBezierPath(roundedRect: r, xRadius: 5, yRadius: 5).fill()
                }
                r = r.insetBy(dx: 6, dy: 0)
                let iconRect = NSRect(x: r.minX, y: r.midY - 8, width: 16, height: 16)
                if let icon = item.favicon {
                    icon.draw(in: iconRect, from: .zero, operation: .sourceOver, fraction: item.isLoaded ? 1 : 0.55, respectFlipped: true, hints: nil)
                } else {
                    NSColor.quaternaryLabelColor.setFill()
                    NSBezierPath(roundedRect: iconRect, xRadius: 4, yRadius: 4).fill()
                }

                var countWidth: CGFloat = 0
                if item.unread > 0 {
                    let c = NSAttributedString(string: "\(item.unread)", attributes: [.font: countFont, .foregroundColor: NSColor.secondaryLabelColor])
                    let size = c.size()
                    c.draw(at: NSPoint(x: r.maxX - size.width, y: r.midY - size.height / 2))
                    countWidth = size.width + 8
                }

                let color: NSColor = item.isLoaded ? .labelColor : .secondaryLabelColor
                let label = NSAttributedString(string: item.spec.resolvedLabel, attributes: [.font: labelFont, .foregroundColor: color])
                let maxW = r.width - 24 - countWidth
                let size = label.size()
                let labelRect = NSRect(x: r.minX + 24, y: r.midY - size.height / 2, width: maxW, height: size.height)
                label.draw(with: labelRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
            }
        }
    }

    override func mouseDown(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        for row in rows {
            if case .tab(let item) = row.kind, row.frame.contains(p) {
                onSelect?(item)
                return
            }
        }
        window?.performDrag(with: event)
    }

    override func viewDidChangeEffectiveAppearance() {
        needsDisplay = true
    }
}
