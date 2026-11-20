// Images are stored in the repository as base64 text (assets/*.b64) and written to public/ before each build.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const map = { 'logo.png.b64': 'public/logo.png' };
mkdirSync('public/icons', { recursive: true });
for (const f of readdirSync('assets')) {
  if (!f.endsWith('.b64')) continue;
  const dest = map[f] || 'public/icons/' + f.replace(/\.b64$/, '');
  writeFileSync(dest, Buffer.from(readFileSync('assets/' + f, 'utf8').replace(/\s+/g, ''), 'base64'));
  console.log('wrote', dest);
}
