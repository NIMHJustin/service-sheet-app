// Thin Microsoft Graph client: retries throttling and transient failures, reports clear errors.

import { GRAPH } from '../config.js';

export class GraphError extends Error {
  constructor(status, code, message) {
    super(message || code || 'Request failed (' + status + ')');
    this.name = 'GraphError';
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeGraph(getToken, fetchImpl = (...a) => fetch(...a)) {
  async function call(method, path, { body, headers = {}, raw = false, absolute = false, auth = true } = {}) {
    const url = absolute ? path : GRAPH + path;
    for (let attempt = 0; ; attempt++) {
      const h = { ...headers };
      if (auth) h.Authorization = 'Bearer ' + (await getToken());
      let payload = body;
      if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
        h['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      let res;
      try {
        res = await fetchImpl(url, { method, headers: h, body: payload });
      } catch (e) {
        if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
        const off = new Error('No connection');
        off.name = 'Offline';
        throw off;
      }
      if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 4) {
        const ra = Number(res.headers.get('Retry-After')) || 2 * (attempt + 1);
        await sleep(Math.min(ra, 30) * 1000);
        continue;
      }
      if (!res.ok) {
        let code = '', message = '';
        try {
          const j = await res.json();
          code = j?.error?.code || '';
          message = j?.error?.message || '';
        } catch { /* not JSON */ }
        throw new GraphError(res.status, code, message || res.status + ' ' + res.statusText);
      }
      if (raw) return res;
      if (res.status === 204) return null;
      const ct = res.headers.get('Content-Type') || '';
      return ct.includes('json') ? res.json() : res.text();
    }
  }
  return {
    get: (p, o) => call('GET', p, o),
    post: (p, body, o = {}) => call('POST', p, { ...o, body }),
    patch: (p, body, o = {}) => call('PATCH', p, { ...o, body }),
    put: (p, body, o = {}) => call('PUT', p, { ...o, body }),
    call,
  };
}

// Path segments for drive item addressing: encode each segment, keep slashes.
export function encodePath(path) {
  return path.split('/').map((s) => encodeURIComponent(s)).join('/');
}
