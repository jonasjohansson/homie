// Tabs and layout. One BrowserWindow, a sidebar WebContentsView on the left and one
// WebContentsView per tab on the right; only the active tab's view is visible.
// Pinned tabs come from bookmarks.yml and are keyed by their pinned URL; Today tabs
// are everything else and live in state.json between launches, unloaded until clicked.
import { app, BrowserWindow, WebContentsView, Menu, Notification, clipboard, shell, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { state, saveState } from './state.js';
import { recordVisit, updateTitle, searchHistory } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PRELOAD = path.join(__dirname, '..', 'preload', 'page.cjs');
const SIDEBAR_PRELOAD = path.join(__dirname, '..', 'preload', 'sidebar.cjs');
const SIDEBAR_MIN = 180, SIDEBAR_MAX = 480;
// Arc's geometry, measured 2026-10-23: card margins 10, toolbar 32 inside the card, radius 12
const TOOLBAR = 32, MARGIN = 10, RADIUS = 12;
const PALETTE_W = 640;
const SIDEBAR_MS = 90;   // Arc: the card edge settles in 60 to 90 ms with an ease-out
const STAGGER_MS = 600;

// Installed in the page's main world after dom-ready (executeJavaScript is not
// subject to the site's CSP). Replaces Notification so a click brings the tab forward;
// the preload hears the postMessage in its isolated world and forwards it to main.
const NOTIFICATION_SHIM = `(function () {
  if (window.__homieNotifications) return; window.__homieNotifications = true;
  class HomieNotification extends EventTarget {
    constructor(title, options) {
      super(); const o = options || {};
      this.title = String(title); this.body = o.body || ''; this.tag = o.tag || ''; this.icon = o.icon || '';
      this.data = o.data; this.silent = !!o.silent;
      window.postMessage({ __homie: 'notification', title: this.title, body: this.body, tag: this.tag }, '*');
      setTimeout(() => this.dispatchEvent(new Event('show')), 0);
    }
    close() { this.dispatchEvent(new Event('close')); }
    static get permission() { return 'granted'; }
    static requestPermission(cb) { const p = Promise.resolve('granted'); if (cb) p.then(cb); return p; }
    static get maxActions() { return 0; }
  }
  for (const k of ['onclick', 'onshow', 'onerror', 'onclose']) {
    Object.defineProperty(HomieNotification.prototype, k, {
      set(fn) { this['__' + k] = fn; if (fn) this.addEventListener(k.slice(2), fn); },
      get() { return this['__' + k] || null; },
    });
  }
  window.Notification = HomieNotification;
})();`;

let nextId = 1;

export class Tab {
  constructor(mgr, opts) {
    this.mgr = mgr;
    this.id = nextId++;
    this.kind = opts.kind;                 // 'pinned' | 'today'
    this.pinnedUrl = opts.kind === 'pinned' ? opts.url : null;
    this.url = opts.url;
    this.label = opts.label || '';
    this.title = opts.title || opts.label || '';
    this.muted = !!opts.muted;
    this.showsBadge = opts.badge !== false;
    this.favicon = opts.favicon || '';
    this.unread = 0;
    this.loading = false;
    this.view = null;
    this.notifications = new Map();
    this.page = opts.page || null;        // internal pages: a file under src/renderer
  }

  get loaded() { return !!this.view && !this.view.webContents.isDestroyed(); }
  get wc() { return this.view?.webContents; }
  get away() { return this.kind === 'pinned' && this.loaded && !sameSite(this.url, this.pinnedUrl); }

  dto() {
    return { id: this.id, kind: this.kind, url: this.url, label: this.label, title: this.title, favicon: this.favicon,
      unread: this.unread, muted: this.muted, loading: this.loading, loaded: this.loaded, away: this.away };
  }

  load(url = this.url) {
    if (!this.loaded) this.mgr.createView(this);
    if (this.kind === 'internal') this.wc.loadFile(this.page).catch(() => {});
    else this.wc.loadURL(url).catch(() => {});
  }

  unload() {
    if (!this.loaded) return;
    this.mgr.destroyView(this);
    this.unread = 0; this.loading = false;
  }

  titleChanged(t) {
    this.title = t;
    updateTitle(this.url, t);
    let count = 0;
    const m = /\((\d+)\)/.exec(t);
    if (m) count = Number(m[1]);
    else if (/^[*!•●]/.test(t.trim())) count = 1;
    if (!this.showsBadge) count = 0;
    if (count !== this.unread) { this.unread = count; this.mgr.badgesChanged(); }
  }
}

function sameSite(a, b) {
  try { const x = new URL(a), y = new URL(b); return x.host === y.host; } catch { return a === b; }
}

export function resolveInput(text) {
  const t = text.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^localhost:\d/.test(t)) return t;
  if (!/\s/.test(t) && (/^localhost(:\d+)?(\/|$)/.test(t) || /^(\d{1,3}\.){3}\d{1,3}/.test(t) || /^[\w-]+(\.[\w-]+)+/.test(t))) return 'https://' + t;
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);
}

