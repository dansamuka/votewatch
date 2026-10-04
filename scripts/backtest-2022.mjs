// 2022 back-test: predict the 2022 presidential result by county and constituency
// using only what was known before 9 Aug 2022, with the model's method, then score
// it against the actual result (data/results2022.js).
//   node scripts/backtest-2022.mjs        → writes data/backtest2022.js
//
// Pre-election inputs:
//   - final validated polls (data/history.js): two-way Ruto share of decided voters
//   - 2017 county results (hist17 / raila2017 / turnout2017 in data/counties.js):
//     the spatial pattern of the Kenyatta/Ruto side vs Odinga
//   - the June 2022 register (registered2022)
//   - poll-error calibration from 2013 and 2017 only (out of sample for 2022)
//   - a pre-election regional poll (TIFA, 29 Jul 2022, nine zones; REGIONAL_POLL_2022 in
//     data/history.js), used the way the 2027 model uses `g`: zone strength from the
//     poll, spread inside each zone by the softened previous-election pattern
// Not tested: coalition transfers and running-mate effects (no 2022 equivalents).
// The script also calibrates the county-level noise the 2027 model needs (COUNTY_SD).
import fs from 'node:fs';
import { loadModel } from './model-harness.mjs';

const V = loadModel();
const CO = V.CO, R22 = V.R22;
const hist = V.POLL_HISTORY.find(e => e.year === 2022);
const tw = x => 100 * x.a / (x.a + x.b);
const P = hist.polls.reduce((s, p) => s + tw(p), 0) / hist.polls.length;   // 46.22
const oos = V.pollErrorStats([2013, 2017]);                                  // bias + spread known before 2022
const actualNat = tw(hist.result);

// actual 2022 two-way Ruto share by county and constituency
const act = new Map(), actC = [];
R22.forEach(x => { const a = act.get(x.co) || { ru: 0, ra: 0, all: 0 }; a.ru += x.ru; a.ra += x.ra; a.all += x.ru + x.ra + x.wj + x.mw; act.set(x.co, a);
  actC.push({ co: x.co, cs: x.cs, reg: x.reg, v: 100 * x.ru / (x.ru + x.ra) }); });
const actual = new Map([...act].map(([k, a]) => [k, { tw: 100 * a.ru / (a.ru + a.ra), all: 100 * a.ru / a.all }]));

// pre-election weights: 2022 register × 2017 turnout
const W = new Map(CO.map(c => [c.name, c.registered2022 * c.turnout2017]));
const Wsum = [...W.values()].reduce((a, b) => a + b, 0);
const nat = f => CO.reduce((s, c) => s + W.get(c.name) * f(c), 0) / Wsum;
const tw17 = c => 100 * c.hist17 / (c.hist17 + c.raila2017);
const nat17 = nat(tw17);

// Method 1, the model's: candidate seeds = national level x sqrt(2017 lean / national mean),
// renormalised per county, scaled until the national two-way share equals the poll level.
function ipf(target, soft = true) {
  const mR = nat(c => c.hist17), mO = nat(c => c.raila2017);
  const seed = c => soft ? [Math.sqrt(c.hist17 / mR), Math.sqrt(c.raila2017 / mO)] : [c.hist17 / mR, c.raila2017 / mO];
  let a = 1; const share = c => { const [r, o] = seed(c); return 100 * a * r / (a * r + o); };
  for (let it = 0; it < 60; it++) { const cur = nat(share); a *= Math.exp((target - cur) / 25); }
  return new Map(CO.map(c => [c.name, share(c)]));
}
// Method 1b, the full 2027 architecture: zone strength from the regional poll (relative
// to its national figure) x the softened 2017 lean relative to the zone's own mean.
const RP = V.REGIONAL_POLL_2022, zoneOf = new Map();
Object.entries(RP.zones).forEach(([z, d]) => d.counties.forEach(n => zoneOf.set(n, z)));
function ipfRegional(target) {
  const zm = {};
  CO.forEach(c => { const z = zoneOf.get(c.name), m = zm[z] || (zm[z] = { w: 0, r: 0, o: 0 }), w = W.get(c.name); m.w += w; m.r += w * c.hist17; m.o += w * c.raila2017; });
  const seed = c => { const z = zoneOf.get(c.name), d = RP.zones[z], m = zm[z];
    return [(d.ruto / RP.national.ruto) * Math.sqrt(c.hist17 / (m.r / m.w)), (d.odinga / RP.national.odinga) * Math.sqrt(c.raila2017 / (m.o / m.w))]; };
  let a = 1; const share = c => { const [r, o] = seed(c); return 100 * a * r / (a * r + o); };
  for (let it = 0; it < 60; it++) { const cur = nat(share); a *= Math.exp((target - cur) / 25); }
  return new Map(CO.map(c => [c.name, share(c)]));
}
// Method 2, uniform swing from 2017
const swing = target => new Map(CO.map(c => [c.name, Math.min(99.5, Math.max(0.5, tw17(c) + target - nat17))]));

