const $ = (s) => document.querySelector(s);
const groupsEl = $('#groups'), todayEl = $('#today'), todaySection = $('#todaySection'), dlRow = $('#dlrow'), addressEl = $('#address .host');
let S = { groups: [], today: [], activeId: null, url: '', downloads: null };
let renaming = null;

const FOLDER = '<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1 3.2A1.7 1.7 0 0 1 2.7 1.5h3.9l1.9 1.9h6.8A1.7 1.7 0 0 1 17 5.1v7.7a1.7 1.7 0 0 1-1.7 1.7H2.7A1.7 1.7 0 0 1 1 12.8z" fill="currentColor"/><path d="M1 6.2h16v6.6a1.7 1.7 0 0 1-1.7 1.7H2.7A1.7 1.7 0 0 1 1 12.8z" fill="#fff" opacity=".18"/></svg>';

homie.on('state', (s) => {
  S = s;
  const r = document.documentElement.style;
  r.setProperty('--w', s.sidebarWidth + 'px');
  const tint = (s.tint || '').split(/\s+/).filter(Boolean);
  if (tint.length) { r.setProperty('--tint-top', tint[0]); r.setProperty('--tint-bottom', tint[1] || tint[0]); } else { r.removeProperty('--tint-top'); r.removeProperty('--tint-bottom'); }
  if (s.theme) r.setProperty('--card', s.theme); else r.removeProperty('--card');
  document.body.classList.toggle('sidebar-hidden', !!s.sidebarHidden);
  render();
});
homie.on('sidebar-width', (w) => document.documentElement.style.setProperty('--w', w + 'px'));
homie.on('start-rename', (id) => startRename(id));

function render() {
  if (renaming) return;
  groupsEl.replaceChildren(...S.groups.map((g) => {
    const sec = document.createElement('section'); sec.className = 'group';
    const h = document.createElement('h2');
    const f = document.createElement('span'); f.className = 'folder'; f.innerHTML = FOLDER;
    const n = document.createElement('span'); n.textContent = g.name;
    h.append(f, n); sec.append(h);
    for (const t of g.tabs) sec.append(row(t));
    return sec;
  }));
  todayEl.replaceChildren(...S.today.map(row));
  todaySection.classList.toggle('has', S.today.length > 0);
  $('#back').disabled = !S.canGoBack; $('#fwd').disabled = !S.canGoForward;
  addressEl.textContent = host(S.url);
  const act = document.querySelector('.tab.active'); if (act) act.scrollIntoView({ block: 'nearest' });
  const d = S.downloads, meta = dlRow.querySelector('.meta');
  dlRow.classList.toggle('active', !!S.downloadsActive);
  if (!d) meta.textContent = '';
  else if (d.active) { meta.textContent = d.total ? Math.round(d.received / d.total * 100) + '%' : String(d.active); meta.classList.add('busy'); }
  else { meta.textContent = ''; meta.classList.remove('busy'); }
}

function row(t) {
  const el = document.createElement('div');
  el.className = `tab ${t.kind}` + (t.id === S.activeId ? ' active' : '') + (t.loaded ? ' loaded' : '') + (t.loading ? ' loading' : '') + (t.muted ? ' muted' : '') + (t.away ? ' away' : '');
  el.dataset.id = t.id;
  const ico = document.createElement('span'); ico.className = 'ico';
  if (t.favicon) { const img = document.createElement('img'); img.src = t.favicon; img.onerror = () => { img.replaceWith(letter(t)); }; ico.append(img); } else ico.append(letter(t));
  const slash = document.createElement('span'); slash.className = 'slash'; slash.textContent = '/';
  const label = document.createElement('span'); label.className = 'label'; label.textContent = t.kind === 'pinned' ? t.label : (t.title || host(t.url) || t.url); label.title = t.url;
  const badge = document.createElement('span'); badge.className = 'badge'; if (t.unread > 0) badge.textContent = t.unread > 99 ? '99+' : String(t.unread);
  const x = document.createElement('button'); x.className = 'x'; x.textContent = t.kind === 'pinned' ? '↺' : '×'; x.title = t.kind === 'pinned' ? 'Back to the pinned page' : 'Close';
  x.addEventListener('click', (e) => { e.stopPropagation(); homie.send('close', t.id); });
  el.append(ico, slash, label, badge, x);
  el.addEventListener('click', () => homie.send('activate', t.id));
  el.addEventListener('auxclick', (e) => { if (e.button === 1) homie.send('close', t.id); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); homie.send('context', t.id, e.clientX, e.clientY); });
  if (t.kind === 'pinned') el.addEventListener('dblclick', () => startRename(t.id));
  return el;
}

function letter(t) { const s = document.createElement('span'); s.className = 'letter'; s.textContent = ((t.label || t.title || t.url).replace(/^https?:\/\/(www\.)?/, '')[0] || '?').toUpperCase(); return s; }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u === 'homie://downloads' ? 'Downloads' : ''; } }

function startRename(id) {
  const el = document.querySelector(`.tab[data-id="${id}"]`); if (!el) return;
  const label = el.querySelector('.label');
  const input = document.createElement('input'); input.className = 'rename'; input.value = label.textContent;
  renaming = id; label.replaceWith(input); input.focus(); input.select();
  const done = (commit) => { if (!renaming) return; renaming = null; if (commit) homie.send('rename', id, input.value); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
  input.addEventListener('blur', () => done(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

$('#back').addEventListener('click', () => homie.send('nav', 'back'));
$('#fwd').addEventListener('click', () => homie.send('nav', 'forward'));
$('#reload').addEventListener('click', () => homie.send('nav', 'reload'));
$('#address').addEventListener('click', () => homie.send('palette', 'url'));
$('#newTab').addEventListener('click', () => homie.send('palette', 'new'));
$('#plus').addEventListener('click', () => homie.send('palette', 'new'));
$('#clearToday').addEventListener('click', () => homie.send('clear-today'));
$('#toggle').addEventListener('click', () => homie.send('toggle-sidebar'));
$('#toggle2').addEventListener('click', () => homie.send('toggle-sidebar'));
dlRow.addEventListener('click', () => homie.send('show-downloads'));

// --- resize: the page view is hidden while dragging, so every move reaches us --------
$('#handle').addEventListener('mousedown', (e) => {
  e.preventDefault();
  homie.send('sidebar-drag', 'start');
  const clamp = (x) => Math.max(180, Math.min(480, x));
  const move = (ev) => { const w = clamp(ev.clientX); document.documentElement.style.setProperty('--w', w + 'px'); homie.send('sidebar-drag', 'move', w); };
  const up = (ev) => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); homie.send('sidebar-drag', 'end', clamp(ev.clientX)); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});
