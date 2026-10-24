# Homie

A sidebar browser. Pinned sites on top, shared between every Mac through one YAML
file; everything else in a Today list that clears when you want it to. Electron,
so it is Chromium with Chrome extensions, and the sidebar is plain HTML and CSS.

Version 4 (2026-10-23) replaced the native WebKit app, which replaced the Electron
v2 the day before. Arc's sunset started all of it; the earlier versions are in git.
Version 4.1 (2026-10-24) added terminal tabs and the MCP server for agents.

## Install

    scripts/install.sh

Builds `~/Applications/Homie.app` (about 250 MB, it is Chromium), links the shared
bookmarks file and adds Homie to Login Items. `scripts/install.sh --check` reports
what is out of date. `skynet/config/install.sh` calls it on every Mac. Needs node 20+.

Make it the default browser from the Homie menu; links from other apps then open
as Today tabs.

To work on Homie beside the installed one, `HOMIE_USER_DATA=/tmp/homie-dev npm start`
runs a second profile; its window opens behind the one you are in.

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
| Ctrl+M | mute the tab (Cmd+M minimizes, as everywhere on the Mac) |
| Cmd+Shift+C | copy the page address |
| Cmd+Shift+O | open the page in Chrome |
| Cmd+Shift+S | hide or show the sidebar (drag its edge to resize) |
| Cmd+, | open bookmarks.yml |
| right-click a tab | pin, mute, badge, rename, reload, reset, unpin, close |
| double-click a pinned tab | rename |

Popups that need their opener (sign-in windows) open as windows; every other new
window request becomes a Today tab. Downloads go to `~/Downloads` and show at the
bottom of the sidebar: click to reveal, double-click to open.

## Terminal tabs

A tab whose url is `terminal:` and a folder is a shell in that folder: your login
shell, with your own PATH and aliases. Pin one to keep a command running in the
sidebar; `run` types it at the prompt when the tab opens:

```yaml
  - name: Terminal
    tabs:
      - url: terminal:~/Projects/site
        label: Claude
        run: claude
```

New Terminal (the + menu, or File) opens one in your home folder, and
`terminal:/some/folder` typed as an address opens one there. Only pinned rows run
anything; a Today terminal starts at a plain prompt, and web pages cannot open
terminals at all.

The shell belongs to the tab: reloading the page keeps it, closing the tab ends
it. A bell, or a notification a program sends (OSC 9 or 777, as Claude Code can),
puts a badge on the row while it is out of sight and shows a notification while
Homie is in the background. Cmd+click opens a link as a tab, a file dropped on
the terminal types its path, Cmd+K clears. Option stays a character key, so
@ [ ] { } type as usual on Nordic layouts; Cmd and Option with the arrows and
Delete move and delete by line and word, and Shift+Return is a new line in
Claude Code's prompt.

## Agents

With `agents: true` at the top of bookmarks.yml, Homie is an MCP server, and an
agent on this Mac (Claude Code in a terminal tab, or anywhere else) can see and
drive the browser: list the tabs, read a page's text, take a screenshot of a tab,
and open, switch, split, pin and close tabs. It cannot click or type inside a
page, because a page or an email can carry instructions written for the agent.

It listens on 127.0.0.1:47616 only, and every request needs the token Homie keeps
in `~/Library/Application Support/Homie/agent-token`; requests from web pages are
refused. To connect Claude Code, once per Mac, with Homie running:

```sh
claude mcp add --scope user --transport http homie http://127.0.0.1:47616/mcp \
  --header "Authorization: Bearer $(cat ~/Library/Application\ Support/Homie/agent-token)"
```
