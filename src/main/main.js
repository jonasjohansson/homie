import { app, session, desktopCapturer } from 'electron';
import { loadState, saveState } from './state.js';
import { Bookmarks } from './bookmarks.js';
import { TabManager } from './tabs.js';
import { buildMenu } from './menu.js';
import { setupExtensions } from './extensions.js';
import { setupDownloads } from './downloads.js';

if (!app.requestSingleInstanceLock()) app.quit();

let mgr = null;
const pending = [];
const openUrl = (url) => { if (mgr?.win) { mgr.focus(); mgr.open(url); } else pending.push(url); };

app.on('open-url', (e, url) => { e.preventDefault(); openUrl(url); });
app.on('second-instance', (_e, argv) => { const u = argv.find((a) => /^https?:\/\//.test(a)); if (u) openUrl(u); else mgr?.focus(); });
app.on('before-quit', () => { app.quitting = true; saveState(true); });
app.on('activate', () => mgr?.focus());
app.on('window-all-closed', () => {});

const ALLOWED = new Set(['notifications', 'media', 'mediaKeySystem', 'fullscreen', 'pointerLock', 'clipboard-read', 'clipboard-sanitized-write',
  'display-capture', 'window-management', 'keyboardLock', 'idle-detection', 'speaker-selection', 'midi', 'midiSysex', 'background-sync', 'storage-access', 'top-level-storage-access']);

app.whenReady().then(async () => {
  loadState();
  const ses = session.fromPartition('persist:homie');
  // Chrome's user agent: Google treats the Electron and app tokens as an unknown browser.
  ses.setUserAgent(ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ Homie\/\S+/, ''));
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));
  ses.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  }, { useSystemPicker: true });
  ses.setSpellCheckerLanguages(['en-US', 'sv']);

  const extensions = await setupExtensions(ses, () => mgr);
  const bookmarks = new Bookmarks(() => mgr?.syncBookmarks());
  mgr = new TabManager({ bookmarks, extensions });
  setupDownloads(ses, mgr);
  mgr.wireIpc();
  mgr.createWindow();
  buildMenu(mgr, bookmarks);
  mgr.restoreToday();
  mgr.syncBookmarks(true);
  for (const u of pending.splice(0)) mgr.open(u);
  const argUrl = process.argv.slice(1).find((a) => /^https?:\/\//.test(a));
  if (argUrl) mgr.open(argUrl);
});
