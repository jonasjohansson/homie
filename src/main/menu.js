import { app, Menu, shell, clipboard, dialog } from 'electron';
import { openInChrome } from './tabs.js';

export function buildMenu(mgr, bookmarks) {
  const wc = () => mgr.active?.wc;
  const t = () => mgr.active;
  const ui = (ch, ...a) => mgr.sendUI(ch, ...a);
  const template = [
    { label: 'Homie', submenu: [
      { role: 'about' },
      { type: 'separator' },
      { label: 'Make Homie the Default Browser', click: () => { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); } },
      { label: 'Chrome Web Store', click: () => mgr.open('https://chromewebstore.google.com/') },
      { label: 'Open bookmarks.yml', accelerator: 'Cmd+,', click: () => shell.openPath(bookmarks.realPath) },
      { type: 'separator' },
      { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'Cmd+T', click: () => mgr.showPalette('new') },
      { label: 'Open Address', accelerator: 'Cmd+L', click: () => mgr.showPalette('url') },
      { label: 'Reopen Closed Tab', accelerator: 'Cmd+Shift+T', click: () => mgr.reopenClosed() },
      { label: 'Pin This Page', accelerator: 'Cmd+D', click: () => { const a = t(); if (!a) return; if (a.kind === 'today') mgr.showPalette('pin', a.id); else bookmarks.replaceUrl(a.pinnedUrl, a.url); } },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'Cmd+W', click: () => { if (t()) mgr.close(t().id); } },
      { label: 'Clear Today', accelerator: 'Cmd+Shift+W', click: () => mgr.clearToday() },
      { type: 'separator' },
      { label: 'Copy Address', accelerator: 'Cmd+Shift+C', click: () => { if (t()) clipboard.writeText(t().url); } },
      { label: 'Open in Chrome', accelerator: 'Cmd+Shift+O', click: () => { if (t()) openInChrome(t().url); } },
      { label: 'Print…', accelerator: 'Cmd+P', click: () => wc()?.print() },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find…', accelerator: 'Cmd+F', click: () => mgr.showPalette('find') },
      { label: 'Find Next', accelerator: 'Cmd+G', click: () => ui('find-step', 1) },
      { label: 'Find Previous', accelerator: 'Cmd+Shift+G', click: () => ui('find-step', -1) },
      { type: 'separator' },
      { role: 'startSpeaking' }, { role: 'stopSpeaking' },
    ] },
    { label: 'View', submenu: [
      { label: 'Reload', accelerator: 'Cmd+R', click: () => wc()?.reload() },
      { label: 'Reset to Pinned Page', accelerator: 'Cmd+Shift+R', click: () => { const a = t(); if (a?.kind === 'pinned') a.load(a.pinnedUrl); else wc()?.reloadIgnoringCache(); } },
      { label: 'Stop', accelerator: 'Cmd+.', click: () => wc()?.stop() },
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'Cmd+=', click: () => { const w = wc(); if (w) w.setZoomLevel(w.getZoomLevel() + 0.5); } },
      { label: 'Zoom In', accelerator: 'Cmd+Plus', visible: false, click: () => { const w = wc(); if (w) w.setZoomLevel(w.getZoomLevel() + 0.5); } },
      { label: 'Zoom Out', accelerator: 'Cmd+-', click: () => { const w = wc(); if (w) w.setZoomLevel(w.getZoomLevel() - 0.5); } },
      { label: 'Actual Size', accelerator: 'Cmd+0', click: () => wc()?.setZoomLevel(0) },
      { type: 'separator' },
      { label: 'Downloads', accelerator: 'Cmd+Shift+J', click: () => mgr.showDownloads() },
      { label: 'Hide Sidebar', accelerator: 'Cmd+Shift+S', click: () => mgr.toggleSidebar() },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'Cmd+Option+I', click: () => wc()?.toggleDevTools() },
      { label: 'Sidebar Developer Tools', accelerator: 'Cmd+Option+Shift+I', click: () => mgr.sidebar.webContents.toggleDevTools({ mode: 'detach' }) },
      { label: 'Command Bar Developer Tools', click: () => mgr.palette.webContents.toggleDevTools({ mode: 'detach' }) },
    ] },
    { label: 'History', submenu: [
      { label: 'Back', accelerator: 'Cmd+[', click: () => wc()?.navigationHistory.goBack() },
      { label: 'Forward', accelerator: 'Cmd+]', click: () => wc()?.navigationHistory.goForward() },
      { label: 'Back', accelerator: 'Cmd+Left', visible: false, click: () => wc()?.navigationHistory.goBack() },
      { label: 'Forward', accelerator: 'Cmd+Right', visible: false, click: () => wc()?.navigationHistory.goForward() },
    ] },
    { label: 'Tabs', submenu: [
      ...Array.from({ length: 9 }, (_, i) => ({ label: `Pinned Tab ${i + 1}`, accelerator: `Cmd+${i + 1}`, click: () => mgr.byIndex(i) })),
      { type: 'separator' },
      { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => mgr.step(1) },
      { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => mgr.step(-1) },
      { label: 'Next Tab', accelerator: 'Cmd+Option+Right', visible: false, click: () => mgr.step(1) },
      { label: 'Previous Tab', accelerator: 'Cmd+Option+Left', visible: false, click: () => mgr.step(-1) },
      { label: 'Mute Tab', accelerator: 'Cmd+M', click: () => { const a = t(); if (a) mgr.setMuted(a, !a.muted); } },
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Homie on GitHub', click: () => mgr.open('https://github.com/jonasjohansson/homie') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
