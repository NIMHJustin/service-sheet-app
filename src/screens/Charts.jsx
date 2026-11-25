import { useState, useRef, useLayoutEffect } from 'preact/hooks';

// Small hand-built SVG charts: thin marks, hairline grid, hover tooltips, a table view for each.
// Categorical slots: 1 blue, 2 orange (validated as an adjacent pair; orange sits below 3:1 on
// white, so every chart has a legend or direct labels plus a table view).
export const SERIES = ['var(--series-1)', 'var(--series-2)'];

// Draw at the container's real width so text and bars keep their pixel sizes.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const set = () => setW(Math.max(280, Math.round(ref.current.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Clean axis: about four steps of 1, 2 or 5 x 10^n, never fractional for counts.
function scale(v) {
  const raw = Math.max(v, 1) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw);
  step = Math.max(1, step);
  const max = Math.ceil(Math.max(v, 1) / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

const fmtNum = (v) => (Math.round(v) === v ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }));

// Rounded top (4px) on a column, square at the baseline.
function colPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function Legend({ series }) {
  return (
    <div class="legend">
      {series.map((s, i) => (
        <span key={s.name}><i style={{ background: s.color || SERIES[i] }} />{s.name}</span>
      ))}
    </div>
  );
}

function Frame({ title, sub, table, children }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section class="card chart">
      <div class="row" style="align-items:flex-start">
        <div class="grow">
          <h2>{title}</h2>
          {sub && <span class="muted" style="font-size:14px">{sub}</span>}
        </div>
        {table && <button type="button" class="btn small" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Show chart' : 'Show table'}</button>}
      </div>
      {showTable ? table : children}
    </section>
  );
}

