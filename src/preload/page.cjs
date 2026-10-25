// Isolated world, contextIsolation on, sandbox off so webFrame is available. Hears the
// notification shim's postMessage and forwards it, and installs the Chrome shim first.
const { ipcRenderer, webFrame } = require('electron');

// What Chrome exposes and Electron does not: "Google Chrome" among the userAgentData brands and a
// populated window.chrome. Google's sign-in reads both ("this browser or app may not be secure").
// Run in the main world from the preload, which is before any page script. Not delivered through
// the debugger: an attached debugger (like a remote debugging port) is itself a reason Google blocks.
const CHROME_SHIM = `(function () {
  const full = '${process.versions.chrome}', major = full.split('.')[0];
  try {
    const real = navigator.userAgentData;
    const notBrand = real?.brands?.find((b) => /not/i.test(b.brand)) || { brand: 'Not=A?Brand', version: '24' };
    const brands = [notBrand, { brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }];
    const fullList = [{ brand: notBrand.brand, version: notBrand.version + '.0.0.0' }, { brand: 'Chromium', version: full }, { brand: 'Google Chrome', version: full }];
    const data = {
      brands, mobile: false, platform: real?.platform || 'macOS',
      toJSON() { return { brands, mobile: false, platform: this.platform }; },
      getHighEntropyValues: async (hints) => {
        const base = real ? await real.getHighEntropyValues(hints) : {};
        const out = { ...base, brands, mobile: false, platform: data.platform };
        if (hints.includes('fullVersionList')) out.fullVersionList = fullList;
        if (hints.includes('uaFullVersion')) out.uaFullVersion = full;
        return out;
      },
    };
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => data, configurable: true });
  } catch {}
  try {
    if (!window.chrome || !window.chrome.runtime) {
      const chrome = window.chrome || {};
      chrome.app = chrome.app || { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }, getDetails() { return null; }, getIsInstalled() { return false; }, runningState() { return 'cannot_run'; } };
      chrome.runtime = chrome.runtime || { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' }, connect() { throw new TypeError('Error in invocation of runtime.connect'); }, sendMessage() { throw new TypeError('Error in invocation of runtime.sendMessage'); }, id: undefined };
      chrome.csi = chrome.csi || function () { const t = performance.timing; return { onloadT: t.domContentLoadedEventEnd, startE: t.navigationStart, pageT: performance.now(), tran: 15 }; };
      chrome.loadTimes = chrome.loadTimes || function () { const t = performance.timing; return { requestTime: t.navigationStart / 1000, startLoadTime: t.navigationStart / 1000, commitLoadTime: t.responseStart / 1000, finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000, finishLoadTime: t.loadEventEnd / 1000, firstPaintTime: 0, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2' }; };
      Object.defineProperty(window, 'chrome', { value: chrome, configurable: true, enumerable: true, writable: true });
    }
  } catch {}
})();`;
try { webFrame.executeJavaScript(CHROME_SHIM).catch(() => {}); } catch {}
window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source === window && d && d.__homie === 'notification') {
    ipcRenderer.send('homie:notification', { title: String(d.title || ''), body: String(d.body || ''), tag: String(d.tag || '') });
  }
});

// A sidebar row dragged over this page: main arms us, we draw Arc's left/right drop halves
// and report the drop. The chrome view never sees pointer events over a page view.
let drop = null;
ipcRenderer.on('homie:drag', (_e, phase) => {
  if (phase === 'start' && !drop) {
    const box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;background:rgba(127,127,127,.18);border-radius:10px;');
    const paint = (side) => { box.style.inset = ''; box.style.top = '0'; box.style.bottom = '0'; box.style.left = side === 'left' ? '0' : '50%'; box.style.right = side === 'left' ? '50%' : '0'; box.style.display = 'block'; };
    const side = (ev) => (ev.clientX < window.innerWidth / 2 ? 'left' : 'right');
    const move = (ev) => paint(side(ev));
    const leave = () => { box.style.display = 'none'; };
    const up = (ev) => { if (box.style.display !== 'none') ipcRenderer.send('homie:drop', side(ev)); };
    (document.documentElement || document).append(box);
    window.addEventListener('mousemove', move, true); window.addEventListener('mouseup', up, true); document.addEventListener('mouseleave', leave, true);
    drop = { box, move, up, leave };
  } else if (phase === 'end' && drop) {
    window.removeEventListener('mousemove', drop.move, true); window.removeEventListener('mouseup', drop.up, true); document.removeEventListener('mouseleave', drop.leave, true);
    drop.box.remove(); drop = null;
  }
});

