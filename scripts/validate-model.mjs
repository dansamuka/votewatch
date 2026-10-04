// Model and data validation. Runs in CI before the Pages build: any failure blocks deploy.
//   node scripts/validate-model.mjs
// Two kinds of check, reported separately:
//   integrity  — facts the data and engine must satisfy (totals, sources, conservation,
//                reproducibility, calibration to the recorded poll errors)
//   sanity     — judgement bounds on outputs (e.g. Kisii third force 45–65%). Passing them
//                is not validation: the bounds are assumptions, and the model was tuned to
//                respect some of them.
import fs from 'node:fs';
import { loadModel } from './model-harness.mjs';

const V = loadModel();
const res = { integrity: [], sanity: [] };
const check = kind => (x, m) => { if (!x) throw new Error(`FAIL (${kind}): ${m}`); res[kind].push(m); };
const ok = check('integrity'), bound = check('sanity');
const near = (a, b, t, m, f = ok) => f(Math.abs(a - b) <= t, `${m} (expected ${b} ±${t}, got ${a})`);
const sumBy = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

// ── geography and register
ok(V.CO.length === 47, '47 counties');
ok(V.WARDS.length === 1450, '1,450 IEBC wards');
ok(new Set(V.WARDS.map(w => w.county + '|' + w.constituency)).size === 290, '290 constituencies');
ok(sumBy(V.WD, w => w.v22) === 22102532, '2022 ward register reconciles to 22,102,532 (IEBC Gazette Notice 7290)');
const wc = {}; V.WARDS.forEach(w => wc[w.county] = (wc[w.county] || 0) + 1);
V.CO.forEach(c => ok(wc[c.name] === c.wards, 'ward count for ' + c.name));
ok(sumBy(V.CO, c => c.registered2022) === 22102532, 'county 2022 registers sum to 22,102,532');
ok(sumBy(V.CO, c => c.currentEnrolmentProxyAug2026) === 25039048, 'current register proxy totals 25,039,048');
ok(sumBy(V.CO, c => c.target2027) === 28500000, 'IEBC 2027 target scenario totals 28,500,000');
ok(sumBy(V.CO, c => c.newRegistrationsApr2026) === V.REGISTER_META.ecvrCountyTotal && V.REGISTER_META.ecvrCountyTotal === 2345476, 'ECVR Phase I county figures sum to 2,345,476');
ok(V.REGISTER_META.nationalNewRegistrations === 2936516, 'national new registrations by 20 Aug 2026 = 2,936,516');
for (const mode of ['base', 'current', 'target']) {
  V.S.registerMode = mode; V.applyModelBase();
  ok(V.CO.every(c => sumBy(V.WARDS.filter(w => w.county === c.name), w => w.voters) === c.projectedVoters2027), `ward voters reconcile exactly to every county in the ${mode} register scenario`);
}
V.S.registerMode = 'current'; V.applyModelBase();

// ── 2022 presidential results
ok(V.R22.length === 290, '2022 results cover 290 constituencies');
ok(V.R22.every(x => ['v', 'r', 's', 'u'].includes(x.src)), 'every 2022 row carries a check status');
const ru = sumBy(V.R22, x => x.ru), ra = sumBy(V.R22, x => x.ra), cand = sumBy(V.R22, x => x.ru + x.ra + x.wj + x.mw);
ok(Math.abs(ru / 7176141 - 1) < 0.002, 'Ruto 2022 total within 0.2% of IEBC declared 7,176,141 (diaspora/prisons excluded)');
ok(Math.abs(ra / 6942930 - 1) < 0.002, 'Odinga 2022 total within 0.2% of IEBC declared 6,942,930');
near(ru / cand, 0.5049, 0.001, 'Ruto 2022 share vs IEBC declared 50.49%');
const agg = new Map(); V.R22.forEach(x => { const a = agg.get(x.co) || { ru: 0, t: 0 }; a.ru += x.ru; a.t += x.ru + x.ra + x.wj + x.mw; agg.set(x.co, a); });
V.CO.forEach(c => near(c.baseIncumbent2022, agg.get(c.name).ru / agg.get(c.name).t, 0.0006, '2022 county share matches constituency results: ' + c.name));
const r22m = new Map(V.R22.map(x => [x.co + '|' + x.cs, x]));
ok(V.WARDS.every(w => { const x = r22m.get(w.county + '|' + w.constituency); return x && Math.abs(w.bi - x.ru / (x.ru + x.ra + x.wj + x.mw)) < 1e-4; }), "every ward carries its constituency's 2022 Ruto share");
near(V.CO.find(c => c.name === 'Mandera').baseIncumbent2022, 0.209, 0.01, 'Mandera 2022 Ruto share (regression guard for the old 0.742 error)');

