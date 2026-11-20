import { usDate } from '../lib/calc.js';

const STATUS = {
  pending: ['Waiting to upload', 'pending'],
  uploading: ['Uploading', 'uploading'],
  uploaded: ['Uploaded', 'uploaded'],
  error: ['Needs attention', 'error'],
};

export function Outbox({ records, online, account, authReady, signInNeeded, uploading, note, upload, signIn, signOut, retry, remove, view, newRecord }) {
  const sorted = records.slice().sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  const waiting = records.filter((r) => r.status === 'pending' || r.status === 'uploading').length;
  let msg;
  if (!records.length) msg = 'No records on this tablet yet. Submitted records appear here.';
  else if (uploading) msg = note || 'Uploading...';
  else if (!waiting) msg = 'Everything on this tablet has been uploaded.';
  else if (!online) msg = 'No connection. ' + waiting + ' record' + (waiting === 1 ? ' is' : 's are') + ' safe on this tablet and will upload when you are online.';
  else if (!account || signInNeeded) msg = waiting + ' record' + (waiting === 1 ? '' : 's') + ' ready. Sign in to upload.';
  else msg = note || waiting + ' record' + (waiting === 1 ? '' : 's') + ' ready to upload.';

  return (
    <main class="page">
      <div class="row">
        <h1 class="grow">Outbox</h1>
        {account && !signInNeeded ? (
          <button type="button" class="btn primary big" disabled={!online || !waiting || uploading} onClick={upload}>
            {uploading ? 'Uploading...' : 'Upload to SharePoint'}
          </button>
        ) : (
          <button type="button" class="btn primary big" disabled={!online || !authReady} onClick={signIn}>Sign in to upload</button>
        )}
      </div>

      {signInNeeded && (
        <div class="banner warn" role="status" style="border-radius:12px">
          Your Microsoft sign-in has expired, which happens after about a day without uploading. Sign in again to upload; you will approve it on your phone. Your records are safe on this tablet.
        </div>
      )}
      <p class="muted" style="margin:0;font-size:16px" role="status">{msg}</p>

      {sorted.map((r) => {
        const [label, cls] = STATUS[r.status] || STATUS.pending;
        return (
          <div class="rec" key={r.id}>
            <span class="tn">{r.tn}</span>
            <div class="info">
              <b>{r.values.facility || 'No facility'} · {r.values.vSn || 'No serial'}</b>
              <span class="muted">
                {r.mode === 'full' ? 'Machine + vaporizer' : 'Vaporizer only'} · {usDate(r.date)} · {r.tech}
                {r.files?.length ? ' · ' + r.files.length + ' attachment' + (r.files.length === 1 ? '' : 's') : ''}
              </span>
            </div>
            <span class={'status ' + cls}>{label}</span>
            <button type="button" class="btn small" onClick={() => view(r)}>Certificate</button>
            {r.status === 'error' && <button type="button" class="btn small" onClick={() => retry(r)}>Try again</button>}
            {r.progress?.pdf?.webUrl && r.status === 'uploaded' && (
              <a class="btn small" href={r.progress.pdf.webUrl} target="_blank" rel="noopener">Open in SharePoint</a>
            )}
            <button type="button" class="btn link" onClick={() => remove(r)}>{r.status === 'uploaded' ? 'Remove' : 'Delete'}</button>
            {r.status === 'error' && r.error && <div class="err">{r.error}</div>}
          </div>
        );
      })}

      <div class="row">
        <button type="button" class="btn big" onClick={newRecord}>New record</button>
        <div class="grow" />
        {account && (
          <span class="muted">Signed in as {account.name || account.username} · <button type="button" class="btn link" style="color:var(--accent)" onClick={signOut}>Sign out</button></span>
        )}
      </div>
      <p class="muted" style="margin:0;font-size:14px">Uploaded records stay on this tablet for 30 days, then are removed automatically. They remain in SharePoint.</p>
    </main>
  );
}
