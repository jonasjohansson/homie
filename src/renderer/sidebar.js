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
  // groups: sections keyed by name, rows keyed by tab id, so rows can enter and leave in place
  const sections = new Map([...groupsEl.querySelectorAll('section.group')].map((el) => [el.dataset.name, el]));
  let cursor = groupsEl.firstChild;
  for (const g of S.groups) {
    let sec = sections.get(g.name);
    if (!sec) {
      sec = document.createElement('section'); sec.className = 'group'; sec.dataset.name = g.name;
      const h = document.createElement('h2');
      const f = document.createElement('span'); f.className = 'folder'; f.innerHTML = FOLDER;
      const n = document.createElement('span'); n.textContent = g.name;
      h.append(f, n); sec.append(h);
    } else sections.delete(g.name);
    if (sec !== cursor) groupsEl.insertBefore(sec, cursor); else cursor = cursor.nextSibling;
    reconcile(sec, g.tabs, sec.querySelector('h2'));
  }
  for (const sec of sections.values()) sec.remove();
  reconcile(todayEl, S.today, null);
  todaySection.classList.toggle('has', S.today.length > 0 || !!todayEl.querySelector('.tab.leave'));
  $('#back').disabled = !S.canGoBack; $('#fwd').disabled = !S.canGoForward;
  addressEl.textContent = host(S.url);
  const act = document.querySelector('.tab.active'); if (act) act.scrollIntoView({ block: 'nearest' });
  const d = S.downloads, meta = dlRow.querySelector('.meta');
  dlRow.classList.toggle('active', !!S.downloadsActive);
  if (!d) meta.textContent = '';
  else if (d.active) { meta.textContent = d.total ? Math.round(d.received / d.total * 100) + '%' : String(d.active); meta.classList.add('busy'); }
  else { meta.textContent = ''; meta.classList.remove('busy'); }
}

// Arc's timings, measured 2026-10-23: a new row appears at full height and fades in over
// about 50 ms; a closed row collapses over about 50 ms; the highlight moves at once.
function reconcile(container, tabs, after) {
  const existing = new Map();
  for (const el of container.querySelectorAll('.tab[data-id]')) if (!el.classList.contains('leave')) existing.set(Number(el.dataset.id), el);
  let cursor = after ? after.nextSibling : container.firstChild;
  for (const t of tabs) {
    let el = existing.get(t.id);
    if (el) { existing.delete(t.id); update(el, t); }
    else { el = row(t); el.classList.add('enter'); el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true }); }
    while (cursor && cursor.classList?.contains('leave')) cursor = cursor.nextSibling;
    if (el !== cursor) container.insertBefore(el, cursor); else cursor = cursor.nextSibling;
  }
  for (const el of existing.values()) {
    el.classList.add('leave'); el.style.height = el.offsetHeight + 'px';
    requestAnimationFrame(() => { el.style.height = '0px'; el.style.marginBottom = '0px'; el.style.opacity = '0'; });
    el.addEventListener('transitionend', () => { el.remove(); if (container === todayEl) todaySection.classList.toggle('has', S.today.length > 0 || !!todayEl.querySelector('.tab')); }, { once: true });
    setTimeout(() => el.remove(), 200);
  }
}

function signature(t) { return [t.kind, t.url, t.label, t.title, t.favicon, t.unread, t.muted, t.loading, t.loaded, t.away, t.id === S.activeId].join('\u0001'); }

function update(el, t) {
  const sig = signature(t);
  if (el.dataset.sig === sig) return;
  const fresh = row(t);
  el.className = fresh.className; el.dataset.sig = sig;
  el.replaceChildren(...fresh.childNodes);
}

function row(t) {
  const el = document.createElement('div');
  el.className = `tab ${t.kind}` + (t.id === S.activeId ? ' active' : '') + (t.loaded ? ' loaded' : '') + (t.loading ? ' loading' : '') + (t.muted ? ' muted' : '') + (t.away ? ' away' : '');
  el.dataset.id = t.id; el.dataset.sig = signature(t);
  const ico = document.createElement('span'); ico.className = 'ico';
  if (t.favicon) { const img = document.createElement('img'); img.src = t.favicon; img.onerror = () => { img.replaceWith(letter(t)); }; ico.append(img); } else ico.append(letter(t));
  const slash = document.createElement('span'); slash.className = 'slash'; slash.textContent = '/';
  const label = document.createElement('span'); label.className = 'label'; label.textContent = t.kind === 'pinned' && !t.away ? t.label : (t.title || host(t.url) || t.url);   // Arc: an away tab shows "/ page title" label.title = t.url;
  const badge = document.createElement('span'); badge.className = 'badge'; if (t.unread > 0) badge.textContent = t.unread > 99 ? '99+' : String(t.unread);
  const x = document.createElement('button'); x.className = 'x'; x.textContent = t.kind === 'pinned' ? '↺' : '×'; x.title = t.kind === 'pinned' ? 'Back to the pinned page' : 'Close';
  x.addEventListener('click', (e) => { e.stopPropagation(); homie.send('close', t.id); });
  el.append(ico, slash, label, badge, x);
  el.onclick = () => homie.send('activate', Number(el.dataset.id));
  el.onauxclick = (e) => { if (e.button === 1) homie.send('close', Number(el.dataset.id)); };
  el.oncontextmenu = (e) => { e.preventDefault(); homie.send('context', Number(el.dataset.id), e.clientX, e.clientY); };
  if (t.kind === 'pinned') el.ondblclick = () => startRename(Number(el.dataset.id));
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
