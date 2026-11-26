import { useState } from 'preact/hooks';
import { sections, SITE_FIELDS, SERVICE_TYPES, LOCATIONS } from '../data/forms.js';
import { LISTS, CHECK_CHOICES, TECHNICIANS } from '../data/lists.js';
import { CATALOG as PARTS } from '../lib/partsFind.js';
import {
  tolerancePct, readingRows, readingStats, itemsFailed, nextTrackingNumber, noteLine,
  partsSubtotal, money, missingForSubmit, usDate,
} from '../lib/calc.js';
import * as store from '../lib/store.js';
import { LockIcon, CheckIcon } from './icons.jsx';
import { normSn } from '../lib/fleet.js';

function FleetNote({ rec, change, units }) {
  const sn = normSn(rec.values.vSn);
  const u = sn ? units.find((x) => normSn(x.sn) === sn) : null;
  if (!u) return null;
  const missing = !rec.values.vMfr || !rec.values.vModel || !rec.values.vAgent;
  const fill = () => change((r) => ({ ...r, values: { ...r.values, vMfr: r.values.vMfr || u.mfr, vModel: r.values.vModel || u.model, vAgent: r.values.vAgent || u.agent } }));
  return (
    <div class="banner info" style="border-radius:12px">
      <span class="grow">
        <b>{u.fleet} fleet unit</b> · {u.status}{u.nextDue ? ' · annual inspection due ' + usDate(u.nextDue) : ''}. When this record uploads, the unit's next annual inspection is set a year out{u.status === 'In service' ? ', and it goes back in stock if everything passes' : ''}.
      </span>
      {missing && (u.mfr || u.model) && <button type="button" class="btn small" onClick={fill}>Fill in make and model</button>}
    </div>
  );
}

export function Form({ rec, change, lock, setLock, records, close, submit, preview, fleetUnits = [] }) {
  const secs = sections(rec.mode);
  const idx = Math.min(rec.sec || 0, secs.length - 1);
  const cur = secs[idx];
  const go = (i) => change((r) => ({ ...r, sec: i }));
  const used = records.map((r) => r.tn).filter(Boolean);
  const tnPreview = nextTrackingNumber(rec.tech, rec.date, used);

  return (
    <div class="form">
      <nav class="rail" aria-label="Form sections">
        <div class="rail-head">
          <span class="muted">{rec.mode === 'full' ? 'Machine + vaporizer' : 'Vaporizer only'}</span>
          <b>{tnPreview}</b>
          <span class="muted" style="font-size:13px">Draft saved on this tablet</span>
        </div>
        {secs.map((s, i) => (
          <button type="button" key={s.key} aria-current={i === idx ? 'step' : undefined} onClick={() => go(i)}>
            <span class="num">{i + 1}</span><span>{s.label}</span>
          </button>
        ))}
      </nav>
      <div class="pane">
        <div class="pane-body">
          <h1 style="font-size:28px">{cur.label}</h1>
          {cur.key === 'site' && <JobType rec={rec} change={change} />}
          {cur.key === 'site' && <SiteLock rec={rec} lock={lock} setLock={setLock} />}
          {cur.key === 'vap' && <FleetNote rec={rec} change={change} units={fleetUnits} />}
          {cur.kind === 'fields' && <FieldsSection sec={cur} rec={rec} change={change} lock={lock} />}
          {cur.kind === 'output' && <Readings rec={rec} change={change} />}
          {cur.kind === 'notes' && <Notes rec={rec} change={change} />}
          {cur.kind === 'review' && <Review rec={rec} change={change} tn={tnPreview} preview={() => preview(tnPreview)} />}
        </div>
        <footer class="pane-foot">
          <button type="button" class="btn big" onClick={() => (idx === 0 ? close() : go(idx - 1))}>{idx === 0 ? 'Close draft' : 'Back'}</button>
          <div class="grow" />
          {idx < secs.length - 1 && (
            <button type="button" class="btn primary big" onClick={() => go(idx + 1)}>Next: {secs[idx + 1].label}</button>
          )}
          {cur.kind === 'review' && (
            <button type="button" class="btn primary big" disabled={missingForSubmit(rec).length > 0} onClick={submit}>Submit record</button>
          )}
        </footer>
      </div>
    </div>
  );
}

