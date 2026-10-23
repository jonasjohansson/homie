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
};

export const state = { ...defaults };
let timer = null;

export function loadState() {
  try { Object.assign(state, defaults, JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch {}
  return state;
}

export function saveState(now = false) {
  clearTimeout(timer);
  const write = () => { try { fs.writeFileSync(file(), JSON.stringify(state, null, 2)); } catch {} };
  if (now) write(); else timer = setTimeout(write, 500);
}
