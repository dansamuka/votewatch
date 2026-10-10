// ═══ DATA ═══
// Plain region names for the six model regions (source data uses analyst labels)
const REGION={"Urban/Protest":"Western & Nairobi","Mountain Rebel":"Mt Kenya","Coast/Joho":"Coast","Eastern/Ukambani":"Eastern","Rift Valley Anchor":"Rift & North","Nyanza Split":"Nyanza"};
CO.forEach(c=>{c.cluster=REGION[c.cluster]||c.cluster;});
WD.forEach(w=>{w.cl=REGION[w.cl]||w.cl;});
const WARDS=WD.map(w=>({id:w.id,county:w.co,constituency:w.cs,ward:w.w,
  voters:w.v,v22:w.v22??w.v,toBase:w.tb,bi:w.bi,bo:w.bo,cl:w.cl,dq:w.dq,vl:w.vl,yr:w.yr,dn:w.dn}));
// Register scenarios (from vote2watch v8): 2022 certified; current proxy (2022 +
// 2.94m new registrations by 20 Aug 2026, shared by IEBC's April county split);
// IEBC's ~28.5m 2027 planning target. Wards scale with their 2022 register.
const REGISTER_MODES={base:{k:'registered2022',l:'2022 certified register'},current:{k:'currentEnrolmentProxyAug2026',l:'Current proxy (Aug 2026)'},target:{k:'target2027',l:'IEBC 2027 target scenario'}};
function countyRegister(c,mode){const k=(REGISTER_MODES[mode]||REGISTER_MODES.current).k;return Number(c&&c[k])||Number(c&&c.registered2022)||0;}
let REG_TOTAL=0,WT=[],WT_SUM=0,WU=[];
const CM=new Map(CO.map(c=>[c.name,c]));
// 2022 presidential result by constituency, keyed "County|Constituency"
const R22M=new Map((typeof R22!=='undefined'?R22:[]).map(x=>[x.co+'|'+x.cs,x]));
const r22Share=x=>{const t=x.ru+x.ra+x.wj+x.mw||1;return{ru:x.ru/t,ra:x.ra/t};};
// Rejected presidential ballots, by county, from the 2022 Forms 34B (R22 `rej`).
// Turnout bases count ballots cast, so valid votes = ballots cast × (1 − rate).
// "Votes cast" in Art. 138 means valid votes (Supreme Court, 2013), so the gates
// are tested on valid votes only.
const REJ_RATE=(()=>{const a={};(typeof R22!=='undefined'?R22:[]).forEach(x=>{const o=a[x.co]||(a[x.co]={j:0,v:0});o.j+=x.rej||0;o.v+=x.ru+x.ra+x.wj+x.mw;});
  return Object.fromEntries(Object.entries(a).map(([k,o])=>[k,o.j/((o.j+o.v)||1)]));})();
// Valid votes cast outside any county (diaspora, prisons), as a share of in-county valid
// votes. 2022: IEBC declared Ruto 7,176,141 and Odinga 6,942,930 against 7,170,304 and
// 6,936,396 in the constituency tally, so at least 12,371 votes came from outside the
// counties (the two minor candidates' out-of-county votes are not in the source). They
// count toward the national majority and in no county's 25% test; the model splits them
// in proportion to the national result (an assumption: no 2027 diaspora poll exists).
const OOC_SHARE=(()=>{const t=(typeof R22!=='undefined'?R22:[]).reduce((s,x)=>s+x.ru+x.ra+x.wj+x.mw,0);return t?((7176141-7170304)+(6942930-6936396))/t:0;})();
const WBC=new Map();
WARDS.forEach(w=>{if(!WBC.has(w.county))WBC.set(w.county,[]);WBC.get(w.county).push(w);});

// ═══ ANALYTICAL CONSTANTS ═══
// Turnout sigma by cluster (heteroskedastic)
const TO_SIG={
  'Western & Nairobi':0.048,'Mt Kenya':0.042,'Coast':0.036,
  'Nyanza':0.032,'Eastern':0.038,'Rift & North':0.024
};
// ═══ TEAMS (v7) ═══
// Every candidate in data/context.js is on exactly one team or runs solo.
// Team A is Ruto's side (Ruto is fixed there); team B is the main challenger
// slot; teams C/D and solo candidates make up "others".
// Default line-up (Oct 2026 testing baseline): the broad-based government
// (Ruto–Kindiki, Oburu Odinga's ODM wing off the ticket) vs a Kalonzo–Sifuna
// United opposition (Gachagua backing it from off the ticket), with Matiang'i–
// Nyoro running as a third force so their bases split the opposition vote. 65% of a
// running mate's supporters follow: bases of former rivals transfer poorly.
const MAX_TEAMS=4;
function defaultCfg(){
  return presetCfg(['Broad-based government','United opposition','Third force'],
    [['William Ruto','Oburu Odinga'],
     ['Kalonzo Musyoka','Edwin Sifuna','Babu Owino','Rigathi Gachagua','David Maraga','Martha Karua','James Orengo','Okiya Omtata'],
     ["Fred Matiang'i",'Ndindi Nyoro']],65,
    [{p:'William Ruto',r:'pick:kindiki'},{p:'Kalonzo Musyoka',r:'Edwin Sifuna'},{p:"Fred Matiang'i",r:'Ndindi Nyoro'}]);
}
// Same line-up without the third force: Matiang'i and Nyoro back the United opposition from off the ticket
function noThirdForceCfg(){
  return presetCfg(['Broad-based government','United opposition'],
    [['William Ruto','Oburu Odinga'],
     ['Kalonzo Musyoka','Edwin Sifuna',"Fred Matiang'i",'Rigathi Gachagua','Babu Owino','Ndindi Nyoro','David Maraga','Martha Karua','James Orengo','Okiya Omtata']],65,
    [{p:'William Ruto',r:'pick:kindiki'},{p:'Kalonzo Musyoka',r:'Edwin Sifuna'}]);
}
// Ruto vs the four highest-polling challengers (the engine dashboard default)
function topFourCfg(){
  const assign={};let n=0;
  [...CANDIDATES].sort((a,b)=>b.avg-a.avg).forEach(c=>{
    if(c.name==='William Ruto')assign[c.name]=0;
    else if(n<4){assign[c.name]=1;n++;}
    else assign[c.name]=-1;
  });
  return {teams:['Ruto’s side','United opposition'],assign,follow:85,offFollow:LEAK_DEFAULT.off,leak:{...LEAK_DEFAULT.leak}};
}
// Presets: real 2027 paths as of October 2026. `cfg` = teams, `p` = sliders.
function presetCfg(teams,groups,follow=85,tickets){
  const assign={};CANDIDATES.forEach(c=>assign[c.name]=-1);
  groups.forEach((g,i)=>g.forEach(n=>assign[n]=i));
  const cfg={teams,assign,follow,offFollow:LEAK_DEFAULT.off,leak:{...LEAK_DEFAULT.leak}};
  if(tickets)cfg.tickets=tickets;
  return cfg;
}
// Tickets: each team has a presidential candidate and (optionally) a running mate.
// Supporters of the presidential candidate all follow; the running mate's follow at
// cfg.follow; members left off the ticket at cfg.offFollow. Those who don't follow
// split between staying home, crossing to the other main side, and going elsewhere.
const LEAK_DEFAULT={off:55,leak:{home:30,cross:40,else:30}};
// Teams panel tooltip: what the model does with a candidate's polling
function pollTip(c){
  return `Validated polls: ${c.val?c.poll.toFixed(1)+'% ('+c.polls+(c.polls===1?' poll':' polls')+')':'none'} · all published polls: ${c.pollAll.toFixed(1)}% (${c.pollsAll}) · weighted by recency, sample and pollster · model level after adjusting for few polls: ${c.avg.toFixed(1)}%`;
}
function teamMembers(cfg,ti){return CANDIDATES.filter(c=>cfg.assign[c.name]===ti).sort((a,b)=>b.avg-a.avg).map(c=>c.name);}
// Running mates for Ruto's team who are not in the presidential polls. Their pull is an
// assumed regional swing to team A (points), not measured: g = whole county groups,
// home = extra in the home county. 'ally' = a team member whose supporters follow as if
// they were the running mate (an ODM pick keeps ODM's base on side).
const RM_PICKS={
  kindiki:{name:'Kithure Kindiki',short:'Kindiki',desc:'Deputy President (UDA), Tharaka-Nithi',g:{MERU:3,MTK:1},home:{'Tharaka - Nithi':2}},
  waiguru:{name:'Anne Waiguru',short:'Waiguru',desc:'Kirinyaga governor (UDA)',g:{MTK:2,MERU:1},home:{Kirinyaga:2}},
  mbadi:{name:'John Mbadi',short:'Mbadi',desc:'Treasury Cabinet Secretary (ODM), Homa Bay',g:{LUO:2},home:{'Homa Bay':2},ally:'Oburu Odinga'},
  mudavadi:{name:'Musalia Mudavadi',short:'Mudavadi',desc:'Prime Cabinet Secretary, Vihiga',g:{WEST:2},home:{Vihiga:2.5}},
  wetangula:{name:"Moses Wetang'ula",short:"Wetang'ula",desc:'National Assembly Speaker (Ford-Kenya), Bungoma',g:{WEST:1.5},home:{Bungoma:3}},
  wanga:{name:'Gladys Wanga',short:'Wanga',desc:'Homa Bay governor and ODM chair',g:{LUO:2.5},home:{'Homa Bay':2.5},ally:'Oburu Odinga'}
};
const rmPick=r=>typeof r==='string'&&r.startsWith('pick:')?RM_PICKS[r.slice(5)]||null:null;
function rmEffectText(pk){
  const parts=Object.entries(pk.g).map(([g,v])=>`+${v} in ${GROUP_LABEL[g]||g}`);
  Object.entries(pk.home||{}).forEach(([c,v])=>parts.push(`+${v} more in ${c.replace(' - ','-')}`));
  return `Assumed pull for team A: ${parts.join(', ')} (points).${pk.ally?` ${pk.ally.split(' ').slice(-1)[0]}'s supporters stay on side.`:''}`;
}
function ticketOf(cfg,ti){
  const m=teamMembers(cfg,ti),t=(cfg.tickets&&cfg.tickets[ti])||{};
  const p=ti===0&&m.includes('William Ruto')?'William Ruto':(m.includes(t.p)?t.p:m[0]||null);
  let r,pick=null;
  if(t.r===null||t.r==='')r=null;
  else if(ti===0&&rmPick(t.r)){r=t.r;pick=rmPick(t.r);}
  else r=(m.includes(t.r)&&t.r!==p)?t.r:(m.find(n=>n!==p)||null);
  const ally=pick&&pick.ally&&m.includes(pick.ally)?pick.ally:null;
  return {p,r,pick,ally,rName:pick?pick.name:r,members:m,off:m.filter(n=>n!==p&&n!==r&&n!==ally)};
}
// Regional turnout: relative change per region (−12 = 12% fewer of its voters turn out)
const RT_REGIONS=[
  {k:'mtk',l:'Mt Kenya',g:['MTK','MERU']},{k:'rift',l:'Rift Valley',g:['KAL','RIFT']},
  {k:'nyz',l:'Nyanza',g:['LUO','GUSII']},{k:'kmb',l:'Ukambani',g:['KAMBA']},
  {k:'cst',l:'Coast',g:['COAST']},{k:'wst',l:'Western',g:['WEST']},
  {k:'nbi',l:'Nairobi',g:['NBI']},{k:'ne',l:'North',g:['NE']}];
const RT_ZERO=Object.fromEntries(RT_REGIONS.map(r=>[r.k,0]));
const RT_DEFAULT={mtk:-12,rift:2,nyz:-3,kmb:4,cst:-5,wst:-5,nbi:0,ne:0};
const SCENS=[
  {id:'s0',tier:'Three-way split',c:'#b86a10',t:'Default: Ruto–Kindiki vs Kalonzo–Sifuna, with a Matiang\'i–Nyoro third force',
    d:'Ruto runs with Kindiki; Oburu Odinga\'s ODM wing backs him from off the ticket. Kalonzo heads the United opposition with Sifuna as running mate and Gachagua behind them. Matiang\'i and Nyoro run their own ticket and split the opposition vote. 65% of a running mate’s supporters follow; lower turnout in Mt Kenya (−12%), Coast and Western (−5%) and Nyanza (−3%), higher in Ukambani (+4%) and the Rift (+2%).',
    cfg:defaultCfg(),p:{tf:0,si:0,so:0,ys:0,rt:{...RT_DEFAULT}}},
  {id:'s0b',tier:'No third force',c:'#b86a10',t:'Same line-up, Matiang\'i and Nyoro stay with the opposition',
    d:'As the default, but Matiang\'i and Nyoro back the Kalonzo–Sifuna ticket from off the ticket instead of running their own. Compare with the default to see what a third force costs the opposition.',
    cfg:noThirdForceCfg(),p:{tf:0,si:0,so:0,ys:0,rt:{...RT_DEFAULT}}},
  {id:'s1',tier:'Ruto vs the top four',c:'#b86a10',t:'Kalonzo, Sifuna, Matiang\'i and Babu Owino on one ticket',
    d:'The four highest-polling challengers combine; Gachagua and the rest run solo. Matches the engine dashboard defaults.',
    cfg:topFourCfg(),p:{tf:0,si:0,so:0,ys:0,rt:{...RT_ZERO}}},
  {id:'s2',tier:'Grand opposition',c:'#b83232',t:'Everyone but Ruto and ODM on one ticket',
    d:'The Muriu coalition formula works: Kalonzo, Sifuna, Matiang\'i, Gachagua, Babu Owino, Karua and Maraga back one candidate; Oburu\'s ODM stays with Ruto.',
    cfg:presetCfg(['Ruto’s side','United opposition'],[['William Ruto','Oburu Odinga'],['Kalonzo Musyoka','Edwin Sifuna',"Fred Matiang'i",'Babu Owino','Rigathi Gachagua','Martha Karua','David Maraga']]),p:{tf:0,si:0,so:0,ys:4,rt:{...RT_ZERO}}},
  {id:'s3',tier:'Three-way race',c:'#1b7a4a',t:'Linda Mwananchi runs its own ticket',
    d:'Sifuna, Babu Owino and Orengo form a third team; Kalonzo, Matiang\'i, Gachagua and Karua stay together; ODM stays with Ruto.',
    cfg:presetCfg(['Ruto’s side','United opposition','Linda Mwananchi'],[['William Ruto','Oburu Odinga'],['Kalonzo Musyoka',"Fred Matiang'i",'Rigathi Gachagua','Martha Karua'],['Edwin Sifuna','Babu Owino','James Orengo']]),p:{tf:0,si:0,so:0,ys:0,rt:{...RT_ZERO}}},
  {id:'s4',tier:'Fragmented field',c:'#b83232',t:'Talks fail: Kalonzo–Matiang\'i ticket, everyone else solo',
    d:'No single flagbearer: Kalonzo and Matiang\'i pair up, while Sifuna, Gachagua and Babu Owino all run separately.',
    cfg:presetCfg(['Ruto’s side','Kalonzo–Matiang\'i'],[['William Ruto'],['Kalonzo Musyoka',"Fred Matiang'i"]]),p:{tf:0,si:0,so:0,ys:0,rt:{...RT_ZERO}}}
];
// Default assumptions. RAW integers: engine divides by 100.
// yg: how many points less young voters back team A than older voters. Infotrak
// (22–26 Jun 2026, n=3,000): Sifuna leads 18–26-year-olds at 20% while Ruto polls
// 32% overall, so Ruto is below 20% among the youngest voters. 10 points is a
// cautious reading for the wider youth group.
const DEFAULTS={tf:0,si:0,so:0,ys:0,yg:10,ub:0,uo:0,ua:0,pollBias:false,registerMode:'current',pollMode:'validated',reg:{uda:true},rt:{...RT_DEFAULT}};
// Coalition display lists (Article 138 tab)
const FK=['Bungoma','Kakamega','Vihiga','Busia','Trans Nzoia'];
const OLG=['Mombasa','Kilifi','Kwale','Lamu','Tana River'];
const MC_MODES={preview:400,standard:1000,research:5000};
let ITERS;
const CTY_N=24;

// ═══ STATE — all raw integers, engine divides ═══
const S={
  tf:DEFAULTS.tf,si:DEFAULTS.si,so:DEFAULTS.so,ys:DEFAULTS.ys,yg:DEFAULTS.yg,ub:DEFAULTS.ub,uo:DEFAULTS.uo,ua:DEFAULTS.ua,pollBias:DEFAULTS.pollBias,registerMode:DEFAULTS.registerMode,pollMode:DEFAULTS.pollMode,  // RAW pp; engine does /100
  reg:{...DEFAULTS.reg},rt:{...DEFAULTS.rt},
  cfg:defaultCfg(),
  selCty:'Nairobi City',
  shocks:[],shLog:[],timer:30,live:false,
  res:null,wards:null,sens:null,tip:null,mc:null,
  seed:'2027-baseline-001',mcMode:'research',viewMode:pref('vw-view','public'),theme:pref('vw-theme','light')
};
ITERS=MC_MODES[S.mcMode];
// Remembered per-viewer display preferences (wording and theme)
function pref(k,d){try{return localStorage.getItem(k)||d;}catch(e){return d;}}
function savePref(k,v){try{localStorage.setItem(k,v);}catch(e){}}

// ═══ UTILS ═══
const N=new Intl.NumberFormat('en-KE');
// Never rounds a value across the 25% or 50% line (js/article138.js)
const pct=(x,d=1)=>A138.safePct(x,d);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

