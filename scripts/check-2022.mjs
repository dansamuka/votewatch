// Independent check of the 2022 candidate splits, county by county.
//   node scripts/check-2022.mjs        → writes data/check2022.js
//
// The constituency results (data/results2022.js) come from a public tally of Forms 34B.
// Their totals were checked against the Kenya Data Atlas's official Form 34B reads, but
// that does not check how the votes split between candidates, and 45 constituencies had
// no official read at all. IEBC's forms portal (the only place with constituency-level
// candidate votes) was not reachable. This script checks the candidate splits against two
// compilations of IEBC's county results that are independent of the tally:
//   - Wikipedia's county table from Form 34C (votes; only rows whose candidate votes add up
//     to their own valid-vote total are used)      data/source/pres2022-county-wikipedia.csv
//   - ELOG's compilation of IEBC county results (shares)  data/source/pres2022-county-elog.csv
// A Wikipedia row is also set aside when the county's constituencies all have official
// Form 34B totals and the row's valid votes differ from their sum by more than 0.5%.
// A county agrees when the tally's Ruto share is within 0.5 points of ELOG and, where the
// Wikipedia row is usable, its Ruto and Odinga votes are within 1% of Wikipedia's.
// Every constituency in an agreeing county is then backed on candidate splits at county
// level; offsetting errors between constituencies of the same county would not show up.
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(read('data/results2022.js') + ';' + read('data/counties.js') + ';this.R22=R22;this.CO=CO;', ctx);
const { R22, CO } = ctx;
const csv = p => { const ls = read(p).split(/\r?\n/).filter(l => l && !l.startsWith('#')), h = ls[0].split(',');
  return ls.slice(1).map(l => { const v = l.match(/("[^"]*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '')); return Object.fromEntries(h.map((k, i) => [k, v[i]])); }); };
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const findCo = n => CO.find(c => norm(c.name) === norm(n) || norm(c.name).startsWith(norm(n).slice(0, 6)) || norm(n).startsWith(norm(c.name).slice(0, 6)));
const wiki = new Map(csv('data/source/pres2022-county-wikipedia.csv').map(r => [findCo(r.county)?.name, r]));
const elog = new Map(csv('data/source/pres2022-county-elog.csv').map(r => [findCo(r.county)?.name, r]));

const tal = new Map();
R22.forEach(x => { const a = tal.get(x.co) || { ru: 0, ra: 0, t: 0, rows: [] }; a.ru += x.ru; a.ra += x.ra; a.t += x.ru + x.ra + x.wj + x.mw; a.rows.push(x); tal.set(x.co, a); });

const counties = CO.map(c => {
  const a = tal.get(c.name), e = elog.get(c.name), w = wiki.get(c.name);
  const share = 100 * a.ru / a.t, eDiff = e ? share - +e.ruto_share_pct : null;
  let wUse = false, wRu = null, wRa = null, wConflict = null;
  if (w) { const cand = +w.odinga + +w.ruto + (+w.wajackoyah || 0) + (+w.mwaure || 0); wUse = Math.abs(cand - +w.valid) / +w.valid < 0.005;
    // a Wikipedia row that disagrees with the official Form 34B totals of a fully official county is not used
    const allOfficial = a.rows.every(x => x.src !== 'u');
    if (wUse && allOfficial && Math.abs(a.t / +w.valid - 1) > 0.005) { wUse = false; wConflict = +(100 * (+w.valid / a.t - 1)).toFixed(2); }
    if (wUse) { wRu = 100 * (a.ru / +w.ruto - 1); wRa = 100 * (a.ra / +w.odinga - 1); } }
  const agree = eDiff != null && Math.abs(eDiff) <= 0.5 && (!wUse || (Math.abs(wRu) <= 1 && Math.abs(wRa) <= 1));
  return { name: c.name, rutoShare: +share.toFixed(2), elogDiff: eDiff == null ? null : +eDiff.toFixed(2), wikiUsed: wUse,
    wikiRutoDiffPct: wRu == null ? null : +wRu.toFixed(2), wikiConflictsWithOfficialPct: wConflict, wikiOdingaDiffPct: wRa == null ? null : +wRa.toFixed(2), agree,
    unchecked: a.rows.filter(x => x.src === 'u').length, rescaled: a.rows.filter(x => x.src === 'r').length };
});
const reg = x => x.reg, tot = R22.reduce((s, x) => s + reg(x), 0);
const okC = new Set(counties.filter(c => c.agree).map(c => c.name));
const uc = R22.filter(x => x.src === 'u'), rs = R22.filter(x => x.src === 'r');
const pctReg = xs => +(100 * xs.reduce((s, x) => s + reg(x), 0) / tot).toFixed(1);
const summary = {
  countiesAgree: okC.size, counties: CO.length, wikiRowsUsable: counties.filter(c => c.wikiUsed).length,
  unchecked: { n: uc.length, backed: uc.filter(x => okC.has(x.co)).length, regPct: pctReg(uc), backedRegPct: pctReg(uc.filter(x => okC.has(x.co))) },
  rescaled: { n: rs.length, backed: rs.filter(x => okC.has(x.co)).length },
  all: { n: R22.length, backed: R22.filter(x => okC.has(x.co)).length, backedRegPct: pctReg(R22.filter(x => okC.has(x.co))) },
  differ: counties.filter(c => !c.agree).map(c => ({ name: c.name, elogDiff: c.elogDiff, wikiRutoDiffPct: c.wikiRutoDiffPct, wikiOdingaDiffPct: c.wikiOdingaDiffPct, unchecked: c.unchecked }))
};
fs.writeFileSync(new URL('../data/check2022.js', import.meta.url), '// Generated by scripts/check-2022.mjs — do not edit by hand.\nconst CHECK2022=' + JSON.stringify({ generated: new Date().toISOString().slice(0, 10), summary, counties }) + ';\n');
console.log(JSON.stringify(summary, null, 1));