// ── history
ok(V.CO.every(c => typeof c.hist17 === 'number' && c.hist17 > 0 && c.hist17 < 1) && V.CO.every(c => !('hist13' in c)), '2017 county history present for all 47; unverifiable 2013 history removed');
near(V.CO.find(c => c.name === 'Nyeri').hist17, 0.984, 0.005, 'Nyeri 2017 Kenyatta share (regression guard for the old 0.806)');
const errs = V.pollHistoryErrors();
ok(errs.length === 3 && errs.every(e => e.err > 3 && e.err < 5), 'poll-history errors recorded for 2013, 2017, 2022 (+3.9, +3.8, +4.6)');

// ── polls
const ruto = V.CANDIDATES.find(c => c.name === 'William Ruto'), nyoro = V.CANDIDATES.find(c => c.name === 'Ndindi Nyoro');
ok(ruto.avgAll > ruto.avgVal, 'held-out polls change the all-polls sensitivity for Ruto');
ok(ruto.polls >= 4 && Math.abs(ruto.avgVal - ruto.poll) < 0.01, 'well-polled candidates are not shrunk');
ok(nyoro.polls === 0 && nyoro.avgVal <= 0.6, 'a candidate with no validated poll is held near the prior in the central case');

// ── undecided voters
const regTot = sumBy(V.WARDS, w => w.voters);
near(sumBy(V.WARDS.map((w, i) => [w, i]), ([w, i]) => w.voters * V.WU[i]) / regTot, V.UNDECIDED.national, 0.0005, 'undecided share averages to the national 20%');
ok(V.WARDS.every((w, i) => V.GROUP_OF[w.county] !== 'MTK' || V.WU[i] === 0.26), 'Mt Kenya wards carry the published 26% undecided');

// ── central default
V.S.pollMode = 'validated'; V.S.mcMode = 'research'; V.S.seed = 'ci-model-validation'; V.applyModelBase();
const r = V.sim({}, false, false, true);
near(r.nat.i + r.nat.o + r.nat.t, 1, 1e-9, 'national shares sum to 100%');
r.ctyRes.forEach(c => near(c.i + c.o + c.t, 1, 1e-9, 'county shares sum to 100%: ' + c.name));
const rU = V.sim({ ub: 10 }, false, false, false);
ok(rU.nat.i > r.nat.i, 'an undecided break toward A raises team A');

// ── run-off
const ro = V.r2sim(r.ctyRes, r.nat, 'aff'), spl = V.r2sim(r.ctyRes, r.nat, 'spl');
ok(Math.abs(ro.shareA - spl.shareA) > 0.01, 'modelled run-off transfers differ from a 50/50 split');
const r1 = sumBy(r.ctyRes, c => c.tv);
near(ro.votesA + ro.votesB, r1, r1 * 1e-9, 'run-off keeps every round-one vote');
const rP = V.sim({ tf: 8 }, false, false, false), roP = V.r2sim(rP.ctyRes, rP.nat, 'aff');
near(roP.votesA + roP.votesB, sumBy(rP.ctyRes, c => c.tv), 1, 'run-off keeps the protest vote when the protest slider is on');

