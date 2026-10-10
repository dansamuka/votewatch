// Adversarial tests for js/article138.js (Article 138 gates on integer tallies).
// Run by scripts/validate-model.mjs as integrity checks; also runnable on its own:
//   node scripts/test-article138.mjs
import { loadModel } from './model-harness.mjs';

// 47 counties of `T` valid votes each. `a` gives contestant A's votes per county (array
// of 47); the rest go to B.
function field(a, T = 1000) {
  return a.map((x, i) => ({ code: 'C' + String(i + 1).padStart(2, '0'), valid: { A: BigInt(x), B: BigInt((Array.isArray(T) ? T[i] : T) - x) } }));
}
const fill = (n, v) => Array(n).fill(v);
// Spread `total` across `n` counties as evenly as possible
const spread = (n, total) => { const b = Math.floor(total / n), r = total - b * n; return Array.from({ length: n }, (_, i) => b + (i < r ? 1 : 0)); };
const throws = f => { try { f(); return false; } catch (e) { return true; } };

export function runArticle138Tests(A, ok) {
  const ev = (c, ooc, o) => A.evaluate(c, ooc, o);

  // 1. exactly 50% of valid votes fails the strict majority
  let r = ev(field(fill(47, 500)));
  ok(!r.gates.A.national && r.gates.A.countiesQualified === 47 && r.freshElection, 'Art. 138: exactly 50% of valid votes fails the national gate');
  // 2. 50% + 1 vote with exactly 24 qualifying counties is elected
  r = ev(field([...spread(24, 23501 - 23 * 249), ...fill(23, 249)]));
  ok(r.total.A === 23501n && r.gates.A.national && r.gates.A.countiesQualified === 24 && r.elected[0] === 'A', 'Art. 138: 50% + 1 vote with 24 qualifying counties is elected');
  // 3. 55% nationally but only 23 counties: fresh election
  r = ev(field([...spread(23, 25850 - 24 * 249), ...fill(24, 249)]));
  ok(r.gates.A.national && r.gates.A.countiesQualified === 23 && r.freshElection, 'Art. 138: 55% nationally with 23 qualifying counties triggers a fresh election');
  // 4. 49.99% nationally with all 47 counties fails
  r = ev(field(spread(47, 23495)));
  ok(!r.gates.A.national && r.gates.A.countiesQualified === 47 && !r.elected.includes('A'), 'Art. 138: 49.99% nationally fails even with all 47 counties');
  // 5. exactly 25% in the 24th county passes (4v = T)
  r = ev(field([...fill(23, 1000), 250, ...fill(23, 249)]));
  ok(r.gates.A.countiesQualified === 24 && r.elected[0] === 'A', 'Art. 138: exactly 25% in the 24th county counts');
  // 6. 24th county just under 25% (1000 of 4001) fails
  r = ev(field([...fill(23, 1000), 1000, ...fill(23, 249)], [...fill(23, 1000), 4001, ...fill(23, 1000)]));
  ok(r.gates.A.countiesQualified === 23 && r.freshElection, 'Art. 138: 24.99% in the 24th county does not count');
  // 7. rejected ballots are not part of the test: adding them to a county changes nothing
  const base = field(spread(47, 23501)), withRej = base.map(c => ({ ...c, rejected: 1000000n }));
  const r0 = ev(base), r1 = ev(withRej);
  ok(r0.N === r1.N && r0.elected.join() === r1.elected.join() && r0.gates.A.countiesQualified === r1.gates.A.countiesQualified, 'Art. 138: rejected ballots do not enter either gate');
  // 9–10. threshold-safe display
  let g = A.fmtGate(0.2496);
  ok(g.text === '24.9%' && !g.pass && g.glyph === '✗', 'Display: 24.96% renders below the 25% line, never "25.0%"');
  g = A.fmtGate(0.25);
  ok(g.text === '25.0%' && g.pass, 'Display: exactly 25% renders "25.0%" and passes');
  let m = A.fmtMajority(0.49996);
  ok(m.text === '49.9%' && !m.pass, 'Display: 49.996% renders below 50%, never "50.0%"');
  m = A.fmtMajority(0.5);
  ok(m.text === '< 50.0%' && !m.pass, 'Display: exactly 50% renders "< 50.0%" and fails the strict majority');
  m = A.fmtMajority(0.50004);
  ok(m.text === '> 50.0%' && m.pass, 'Display: a bare majority renders "> 50.0%", never a plain "50.0%"');
  // 11. a county with no valid votes: ingest throws; the engine marks it unavailable
  const zero = field(fill(47, 600)); zero[0] = { code: 'C01', valid: { A: 0n, B: 0n } };
  ok(throws(() => ev(zero, {}, { mode: 'ingest' })), 'Art. 138: ingest rejects a county with no valid votes');
  r = ev(zero);
  ok(r.degenerate === 1 && r.countyStatus.C01.A === 'unavailable' && r.gates.A.countiesQualified === 46, 'Art. 138: an empty county is unavailable and never counts as 25%');
  // 12. out-of-county votes count nationally but in no county
  r = ev(field(fill(47, 500)), { A: 1n });
  ok(r.gates.A.national && r.N === 47001n && r.gates.A.countiesQualified === 47, 'Art. 138: out-of-county votes count toward the national gate');
  r = ev(field([...fill(23, 1000), ...fill(24, 0)]), { A: 100000n });
  ok(r.gates.A.national && r.gates.A.countiesQualified === 23 && r.freshElection, 'Art. 138: out-of-county votes cannot supply a county');
  // 13. structural errors are hard failures
  ok(throws(() => ev(field(fill(46, 500)))), 'Art. 138: a missing county is rejected');
  const dup = field(fill(47, 500)); dup[1] = { ...dup[1], code: 'C01' };
  ok(throws(() => ev(dup)), 'Art. 138: a duplicate county code is rejected');
  const neg = field(fill(47, 500)); neg[3] = { code: 'C04', valid: { A: -1n, B: 1001n } };
  ok(throws(() => ev(neg)), 'Art. 138: negative votes are rejected');
  ok(throws(() => ev(field(fill(47, 500)), { A: -5n })), 'Art. 138: negative out-of-county votes are rejected');
  // 14. largest-remainder allocation conserves votes and is deterministic
  const w = [0.333333, 0.333333, 0.333334], lr = A.largestRemainder(1000, w);
  ok(lr.reduce((a, b) => a + b, 0n) === 1000n && lr.join() === A.largestRemainder(1000, w).join(), 'Largest remainder: allocation sums to the total and is deterministic');
  ok(A.largestRemainder(7, [1, 1, 1]).join() === '3,2,2', 'Largest remainder: tied remainders go to the earlier contestant');
  // 16–17. fresh-election field: most and second-most votes, ties carried through
  r = ev(field(fill(47, 400)).map(c => ({ ...c, valid: { A: 400n, B: 350n, C: 250n } })));
  ok(r.freshElection && r.fresh.first.join() === 'A' && r.fresh.second.join() === 'B' && !r.fresh.tie, 'Art. 138(5): fresh election between the first and second by votes');
  r = ev(field(fill(47, 400)).map(c => ({ ...c, valid: { A: 400n, B: 300n, C: 300n } })));
  ok(r.fresh.first.join() === 'A' && r.fresh.second.join() === 'B,C' && r.fresh.tie, 'Art. 138(5): a tie for second sends both tied candidates through');
  // 18. an exact fresh-election tie is out of model
  const t = A.freshElectionWinner(5000000, 5000000, 'A', 'B');
  ok(t.winner === null && t.status === 'tie_out_of_model', 'Art. 138(7): an exact fresh-election tie is reported, not assigned');
  ok(A.freshElectionWinner(5000001, 5000000, 'A', 'B').winner === 'A', 'Art. 138(7): most votes wins the fresh election');
  // eligibility: votes for minor candidates count in N but cannot win
  r = ev(field(fill(47, 600)).map(c => ({ ...c, valid: { A: 450n, B: 300n, minor: 250n } })), {}, { eligible: ['A', 'B'] });
  ok(!('minor' in r.gates) && r.N === 47000n && !r.gates.A.national, 'Art. 138: minor-candidate votes count in the denominator');
}

export function runEngineGateTests(V, ok) {
  // The engine's integer test agrees with the share-based reading on the default scenario
  const r = V.sim({}, false, false, false);
  const g = V.A138.fromSim(r.ctyRes, r.nat);
  ok(g.degenerate === 0, 'Engine: no county without valid votes in the default scenario');
  ok(g.gates.inc.countiesQualified === r.ctyRes.filter(c => c.i >= 0.25).length, 'Engine: integer county test matches the share-based count for team A');
  const sumN = r.ctyRes.reduce((s, c) => s + Math.round(c.tv), 0);
  ok(g.N === BigInt(sumN), 'Engine: integer valid votes reconcile to the rounded county totals');
  ok(Object.values(g.total).reduce((a, b) => a + b, 0n) === g.N, 'Engine: every valid vote is allocated to exactly one contestant');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('test-article138.mjs')) {
  const V = loadModel();
  const done = [];
  const ok = (x, m) => { if (!x) throw new Error('FAIL: ' + m); done.push(m); };
  runArticle138Tests(V.A138, ok);
  runEngineGateTests(V, ok);
  console.log(`article138: PASS (${done.length} checks)`);
}
