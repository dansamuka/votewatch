// Golden-master regression check for the model engine.
//   node scripts/golden-master.mjs           compare the engine with tests/golden/golden.json (CI)
//   node scripts/golden-master.mjs --update  rewrite the snapshot after an intended change
// The snapshot holds deterministic results (national and per county) for every preset
// line-up, every register scenario and 20 fixed random settings, plus seeded Monte Carlo
// summaries. Any difference fails, so an engine change is either a regression or an
// intended change that is recorded in tests/golden/CHANGES.md alongside the new snapshot.
import fs from 'node:fs';
import { loadModel } from './model-harness.mjs';

const FILE = new URL('../tests/golden/golden.json', import.meta.url);
const update = process.argv.includes('--update');
const V = loadModel();
const r12 = x => (typeof x === 'number' && Number.isFinite(x) ? +x.toPrecision(12) : x);

// Fixed generator for the random settings, independent of the engine's own RNG
function gen(seed) { let a = seed >>> 0; return () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const u = gen(20271010), between = (a, b) => Math.round(a + (b - a) * u());
const REGIONS = ['mtk', 'rift', 'nyz', 'kmb', 'cst', 'wst', 'nbi', 'ne'];

function snapDet(params) {
  const r = V.sim(params, false, false, false);
  return {
    nat: { i: r12(r.nat.i), o: r12(r.nat.o), t: r12(r.nat.t), v: r12(r.nat.v) },
    cty: r.ctyRes.map(c => [c.name, r12(c.i), r12(c.o), r12(c.t), r12(c.tv)])
  };
}
function snapMC(params, n) {
  const m = V.mc(params, n);
  return { iW: r12(m.iW), oW: r12(m.oW), ro: r12(m.ro), iMed: r12(m.iMed), iLo: r12(m.iLo), iHi: r12(m.iHi),
    oMed: r12(m.oMed), p25: Object.values(m.cty).map(c => r12(c.p25)), failed: m.failed };
}

const out = { det: {}, mc: {} };
const presets = V.SCENS.map(sc => [sc.id, { ...sc.p, cfg: sc.cfg }]);
for (const [id, p] of presets) out.det['preset:' + id] = snapDet(p);
for (const mode of ['base', 'target']) {
  V.S.registerMode = mode; V.applyModelBase();
  out.det['register:' + mode] = snapDet({});
}
V.S.registerMode = 'current'; V.applyModelBase();
for (let k = 0; k < 20; k++) {
  const p = { tf: between(-5, 5), si: between(-5, 5), so: between(-5, 5), ys: between(-5, 10), yg: between(0, 20),
    ub: between(-10, 10), uo: between(-10, 10), ua: between(-20, 20), pollBias: u() < 0.3,
    rt: Object.fromEntries(REGIONS.map(r => [r, between(-15, 10)])), cfg: presets[k % presets.length][1].cfg };
  out.det['random:' + k] = { params: p, ...snapDet(p) };
}
V.S.mcMode = 'research';
for (const [id, p] of presets.slice(0, 3)) out.mc['preset:' + id] = snapMC(p, 300);

if (update) {
  fs.mkdirSync(new URL('../tests/golden/', import.meta.url), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out) + '\n');
  console.log('golden master updated:', Object.keys(out.det).length, 'deterministic cases,', Object.keys(out.mc).length, 'Monte Carlo cases');
  process.exit(0);
}

const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const diffs = [];
function cmp(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') { if (a !== b) diffs.push([path, a, b, Math.abs(a - b)]); return; }
  if (Array.isArray(a) || (a && typeof a === 'object')) {
    if (!b || typeof b !== 'object') { diffs.push([path, 'object', b, Infinity]); return; }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], path + '.' + k);
    return;
  }
  if (a !== b) diffs.push([path, a, b, Infinity]);
}
cmp(want, out, 'golden');
if (diffs.length) {
  const worst = [...diffs].sort((x, y) => y[3] - x[3]).slice(0, 15);
  console.error(`GOLDEN MASTER: ${diffs.length} values differ (largest first):`);
  for (const [p, a, b, d] of worst) console.error(`  ${p}: expected ${a}, got ${b} (|Δ| ${d})`);
  console.error('If this change is intended, run with --update and record it in tests/golden/CHANGES.md.');
  process.exit(1);
}
console.log(`golden master: PASS (${Object.keys(out.det).length} deterministic, ${Object.keys(out.mc).length} Monte Carlo cases)`);
