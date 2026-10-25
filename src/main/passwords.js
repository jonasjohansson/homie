// Saved logins, the way Arc does it: imported from the Chrome on this Mac, plus what is saved in
// Homie. Chrome keeps logins in each profile's "Login Data" (SQLite), every password AES-encrypted
// with a key derived from the Keychain item "Chrome Safe Storage". Homie keeps its copy, and that
// derived key, in one file in userData encrypted with safeStorage (Homie's own Keychain item).
// A page only ever learns the logins for its own https origin, and only through its top frame.
import { app, safeStorage, ipcMain, dialog } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CHROME = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const OFFER_MS = 2 * 60 * 1000;   // a submitted login is offered for saving this long after the submit
const file = () => path.join(app.getPath('userData'), 'passwords.bin');
const key = (l) => l.realm + '\n' + l.username;
// Chrome's timestamps are microseconds since 1601
const chromeTime = (us) => (Number(us) ? Math.round(Number(us) / 1000 - 11644473600000) : 0);

// a top frame's realm as Chrome writes it ("https://host/"), or null: only https pages get logins
function realmOf(frameUrl) {
  try { const u = new URL(frameUrl); return u.protocol === 'https:' ? u.origin + '/' : null; } catch { return null; }
}

// The registrable part of a host ("site.com", "site.co.uk"), for logins saved on another part of a
// site (www., login.). None on a shared hosting suffix, whose subdomains belong to different people,
// nor for an IP address. No public suffix list in Electron, so the common shapes only.
const SLD = /^(co|com|org|net|ac|gov|edu|ne|or)\.[a-z]{2}$/;
const SHARED = /(^|\.)(github\.io|gitlab\.io|herokuapp\.com|vercel\.app|netlify\.app|pages\.dev|workers\.dev|web\.app|firebaseapp\.com|appspot\.com|azurewebsites\.net|cloudfront\.net|amazonaws\.com|blogspot\.com|wordpress\.com|myshopify\.com|glitch\.me|onrender\.com|fly\.dev|ngrok\.io|ngrok-free\.app|wixsite\.com|squarespace\.com|webflow\.io|framer\.website|notion\.site|carrd\.co|replit\.app|repl\.co|surge\.sh|neocities\.org)$/;
function siteOf(realm) {
  const host = realm.slice(8, -1).replace(/:\d+$/, '');
  if (SHARED.test(host) || /^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  const parts = host.split('.');
  const n = SLD.test(parts.slice(-2).join('.')) ? 3 : 2;
  return parts.length >= n ? parts.slice(-n).join('.') : null;
}

function decrypt(buf, aes) {
  if (buf.subarray(0, 3).toString() !== 'v10') throw new Error('not a v10 password');
  const d = crypto.createDecipheriv('aes-128-cbc', aes, Buffer.alloc(16, ' '));
  return Buffer.concat([d.update(buf.subarray(3)), d.final()]).toString('utf8');
}

// macOS asks whether `security` may read Chrome's item; "Allow" is enough, as the derived key is kept
function chromeKey() {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'], { timeout: 120000 }, (err, out) => {
      if (err) reject(new Error('Chrome Safe Storage was not shared from the Keychain'));
      else resolve(crypto.pbkdf2Sync(out.trim(), 'saltysalt', 1003, 16, 'sha1'));
    });
  });
}

