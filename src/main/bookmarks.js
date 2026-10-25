// The shared sidebar: ~/Library/Application Support/Homie/bookmarks.yml, which
// skynet/config/install.sh links to skynet/config/homie/bookmarks.yml on every Mac.
// Read with the yaml Document API and written back through it, so comments and
// order survive a toggle. The watcher looks at the real file's directory: editors
// save by rename and git replaces the file on pull, so the directory is what changes.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// The Settings page's shared settings, under settings: in this file; a key left out is its default.
// Timings are words, not milliseconds: TIMINGS says what each word means.
export const SETTINGS = {
  switch: 'instant',         // the sidebar changing style (Cmd+S)
  reveal: 'normal',          // the hidden sidebar sliding in at the window's left edge
  reveal_wait: 'none',       // the pointer resting at that edge before it does
  downloads_wait: 'normal',  // hovering Downloads before the newest files show
  pin_links: 'subtab',       // a link leaving a pinned site opens as a 'subtab' under the pin, or a 'today' tab
};
export const TIMINGS = {
  switch: { instant: 0, fast: 120, normal: 250, slow: 500 },
  reveal: { instant: 0, fast: 120, normal: 250, slow: 500 },
  reveal_wait: { none: 0, short: 150, long: 400 },
  downloads_wait: { none: 0, short: 120, normal: 250, long: 500 },
};
const CHOICES = { ...Object.fromEntries(Object.entries(TIMINGS).map(([k, v]) => [k, Object.keys(v)])), pin_links: ['subtab', 'today'] };
const OLD_MS = { switch: 'switch_ms', reveal: 'reveal_ms', reveal_wait: 'reveal_delay_ms', downloads_wait: 'downloads_delay_ms' };   // 4.10.0 wrote milliseconds
function setting(key, v, old) {
  if (v === undefined && Number.isFinite(old)) return Object.entries(TIMINGS[key]).reduce((a, b) => (Math.abs(b[1] - old) < Math.abs(a[1] - old) ? b : a))[0];   // the nearest word
  return CHOICES[key]?.includes(v) ? v : SETTINGS[key];
}

const STARTER = `# Homie — the pinned sidebar. Per group: name, icon (an emoji). Per tab: url (required), label, muted, badge (default true).
# A url of terminal:~/some/folder is a shell in that folder; run: types a command there, like run: claude
# react: on a tab is a rule Claude follows when its unread count goes up, shown as a notification
# ask: haiku                # the model for Cmd+J and react (sonnet when left out)
# tint: "#0d0d1f #170e1f"   # optional window colour, one or two (top bottom)
# agents: true              # let agents on this Mac see and drive the tabs (MCP on 127.0.0.1, see the README)
groups:
  - name: Homie
    tabs:
      - url: https://calendar.google.com/calendar/u/0/r
        label: Calendar
      - url: https://mail.google.com/mail/
        label: Gmail
`;

