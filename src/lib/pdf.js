// One-page PDF certificate, laid out to match the approved certificate designs.
// Units are points (1/72 in) on US Letter, 612 x 792.

import { jsPDF } from 'jspdf';
import { tolerancePct, readingRows, usDate, money, partsSubtotal } from './calc.js';
import { SUPPORT_PHONE } from '../config.js';

const INK = '#14202B';
const MUTE = '#3D4A57';
const BAND = '#E9EDF1';
const RULE = '#8C99A6';
const HAIR = '#C9D1D9';
const BLUE = '#0B4F8A';
const ORANGE = '#C45F00';
const CONE = '#DCE9F5';
const FAILC = '#B4380A';
const GRID = '#D5DBE1';

const PAGE_W = 612;
const PAGE_H = 792;
const M = 30; // page margin

const IMPORTANT = 'During this service procedure, settings of the controls, patient circuit components and other auxiliary devices may have been changed. Check the machine for proper setup prior to clinical use. If you have any questions, please call us at ' + SUPPORT_PHONE + '.';

const DISCLAIMERS = [
  'An efficacy test has been performed on this vaporizer. Other than noted, this test did not include varying flowrates or temperatures. No service or testing was performed on this vaporizer, or any device, except as described in this report and any accompanying service report(s).',
  'This in no way should be confused with, or used in lieu of, full service/calibration/certification, which includes replacement of wicks and seals as well as testing for proper temperature compensation.',
  'Note: Manufacturers specify that precision calibrated anesthetic vaporizers be serviced annually at an authorized service center to promote continued safe operation and vaporizer longevity.',
];

const dash = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? '-' : s;
};
const joinDot = (...xs) => xs.map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ') || '-';

// ---------- layout primitives ----------

