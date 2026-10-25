// The Settings page: reads main's settingsData and sends each change back as it is made. Shared settings land
// in bookmarks.yml, so an edit there (or on another Mac) comes back here as a fresh 'settings'.
const $ = (s) => document.querySelector(s);
let D = null;
const DEFAULT_TINT = matchMedia('(prefers-color-scheme: dark)').matches ? ['#0d0d1f', '#0d0d1f'] : ['#ece8f1', '#e6e0ec'];
const send = (key, value) => homie.send('settings-set', key, value);

function value(key) {
  if (key in D.settings) return D.settings[key];
  return { sidebar_mode: D.sidebarMode, ask: D.ask, agents: D.agents, open_at_login: D.openAtLogin }[key];
}

function render() {
  for (const seg of document.querySelectorAll('.seg')) for (const b of seg.children) b.classList.toggle('on', b.value === value(seg.dataset.key));
  for (const c of document.querySelectorAll('.switch input')) c.checked = !!value(c.dataset.key);
  const login = $('[data-key=open_at_login]'); login.disabled = !D.packaged;
  $('#loginNote').textContent = D.packaged ? 'Start Homie when you log in.' : 'Only the installed Homie can open at login.';
  const t = D.tint ? D.tint.split(/\s+/) : DEFAULT_TINT;
  $('#tintTop').value = t[0]; $('#tintBottom').value = t[1] || t[0];
  $('.tint').classList.toggle('default', !D.tint);
  $('#path').textContent = D.path.replace(/^\/Users\/[^/]+/, '~');
}

for (const seg of document.querySelectorAll('.seg')) seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(seg.dataset.key, b.value); });
for (const c of document.querySelectorAll('.switch input')) c.addEventListener('change', () => send(c.dataset.key, c.checked));
const tint = () => { const a = $('#tintTop').value, b = $('#tintBottom').value; send('tint', a === b ? a : `${a} ${b}`); };
$('#tintTop').addEventListener('change', tint); $('#tintBottom').addEventListener('change', tint);
$('#tintReset').addEventListener('click', () => send('tint', ''));
$('#defaultBrowser').addEventListener('click', () => send('default_browser', true));
$('#file').addEventListener('click', () => homie.send('settings-file'));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') homie.send('settings-close'); });   // back to the tab you came from

homie.on('settings', (d) => { D = d; render(); });
homie.invoke('settings-get').then((d) => { if (d) { D = d; render(); } });
