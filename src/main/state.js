// Per-machine state: window frame, sidebar width, the Today list, the active tab.
// A plain JSON file in userData; written debounced, never worth a dependency.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.join(app.getPath('userData'), 'state.json');

const defaults = {
  bounds: { width: 1280, height: 860 },
  sidebarWidth: 202,
  today: [],          // [{ url, title }]
  activeUrl: null,
  split: null,        // { urls, factors, focus }
  collapsed: {},      // folded folders by name
  favicons: {},       // pinned url -> favicon url, so unloaded pins show their icon at launch
  openAtLogin: null,  // null until the first launch has set it; then the Homie menu or System Settings decide
};

export const state = { ...defaults };
let timer = null;

export function loadState() {
  try { Object.assign(state, defaults, JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') console.error('state.json unreadable, starting fresh:', e.message); }
  return state;
}

// Open at Login on this Mac. Only a packaged app registers, or the login item would be Electron.
export function setOpenAtLogin(on) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on });
  state.openAtLogin = on;
  saveState(true);
}

export function saveState(now = false) {
  clearTimeout(timer);
  // written to a temp file and renamed, so a kill mid-write cannot leave a truncated file
  const write = () => { try { const f = file(); fs.writeFileSync(f + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('state.json:', e.message); } };
  if (now) write(); else timer = setTimeout(write, 500);
}