// simulation error in two-way points: national (out-of-sample RMS), regional cluster, county
const CL_SD = 3.6, CTY_SD = 2.0;   // the model's assumptions before this back-test
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rnd = mulberry32(2022); const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) * Math.sqrt(3); };
function intervals(pred, ctySD = CTY_SD, n = 4000) {
  rnd = mulberry32(2022);   // same draws for every method, so coverage differences are the method's
  const cls = [...new Set(CO.map(c => c.cluster))], draws = new Map(CO.map(c => [c.name, []]));
  for (let i = 0; i < n; i++) {
    const e = gauss() * oos.rms, ce = Object.fromEntries(cls.map(k => [k, gauss() * CL_SD]));
    CO.forEach(c => draws.get(c.name).push(pred.get(c.name) + e + ce[c.cluster] + gauss() * ctySD));
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
  return new Map([...draws].map(([k, a]) => [k, [q(a, 0.1), q(a, 0.9)]]));
}
function score(id, label, pred, ctySD = CTY_SD) {
  const ci = intervals(pred, ctySD);
  let ae = 0, se = 0, win = 0, a138 = 0, cov = 0, wid = 0;
  CO.forEach(c => {
    const p = pred.get(c.name), y = actual.get(c.name), [lo, hi] = ci.get(c.name);
    ae += Math.abs(p - y.tw); se += (p - y.tw) ** 2; if ((p >= 50) === (y.tw >= 50)) win++;
    if ((p * y.all / y.tw >= 25) === (y.all >= 25)) a138++;   // 25% of all votes (minor-candidate share as cast)
    if (y.tw >= lo && y.tw <= hi) cov++; wid += hi - lo;
  });
  let cae = 0, creg = 0; actC.forEach(x => { cae += x.reg * Math.abs(pred.get(x.co) - x.v); creg += x.reg; });
  const natP = nat(c => pred.get(c.name));
  const n = CO.length;
  return { id, label, nationalPred: +natP.toFixed(2), nationalErr: +(actualNat - natP).toFixed(2),
    countyMAE: +(ae / n).toFixed(2), countyRMSE: +Math.sqrt(se / n).toFixed(2), winners: win, article138: a138,
    constituencyMAE: +(cae / creg).toFixed(2), coverage80: +(100 * cov / n).toFixed(1), width80: +(wid / n).toFixed(1) };
}
const P2 = P + oos.mean;
// county noise needed for honest 80% ranges with the full architecture: the smallest SD
// at which at least 80% of counties fall inside their range
const reg2 = ipfRegional(P2);
const cov = sd => { const ci = intervals(reg2, sd); return CO.filter(c => { const y = actual.get(c.name).tw, [lo, hi] = ci.get(c.name); return y >= lo && y <= hi; }).length / CO.length; };
let lo = 0, hi = 30; for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (cov(mid) >= 0.8) hi = mid; else lo = mid; }
const COUNTY_SD = +hi.toFixed(1);
const variants = [
  score('regional', 'Full model: regional poll layer, polls as published', ipfRegional(P)),
  score('regional-bias', 'Full model + bias correction (2013/17)', reg2),
  score('regional-bias-cal', 'Full model + bias correction, calibrated county noise', reg2, COUNTY_SD),
  score('model', 'No regional layer, polls as published', ipf(P)),
  score('model-bias', 'No regional layer + bias correction', ipf(P2)),
  score('linear', 'Unsoftened 2017 pattern', ipf(P, false)),
  score('swing', 'Uniform swing from 2017', swing(P)),
  score('swing-bias', 'Uniform swing + bias correction', swing(P2))
];
const m1 = reg2, ci1 = intervals(m1, COUNTY_SD);
const counties = CO.map(c => ({ name: c.name, actual: +actual.get(c.name).tw.toFixed(1), pred: +m1.get(c.name).toFixed(1),
  lo: +ci1.get(c.name)[0].toFixed(1), hi: +ci1.get(c.name)[1].toFixed(1), y2017: +tw17(c).toFixed(1) }))
  .sort((a, b) => Math.abs(b.actual - b.pred) - Math.abs(a.actual - a.pred));
const out = { generated: new Date().toISOString().slice(0, 10), pollLevel: +P.toFixed(2), actualNational: +actualNat.toFixed(2),
  outOfSample: { bias: +oos.mean.toFixed(2), rms: +oos.rms.toFixed(2), from: [2013, 2017] }, simulation: { clusterSD: CL_SD, countySD: CTY_SD, runs: 4000 },
  regionalPoll: { source: RP.source, url: RP.url }, calibration: { countySD: COUNTY_SD, note: 'two-way points per county, on top of national and regional error' },
  variants, counties };
fs.writeFileSync(new URL('../data/backtest2022.js', import.meta.url),
  '// Generated by scripts/backtest-2022.mjs — do not edit by hand. Two-way Ruto share (points).\nconst BACKTEST=' + JSON.stringify(out) + ';\n');
console.table(variants.map(v => ({ variant: v.id, natErr: v.nationalErr, MAE: v.countyMAE, RMSE: v.countyRMSE, winners: v.winners, a138: v.article138, consMAE: v.constituencyMAE, cov80: v.coverage80, width: v.width80 })));
console.log('calibrated county SD:', COUNTY_SD);
console.log('largest county misses (full model + bias):', counties.slice(0, 8).map(c => `${c.name} ${c.pred}→${c.actual}`).join(', '));
