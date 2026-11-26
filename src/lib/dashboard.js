// Dashboard numbers, computed from the Service Records and Parts Used lists.
// The pure functions here take plain rows, so they can be tested without SharePoint.

import { SHAREPOINT } from '../config.js';
import { resolveTargets } from './upload.js';
import { loadColumns, mapFields } from './columns.js';
import { localDate, normSn } from './fleet.js';
import { todayIso } from './calc.js';

const site = () => '/sites/' + SHAREPOINT.siteId;

const RECORD_NAMES = ['ServiceDate', 'Facility', 'VapMfr', 'VapModel', 'VapSN', 'ServiceLocation', 'ServiceType', 'RecordType',
  'ReadingsFailed', 'ItemsFailed', 'InspectionDetails', 'ServiceCharge', 'PartsSubtotal', 'Technician', 'Imported'];
const PART_NAMES = ['ItemNumber', 'Description', 'Quantity', 'Amount', 'ServiceDate', 'Facility'];

function reader(columns, names) {
  const map = {};
  for (const n of names) map[n] = Object.keys(mapFields({ [n]: 'x' }, columns).fields)[0] || n;
  return (fields, n) => fields[map[n]];
}

function addYear(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

async function allItems(graph, listId) {
  const out = [];
  let next = site() + '/lists/' + listId + '/items?$expand=fields&$top=999';
  while (next) {
    const res = await graph.get(next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, ''));
    out.push(...(res.value || []));
    next = res['@odata.nextLink'] || null;
  }
  return out;
}

export async function loadDashboardData(graph, cache) {
  const t = await resolveTargets(graph, cache);
  const rCols = await loadColumns(graph, site() + '/lists/' + t.recordsListId);
  const pCols = await loadColumns(graph, site() + '/lists/' + t.partsListId);
  const rr = reader(rCols, RECORD_NAMES);
  const pr = reader(pCols, PART_NAMES);
  const records = (await allItems(graph, t.recordsListId)).map((it) => {
    const f = it.fields || {};
    const g = (n) => rr(f, n);
    return {
      tn: String(f.Title || ''),
      date: localDate(g('ServiceDate')),
      facility: String(g('Facility') || '').trim(),
      mfr: String(g('VapMfr') || '').trim(),
      model: String(g('VapModel') || '').trim(),
      sn: String(g('VapSN') || '').trim(),
      location: g('ServiceLocation') || 'Field',
      type: g('ServiceType') || 'Efficacy test',
      recordType: g('RecordType') || '',
      readingsFailed: Number(g('ReadingsFailed')) || 0,
      itemsFailed: Number(g('ItemsFailed')) || 0,
      details: String(g('InspectionDetails') || ''),
      charge: Number(g('ServiceCharge')) || 0,
      parts: Number(g('PartsSubtotal')) || 0,
      tech: String(g('Technician') || ''),
      imported: !!g('Imported'),
    };
  }).filter((r) => r.date);
  const parts = (await allItems(graph, t.partsListId)).map((it) => {
    const f = it.fields || {};
    const g = (n) => pr(f, n);
    return {
      tn: String(f.Title || ''),
      no: String(g('ItemNumber') || ''),
      desc: String(g('Description') || ''),
      qty: Number(g('Quantity')) || 0,
      amount: Number(g('Amount')) || 0,
      date: localDate(g('ServiceDate')),
    };
  });
  return { records, parts, loadedAt: new Date().toISOString() };
}

// ----- pure computations -----

export const monthKey = (iso) => iso.slice(0, 7);

export function monthsBack(n, today = todayIso()) {
  const [y, m] = today.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + String(y).slice(2);
}

export const passed = (r) => r.readingsFailed === 0 && r.itemsFailed === 0;

export function rangeStart(range, records, today = todayIso()) {
  if (range === 'all') {
    const first = records.map((r) => r.date).sort()[0];
    return first ? first.slice(0, 7) + '-01' : today;
  }
  const months = range === '12m' ? 12 : 36;
  return monthsBack(months, today)[0] + '-01';
}

export function filterRecords(records, { range = '12m', location = 'All', facility = 'All' }, today = todayIso()) {
  const from = rangeStart(range, records, today);
  return records.filter((r) => r.date >= from && r.date <= today
    && (location === 'All' || r.location === location)
    && (facility === 'All' || r.facility === facility));
}

// Months shown on the time axis for the chosen range (at most 36 columns; "all" groups by quarter beyond that).
export function axisMonths(range, records, today = todayIso()) {
  const from = rangeStart(range, records, today).slice(0, 7);
  const all = [];
  for (const k of monthsBack(240, today)) if (k >= from) all.push(k);
  return all;
}

export function bucketKey(month, months) {
  if (months.length <= 36) return month;
  const [y, m] = month.split('-').map(Number);
  return y + '-Q' + Math.ceil(m / 3);
}

export function bucketLabel(key) {
  if (key.includes('Q')) return key.slice(5) + ' ' + key.slice(2, 4);
  return monthLabel(key);
}

