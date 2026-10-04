// Rebuild data/wards.js from the Kenya Data Atlas (KDA).
//   node scripts/build-wards.mjs <path-to-kenya-data-atlas>
//
// Sources (all IEBC, via the atlas):
//   data/geography/registry/geographies.csv            official 1,450 wards / 290 constituencies
//   IND-REGISTERED-VOTERS  "2022 registered voters"     ward rows (Gazette Notice 7290) + constituency rows
//   IND-TURNOUT-HISTORY    2022 presidential, Form 34B  constituency turnout (186 of 290 published)
//   data/p23/form34b-*-source-verification.json         official Form 34B TOTAL rows read by the atlas (valid votes)
// and, in this repo:
//   data/source/pres2022-constituency-tally.csv          2022 presidential votes for all 290 constituencies, a public
//       tally of IEBC Forms 34B ("MapsBySifa", ArcGIS: Constituency_Results_gdb). Unverified as published, so it
//       is checked against the atlas's official reads: rows swapped between constituencies are swapped back and
//       rows whose total differs by more than 0.5% are rescaled to the official valid-vote total.
//
// What is real and what is modelled:
//   v   2022 registered voters for the ward (IEBC Gazette Notice 7290). Ten Mandera
//       East/Lafey wards are on a boundary hold in the atlas: they share their
//       constituency's official total (exactly, remainder to the first wards).
//       The app scales v to the selected register scenario by county
//       (REGISTER_META in data/counties.js).
//   tb  the county's turnout base, scaled by the constituency's 2022 turnout relative
//       to the county's registered-weighted mean (atlas Form 34B turnout where it has
//       one, else the tally's (valid + rejected) / registered).
//   bi, bo  2022 Ruto and Odinga shares of the constituency's candidate votes (wards
//       share their constituency's result: IEBC publishes no ward-level presidential totals).
//   cl, dq, vl, yr  county values; dn carried over from the previous ward file by name
//       where it matches, else derived from the ward's register size.
// Also writes data/results2022.js (constituency results) and corrects the 2022 county
// shares (baseIncumbent2022 / baseOpposition2022) in data/counties.js from the same totals.
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

// ── 2022 presidential results by constituency (public Form 34B tally, checked against the atlas)
const tl = fs.readFileSync(path.join(root, 'data/source/pres2022-constituency-tally.csv'), 'utf8').trim().split(/\r?\n/);
const th = csvRow(tl[0]);
const res = new Map(tl.slice(1).map(l => { const o = Object.fromEntries(csvRow(l).map((v, i) => [th[i], v]));
  const gc = 'KEN-C' + o.pcode.slice(2, 5) + '-CON' + o.pcode.slice(5);
  return [gc, { reg: +o.registered, ra: +o.raila, ru: +o.ruto, mw: +o.mwaure || 0, wj: +o.wajackoyah || 0, rej: +o.rejected || 0, src: 'u' }]; }));
