const rowsEl = document.getElementById('rows'), emptyEl = document.getElementById('empty');
let rows = [], sel = null;

homie.on('downloads', (list) => { rows = list; render(); });
homie.send('dl', 'refresh');

document.getElementById('folder').addEventListener('click', () => homie.send('dl', 'folder'));
document.getElementById('clear').addEventListener('click', () => homie.send('dl', 'clear'));

function render() {
  emptyEl.hidden = rows.length > 0;
  rowsEl.replaceChildren(...rows.slice().reverse().map((r) => {
    const el = document.createElement('div');
    el.className = 'row ' + r.state + (r.exists === false ? ' gone' : '') + (r.id === sel ? ' sel' : '');
    el.draggable = r.state === 'completed' && r.exists !== false;
    const icon = document.createElement('span'); icon.className = 'icon';
    if (r.icon) { const img = document.createElement('img'); img.src = r.icon; img.draggable = false; icon.append(img); }
    else { const ext = document.createElement('span'); ext.className = 'ext'; ext.textContent = (r.name.split('.').pop() || '').slice(0, 4); icon.append(ext); }
    const name = document.createElement('span'); name.className = 'name'; name.textContent = r.name; name.title = r.path;
    el.append(icon, name);
    if (r.state === 'progressing') {
      const state = document.createElement('span'); state.className = 'state'; state.textContent = r.total ? `${size(r.received)} of ${size(r.total)}` : size(r.received);
      const cancel = document.createElement('button'); cancel.className = 'cancel'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', (e) => { e.stopPropagation(); homie.send('dl', 'cancel', r.id); });
      const spacer = document.createElement('span');
      const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = r.total ? (r.received / r.total * 100) + '%' : '25%'; bar.append(i);
      el.append(state, spacer, cancel, bar);
    } else {
      const sz = document.createElement('span'); sz.className = 'size'; sz.textContent = r.state === 'completed' ? size(r.total || r.received) : r.state;
      const host = document.createElement('span'); host.className = 'host'; host.textContent = hostOf(r.url); host.title = r.url;
      const when = document.createElement('span'); when.className = 'when'; when.textContent = ago(r.time);
      el.append(sz, host, when);
    }
    el.addEventListener('click', () => { sel = r.id; paint(); });
    el.addEventListener('dblclick', () => homie.send('dl', 'open', r.id));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); sel = r.id; paint(); homie.send('dl-context', r.id, e.clientX, e.clientY); });
    el.addEventListener('dragstart', (e) => { e.preventDefault(); homie.send('dl', 'drag', r.id); });
    return el;
  }));
}
function paint() { for (const el of rowsEl.children) el.classList.toggle('sel', false); const i = rows.slice().reverse().findIndex((r) => r.id === sel); if (i >= 0) rowsEl.children[i]?.classList.add('sel'); }
function size(b) { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(i ? 1 : 0) + ' ' + u[i]; }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function ago(t) {
  const d = Date.now() - t, m = Math.round(d / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
window.addEventListener('keydown', (e) => {
  if (!sel) return;
  if (e.key === 'Enter') homie.send('dl', 'open', sel);
  else if (e.key === 'Backspace' || e.key === 'Delete') { homie.send('dl', e.metaKey ? 'trash' : 'remove', sel); sel = null; }
  else if (e.key === ' ') { e.preventDefault(); homie.send('dl', 'reveal', sel); }
});
setInterval(() => { if (rows.some((r) => r.state !== 'progressing')) render(); }, 60000);
