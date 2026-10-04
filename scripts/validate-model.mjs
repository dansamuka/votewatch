// Model and data validation. Runs in CI before the Pages build: a failure blocks deploy.
//   node scripts/validate-model.mjs
// Adapted from vote2watch v8 (geography, register, polls, calibration, run-off,
// structural range) and extended with the 2022 presidential results, run-off vote
// conservation and seeded reproducibility.
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = ['data/wards.js', 'data/counties.js', 'data/results2022.js', 'data/transport.js', 'data/context.js', 'js/app.js'];
const el = () => null;
const context = {
  console, Math, Date, Intl, URL, Blob: class {},
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  localStorage: { getItem: () => null, setItem: () => {} }, window: {},
  document: { addEventListener: () => {}, querySelector: el, querySelectorAll: () => [], getElementById: el, documentElement: { dataset: {} } },
  Event: function () {}
};
context.globalThis = context;
vm.createContext(context);
for (const p of files) vm.runInContext(read(p), context, { filename: p });
vm.runInContext('globalThis.__V={CO,WARDS,WD,R22,S,CANDIDATES,sim,r2sim,mc,structuralSummary,applyModelBase,REGISTER_META,GROUP_OF};', context);
const V = context.__V;

const checks = [];
const ok = (x, m) => { if (!x) throw new Error('FAIL: ' + m); checks.push(m); };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m} (expected ${b} ±${t}, got ${a})`);
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

// ── polls
const ruto = V.CANDIDATES.find(c => c.name === 'William Ruto'), nyoro = V.CANDIDATES.find(c => c.name === 'Ndindi Nyoro');
ok(ruto.avgAll > ruto.avgVal, 'held-out polls change the all-polls sensitivity for Ruto');
ok(ruto.polls >= 4 && Math.abs(ruto.avgVal - ruto.poll) < 0.01, 'well-polled candidates are not shrunk');
ok(nyoro.polls === 0 && nyoro.avgVal <= 0.6, 'a candidate with no validated poll is held near the prior in the central case');

// ── central default
V.S.registerMode = 'current'; V.S.pollMode = 'validated'; V.S.mcMode = 'research'; V.S.seed = 'ci-model-validation';
V.applyModelBase();
const r = V.sim({}, false, false, true);
near(r.nat.i + r.nat.o + r.nat.t, 1, 1e-9, 'national shares sum to 100%');
r.ctyRes.forEach(c => near(c.i + c.o + c.t, 1, 1e-9, 'county shares sum to 100%: ' + c.name));
near(sumBy(V.WARDS, w => w.voters), 25039048, 47, 'ward voters follow the current register scenario');
for (const n of ['Kisumu', 'Migori']) ok(r.ctyRes.find(x => x.name === n).i < 0.48, n + ': team A below 48% (calibration guard)');
for (const n of ['Kisii', 'Nyamira']) { const t = r.ctyRes.find(x => x.name === n).t; ok(t >= 0.45 && t <= 0.65, `${n}: third force inside 45–65% (got ${(t * 100).toFixed(1)}%)`); }

// ── run-off
const ro = V.r2sim(r.ctyRes, r.nat, 'aff'), spl = V.r2sim(r.ctyRes, r.nat, 'spl');
ok(Math.abs(ro.shareA - spl.shareA) > 0.01, 'modelled run-off transfers differ from a 50/50 split');
const r1 = sumBy(r.ctyRes, c => c.tv);
near(ro.votesA + ro.votesB, r1, r1 * 1e-9, 'run-off keeps every round-one vote (protest vote not dropped)');
const rP = V.sim({ tf: 8 }, false, false, false), roP = V.r2sim(rP.ctyRes, rP.nat, 'aff');
near(roP.votesA + roP.votesB, sumBy(rP.ctyRes, c => c.tv), 1, 'run-off keeps the protest vote when the protest slider is on');

// ── structural range and the all-polls sensitivity
const st = V.structuralSummary();
ok(st.values.length >= 5 && st.iHi - st.iLo > 0.02, 'structural range across preset line-ups is visible');
V.S.pollMode = 'all'; V.applyModelBase();
const all = V.sim({}, false, false, false);
ok(Math.abs(all.nat.i - r.nat.i) > 0.005, 'all-polls sensitivity differs from the validated baseline');
V.S.pollMode = 'validated'; V.applyModelBase();

// ── seeded reproducibility
const m1 = V.mc({}, 300), m2 = V.mc({}, 300);
ok(m1.ro === m2.ro && m1.iMed === m2.iMed && JSON.stringify(m1.r2Win) === JSON.stringify(m2.r2Win), 'seeded Monte Carlo is reproducible');

console.log(JSON.stringify({
  status: 'PASS', checks: checks.length,
  wards: V.WARDS.length, constituencies: 290, register2022: sumBy(V.WD, w => w.v22), registerCurrent: sumBy(V.WARDS, w => w.voters),
  results2022: { ruto: ru, odinga: ra, rutoShare: +(ru / cand * 100).toFixed(2) },
  default: [r.nat.i, r.nat.o, r.nat.t].map(x => +(x * 100).toFixed(1)),
  allPolls: [all.nat.i, all.nat.o, all.nat.t].map(x => +(x * 100).toFixed(1)),
  structuralA: [+(st.iLo * 100).toFixed(1), +(st.iHi * 100).toFixed(1)],
  runoffModelA: +(ro.shareA * 100).toFixed(1), runoffWinA_300: +((m1.r2Win.inc || 0) * 100).toFixed(1),
  kisii3rd: +(r.ctyRes.find(x => x.name === 'Kisii').t * 100).toFixed(1), kisumuA: +(r.ctyRes.find(x => x.name === 'Kisumu').i * 100).toFixed(1), migoriA: +(r.ctyRes.find(x => x.name === 'Migori').i * 100).toFixed(1)
}, null, 2));
