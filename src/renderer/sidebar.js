const $ = (s) => document.querySelector(s);
const omni = $('#omni'), suggest = $('#suggest'), groupsEl = $('#groups'), todayEl = $('#today'), todaySection = $('#todaySection'), dlEl = $('#downloads');
let S = { groups: [], today: [], activeId: null, url: '', downloads: [] };
let mode = 'url';          // 'url' | 'new' | 'find' | 'pin'
let pinTarget = null;
let items = [], sel = -1, suggestTimer = null, renaming = null;

// --- state ------------------------------------------------------------------------
homie.on('state', (s) => { S = s; document.documentElement.style.setProperty('--w', s.sidebarWidth + 'px'); render(); });
homie.on('sidebar-width', (w) => document.documentElement.style.setProperty('--w', w + 'px'));
homie.on('focus-omni', (m) => focusOmni(m));
homie.on('find-step', (dir) => { if (mode === 'find' && omni.value) homie.send('find', omni.value, dir > 0, false); });
homie.on('start-rename', (id) => startRename(id));
homie.on('prompt-group', (id) => { pinTarget = id; focusOmni('pin'); });
homie.on('prompt-pin', (id) => { pinTarget = id; focusOmni('pin'); });

function render() {
  if (renaming) return;
  groupsEl.replaceChildren(...S.groups.map((g) => {
    const sec = document.createElement('section'); sec.className = 'group';
    const h = document.createElement('h2'); h.textContent = g.name; sec.append(h);
    for (const t of g.tabs) sec.append(row(t));
    return sec;
  }));
  todayEl.replaceChildren(...S.today.map(row));
  todaySection.classList.toggle('has', S.today.length > 0);
  $('#back').disabled = !S.canGoBack; $('#fwd').disabled = !S.canGoForward;
  if (document.activeElement !== omni && mode === 'url') omni.value = pretty(S.url);
  const act = document.querySelector('.tab.active'); if (act) act.scrollIntoView({ block: 'nearest' });
  renderDownloads();
}

function row(t) {
  const el = document.createElement('div');
  el.className = `tab ${t.kind}` + (t.id === S.activeId ? ' active' : '') + (t.loaded ? ' loaded' : '') + (t.loading ? ' loading' : '') + (t.muted ? ' muted' : '') + (t.away ? ' away' : '');
  el.dataset.id = t.id;
  const ico = document.createElement('span'); ico.className = 'ico';
  if (t.favicon) { const img = document.createElement('img'); img.src = t.favicon; img.onerror = () => { img.replaceWith(letter(t)); }; ico.append(img); } else ico.append(letter(t));
  const label = document.createElement('span'); label.className = 'label'; label.textContent = t.kind === 'pinned' ? t.label : (t.title || t.url); label.title = t.url;
  const badge = document.createElement('span'); badge.className = 'badge'; if (t.unread > 0) badge.textContent = t.unread > 99 ? '99+' : String(t.unread);
  const x = document.createElement('button'); x.className = 'x'; x.textContent = t.kind === 'pinned' ? '↺' : '×'; x.title = t.kind === 'pinned' ? 'Back to the pinned page' : 'Close';
  x.addEventListener('click', (e) => { e.stopPropagation(); homie.send('close', t.id); });
  el.append(ico, label, badge, x);
  el.addEventListener('click', () => homie.send('activate', t.id));
  el.addEventListener('auxclick', (e) => { if (e.button === 1) homie.send('close', t.id); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); homie.send('context', t.id, e.clientX, e.clientY); });
  if (t.kind === 'pinned') el.addEventListener('dblclick', () => startRename(t.id));
  return el;
}

function letter(t) { const s = document.createElement('span'); s.className = 'letter'; s.textContent = ((t.label || t.title || t.url).replace(/^https?:\/\/(www\.)?/, '')[0] || '?').toUpperCase(); return s; }
function pretty(u) { return u ? u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '') : ''; }

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

// --- omnibox ------------------------------------------------------------------------
function focusOmni(m) {
  mode = m; pinTarget = m === 'pin' ? pinTarget : null;
  omni.classList.toggle('find', m === 'find');
  omni.placeholder = m === 'find' ? 'Find in page' : m === 'pin' ? 'Pin to group…' : m === 'new' ? 'New tab: search or address' : 'Search or enter address';
  omni.value = m === 'url' ? S.url : m === 'pin' ? (S.groups[0]?.name || '') : '';
  omni.focus(); omni.select();
  if (m === 'pin') showItems(S.groups.map((g) => ({ kind: 'group', title: g.name })));
}

function leaveOmni() {
  if (mode === 'find') homie.send('find-stop');
  hideSuggest(); mode = 'url'; omni.classList.remove('find'); omni.placeholder = 'Search or enter address';
  omni.value = pretty(S.url); omni.blur(); homie.send('focus-page');
}