function mk(doc, s) {
  const FS = 9 * s; // body font size
  const LH = 12 * s; // body line height
  const font = (style = 'normal', size = FS, color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const wrap = (text, w, style = 'normal', size = FS) => {
    font(style, size);
    const out = [];
    for (const para of String(text ?? '').split('\n')) {
      const lines = doc.splitTextToSize(para === '' ? ' ' : para, Math.max(w, 10));
      out.push(...lines);
    }
    return out;
  };
  const text = (str, x, y, opts = {}) => doc.text(String(str), x, y, { baseline: 'top', ...opts });
  return { doc, s, FS, LH, font, wrap, text, pad: 4.5 * s };
}

// A section: grey band heading, then a body block.
function section(title, body) {
  return {
    measure(L, w) { return L.LH + 3 * L.s + 2.25 * L.s + body.measure(L, w); },
    draw(L, x, y, w) {
      const hh = L.LH + 3 * L.s;
      L.doc.setFillColor(BAND);
      L.doc.rect(x, y, w, hh, 'F');
      L.doc.setDrawColor(INK);
      L.doc.setLineWidth(0.75);
      L.doc.line(x, y + hh, x + w, y + hh);
      L.font('bold', L.FS);
      L.text(title.toUpperCase(), x + L.pad, y + 1.5 * L.s + 0.5);
      body.draw(L, x, y + hh + 2.25 * L.s, w);
    },
  };
}

function stack(blocks, gap = 0) {
  return {
    measure(L, w) {
      return blocks.reduce((t, b, i) => t + b.measure(L, w) + (i ? gap * L.s : 0), 0);
    },
    draw(L, x, y, w) {
      let yy = y;
      blocks.forEach((b, i) => {
        if (i) yy += gap * L.s;
        b.draw(L, x, yy, w);
        yy += b.measure(L, w);
      });
    },
  };
}

// label: value row; value wraps.
function row(label, value, lw = 112) {
  const parts = (L, w) => {
    const lW = lw * L.s;
    const vW = w - 2 * L.pad - lW - 4.5 * L.s;
    return { lW, vW, lines: L.wrap(dash(value), vW, 'bold') };
  };
  return {
    measure(L, w) { return parts(L, w).lines.length * L.LH; },
    draw(L, x, y, w) {
      const { lW, lines } = parts(L, w);
      L.font('normal', L.FS, MUTE);
      L.text(label, x + L.pad, y + 1.5 * L.s);
      L.font('bold', L.FS, INK);
      lines.forEach((ln, i) => L.text(ln, x + L.pad + lW + 4.5 * L.s, y + 1.5 * L.s + i * L.LH));
    },
  };
}

function rows(items, lw) {
  return stack(items.map(([l, v]) => row(l, v, lw)));
}

// Two columns of label: value pairs.
function pairs(items, lw = 61.5) {
  return {
    measure(L, w) {
      const cw = (w - 4.5 * L.s) / 2;
      let h = 0;
      for (let i = 0; i < items.length; i += 2) {
        const a = row(items[i][0], items[i][1], lw).measure(L, cw);
        const b = items[i + 1] ? row(items[i + 1][0], items[i + 1][1], lw).measure(L, cw) : 0;
        h += Math.max(a, b);
      }
      return h;
    },
    draw(L, x, y, w) {
      const cw = (w - 4.5 * L.s) / 2;
      let yy = y;
      for (let i = 0; i < items.length; i += 2) {
        const ra = row(items[i][0], items[i][1], lw);
        const a = ra.measure(L, cw);
        ra.draw(L, x, yy, cw);
        let b = 0;
        if (items[i + 1]) {
          const rb = row(items[i + 1][0], items[i + 1][1], lw);
          b = rb.measure(L, cw);
          rb.draw(L, x + cw + 4.5 * L.s, yy, cw);
        }
        yy += Math.max(a, b);
      }
    },
  };
}

function paragraph(str, color = INK, style = 'normal') {
  return {
    measure(L, w) { return L.wrap(str, w - 2 * L.pad, style).length * L.LH; },
    draw(L, x, y, w) {
      const lines = L.wrap(str, w - 2 * L.pad, style);
      L.font(style, L.FS, color);
      lines.forEach((ln, i) => L.text(ln, x + L.pad, y + 1.5 * L.s + i * L.LH));
    },
  };
}

// Generic grid table. cols: [{w: number|null, align}], null widths share the rest.
function table(cols, header, body, { boldCols = [], colorFn = null, footer = null } = {}) {
  const widths = (L, w) => {
    const gap = 4.5 * L.s;
    const inner = w - 2 * L.pad - gap * (cols.length - 1);
    const fixed = cols.reduce((t, c) => t + (c.w ? c.w * L.s : 0), 0);
    const flex = cols.filter((c) => !c.w).length || 1;
    return cols.map((c) => (c.w ? c.w * L.s : (inner - fixed) / flex));
  };
  const cellLines = (L, ws, r, bold) => r.map((cell, i) => L.wrap(String(cell ?? ''), ws[i], bold || boldCols.includes(i) ? 'bold' : 'normal'));
  const rowH = (L, ws, r, bold) => Math.max(1, ...cellLines(L, ws, r, bold).map((x) => x.length)) * L.LH;
  const all = (L, ws) => [
    { r: header, kind: 'head' },
    ...body.map((r) => ({ r, kind: 'body' })),
    ...(footer ? [{ r: footer, kind: 'foot' }] : []),
  ].map((e) => ({ ...e, h: rowH(L, ws, e.r, e.kind !== 'body') }));
  return {
    measure(L, w) {
      const ws = widths(L, w);
      return all(L, ws).reduce((t, e) => t + e.h, 0);
    },
    draw(L, x, y, w) {
      const ws = widths(L, w);
      let yy = y;
      for (const e of all(L, ws)) {
        if (e.kind !== 'head') {
          L.doc.setDrawColor(e.kind === 'foot' ? INK : HAIR);
          L.doc.setLineWidth(e.kind === 'foot' ? 0.75 : 0.75);
          L.doc.line(x + L.pad, yy, x + w - L.pad, yy);
        }
        const lines = cellLines(L, ws, e.r, e.kind !== 'body');
        let xx = x + L.pad;
        lines.forEach((ls, i) => {
          const bold = e.kind !== 'body' || boldCols.includes(i);
          const color = e.kind === 'head' ? MUTE : (colorFn ? colorFn(e.r, i) : INK) || INK;
          L.font(bold ? 'bold' : 'normal', L.FS, color);
          ls.forEach((ln, j) => {
            const ty = yy + 1.5 * L.s + j * L.LH;
            if (cols[i].align === 'right') L.text(ln, xx + ws[i], ty, { align: 'right' });
            else L.text(ln, xx, ty);
          });
          xx += ws[i] + 4.5 * L.s;
        });
        yy += e.h;
      }
    },
  };
}

// Output readings chart with the tolerance cone.
function chart(rowsData, tolPct, h) {
  return {
    measure(L) { return h + 4.5 * L.s; },
    draw(L, x, y, w) {
      const doc = L.doc;
      const top = y + 4.5 * L.s;
      const fs = 9 * L.s;
      const ml = 28.5 * L.s, mr = 7.5 * L.s, mt = 6 * L.s, mb = 25.5 * L.s;
      const pw = w - ml - mr;
      const ph = h - mt - mb;
      const vals = rowsData.flatMap((r) => [r.a, r.b]).filter((v) => v !== null);
      const ymax = Math.max(7, Math.ceil(Math.max(0, ...vals) + 0.5));
      const X = (n) => x + ml + ((n - 0.6) / 4.8) * pw;
      const Y = (v) => top + mt + ph - (v / ymax) * ph;
      const t = tolPct / 100;

      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.5);
      doc.setDrawColor(GRID);
      L.font('normal', fs, MUTE);
      const step = ymax > 8 ? 2 : 1;
      for (let v = 0; v <= ymax; v += step) {
        doc.line(x + ml, Y(v), x + w - mr, Y(v));
        if (v % (step * 2) === 0 || step === 2) L.text(String(v), x + ml - 4.5 * L.s, Y(v) - fs * 0.45, { align: 'right' });
      }

      // cone
      const upper = [1, 2, 3, 4, 5].map((n) => [X(n), Y(n * (1 + t))]);
      const lower = [5, 4, 3, 2, 1].map((n) => [X(n), Y(n * (1 - t))]);
      const poly = upper.concat(lower);
      const segs = poly.slice(1).map((p, i) => [p[0] - poly[i][0], p[1] - poly[i][1]]);
      doc.setFillColor(CONE);
      doc.lines(segs, poly[0][0], poly[0][1], [1, 1], 'F', true);
      doc.setDrawColor(MUTE);
      doc.setLineWidth(0.75);
      doc.setLineDashPattern([3, 2.25], 0);
      for (const edge of [upper, lower]) {
        for (let i = 1; i < edge.length; i++) doc.line(edge[i - 1][0], edge[i - 1][1], edge[i][0], edge[i][1]);
      }
      doc.setLineDashPattern([], 0);

      // series
      const series = (key, color, marker) => {
        const pts = rowsData.filter((r) => r[key] !== null).map((r) => [X(r.dial), Y(r[key])]);
        doc.setDrawColor(color);
        doc.setLineWidth(1.5);
        for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        for (const [px, py] of pts) marker(px, py);
      };
      const r = 2.6 * L.s;
      series('a', BLUE, (px, py) => { doc.setFillColor(BLUE); doc.circle(px, py, r, 'F'); });
      series('b', ORANGE, (px, py) => {
        doc.setFillColor('#FFFFFF'); doc.setDrawColor(ORANGE); doc.setLineWidth(1.5);
        doc.rect(px - r, py - r, 2 * r, 2 * r, 'FD');
      });

      // axes
      doc.setDrawColor(INK);
      doc.setLineWidth(0.75);
      doc.line(x + ml, top + mt, x + ml, top + mt + ph);
      doc.line(x + ml, top + mt + ph, x + w - mr, top + mt + ph);
      L.font('normal', fs, MUTE);
      for (let n = 1; n <= 5; n++) L.text(n + '%', X(n), top + mt + ph + 3.5 * L.s, { align: 'center' });
      L.font('normal', fs, INK);
      L.text('Dial setting', x + ml + pw / 2, top + h - fs - 1, { align: 'center' });
      doc.text('Output %', x + 4 * L.s, top + mt + ph / 2 + 18 * L.s, { angle: 90, baseline: 'top' });

      // legend
      const lx = x + ml + 7.5 * L.s;
      let ly = top + mt + 9 * L.s;
      doc.setDrawColor(BLUE); doc.setLineWidth(1.5);
      doc.line(lx, ly, lx + 13.5 * L.s, ly);
      doc.setFillColor(BLUE); doc.circle(lx + 6.75 * L.s, ly, r, 'F');
      L.text('1 LPM', lx + 18 * L.s, ly - fs * 0.55);
      ly += 13.5 * L.s;
      doc.setDrawColor(ORANGE);
      doc.line(lx, ly, lx + 13.5 * L.s, ly);
      doc.setFillColor('#FFFFFF'); doc.rect(lx + 6.75 * L.s - r, ly - r, 2 * r, 2 * r, 'FD');
      L.text('4 LPM', lx + 18 * L.s, ly - fs * 0.55);
      ly += 13.5 * L.s;
      doc.setFillColor(CONE); doc.setDrawColor(MUTE); doc.setLineWidth(0.75);
      doc.setLineDashPattern([3, 2.25], 0);
      doc.rect(lx, ly - 4 * L.s, 13.5 * L.s, 7.5 * L.s, 'FD');
      doc.setLineDashPattern([], 0);
      L.font('normal', fs, INK);
      L.text('±' + tolPct + '% of dial', lx + 18 * L.s, ly - fs * 0.55);
    },
  };
}

