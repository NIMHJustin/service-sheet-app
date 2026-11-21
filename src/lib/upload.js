// Uploads a submitted record to SharePoint in retry-safe steps.
// Each finished step is saved on the record, so an interrupted upload resumes where it stopped
// and never creates a second copy of anything.

import { SHAREPOINT } from '../config.js';
import { encodePath, GraphError } from './graph.js';
import { recordFields, partFields, certificateFields } from './fields.js';
import { certificateFileName, certificateFolder, safeName } from './calc.js';
import { loadColumns, mapFields, missingColumns, missingMessage, RECORD_COLUMNS, PART_COLUMNS, CERTIFICATE_COLUMNS } from './columns.js';

const SMALL = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 10; // upload sessions need multiples of 320 KiB

const site = () => '/sites/' + SHAREPOINT.siteId;

export async function resolveTargets(graph, cache) {
  const hit = cache?.get();
  if (hit?.recordsListId && hit?.partsListId && hit?.driveId && hit?.libraryListId) return hit;
  const lists = await graph.get(site() + '/lists?$select=id,displayName&$top=200');
  const byName = (n) => lists.value.find((l) => l.displayName.toLowerCase() === n.toLowerCase())?.id;
  const drives = await graph.get(site() + '/drives?$select=id,name');
  const drive = drives.value.find((d) => d.name.toLowerCase() === SHAREPOINT.certificatesLibrary.toLowerCase());
  const t = { recordsListId: byName(SHAREPOINT.recordsList), partsListId: byName(SHAREPOINT.partsList), driveId: drive?.id };
  const missing = [];
  if (!t.recordsListId) missing.push('the "' + SHAREPOINT.recordsList + '" list');
  if (!t.partsListId) missing.push('the "' + SHAREPOINT.partsList + '" list');
  if (!t.driveId) missing.push('the "' + SHAREPOINT.certificatesLibrary + '" library');
  if (missing.length) throw new Error('SharePoint is missing ' + missing.join(', ') + '.');
  t.libraryListId = (await graph.get('/drives/' + t.driveId + '/list?$select=id')).id;
  cache?.set(t);
  return t;
}

async function uploadBlob(graph, driveId, path, blob) {
  const p = '/drives/' + driveId + '/root:/' + encodePath(path) + ':';
  if (blob.size <= SMALL) {
    return graph.put(p + '/content?@microsoft.graph.conflictBehavior=replace', blob);
  }
  const session = await graph.post(p + '/createUploadSession', { item: { '@microsoft.graph.conflictBehavior': 'replace' } });
  let item = null;
  for (let start = 0; start < blob.size; start += CHUNK) {
    const end = Math.min(start + CHUNK, blob.size);
    const res = await graph.call('PUT', session.uploadUrl, {
      absolute: true,
      auth: false,
      body: blob.slice(start, end),
      headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + blob.size },
      raw: true,
    });
    if (res.status === 200 || res.status === 201) item = await res.json();
  }
  return item;
}

function explain(e) {
  if (e instanceof GraphError) {
    const m = e.message || '';
    const field = m.match(/Field '([^']+)' is not recognized/i) || m.match(/column '([^']+)' does not exist/i);
    if (field) return 'SharePoint has no column named "' + field[1] + '". Check the column names in the SharePoint setup doc.';
    if (e.status === 403) return 'SharePoint refused access (403). Check the app\'s site permission and that you are a member of the Service Records site.';
    if (e.status === 404) return 'SharePoint could not find the site, list or library (404).';
    return 'SharePoint error ' + e.status + ': ' + m;
  }
  return e?.message || String(e);
}

async function findRecordItem(graph, listId, tn, vapSnName = 'VapSN') {
  const res = await graph.get(
    site() + '/lists/' + listId + '/items?$expand=fields($select=Title,' + vapSnName + ")&$filter=fields/Title eq '" + tn.replace(/'/g, "''") + "'",
    { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } },
  );
  return res.value?.[0] || null;
}

async function countParts(graph, listId, tn) {
  try {
    const res = await graph.get(
      site() + '/lists/' + listId + "/items?$select=id&$filter=fields/Title eq '" + tn.replace(/'/g, "''") + "'&$top=500",
      { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } },
    );
    return res.value?.length || 0;
  } catch {
    return null;
  }
}

