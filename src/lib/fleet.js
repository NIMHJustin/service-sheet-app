// Loaner and exchange fleet: units, offline actions, and syncing with SharePoint.
//
// The device keeps a copy of the Fleet Vaporizers list. Changes made on the device (loan out,
// return, exchange, add, retire) are queued as actions, shown immediately by applying them to
// the copy, and uploaded in order when online: each action updates the unit's row and adds a
// row to Fleet Movements.

import { SHAREPOINT, HOME_LOCATION, FLEET_TEST_MONTHS } from '../config.js';
import { loadColumns, mapFields, CLEAR } from './columns.js';
import { spDate } from './fields.js';
import { todayIso, readingStats, tolerancePct, itemsFailed } from './calc.js';

export const STATUSES = ['In stock', 'Out on loan', 'In service', 'Transferred', 'Retired'];
export const ACTIVE = (u) => u.status !== 'Transferred' && u.status !== 'Retired';

export const normSn = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const site = () => '/sites/' + SHAREPOINT.siteId;

export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

// SharePoint date (UTC timestamp) -> local 'YYYY-MM-DD'
export function localDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : todayIso(d);
}

export function daysUntil(iso, today = todayIso()) {
  if (!iso) return null;
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
}

// ----- mapping between SharePoint rows and local units -----

const read = (fields, columns, name) => {
  if (fields[name] !== undefined) return fields[name];
  const m = mapFields({ [name]: 'x' }, columns).fields;
  const k = Object.keys(m)[0];
  return k ? fields[k] : undefined;
};

export function unitFromItem(item, columns = []) {
  const f = item.fields || {};
  const r = (n) => read(f, columns, n);
  return {
    id: item.id,
    sn: String(f.Title || '').trim(),
    fleet: r('Fleet') || '',
    mfr: r('Manufacturer') || '',
    model: r('Model') || '',
    agent: r('Agent') || '',
    status: r('Status') || 'In stock',
    location: r('Location') || '',
    dateOut: localDate(r('DateOut')),
    dueBack: localDate(r('DueBack')),
    customerSn: r('CustomerUnitSN') || '',
    lastService: localDate(r('LastServiceDate')),
    lastTn: r('LastTrackingNumber') || '',
    nextDue: localDate(r('NextServiceDue')),
    notes: r('Notes') || '',
  };
}

const dateOrClear = (iso) => (iso ? spDate(iso) : CLEAR);

export function unitFields(u) {
  return {
    Title: u.sn,
    Fleet: u.fleet || undefined,
    Manufacturer: u.mfr || undefined,
    Model: u.model || undefined,
    Agent: u.agent || undefined,
    Status: u.status,
    Location: u.location || CLEAR,
    DateOut: dateOrClear(u.dateOut),
    DueBack: dateOrClear(u.dueBack),
    CustomerUnitSN: u.customerSn || CLEAR,
    LastServiceDate: u.lastService ? spDate(u.lastService) : undefined,
    LastTrackingNumber: u.lastTn || undefined,
    NextServiceDue: u.nextDue ? spDate(u.nextDue) : undefined,
    Notes: u.notes || undefined,
  };
}

// ----- actions -----

