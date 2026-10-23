// Downloads land in ~/Downloads without a dialog. The list lives in
// Application Support/Homie/downloads.json and is shown on the Downloads page
// (Cmd+Shift+J), where each row can be dragged out as a real file.
import { app, Notification, shell, ipcMain, clipboard } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const CAP = 300;
const file = () => path.join(app.getPath('userData'), 'downloads.json');
const items = new Map();   // id -> DownloadItem while progressing
const icons = new Map();   // path -> data URL

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let i = 2; ; i++) { p = path.join(dir, `${base} ${i}${ext}`); if (!fs.existsSync(p)) return p; }
}

export class Downloads {
  constructor(mgr) {
    this.mgr = mgr;
    this.rows = [];
    try { this.rows = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch {}
    for (const r of this.rows) if (r.state === 'progressing') r.state = 'interrupted';
    this.nextId = this.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    this.timer = null;
  }

  save() { clearTimeout(this.timer); this.timer = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(this.rows)); } catch {} }, 500); }

  changed() { this.save(); this.mgr.push(); this.pushPage(); }

  async pushPage() {
    const wc = this.mgr.downloadsTab?.wc; if (!wc || wc.isDestroyed()) return;
    const rows = await Promise.all(this.rows.map(async (r) => ({ ...r, exists: r.state === 'completed' ? fs.existsSync(r.path) : true, icon: await this.icon(r) })));
    wc.send('downloads', rows);
  }

  async icon(r) {
    if (r.state !== 'completed' || !fs.existsSync(r.path)) return '';
    if (icons.has(r.path)) return icons.get(r.path);
    try { const img = await app.getFileIcon(r.path, { size: 'normal' }); const url = img.toDataURL(); icons.set(r.path, url); return url; } catch { return ''; }
  }

  summary() {
    const active = this.rows.filter((r) => r.state === 'progressing');
    return { active: active.length, received: active.reduce((n, r) => n + r.received, 0), total: active.reduce((n, r) => n + (r.total || 0), 0), last: this.rows.at(-1)?.name || '', count: this.rows.length };
  }

  attach(ses) {
    ses.on('will-download', (_e, item, wc) => {
      const savePath = uniquePath(app.getPath('downloads'), item.getFilename());
      item.setSavePath(savePath);
      const row = { id: this.nextId++, name: path.basename(savePath), path: savePath, url: item.getURL(), received: 0, total: item.getTotalBytes(), state: 'progressing', time: Date.now() };
      this.rows.push(row); if (this.rows.length > CAP) this.rows.splice(0, this.rows.length - CAP);
      items.set(row.id, item);
      this.changed();
      // a tab opened only to fetch this file has no page: close it, as Chrome does
      const tab = wc && [...this.mgr.tabs.values()].find((t) => t.wc === wc);
      if (tab?.kind === 'today' && !wc.getURL()) setTimeout(() => this.mgr.close(tab.id), 100);
      item.on('updated', (_ev, st) => { row.received = item.getReceivedBytes(); row.total = item.getTotalBytes(); row.state = st === 'interrupted' ? 'interrupted' : 'progressing'; this.mgr.push(); this.pushPage(); });
      item.once('done', (_ev, st) => {
        row.state = st; row.received = item.getReceivedBytes(); row.total = item.getTotalBytes() || row.received; items.delete(row.id);
        this.changed();
        if (st === 'completed') {
          if (process.platform === 'darwin') app.dock?.downloadFinished(savePath);
          const n = new Notification({ title: 'Downloaded', body: row.name, silent: true });
          n.on('click', () => this.mgr.showDownloads());
          n.show();
        }
      });
    });
  }

  async act(what, id, sender) {
    const r = this.rows.find((x) => x.id === id);
    if (what === 'refresh') return this.pushPage();
    if (what === 'clear') { for (const it of items.values()) it.cancel(); this.rows = []; icons.clear(); return this.changed(); }
    if (what === 'folder') return shell.openPath(app.getPath('downloads'));
    if (!r) return;
    if (what === 'open') shell.openPath(r.path);
    else if (what === 'reveal') shell.showItemInFolder(r.path);
    else if (what === 'cancel') items.get(id)?.cancel();
    else if (what === 'remove') { this.rows = this.rows.filter((x) => x !== r); this.changed(); }
    else if (what === 'trash') { try { await shell.trashItem(r.path); } catch {} this.rows = this.rows.filter((x) => x !== r); this.changed(); }
    else if (what === 'copy-url') clipboard.writeText(r.url);
    else if (what === 'drag' && sender) {
      if (r.state !== 'completed' || !fs.existsSync(r.path)) return;
      let icon; try { icon = await app.getFileIcon(r.path, { size: 'normal' }); } catch {}
      sender.startDrag({ file: r.path, icon });
    }
  }

  wireIpc() {
    const fromUI = (e) => e.sender === this.mgr.downloadsTab?.wc || e.sender === this.mgr.sidebar?.webContents;
    ipcMain.on('dl', (e, what, id) => { if (fromUI(e)) this.act(what, id, e.sender); });
    ipcMain.on('dl-context', (e, id, x, y) => {
      if (e.sender !== this.mgr.downloadsTab?.wc) return;
      const r = this.rows.find((v) => v.id === id); if (!r) return;
      this.mgr.downloadContextMenu(r, x, y, (what) => this.act(what, id, e.sender));
    });
  }
}
