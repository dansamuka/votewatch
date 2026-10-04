// Rebuild data/wards.js from the Kenya Data Atlas (KDA).
//   node scripts/build-wards.mjs <path-to-kenya-data-atlas>
//
// Sources (all IEBC, via the atlas):
//   data/geography/registry/geographies.csv            official 1,450 wards / 290 constituencies
//   IND-REGISTERED-VOTERS  "2022 registered voters"     ward rows (Gazette Notice 7290) + constituency rows
//   IND-TURNOUT-HISTORY    2022 presidential, Form 34B  constituency turnout (186 of 290 published)
//
// What is real and what is modelled:
//   v   2022 registered voters for the ward x the county's 2022→2027 register uplift
//       (data/counties.js). Ten Mandera East/Lafey wards are on a boundary hold in
//       the atlas: they share their constituency's official total equally.
//   tb  the county's turnout base, scaled by the constituency's 2022 Form 34B
//       turnout relative to the county's registered-weighted mean. Constituencies
//       without a published Form 34B keep the county base.
//   bi, bo, cl, dq, vl, yr  county values (2022 presidential results by ward are not
//       in the atlas); dn carried over from the previous ward file by name where it
//       matches, else derived from the ward's register size.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const KDA = process.argv[2];
if (!KDA) { console.error('usage: node scripts/build-wards.mjs <kenya-data-atlas>'); process.exit(1); }
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const load = (f, name) => { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8') + `;this.${name}=${name};`, c); return c[name]; };
const CO = load('data/counties.js', 'CO');
const OLD = load('data/wards.js', 'WD');

// Quoted CSV (no embedded newlines in this file)
const csvRow = l => { const o = []; let s = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { s += '"'; i++; } else if (ch === '"') q = false; else s += ch; } else if (ch === '"') q = true; else if (ch === ',') { o.push(s); s = ''; } else s += ch; } o.push(s); return o; };
const lines = fs.readFileSync(path.join(KDA, 'data/geography/registry/geographies.csv'), 'utf8').trim().split(/\r?\n/);
const hdr = csvRow(lines[0]);
const geo = lines.slice(1).map(l => Object.fromEntries(csvRow(l).map((v, i) => [hdr[i], v])));
const byCode = new Map(geo.map(g => [g.geo_code, g]));

const ind = f => JSON.parse(fs.readFileSync(path.join(KDA, 'data/distribution/subsets/indicators', f), 'utf8')).observations;
const reg = ind('IND-REGISTERED-VOTERS.json').filter(o => o.period_label === '2022 registered voters');
const wardV = new Map(reg.filter(o => o.geo_code.split('-').length === 4).map(o => [o.geo_code, o.value]));
const consV = new Map(reg.filter(o => o.geo_code.split('-').length === 3).map(o => [o.geo_code, o.value]));
const turn = new Map(ind('IND-TURNOUT-HISTORY.json')
  .filter(o => o.geo_code.split('-').length === 3 && /2022 presidential/.test(o.period_label))
  .map(o => [o.geo_code, o.value / 100]));

const coByCode = new Map(CO.map(c => [c.code, c]));
const wards = geo.filter(g => g.level === 'ward');
const cons = geo.filter(g => g.level === 'constituency');
if (wards.length !== 1450 || cons.length !== 290) throw new Error(`registry: ${wards.length} wards, ${cons.length} constituencies`);

// Wards without a gazetted row share their constituency's remainder equally
const consOf = w => w.geo_code.split('-').slice(0, 3).join('-');
const held = new Map();
for (const c of cons) {
  const ws = wards.filter(w => consOf(w) === c.geo_code);
  const miss = ws.filter(w => !wardV.has(w.geo_code));
  if (!miss.length) continue;
  const known = ws.reduce((a, w) => a + (wardV.get(w.geo_code) || 0), 0);
  const tot = consV.get(c.geo_code);
  if (tot == null) throw new Error('no constituency total for ' + c.geo_code);
  miss.forEach(w => held.set(w.geo_code, Math.round((tot - known) / miss.length)));
}

// County mean Form 34B turnout (registered-weighted, published constituencies only)
const cMean = new Map();
for (const c of cons) {
  if (!turn.has(c.geo_code)) continue;
  const k = +c.county_code, m = cMean.get(k) || { s: 0, w: 0 }, w = consV.get(c.geo_code) || 0;
  m.s += turn.get(c.geo_code) * w; m.w += w; cMean.set(k, m);
}

const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const oldDn = new Map(OLD.map(w => [w.co + '|' + norm(w.w), w.dn]));
const tidy = s => s.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

let dnHit = 0, tbReal = 0;
const out = wards.map(w => {
  const co = coByCode.get(+w.county_code);
  if (!co) throw new Error('county ' + w.county_code);
  const cg = consOf(w), cRow = byCode.get(cg);
  const v22 = wardV.has(w.geo_code) ? wardV.get(w.geo_code) : held.get(w.geo_code);
  const up = co.projectedVoters2027 / co.registered2022;
  let tb = co.turnoutBase;
  const m = cMean.get(co.code);
  if (turn.has(cg) && m && m.w) { tb = co.turnoutBase * turn.get(cg) / (m.s / m.w); tbReal++; }
  const v = Math.round(v22 * up);
  let dn = oldDn.get(co.name + '|' + norm(w.name));
  if (dn) dnHit++; else dn = v > 30000 ? 'high' : v > 15000 ? 'medium' : 'low';
  const tmpl = OLD.find(o => o.co === co.name);
  return {
    id: w.geo_code, co: co.name, cs: tidy(cRow.name), w: tidy(w.name), v,
    v22, src: wardV.has(w.geo_code) ? 'g' : 'h',
    tb: +Math.min(0.85, Math.max(0.3, tb)).toFixed(3),
    bi: tmpl.bi, bo: tmpl.bo, cl: tmpl.cl, dq: tmpl.dq, vl: tmpl.vl, yr: tmpl.yr, dn
  };
});

const tot22 = out.reduce((a, w) => a + w.v22, 0);
const head = `// Generated by scripts/build-wards.mjs from the Kenya Data Atlas — do not edit by hand.
// 1,450 IEBC wards; v = 2022 registered voters (IEBC Gazette Notice 7290) x county uplift to 2027;
// v22 = 2022 register; src g = gazetted ward row, h = boundary hold (constituency total split equally);
// tb = county turnout base scaled by the constituency's 2022 Form 34B turnout where published.
`;
fs.writeFileSync(path.join(root, 'data/wards.js'), head + 'const WD=' + JSON.stringify(out) + ';\n');
console.log(`wards ${out.length} · gazetted ${out.filter(w => w.src === 'g').length} · held ${held.size}`);
console.log(`2022 register ${tot22.toLocaleString()} · 2027 ${out.reduce((a, w) => a + w.v, 0).toLocaleString()}`);
console.log(`turnout from Form 34B: ${tbReal} wards in ${[...cons].filter(c => turn.has(c.geo_code)).length} constituencies · dn carried ${dnHit}`);
