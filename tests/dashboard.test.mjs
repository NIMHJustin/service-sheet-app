import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, monthsBack, bucketKey, filterRecords } from '../src/lib/dashboard.js';

const rec = (o) => ({ tn: 'T', date: '2026-10-01', facility: 'A', mfr: 'VetEquip', model: 'Tec 3', sn: 'S1', location: 'Field', type: 'Efficacy test', readingsFailed: 0, itemsFailed: 0, details: '', charge: 0, parts: 0, tech: 'J', imported: false, ...o });

test('months and buckets', () => {
  assert.deepEqual(monthsBack(3, '2026-11-25'), ['2026-09', '2026-10', '2026-11']);
  assert.equal(bucketKey('2025-05', new Array(40)), '2025-Q2');
  assert.equal(bucketKey('2025-05', new Array(12)), '2025-05');
});

test('summary numbers', () => {
  const data = {
    records: [
      rec({ tn: 'A1', date: '2026-11-02', location: 'Shop', readingsFailed: 3, sn: 'X1', details: 'Vaporizer, dial stop: Fail\nVaporizer, body: OK' }),
      rec({ tn: 'A2', date: '2026-11-20', location: 'Shop', type: 'Full cleaning and calibration', sn: 'X1', charge: 225, parts: 40 }),
      rec({ tn: 'A3', date: '2026-10-05', facility: 'B', model: 'Tec 5', charge: 100 }),
      rec({ tn: 'A4', date: '2025-11-10', facility: 'C', sn: 'S4' }),
      rec({ tn: 'A5', date: '2023-01-10', facility: 'D', sn: 'S5' }),
    ],
    parts: [{ tn: 'A2', no: '171434', desc: 'Tubing', qty: 2, amount: 13 }],
  };
  const s = summarize(data, { range: '12m', location: 'All', facility: 'All' }, '2026-11-25');
  assert.equal(s.count, 3);
  assert.equal(s.shopCount, 2);
  assert.equal(s.ccCount, 1);
  assert.equal(s.effCount, 2);
  assert.equal(s.passRate, 0.5);
  assert.equal(s.failedTests, 1);
  assert.equal(s.followedByCc, 1);
  assert.equal(s.buckets.length, 12);
  assert.equal(s.volume.shop['2026-11'], 2);
  assert.equal(s.volume.field['2026-10'], 1);
  assert.deepEqual(s.failedItems, [['Vaporizer, dial stop', 1]]);
  assert.deepEqual(s.models[0], ['VetEquip Tec 3', 2]);
  assert.equal(s.revenue.total, 365);
  assert.equal(s.topParts[0].qty, 2);
  const c = s.facilities.find((f) => f.facility === 'C');
  assert.equal(c.due, '2026-11-10');
  assert.ok(c.daysToDue < 0);
  // Annual inspection per vaporizer: the latest service of either type sets the next due date.
  const x1 = s.units.find((u) => u.sn === 'X1');
  assert.equal(x1.lastType, 'Full cleaning and calibration');
  assert.equal(x1.due, '2027-11-20');
  const due = s.units.filter((u) => u.daysToDue <= 30).map((u) => u.sn).sort();
  assert.deepEqual(due, ['S4', 'S5']);
  const onlyC = summarize(data, { range: '12m', location: 'All', facility: 'C' }, '2026-11-25');
  assert.deepEqual(onlyC.units.map((u) => u.sn), ['S4']);
  const shop = summarize(data, { range: 'all', location: 'Shop', facility: 'All' }, '2026-11-25');
  assert.equal(shop.count, 2);
  assert.ok(shop.buckets[0].includes('Q'), 'long ranges group by quarter');
  assert.equal(filterRecords(data.records, { range: '36m' }, '2026-11-25').length, 4);
});