// deps: { graph, cache, getFile(id) -> Blob, save(rec), makePdf(rec) -> Blob, onStep(rec, text) }
export async function uploadRecord(input, deps) {
  const rec = structuredClone(input);
  rec.progress = rec.progress || {};
  let stage = 'Connecting to SharePoint';
  const notes = new Set();
  const map = (fields, columns) => {
    const m = mapFields(fields, columns);
    for (const n of m.notes) notes.add(n);
    return m.fields;
  };
  const step = async (text) => {
    if (/^(Uploading|Saving|Labelling)/.test(text)) stage = text;
    await deps.save(rec);
    deps.onStep?.(rec, text);
  };
  try {
    const t = await resolveTargets(deps.graph, deps.cache);
    const cols = {
      records: await loadColumns(deps.graph, site() + '/lists/' + t.recordsListId),
      parts: await loadColumns(deps.graph, site() + '/lists/' + t.partsListId),
      library: await loadColumns(deps.graph, site() + '/lists/' + t.libraryListId),
    };
    const problems = [];
    const mr = missingColumns(RECORD_COLUMNS, cols.records);
    const mp = missingColumns(PART_COLUMNS, cols.parts);
    const ml = missingColumns(CERTIFICATE_COLUMNS, cols.library);
    if (mr.length) problems.push(missingMessage('list "' + SHAREPOINT.recordsList + '"', mr));
    if (mp.length) problems.push(missingMessage('list "' + SHAREPOINT.partsList + '"', mp));
    if (ml.length) problems.push(missingMessage('library "' + SHAREPOINT.certificatesLibrary + '"', ml));
    if (problems.length) throw new Error(problems.join(' '));
    const vapSnCol = mapFields({ VapSN: 'x' }, cols.records).fields;
    const vapSnName = Object.keys(vapSnCol)[0] || 'VapSN';
    const folder = certificateFolder(rec);

    // 1. Certificate PDF
    if (!rec.progress.pdf) {
      await step('Uploading certificate');
      const blob = await deps.makePdf(rec);
      const item = await uploadBlob(deps.graph, t.driveId, folder + '/' + certificateFileName(rec), blob);
      rec.progress.pdf = { id: item.id, webUrl: item.webUrl };
      await step('Certificate uploaded');
    }
    if (!rec.progress.pdfFields) {
      await step('Labelling the certificate');
      await deps.graph.patch('/drives/' + t.driveId + '/items/' + rec.progress.pdf.id + '/listItem/fields', map(certificateFields(rec), cols.library));
      rec.progress.pdfFields = true;
      await step('Certificate labelled');
    }

    // 2. Attachments
    rec.progress.files = rec.progress.files || {};
    for (const f of rec.files || []) {
      if (rec.progress.files[f.id]) continue;
      await step('Uploading ' + f.name);
      const blob = await deps.getFile(f.id);
      if (!blob) throw new Error('The attachment "' + f.name + '" is missing from this tablet.');
      const item = await uploadBlob(deps.graph, t.driveId, folder + '/' + rec.tn + ' attachments/' + safeName(f.name.replace(/\.[^.]+$/, '')) + (f.name.match(/\.[^.]+$/)?.[0] || ''), blob);
      rec.progress.files[f.id] = item?.webUrl || true;
      await step(f.name + ' uploaded');
    }

    // 3. Service Records row
    if (!rec.progress.recordId) {
      await step('Saving the record');
      try {
        const item = await deps.graph.post(site() + '/lists/' + t.recordsListId + '/items', { fields: map(recordFields(rec, rec.progress.pdf.webUrl), cols.records) });
        rec.progress.recordId = item.id;
      } catch (e) {
        const dup = e instanceof GraphError && (e.status === 409 || /duplicate|unique/i.test(e.message));
        if (!dup) throw e;
        const existing = await findRecordItem(deps.graph, t.recordsListId, rec.tn, vapSnName);
        const same = existing && String(existing.fields?.[vapSnName] || '').trim() === String(rec.values?.vSn || '').trim();
        if (!same) throw new Error('Tracking number ' + rec.tn + ' is already used by a different record in SharePoint.');
        rec.progress.recordId = existing.id;
      }
      await step('Record saved');
    }

    // 4. Parts Used rows
    const parts = rec.parts || [];
    if ((rec.progress.partsDone || 0) < parts.length) {
      if (rec.progress.partsStarted) {
        const n = await countParts(deps.graph, t.partsListId, rec.tn);
        if (n !== null && n > (rec.progress.partsDone || 0)) rec.progress.partsDone = Math.min(n, parts.length);
      }
      rec.progress.partsStarted = true;
      for (let i = rec.progress.partsDone || 0; i < parts.length; i++) {
        await step('Saving part ' + (i + 1) + ' of ' + parts.length);
        await deps.graph.post(site() + '/lists/' + t.partsListId + '/items', { fields: map(partFields(rec, parts[i]), cols.parts) });
        rec.progress.partsDone = i + 1;
        await step('Part ' + (i + 1) + ' saved');
      }
    }

    rec.status = 'uploaded';
    rec.uploadedAt = new Date().toISOString();
    rec.error = null;
    rec.notes = [...notes];
    await step('Uploaded');
    return rec;
  } catch (e) {
    if (e?.name === 'SignInNeeded' || e?.name === 'Offline') {
      rec.status = 'pending';
      rec.error = null;
      await deps.save(rec);
      throw e;
    }
    rec.status = 'error';
    rec.error = stage + ': ' + explain(e);
    await deps.save(rec);
    deps.onStep?.(rec, rec.error);
    return rec;
  }
}
