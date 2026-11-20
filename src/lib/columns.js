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
  const res = await graph.get(listPath + '/columns?$select=name,displayName,readOnly,hyperlinkOrPicture,hidden');
  return (res.value || []).filter((c) => !c.hidden);
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
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'Title') { out.Title = v; continue; }
    const col = byName.get(k) || byNorm.get(norm(k));
    if (!col || col.readOnly) {
      if (OPTIONAL.has(k)) skipped.push(k); else missing.push(k);
      continue;
    }
    if (col.hyperlinkOrPicture) {
      // Microsoft Graph cannot write Hyperlink columns.
      skipped.push(k);
      continue;
    }
    out[col.name] = v;
  }
  return { fields: out, missing, skipped };
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
