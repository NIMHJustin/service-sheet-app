import { LockIcon } from './icons.jsx';

const when = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export function Home({ start, resume, discard, drafts, lock, setLock, lastSite, records, goOutbox, fleetAlerts, goFleet }) {
  const waiting = records.filter((r) => r.status === 'pending' || r.status === 'uploading' || r.status === 'error').length;
  const uploaded = records.filter((r) => r.status === 'uploaded').length;
  const lockedName = lock ? [lock.values.facility, lock.values.city, lock.values.state].filter(Boolean).join(', ') : '';
  return (
    <main class="page">
      <h1>New service record</h1>
      <div class="start-grid">
        <button type="button" class="start" onClick={() => start('full', false)}>
          <strong>Machine + vaporizer</strong>
          <span>Full anesthesia machine certification: O2 connection, yokes, flowmeters, scavenging, O2 concentrator, CO2 absorber, and the vaporizer mounted on it.</span>
          <em>Start certification</em>
        </button>
        <button type="button" class="start" onClick={() => start('vap', false)}>
          <strong>Vaporizer only</strong>
          <span>Vaporizer efficacy test: provisional inspection and output readings at 1 and 4 LPM.</span>
          <em>Start efficacy test</em>
        </button>
      </div>

      {lock && (
        <div class="card">
          <div class="row">
            <LockIcon />
            <div class="grow">
              <h2>Site locked: {lockedName}</h2>
              <span class="muted">Every new record starts with this site filled in until you unlock it.</span>
            </div>
            <button type="button" class="btn" onClick={() => setLock(null)}>Unlock site</button>
          </div>
        </div>
      )}
      {!lock && lastSite?.facility && (
        <div class="row">
          <button type="button" class="btn primary big" onClick={() => start(lastSite.mode || 'full', true)}>
            Next unit at {lastSite.facility}
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <section class="card">
          <h2>Unfinished drafts</h2>
          {drafts.map((d) => (
            <div class="row" key={d.id}>
              <div class="grow">
                <b>{d.values.facility || 'No facility yet'}</b>
                <span class="muted"> · {d.mode === 'full' ? 'Machine + vaporizer' : 'Vaporizer only'} · started {when(d.createdAt)}</span>
              </div>
              <button type="button" class="btn small" onClick={() => resume(d)}>Continue</button>
              <button type="button" class="btn link" onClick={() => discard(d)}>Discard</button>
            </div>
          ))}
        </section>
      )}

      {fleetAlerts && (fleetAlerts.overdueLoans.length > 0 || fleetAlerts.testsDue.length > 0) && (
        <section class="card">
          <div class="row">
            <div class="grow">
              <h2>Fleet</h2>
              <span class="muted">
                {fleetAlerts.overdueLoans.length} loan{fleetAlerts.overdueLoans.length === 1 ? '' : 's'} overdue · {fleetAlerts.testsDue.length} efficacy test{fleetAlerts.testsDue.length === 1 ? '' : 's'} due within 30 days
              </span>
            </div>
            <button type="button" class="btn" onClick={goFleet}>Open fleet</button>
          </div>
        </section>
      )}

      <section class="card">
        <div class="row">
          <div class="stat"><span class="muted">Waiting to upload</span><b>{waiting}</b></div>
          <div class="stat"><span class="muted">Uploaded to SharePoint</span><b>{uploaded}</b></div>
          <p class="grow muted" style="margin:0;min-width:240px">Records are saved on this tablet when you submit. They stay here until SharePoint confirms the upload.</p>
          <button type="button" class="btn" onClick={goOutbox}>Open outbox</button>
        </div>
      </section>
    </main>
  );
}
