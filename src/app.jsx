import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { TECHNICIANS } from './data/lists.js';
import { SITE_FIELDS } from './data/forms.js';
import { DEFAULT_FEES } from './config.js';
import * as store from './lib/store.js';
import * as auth from './lib/auth.js';
import { makeGraph } from './lib/graph.js';
import { uploadRecord } from './lib/upload.js';
import { certificateBlob } from './lib/pdf.js';
import { loadLogo } from './lib/logo.js';
import { nextTrackingNumber, todayIso, certificateFileName } from './lib/calc.js';
import { Home } from './screens/Home.jsx';
import { Form } from './screens/Form.jsx';
import { Outbox } from './screens/Outbox.jsx';
import { Fleet } from './screens/Fleet.jsx';
import { lazy, Suspense } from 'preact/compat';
import { existingTrackingNumbers } from './lib/upload.js';

const Import = lazy(() => import('./screens/Import.jsx').then((m) => ({ default: m.Import })));
import { currentUnits, resolveFleet, uploadAction, fetchUnits, fleetAlerts } from './lib/fleet.js';

const KEEP_UPLOADED_DAYS = 30;

export async function makePdfBlob(rec) {
  if (rec.importedPdfId) {
    const original = await store.getFile(rec.importedPdfId);
    if (original) return original;
  }
  const logo = await loadLogo();
  return certificateBlob(rec, logo);
}

