import { useState } from 'preact/hooks';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractItems, parseReport } from '../lib/importPdf.js';
import { readingStats, tolerancePct } from '../lib/calc.js';
import { SERVICE_TYPES, LOCATIONS } from '../data/forms.js';
import * as store from '../lib/store.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function rowProblems(r, all, onDevice, inSharePoint) {
  const p = [];
  const x = r.record;
  if (!x) return r.problems;
  if (!x.tn) p.push('No tracking number');
  if (!x.date) p.push('No date');
  if (!x.values.facility) p.push('No facility');
  if (!x.values.vSn) p.push('No serial number');
  const tn = (x.tn || '').toUpperCase();
  if (tn && all.filter((o) => o.record && (o.record.tn || '').toUpperCase() === tn).length > 1) p.push('Same tracking number as another file here');
  if (tn && onDevice.has(tn)) p.push('Already on this device');
  if (tn && inSharePoint?.has(tn)) p.push('Already in SharePoint');
  const n = Object.keys(x.readings).length;
  if (n < 10) p.push(n ? 'Only ' + n + ' of 10 readings' : 'No readings');
  return p;
}

const BLOCKING = /^(No tracking number|No date|No facility|No serial number|Same tracking|Already|Not a Vaporizer)/;

export function Import({ records, online, account, checkSharePoint, done }) {
  const [rows, setRows] = useState([]);
  const [reading, setReading] = useState(null);
  const [inSharePoint, setInSharePoint] = useState(null);
  const [spNote, setSpNote] = useState('');
  const [saving, setSaving] = useState(false);
  const onDevice = new Set(records.map((r) => (r.tn || '').toUpperCase()).filter(Boolean));

  const pick = async (e) => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    const out = [];
    for (let i = 0; i < files.length; i++) {
      setReading({ n: i + 1, of: files.length });
      const f = files[i];
      try {
        const items = await extractItems(new Uint8Array(await f.arrayBuffer()), pdfjs);
        const r = parseReport(items);
        out.push({ key: f.name + ':' + f.size + ':' + i, file: f, name: f.name, ...r, include: true });
      } catch (err) {
        out.push({ key: f.name + ':' + i, file: f, name: f.name, ok: false, problems: ['Could not read this PDF'], record: null, include: false });
      }
    }
    setReading(null);
    const merged = rows.concat(out);
    setRows(merged.map((r) => ({ ...r, include: r.include && !rowProblems(r, merged, onDevice, inSharePoint).some((p) => BLOCKING.test(p)) })));
    if (online && account && !inSharePoint) {
      setSpNote('Checking SharePoint for reports already uploaded...');
      try {
        const set = await checkSharePoint();
        setInSharePoint(set);
        setRows((cur) => cur.map((r) => ({ ...r, include: r.include && !(r.record && set.has((r.record.tn || '').toUpperCase())) })));
        setSpNote('');
      } catch {
        setSpNote('Could not check SharePoint for duplicates. Uploading will still refuse a tracking number that is already there.');
      }
    }
  };

  const edit = (key, fn) => setRows((cur) => cur.map((r) => (r.key === key ? fn(r) : r)));
  const setVal = (key, k, v) => edit(key, (r) => ({ ...r, record: { ...r.record, values: { ...r.record.values, [k]: v } } }));
  const setRec = (key, k, v) => edit(key, (r) => ({ ...r, record: { ...r.record, [k]: v } }));

  const view = rows.map((r) => {
    const problems = rowProblems(r, rows, onDevice, inSharePoint);
    return { ...r, problems, blocked: !r.record || problems.some((p) => BLOCKING.test(p)) };
  });
  const chosen = view.filter((r) => r.include && !r.blocked);

  const add = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    for (const r of chosen) {
      const pdfId = store.newId();
      await store.saveFile(pdfId, r.file);
      await store.saveRecord({
        ...r.record,
        id: store.newId(), status: 'pending', createdAt: now, submittedAt: now,
        importedPdfId: pdfId, importedFileName: r.name,
      });
    }
    setSaving(false);
    setRows([]);
    done(chosen.length);
  };

  return (
    <main class="page">
      <h1>Import old reports</h1>
      <p class="muted" style="margin:0">
        Choose Vaporizer Efficacy Test PDFs saved from the old service sheet. Each one becomes a Service Records row marked Shop and Imported,
        with the original PDF kept as its certificate. Check the table, fix anything flagged, then add them to the outbox.
      </p>
      <div class="row">
        <label class="btn primary big" for="imp">Choose PDFs</label>
        <input id="imp" class="visually-hidden" type="file" accept="application/pdf,.pdf" multiple onChange={pick} />
        {reading && <span class="muted">Reading {reading.n} of {reading.of}...</span>}
        {spNote && <span class="muted">{spNote}</span>}
        {!online || !account ? <span class="muted">Sign in and go online to check for reports already in SharePoint.</span> : null}
      </div>

      {view.length > 0 && (
        <>
          <div class="row">
            <b class="grow">{view.length} file{view.length === 1 ? '' : 's'} · {chosen.length} ready to add</b>
            <button type="button" class="btn" onClick={() => setRows([])}>Clear</button>
            <button type="button" class="btn primary" disabled={!chosen.length || saving} onClick={add}>
              {saving ? 'Adding...' : 'Add ' + chosen.length + ' to the outbox'}
            </button>
          </div>
          <div style="overflow-x:auto">
            <table class="imp">
              <thead>
                <tr>
                  <th>Add</th><th>File</th><th>Tracking no.</th><th>Date</th><th>Facility</th><th>Serial</th>
                  <th>Service type</th><th>Work done</th><th>Readings</th><th>Check</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => {
                  const x = r.record;
                  if (!x) {
                    return (
                      <tr key={r.key}>
                        <td><input type="checkbox" disabled aria-label={'Add ' + r.name} /></td>
                        <td>{r.name}</td>
                        <td colSpan={8} class="bad">{r.problems.join('; ')}</td>
                      </tr>
                    );
                  }
                  const st = readingStats(x.readings, tolerancePct(x.values));
                  return (
                    <tr key={r.key}>
                      <td><input type="checkbox" checked={r.include && !r.blocked} disabled={r.blocked} aria-label={'Add ' + r.name} onChange={(e) => { const v = e.currentTarget.checked; edit(r.key, (o) => ({ ...o, include: v })); }} /></td>
                      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={r.name}>{r.name}</td>
                      <td><input class="input sm" value={x.tn} aria-label="Tracking number" onInput={(e) => setRec(r.key, 'tn', e.currentTarget.value.trim())} /></td>
                      <td><input class="input sm" type="date" value={x.date} aria-label="Date" onInput={(e) => setRec(r.key, 'date', e.currentTarget.value)} /></td>
                      <td><input class="input sm" value={x.values.facility || ''} aria-label="Facility" onInput={(e) => setVal(r.key, 'facility', e.currentTarget.value)} /></td>
                      <td><input class="input sm" value={x.values.vSn || ''} aria-label="Serial number" onInput={(e) => setVal(r.key, 'vSn', e.currentTarget.value)} /></td>
                      <td>
                        <select class="sm" value={x.serviceType} aria-label="Service type" onChange={(e) => setRec(r.key, 'serviceType', e.currentTarget.value)}>
                          {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t === 'Efficacy test' ? 'Efficacy test' : 'Cleaning + calibration'}</option>)}
                        </select>
                      </td>
                      <td>
                        <select class="sm" value={x.location} aria-label="Work done" onChange={(e) => setRec(r.key, 'location', e.currentTarget.value)}>
                          {LOCATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td class={st.failed ? 'bad' : ''}>{st.entered}/10{st.failed ? ', ' + st.failed + ' fail' : ''}</td>
                      <td class={r.problems.length ? (r.blocked ? 'bad' : 'warn-text') : 'ok-text'}>{r.problems.length ? r.problems.join('; ') : 'OK'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted" style="margin:0;font-size:14px">
            Service type is read from the comments: a cleaning and calibration only when the comments say one was done.
          </p>
        </>
      )}
    </main>
  );
}
