// One terminal per tab: xterm.js drawing the shell that src/main/terminal.js keeps for the tab.
// Homie's dark card colour with One Dark's hues for the colours programs use, JetBrains Mono when
// it is installed, a bar cursor that disappears when the terminal is not focused. #overlay is a
// tab's own Claude, floating over its page: smaller type.
const OVERLAY = location.hash === '#overlay';
if (OVERLAY) document.body.classList.add('overlay');
const FONT = '"JetBrains Mono", "SF Mono", Menlo, monospace', SIZE = OVERLAY ? 12.5 : 14;
const theme = {
  background: '#202124', foreground: '#e6e6e6', cursor: '#f1f1f1', cursorAccent: '#202124',
  selectionBackground: 'rgba(255, 255, 255, 0.16)', selectionForeground: '#ffffff',
  black: '#202124', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#c8c8cc',
  brightBlack: '#7d7b85', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
};
const term = new Terminal({
  fontFamily: FONT, fontSize: SIZE, theme, cursorStyle: 'bar', cursorInactiveStyle: 'none', cursorBlink: false, scrollback: 10000,
  allowProposedApi: true, macOptionIsMeta: false, macOptionClickForcesSelection: true,   // Option stays a character key: @ [ ] { } on Nordic layouts
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => { if (e.metaKey) shell.link(uri); }));   // Cmd+click, as in Terminal and Ghostty
const unicode = new Unicode11Addon.Unicode11Addon();
term.loadAddon(unicode);
term.unicode.activeVersion = '11';

// Keys the Mac text fields have: Cmd and Option with arrows and Delete, Shift+Return for a new line
// in Claude Code's prompt, Cmd+K to clear. Other Cmd keys and Homie's Ctrl keys go to the menu.
const SEND = {
  'Meta+ArrowLeft': '\x01', 'Meta+ArrowRight': '\x05', 'Meta+Backspace': '\x15',
  'Alt+ArrowLeft': '\x1bb', 'Alt+ArrowRight': '\x1bf', 'Alt+Backspace': '\x1b\x7f',
  'Shift+Enter': '\x1b\r',
};
term.attachCustomKeyEventHandler((e) => {
  if (e.type !== 'keydown') return true;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean).join('+');
  const seq = SEND[(mods ? mods + '+' : '') + e.key];
  if (seq) { e.preventDefault(); shell.input(seq); return false; }
  if (e.metaKey) {
    if (e.key === 'k' && !e.shiftKey && !e.altKey) { e.preventDefault(); term.clear(); return false; }
    if (e.key === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); term.selectAll(); return false; }
    return false;
  }
  if (e.ctrlKey && (e.key === 'Tab' || (e.shiftKey && /^(Digit[1-4]|Equal|Minus|BracketLeft|BracketRight)$/.test(e.code)))) return false;   // next tab, split view
  return true;
});

let attached = false, ended = false;
const endLine = (code) => `\r\n\x1b[2m[Shell ended${code ? ` with code ${code}` : ''}. Press Return to start it again.]\x1b[0m\r\n`;
shell.onData((d) => { if (attached) term.write(d); });   // before the replay, the replay has it
shell.onExit((code) => { ended = true; term.write(endLine(code)); });
shell.onClear(() => term.clear());
shell.onReset(() => { ended = false; term.reset(); });
term.onData((d) => {
  if (!ended) return shell.input(d);
  if (d === '\r') { ended = false; term.reset(); shell.restart(term.cols, term.rows); }
});
term.onBinary((d) => { if (!ended) shell.input(d); });
term.onResize(({ cols, rows }) => shell.resize(cols, rows));
term.onTitleChange((t) => { document.title = t || 'Terminal'; });
term.onBell(() => shell.bell(''));
// desktop notifications the way iTerm2 (OSC 9) and rxvt (OSC 777) take them; 9;4 is a progress bar
term.parser.registerOscHandler(9, (data) => { if (!/^\d+;/.test(data)) shell.bell(data); return true; });
term.parser.registerOscHandler(777, (data) => { const m = /^notify;([^;]*);?(.*)$/s.exec(data); if (m) shell.bell(m[2] || m[1]); return true; });

// a file dropped from Finder becomes its path, quoted for the shell
const quote = (p) => (/^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const paths = [...(e.dataTransfer?.files || [])].map((f) => shell.pathFor(f)).filter(Boolean);
  if (paths.length) shell.input(paths.map(quote).join(' ') + ' ');
  term.focus();
});
addEventListener('focus', () => term.focus());

(async () => {
  try { await document.fonts.load(`${SIZE}px "JetBrains Mono"`); } catch {}
  const el = document.getElementById('term');
  term.open(el);
  try { const gl = new WebglAddon.WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch {}
  // a tab loaded out of sight has no size yet: start at a usual one, fit once it is shown
  const shown = () => el.clientWidth > 40 && el.clientHeight > 40;
  if (shown()) fit.fit(); else term.resize(120, 36);
  new ResizeObserver(() => { if (shown()) { try { fit.fit(); } catch {} } }).observe(el);
  const r = await shell.attach(term.cols, term.rows);
  if (r?.error) term.write(`Could not start the shell: ${r.error}\r\n`);
  if (r?.replay) term.write(r.replay);
  attached = true;
  if (r?.exited) { ended = true; term.write(endLine(0)); }
  term.focus();
})();
