// Development-only preview of the dashboard with made-up data (not part of the app build).
import { render } from 'preact';
import { Dashboard } from '../src/screens/Dashboard.jsx';
import '../src/styles.css';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const facs = ['UC Irvine', 'Labcorp', 'Eli Lilly', 'Cedars-Sinai', 'Sarepta', 'Clemson University', 'Charles River', 'Merck', 'Genentech', 'Pfizer'];
const models = [['VetEquip', 'Tec 3'], ['VetEquip', 'Tec 3'], ['VetEquip', 'Tec 5'], ['Ohio', 'Ohio 100F'], ['Penlon', 'Sigma Delta'], ['Ohmeda', 'Tec 4']];
const records = [];
for (let i = 0; i < 160; i++) {
  const d = new Date(Date.UTC(2023, 11, 1) + rnd() * (Date.UTC(2026, 10, 24) - Date.UTC(2023, 11, 1)));
  const [mfr, model] = pick(models);
  const cc = rnd() < 0.22;
  const fail = !cc && rnd() < 0.18;
  records.push({
    tn: 'T' + i, date: d.toISOString().slice(0, 10), facility: pick(facs), mfr, model, sn: 'SN' + Math.floor(rnd() * 90),
    location: rnd() < 0.6 ? 'Shop' : 'Field', type: cc ? 'Full cleaning and calibration' : 'Efficacy test',
    readingsFailed: fail ? 1 + Math.floor(rnd() * 6) : 0, itemsFailed: fail && rnd() < 0.5 ? 1 : 0,
    details: fail ? pick(['Provisional inspection, dial stop: Fail', 'Provisional inspection, leak test: Fail', 'Provisional inspection, sight glass: Fail']) : '',
    charge: d > new Date('2026-11-01') ? (cc ? 225 : 100) : 0, parts: d > new Date('2026-11-01') && cc ? 40 : 0, tech: 'Justin Haynes', imported: d < new Date('2026-11-20'),
  });
}
const data = { records, parts: [{ tn: 'T3', no: '171434', desc: 'Tubing, 1/4" ID', qty: 3, amount: 19.5 }], loadedAt: new Date().toISOString() };
const units = [{ sn: 'L1', fleet: 'Loan', status: 'Out on loan', dueBack: '2026-11-01', nextDue: '2027-01-01' }, { sn: 'L2', fleet: 'Loan', status: 'In stock', nextDue: '2026-12-05' }];
render(<Dashboard load={async () => data} units={units} online={true} goFleet={() => {}} />, document.getElementById('app'));
