const $ = (s) => document.querySelector(s);
const groupsEl = $('#groups'), todayEl = $('#today'), todaySection = $('#todaySection'), dlRow = $('#dlrow'), cardsEl = $('#cards'), guttersEl = $('#gutters'), toolbarT = $('#toolbarT');
let S = { groups: [], today: [], activeId: null, url: '', downloads: null };
let renaming = null, drag = null, renderAfterDrag = false, lastActive = null, endDrag = null, drag_overPage = false;
// The rail is this page again, icons only, floating over the page's left edge while the sidebar is hidden.
const RAIL = new URLSearchParams(location.search).has('rail');
if (RAIL) document.body.classList.add('rail');

const FOLDER = '<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1 3.2A1.7 1.7 0 0 1 2.7 1.5h3.9l1.9 1.9h6.8A1.7 1.7 0 0 1 17 5.1v7.7a1.7 1.7 0 0 1-1.7 1.7H2.7A1.7 1.7 0 0 1 1 12.8z" fill="currentColor"/><path d="M1 6.2h16v6.6a1.7 1.7 0 0 1-1.7 1.7H2.7A1.7 1.7 0 0 1 1 12.8z" fill="#fff" opacity=".18"/></svg>';
// the open folder, for an expanded group: the front flap tilts out
const FOLDER_OPEN = '<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1 3.2A1.7 1.7 0 0 1 2.7 1.5h3.9l1.9 1.9h6.8A1.7 1.7 0 0 1 17 5.1v1.4H1z" fill="currentColor"/><path d="M3.2 7.2h13.9a1 1 0 0 1 .96 1.27l-1.5 5.3a1.7 1.7 0 0 1-1.63 1.23H2.7A1.7 1.7 0 0 1 1 13.3V8.4z" fill="currentColor"/><path d="M3.2 7.2h13.9a1 1 0 0 1 .96 1.27l-1.5 5.3a1.7 1.7 0 0 1-1.63 1.23H2.7A1.7 1.7 0 0 1 1 13.3V8.4z" fill="#fff" opacity=".22"/></svg>';

homie.on('state', (s) => {
  S = s;
  const r = document.documentElement.style;
  r.setProperty('--w', s.sidebarWidth + 'px');
  const tint = (s.tint || '').split(/\s+/).filter(Boolean);
  if (tint.length) { r.setProperty('--tint-top', tint[0]); r.setProperty('--tint-bottom', tint[1] || tint[0]); } else { r.removeProperty('--tint-top'); r.removeProperty('--tint-bottom'); }
  document.body.classList.toggle('sidebar-hidden', !RAIL && !!s.sidebarHidden);
  render();
});
homie.on('sidebar-width', (w) => document.documentElement.style.setProperty('--w', w + 'px'));
homie.on('start-rename', (id) => startRename(id));
homie.on('start-rename-group', (name) => startRenameGroup(name));
homie.on('row-drag-end', () => { if (endDrag) endDrag(); });   // the page took the drop
homie.on('rail', (on) => document.body.classList.toggle('in', !!on));
// with the sidebar hidden, the pointer in the margin left of the page brings up the rail
if (!RAIL) document.addEventListener('mousemove', (e) => { if (S.sidebarHidden && e.clientX < 10 && e.clientY > 48) homie.send('rail'); });

