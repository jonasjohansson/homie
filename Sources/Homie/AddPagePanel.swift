import AppKit

/// "Add Page…": URL, label, group. Appends to bookmarks.yml; the watcher does the rest.
enum AddPagePanel {
    static func run(url: String, label: String, groups: [String], defaultGroup: String?) {
        let alert = NSAlert()
        alert.messageText = "Add Page"
        alert.informativeText = "Goes into the shared bookmarks file."
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")

        let form = NSGridView(numberOfColumns: 2, rows: 0)
        form.rowSpacing = 8
        form.columnSpacing = 8
        form.column(at: 0).xPlacement = .trailing

        let urlField = NSTextField(string: url)
        let labelField = NSTextField(string: label)
        labelField.placeholderString = "optional"
        let groupPopup = NSPopUpButton(frame: .zero, pullsDown: false)
        groupPopup.addItems(withTitles: groups)
        groupPopup.addItem(withTitle: "New group…")
        if let d = defaultGroup { groupPopup.selectItem(withTitle: d) }
        let newGroupField = NSTextField(string: "")
        newGroupField.placeholderString = "group name"
        newGroupField.isHidden = true

        for f in [urlField, labelField, newGroupField] {
            f.widthAnchor.constraint(equalToConstant: 360).isActive = true
        }
        groupPopup.widthAnchor.constraint(equalToConstant: 360).isActive = true

        form.addRow(with: [NSTextField(labelWithString: "URL"), urlField])
        form.addRow(with: [NSTextField(labelWithString: "Label"), labelField])
        form.addRow(with: [NSTextField(labelWithString: "Group"), groupPopup])
        let newRow = form.addRow(with: [NSTextField(labelWithString: ""), newGroupField])
        newRow.isHidden = true

        let handler = PopupHandler { newRow.isHidden = groupPopup.indexOfSelectedItem != groups.count }
        groupPopup.target = handler
        groupPopup.action = #selector(PopupHandler.changed)
        newGroupField.isHidden = false

        form.frame = NSRect(x: 0, y: 0, width: 420, height: 130)
        alert.accessoryView = form
        alert.window.initialFirstResponder = urlField

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let u = urlField.stringValue.trimmingCharacters(in: .whitespaces)
        guard URL(string: u)?.host != nil else { return }
        let group = groupPopup.indexOfSelectedItem == groups.count
            ? newGroupField.stringValue.trimmingCharacters(in: .whitespaces)
            : groupPopup.titleOfSelectedItem ?? "Homie"
        do {
            try ConfigStore.append(url: u, label: labelField.stringValue, group: group.isEmpty ? "Homie" : group)
        } catch {
            let e = NSAlert(error: error); e.runModal()
        }
        _ = handler
    }

    private final class PopupHandler: NSObject {
        let fn: () -> Void
        init(_ fn: @escaping () -> Void) { self.fn = fn }
        @objc func changed() { fn() }
    }
}
