import test from 'node:test';
import assert from 'node:assert/strict';
import { findParts, CATALOG } from '../src/lib/partsFind.js';

const names = (c) => findParts(c).map((p) => p.no + ' x' + p.qty).sort();

test('the catalog includes the vaporizer parts with sale prices and wick pricing', () => {
  const useal = CATALOG.find((r) => r[0] === '108104');
  assert.equal(useal[2], 2.2);
  assert.match(useal[1], /U-Seal \(2300-0032\)/);
  const wick = CATALOG.find((r) => r[0] === '108118');
  assert.equal(wick[2], 9.77);
  assert.ok(CATALOG.find((r) => r[0] === '171434'), 'price list still there');
});

test('Eli Lily comments: three parts', () => {
  assert.deepEqual(names('Vaporizer in for CC. Replaced worn out U-Seal, Thrustwasher, and thermal cover O-Ring. Calibration performed, unit is in spec and ready to go back into service!'),
    ['108104 x1', '108105 x1', '108107 x1']);
});

test('Cedars comments: numbers with quantities, named parts, and unknown numbers', () => {
  const p = findParts('Machine arrived with a leak out of Ports 1 and 6. New switches (401040x2, 150170x2, and 150160x2) installed. Regulator bleeding at a high level, new regulator (421103) installed. Old, dried out tubing replaced (171434). Vaporizer required new leaf spring, u-seal, thrustwasher, and thermocover o-ring to verify outputs.');
  const got = p.map((x) => x.no + ' x' + x.qty).sort();
  assert.deepEqual(got, ['108104 x1', '108105 x1', '108107 x1', '108115 x1', '150160 x2', '150170 x2', '171434 x1', '401040 x2', '421103 x1']);
  assert.equal(p.find((x) => x.no === '401040').price, 36.7);
  assert.equal(p.find((x) => x.no === '150170').price, null);
});

test('recommendations and plain efficacy notes add nothing', () => {
  assert.deepEqual(names('Vaporizer in for efficacy testing. Vap dial was very tight. Recommend full CC and new U-seal.'), []);
  assert.deepEqual(names('Vaporizer in for efficacy testing. Unit leak tested and efficacy results are optimal.'), []);
  assert.deepEqual(names('Sight glass cracked, needs replacing.'), []);
});

test('wicks and quantities in words', () => {
  assert.deepEqual(names('Full CC performed. Replaced both wicks and two u-seals.'), ['108104 x2', '108118 x1', '108119 x1']);
  assert.deepEqual(names('New inner wick and wick spring installed.'), ['108119 x1', '108120 x1']);
});

import { findBackfill, applyBackfill } from '../src/lib/backfill.js';
import { makeGraph } from '../src/lib/graph.js';
import { RECORD_COLUMNS, PART_COLUMNS } from '../src/lib/columns.js';

test('backfill: suggests parts for uploaded records without Parts Used rows, then writes them once', async () => {
  const records = [
    { id: '1', fields: { Title: 'J261112D', ServiceDate: '2026-11-12T12:00:00Z', Facility: 'Eli Lilly', Comments: 'Vaporizer in for CC. Replaced worn out U-Seal, Thrustwasher, and thermal cover O-Ring.' } },
    { id: '2', fields: { Title: 'J261112B', ServiceDate: '2026-11-12T12:00:00Z', Facility: 'UC Irvine', Comments: 'Vaporizer in for efficacy testing. Results optimal.' } },
    { id: '3', fields: { Title: 'JH261120A', ServiceDate: '2026-11-20T12:00:00Z', Facility: 'X', Comments: 'Replaced u-seal.' } },
  ];
  const partsRows = [{ id: 'p1', fields: { Title: 'JH261120A' } }];
  const posted = [], patched = [];
  const col = (n, extra = {}) => ({ name: n, displayName: n, ...extra });
  const num = new Set(['Quantity', 'UnitPrice', 'Amount', 'PartsSubtotal']);
  const cols = (names) => ({ value: [col('Title', { text: {} }), ...names.map((n) => col(n, num.has(n) ? { number: {} } : n === 'ServiceDate' ? { dateTime: {} } : { text: { allowMultipleLines: true } }))] });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, opts) => {
    const u = decodeURIComponent(url);
    if (u.includes('/lists?')) return json(200, { value: [{ id: 'L1', displayName: 'Service Records' }, { id: 'L2', displayName: 'Parts Used' }] });
    if (u.includes('/drives?')) return json(200, { value: [{ id: 'D2', name: 'Service Certificates' }] });
    if (u.includes('/drives/D2/list')) return json(200, { id: 'L3' });
    if (u.includes('/lists/L1/columns')) return json(200, cols(RECORD_COLUMNS));
    if (u.includes('/lists/L2/columns')) return json(200, cols(PART_COLUMNS));
    if (opts.method === 'GET' && u.includes('/lists/L1/items')) return json(200, { value: records });
    if (opts.method === 'GET' && u.includes('/lists/L2/items')) return json(200, { value: partsRows });
    if (opts.method === 'POST' && u.includes('/lists/L2/items')) { posted.push(JSON.parse(opts.body).fields); return json(201, { id: 'n' }); }
    if (opts.method === 'PATCH' && u.includes('/lists/L1/items/')) { patched.push(JSON.parse(opts.body)); return json(200, {}); }
    return json(404, { error: { message: 'no route ' + u } });
  };
  const graph = makeGraph(async () => 't', fetchImpl);
  let c = null;
  const cache = { get: () => c, set: (v) => { c = v; } };
  const cands = await findBackfill(graph, cache);
  assert.deepEqual(cands.map((x) => x.tn), ['J261112D']);
  assert.equal(cands[0].parts.length, 3);
  await applyBackfill(graph, cache, cands[0]);
  assert.equal(posted.length, 3);
  assert.equal(posted[0].Title, 'J261112D');
  assert.equal(posted[0].Facility, 'Eli Lilly');
  assert.equal(patched[0].PartsSummary, '108104 x1, 108105 x1, 108107 x1');
  assert.equal(patched[0].PartsSubtotal, 9.8);
});