export function summarize(data, filters, today = todayIso()) {
  const recs = filterRecords(data.records, filters, today);
  const months = axisMonths(filters.range, data.records, today);
  const buckets = [...new Set(months.map((m) => bucketKey(m, months)))];
  const blank = () => Object.fromEntries(buckets.map((b) => [b, 0]));

  // Volume by work location
  const field = blank(), shop = blank();
  for (const r of recs) {
    const b = bucketKey(monthKey(r.date), months);
    if (!(b in field)) continue;
    (r.location === 'Shop' ? shop : field)[b] += 1;
  }

  // Efficacy pass rate by bucket
  const effTotal = blank(), effPass = blank();
  for (const r of recs.filter((x) => x.type === 'Efficacy test')) {
    const b = bucketKey(monthKey(r.date), months);
    if (!(b in effTotal)) continue;
    effTotal[b] += 1;
    if (passed(r)) effPass[b] += 1;
  }
  const eff = recs.filter((x) => x.type === 'Efficacy test');
  const effPassed = eff.filter(passed).length;

  // Failed efficacy tests followed by a cleaning and calibration on the same unit within 90 days
  const failedTests = eff.filter((r) => !passed(r) && r.sn);
  const ccs = data.records.filter((r) => r.type === 'Full cleaning and calibration' && r.sn);
  const followed = failedTests.filter((f) => ccs.some((c) => normSn(c.sn) === normSn(f.sn) && c.date >= f.date
    && (Date.parse(c.date) - Date.parse(f.date)) / 864e5 <= 90));

  // Models
  const modelCount = {};
  for (const r of recs) {
    const k = [r.mfr, r.model].filter(Boolean).join(' ') || 'Not recorded';
    modelCount[k] = (modelCount[k] || 0) + 1;
  }
  const models = Object.entries(modelCount).sort((a, b) => b[1] - a[1]);

  // Failed inspection items (from the details text)
  const failCount = {};
  for (const r of recs) {
    for (const line of r.details.split('\n')) {
      const m = line.match(/^(.*):\s*Fail$/i);
      if (m) failCount[m[1].trim()] = (failCount[m[1].trim()] || 0) + 1;
    }
  }
  const failedItems = Object.entries(failCount).sort((a, b) => b[1] - a[1]);

  // Facilities: services in range, and the last service overall (for "due back")
  const fac = {};
  for (const r of data.records) {
    if (!r.facility) continue;
    const f = (fac[r.facility] = fac[r.facility] || { facility: r.facility, total: 0, inRange: 0, last: '', lastPassed: true });
    f.total += 1;
    if (r.date > f.last) { f.last = r.date; f.lastPassed = passed(r); }
  }
  for (const r of recs) if (fac[r.facility]) fac[r.facility].inRange += 1;
  const facilities = Object.values(fac).map((f) => {
    const due = addYear(f.last);
    return { ...f, due, daysToDue: Math.round((Date.parse(due) - Date.parse(today)) / 864e5) };
  });

  // Annual inspection: every vaporizer is due a year after its last service of either kind
  // (an efficacy test, or a cleaning and calibration when one was needed).
  const unitLast = {};
  for (const r of data.records) {
    const k = normSn(r.sn);
    if (!k) continue;
    const u = unitLast[k];
    if (!u || r.date > u.date) unitLast[k] = r;
  }
  const units = Object.values(unitLast).map((r) => {
    const due = addYear(r.date);
    return {
      sn: r.sn, facility: r.facility, model: [r.mfr, r.model].filter(Boolean).join(' '),
      last: r.date, lastType: r.type, lastPassed: passed(r), tn: r.tn,
      due, daysToDue: Math.round((Date.parse(due) - Date.parse(today)) / 864e5),
    };
  }).filter((u) => !filters.facility || filters.facility === 'All' || u.facility === filters.facility);

  // Revenue
  const charges = blank(), partsRev = blank();
  for (const r of recs) {
    const b = bucketKey(monthKey(r.date), months);
    if (!(b in charges)) continue;
    charges[b] += r.charge;
    partsRev[b] += r.parts;
  }
  const tnSet = new Set(recs.map((r) => r.tn));
  const partUse = {};
  for (const p of data.parts) {
    if (!tnSet.has(p.tn)) continue;
    const k = p.no && p.no !== 'Custom' ? p.no + ' · ' + p.desc : p.desc;
    const e = (partUse[k] = partUse[k] || { part: k, qty: 0, amount: 0 });
    e.qty += p.qty;
    e.amount += p.amount;
  }
  const topParts = Object.values(partUse).sort((a, b) => b.qty - a.qty);

  return {
    count: recs.length,
    shopCount: recs.filter((r) => r.location === 'Shop').length,
    ccCount: recs.filter((r) => r.type === 'Full cleaning and calibration').length,
    effCount: eff.length,
    passRate: eff.length ? effPassed / eff.length : null,
    failedTests: failedTests.length,
    followedByCc: followed.length,
    facilitiesServed: new Set(recs.map((r) => r.facility).filter(Boolean)).size,
    buckets,
    volume: { field, shop },
    passRateByBucket: buckets.map((b) => ({ b, total: effTotal[b], passed: effPass[b], rate: effTotal[b] ? effPass[b] / effTotal[b] : null })),
    models,
    failedItems,
    facilities,
    units,
    revenue: { charges, parts: partsRev, total: recs.reduce((t, r) => t + r.charge + r.parts, 0), chargedRecords: recs.filter((r) => r.charge > 0).length },
    topParts,
  };
}
