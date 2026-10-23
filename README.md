# Homie

A window with the sites that are always open. Native Mac, AppKit and WKWebView,
no browser underneath. Nine pinned tabs in a sidebar, badges from their titles,
chat notifications through macOS, one shared YAML for every machine.

Version 3 replaced the Electron app on 2026-10-23, the day after Arc's sunset was
announced. The Electron versions are in the git history.

## Install

    scripts/install.sh

Builds `~/Applications/Homie.app`, links the shared bookmarks file and adds Homie
to Login Items. `scripts/install.sh --check` reports what is out of date.
`skynet/config/install.sh` calls it on every Mac.

## Bookmarks

`~/Library/Application Support/Homie/bookmarks.yml`, which install.sh links to
`skynet/config/homie/bookmarks.yml`. Edits apply live.

```yaml
sidebar_width: 180
groups:
  - name: Homie
    tabs:
      - url: https://calendar.google.com/calendar/u/0/r
        label: Calendar          # optional, default is the host name
  - name: Social
    tabs:
      - url: https://www.messenger.com/
        muted: true              # no sounds from this tab
        badge: false             # ignore the "(3)" in its title
```

Logins stay per machine. Cookies live in WebKit's default store, so sign in once
on each Mac.

## Keys

| | |
|---|---|
| Cmd+1…9 | tab by position |
| Ctrl+Tab, Ctrl+Shift+Tab | next, previous tab |
| Cmd+R | reload |
| Cmd+Shift+R | back to the pinned page |
| Cmd+[ Cmd+] | back, forward |
| Cmd+Shift+C | copy the page address |
| Cmd+Shift+O | open the page in the default browser |
| Cmd+= Cmd+- Cmd+0 | zoom, remembered per site |
| Cmd+, | open bookmarks.yml |

Links that ask for a new window open in the default browser; Homie is not for
browsing. Downloads go to ~/Downloads.
