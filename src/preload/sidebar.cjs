const { contextBridge, ipcRenderer } = require('electron');
try { require('electron-chrome-extensions/browser-action').injectBrowserAction(); } catch (e) { console.error('browser-action', e.message); }
contextBridge.exposeInMainWorld('homie', {
  on: (ch, fn) => ipcRenderer.on(ch, (_e, ...a) => fn(...a)),
  send: (ch, ...a) => ipcRenderer.send(ch, ...a),
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  platform: process.platform,
});
