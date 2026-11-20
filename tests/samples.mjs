// Sample records built from the filled-in sheets in Service_Sheet_V6.2.xlsm.

const ok = (ids) => Object.fromEntries(ids.map((i) => [i, 'OK']));
const vapInsp = { pRange: '0-5%', pPressure: '100mm Hg', ...ok(['pDial', 'pSight', 'pBody', 'pPorts', 'pFill', 'pLeak', 'pLook']) };
const readings = (a, b) => Object.fromEntries([...a.map((v, i) => ['a' + (i + 1), String(v)]), ...b.map((v, i) => ['b' + (i + 1), String(v)])]);

export const samples = {
  cedars: {
    tn: 'JH261109B', mode: 'full', tech: 'Justin Haynes', date: '2026-11-09', fee: '225.00',
    values: {
      facility: 'Cedars-Sinai', supervisor: 'Ava Ward', address: '8700 Beverly Blvd', city: 'West Hollywood', state: 'CA', zip: '90048',
      mMfr: 'VetEquip', mModel: 'RC-2', mSn: 'AD24169',
      o2Type: 'DISS Male', o2Valve: 'N/A', o2Leak: 'OK', o2Flush: 'OK', o2Gauge: 'N/A',
      yValve: 'N/A', yLeak: 'N/A', yGauge: 'N/A',
      fType: 'Flowcontrol', fRange: '0-1 LPM', fClean: 'OK', fSeals: 'N/A', fLeak: 'OK', fRates: 'OK', fStop: 'N/A',
      sType: 'None Present', sChecked: 'N/A',
      vMfr: 'VetEquip', vModel: 'Tec 3', vSn: 'VE2977 RC2', vAgent: 'Isoflurane', vFill: '1/2', vLoc: 'Common Outlet', vMon: 'Riken',
      ...vapInsp, pFillDev: 'Pin Index',
    },
    readings: readings([1.00, 1.92, 3.02, 3.89, 5.05], [1.04, 1.97, 3.11, 4.04, 4.98]),
    toggles: { conc: false, co2: false },
    comments: 'Machine arrived with a leak out of Ports 1 and 6. New switches (401040x2, 150170x2, and 150160x2) installed. Regulator bleeding at a high level, new regulator (421103) installed. Old, dried out tubing replaced (171434). Unit leak tested and flows verified. Vaporizer required new leaf spring, u-seal, thrustwasher, and thermocover o-ring to verify outputs. Unit calibrated and is in spec!',
    parts: [
      { no: '421103', desc: 'Regulator, oxygen', qty: 1, price: 189.0 },
      { no: '171434', desc: 'Tubing, 1/4" ID, Black Rubber', qty: 2, price: 6.5 },
    ],
    files: [],
  },
  sareptaBoth: null,
  sareptaConc: null,
  labcorp: {
    tn: 'JH261116B', mode: 'vap', tech: 'Justin Haynes', date: '2026-11-16', fee: '100.00',
    values: {
      facility: 'Labcorp', supervisor: 'Maurice Foy',
      vMfr: 'VetEquip', vModel: 'Tec 3', vSn: 'VE6423 RC2', vAgent: 'Isoflurane', vFill: '1/2', vLoc: 'Common Outlet', vMon: 'Riken',
      ...vapInsp, pFillDev: 'Funnel Fill',
    },
    readings: readings([1.00, 2.05, 2.98, 4.10, 4.92], [1.07, 2.17, 3.18, 4.29, 5.08]),
    toggles: {}, comments: 'Vaporizer in for efficacy testing.', parts: [], files: [],
  },
  clemsonPenlon: {
    tn: 'JH260309A', mode: 'vap', tech: 'Justin Haynes', date: '2026-03-09', fee: '100.00',
    values: {
      facility: 'Clemson University', supervisor: 'Heather Holliday', city: 'Clemson', state: 'SC', zip: '29634',
      vMfr: 'Penlon', vModel: 'Sigma Delta', vSn: 'D0322-0311', vAgent: 'Isoflurane', vFill: '3/4', vLoc: 'Common Outlet', vMon: 'Riken',
      ...vapInsp, pFillDev: 'Funnel Fill',
    },
    readings: readings([0.88, 2.21, 3.40, 4.28, 5.29], [0.91, 2.30, 3.45, 4.30, 5.20]),
    toggles: {}, comments: 'Vaporizer in for full cleaning and calibration. Unit mechanicals work within spec and pass all testing.', parts: [], files: [],
  },
};

const sarepta = {
  tn: 'JH261006H', mode: 'full', tech: 'Justin Haynes', date: '2026-10-06', fee: '225.00',
  values: {
    facility: 'Sarepta', supervisor: 'Ashley Cordle', city: 'Easton', state: 'OH',
    mMfr: 'VetEquip', mModel: 'V-1', mSn: 'AAG28714',
    o2Type: 'DISS Male', o2Valve: 'N/A', o2Leak: 'OK', o2Flush: 'OK', o2Gauge: 'N/A',
    yValve: 'N/A', yLeak: 'N/A', yGauge: 'N/A',
    fType: 'O2', fRange: '0-5 LPM', fClean: 'OK', fSeals: 'OK', fLeak: 'OK', fRates: 'OK', fStop: 'N/A',
    sType: 'Canisters', sChecked: 'Weight and Date',
    vMfr: 'VetEquip', vModel: 'Tec 3', vSn: 'VE2450', vAgent: 'Isoflurane', vFill: '1/4', vLoc: 'Common Outlet', vMon: 'Riken',
    ...vapInsp, pFillDev: 'Funnel Fill',
    ocMake: 'Inogen', ocSn: 'O2-4204', ocPct: '95', ocPsi: '16', ocNotes: 'Concentrator output checked at 2 LPM.',
    ...ok(['cBody', 'cCan', 'cLeak', 'uDisk', 'uDomes', 'uGaskets', 'uRings', 'uDebris', 'popEnc', 'popSeal', 'popTube', 'manSeal', 'manZero', 'manCal', 'drSeal', 'drDebris']),
    popMfr: 'VetEquip', popSize: '19 mm',
  },
  readings: readings([1.01, 2.18, 3.30, 4.44, 5.75], [1.08, 2.13, 3.29, 4.46, 5.75]),
  comments: 'Machine and vaporizer in great shape. Outputs at 1 and 4 LPM trending high. It will need calibration next year.',
  parts: [{ no: 'Custom', desc: 'Concentrator filter (customer supplied)', qty: 1, price: null }],
  files: [],
};
samples.sareptaBoth = { ...sarepta, toggles: { conc: true, co2: true } };
samples.sareptaConc = { ...sarepta, toggles: { conc: true, co2: false } };

// Worst case: everything present, long comments, many parts.
samples.stress = {
  ...samples.sareptaBoth,
  tn: 'JH261120C',
  comments: Array(9).fill('Replaced worn seals and retested all connections; flows verified against the reference meter and recorded.').join(' '),
  parts: Array.from({ length: 9 }, (_, i) => ({ no: String(101010 + i * 37), desc: 'Replacement part number ' + (i + 1) + ', assorted', qty: (i % 3) + 1, price: 12.5 + i })),
};
