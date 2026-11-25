import { useEffect, useState } from 'preact/hooks';
import { summarize, bucketLabel } from '../lib/dashboard.js';
import { fleetAlerts } from '../lib/fleet.js';
import { usDate, money } from '../lib/calc.js';
import { ColumnChart, RateChart, BarList, Tile } from './Charts.jsx';

const RANGES = [['12m', 'Last 12 months'], ['36m', 'Last 3 years'], ['all', 'All time']];

export function Dashboard({ load, units, online, goFleet }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState('12m');
  const [location, setLocation] = useState('All');
  const [facility, setFacility] = useState('All');

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      setData(await load());
    } catch (e) {
      setError(e?.name === 'SignInNeeded' ? 'Sign in (on the Outbox screen) to load the dashboard.' : e?.name === 'Offline' ? 'No connection. The dashboard needs to be online.' : e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (online) refresh(); }, []);

  const fa = fleetAlerts(units);
  const head = (
    <div class="row">
      <h1 class="grow">Dashboard</h1>
      <span class="muted" style="font-size:14px">{data ? 'Updated ' + new Date(data.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
      <button type="button" class="btn" disabled={busy || !online} onClick={refresh}>{busy ? 'Loading...' : 'Refresh'}</button>
    </div>
  );
  if (!data) {
    return (
      <main class="page">
        {head}
        {error ? <div class="banner warn" style="border-radius:12px">{error}</div> : <p class="muted">{online ? 'Loading service records from SharePoint...' : 'The dashboard needs to be online.'}</p>}
      </main>
    );
  }

  const s = summarize(data, { range, location, facility });
  const facNames = [...new Set(data.records.map((r) => r.facility).filter(Boolean))].sort();
  const lab = bucketLabel;
  const dueSoon = s.facilities.filter((f) => f.daysToDue <= 30).sort((a, b) => a.daysToDue - b.daysToDue);
  const top = s.facilities.filter((f) => f.inRange).sort((a, b) => b.inRange - a.inRange);
  const pct = s.passRate === null ? '-' : Math.round(s.passRate * 100) + '%';
  const rangeName = RANGES.find((r) => r[0] === range)[1].toLowerCase();

  return (
    <main class="page dash">
      {head}
      {error && <div class="banner warn" style="border-radius:12px">{error}</div>}

      <div class="row filters">
        <div class="seg" role="group" aria-label="Date range">
          {RANGES.map(([k, l]) => <button type="button" key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        <div class="seg" role="group" aria-label="Work done">
          {['All', 'Field', 'Shop'].map((k) => <button type="button" key={k} aria-pressed={location === k} onClick={() => setLocation(k)}>{k === 'All' ? 'Field + shop' : k}</button>)}
        </div>
        <select aria-label="Facility" value={facility} onChange={(e) => setFacility(e.currentTarget.value)}>
          <option value="All">All facilities</option>
          {facNames.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div class="tiles">
        <Tile label="Services" value={s.count.toLocaleString()} note={s.shopCount + ' in the shop'} />
        <Tile label="Efficacy tests passed" value={pct} note={s.effCount + ' efficacy tests'} />
        <Tile label="Cleanings and calibrations" value={s.ccCount} note={s.followedByCc + ' of ' + s.failedTests + ' failed tests led to one'} />
        <Tile label="Facilities served" value={s.facilitiesServed} note={dueSoon.length + ' due back within 30 days'} />
        <Tile label="Fleet" value={fa.overdueLoans.length + fa.testsDue.length} tone={fa.overdueLoans.length + fa.testsDue.length ? 'bad' : ''} note={fa.overdueLoans.length + ' loan' + (fa.overdueLoans.length === 1 ? '' : 's') + ' overdue · ' + fa.testsDue.length + ' test' + (fa.testsDue.length === 1 ? '' : 's') + ' due'} />
      </div>

      <ColumnChart
        title="Services over time" sub={'By ' + (s.buckets[0]?.includes('Q') ? 'quarter' : 'month') + ', ' + rangeName}
        buckets={s.buckets} labels={lab}
        series={[{ name: 'Field', values: s.volume.field }, { name: 'Shop', values: s.volume.shop }]}
      />

      <div class="two">
        <RateChart title="Efficacy test pass rate" sub="All ten readings in tolerance and no inspection item failed" rows={s.passRateByBucket} labels={lab} />
        <BarList title="Most common failed inspection items" rows={s.failedItems.map(([k, v]) => [k.replace(/^Provisional inspection, /, 'Vaporizer ').replace(/^(\w)/, (c) => c.toUpperCase()), v])} empty="No failed inspection items in this period." />
      </div>

      <div class="two">
        <BarList title="Vaporizers serviced by model" rows={s.models} />
        <section class="card chart">
          <h2>Facilities due back</h2>
          <span class="muted" style="font-size:14px">A year after their last service; overdue or within 30 days</span>
          {!dueSoon.length && <p class="muted" style="margin:0">None due in the next 30 days.</p>}
          {dueSoon.length > 0 && <div style="max-height:320px;overflow-y:auto">
            <table class="imp">
              <thead><tr><th>Facility</th><th>Last service</th><th>Due</th><th style="text-align:right">Services</th></tr></thead>
              <tbody>
                {dueSoon.map((f) => (
                  <tr key={f.facility}>
                    <td>{f.facility}</td>
                    <td>{usDate(f.last)}{f.lastPassed ? '' : ' (failed)'}</td>
                    <td class={f.daysToDue < 0 ? 'bad' : 'warn-text'}>{usDate(f.due)}{f.daysToDue < 0 ? ' · ' + -f.daysToDue + ' days ago' : ''}</td>
                    <td style="text-align:right">{f.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>
      </div>

      <BarList title="Top facilities" sub={'Services, ' + rangeName} rows={top.map((f) => [f.facility, f.inRange])} />

      <ColumnChart
        title="Revenue" sub={'Service charges and parts, ' + rangeName + ' · ' + money(s.revenue.total) + ' total · imported reports carry no charges'}
        buckets={s.buckets} labels={lab} format={(v) => '$' + Math.round(v).toLocaleString('en-US')}
        series={[{ name: 'Service charges', values: s.revenue.charges }, { name: 'Parts', values: s.revenue.parts }]}
      />

      <BarList title="Most used parts" sub="Quantity used" rows={s.topParts.map((p) => [p.part, p.qty])} empty="No parts recorded in this period." />

      <div class="row">
        <button type="button" class="btn" onClick={goFleet}>Open fleet</button>
      </div>
    </main>
  );
}