const sumC = x => x.ra + x.ru + x.mw + x.wj;
const P23 = path.join(KDA, 'data/p23');
const offV = new Map();
for (const f of fs.readdirSync(P23).filter(f => /^form34b-.*-source-verification\.json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(P23, f), 'utf8')), v = j.field_evidence?.total_valid_votes?.verified_value;
  if (v != null) offV.set(j.sample.geo_code, v);
}
const near = (a, b) => Math.abs(a - b) <= Math.max(50, b * 0.002);
// rows recorded under each other's constituency: swap the vote fields back
const swapped = new Set();
for (const [a, va] of offV) for (const [b, vb] of offV) {
  if (a >= b || swapped.has(a) || swapped.has(b)) continue;
  const A = res.get(a), B = res.get(b);
  if (A && B && !near(sumC(A), va) && near(sumC(A), vb) && near(sumC(B), va)) {
    for (const k of ['ra', 'ru', 'mw', 'wj', 'rej']) [A[k], B[k]] = [B[k], A[k]];
    A.src = B.src = 's'; swapped.add(a); swapped.add(b);
  }
}
let nRes = 0, nOk = 0; const resplit = [];
for (const [gc, x] of res) {
  const v = offV.get(gc); if (v == null) continue;
  const t = sumC(x);
  if (Math.abs(t - v) / v > 0.005) { const f = v / t; for (const k of ['ra', 'ru', 'mw', 'wj']) x[k] = Math.round(x[k] * f); if (x.src !== 's') x.src = 'r'; nRes++; }
  else if (x.src === 'u') { x.src = 'v'; nOk++; }
}
// Rows rescaled to an official total keep the tally's candidate split. Where a county's
// Form 34C row (Wikipedia; used only when its candidate votes add up to its valid votes)
// disagrees with the tally by more than 1% for Ruto or Odinga and exactly one row in that
// county was rescaled, re-split that row: candidate shares implied by the county total
// minus the county's other rows, applied to the row's official valid-vote total (src 'c').
{
  const wl = fs.readFileSync(path.join(root, 'data/source/pres2022-county-wikipedia.csv'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  const wh = csvRow(wl[0]);
  for (const o of wl.slice(1).map(l => Object.fromEntries(csvRow(l).map((v, i) => [wh[i], v])))) {
    const W = { ru: +o.ruto, ra: +o.odinga, wj: +o.wajackoyah || 0, mw: +o.mwaure || 0 };
    if (Math.abs(W.ru + W.ra + W.wj + W.mw - +o.valid) / +o.valid >= 0.005) continue;
    const pre = 'KEN-C' + String(o.county_code).padStart(3, '0') + '-', rows = [...res].filter(([gc]) => gc.startsWith(pre));
    const T = k => rows.reduce((a, [, x]) => a + x[k], 0);
    if (Math.abs(T('ru') / W.ru - 1) <= 0.01 && Math.abs(T('ra') / W.ra - 1) <= 0.01) continue;
    const resc = rows.filter(([, x]) => x.src === 'r');
    if (resc.length !== 1) continue;
    const [gc, x] = resc[0], imp = {}; for (const k of ['ru', 'ra', 'wj', 'mw']) imp[k] = Math.max(0, W[k] - (T(k) - x[k]));
    const it = imp.ru + imp.ra + imp.wj + imp.mw, tot = offV.get(gc);
    if (!it || !tot) continue;
    for (const k of ['ru', 'ra', 'wj', 'mw']) x[k] = Math.round(tot * imp[k] / it);
    x.src = 'c'; nRes--; resplit.push(gc);
  }
}
// constituency turnout: atlas official where it has one, else the tally
const turnC = new Map([...res].map(([gc, x]) => [gc, turn.has(gc) ? turn.get(gc) : (sumC(x) + x.rej) / (x.reg || 1)]));


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
  // exact split: the remainder goes one voter at a time to the first wards
  const rest = tot - known, each = Math.floor(rest / miss.length);
  miss.forEach((w, i) => held.set(w.geo_code, each + (i < rest - each * miss.length ? 1 : 0)));
}

// County mean Form 34B turnout (registered-weighted, published constituencies only)
const cMean = new Map();
for (const c of cons) {
  if (!turnC.has(c.geo_code)) continue;
  const k = +c.county_code, m = cMean.get(k) || { s: 0, w: 0 }, w = consV.get(c.geo_code) || 0;
  m.s += turnC.get(c.geo_code) * w; m.w += w; cMean.set(k, m);
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
  let tb = co.turnoutBase;
  const m = cMean.get(co.code);
  if (turnC.has(cg) && m && m.w) { tb = co.turnoutBase * turnC.get(cg) / (m.s / m.w); if (turn.has(cg)) tbReal++; }
  const rx = res.get(cg);
  if (!rx) throw new Error('no 2022 result for ' + cg);
  const rt = sumC(rx) || 1;
  const v = v22;
  let dn = oldDn.get(co.name + '|' + norm(w.name));
  if (dn) dnHit++; else dn = v > 30000 ? 'high' : v > 15000 ? 'medium' : 'low';
  const tmpl = OLD.find(o => o.co === co.name);
  return {
    id: w.geo_code, co: co.name, cs: tidy(cRow.name), w: tidy(w.name), v,
    v22, src: wardV.has(w.geo_code) ? 'g' : 'h',
    tb: +Math.min(0.85, Math.max(0.3, tb)).toFixed(3),
    bi: +(rx.ru / rt).toFixed(4), bo: +(rx.ra / rt).toFixed(4), cl: tmpl.cl, dq: tmpl.dq, vl: tmpl.vl, yr: tmpl.yr, dn
  };
});

