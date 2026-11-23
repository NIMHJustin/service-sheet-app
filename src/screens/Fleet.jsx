import { useState } from 'preact/hooks';
import { ACTIVE, fleetAlerts, daysUntil, normSn } from '../lib/fleet.js';
import { usDate, todayIso } from '../lib/calc.js';
import { LISTS } from '../data/lists.js';

const KIND_LABEL = {
  add: 'Add unit', loanOut: 'Loan out', return: 'Returned', exchange: 'Exchange', inService: 'Send for service', stock: 'Back in stock', retire: 'Retire',
};

const STATUS_CLASS = { 'In stock': 'uploaded', 'Out on loan': 'uploading', 'In service': 'pending', Transferred: 'muted', Retired: 'muted' };

function dueText(iso, today) {
  if (!iso) return { text: 'Not recorded', cls: 'bad' };
  const d = daysUntil(iso, today);
  if (d < 0) return { text: usDate(iso) + ' (overdue)', cls: 'bad' };
  if (d <= 30) return { text: usDate(iso) + ' (' + d + ' days)', cls: 'warn-text' };
  return { text: usDate(iso), cls: '' };
}

function Text({ id, label, value, set, list, type = 'text', required }) {
  return (
    <div class="field">
      <label for={id}>{label}{required ? ' *' : ''}</label>
      <input id={id} class="input" type={type} list={list ? id + '_l' : undefined} value={value} autocomplete="off" onInput={(e) => set(e.currentTarget.value)} />
      {list && <datalist id={id + '_l'}>{list.map((o) => <option value={o} key={o} />)}</datalist>}
    </div>
  );
}

