// Sandboxed, isolated world. Hears the notification shim's postMessage and forwards it.
const { ipcRenderer } = require('electron');
window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source === window && d && d.__homie === 'notification') {
    ipcRenderer.send('homie:notification', { title: String(d.title || ''), body: String(d.body || ''), tag: String(d.tag || '') });
  }
});
