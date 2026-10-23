// Sandboxed, isolated world. Hears the notification shim's postMessage and forwards it.
const { ipcRenderer } = require('electron');
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