const tot22 = out.reduce((a, w) => a + w.v22, 0);
const head = `// Generated by scripts/build-wards.mjs from the Kenya Data Atlas — do not edit by hand.
// 1,450 IEBC wards; v = 2022 registered voters (IEBC Gazette Notice 7290), scaled by register scenario in the app;
// v22 = 2022 register; src g = gazetted ward row, h = boundary hold (constituency total split equally);
// tb = county turnout base scaled by the constituency's 2022 turnout;
// bi / bo = 2022 Ruto / Odinga share of the constituency's candidate votes (see data/results2022.js).
`;
fs.writeFileSync(path.join(root, 'data/wards.js'), head + 'const WD=' + JSON.stringify(out) + ';\n');
console.log(`wards ${out.length} · gazetted ${out.filter(w => w.src === 'g').length} · held ${held.size}`);
console.log(`2022 register ${tot22.toLocaleString()}`);
console.log(`turnout from Form 34B: ${tbReal} wards in ${[...cons].filter(c => turn.has(c.geo_code)).length} constituencies · dn carried ${dnHit}`);

// data/results2022.js: one row per constituency
const R22 = cons.map(c => { const x = res.get(c.geo_code), co = coByCode.get(+c.county_code);
  return { g: c.geo_code, co: co.name, cs: tidy(c.name), reg: x.reg, ra: x.ra, ru: x.ru, wj: x.wj, mw: x.mw, rej: x.rej, src: x.src }; });
const N = k => R22.reduce((a, x) => a + x[k], 0);
fs.writeFileSync(path.join(root, 'data/results2022.js'), `// Generated by scripts/build-wards.mjs — do not edit by hand.
// 2022 presidential election, votes by constituency (290). Source: public tally of IEBC Forms 34B
// (data/source/pres2022-constituency-tally.csv), checked against the Kenya Data Atlas's official Form 34B reads.
// src: v = matches the official valid-vote total (within 0.5%); r = rescaled to the official total;
//      c = official total, candidate split re-derived from the county's Form 34C figures (see build-wards.mjs);
//      s = row had been recorded under another constituency, swapped back; u = no official read to check against.
// National: Ruto ${N('ru').toLocaleString('en-US')}, Odinga ${N('ra').toLocaleString('en-US')} (IEBC declared 7,176,141 and 6,942,930 incl. diaspora and prisons).
const R22=` + JSON.stringify(R22) + ';\n');
// correct the county 2022 shares in data/counties.js
const cAgg = new Map();
R22.forEach(x => { const k = x.co, a = cAgg.get(k) || { ru: 0, ra: 0, t: 0 }; a.ru += x.ru; a.ra += x.ra; a.t += x.ru + x.ra + x.wj + x.mw; cAgg.set(k, a); });
const wCount = new Map(); out.forEach(w => wCount.set(w.co, (wCount.get(w.co) || 0) + 1));
// ward counts come from the IEBC registry (the old file still had the 1,457-ward counts)
const CO2 = CO.map(c => { const a = cAgg.get(c.name); return { ...c, wards: wCount.get(c.name), baseIncumbent2022: +(a.ru / a.t).toFixed(3), baseOpposition2022: +(a.ra / a.t).toFixed(3) }; });
const coSrc = fs.readFileSync(path.join(root, 'data/counties.js'), 'utf8'), coHead = coSrc.slice(0, coSrc.indexOf('const CO='));
fs.writeFileSync(path.join(root, 'data/counties.js'), coHead + 'const CO=' + JSON.stringify(CO2) + ';\n');
console.log(`2022 results: ${R22.length} constituencies · matched official ${nOk} · rescaled ${nRes} · re-split from county totals ${resplit.length} · swapped back ${swapped.size} · unchecked ${R22.filter(x => x.src === 'u').length}`);
console.log(`2022 national: Ruto ${N('ru')} Odinga ${N('ra')} · Ruto share ${(N('ru') / (N('ru') + N('ra') + N('wj') + N('mw')) * 100).toFixed(2)}%`);
