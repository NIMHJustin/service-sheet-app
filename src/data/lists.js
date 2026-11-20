// Dropdown suggestions, taken from the Library sheet of Service_Sheet_V6.2.xlsm.
// Every field still accepts typed values that are not in these lists.

export const TECHNICIANS = ['Bob Schrock', 'Justin Haynes', 'Mike Hernandez', 'John Vigil'];

export const LISTS = {
  mfr: ['AM Bickford', 'Anesco', 'ASE', 'Dispomed', 'EZ', 'Hallowell', 'JD Medical', 'Matrx', 'Midmark', 'Patterson', 'Perkin Elmer', 'Scivena', 'Somni', 'Summit Hill', 'Supra', 'SurgiVet', 'Vetamac', 'VetEquip', 'Vetland', 'Viking Medical', 'Xenogen', 'Vasco', 'Kent Scientific', 'Anesthesia S&S', 'Visualsonics', 'N/A', 'Other'],
  vapMfr: ['AM Bickford', 'Anesco', 'ASE', 'Avante', 'Blackford', 'Dispomed', 'DRE Vet', 'Drager', 'Euthanex', 'EZ', 'Hallowell', 'Harvard', 'Highland Medical Equipment', 'JD Medical', 'Kent Scientific', 'Lumic', 'Matrx', 'Midmark', 'Northern Vaporisers', 'Ohio', 'Ohmeda', 'Patterson', 'Penlon', 'Perkin Elmer', 'River Medical', 'Scivena', 'Somni', 'Summit Hill', 'Supra', 'SurgiVet', 'UVS', 'Vetamac', 'VetEquip', 'Vetland', 'Viking Medical', 'Visualsonics', 'VMS', 'Xenogen', 'Anesthesia Sales and Service', 'N/A', 'Other'],
  machine: ['COMPAC 5', 'DRE VP3', 'IMPAC 6', 'Mobile', 'Ohio', 'RAS-4', 'RC-2', 'Tabletop', 'V-1', 'V-10', 'VapoStick', 'Wall Mount', 'VME', 'VMC', 'SomnoSuite', 'XGI-8', 'VMS', 'Other'],
  states: ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'],
  gas: ['O2', 'CO2', 'N2O', '1x O2, 1x CO2', '2x O2', 'Flowcontrol', 'N/A', 'Other'],
  flow: ['0-1 LPM', '0-2 LPM', '0-4 LPM', '0-5 LPM', '0-10 LPM', '0-12 LPM', '15 LPM', '0-2, 0-5 LPM'],
  gauge: ['1x 0-15', '1x 0-15, 1x 0-100', '1x 0-100', '0-4000', 'N/A'],
  vapModel: ['Aluminum Tec 3', 'Fluomatic', 'Ohio 100F', 'Ohio 100H', 'Tec 3', 'Tec 4', 'Tec 5', 'VIP 3000', 'IDV', 'Vapor 19.1', 'Sigma Delta', 'N/A', 'Other'],
  fill: ['< 1/4', '1/4', '1/2', '3/4', 'Full'],
  dial: ['0-5%', '0-8%'],
  testLoc: ['Vap Outlet', 'Common Outlet', 'Circuit 1', 'Circuit 5'],
  o2: ['DISS Male', 'Dual Yoke', 'Other'],
  agent: ['Isoflurane', 'Sevoflurane', 'Other'],
  monitor: ['Riken', 'N/A', 'Other'],
  fillDev: ['Funnel Fill', 'Pin Index', 'Quick-Fill', 'Syringe'],
  pressure: ['100mm Hg', '50mm Hg'],
  scav: ['Canisters', 'None Present'],
  canister: ['Weight and Date', 'N/A', 'See Notes'],
  cyl: ['O2', 'CO2', 'Air', 'None Present', 'Other'],
};

export const CHECK_CHOICES = ['OK', 'N/A', 'Fail', 'See notes'];