let RNG_SOURCE=null;
function seedHash(str){let h=2166136261>>>0;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
// Every random draw is reproducible. Monte Carlo draw i uses its own stream, keyed by the
// seed and the draw index only (drawStream), in every simulation depth: the same seed gives
// the same numbers, and two scenarios run with the same seed share their random draws
// (common random numbers), so the difference between them is not Monte Carlo noise.
// Outside a draw, randomness falls back to a fixed seeded stream, never Math.random.
const drawStream=(seed,i)=>mulberry32(seedHash(`${seed}|draw|${i}`));
let RNG_FALLBACK=mulberry32(seedHash('votewatch|fallback'));
function randUnit(){return RNG_SOURCE?RNG_SOURCE():RNG_FALLBACK();}
// Approximate standard normal (mean 0, sd 1): sum of 4 uniforms has variance 1/3,
// so centre and scale by √3. (Was ÷2, giving sd ≈0.29 and far too narrow a spread.)
const rng=()=>(randUnit()+randUnit()+randUnit()+randUnit()-2)*1.7320508075688772;
// ── Poll-error calibration (data/history.js) ──
// Final validated polls missed the Kenyatta/Ruto side's two-way share by +3.9 (2013),
// +3.8 (2017) and +4.6 (2022) points. The simulation's national error is set so the
// two-way share of team A varies by that RMS (POLL_ERR.rms, 4.1 points) across runs,
// split equally between a uniform national swing and the undecided break (which is
// larger where more voters are undecided). ERR_SCALE converts the target into the
// model's units once team errors and regional noise are included; it was fitted by
// scripts/calibrate-error.mjs and the validator checks the result stays within 15%.
let ERR_SCALE=0.59,NAT_SWING_SD=0,UB_SD=0;
// County-level error (two-way points), on top of the national and regional error. Set by
// the 2022 back-test (scripts/backtest-2022.mjs): the smallest value at which 80% of
// counties fell inside their 80% range with the full model (regional poll layer + bias
// correction). Before this, county ranges held in only about half of counties.
const COUNTY_SD=typeof BACKTEST!=='undefined'&&BACKTEST.calibration?BACKTEST.calibration.countySD:0;
function setErrorScale(k){ERR_SCALE=k;NAT_SWING_SD=k*POLL_ERR.rms/100/Math.SQRT2;UB_SD=NAT_SWING_SD/UNDECIDED.national;}
setErrorScale(ERR_SCALE);

const qntl=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p;const b=Math.floor(i);return s[b+1]!==undefined?s[b]+(i-b)*(s[b+1]-s[b]):s[b];};
const dbnc=(fn,ms=150)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
const $=(s)=>document.querySelector(s);
const $$=(s)=>document.querySelectorAll(s);
function csvE(v){var s=String(v==null?'':v);return/[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function iCol(s){return s<0.25?'var(--c-red)':s<0.40?'var(--c-amber)':s<0.55?'var(--accent)':'var(--c-green)';}

// ═══ SIMULATION ENGINE ═══
// Per-ward constants that never change between runs. Computed once so the
// Monte Carlo loop does lookups instead of rebuilding tables per ward.
const CLUSTERS=['Western & Nairobi','Mt Kenya','Coast','Eastern','Rift & North','Nyanza'];
const RV_UDA=['Nandi','Kericho','Bomet','Baringo','Elgeyo/Marakwet','Uasin Gishu','West Pokot'];
const DQ_SIG={high:0.015,medium:0.028,low:0.044,imputed:0.058},DN_MUL={high:0.8,medium:1.0,low:1.4},VL_MUL={low:0.8,medium:1.0,high:1.25};
const CO_IDX=new Map(CO.map((c,i)=>[c.name,i]));
const WK=WARDS.map(w=>({
  ci:CO_IDX.has(w.county)?CO_IDX.get(w.county):-1,
  rv:RV_UDA.includes(w.county),
  sig:(DQ_SIG[w.dq]||0.034)*(DN_MUL[w.dn]||1.0)*(VL_MUL[w.vl]||1.0),
  toSig:TO_SIG[w.cl]||0.038
}));

// ═══ CANDIDATE FIELD ═══
// Each candidate's share in every ward, fitted once by iterative proportional
// fitting so that (1) every ward's shares sum to 1 and (2) each candidate's
// national share matches their polling average (decided voters). The starting
// pattern is the candidate's regional profile x home-county boost x the ward's
// 2022 lean (Ruto-leaning wards for 'bi' candidates, Raila-leaning for 'bo').
// Home-county boost: tempered from 1.5 (untested) to 1.25, because the regional
// strength in data/context.js already carries most of a candidate's home pull.
const HOME_BOOST=1.25;
function buildCand(){
  const nW=WARDS.length,nC=CANDIDATES.length;
  const wt=WARDS.map(w=>w.voters*w.toBase);
  // The level for each county group comes from the candidate's group strength
  // (data/context.js); 2022 results, softened by a square root, spread it across
  // the counties and wards inside the group.
  const mean={bi:{},bo:{}};
  const sums={};WARDS.forEach((w,i)=>{const k=GROUP_OF[w.county]||w.county;const s=sums[k]||(sums[k]={s:0,b:0,o:0});s.s+=wt[i];s.b+=wt[i]*w.bi;s.o+=wt[i]*w.bo;});
  Object.entries(sums).forEach(([k,s])=>{mean.bi[k]=s.b/(s.s||1);mean.bo[k]=s.o/(s.s||1);});
  const tot=CANDIDATES.reduce((a,c)=>a+c.avg,0);
  const target=CANDIDATES.map(c=>c.avg/tot);
  const M=CANDIDATES.map(c=>{
    const home=new Set(c.home);
    return Float64Array.from(WARDS,w=>{
      const lean=Math.sqrt(Math.max(0.05,(w[c.lean]||0)/(mean[c.lean][GROUP_OF[w.county]||w.county]||1)));
      const g=c.g[GROUP_OF[w.county]]??c.g.rest??0.5;
      return (c.avg/tot)*g*lean*(home.has(w.county)?HOME_BOOST:1);
    });
  });
  const W=wt.reduce((a,b)=>a+b,0);
  for(let it=0;it<40;it++){
    for(let i=0;i<nW;i++){let s=0;for(let c=0;c<nC;c++)s+=M[c][i];if(s>0)for(let c=0;c<nC;c++)M[c][i]/=s;}
    if(it===39)break;
    for(let c=0;c<nC;c++){let s=0;for(let i=0;i<nW;i++)s+=M[c][i]*wt[i];const f=target[c]*W/(s||1);for(let i=0;i<nW;i++)M[c][i]*=f;}
  }
  // relative standard error of each candidate's level (95% margin / 1.96)
  const rse=CANDIDATES.map(c=>Math.min(1,(c.me/1.96)/Math.max(c.poll??c.pollAll,0.5)));
  return {names:CANDIDATES.map(c=>c.name),share:M,target,rse};
}
let CAND=null;
// county group of every ward, for the transfer priors
const WG=WARDS.map(w=>GROUP_OF[w.county]||null);
// Apply the register scenario and poll universe: ward voters, county registers,
// weights, the fitted candidate field. Called at start and when either changes.
function applyModelBase(){
  const rm=S.registerMode||'current',pm=S.pollMode||'validated';
  const sc=new Map(CO.map(c=>[c.name,c.registered2022?countyRegister(c,rm)/c.registered2022:1]));
  // each county's scenario total is shared over its wards by 2022 register, with
  // largest-remainder rounding so ward totals reconcile exactly to the county figure
  CO.forEach(c=>{
    const tot=countyRegister(c,rm),ws=WBC.get(c.name)||[];c.projectedVoters2027=tot;
    const f=sc.get(c.name)||1,raw=ws.map(w=>w.v22*f);let left=tot;
    ws.forEach((w,i)=>{w.voters=Math.floor(raw[i]);left-=w.voters;});
    ws.map((w,i)=>[raw[i]-Math.floor(raw[i]),i]).sort((a,b)=>b[0]-a[0]).slice(0,Math.max(0,left)).forEach(([,i])=>ws[i].voters++);
  });
  REG_TOTAL=CO.reduce((a,c)=>a+c.projectedVoters2027,0);
  // undecided share per ward: published regional rates; the other regions share one
  // rate that keeps the register-weighted national average at UNDECIDED.national
  let wPub=0,uPub=0;WARDS.forEach(w=>{const r=UNDECIDED.regions[GROUP_OF[w.county]];if(r!=null){wPub+=w.voters;uPub+=w.voters*r;}});
  const uRest=(UNDECIDED.national*REG_TOTAL-uPub)/Math.max(1,REG_TOTAL-wPub);
  WU=WARDS.map(w=>UNDECIDED.regions[GROUP_OF[w.county]]??uRest);
  CANDIDATES.forEach(c=>{c.avg=pm==='all'?c.avgAll:c.avgVal;});
  WT=WARDS.map(w=>w.voters*w.toBase);WT_SUM=WT.reduce((a,b)=>a+b,0);
  CAND=buildCand();
  if(typeof _cfgCache!=='undefined')_cfgCache.clear();
}
// Share of each candidate's poll error that is their own (the rest is the common
// national swing already drawn in sim()).
const CAND_ERR=0.5;

// Turn a team configuration into contestants and per-ward baseline shares.
//   A = team 0 (Ruto's side) → 'inc' slot · B = team 1 → 'opp' slot
//   other teams and solo candidates → 'others', tracked individually
// Multi-member teams keep `follow`% of their members' support; the rest scatters
// across the field (ward shares are renormalised).
const _cfgCache=new Map();
applyModelBase();
function fieldFor(cfg){
  const key=(S.pollMode||'validated')+'|'+(S.registerMode||'current')+'|'+JSON.stringify(cfg);
  let f=_cfgCache.get(key);if(f)return f;
  if(_cfgCache.size>16)_cfgCache.clear();
  const follow=(cfg.follow??85)/100,offF=(cfg.offFollow??LEAK_DEFAULT.off)/100;
  // the sidebar sliders scale each candidate's priors (TRANSFER_PRIORS) instead of
  // imposing one split on every electorate
  const lk=cfg.leak||LEAK_DEFAULT.leak,LD=LEAK_DEFAULT.leak,offScale=offF/(LEAK_DEFAULT.off/100);
  const lsH=lk.home/LD.home,lsC=lk.cross/LD.cross,lsE=lk.else/LD.else;
  const groups=cfg.teams.map((name,i)=>({key:i===0?'inc':i===1?'opp':'t'+i,name,members:[],ti:i}));
  const solos=[];
  CAND.names.forEach((n,ci)=>{const t=cfg.assign[n];if(t>=0&&t<groups.length)groups[t].members.push(ci);else solos.push({key:'s'+ci,name:n,members:[ci],ti:-1});});
  const all=[...groups,...solos].filter(g=>g.members.length||g.key==='inc'||g.key==='opp');
  const nW=WARDS.length;
  const A=all.find(g=>g.key==='inc'),B=all.find(g=>g.key==='opp');
  const rivalOf=g=>g===A?(B&&B.members.length?B:null):(A&&A.members.length?A:null);
  all.forEach(g=>{g.base=new Float64Array(nW);g.cross=new Float64Array(nW);g.leakE=null;g.rival=rivalOf(g);
    g.ticket=g.ti>=0&&g.members.length>1?ticketOf(cfg,g.ti):null;});
  const away=new Float64Array(nW);
  // each side's raw strength in every ward vs nationally (before anyone leaks): the
  // cross-over rate rises where the side being crossed to is locally strong
  all.forEach(g=>{g.raw=new Float64Array(nW);let s=0;
    g.members.forEach(ci=>{const sh=CAND.share[ci];for(let i=0;i<nW;i++)g.raw[i]+=sh[i];});
    for(let i=0;i<nW;i++)s+=g.raw[i]*WT[i];g.rawNat=s/(WT_SUM||1);});
  // pass 1: kept support, stay-home and cross-over flows
  all.forEach(g=>{
    g.members.forEach(ci=>{
      const nm=CAND.names[ci],tk=g.ticket,sh=CAND.share[ci];
      const role=!tk||nm===tk.p?'p':(nm===tk.r||nm===tk.ally)?'r':'o';
      if(role==='p'){for(let i=0;i<nW;i++)g.base[i]+=sh[i];return;}
      // a defector to Ruto's side brings at most the local off-ticket share of their voters
      const isDef=g.ti===0&&cfg.defectors&&cfg.defectors.includes(nm);
      if(!g.leakE)g.leakE=new Float64Array(nW);
      const R=g.rival;
      for(let i=0;i<nW;i++){
        // candidate x county-group prior; running mates keep the follow-through slider
        const pr=transferPrior(nm,WG[i]);
        let keep=role==='r'?follow:clamp(pr.keep*offScale,0.15,0.95);
        if(isDef)keep=Math.min(keep,clamp(pr.keep*offScale,0.15,0.90));
        const l=sh[i]*(1-keep);g.base[i]+=sh[i]*keep;
        const rh=pr.stay*lsH,rc=pr.cross*lsC,re=pr.else*lsE,lt=(rh+rc+re)||1,pH=rh/lt;
        // crossing also rises where the other side is locally strong (its 2022-based field)
        const pC=R?Math.min(1-pH,(rc/lt)*clamp(Math.sqrt(R.raw[i]/(R.rawNat||1)),0.5,1.6)):rc/lt;
        const pE=Math.max(0,1-pH-pC);
        away[i]+=l*pH;
        if(R){R.base[i]+=l*pC;R.cross[i]+=l*pC;g.leakE[i]+=l*pE;}
        else g.leakE[i]+=l*(pC+pE);
      }
    });
  });
  // pass 2: "elsewhere" goes to everyone outside the team and its rival, in proportion to their support
  all.forEach(g=>{
    if(!g.leakE)return;
    const rec=all.filter(x=>x!==g&&x!==g.rival&&x.members.length);
    for(let i=0;i<nW;i++){
      const l=g.leakE[i];if(!l)continue;
      let tot=0;for(const x of rec)tot+=x.base[i];
      if(tot>0)for(const x of rec)x.base[i]+=l*x.base[i]/tot;
      else if(g.rival)g.rival.base[i]+=l;else away[i]+=l;
    }
    g.leakE=null;
  });
  // shares among those who still vote; 'away' = share of would-be voters who stay home
  for(let i=0;i<nW;i++){let s=0;for(const g of all)s+=g.base[i];if(s>0)for(const g of all){g.base[i]/=s;g.cross[i]/=s;}away[i]=Math.min(0.6,away[i]/((s+away[i])||1));}
  const others=all.filter(g=>g!==A&&g!==B&&g.members.length);
  const oBase=new Float64Array(nW);
  for(let i=0;i<nW;i++){let s=0;for(const g of others)s+=g.base[i];oBase[i]=s;}
  // each other contestant's fraction of the "others" pool in each ward
  others.forEach(g=>{g.frac=new Float64Array(nW);for(let i=0;i<nW;i++)g.frac[i]=oBase[i]>0?g.base[i]/oBase[i]:0;});
  // running-mate pull for team A (a pick from outside the polls), as a ward-level swing
  // each contestant's relative poll error (members' errors, independent)
  const memW=(g,ci)=>{const nm=CAND.names[ci],tk=g.ticket;return CAND.target[ci]*(!tk||nm===tk.p?1:(nm===tk.r||nm===tk.ally)?follow:offF);};
  const errOf=gs=>{let w=0,v=0;gs.forEach(g=>g.members.forEach(ci=>{const x=memW(g,ci);w+=x;v+=(x*CAND.rse[ci])**2;}));
    return w?CAND_ERR*Math.sqrt(v)/w:0;};
  all.forEach(g=>{g.sd=errOf([g]);g.raw=null;});
  const oSd=errOf(others);
  const pk=ticketOf(cfg,0).pick,rmBoost=new Float64Array(nW);
  if(pk)for(let i=0;i<nW;i++){const c=WARDS[i].county;rmBoost[i]=((pk.g[GROUP_OF[c]]||0)+((pk.home||{})[c]||0))/100;}
  f={A,B,others,oBase,oSd,away,rmBoost,key};
  _cfgCache.set(key,f);
  return f;
}
function memberLabel(g){return g.members.map(ci=>CAND.names[ci].split(' ').slice(-1)[0]).join(' + ');}

// params: raw slider overrides (tf/si/so/ys), `reg` switch overrides, `cfg` team override
function sim(params={},noise=false,shocks=true,capWards=false){
  const tf  =(params.tf  !==undefined?params.tf  :S.tf )  /100;
  const si  =(params.si  !==undefined?params.si  :S.si )  /100;
  const so  =(params.so  !==undefined?params.so  :S.so )  /100;
  const ys  =(params.ys  !==undefined?params.ys  :S.ys )  /100;
  const yg  =(params.yg  !==undefined?params.yg  :(S.yg??DEFAULTS.yg))/100;
  const ub  =(params.ub  !==undefined?params.ub  :(S.ub??0))/100;
  const uo  =(params.uo  !==undefined?params.uo  :(S.uo??0))/100;
  const ua  =(params.ua  !==undefined?params.ua  :(S.ua??0))/100;
  const pBias=(params.pollBias!==undefined?params.pollBias:S.pollBias)?POLL_ERR.mean/100:0;
  // rejected-ballot sensitivity: multiplier on each county's 2022 rejection rate (default 1)
  const rejX=params.rejX!==undefined?params.rejX:(S.rejX??1);
  const reg={...S.reg,...(params.reg||{})};
  const rt=params.rt||S.rt||RT_ZERO;
  // county → turnout factor from the regional sliders
  const rtc={};RT_REGIONS.forEach(r=>{const f=1+(rt[r.k]||0)/100;r.g.forEach(g=>(COUNTY_GROUP[g]||[]).forEach(n=>rtc[n]=f));});
  const F=fieldFor(params.cfg||S.cfg);
  const nO=F.others.length;

  // A national swing is drawn first and applied to every ward, so polling-style
  // error is correlated nationally instead of averaging away across wards.
  // Cluster noise: drawn in fixed CLUSTERS order so seeded runs stay reproducible.
  const natSwing=noise?rng()*NAT_SWING_SD:0;
  const clNoise={};
  CLUSTERS.forEach(cl=>clNoise[cl]=noise?rng()*0.036:0);
  // how many disappointed supporters actually cross over varies by ±25% between runs
  const lkN=noise?rng()*0.25:0;
  // each contestant's own poll error (team A, team B, everyone else), on top of the national swing
  const mA=noise?1+rng()*F.A.sd:1,mB=noise&&F.B?1+rng()*F.B.sd:1,mO=noise?1+rng()*F.oSd:1;
  // how the undecided break, shared nationally in a run (share of the undecided pool moving from B to A)
  const ubShock=noise?rng()*UB_SD:0;
  // county shocks, one per county per run (two-way share)
  const cShock=noise&&COUNTY_SD?CO.map(()=>rng()*COUNTY_SD/100):null;

  const agg=CO.map(c=>({
    name:c.name,cluster:c.cluster,pop:c.projectedVoters2027,
    dq:c.dataQuality,vl:c.volatility,yr:c.youthRatio,
    tv:0,iv:0,ov:0,tfv:0,ts:0,wc:0,cv:0,jv:0,oc:new Float64Array(nO)
  }));
  // Active shocks; cluster shocks are defined with `cl`, older ones with `cluster`
  const shockList=shocks?S.shocks.map(sh=>({sh,cl:sh.cluster||sh.cl})):[];
  const hasB=F.B&&F.B.members.length>0;

  const wardRes=[];
  for(let wi=0;wi<WARDS.length;wi++){
    const w=WARDS[wi],k=WK[wi];
    let csi=0;
    if(!reg.uda&&k.rv)csi-=0.03;

    // Shock effects
    let ssh=0,stf=0,sto=0;
    for(const {sh,cl} of shockList){
      const ok=(sh.county&&sh.county===w.county)||(cl&&cl===w.cl);
      if(ok){ssh+=(sh.si||0)*sh.eff;stf+=(sh.tf||0)*sh.eff;sto+=(sh.to||0)*sh.eff;}
      if(sh.spill&&sh.spill[w.county])ssh+=sh.spill[w.county]*sh.eff;
    }

    // Ward data quality noise
    const ns=noise?rng()*k.sig:0;
    const tn=noise?rng()*k.toSig:0;

    // Team A vs team B vs everyone else, from the fitted candidate field
    let inc=F.A.base[wi]*mA+F.A.cross[wi]*lkN+F.rmBoost[wi]+si+clNoise[w.cl]+ssh+csi+ns+natSwing;
    let opp=hasB?F.B.base[wi]*mB+F.B.cross[wi]*lkN+so-clNoise[w.cl]*0.5-ns*0.4-natSwing:0;
    let tf_=F.oBase[wi]*mO+tf+stf;
    // Youth preference: polls already include young voters, so only a change in
    // youth turnout moves the vote. Young voters back team A by `yg` points less
    // than older voters; a bigger youth share among voters shifts that much away from A.
    if(ys&&yg){
      const y=w.yr||0.42,t=w.toBase,y2=y*(t+ys)/Math.max(0.05,t+y*ys),sh_=yg*(y2-y);
      const ob=Math.max(opp,0)+Math.max(tf_,0)||1;
      inc-=sh_;opp+=sh_*Math.max(opp,0)/ob;tf_+=sh_*Math.max(tf_,0)/ob;
    }
    // Undecided voters: polls are shares of decided voters, so by default the
    // undecided split like everyone else. The slider (and, in simulations, a shared
    // shock) moves part of the undecided pool from team B to team A; the effect is
    // proportional to how many voters in the ward are undecided.
    if(hasB&&(ub||ubShock)){const du=WU[wi]*(ub+ubShock);inc+=du;opp-=du;}
    // Optional undecided-to-others sensitivity. Positive values move that share of
    // the undecided pool from the two main sides to other contestants; negative
    // values move it back, split between A/B in proportion to their local support.
    // Default is zero because no published poll measures this transfer directly.
    if(uo){
      const du=WU[wi]*uo,main=Math.max(inc,0)+Math.max(opp,0);
      if(du>0&&main>0){const take=Math.min(du,main*0.95);inc-=take*Math.max(inc,0)/main;opp-=take*Math.max(opp,0)/main;tf_+=take;}
      else if(du<0&&Math.max(tf_,0)>0){const give=Math.min(-du,Math.max(tf_,0)*0.95),den=main||1;tf_-=give;inc+=give*Math.max(inc,0)/den;opp+=give*Math.max(opp,0)/den;}
    }
    // Optional poll-bias correction: move team A's two-way share by the historical
    // average miss of the final polls (POLL_ERR.mean, +4.1 points).
    if(hasB&&pBias){const s2=Math.max(inc,0)+Math.max(opp,0);inc+=pBias*s2;opp-=pBias*s2;}
    if(hasB&&cShock&&k.ci>=0){const s2=Math.max(inc,0)+Math.max(opp,0);inc+=cShock[k.ci]*s2;opp-=cShock[k.ci]*s2;}

    // Normalize
    const tot=Math.max(inc,0)+Math.max(opp,0)+Math.max(tf_,0)||1;
    const si_=Math.max(inc,0)/tot,so_=Math.max(opp,0)/tot,st_=Math.max(tf_,0)/tot;

    const uTurn=1+WU[wi]*ua;
    const to=clamp((w.toBase+(w.yr||0.42)*ys+sto)*(rtc[w.county]||1)*(1-F.away[wi])*uTurn+tn,0.2,0.87);
    // ballots cast, minus rejected ballots = valid votes, which every share is of
    const cast=w.voters*to,vs=cast*(1-clamp((REJ_RATE[w.county]||0)*rejX,0,0.5));
    const a=k.ci>=0?agg[k.ci]:null;
    if(a){
      a.cv+=cast;a.jv+=cast-vs;a.tv+=vs;a.iv+=vs*si_;a.ov+=vs*so_;a.tfv+=vs*st_;a.ts+=to;a.wc++;
      for(let o=0;o<nO;o++)a.oc[o]+=vs*st_*F.others[o].frac[wi];
    }
    if(capWards)wardRes.push({county:w.county,constituency:w.constituency,ward:w.ward,
      voters:w.voters,to,inc:si_,opp:so_,tf:st_,dq:w.dq,vl:w.vl,cl:w.cl});
  }

  const ctyRes=agg.map(c=>{
    const tv=c.tv||1,i=c.iv/tv,o=c.ov/tv,t=c.tfv/tv;
    return{...c,to:c.ts/(c.wc||1),i,o,t,
      ia:i>=0.25,oa:o>=0.25,ta:t>=0.25,
      lead:i>=o&&i>=t?'inc':o>=t?'opp':'tf',
      ls:Math.max(i,o,t)};
  });

  const tot=ctyRes.reduce((a,c)=>({v:a.v+c.tv,i:a.i+c.iv,o:a.o+c.ov,t:a.t+c.tfv,cast:a.cast+c.cv,rej:a.rej+c.jv}),{v:0,i:0,o:0,t:0,cast:0,rej:0});
  const V=tot.v||1;
  // every other contestant's national share, largest first (idx = position in F.others)
  const others=F.others.map((g,o)=>({idx:o,key:g.key,name:g.name,members:g.members,share:ctyRes.reduce((s,c)=>s+c.oc[o],0)/V}))
    .sort((x,y)=>y.share-x.share);
  // v = valid votes in the counties; ooc = valid votes cast outside any county, split in
  // proportion to the national result so shares are unchanged; valid = the Art. 138 denominator
  const ooc=tot.v*OOC_SHARE;
  const nat={i:tot.i/V,o:tot.o/V,t:tot.t/V,v:tot.v,ooc,valid:tot.v+ooc,cast:tot.cast+ooc,rejected:tot.rej,others,
    A:{name:F.A.name,members:F.A.members},B:F.B?{name:F.B.name,members:F.B.members}:null};
  return{ctyRes,nat,wardRes};
}

// Monte Carlo as a resumable stepper. Each draw has its own seeded stream, so running
// it in chunks (with other work in between) gives exactly the same result as running
// it in one go, in every simulation depth.
function mcCore(params,n){
  // i = draws attempted, ok = draws that completed; failures are counted and reported
  let i=0,ok=0,failed=0,lastErr='',iW=0,oW=0,ro=0,iJ=0,oJ=0,degenerate=0,r2Tie=0;
  const iA=[],oA=[],tA=[],r2Turn=[],pairs={},r2Win={},xW={};
  const nC=CO.length,cI=Array.from({length:nC},()=>new Float32Array(n)),cO=Array.from({length:nC},()=>new Float32Array(n)),c25=new Uint32Array(nC);
  const mode=S.mcMode,seed=S.seed;
  return {
    step(k){
      const prevRng=RNG_SOURCE;
      try{
        for(const end=Math.min(n,i+k);i<end;i++){
          RNG_SOURCE=drawStream(seed,i);
          try{
            const r=sim(params,true,true,false);
            // Art. 138(4) on integer valid-vote tallies, for every contestant (js/article138.js)
            const g=A138.fromSim(r.ctyRes,r.nat,OOC_SHARE);
            if(g.degenerate)degenerate++;
            const el=g.elected[0]||null;
            if(el==='inc')iW++;else if(el==='opp')oW++;else if(el)xW[el]=(xW[el]||0)+1;else{
              ro++;
              // which two finish top in this draw, and who wins round two: everyone
              // else follows their candidates' loyalties, with a national shift each run
              const r2=r2sim(r.ctyRes,r.nat,'aff',true);
              const key=[r2.a,r2.b].sort().join('|');
              pairs[key]=(pairs[key]||0)+1;
              if(r2.winner)r2Win[r2.winner]=(r2Win[r2.winner]||0)+1;else r2Tie++;
              r2Turn.push(r2.turnoutRatio);
            }
            if(el==='inc')iJ++;if(el==='opp')oJ++;
            iA.push(r.nat.i);oA.push(r.nat.o);tA.push(r.nat.t);
            r.ctyRes.forEach((c,j)=>{cI[j][ok]=c.i;cO[j][ok]=c.o;if(g.countyStatus[c.name].inc==='pass')c25[j]++;});
            ok++;
          }catch(e){failed++;lastErr=String(e&&e.message||e);}
        }
      }finally{RNG_SOURCE=prevRng;}
      return i>=n;
    },
    result(){
      // pairs / r2Win are shares of the run-off draws only
      const norm=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,ro?v/ro:0]));
      const d=ok||1;
      return{iW:iW/d,oW:oW/d,ro:ro/d,iJ:iJ/d,oJ:oJ/d,xW:Object.fromEntries(Object.entries(xW).map(([k,v])=>[k,v/d])),pairs:norm(pairs),r2Win:norm(r2Win),r2Tie:ro?r2Tie/ro:0,degenerate,failed,lastErr,r2TurnLo:r2Turn.length?qntl(r2Turn,.1):null,r2TurnMed:r2Turn.length?qntl(r2Turn,.5):null,r2TurnHi:r2Turn.length?qntl(r2Turn,.9):null,
        iMed:qntl(iA,.5),oMed:qntl(oA,.5),tMed:qntl(tA,.5),
        iLo:qntl(iA,.1),iHi:qntl(iA,.9),oLo:qntl(oA,.1),oHi:qntl(oA,.9),
        // per county: 80% range of each main side's share, and how often A clears 25%
        cty:Object.fromEntries(CO.map((c,j)=>{const a=Array.from(cI[j].subarray(0,ok)),b=Array.from(cO[j].subarray(0,ok));
          return[c.name,{iLo:qntl(a,.1),iHi:qntl(a,.9),oLo:qntl(b,.1),oHi:qntl(b,.9),p25:ok?c25[j]/ok:0}];})),
        iterations:n,mode,seed};
    }
  };
}
// Spread of team A's first-round share across the preset line-ups: political
// (structural) uncertainty, not a probability interval.
function structuralSummary(){
  const vals=SCENS.map(sc=>{const r=sim({...sc.p,cfg:sc.cfg},false,false,false);return{id:sc.id,title:sc.t,i:r.nat.i,o:r.nat.o,t:r.nat.t};});
  const inc=vals.map(x=>x.i),opp=vals.map(x=>x.o);
  return{values:vals,iLo:Math.min(...inc),iHi:Math.max(...inc),oLo:Math.min(...opp),oHi:Math.max(...opp)};
}
function mc(params={},n=ITERS){const m=mcCore(params,n);m.step(n);return m.result();}
// Large runs: show a quick 400-run estimate now, finish the full run in
// ~100-run slices between frames, then redraw. A newer render cancels older jobs.
const MC_QUICK=400,MC_SLICE=100;
function mcProgressive(onDone){
  const job=(S.mcJob=(S.mcJob||0)+1),m=mcCore({},ITERS);
  const tick=()=>{if(job!==S.mcJob)return;
    if(m.step(MC_SLICE)){S.mcPending=false;onDone(m.result());}else setTimeout(tick,0);};
  setTimeout(tick,0);
}