// The toolbar strip is painted in the page's own colour, as Arc does. theme-color lies on some
// pages (Gmail's dark theme keeps a light one), so sample what is actually rendered along the top
// edge of the viewport and report it whenever it changes.
const opaque = (v) => v && v !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(v);
function topColor() {
  const w = window.innerWidth, pts = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(w * f));
  const tally = new Map();
  for (const x of pts) {
    let el = document.elementFromPoint(x, 2), col = '';
    while (el && el !== document.documentElement && !col) { const c = getComputedStyle(el).backgroundColor; if (opaque(c)) col = c; el = el.parentElement; }
    if (!col) col = [document.body, document.documentElement].map((n) => n && getComputedStyle(n).backgroundColor).find(opaque) || '';
    if (col) tally.set(col, (tally.get(col) || 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
let lastBg = null, bgTimer = null;
function reportBg() { try { const c = topColor(); if (c !== lastBg) { lastBg = c; ipcRenderer.send('homie:bg', c); } } catch {} }
function scheduleBg(ms = 120) { clearTimeout(bgTimer); bgTimer = setTimeout(reportBg, ms); }
function watchBg() {
  reportBg();
  for (const ms of [400, 1200, 3000, 6000]) setTimeout(reportBg, ms);   // themes applied by late scripts
  const mo = new MutationObserver(() => scheduleBg());
  for (const n of [document.documentElement, document.body]) if (n) mo.observe(n, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'theme'], childList: true });
  if (document.head) mo.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'media'] });
  window.addEventListener('resize', () => scheduleBg(200));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => scheduleBg(300));
  document.addEventListener('visibilitychange', () => scheduleBg(50));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchBg); else watchBg();
window.addEventListener('load', () => scheduleBg(60));

