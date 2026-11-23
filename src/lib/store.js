// On-tablet storage. Records, the open draft and attachment files live in IndexedDB,
// which survives closing the app and restarting the tablet. Small settings use localStorage.

import { get, set, del, keys, createStore } from 'idb-keyval';

const records = createStore('service-sheet', 'records');
const files = createStore('service-sheet-files', 'files');

export async function saveRecord(rec) {
  await set(rec.id, rec, records);
  return rec;
}

export async function getRecord(id) {
  return get(id, records);
}

export async function deleteRecord(id) {
  const rec = await get(id, records);
  if (rec?.files) for (const f of rec.files) await del(f.id, files);
  await del(id, records);
}

export async function allRecords() {
  const ids = await keys(records);
  const out = [];
  for (const id of ids) {
    const r = await get(id, records);
    if (r) out.push(r);
  }
  return out;
}

export async function saveFile(id, blob) {
  await set(id, blob, files);
}

export async function getFile(id) {
  return get(id, files);
}

export async function deleteFile(id) {
  await del(id, files);
}

const LS = typeof localStorage !== 'undefined' ? localStorage : null;

export function setting(key, fallback) {
  try {
    const v = LS?.getItem('ss.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  try {
    LS?.setItem('ss.' + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: settings are conveniences only */
  }
}

// Ask the browser not to clear our storage under pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ----- fleet: downloaded copy of the Fleet Vaporizers list, and the queue of changes made here -----

const fleetKv = createStore('service-sheet-fleet', 'kv');

export async function getFleet() {
  return (await get('units', fleetKv)) || { units: [], syncedAt: null, missing: false };
}

export async function setFleet(data) {
  await set('units', data, fleetKv);
}

export async function getFleetQueue() {
  return (await get('queue', fleetKv)) || [];
}

export async function setFleetQueue(q) {
  await set('queue', q, fleetKv);
}
