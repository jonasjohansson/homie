// The floating command bar: Cmd+T (new tab), Cmd+L (edit address), Cmd+F (find), Cmd+J (ask Claude about
// the page), Cmd+D on a Today tab (pick a group), 'folder' (name a new folder), 'edit-url' (a pinned tab's URL).
// Sized by main to fit its rows, or the answer.
const omni = document.getElementById('omni'), suggest = document.getElementById('suggest'), answer = document.getElementById('answer');
let history = [], asking = false, current = null;   // ask mode: this bar's questions and answers
let S = { groups: [], url: '' };
let mode = 'url', pinTarget = null, arg = null, items = [], sel = -1, timer = null;
const INPUT = 48, ROW = 36, LIST_PAD = 9;

homie.on('state', (s) => { S = s; });
homie.on('open', (m, a) => {
  mode = m; arg = a; pinTarget = m === 'pin' ? a : null;
  document.body.className = m;
  history = []; asking = false; current = null; answer.replaceChildren(); answer.hidden = true;
  omni.placeholder = { ask: `Ask ${modelName(S.askModel)} about this page`, find: 'Find in page', pin: 'Pin to folder', new: 'Search or enter address', folder: 'Folder name', 'edit-url': 'Pinned address', icon: 'An emoji for the folder (empty removes it)', split: 'Search or enter address for the new pane' }[m] || 'Edit address';
  const pinned = m === 'edit-url' ? S.groups.flatMap((g) => g.tabs).find((t) => t.id === a) : null;
  omni.value = m === 'url' ? S.url : m === 'edit-url' ? (pinned?.pinnedUrl || '') : m === 'icon' ? (S.groups.find((g) => g.name === a)?.icon || '') : '';
  showItems(m === 'pin' ? S.groups.map((g) => ({ kind: 'group', title: g.name })) : []);
  omni.focus(); omni.select();
});
homie.on('ask-text', (text) => { if (current) { current.a.className = 'a'; current.a.innerHTML = md(text); fit(); } });
homie.on('ask-done', (text) => { if (!current) return; current.a.className = 'a'; current.a.innerHTML = md(text); history.push({ q: current.q, a: text }); current = null; asking = false; omni.placeholder = 'Ask a follow-up'; fit(); });
homie.on('ask-error', (msg) => { if (!current) return; current.a.className = 'a err'; current.a.textContent = msg; current = null; asking = false; fit(); });
homie.on('find-step', (dir) => { if (mode === 'find' && omni.value) homie.send('find', omni.value, dir > 0, false); });

function close() {
  if (mode === 'find') homie.send('find-stop');
  if (mode === 'ask' && asking) homie.send('ask-cancel');
  items = []; sel = -1; suggest.replaceChildren();
  homie.send('palette-close');
}

omni.addEventListener('input', () => {
  if (mode === 'find') { homie.send('find', omni.value, true, true); return; }
  if (mode === 'folder' || mode === 'edit-url' || mode === 'icon') return;
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
  if (mode === 'ask') {
    const q = omni.value.trim(); if (!q || asking) return;
    const row = document.createElement('div'); row.className = 'q'; row.textContent = q;
    const a = document.createElement('div'); a.className = 'a wait'; a.textContent = 'Reading the page…';
    answer.append(row, a); answer.hidden = false;
    current = { q, a }; asking = true; omni.value = ''; fit();
    homie.send('ask', arg, q, history);
    return;
  }
  if (mode === 'pin') { const name = (sel >= 0 ? items[sel].title : omni.value).trim(); if (name && pinTarget != null) homie.send('pin-new-group', pinTarget, name); close(); return; }
  if (mode === 'folder') { const name = omni.value.trim(); if (name) homie.send('new-group', name, arg); close(); return; }
  if (mode === 'icon') { homie.send('group-icon', arg, omni.value.trim()); close(); return; }
  if (mode === 'edit-url') { const u = omni.value.trim(); if (u) homie.send('set-url', arg, u); close(); return; }
  const it = sel >= 0 ? items[sel] : null;
  if (it?.kind === 'tab') homie.send(mode === 'split' ? 'split-with' : 'activate', it.id);
  else if (omni.value.trim() || it) homie.send('navigate', it ? it.url : omni.value, { newTab: mode === 'new' || e.metaKey, split: mode === 'split' });
  close();
});
omni.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== omni && mode !== 'find' && mode !== 'ask') close(); }, 150));   // ask: main puts it away on a click elsewhere
answer.addEventListener('click', (e) => { const u = e.target.closest('.link')?.dataset.url; if (u) { homie.send('navigate', u, { newTab: true }); close(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement !== omni) { e.preventDefault(); close(); } });

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
// the bar grows with the answer, up to what main allows; the answer scrolls past that
function fit() { homie.send('palette-size', INPUT + (answer.hidden ? 0 : Math.min(answer.scrollHeight + 1, 552))); answer.scrollTop = answer.scrollHeight; }
function modelName(m) { m = String(m || 'sonnet'); return /^(sonnet|haiku|opus)$/i.test(m) ? m[0].toUpperCase() + m.slice(1).toLowerCase() : m; }

// enough Markdown for an answer: paragraphs, lists, code, bold, links. Everything is escaped first.
function md(src) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<span class="link" data-url="$2">$1</span>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, '$1<span class="link" data-url="$2">$2</span>');   // a full stop after an address is not part of it
  const LIST = /^\s*([-*•]|\d+[.)])\s+/;
  return src.split('```').map((part, i) => {
    if (i % 2) return `<pre>${esc(part.replace(/^[\w-]*\n/, '').replace(/\n$/, ''))}</pre>`;
    return part.split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').filter((l) => l.trim());
      if (!lines.length) return '';
      if (lines.every((l) => LIST.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(LIST, ''))}</li>`).join('')}</ul>`;
      return `<p>${lines.map((l) => inline(l.replace(/^#+\s*/, ''))).join('<br>')}</p>`;
    }).join('');
  }).join('');
}
function pretty(u) { return u ? u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '') : ''; }
