// Chrome extensions through electron-chrome-extensions (GPL-3.0 for a non-commercial
// app like this one) and the Chrome Web Store through electron-chrome-web-store.
// Everything here is best effort: if it throws, the browser still runs without extensions.
import { app, session } from 'electron';
import path from 'node:path';

export async function setupExtensions(ses, getMgr) {
  let extensions = null;
  try {
    const { ElectronChromeExtensions } = await import('electron-chrome-extensions');
    extensions = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      async createTab(details) {
        const mgr = getMgr();
        const t = mgr.open(details.url || 'about:blank', { background: details.active === false });
        return [t.wc, mgr.win];
      },
      // addTab() marks a tab active synchronously; only honour selectTab from a real chrome.tabs call
      selectTab(wc) { const mgr = getMgr(); if (mgr.addingTab || mgr.active?.wc === wc) return; const t = [...mgr.tabs.values()].find((x) => x.wc === wc); if (t) mgr.activate(t.id); },
      removeTab(wc) { const mgr = getMgr(); const t = [...mgr.tabs.values()].find((x) => x.wc === wc); if (t) mgr.close(t.id); },
      async createWindow(details) { const mgr = getMgr(); mgr.open(Array.isArray(details.url) ? details.url[0] : details.url || 'about:blank'); return mgr.win; },
    });
    // icons for <browser-action-list> live in the UI session; popups need both
    ElectronChromeExtensions.handleCRXProtocol(session.fromPartition('homie-ui'));
    ElectronChromeExtensions.handleCRXProtocol(ses);
  } catch (e) { console.error('extensions:', e.message); }
  try {
    const { installChromeWebStore } = await import('electron-chrome-web-store');
    await installChromeWebStore({ session: ses, extensionsPath: path.join(app.getPath('userData'), 'Extensions'), loadExtensions: true, allowUnpackedExtensions: true });
  } catch (e) { console.error('web store:', e.message); }
  return extensions;
}
