// The parts catalog (2025 price list + vaporizer service parts) and finding parts in report comments.

import PRICE_LIST from '../data/parts.json' with { type: 'json' };
import VAP_PARTS from '../data/vapParts.json' with { type: 'json' };

const label = (p) => (p.mfrNo && p.mfrNo !== p.no ? p.desc + ' (' + p.mfrNo + ')' : p.desc);

// Searchable rows, as [itemNumber, description, price, unit].
export const CATALOG = [
  ...VAP_PARTS.map((p) => [p.no, label(p), p.price, p.uom]),
  ...PRICE_LIST,
];

const byNumber = new Map();
for (const row of CATALOG) if (row[0] && !byNumber.has(row[0])) byNumber.set(row[0], row);

const MATCHERS = VAP_PARTS.map((p) => ({ row: [p.no, label(p), p.price, p.uom], re: p.match.map((m) => new RegExp('\\b(' + m + ')\\b', 'i')) }));

const WORDS = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, both: 2 };
const NOT_DONE = /\b(recommend|recommended|recommends|suggest|suggested|needs?|requires?|should|will need|quote[ds]?)\b/i;
const DID = /\b(replac\w*|install\w*|new|rebuil\w*|swapp\w*|chang\w*|fitted|required|put in|added)\b/i;

function qtyAround(sentence, start, end) {
  const before = sentence.slice(Math.max(0, start - 14), start).toLowerCase();
  const after = sentence.slice(end, end + 8).toLowerCase();
  let m = after.match(/^\s*(?:x\s*(\d+)|\(\s*(\d+)\s*\))/);
  if (m) return Number(m[1] || m[2]);
  m = before.match(/(?:\(?(\d+)\)?\s*x?|\b(two|three|four|five|six))\s*(?:new\s+|worn\s+(?:out\s+)?|old\s+)?$/);
  if (m && (m[1] || m[2])) return Number(m[1]) || WORDS[m[2]] || 1;
  return 1;
}

// Parts a report's comments say were used. Sentences that only recommend work are skipped.
// Returns [{ no, desc, qty, price }]
export function findParts(comments) {
  const found = new Map();
  const add = (row, qty) => {
    const key = row[0] + '|' + row[1];
    const cur = found.get(key);
    found.set(key, { no: row[0] || 'Custom', desc: row[1], qty: Math.max(qty, cur?.qty || 0), price: row[2] ?? null });
  };
  const sentences = String(comments || '').split(/(?<=[.!?;])\s+/);
  for (const s of sentences) {
    if (NOT_DONE.test(s)) continue;
    for (const m of MATCHERS) {
      for (const re of m.re) {
        const hit = re.exec(s);
        if (hit) { add(m.row, qtyAround(s, hit.index, hit.index + hit[0].length)); break; }
      }
    }
    for (const hit of s.matchAll(/(?<!\d)(\d{6})(?!\d)(?:\s*x\s*(\d+))?/gi)) {
      const row = byNumber.get(hit[1]);
      const qty = hit[2] ? Number(hit[2]) : 1;
      if (row) add(row, qty);
      else if (DID.test(s) || hit[2]) add([hit[1], 'Part ' + hit[1] + ' (not in the price list)', null, 'EACH'], qty);
    }
  }
  return [...found.values()];
}
