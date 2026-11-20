// Form structure, shared by the screens, the PDF certificate and the SharePoint upload.
// Field tuple: [id, label, type, listKey?]   type: 'in' text with suggestions, 'ck' checklist, 'ta' long text

export const SITE_FIELDS = ['facility', 'supervisor', 'address', 'city', 'state', 'zip', 'phone'];

export function sections(mode) {
  const site = {
    key: 'site', label: 'Site', kind: 'fields',
    groups: [{
      title: 'Location', fields: [
        ['facility', 'Facility', 'in'], ['supervisor', 'Supervisor', 'in'], ['address', 'Address', 'in'],
        ['city', 'City', 'in'], ['state', 'State', 'in', 'states'], ['zip', 'Zip', 'in'],
        mode === 'full' ? ['room', 'Room number', 'in'] : ['phone', 'Phone', 'in'],
      ],
    }],
  };
  const machine = {
    key: 'machine', label: 'Machine', kind: 'fields', groups: [
      { title: 'Anesthesia machine', fields: [['mMfr', 'Manufacturer', 'in', 'mfr'], ['mModel', 'Model', 'in', 'machine'], ['mSn', 'Serial number', 'in']] },
      { title: 'O2 piped-in connection', fields: [['o2Type', 'Type', 'in', 'o2'], ['o2Gauge', 'Gauge', 'in', 'gauge'], ['o2Valve', 'Check valve', 'ck'], ['o2Leak', 'Leak test', 'ck'], ['o2Flush', 'O2 flush', 'ck']] },
      { title: 'Cylinder yoke(s)', fields: [['yType', 'Type', 'in', 'cyl'], ['yValve', 'Check valve', 'ck'], ['yLeak', 'Leak test', 'ck'], ['yGauge', 'Gauge / regulator', 'ck']] },
      { title: 'Flowmeter(s)', fields: [['fType', 'Type', 'in', 'gas'], ['fRange', 'Range', 'in', 'flow'], ['fClean', 'Clean and unobstructed', 'ck'], ['fSeals', 'Gaskets, seals and flowstops', 'ck'], ['fLeak', 'Leak tests', 'ck'], ['fRates', 'Flow rates verified', 'ck'], ['fStop', 'Mechanical control stop', 'ck']] },
      { title: 'Waste gas scavenging', fields: [['sType', 'Type', 'in', 'scav'], ['sChecked', 'Checked', 'in', 'canister']] },
    ],
  };
  const conc = {
    key: 'conc', label: 'O2 concentrator', kind: 'fields',
    toggle: { key: 'conc', q: 'Is an O2 concentrator present?' },
    groups: [{ title: 'O2 concentrator', fields: [['ocMake', 'Make', 'in'], ['ocSn', 'Serial number', 'in'], ['ocPct', 'O2 concentration at 2 LPM (%)', 'in'], ['ocPsi', 'Pressure (psi)', 'in'], ['ocNotes', 'Comments', 'ta']] }],
  };
  const vap = {
    key: 'vap', label: 'Vaporizer', kind: 'fields', groups: [
      { title: 'Precision vaporizer', fields: [['vMfr', 'Manufacturer', 'in', 'vapMfr'], ['vModel', 'Model', 'in', 'vapModel'], ['vSn', 'Serial number', 'in'], ['vAgent', 'Agent used', 'in', 'agent'], ['vFill', 'Fill level', 'in', 'fill'], ['vLoc', 'Test location', 'in', 'testLoc'], ['vMon', 'Monitor used', 'in', 'monitor']] },
      { title: 'Provisional inspection', fields: [['pRange', 'Dial range', 'in', 'dial'], ['pFillDev', 'Fill device', 'in', 'fillDev'], ['pPressure', 'Leak test pressure', 'in', 'pressure'], ['pDial', 'Dial stop', 'ck'], ['pSight', 'Sight glass', 'ck'], ['pBody', 'Body', 'ck'], ['pPorts', 'Inlet / outlet', 'ck'], ['pFill', 'Fill assembly', 'ck'], ['pLeak', 'Leak test', 'ck'], ['pLook', 'Appearance', 'ck']] },
    ],
  };
  const output = { key: 'output', label: 'Output readings', kind: 'output' };
  const co2 = {
    key: 'co2', label: 'CO2 absorber', kind: 'fields',
    toggle: { key: 'co2', q: 'Does this machine have a CO2 absorber?' },
    groups: [
      { title: 'Gaskets and seals', fields: [['cBody', 'Body', 'ck'], ['cCan', 'Canister', 'ck'], ['cLeak', 'Leak test', 'ck']] },
      { title: 'Unidirectional valves', fields: [['uDisk', 'Disk', 'ck'], ['uDomes', 'Domes', 'ck'], ['uGaskets', 'Gaskets', 'ck'], ['uRings', 'O-rings', 'ck'], ['uDebris', 'Debris free', 'ck']] },
      { title: 'Pop-off valve', fields: [['popMfr', 'Manufacturer', 'in', 'mfr'], ['popSize', 'Size', 'in'], ['popEnc', 'Enclosed', 'ck'], ['popSeal', 'Seal', 'ck'], ['popTube', 'Tubing', 'ck']] },
      { title: 'Manometer', fields: [['manSeal', 'Seal', 'ck'], ['manZero', 'Zero', 'ck'], ['manCal', 'Calibration check', 'ck']] },
      { title: 'Drain', fields: [['drSeal', 'Seal', 'ck'], ['drDebris', 'Debris free', 'ck']] },
    ],
  };
  const notes = { key: 'notes', label: 'Comments and parts', kind: 'notes' };
  const review = { key: 'review', label: 'Review and submit', kind: 'review' };
  return mode === 'full'
    ? [site, machine, conc, vap, output, co2, notes, review]
    : [site, vap, output, notes, review];
}

// Checklist items that also get their own SharePoint column.
export const LEAK_COLUMNS = {
  o2Leak: 'LeakO2',
  yLeak: 'LeakYoke',
  fLeak: 'LeakFlowmeter',
  pLeak: 'LeakVaporizer',
  cLeak: 'LeakAbsorber',
};

// Every checklist item that applies to a record, in form order, with its group title.
// Items inside a section that is toggled off (concentrator, absorber) are left out.
export function checklistItems(record) {
  const out = [];
  for (const sec of sections(record.mode)) {
    if (sec.kind !== 'fields') continue;
    if (sec.toggle && !record.toggles?.[sec.toggle.key]) continue;
    for (const g of sec.groups) {
      for (const f of g.fields) {
        if (f[2] === 'ck') out.push({ id: f[0], label: f[1], group: g.title, value: record.values?.[f[0]] || '' });
      }
    }
  }
  return out;
}
