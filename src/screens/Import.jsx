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

const short = (d) => { const t = d.replace(/\s*\([^)]*\)\s*$/, '').replace(/, per vaporizer$/, ''); return t.length > 22 ? t.slice(0, 21) + '…' : t; };

function Chips({ parts, remove }) {
  if (!parts?.length) return <span class="muted">None</span>;
  return (
    <div class="chips">
      {parts.map((p, i) => (
        <span class="chip-part" key={p.no + p.desc} title={(p.no && p.no !== 'Custom' ? p.no + ' · ' : '') + p.desc + (p.price == null ? ' (no price)' : ' · $' + p.price.toFixed(2) + ' each')}>
          {short(p.desc)}{p.qty > 1 ? ' x' + p.qty : ''}
          <button type="button" aria-label={'Remove ' + p.desc} onClick={() => remove(i)}>×</button>
        </span>
      ))}
    </div>
  );
}

export function Import({ records, online, account, checkSharePoint, done, findBackfill, applyBackfill }) {
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
                  <th>Add</th><th>Tracking no.</th><th>Date</th><th>Facility</th><th>Serial</th>
                  <th>Service type</th><th>Work</th><th>Parts found</th><th>Check</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => {
                  const x = r.record;
                  if (!x) {
                    return (
                      <tr key={r.key}>
                        <td><input type="checkbox" disabled aria-label={'Add ' + r.name} /></td>
                        <td colSpan={8} class="bad">{r.name}: {r.problems.join('; ')}</td>
                      </tr>
                    );
                  }
                  const st = readingStats(x.readings, tolerancePct(x.values));
                  return (
                    <tr key={r.key}>
                      <td><input type="checkbox" checked={r.include && !r.blocked} disabled={r.blocked} aria-label={'Add ' + r.name} onChange={(e) => { const v = e.currentTarget.checked; edit(r.key, (o) => ({ ...o, include: v })); }} /></td>
                      <td><input class="input sm" style="width:96px" value={x.tn} aria-label="Tracking number" onInput={(e) => setRec(r.key, 'tn', e.currentTarget.value.trim())} /></td>
                      <td><input class="input sm" style="width:132px" type="date" value={x.date} aria-label="Date" onInput={(e) => setRec(r.key, 'date', e.currentTarget.value)} /></td>
                      <td><input class="input sm" style="width:140px" value={x.values.facility || ''} aria-label="Facility" onInput={(e) => setVal(r.key, 'facility', e.currentTarget.value)} /><div class="muted fname" title={r.name}>{r.name}</div></td>
                      <td><input class="input sm" style="width:104px" value={x.values.vSn || ''} aria-label="Serial number" onInput={(e) => setVal(r.key, 'vSn', e.currentTarget.value)} /></td>
                      <td>
                        <select class="sm" style="width:150px" value={x.serviceType} aria-label="Service type" onChange={(e) => setRec(r.key, 'serviceType', e.currentTarget.value)}>
                          {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t === 'Efficacy test' ? 'Efficacy test' : 'Cleaning + calibration'}</option>)}
                        </select>
                      </td>
                      <td>
                        <select class="sm" style="width:76px" value={x.location} aria-label="Work done" onChange={(e) => setRec(r.key, 'location', e.currentTarget.value)}>
                          {LOCATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td><Chips parts={x.parts} remove={(i) => setRec(r.key, 'parts', x.parts.filter((_, j) => j !== i))} /></td>
                      <td style="width:130px">
                        <div class={st.failed ? 'bad' : ''}>Readings {st.entered}/10{st.failed ? ', ' + st.failed + ' fail' : ''}</div>
                        <div class={r.problems.length ? (r.blocked ? 'bad' : 'warn-text') : 'ok-text'}>{r.problems.length ? r.problems.join('; ') : 'Ready'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted" style="margin:0;font-size:14px">
            Service type and parts are read from the comments: a cleaning and calibration, or a part, only when the comments say it was done, not just recommended. Hover a part for its name and price; × removes it.
          </p>
        </>
      )}

      <Backfill online={online} account={account} find={findBackfill} apply={applyBackfill} />
    </main>
  );
}

function Backfill({ online, account, find, apply }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const can = online && account;
  const look = async () => {
    setBusy('Reading uploaded records...');
    setMsg('');
    try {
      const r = await find();
      setRows(r.map((x) => ({ ...x, done: 0, status: '' })));
      if (!r.length) setMsg('No uploaded records with parts in their comments are missing Parts Used rows.');
    } catch (e) {
      setMsg(e?.message || String(e));
    }
    setBusy('');
  };
  const edit = (tn, fn) => setRows((cur) => cur.map((x) => (x.tn === tn ? fn(x) : x)));
  const chosen = (rows || []).filter((x) => x.include && x.parts.length && x.status !== 'Added');
  const run = async () => {
    for (const c of chosen) {
      edit(c.tn, (x) => ({ ...x, status: 'Adding...' }));
      setBusy('Adding parts to ' + c.tn);
      try {
        await apply(c, c.done, (n) => edit(c.tn, (x) => ({ ...x, done: n })));
        edit(c.tn, (x) => ({ ...x, status: 'Added' }));
      } catch (e) {
        edit(c.tn, (x) => ({ ...x, status: 'Failed: ' + (e?.message || e) }));
      }
    }
    setBusy('');
  };
  return (
    <section class="card" style="margin-top:12px">
      <h2>Parts for reports already uploaded</h2>
      <p class="muted" style="margin:0">Looks through the comments of records already in SharePoint that have no Parts Used rows, and suggests the parts they mention. Review, remove anything wrong, then add them. Each record's parts summary and subtotal are updated too.</p>
      <div class="row">
        <button type="button" class="btn" disabled={!can || !!busy} onClick={look}>Find parts in uploaded reports</button>
        {rows && chosen.length > 0 && <button type="button" class="btn primary" disabled={!!busy} onClick={run}>Add parts to {chosen.length} record{chosen.length === 1 ? '' : 's'}</button>}
        {busy && <span class="muted">{busy}</span>}
        {!can && <span class="muted">Sign in and go online to use this.</span>}
      </div>
      {msg && <p class="muted" style="margin:0">{msg}</p>}
      {rows && rows.length > 0 && (
        <div style="overflow-x:auto">
          <table class="imp">
            <thead><tr><th>Add</th><th>Tracking no.</th><th>Date</th><th>Facility</th><th>Comments</th><th>Parts found</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.tn}>
                  <td><input type="checkbox" checked={x.include} disabled={x.status === 'Added'} aria-label={'Add parts to ' + x.tn} onChange={(e) => { const v = e.currentTarget.checked; edit(x.tn, (o) => ({ ...o, include: v })); }} /></td>
                  <td>{x.tn}</td>
                  <td>{x.date}</td>
                  <td>{x.facility}</td>
                  <td style="max-width:320px;font-size:13px" class="muted">{x.comments}</td>
                  <td><Chips parts={x.parts} remove={(i) => edit(x.tn, (o) => ({ ...o, parts: o.parts.filter((_, j) => j !== i) }))} /></td>
                  <td class={x.status === 'Added' ? 'ok-text' : x.status.startsWith('Failed') ? 'bad' : ''}>{x.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
