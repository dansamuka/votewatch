// Fit ERR_SCALE (js/app.js) so the simulated spread of team A's two-way share
// (A / (A + B), default line-up, central settings) matches the historical error of
// Kenya's final validated polls (POLL_ERR.rms in data/history.js).
//   node scripts/calibrate-error.mjs
import { loadModel } from './model-harness.mjs';

const V = loadModel();
const target = V.POLL_ERR.rms; // two-way points
const N = +(process.argv[2] || 3000);
function spread(k) {
  V.setErrorScale(k);
  V.seedRng('calibrate-error');
  const xs = [];
  for (let i = 0; i < N; i++) { const r = V.sim({}, true, false, false); xs.push(100 * r.nat.i / (r.nat.i + r.nat.o)); }
  const m = xs.reduce((a, b) => a + b, 0) / N;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (N - 1));
}
let lo = 0.1, hi = 2.0;
for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (spread(mid) < target) lo = mid; else hi = mid; }
const k = +((lo + hi) / 2).toFixed(3);
console.log(JSON.stringify({ target: +target.toFixed(2), ERR_SCALE: k, achieved: +spread(k).toFixed(2), runs: N }));
