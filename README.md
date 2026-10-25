# Homie

A sidebar browser. Pinned sites on top, shared between every Mac through one YAML
file; everything else in a Today list that clears when you want it to. Electron,
so it is Chromium with Chrome extensions, and the sidebar is plain HTML and CSS.

Version 4 (2026-10-23) replaced the native WebKit app, which replaced the Electron
v2 the day before. Arc's sunset started all of it; the earlier versions are in git.
Version 4.1 (2026-10-24) added terminal tabs and the MCP server for agents, 4.2 the
ask window and reactions, 4.3 and 4.4 a Claude for each tab, and 4.5 sets up Claude
Code on a Mac that does not have it yet.

## Install

    scripts/install.sh

Builds `~/Applications/Homie.app` (about 250 MB, it is Chromium), links the shared
bookmarks file and adds Homie to Login Items. `scripts/install.sh --check` reports
what is out of date. `skynet/config/install.sh` calls it on every Mac. Needs node 20+.

Make it the default browser from the Homie menu; links from other apps then open
as Today tabs. Homie opens at login from its first launch; Open at Login in the
Homie menu turns that off, and `open -a Homie --args --login-item=off` does the
same from a shell, without opening a window.

To work on Homie beside the installed one, `HOMIE_USER_DATA=/tmp/homie-dev npm start`
runs a second profile; its window opens behind the one you are in. Add
`HOMIE_AGENT_PORT=47617` when the installed Homie already serves agents.

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

## Passwords

Homie > Import Passwords from Chrome… copies the logins Chrome saved on this Mac, as
Arc does: it reads each Chrome profile's `Login Data` and decrypts it with the key
from the Keychain item "Chrome Safe Storage" (macOS asks once; Allow is enough). The
key is kept, so Homie imports again silently each time it starts. Logins live in
`Application Support/Homie/passwords.bin`, encrypted with Homie's own Keychain key.

A page is filled only on the exact https site a login was saved for: one login fills
as the form appears, several are listed under the field. After a sign-in Homie
offers to save or update the login (in Homie only, never back to Chrome).

## Keys

| | |
|---|---|
| Cmd+T | new tab: type a search or an address |
| Cmd+L | edit the address of the current tab |
| Cmd+F, Cmd+G | find in page, next match (Shift for previous) |
| Cmd+J | ask Claude about the page |
| Cmd+Option+J | Claude for this tab, floating over its corner |
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
| Cmd+Shift+S | hide or show the sidebar (drag its edge to resize); hidden, the window's left edge brings up its icons |
| Cmd+, | open bookmarks.yml |
| right-click a tab | pin, mute, badge, rename, reload, reset, unpin, close |
| double-click a pinned tab | rename |

Popups that need their opener (sign-in windows) open as windows; every other new
window request becomes a Today tab. A pinned tab keeps its page: a link to another
host (a link in a Gmail message, say) opens as a sub-tab under the pin, and its own
links stay under the same pin; links within the site and sign-in pages load in
place. Drag a sub-tab out to keep it on its own. Downloads go to `~/Downloads` and show at the
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

## Ask and reactions

Cmd+J asks Claude about the page in front of you: its text, title, address and
any selected text go along with the question, and the answer streams in under
it. Follow-up questions keep the earlier ones in mind; Escape or a click on the
page puts it away. On a terminal tab it reads the terminal's last 400 lines.

A pinned tab can react when its unread count goes up. The rule is plain text:

```yaml
      - url: https://mail.google.com/mail/
        label: Gmail
        react: Who wrote and what they want, one line per new message.
```

Eight seconds after the count rises, Claude reads the page with the rule and the
answer arrives as a notification, at most once in two minutes per tab, and not
while you are looking at that tab.

Both run `claude -p` from [Claude Code](https://claude.com/claude-code), so they
use your Claude subscription and need no API key. They run without tools, MCP
servers, your CLAUDE.md or hooks, and keep no session. `ask: haiku` at the top of
bookmarks.yml picks the model; it is Sonnet otherwise. Without Claude Code, or
signed out of it, Cmd+J says so, and the Claude beside a page sets it up.

## A Claude for each tab

The Claude button in a page's toolbar (Cmd+Option+J) opens Claude Code as a small
terminal floating in the page's bottom-right corner; the page keeps its size. It
belongs to that bookmark: switch to the bookmark and its Claude is there, switch
away and both go. It starts the first time you open it, keeps running while
hidden, sleeps after half an hour hidden and quiet, and ends with Cmd+W in it or
when the page unloads. Opening it again continues the conversation.

It is Claude Code, signed in with your own Claude account. On a Mac without Claude
Code the first one offers to install it: Return runs Anthropic's installer from
claude.ai in plain view, and Claude then starts and asks you to sign in.

Each bookmark has a folder, `~/Library/Application Support/Homie/Agents/<name>`,
with a CLAUDE.md for its own rules ("Gmail: drafts only, never send"). Beside the
folders, `Agents/CLAUDE.md` holds rules for all of them, `Agents/memory` (a folder,
or a link to one) becomes their shared Claude memory when it exists, and `Agents/settings.json`
their permissions: by default no shell and no file edits, and Claude asks before
every action, whatever your own Claude Code defaults are. It reads its page with
Homie's tools under a key that reaches that tab alone, so a page or an email cannot
steer it into your other tabs. Your own connectors (Google, for example) let it
work in the documents themselves.

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