// Display name for a contestant key: 'inc' (team A), 'opp' (team B), or an
// "others" key ('t2','t3' for teams C/D, 's<n>' for a solo candidate).
function blocName(k,nat=S.res&&S.res.nat){
  const cfg=S.cfg;
  if(k==null)return 'Exact tie (not resolved by Art. 138(7))';
  if(k==='inc')return cfg.teams[0]||'Team A';
  if(k==='opp')return cfg.teams[1]||'Team B';
  if(k==='tf')return 'Others';
  const o=nat&&nat.others&&nat.others.find(x=>x.key===k);
  return o?o.name:'Others';
}
// The biggest single contestant outside teams A and B
function topOther(nat){return nat.others&&nat.others[0]||null;}
// badge class for a side: team hues identify sides (never red/green, which mean state)
function badgeFor(k){return k==='inc'?'b-ta':k==='opp'?'b-tb':k==='t2'?'b-tc':k==='t3'?'b-td':'b-to';}
// Art. 138(5): the run-off is between the two candidates with the most votes in
// round one: team A, team B, or the largest other team/solo candidate.
function r2pair(nat){
  const x=topOther(nat);
  const c=[['inc',nat.i],['opp',nat.B&&nat.B.members.length?nat.o:-1]];
  if(x)c.push([x.key,x.share]);
  const order=c.sort((p,q)=>q[1]-p[1]).map(p=>p[0]);
  return{a:order[0],b:order[1],e:order[2]||'tf'};
}
// Run-off transfers: voters whose candidate is out split 70/30 toward the
// finalist they lean to, or 50/50 with no lean. (Replaces the v5 regional
// table, whose "lean to the opposition" still sent most Mt Kenya votes to Ruto.)
const R2_LEAN=0.70;
// 'aff' (the model): each eliminated contestant's voters split by their members'
// priors (RUNOFF_INC_PRIORS, by county group, weighted by each member's national
// level). In simulations every eliminated contestant gets its own shock (SD R2_SD),
// shared across counties: an endorsement that under-performs does so everywhere.
// Votes not tied to a contestant (the protest-vote slider) split evenly, so the
// round-two total always equals round one's.
const R2_SD=0.15;
// No Kenyan presidential run-off has yet supplied an empirical turnout baseline.
// In deterministic views round-two turnout therefore stays neutral. In Monte Carlo,
// zero-mean remobilisation shocks let finalist and transferred electorates turn out
// differently without pretending a measured directional effect.
const R2_FINALIST_TURNOUT_SD=0.04,R2_TRANSFER_TURNOUT_SD=0.07;
function contestantMembers(k,nat){return k==='inc'?(nat.A?.members||[]):k==='opp'?(nat.B?.members||[]):((nat.others||[]).find(o=>o.key===k)?.members||[]);}
function contestantToA(k,a,b,grp,nat,shock){
  let w=0,x=0;contestantMembers(k,nat).forEach(ci=>{const t=CAND.target[ci]||0;w+=t;x+=t*runoffIncShare(CAND.names[ci],grp);});
  const inc=w?x/w:0.2,mean=a==='inc'?inc:b==='inc'?1-inc:0.5;
  return clamp(mean+shock,0.03,0.97);
}
function leanRate(){return R2_LEAN;}
// dir: 'aff' (model), 'toA' (everyone else leans 70/30 to the leader), 'toB' (to the runner-up), 'spl' (even).
function r2sim(ctyRes,nat,dir='aff',noise=false){
  const {a,b,e}=r2pair(nat);
  const others=nat.others||[];
  const keys=['inc',...(nat.B&&nat.B.members.length?['opp']:[]),...others.map(o=>o.key)];
  const shock=Object.fromEntries(keys.map(k=>[k,noise?rng()*R2_SD:0]));
  const finalistTurn=Object.fromEntries([a,b].map(k=>[k,noise?clamp(1+rng()*R2_FINALIST_TURNOUT_SD,0.85,1.12):1]));
  const transferTurn=Object.fromEntries(keys.map(k=>[k,noise?clamp(1+rng()*R2_TRANSFER_TURNOUT_SD,0.75,1.12):1]));
  const restTurn=noise?clamp(1+rng()*R2_TRANSFER_TURNOUT_SD,0.75,1.12):1;
  const vOf=(c,k)=>k==='inc'?c.iv:k==='opp'?c.ov:(c.oc?c.oc[others.find(o=>o.key===k).idx]:0)||0;
  const fixed=dir==='toA'?R2_LEAN:dir==='toB'?1-R2_LEAN:0.5;
  let aV=0,bV=0;
  const r2cty=ctyRes.map(c=>{
    const grp=GROUP_OF[c.name]||null;
    let ra=vOf(c,a)*finalistTurn[a],rb=vOf(c,b)*finalistTurn[b],oSum=0;
    others.forEach(o=>{oSum+=c.oc?c.oc[o.idx]:0;});
    for(const k of keys){
      if(k===a||k===b)continue;
      const vk=vOf(c,k)*transferTurn[k];if(!vk)continue;
      const p=dir==='aff'?contestantToA(k,a,b,grp,nat,shock[k]):fixed;
      ra+=vk*p;rb+=vk*(1-p);
    }
    const rest=Math.max(0,c.tfv-oSum)*restTurn,pr=dir==='aff'?0.5:fixed;
    ra+=rest*pr;rb+=rest*(1-pr);
    const t=ra+rb||1;aV+=ra;bV+=rb;
    const r2a=ra/t;
    return{...c,r2a,r2lead:r2a>=0.5?a:b};
  });
  const shareA=aV/((aV+bV)||1),r1Votes=ctyRes.reduce((s,c)=>s+c.tv,0);
  // Art. 138(7): most votes wins the run-off; no county-spread test in round two. An exact
  // tie is not resolved by the Constitution, so it is reported (winner null), not assigned.
  const fw=A138.freshElectionWinner(Math.round(aV),Math.round(bV),a,b),winner=fw.winner;
  return{a,b,e,r2cty,shareA,shareB:1-shareA,winner,tie:fw.status==='tie_out_of_model',dir,votesA:aV,votesB:bV,turnoutRatio:(aV+bV)/(r1Votes||1),
    r2iN:a==='inc'?shareA:b==='inc'?1-shareA:null};
}

function ff(nat){
  return{
    tbi:Math.max(0,(nat.i-0.50)+0.005),
    tbo:Math.max(0,(nat.o-0.50)+0.005),
    cur:nat.t,ia:nat.i>0.50,oa:nat.o>0.50,
    forced:nat.i<0.50&&nat.o<0.50
  };
}

function tipPts(ctyRes){
  return ctyRes.map(c=>{
    const ig=0.25-c.i;
    return{name:c.name,cl:c.cluster,i:c.i,o:c.o,t:c.t,ig,
      vn:ig>0?Math.ceil(ig*c.tv):0,tv:c.tv,
      h17:CM.get(c.name)?.hist17??null,
      dq:c.dq,vl:c.vl};
  }).filter(c=>Math.abs(c.ig)<0.08)  // ONLY within ±8pp
   .sort((a,b)=>Math.abs(a.ig)-Math.abs(b.ig));
}

function disRisk(ctyRes){
  const close=ctyRes.filter(c=>Math.abs(c.ls-0.50)<=0.06||Math.abs(c.i-0.25)<=0.04);
  const byC={};close.forEach(c=>{byC[c.cluster]=(byC[c.cluster]||0)+1;});
  const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0]||['—',0];
  const conc=close.length>0?top[1]/close.length:0;
  const ldq=ctyRes.filter(c=>c.dq==='low').length;
  const margs=close.map(c=>Math.abs(c.ls-0.5)).sort((a,b)=>a-b);
  const minM=margs.length?margs[0]:0.15; // a true 0.0 margin must not read as "no close counties"
  // Calibrated components with real dynamic range
  const mScore=Math.max(0,(0.15-minM)/0.15)*35;
  const cScore=Math.min(close.length,8)*4;
  const kScore=conc*18;
  const qScore=Math.min(ldq,10)*1.5;
  return{score:Math.min(100,mScore+cScore+kScore+qScore),close,n:close.length,byC,conc,top:top[0],tc:top[1],minM};
}

// Influence by constituency: size of the register plus how close the county is to
// team A's 25% line; team A's estimate follows the constituency's 2022 pattern.
function sensRows(ctyRes){
  const cm=new Map(ctyRes.map(c=>[c.name,c])),by=new Map();
  WARDS.forEach(w=>{const k=w.county+'|'+w.constituency;const x=by.get(k)||{county:w.county,constituency:w.constituency,voters:0,wards:0,dq:w.dq};x.voters+=w.voters;x.wards++;by.set(k,x);});
  // team A estimate per constituency from the ward results, when they are available
  const cEst=S.wards&&new Map();if(cEst)S.wards.forEach(w=>{const k=w.county+'|'+w.constituency,v=w.voters*w.to,e=cEst.get(k)||{v:0,i:0};e.v+=v;e.i+=v*w.inc;cEst.set(k,e);});
  return [...by.values()].map(x=>{
    const c=cm.get(x.county);if(!c)return null;
    const ig=Math.abs(c.i-0.25);
    const e=cEst&&cEst.get(x.county+'|'+x.constituency);
    return{...x,inf:(x.voters/1e6)*24+(1/(ig+0.03))*4,cis:e?e.i/(e.v||1):c.i};
  }).filter(Boolean).sort((a,b)=>b.inf-a.inf).slice(0,60);
}

function implTxt(res,mc_){
  const{nat,ctyRes}=res;
  // Three consequences, not a recap: the figures themselves are on the cards above.
  const out=[];
  const lead=nat.i>=nat.o?'inc':'opp',L=blocName(lead),short=Math.max(0,0.5-Math.max(nat.i,nat.o));
  if(mc_.ro>0.60)
    out.push(`Nobody reaches 50% plus one, so a run-off is the most likely ending. ${L} would need about ${fmtVotes(short*nat.valid)} more votes to win in round one.`);
  else if(Math.max(mc_.iW,mc_.oW)>0.45)
    out.push(`${blocName(mc_.iW>=mc_.oW?'inc':'opp')} can win in round one, but only if both tests hold: over half the votes and 25% in 24 counties.`);
  else
    out.push(`This is too close to call: small changes in turnout or alliances decide whether there is a run-off.`);

  const lowBy={};ctyRes.forEach(c=>{if(c.i<0.30)lowBy[c.cluster]=(lowBy[c.cluster]||0)+1;});
  const vulnCl=Object.entries(lowBy).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Mt Kenya';
  const vuln=ctyRes.filter(c=>c.cluster===vulnCl&&c.i<0.25);
  out.push(vuln.length
    ?`${blocName('inc')}'s 24-county test is weakest in ${vulnCl}, where it falls short in ${vuln.map(c=>c.name).slice(0,3).join(', ')}${vuln.length>3?' and others':''}.`
    :`${blocName('inc')} clears the 25% line across ${vulnCl}, so the 24-county test is not the obstacle.`);

  const ra=r2sim(ctyRes,nat,'toA'),rb=r2sim(ctyRes,nat,'toB'),E=blocName(ra.e);
  out.push(ra.winner===rb.winner
    ?`If it goes to a run-off, ${blocName(ra.winner)} wins it whichever way ${E}'s and the smaller candidates' voters lean.`
    :`If it goes to a run-off, ${E}'s voters decide it: the side they lean to wins round two.`);
  return out;
}

// ═══ INTEL DATA (updated Oct 2026; see data/context.js for sources) ═══
const LEVERS=[
  {s:'red',t:'United Opposition names one flagbearer',d:'Kalonzo, Gachagua, Matiang\'i and Karua still disagree on how to pick a single candidate.',i:'Put the principals on one team; if someone walks, set them to Solo'},
  {s:'red',t:'Sifuna joins or stays out',d:'Linda Mwananchi endorsed Sifuna in September; its party is due in October.',i:'Sifuna on team B, on his own team, or Solo'},
  {s:'red',t:'Ruto–ODM pact survives the zoning row',d:'ODM wants Nyanza, parts of Western and the Coast zoned for its candidates.',i:'Oburu (and Orengo) on Ruto\'s side or not'},
  {s:'amb',t:'Mt Kenya realignment',d:'Gachagua and Kindiki compete for the region Ruto won in 2022.',i:'Gachagua\'s team choice and the swing sliders'},
  {s:'amb',t:'New-voter registration',d:'IEBC registered 2.94 million new voters by 20 Aug 2026 and plans for about 28.5 million in 2027.',i:'Voter register (Evidence) and youth turnout'},
  {s:'grn',t:'Cost of living and protests',d:'Fuel, tax and Gen-Z protest cycles drive the urban and youth vote.',i:'Swing to team B, protest vote'},
  {s:'grn',t:'New national polls',d:'Candidate averages update when the polling data does.',i:'Teams panel percentages'}
];
const SENTS=[
  {tier:'HIGH',freq:'Wkly',t:'United Opposition talks: flagbearer method and timing',n:'A named single candidate locks in the opposition bloc; a walk-out creates a third force'},
  {tier:'HIGH',freq:'Wkly',t:'Linda Mwananchi party launch and Sifuna\'s coalition moves',n:'Decides whether his vote counts as third force or opposition'},
  {tier:'HIGH',freq:'Wkly',t:'UDA–ODM zoning talks and ODM NDC resolutions',n:'Pact holds → Nyanza/Coast gains for Ruto; collapse reverses them'},
  {tier:'HIGH',freq:'Mthly',t:'National polls (TIFA, Infotrak, Swiss Poll, Mizani, Politrack)',n:'Check methodology disclosure before anchoring'},
  {tier:'MED',freq:'Mthly',t:'Mt Kenya rallies: Gachagua (DCP) vs Kindiki',n:'Adjust the Mt Kenya shift slider'},
  {tier:'MED',freq:'Mthly',t:'Fuel prices, taxes and protest activity',n:'Urban and youth swing'},
  {tier:'MED',freq:'Qtrly',t:'IEBC registration figures',n:'Youth turnout assumption'},
  {tier:'LOW',freq:'Qtrly',t:'Defections between UDA, ODM and opposition parties',n:'Rift Valley and coalition-delivery signals'}
];
const BYES=[
  {n:'Kasarani',co:'Nairobi City',yr:2023,mb:0.462,act:0.441,d:-0.021,note:'Urban vote 2.1pp weaker for the incumbent than the 2022 base'},
  {n:'Kibwezi West',co:'Makueni',yr:2023,mb:0.091,act:0.084,d:-0.007,note:'Ukambani in line with the 2022 base'},
  {n:'Embakasi East',co:'Nairobi City',yr:2024,mb:0.462,act:0.429,d:-0.033,note:'Urban vote 3.3pp weaker for the incumbent'}
];
const ROADMAP=[
  {p:'P1',i:'County-level cuts of 2026 national polls',imp:'Replace the assumed regional transfer rates (Mt Kenya, ODM, Sifuna) with measured ones',src:'TIFA / Infotrak regional tables'},
  {p:'P1',i:'IEBC 2022 Form 34C ward tallies',imp:'Upgrade imputed ward baselines',src:'IEBC / Harvard Dataverse'},
  {p:'P2',i:'KNBS 2019 census ward age breakdown',imp:'Ward-precise youth ratios',src:'Kenya Open Data'},
  {p:'P2',i:'IEBC 2026–27 registration drive results',imp:'Refine 2027 voter projections and youth turnout',src:'IEBC'},
  {p:'P3',i:'Pollster methodology disclosures (Mizani, Politrack)',imp:'Admit held-out polls to the anchor average',src:'kenya-election-intelligence-engine review queue'}
];
const REG_EFF=[
  {sw:"Teams",e:"Each candidate's validated-poll average is spread across wards by home region and 2022 patterns, then added up by team. Teams of two or more keep the follow-through share of their members' support."},
  {sw:"Ruto holds the Rift Valley: off",e:"−3 points for Ruto in Nandi, Kericho, Bomet, Baringo, Elgeyo-Marakwet, Uasin Gishu and West Pokot."},
  {sw:"Run-off",e:"Top two in round one meet again; everyone else's voters follow their candidates' assumed loyalties, which vary between simulations. The Run-off tab also shows a 70/30 lean either way and an even split."}
]


// ═══ HYPOTHETICAL EVENT SANDBOX ═══
// Optional and off by default: the central result never includes these. Each effect
// is a made-up size for testing sensitivity, not a measured impact; events in the
// news are shown in Signals (SALIENT_EVENTS) without vote effects. Spillover uses
// the synthetic road links in data/transport.js.
const SH_DEF=[
  {t:'Ruto rally tour in the Rift Valley',cl:'Rift & North',si:0.018,desc:'Hypothetical +1.8 pts Ruto in Rift Valley'},
  {t:'Gen-Z protest day in Nairobi and Western towns',cl:'Western & Nairobi',si:-0.014,to:-0.010,desc:'Hypothetical −1.4 pts Ruto in Nairobi/Western, lower turnout'},
  {t:'Linda Mwananchi rally (Sifuna)',cl:'Western & Nairobi',tf:0.018,desc:'Hypothetical +1.8 pts third force in Nairobi/Western'},
  {t:'Gachagua–Kalonzo joint Mt Kenya tour',cl:'Mt Kenya',si:-0.016,desc:'Hypothetical −1.6 pts Ruto in Mt Kenya'},
  {t:'Coast projects launch with ODM leaders',cl:'Coast',si:0.014,desc:'Hypothetical +1.4 pts Ruto at the Coast'},
  {t:'Fuel price rise',cl:'Western & Nairobi',si:-0.012,desc:'Hypothetical −1.2 pts Ruto in Nairobi/Western'},
  {t:'County endorsement',rnd:true,si:0.012,desc:'Hypothetical +1.2 pts Ruto in the county'},
  {t:'Service delivery event',rnd:true,si:0.014,desc:'Hypothetical +1.4 pts Ruto in the county'}
];
// Test events are drawn from the seed: the k-th event after a reset is always the same.
function addShock(){
  const u=mulberry32(seedHash(`${S.seed}|shock|${S.shockN=(S.shockN||0)+1}`));
  const b=SH_DEF[Math.floor(u()*SH_DEF.length)];
  const sh={...b,eff:1,rem:2,decay:0.65,spill:{}};
  if(sh.rnd){const c=CO[Math.floor(u()*CO.length)];sh.county=c.name;sh.t=`Endorsement: ${c.name}`;}
  if(sh.county&&TR[sh.county]){for(const cn of TR[sh.county]){const v=(sh.si||0.01)*({A:1.0,B:0.7,C:0.4,rural:0.15}[cn.roadClass]||0.3)*Math.pow(0.85,cn.distanceKm/10);sh.spill[cn.target]=v;}}
  S.shocks.push(sh);
  S.shLog.unshift({ts:new Date().toLocaleTimeString(),e:sh.t,d:sh.desc});
  if(S.shLog.length>8)S.shLog.pop();
}
function decayShocks(){S.shocks.forEach(s=>{s.rem--;s.eff*=s.decay;});S.shocks=S.shocks.filter(s=>s.rem>0);}

// ═══ MASTER RENDER ═══
function renderAll(){
  S.struct=null;
  try{
    const r=sim({},false,true,true);
    S.res=r;S.wards=r.wardRes;
    S.sens=sensRows(r.ctyRes);
    S.tip=tipPts(r.ctyRes);
    const big=ITERS>MC_QUICK*2;
    const mc_=big?mc({},MC_QUICK):mc({},ITERS);
    S.mc=mc_;S.mcPending=big;if(!big)S.mcJob=(S.mcJob||0)+1;
    const dr=disRisk(r.ctyRes);
    const f=ff(r.nat);
    const i25=r.ctyRes.filter(c=>c.i>=0.25).length;

    rHeadline(r,mc_,i25);
    // Only the open tab is drawn now; the others are marked stale and drawn
    // when opened (cuts first render and every slider move).
    S.ctx={r,mc:mc_,dr,f,i25};
    S.dirty=new Set(Object.keys(PANE_RENDER));
    const open=document.querySelector('.tbtn.act')?.dataset.t||'cmd';
    renderPane(open);
    rShockLog();
    if(big)mcProgressive(full=>{
      // swap in the full run and redraw what depends on it
      S.mc=full;S.ctx.mc=full;
      rHeadline(S.ctx.r,full,S.ctx.i25);
      S.dirty=new Set(Object.keys(PANE_RENDER));
      renderPane(document.querySelector('.tbtn.act')?.dataset.t||'cmd');
    });
  }catch(err){
    console.error('renderAll error:',err);
  }
}

const PANE_RENDER={
  cmd:c=>{rKPIs(c.r,c.mc,c.dr,c.f,c.i25);rImpl(c.r,c.mc);rNat(c.r);rTornado(c.r.nat);},
  ro:c=>rRunoff(c.r,c.mc),
  tip:c=>rTipping(c.r,c.f,c.i25),
  mat:()=>rScen(),
  con:c=>{rConst(c.r,c.mc);rSens();},
  map:c=>{rMap(c.r.ctyRes);rWardDrill(c.r.wardRes);},
  dis:c=>rDispute(c.r.ctyRes,c.dr),
  int:()=>rIntel(),
  report:()=>renderExecutiveReport()
};
function renderPane(k){
  const fn=PANE_RENDER[k];if(!fn||!S.ctx)return;
  try{fn(S.ctx);}catch(e){console.error('render '+k,e);}
  if(S.dirty)S.dirty.delete(k);
}
function rKPIs(r,mc_,dr,f,i25){
  const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
  VZ.race($('#raceStrip'),r,mc_,i25,o25);
  $('#kpiRow').innerHTML=`
  <div class="kpi kpi-dots">
    <div class="kpi-l">How the election ends <span class="kpi-hint">100 simulations shown as dots</span></div>
    <div id="kpiDots"></div>
  </div>
  <div class="kpi kpi-dis">
    <div class="kpi-l">Dispute risk <span class="kpi-hint">${Math.round(dr.score)}/100</span></div>
    <div id="kpiMargins"></div>
  </div>`;
  VZ.outcomes($('#kpiDots'),mc_);
  VZ.margins($('#kpiMargins'),r.ctyRes,{w:520,h:84,r:4});
}

function rImpl(r,mc_){
  const lines=implTxt(r,mc_);
  const st=S.struct||(S.struct=structuralSummary());
  const unc=`<p class="hint mt8"><strong>Uncertainty.</strong> With this line-up, ${mapEsc(S.cfg.teams[0])} gets ${pct(mc_.iLo)}–${pct(mc_.iHi)} in 80% of simulations. Across the ${st.values.length} preset line-ups it ranges ${pct(st.iLo)}–${pct(st.iHi)}: that is political uncertainty about who runs together, not a probability.</p>`;
  $('#implBox').innerHTML=`<div class="impl-hdr">What this means</div>
  ${lines.map((l,i)=>`<div class="impl-row"><div class="impl-n">${i+1}</div><div class="impl-txt">${l}</div></div>`).join('')}${unc}`;
}

