// The floating command bar: Cmd+T (new tab), Cmd+L (edit address), Cmd+F (find),
// Cmd+D on a Today tab (pick a group), 'folder' (name a new folder), 'edit-url' (a pinned tab's URL). Sized by main to fit its rows.
const omni = document.getElementById('omni'), suggest = document.getElementById('suggest');
let S = { groups: [], url: '' };
let mode = 'url', pinTarget = null, arg = null, items = [], sel = -1, timer = null;
const INPUT = 48, ROW = 36, LIST_PAD = 9;

homie.on('state', (s) => { S = s; });
homie.on('open', (m, a) => {
  mode = m; arg = a; pinTarget = m === 'pin' ? a : null;
  document.body.className = m;
  omni.placeholder = { find: 'Find in page', pin: 'Pin to folder', new: 'Search or enter address', folder: 'Folder name', 'edit-url': 'Pinned address' }[m] || 'Edit address';
  const pinned = m === 'edit-url' ? S.groups.flatMap((g) => g.tabs).find((t) => t.id === a) : null;
  omni.value = m === 'url' ? S.url : m === 'edit-url' ? (pinned?.pinnedUrl || '') : '';
  showItems(m === 'pin' ? S.groups.map((g) => ({ kind: 'group', title: g.name })) : []);
  omni.focus(); omni.select();
});
homie.on('find-step', (dir) => { if (mode === 'find' && omni.value) homie.send('find', omni.value, dir > 0, false); });

function close() {
  if (mode === 'find') homie.send('find-stop');
  items = []; sel = -1; suggest.replaceChildren();
  homie.send('palette-close');
}

omni.addEventListener('input', () => {
  if (mode === 'find') { homie.send('find', omni.value, true, true); return; }
  if (mode === 'folder' || mode === 'edit-url') return;
  if (mode === 'pin') { showItems(S.groups.filter((g) => g.name.toLowerCase().includes(omni.value.toLowerCase())).map((g) => ({ kind: 'group', title: g.name }))); return; }
  clearTimeout(timer);
  timer = setTimeout(async () => { const q = omni.value; if (!q.trim()) return showItems([]); showItems(await homie.invoke('suggest', q)); }, 40);
});
omni.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paintSel(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (mode === 'find') { homie.send('find', omni.value, !e.shiftKey, false); return; }
  if (mode === 'pin') { const name = (sel >= 0 ? items[sel].title : omni.value).trim(); if (name && pinTarget != null) homie.send('pin-new-group', pinTarget, name); close(); return; }
  if (mode === 'folder') { const name = omni.value.trim(); if (name) homie.send('new-group', name, arg); close(); return; }
  if (mode === 'edit-url') { const u = omni.value.trim(); if (u) homie.send('set-url', arg, u); close(); return; }
  const it = sel >= 0 ? items[sel] : null;
  if (it?.kind === 'tab') homie.send('activate', it.id);
  else if (omni.value.trim() || it) homie.send('navigate', it ? it.url : omni.value, { newTab: mode === 'new' || e.metaKey });
  close();
});
omni.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== omni && mode !== 'find') close(); }, 150));

function showItems(list) {
  items = list; sel = -1;
  suggest.replaceChildren(...items.map((it, i) => {
    const li = document.createElement('li');
    const k = document.createElement('span'); k.className = 'k'; k.textContent = { tab: '⇥', history: '◷', search: '⌕', url: '→', group: '▸' }[it.kind] || '';
    const t = document.createElement('span'); t.className = 't'; t.textContent = it.title;
    li.append(k, t);
    if (it.url && it.kind !== 'search' && it.kind !== 'url') { const u = document.createElement('span'); u.className = 'u'; u.textContent = pretty(it.url); li.append(u); }
    li.addEventListener('mousedown', (e) => { e.preventDefault(); sel = i; omni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    return li;
  }));
  homie.send('palette-size', INPUT + (items.length ? items.length * ROW + LIST_PAD : 0));
}
function paintSel() { [...suggest.children].forEach((li, i) => li.classList.toggle('sel', i === sel)); if (sel >= 0 && mode !== 'pin' && items[sel].kind !== 'tab' && items[sel].kind !== 'search') omni.value = items[sel].url; }
function pretty(u) { return u ? u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '') : ''; }