function render() {
  if (renaming) return;
  if (drag) { renderAfterDrag = true; return; }
  // groups: sections keyed by name, rows keyed by tab id, so rows can enter and leave in place
  const sections = new Map([...groupsEl.querySelectorAll('section.group')].map((el) => [el.dataset.name, el]));
  let cursor = groupsEl.firstChild;
  for (const g of S.groups) {
    let sec = sections.get(g.name);
    if (!sec) {
      sec = document.createElement('section'); sec.className = 'group'; sec.dataset.name = g.name;
      const h = document.createElement('h2');
      const f = document.createElement('span'); f.className = 'folder';
      const n = document.createElement('span'); n.className = 'name'; n.textContent = g.name;
      h.append(f, n); sec.append(h);
      h.onclick = () => { if (!h.querySelector('input')) homie.send('collapse', sec.dataset.name); };   // Arc: a click on the folder row folds it
      h.oncontextmenu = (e) => { e.preventDefault(); homie.send('group-context', sec.dataset.name, e.clientX, e.clientY); };
      h.ondblclick = (e) => { e.preventDefault(); startRenameGroup(sec.dataset.name); };
    } else sections.delete(g.name);
    if (sec.classList.contains('collapsed') !== !!g.collapsed) { sec.classList.toggle('collapsed', !!g.collapsed); }
    const fi = sec.querySelector('h2 .folder'); const want = (g.collapsed ? 'c' : 'o') + (g.icon || '');
    if (fi.dataset.v !== want) { fi.dataset.v = want; fi.innerHTML = (g.collapsed ? FOLDER : FOLDER_OPEN) + (g.icon ? `<span class="emoji">${g.icon.replace(/[<>&]/g, '')}</span>` : ''); }
    if (sec !== cursor) groupsEl.insertBefore(sec, cursor); else cursor = cursor.nextSibling;
    reconcile(sec, g.tabs, sec.querySelector('h2'));
  }
  for (const sec of sections.values()) sec.remove();
  reconcile(todayEl, S.today, null);
  todaySection.classList.toggle('has', S.today.length > 0 || !!todayEl.querySelector('.tab.leave'));
  if (!RAIL) renderCards();
  if (S.activeId !== lastActive) { lastActive = S.activeId; const act = document.querySelector('.tab.active'); if (act) act.scrollIntoView({ block: 'nearest' }); }   // only on a switch, never while scrolling
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

function inSplit(t) { return (S.panes || []).length > 1 && (S.splitIds || []).includes(t.id); }
function signature(t) { return [t.kind, t.child, t.url, t.label, t.title, t.favicon, t.unread, t.muted, t.loading, t.loaded, t.away, t.id === S.activeId, inSplit(t)].join('\u0001'); }

function update(el, t) {
  const sig = signature(t);
  if (el.dataset.sig === sig) return;
  const fresh = row(t);
  el.className = fresh.className; el.dataset.sig = sig;
  const parts = ['.ico', '.label', '.badge', '.x'];
  for (const sel of parts) {
    const a = el.querySelector(sel), b = fresh.querySelector(sel);
    if (a && b && a.outerHTML !== b.outerHTML) a.replaceWith(b);   // the favicon <img> survives a title tick
  }
  el.onclick = fresh.onclick; el.ondblclick = fresh.ondblclick;
  const ia = el.querySelector('.ico'), ib = fresh.querySelector('.ico'); if (ia && ib) { ia.onclick = ib.onclick; ia.title = ib.title; }
}

function row(t) {
  const el = document.createElement('div');
  el.className = `tab ${t.kind}` + (t.id === S.activeId ? ' active' : '') + (inSplit(t) ? ' split' : '') + (t.loaded ? ' loaded' : '') + (t.loading ? ' loading' : '') + (t.muted ? ' muted' : '') + (t.away ? ' away' : '') + (t.child ? ' child' : '');
  el.dataset.id = t.id; el.dataset.sig = signature(t);
  const ico = document.createElement('span'); ico.className = 'ico';
  if (t.favicon) { const img = document.createElement('img'); img.src = t.favicon; img.onerror = () => { img.replaceWith(letter(t)); }; ico.append(img); } else ico.append(letter(t));
  if (t.away) { ico.title = 'Back to Pinned URL'; ico.onclick = (e) => { e.stopPropagation(); homie.send('reset', t.id); }; }   // Arc: the favicon of an away tab goes home
  const label = document.createElement('span'); label.className = 'label'; label.textContent = t.kind === 'pinned' ? t.label : (t.title || host(t.url) || t.url);
  if (t.away) { const cur = document.createElement('span'); cur.className = 'cur'; cur.textContent = ' / ' + (t.title || host(t.url)); label.append(cur); }   // Arc: "name / page title" while away
  label.title = t.url;
  if (RAIL) el.title = label.textContent;   // the rail has no labels, so the row says its name on hover
  const badge = document.createElement('span'); badge.className = 'badge'; if (t.unread > 0) badge.textContent = t.unread > 99 ? '99+' : String(t.unread);
  const x = document.createElement('button'); x.className = 'x'; x.textContent = t.away ? '↺' : '×'; x.title = t.away ? 'Back to the pinned page' : t.kind === 'pinned' ? 'Unload' : 'Close';   // Arc: × unloads a pinned tab, ↺ only while it is away
  x.addEventListener('click', (e) => { e.stopPropagation(); homie.send('close', t.id); });
  el.append(ico, label, badge, x);
  el.onclick = (e) => homie.send('activate', Number(el.dataset.id), !!e.altKey);   // Arc: Option-click opens the tab in a split
  el.onauxclick = (e) => { if (e.button === 1) homie.send('close', Number(el.dataset.id)); };
  el.oncontextmenu = (e) => { e.preventDefault(); homie.send('context', Number(el.dataset.id), e.clientX, e.clientY); };
  if (t.kind !== 'internal' && !RAIL) el.ondblclick = () => startRename(Number(el.dataset.id));   // Arc: any tab renames
  return el;
}

function letter(t) { const s = document.createElement('span'); s.className = 'letter'; s.textContent = ((t.label || t.title || t.url).replace(/^https?:\/\/(www\.)?/, '')[0] || '?').toUpperCase(); return s; }
function isLight(col) {
  const m = /^#([0-9a-f]{6})$/i.exec(col || '') ? [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16)) : /rgba?\(([^)]+)\)/.exec(col || '')?.[1].split(',').map(Number);
  if (!m) return !matchMedia('(prefers-color-scheme: dark)').matches;
  return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) > 140;
}
function host(u) { if (/^terminal:/i.test(u)) return u.replace(/^terminal:(\/\/)?/i, '') || '~'; try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u === 'homie://downloads' ? 'Downloads' : ''; } }