// ---------- certificate content ----------

function outputTable(rowsData, tolPct) {
  const res = (ok) => (ok === null ? '-' : ok ? 'PASS' : 'FAIL');
  const fmt = (v) => (v === null ? '-' : v.toFixed(2));
  return table(
    [{ w: 39 }, { w: null }, { w: 40.5 }, { w: null }, { w: 40.5 }],
    ['Dial', '1 LPM output', 'Result', '4 LPM output', 'Result'],
    rowsData.map((r) => [r.dial + '%', fmt(r.a), res(r.aOk), fmt(r.b), res(r.bOk)]),
    { boldCols: [0, 2, 4], colorFn: (r, i) => ((i === 2 || i === 4) && r[i] === 'FAIL' ? FAILC : INK) },
  );
}

function partsTable(parts) {
  if (!parts.length) return paragraph('No parts used.');
  const unit = (p) => (p.price == null ? '-' : money(p.price));
  const amt = (p) => (p.price == null ? '-' : money(p.price * p.qty));
  return table(
    [{ w: 42 }, { w: null }, { w: 19.5, align: 'right' }, { w: 43.5, align: 'right' }, { w: 46.5, align: 'right' }],
    ['Item no.', 'Description', 'Qty', 'Unit', 'Amount'],
    parts.map((p) => [p.no, p.desc, String(p.qty), unit(p), amt(p)]),
    { boldCols: [0], footer: ['', 'Parts subtotal', '', '', money(partsSubtotal(parts))] },
  );
}

