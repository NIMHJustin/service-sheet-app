// Pure record logic: tolerance, pass/fail, counts, tracking numbers, names.
// No browser APIs here, so it can be tested in Node.

import { checklistItems } from '../data/forms.js';

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Penlon vaporizers (and the Sigma Delta model) use a wider 20% range.
export function tolerancePct(values = {}) {
  return norm(values.vMfr) === 'penlon' || norm(values.vModel) === 'sigma delta' ? 20 : 15;
}

export function parseNum(v) {
  const s = String(v ?? '').trim().replace(/%$/, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function judge(value, dial, tolPct) {
  const v = parseNum(value);
  if (v === null) return null;
  const t = tolPct / 100;
  return v >= dial * (1 - t) - 1e-9 && v <= dial * (1 + t) + 1e-9;
}

// readings: { a1..a5 (1 LPM), b1..b5 (4 LPM) }
export function readingRows(readings = {}, tolPct = 15) {
  return [1, 2, 3, 4, 5].map((n) => {
    const a = parseNum(readings['a' + n]);
    const b = parseNum(readings['b' + n]);
    return { dial: n, a, b, aOk: judge(a, n, tolPct), bOk: judge(b, n, tolPct), lo: n * (1 - tolPct / 100), hi: n * (1 + tolPct / 100) };
  });
}

export function readingStats(readings, tolPct) {
  let entered = 0, failed = 0;
  for (const r of readingRows(readings, tolPct)) {
    for (const ok of [r.aOk, r.bOk]) {
      if (ok !== null) { entered += 1; if (!ok) failed += 1; }
    }
  }
  return { entered, failed };
}

export function itemsFailed(record) {
  return checklistItems(record).filter((i) => i.value === 'Fail').length;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'XX';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || 'X');
  return (first + last).toUpperCase();
}

export function seqLetters(i) {
  // 0 -> A, 25 -> Z, 26 -> ZA, 27 -> ZB ...
  let s = '';
  while (i >= 26) { s += 'Z'; i -= 26; }
  return s + String.fromCharCode(65 + i);
}

export function datePart(isoDate) {
  // 'YYYY-MM-DD' -> 'YYMMDD'
  const [y, m, d] = isoDate.split('-');
  return y.slice(2) + m + d;
}

// Next free tracking number for a technician on a date, given numbers already used on this tablet.
export function nextTrackingNumber(tech, isoDate, used = []) {
  const prefix = initials(tech) + datePart(isoDate);
  const taken = new Set(used);
  for (let i = 0; i < 2000; i++) {
    const tn = prefix + seqLetters(i);
    if (!taken.has(tn)) return tn;
  }
  throw new Error('No tracking numbers left for this day');
}

export function todayIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function usDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return m + '/' + d + '/' + y;
}

// SharePoint refuses " * : < > ? / \ | and some other characters in file and folder names.
export function safeName(s) {
  return String(s ?? '').trim()
    .replace(/[\\/:*?"<>|#%&{}~]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '') || 'Unknown';
}

export function safeFolder(s) {
  return String(s ?? '').trim()
    .replace(/[\\/:*?"<>|#%&{}~]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '') || 'Unknown';
}

export function certificateFileName(record) {
  return [safeName(record.values?.facility), safeName(record.values?.vSn), record.tn].join('_') + '.pdf';
}

export function certificateFolder(record) {
  return (record.date || '').slice(0, 4) + '/' + safeFolder(record.values?.facility);
}

export function partsSubtotal(parts = []) {
  return parts.reduce((t, p) => t + (p.price == null ? 0 : p.price * p.qty), 0);
}

export function money(v) {
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Line added to Comments when a "See notes" item's note is sent.
export function noteLine(groupTitle, label, note) {
  return groupTitle + ', ' + label.toLowerCase() + ': ' + String(note).trim();
}

export function missingForSubmit(record) {
  const miss = [];
  if (!String(record.values?.facility || '').trim()) miss.push('facility');
  if (!String(record.values?.vSn || '').trim()) miss.push('vaporizer serial number');
  return miss;
}