function rNat(r){
  const n=r.nat,cds={};
  r.ctyRes.forEach(c=>{if(!cds[c.cluster])cds[c.cluster]={iv:0,ov:0,tfv:0,tv:0};const d=cds[c.cluster];d.iv+=c.iv;d.ov+=c.ov;d.tfv+=c.tfv;d.tv+=c.tv;});
  const cls=Object.entries(cds).sort((a,b)=>b[1].tv-a[1].tv);
  // national shares live in the hero ribbon; this table is the regional split, widest margin first
  cls.sort((a,b)=>Math.abs(b[1].iv-b[1].ov)/b[1].tv-Math.abs(a[1].iv-a[1].ov)/a[1].tv);
  $('#natBd').innerHTML=`<div class="tscroll"><table class="tbl"><thead><tr><th>Region</th><th class="r">Votes</th><th class="r">A</th><th class="r">B</th><th class="r">Others</th><th>Split</th></tr></thead>
  <tbody>${cls.map(([cl,d])=>`<tr>
    <td class="u-strong">${cl}</td>
    <td class="r u-mono12 c-muted">${fmtVotes(d.tv)}</td>
    <td class="r c-team-a">${pct(d.iv/d.tv)}</td>
    <td class="r c-team-b">${pct(d.ov/d.tv)}</td>
    <td class="r c-others">${pct(d.tfv/d.tv)}</td>
    <td class="u-minw90"><div class="stk"><div class="si" style="flex:${d.iv/d.tv}"></div><div class="so" style="flex:${d.ov/d.tv}"></div><div class="st" style="flex:${d.tfv/d.tv}"></div></div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function rTornado(nat){
  const base=nat.i;
  // Each bar is a real deterministic re-run of the engine (previously fixed offsets)
  const run=p=>sim(p,false,true,false).nat.i;
  const A=blocName('inc'),B=blocName('opp');
  const cases=[
    {l:'If the protest vote grows 8 points',v:run({tf:S.tf+8})},
    {l:'If 12% more young people vote',v:run({ys:S.ys+12})},
    {l:`If ${B} gains 6 points`,v:run({so:S.so+6})},
    {l:'If only 70% of running mates\' supporters follow',v:run({cfg:{...S.cfg,follow:70}})},
    {l:'If every running mate\'s supporter follows',v:run({cfg:{...S.cfg,follow:100}})},
    {l:`If ${A} gains 6 points`,v:run({si:S.si+6})}
  ].map(c=>({...c,flip:(c.v>=0.5)!==(base>=0.5)}))
   .sort((a,b)=>Math.abs(b.v-base)-Math.abs(a.v-base));
  const rng_=Math.max(...cases.map(c=>Math.abs(c.v-base)))||0.08;
  // neutral bars: direction is shown by side of centre; a bar that crosses 50% is outlined in the accent
  $('#tornado').innerHTML=`<p class="torn-cap">${mapEsc(A)} now: <b>${pct(base)}</b>. Bars left of centre lower it, right raise it.</p>`+cases.map(c=>{
    const w=Math.abs(c.v-base)/rng_*48;const left=c.v<base;
    return`<div class="torn-row">
      <div class="torn-l">${mapEsc(c.l)}</div>
      <div class="torn-track"><div class="torn-bar${c.flip?' flip':''}" style="${left?'right:50%':'left:50%'};width:${w}%"></div><div class="torn-mid"></div></div>
      <div class="torn-v">${pct(c.v)}</div>
    </div>`;
  }).join('');
  const top=cases[0];
  $('#torNote').textContent=top?`Biggest single change right now: ${top.l.replace(/^If /,'if ')}, ${A} goes from ${pct(base)} to ${pct(top.v)}. Each bar re-runs the model with one thing changed.`:'';
}

function rRunoff(r,mc_){
  const{nat,ctyRes}=r,f=ff(nat);
  if($('#roKpis'))$('#roKpis').innerHTML='';
  // Run-off pairing = actual top two in round one (Art. 138(5))
  const pr=r2pair(nat),A=blocName(pr.a),B=blocName(pr.b),E=blocName(pr.e);
  const BC=new Proxy({},{get:(_,k)=>VZ.ink(k)});
  const sh=k=>k==='inc'?nat.i:k==='opp'?nat.o:((nat.others||[]).find(o=>o.key===k)||{share:0}).share;
  // one vocabulary and one order everywhere: lean to A · split evenly · lean to B (same as the flow toggle)
  const dirs=[{k:'aff',l:'Others follow their loyalties (model)',c:'var(--ink-subtle)'},{k:'toA',l:`Others lean to ${A}`,c:VZ.col(pr.a)},{k:'spl',l:'Others split evenly',c:'var(--others)'},{k:'toB',l:`Others lean to ${B}`,c:VZ.col(pr.b)}];
  if($('#flowA'))$('#flowA').textContent=`Lean to ${A}`;
  if($('#flowB'))$('#flowB').textContent=`Lean to ${B}`;
  const pairP=(mc_.pairs||{})[[pr.a,pr.b].sort().join('|')]||0;
  $('#roScens').innerHTML=`<div class="ro-pair"><span class="ro-pair-l eyebrow">Run-off pairing</span>
      <b style="color:${BC[pr.a]}">${A}</b> <span class="ro-pair-s">${pct(sh(pr.a))}</span> vs <b style="color:${BC[pr.b]}">${B}</b> <span class="ro-pair-s">${pct(sh(pr.b))}</span>
      <span class="ro-pair-e">${E} comes third with ${pct(sh(pr.e))}.${mc_.ro>0?` This pairing comes up in ${pct(pairP,0)} of simulated run-offs.`:''}</span></div>`+
  dirs.map(d=>{
    const ro=r2sim(ctyRes,nat,d.k);
    const carriedA=ro.r2cty.filter(c=>c.r2lead===ro.a).length;
    return`<div class="ro-card">
      <div class="ro-ttl"><i style="--c:${d.c}"></i>${mapEsc(d.l)}</div>
      <div class="ro-val" style="color:${BC[ro.winner]}">${pct(Math.max(ro.shareA,ro.shareB))}</div>
      <div class="ro-sub">${A} ${pct(ro.shareA)} · ${B} ${pct(ro.shareB)} · ${A} leads in ${carriedA} of 47 counties</div>
      <div class="pbar"><div class="pf" style="width:${pct(ro.shareA,0)};background:${VZ.col(ro.a)}"></div></div>
      <div><span class="b ${ro.winner==='inc'?'b-ta':ro.winner==='opp'?'b-tb':'b-to'}">${blocName(ro.winner)} wins</span></div>
    </div>`;
  }).join('')+(mc_.r2TurnLo!=null?`<div class="note u-fs12">Run-off turnout/remobilisation is an uncalibrated sensitivity: deterministic views keep round-one turnout neutral; simulations allow correlated finalist and transfer-voter turnout to vary. Simulated round-two turnout is typically ${pct(mc_.r2TurnLo,0)}–${pct(mc_.r2TurnHi,0)} of round one (80% range).</div>`:'');

  VZ.flow($('#roFlow'),r,S.flowDir||'aff');

  const ro=r2sim(ctyRes,nat,'aff');
  const marg=ro.r2cty.filter(c=>Math.abs(c.r2a-0.5)<0.10).sort((x,y)=>Math.abs(x.r2a-0.5)-Math.abs(y.r2a-0.5));
  $('#roCtbl').innerHTML=`<thead><tr><th>County</th><th>${A} share</th><th>Leader</th><th>Region</th></tr></thead>
  <tbody>${marg.map(c=>`<tr>
    <td class="u-strong">${c.name}</td>
    <td style="color:${c.r2a>=0.5?BC[ro.a]:BC[ro.b]}">${pct(c.r2a)}</td>
    <td><span class="b ${badgeFor(c.r2lead)}">${blocName(c.r2lead)}</span></td>
    <td class="u-fs12 c-muted">${c.cluster}</td>
  </tr>`).join('')||'<tr><td colspan="4" class="hint">No county within 10 points of 50/50.</td></tr>'}</tbody>`;

  $('#ffDetail').innerHTML=`<div class="g3">
    <div><div class="kpi-l">${A} + ${B}</div><div class="stat-v">${pct(nat.i+nat.o)}</div></div>
    <div><div class="kpi-l">Everyone else</div><div class="stat-v">${pct(nat.t)}</div></div>
    <div><div class="kpi-l">Result</div>${f.forced?'<span class="b b-a">Run-off: nobody above 50%</span>':f.ia?`<span class="b b-ta">${blocName('inc')} above 50%</span>`:`<span class="b b-tb">${blocName('opp')} above 50%</span>`}</div>
  </div>`;
}

function rTipping(r,f,i25){
  const tip=S.tip||[],A=blocName('inc');
  VZ.threshold($('#tipStrip'),r.ctyRes);
  // the force-a-run-off question is one sentence under the strip (it used to be two tiles saying the same thing)
  const cap=$('#tipStrip .mstrip-cap');
  if(cap)cap.insertAdjacentHTML('beforeend',` ${f.forced?'Nobody is above 50% nationally, so a run-off is already likely.':f.ia?`${mapEsc(A)} is above 50%; everyone else would need ${pct(f.tbi+f.cur)} together to force a run-off.`:`${mapEsc(blocName('opp'))} is above 50% nationally.`}`);

  const below=tip.filter(t=>t.ig>0),marg=tip.filter(t=>t.ig<=0&&t.ig>-0.05);
  $('#p24').innerHTML=`<div class="g3">
    <div class="tile ${i25>=24?'tile-ok':'tile-risk'}">
      <div class="tile-k">${mapEsc(A)} at 25%+</div>
      <div class="tile-v">${i25}<small>of 47 · needs 24</small></div>
      <div class="u-meta u-mt4">${i25>=24?`Passes with ${i25-24} to spare`:`Short by ${24-i25}`}</div>
    </div>
    <div class="tile tile-risk">
      <div class="tile-k">Just below 25%</div>
      <div class="tile-v">${below.length}<small>counties</small></div>
      <div class="u-meta u-mt4">${below[0]?`Closest: ${below[0].name} (${pct(below[0].i)})`:'None close'}</div>
    </div>
    <div class="tile tile-watch">
      <div class="tile-k">Just above, under 30%</div>
      <div class="tile-v">${marg.length}<small>counties</small></div>
      <div class="u-meta u-mt4">Would drop below with a 3-point swing</div>
    </div>
  </div>`;

  $('#tipTbl').innerHTML=`<thead><tr><th>County</th><th class="r">${mapEsc(A)}</th><th>Gap to 25%</th><th class="r">Votes needed</th><th class="r" title="Share of simulations in which this county gives team A 25% or more">25%+ in</th><th class="r opt">80% range</th><th>Region</th><th class="r opt">B</th><th class="r opt">Others</th><th class="opt">2017→2022</th><th class="opt">Data quality</th></tr></thead>
  <tbody>${tip.length?tip.map(t=>{
    const gc=t.ig>0.04?'b-r':t.ig>0?'b-a':t.ig>-0.04?'b-gr':'b-m';
    const hist=CM.get(t.name);
    return`<tr><td class="u-strong">${t.name}</td>
    <td class="r c-team-a">${pct(t.i)}</td>
    <td><span class="b ${gc}">${t.ig>0?'+':''}${pct(t.ig)}</span></td>
    <td class="r u-mono12">${t.vn>0?'+'+N.format(t.vn):'<span class="c-ok">Above</span>'}</td>
    ${(()=>{const q=S.mc&&S.mc.cty&&S.mc.cty[t.name];return q?`<td class="r u-mono12">${pct(q.p25,0)}</td><td class="r u-mono12 opt">${pct(q.iLo,0)}–${pct(q.iHi,0)}</td>`:'<td class="r">—</td><td class="r opt">—</td>';})()}
    <td class="c-muted">${t.cl}</td>
    <td class="r c-team-b opt">${pct(t.o)}</td>
    <td class="r c-others opt">${pct(t.t)}</td>
    <td class="u-meta opt">${hist?pct(hist.hist17)+'→'+pct(hist.baseIncumbent2022):'—'}</td>
    <td class="opt"><span class="b ${t.dq==='high'?'b-gr':t.dq==='medium'?'b-m':'b-a'}">${t.dq}</span></td></tr>`;
  }).join(''):`<tr><td class="td-empty" colspan="11">No county is within 8 points of the 25% line with these settings.</td></tr>`}</tbody>`;

  $('#a138Tbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th class="r">A</th><th>25%+</th><th class="r">B</th><th>25%+</th><th class="r">Others</th></tr></thead>
  <tbody>${(S.res?.ctyRes||[]).map(c=>`<tr>
    <td class="u-strong">${c.name}</td>
    <td><span class="b ${badgeFor(c.lead==='tf'?'x':c.lead)}">${c.lead==='inc'?'A':c.lead==='opp'?'B':'Other'}</span></td>
    <td class="r c-team-a">${pct(c.i)}</td>
    <td>${c.ia?'<span class="b b-gr">Yes</span>':'<span class="b b-r">No</span>'}</td>
    <td class="r c-team-b">${pct(c.o)}</td>
    <td>${c.oa?'<span class="b b-gr">Yes</span>':'<span class="b b-m">No</span>'}</td>
    <td class="r c-others">${pct(c.t)}</td>
  </tr>`).join('')}</tbody>`;
}

// Vote counts: 6,123,456 → "6.12M"; under a million → "845K"
function fmtVotes(v){v=Math.round(v||0);return v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?Math.round(v/1e3)+'K':String(v);}
function rScen(){
  // Each preset: one deterministic run plus a seeded 200-draw Monte Carlo, so the
  // cards are stable between renders (previously 60 unseeded draws).
  const N_SC=200;
  // Presets ignore the sliders and switches, so only the seed and poll anchor
  // matter: cache so slider moves stay fast.
  const key=JSON.stringify([S.seed,S.reg,S.registerMode,S.pollMode,S.pollBias,S.ub,S.uo,S.ua]);
  if(rScen._key!==key){rScen._key=key;rScen._res=null;}
  const results=rScen._res||(rScen._res=SCENS.map(sc=>{
    const p={...sc.p,cfg:sc.cfg};
    const r=sim(p,false,false,false);
    const i25=r.ctyRes.filter(c=>c.i>=0.25).length;
    const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
    let iW=0,oW=0,xW=0;
    const prev=RNG_SOURCE;
    try{
      for(let i=0;i<N_SC;i++){
        RNG_SOURCE=drawStream(S.seed,i);   // same draws as the main simulation: presets compare like for like
        const mr=sim(p,true,false,false);
        const el=A138.fromSim(mr.ctyRes,mr.nat,OOC_SHARE).elected[0];
        if(el==='inc')iW++;else if(el==='opp')oW++;else if(el)xW++;
      }
    }finally{RNG_SOURCE=prev;}
    const ro=1-(iW+oW+xW)/N_SC;
    // outcome chip: the winner's team hue, or amber (watch) for a run-off
    const outcome=iW/N_SC>=0.5?['b-ta',`${sc.cfg.teams[0]} wins outright`]:oW/N_SC>=0.5?['b-tb',`${sc.cfg.teams[1]} wins outright`]:['b-a','Run-off'];
    return{...sc,r,i25,o25,n:r.nat,iW:iW/N_SC,oW:oW/N_SC,ro,outcome};
  }));
  const active=SCENS.find(sc=>JSON.stringify(sc.cfg)===JSON.stringify(S.cfg)&&Object.entries(sc.p).every(([k,v])=>JSON.stringify(S[k])===JSON.stringify(v)));
  const ps=$('#presetSelect');
  if(ps){
    if(!ps.options.length)ps.innerHTML=SCENS.map(s=>`<option value="${s.id}">${s.tier}</option>`).join('')+'<option value="">Custom (your own settings)</option>';
    ps.value=active?active.id:'';
  }

  // coalition composition: one bar per team, one segment per member sized by polling average
  const coal=cfg=>{
    const teams=cfg.teams.map((t,ti)=>({t,ti,m:CANDIDATES.filter(c=>cfg.assign[c.name]===ti).sort((a,b)=>b.avg-a.avg)})).filter(x=>x.m.length);
    const max=Math.max(...teams.map(x=>x.m.reduce((s,c)=>s+c.avg,0)),1);
    return `<div class="coal" aria-label="Who is on each team">${teams.map(x=>{const tot=x.m.reduce((s,c)=>s+c.avg,0);
      const sur=x.m.map(c=>c.name.split(' ').slice(-1)[0]);
      return `<div class="coal-r" style="--tc:var(${TEAM_VARS[x.ti]})"><b>${String.fromCharCode(65+x.ti)}</b>
        <span class="coal-bar" style="width:${(tot/max*100).toFixed(1)}%" title="${mapEsc(x.m.map(c=>c.name+' '+c.avg.toFixed(1)+'%').join(', '))}">${x.m.map((c,i)=>`<i style="flex:${c.avg};--o:${Math.max(.45,1-i*.18)}"></i>`).join('')}</span>
        <span class="coal-n">${mapEsc(sur.slice(0,4).join(', '))}${sur.length>4?` +${sur.length-4}`:''} · polls ${tot.toFixed(0)}%</span></div>`;}).join('')}</div>`;
  };
  $('#sqMat').innerHTML=results.map(sc=>`
  <div class="sqc${active&&active.id===sc.id?' sqc-on':''}">
    <div><div class="sq-tier">${sc.tier}</div><div class="sq-t">${sc.t}</div></div>
    <div class="sq-d">${mapEsc(sc.d)}</div>
    ${coal(sc.cfg)}
    <div class="sq-bars" aria-label="First-round shares">
      ${[[sc.cfg.teams[0],sc.n.i,'var(--team-a)'],[sc.cfg.teams[1],sc.n.o,'var(--team-b)'],['Others',sc.n.t,'var(--others)']].map(([l,v,col])=>`
      <div class="sq-bar"><span>${l}</span><div class="sq-track"><div style="width:${(v*100).toFixed(1)}%;background:${col}"></div></div><b>${pct(v)}</b><em>${fmtVotes(v*sc.n.valid)}</em></div>`).join('')}
    </div>
    <p class="sq-total">Valid votes <b>${N.format(Math.round(sc.n.valid))}</b> · turnout ${pct(sc.n.cast/REG_TOTAL,0)} of ${fmtVotes(REG_TOTAL)} projected voters</p>
    <div class="sq-foot">
      <span class="b ${sc.outcome[0]}">${sc.outcome[1]}</span>
      <span>Run-off ${pct(sc.ro,0)} · Ruto 25%+ in ${sc.i25}/47</span>
      ${active&&active.id===sc.id?'<span class="b b-m">In use</span>':`<button type="button" class="btn" onclick="applyScenario('${sc.id}')">Use this line-up</button>`}
    </div>
  </div>`).join('');

  $('#sqTbl').innerHTML=`<thead><tr><th>Scenario</th><th>Team A</th><th>Team B</th><th>Others</th><th>Total votes</th><th>A 25%+ counties</th><th>Run-off (share of runs)</th><th>Most likely</th></tr></thead>
  <tbody>${results.map(sc=>`<tr>
    <td class="u-strong">${sc.tier}</td>
    <td class="c-team-a">${pct(sc.n.i)} <span class="hint">${fmtVotes(sc.n.i*sc.n.valid)}</span></td>
    <td class="c-team-b">${pct(sc.n.o)} <span class="hint">${fmtVotes(sc.n.o*sc.n.valid)}</span></td>
    <td class="c-others">${pct(sc.n.t)} <span class="hint">${fmtVotes(sc.n.t*sc.n.valid)}</span></td>
    <td>${N.format(Math.round(sc.n.valid))}</td>
    <td>${sc.i25}/47</td>
    <td>${pct(sc.ro,0)}</td>
    <td><span class="b ${sc.outcome[0]}">${sc.outcome[1]}</span></td>
  </tr>`).join('')}</tbody>`;
}
// ═══ TEAMS PANEL ═══
// Each candidate is on exactly one team or runs solo (radio group per row).
// Ruto anchors team A. Up to four teams; the first eight candidates show by default.
const TEAM_VARS=['--team-a','--team-b','--team-c','--team-d'];
const rerenderTeams=dbnc(()=>{renderAll();rShockLog();},120);
function renderTeams(){
  const chips=$('#teamChips'),grid=$('#teamGrid');if(!chips||!grid)return;
  const cfg=S.cfg,L=i=>String.fromCharCode(65+i);
  chips.innerHTML=cfg.teams.map((t,i)=>`<span class="tm-chip" style="--tc:var(${TEAM_VARS[i]})"><b>${L(i)}</b>
      <input value="${mapEsc(t)}" data-t="${i}" aria-label="Team ${L(i)} name" maxlength="28">
      ${i>=2?`<button type="button" data-rm="${i}" aria-label="Remove team ${L(i)}">×</button>`:''}</span>`).join('')+
    (cfg.teams.length<MAX_TEAMS?'<button type="button" class="tm-add" id="tmAdd">+ Add a team</button>':'');
  chips.querySelectorAll('input').forEach(n=>n.oninput=()=>{cfg.teams[+n.dataset.t]=n.value.trim()||('Team '+L(+n.dataset.t));rerenderTeams();});
  chips.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.rm;cfg.teams.splice(i,1);if(cfg.tickets)cfg.tickets.splice(i,1);
    Object.keys(cfg.assign).forEach(k=>{if(cfg.assign[k]===i)cfg.assign[k]=-1;else if(cfg.assign[k]>i)cfg.assign[k]--;});
    renderTeams();rerenderTeams();
  });
  const add=$('#tmAdd');if(add)add.onclick=()=>{cfg.teams.push('Team '+L(cfg.teams.length));renderTeams();rerenderTeams();};

  const rows=[...CANDIDATES].sort((a,b)=>b.avg-a.avg);
  const tks=cfg.teams.map((_,ti)=>ticketOf(cfg,ti));
  const roleOf=n=>{const ti=cfg.assign[n];if(!(ti>=0))return '';const t=tks[ti];if(!t||(t.members.length<2&&!t.pick))return '';
    return n===t.p?'<small class="tm-role is-p">President</small>':n===t.r?'<small class="tm-role is-r">Running mate</small>':n===t.ally?'<small class="tm-role is-r">Backs mate</small>':'<small class="tm-role is-off">Off ticket</small>';};
  grid.innerHTML=rows.map((c,ri)=>{
    const cur=cfg.assign[c.name];const fixed=c.name==='William Ruto';
    return `<div class="tm-row${ri>=8&&!renderTeams.all?' tm-more':''}" role="radiogroup" aria-labelledby="tmn${ri}">
      <span class="tm-name" id="tmn${ri}"><span>${mapEsc(c.name)}</span>${roleOf(c.name)}<i style="--w:${(c.avg/rows[0].avg*100).toFixed(0)}%" aria-hidden="true"></i></span><span class="tm-avg" title="${mapEsc(pollTip(c))}">${(S.pollMode==='all'||!c.val?c.pollAll:c.poll).toFixed(1)}%${!c.val&&S.pollMode!=='all'?'<sup>†</sup>':(S.pollMode==='all'?c.pollsAll:c.polls)===1?'<sup>*</sup>':''}</span>
      <span class="tm-seg">${cfg.teams.map((t,ti)=>`<label style="--tc:var(${TEAM_VARS[ti]})"><input type="radio" name="tm${ri}" value="${ti}" aria-label="${mapEsc(t)}" ${cur===ti?'checked':''} ${fixed&&ti!==0?'disabled':''}><span>${L(ti)}</span></label>`).join('')}
        <label><input type="radio" name="tm${ri}" value="-1" aria-label="Runs solo" ${!(cur>=0)?'checked':''} ${fixed?'disabled':''}><span>Solo</span></label></span>
    </div>`;}).join('')+
    (!renderTeams.all&&rows.length>8?`<button type="button" class="tm-showall" id="tmAll">Show ${rows.length-8} more candidates</button>`:'');
  grid.querySelectorAll('input').forEach(n=>n.onchange=()=>{
    cfg.assign[rows[+n.name.slice(2)].name]=+n.value;
    const nm=n.name,v=n.value;renderTeams();
    const back=grid.querySelector(`input[name="${nm}"][value="${v}"]`);if(back)back.focus();
    rerenderTeams();});
  const all=$('#tmAll');if(all)all.onclick=()=>{renderTeams.all=true;renderTeams();};
  const fo=$('#sl-follow');if(fo){fo.value=cfg.follow;$('#lv-follow').textContent=cfg.follow+'%';}
  renderTickets(tks);
}
// Ticket pickers: presidential candidate and running mate for every team with 2+ members
function renderTickets(tks){
  const box=$('#ticketBox');if(!box)return;
  const cfg=S.cfg,L=i=>String.fromCharCode(65+i);
  const opt=(n,sel)=>`<option value="${mapEsc(n)}"${n===sel?' selected':''}>${mapEsc(n.split(' ').slice(-1)[0])}</option>`;
  // Ruto's running mate: team members, picks outside the polls, or an opposition defector
  const rmOptsA=k=>{
    const inTeam=k.members.filter(n=>n!==k.p);
    const defectors=[...CANDIDATES].sort((a,b)=>b.avg-a.avg).map(c=>c.name).filter(n=>cfg.assign[n]!==0);
    return `<option value=""${k.r?'':' selected'}>None</option>`+
      (inTeam.length?`<optgroup label="On Ruto's team">${inTeam.map(n=>opt(n,k.r)).join('')}</optgroup>`:'')+
      `<optgroup label="Not in the polls">${Object.entries(RM_PICKS).map(([id,p])=>`<option value="pick:${id}"${k.r==='pick:'+id?' selected':''}>${mapEsc(p.short)} · ${mapEsc(p.desc)}</option>`).join('')}</optgroup>`+
      `<optgroup label="Opposition defector (joins Ruto's team)">${defectors.map(n=>`<option value="def:${mapEsc(n)}">${mapEsc(n)}</option>`).join('')}</optgroup>`;
  };
  const rowsH=cfg.teams.map((t,ti)=>{const k=tks[ti];if(!k||(k.members.length<2&&ti!==0))return '';
    const rmSel=ti===0?rmOptsA(k):`<option value=""${k.r?'':' selected'}>None</option>${k.members.filter(n=>n!==k.p).map(n=>opt(n,k.r)).join('')}`;
    return `<div class="tk-row" style="--tc:var(${TEAM_VARS[ti]})"><p class="tk-h"><b>${L(ti)}</b>${mapEsc(t)}</p>
      <label class="tk-f"><span>President</span><select class="sel" data-tk="${ti}" data-role="p"${ti===0?' disabled title="Ruto leads team A"':''}>${k.members.map(n=>opt(n,k.p)).join('')}</select></label>
      <label class="tk-f"><span>Running mate</span><select class="sel" data-tk="${ti}" data-role="r">${rmSel}</select></label>
      ${k.pick?`<p class="hint tk-off"><b>${mapEsc(k.pick.name)}</b>: ${mapEsc(rmEffectText(k.pick))}</p>`:''}${ti===0&&k.r&&cfg.defectors&&cfg.defectors.includes(k.r)?`<p class="hint tk-off"><b>${mapEsc(k.r)}</b> crossed from the opposition: ${cfg.offFollow??LEAK_DEFAULT.off}% of their supporters follow; the rest split as set below.</p>`:''}
      ${k.off.length?`<p class="hint tk-off">Off the ticket: ${k.off.map(n=>mapEsc(n.split(' ').slice(-1)[0])).join(', ')}</p>`:''}</div>`;}).join('');
  box.innerHTML=rowsH||'<p class="hint">Put two or more candidates on a team to choose its ticket.</p>';
  box.querySelectorAll('select[data-tk]').forEach(sel=>sel.onchange=()=>{
    const ti=+sel.dataset.tk;cfg.tickets=cfg.tickets||[];const cur=ticketOf(cfg,ti);
    const t={p:cur.p,r:cur.r};
    if(sel.dataset.role==='p'){t.p=sel.value;if(t.r===t.p)t.r=cur.p;}
    else if(sel.value.startsWith('def:')){const n=sel.value.slice(4);cfg.assign[n]=ti;t.r=n;cfg.defectors=[...new Set([...(cfg.defectors||[]),n])];}
    else t.r=sel.value||null;
    cfg.tickets[ti]=t;renderTeams();rerenderTeams();
  });
  // leakage controls mirror the config
  const set=(id,v,txt)=>{const el=$('#'+id);if(el){el.value=v;const o=$('#lv-'+id.slice(3));if(o)o.textContent=txt;}};
  const lk=cfg.leak||LEAK_DEFAULT.leak,lt=(lk.home+lk.cross+lk.else)||1;
  set('sl-off',cfg.offFollow??LEAK_DEFAULT.off,(cfg.offFollow??LEAK_DEFAULT.off)+'%');
  set('sl-lh',lk.home,Math.round(lk.home/lt*100)+'%');set('sl-lc',lk.cross,Math.round(lk.cross/lt*100)+'%');set('sl-le',lk.else,Math.round(lk.else/lt*100)+'%');
  if(typeof paintRanges==='function')paintRanges();
}
// Copy a preset into the live settings (sliders + political context)
function applyScenario(id){
  const sc=SCENS.find(s=>s.id===id);if(!sc)return;
  Object.assign(S,JSON.parse(JSON.stringify(sc.p)));S.cfg=JSON.parse(JSON.stringify(sc.cfg));
  if(!S.rt)S.rt={...RT_ZERO};
  ['tf','si','so','ys','yg','ub'].forEach(k=>{const el=$('#sl-'+k);if(el&&S[k]!=null)el.value=S[k];});
  syncRegionSliders();
  syncRegimeUI();updateLabels();if(typeof renderTeams==='function')renderTeams();renderAll();rShockLog();
}

function rConst(r,mc_){
  const{nat,ctyRes}=r;
  const i25=ctyRes.filter(c=>c.i>=0.25).length;
  const o25=ctyRes.filter(c=>c.o>=0.25).length;

  VZ.gates($('#jpBoxes'),r,mc_,i25,o25);

  const byC={};
  ctyRes.forEach(c=>{if(!byC[c.cluster])byC[c.cluster]={t:0,a:0};byC[c.cluster].t++;if(c.i>=0.25)byC[c.cluster].a++;});
  // bullet gauges in team A's hue (this is A's coverage, not a pass/fail state); tick = the national 24-of-47 pace
  $('#clExp').innerHTML=Object.entries(byC).sort((a,b)=>b[1].t-a[1].t).map(([cl,d])=>`
  <div class="bullet" role="img" aria-label="${cl}: ${d.a} of ${d.t} counties at 25% or more">
    <div class="bullet-h"><b>${cl}</b><span class="cl-n">${d.a} of ${d.t}</span></div>
    <div class="bullet-t"><i style="--w:${(d.a/d.t*100).toFixed(1)}%"></i></div>
  </div>`).join('')+`<p class="hint">Bars show counties where ${mapEsc(blocName('inc'))} gets 25% or more. The tick marks the national pace needed (24 of 47).</p>`;

  const wk=FK.map(n=>ctyRes.find(c=>c.name===n)).filter(Boolean);
  const cst=OLG.map(n=>ctyRes.find(c=>c.name===n)).filter(Boolean);
  const li=c=>`<li class="${c.i>=0.25?'':'miss'}"><span>${c.name}</span><b>${pct(c.i)}</b></li>`;
  $('#coalDisp').innerHTML=`<p class="grp-h">Western</p><ul class="dense2">${wk.map(li).join('')}</ul>
    <p class="grp-h">Coast</p><ul class="dense2">${cst.map(li).join('')}</ul>
    <p class="hint mt8">Filled dot: ${mapEsc(blocName('inc'))} at 25% or more. Red ring: below.</p>`;

  // past results: Kenyatta 2017 → Ruto 2022 (the same side), plus team A in this model (dashed).
  // Region figures are weighted by each county's 2022 register. 2013 is left out: the
  // county shares on file could not be verified (they contradict the 2013 winner in 9 counties).
  const clH={};
  CO.forEach(c=>{const d=clH[c.cluster]||(clH[c.cluster]={w17:0,s17:0,w22:0,s22:0});const w=c.registered2022||0;
    if(c.hist17!=null){d.w17+=w;d.s17+=w*c.hist17;}d.w22+=w;d.s22+=w*c.baseIncumbent2022;});
  const now={};ctyRes.forEach(c=>{const d=now[c.cluster]||(now[c.cluster]={iv:0,tv:0});d.iv+=c.iv;d.tv+=c.tv;});
  $('#histCtx').innerHTML=Object.entries(clH).map(([cl,d])=>{
    const v=[d.s17/(d.w17||1),d.s22/(d.w22||1)],m=now[cl]?now[cl].iv/now[cl].tv:null;
    const all=v.concat(m==null?[]:[m]),lo=Math.min(...all),hi=Math.max(...all),sp=hi-lo||0.01;
    const X=i=>i/2*96,Y=x=>(24-(x-lo)/sp*20).toFixed(1);
    const delta=v[1]-v[0];
    return `<div class="spark-row">
      <span class="nm">${cl}<small>2017 ${pct(v[0],0)} · 2022 ${pct(v[1],0)}</small></span>
      <svg class="spark" viewBox="0 0 96 28" role="img" aria-label="${cl}: ${pct(v[0])} in 2017, ${pct(v[1])} in 2022${m!=null?`, ${pct(m)} in this model`:''}">
        <polyline class="ln" points="${v.map((x,i)=>X(i)+','+Y(x)).join(' ')}"/>
        ${m!=null?`<line class="proj" x1="${X(1)}" y1="${Y(v[1])}" x2="${X(2)}" y2="${Y(m)}"/><circle class="pt" cx="${X(2)}" cy="${Y(m)}" r="3"/>`:''}
      </svg>
      <span class="delta">${delta>=0?'▲':'▼'} ${pct(Math.abs(delta))}</span>
    </div>`;
  }).join('')+`<p class="hint mt8">Line: Kenyatta's share in 2017 (ELOG compilation of IEBC county results) and Ruto's in 2022 (IEBC Forms 34B), weighted by county register. Dashed end: ${mapEsc(blocName('inc'))} in this model.</p>`;

  rSens();
}

function rSens(){
  const rows=S.sens||[];
  $('#sensTbl').innerHTML=`<thead><tr><th>Constituency</th><th>County</th><th class="r">Wards</th><th class="r">Registered</th><th>Influence</th><th>Team A (est.)</th><th class="r opt" title="2022 actual">Ruto 2022</th><th class="opt">DQ</th></tr></thead>
  <tbody>${rows.slice(0,40).map(w=>`<tr>
    <td class="u-strong">${w.constituency}</td><td>${w.county}</td>
    <td class="r u-mono12">${w.wards}</td>
    <td class="r u-mono12">${N.format(w.voters)}</td>
    <td><div class="pbar pbar-sm"><div class="pf p-g" style="width:${Math.min(100,w.inf*2)}%"></div></div></td>
    <td style="color:${iCol(w.cis)}">${pct(w.cis)}</td>
    <td class="r opt">${(r=>r?pct(r22Share(r).ru):'—')(R22M.get(w.county+'|'+w.constituency))}</td>
    <td class="opt"><span class="b ${w.dq==='high'?'b-gr':w.dq==='medium'?'b-m':'b-a'}">${w.dq}</span></td>
  </tr>`).join('')}</tbody>`;
}

// ═══ COUNTY TILE MAP ═══



// ═══ ACTUAL LEAFLET COUNTY MAP INTEGRATION v4.3 ═══
// Uses VOTEWATCH scenario output as source of truth and renders it on Kenya county boundary polygons.
const VW_MAP_INDICATORS={
  incShare:{label:'Incumbent Share',unit:'%',min:0,max:100,dir:'higher',category:'Election scenario',status:'modelled',source:'VOTEWATCH county result',formula:'county incumbent votes / county votes cast',desc:'Scenario incumbent vote share by county',caveat:'Not an official result or forecast'},
  oppShare:{label:'Opposition Share',unit:'%',min:0,max:100,dir:'higher',category:'Election scenario',status:'modelled',source:'VOTEWATCH county result',formula:'county opposition votes / county votes cast',desc:'Scenario opposition vote share by county',caveat:'Not an official result or forecast'},
  thirdShare:{label:'Third Force Share',unit:'%',min:0,max:100,dir:'higher',category:'Election scenario',status:'modelled',source:'VOTEWATCH third-force layer',formula:'county third-force votes / county votes cast',desc:'Scenario Third Force vote share by county',caveat:'Baseline and leakage are scenario assumptions'},
  turnout:{label:'Turnout',unit:'%',min:25,max:85,dir:'higher',category:'Turnout',status:'modelled',source:'VOTEWATCH turnout model',formula:'projected votes cast / projected registered voters',desc:'Projected turnout by county',caveat:'Projected, not observed turnout'},
  article138Gap:{label:'Article 138 Gap',unit:'pp',min:-25,max:75,dir:'higher',category:'Constitutional threshold',status:'computed',source:'VOTEWATCH Article 138 module',formula:'incumbent county share − 25%',desc:'Distance from the 25% county threshold for the incumbent',caveat:'Article 138 requires candidate vote share, not turnout'},
  runoffSensitivity:{label:'Run-off Sensitivity',unit:'score',min:0,max:100,dir:'lower',category:'Run-off',status:'modelled',source:'VOTEWATCH run-off module',formula:'function of 50% margin, Third Force share and cluster exposure',desc:'Sensitivity to round-two transfer assumptions',caveat:'Synthetic transfer assumptions'},
  disputeRisk:{label:'Dispute Vulnerability',unit:'score',min:0,max:100,dir:'lower',category:'Risk',status:'modelled',source:'VOTEWATCH dispute module',formula:'close margin + Article 138 proximity + data quality + volatility',desc:'County-level dispute sensitivity score',caveat:'Signal, not legal advice'},
  dataQualityScore:{label:'Data Quality Score',unit:'score',min:0,max:100,dir:'higher',category:'Data quality',status:'computed',source:'VOTEWATCH data-quality tier',formula:'high=92, medium=68, low=42, imputed=28',desc:'County data-quality proxy',caveat:'Quality tier, not independent audit'},
  projectedVoters:{label:'Projected Votes Cast',unit:'votes',min:0,max:null,dir:'higher',category:'Turnout',status:'modelled',source:'VOTEWATCH projected voter base × turnout',formula:'projected voters × adjusted turnout',desc:'Scenario projected votes cast',caveat:'Projected 2027 voter base'},
  leadMargin:{label:'Lead Margin',unit:'pp',min:0,max:100,dir:'higher',category:'Competitiveness',status:'computed',source:'VOTEWATCH county result',formula:'absolute difference between top two candidates',desc:'Margin between leading and second candidate by county',caveat:'Small margins indicate scenario sensitivity'},
  thresholdBuffer:{label:'Threshold Buffer',unit:'pp',min:0,max:75,dir:'higher',category:'Constitutional threshold',status:'computed',source:'VOTEWATCH Article 138 module',formula:'absolute distance from incumbent 25% line',desc:'How far the incumbent is from the 25% county floor',caveat:'Buffer can be high above or below the line'}
};
const VW_COUNTY_KEY_CANDIDATES=['COUNTY','COUNTY_NAM','COUNTY_NAME','county','County','name','Name','ADM1_EN','admin1Name','shapeName','OBJECTID','COUNTY_CODE'];
const VW_GEOJSON_URLS=[
  'https://sdgkenyaforum.org/content/vnr/data/counties.geojson',
  'https://raw.githubusercontent.com/mapbox/geojson-examples/gh-pages/kenya-counties.geojson',
  'https://open.africa/dataset/a8f8b195-aafd-449b-9b1a-ab337fd9925f/resource/4fb2e27e-c001-4b7f-b71d-4fee4a96a0f8/download/kenyan-counties.geojson',
  'https://raw.githubusercontent.com/Mondieki/kenya-counties-subcounties/master/geojson/kenya-counties.geojson'
];

const VW_ALIAS_EXAMPLES=[
  ['Muranga / Murang’a',"Murang'A"],['Tharaka Nithi / Tharaka-Nithi','Tharaka - Nithi'],['Taita Taveta','Taita Taveta'],['Elgeyo Marakwet','Elgeyo/Marakwet'],['TransNzoia','Trans Nzoia'],['Nairobi / Nairobi City','Nairobi City'],['Homa Bay / Homabay','Homa Bay'],['Uasin-Gishu','Uasin Gishu']
];
const VW_MAP_STATE={indicator:'incShare',classification:'continuous',focus:'none',labels:'tooltip',rows:[],rowMap:new Map(),selected:null,activePanel:'summary',diagnostics:null,map:null,layer:null,countyLayers:new Map(),boundaryFeatureCount:0,boundaryMatched:0,boundarySource:null,boundaryKey:null,loading:false,loaded:false,error:null};
function mapEsc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function normCtyName(n){return String(n||'').toLowerCase().replace(/[’']/g,'').replace(/county/g,'').replace(/city/g,'').replace(/[-–—_/]/g,' ').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();}
function compactCtyName(n){return normCtyName(n).replace(/\s+/g,'');}
function canonicalCtyName(n){
  const q=normCtyName(n),cq=compactCtyName(n);
  const alias={
    'nairobi':'Nairobi City','nairobicity':'Nairobi City','mombasa':'Mombasa','mombasacounty':'Mombasa','muranga':"Murang'A",'murangacounty':"Murang'A",'murang a':"Murang'A",'tharaka nithi':'Tharaka - Nithi','tharakanithi':'Tharaka - Nithi','tharaka':'Tharaka - Nithi','taita taveta':'Taita Taveta','taitataveta':'Taita Taveta','elgeyo marakwet':'Elgeyo/Marakwet','elgeyomarakwet':'Elgeyo/Marakwet','elgeyo':'Elgeyo/Marakwet','trans nzoia':'Trans Nzoia','transnzoia':'Trans Nzoia','uasin gishu':'Uasin Gishu','uasingishu':'Uasin Gishu','homa bay':'Homa Bay','homabay':'Homa Bay','tana river':'Tana River','tanariver':'Tana River','west pokot':'West Pokot','westpokot':'West Pokot'
  };
  const direct=CO.find(c=>normCtyName(c.name)===q||compactCtyName(c.name)===cq);
  if(direct)return direct.name;
  return alias[q]||alias[cq]||null;
}
function mapCountyCode(name){const c=CO.find(x=>x.name===name||normCtyName(x.name)===normCtyName(name));return c?String(c.code).padStart(3,'0'):'—';}
function mapDqScore(dq){return dq==='high'?92:dq==='medium'?68:dq==='low'?42:28;}
function mapCountyRisk(c){
  const margin=Math.abs(c.i-c.o); const thresholdGap=Math.abs(c.i-0.25);
  let score=0;
  score+=Math.max(0,42-margin*300);
  score+=Math.max(0,34-thresholdGap*240);
  score+=c.dq==='high'?0:c.dq==='medium'?9:18;
  score+=c.vl==='high'?8:c.vl==='medium'?4:0;
  return clamp(score,0,100);
}
function mapRunoffSensitivity(c){
  const tfWeight=c.t*100;
  const close=Math.max(0,30-Math.abs(c.i-0.50)*220);
  const tfForce=Math.min(45,tfWeight*2.4);
  return clamp(close+tfForce+(c.cluster==='Mt Kenya'?8:0),0,100);
}
function mapLeadMargin(c){const arr=[c.i,c.o,c.t].sort((a,b)=>b-a);return (arr[0]-arr[1])*100;}
function buildVWMapRows(ctyRes){
  return (ctyRes||[]).map(c=>{
    const hist=CM.get(c.name)||{};
    const row={
      name:c.name,code:mapCountyCode(c.name),cluster:c.cluster,dq:c.dq,vl:c.vl,lead:c.lead,ia:c.ia,oa:c.oa,ta:c.ta,
      i:c.i,o:c.o,t:c.t,to:c.to,tv:c.tv,wards:hist.wards||0,base:hist.baseIncumbent2022,hist17:hist.hist17,
      values:{
        incShare:c.i*100,oppShare:c.o*100,thirdShare:c.t*100,turnout:c.to*100,
        article138Gap:(c.i-0.25)*100,runoffSensitivity:mapRunoffSensitivity(c),
        disputeRisk:mapCountyRisk(c),dataQualityScore:mapDqScore(c.dq),projectedVoters:c.tv,
        leadMargin:mapLeadMargin(c),thresholdBuffer:Math.abs(c.i-0.25)*100
      }
    };
    row.status=mapThresholdStatus(row);
    return row;
  });
}
function getMapIndicatorMeta(){return VW_MAP_INDICATORS[VW_MAP_STATE.indicator]||VW_MAP_INDICATORS.incShare;}
function mapThresholdStatus(row){
  const g=row.values.article138Gap;
  if(g<0)return {label:'Below 25%',cls:'b-r',risk:'Fail'};
  if(g<3)return {label:'0–3pp buffer',cls:'b-a',risk:'Watch'};
  if(g<8)return {label:'3–8pp buffer',cls:'b-g',risk:'Sensitive'};
  return {label:'Above threshold',cls:'b-gr',risk:'Stable'};
}
function mapFmt(row,key=VW_MAP_STATE.indicator,d=1){
  const v=row?.values?.[key]; const meta=VW_MAP_INDICATORS[key]||getMapIndicatorMeta();
  if(v==null||Number.isNaN(v))return '—';
  if(key==='projectedVoters')return N.format(Math.round(v));
  if(meta.unit==='%'||meta.unit==='pp')return v.toFixed(d)+(meta.unit==='%'?'%':'pp');
  return v.toFixed(0);
}
function mapDiagnostics(rows){
  const byName=new Set(rows.map(r=>r.name));
  const expected=CO.map(c=>c.name);
  const missing=expected.filter(n=>!byName.has(n));
  const dup=[]; const seen=new Set(); rows.forEach(r=>{if(seen.has(r.name))dup.push(r.name);seen.add(r.name);});
  const invalid=[]; const warnings=[];
  rows.forEach(r=>Object.entries(VW_MAP_INDICATORS).forEach(([k,m])=>{
    const v=r.values[k];
    if(typeof v!=='number'||Number.isNaN(v)) invalid.push(`${r.name}:${k}=missing`);
    else if(m.max!==null&&m.max!==undefined&&(v<m.min||v>m.max)) invalid.push(`${r.name}:${k}=${v.toFixed(2)} outside ${m.min}–${m.max}`);
  }));
  const boundaryMatched=VW_MAP_STATE.boundaryMatched||0;
  const boundaryFeatureCount=VW_MAP_STATE.boundaryFeatureCount||0;
  if(VW_MAP_STATE.error) warnings.push('Boundary layer: '+VW_MAP_STATE.error);
  const clusters=[...new Set(rows.map(r=>r.cluster))].length;
  const lowDQ=rows.filter(r=>r.dq==='low').length, medDQ=rows.filter(r=>r.dq==='medium').length, highDQ=rows.filter(r=>r.dq==='high').length;
  const mapped=boundaryMatched || 0;
  const coverage=Math.round((mapped/47)*100);
  const score=clamp(100-missing.length*3-dup.length*4-invalid.length*1.5-(boundaryMatched&&boundaryMatched<47?(47-boundaryMatched)*2:0)-(VW_MAP_STATE.error?12:0),0,100);
  const status=score>=90&&rows.length===47&&(!boundaryFeatureCount||boundaryMatched>=45)?'PASS':score>=70?'WARNING':'FAIL';
  return {count:rows.length,mapped,boundaryMatched,boundaryFeatureCount,boundarySource:VW_MAP_STATE.boundarySource,boundaryKey:VW_MAP_STATE.boundaryKey,coverage,missing,dup,invalid,warnings,score,status,clusters,lowDQ,medDQ,highDQ,generatedAt:new Date().toISOString(),aliases:VW_ALIAS_EXAMPLES};
}
// Map tab: SVG county map + county panel (js/map.js). The row/diagnostic
// bookkeeping is kept for the report and data-quality checks.
function rMap(ctyRes){
  VW_MAP_STATE.rows=buildVWMapRows(ctyRes||[]);
  VW_MAP_STATE.rowMap=new Map(VW_MAP_STATE.rows.map(r=>[r.name,r]));
  VW_MAP_STATE.boundaryMatched=typeof KE_GEO!=='undefined'?KE_GEO.counties.length:0;
  VW_MAP_STATE.diagnostics=mapDiagnostics(VW_MAP_STATE.rows);
  if(typeof rVoteMap==='function')rVoteMap();
}
function dlBlob(content,filename,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=filename;a.click();URL.revokeObjectURL(a.href);}

function rDispute(ctyRes,dr){
  VZ.margins($('#disStrip'),ctyRes,{w:760,h:110,r:5});
  $('#disKpis').innerHTML=`
  <div class="kpi"><div class="kpi-l">Risk score</div>
    <div class="kpi-v ${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}</div>
    <div class="kpi-d">${dr.score>60?'High':'Moderate'}</div></div>
  <div class="kpi"><div class="kpi-l">Where the close counties are</div>
    <div class="kpi-v ${dr.conc>0.60?'vr':dr.conc>0.40?'va':'vgr'}">${dr.tc}<span class="kpi-hint">&nbsp;of ${dr.n}</span></div>
    <div class="kpi-d">close counties are in <strong>${dr.top}</strong></div></div>
  <div class="kpi"><div class="kpi-l">Closest county margin</div>
    <div class="kpi-v ${dr.minM<0.03?'vr':dr.minM<0.07?'va':'vgr'}">${pct(dr.minM)}</div>
    <div class="kpi-d">${dr.n} counties are within 6 points</div></div>`;

  // method note: analyst view only
  $('#disNarr').innerHTML=`<strong>How this is scored.</strong> ${dr.n} counties sit within the petition margin; the closest is ${pct(dr.minM)}. ${dr.conc>0.60?`${pct(dr.conc,0)} of them are in ${dr.top}, and close results bunched in one region make a petition easier to argue. `:''}${dr.score>55?'For comparison, the 2017 petition was filed with wider national margins.':''}`;

  $('#disClust').innerHTML=Object.entries(dr.byC).sort((a,b)=>b[1]-a[1]).map(([cl,n])=>`
  <div class="fb u-row">
    <span class="u-strong u-fs12">${cl}</span>
    <div class="fc g8"><div class="pbar pbar-md"><div class="pf p-r" style="width:${n/dr.n*100}%"></div></div>
    <span class="u-mono12 c-ink">${n}</span></div>
  </div>`).join('')||'<div class="u-meta">No close counties at current scenario.</div>';

  $('#disTbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th>Margin</th><th class="r">A</th><th class="r">B</th><th>Region</th><th class="opt">Data quality</th><th class="opt">Volatility</th></tr></thead>
  <tbody>${dr.close.sort((a,b)=>Math.abs(a.ls-0.5)-Math.abs(b.ls-0.5)).map(c=>`<tr>
    <td class="u-strong">${c.name}</td>
    <td><span class="b ${badgeFor(c.lead==='tf'?'x':c.lead)}">${c.lead==='inc'?'A':c.lead==='opp'?'B':'Other'}</span></td>
    <td><span class="b ${Math.abs(c.ls-0.5)<0.03?'b-r':'b-a'}">${pct(Math.abs(c.ls-0.5))}</span></td>
    <td class="r c-team-a">${pct(c.i)}</td><td class="r c-team-b">${pct(c.o)}</td>
    <td class="c-muted">${c.cluster}</td>
    <td class="opt"><span class="b ${c.dq==='high'?'b-gr':c.dq==='medium'?'b-m':'b-a'}">${c.dq}</span></td>
    <td class="u-meta opt">${c.vl}</td>
  </tr>`).join('')}</tbody>`;
}


function selCounty(name){
  S.selCty=name;
  if(S.wards)rWardDrill(S.wards);
  if(typeof rVoteMap==='function')rVoteMap();
}

function rWardDrill(wardRes){
  if(!$('#wardTbl'))return;
  const s=($('#wardSrch')?.value||'').toLowerCase();
  // One row per constituency: the actual 2022 result (Forms 34B) beside the 2027
  // estimate. Wards share their constituency's 2022 pattern (no ward-level results).
  const by=new Map();
  wardRes.filter(w=>w.county===S.selCty).forEach(w=>{const x=by.get(w.constituency)||{cs:w.constituency,wards:[],reg:0,votes:0,inc:0,opp:0};
    const v=w.voters*w.to;x.wards.push(w.ward);x.reg+=w.voters;x.votes+=v;x.inc+=v*w.inc;x.opp+=v*w.opp;by.set(w.constituency,x);});
  const rows=[...by.values()].filter(x=>!s||x.cs.toLowerCase().includes(s)||x.wards.some(n=>n.toLowerCase().includes(s)));
  const A=mapEsc(S.cfg.teams[0]),B=mapEsc(S.cfg.teams[1]||'B');
  $('#wardTbl').innerHTML=`<caption class="tbl-cap">2022: actual presidential result (IEBC Forms 34B). 2027: this scenario's estimate, which follows each constituency's 2022 pattern within the county. Registered: IEBC 2022 register grown to 2027.</caption>
  <thead><tr><th>Constituency</th><th class="r" title="2022 actual, share of candidate votes">Ruto 2022</th><th class="r" title="2022 actual, share of candidate votes">Odinga 2022</th><th class="r">${A} est.</th><th class="r">${B} est.</th><th class="r">Registered</th><th class="r opt">Turnout (est.)</th><th class="r opt">Votes (est.)</th><th class="opt">Wards</th></tr></thead>
  <tbody>${rows.map(x=>{const r=R22M.get(S.selCty+'|'+x.cs),q=r?r22Share(r):null,vv=x.votes||1;return`<tr>
    <td class="u-strong">${mapEsc(x.cs)}</td>
    <td class="r">${q?pct(q.ru):'—'}</td>
    <td class="r">${q?pct(q.ra):'—'}</td>
    <td class="r c-team-a">${pct(x.inc/vv)}</td>
    <td class="r c-team-b">${pct(x.opp/vv)}</td>
    <td class="r u-mono12">${fmtVotes(x.reg)}</td>
    <td class="r opt">${pct(x.votes/(x.reg||1))}</td>
    <td class="r u-mono12 opt">${fmtVotes(x.votes)}</td>
    <td class="u-meta opt">${x.wards.map(mapEsc).join(', ')}</td>
  </tr>`;}).join('')}</tbody>`;
}

// Poll trend: team A and team B across every poll, oldest to newest; held-out polls hollow
function pollTrend(){
  const ps=[...POLLS].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(p=>({p,b:pollTeams(p)}));
  if(ps.length<2)return '';
  const vals=ps.flatMap(x=>[x.b.inc,x.b.opp]),lo=Math.floor(Math.min(...vals)/5)*5-2,hi=Math.ceil(Math.max(...vals)/5)*5+2;
  const W=300,H=56,X=i=>(i/(ps.length-1)*W).toFixed(1),Y=v=>(H-(v-lo)/(hi-lo)*H).toFixed(1);
  const line=(k,c)=>`<polyline class="ln" style="stroke:${c}" points="${ps.map((x,i)=>X(i)+','+Y(x.b[k])).join(' ')}"/>`+
    ps.map((x,i)=>`<circle cx="${X(i)}" cy="${Y(x.b[k])}" r="3" class="${x.p.eligible?'':'held'}" style="${x.p.eligible?'fill':'stroke'}:${c}"><title>${mapEsc(x.p.pollster)} ${x.p.date}: ${x.b[k].toFixed(0)}%</title></circle>`).join('');
  const f=ps[0].b,l=ps[ps.length-1].b;
  return `<div class="poll-trend"><span class="eyebrow">Trend</span>
    <svg viewBox="-4 -4 ${W+8} ${H+8}" role="img" aria-label="Across ${ps.length} polls ${mapEsc(S.cfg.teams[0])} went from ${f.inc.toFixed(0)}% to ${l.inc.toFixed(0)}% and ${mapEsc(S.cfg.teams[1]||'team B')} from ${f.opp.toFixed(0)}% to ${l.opp.toFixed(0)}%">${line('opp','var(--team-b)')}${line('inc','var(--team-a)')}</svg></div>`;
}
function rIntel(){
  $('#levList').innerHTML=LEVERS.map(l=>`
  <div class="item-row">
    <i class="lev-dot lev-${l.s}" aria-hidden="true"></i>
    <div><div class="item-t">${mapEsc(l.t)}</div>
    <div class="item-d">${mapEsc(l.d)}</div>
    <div class="item-impl"><strong>In the model:</strong> ${mapEsc(l.i)}</div></div>
  </div>`).join('');

  $('#sentList').innerHTML=SENTS.map(s=>`
  <div class="u-row">
    <div class="fb mb8"><span class="item-t">${mapEsc(s.t)}</span>
    <div class="fc g6"><span class="b ${s.tier==='HIGH'?'b-a':'b-m'}">${{HIGH:'High',MED:'Medium',LOW:'Low'}[s.tier]||s.tier}</span>
    <span class="u-meta">${{Wkly:'Weekly',Mthly:'Monthly',Qtrly:'Quarterly'}[s.freq]||s.freq}</span></div></div>
    <div class="u-meta u-italic">${mapEsc(s.n)}</div>
  </div>`).join('');

  $('#byeList').innerHTML=BYES.map(b=>`
  <div class="u-row">
    <div class="fb mb8"><span class="u-strong u-fs12">${b.n} (${b.yr})</span>
    <span class="u-meta">${b.co}</span></div>
    <div class="g3 u-mono12">
      <div><div class="c-muted">Model</div><div class="u-strong">${pct(b.mb)}</div></div>
      <div><div class="c-muted">Actual</div><div class="u-strong">${pct(b.act)}</div></div>
      <div><div class="c-muted">Delta</div><div style="font-weight:600;color:${b.d<0?'var(--c-red)':'var(--c-green)'}">${b.d>0?'+':''}${pct(b.d)}</div></div>
    </div>
    <div class="u-meta u-mt4 u-italic">${b.note}</div>
  </div>`).join('');

  $('#dataRoadmap').innerHTML=ROADMAP.map(d=>`
  <div class="flex g8 mb8">
    <span class="b ${d.p==='P1'?'b-r':d.p==='P2'?'b-m':'b-m'}">${d.p}</span>
    <div><div class="u-strong u-fs12">${d.i}</div>
    <div class="u-meta">${d.imp}</div>
    <div class="u-meta">Source: ${d.src}</div></div>
  </div>`).join('');

  $('#regEffects').innerHTML=REG_EFF.map(r=>`
  <div class="u-row">
    <div class="u-strong u-fs12 u-mb4 c-ink">${r.sw}</div>
    <div class="u-meta u-lh-snug">${r.e}</div>
  </div>`).join('');

  $('#methNotes').innerHTML=`<strong>How it works</strong><br>Each candidate's support comes from validated national polls weighted by recency, sample size and pollster quality (candidates with few polls are pulled toward a small prior; held-out polls only enter the optional all-polls sensitivity) and is spread across Kenya's 1,450 IEBC wards, weighted by each ward's 2022 register (IEBC Gazette Notice 7290) and each constituency's 2022 turnout, using their home regions and each constituency's 2022 presidential result (IEBC Forms 34B). Supporters who don't follow their candidate follow candidate-by-region priors, crossing more where the other side is locally strong. In a run-off, each eliminated candidate's voters split by candidate-by-region priors, with a separate shock for each in every simulation. Registered voters follow the selected register scenario. Young voters back team A less than older voters, which matters when youth turnout changes. Teams add up their members' support, minus supporters who don't follow. The model then runs the election hundreds of times with random polling error. An outright win needs over 50% nationally and 25% in 24 counties; otherwise the top two go to a run-off, won by most votes. This is a scenario tool, not a forecast.`;

  // small multiples: one bar per poll, split by the current teams
  const sm=$('#pollsSM');
  if(sm)sm.innerHTML=POLLS.map(p=>{const b=pollTeams(p);return `<div class="psm-r${p.eligible?'':' held'}">
    <span class="psm-l"><b>${mapEsc(p.pollster)}</b><span>${p.date}${p.eligible?'':' · held out'}</span></span>
    <span class="psm-bar" role="img" aria-label="${mapEsc(S.cfg.teams[0])} ${b.inc.toFixed(0)}%, ${mapEsc(S.cfg.teams[1]||'B')} ${b.opp.toFixed(0)}%, others ${b.tf.toFixed(0)}%">
      <i style="width:${b.inc}%;background:var(--team-a)"></i><i style="width:${b.opp}%;background:var(--team-b)"></i><i style="width:${b.tf}%;background:var(--line-2)"></i></span>
    <span class="psm-v"><b class="c-team-a">${b.inc.toFixed(0)}</b> · <b class="c-team-b">${b.opp.toFixed(0)}</b></span></div>`;}).join('')+pollTrend()+`<p class="hint mt8">Decided voters only. Orange = ${mapEsc(S.cfg.teams[0])}, blue = ${mapEsc(S.cfg.teams[1]||'team B')}, grey = everyone else. Change the teams and these bars regroup.</p>`;
  const pt=$('#pollsTbl');
  if(pt)pt.innerHTML=`<thead><tr><th>Released</th><th>Pollster</th><th>${mapEsc(S.cfg.teams[0])}</th><th>${mapEsc(S.cfg.teams[1]||'Team B')}</th><th>Others</th><th>Top names</th></tr></thead><tbody>${POLLS.map(p=>{const b=pollTeams(p);const top=Object.entries(p.r).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([n,v])=>`${mapEsc(n.split(' ').pop())} ${v}`).join(' · ');
    return `<tr><td>${p.date}</td><td><a href="${p.url}" target="_blank" rel="noopener">${mapEsc(p.pollster)}</a>${p.eligible?'':' <span class="b b-m" title="Methodology not disclosed or not yet verified">held out</span>'}</td><td class="c-team-a">${b.inc.toFixed(1)}%</td><td class="c-team-b">${b.opp.toFixed(1)}%</td><td class="c-others">${b.tf.toFixed(1)}%</td><td class="u-wrap">${top}</td></tr>`;}).join('')}</tbody>`;
  rBacktest();
  const cf=$('#ctxFacts');
  // the date is the source link; the source's domain sits under the fact
  if(cf)cf.innerHTML=CONTEXT_FACTS.map(x=>{let host='';try{host=new URL(x.url).hostname.replace(/^www\./,'');}catch(e){}
    return `<li><a class="ctx-d" href="${x.url}" target="_blank" rel="noopener" aria-label="Source for ${mapEsc(x.date)}">${x.date}</a><span>${mapEsc(x.t)}<span class="ctx-src">${mapEsc(host)}</span></span></li>`;}).join('')+
    (typeof SALIENT_EVENTS!=='undefined'?SALIENT_EVENTS.map(x=>`<li><span class="ctx-d">${mapEsc(x.date)}</span><span><strong>Signal · ${mapEsc(x.region)}:</strong> ${mapEsc(x.title)}<span class="ctx-src">${mapEsc(x.note)}</span></span></li>`).join(''):'');
}

// Signals: the poll-error record and the 2022 back-test (data/history.js, data/backtest2022.js)
function rBacktest(){
  const el=$('#backtest');if(!el||typeof BACKTEST==='undefined')return;
  const B=BACKTEST,f1=x=>(+x).toFixed(1),sg=x=>(x>0?'+':'')+f1(x);
  const errs=pollHistoryErrors();
  const best=B.variants.find(v=>v.id==='regional-bias'),base=B.variants.find(v=>v.id==='regional'),cal=B.variants.find(v=>v.id==='regional-bias-cal'),flat=B.variants.find(v=>v.id==='model-bias');
  el.innerHTML=`<div class="g2">
    <div><p class="grp-h">Final polls vs result <span class="c-muted">Kenyatta/Ruto side, two-way share</span></p>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Election</th><th class="r">Final polls</th><th class="r">Result</th><th class="r">Miss</th></tr></thead>
      <tbody>${errs.map(e=>`<tr><td>${e.year}</td><td class="r">${f1(e.poll)}%</td><td class="r">${f1(e.result)}%</td><td class="r u-strong">${sg(e.err)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint mt8">Validated pollsters only (Ipsos, Infotrak, TIFA). Every final average underestimated the same side, by ${f1(POLL_ERR.mean)} points on average. The model's national error is calibrated to this record; correcting the bias is an option under Evidence.</p></div>
    <div><p class="grp-h">2022 hindcast <span class="c-muted">final polls, TIFA regional poll, 2017 county pattern</span></p>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Method</th><th class="r">National miss</th><th class="r">County error</th><th class="r">Winner</th><th class="r">25% test</th><th class="r">In 80% range</th></tr></thead>
      <tbody>${B.variants.map(v=>`<tr><td>${mapEsc(v.label)}</td><td class="r">${sg(v.nationalErr)}</td><td class="r">${f1(v.countyMAE)}</td><td class="r">${v.winners}/47</td><td class="r">${v.article138}/47</td><td class="r">${f1(v.coverage80)}%</td></tr>`).join('')}</tbody></table></div>
      <p class="hint mt8">County error: average miss in Ruto's two-way share. With the bias correction (estimated from 2013 and 2017 only) the national miss falls from ${sg(base.nationalErr)} to ${sg(best.nationalErr)} points. The regional layer (TIFA's nine zones, 29 Jul 2022) cut the root-mean-square county error from ${f1(flat.countyRMSE)} to ${f1(best.countyRMSE)} points; its zones are coarse, so winner calls did not improve. With the model's earlier noise only ${f1(best.coverage80)}% of counties fell inside their 80% range, mainly where alliances shifted (${B.counties.slice(0,3).map(c=>`${mapEsc(c.name)} ${f1(c.pred)}→${f1(c.actual)}`).join(', ')}). The model now adds ${f1(B.calibration.countySD)} points of county-level error, which brings that to ${f1(cal.coverage80)}%.</p></div>
  </div>`;
}

function rShockLog(){
  $('#shLog').innerHTML=S.shLog.length
    ?S.shLog.map(l=>`<div class="log-line">
      <span class="c-muted">[${l.ts}]</span> <span class="c-ink">${l.e}</span>
      <span class="c-muted"> → ${l.d}</span></div>`).join('')
    :'<span class="c-muted">No events yet. Add one here, or turn on test events in the header.</span>';
  const h=$('#shLog');if(h&&!h.previousElementSibling?.classList?.contains('sandbox-note'))h.insertAdjacentHTML('beforebegin','<p class="hint sandbox-note">Hypothetical sandbox: event effects are made-up sizes for testing how sensitive the result is. They are not measured, and the central result never includes them.</p>');
}

// ═══ EXPORTS ═══
function dlCSV(kind){
  const r=S.res;if(!r)return;
  let rows=[],fn=`vw2027_${kind}.csv`;
  if(kind==='county'){
    rows=[['County','Cluster','Voters','Turnout','Inc','Inc≥25','Opp','TF','DQ']];
    r.ctyRes.forEach(c=>rows.push([c.name,c.cluster,Math.round(c.tv),pct(c.to),pct(c.i),c.ia,pct(c.o),pct(c.t),c.dq]));
  }else if(kind==='ward'){
    rows=[['County','Constituency','Ward','Registered2027','Registered2022_IEBC','Ruto2022_constituency','Odinga2022_constituency','Turnout_est','Inc_est','Opp_est','TF_est','DQ']];
    const v22=new Map(WD.map(w=>[w.co+'|'+w.cs+'|'+w.w,w.v22]));
    (S.wards||[]).forEach(w=>{const r=R22M.get(w.county+'|'+w.constituency),q=r?r22Share(r):null;rows.push([w.county,w.constituency,w.ward,Math.round(w.voters),v22.get(w.county+'|'+w.constituency+'|'+w.ward)??'',q?pct(q.ru):'',q?pct(q.ra):'',pct(w.to),pct(w.inc),pct(w.opp),pct(w.tf),w.dq]);});
  }else if(kind==='results2022'){
    rows=[['County','Constituency','Registered2022','Odinga','Ruto','Wajackoyah','Mwaure','Rejected','Check','CountySplitMatchesIndependentSources']];
    const lab={v:'matches official Form 34B total',r:'rescaled to official total',c:'official total; split from county Form 34C figures',s:'swapped back to correct constituency',u:'total not checked; county split checked'};
    const ck=typeof CHECK2022!=='undefined'?new Map(CHECK2022.counties.map(c=>[c.name,c.agree])):new Map();
    R22.forEach(x=>rows.push([x.co,x.cs,x.reg,x.ra,x.ru,x.wj,x.mw,x.rej,lab[x.src]||x.src,ck.has(x.co)?(ck.get(x.co)?'yes':'no'):'']));
  }else if(kind==='tipping'){
    rows=[['County','Cluster','IncShare','Gap','VotesNeeded','OppShare','TFShare','DQ']];
    (S.tip||[]).forEach(t=>rows.push([t.name,t.cl,pct(t.i),pct(t.ig),t.vn,pct(t.o),pct(t.t),t.dq]));
  }
  const csv=rows.map(r=>r.map(csvE).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=fn;a.click();URL.revokeObjectURL(a.href);
}

// ═══ REGIME SWITCHES ═══
function regime(k,v){
  S.reg[k]=v;
  syncRegimeUI();
  renderAll();rShockLog();
}
// Plain-language verdict in the header: the one thing a visitor needs first
function rHeadline(r,mc_,i25){
  const el=document.getElementById("verdict");if(!el)return;
  const n=r.nat;let tone,title;
  // dot tone: the winning team's hue, or amber for a run-off (CSS maps data-tone)
  if(mc_.ro>=0.5){const pr=r2pair(n);tone="runoff";title=`Run-off likely: ${blocName(pr.a)} vs ${blocName(pr.b)}`;}
  else if(mc_.iW>=mc_.oW){tone="inc";title=`${blocName("inc")} wins in round one`;}
  else{tone="opp";title=`${blocName("opp")} wins in round one`;}
  const p=mc_.ro>=0.5?mc_.ro:Math.max(mc_.iW,mc_.oW);
  el.dataset.tone=tone;
  el.innerHTML=`<span class="v-dot" aria-hidden="true"></span><span class="v-title">${title}</span><span class="v-p" title="Share of simulations with this line-up and these assumptions, not the chance that this line-up forms">${pct(p,0)} if this line-up runs${S.mcPending?' · refining…':''}</span>`;
}
function setLive(on){
  S.live=!!on;S.timer=30;
  const b=document.getElementById("liveBtn");
  if(b){b.setAttribute("aria-pressed",String(S.live));b.setAttribute('aria-label',S.live?'Hypothetical test events on':'Hypothetical test events off');b.querySelector('.live-txt').textContent=S.live?'Test events on':'Test events';}
  ["#hTimer","#timerDisp","#shBadge"].forEach(s=>{const e=$(s);if(e)e.textContent=S.live?"30s":"paused";});
}
// Political-context switches are <button role="switch" data-reg="…">; state lives in S.reg
function syncRegimeUI(){
  $$('[data-reg]').forEach(b=>b.setAttribute('aria-checked',String(!!S.reg[b.dataset.reg])));
}



// ═══ v4.5 THINK-TANK GOVERNANCE / QA / RISK LAYERS ═══
const PUBLIC_LABELS={internal:['Ruto holds the Rift Valley'],public:['Ruto holds the Rift Valley']};
function updateViewModeLabels(){
  const labels=PUBLIC_LABELS[S.viewMode==='public'?'public':'internal'];
  $$('.reg-lbl').forEach((el,i)=>{el.textContent=labels[i]||el.textContent;});
  document.body.classList.toggle('public-mode',S.viewMode==='public');
  const vb=document.getElementById('viewBtn');
  const vl=document.getElementById('viewLbl');if(vl)vl.textContent=S.viewMode==='public'?'Public view':'Analyst view';
  if(vb){vb.setAttribute('aria-label',S.viewMode==='public'?'Public view (switch to analyst view)':'Analyst view (switch to public view)');vb.setAttribute('aria-pressed',String(S.viewMode!=='public'));}
}
function applyTheme(){
  if(S.theme==='dark')document.documentElement.dataset.theme='dark';else delete document.documentElement.dataset.theme;
  const b=document.getElementById('themeBtn');
  if(b){b.textContent=S.theme==='light'?'☾':'☀';b.setAttribute('aria-label',S.theme==='light'?'Switch to dark theme':'Switch to light theme');}
}
function setTheme(t){S.theme=t;savePref('vw-theme',t);applyTheme();}
function setViewMode(v){
  S.viewMode=v;savePref('vw-view',v);updateViewModeLabels();renderAll();
}
function updateMcModeUI(){
  ITERS=MC_MODES[S.mcMode]||MC_MODES.preview;
  const modeText={preview:'Preview · 400',standard:'Standard · 1,000',research:'Research · 5,000'}[S.mcMode]||'Preview · 400';
  $('#mcModeLabel')&&( $('#mcModeLabel').textContent=modeText );
  $('#seedLabel')&&( $('#seedLabel').textContent=S.seed );
  $('#mcCredibilityNote')&&( $('#mcCredibilityNote').innerHTML=S.mcMode==='preview'
    ?'Preview mode prioritizes speed. Treat probabilities as directional and switch to Standard or Research before briefing.'
    :S.mcMode==='standard'?'Standard mode is suitable for internal review. Use Research mode for exported briefings: more runs give tighter ranges.'
    :'Research mode runs 5,000 simulations. Every depth is seeded; record the seed in exported materials.');
}
function assumptionSensitivityHTML(){
  if(!S.res)return '<div class="note">Run the model to calculate sensitivity.</div>';
  const base=S.res.nat.i;
  const tests=[
    ['Protest vote +5pp',{tf:S.tf+5}],
    ['Swing to Ruto +4pp',{si:S.si+4}],['Swing to team B +4pp',{so:S.so+4}],
    ['Youth turnout +8pp',{ys:S.ys+8}],
    ['Undecided to others +10',{uo:S.uo+10}],['Undecided turnout -20%',{ua:S.ua-20}],
    ['Follow-through 70%',{cfg:{...S.cfg,follow:70}}],['Follow-through 100%',{cfg:{...S.cfg,follow:100}}]
  ];
  const rows=tests.map(([label,p])=>{const r=sim({...p},false,true,false);return{label,delta:r.nat.i-base,inc:r.nat.i,ro:ff(r.nat).forced};})
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return `<div class="tscroll"><table class="tbl"><thead><tr><th>If…</th><th>Team A change</th><th>Team A share</th><th>Effect</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td style="color:${r.delta<0?'var(--c-red)':'var(--c-green)'}">${r.delta>0?'+':''}${pct(r.delta)}</td><td>${pct(r.inc)}</td><td>${Math.abs(r.delta)>0.025?'Major':'Minor'}</td></tr>`).join('')}</tbody></table></div>`;
}
function responsibleUseHTML(){
  return `<div class="note u-fs12 u-lh-relaxed"><strong class="c-accent">Permitted:</strong> civic analysis, academic research, journalistic review, scenario planning, election-risk monitoring and data-quality auditing.<br><strong class="c-team-b">Prohibited:</strong> voter suppression, deceptive persuasion, intimidation, unofficial result claims, microtargeting based on sensitive traits, or spreading unverified projections as official outcomes.<br><strong>Language standard:</strong> use “threshold-sensitive”, “uncertainty hotspot”, “data validation priority”, and “scenario driver”; avoid operational terms such as target, mobilize, persuade, counter-message, flip or suppress. Current display mode: <span class="b ${S.viewMode==='public'?'b-gr':'b-g'}">${S.viewMode==='public'?'PUBLIC / NEUTRAL':'INTERNAL'}</span></div>`;
}
function renderGovernanceWidgets(){
  $('#assumptionSensitivity')&&( $('#assumptionSensitivity').innerHTML=assumptionSensitivityHTML() );
  $('#responsibleUsePanel')&&( $('#responsibleUsePanel').innerHTML=responsibleUseHTML() );
  $('#validationPanel')&&( $('#validationPanel').innerHTML=validationHTML() );
  $('#modelRiskRegister')&&( $('#modelRiskRegister').innerHTML=modelRiskRegisterHTML() );
  $('#politicalEconomyPanel')&&( $('#politicalEconomyPanel').innerHTML=riskLensHTML('political') );
  $('#civicRiskPanel')&&( $('#civicRiskPanel').innerHTML=riskLensHTML('civic') );
  $('#securityRiskPanel')&&( $('#securityRiskPanel').innerHTML=riskLensHTML('security') );
  $('#marketRiskPanel')&&( $('#marketRiskPanel').innerHTML=riskLensHTML('market') );
}
function validationHTML(){return `<div class="note u-fs12 u-lh-relaxed"><strong class="c-warn">Validation status: historically back-tested; not externally validated as a 2027 forecast.</strong><br>Current calibration: 2022 national/county/regional hindcast, 2013–2022 poll-error record, exact register reconciliation and county uncertainty calibrated to 2022 coverage. Remaining evidence gaps: direct ward/polling-station presidential history, cleaned IEBC register, more polling time series, and measured coalition/run-off/running-mate/turnout transfer effects.<br>County uncertainty is calibrated on 2022 rather than independently validated out of sample.</div>`;}
function modelRiskRegisterHTML(){
  const risks=[
    ['Ward-level vote shares imputed from county baseline','High','Replace with actual ward-level presidential results'],
    ['Third Force baseline synthetic','High','Calibrate with polling and repeated survey waves'],
    ['Proxy boundary polygons exist','Medium/High','Replace proxy geometries with verified official county GeoJSON'],
    ['Polling anchor previously under-wired','Mitigated','v4.5 applies Incumbent, Opposition and Third Force poll adjustments'],
    ['Monte Carlo count low in preview','Medium','Use Standard or Research mode for briefing outputs'],
    ['Contextual actor labels','Medium','Use Public / neutral mode for external or civic presentations']
  ];
  return `<div class="tscroll"><table class="tbl"><thead><tr><th>Risk</th><th>Severity</th><th>Mitigation</th></tr></thead><tbody>${risks.map(r=>`<tr><td>${r[0]}</td><td><span class="b ${r[1].startsWith('High')?'b-r':r[1].startsWith('Medium')?'b-a':'b-gr'}">${r[1]}</span></td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>`;
}
function computeCountySignals(row){
  const tf=row.values.thirdShare, art=Math.abs(row.values.article138Gap), disp=row.values.disputeRisk, turn=row.values.turnout;
  const cluster=row.cluster||''; const dq=row.dq||'medium';
  const urban=cluster.includes('Urban')?1:0, coast=cluster.includes('Coast')?1:0, rv=cluster.includes('Rift')?1:0, mt=cluster.includes('Mountain')?1:0;
  const dqPenalty=dq==='high'?0:dq==='medium'?8:18;
  const political=clamp(28+tf*1.15+disp*.25+urban*12+coast*6+dqPenalty,0,100);
  const civic=clamp(22+disp*.45+(turn<55?14:0)+tf*.55+dqPenalty+urban*10,0,100);
  const security=clamp(18+rv*10+coast*6+(turn<50?10:0)+disp*.35+dqPenalty*.5,0,100);
  const market=clamp(24+urban*12+coast*14+mt*8+disp*.28+tf*.35,0,100);
  return {
    political, civic, security, market,
    items:{
      fuelPricePressure:['proxy',clamp(30+urban*14+coast*8+tf*.3,0,100)],foodInflationStress:['synthetic',clamp(35+(turn<55?12:0)+disp*.2,0,100)],countyWageArrears:['synthetic',clamp(20+dqPenalty+disp*.25,0,100)],pendingBills:['synthetic',clamp(24+dqPenalty+market*.15,0,100)],devolutionDelay:['synthetic',clamp(25+disp*.2+dqPenalty,0,100)],insecurityIncidents:['proxy',security],youthUnemployment:['proxy',clamp(30+urban*16+tf*.4,0,100)],publicWorksVisibility:['synthetic',clamp(70-market*.25+turn*.1,0,100)],droughtReliefExposure:['proxy',clamp(20+rv*18+(cluster.includes('Coast')?8:0),0,100)],protestIntensity:['synthetic',clamp(15+urban*25+tf*.7+disp*.2,0,100)],corruptionExposure:['synthetic',clamp(20+dqPenalty+disp*.25,0,100)]
    },
    civicItems:{voterEducationGaps:['synthetic',clamp(25+dqPenalty+(turn<55?10:0),0,100)],misinformationVulnerability:['synthetic',clamp(20+tf*.7+urban*10+disp*.2,0,100)],turnoutSuppressionRisk:['proxy',clamp(15+(turn<50?25:0)+dqPenalty+security*.2,0,100)],violenceEarlyWarning:['proxy',security],administrativeCapacityRisk:['synthetic',clamp(18+dqPenalty+disp*.3,0,100)],litigationSensitivity:['computed',disp]},
    marketItems:{fxPressure:['proxy',clamp(25+market*.35,0,100)],sovereignSpreadRisk:['synthetic',clamp(20+disp*.35+tf*.4,0,100)],bankLiquiditySentiment:['synthetic',clamp(18+market*.28,0,100)],tourismExposure:['proxy',clamp(coast?65:urban?35:18,0,100)],infrastructureContinuityRisk:['synthetic',clamp(22+disp*.25+dqPenalty,0,100)],businessDisruptionSignal:['synthetic',clamp(20+urban*16+security*.3,0,100)]}
  };
}
function lensClass(v){return v>=70?'gov-risk-high':v>=45?'gov-risk-med':'gov-risk-low';}
function riskLensHTML(type){
  const rows=(VW_MAP_STATE.rows&&VW_MAP_STATE.rows.length?VW_MAP_STATE.rows:buildVWMapRows(S.res?.ctyRes||[])).map(r=>({row:r,s:computeCountySignals(r)}));
  const key=type==='political'?'political':type==='civic'?'civic':type==='security'?'security':'market';
  const title={political:'Political-economy stress',civic:'Civic-risk signal',security:'Security early-warning',market:'Election-market risk'}[type];
  const top=rows.sort((a,b)=>b.s[key]-a.s[key]).slice(0,8);
  const taxonomy=type==='security'?'<div class="note u-fs12 u-lh-snug">Taxonomy: Low civic tension · Localized tension · Narrative escalation · Administrative flashpoint · Security-sensitive area. This panel flags independent verification and civic monitoring needs; it does not prescribe coercive action.</div><div class="divider"></div>':'';
  return `${taxonomy}<div class="tscroll"><table class="tbl"><thead><tr><th>County</th><th>Region</th><th>${title}</th><th>Source Label</th><th>Driver</th></tr></thead><tbody>${top.map(x=>{const v=x.s[key];return `<tr><td>${x.row.name}</td><td>${x.row.cluster}</td><td class="${lensClass(v)}">${Math.round(v)}</td><td>${type==='political'||type==='market'?'proxy / synthetic':'computed / proxy'}</td><td>${v>=70?'Elevated validation priority':v>=45?'Watch signal':'Low-to-moderate signal'}</td></tr>`}).join('')}</tbody></table></div>`;
}
function getGeometryStats(){
  // geoBoundaries ADM1 outlines for all 47 counties (data/kenya-geo.js)
  const n=typeof KE_GEO!=='undefined'?KE_GEO.counties.length:0;
  return {verified:n,proxy:0,other:0,total:n,confidence:n===47?'High':'Partial'};
}

// Override map rows to include institutional overlay aggregates
const _buildVWMapRows_v44=buildVWMapRows;
buildVWMapRows=function(ctyRes){
  const rows=_buildVWMapRows_v44(ctyRes);
  rows.forEach(r=>{const sig=computeCountySignals(r);Object.assign(r.values,{politicalEconomyStress:sig.political,civicRiskSignal:sig.civic,securityEarlyWarning:sig.security,marketRiskSignal:sig.market});});
  return rows;
};
Object.assign(VW_MAP_INDICATORS,{
  politicalEconomyStress:{label:'Political-Economy Stress',unit:'score',min:0,max:100,dir:'lower',category:'Political economy',status:'proxy / synthetic',source:'VOTEWATCH scenario proxy bundle',formula:'fuel/food/insecurity/youth/protest proxy composite',desc:'Non-electoral explanatory stress signal',caveat:'Proxy/synthetic; requires verified economic and county data'},
  civicRiskSignal:{label:'Civic-Risk Signal',unit:'score',min:0,max:100,dir:'lower',category:'Civic risk',status:'computed / proxy',source:'VOTEWATCH civic-risk lens',formula:'voter education + misinformation + admin capacity + litigation sensitivity',desc:'Neutral civic-risk monitoring signal',caveat:'Use for validation priority, not intervention targeting'},
  securityEarlyWarning:{label:'Security Early-Warning',unit:'score',min:0,max:100,dir:'lower',category:'Security / civic tension',status:'proxy / synthetic',source:'VOTEWATCH early-warning taxonomy',formula:'civic tension + admin flashpoint + localized risk signals',desc:'Flags independent verification needs',caveat:'Not operational security guidance'},
  marketRiskSignal:{label:'Election-Market Risk',unit:'score',min:0,max:100,dir:'lower',category:'Frontier-market risk',status:'proxy / synthetic',source:'VOTEWATCH investor-risk lens',formula:'FX/spread/liquidity/tourism/infrastructure/business-disruption proxy composite',desc:'Election-market continuity risk signal',caveat:'Proxy only; not investment advice'}
});

// Override diagnostics for geometry honesty
const _mapDiagnostics_v44=mapDiagnostics;
mapDiagnostics=function(rows){
  const q=_mapDiagnostics_v44(rows); const g=getGeometryStats();
  q.countyDataMatch=rows.length;
  q.geometryMatch=q.boundaryMatched||0;
  q.verifiedGeometryCount=g.verified; q.proxyGeometryCount=g.proxy; q.otherGeometryCount=g.other;
  q.boundarySourceConfidence=g.confidence;
  q.modelOutputCompleteness=Math.round(((rows||[]).filter(r=>r.values&&Object.values(r.values).every(v=>typeof v==='number'&&!Number.isNaN(v))).length/(rows.length||1))*100);
  if(g.proxy>0)q.warnings.push(`${g.proxy} proxy completion geometries are present; 47/47 means data join completeness, not official boundary authority.`);
  q.status=(q.count===47&&q.boundaryMatched===47&&q.invalid.length===0&&q.proxyGeometryCount===0)?'PASS':(q.count===47&&q.boundaryMatched>=45?'WARNING':'FAIL');
  q.score=clamp(q.score-(g.proxy*1.5),0,100);
  return q;
};

// Public mode disables ward sensitivity ranking while preserving drilldown for internal use
const _rSens_v44=rSens;
rSens=function(){
  if(S.viewMode==='public'){$('#sensTbl').innerHTML=`<thead><tr><th>Public Mode</th><th>Reason</th><th>Allowed Output</th></tr></thead><tbody><tr><td>Ward-level sensitivity hidden</td><td>Responsible-use mode disables outputs that could be read as tactical targeting.</td><td>Use county-level threshold sensitivity, validation priorities and uncertainty hotspots.</td></tr></tbody>`;return;}
  _rSens_v44();
};



// ═══ v4.6 EXECUTIVE REPORT / UI REFINEMENT LAYER ═══
function openVwTab(tab){
  const btn=document.querySelector(`.tbtn[data-t="${tab}"]`), pane=document.querySelector(`#t-${tab}`);
  if(!btn||!pane)return;
  $$('.tbtn').forEach(b=>b.classList.remove('act'));
  $$('.tpane').forEach(p=>p.classList.remove('act'));
  btn.classList.add('act');pane.classList.add('act');
  if(S.dirty&&S.dirty.has(tab))renderPane(tab);else if(tab==='map'&&S.res){rMap(S.res.ctyRes);}
  if(tab==='report'){renderExecutiveReport();}
}
function currentScenarioSettings(){
  return {mode:S.mcMode,iterations:ITERS,seed:S.seed,viewMode:S.viewMode,theme:S.theme,protestVote:S.tf,incSwing:S.si,oppSwing:S.so,youthSurge:S.ys,followThrough:S.cfg.follow,teams:S.cfg.teams.map((t,i)=>`${t}: ${CAND.names.filter(n=>S.cfg.assign[n]===i).join(', ')||'nobody'}`).join(' · '),riftValley:S.reg.uda};
}
function qaStatusClass(status){return status==='PASS'?'qa-pass':status==='FAIL'?'qa-fail':'qa-warn';}
function technicalEngineQA(){
  const r=S.res||sim({},false,true,true);const mapQ=VW_MAP_STATE?.diagnostics||mapDiagnostics(VW_MAP_STATE?.rows||[]);const sharesOk=r.ctyRes.every(c=>Math.abs((c.i+c.o+c.t)-1)<0.002);const ctyOk=r.ctyRes.length===47;const wardOk=(S.wards||r.wardRes||[]).length===WARDS.length;const pollOk=!!S.cfg&&Array.isArray(S.cfg.teams);
  const checks=[
    ['County result count',ctyOk,`${r.ctyRes.length}/47`],['Simulation draws completed',!(S.mc&&S.mc.failed),S.mc?`${N.format((S.mc.iterations||0)-(S.mc.failed||0))}/${N.format(S.mc.iterations||0)}${S.mc.failed?' · '+S.mc.lastErr:''}`:'—'],['Ward drilldown rows',wardOk,`${(S.wards||r.wardRes||[]).length}/${N.format(WARDS.length)}`],['Shares normalize to 100%',sharesOk,sharesOk?'within tolerance':'check county sums'],['Article 138 uses county vote share',true,'candidate share ≥25%, not turnout'],['Teams configured',pollOk,`${S.cfg.teams.length} teams`],['MC mode configured',!!MC_MODES[S.mcMode],`${S.mcMode} · ${ITERS}`],['Map county data match',(mapQ.count||0)===47,`${mapQ.count||0}/47`],['Map geometry match',(mapQ.boundaryMatched||0)>=45,`${mapQ.boundaryMatched||0}/47`]
  ];
  const fails=checks.filter(x=>!x[1]).length;return {checks,status:fails?'WARNING':'PASS'};
}
function topRowsBy(arr,key,n=5,asc=false){return [...arr].sort((a,b)=>asc?(a[key]-b[key]):(b[key]-a[key])).slice(0,n);}
function movementFromBaselineRows(){
  const rows=(S.res?.ctyRes||[]).map(c=>{const base=CM.get(c.name)?.baseIncumbent2022??c.i;const tfBase=0.03;return {...c,incMove:c.i-base,tfMove:c.t-tfBase,a138Deterioration:0.25-c.i,runoffSensitivity:Math.max(0,0.5-Math.max(c.i,c.o))*100+Math.abs(c.i-0.25)*12};});
  return {gains:topRowsBy(rows,'incMove',5),losses:topRowsBy(rows,'incMove',5,true),tfSurge:topRowsBy(rows,'tfMove',5),a138:topRowsBy(rows,'a138Deterioration',5),runoff:topRowsBy(rows,'runoffSensitivity',5)};
}
// cols: [header, key or fn, optional cell class e.g. "r" for numbers]
function reportTable(rows,cols){return `<div class="tscroll"><table class="tbl"><thead><tr>${cols.map(c=>`<th${c[2]?` class="${c[2]}"`:''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td${c[2]?` class="${c[2]}"`:''}>${typeof c[1]==='function'?c[1](r):(r[c[1]]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
// Report v2: briefing built from app components. Sections are numbered so the
// printed page reads top-down: result → teams & tickets → running-mate scenarios →
// what it means → where it is decided → assumptions (→ model checks, analyst only).
const REPORT_SC_RUNS=150;
// Re-run the model for one ticket variant: deterministic shares + seeded mini Monte Carlo
function ticketScenario(mod,ti){
  const cfg=JSON.parse(JSON.stringify(S.cfg));cfg.tickets=cfg.tickets||[];mod(cfg);
  const key=JSON.stringify([cfg,S.rt,S.tf,S.si,S.so,S.ys,S.yg,S.ub,S.uo,S.ua,S.pollBias,S.reg,S.seed,S.mcMode,S.registerMode,S.pollMode,ti]);
  const C=(ticketScenario._c=ticketScenario._c||new Map());if(C.has(key))return C.get(key);
  if(C.size>80)C.clear();
  const r=sim({cfg},false,true,false),n=r.nat;
  const k=ti===0?'inc':ti===1?'opp':'t'+ti,oth=(n.others||[]).find(o=>o.key===k);
  const share=ti===0?n.i:ti===1?n.o:(oth?oth.share:0);
  const c25=r.ctyRes.filter(c=>(ti===0?c.i:ti===1?c.o:(oth&&c.oc?c.oc[oth.idx]/(c.tv||1):0))>=0.25).length;
  const res={share,c25,cfg,k,key,tk:ticketOf(cfg,ti)};C.set(key,res);return res;
}
// simulated columns for one scenario row (cached on the row result)
function ticketScenarioMC(res,ti){
  if(res.ro!=null)return res;
  const m=mc({cfg:res.cfg},REPORT_SC_RUNS);
  res.ro=m.ro;res.win=ti<=1?(ti===0?m.iW+m.ro*(m.r2Win.inc||0):m.oW+m.ro*(m.r2Win.opp||0)):m.ro*(m.r2Win[res.k]||0);
  return res;
}
function runningMateOptions(ti){
  const cur=ticketOf(S.cfg,ti),opts=[];
  const setR=r=>c=>{const t=ticketOf(c,ti);c.tickets[ti]={p:t.p,r};};
  opts.push({label:'No running mate',kind:'',r:null,mod:setR(null)});
  cur.members.filter(n=>n!==cur.p).forEach(n=>opts.push({label:n,kind:'On the team',r:n,mod:setR(n)}));
  if(ti===0){
    Object.entries(RM_PICKS).forEach(([id,p])=>opts.push({label:p.name,kind:'Outside the polls',r:'pick:'+id,mod:setR('pick:'+id)}));
    // the two biggest opposition names as defectors (or the current defector)
    const def=[...CANDIDATES].sort((a,b)=>b.avg-a.avg).map(c=>c.name).filter(n=>S.cfg.assign[n]!==0).slice(0,2);
    def.forEach(n=>opts.push({label:n,kind:'Defector',r:n,mod:c=>{c.assign[n]=0;c.defectors=[...new Set([...(c.defectors||[]),n])];c.tickets[0]={p:'William Ruto',r:n};}}));
  }
  return opts.map(o=>({...o,cur:(o.r||null)===(cur.r||null)}));
}
function renderExecutiveReport(){
  const el=$('#printReport'); if(!el)return;
  if(!S.res)renderAll();
  const r=S.res,n=r.nat,mc_=S.mc||mc({},ITERS),dr=disRisk(r.ctyRes),w=mc_.r2Win||{};
  if(!VW_MAP_STATE.rows||!VW_MAP_STATE.rows.length)rMap(r.ctyRes);
  const cn=s=>String(s||'').replace("Murang'A","Murang'a").replace('Tharaka - Nithi','Tharaka-Nithi').replace('Elgeyo/Marakwet','Elgeyo-Marakwet');
  const settings=currentScenarioSettings();
  const pr2=r2pair(n),runoff=mc_.ro>=0.5;
  const nm=k=>blocName(k);
  const col=k=>VZ.col(k),ink=k=>VZ.ink(k);
  const initials=s=>String(s||'').split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,1).concat(String(s||'').split(/\s+/).slice(-1).map(x=>x[0]||'')).join('').toUpperCase();
  const avgOf=s=>{const c=CANDIDATES.find(x=>x.name===s)||{};return S.pollMode==='all'||c.poll==null?c.pollAll:c.poll;};
  const date=new Date().toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'});
  const runs=`${N.format(mc_.iterations||ITERS)} seeded simulations${S.mcPending?' (refining)':''}`;
  const keyOf=ti=>ti===0?'inc':ti===1?'opp':'t'+ti;
  const othOf=k=>(n.others||[]).find(o=>o.key===k);
  const shareOf=k=>k==='inc'?n.i:k==='opp'?n.o:(othOf(k)||{share:0}).share;
  const c25Of=k=>{const o=othOf(k);return r.ctyRes.filter(c=>(k==='inc'?c.i:k==='opp'?c.o:(o&&c.oc?c.oc[o.idx]/(c.tv||1):0))>=0.25).length;};
  const winOf=k=>k==='inc'?mc_.iW+mc_.ro*(w.inc||0):k==='opp'?mc_.oW+mc_.ro*(w.opp||0):mc_.ro*(w[k]||0);

  // run-off (loyalty default + leans)
  const roV=['aff','toA','spl','toB'].map(d=>({d,res:r2sim(r.ctyRes,n,d)}));
  const roS=roV[0].res,fa=roS.a,fb=roS.b;
  const carriedA=roS.r2cty.filter(c=>c.r2lead===fa).length;

  // ── team tiles (teams first) ──
  const def=S.cfg.defectors||[];
  const person=(name,role,note,k)=>`<div class="rd-person"><span class="rd-av" style="--tc:${col(k)}">${mapEsc(initials(name))}</span>
    <span class="rd-pn"><b>${mapEsc(name)}</b><em>${role}${note?` · ${note}`:''}</em></span></div>`;
  const ticks=(nc,k)=>`<span class="ticks rd-ticks" style="--c:${col(k)}" aria-hidden="true">${Array.from({length:47},(_,i)=>`<i${i<nc?' class="on"':''}></i>`).join('')}</span>`;
  const tiles=S.cfg.teams.map((t,ti)=>{
    const k=ticketOf(S.cfg,ti);if(!k.members.length&&!k.pick)return '';
    const key=keyOf(ti),sh=shareOf(key),nc=c25Of(key),wn=winOf(key);
    const status=key===fa||key===fb?(roS.winner===key?'Wins the run-off':'In the run-off'):'Out after round one';
    const pPolls=avgOf(k.p)!=null?`${avgOf(k.p).toFixed(1)}% in polls`:'';
    const rmNote=k.pick?'outside the polls':(k.r&&avgOf(k.r)!=null?`${avgOf(k.r).toFixed(1)}% in polls${def.includes(k.r)&&ti===0?', crossed over':''}`:'');
    const behind=[...(k.ally?[k.ally]:[]),...k.off];
    return `<article class="rd-tile rd-team" style="--tc:${col(key)}">
      <header class="rd-team-h"><span class="rd-letter">${String.fromCharCode(65+ti)}</span><h4>${mapEsc(t)}</h4><span class="rd-status${status==='Out after round one'?' is-out':''}">${status}</span></header>
      <div class="rd-ticket">${person(k.p,'President',pPolls,key)}${k.rName?person(k.rName,'Running mate',rmNote,key):`<div class="rd-person is-empty"><span class="rd-av">–</span><span class="rd-pn"><b>No running mate</b></span></div>`}</div>
      <div class="rd-share"><b style="color:${ink(key)}">${pct(sh)}</b><span>first round<br>${fmtVotes(sh*n.valid)} votes</span></div>
      <div class="rd-metric"><span class="rd-ml">25%+ in <b>${nc}</b> of 47 counties</span>${ticks(nc,key)}<span class="rd-need">${nc>=24?'Passes':'Needs 24'}</span></div>
      <div class="rd-metric rd-win"><span class="rd-ml">Wins, this line-up</span><span class="rd-winbar"><i style="width:${(wn*100).toFixed(1)}%;background:${col(key)}"></i></span><b>${pct(wn,0)}</b></div>
      ${behind.length?`<p class="rd-behind"><span>Also on the team</span>${behind.map(b=>`<em>${mapEsc(b)}${avgOf(b)!=null?` ${avgOf(b).toFixed(1)}%`:''}</em>`).join('')}</p>`:''}
      ${k.pick?`<p class="rd-fine">${mapEsc(k.pick.name)}: ${mapEsc(rmEffectText(k.pick))}</p>`:''}
    </article>`;}).join('');
  const solos=(n.others||[]).filter(o=>o.key[0]==='s').sort((a,b)=>b.share-a.share);

  // ── round one ──
  const field=[{k:'inc',l:nm('inc'),v:n.i}].concat(n.B&&n.B.members.length?[{k:'opp',l:nm('opp'),v:n.o}]:[]).concat((n.others||[]).map(o=>({k:o.key,l:o.name,v:o.share}))).sort((a,b)=>b.v-a.v);
  let x=0;const r1=field.map(c=>{const s=`<i style="--x:${x};--w:${c.v};background:${col(c.k)}"></i>`;x+=c.v;return s;}).join('');
  const i25=c25Of('inc'),o25=c25Of('opp');

  // ── where it is decided ──
  const topTip=(S.tip||tipPts(r.ctyRes)).slice(0,5);
  const topDis=dr.close.slice().sort((a,b)=>Math.abs(a.ls-0.5)-Math.abs(b.ls-0.5)).slice(0,5);
  const leadK=c=>c.lead==='inc'?'inc':c.lead==='opp'?'opp':'x';

  // ── page 2: running-mate options ──
  const scQueue=[];
  const scTile=ti=>{
    const opts=runningMateOptions(ti);if(opts.length<2)return '';
    const rows=opts.map(o=>({...o,res:ticketScenario(o.mod,ti)}));
    const base=(rows.find(o=>o.cur)||rows[0]).res,max=Math.max(...rows.map(o=>o.res.share)),key=keyOf(ti);
    return `<article class="rd-tile rd-opts" style="--tc:${col(key)}"><header class="rd-th"><h4>Running mate for ${mapEsc(S.cfg.teams[ti])}</h4><span>${rows.length} options</span></header>
      <table class="rd-tbl"><thead><tr><th>Running mate</th><th>Round 1</th><th class="r">Change</th><th class="r">25%+</th><th class="r">Run-off</th><th class="r">Wins</th></tr></thead>
      <tbody>${rows.map((o,i)=>{const d=o.res.share-base.share;scQueue.push([o.res,ti,i]);return `<tr class="${o.cur?'is-cur':''}">
        <td><b>${mapEsc(o.label)}</b>${o.cur?' <span class="rd-cur">Current</span>':''}${o.kind?`<em>${o.kind}</em>`:''}</td>
        <td><span class="rd-bar"><i style="width:${(o.res.share/max*100).toFixed(1)}%"></i></span><span class="rd-num">${pct(o.res.share)}</span></td>
        <td class="r rd-num">${o.cur?'—':Math.abs(d)<0.0005?'0.0':(d>0?'+':'−')+Math.abs(d*100).toFixed(1)}</td>
        <td class="r rd-num">${o.res.c25}</td><td class="r rd-num" data-sc-ro="${ti}:${i}">${o.res.ro!=null?pct(o.res.ro,0):'…'}</td><td class="r rd-num rd-strong" data-sc-win="${ti}:${i}">${o.res.win!=null?pct(o.res.win,0):'…'}</td></tr>`;}).join('')}</tbody></table></article>`;
  };
  const lk=S.cfg.leak||LEAK_DEFAULT.leak,lt=(lk.home+lk.cross+lk.else)||1;
  const rtTxt=RT_REGIONS.filter(q=>S.rt[q.k]).map(q=>`${q.l} ${S.rt[q.k]>0?'+':'−'}${Math.abs(S.rt[q.k])}%`).join(' · ')||'No regional changes';
  const sw=[S.si&&`Swing to A ${S.si>0?'+':''}${S.si}`,S.so&&`Swing to B ${S.so>0?'+':''}${S.so}`,S.ys&&`Youth turnout ${S.ys>0?'+':''}${S.ys}`,S.ub&&`Undecided A/B break ${S.ub>0?'+':''}${S.ub} to A`,S.uo&&`Undecided to others ${S.uo>0?'+':''}${S.uo}`,S.ua&&`Undecided turnout ${S.ua>0?'+':''}${S.ua}`,S.pollBias&&'Poll-bias correction on',(S.yg??DEFAULTS.yg)!==DEFAULTS.yg&&`Youth lean ${S.yg}`,S.tf&&`Protest vote ${S.tf}`].filter(Boolean).join(' · ')||'None';
  const qa=technicalEngineQA(),move=movementFromBaselineRows();

  el.innerHTML=`<div class="rd">
  <header class="rd-head">
    <div><p class="rd-kicker">VoteWatch 2027 · Kenya presidential scenario</p>
      <h3 class="rd-title">${runoff?'Run-off likely':mc_.iW>=mc_.oW?`${mapEsc(nm('inc'))} wins in round one`:`${mapEsc(nm('opp'))} wins in round one`}</h3>
      <p class="rd-lede">${runoff?`${mapEsc(nm(pr2.a))} and ${mapEsc(nm(pr2.b))} meet in round two in ${pct(mc_.ro,0)} of ${runs}.`:`In ${pct(Math.max(mc_.iW,mc_.oW),0)} of ${runs}.`}</p></div>
    <p class="rd-meta">${date}<br>A scenario, not a prediction</p>
  </header>

  <section class="rd-teams" aria-label="Teams and tickets">${tiles}</section>
  ${solos.length?`<p class="rd-solo"><span>Running alone</span>${solos.map(o=>`<em><b>${mapEsc(o.name)}</b> ${pct(o.share)}</em>`).join('')}</p>`:''}

  <section class="rd-kpis">
    <div class="rd-tile rd-kpi"><span>Run-off</span><b>${pct(mc_.ro,0)}</b><em>if this line-up runs</em></div>
    <div class="rd-tile rd-kpi"><span>24-county test</span><b><span style="color:${ink('inc')}">${i25}</span><small> · </small><span style="color:${ink('opp')}">${o25}</span></b><em>A · B, needs 24</em></div>
    <div class="rd-tile rd-kpi"><span>Leader short of 50%</span><b>${field[0].v<0.5?fmtVotes((0.5-field[0].v)*n.valid):'—'}</b><em>votes for ${mapEsc(field[0].l)}</em></div>
    <div class="rd-tile rd-kpi"><span>Dispute risk</span><b class="${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}<small>/100</small></b><em>${dr.n} counties within 6 points</em></div>
  </section>

  <section class="rd-detail">
    <article class="rd-tile">
      <header class="rd-th"><h4>Round one</h4><span>${N.format(Math.round(n.valid))} valid votes · turnout ${pct(n.cast/REG_TOTAL,0)} of ${fmtVotes(REG_TOTAL)} (${mapEsc(REGISTER_MODES[S.registerMode||'current'].l.toLowerCase())})</span></header>
      <div class="rd-r1"><div class="rs"><div class="rs-segs">${r1}</div></div><span class="rd-half" aria-hidden="true"><i>50% + 1</i></span></div>
      <ul class="rd-legend">${field.slice(0,5).map(c=>`<li style="--c:${col(c.k)}"><i></i><span>${mapEsc(c.l)}</span><b>${pct(c.v)}</b></li>`).join('')}</ul>
      <p class="rd-note">Outright win needs over 50% and 25% in 24 counties. ${field[0].v<0.5?`${mapEsc(field[0].l)} is ${((0.5-field[0].v)*100).toFixed(1)} points short of 50%.`:''}</p>
    </article>
    <article class="rd-tile">
      <header class="rd-th"><h4>Run-off</h4><span>others follow their loyalties</span></header>
      <div class="rd-h2h">${[[fa,roS.shareA,roS.votesA,carriedA],[fb,roS.shareB,roS.votesB,47-carriedA]].map(([k,s_,v,cc],j)=>`<div class="rd-fin${j?' is-b':''}"><span>${mapEsc(nm(k))}</span><b style="color:${ink(k)}">${pct(s_)}</b><em>${N.format(Math.round(v))} votes · ${cc} counties</em></div>`).join('')}</div>
      <div class="rd-h2hbar"><i style="width:${(roS.shareA*100).toFixed(2)}%;background:${col(fa)}"></i><i style="width:${(roS.shareB*100).toFixed(2)}%;background:${col(fb)}"></i><span></span></div>
      <ul class="rd-leans">${roV.map(({d,res})=>`<li class="${d==='aff'?'is-cur':''}"><span>${d==='aff'?'Others follow their loyalties':d==='toA'?`Others lean to ${mapEsc(nm(fa))}`:d==='toB'?`Others lean to ${mapEsc(nm(fb))}`:'Others split evenly'}</span><b style="color:${ink(res.winner)}">${mapEsc(nm(res.winner))} ${pct(Math.max(res.shareA,res.shareB))}</b><em>${fmtVotes(res.votesA)} – ${fmtVotes(res.votesB)}</em></li>`).join('')}</ul>
    </article>
  
    <article class="rd-tile"><header class="rd-th"><h4>What this means</h4></header>
      <ol class="rd-means">${implTxt(r,mc_).map(t=>`<li>${t}</li>`).join('')}</ol></article>
    <article class="rd-tile"><header class="rd-th"><h4>Where it is decided</h4></header>
      <div class="rd-two">
        <div><p class="rd-sub">Near the 25% line · team A</p><ul class="rd-list">${topTip.map(t=>`<li><span>${mapEsc(cn(t.name))}</span><b>${pct(t.i)}</b></li>`).join('')}</ul></div>
        <div><p class="rd-sub">Closest counties</p><ul class="rd-list">${topDis.map(c=>`<li><span>${mapEsc(cn(c.name))}</span><b style="color:${ink(leadK(c))}">${c.lead==='inc'?'A':c.lead==='opp'?'B':'Other'} +${(Math.abs(c.ls-0.5)*100).toFixed(1)}</b></li>`).join('')}</ul></div>
      </div></article>
  </section>

  <section class="rd-page2">
    <header class="rd-th rd-p2h"><h4>Running-mate options</h4><span>each row re-runs the model with only the running mate changed · ${REPORT_SC_RUNS} seeded simulations per row</span></header>
    <div class="rd-optgrid">${S.cfg.teams.map((_,ti)=>scTile(ti)).join('')}</div>
    <article class="rd-tile rd-assume"><header class="rd-th"><h4>Assumptions</h4></header>
      <dl>
        <div><dt>Running mate's supporters who follow</dt><dd>${S.cfg.follow}%</dd></div>
        <div><dt>Off-ticket supporters who follow</dt><dd>${S.cfg.offFollow??LEAK_DEFAULT.off}%</dd></div>
        <div><dt>Where the rest go</dt><dd>${Math.round(lk.home/lt*100)}% stay home · ${Math.round(lk.cross/lt*100)}% cross over · ${Math.round(lk.else/lt*100)}% elsewhere</dd></div>
        <div><dt>Turnout by region</dt><dd>${rtTxt}</dd></div>
        <div><dt>Swings</dt><dd>${sw}</dd></div>
        <div><dt>Simulation</dt><dd>${mapEsc(settings.mode)} · ${N.format(settings.iterations)} runs · seed ${mapEsc(settings.seed)}</dd></div>
      </dl>
      <p class="rd-fine">Percentages are shares of simulations of this line-up with these assumptions, not the chance that this line-up forms. Candidate levels come from the average of validated polls (one-poll figures count half). In a run-off, everyone else's voters follow their candidates' assumed loyalties. Running-mate pulls outside the polls, follow-through, loyalties, the youth gap and the leak split are assumptions. Constituency estimates are anchored to constituency-level 2022 presidential results; ward estimates inherit their constituency political baseline and are not independent ward forecasts. Not externally validated. For civic, academic, journalistic and analytical use only; not for voter suppression, deceptive persuasion, intimidation, unofficial result claims or microtargeting.</p>
    </article>
    <div class="analyst-only rd-grid2">
      <article class="rd-tile"><header class="rd-th"><h4>Model checks</h4></header>${reportTable(qa.checks,[['Check',q=>q[0]],['Status',q=>q[1]?'<span class="qa-pass">Pass</span>':'<span class="qa-warn">Check</span>'],['Detail',q=>q[2]]])}</article>
      <article class="rd-tile"><header class="rd-th"><h4>Largest moves from 2022</h4></header>${reportTable(move.gains.slice(0,4).concat(move.losses.slice(0,4)),[['County',q=>mapEsc(cn(q.name))],['Change since 2022',q=>(q.incMove>0?'+':'−')+Math.abs(q.incMove*100).toFixed(1)+' pts','r'],['Team A now',q=>pct(q.i),'r']])}</article>
    </div>
  </section>
  </div>`;
  const job=(S.reportJob=(S.reportJob||0)+1);
  renderExecutiveReport.done=new Promise(resolve=>{
    const next=()=>{if(job!==S.reportJob)return resolve();
      const it=scQueue.shift();if(!it)return resolve();
      const [res,ti,i]=it;ticketScenarioMC(res,ti);
      const a=el.querySelector('[data-sc-ro="'+ti+':'+i+'"]'),b=el.querySelector('[data-sc-win="'+ti+':'+i+'"]');
      if(a)a.textContent=pct(res.ro,0);if(b)b.textContent=pct(res.win,0);
      setTimeout(next,0);};
    setTimeout(next,0);
  });
}
// Export waits for the full simulation (not the quick estimate) and the running-mate table
function reportReady(){return new Promise(res=>{const c=()=>S.mcPending?setTimeout(c,100):res();c();}).then(()=>{renderExecutiveReport();return renderExecutiveReport.done||Promise.resolve();});}
function printExecutiveReport(){openVwTab('report');reportReady().then(()=>setTimeout(()=>window.print(),150));}
function downloadReportHTML(){reportReady().then(()=>{const html=`<!doctype html><html><head><meta charset="utf-8"><title>VoteWatch 2027 scenario report</title><style>${Array.from(document.styleSheets).map(ss=>{try{return Array.from(ss.cssRules).map(r=>r.cssText).join('\n')}catch(e){return ''}}).join('\n')}</style></head><body><section class="print-report">${$('#printReport')?.innerHTML||''}</section></body></html>`;dlBlob(html,'votewatch2027_report.html','text/html');});}
// Range sliders: --v = filled track up to the value, --def = tick at the default (from the datalist)
function paintRange(el){
  const mn=+el.min||0,mx=+el.max||100,p=v=>((v-mn)/(mx-mn)*100).toFixed(2)+'%';
  el.style.setProperty('--v',p(+el.value));
  const d=el.list&&el.list.options[0];if(d)el.style.setProperty('--def',p(+d.value));
  // value bubble that rides on the thumb while dragging (text mirrors the label's output)
  const sl=el.closest('.sl');if(!sl)return;
  let b=el.nextElementSibling;
  if(!b||!b.classList.contains('sl-bub')){b=document.createElement('span');b.className='sl-bub';b.setAttribute('aria-hidden','true');el.after(b);}
  sl.style.setProperty('--p',((+el.value-mn)/(mx-mn)).toFixed(4));
  const out=el.id&&document.querySelector(`label[for="${el.id}"] output`);b.textContent=out?out.textContent:el.value;
}
function paintRanges(){document.querySelectorAll('input[type=range]').forEach(paintRange);}
document.addEventListener('input',e=>{if(e.target.type==='range')paintRange(e.target);});

// Override renderAll to append governance renders without rewriting base flow
const _renderAll_v44=renderAll;
renderAll=function(){_renderAll_v44();renderGovernanceWidgets();updateMcModeUI();updateViewModeLabels();applyTheme();paintRanges();};
// ═══ INIT ═══
function updateLabels(){
  $('#lv-tf').textContent=S.tf+'pp';
  $('#lv-si').textContent=(S.si>0?'+':'')+S.si+'pp';
  $('#lv-so').textContent=(S.so>0?'+':'')+S.so+'pp';
  $('#lv-ys').textContent=(S.ys>0?'+':'')+S.ys+'pp';
  if($('#lv-yg'))$('#lv-yg').textContent=(S.yg??DEFAULTS.yg)+'pp';
  if($('#lv-ub'))$('#lv-ub').textContent=(S.ub>0?'+':S.ub<0?'−':'±')+Math.abs(S.ub||0)+'pp';
  if($('#lv-uo'))$('#lv-uo').textContent=(S.uo>0?'+':S.uo<0?'−':'±')+Math.abs(S.uo||0)+'pp';
  if($('#lv-ua'))$('#lv-ua').textContent=(S.ua>0?'+':S.ua<0?'−':'±')+Math.abs(S.ua||0)+'%';
}

// Turnout by region: one slider per region, relative change in turnout
const fmtRt=v=>(v>0?'+':v<0?'−':'±')+Math.abs(v)+'%';
function buildRegionSliders(){
  const box=$('#rtGrid');if(!box)return;
  box.innerHTML=RT_REGIONS.map(r=>`<div class="sl"><label class="sl-top" for="rt-${r.k}"><span>${r.l}</span><output id="lv-rt-${r.k}">${fmtRt(S.rt[r.k]||0)}</output></label>
    <input type="range" id="rt-${r.k}" min="-20" max="20" step="1" value="${S.rt[r.k]||0}" list="dl-rt-${r.k}" title="Double-click to reset"><datalist id="dl-rt-${r.k}"><option value="${RT_DEFAULT[r.k]}"></option></datalist></div>`).join('');
  const rerender=dbnc(()=>{renderAll();rShockLog();},200);
  RT_REGIONS.forEach(r=>{const el=$('#rt-'+r.k);
    el.addEventListener('input',()=>{S.rt[r.k]=+el.value;$('#lv-rt-'+r.k).textContent=fmtRt(S.rt[r.k]);rerender();});
    el.addEventListener('dblclick',()=>{el.value=RT_DEFAULT[r.k];el.dispatchEvent(new Event('input',{bubbles:true}));});});
}
function syncRegionSliders(){RT_REGIONS.forEach(r=>{const el=$('#rt-'+r.k);if(el){el.value=S.rt[r.k]||0;$('#lv-rt-'+r.k).textContent=fmtRt(S.rt[r.k]||0);}});if(typeof paintRanges==='function')paintRanges();}
function bndSlider(id,key,scale){
  const el=$('#sl-'+id);if(!el)return;
  const rerender=dbnc(()=>{renderAll();rShockLog();},200);
  // double-click puts the slider back to its default
  el.addEventListener('dblclick',()=>{el.value=DEFAULTS[key]??0;el.dispatchEvent(new Event('input'));});
  el.addEventListener('input',e=>{
    // value label updates instantly; the (heavier) model re-run is debounced
    S[key]=Number(e.target.value)*scale;
    updateLabels();rerender();
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  // Tabs
  $$('.tbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $$('.tbtn').forEach(b=>b.classList.remove('act'));
      $$('.tpane').forEach(p=>p.classList.remove('act'));
      btn.classList.add('act');
      $('#t-'+btn.dataset.t).classList.add('act');
      if(btn.dataset.t==='map' && S.res){rMap(S.res.ctyRes);}
      if(btn.dataset.t==='report'){renderExecutiveReport();}
    });
  });

  // Sliders — store RAW integer values (scale=1), divide in engine
  bndSlider('tf','tf',1);   // slider 0–20 → S.tf=0–20 (raw pp)
  bndSlider('si','si',1);   // slider -12–12 → S.si=-12–12
  bndSlider('so','so',1);
  bndSlider('ys','ys',1);   // slider -5–18 → S.ys
  bndSlider('yg','yg',1);   // slider 0–25 → S.yg (youth lean against team A)
  bndSlider('ub','ub',1);   // slider -30–30 → S.ub (undecided A/B break toward team A)
  bndSlider('uo','uo',1);   // slider -20–20 → S.uo (undecided shift to/from other candidates)
  bndSlider('ua','ua',1);   // slider -30–30 → S.ua (undecided-cohort turnout sensitivity)
  $$('.tbtn').forEach(b=>b.addEventListener('click',()=>{const t=b.dataset.t;if(S.dirty&&S.dirty.has(t))renderPane(t);}));
  // warm the scenario cards (the slowest tab) once the page is idle
  (window.requestIdleCallback||(f=>setTimeout(f,1200)))(()=>{try{rScen();S.dirty&&S.dirty.delete('mat');}catch(e){}},{timeout:3000});
  document.querySelectorAll('[data-flow]').forEach(btn=>btn.onclick=()=>{S.flowDir=btn.dataset.flow;document.querySelectorAll('[data-flow]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));if(S.res)VZ.flow($('#roFlow'),S.res,S.flowDir);});
  $('#sl-follow')?.addEventListener('dblclick',e=>{e.target.value=65;e.target.dispatchEvent(new Event('input'));});
  $('#sl-follow')?.addEventListener('input',e=>{S.cfg.follow=+e.target.value;$('#lv-follow').textContent=S.cfg.follow+'%';rerenderTeams();});
  renderTeams();
  buildRegionSliders();
  // off-ticket follow-through and where the rest go
  const bindLeak=(id,apply,def)=>{const el=$('#'+id);if(!el)return;
    el.addEventListener('input',()=>{apply(+el.value);renderTickets(S.cfg.teams.map((_,ti)=>ticketOf(S.cfg,ti)));rerenderTeams();});
    el.addEventListener('dblclick',()=>{el.value=def;el.dispatchEvent(new Event('input',{bubbles:true}));});};
  const lkOf=()=>(S.cfg.leak=S.cfg.leak||{...LEAK_DEFAULT.leak});
  bindLeak('sl-off',v=>S.cfg.offFollow=v,LEAK_DEFAULT.off);
  bindLeak('sl-lh',v=>lkOf().home=v,LEAK_DEFAULT.leak.home);
  bindLeak('sl-lc',v=>lkOf().cross=v,LEAK_DEFAULT.leak.cross);
  bindLeak('sl-le',v=>lkOf().else=v,LEAK_DEFAULT.leak.else);

  $('#bRefresh').addEventListener('click',()=>{addShock();renderAll();decayShocks();rShockLog();S.timer=30;});
  $('#bReset').addEventListener('click',()=>{
    // Full reset: assumptions, political context, polls and probability settings.
    // (Previously left regimes/polls untouched and kept a stale iteration count and theme.)
    const {reg:dReg,rt:dRt,...dSl}=DEFAULTS;
    Object.assign(S,dSl,{shocks:[],shLog:[],shockN:0,timer:30,mcMode:'research',seed:'2027-baseline-001'});
    S.reg={...dReg};S.rt={...dRt};S.cfg=defaultCfg();syncRegionSliders();applyModelBase();
    $('#registerModeSelect')&&($('#registerModeSelect').value=S.registerMode);$('#pollModeSelect')&&($('#pollModeSelect').value=S.pollMode);$('#pollBiasSelect')&&($('#pollBiasSelect').value=S.pollBias?'on':'off');
    Object.keys(dSl).forEach(k=>{const el=$('#sl-'+k);if(el)el.value=S[k];});
    if(typeof renderTeams==='function')renderTeams();
    $('#mcModeSelect')&&($('#mcModeSelect').value=S.mcMode);$('#seedInput')&&($('#seedInput').value=S.seed);$('#viewModeSelect')&&($('#viewModeSelect').value=S.viewMode);
    syncRegimeUI();updateMcModeUI();updateViewModeLabels();updateLabels();renderAll();rShockLog();
  });

  $('#wardSrch')?.addEventListener('input',dbnc(()=>{if(S.wards)rWardDrill(S.wards);},80));
  // evidence settings: register scenario and poll universe rebuild the candidate field
  $('#registerModeSelect')?.addEventListener('change',e=>{S.registerMode=e.target.value||'current';applyModelBase();renderAll();rShockLog();});
  $('#pollModeSelect')?.addEventListener('change',e=>{S.pollMode=e.target.value||'validated';applyModelBase();renderTeams();renderAll();rShockLog();});
  $('#pollBiasSelect')?.addEventListener('change',e=>{S.pollBias=e.target.value==='on';_cfgCache.clear();renderAll();rShockLog();});



  // v4.5 governance controls
  $('#mcModeSelect')?.addEventListener('change',e=>{S.mcMode=e.target.value;updateMcModeUI();renderAll();rShockLog();});
  $('#seedInput')?.addEventListener('change',e=>{S.seed=e.target.value||'2027-baseline-001';updateMcModeUI();renderAll();rShockLog();});
  $('#viewModeSelect')?.addEventListener('change',e=>{S.viewMode=e.target.value;updateViewModeLabels();renderAll();});
  $('#themeSelect')?.addEventListener('change',e=>{S.theme=e.target.value;applyTheme();});
  updateMcModeUI();updateViewModeLabels();applyTheme();

  // Live events: synthetic shocks every 30s. Off by default so numbers don't
  // change while someone is reading them; toggled from the header.
  setInterval(()=>{
    if(!S.live)return;
    S.timer=Math.max(0,S.timer-1);
    const d=`${S.timer}s`;
    ['#hTimer','#timerDisp','#shBadge'].forEach(s=>{const el=$(s);if(el)el.textContent=d;});
    if(S.timer<=0){addShock();renderAll();decayShocks();rShockLog();S.timer=30;}
  },1000);

  syncRegimeUI();
  updateLabels();
  renderAll();
});