export class TabManager {
  constructor({ bookmarks, extensions }) {
    this.bookmarks = bookmarks;
    this.extensions = extensions;
    this.tabs = new Map();
    this.groups = [];          // [{ name, tabs: [Tab] }]
    this.today = [];           // [Tab]
    this.active = null;
    this.closed = [];          // urls, for Cmd+Shift+T
    this.sidebarHidden = false;
    this.sidebarDragging = false;
    this.downloads = null;         // set by main to the Downloads store
    this.pushTimer = null;
    this.win = null;
  }

  // --- window ---------------------------------------------------------------------
  tintColor() { return (this.bookmarks.tint || '').split(/\s+/)[0] || (nativeTheme.shouldUseDarkColors ? '#0d0d1f' : '#ece8f1'); }

  createWindow() {
    const b = state.bounds || {};
    this.win = new BrowserWindow({
      title: 'Homie', x: b.x, y: b.y, width: b.width || 1280, height: b.height || 860,
      minWidth: 600, minHeight: 300, show: false,
      titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 13, y: 17 },
      backgroundColor: this.tintColor(),
    });
    const ui = { preload: SIDEBAR_PRELOAD, sandbox: false, contextIsolation: true, nodeIntegration: false, partition: 'homie-ui' };
    // the chrome: tint, sidebar and toolbar, full window, under every page
    this.sidebar = new WebContentsView({ webPreferences: ui });
    this.win.contentView.addChildView(this.sidebar);
    this.sidebar.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'sidebar.html'));
    this.sidebar.webContents.on('did-finish-load', () => this.push(true));
    this.sidebar.webContents.on('context-menu', (e) => e.preventDefault());
    this.sidebar.webContents.setWindowOpenHandler(({ url }) => { this.open(url); return { action: 'deny' }; });
    // the command bar: a small view floating over the page, shown on demand
    this.palette = new WebContentsView({ webPreferences: ui });
    this.palette.setBorderRadius?.(RADIUS);
    this.palette.setVisible(false);
    this.paletteHeight = 48;
    this.win.contentView.addChildView(this.palette);
    this.palette.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'palette.html'));
    this.palette.webContents.on('context-menu', (e) => e.preventDefault());

    this.win.on('resize', () => { this.layout(); this.saveBounds(); });
    this.win.on('move', () => this.saveBounds());
    this.win.on('close', (e) => {
      if (!app.quitting) { e.preventDefault(); this.win.hide(); }
    });
    this.win.on('focus', () => this.active?.wc?.focus());
    nativeTheme.on('updated', () => this.win?.setBackgroundColor(this.tintColor()));
    this.layout();
    // ready-to-show never fires: the window's own webContents loads nothing
    const show = () => { if (this.win && !this.win.isVisible()) this.win.show(); };
    this.sidebar.webContents.once('did-finish-load', show);
    setTimeout(show, 1500);
  }

  saveBounds() { if (this.win && !this.win.isFullScreen()) { state.bounds = this.win.getBounds(); saveState(); } }

  layout() {
    if (!this.win) return;
    const [w, h] = this.win.getContentSize();
    const hidden = this.sidebarHidden || !!this.fullscreenTab;
    const sbw = hidden ? 0 : state.sidebarWidth;
    this.sidebar.setBounds({ x: 0, y: 0, width: w, height: h });
    const x = hidden ? MARGIN : sbw, y = MARGIN + TOOLBAR;
    const card = this.fullscreenTab
      ? { x: 0, y: 0, width: w, height: h }
      : { x, y, width: Math.max(0, w - x - MARGIN), height: Math.max(0, h - y - MARGIN) };
    for (const t of this.tabs.values()) {
      if (!t.loaded) continue;
      const on = t === this.active;
      if (on) { t.view.setBounds(card); t.view.setBorderRadius?.(this.fullscreenTab ? 0 : RADIUS); }
      t.view.setVisible(on && !this.sidebarDragging);
    }
    const pw = Math.min(PALETTE_W, card.width - 40);
    this.palette.setBounds({ x: card.x + Math.round((card.width - pw) / 2), y: card.y + Math.round(card.height * 0.33) - 24, width: pw, height: this.paletteHeight });
    return card;
  }

  // Move the active page view to its new card over SIDEBAR_MS, in step with the chrome's CSS
  // transition; the chrome paints the tint under the page, so nothing shows through.
  animateLayout() {
    const view = this.active?.view; if (!view || !this.active.loaded || nativeTheme.prefersReducedMotion) return this.layout();
    const from = view.getBounds();
    const to = this.layout();
    clearInterval(this.animTimer);
    const t0 = Date.now();
    // the same critically damped spring the chrome uses (SwiftUI .default shape), sampled
    const K = [0, .0576, .1805, .3211, .4556, .5734, .6716, .7505, .8126, .8604, .8969, .9243, .9447, .9598, .9709, .979, .9849, .9892, .9923, .9945, .9961, .9972, .998, .9986, 1];
    const ease = (p) => { const i = Math.min(K.length - 2, Math.floor(p * (K.length - 1))); const f = p * (K.length - 1) - i; return K[i] + (K[i + 1] - K[i]) * f; };
    this.animTimer = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / SIDEBAR_MS), e = ease(p);
      view.setBounds({ x: Math.round(from.x + (to.x - from.x) * e), y: to.y, width: Math.round(from.width + (to.width - from.width) * e), height: to.height });
      if (p >= 1) { clearInterval(this.animTimer); this.layout(); }
    }, 8);
  }

  raisePalette() { this.win.contentView.removeChildView(this.palette); this.win.contentView.addChildView(this.palette); }

  showPalette(mode, arg) {
    this.focus();
    this.layout();
    this.palette.setVisible(true);
    this.palette.webContents.send('state', this.snapshot());
    this.palette.webContents.send('open', mode, arg);
    this.palette.webContents.focus();
  }

  hidePalette() { this.palette.setVisible(false); this.active?.wc?.focus(); }

  focus() { if (!this.win) return; if (this.win.isMinimized()) this.win.restore(); this.win.show(); this.win.focus(); }

  // --- views ------------------------------------------------------------------------
  createView(tab) {
    const internal = tab.kind === 'internal';
    const view = new WebContentsView({
      webPreferences: internal
        ? { preload: SIDEBAR_PRELOAD, sandbox: false, contextIsolation: true, nodeIntegration: false, partition: 'homie-ui' }
        : { preload: PAGE_PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: true, partition: 'persist:homie' },
    });
    tab.view = view;
    const wc = view.webContents;
    wc.setAudioMuted(tab.muted);
    this.win.contentView.addChildView(view);
    view.setVisible(false);
    view.setBorderRadius?.(RADIUS);
    this.raisePalette();
    if (internal) {
      wc.on('page-title-updated', (_e, title) => { tab.title = title; this.push(); this.updateWindowTitle(); });
      wc.on('context-menu', (e) => e.preventDefault());
      wc.setWindowOpenHandler(({ url }) => { this.open(url); return { action: 'deny' }; });
      return view;
    }
    this.addingTab = true;
    try { this.extensions?.addTab(wc, this.win); } catch (e) { console.error('extensions.addTab', e.message); }
    this.addingTab = false;

    wc.on('page-title-updated', (_e, title) => { tab.titleChanged(title); if (tab.kind === 'today') this.saveToday(); this.push(); this.updateWindowTitle(); });
    wc.on('page-favicon-updated', (_e, icons) => { if (icons?.length) { tab.favicon = icons[0]; if (tab.kind === 'today') this.saveToday(); this.push(); } });
    wc.on('did-change-theme-color', (_e, color) => { tab.themeColor = color || ''; this.push(); });
    // no theme-color: paint the toolbar strip in the page's own background, as Arc does
    const sampleBg = () => wc.executeJavaScript(`(() => { const c = getComputedStyle(document.body).backgroundColor; const h = getComputedStyle(document.documentElement).backgroundColor; return [c, h]; })()`, true)
      .then(([c, h]) => { const pick = [c, h].find((v) => v && !/rgba\(.*,\s*0\)/.test(v) && v !== 'transparent'); tab.pageBg = pick || ''; this.push(); }).catch(() => {});
    wc.on('did-finish-load', sampleBg);
    wc.on('did-start-loading', () => { tab.loading = true; this.push(); });
    wc.on('did-stop-loading', () => { tab.loading = false; this.push(); });
    const nav = (url) => { tab.url = url; recordVisit(url, tab.title); if (tab.kind === 'today') this.saveToday(); this.push(); };
    wc.on('did-navigate', (_e, url) => nav(url));
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => { if (isMainFrame) nav(url); });
    wc.on('dom-ready', () => { wc.executeJavaScript(NOTIFICATION_SHIM, true).catch(() => {}); });
    wc.on('context-menu', (_e, params) => this.pageContextMenu(tab, params));
    wc.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') { tab.title = 'Crashed: ' + tab.title; this.push(); } });
    wc.on('enter-html-full-screen', () => { this.fullscreenTab = tab; this.layout(); });
    wc.on('leave-html-full-screen', () => { this.fullscreenTab = null; this.layout(); });
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      if (disposition === 'new-window' && features) {
        // a real popup (OAuth, "open in window"); keep it a window so window.opener works
        return { action: 'allow', overrideBrowserWindowOptions: { parent: this.win, autoHideMenuBar: true,
          webPreferences: { preload: PAGE_PRELOAD, sandbox: true, contextIsolation: true, partition: 'persist:homie' } } };
      }
      this.open(url, { background: disposition === 'background-tab', after: tab });
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child) => { try { this.extensions?.addTab(child.webContents, child); } catch {} });
    return view;
  }

  destroyView(tab) {
    if (!tab.view) return;
    const wc = tab.view.webContents;
    try { this.extensions?.removeTab(wc); } catch {}
    this.win.contentView.removeChildView(tab.view);
    if (!wc.isDestroyed()) wc.close();
    tab.view = null;
  }

  // --- pinned tabs from bookmarks.yml -------------------------------------------------
  syncBookmarks(initial = false) {
    const old = new Map();
    for (const g of this.groups) for (const t of g.tabs) old.set(t.pinnedUrl, t);
    const groups = [];
    let delay = 0;
    for (const g of this.bookmarks.groups) {
      const tabs = [];
      for (const spec of g.tabs) {
        let t = old.get(spec.url);
        if (t) {
          old.delete(spec.url);
          t.label = spec.label; t.showsBadge = spec.badge;
          if (t.muted !== spec.muted) { t.muted = spec.muted; t.wc?.setAudioMuted(spec.muted); }
          if (!t.title) t.title = spec.label;
          t.titleChanged(t.title);
        } else {
          t = new Tab(this, { kind: 'pinned', url: spec.url, label: spec.label, muted: spec.muted, badge: spec.badge });
          this.tabs.set(t.id, t);
          setTimeout(() => { if (this.tabs.has(t.id)) t.load(); }, initial ? delay : 0);
          delay += STAGGER_MS;
        }
        tabs.push(t);
      }
      groups.push({ name: g.name, tabs });
    }
    for (const t of old.values()) this.dropTab(t);
    this.groups = groups;
    if (!this.active || !this.tabs.has(this.active.id)) {
      const first = this.allPinned()[0] || this.today[0];
      if (first) this.activate(first.id);
    }
    this.badgesChanged();
    this.push();
  }

  allPinned() { return this.groups.flatMap((g) => g.tabs); }
  ordered() { return [...this.allPinned(), ...this.today, ...(this.downloadsTab ? [this.downloadsTab] : [])]; }

  showDownloads() {
    if (!this.downloadsTab) {
      this.downloadsTab = new Tab(this, { kind: 'internal', url: 'homie://downloads', label: 'Downloads', title: 'Downloads', page: path.join(__dirname, '..', 'renderer', 'downloads.html') });
      this.tabs.set(this.downloadsTab.id, this.downloadsTab);
    }
    this.focus();
    this.activate(this.downloadsTab.id);
  }

  downloadContextMenu(r, x, y, act) {
    const busy = r.state === 'progressing';
    const items = busy ? [{ label: 'Cancel', click: () => act('cancel') }] : [
      { label: 'Open', click: () => act('open') },
      { label: 'Show in Finder', click: () => act('reveal') },
      { label: 'Copy Download Address', click: () => act('copy-url') },
      { type: 'separator' },
      { label: 'Remove from List', click: () => act('remove') },
      { label: 'Move to Trash', click: () => act('trash') },
    ];
    const sbw = this.sidebarHidden ? 0 : state.sidebarWidth;
    Menu.buildFromTemplate(items).popup({ window: this.win, x: Math.round(x) + sbw, y: Math.round(y) });
  }

  restoreToday() {
    for (const row of state.today || []) {
      if (!row?.url) continue;
      const t = new Tab(this, { kind: 'today', url: row.url, title: row.title || row.url, favicon: row.favicon });
      this.tabs.set(t.id, t); this.today.push(t);
    }
  }

  saveToday() {
    state.today = this.today.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon }));
    saveState();
  }

  // --- actions ----------------------------------------------------------------------
  activate(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    if (this.active?.wc && this.active !== t) this.active.wc.stopFindInPage('clearSelection');
    this.active = t;
    if (!t.loaded) t.load();
    try { this.extensions?.selectTab(t.wc); } catch {}
    this.layout();
    t.wc.focus();
    if (t.kind !== 'internal') { state.activeUrl = t.kind === 'pinned' ? t.pinnedUrl : t.url; saveState(); }
    if (t === this.downloadsTab) this.downloads?.pushPage();
    this.updateWindowTitle();
    this.push();
  }

  updateWindowTitle() { if (this.win && this.active) this.win.setTitle(this.active.title || this.active.label || 'Homie'); }

  open(url, { background = false, after = null, title = '' } = {}) {
    const t = new Tab(this, { kind: 'today', url, title: title || url });
    this.tabs.set(t.id, t);
    const i = after && after.kind === 'today' ? this.today.indexOf(after) + 1 : this.today.length;
    this.today.splice(i, 0, t);
    t.load();
    this.saveToday();
    if (!background) this.activate(t.id); else this.push();
    return t;
  }

  // navigation typed in the sidebar: a pinned tab navigates in place, Cmd+T opens a Today tab
  navigate(text, { newTab = false } = {}) {
    const url = resolveInput(text);
    if (!url) return;
    if (newTab || !this.active) return this.open(url);
    this.active.load(url);
  }

  close(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    if (t.kind === 'internal') {
      const next = this.neighbour(t);
      t.unload();
      if (this.active === t && next) this.activate(next.id);
      this.push();
      return;
    }
    if (t.kind === 'pinned') {
      if (t.away) { t.load(t.pinnedUrl); return; }
      const next = this.neighbour(t);
      t.unload();
      if (this.active === t && next) this.activate(next.id);
      this.push();
      return;
    }
    const next = this.neighbour(t);
    this.closed.push(t.url);
    this.dropTab(t);
    if (this.active === t) { this.active = null; if (next) this.activate(next.id); }
    this.saveToday();
    this.push();
  }

  neighbour(t) {
    const list = this.ordered();
    const i = list.indexOf(t);
    return list[i + 1] || list[i - 1] || null;
  }

  dropTab(t) {
    t.unload();
    this.tabs.delete(t.id);
    const i = this.today.indexOf(t); if (i >= 0) this.today.splice(i, 1);
    for (const g of this.groups) { const j = g.tabs.indexOf(t); if (j >= 0) g.tabs.splice(j, 1); }
    if (this.active === t) this.active = null;
  }

  reopenClosed() { const url = this.closed.pop(); if (url) this.open(url); }
  clearToday() { for (const t of [...this.today]) this.dropTab(t); if (!this.active) { const f = this.allPinned()[0]; if (f) this.activate(f.id); } this.saveToday(); this.push(); }

  byIndex(n) { const t = this.allPinned()[n]; if (t) this.activate(t.id); }
  step(dir) {
    const list = this.ordered(); if (!list.length) return;
    const i = Math.max(0, list.indexOf(this.active));
    this.activate(list[(i + dir + list.length) % list.length].id);
  }

  pin(id, groupName) {
    const t = this.tabs.get(id); if (!t || t.kind !== 'today') return;
    const label = (t.title || '').replace(/^\(\d+\)\s*/, '').slice(0, 40);
    this.bookmarks.add(groupName, t.url, label);
    this.dropTab(t); this.saveToday();
    // syncBookmarks (from the watcher) creates the pinned tab; activate it when it lands
    setTimeout(() => { const p = this.allPinned().find((x) => x.pinnedUrl === t.url); if (p) this.activate(p.id); }, 400);
  }

  unpin(id) {
    const t = this.tabs.get(id); if (!t || t.kind !== 'pinned') return;
    this.bookmarks.remove(t.pinnedUrl);
  }

  toggleSidebar() { this.sidebarHidden = !this.sidebarHidden; this.push(true); this.animateLayout(); }
  setSidebarWidth(w) { state.sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w))); saveState(); this.layout(); }

  badgesChanged() {
    const total = this.allPinned().reduce((n, t) => n + (t.unread || 0), 0);
    app.setBadgeCount(total);
  }

  suggestions(q) {
    q = q.trim(); if (!q) return [];
    const ql = q.toLowerCase();
    const out = [];
    for (const t of this.ordered()) {
      if (out.length >= 3) break;
      if (t === this.active) continue;
      if ((t.title || '').toLowerCase().includes(ql) || (t.label || '').toLowerCase().includes(ql) || t.url.toLowerCase().includes(ql))
        out.push({ kind: 'tab', id: t.id, title: t.title || t.label, url: t.url });
    }
    for (const r of searchHistory(ql, 5)) if (!out.some((o) => o.url === r.url)) out.push({ kind: 'history', title: r.title || r.url, url: r.url });
    const url = resolveInput(q);
    out.push(url.includes('google.com/search') ? { kind: 'search', title: `Search Google for “${q}”`, url } : { kind: 'url', title: url, url });
    return out;
  }

  // --- notifications ----------------------------------------------------------------
  notify(wc, { title, body, tag }) {
    const tab = [...this.tabs.values()].find((t) => t.wc === wc);
    if (!tab) return;
    if (tag && tab.notifications.get(tag)?.close) { try { tab.notifications.get(tag).close(); } catch {} }
    const n = new Notification({ title: title || tab.label || tab.title, body: body || '', silent: tab.muted });
    n.on('click', () => { this.focus(); this.activate(tab.id); });
    if (tag) tab.notifications.set(tag, n);
    n.show();
  }

  // --- context menus ------------------------------------------------------------------
  tabContextMenu(id, x, y) {
    const t = this.tabs.get(id); if (!t) return;
    const items = [];
    if (t.kind === 'today') {
      items.push({ label: 'Pin to', submenu: this.groups.map((g) => ({ label: g.name, click: () => this.pin(id, g.name) })).concat(
        this.groups.length ? [{ type: 'separator' }] : [], [{ label: 'New group…', click: () => this.showPalette('pin', id) }]) });
    }
    items.push({ label: t.muted ? 'Unmute' : 'Mute', click: () => this.setMuted(t, !t.muted) });
    if (t.kind === 'pinned') {
      items.push({ label: 'Show badge', type: 'checkbox', checked: t.showsBadge, click: () => this.bookmarks.setField(t.pinnedUrl, 'badge', !t.showsBadge, true) });
      items.push({ label: 'Rename…', click: () => this.sendUI('start-rename', id) });
    }
    items.push({ type: 'separator' });
    items.push({ label: 'Reload', enabled: t.loaded, click: () => t.wc?.reload() });
    if (t.kind === 'pinned') {
      items.push({ label: 'Reset to pinned page', enabled: t.loaded, click: () => t.load(t.pinnedUrl) });
      if (t.away) items.push({ label: 'Pin this page instead', click: () => this.bookmarks.replaceUrl(t.pinnedUrl, t.url) });
    }
    items.push({ label: 'Copy address', click: () => clipboard.writeText(t.url) });
    items.push({ label: 'Open in Chrome', click: () => openInChrome(t.url) });
    items.push({ type: 'separator' });
    if (t.kind === 'pinned') {
      items.push({ label: t.loaded ? 'Unload' : 'Load', click: () => (t.loaded ? this.close(id) : t.load()) });
      items.push({ label: 'Unpin', click: () => this.unpin(id) });
    } else {
      items.push({ label: 'Close', click: () => this.close(id) });
    }
    Menu.buildFromTemplate(items).popup({ window: this.win, x: Math.round(x), y: Math.round(y) });
  }

  setMuted(t, muted) {
    t.muted = muted; t.wc?.setAudioMuted(muted);
    if (t.kind === 'pinned') this.bookmarks.setField(t.pinnedUrl, 'muted', muted, false); else this.push();
  }

  pageContextMenu(tab, p) {
    const wc = tab.wc; if (!wc) return;
    const items = [];
    const sel = (p.selectionText || '').trim();
    if (p.linkURL) {
      items.push({ label: 'Open Link in New Tab', click: () => this.open(p.linkURL, { after: tab, background: true }) });
      items.push({ label: 'Copy Link', click: () => clipboard.writeText(p.linkURL) });
      items.push({ type: 'separator' });
    }
    if (p.mediaType === 'image') {
      items.push({ label: 'Open Image in New Tab', click: () => this.open(p.srcURL, { after: tab, background: true }) });
      items.push({ label: 'Copy Image', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ label: 'Copy Image Address', click: () => clipboard.writeText(p.srcURL) });
      items.push({ label: 'Save Image…', click: () => wc.downloadURL(p.srcURL) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }, { type: 'separator' });
      if (p.misspelledWord) {
        for (const s of (p.dictionarySuggestions || []).slice(0, 5)) items.unshift({ label: s, click: () => wc.replaceMisspelling(s) });
        items.unshift({ type: 'separator' });
      }
    } else if (sel) {
      items.push({ role: 'copy' });
      items.push({ label: `Search Google for “${sel.slice(0, 30)}${sel.length > 30 ? '…' : ''}”`, click: () => this.open(resolveInput(sel), { after: tab }) });
      items.push({ type: 'separator' });
    }
    if (!p.linkURL && !sel && !p.isEditable && p.mediaType === 'none') {
      items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
      items.push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
      items.push({ label: 'Reload', click: () => wc.reload() });
      items.push({ type: 'separator' });
      items.push({ label: 'Copy Page Address', click: () => clipboard.writeText(tab.url) });
      items.push({ label: 'Open in Chrome', click: () => openInChrome(tab.url) });
      items.push({ type: 'separator' });
    }
    try { for (const mi of this.extensions?.getContextMenuItems(wc, p) || []) items.push(mi); if (items.at(-1)?.type !== 'separator' && this.extensions) items.push({ type: 'separator' }); } catch {}
    items.push({ label: 'Inspect Element', click: () => wc.inspectElement(p.x, p.y) });
    const sbw = this.sidebarHidden ? 0 : state.sidebarWidth;
    Menu.buildFromTemplate(items).popup({ window: this.win, x: p.x + sbw, y: p.y });
  }

  // --- sidebar protocol ---------------------------------------------------------------
  sendUI(ch, ...args) {
    for (const v of [this.sidebar, this.palette]) if (v && !v.webContents.isDestroyed()) v.webContents.send(ch, ...args);
  }

  push(now = false) {
    if (now) { clearTimeout(this.pushTimer); this.pushTimer = null; return this.sendUI('state', this.snapshot()); }
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => { this.pushTimer = null; this.sendUI('state', this.snapshot()); }, 30);
  }

  snapshot() {
    const a = this.active;
    const h = a?.wc && !a.wc.isDestroyed() ? a.wc.navigationHistory : null;
    return {
      groups: this.groups.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.dto()) })),
      today: this.today.map((t) => t.dto()),
      activeId: a?.id ?? null,
      url: a?.url || '',
      theme: a?.themeColor || a?.pageBg || '',
      canGoBack: !!h?.canGoBack(), canGoForward: !!h?.canGoForward(),
      downloads: this.downloads?.summary() || null,
      downloadsActive: !!this.downloadsTab && a === this.downloadsTab,
      sidebarWidth: state.sidebarWidth,
      sidebarHidden: this.sidebarHidden,
      tint: this.bookmarks.tint || '',
    };
  }

  wireIpc() {
    const fromUI = (e) => e.sender === this.sidebar?.webContents || e.sender === this.palette?.webContents;
    ipcMain.on('activate', (e, id) => fromUI(e) && this.activate(id));
    ipcMain.on('close', (e, id) => fromUI(e) && this.close(id));
    ipcMain.on('navigate', (e, text, opts) => fromUI(e) && this.navigate(text, opts || {}));
    ipcMain.on('context', (e, id, x, y) => fromUI(e) && this.tabContextMenu(id, x, y));
    ipcMain.on('nav', (e, what) => {
      if (!fromUI(e) || !this.active?.wc) return;
      const wc = this.active.wc;
      if (what === 'back') wc.navigationHistory.goBack();
      else if (what === 'forward') wc.navigationHistory.goForward();
      else if (what === 'reload') wc.reload();
      else if (what === 'stop') wc.stop();
    });
    ipcMain.handle('suggest', (e, q) => (fromUI(e) ? this.suggestions(String(q || '')) : []));
    ipcMain.on('find', (e, text, forward, first) => { if (fromUI(e) && this.active?.wc) { if (text) this.active.wc.findInPage(text, { forward, findNext: !first }); else this.active.wc.stopFindInPage('clearSelection'); } });
    ipcMain.on('find-stop', (e) => fromUI(e) && this.active?.wc?.stopFindInPage('keepSelection'));
    ipcMain.on('clear-today', (e) => fromUI(e) && this.clearToday());
    ipcMain.on('rename', (e, id, label) => {
      if (!fromUI(e)) return; const t = this.tabs.get(id); if (!t) return;
      if (t.kind === 'pinned') this.bookmarks.setField(t.pinnedUrl, 'label', String(label || '').trim(), '');
    });
    ipcMain.on('pin-new-group', (e, id, name) => fromUI(e) && name && this.pin(id, String(name).trim()));
    ipcMain.on('sidebar-drag', (e, phase, width) => {
      if (!fromUI(e)) return;
      if (phase === 'start') { this.sidebarDragging = true; this.layout(); }
      else if (phase === 'move') { state.sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width))); this.sendUI('sidebar-width', state.sidebarWidth); }
      else { this.sidebarDragging = false; this.setSidebarWidth(width); this.push(); }
    });
    ipcMain.on('show-downloads', (e) => fromUI(e) && this.showDownloads());
    ipcMain.on('toggle-sidebar', (e) => fromUI(e) && this.toggleSidebar());
    ipcMain.on('palette', (e, mode, arg) => fromUI(e) && this.showPalette(mode, arg));
    ipcMain.on('palette-close', (e) => fromUI(e) && this.hidePalette());
    ipcMain.on('palette-size', (e, h) => { if (fromUI(e)) { this.paletteHeight = Math.max(48, Math.min(600, Math.round(h))); this.layout(); } });
    ipcMain.on('focus-page', (e) => fromUI(e) && this.active?.wc?.focus());
    ipcMain.on('homie:notification', (e, payload) => this.notify(e.sender, payload || {}));
  }
}

export function openInChrome(url) {
  if (process.platform === 'darwin') spawn('open', ['-a', 'Google Chrome', url], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', 'chrome', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else shell.openExternal(url);
}
