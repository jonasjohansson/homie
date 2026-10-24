// Terminal tabs. A tab whose url is terminal:<folder> runs the login shell there through
// node-pty, drawn by xterm.js in src/renderer/terminal.html. The shell belongs to the tab, not
// to the page: a reload attaches again and replays what was printed, and only unloading or
// closing the tab ends it. A pinned row's `run` (bookmarks.yml) is typed at the prompt for you;
// a Today terminal never runs anything, so no link or agent can start a command.
import { ipcMain } from 'electron';
import pty from 'node-pty';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TERMINAL_HTML = path.join(__dirname, '..', 'renderer', 'terminal.html');
export const TERMINAL_PRELOAD = path.join(__dirname, '..', 'preload', 'terminal.cjs');
const REPLAY_MAX = 2 * 1024 * 1024;   // characters kept for a reload
const BATCH_MS = 4;                   // output is sent to the page in batches, not per read
// what the program that launched Homie left in its environment (a terminal app, an agent session)
// belongs to that program; the login shell sets up the user's own variables again
const INHERITED = /^(CLAUDE|GHOSTTY_|ITERM_|KITTY_|WEZTERM_|VSCODE_|ELECTRON_|TERM_SESSION_ID$|TERM_PROGRAM_VERSION$|__CFBundleIdentifier$)/;
export const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !INHERITED.test(k)));

export const isTerminalUrl = (u) => /^terminal:/i.test(String(u || ''));

// terminal:~/GitHub/x → ~/GitHub/x as an absolute path; missing, or not a folder → home
export function terminalDir(url) {
  let p = String(url || '').replace(/^terminal:(\/\/)?/i, '').trim();
  try { p = decodeURIComponent(p); } catch {}
  if (!p || p === '~') return os.homedir();
  if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
  try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  return os.homedir();
}

export class Terminals {
  constructor(mgr) {
    this.mgr = mgr;
    this.sessions = new Map();   // tab id → { p, out, size, pending, timer, exited, cols, rows }
  }

  tabFor(sender) { return [...this.mgr.tabs.values()].find((t) => t.terminal && t.wc === sender); }

  start(tab, cols = 80, rows = 24) {
    this.kill(tab);
    const shell = process.env.SHELL || os.userInfo().shell || '/bin/zsh';
    const run = tab.kind === 'companion' ? this.mgr.companionCommand(tab) : tab.kind === 'pinned' ? String(tab.run || '').trim() : '';   // a companion's command is Homie's own
    const env = Object.assign(cleanEnv(), { TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Homie', LANG: process.env.LANG || 'en_US.UTF-8' }, tab.env || {});
    // -l -i: the PATH, aliases and functions of the user's own terminal
    const p = pty.spawn(shell, ['-l', '-i'], { name: 'xterm-256color', cols, rows, cwd: terminalDir(tab.url), env });
    const s = { p, out: [], size: 0, pending: '', timer: null, exited: false, cols, rows };
    p.onData((d) => this.output(tab, s, d));
    p.onExit(({ exitCode }) => {
      s.exited = true; this.flush(tab, s);
      if (this.sessions.get(tab.id) === s && tab.wc && !tab.wc.isDestroyed()) tab.wc.send('term:exit', exitCode);
    });
    this.sessions.set(tab.id, s);
    if (run) p.write(run + '\r');   // typed ahead; the shell reads it once its prompt is up
    return s;
  }

  output(tab, s, d) {
    s.out.push(d); s.size += d.length;
    while (s.size > REPLAY_MAX && s.out.length > 1) s.size -= s.out.shift().length;
    s.pending += d;
    if (!s.timer) s.timer = setTimeout(() => this.flush(tab, s), BATCH_MS);
  }

  flush(tab, s) {
    clearTimeout(s.timer); s.timer = null;
    const chunk = s.pending; s.pending = '';
    if (chunk && this.sessions.get(tab.id) === s && tab.wc && !tab.wc.isDestroyed()) tab.wc.send('term:data', chunk);
  }

  restart(tab) {
    const s = this.sessions.get(tab.id);
    if (tab.wc && !tab.wc.isDestroyed()) tab.wc.send('term:reset');
    try { this.start(tab, s?.cols, s?.rows); } catch {}
  }

  kill(tab) {
    const s = this.sessions.get(tab.id); if (!s) return;
    this.sessions.delete(tab.id); clearTimeout(s.timer);
    if (!s.exited) { try { s.p.kill(); } catch {} }
  }

  killAll() { for (const t of this.mgr.tabs.values()) if (this.sessions.has(t.id)) this.kill(t); }

  wireIpc() {
    const session = (e) => { const t = this.tabFor(e.sender); return t ? [t, this.sessions.get(t.id)] : [null, null]; };
    // the page asks for its shell when it loads: a running one is replayed, otherwise one starts
    ipcMain.handle('term:attach', (e, cols, rows) => {
      const t = this.tabFor(e.sender); if (!t) return null;
      const s = this.sessions.get(t.id);
      if (!s) { try { this.start(t, cols | 0 || 80, rows | 0 || 24); } catch (err) { return { error: err.message }; } return { replay: '' }; }
      clearTimeout(s.timer); s.timer = null; s.pending = '';   // the replay already holds it
      if (!s.exited) this.resize(s, cols, rows);
      return { replay: s.out.join(''), exited: s.exited };
    });
    ipcMain.on('term:input', (e, d) => { const [, s] = session(e); if (s && !s.exited) s.p.write(String(d)); });
    ipcMain.on('term:resize', (e, cols, rows) => { const [, s] = session(e); if (s && !s.exited) this.resize(s, cols, rows); });
    ipcMain.on('term:restart', (e, cols, rows) => { const [t] = session(e); if (t) { try { this.start(t, cols | 0 || 80, rows | 0 || 24); } catch (err) { e.sender.send('term:data', `\r\n${err.message}\r\n`); } } });
    ipcMain.on('term:link', (e, url) => { const [t] = session(e); if (t && /^https?:\/\//i.test(String(url))) this.mgr.open(String(url), { after: t.kind === 'today' ? t : null }); });
    ipcMain.on('term:bell', (e, text) => { const [t] = session(e); if (t) this.mgr.attention(t, String(text || '').slice(0, 300)); });
  }

  resize(s, cols, rows) {
    cols = Math.max(2, cols | 0); rows = Math.max(1, rows | 0);
    if (cols === s.cols && rows === s.rows) return;
    s.cols = cols; s.rows = rows;
    try { s.p.resize(cols, rows); } catch {}
  }
}
