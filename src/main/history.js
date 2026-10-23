// Browsing history for the address field: one row per URL, newest first, capped.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const CAP = 5000;
const file = () => path.join(app.getPath('userData'), 'history.json');
let rows = null;
let timer = null;

function load() {
  if (rows) return rows;
  try { rows = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { rows = []; }
  return rows;
}

export function recordVisit(url, title) {
  if (!/^https?:/.test(url)) return;
  const list = load();
  const i = list.findIndex((r) => r.url === url);
  const row = i >= 0 ? list.splice(i, 1)[0] : { url, n: 0 };
  row.n += 1; row.t = Date.now(); if (title) row.title = title;
  list.unshift(row);
  if (list.length > CAP) list.length = CAP;
  clearTimeout(timer);
  timer = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(list)); } catch {} }, 2000);
}

export function updateTitle(url, title) {
  const row = load().find((r) => r.url === url);
  if (row && title) row.title = title;
}

export function searchHistory(q, limit = 6) {
  q = q.toLowerCase();
  const out = [];
  for (const r of load()) {
    if (r.url.toLowerCase().includes(q) || (r.title || '').toLowerCase().includes(q)) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}
