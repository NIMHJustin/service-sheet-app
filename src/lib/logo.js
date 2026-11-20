// Loads the VetEquip logo once for the PDF certificate. Cached by the service worker for offline use.

let cached = null;

export async function loadLogo() {
  if (cached) return cached;
  try {
    const res = await fetch('/logo.png');
    const buf = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(buf.buffer);
    cached = { data: buf, width: view.getUint32(16), height: view.getUint32(20) };
  } catch {
    cached = null;
  }
  return cached;
}