function JobType({ rec, change }) {
  const set = (k, v) => change((r) => ({ ...r, [k]: v }));
  const loc = rec.location || 'Field';
  const type = rec.serviceType || 'Efficacy test';
  return (
    <section class="card">
      <div class="row">
        <h2 style="width:150px">Work done</h2>
        <div class="seg" role="group" aria-label="Work done">
          {LOCATIONS.map((x) => <button type="button" key={x} aria-pressed={loc === x} onClick={() => set('location', x)}>{x === 'Field' ? 'In the field' : 'In the shop'}</button>)}
        </div>
      </div>
      <div class="row">
        <h2 style="width:150px">Service type</h2>
        <div class="seg" role="group" aria-label="Service type">
          {SERVICE_TYPES.map((x) => <button type="button" key={x} aria-pressed={type === x} onClick={() => set('serviceType', x)}>{x}</button>)}
        </div>
      </div>
      {loc === 'Shop' && <p class="muted" style="margin:0">For shop work, enter the customer who sent the unit in as the site.</p>}
    </section>
  );
}

function SiteLock({ rec, lock, setLock }) {
  const has = !!String(rec.values.facility || '').trim();
  const doLock = () => {
    const values = {};
    for (const k of SITE_FIELDS) if (rec.values[k]) values[k] = rec.values[k];
    setLock({ values });
  };
  return (
    <div class="card">
      <div class="row">
        <LockIcon />
        <div class="grow">
          <h2>{lock ? 'Site locked' : 'Lock this site for the next records'}</h2>
          <span class="muted">{lock ? 'These details are reused on every new record. Unlock to edit them.' : 'Use this when you are servicing several units at one facility.'}</span>
        </div>
        <button type="button" class={'btn' + (lock ? ' primary' : '')} aria-pressed={!!lock} disabled={!lock && !has} onClick={() => (lock ? setLock(null) : doLock())}>
          {lock ? 'Unlock site' : 'Lock site'}
        </button>
      </div>
    </div>
  );
}

