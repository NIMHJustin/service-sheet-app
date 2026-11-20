import test from 'node:test';
import assert from 'node:assert/strict';
import { tolerancePct, judge, readingStats, nextTrackingNumber, initials, safeName, certificateFileName, certificateFolder, partsSubtotal, itemsFailed } from '../src/lib/calc.js';
import { recordFields, partFields, inspectionDetails } from '../src/lib/fields.js';
import { uploadRecord } from '../src/lib/upload.js';
import { makeGraph, GraphError } from '../src/lib/graph.js';
import { samples } from './samples.mjs';

test('tolerance is 20% for Penlon or Sigma Delta, else 15%', () => {
  assert.equal(tolerancePct({ vMfr: 'VetEquip', vModel: 'Tec 3' }), 15);
  assert.equal(tolerancePct({ vMfr: ' penlon ' }), 20);
  assert.equal(tolerancePct({ vMfr: 'Other', vModel: 'sigma  delta' }), 20);
});

test('pass/fail matches the spreadsheet formulas', () => {
  assert.equal(judge('1.15', 1, 15), true);
  assert.equal(judge('1.16', 1, 15), false);
  assert.equal(judge('0.85', 1, 15), true);
  assert.equal(judge('0.88', 1, 20), true);
  assert.equal(judge('5.75', 5, 15), true);
  assert.equal(judge('', 1, 15), null);
  assert.equal(judge('abc', 1, 15), null);
  const st = readingStats(samples.sareptaBoth.readings, 15);
  assert.deepEqual(st, { entered: 10, failed: 0 });
});

test('tracking numbers: two initials, date, next free letter', () => {
  assert.equal(initials('Justin Haynes'), 'JH');
  assert.equal(initials('John Vigil'), 'JV');
  assert.equal(nextTrackingNumber('Justin Haynes', '2026-11-20', []), 'JH261120A');
  assert.equal(nextTrackingNumber('Justin Haynes', '2026-11-20', ['JH261120A', 'JH261120B']), 'JH261120C');
});

test('file and folder names are safe for SharePoint', () => {
  assert.equal(safeName('VE2977 RC2'), 'VE2977_RC2');
  assert.equal(safeName('A/B: "C"?'), 'A_B_C');
  assert.equal(certificateFileName(samples.cedars), 'Cedars-Sinai_VE2977_RC2_JH261109B.pdf');
  assert.equal(certificateFolder(samples.cedars), '2026/Cedars-Sinai');
});

test('record fields map to the SharePoint columns', () => {
  const f = recordFields(samples.cedars, 'https://x/y.pdf');
  assert.equal(f.Title, 'JH261109B');
  assert.equal(f.RecordType, 'Machine + vaporizer');
  assert.equal(f.ServiceDate, '2026-11-09T12:00:00Z');
  assert.equal(f.ServiceCharge, 225);
  assert.equal(f.Out1LPM_2, 1.92);
  assert.equal(f.Out4LPM_5, 4.98);
  assert.equal(f.TolerancePct, 15);
  assert.equal(f.ReadingsFailed, 0);
  assert.equal(f.ConcentratorPresent, false);
  assert.equal(f.LeakO2, 'OK');
  assert.equal(f.LeakYoke, 'N/A');
  assert.equal(f.LeakAbsorber, undefined); // absorber not present
  assert.equal(f.CertificateUrl, 'https://x/y.pdf');
  assert.equal(f.PartsSubtotal, 202);
  assert.equal(f.PartsSummary, '421103 x1, 171434 x2');
  assert.equal(f.Phone, undefined);
  for (const v of Object.values(f)) assert.notEqual(v, '');
  const vap = recordFields(samples.clemsonPenlon, '');
  assert.equal(vap.RecordType, 'Vaporizer only');
  assert.equal(vap.TolerancePct, 20);
  assert.equal(vap.LeakVaporizer, 'OK');
  assert.equal(vap.LeakO2, undefined);
  assert.equal(vap.MachineMfr, undefined);
  assert.equal(vap.ConcentratorPresent, undefined);
  const both = recordFields(samples.sareptaBoth, '');
  assert.equal(both.ConcO2Pct, 95);
  assert.equal(both.ConcPsi, 16);
  assert.equal(both.LeakAbsorber, 'OK');
  assert.match(inspectionDetails(samples.sareptaBoth), /Manometer, calibration check: OK/);
});

test('parts rows and subtotal; custom parts carry no price', () => {
  assert.equal(partsSubtotal(samples.cedars.parts), 202);
  const p = partFields(samples.sareptaBoth, samples.sareptaBoth.parts[0]);
  assert.equal(p.ItemNumber, 'Custom');
  assert.equal(p.UnitPrice, undefined);
  assert.equal(p.Amount, undefined);
  assert.equal(p.Quantity, 1);
});

test('items marked Fail are counted', () => {
  const r = structuredClone(samples.cedars);
  r.values.o2Leak = 'Fail';
  r.values.fRates = 'Fail';
  assert.equal(itemsFailed(r), 2);
});

// ---- upload against a fake SharePoint ----