omni.addEventListener('focus', () => { if (mode === 'url') { omni.value = S.url; requestAnimationFrame(() => omni.select()); } });
omni.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== omni) { hideSuggest(); if (mode !== 'find') { mode = 'url'; omni.classList.remove('find'); omni.value = pretty(S.url); } } }, 120));
omni.addEventListener('input', () => {
  if (mode === 'find') { homie.send('find', omni.value, true, true); return; }
  if (mode === 'pin') { showItems(S.groups.filter((g) => g.name.toLowerCase().includes(omni.value.toLowerCase())).map((g) => ({ kind: 'group', title: g.name }))); return; }
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => { const q = omni.value; if (!q.trim()) return hideSuggest(); showItems(await homie.invoke('suggest', q)); }, 50);
});
omni.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); leaveOmni(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paintSel(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (mode === 'find') { homie.send('find', omni.value, !e.shiftKey, false); return; }
  if (mode === 'pin') { const name = (sel >= 0 ? items[sel].title : omni.value).trim(); if (name && pinTarget != null) homie.send('pin-new-group', pinTarget, name); leaveOmni(); return; }
  const it = sel >= 0 ? items[sel] : null;
  if (it?.kind === 'tab') homie.send('activate', it.id);
  else homie.send('navigate', it ? it.url : omni.value, { newTab: mode === 'new' || e.metaKey });
  leaveOmni();
});

function showItems(list) {
  items = list; sel = -1;
  if (!items.length) return hideSuggest();
  suggest.replaceChildren(...items.map((it, i) => {
    const li = document.createElement('li');
    const k = document.createElement('span'); k.className = 'k'; k.textContent = { tab: '⇥', history: '◷', search: '⌕', url: '→', group: '▸' }[it.kind] || '';
    const t = document.createElement('span'); t.className = 't'; t.textContent = it.title;
    li.append(k, t);
    if (it.url && it.kind !== 'search' && it.kind !== 'url') { const u = document.createElement('span'); u.className = 'u'; u.textContent = pretty(it.url); li.append(u); li.style.gridTemplateColumns = 'var(--icon) minmax(0, 1fr) minmax(0, .8fr)'; }
    li.addEventListener('mousedown', (e) => { e.preventDefault(); sel = i; omni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    return li;
  }));
  suggest.hidden = false;
}
function paintSel() { [...suggest.children].forEach((li, i) => li.classList.toggle('sel', i === sel)); if (sel >= 0 && mode !== 'pin' && items[sel].kind !== 'tab') omni.value = items[sel].kind === 'search' ? omni.value : items[sel].url; }
function hideSuggest() { suggest.hidden = true; items = []; sel = -1; }

$('#back').addEventListener('click', () => homie.send('nav', 'back'));
$('#fwd').addEventListener('click', () => homie.send('nav', 'forward'));
$('#reload').addEventListener('click', () => homie.send('nav', 'reload'));
$('#clearToday').addEventListener('click', () => homie.send('clear-today'));

// --- downloads ------------------------------------------------------------------------
function renderDownloads() {
  const list = S.downloads || [];
  dlEl.hidden = !list.length;
  if (!list.length) return;
  const h = document.createElement('h2'); h.innerHTML = '<span>Downloads</span>';
  const clear = document.createElement('button'); clear.textContent = 'Clear'; clear.addEventListener('click', () => homie.send('download-action', 0, 'clear')); h.append(clear);
  dlEl.replaceChildren(h, ...list.slice().reverse().map((d) => {
    const el = document.createElement('div'); el.className = 'dl';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = d.name; n.title = d.path;
    const s = document.createElement('span'); s.className = 's';
    s.textContent = d.state === 'completed' ? size(d.total) : d.state === 'progressing' ? (d.total ? Math.round(d.received / d.total * 100) + '%' : size(d.received)) : d.state;
    el.append(n, s);
    if (d.state === 'progressing') { const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = d.total ? (d.received / d.total * 100) + '%' : '30%'; bar.append(i); el.append(bar); }
    el.addEventListener('dblclick', () => homie.send('download-action', d.id, 'open'));
    el.addEventListener('click', () => { if (d.state === 'completed') homie.send('download-action', d.id, 'reveal'); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); homie.send('download-action', d.id, d.state === 'progressing' ? 'cancel' : 'reveal'); });
    return el;
  }));
}
function size(b) { if (!b) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(i ? 1 : 0) + ' ' + u[i]; }

// --- resize ---------------------------------------------------------------------------
const handle = $('#handle');
handle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  homie.send('sidebar-drag', 'start');
  const move = (ev) => { const w = Math.max(180, Math.min(480, ev.clientX)); document.documentElement.style.setProperty('--w', w + 'px'); homie.send('sidebar-drag', 'move', w); };
  const up = (ev) => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); homie.send('sidebar-drag', 'end', Math.max(180, Math.min(480, ev.clientX))); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});

// keys that reach the sidebar document while nothing is focused
window.addEventListener('keydown', (e) => {
  if (e.target === omni || renaming) return;
  if (e.key === 'Escape') leaveOmni();
});
