# Homie

A sidebar browser. Pinned sites on top, shared between every Mac through one YAML
file; everything else in a Today list that clears when you want it to. Electron,
so it is Chromium with Chrome extensions, and the sidebar is plain HTML and CSS.

Version 4 (2026-10-23) replaced the native WebKit app, which replaced the Electron
v2 the day before. Arc's sunset started all of it; the earlier versions are in git.

## Install

    scripts/install.sh

Builds `~/Applications/Homie.app` (about 250 MB, it is Chromium), links the shared
bookmarks file and adds Homie to Login Items. `scripts/install.sh --check` reports
what is out of date. `skynet/config/install.sh` calls it on every Mac. Needs node 20+.

Make it the default browser from the Homie menu; links from other apps then open
as Today tabs.

## Bookmarks

`~/Library/Application Support/Homie/bookmarks.yml`, which install.sh links to
`skynet/config/homie/bookmarks.yml`. Edits apply live. Toggles from the app are
written back as text, so comments and order survive.

```yaml
groups:
  - name: Homie
    tabs:
      - url: https://calendar.google.com/calendar/u/0/r
        label: Calendar          # optional, default is the host name
  - name: Social
    tabs:
      - url: https://www.messenger.com/
        muted: true              # no sounds from this tab (right-click a tab to toggle)
        badge: false             # ignore the "(3)" in its title
```

Logins, zoom per site, window frame, sidebar width and the Today list stay per
machine. Extensions install from the Chrome Web Store (Homie menu) and live in
`Application Support/Homie/Extensions`.

## Keys

| | |
|---|---|
| Cmd+T | new tab: type a search or an address |
| Cmd+L | edit the address of the current tab |
| Cmd+F, Cmd+G | find in page, next match (Shift for previous) |
| Cmd+1…9 | pinned tab by position |
| Ctrl+Tab, Ctrl+Shift+Tab | next, previous tab |
| Cmd+W | close a Today tab; a pinned tab goes back to its page, or unloads |
| Cmd+Shift+T | reopen the last closed tab |
| Cmd+Shift+W | clear Today |
| Cmd+D | pin the current page (Today tab: pick a group; pinned tab: replace its address) |
| Cmd+R, Cmd+Shift+R | reload, back to the pinned page |
| Cmd+[ Cmd+] | back, forward |
| Cmd+= Cmd+- Cmd+0 | zoom, remembered per site |
| Cmd+M | mute the tab |
| Cmd+Shift+C | copy the page address |
| Cmd+Shift+O | open the page in Chrome |
| Cmd+Shift+S | hide or show the sidebar (drag its edge to resize) |
| Cmd+, | open bookmarks.yml |
| right-click a tab | pin, mute, badge, rename, reload, reset, unpin, close |
| double-click a pinned tab | rename |

Popups that need their opener (sign-in windows) open as windows; every other new
window request becomes a Today tab. Downloads go to `~/Downloads` and show at the
bottom of the sidebar: click to reveal, double-click to open.