// What each action does to the units, and the movement rows it records.
// Pure: returns { units, moves } given the units before the action.
export function applyAction(units, a) {
  const list = units.map((u) => ({ ...u }));
  const find = (sn) => list.find((u) => normSn(u.sn) === normSn(sn));
  const moves = [];
  const move = (sn, movement, extra = {}) => moves.push({ sn, movement, date: a.date, tech: a.tech, ...extra });
  const d = a.data || {};
  switch (a.kind) {
    case 'add': {
      const existing = find(d.sn);
      const u = existing || { id: null, sn: d.sn.trim() };
      Object.assign(u, {
        fleet: d.fleet, mfr: d.mfr || '', model: d.model || '', agent: d.agent || '',
        status: d.status || 'In stock', location: HOME_LOCATION, dateOut: '', dueBack: '', customerSn: '',
        lastService: d.lastService || u.lastService || '',
        nextDue: d.lastService ? addMonths(d.lastService, FLEET_TEST_MONTHS) : u.nextDue || '',
        notes: d.notes || u.notes || '',
      });
      if (!existing) list.push(u);
      move(u.sn, 'Added to fleet', { notes: d.notes });
      break;
    }
    case 'loanOut': {
      const u = find(a.sn);
      if (!u) throw new Error('Unit ' + a.sn + ' is not in the fleet.');
      Object.assign(u, { status: 'Out on loan', location: d.facility, dateOut: a.date, dueBack: d.dueBack || '', customerSn: d.customerSn || '' });
      move(u.sn, 'Loaned out', { facility: d.facility, customerSn: d.customerSn, notes: d.notes });
      break;
    }
    case 'return': {
      const u = find(a.sn);
      if (!u) throw new Error('Unit ' + a.sn + ' is not in the fleet.');
      const from = u.location;
      Object.assign(u, { status: d.status || 'In stock', location: HOME_LOCATION, dateOut: '', dueBack: '', customerSn: '' });
      move(u.sn, 'Returned', { facility: from, notes: d.notes });
      break;
    }
    case 'exchange': {
      const out = find(a.sn);
      if (!out) throw new Error('Unit ' + a.sn + ' is not in the fleet.');
      Object.assign(out, { status: 'Transferred', location: d.facility, dateOut: a.date, dueBack: '', customerSn: d.in.sn });
      move(out.sn, 'Exchanged out', { facility: d.facility, customerSn: d.in.sn, notes: d.notes });
      const existing = find(d.in.sn);
      const inn = existing || { id: null, sn: d.in.sn.trim(), lastService: '', nextDue: '', notes: '', lastTn: '' };
      Object.assign(inn, {
        fleet: 'Exchange', mfr: d.in.mfr || inn.mfr || '', model: d.in.model || inn.model || '', agent: d.in.agent || inn.agent || '',
        status: 'In service', location: HOME_LOCATION, dateOut: '', dueBack: '', customerSn: '',
      });
      if (!existing) list.push(inn);
      move(inn.sn, 'Exchanged in', { facility: d.facility, customerSn: out.sn, notes: d.notes });
      break;
    }
    case 'inService':
    case 'retire':
    case 'stock': {
      const u = find(a.sn);
      if (!u) throw new Error('Unit ' + a.sn + ' is not in the fleet.');
      u.status = a.kind === 'retire' ? 'Retired' : a.kind === 'stock' ? 'In stock' : 'In service';
      move(u.sn, a.kind === 'retire' ? 'Retired' : a.kind === 'stock' ? 'Returned' : 'In service', { notes: d.notes });
      break;
    }
    default:
      throw new Error('Unknown fleet action ' + a.kind);
  }
  return { units: list, moves };
}

// The units as the device should show them: the downloaded copy plus queued actions.
export function currentUnits(units, queue) {
  let list = units;
  for (const a of queue) {
    try { list = applyAction(list, a).units; } catch { /* shown as an error on the action */ }
  }
  return list;
}

// A finished efficacy test on a fleet unit: record it, and put the unit back in stock if it passed.
export function serviceUpdate(unit, rec) {
  const tol = tolerancePct(rec.values || {});
  const st = readingStats(rec.readings || {}, tol);
  const passed = st.entered > 0 && st.failed === 0 && itemsFailed(rec) === 0;
  const u = {
    ...unit,
    lastService: rec.date,
    lastTn: rec.tn,
    nextDue: addMonths(rec.date, FLEET_TEST_MONTHS),
  };
  if (unit.status === 'In service' && passed) u.status = 'In stock';
  return { unit: u, passed };
}

export function fleetAlerts(units, today = todayIso()) {
  const active = units.filter(ACTIVE);
  return {
    overdueLoans: active.filter((u) => u.status === 'Out on loan' && u.dueBack && daysUntil(u.dueBack, today) < 0),
    testsDue: active.filter((u) => !u.nextDue || daysUntil(u.nextDue, today) <= 30),
  };
}

// ----- SharePoint -----

