// Loads the browser model (data files + js/app.js) into a Node VM for the validator,
// calibration and back-test scripts. Keep FILES in the same order as index.html.
import fs from 'node:fs';
import vm from 'node:vm';

export const FILES = ['data/wards.js', 'data/counties.js', 'data/results2022.js', 'data/check2022.js', 'data/transport.js', 'data/context.js', 'data/history.js', 'data/backtest2022.js', 'js/article138.js', 'js/app.js'];
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

export function loadModel(extraFiles = []) {
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
  for (const p of [...FILES, ...extraFiles]) vm.runInContext(read(p), context, { filename: p });
  vm.runInContext(`globalThis.__V={CO,WARDS,WD,R22,S,CANDIDATES,SH_DEF,POLL_ERR,POLL_HISTORY,UNDECIDED,REGIONAL_POLL_2022,pollHistoryErrors,pollErrorStats,
    CHECK2022,SCENS,A138,REJ_RATE,OOC_SHARE,sim,r2sim,mc,structuralSummary,applyModelBase,setErrorScale,REGISTER_META,GROUP_OF,COUNTY_GROUP,
    get WU(){return WU},get NAT_SWING_SD(){return NAT_SWING_SD},get UB_SD(){return UB_SD},get ERR_SCALE(){return ERR_SCALE},get COUNTY_SD(){return COUNTY_SD},
    seedRng:s=>{RNG_SOURCE=mulberry32(seedHash(s));},drawRng:(seed,i)=>{RNG_SOURCE=drawStream(seed,i);},clearRng:()=>{RNG_SOURCE=null;},addShock,mcCore};`, context);
  return context.__V;
}