function fakeSharePoint({ failRecordOnce = false, duplicate = false } = {}) {
  const state = { files: {}, records: [], parts: [], patched: 0, failed: false };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, opts) => {
    const u = decodeURIComponent(url);
    if (u.includes('/lists?')) return json(200, { value: [{ id: 'L1', displayName: 'Service Records' }, { id: 'L2', displayName: 'Parts Used' }] });
    if (u.includes('/drives?')) return json(200, { value: [{ id: 'D1', name: 'Documents' }, { id: 'D2', name: 'Service Certificates' }] });
    if (opts.method === 'PUT' && u.includes('/drives/D2/root:/')) {
      const path = u.split('/root:/')[1].split(':/content')[0];
      state.files[path] = true;
      return json(201, { id: 'F' + Object.keys(state.files).length, webUrl: 'https://sp/' + path });
    }
    if (opts.method === 'PATCH' && u.includes('/listItem/fields')) { state.patched++; return json(200, {}); }
    if (opts.method === 'POST' && u.includes('/lists/L1/items')) {
      if (failRecordOnce && !state.failed) { state.failed = true; return json(500, { error: { code: 'generalException', message: 'boom' } }); }
      const body = JSON.parse(opts.body);
      if (duplicate || state.records.some((r) => r.Title === body.fields.Title)) return json(409, { error: { code: 'nameAlreadyExists', message: 'duplicate value' } });
      state.records.push(body.fields);
      return json(201, { id: 'R' + state.records.length });
    }
    if (opts.method === 'GET' && u.includes('/lists/L1/items')) return json(200, { value: state.records.map((f, i) => ({ id: 'R' + (i + 1), fields: f })) });
    if (opts.method === 'POST' && u.includes('/lists/L2/items')) { state.parts.push(JSON.parse(opts.body).fields); return json(201, { id: 'P' + state.parts.length }); }
    if (opts.method === 'GET' && u.includes('/lists/L2/items')) return json(200, { value: state.parts.map((_, i) => ({ id: 'P' + i })) });
    return json(404, { error: { code: 'notFound', message: 'no route ' + u } });
  };
  return { state, graph: makeGraph(async () => 'tok', fetchImpl) };
}

function deps(graph) {
  const saved = [];
  let cache = null;
  return {
    saved,
    d: {
      graph,
      cache: { get: () => cache, set: (v) => { cache = v; } },
      getFile: async () => new Blob(['x'], { type: 'image/jpeg' }),
      save: async (r) => { saved.push(structuredClone(r)); },
      makePdf: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    },
  };
}

test('upload creates the certificate, attachments, record and parts once', async () => {
  const sp = fakeSharePoint();
  const { d } = deps(sp.graph);
  const rec = { ...structuredClone(samples.cedars), id: '1', status: 'pending', files: [{ id: 'f1', name: 'leak photo.jpg' }] };
  const out = await uploadRecord(rec, d);
  assert.equal(out.status, 'uploaded', out.error);
  assert.ok(sp.state.files['2026/Cedars-Sinai/Cedars-Sinai_VE2977_RC2_JH261109B.pdf']);
  assert.ok(sp.state.files['2026/Cedars-Sinai/JH261109B attachments/leak_photo.jpg']);
  assert.equal(sp.state.records.length, 1);
  assert.equal(sp.state.records[0].CertificateUrl, 'https://sp/2026/Cedars-Sinai/Cedars-Sinai_VE2977_RC2_JH261109B.pdf');
  assert.equal(sp.state.parts.length, 2);
  assert.equal(sp.state.patched, 1);
});

test('an interrupted upload resumes without duplicating anything', async () => {
  const sp = fakeSharePoint({ failRecordOnce: true });
  const { d } = deps(sp.graph);
  const rec = { ...structuredClone(samples.cedars), id: '1', status: 'pending' };
  const first = await uploadRecord(rec, d);
  assert.equal(first.status, 'error');
  assert.ok(first.progress.pdf);
  const second = await uploadRecord(first, d);
  assert.equal(second.status, 'uploaded', second.error);
  assert.equal(Object.keys(sp.state.files).length, 1);
  assert.equal(sp.state.records.length, 1);
  assert.equal(sp.state.parts.length, 2);
});

test('a record already in SharePoint with the same serial is adopted, a different one is refused', async () => {
  const sp = fakeSharePoint();
  const { d } = deps(sp.graph);
  sp.state.records.push({ Title: 'JH261109B', VapSN: 'VE2977 RC2' });
  const ok = await uploadRecord({ ...structuredClone(samples.cedars), id: '1', status: 'pending', parts: [] }, d);
  assert.equal(ok.status, 'uploaded', ok.error);
  assert.equal(sp.state.records.length, 1);
  const other = { ...structuredClone(samples.cedars), id: '2', status: 'pending', parts: [] };
  other.values.vSn = 'DIFFERENT';
  const bad = await uploadRecord(other, d);
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /already used/);
});

test('unknown column errors are explained in plain words', async () => {
  const fetchImpl = async (url, opts) => {
    if (url.includes('/lists?')) return new Response(JSON.stringify({ value: [{ id: 'L1', displayName: 'Service Records' }, { id: 'L2', displayName: 'Parts Used' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/drives?')) return new Response(JSON.stringify({ value: [{ id: 'D2', name: 'Service Certificates' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (opts.method === 'PUT') return new Response(JSON.stringify({ id: 'F1', webUrl: 'u' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    if (opts.method === 'PATCH') return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: { code: 'invalidRequest', message: "Field 'LeakYoke' is not recognized" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  };
  const { d } = deps(makeGraph(async () => 'tok', fetchImpl));
  const out = await uploadRecord({ ...structuredClone(samples.cedars), id: '1', status: 'pending' }, d);
  assert.equal(out.status, 'error');
  assert.match(out.error, /no column named "LeakYoke"/);
});
