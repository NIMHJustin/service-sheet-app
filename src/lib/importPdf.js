import { findParts } from './partsFind.js';

// Reads old Vaporizer Efficacy Test reports: PDFs saved from the Vaporizer_Only sheet of
// Service_Sheet_V6.2.xlsm. The text in those PDFs keeps its position on the page, so each
// value is found to the right of its label on the same line.

const ROW = 4; // points: items within this height of each other are on the same line

export async function extractItems(data, pdfjs) {
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    return tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], str: it.str.trim() }));
  } finally {
    await task.destroy();
  }
}

const sameRow = (a, b) => Math.abs(a.y - b.y) <= ROW;

function label(items, text, opts = {}) {
  const t = text.toLowerCase();
  return items.find((i) => i.str.toLowerCase() === t && (opts.maxX == null || i.x < opts.maxX));
}

// Items on the label's line, to its right, before maxX.
function rightOf(items, lab, maxX = 250) {
  if (!lab) return [];
  return items.filter((i) => i !== lab && sameRow(i, lab) && i.x > lab.x + 1 && i.x < maxX).sort((a, b) => a.x - b.x);
}

function value(items, text, maxX = 250, stopLabels = []) {
  const lab = label(items, text, { maxX: 200 });
  const right = rightOf(items, lab, maxX);
  const stop = right.find((i) => stopLabels.includes(i.str.toLowerCase()));
  return right.filter((i) => !stop || i.x < stop.x).map((i) => i.str).join(' ').trim();
}

const CHECK = { ok: 'OK', 'n/a': 'N/A', na: 'N/A', fail: 'Fail', failed: 'Fail', 'see notes': 'See notes', 'see note': 'See notes' };
const check = (s) => (s ? CHECK[s.toLowerCase()] || s : '');

function inspection(items, text) {
  const right = rightOf(items, label(items, text, { maxX: 200 }), 250);
  return { status: check(right[0]?.str || ''), detail: right.slice(1).map((i) => i.str).join(' ') };
}

export function usToIso(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
}

// A full cleaning and calibration only when the comments say one was done, not merely recommended.
export function inferServiceType(comments) {
  const c = String(comments || '').toLowerCase().replace(/\s+/g, ' ');
  const sentences = c.split(/(?<=[.!?])\s+/);
  const done = sentences.some((s) => {
    if (/\b(recommend|recommended|suggest|needs?|requires?|should)\b/.test(s)) return false;
    return /\bin for (a )?(full )?(cc|clean(ing)? (and|&) calibrat\w*)\b/.test(s)
      || /\bcalibration (was )?(performed|completed|done)\b/.test(s)
      || /\b(full )?cc (was )?(performed|completed|done)\b/.test(s)
      || /\b(cleaned|clean(ing)?) and calibrated\b/.test(s)
      || /\bunit (was )?calibrated\b/.test(s);
  });
  return done ? 'Full cleaning and calibration' : 'Efficacy test';
}

export function parseReport(items) {
  const problems = [];
  const has = (t) => items.some((i) => i.str.toUpperCase() === t);
  if (!has('VAPORIZER EFFICACY TEST')) {
    return { ok: false, problems: ['Not a Vaporizer Efficacy Test report from the service sheet.'], record: null };
  }

  // Tracking number: to the right of its label, on the header line.
  const tn = rightOf(items, label(items, 'Tracking Number:'), 450).map((i) => i.str).join('').trim();

  // Readings: lines that start with "1%".."5%" in the 1 LPM column.
  const readings = {};
  for (let n = 1; n <= 5; n++) {
    const dials = items.filter((i) => i.str === n + '%').sort((a, b) => a.x - b.x);
    const first = dials[0];
    if (!first) continue;
    const row = items.filter((i) => sameRow(i, first)).sort((a, b) => a.x - b.x);
    const nums = (from, to) => row.find((i) => i.x > from && i.x < to && /^\d+(\.\d+)?$/.test(i.str));
    const second = dials.find((d) => d !== first && sameRow(d, first));
    const a = nums(first.x + 1, second ? second.x : first.x + 120);
    const b = second ? nums(second.x + 1, second.x + 90) : null;
    if (a) readings['a' + n] = a.str;
    if (b) readings['b' + n] = b.str;
  }

  // Comments: the lines between the Comments label and the Technician label.
  const cLab = label(items, 'Comments:');
  const tLab = label(items, 'Technician:');
  let comments = '';
  if (cLab && tLab) {
    const lines = items
      .filter((i) => i !== cLab && i.x > cLab.x + 20 && i.x < 560 && i.y <= cLab.y + ROW + 4 && i.y > tLab.y + ROW)
      .sort((a, b) => b.y - a.y || a.x - b.x);
    comments = lines.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }

  const dial = inspection(items, 'Dial Stop:');
  const fill = inspection(items, 'Fill Assembly:');
  const leak = inspection(items, 'Leak Test:');
  const values = {
    facility: value(items, 'Facility:'),
    supervisor: value(items, 'Supervisor:'),
    address: value(items, 'Address:'),
    city: value(items, 'City:'),
    state: value(items, 'State:', 250, ['zip:']),
    zip: value(items, 'Zip:'),
    phone: value(items, 'Phone:'),
    vMfr: value(items, 'Manufacturer:'),
    vModel: value(items, 'Model:'),
    vSn: value(items, 'S/N:'),
    vAgent: value(items, 'Agent Used:'),
    vFill: value(items, 'Fill Level:'),
    vLoc: value(items, 'Test Location:'),
    vMon: value(items, 'Monitor Used:'),
    pDial: dial.status, pRange: dial.detail,
    pSight: inspection(items, 'Sight Glass:').status,
    pBody: inspection(items, 'Body:').status,
    pPorts: inspection(items, 'Inlet/Outlet:').status,
    pFill: fill.status, pFillDev: fill.detail,
    pLeak: leak.status, pPressure: leak.detail,
    pLook: inspection(items, 'Status:').status,
  };
  for (const k of Object.keys(values)) if (!values[k]) delete values[k];

  const date = usToIso(value(items, 'Date:'));
  const tech = value(items, 'Technician:');

  if (!tn) problems.push('No tracking number');
  if (!date) problems.push('No date');
  if (!values.facility) problems.push('No facility');
  if (!values.vSn) problems.push('No serial number');
  const n = Object.keys(readings).length;
  if (n < 10) problems.push(n === 0 ? 'No output readings' : 'Only ' + n + ' of 10 readings');

  return {
    ok: problems.length === 0,
    problems,
    record: {
      mode: 'vap', tn, date, tech, values, readings, comments,
      serviceType: inferServiceType(comments), location: 'Shop', imported: true,
      toggles: {}, parts: findParts(comments), files: [], fee: '',
    },
  };
}
