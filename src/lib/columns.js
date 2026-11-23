// Matches the app's field names to the real SharePoint columns.
// SharePoint keeps a column's first name as its internal name forever, so a column that was
// renamed, or created with spaces ("Certificate URL"), has a different internal name.
// We look the columns up and match by internal name first, then by display name.

// Columns the app can live without: if they are missing, the value is skipped instead of failing.
export const OPTIONAL = new Set(['CertificateUrl']);

const norm = (s) => String(s || '')
  .replace(/_x([0-9a-f]{4})_/gi, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export async function loadColumns(graph, listPath) {
  const res = await graph.get(listPath + '/columns');
  return (res.value || []).filter((c) => !c.hidden);
}

// Marks a field to be emptied in SharePoint (a plain null or undefined is simply not sent).
export const CLEAR = '\u0000clear';

// Converts a value to what the column's type accepts. Returns { value } or { skip: reason }.
export function coerce(col, v) {
  if (v === CLEAR) return { value: col.text ? '' : null };
  if (v === undefined || v === null) return { skip: 'empty' };
  if (col.personOrGroup || col.lookup || col.calculated || col.term || col.geolocation || col.thumbnail || col.contentApprovalStatus) {
    return { skip: 'column type cannot be written' };
  }
  if (col.hyperlinkOrPicture) return { skip: 'Hyperlink columns cannot be written' };
  if (col.boolean) {
    if (typeof v === 'boolean') return { value: v };
    return { value: /^(yes|true|1|present)$/i.test(String(v).trim()) };
  }
  if (col.number || col.currency) {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
    return Number.isFinite(n) ? { value: n } : { skip: 'not a number' };
  }
  if (col.dateTime) return { value: v };
  if (col.choice) {
    const choices = col.choice.choices || [];
    const hit = choices.find((c) => norm(c) === norm(v));
    if (hit !== undefined) return { value: hit };
    if (col.choice.allowTextEntry) return { value: String(v) };
    return { skip: '"' + v + '" is not one of its choices' };
  }
  if (!col.text) return { value: v }; // unknown type: send as is
  // text (single or multiple lines): send as text, within the column's limit
  let s = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  const max = col.text?.allowMultipleLines ? 0 : (col.text?.maxLength || 255);
  if (max && s.length > max) return { value: s.slice(0, max - 1) + '…', note: 'shortened to fit' };
  return { value: s };
}

// fields: { AppName: value }  ->  { fields: { internalName: value }, missing: [AppName], skipped: [AppName] }
export function mapFields(fields, columns) {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const byNorm = new Map();
  for (const c of columns) {
    for (const key of [norm(c.displayName), norm(c.name)]) if (key && !byNorm.has(key)) byNorm.set(key, c);
  }
  const out = {};
  const missing = [];
  const skipped = [];
  const notes = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'Title') { out.Title = v; continue; }
    const col = byName.get(k) || byNorm.get(norm(k));
    if (!col || col.readOnly) {
      if (OPTIONAL.has(k)) skipped.push(k); else missing.push(k);
      continue;
    }
    const c = coerce(col, v);
    if (c.skip) {
      skipped.push(k);
      if (c.skip !== 'empty') notes.push(k + ' not saved: ' + c.skip);
      continue;
    }
    if (c.note) notes.push(k + ' ' + c.note);
    out[col.name] = c.value;
  }
  return { fields: out, missing, skipped, notes };
}

export function missingMessage(where, missing) {
  const names = missing.map((m) => '"' + m + '"').join(', ');
  return 'SharePoint ' + where + ' is missing ' + (missing.length === 1 ? 'the column ' : 'these columns: ') + names
    + '. Add ' + (missing.length === 1 ? 'it' : 'them') + ' as described in the SharePoint setup doc, then choose Try again.';
}

// Every column the app writes, so a missing one is reported before anything is uploaded.
export const RECORD_COLUMNS = [
  'RecordType', 'ServiceDate', 'Technician', 'ServiceCharge', 'Facility', 'Supervisor', 'Address', 'City', 'State', 'Zip',
  'Phone', 'RoomNumber', 'MachineMfr', 'MachineModel', 'MachineSN', 'VapMfr', 'VapModel', 'VapSN', 'Agent', 'FillLevel',
  'TestLocation', 'MonitorUsed', 'TolerancePct',
  'Out1LPM_1', 'Out1LPM_2', 'Out1LPM_3', 'Out1LPM_4', 'Out1LPM_5', 'Out4LPM_1', 'Out4LPM_2', 'Out4LPM_3', 'Out4LPM_4', 'Out4LPM_5',
  'ReadingsFailed', 'ItemsFailed', 'InspectionDetails', 'ConcentratorPresent', 'ConcMake', 'ConcSN', 'ConcO2Pct', 'ConcPsi',
  'ConcComments', 'AbsorberPresent', 'Comments', 'PartsSummary', 'PartsSubtotal', 'AttachmentCount', 'CertificateUrl',
  'LeakO2', 'LeakYoke', 'LeakFlowmeter', 'LeakVaporizer', 'LeakAbsorber',
];
export const PART_COLUMNS = ['ItemNumber', 'Description', 'Quantity', 'UnitPrice', 'Amount', 'ServiceDate', 'Facility'];
export const CERTIFICATE_COLUMNS = ['TrackingNumber', 'RecordType', 'Facility', 'VapSN', 'ServiceDate'];

export function missingColumns(expected, columns) {
  const probe = Object.fromEntries(expected.map((k) => [k, 'x']));
  return mapFields(probe, columns).missing;
}