// Saved logins (main's passwords.js): main answers only for this page's own https origin. Fill a
// login form as it appears, list the usernames under the field when a site has several, and when
// a login is submitted, let main offer to save it (on this page, or the one the submit leads to).
const PW_SUBMIT = /log\s*in|sign\s*in|next|continue|submit|logga\s*in|nästa|fortsätt/i;
const shown = (el) => !el.disabled && !el.readOnly && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const textInputs = (scope) => [...scope.querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])')].filter(shown);
const isIdentifier = (el) => /username|email/.test(el.autocomplete) || el.type === 'email' || /^(user(name)?|login|e-?mail|identifier|account)$/i.test(el.name || el.id || '');
const passwordInputs = () => [...document.querySelectorAll('input[type=password]')].filter(shown);
function userFieldFor(pw) {
  const before = textInputs(pw.form || document).filter((el) => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
  return before.findLast((el) => /username|email/.test(el.autocomplete)) || before.findLast(isIdentifier) || before.at(-1) || null;
}
const identifierField = () => textInputs(document).find(isIdentifier) || null;
function setValue(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
// a closed shadow root keeps the page's scripts out; styled through CSSOM, which a page's CSP allows
function floating(css) {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', zIndex: '2147483647' }, css);
  const box = document.createElement('div');
  Object.assign(box.style, { font: '13px -apple-system, system-ui, sans-serif', color: dark() ? '#eee' : '#222', background: dark() ? '#2b2b2b' : '#fff',
    border: `1px solid ${dark() ? '#444' : '#d8d8d8'}`, borderRadius: '10px', boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px' });
  host.attachShadow({ mode: 'closed' }).append(box);
  (document.documentElement || document).append(host);
  return { host, box };
}
function button(label, onPick, strong) {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, { font: 'inherit', color: 'inherit', textAlign: 'left', border: '0', borderRadius: '6px', padding: '6px 10px', cursor: 'default',
    background: strong ? (dark() ? '#3d6fe0' : '#2f6bf0') : 'transparent', ...(strong ? { color: '#fff' } : {}) });
  if (!strong) { b.addEventListener('mouseenter', () => { b.style.background = dark() ? '#3a3a3a' : '#f0f0f0'; }); b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; }); }
  b.addEventListener('mousedown', (ev) => { ev.preventDefault(); onPick(); });   // before the field blurs
  return b;
}

let pwLogins = null, picker = null;
const logins = () => (pwLogins ||= ipcRenderer.invoke('homie:pw-logins').catch(() => ({ users: [], related: [], last: null })));
// a choice is this site's login ({ username }) or one saved for another part of it ({ username, site })
async function fill(choice, uEl, pEl) {
  if (uEl && !uEl.value && choice.username) setValue(uEl, choice.username);
  if (pEl && !pEl.value) { const pw = await ipcRenderer.invoke('homie:pw-fill', choice.username, choice.site).catch(() => null); if (pw != null) setValue(pEl, pw); }
}
const hidePicker = () => { picker?.remove(); picker = null; };
// first, when given: a check that fills instead (true), so the list is not needed
function attachPicker(field, choices, pick, first) {
  const show = () => {
    hidePicker();
    if (first?.()) return;
    const r = field.getBoundingClientRect();
    const { host, box } = floating({ left: `${Math.round(r.left)}px`, top: `${Math.round(r.bottom + 4)}px`, minWidth: `${Math.round(Math.max(r.width, 200))}px` });
    for (const c of choices.slice(0, 10)) box.append(button((c.username || '(no username)') + (c.site ? ` · ${c.site}` : ''), () => { hidePicker(); pick(c); }));
    picker = host;
  };
  field.addEventListener('focus', show);
  field.addEventListener('blur', () => setTimeout(hidePicker, 150));
  field.addEventListener('input', hidePicker);
  if (document.activeElement === field) show();
}

const seen = new WeakSet();
async function scanLogins() {
  const { users, related, last } = await logins();
  if (!users.length && !related.length) { pwObserver.disconnect(); return; }
  // only this site's own logins fill by themselves; ones from elsewhere on the site wait to be picked, as in Chrome
  const choices = [...users.map((username) => ({ username })), ...related];
  const pws = passwordInputs().filter((p) => p.autocomplete !== 'new-password');
  if (pws.length === 1 && !seen.has(pws[0])) {   // two or more is a sign-up or change-password form
    const pw = pws[0], u = userFieldFor(pw);
    seen.add(pw);
    const typed = u?.value;
    if (typed && users.includes(typed)) return fill({ username: typed }, null, pw);
    if (!typed && users.length === 1) return fill({ username: users[0] }, u, pw);
    if (!u && last && users.includes(last)) return fill({ username: last }, null, pw);   // the password page after a username page
    // otherwise decide when a field is focused: sites often set the username after load (Discord),
    // without a DOM change, and re-render the form, so the username field is found again then
    const pick = (c) => fill(c, userFieldFor(pw), pw);
    if (u) attachPicker(u, choices, pick);
    return attachPicker(pw, choices, pick, () => { const now = userFieldFor(pw)?.value; return !!(now && users.includes(now) && !pw.value && (fill({ username: now }, null, pw), true)); });
  }
  const id = !pws.length && identifierField();
  if (id && !seen.has(id)) {
    seen.add(id);
    if (users.length === 1) { if (!id.value) setValue(id, users[0]); } else attachPicker(id, choices, (c) => setValue(id, c.username));
  }
}
let scanTimer = null;
const pwObserver = new MutationObserver(() => { clearTimeout(scanTimer); scanTimer = setTimeout(scanLogins, 400); });

let lastSubmit = '';
function captureLogin() {
  const filled = [...document.querySelectorAll('input[type=password]')].filter((p) => p.value);
  if (!filled.length) { const id = identifierField(); if (id?.value) ipcRenderer.send('homie:pw-user', id.value); return; }
  // on a change-password form, the new one: marked new-password, or the value typed twice
  const vals = filled.map((p) => p.value);
  const password = filled.find((p) => p.autocomplete === 'new-password')?.value || vals.find((v, i) => vals.indexOf(v) !== i) || vals[0];
  const username = userFieldFor(filled[0])?.value || '';
  if (username + '\n' + password === lastSubmit) return;
  lastSubmit = username + '\n' + password;
  ipcRenderer.send('homie:pw-submit', { username, password });
}
document.addEventListener('submit', captureLogin, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target?.tagName === 'INPUT') captureLogin(); }, true);
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('button, input[type=submit], [role=button]');
  if (b && (b.type === 'submit' || PW_SUBMIT.test(b.textContent || b.value || b.getAttribute('aria-label') || ''))) captureLogin();
}, true);

ipcRenderer.on('homie:pw-offer', (_e, o) => {
  const { host, box } = floating({ top: '12px', right: '12px', maxWidth: '340px' });
  const text = document.createElement('div');
  Object.assign(text.style, { padding: '8px 10px 6px' });
  text.textContent = `${o.update ? 'Update the password' : 'Save the password'} for ${o.username || o.site} in Homie?`;
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '4px', justifyContent: 'flex-end', padding: '0 4px 4px' });
  let timer = null;
  const answer = (a) => { clearTimeout(timer); host.remove(); ipcRenderer.send('homie:pw-answer', a); };
  row.append(button('Never for this site', () => answer('never')), button('Not now', () => answer('dismiss')), button(o.update ? 'Update' : 'Save', () => answer('save'), true));
  box.append(text, row);
  timer = setTimeout(() => answer('dismiss'), 30000);
});

function startLogins() {
  ipcRenderer.send('homie:pw-ready');
  scanLogins();
  pwObserver.observe(document.documentElement, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startLogins); else startLogins();