export async function openPdf(rec) {
  const blob = await makePdfBlob(rec);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = certificateFileName(rec);
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

export function App() {
  const [screen, setScreen] = useState('home');
  const [records, setRecords] = useState([]);
  const [draft, setDraft] = useState(null);
  const [tech, setTechState] = useState(store.setting('tech', TECHNICIANS[1]));
  const [lock, setLockState] = useState(store.setting('siteLock', null));
  const [lastSite, setLastSite] = useState(store.setting('lastSite', null));
  const [account, setAccount] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [update, setUpdate] = useState(null);
  const [fleet, setFleetState] = useState({ units: [], syncedAt: null, missing: false });
  const [fleetQueue, setFleetQueueState] = useState([]);
  const online = useOnline();
  const saveTimer = useRef(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => setRecords(await store.allRecords()), []);

  useEffect(() => {
    (async () => {
      await store.requestPersistence();
      // Tidy up: uploaded records are kept on the tablet for 30 days, then removed.
      const all = await store.allRecords();
      const cutoff = Date.now() - KEEP_UPLOADED_DAYS * 864e5;
      for (const r of all) {
        if (r.status === 'uploaded' && r.uploadedAt && Date.parse(r.uploadedAt) < cutoff) await store.deleteRecord(r.id);
      }
      await refresh();
      setFleetState(await store.getFleet());
      setFleetQueueState(await store.getFleetQueue());
      loadLogo();
      try {
        await auth.init();
        setAccount(auth.account());
      } finally {
        setAuthReady(true);
      }
    })();
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({ onNeedRefresh: () => setUpdate(() => () => updateSW(true)) });
    }).catch(() => {});
  }, []);

  const setTech = (t) => { setTechState(t); store.setSetting('tech', t); };
  const setLock = (l) => { setLockState(l); store.setSetting('siteLock', l); };

  // ----- drafts -----
  const persistDraft = (rec) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { store.saveRecord(rec).then(refresh); }, 300);
  };
  const changeDraft = (fn) => {
    setDraft((cur) => {
      const next = typeof fn === 'function' ? fn(cur) : fn;
      persistDraft(next);
      return next;
    });
  };

  const start = (mode, keepSite) => {
    const values = {};
    const src = lock?.values || (keepSite ? lastSite : null);
    if (src) for (const k of SITE_FIELDS) if (src[k]) values[k] = src[k];
    const rec = {
      id: store.newId(), mode, status: 'draft', tech, date: todayIso(), createdAt: new Date().toISOString(),
      values, readings: {}, toggles: {}, comments: '', parts: [], fee: DEFAULT_FEES[mode], files: [],
      noteDraft: {}, noteSent: {}, sec: lock || keepSite ? 1 : 0, serviceType: 'Efficacy test', location: 'Field',
    };
    setDraft(rec);
    store.saveRecord(rec).then(refresh);
    setScreen('form');
  };

  const resume = (rec) => { setDraft(rec); setScreen('form'); };

  const discard = async (rec) => {
    if (!confirm('Discard this draft? It cannot be recovered.')) return;
    await store.deleteRecord(rec.id);
    if (draft?.id === rec.id) setDraft(null);
    refresh();
  };

  const submit = async () => {
    clearTimeout(saveTimer.current);
    const all = await store.allRecords();
    const used = all.map((r) => r.tn).filter(Boolean);
    const rec = { ...draft, tech: draft.tech || tech, status: 'pending', submittedAt: new Date().toISOString() };
    rec.tn = nextTrackingNumber(rec.tech, rec.date, used);
    delete rec.sec;
    await store.saveRecord(rec);
    const site = {};
    for (const k of SITE_FIELDS) if (rec.values[k]) site[k] = rec.values[k];
    setLastSite({ ...site, mode: rec.mode });
    store.setSetting('lastSite', { ...site, mode: rec.mode });
    setDraft(null);
    await refresh();
    setScreen('outbox');
  };

  // ----- fleet -----
  const queueFleet = async (a) => {
    const q = [...(await store.getFleetQueue()), { ...a, id: store.newId(), tech, queuedAt: new Date().toISOString() }];
    await store.setFleetQueue(q);
    setFleetQueueState(q);
  };
  const dropFleetAction = async (a) => {
    if (!confirm('Cancel this change? It has not been uploaded.')) return;
    const q = (await store.getFleetQueue()).filter((x) => x.id !== a.id);
    await store.setFleetQueue(q);
    setFleetQueueState(q);
  };

  // Uploads queued fleet changes in order, then downloads the current fleet list.
  const syncFleet = async (graph) => {
    const fl = await resolveFleet(graph);
    if (!fl) {
      const f = { ...(await store.getFleet()), missing: true };
      await store.setFleet(f);
      setFleetState(f);
      return;
    }
    let q = await store.getFleetQueue();
    while (q.length) {
      const a = q[0];
      setUploadNote('Fleet: ' + a.kind + ' ' + (a.sn || a.data?.sn || ''));
      try {
        const saveProgress = async (x) => {
          q = [x, ...q.slice(1)];
          await store.setFleetQueue(q);
        };
        await uploadAction(graph, fl, { ...a, error: null }, saveProgress);
        q = q.slice(1);
        await store.setFleetQueue(q);
        setFleetQueueState(q);
      } catch (e) {
        if (e?.name === 'SignInNeeded' || e?.name === 'Offline') throw e;
        q = [{ ...q[0], error: e?.message || String(e) }, ...q.slice(1)];
        await store.setFleetQueue(q);
        setFleetQueueState(q);
        break;
      }
    }
    const f = { units: await fetchUnits(graph, fl), syncedAt: new Date().toISOString(), missing: false };
    await store.setFleet(f);
    setFleetState(f);
  };

  // ----- upload -----
  const uploadAll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setUploading(true);
    setUploadNote('');
    const graph = makeGraph(auth.token);
    const cache = { get: () => store.setting('targets', null), set: (v) => store.setSetting('targets', v) };
    try {
      const pending = (await store.allRecords()).filter((r) => r.status === 'pending' || r.status === 'uploading')
        .sort((a, b) => (a.submittedAt || '').localeCompare(b.submittedAt || ''));
      for (const r of pending) {
        await uploadRecord({ ...r, status: 'uploading' }, {
          graph, cache,
          getFile: store.getFile,
          save: store.saveRecord,
          makePdf: makePdfBlob,
          onStep: (rec, text) => { setUploadNote(rec.tn + ': ' + text); refresh(); },
        });
      }
      await syncFleet(graph);
      setUploadNote('');
      setSignInNeeded(false);
    } catch (e) {
      if (e?.name === 'SignInNeeded') setSignInNeeded(true);
      else if (e?.name === 'Offline') setUploadNote('Lost connection. Records are safe on this tablet; upload will continue when you are back online.');
      else setUploadNote(e?.message || String(e));
    } finally {
      busy.current = false;
      setUploading(false);
      refresh();
    }
  }, [refresh]);

  const pendingCount = records.filter((r) => r.status === 'pending' || r.status === 'uploading').length;

  const fleetWaiting = fleetQueue.filter((a) => !a.error).length;

  // Upload automatically when online, signed in and something is waiting.
  useEffect(() => {
    if (online && account && (pendingCount || fleetWaiting) && !busy.current && !signInNeeded) uploadAll();
  }, [online, account, pendingCount, fleetWaiting, signInNeeded, uploadAll]);

  // Refresh the fleet list once per app start when online.
  const fleetFetched = useRef(false);
  useEffect(() => {
    if (online && account && !fleetFetched.current && !signInNeeded) {
      fleetFetched.current = true;
      uploadAll();
    }
  }, [online, account, signInNeeded, uploadAll]);

  const units = currentUnits(fleet.units, fleetQueue);
  const alerts = fleetAlerts(units);
  const facilities = [...new Set(records.map((r) => r.values?.facility).filter(Boolean))].sort();
  const retryFleet = async () => {
    const q = (await store.getFleetQueue()).map((a) => ({ ...a, error: null }));
    await store.setFleetQueue(q);
    setFleetQueueState(q);
    uploadAll();
  };

  const retry = async (rec) => {
    await store.saveRecord({ ...rec, status: 'pending', error: null });
    setSignInNeeded(false);
    await refresh();
    uploadAll();
  };

  const remove = async (rec) => {
    const msg = rec.status === 'uploaded'
      ? 'Remove this uploaded record from the tablet? It stays in SharePoint.'
      : 'Delete this record? It has NOT been uploaded and cannot be recovered.';
    if (!confirm(msg)) return;
    await store.deleteRecord(rec.id);
    refresh();
  };

  const signIn = () => (signInNeeded && account ? auth.renewSignIn() : auth.signIn());

  return (
    <div class="app">
      <header class="top">
        <button type="button" class="brand" onClick={() => setScreen('home')}>Service Sheet</button>
        <div class="grow" />
        <div class="tech">
          <label for="tech">Technician</label>
          <select id="tech" value={tech} onChange={(e) => setTech(e.currentTarget.value)}>
            {TECHNICIANS.map((t) => <option value={t} key={t}>{t}</option>)}
          </select>
        </div>
        <span class={'chip ' + (online ? 'on' : 'off')}>{online ? 'Online' : 'Offline'}</span>
        <button type="button" class="btn" onClick={() => setScreen('fleet')}>Fleet{alerts.overdueLoans.length + alerts.testsDue.length ? ' · ' + (alerts.overdueLoans.length + alerts.testsDue.length) + ' due' : ''}</button>
        <button type="button" class="btn" onClick={() => setScreen('outbox')}>Outbox · {pendingCount + fleetWaiting} waiting</button>
      </header>
      {update && (
        <div class="banner info" role="status">
          <span class="grow">A new version of the app is ready. Your work is saved.</span>
          <button type="button" class="btn small" onClick={update}>Update now</button>
        </div>
      )}
      {screen === 'home' && (
        <Home
          start={start} resume={resume} discard={discard} drafts={records.filter((r) => r.status === 'draft')}
          lock={lock} setLock={setLock} lastSite={lastSite} records={records} goOutbox={() => setScreen('outbox')}
          fleetAlerts={units.length ? alerts : null} goFleet={() => setScreen('fleet')} goImport={() => setScreen('import')}
        />
      )}
      {screen === 'form' && draft && (
        <Form
          rec={draft} change={changeDraft} tech={tech} lock={lock} setLock={setLock}
          records={records} close={() => { setScreen('home'); }} submit={submit} preview={(tn) => openPdf({ ...draft, tn })}
          fleetUnits={units}
        />
      )}
      {screen === 'outbox' && (
        <Outbox
          records={records.filter((r) => r.status !== 'draft')} online={online} account={account} authReady={authReady}
          signInNeeded={signInNeeded} uploading={uploading} note={uploadNote} upload={uploadAll} signIn={signIn}
          signOut={auth.signOut} retry={retry} remove={remove} view={openPdf} newRecord={() => setScreen('home')}
          fleetWaiting={fleetWaiting}
        />
      )}
      {screen === 'import' && (
        <Suspense fallback={<main class="page"><p class="muted">Loading...</p></main>}>
          <Import
            records={records} online={online} account={account}
            checkSharePoint={() => existingTrackingNumbers(makeGraph(auth.token), { get: () => store.setting('targets', null), set: (v) => store.setSetting('targets', v) })}
            done={async (n) => { await refresh(); setUploadNote(n + ' imported report' + (n === 1 ? '' : 's') + ' added.'); setScreen('outbox'); }}
          />
        </Suspense>
      )}
      {screen === 'fleet' && (
        <Fleet
          units={units} queue={fleetQueue} syncedAt={fleet.syncedAt} missing={fleet.missing} online={online} account={account}
          syncing={uploading} sync={uploadAll} queueAction={queueFleet} retryQueue={retryFleet} dropAction={dropFleetAction}
          facilities={facilities}
        />
      )}
    </div>
  );
}
