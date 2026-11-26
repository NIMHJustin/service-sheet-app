// Adds parts to records already in SharePoint, found in their comments.

import { SHAREPOINT } from '../config.js';
import { resolveTargets } from './upload.js';
import { loadColumns, mapFields } from './columns.js';
import { partFields, partsSummary } from './fields.js';
import { partsSubtotal } from './calc.js';
import { localDate } from './fleet.js';
import { findParts } from './partsFind.js';

const site = () => '/sites/' + SHAREPOINT.siteId;

async function allItems(graph, path) {
  const out = [];
  let next = path;
  while (next) {
    const res = await graph.get(next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, ''));
    out.push(...(res.value || []));
    next = res['@odata.nextLink'] || null;
  }
  return out;
}

// Records whose comments mention parts but that have no Parts Used rows yet.
export async function findBackfill(graph, cache) {
  const t = await resolveTargets(graph, cache);
  const rCols = await loadColumns(graph, site() + '/lists/' + t.recordsListId);
  const name = (n) => Object.keys(mapFields({ [n]: 'x' }, rCols).fields)[0] || n;
  const [cComments, cDate, cFacility] = [name('Comments'), name('ServiceDate'), name('Facility')];
  const records = await allItems(graph, site() + '/lists/' + t.recordsListId + '/items?$expand=fields&$top=999');
  const parts = await allItems(graph, site() + '/lists/' + t.partsListId + '/items?$expand=fields($select=Title)&$select=id&$top=999');
  const withParts = new Set(parts.map((p) => String(p.fields?.Title || '').toUpperCase()));
  const out = [];
  for (const it of records) {
    const f = it.fields || {};
    const tn = String(f.Title || '');
    if (!tn || withParts.has(tn.toUpperCase())) continue;
    const comments = String(f[cComments] || '');
    const found = findParts(comments);
    if (!found.length) continue;
    out.push({ itemId: it.id, tn, date: localDate(f[cDate]), facility: String(f[cFacility] || ''), comments, parts: found, include: true });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Writes the parts for one record: one Parts Used row each, then the record's summary and subtotal.
// `done` counts rows already written, so a retry continues where it stopped.
export async function applyBackfill(graph, cache, cand, done = 0, onRow) {
  const t = await resolveTargets(graph, cache);
  const pCols = await loadColumns(graph, site() + '/lists/' + t.partsListId);
  const rCols = await loadColumns(graph, site() + '/lists/' + t.recordsListId);
  const rec = { tn: cand.tn, date: cand.date, values: { facility: cand.facility } };
  for (let i = done; i < cand.parts.length; i++) {
    await graph.post(site() + '/lists/' + t.partsListId + '/items', { fields: mapFields(partFields(rec, cand.parts[i]), pCols).fields });
    onRow?.(i + 1);
  }
  const summary = mapFields({
    PartsSummary: partsSummary(cand.parts),
    PartsSubtotal: Math.round(partsSubtotal(cand.parts) * 100) / 100,
  }, rCols).fields;
  await graph.patch(site() + '/lists/' + t.recordsListId + '/items/' + cand.itemId + '/fields', summary);
}