// ── poll-bias correction and error calibration
const tw = x => 100 * x.nat.i / (x.nat.i + x.nat.o);
const rB = V.sim({ pollBias: true }, false, false, false);
near(tw(rB) - tw(r), V.POLL_ERR.mean, 0.35, 'poll-bias correction moves team A two-way share by the historical mean miss');
V.seedRng('ci-calibration'); const xs = []; for (let i = 0; i < 800; i++) xs.push(tw(V.sim({}, true, false, false)));
const mu = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
near(sd, V.POLL_ERR.rms, 0.15 * V.POLL_ERR.rms, 'simulated two-way error matches the historical poll error (4.1 pts)');

// ── simulation health and reproducibility
const m1 = V.mc({}, 300), m2 = V.mc({}, 300);
ok(m1.failed === 0, 'no failed simulation draws');
ok(m1.ro === m2.ro && m1.iMed === m2.iMed && JSON.stringify(m1.r2Win) === JSON.stringify(m2.r2Win), 'seeded Monte Carlo is reproducible');
ok(V.SH_DEF.every(e => /^Hypothetical/.test(e.desc)), 'every sandbox event is labelled hypothetical');

// ── back-test file consistent with the current history
const btFile = fs.readFileSync(new URL('../data/backtest2022.js', import.meta.url), 'utf8');
const bt = JSON.parse(btFile.slice(btFile.indexOf('{'), btFile.lastIndexOf('}') + 1));
const e22 = errs.find(e => e.year === 2022);
ok(bt.variants.length === 5 && Math.abs(bt.pollLevel - e22.poll) < 0.01 && Math.abs(bt.outOfSample.bias - V.pollErrorStats([2013, 2017]).mean) < 0.01, 'back-test file matches the current poll history (rerun scripts/backtest-2022.mjs after changing it)');

// ── sanity bounds (judgement, not validation)
for (const n of ['Kisumu', 'Migori']) bound(r.ctyRes.find(x => x.name === n).i < 0.48, n + ': team A below 48%');
for (const n of ['Kisii', 'Nyamira']) { const t = r.ctyRes.find(x => x.name === n).t; bound(t >= 0.45 && t <= 0.65, `${n}: third force 45–65% (got ${(t * 100).toFixed(1)}%)`); }
const st = V.structuralSummary();
bound(st.values.length >= 5 && st.iHi - st.iLo > 0.02, 'structural range across preset line-ups is visible');
V.S.pollMode = 'all'; V.applyModelBase();
const all = V.sim({}, false, false, false);
bound(Math.abs(all.nat.i - r.nat.i) > 0.005, 'all-polls sensitivity differs from the validated baseline');
V.S.pollMode = 'validated'; V.applyModelBase();

console.log(JSON.stringify({
  status: 'PASS', integrity: res.integrity.length, sanity: res.sanity.length,
  default: [r.nat.i, r.nat.o, r.nat.t].map(x => +(x * 100).toFixed(1)),
  withBiasCorrection: [rB.nat.i, rB.nat.o, rB.nat.t].map(x => +(x * 100).toFixed(1)),
  allPolls: [all.nat.i, all.nat.o, all.nat.t].map(x => +(x * 100).toFixed(1)),
  twoWayErrorSD: +sd.toFixed(2), historicalRMS: +V.POLL_ERR.rms.toFixed(2),
  structuralA: [+(st.iLo * 100).toFixed(1), +(st.iHi * 100).toFixed(1)],
  runoffModelA: +(ro.shareA * 100).toFixed(1), runoffWinA_300: +((m1.r2Win.inc || 0) * 100).toFixed(1),
  backtest: bt.variants.map(v => ({ id: v.id, natErr: v.nationalErr, countyMAE: v.countyMAE, cov80: v.coverage80 }))
}, null, 2));
