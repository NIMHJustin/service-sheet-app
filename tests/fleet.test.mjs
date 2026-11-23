import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, currentUnits, serviceUpdate, fleetAlerts, addMonths, normSn, unitFields, uploadAction, recordFleetService, unitFromItem } from '../src/lib/fleet.js';
import { makeGraph } from '../src/lib/graph.js';
import { CLEAR } from '../src/lib/columns.js';
import { samples } from './samples.mjs';

const base = [
  { id: '1', sn: 'VE1001', fleet: 'Loan', mfr: 'VetEquip', model: 'Tec 3', agent: 'Isoflurane', status: 'In stock', location: 'VetEquip', dateOut: '', dueBack: '', customerSn: '', lastService: '2026-02-01', lastTn: 'JH260201A', nextDue: '2027-02-01', notes: '' },
  { id: '2', sn: 'VE2002', fleet: 'Exchange', mfr: 'VetEquip', model: 'Tec 3', agent: 'Isoflurane', status: 'In stock', location: 'VetEquip', dateOut: '', dueBack: '', customerSn: '', lastService: '2025-12-01', lastTn: '', nextDue: '2026-12-01', notes: '' },
];
const act = (kind, sn, data) => ({ id: 'a', kind, sn, data, date: '2026-11-23', tech: 'Justin Haynes' });

test('dates: add months, clamp month end', () => {
  assert.equal(addMonths('2026-11-23', 12), '2027-11-23');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(normSn('ve-2977 rc2'), 'VE2977RC2');
});

test('loan out and return', () => {
  const out = applyAction(base, act('loanOut', 've1001', { facility: 'Clemson University', customerSn: 'D0322', dueBack: '2026-12-15' }));
  const u = out.units.find((x) => x.sn === 'VE1001');
  assert.equal(u.status, 'Out on loan');
  assert.equal(u.location, 'Clemson University');
  assert.equal(u.dateOut, '2026-11-23');
  assert.equal(u.customerSn, 'D0322');
  assert.deepEqual(out.moves.map((m) => m.movement), ['Loaned out']);
  const back = applyAction(out.units, act('return', 'VE1001', {}));
  const b = back.units.find((x) => x.sn === 'VE1001');
  assert.equal(b.status, 'In stock');
  assert.equal(b.location, 'VetEquip');
  assert.equal(b.dueBack, '');
  assert.equal(back.moves[0].facility, 'Clemson University');
  assert.equal(base[0].status, 'In stock', 'input not changed');
});

test('exchange: our unit goes to the customer, theirs joins the exchange pool in service', () => {
  const r = applyAction(base, act('exchange', 'VE2002', { facility: 'Labcorp', in: { sn: 'CUST-77', mfr: 'Ohio', model: 'Ohio 100F', agent: 'Isoflurane' } }));
  const out = r.units.find((x) => x.sn === 'VE2002');
  const inn = r.units.find((x) => x.sn === 'CUST-77');
  assert.equal(out.status, 'Transferred');
  assert.equal(out.location, 'Labcorp');
  assert.equal(inn.fleet, 'Exchange');
  assert.equal(inn.status, 'In service');
  assert.equal(inn.id, null);
  assert.deepEqual(r.moves.map((m) => m.movement), ['Exchanged out', 'Exchanged in']);
});

test('queued actions show immediately on top of the downloaded copy', () => {
  const q = [act('loanOut', 'VE1001', { facility: 'A' }), act('add', null, { sn: 'NEW1', fleet: 'Loan', lastService: '2026-06-01' })];
  const list = currentUnits(base, q);
  assert.equal(list.find((u) => u.sn === 'VE1001').status, 'Out on loan');
  assert.equal(list.find((u) => u.sn === 'NEW1').nextDue, '2027-06-01');
});