function startRenameGroup(name) {
  if (RAIL) return;
  const sec = document.querySelector(`section.group[data-name="${CSS.escape(name)}"]`); if (!sec) return;
  const label = sec.querySelector('h2 .name');
  const input = document.createElement('input'); input.className = 'rename'; input.value = name;
  renaming = 'group:' + name; label.replaceWith(input); input.focus(); input.select();
  const done = (commit) => { if (!renaming) return; renaming = null; const v = input.value.trim(); if (commit && v && v !== name) homie.send('rename-group', name, v); input.replaceWith(label); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
  input.addEventListener('blur', () => done(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

// --- drag and drop: a row lifts under the pointer, the others close and open a gap -------
// Arc's model: drag a Today tab up into a folder to pin it, a pinned tab down into Today to
// unpin it, or anywhere to reorder. The page stays loaded either way (main moves the Tab).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || renaming || RAIL) return;
  const el = e.target.closest('.tab[data-id]'); if (!el || e.target.closest('.x') || el.classList.contains('leave')) return;
  const id = Number(el.dataset.id), x0 = e.clientX, y0 = e.clientY;
  const r = el.getBoundingClientRect();
  const arm = (ev) => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return; window.removeEventListener('mousemove', arm); window.removeEventListener('mouseup', disarm); begin(ev); };
  const disarm = () => { window.removeEventListener('mousemove', arm); window.removeEventListener('mouseup', disarm); };
  window.addEventListener('mousemove', arm); window.addEventListener('mouseup', disarm);
  function begin(ev) {
    const ghost = el.cloneNode(true); ghost.classList.add('ghost'); ghost.classList.remove('active');
    ghost.style.width = r.width + 'px'; ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
    const gap = document.createElement('div'); gap.className = 'gap';
    drag = { id, el, ghost, gap, dx: x0 - r.left, dy: y0 - r.top, target: null };
    el.classList.add('dragging'); el.after(gap); document.body.append(ghost); document.body.classList.add('dragging');
    homie.send('row-drag', 'start', id);
    move(ev);
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', drop, { once: true });
    endDrag = () => { window.removeEventListener('mouseup', drop); drop(true); };
  }
  function move(ev) {
    drag.ghost.style.left = (ev.clientX - drag.dx) + 'px'; drag.ghost.style.top = (ev.clientY - drag.dy) + 'px';
    drag_overPage = ev.clientX > parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w'));
    if (drag_overPage) { drag.gap.remove(); drag.target = null; return; }
    const y = ev.clientY;
    // candidate slots in document order: every visible row's midline, then each container's end
    const slots = [];
    const containers = [...groupsEl.querySelectorAll('section.group')].map((sec) => ({ sec, list: sec, group: sec.dataset.name, head: sec.querySelector('h2') }));
    containers.push({ sec: todaySection, list: todayEl, group: null, head: $('#newTab') });
    for (const c of containers) {
      const shown = c.sec.classList.contains('collapsed') ? [] : [...c.list.querySelectorAll(':scope > .tab[data-id]')].filter((x) => x !== drag.el && !x.classList.contains('leave'));
      const rows = c.group == null ? shown : shown.filter((x) => !x.classList.contains('child'));   // a pin's index counts pins, not the sub-tabs under it
      rows.forEach((row, i) => { const b = row.getBoundingClientRect(); slots.push({ y: b.top + b.height / 2, list: c.list, group: c.group, index: i, before: row }); });
      const last = shown[shown.length - 1] || c.head; const b = last.getBoundingClientRect();
      slots.push({ y: b.bottom + 4, list: c.list, group: c.group, index: rows.length, before: null, end: true });
    }
    let t = slots.find((sl) => y < sl.y) || slots[slots.length - 1];
    if (drag.target && drag.target.list === t.list && drag.target.index === t.index) return;
    drag.target = t;
    if (t.before) t.list.insertBefore(drag.gap, t.before); else t.list.append(drag.gap);
  }
  function drop(fromPage) {
    window.removeEventListener('mousemove', move); endDrag = null;
    if (!drag) return;
    const { target, el: row, ghost, gap } = drag;
    drag = null; ghost.remove(); gap.remove(); row.classList.remove('dragging'); document.body.classList.remove('dragging');
    if (fromPage !== true) { homie.send('row-drag', 'end'); if (target && !drag_overPage) homie.send('move', id, target.group, target.index); }
    if (renderAfterDrag) { renderAfterDrag = false; render(); }
  }
});

function startRename(id) {
  if (RAIL) return;
  const el = document.querySelector(`.tab[data-id="${id}"]`); if (!el) return;
  const label = el.querySelector('.label');
  const input = document.createElement('input'); input.className = 'rename'; input.value = label.textContent;
  renaming = id; label.replaceWith(input); input.focus(); input.select();
  const done = (commit) => { if (!renaming) return; renaming = null; if (commit && input.value.trim()) { homie.send('rename', id, input.value); label.textContent = input.value.trim(); input.replaceWith(label); } else render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); e.stopPropagation(); });
  input.addEventListener('blur', () => done(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

$('#newTab').addEventListener('click', () => homie.send('palette', 'new'));
$('#plus').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); homie.send('plus-menu', r.left, r.bottom); });   // Arc: New Tab, New Folder…
$('#clearToday').addEventListener('click', () => homie.send('clear-today'));
$('#toggle').addEventListener('click', () => homie.send('toggle-sidebar'));
dlRow.addEventListener('click', () => homie.send('show-downloads'));