export class Bookmarks {
  constructor(onChange) {
    this.path = path.join(app.getPath('userData'), 'bookmarks.yml');
    this.onChange = onChange;
    this.groups = [];
    this.tint = '';
    this.agents = false;
    this.ask = '';
    this.settings = { ...SETTINGS };
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, STARTER);
    }
    this.read();
    this.watch();
  }

  get realPath() { try { return fs.realpathSync(this.path); } catch { return this.path; } }

  read() {
    let doc;
    try { doc = YAML.parse(fs.readFileSync(this.path, 'utf8')) || {}; } catch (e) { console.error('bookmarks.yml:', e.message); return false; }
    const groups = [];
    for (const g of doc.groups || []) {
      const tabs = [];
      for (const t of g.tabs || []) {
        if (!t || !t.url) continue;
        let label = t.label;
        if (!label && /^terminal:/i.test(t.url)) label = 'Terminal';
        if (!label) { try { label = new URL(t.url).hostname.replace(/^www\./, ''); } catch { label = t.url; } }
        tabs.push({ url: String(t.url), label: String(label), muted: !!t.muted, badge: t.badge !== false, run: typeof t.run === 'string' ? t.run : '', react: typeof t.react === 'string' ? t.react.trim().slice(0, 500) : '' });
      }
      groups.push({ name: String(g.name || ''), icon: typeof g.icon === 'string' ? g.icon.trim().slice(0, 4) : '', tabs });
    }
    this.groups = groups;
    this.agents = doc.agents === true;
    this.ask = typeof doc.ask === 'string' && /^[a-z0-9][\w.-]*$/i.test(doc.ask.trim()) ? doc.ask.trim() : '';   // a model name for claude --model, never a flag
    const s = doc.settings && typeof doc.settings === 'object' ? doc.settings : {};
    this.settings = Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, setting(k, s[k], s[OLD_MS[k]])]));
    this.tint = typeof doc.tint === 'string' && /^#[0-9a-f]{6}(\s+#[0-9a-f]{6})?$/i.test(doc.tint.trim()) ? doc.tint.trim() : '';   // one colour, or two for a top-to-bottom gradient
    return true;
  }

  watch() {
    const dir = path.dirname(this.realPath);
    const base = path.basename(this.realPath);
    let timer = null;
    const kick = () => { if (Date.now() < (this.ownWriteUntil || 0)) return; clearTimeout(timer); timer = setTimeout(() => { if (this.read()) this.onChange(); }, 250); };   // an own write already synced
    try {
      this.watcher = fs.watch(dir, (ev, name) => { if (!name || name === base || name === path.basename(this.path)) kick(); });
    } catch (e) { console.error('watch:', e.message); }
    // belt and braces for network and linked paths
    fs.watchFile(this.realPath, { interval: 5000 }, kick);
  }

  // --- edits, by text so comments and order survive --------------------------------
  edit(fn) {
    const doc = YAML.parseDocument(fs.readFileSync(this.path, 'utf8'));
    if (!doc.has('groups')) doc.set('groups', doc.createNode([]));
    const changed = fn(doc);
    if (changed === false) return;
    this.ownWriteUntil = Date.now() + 1500;
    fs.writeFileSync(this.path, doc.toString({ lineWidth: 0 }));
    if (this.read()) this.onChange();
  }

  // a shared setting from the Settings page: written under settings:, or dropped when it is the default
  setSetting(key, value) {
    if (!(key in SETTINGS)) return;
    const v = setting(key, value);
    this.edit((doc) => {
      const block = doc.get('settings');
      if (!YAML.isMap(block)) { if (v === SETTINGS[key]) return false; doc.set('settings', doc.createNode({ [key]: v })); return; }   // no settings: block yet (deleteIn would throw)
      if (OLD_MS[key]) block.delete(OLD_MS[key]);   // the word replaces 4.10.0's milliseconds
      if (v === SETTINGS[key]) block.delete(key); else block.set(key, v);
      if (!block.items.length) doc.delete('settings');
    });
  }
  // a top-level key the page writes (tint, ask, agents); empty or false leaves it out
  setTop(key, value) {
    this.edit((doc) => { if (value === '' || value === false || value == null) { if (!doc.has(key)) return false; doc.delete(key); } else doc.set(key, value); });
  }

  findTab(doc, url) {
    for (const g of doc.get('groups').items) {
      const tabs = g.get('tabs');
      if (!tabs) continue;
      for (const t of tabs.items) if (t.get('url') === url) return { group: g, tabs, tab: t };
    }
    return null;
  }

  setField(url, key, value, dflt) {
    this.edit((doc) => {
      const hit = this.findTab(doc, url);
      if (!hit) return false;
      if (value === dflt) hit.tab.delete(key); else hit.tab.set(key, value);
    });
  }

  add(groupName, url, label) {
    this.edit((doc) => {
      const groups = doc.get('groups');
      let g = groups.items.find((x) => x.get('name') === groupName);
      if (!g) { g = doc.createNode({ name: groupName, tabs: [] }); groups.add(g); }
      if (!g.has('tabs')) g.set('tabs', doc.createNode([]));
      const node = doc.createNode(label ? { url, label } : { url });
      g.get('tabs').add(node);
    });
  }

  remove(url) {
    this.edit((doc) => {
      const hit = this.findTab(doc, url);
      if (!hit) return false;
      hit.tabs.items.splice(hit.tabs.items.indexOf(hit.tab), 1);
    });
  }

  // --- order and folders: the sidebar's drag and drop and folder menus end up here --------
  group(doc, name, create = false) {
    const groups = doc.get('groups');
    let g = groups.items.find((x) => x.get('name') === name);
    if (!g && create) { g = doc.createNode({ name, tabs: [] }); groups.add(g); }
    if (g && !g.has('tabs')) g.set('tabs', doc.createNode([]));
    if (g) g.get('tabs').flow = false;   // an empty seq is created in flow style; keep the file block-styled
    return g;
  }

  // put a tab (pinned or not yet) into groupName at index; index past the end appends
  place(url, label, groupName, index) {
    this.edit((doc) => {
      const hit = this.findTab(doc, url);
      let node = hit ? hit.tab : doc.createNode(label ? { url, label } : { url });
      if (hit) hit.tabs.items.splice(hit.tabs.items.indexOf(hit.tab), 1);
      const tabs = this.group(doc, groupName, true).get('tabs');
      node.flow = false;
      tabs.items.splice(Math.max(0, Math.min(index ?? tabs.items.length, tabs.items.length)), 0, node);
    });
  }

  addGroup(name, index) {
    this.edit((doc) => {
      if (this.group(doc, name)) return false;
      const groups = doc.get('groups');
      groups.items.splice(Math.max(0, Math.min(index ?? groups.items.length, groups.items.length)), 0, doc.createNode({ name, tabs: [] }));
    });
  }

  setGroupField(name, key, value, dflt) {
    this.edit((doc) => { const g = this.group(doc, name); if (!g) return false; if (value === dflt) g.delete(key); else g.set(key, value); });
  }

  renameGroup(oldName, newName) {
    this.edit((doc) => { const g = this.group(doc, oldName); if (!g || !newName || this.group(doc, newName)) return false; g.set('name', newName); });
  }

  removeGroup(name) {
    this.edit((doc) => { const groups = doc.get('groups'); const g = this.group(doc, name); if (!g) return false; groups.items.splice(groups.items.indexOf(g), 1); });
  }

  moveGroup(name, index) {
    this.edit((doc) => {
      const groups = doc.get('groups'); const g = this.group(doc, name); if (!g) return false;
      groups.items.splice(groups.items.indexOf(g), 1);
      groups.items.splice(Math.max(0, Math.min(index, groups.items.length)), 0, g);
    });
  }

  replaceUrl(oldUrl, newUrl) {
    this.edit((doc) => {
      const hit = this.findTab(doc, oldUrl);
      if (!hit) return false;
      hit.tab.set('url', newUrl);
    });
  }
}
