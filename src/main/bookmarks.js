// The shared sidebar: ~/Library/Application Support/Homie/bookmarks.yml, which
// skynet/config/install.sh links to skynet/config/homie/bookmarks.yml on every Mac.
// Read with the yaml Document API and written back through it, so comments and
// order survive a toggle. The watcher looks at the real file's directory: editors
// save by rename and git replaces the file on pull, so the directory is what changes.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const STARTER = `# Homie — the pinned sidebar. Per tab: url (required), label, muted, badge (default true).
# tint: "#2a2335"   # optional window colour
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
        if (!label) { try { label = new URL(t.url).hostname.replace(/^www\./, ''); } catch { label = t.url; } }
        tabs.push({ url: String(t.url), label: String(label), muted: !!t.muted, badge: t.badge !== false });
      }
      groups.push({ name: String(g.name || ''), tabs });
    }
    this.groups = groups;
    this.tint = typeof doc.tint === 'string' && /^#[0-9a-f]{6}$/i.test(doc.tint) ? doc.tint : '';
    return true;
  }

  watch() {
    const dir = path.dirname(this.realPath);
    const base = path.basename(this.realPath);
    let timer = null;
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => { if (this.read()) this.onChange(); }, 250); };
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
    fs.writeFileSync(this.path, doc.toString({ lineWidth: 0 }));
    if (this.read()) this.onChange();
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

  replaceUrl(oldUrl, newUrl) {
    this.edit((doc) => {
      const hit = this.findTab(doc, oldUrl);
      if (!hit) return false;
      hit.tab.set('url', newUrl);
    });
  }
}