function DataTable({ head, rows }) {
  return (
    <div style="overflow-x:auto;max-height:360px;overflow-y:auto">
      <table class="imp">
        <thead><tr>{head.map((h, i) => <th key={h} style={i ? 'text-align:right' : ''}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={j ? 'text-align:right' : ''}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// Stacked columns over time. series: [{ name, values: { bucket: number } }]
export function ColumnChart({ title, sub, buckets, labels, series, format = fmtNum, height = 240 }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth();
  const ml = 52, mr = 8, mt = 12, mb = 28;
  const pw = W - ml - mr, ph = height - mt - mb;
  const totals = buckets.map((b) => series.reduce((t, s) => t + (s.values[b] || 0), 0));
  const { max, ticks: tk } = scale(Math.max(0, ...totals));
  const band = pw / Math.max(1, buckets.length);
  const bw = Math.min(24, band * 0.7);
  const Y = (v) => mt + ph - (v / max) * ph;
  const every = Math.ceil(buckets.length / Math.max(2, Math.floor(pw / 56)));
  const table = (
    <DataTable
      head={['Period', ...series.map((s) => s.name), ...(series.length > 1 ? ['Total'] : [])]}
      rows={buckets.map((b, i) => [labels(b), ...series.map((s) => format(s.values[b] || 0)), ...(series.length > 1 ? [format(totals[i])] : [])])}
    />
  );
  return (
    <Frame title={title} sub={sub} table={table}>
      {series.length > 1 && <Legend series={series} />}
      <div class="plot" ref={ref}>
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {tk.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={Y(t)} y2={Y(t)} class="grid" />
              <text x={ml - 6} y={Y(t) + 4} class="tick" text-anchor="end">{format(t)}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = ml + i * band + (band - bw) / 2;
            let base = 0;
            const top = series.reduce((k, s, si) => ((s.values[b] || 0) > 0 ? si : k), -1);
            return (
              <g key={b}>
                {series.map((s, si) => {
                  const v = s.values[b] || 0;
                  if (!v) return null;
                  const y0 = Y(base + v), h = Y(base) - Y(base + v) - (base > 0 ? 2 : 0);
                  base += v;
                  return si === top
                    ? <path key={s.name} d={colPath(x, y0, bw, h)} fill={s.color || SERIES[si]} />
                    : <rect key={s.name} x={x} y={y0} width={bw} height={Math.max(0, h)} fill={s.color || SERIES[si]} />;
                })}
                {i % every === 0 && <text x={x + bw / 2} y={height - 8} class="tick" text-anchor="middle">{labels(b)}</text>}
                <rect x={ml + i * band} y={mt} width={band} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={ml} x2={W - mr} y1={Y(0)} y2={Y(0)} class="axis" />
        </svg>
        {hover !== null && (
          <div class="tip" style={{ left: ((ml + hover * band + band / 2) / W) * 100 + '%' }}>
            <b>{labels(buckets[hover])}</b>
            {series.map((s, si) => <div key={s.name}><i style={{ background: s.color || SERIES[si] }} />{s.name}: {format(s.values[buckets[hover]] || 0)}</div>)}
            {series.length > 1 && <div>Total: {format(totals[hover])}</div>}
          </div>
        )}
      </div>
    </Frame>
  );
}

// Pass rate per period, 0-100%, with the count behind each column in the tooltip.
export function RateChart({ title, sub, rows, labels, height = 220 }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth();
  const ml = 44, mr = 8, mt = 12, mb = 28;
  const pw = W - ml - mr, ph = height - mt - mb;
  const band = pw / Math.max(1, rows.length);
  const bw = Math.min(24, band * 0.7);
  const Y = (v) => mt + ph - v * ph;
  const every = Math.ceil(rows.length / Math.max(2, Math.floor(pw / 56)));
  const pct = (v) => Math.round(v * 100) + '%';
  const table = (
    <DataTable head={['Period', 'Efficacy tests', 'Passed', 'Pass rate']}
      rows={rows.filter((r) => r.total).map((r) => [labels(r.b), r.total, r.passed, pct(r.rate)])} />
  );
  return (
    <Frame title={title} sub={sub} table={table}>
      <div class="plot" ref={ref}>
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={Y(t)} y2={Y(t)} class="grid" />
              <text x={ml - 6} y={Y(t) + 4} class="tick" text-anchor="end">{pct(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const x = ml + i * band + (band - bw) / 2;
            return (
              <g key={r.b}>
                {r.rate !== null && <path d={colPath(x, Y(r.rate), bw, Y(0) - Y(r.rate))} fill={SERIES[0]} />}
                {i % every === 0 && <text x={x + bw / 2} y={height - 8} class="tick" text-anchor="middle">{labels(r.b)}</text>}
                <rect x={ml + i * band} y={mt} width={band} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={ml} x2={W - mr} y1={Y(0)} y2={Y(0)} class="axis" />
        </svg>
        {hover !== null && (
          <div class="tip" style={{ left: ((ml + hover * band + band / 2) / W) * 100 + '%' }}>
            <b>{labels(rows[hover].b)}</b>
            <div>{rows[hover].total ? pct(rows[hover].rate) + ' passed (' + rows[hover].passed + ' of ' + rows[hover].total + ')' : 'No efficacy tests'}</div>
          </div>
        )}
      </div>
    </Frame>
  );
}

// Ranked horizontal bars, single series, value at the tip.
export function BarList({ title, sub, rows, format = fmtNum, limit = 10, empty = 'Nothing yet.' }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => r[1]));
  const table = <DataTable head={['Item', 'Count']} rows={rows.map((r) => [r[0], format(r[1])])} />;
  return (
    <Frame title={title} sub={sub} table={rows.length ? table : null}>
      {!shown.length && <p class="muted" style="margin:0">{empty}</p>}
      <div class="bars">
        {shown.map(([label, v]) => (
          <div class="bar-row" key={label} title={label + ': ' + format(v)}>
            <span class="bar-label">{label}</span>
            <span class="bar-track"><span class="bar-fill" style={{ width: (v / max) * 100 + '%' }} /></span>
            <span class="bar-val">{format(v)}</span>
          </div>
        ))}
        {rows.length > limit && <span class="muted" style="font-size:14px">Top {limit} of {rows.length}. Show table for all.</span>}
      </div>
    </Frame>
  );
}

export function Tile({ label, value, note, tone }) {
  return (
    <div class="tile">
      <span class="muted">{label}</span>
      <b class={tone || ''}>{value}</b>
      {note && <span class="muted" style="font-size:13px">{note}</span>}
    </div>
  );
}