function FieldsSection({ sec, rec, change, lock }) {
  const on = sec.toggle ? !!rec.toggles[sec.toggle.key] : true;
  const setToggle = (v) => change((r) => ({ ...r, toggles: { ...r.toggles, [sec.toggle.key]: v } }));
  return (
    <>
      {sec.toggle && (
        <div class="card">
          <div class="row">
            <h2 class="grow">{sec.toggle.q}</h2>
            <div class="seg">
              <button type="button" aria-pressed={on} onClick={() => setToggle(true)}>Yes</button>
              <button type="button" aria-pressed={!on} onClick={() => setToggle(false)}>No</button>
            </div>
          </div>
        </div>
      )}
      {on && sec.groups.map((g) => (
        <section class="card" key={g.title}>
          <h2>{g.title}</h2>
          <div class="grid2">
            {g.fields.map((f) => <Field key={f[0]} f={f} group={g.title} rec={rec} change={change} locked={!!lock && SITE_FIELDS.includes(f[0])} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function Field({ f, group, rec, change, locked }) {
  const [id, label, type, listKey] = f;
  const v = rec.values[id] || '';
  const set = (val) => change((r) => ({ ...r, values: { ...r.values, [id]: val } }));
  if (type === 'in') {
    const opts = LISTS[listKey] || [];
    return (
      <div class="field">
        <label for={'f_' + id}>{label}</label>
        <input id={'f_' + id} class="input" type="text" list={opts.length ? 'l_' + id : undefined} value={v} disabled={locked}
          autocomplete="off" inputMode={id === 'zip' || id === 'ocPct' || id === 'ocPsi' ? 'decimal' : undefined}
          onInput={(e) => set(e.currentTarget.value)} />
        {opts.length > 0 && <datalist id={'l_' + id}>{opts.map((o) => <option value={o} key={o} />)}</datalist>}
      </div>
    );
  }
  if (type === 'ta') {
    return (
      <div class="field span-all">
        <label for={'f_' + id}>{label}</label>
        <textarea id={'f_' + id} rows={4} value={v} onInput={(e) => set(e.currentTarget.value)} />
      </div>
    );
  }
  // checklist item
  const draft = rec.noteDraft?.[id] || '';
  const line = noteLine(group, label, draft);
  const sent = !!draft.trim() && rec.noteSent?.[id] === line && (rec.comments || '').includes(line);
  const sendNote = () => change((r) => {
    const prev = r.noteSent?.[id];
    let c = r.comments || '';
    if (prev && c.includes(prev)) c = c.replace(prev, line);
    else c = c.trim() ? c.replace(/\s+$/, '') + '\n' + line : line;
    return { ...r, comments: c, noteSent: { ...r.noteSent, [id]: line } };
  });
  return (
    <div class="span-all">
      <div class="check" role="group" aria-label={label}>
        <span class="lbl">{label}</span>
        <div class="seg">
          {CHECK_CHOICES.map((c) => (
            <button type="button" key={c} class={c === 'Fail' ? 'fail' : ''} aria-pressed={v === c} onClick={() => set(v === c ? '' : c)}>{c}</button>
          ))}
        </div>
      </div>
      {v === 'See notes' && (
        <div class="note-row">
          <input class="input" type="text" aria-label={'Note for ' + label} placeholder="Write the note for this item" value={draft}
            onInput={(e) => { const val = e.currentTarget.value; change((r) => ({ ...r, noteDraft: { ...r.noteDraft, [id]: val } })); }} />
          <button type="button" class="icon-btn" aria-label="Add this note to the comments" disabled={!draft.trim() || sent} onClick={sendNote}><CheckIcon /></button>
          <span class="ok-text" style="width:150px">{sent ? 'Added to comments' : ''}</span>
        </div>
      )}
    </div>
  );
}

function Readings({ rec, change }) {
  const tol = tolerancePct(rec.values);
  const rows = readingRows(rec.readings, tol);
  const set = (k, val) => change((r) => ({ ...r, readings: { ...r.readings, [k]: val } }));
  const badge = (ok) => (ok === null ? null : <span class={'badge ' + (ok ? 'pass' : 'fail')}>{ok ? 'PASS' : 'FAIL'}</span>);
  return (
    <section class="card">
      <p class="muted" style="margin:0">
        Enter the measured output at each dial setting. A reading passes when it is within ±{tol}% of the dial setting.
        {tol === 20 ? ' Penlon and Sigma Delta vaporizers use the wider 20% range.' : ''}
      </p>
      <div class="readings">
        <span class="head">Dial</span><span class="head range">Acceptable</span><span class="head">1 LPM output</span><span class="head">Result</span><span class="head">4 LPM output</span><span class="head">Result</span>
        {rows.map((r) => [
          <span class="dial" key={'d' + r.dial}>{r.dial}%</span>,
          <span class="muted range" key={'r' + r.dial}>{r.lo.toFixed(2)} to {r.hi.toFixed(2)}</span>,
          <input key={'a' + r.dial} class="input" type="text" inputMode="decimal" aria-label={'1 LPM output at ' + r.dial + '% dial'} value={rec.readings['a' + r.dial] || ''} onInput={(e) => set('a' + r.dial, e.currentTarget.value)} />,
          <div key={'ab' + r.dial}>{badge(r.aOk)}</div>,
          <input key={'b' + r.dial} class="input" type="text" inputMode="decimal" aria-label={'4 LPM output at ' + r.dial + '% dial'} value={rec.readings['b' + r.dial] || ''} onInput={(e) => set('b' + r.dial, e.currentTarget.value)} />,
          <div key={'bb' + r.dial}>{badge(r.bOk)}</div>,
        ])}
      </div>
    </section>
  );
}

function Notes({ rec, change }) {
  const [q, setQ] = useState('');
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = tokens.length ? PARTS.filter((p) => tokens.every((t) => (p[0] + ' ' + p[1]).toLowerCase().includes(t))) : [];
  const hits = all.slice(0, 6);
  const addPart = (no, desc, price) => {
    change((r) => {
      const i = r.parts.findIndex((x) => x.no === no && x.desc === desc);
      const parts = i >= 0 ? r.parts.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) : r.parts.concat([{ no, desc, qty: 1, price }]);
      return { ...r, parts };
    });
    setQ('');
  };
  const setQty = (i, d) => change((r) => ({ ...r, parts: r.parts.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty + d) } : x)) }));
  const removePart = (i) => change((r) => ({ ...r, parts: r.parts.filter((_, j) => j !== i) }));
  const unpriced = rec.parts.filter((p) => p.price == null).length;

  const addFiles = async (e) => {
    const list = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    const added = [];
    for (const f of list) {
      const id = store.newId();
      await store.saveFile(id, f);
      added.push({ id, name: f.name || 'photo.jpg', type: f.type, size: f.size });
    }
    change((r) => ({ ...r, files: r.files.concat(added) }));
  };
  const removeFile = async (f) => {
    await store.deleteFile(f.id);
    change((r) => ({ ...r, files: r.files.filter((x) => x.id !== f.id) }));
  };

  return (
    <>
      <section class="card">
        <label for="comments"><h2>Comments</h2></label>
        <textarea id="comments" rows={6} value={rec.comments} onInput={(e) => { const v = e.currentTarget.value; change((r) => ({ ...r, comments: v })); }} />
      </section>

      <section class="card">
        <label for="partSearch"><h2>Parts used</h2></label>
        <p class="muted" style="margin:0">Search the price list for parts used on this unit during this visit. Parts and prices print on the certificate.</p>
        <input id="partSearch" class="input" type="search" autocomplete="off" placeholder="e.g. 171434 or tubing" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        {tokens.length > 0 && (
          <div class="hits">
            {hits.map((h) => (
              <div class="hit" key={h[0] + '|' + h[1]}>
                <span class="no">{h[0]}</span>
                <span class="desc">{h[1]}</span>
                <span class="muted" style="white-space:nowrap">{money(h[2])} / {h[3].toLowerCase()}</span>
                <button type="button" class="btn small" aria-label={'Add ' + h[0] + ' ' + h[1]} onClick={() => addPart(h[0], h[1], h[2])}>Add</button>
              </div>
            ))}
            <div class="hit">
              <span class="grow muted">{!all.length ? 'No match in the price list.' : all.length > 6 ? 'Showing 6 of ' + all.length + ' matches. Keep typing to narrow.' : all.length + ' match' + (all.length === 1 ? '' : 'es') + '.'}</span>
              <button type="button" class="btn small" onClick={() => addPart('Custom', q.trim(), null)}>Add as custom line</button>
            </div>
          </div>
        )}
        {rec.parts.map((p, i) => (
          <div class="part" key={p.no + p.desc}>
            <b style="width:76px">{p.no || '-'}</b>
            <span class="grow" style="min-width:160px">{p.desc}</span>
            <span class="muted">{p.price == null ? 'Not priced' : money(p.price) + ' each'}</span>
            <button type="button" class="qty" aria-label={'One fewer ' + p.desc} onClick={() => setQty(i, -1)}>−</button>
            <b style="min-width:28px;text-align:center">{p.qty}</b>
            <button type="button" class="qty" aria-label={'One more ' + p.desc} onClick={() => setQty(i, 1)}>+</button>
            <b style="min-width:80px;text-align:right">{p.price == null ? '' : money(p.price * p.qty)}</b>
            <button type="button" class="btn link" onClick={() => removePart(i)}>Remove</button>
          </div>
        ))}
        <div class="totals">
          <div class="field">
            <label for="fee">{rec.mode === 'full' ? 'Machine + vaporizer certification' : 'Vaporizer efficacy test'} ($)</label>
            <input id="fee" class="input" style="width:160px" type="text" inputMode="decimal" value={rec.fee} onInput={(e) => { const v = e.currentTarget.value; change((r) => ({ ...r, fee: v })); }} />
          </div>
          <p class="grow muted" style="margin:0;font-size:14px;min-width:200px">Recorded in SharePoint with the record. Not printed on the certificate and not added to the parts.</p>
          <div style="text-align:right">
            <div class="muted" style="font-size:14px">Parts subtotal{unpriced ? ', plus ' + unpriced + ' unpriced line' + (unpriced === 1 ? '' : 's') : ''}</div>
            <b style="font-size:22px">{money(partsSubtotal(rec.parts))}</b>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Attachments</h2>
        <p class="muted" style="margin:0">Photos or PDFs. They are stored on this tablet and upload with the record.</p>
        <div class="row">
          <label class="btn" for="camera">Take photo</label>
          <input id="camera" class="visually-hidden" type="file" accept="image/*" capture="environment" onChange={addFiles} />
          <label class="btn" for="files">Add photo or file</label>
          <input id="files" class="visually-hidden" type="file" accept="image/*,application/pdf" multiple onChange={addFiles} />
        </div>
        {rec.files.map((f) => (
          <div class="file" key={f.id}>
            <span>{f.name}</span>
            <span class="muted" style="flex-grow:0">{(f.size / 1048576).toFixed(1)} MB</span>
            <button type="button" class="btn link" onClick={() => removeFile(f)}>Remove</button>
          </div>
        ))}
      </section>
    </>
  );
}

function Review({ rec, change, tn, preview }) {
  const tol = tolerancePct(rec.values);
  const st = readingStats(rec.readings, tol);
  const fails = itemsFailed(rec);
  const missing = missingForSubmit(rec);
  const lines = [
    ['Tracking number', tn],
    ['Record type', rec.mode === 'full' ? 'Machine + vaporizer' : 'Vaporizer only'],
    ['Work done', (rec.location || 'Field') === 'Shop' ? 'In the shop' : 'In the field'],
    ['Service type', rec.serviceType || 'Efficacy test'],
    ['Facility', rec.values.facility || 'Not entered', !rec.values.facility],
    ['Vaporizer serial number', rec.values.vSn || 'Not entered', !rec.values.vSn],
    ...(rec.mode === 'full' ? [
      ['O2 concentrator', rec.toggles.conc ? 'Present' + (rec.values.ocPct ? ', ' + rec.values.ocPct + '% at 2 LPM' : '') + (rec.values.ocPsi ? ', ' + rec.values.ocPsi + ' psi' : '') : 'Not present'],
      ['CO2 absorber', rec.toggles.co2 ? 'Present' : 'Not present'],
    ] : []),
    ['Output readings entered', st.entered + ' of 10'],
    ['Readings outside ±' + tol + '%', String(st.failed), st.failed > 0],
    ['Inspection items marked Fail', String(fails), fails > 0],
    ['Parts used', rec.parts.length ? rec.parts.map((p) => (p.no === 'Custom' || !p.no ? p.desc : p.no) + ' x' + p.qty).join(', ') : 'None'],
    ['Service charge', money(Number(rec.fee) || 0)],
    ['Attachments', String(rec.files.length)],
  ];
  return (
    <>
      <section class="card">
        <div class="grid2">
          <div class="field">
            <label for="svcDate">Service date</label>
            <input id="svcDate" class="input" type="date" value={rec.date} onInput={(e) => { const v = e.currentTarget.value; if (v) change((r) => ({ ...r, date: v })); }} />
          </div>
          <div class="field">
            <label for="recTech">Technician on this record</label>
            <select id="recTech" value={rec.tech} onChange={(e) => { const v = e.currentTarget.value; change((r) => ({ ...r, tech: v })); }}>
              {TECHNICIANS.map((t) => <option value={t} key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </section>
      <section class="card">
        <dl class="review" style="margin:0">
          {lines.map(([k, v, bad]) => <div key={k}><dt>{k}</dt><dd class={bad ? 'bad' : ''}>{v}</dd></div>)}
        </dl>
      </section>
      {missing.length > 0 && <p class="bad" style="margin:0;font-weight:600">Add the {missing.join(' and ')} before submitting. They name the certificate file.</p>}
      <div class="row">
        <button type="button" class="btn" onClick={preview}>Preview certificate (PDF)</button>
        <span class="muted">Submitting saves the record and its certificate on this tablet. It uploads to SharePoint the next time you are online. Service date {usDate(rec.date)}.</span>
      </div>
    </>
  );
}