function ActionForm({ unit, kind, facilities, onDone, onCancel, units }) {
  const [f, setF] = useState({ date: todayIso(), facility: '', customerSn: '', dueBack: '', notes: '', inSn: '', inMfr: '', inModel: '', inAgent: 'Isoflurane', status: 'In stock' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const clash = kind === 'exchange' && f.inSn.trim() && units.some((u) => normSn(u.sn) === normSn(f.inSn) && ACTIVE(u));
  let ok = !!f.date;
  if (kind === 'loanOut') ok = ok && f.facility.trim();
  if (kind === 'exchange') ok = ok && f.facility.trim() && f.inSn.trim() && !clash;
  const submit = () => {
    const data = { notes: f.notes.trim() || undefined };
    if (kind === 'loanOut') Object.assign(data, { facility: f.facility.trim(), customerSn: f.customerSn.trim(), dueBack: f.dueBack });
    if (kind === 'return') data.status = f.status;
    if (kind === 'exchange') Object.assign(data, { facility: f.facility.trim(), in: { sn: f.inSn.trim(), mfr: f.inMfr.trim(), model: f.inModel.trim(), agent: f.inAgent.trim() } });
    onDone({ kind, sn: unit.sn, date: f.date, data });
  };
  return (
    <div class="card" style="margin-top:4px;background:#F8FAFC">
      <h2>{KIND_LABEL[kind]}: {unit.sn}</h2>
      <div class="grid2">
        <Text id="fa_date" label="Date" type="date" value={f.date} set={set('date')} required />
        {(kind === 'loanOut' || kind === 'exchange') && <Text id="fa_fac" label="Facility" value={f.facility} set={set('facility')} list={facilities} required />}
        {kind === 'loanOut' && <Text id="fa_cust" label="Customer's vaporizer serial (being serviced)" value={f.customerSn} set={set('customerSn')} />}
        {kind === 'loanOut' && <Text id="fa_due" label="Due back" type="date" value={f.dueBack} set={set('dueBack')} />}
        {kind === 'return' && (
          <div class="field">
            <label for="fa_st">After return</label>
            <select id="fa_st" value={f.status} onChange={(e) => set('status')(e.currentTarget.value)}>
              <option value="In stock">In stock, ready to loan</option>
              <option value="In service">In service, needs a check first</option>
            </select>
          </div>
        )}
        {kind === 'exchange' && <Text id="fa_isn" label="Customer's unit serial (joins the exchange pool)" value={f.inSn} set={set('inSn')} required />}
        {kind === 'exchange' && <Text id="fa_imf" label="Its manufacturer" value={f.inMfr} set={set('inMfr')} list={LISTS.vapMfr} />}
        {kind === 'exchange' && <Text id="fa_imo" label="Its model" value={f.inModel} set={set('inModel')} list={LISTS.vapModel} />}
        {kind === 'exchange' && <Text id="fa_iag" label="Its agent" value={f.inAgent} set={set('inAgent')} list={LISTS.agent} />}
        <div class="field span-all">
          <label for="fa_notes">Notes</label>
          <input id="fa_notes" class="input" type="text" value={f.notes} onInput={(e) => set('notes')(e.currentTarget.value)} />
        </div>
      </div>
      {kind === 'exchange' && <p class="muted" style="margin:0">{unit.sn} goes to the customer and leaves the fleet. Their unit joins the exchange pool as In service until its efficacy test passes.</p>}
      {clash && <p class="bad" style="margin:0">That serial is already an active fleet unit.</p>}
      <div class="row">
        <button type="button" class="btn primary" disabled={!ok} onClick={submit}>Save</button>
        <button type="button" class="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddForm({ units, onDone, onCancel }) {
  const [f, setF] = useState({ sn: '', fleet: 'Loan', mfr: '', model: '', agent: 'Isoflurane', lastService: '', status: 'In stock', notes: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const dup = f.sn.trim() && units.some((u) => normSn(u.sn) === normSn(f.sn) && ACTIVE(u));
  const ok = f.sn.trim() && !dup;
  return (
    <div class="card">
      <h2>Add a unit to the fleet</h2>
      <div class="grid2">
        <Text id="ad_sn" label="Serial number" value={f.sn} set={set('sn')} required />
        <div class="field">
          <label for="ad_fleet">Fleet</label>
          <div class="seg" id="ad_fleet">
            {['Loan', 'Exchange'].map((x) => <button type="button" key={x} aria-pressed={f.fleet === x} onClick={() => set('fleet')(x)}>{x}</button>)}
          </div>
        </div>
        <Text id="ad_mfr" label="Manufacturer" value={f.mfr} set={set('mfr')} list={LISTS.vapMfr} />
        <Text id="ad_model" label="Model" value={f.model} set={set('model')} list={LISTS.vapModel} />
        <Text id="ad_agent" label="Agent" value={f.agent} set={set('agent')} list={LISTS.agent} />
        <Text id="ad_last" label="Last efficacy test (if known)" type="date" value={f.lastService} set={set('lastService')} />
        <div class="field">
          <label for="ad_status">Status</label>
          <select id="ad_status" value={f.status} onChange={(e) => set('status')(e.currentTarget.value)}>
            <option>In stock</option><option>In service</option><option>Out on loan</option>
          </select>
        </div>
        <Text id="ad_notes" label="Notes" value={f.notes} set={set('notes')} />
      </div>
      {dup && <p class="bad" style="margin:0">That serial is already in the fleet.</p>}
      <div class="row">
        <button type="button" class="btn primary" disabled={!ok} onClick={() => onDone({ kind: 'add', sn: f.sn.trim(), date: todayIso(), data: { ...f, sn: f.sn.trim() } })}>Add unit</button>
        <button type="button" class="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function Fleet({ units, queue, syncedAt, missing, online, account, syncing, sync, queueAction, retryQueue, dropAction, facilities }) {
  const [filter, setFilter] = useState('All');
  const [showOld, setShowOld] = useState(false);
  const [open, setOpen] = useState(null); // { sn, kind }
  const [adding, setAdding] = useState(false);
  const today = todayIso();
  const alerts = fleetAlerts(units, today);
  const shown = units
    .filter((u) => (filter === 'All' || u.fleet === filter) && (showOld || ACTIVE(u)))
    .sort((a, b) => (a.fleet || '').localeCompare(b.fleet || '') || a.sn.localeCompare(b.sn, undefined, { numeric: true }));
  const count = (fl, st) => units.filter((u) => u.fleet === fl && u.status === st).length;
  const save = (a) => { queueAction(a); setOpen(null); setAdding(false); };

  const actionsFor = (u) => {
    const out = [];
    if (u.status === 'In stock' && u.fleet === 'Loan') out.push('loanOut');
    if (u.status === 'In stock' && u.fleet === 'Exchange') out.push('exchange');
    if (u.status === 'Out on loan') out.push('return');
    if (u.status === 'In service') out.push('stock');
    if (u.status === 'In stock') out.push('inService');
    if (ACTIVE(u)) out.push('retire');
    return out;
  };

  return (
    <main class="page">
      <div class="row">
        <h1 class="grow">Fleet</h1>
        <button type="button" class="btn" disabled={!online || !account || syncing} onClick={sync}>{syncing ? 'Syncing...' : 'Refresh'}</button>
        <button type="button" class="btn primary" onClick={() => setAdding(true)}>Add unit</button>
      </div>

      {missing && (
        <div class="banner warn" style="border-radius:12px">The Fleet Vaporizers and Fleet Movements lists aren't in SharePoint yet. Create them with Step 8 of the SharePoint setup doc, then choose Refresh.</div>
      )}
      {!syncedAt && !missing && (
        <p class="muted" style="margin:0">The fleet list downloads the first time the app is online and signed in. Changes made before then are kept and uploaded.</p>
      )}

      <div class="row">
        <div class="stat"><span class="muted">Loaners in stock / out</span><b>{count('Loan', 'In stock')} / {count('Loan', 'Out on loan')}</b></div>
        <div class="stat"><span class="muted">Exchange units in stock</span><b>{count('Exchange', 'In stock')}</b></div>
        <div class="stat"><span class="muted">In service</span><b>{units.filter((u) => u.status === 'In service').length}</b></div>
        <div class="stat"><span class={'muted'}>Loans overdue</span><b class={alerts.overdueLoans.length ? 'bad' : ''}>{alerts.overdueLoans.length}</b></div>
        <div class="stat"><span class="muted">Tests due within 30 days</span><b class={alerts.testsDue.length ? 'bad' : ''}>{alerts.testsDue.length}</b></div>
      </div>

      {adding && <AddForm units={units} onDone={save} onCancel={() => setAdding(false)} />}

      <div class="row">
        <div class="seg">
          {['All', 'Loan', 'Exchange'].map((x) => <button type="button" key={x} aria-pressed={filter === x} onClick={() => setFilter(x)}>{x}</button>)}
        </div>
        <label class="row" style="gap:8px;font-size:15px">
          <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.currentTarget.checked)} style="width:22px;height:22px" />
          Show transferred and retired
        </label>
        <div class="grow" />
        <span class="muted" style="font-size:14px">{syncedAt ? 'Updated ' + new Date(syncedAt).toLocaleString() : ''}</span>
      </div>

      {shown.length === 0 && <div class="empty">No units to show. Choose Add unit to enter your loaners and exchange units.</div>}

      {shown.map((u) => {
        const due = dueText(u.nextDue, today);
        const back = u.status === 'Out on loan' && u.dueBack ? dueText(u.dueBack, today) : null;
        return (
          <div key={u.sn}>
            <div class="rec">
              <div style="width:150px">
                <b style="font-size:17px">{u.sn}</b>
                <div class="muted" style="font-size:14px">{u.fleet || 'No fleet'}</div>
              </div>
              <div class="info">
                <b>{[u.mfr, u.model].filter(Boolean).join(' ') || 'Make and model not set'}{u.agent ? ' · ' + u.agent : ''}</b>
                <span class="muted">
                  {u.status === 'Out on loan' ? 'At ' + u.location + (u.customerSn ? ' · servicing their ' + u.customerSn : '') : u.location}
                  {back ? ' · due back ' : ''}{back && <span class={back.cls}>{back.text}</span>}
                </span>
                <span class="muted" style="font-size:14px">Next efficacy test: <span class={due.cls}>{due.text}</span>{u.lastTn ? ' · last ' + u.lastTn : ''}</span>
              </div>
              <span class={'status ' + (STATUS_CLASS[u.status] || '')}>{u.status}</span>
              {actionsFor(u).map((k) => (
                <button type="button" key={k} class={k === 'retire' ? 'btn link' : 'btn small'} onClick={() => setOpen(open?.sn === u.sn && open.kind === k ? null : { sn: u.sn, kind: k })}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            {open?.sn === u.sn && <ActionForm unit={u} kind={open.kind} units={units} facilities={facilities} onDone={save} onCancel={() => setOpen(null)} />}
          </div>
        );
      })}

      {queue.length > 0 && (
        <section class="card">
          <h2>Changes waiting to upload</h2>
          {queue.map((a) => (
            <div class="row" key={a.id}>
              <span class="grow">{KIND_LABEL[a.kind]} · {a.sn || a.data?.sn} · {usDate(a.date)}</span>
              {a.error ? <span class="status error">Needs attention</span> : <span class="status pending">Waiting</span>}
              {a.error && <button type="button" class="btn small" onClick={retryQueue}>Try again</button>}
              <button type="button" class="btn link" onClick={() => dropAction(a)}>Cancel change</button>
              {a.error && <div class="err">{a.error}</div>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