export async function resolveFleet(graph) {
  const lists = await graph.get(site() + '/lists?$select=id,displayName&$top=200');
  const byName = (n) => lists.value.find((l) => l.displayName.toLowerCase() === n.toLowerCase())?.id;
  const unitsListId = byName(SHAREPOINT.fleetList);
  const movesListId = byName(SHAREPOINT.movesList);
  if (!unitsListId || !movesListId) return null;
  const unitCols = await loadColumns(graph, site() + '/lists/' + unitsListId);
  const moveCols = await loadColumns(graph, site() + '/lists/' + movesListId);
  return { unitsListId, movesListId, unitCols, moveCols };
}

export async function fetchUnits(graph, fl) {
  const out = [];
  let next = site() + '/lists/' + fl.unitsListId + '/items?$expand=fields&$top=500';
  while (next) {
    const res = await graph.get(next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, ''));
    for (const it of res.value || []) out.push(unitFromItem(it, fl.unitCols));
    next = res['@odata.nextLink'] || null;
  }
  return out.filter((u) => u.sn);
}

async function saveUnit(graph, fl, unit) {
  const fields = mapFields(unitFields(unit), fl.unitCols).fields;
  if (unit.id) {
    delete fields.Title;
    await graph.patch(site() + '/lists/' + fl.unitsListId + '/items/' + unit.id + '/fields', fields);
    return unit.id;
  }
  // New unit: blank values need not be cleared.
  for (const [k, v] of Object.entries(fields)) if (v === null || v === '') delete fields[k];
  const item = await graph.post(site() + '/lists/' + fl.unitsListId + '/items', { fields });
  return item.id;
}

async function saveMove(graph, fl, m) {
  const fields = mapFields({
    Title: m.sn, Movement: m.movement, MovementDate: spDate(m.date), Facility: m.facility || undefined,
    CustomerUnitSN: m.customerSn || undefined, TrackingNumber: m.tn || undefined, Technician: m.tech || undefined, Notes: m.notes || undefined,
  }, fl.moveCols).fields;
  await graph.post(site() + '/lists/' + fl.movesListId + '/items', { fields });
}

// Uploads one queued action against fresh SharePoint data. Progress is kept on the action,
// so a retry never writes a movement twice.
export async function uploadAction(graph, fl, action, save) {
  const a = structuredClone(action);
  a.progress = a.progress || {};
  const units = await fetchUnits(graph, fl);
  const { units: after, moves } = applyAction(units, a);
  const touched = after.filter((u) => {
    const before = units.find((x) => normSn(x.sn) === normSn(u.sn));
    return !before || JSON.stringify(before) !== JSON.stringify(u);
  });
  if (!a.progress.units) {
    for (const u of touched) await saveUnit(graph, fl, u);
    a.progress.units = true;
    await save(a);
  }
  a.progress.moves = a.progress.moves || 0;
  for (let i = a.progress.moves; i < moves.length; i++) {
    await saveMove(graph, fl, moves[i]);
    a.progress.moves = i + 1;
    await save(a);
  }
  return a;
}

// Called after a service record uploads: if its vaporizer is a fleet unit, record the test.
export async function recordFleetService(graph, rec) {
  const fl = await resolveFleet(graph);
  if (!fl) return null;
  const units = await fetchUnits(graph, fl);
  const unit = units.find((u) => normSn(u.sn) === normSn(rec.values?.vSn));
  if (!unit) return null;
  const older = unit.lastService && rec.date < unit.lastService;
  const { unit: updated, passed } = serviceUpdate(unit, rec);
  if (!older) await saveUnit(graph, fl, updated);
  const what = rec.serviceType === 'Full cleaning and calibration' ? 'Cleaning and calibration' : 'Efficacy test';
  await saveMove(graph, fl, {
    sn: unit.sn, movement: 'Serviced', date: rec.date, tn: rec.tn, tech: rec.tech,
    notes: (passed ? what + ' passed' : what + ' recorded; not all readings or items passed') + (rec.imported ? ' (imported report)' : ''),
  });
  return older ? unit : updated;
}