// every saved https login in every Chrome profile, still encrypted. Read from a copy, as Chrome may hold the file.
function readChrome() {
  const rows = [];
  let dirs = [];
  try { dirs = fs.readdirSync(CHROME).filter((d) => d === 'Default' || /^Profile \d+$/.test(d)); } catch { return rows; }
  const tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'homie-logins-'));
  try {
    for (const d of dirs) for (const name of ['Login Data', 'Login Data For Account']) {
      const src = path.join(CHROME, d, name);
      if (!fs.existsSync(src)) continue;
      const copy = path.join(tmp, 'logins.db');
      fs.copyFileSync(src, copy);
      const db = new DatabaseSync(copy, { readOnly: true });
      try {
        const q = db.prepare('SELECT * FROM logins WHERE blacklisted_by_user = 0');
        q.setReadBigInts(true);   // Chrome's timestamps pass 2^53
        for (const r of q.all()) {
          const realm = String(r.signon_realm || '');
          if (!/^https:\/\/[^/]+\/$/.test(realm) || !r.password_value?.length) continue;
          rows.push({ realm, username: String(r.username_value || ''), enc: Buffer.from(r.password_value), t: chromeTime(r.date_password_modified) || chromeTime(r.date_created) });
        }
      } finally { db.close(); fs.rmSync(copy, { force: true }); }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return rows;
}

export class Passwords {
  constructor(ses) {
    this.ses = ses;
    this.store = null;         // { logins: [{ realm, username, password, t, from }], never: [realm], chromeKey }
    this.loading = null;
    this.writing = Promise.resolve();
    this.lastUser = new Map(); // webContents id -> Map(realm -> username), for sign-ins split over two pages
    this.pending = new Map();  // webContents id -> { realm, username, password, update, until }
  }

  load() {
    return (this.loading ||= (async () => {
      const store = { logins: [], never: [], chromeKey: null };
      try {
        if (fs.existsSync(file()) && await safeStorage.isAsyncEncryptionAvailable()) {
          const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(fs.readFileSync(file()));
          Object.assign(store, JSON.parse(result));
          if (shouldReEncrypt) this.save();
        }
      } catch (e) { console.error('passwords.bin unreadable:', e.message); }
      return (this.store = store);
    })());
  }

  // writes queue behind each other, so an older snapshot never lands after a newer one
  save() {
    this.writing = this.writing.then(async () => {
      if (!this.store || !await safeStorage.isAsyncEncryptionAvailable()) return;   // never written in the clear
      const f = file();
      fs.writeFileSync(f + '.tmp', await safeStorage.encryptStringAsync(JSON.stringify(this.store)), { mode: 0o600 });
      fs.renameSync(f + '.tmp', f);
    }).catch((e) => console.error('passwords.bin:', e.message));
    return this.writing;
  }

  // Copy Chrome's logins in. Silent at launch with the derived key from an earlier import; from the
  // menu, a missing or stale key is asked for again. Logins saved in Homie win when they are newer.
  async importFromChrome({ ask = false } = {}) {
    const store = await this.load();
    const rows = readChrome();
    if (!rows.length) return 0;
    const tryKey = (aes) => {
      let ok = 0;
      const out = rows.map((r) => { try { const password = decrypt(r.enc, aes); ok++; return { realm: r.realm, username: r.username, password, t: r.t, from: 'chrome' }; } catch { return null; } });
      return ok >= rows.length / 2 ? out.filter(Boolean) : null;   // a wrong key fails nearly every row
    };
    let aes = store.chromeKey ? Buffer.from(store.chromeKey, 'base64') : null;
    let imported = aes && tryKey(aes);
    if (!imported) {
      if (!ask) return 0;
      aes = await chromeKey();
      imported = tryKey(aes);
      if (!imported) throw new Error('Chrome\'s passwords could not be decrypted with its Keychain key');
      store.chromeKey = aes.toString('base64');
    }
    const byKey = new Map(store.logins.filter((l) => l.from !== 'chrome').map((l) => [key(l), l]));   // a login deleted in Chrome goes here too
    for (const l of imported) { const cur = byKey.get(key(l)); if (!cur || l.t > cur.t) byKey.set(key(l), l); }
    store.logins = [...byKey.values()];
    this.save();
    return imported.length;
  }

  async importFromMenu(win) {
    try {
      const n = await this.importFromChrome({ ask: true });
      dialog.showMessageBox(win, { message: n ? `Imported ${n.toLocaleString('en')} passwords from Chrome.` : 'Chrome has no saved passwords on this Mac.', detail: n ? 'Homie fills them on the sites they were saved for, and imports again each time it starts.' : '' });
    } catch (e) {
      dialog.showMessageBox(win, { type: 'warning', message: 'Passwords were not imported.', detail: e.message });
    }
  }

  async loginsFor(realm) { return (await this.load()).logins.filter((l) => l.realm === realm).sort((a, b) => b.t - a.t); }

  // logins saved on other parts of the same site, newest first
  async relatedTo(realm) {
    const site = siteOf(realm);
    return site ? (await this.load()).logins.filter((l) => l.realm !== realm && siteOf(l.realm) === site).sort((a, b) => b.t - a.t) : [];
  }

  // the realm a page message speaks for: its top frame, in the page session, over https
  realmFor(e) {
    if (e.sender.session !== this.ses || !e.senderFrame || e.senderFrame !== e.sender.mainFrame) return null;
    return realmOf(e.senderFrame.url);
  }

  rememberUser(wc, realm, username) {
    if (!username) return;
    if (!this.lastUser.has(wc.id)) { this.lastUser.set(wc.id, new Map()); wc.once('destroyed', () => { this.lastUser.delete(wc.id); this.pending.delete(wc.id); }); }
    this.lastUser.get(wc.id).set(realm, username);
  }

  offer(wc) {
    const p = this.pending.get(wc.id);
    if (!p || wc.isDestroyed()) return;
    if (Date.now() > p.until) { this.pending.delete(wc.id); return; }
    if (realmOf(wc.mainFrame.url) == null || wc.isLoading()) return;   // the next page's pw-ready delivers it
    p.offered = true;
    wc.send('homie:pw-offer', { username: p.username, site: new URL(p.realm).hostname, update: p.update });
  }

  wireIpc() {
    ipcMain.handle('homie:pw-logins', async (e) => {
      const realm = this.realmFor(e);
      if (!realm) return { users: [], related: [], last: null };
      const related = (await this.relatedTo(realm)).slice(0, 6).map((l) => ({ username: l.username, site: l.realm.slice(8, -1) }));
      return { users: (await this.loginsFor(realm)).map((l) => l.username), related, last: this.lastUser.get(e.sender.id)?.get(realm) || null };
    });
    ipcMain.handle('homie:pw-fill', async (e, username, site) => {
      const realm = this.realmFor(e);
      if (!realm) return null;
      const from = site ? (await this.relatedTo(realm)).filter((x) => x.realm === `https://${site}/`) : await this.loginsFor(realm);
      const l = from.find((x) => x.username === String(username ?? ''));
      if (!l) return null;
      this.rememberUser(e.sender, realm, l.username);
      return l.password;
    });
    // a username-only first page ("Next", then the password on the following page)
    ipcMain.on('homie:pw-user', (e, username) => { const realm = this.realmFor(e); if (realm) this.rememberUser(e.sender, realm, String(username || '').slice(0, 500)); });
    ipcMain.on('homie:pw-submit', async (e, d) => {
      const realm = this.realmFor(e);
      const password = String(d?.password || '');
      if (!realm || !password || password.length > 1000) return;
      let username = String(d?.username || '').slice(0, 500);
      if (!username) username = this.lastUser.get(e.sender.id)?.get(realm) || '';
      this.rememberUser(e.sender, realm, username);
      if ((await this.load()).never.includes(realm)) return;
      const cur = (await this.loginsFor(realm)).find((l) => l.username === username);
      if (cur?.password === password) return;
      this.pending.set(e.sender.id, { realm, username, password, update: !!cur, until: Date.now() + OFFER_MS });
      setTimeout(() => this.offer(e.sender), 1200);   // after the submit's navigation, if there is one
    });
    ipcMain.on('homie:pw-ready', (e) => { if (e.sender.session === this.ses && !this.pending.get(e.sender.id)?.offered) this.offer(e.sender); });
    ipcMain.on('homie:pw-answer', async (e, answer) => {
      const p = this.pending.get(e.sender.id);
      if (!p?.offered) return;
      this.pending.delete(e.sender.id);
      const store = await this.load();
      if (answer === 'save') {
        store.logins = store.logins.filter((l) => key(l) !== key(p));
        store.logins.push({ realm: p.realm, username: p.username, password: p.password, t: Date.now(), from: 'homie' });
        this.save();
      } else if (answer === 'never' && !store.never.includes(p.realm)) {
        store.never.push(p.realm);
        this.save();
      }
    });
  }
}
