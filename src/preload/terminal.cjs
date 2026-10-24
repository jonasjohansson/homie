// The terminal page's line to its shell (src/main/terminal.js). Only Homie's own
// terminal.html gets it; the main process also checks that the sender is a terminal tab.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
if (location.protocol === 'file:' && location.pathname.endsWith('/renderer/terminal.html')) {
  contextBridge.exposeInMainWorld('shell', {
    attach: (cols, rows) => ipcRenderer.invoke('term:attach', cols, rows),
    input: (d) => ipcRenderer.send('term:input', d),
    resize: (cols, rows) => ipcRenderer.send('term:resize', cols, rows),
    restart: (cols, rows) => ipcRenderer.send('term:restart', cols, rows),
    link: (url) => ipcRenderer.send('term:link', url),
    bell: (text) => ipcRenderer.send('term:bell', text || ''),
    onData: (fn) => ipcRenderer.on('term:data', (_e, d) => fn(d)),
    onExit: (fn) => ipcRenderer.on('term:exit', (_e, code) => fn(code)),
    onClear: (fn) => ipcRenderer.on('term:clear', () => fn()),
    onReset: (fn) => ipcRenderer.on('term:reset', () => fn()),
    pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  });
}
