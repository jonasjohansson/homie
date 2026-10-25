import { app, session, desktopCapturer } from 'electron';
import { state, loadState, saveState, setOpenAtLogin } from './state.js';
import { Bookmarks } from './bookmarks.js';
import { TabManager } from './tabs.js';
import { buildMenu } from './menu.js';
import { setupExtensions } from './extensions.js';
import { Downloads } from './downloads.js';
import { Terminals } from './terminal.js';
import { Agents } from './agents.js';
import { Asker } from './ask.js';
import { Passwords } from './passwords.js';

// a second profile for development, beside the installed Homie: HOMIE_USER_DATA=/some/dir npm start
if (process.env.HOMIE_USER_DATA) app.setPath('userData', process.env.HOMIE_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

let mgr = null, agents = null;
// `open -a Homie --args --login-item=off` (or =on) sets Open at Login on this Mac, with no window
const loginFlag = (argv) => argv.find((a) => /^--login-item=(on|off)$/.test(a));
const pending = [];
const openUrl = (url) => { if (mgr?.win) { mgr.focus(); mgr.open(url); } else pending.push(url); };

app.on('open-url', (e, url) => { e.preventDefault(); openUrl(url); });
app.on('second-instance', (_e, argv) => {
  const f = loginFlag(argv); if (f) return setOpenAtLogin(f.endsWith('=on'));
  const u = argv.find((a) => /^https?:\/\//.test(a)); if (u) openUrl(u); else mgr?.focus();
});
app.on('before-quit', () => { app.quitting = true; saveState(true); mgr?.terminals?.killAll(); });
app.on('activate', () => mgr?.focus());
app.on('window-all-closed', () => {});

const ALLOWED = new Set(['notifications', 'media', 'mediaKeySystem', 'fullscreen', 'pointerLock', 'clipboard-read', 'clipboard-sanitized-write',
  'display-capture', 'window-management', 'keyboardLock', 'idle-detection', 'speaker-selection', 'midi', 'midiSysex', 'background-sync', 'storage-access', 'top-level-storage-access']);

app.whenReady().then(async () => {
  loadState();
  const f = loginFlag(process.argv);
  if (f) { setOpenAtLogin(f.endsWith('=on')); app.quit(); return; }
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

  // start at login from the app itself (install.sh's System Events call hangs over ssh), on the
  // first launch only: after that it is the Homie menu's Open at Login, or System Settings
  if (app.isPackaged && state.openAtLogin == null) setOpenAtLogin(true);

  const extensions = await setupExtensions(ses, () => mgr);
  const bookmarks = new Bookmarks(() => { mgr?.syncBookmarks(); agents?.sync(); });
  mgr = new TabManager({ bookmarks, extensions });
  mgr.asker = new Asker(mgr, bookmarks);
  mgr.terminals = new Terminals(mgr);
  mgr.terminals.wireIpc();
  mgr.downloads = new Downloads(mgr);
  mgr.downloads.attach(ses);
  mgr.downloads.wireIpc();
  mgr.passwords = new Passwords(ses);
  mgr.passwords.wireIpc();
  mgr.wireIpc();
  mgr.createWindow();
  buildMenu(mgr, bookmarks);
  mgr.restoreToday();
  mgr.syncBookmarks(true);
  mgr.restoreSplit();
  // Chrome's logins again, silently, once an import from the menu has shared its key
  mgr.passwords.importFromChrome().catch((e) => console.error('passwords:', e.message));
  agents = new Agents(mgr, bookmarks);
  mgr.agents = agents;
  agents.sync();
  for (const u of pending.splice(0)) mgr.open(u);
  const argUrl = process.argv.slice(1).find((a) => /^https?:\/\//.test(a));
  if (argUrl) mgr.open(argUrl);
});