test('a passing efficacy test puts an in-service unit back in stock and sets the next due date', () => {
  const unit = { ...base[1], status: 'In service' };
  const rec = { ...structuredClone(samples.labcorp), date: '2026-11-23', tn: 'JH261123A' };
  const r = serviceUpdate(unit, rec);
  assert.equal(r.passed, true);
  assert.equal(r.unit.status, 'In stock');
  assert.equal(r.unit.nextDue, '2027-11-23');
  assert.equal(r.unit.lastTn, 'JH261123A');
  const bad = structuredClone(rec);
  bad.readings.a1 = '2.5';
  assert.equal(serviceUpdate(unit, bad).unit.status, 'In service');
  assert.equal(serviceUpdate({ ...unit, status: 'Out on loan' }, rec).unit.status, 'Out on loan');
});

test('alerts: overdue loans and tests due within 30 days', () => {
  const units = [
    { ...base[0], status: 'Out on loan', dueBack: '2026-11-01' },
    { ...base[1], nextDue: '2026-12-10' },
    { ...base[1], sn: 'X', status: 'Retired', nextDue: '2020-01-01' },
  ];
  const a = fleetAlerts(units, '2026-11-23');
  assert.equal(a.overdueLoans.length, 1);
  assert.deepEqual(a.testsDue.map((u) => u.sn), ['VE2002']);
});

test('clearing fields on return sends empty values', () => {
  const f = unitFields({ ...base[0], dueBack: '', customerSn: '' });
  assert.equal(f.DueBack, CLEAR);
  assert.equal(f.CustomerUnitSN, CLEAR);
});

// ---- against a fake SharePoint ----

function fakeFleetSharePoint(units) {
  const state = { items: units.map((u, i) => ({ id: String(i + 1), fields: { Title: u.sn, Fleet: u.fleet, Manufacturer: u.mfr, Model: u.model, Agent: u.agent, Status: u.status, Location: u.location, NextServiceDue: u.nextDue ? u.nextDue + 'T12:00:00Z' : undefined } })), moves: [], patches: [] };
  const col = (name, extra = {}) => ({ name, displayName: name, ...extra });
  const unitCols = { value: [col('Title', { text: {} }), col('Fleet', { choice: { choices: ['Loan', 'Exchange'] } }), col('Manufacturer', { text: {} }), col('Model', { text: {} }), col('Agent', { text: {} }), col('Status', { choice: { choices: ['In stock', 'Out on loan', 'In service', 'Transferred', 'Retired'] } }), col('Location', { text: {} }), col('DateOut', { dateTime: {} }), col('DueBack', { dateTime: {} }), col('CustomerUnitSN', { text: {} }), col('LastServiceDate', { dateTime: {} }), col('LastTrackingNumber', { text: {} }), col('NextServiceDue', { dateTime: {} }), col('Notes', { text: { allowMultipleLines: true } })] };
  const moveCols = { value: ['Title', 'Movement', 'MovementDate', 'Facility', 'CustomerUnitSN', 'TrackingNumber', 'Technician', 'Notes'].map((n) => col(n, n === 'MovementDate' ? { dateTime: {} } : n === 'Movement' ? { choice: { choices: ['Added to fleet', 'Loaned out', 'Returned', 'Exchanged out', 'Exchanged in', 'Serviced', 'In service', 'Retired'] } } : { text: {} })) };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, opts) => {
    const u = decodeURIComponent(url);
    if (u.includes('/lists?')) return json(200, { value: [{ id: 'FU', displayName: 'Fleet Vaporizers' }, { id: 'FM', displayName: 'Fleet Movements' }] });
    if (u.includes('/lists/FU/columns')) return json(200, unitCols);
    if (u.includes('/lists/FM/columns')) return json(200, moveCols);
    if (u.includes('/lists/FU/items?')) return json(200, { value: state.items });
    if (opts.method === 'PATCH' && u.includes('/lists/FU/items/')) {
      const id = u.split('/items/')[1].split('/')[0];
      const body = JSON.parse(opts.body);
      state.patches.push(body);
      const it = state.items.find((x) => x.id === id);
      for (const [k, v] of Object.entries(body)) { if (v === null || v === '') delete it.fields[k]; else it.fields[k] = v; }
      return json(200, it.fields);
    }
    if (opts.method === 'POST' && u.includes('/lists/FU/items')) {
      const it = { id: String(state.items.length + 1), fields: JSON.parse(opts.body).fields };
      state.items.push(it);
      return json(201, it);
    }
    if (opts.method === 'POST' && u.includes('/lists/FM/items')) { state.moves.push(JSON.parse(opts.body).fields); return json(201, { id: 'm' }); }
    return json(404, { error: { message: 'no route ' + u } });
  };
  return { state, graph: makeGraph(async () => 'tok', fetchImpl) };
}

