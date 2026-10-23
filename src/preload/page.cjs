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