// --- resize: the page view is hidden while dragging, so every move reaches us --------
$('#handle').addEventListener('mousedown', (e) => {
  e.preventDefault();
  homie.send('sidebar-drag', 'start'); document.body.classList.add('resizing');
  const clamp = (x) => Math.max(180, Math.min(480, x));
  const move = (ev) => { const w = clamp(ev.clientX); document.documentElement.style.setProperty('--w', w + 'px'); homie.send('sidebar-drag', 'move', w); };
  const up = (ev) => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); homie.send('sidebar-drag', 'end', clamp(ev.clientX)); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});

// --- the cards: one per pane, placed where main put the page views -----------------------
function renderCards() {
  const panes = S.panes || [], n = panes.length;
  const existing = new Map([...cardsEl.querySelectorAll('.card')].map((c) => [Number(c.dataset.id), c]));
  panes.forEach((p, i) => {
    let c = existing.get(p.id);
    if (!c) { c = document.createElement('div'); c.className = 'card'; c.dataset.id = p.id; c.append(toolbarT.content.cloneNode(true)); wireToolbar(c, p.id); }
    else existing.delete(p.id);
    if (cardsEl.children[i] !== c) cardsEl.insertBefore(c, cardsEl.children[i] || null);
    Object.assign(c.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
    if (p.theme) c.style.setProperty('--card', p.theme); else c.style.removeProperty('--card');
    c.classList.toggle('light', isLight(p.theme));   // the toolbar's ink follows the page's colour, not the OS theme
    c.classList.toggle('focused', !!p.focused); c.classList.toggle('single', n === 1);
    c.querySelector('.back').disabled = !p.canGoBack; c.querySelector('.fwd').disabled = !p.canGoForward;
    const h = c.querySelector('.host'), txt = host(p.url); if (h.textContent !== txt) h.textContent = txt;
    const ag = c.querySelector('.agent'); ag.hidden = !p.agent; ag.classList.toggle('on', p.agent === 'on');
  });
  for (const c of existing.values()) c.remove();
  // gutters between panes carry the resize drag
  guttersEl.replaceChildren(...panes.slice(0, -1).map((p, i) => {
    const g = document.createElement('div'); g.className = 'gutter'; g.dataset.i = i;
    const x = p.x + p.w, w = panes[i + 1].x - x;
    Object.assign(g.style, { left: x + 'px', top: p.y + 'px', width: w + 'px', height: p.h + 'px' });
    g.addEventListener('mousedown', (e) => {
      e.preventDefault(); document.body.classList.add('resizing'); homie.send('split-drag', 'start', i, e.clientX);
      const move = (ev) => homie.send('split-drag', 'move', i, ev.clientX);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); homie.send('split-drag', 'end', i, 0); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    return g;
  }));
}
function wireToolbar(c, id) {
  c.querySelector('.toggle2').addEventListener('click', () => homie.send('toggle-sidebar'));
  c.querySelector('.back').addEventListener('click', () => homie.send('pane', id, 'back'));
  c.querySelector('.fwd').addEventListener('click', () => homie.send('pane', id, 'forward'));
  c.querySelector('.reload').addEventListener('click', () => homie.send('pane', id, 'reload'));
  c.querySelector('.address').addEventListener('click', () => homie.send('pane', id, 'address'));
  c.querySelector('.paneClose').addEventListener('click', () => homie.send('pane', id, 'close'));
  c.querySelector('.addSplit').addEventListener('click', () => homie.send('pane', id, 'add-split'));
  c.querySelector('.agent').addEventListener('click', () => homie.send('pane', id, 'agent'));
  c.addEventListener('mousedown', () => { if (S.panes?.length > 1 && !S.panes.find((p) => p.id === id)?.focused) homie.send('activate', id); });   // a click on a pane's toolbar focuses it
}
