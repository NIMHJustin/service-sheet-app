import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractItems, parseReport, inferServiceType, usToIso } from '../src/lib/importPdf.js';
import { readingStats, tolerancePct } from '../src/lib/calc.js';

const load = async (name) => parseReport(await extractItems(new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url))), pdfjs));

test('reads the UC Irvine report completely', async () => {
  const r = await load('UC_Irvine_VE1674.pdf');
  assert.equal(r.ok, true, r.problems.join('; '));
  const x = r.record;
  assert.equal(x.tn, 'J261112B');
  assert.equal(x.date, '2026-11-12');
  assert.equal(x.tech, 'Justin Haynes');
  assert.deepEqual(
    [x.values.facility, x.values.supervisor, x.values.address, x.values.city, x.values.state, x.values.zip],
    ['UC Irvine', 'Dr Kalpna Gupta', '1001 Health Sciences Rd', 'Irvine', 'CA', '92697'],
  );
  assert.deepEqual([x.values.vMfr, x.values.vModel, x.values.vSn, x.values.vAgent, x.values.vFill, x.values.vLoc, x.values.vMon], ['VetEquip', 'Tec 3', 'VE1674', 'Isoflurane', '1/2', 'Common Outlet', 'Riken']);
  assert.deepEqual(x.readings, { a1: '0.89', b1: '0.85', a2: '1.91', b2: '1.87', a3: '3.02', b3: '2.95', a4: '4.22', b4: '3.99', a5: '5.30', b5: '4.99' });
  assert.equal(x.values.pDial, 'OK');
  assert.equal(x.values.pRange, '0-5%');
  assert.equal(x.values.pFillDev, 'Funnel Fill');
  assert.equal(x.values.pPressure, '100mm Hg');
  assert.equal(x.values.pLook, 'OK');
  assert.match(x.comments, /^Vaporizer in for efficacy testing\. .*ready to go back into service!$/);
  assert.equal(x.serviceType, 'Efficacy test');
  assert.equal(x.location, 'Shop');
  assert.equal(x.imported, true);
  assert.equal(readingStats(x.readings, tolerancePct(x.values)).failed, 0);
});

test('Eli Lily: a cleaning and calibration, with no address', async () => {
  const r = await load('Eli_Lily_VE5173.pdf');
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.record.tn, 'J261112D');
  assert.equal(r.record.values.facility, 'Eli Lily');
  assert.equal(r.record.values.state, 'CA');
  assert.equal(r.record.values.address, undefined);
  assert.equal(r.record.values.zip, undefined);
  assert.equal(r.record.serviceType, 'Full cleaning and calibration');
  assert.match(r.record.comments, /Calibration performed, unit is in spec/);
  assert.deepEqual(r.record.parts.map((p) => p.no), ['108104', '108105', '108107']);
});

test('Labcorp: failed readings and a failed dial stop; recommending a CC is not doing one', async () => {
  const r = await load('Labcorp_VE6423RC2.pdf');
  assert.equal(r.ok, true, r.problems.join('; '));
  const x = r.record;
  assert.equal(x.values.vSn, 'VE6423RC2');
  assert.equal(x.values.pDial, 'Fail');
  assert.equal(x.readings.a5, '6.02');
  assert.equal(readingStats(x.readings, 15).failed, 10);
  assert.equal(x.serviceType, 'Efficacy test');
  assert.equal(x.date, '2026-11-16');
});

test('service type from comments', () => {
  assert.equal(inferServiceType('Vaporizer in for CC. Replaced seals.'), 'Full cleaning and calibration');
  assert.equal(inferServiceType('Vaporizer in for full cleaning and calibration.'), 'Full cleaning and calibration');
  assert.equal(inferServiceType('Failed efficacy. Full CC performed, unit in spec.'), 'Full cleaning and calibration');
  assert.equal(inferServiceType('Outputs high. Recommend full CC.'), 'Efficacy test');
  assert.equal(inferServiceType('Needs calibration.'), 'Efficacy test');
  assert.equal(inferServiceType(''), 'Efficacy test');
  assert.equal(usToIso('3/9/26'), '2026-03-09');
});

test('a page that is not a vaporizer report is refused', () => {
  const r = parseReport([{ x: 50, y: 760, str: 'ANESTHESIA MACHINE CERTIFICATION' }]);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /Not a Vaporizer Efficacy Test/);
});
