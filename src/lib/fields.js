// Maps a record to the SharePoint columns of Service Records and Parts Used.

import { checklistItems, LEAK_COLUMNS } from '../data/forms.js';
import { tolerancePct, parseNum, readingStats, itemsFailed, partsSubtotal } from './calc.js';

const txt = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
};

// Date-only columns: noon UTC keeps the day the same in every US time zone.
export const spDate = (iso) => (iso ? iso + 'T12:00:00Z' : undefined);

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

export function inspectionDetails(record) {
  return checklistItems(record)
    .filter((i) => i.value)
    .map((i) => i.group + ', ' + i.label.toLowerCase() + ': ' + i.value)
    .join('\n');
}

export function partsSummary(parts = []) {
  return parts.map((p) => (p.no === 'Custom' || !p.no ? p.desc : p.no) + ' x' + p.qty).join(', ');
}

export function recordFields(record, certificateUrl) {
  const v = record.values || {};
  const r = record.readings || {};
  const full = record.mode === 'full';
  const tol = tolerancePct(v);
  const stats = readingStats(r, tol);
  const f = {
    Title: record.tn,
    RecordType: full ? 'Machine + vaporizer' : 'Vaporizer only',
    ServiceDate: spDate(record.date),
    Technician: txt(record.tech),
    ServiceCharge: parseNum(record.fee) ?? undefined,
    Facility: txt(v.facility),
    Supervisor: txt(v.supervisor),
    Address: txt(v.address),
    City: txt(v.city),
    State: txt(v.state),
    Zip: txt(v.zip),
    Phone: full ? undefined : txt(v.phone),
    RoomNumber: full ? txt(v.room) : undefined,
    MachineMfr: full ? txt(v.mMfr) : undefined,
    MachineModel: full ? txt(v.mModel) : undefined,
    MachineSN: full ? txt(v.mSn) : undefined,
    VapMfr: txt(v.vMfr),
    VapModel: txt(v.vModel),
    VapSN: txt(v.vSn),
    Agent: txt(v.vAgent),
    FillLevel: txt(v.vFill),
    TestLocation: txt(v.vLoc),
    MonitorUsed: txt(v.vMon),
    TolerancePct: tol,
    ReadingsFailed: stats.failed,
    ItemsFailed: itemsFailed(record),
    InspectionDetails: txt(inspectionDetails(record)),
    Comments: txt(record.comments),
    PartsSummary: txt(partsSummary(record.parts)),
    PartsSubtotal: record.parts?.length ? Math.round(partsSubtotal(record.parts) * 100) / 100 : undefined,
    AttachmentCount: (record.files || []).length,
    CertificateUrl: txt(certificateUrl),
  };
  for (let n = 1; n <= 5; n++) {
    f['Out1LPM_' + n] = parseNum(r['a' + n]) ?? undefined;
    f['Out4LPM_' + n] = parseNum(r['b' + n]) ?? undefined;
  }
  if (full) {
    f.ConcentratorPresent = !!record.toggles?.conc;
    f.AbsorberPresent = !!record.toggles?.co2;
    if (record.toggles?.conc) {
      f.ConcMake = txt(v.ocMake);
      f.ConcSN = txt(v.ocSn);
      f.ConcO2Pct = parseNum(v.ocPct) ?? undefined;
      f.ConcPsi = parseNum(String(v.ocPsi ?? '').replace(/psi/i, '')) ?? undefined;
      f.ConcComments = txt(v.ocNotes);
    }
  }
  const applicable = new Set(checklistItems(record).map((i) => i.id));
  for (const [id, col] of Object.entries(LEAK_COLUMNS)) {
    if (applicable.has(id) && v[id]) f[col] = v[id];
  }
  return clean(f);
}

export function partFields(record, part) {
  return clean({
    Title: record.tn,
    ItemNumber: txt(part.no),
    Description: txt(part.desc),
    Quantity: part.qty,
    UnitPrice: part.price == null ? undefined : part.price,
    Amount: part.price == null ? undefined : Math.round(part.price * part.qty * 100) / 100,
    ServiceDate: spDate(record.date),
    Facility: txt(record.values?.facility),
  });
}

export function certificateFields(record) {
  return clean({
    TrackingNumber: record.tn,
    RecordType: record.mode === 'full' ? 'Machine + vaporizer' : 'Vaporizer only',
    Facility: txt(record.values?.facility),
    VapSN: txt(record.values?.vSn),
    ServiceDate: spDate(record.date),
  });
}
