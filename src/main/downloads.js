// Downloads land in ~/Downloads without a dialog and show in the sidebar footer.
import { app, Notification, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let nextId = 1;

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let i = 2; ; i++) { p = path.join(dir, `${base} ${i}${ext}`); if (!fs.existsSync(p)) return p; }
}

export function setupDownloads(ses, mgr) {
  ses.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    const savePath = uniquePath(dir, item.getFilename());
    item.setSavePath(savePath);
    const d = { id: nextId++, name: path.basename(savePath), path: savePath, received: 0, total: item.getTotalBytes(), state: 'progressing', item };
    mgr.downloads.push(d);
    mgr.push();
    item.on('updated', (_ev, st) => { d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.state = st === 'interrupted' ? 'interrupted' : 'progressing'; mgr.push(); });
    item.once('done', (_ev, st) => {
      d.state = st; d.received = item.getReceivedBytes(); d.item = null;
      mgr.push();
      if (st === 'completed') {
        if (process.platform === 'darwin') app.dock?.downloadFinished(savePath);
        const n = new Notification({ title: 'Downloaded', body: d.name, silent: true });
        n.on('click', () => shell.showItemInFolder(savePath));
        n.show();
      }
    });
  });
}
