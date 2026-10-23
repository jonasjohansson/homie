import { app, session, desktopCapturer } from 'electron';
import { loadState, saveState } from './state.js';
import { Bookmarks } from './bookmarks.js';
import { TabManager } from './tabs.js';
import { buildMenu } from './menu.js';
import { setupExtensions } from './extensions.js';
import { Downloads } from './downloads.js';

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
  // Look like Chrome to Google's sign-in ("this browser or app may not be secure"): the
  // reduced UA Chrome itself sends, and client-hint brands that include Google Chrome.
  const major = process.versions.chrome.split('.')[0];
  const ua = `Mozilla/5.0 (${process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  ses.setUserAgent(ua);
  app.userAgentFallback = ua;
  // Chrome's own order: Not-A-Brand token as Chromium wrote it, then Chromium, then Google Chrome.
  // The same list is given to the page's navigator.userAgentData (tabs.js CHROME_SHIM), so headers and JS agree.
  const addChrome = (v, full) => v.includes('Google Chrome') ? v : v.replace(/("Chromium";v="[^"]+")/, `$1, "Google Chrome";v="${full ? process.versions.chrome : major}"`);
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders;
    for (const k of Object.keys(h)) {
      const lk = k.toLowerCase();
      if (lk === 'sec-ch-ua') h[k] = addChrome(h[k], false);
      else if (lk === 'sec-ch-ua-full-version-list') h[k] = addChrome(h[k], true);
    }
    cb({ requestHeaders: h });
  });
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));
  ses.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  }, { useSystemPicker: true });
  ses.setSpellCheckerLanguages(['en-US', 'sv']);

  // start at login from the app itself; install.sh's System Events call hangs over ssh
  if (app.isPackaged && !app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: true });

  const extensions = await setupExtensions(ses, () => mgr);
  const bookmarks = new Bookmarks(() => mgr?.syncBookmarks());
  mgr = new TabManager({ bookmarks, extensions });
  mgr.downloads = new Downloads(mgr);
  mgr.downloads.attach(ses);
  mgr.downloads.wireIpc();
  mgr.wireIpc();
  mgr.createWindow();
  buildMenu(mgr, bookmarks);
  mgr.restoreToday();
  mgr.syncBookmarks(true);
  mgr.restoreSplit();
  for (const u of pending.splice(0)) mgr.open(u);
  const argUrl = process.argv.slice(1).find((a) => /^https?:\/\//.test(a));
  if (argUrl) mgr.open(argUrl);
});