function buildBlocks(rec) {
  const v = rec.values || {};
  const full = rec.mode === 'full';
  const tol = tolerancePct(v);
  const rd = readingRows(rec.readings || {}, tol);
  const csz = [v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter((x) => String(x || '').trim()).join(', ');

  const site = section('Location information', rows([
    ['Facility', v.facility], ['Supervisor', v.supervisor], ['Address', v.address], ['City, state, zip', csz],
    full ? ['Room number', v.room] : ['Phone', v.phone],
  ], full ? 82 : 82));

  const insp = [
    ['Dial stop', joinDot(v.pDial, v.pRange)], ['Sight glass', v.pSight], ['Body', v.pBody], ['Inlet / outlet', v.pPorts],
    ['Fill assembly', joinDot(v.pFill, v.pFillDev)], ['Leak test', joinDot(v.pLeak, v.pPressure)], ['Appearance', v.pLook],
  ];
  const vapItems = [
    ['Manufacturer', v.vMfr], ['Model', v.vModel], ['Serial no.', v.vSn],
  ];

  const left = [site];
  const right = [];
  if (full) {
    left.push(section('Anesthesia machine', rows([
      ['Manufacturer', v.mMfr], ['Model', v.mModel], ['Serial number', v.mSn],
      ['O2 concentrator', rec.toggles?.conc ? 'Present' : 'Not present'],
      ['CO2 absorber', rec.toggles?.co2 ? 'Present' : 'Not present'],
    ])));
    left.push(section('O2 piped-in connection', rows([
      ['Type', v.o2Type], ['Check valve', v.o2Valve], ['Leak test', v.o2Leak], ['O2 flush', v.o2Flush], ['Gauge', v.o2Gauge],
    ])));
    left.push(section('Cylinder yoke(s)', rows([
      ['Type', v.yType], ['Check valve', v.yValve], ['Leak test', v.yLeak], ['Gauge / regulator', v.yGauge],
    ])));
    left.push(section('Flowmeter(s)', rows([
      ['Type', joinDot(v.fType, v.fRange)], ['Clean and unobstructed', v.fClean], ['Gaskets, seals and flowstops', v.fSeals],
      ['Leak tests', v.fLeak], ['Flow rates verified', v.fRates], ['Mechanical control stop', v.fStop],
    ], 120)));
    left.push(section('Waste gas scavenging', rows([['Type', v.sType], ['Checked', v.sChecked]])));
    const mounted = [v.mMfr, v.mModel].filter((x) => String(x || '').trim()).join(' ');
    right.push(section('Precision vaporizer', pairs([
      ...vapItems, ['Mounted on', mounted], ['Agent used', v.vAgent], ['Fill level', v.vFill], ['Test location', v.vLoc], ['Monitor', v.vMon],
    ])));
    right.push(section('Vaporizer provisional inspection', pairs(insp)));
  } else {
    left.push(section('Precision vaporizer', rows([
      ['Manufacturer', v.vMfr], ['Model', v.vModel], ['Serial number', v.vSn], ['Agent used', v.vAgent],
      ['Fill level', v.vFill], ['Test location', v.vLoc], ['Monitor used', v.vMon],
    ], 82)));
    left.push(section('Vaporizer provisional inspection', rows(insp, 82)));
  }
  right.push(section('Vaporizer output percentages', outputTable(rd, tol)));
  if (full && rec.toggles?.conc) {
    right.push(section('O2 concentrator', stack([
      pairs([['Make', v.ocMake], ['Serial no.', v.ocSn], ['O2 at 2 LPM', v.ocPct ? String(v.ocPct).replace(/%?$/, '%') : ''], ['Pressure', v.ocPsi ? String(v.ocPsi).replace(/\s*psi$/i, '') + ' psi' : '']]),
      row('Comments', v.ocNotes, 61.5),
    ])));
  }
  if (full && rec.toggles?.co2) {
    right.push(section('CO2 absorber', rows([
      ['Gaskets and seals', joinDot('Body ' + dash(v.cBody), 'Canister ' + dash(v.cCan), 'Leak test ' + dash(v.cLeak))],
      ['Unidirectional valves', joinDot('Disk ' + dash(v.uDisk), 'Domes ' + dash(v.uDomes), 'Gaskets ' + dash(v.uGaskets), 'O-rings ' + dash(v.uRings), 'Debris free ' + dash(v.uDebris))],
      ['Pop-off valve', joinDot(v.popMfr, v.popSize, 'Enclosed ' + dash(v.popEnc), 'Seal ' + dash(v.popSeal), 'Tubing ' + dash(v.popTube))],
      ['Manometer', joinDot('Seal ' + dash(v.manSeal), 'Zero ' + dash(v.manZero), 'Calibration ' + dash(v.manCal))],
      ['Drain', joinDot('Seal ' + dash(v.drSeal), 'Debris free ' + dash(v.drDebris))],
    ], 90)));
  }
  return { full, tol, rd, left, right };
}

// logo: { data: Uint8Array | string, width, height } or null
export function renderCertificate(rec, logo) {
  const full = rec.mode === 'full';
  const cc = rec.serviceType === 'Full cleaning and calibration';
  const title = full ? 'Anesthesia Machine Certification' : cc ? 'Vaporizer Cleaning and Calibration' : 'Vaporizer Efficacy Test';
  // The first two notes describe an efficacy test only; a full cleaning and calibration keeps the annual-service note.
  const notes = full ? [] : cc ? DISCLAIMERS.slice(2) : DISCLAIMERS;
  const maxChart = full ? 220 : 240;
  const avail = PAGE_H - 2 * M;
  const W = PAGE_W - 2 * M;
  const leftW = 247.5 / 552 * W;
  const gapW = 15;
  const rightW = W - leftW - gapW;
  const comW = 255 / 552 * W;
  const partW = W - comW - gapW;

  let comments = String(rec.comments || '');
  let plan = null;

  for (const s of [1, 0.95, 0.9, 0.85, 0.8]) {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const L = mk(doc, s);
    const b = buildBlocks(rec);
    const headerH = 37.5 + 7.5 + 1.5;
    const impLines = L.wrap(IMPORTANT, W - 12, 'normal');
    const impH = (impLines.length + 1) * L.LH + 9 * s;
    const leftBlock = stack(b.left, 6);
    const rightBlock = stack(b.right, 6);
    const leftH = leftBlock.measure(L, leftW);
    const rightH = rightBlock.measure(L, rightW);
    const comBlock = section('Comments', paragraph(comments || 'None.'));
    const partBlock = section('Parts used', partsTable(rec.parts || []));
    const bottomH = Math.max(comBlock.measure(L, comW), partBlock.measure(L, partW));
    const footH = 6 * s + 13.5 * s;
    const discH = notes.reduce((t, d) => t + L.wrap(d, W, 'normal').length * L.LH + 4.5 * s, 0);
    const gaps = 9 * s * (full ? 4 : 5);
    const nonBody = headerH + impH + bottomH + footH + discH + gaps;
    const roomRight = avail - nonBody;
    const bodyNoChart = Math.max(leftH, rightH);
    if (nonBody + bodyNoChart > avail) continue;
    const chartOverhead = L.LH + 3 * s + 2.25 * s + 4.5 * s + 6 * s;
    let chartH = Math.min(maxChart, roomRight - rightH - chartOverhead);
    if (chartH < 95) chartH = 0;
    plan = { s, L, doc, b, leftBlock, rightBlock, comBlock, partBlock, impLines, impH, headerH, chartH, bottomH, footH };
    break;
  }

  if (!plan) {
    // Still too long at the smallest size: shorten the comments to fit and point to the full record.
    const base = String(rec.comments || '');
    let lo = 0, hi = base.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const trial = { ...rec, comments: base.slice(0, mid) + '... (full comments in the SharePoint record)' };
      const ok = fits(trial);
      if (ok) lo = mid; else hi = mid - 1;
    }
    return renderCertificate({ ...rec, comments: base.slice(0, lo) + '... (full comments in the SharePoint record)', _truncated: true }, logo);
  }

  const { s, L, doc, b, leftBlock, comBlock, partBlock, impLines, impH, headerH, chartH } = plan;
  const rightBlocks = b.right.slice();
  if (chartH) rightBlocks.push(section('Efficacy test results', chart(b.rd, b.tol, chartH)));
  const rightBlock = stack(rightBlocks, 6);

  doc.setProperties({ title: title + ' ' + rec.tn, subject: rec.values?.facility || '', creator: 'VetEquip Service Sheet' });

  // header
  let y = M;
  if (logo?.data) {
    const lh = 37.5;
    const lw = logo.width && logo.height ? (logo.width / logo.height) * lh : lh * 3.6;
    doc.addImage(logo.data, 'PNG', M, y, lw, lh);
  }
  L.font('bold', 16.5, INK);
  L.text(title, PAGE_W - M, y + 6, { align: 'right' });
  L.font('normal', 9.75, INK);
  const tnLabel = 'Tracking number: ';
  doc.setFont('helvetica', 'bold');
  const tnW = doc.getTextWidth(rec.tn);
  L.font('normal', 9.75, INK);
  L.text(tnLabel, PAGE_W - M - tnW, y + 26, { align: 'right' });
  L.font('bold', 9.75, INK);
  L.text(rec.tn, PAGE_W - M, y + 26, { align: 'right' });
  y += headerH - 1.5;
  doc.setDrawColor(INK);
  doc.setLineWidth(1.5);
  doc.line(M, y, PAGE_W - M, y);
  y += 1.5 + 9 * s;

  // important box
  doc.setLineWidth(0.75);
  doc.rect(M, y, PAGE_W - 2 * M, impH);
  L.font('bold', L.FS, INK);
  L.text('IMPORTANT INFORMATION - PLEASE READ BEFORE USING MACHINE', M + 6, y + 4.5 * s);
  L.font('normal', L.FS, INK);
  impLines.forEach((ln, i) => L.text(ln, M + 6, y + 4.5 * s + (i + 1) * L.LH));
  y += impH + 9 * s;

  // body columns
  const rightX = M + leftW + gapW;
  leftBlock.draw(L, M, y, leftW);
  rightBlock.draw(L, rightX, y, rightW);
  y += Math.max(leftBlock.measure(L, leftW), rightBlock.measure(L, rightW)) + 9 * s;

  // comments + parts
  comBlock.draw(L, M, y, comW);
  partBlock.draw(L, M + comW + gapW, y, partW);
  y += Math.max(comBlock.measure(L, comW), partBlock.measure(L, partW)) + 9 * s;

  // technician + date
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.75);
  doc.line(M, y, PAGE_W - M, y);
  y += 6 * s;
  L.font('normal', 9.75 * s, INK);
  L.text('Technician:', M, y);
  doc.setFont('helvetica', 'normal');
  let x = M + doc.getTextWidth('Technician:') + 3.5;
  L.font('bold', 9.75 * s, INK);
  L.text(rec.tech || '-', x, y);
  x += doc.getTextWidth(rec.tech || '-') + 30;
  L.font('normal', 9.75 * s, INK);
  L.text('Date:', x, y);
  x += doc.getTextWidth('Date:') + 3.5;
  L.font('bold', 9.75 * s, INK);
  L.text(usDate(rec.date), x, y);
  y += 13.5 * s + 9 * s;

  if (notes.length) {
    L.font('normal', L.FS, MUTE);
    for (const d of notes) {
      const lines = L.wrap(d, PAGE_W - 2 * M, 'normal');
      L.font('normal', L.FS, MUTE);
      lines.forEach((ln, i) => L.text(ln, M, y + i * L.LH));
      y += lines.length * L.LH + 4.5 * s;
    }
  }

  return { doc, scale: s, chart: !!chartH, truncated: !!rec._truncated };

  function fits(trial) {
    const doc2 = new jsPDF({ unit: 'pt', format: 'letter' });
    const L2 = mk(doc2, 0.8);
    const bb = buildBlocks(trial);
    const impH2 = (L2.wrap(IMPORTANT, W - 12, 'normal').length + 1) * L2.LH + 9 * 0.8;
    const bodyH = Math.max(stack(bb.left, 6).measure(L2, leftW), stack(bb.right, 6).measure(L2, rightW));
    const bottom = Math.max(section('Comments', paragraph(trial.comments)).measure(L2, comW), section('Parts used', partsTable(trial.parts || [])).measure(L2, partW));
    const disc = notes.reduce((t, d) => t + L2.wrap(d, W, 'normal').length * L2.LH + 4.5 * 0.8, 0);
    const total = 46.5 + impH2 + bodyH + bottom + (6 + 13.5) * 0.8 + disc + 9 * 0.8 * (full ? 4 : 5);
    return total <= avail;
  }
}

export function certificateBlob(rec, logo) {
  return renderCertificate(rec, logo).doc.output('blob');
}
