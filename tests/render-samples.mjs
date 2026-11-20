// Renders certificates for the workbook's sample records so they can be checked by eye.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderCertificate } from '../src/lib/pdf.js';
import { samples } from './samples.mjs';

const png = readFileSync(new URL('../public/logo.png', import.meta.url));
const logo = { data: new Uint8Array(png), width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
const out = process.argv[2] || '/tmp/certs';
mkdirSync(out, { recursive: true });
for (const [name, rec] of Object.entries(samples)) {
  const r = renderCertificate(rec, logo);
  writeFileSync(`${out}/${name}.pdf`, Buffer.from(r.doc.output('arraybuffer')));
  console.log(name, 'pages', r.doc.getNumberOfPages(), 'scale', r.scale, 'chart', r.chart, 'truncated', r.truncated);
}