test('uploading a loan writes the unit and one movement, and a retry does not repeat the movement', async () => {
  const sp = fakeFleetSharePoint(base);
  const { resolveFleet } = await import('../src/lib/fleet.js');
  const fl = await resolveFleet(sp.graph);
  const a = act('loanOut', 'VE1001', { facility: 'Clemson University', dueBack: '2026-12-15' });
  const done = await uploadAction(sp.graph, fl, a, async () => {});
  assert.equal(sp.state.items[0].fields.Status, 'Out on loan');
  assert.equal(sp.state.items[0].fields.Location, 'Clemson University');
  assert.equal(sp.state.items[0].fields.DueBack, '2026-12-15T12:00:00Z');
  assert.equal(sp.state.moves.length, 1);
  assert.equal(sp.state.moves[0].Movement, 'Loaned out');
  await uploadAction(sp.graph, fl, done, async () => {});
  assert.equal(sp.state.moves.length, 1);
  // return clears the loan fields
  await uploadAction(sp.graph, fl, act('return', 'VE1001', {}), async () => {});
  assert.equal(sp.state.items[0].fields.Status, 'In stock');
  assert.equal(sp.state.items[0].fields.DueBack, undefined);
});

test('an exchange creates the incoming unit in SharePoint', async () => {
  const sp = fakeFleetSharePoint(base);
  const { resolveFleet } = await import('../src/lib/fleet.js');
  const fl = await resolveFleet(sp.graph);
  await uploadAction(sp.graph, fl, act('exchange', 'VE2002', { facility: 'Labcorp', in: { sn: 'CUST-77', mfr: 'Ohio', model: 'Ohio 100F' } }), async () => {});
  assert.equal(sp.state.items.length, 3);
  assert.equal(sp.state.items[2].fields.Title, 'CUST-77');
  assert.equal(sp.state.items[2].fields.Status, 'In service');
  assert.equal(sp.state.items[1].fields.Status, 'Transferred');
  assert.equal(sp.state.moves.length, 2);
});

test('a service record on a fleet serial updates the unit and logs the test', async () => {
  const sp = fakeFleetSharePoint([{ ...base[1], sn: 'VE6423 RC2', status: 'In service' }]);
  const rec = { ...structuredClone(samples.labcorp), date: '2026-11-23', tn: 'JH261123A' };
  const u = await recordFleetService(sp.graph, rec);
  assert.equal(u.status, 'In stock');
  assert.equal(sp.state.items[0].fields.Status, 'In stock');
  assert.equal(sp.state.items[0].fields.NextServiceDue, '2027-11-23T12:00:00Z');
  assert.equal(sp.state.moves[0].Movement, 'Serviced');
  assert.equal(sp.state.moves[0].TrackingNumber, 'JH261123A');
  const none = await recordFleetService(sp.graph, { ...rec, values: { ...rec.values, vSn: 'NOT-FLEET' } });
  assert.equal(none, null);
});

test('rows read back from SharePoint become local units with local dates', () => {
  const u = unitFromItem({ id: '9', fields: { Title: 'A1', Status: 'Out on loan', DueBack: '2026-12-15T05:00:00Z' } });
  assert.equal(u.sn, 'A1');
  assert.equal(u.dueBack.length, 10);
});
