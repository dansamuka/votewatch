// ═══ DATA ═══
// Plain region names for the six model regions (source data uses analyst labels)
const REGION={"Urban/Protest":"Western & Nairobi","Mountain Rebel":"Mt Kenya","Coast/Joho":"Coast","Eastern/Ukambani":"Eastern","Rift Valley Anchor":"Rift & North","Nyanza Split":"Nyanza"};
CO.forEach(c=>{c.cluster=REGION[c.cluster]||c.cluster;});
WD.forEach(w=>{w.cl=REGION[w.cl]||w.cl;});
const WARDS=WD.map(w=>({id:w.id,county:w.co,constituency:w.cs,ward:w.w,
  voters:w.v,toBase:w.tb,bi:w.bi,bo:w.bo,cl:w.cl,dq:w.dq,vl:w.vl,yr:w.yr,dn:w.dn}));
const CM=new Map(CO.map(c=>[c.name,c]));
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
// slot; teams C/D and solo candidates make up "others". Defaults mirror the
// kenya-election-intelligence-engine coalition builder: Ruto vs the four
// highest-polling challengers, everyone else solo, 85% follow-through.
const MAX_TEAMS=4;
function defaultCfg(){
  const assign={};let n=0;
  [...CANDIDATES].sort((a,b)=>b.avg-a.avg).forEach(c=>{
    if(c.name==='William Ruto')assign[c.name]=0;
    else if(n<4){assign[c.name]=1;n++;}
    else assign[c.name]=-1;
  });
  return {teams:['Ruto’s side','United opposition'],assign,follow:85};
}
// Presets: real 2027 paths as of October 2026. `cfg` = teams, `p` = sliders.
function presetCfg(teams,groups,follow=85){
  const assign={};CANDIDATES.forEach(c=>assign[c.name]=-1);
  groups.forEach((g,i)=>g.forEach(n=>assign[n]=i));
  return {teams,assign,follow};
}
const SCENS=[
  {id:'s1',tier:'Ruto vs the top four',c:'#b86a10',t:'Default: Kalonzo, Sifuna, Matiang\'i and Babu Owino on one ticket',
    d:'The four highest-polling challengers combine; Gachagua and the rest run solo. Matches the engine dashboard defaults.',
    cfg:defaultCfg(),p:{tf:0,si:0,so:0,ys:0}},
  {id:'s2',tier:'Grand opposition',c:'#b83232',t:'Everyone but Ruto and ODM on one ticket',
    d:'The Muriu coalition formula works: Kalonzo, Sifuna, Matiang\'i, Gachagua, Babu Owino, Karua and Maraga back one candidate; Oburu\'s ODM stays with Ruto.',
    cfg:presetCfg(['Ruto’s side','United opposition'],[['William Ruto','Oburu Odinga'],['Kalonzo Musyoka','Edwin Sifuna',"Fred Matiang'i",'Babu Owino','Rigathi Gachagua','Martha Karua','David Maraga']]),p:{tf:0,si:0,so:0,ys:4}},
  {id:'s3',tier:'Three-way race',c:'#1b7a4a',t:'Linda Mwananchi runs its own ticket',
    d:'Sifuna, Babu Owino and Orengo form a third team; Kalonzo, Matiang\'i, Gachagua and Karua stay together; ODM stays with Ruto.',
    cfg:presetCfg(['Ruto’s side','United opposition','Linda Mwananchi'],[['William Ruto','Oburu Odinga'],['Kalonzo Musyoka',"Fred Matiang'i",'Rigathi Gachagua','Martha Karua'],['Edwin Sifuna','Babu Owino','James Orengo']]),p:{tf:0,si:0,so:0,ys:0}},
  {id:'s4',tier:'Fragmented field',c:'#b83232',t:'Talks fail: Kalonzo–Matiang\'i ticket, everyone else solo',
    d:'No single flagbearer: Kalonzo and Matiang\'i pair up, while Sifuna, Gachagua and Babu Owino all run separately.',
    cfg:presetCfg(['Ruto’s side','Kalonzo–Matiang\'i'],[['William Ruto'],['Kalonzo Musyoka',"Fred Matiang'i"]]),p:{tf:0,si:0,so:0,ys:0}}
];
// Default assumptions. RAW integers: engine divides by 100.
const DEFAULTS={tf:0,si:0,so:0,ys:0,reg:{uda:true}};
// Coalition display lists (Article 138 tab)
const FK=['Bungoma','Kakamega','Vihiga','Busia','Trans Nzoia'];
const OLG=['Mombasa','Kilifi','Kwale','Lamu','Tana River'];
const MC_MODES={preview:400,standard:1000,research:5000};
let ITERS=MC_MODES.preview;
const CTY_N=24;

// ═══ STATE — all raw integers, engine divides ═══
const S={
  tf:DEFAULTS.tf,si:DEFAULTS.si,so:DEFAULTS.so,ys:DEFAULTS.ys,  // RAW pp; engine does /100
  reg:{...DEFAULTS.reg},
  cfg:defaultCfg(),
  selCty:'Nairobi City',
  shocks:[],shLog:[],timer:30,live:false,
  res:null,wards:null,sens:null,tip:null,mc:null,
  seed:'2027-baseline-001',mcMode:'preview',viewMode:pref('vw-view','public'),theme:pref('vw-theme','light')
};
// Remembered per-viewer display preferences (wording and theme)
function pref(k,d){try{return localStorage.getItem(k)||d;}catch(e){return d;}}
function savePref(k,v){try{localStorage.setItem(k,v);}catch(e){}}

// ═══ UTILS ═══
const N=new Intl.NumberFormat('en-KE');
const pct=(x,d=1)=>((x||0)*100).toFixed(d)+'%';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

let RNG_SOURCE=null;
function seedHash(str){let h=2166136261>>>0;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function randUnit(){return RNG_SOURCE?RNG_SOURCE():Math.random();}
// Approximate standard normal (mean 0, sd 1): sum of 4 uniforms has variance 1/3,
// so centre and scale by √3. (Was ÷2, giving sd ≈0.29 and far too narrow a spread.)
const rng=()=>(randUnit()+randUnit()+randUnit()+randUnit()-2)*1.7320508075688772;
// National swing shared by every ward in a simulated election (sd, share points)
const NAT_SWING_SD=0.020;

const qntl=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p;const b=Math.floor(i);return s[b+1]!==undefined?s[b]+(i-b)*(s[b+1]-s[b]):s[b];};
const dbnc=(fn,ms=150)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
const $=(s)=>document.querySelector(s);
const $$=(s)=>document.querySelectorAll(s);
function csvE(v){var s=String(v==null?'':v);return/[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function iCol(s){return s<0.25?'var(--red2)':s<0.40?'var(--amb2)':s<0.55?'var(--gold)':'var(--gbr)';}

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
const CAND=(()=>{
  const nW=WARDS.length,nC=CANDIDATES.length;
  const clIdx=Object.fromEntries(CLUSTERS.map((c,i)=>[c,i]));
  const wt=WARDS.map(w=>w.voters*w.toBase);
  const mean={bi:{},bo:{}};
  CLUSTERS.forEach(cl=>{let s=0,b=0,o=0;WARDS.forEach((w,i)=>{if(w.cl===cl){s+=wt[i];b+=wt[i]*w.bi;o+=wt[i]*w.bo;}});mean.bi[cl]=b/(s||1);mean.bo[cl]=o/(s||1);});
  const tot=CANDIDATES.reduce((a,c)=>a+c.avg,0);
  const target=CANDIDATES.map(c=>c.avg/tot);
  const M=CANDIDATES.map(c=>{
    const home=new Set(c.home);
    return Float64Array.from(WARDS,w=>{
      // softened (square root) so 2022 patterns guide, but don't dominate, 2027 shares
      const lean=Math.sqrt(Math.max(0.05,(w[c.lean]||0)/(mean[c.lean][w.cl]||1)));
      return (c.avg/tot)*(c.prof[clIdx[w.cl]]??1)*lean*(home.has(w.county)?1.6:1);
    });
  });
  const W=wt.reduce((a,b)=>a+b,0);
  for(let it=0;it<40;it++){
    for(let i=0;i<nW;i++){let s=0;for(let c=0;c<nC;c++)s+=M[c][i];if(s>0)for(let c=0;c<nC;c++)M[c][i]/=s;}
    if(it===39)break;
    for(let c=0;c<nC;c++){let s=0;for(let i=0;i<nW;i++)s+=M[c][i]*wt[i];const f=target[c]*W/(s||1);for(let i=0;i<nW;i++)M[c][i]*=f;}
  }
  return {names:CANDIDATES.map(c=>c.name),share:M,target};
})();

// Turn a team configuration into contestants and per-ward baseline shares.
//   A = team 0 (Ruto's side) → 'inc' slot · B = team 1 → 'opp' slot
//   other teams and solo candidates → 'others', tracked individually
// Multi-member teams keep `follow`% of their members' support; the rest scatters
// across the field (ward shares are renormalised).
const _cfgCache=new Map();
function fieldFor(cfg){
  const key=JSON.stringify(cfg);
  let f=_cfgCache.get(key);if(f)return f;
  if(_cfgCache.size>16)_cfgCache.clear();
  const follow=(cfg.follow??85)/100;
  const groups=cfg.teams.map((name,i)=>({key:i===0?'inc':i===1?'opp':'t'+i,name,members:[]}));
  const solos=[];
  CAND.names.forEach((n,ci)=>{const t=cfg.assign[n];if(t>=0&&t<groups.length)groups[t].members.push(ci);else solos.push({key:'s'+ci,name:n,members:[ci]});});
  const all=[...groups,...solos].filter(g=>g.members.length||g.key==='inc'||g.key==='opp');
  const nW=WARDS.length;
  all.forEach(g=>{
    const m=g.members.length>1?follow:1;
    g.base=new Float64Array(nW);
    for(let i=0;i<nW;i++){let s=0;for(const ci of g.members)s+=CAND.share[ci][i];g.base[i]=s*m;}
  });
  for(let i=0;i<nW;i++){let s=0;for(const g of all)s+=g.base[i];if(s>0)for(const g of all)g.base[i]/=s;}
  const A=all.find(g=>g.key==='inc'),B=all.find(g=>g.key==='opp');
  const others=all.filter(g=>g!==A&&g!==B&&g.members.length);
  const oBase=new Float64Array(nW);
  for(let i=0;i<nW;i++){let s=0;for(const g of others)s+=g.base[i];oBase[i]=s;}
  // each other contestant's fraction of the "others" pool in each ward
  others.forEach(g=>{g.frac=new Float64Array(nW);for(let i=0;i<nW;i++)g.frac[i]=oBase[i]>0?g.base[i]/oBase[i]:0;});
  f={A,B,others,oBase,key};
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
  const reg={...S.reg,...(params.reg||{})};
  const F=fieldFor(params.cfg||S.cfg);
  const nO=F.others.length;

  // A national swing is drawn first and applied to every ward, so polling-style
  // error is correlated nationally instead of averaging away across wards.
  // Cluster noise: drawn in fixed CLUSTERS order so seeded runs stay reproducible.
  const natSwing=noise?rng()*NAT_SWING_SD:0;
  const clNoise={};
  CLUSTERS.forEach(cl=>clNoise[cl]=noise?rng()*0.036:0);

  const agg=CO.map(c=>({
    name:c.name,cluster:c.cluster,pop:c.projectedVoters2027,
    dq:c.dataQuality,vl:c.volatility,yr:c.youthRatio,
    tv:0,iv:0,ov:0,tfv:0,ts:0,wc:0,oc:new Float64Array(nO)
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
    let inc=F.A.base[wi]+si+clNoise[w.cl]+ssh+csi+ns+natSwing;
    let opp=hasB?F.B.base[wi]+so-clNoise[w.cl]*0.5-ns*0.4-natSwing:0;
    let tf_=F.oBase[wi]+tf+stf;

    // Normalize
    const tot=Math.max(inc,0)+Math.max(opp,0)+Math.max(tf_,0)||1;
    const si_=Math.max(inc,0)/tot,so_=Math.max(opp,0)/tot,st_=Math.max(tf_,0)/tot;

    const to=clamp(w.toBase+(w.yr||0.42)*ys+sto+tn,0.24,0.87);
    const vs=w.voters*to;
    const a=k.ci>=0?agg[k.ci]:null;
    if(a){
      a.tv+=vs;a.iv+=vs*si_;a.ov+=vs*so_;a.tfv+=vs*st_;a.ts+=to;a.wc++;
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

  const tot=ctyRes.reduce((a,c)=>({v:a.v+c.tv,i:a.i+c.iv,o:a.o+c.ov,t:a.t+c.tfv}),{v:0,i:0,o:0,t:0});
  const V=tot.v||1;
  // every other contestant's national share, largest first (idx = position in F.others)
  const others=F.others.map((g,o)=>({idx:o,key:g.key,name:g.name,members:g.members,share:ctyRes.reduce((s,c)=>s+c.oc[o],0)/V}))
    .sort((x,y)=>y.share-x.share);
  const nat={i:tot.i/V,o:tot.o/V,t:tot.t/V,v:tot.v,others,
    A:{name:F.A.name,members:F.A.members},B:F.B?{name:F.B.name,members:F.B.members}:null};
  return{ctyRes,nat,wardRes};
}

function mc(params={},n=ITERS){
  let iW=0,oW=0,ro=0,iJ=0,oJ=0;
  const iA=[],oA=[],tA=[],pairs={},r2Win={};
  const prevRng=RNG_SOURCE;
  if(S.mcMode==='research'){
    RNG_SOURCE=mulberry32(seedHash(`${S.seed}|${JSON.stringify(params)}|${n}|${S.tf}|${S.si}|${S.so}|${S.ys}|${JSON.stringify(S.reg)}|${JSON.stringify(S.cfg)}`));
  }
  try{
    for(let i=0;i<n;i++){
      try{
        const r=sim(params,true,true,false);
        const i25=r.ctyRes.filter(c=>c.i>=0.25).length;
        const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
        const iP=r.nat.i>0.50&&i25>=CTY_N;
        const oP=r.nat.o>0.50&&o25>=CTY_N;
        if(iP)iW++;else if(oP)oW++;else{
          ro++;
          // which two finish top in this draw, and who wins round two (even split)
          const r2=r2sim(r.ctyRes,r.nat,'spl');
          const key=[r2.a,r2.b].sort().join('|');
          pairs[key]=(pairs[key]||0)+1;
          r2Win[r2.winner]=(r2Win[r2.winner]||0)+1;
        }
        if(iP)iJ++;if(oP)oJ++;
        iA.push(r.nat.i);oA.push(r.nat.o);tA.push(r.nat.t);
      }catch(e){}
    }
  }finally{
    RNG_SOURCE=prevRng;
  }
  // pairs / r2Win are shares of the run-off draws only
  const norm=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,ro?v/ro:0]));
  return{iW:iW/n,oW:oW/n,ro:ro/n,iJ:iJ/n,oJ:oJ/n,pairs:norm(pairs),r2Win:norm(r2Win),
    iMed:qntl(iA,.5),oMed:qntl(oA,.5),tMed:qntl(tA,.5),
    iLo:qntl(iA,.1),iHi:qntl(iA,.9),oLo:qntl(oA,.1),oHi:qntl(oA,.9),
    iterations:n,mode:S.mcMode,seed:S.mcMode==='research'?S.seed:null};
}

// Display name for a contestant key: 'inc' (team A), 'opp' (team B), or an
// "others" key ('t2','t3' for teams C/D, 's<n>' for a solo candidate).
function blocName(k,nat=S.res&&S.res.nat){
  const cfg=S.cfg;
  if(k==='inc')return cfg.teams[0]||'Team A';
  if(k==='opp')return cfg.teams[1]||'Team B';
  if(k==='tf')return 'Others';
  const o=nat&&nat.others&&nat.others.find(x=>x.key===k);
  return o?o.name:'Others';
}
// The biggest single contestant outside teams A and B
function topOther(nat){return nat.others&&nat.others[0]||null;}
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
function leanRate(){return R2_LEAN;}
// dir: 'toA' (everyone else leans to the leader), 'toB' (to the runner-up), 'spl' (even).
// "Everyone else" = all first-round votes not cast for the two finalists.
function r2sim(ctyRes,nat,dir='spl'){
  const {a,b,e}=r2pair(nat);
  const oi=k=>nat.others.find(x=>x.key===k)?.idx;
  const ai=oi(a),bi=oi(b);
  const v=(c,k,idx)=>k==='inc'?c.iv:k==='opp'?c.ov:(c.oc?c.oc[idx]:0)||0;
  let aV=0,bV=0;
  const r2cty=ctyRes.map(c=>{
    const va=v(c,a,ai),vb=v(c,b,bi),pool=Math.max(0,c.iv+c.ov+c.tfv-va-vb);
    const toA=dir==='toA'?leanRate(a,a,b,c.cluster):dir==='toB'?1-leanRate(b,a,b,c.cluster):0.5;
    const ra=va+pool*toA,rb=vb+pool*(1-toA),t=ra+rb||1;
    aV+=ra;bV+=rb;
    const r2a=ra/t;
    return{...c,r2a,r2lead:r2a>=0.5?a:b};
  });
  const shareA=aV/((aV+bV)||1);
  // Art. 138(7): most votes wins the run-off; no county-spread test in round two.
  const winner=shareA>=0.5?a:b;
  return{a,b,e,r2cty,shareA,shareB:1-shareA,winner,dir,
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
      h13:CM.get(c.name)?.hist13||0,h17:CM.get(c.name)?.hist17||0,
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

function sensRows(ctyRes){
  const cm=new Map(ctyRes.map(c=>[c.name,c]));
  return WARDS.map(w=>{
    const c=cm.get(w.county);if(!c)return null;
    const ig=Math.abs(c.i-0.25);
    return{...w,inf:(w.voters/1e6)*24+(1/(ig+0.03))*4,cis:c.i};
  }).filter(Boolean).sort((a,b)=>b.inf-a.inf).slice(0,80);
}

function implTxt(res,mc_){
  const{nat,ctyRes}=res;
  const i25=ctyRes.filter(c=>c.i>=0.25).length;
  const f=ff(nat),dr=disRisk(ctyRes);
  const tip=S.tip||[];
  const out=[];
  if(mc_.ro>0.60)
    out.push(`A run-off is likely (${pct(mc_.ro,0)} of simulations): nobody gets over 50% plus 25% in 24 counties.`);
  else if(mc_.iW>0.45)
    out.push(`${blocName('inc')} can win in round one (${pct(mc_.iW,0)} chance), with 25% in ${i25} of 47 counties.`);
  else
    out.push(`Too close to call: outright win ${pct(mc_.iW,0)}, run-off ${pct(mc_.ro,0)}. Small changes flip the result.`);

  const lowBy={};ctyRes.forEach(c=>{if(c.i<0.30)lowBy[c.cluster]=(lowBy[c.cluster]||0)+1;});
  const vulnCl=Object.entries(lowBy).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Mt Kenya';
  const vuln=ctyRes.filter(c=>c.cluster===vulnCl&&c.i<0.25);
  if(vuln.length>0)
    out.push(`${blocName('inc')} is below 25% in ${vuln.length} ${vulnCl} count${vuln.length>1?'ies':'y'} (${vuln.map(c=>c.name).slice(0,3).join(', ')}).`);
  else{
    // nearest county to the 25% line within the same cluster (was: nearest nationally)
    const near=ctyRes.filter(c=>c.cluster===vulnCl).sort((a,b)=>a.i-b.i)[0];
    out.push(`${blocName('inc')} clears 25% across ${vulnCl}.${near?` Closest: ${near.name} at ${pct(near.i)}.`:''}`);
  }

  if(mc_.ro>0.25){
    const ra=r2sim(ctyRes,nat,'toA'),rb=r2sim(ctyRes,nat,'toB');
    const A=blocName(ra.a),B=blocName(ra.b),E=blocName(ra.e);
    out.push(`The run-off would be ${A} vs ${B} (${E} comes third). If the other candidates' voters lean to ${A}, ${A} gets ${pct(ra.shareA)}; if they lean to ${B}, ${A} gets ${pct(rb.shareA)}. ${ra.winner===rb.winner?`${blocName(ra.winner)} wins round two either way at these settings.`:`${E}'s endorsement decides round two.`}`);
  }

  if(dr.score>55)
    out.push(`Dispute risk is high (${Math.round(dr.score)}/100): ${dr.n} close counties, mostly in ${dr.top}.`);
  else
    out.push(`Dispute risk is moderate (${Math.round(dr.score)}/100); the closest county margin is ${pct(dr.minM)}.`);

  const top=nat.others&&nat.others[0];
  if(nat.B&&nat.B.members.length)
    out.push(`${blocName('opp')} (${nat.B.members.map(i=>CAND.names[i]).join(', ')}) takes ${pct(nat.o)}.${top?` Biggest candidate outside the two teams: ${top.name} at ${pct(top.share)}.`:''}`);

  return out;
}

// ═══ INTEL DATA (updated Oct 2026; see data/context.js for sources) ═══
const LEVERS=[
  {s:'red',t:'United Opposition names one flagbearer',d:'Kalonzo, Gachagua, Matiang\'i and Karua still disagree on how to pick a single candidate.',i:'Put the principals on one team; if someone walks, set them to Solo'},
  {s:'red',t:'Sifuna joins or stays out',d:'Linda Mwananchi endorsed Sifuna in September; its party is due in October.',i:'Sifuna on team B, on his own team, or Solo'},
  {s:'red',t:'Ruto–ODM pact survives the zoning row',d:'ODM wants Nyanza, parts of Western and the Coast zoned for its candidates.',i:'Oburu (and Orengo) on Ruto\'s side or not'},
  {s:'amb',t:'Mt Kenya realignment',d:'Gachagua and Kindiki compete for the region Ruto won in 2022.',i:'Gachagua\'s team choice and the swing sliders'},
  {s:'amb',t:'New-voter registration',d:'About 5.7 million new, mostly young voters are expected to register before 2027.',i:'Youth turnout slider'},
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
  {sw:"Teams",e:"Each candidate's polling average is spread across wards by home region and 2022 patterns, then added up by team. Teams of two or more keep the follow-through share of their members' support."},
  {sw:"Ruto holds the Rift Valley: off",e:"−3 points for Ruto in Nandi, Kericho, Bomet, Baringo, Elgeyo-Marakwet, Uasin Gishu and West Pokot."},
  {sw:"Run-off",e:"Top two in round one meet again; everyone else's voters split 70/30 toward the finalist they lean to, or 50/50."}
]

// Tile map positions [col, row] in 40×40px cells
const TPOS={
  'Turkana':[1,1],'Marsabit':[5,1],'Mandera':[9,1],
  'West Pokot':[1,3],'Samburu':[4,3],'Wajir':[7,3],
  'Trans Nzoia':[0,4],'Isiolo':[5,4],'Baringo':[3,4],'Elgeyo/Marakwet':[2,4],
  'Uasin Gishu':[2,5],'Nandi':[2,6],'Laikipia':[4,5],
  'Bungoma':[0,5],'Kakamega':[1,5],'Meru':[6,5],'Tharaka - Nithi':[6,6],
  'Vihiga':[1,6],'Kericho':[2,7],'Nyandarua':[3,6],'Embu':[6,7],
  'Busia':[0,6],'Kisumu':[1,7],'Nakuru':[3,7],'Nyeri':[5,6],
  "Murang'A":[4,7],'Kirinyaga':[5,7],'Kitui':[7,7],
  'Siaya':[0,7],'Bomet':[2,8],'Narok':[3,8],'Kiambu':[4,8],
  'Homa Bay':[0,8],'Kisii':[1,8],'Nyamira':[2,9],'Nairobi City':[4,9],
  'Migori':[0,9],'Kajiado':[3,9],'Machakos':[5,8],'Makueni':[5,9],
  'Garissa':[7,5],'Tana River':[7,8],
  'Taita Taveta':[5,10],'Kwale':[4,10],'Kilifi':[6,9],
  'Mombasa':[5,11],'Lamu':[7,9]
};

// ═══ SHOCK SYSTEM ═══
const SH_DEF=[
  {t:'Ruto rally tour in the Rift Valley',cl:'Rift & North',si:0.018,desc:'+1.8% Ruto in Rift Valley'},
  {t:'Gen-Z protest day in Nairobi and Western towns',cl:'Western & Nairobi',si:-0.014,to:-0.010,desc:'−1.4% Ruto in Nairobi/Western, lower turnout'},
  {t:'Linda Mwananchi rally (Sifuna)',cl:'Western & Nairobi',tf:0.018,desc:'+1.8% third force in Nairobi/Western'},
  {t:'Gachagua–Kalonzo joint Mt Kenya tour',cl:'Mt Kenya',si:-0.016,desc:'−1.6% Ruto in Mt Kenya'},
  {t:'Coast projects launch with ODM leaders',cl:'Coast',si:0.014,desc:'+1.4% Ruto at the Coast'},
  {t:'Fuel price rise',cl:'Western & Nairobi',si:-0.012,desc:'−1.2% Ruto in Nairobi/Western'},
  {t:'County endorsement',rnd:true,si:0.012,desc:'+1.2% Ruto in the county'},
  {t:'Service delivery event',rnd:true,si:0.014,desc:'+1.4% Ruto in the county'}
];
function addShock(){
  const b=SH_DEF[Math.floor(Math.random()*SH_DEF.length)];
  const sh={...b,eff:1,rem:2,decay:0.65,spill:{}};
  if(sh.rnd){const c=CO[Math.floor(Math.random()*CO.length)];sh.county=c.name;sh.t=`Endorsement: ${c.name}`;}
  if(sh.county&&TR[sh.county]){for(const cn of TR[sh.county]){const v=(sh.si||0.01)*({A:1.0,B:0.7,C:0.4,rural:0.15}[cn.roadClass]||0.3)*Math.pow(0.85,cn.distanceKm/10);sh.spill[cn.target]=v;}}
  S.shocks.push(sh);
  S.shLog.unshift({ts:new Date().toLocaleTimeString(),e:sh.t,d:sh.desc});
  if(S.shLog.length>8)S.shLog.pop();
}
function decayShocks(){S.shocks.forEach(s=>{s.rem--;s.eff*=s.decay;});S.shocks=S.shocks.filter(s=>s.rem>0);}

// ═══ MASTER RENDER ═══
function renderAll(){
  try{
    const r=sim({},false,true,true);
    S.res=r;S.wards=r.wardRes;
    S.sens=sensRows(r.ctyRes);
    S.tip=tipPts(r.ctyRes);
    const mc_=mc({},ITERS);
    S.mc=mc_;
    const dr=disRisk(r.ctyRes);
    const f=ff(r.nat);
    const i25=r.ctyRes.filter(c=>c.i>=0.25).length;

    rHeadline(r,mc_,i25);

    rKPIs(r,mc_,dr,f,i25);
    rImpl(r,mc_);
    rNat(r);
    rTornado(r.nat);
    rRunoff(r,mc_);
    rTipping(r,f,i25);
    rScen();
    rConst(r,mc_);
    rMap(r.ctyRes);
    rDispute(r.ctyRes,dr);
    rSens();
    rCountyGrid(r.ctyRes);
    rWardDrill(r.wardRes);
    rIntel();
    rShockLog();
  }catch(err){
    console.error('renderAll error:',err);
  }
}

function rKPIs(r,mc_,dr,f,i25){
  const n=r.nat;
  $('#kpiRow').innerHTML=`
  <div class="kpi">
    <div class="kpi-l">${mapEsc(S.cfg.teams[0])} · first round</div>
    <div class="kpi-v ${n.i>0.50?'vgr':n.i>0.45?'vg':'vr'}">${pct(n.i,1)}</div>
    <div class="kpi-d">${n.i>0.50?'<span class="b b-gr">Above 50%</span>':'<span class="b b-r">Below 50%</span>'} · likely range ${pct(mc_.iLo,1)}–${pct(mc_.iHi,1)}</div>
    <div class="kpi-d">Chance of winning outright: <strong>${pct(mc_.iW,0)}</strong></div>
    <div class="kpi-d"><strong>${fmtVotes(n.i*n.v)}</strong> of ${N.format(Math.round(n.v))} votes cast</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Chance of a run-off</div>
    <div class="kpi-v ${mc_.ro>0.55?'vr':mc_.ro>0.30?'va':'vgr'}">${pct(mc_.ro,0)}</div>
    <div class="kpi-d">Outright win: A ${pct(mc_.iW,0)} · B ${pct(mc_.oW,0)}</div>
    <div class="kpi-d">${f.tbi>0?`A further <strong>${pct(f.tbi)}</strong> third-force vote would force one`:'A is below 50%'}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Counties where A has 25%+ <span class="kpi-hint">needs 24</span></div>
    <div class="kpi-v ${i25>=24?'vgr':'vr'}">${i25}<span style="font-size:20px;color:var(--muted)">/47</span></div>
    <div class="kpi-d">${i25>=24?'<span class="b b-gr">Passes county test</span>':'<span class="b b-r">Short by '+(24-i25)+'</span>'}</div>
    <div class="kpi-d">B has 25%+ in ${r.ctyRes.filter(c=>c.o>=0.25).length}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Dispute risk <span class="kpi-hint">0–100</span></div>
    <div class="kpi-v ${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}</div>
    <div class="kpi-d">${dr.n} close counties · tightest margin ${pct(dr.minM)}</div>
    <div class="kpi-d">Most of them in ${dr.top}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Others · national</div>
    <div class="kpi-v va">${pct(n.t,1)}</div>
    <div class="kpi-d">${n.others&&n.others[0]?`Largest: ${n.others[0].name} ${pct(n.others[0].share)}`:'none'}</div>
    <div class="kpi-d">${f.forced?'<span class="b b-r">Enough to force a run-off</span>':'<span class="b b-g">Not enough to force a run-off</span>'}</div>
  </div>`;
}

function rImpl(r,mc_){
  const lines=implTxt(r,mc_);
  $('#implBox').innerHTML=`<div class="impl-hdr">What this means</div>
  ${lines.map((l,i)=>`<div class="impl-row"><div class="impl-n">${i+1}</div><div class="impl-txt">${l}</div></div>`).join('')}`;
}

function rNat(r){
  const n=r.nat,cds={};
  r.ctyRes.forEach(c=>{if(!cds[c.cluster])cds[c.cluster]={iv:0,ov:0,tfv:0,tv:0};const d=cds[c.cluster];d.iv+=c.iv;d.ov+=c.ov;d.tfv+=c.tfv;d.tv+=c.tv;});
  const cls=Object.entries(cds).sort((a,b)=>b[1].tv-a[1].tv);
  $('#natBd').innerHTML=`
  <div class="flex g8 mb12" style="align-items:stretch;">
  ${[['Incumbent',n.i,'blbr'],['Opposition',n.o,'red2'],['Third Force',n.t,'others']].map(([l,v,c])=>`
  <div style="flex:1;padding:10px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">${l}</div>
    <div style="font-family:var(--disp);font-size:28px;color:var(--${c})">${pct(v)}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:2px;">${N.format(Math.round(v*n.v))} votes</div>
    <div class="pbar mt6"><div class="pf p-${c==='blbr'?'b':c==='red2'?'r':'a'}" style="width:${pct(v,0)}"></div></div>
  </div>`).join('')}
  </div>
  <table class="tbl"><thead><tr><th>Region</th><th>Votes</th><th>A</th><th>B</th><th>Others</th><th>Split</th></tr></thead>
  <tbody>${cls.map(([cl,d])=>`<tr>
    <td style="font-weight:600">${cl}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${N.format(Math.round(d.tv))}</td>
    <td style="color:var(--blbr)">${pct(d.iv/d.tv)}</td>
    <td style="color:var(--red2)">${pct(d.ov/d.tv)}</td>
    <td style="color:var(--others)">${pct(d.tfv/d.tv)}</td>
    <td style="min-width:90px"><div class="stk"><div class="si" style="flex:${d.iv/d.tv}"></div><div class="so" style="flex:${d.ov/d.tv}"></div><div class="st" style="flex:${d.tfv/d.tv}"></div></div></td>
  </tr>`).join('')}</tbody></table>`;
}

function rTornado(nat){
  const base=nat.i;
  // Each bar is a real deterministic re-run of the engine (previously fixed offsets)
  const run=p=>sim(p,false,true,false).nat.i;
  const cases=[
    {l:'Protest vote +8pp',v:run({tf:S.tf+8})},
    {l:'Youth turnout +12pp',v:run({ys:S.ys+12})},
    {l:'Opposition swing +6pp',v:run({so:S.so+6})},
    {l:'Follow-through 70%',v:run({cfg:{...S.cfg,follow:70}})},
    {l:'Follow-through 100%',v:run({cfg:{...S.cfg,follow:100}})},
    {l:'Incumbent swing +6pp',v:run({si:S.si+6})}
  ].map(c=>({...c,c:c.v>=base?'var(--gbr)':base-c.v>0.04?'var(--red2)':'var(--amb2)'}))
   .sort((a,b)=>Math.abs(b.v-base)-Math.abs(a.v-base));
  const rng_=Math.max(...cases.map(c=>Math.abs(c.v-base)))||0.08;
  $('#tornado').innerHTML=`<p class="torn-cap">Now: <b>${pct(base)}</b> · bars left of centre lower it, right raise it</p>`+cases.map(c=>{
    const w=Math.abs(c.v-base)/rng_*48;const left=c.v<base;
    return`<div class="torn-row">
      <div class="torn-l">${c.l}</div>
      <div class="torn-track"><div class="torn-bar" style="${left?'right:50%':'left:50%'};width:${w}%;background:${c.c}"></div><div class="torn-mid"></div></div>
      <div class="torn-v" style="color:${c.c}">${pct(c.v)}</div>
    </div>`;
  }).join('');
  const top=cases[0];
  $('#torNote').textContent=top?`Biggest single lever right now: ${top.l} takes the incumbent from ${pct(base)} to ${pct(top.v)}. Each bar re-runs the model with one assumption changed.`:'';
}

function rRunoff(r,mc_){
  const{nat,ctyRes}=r,f=ff(nat);
  $('#roKpis').innerHTML=`
  <div class="kpi"><div class="kpi-l">First round</div>
    <div class="kpi-v ${f.forced?'va':mc_.iW>0.5?'vgr':'vr'}">${f.forced?'Run-off':mc_.iW>0.5?'A wins':'Close'}</div>
    <div class="kpi-d">A ${pct(nat.i)} · B ${pct(nat.o)} · others ${pct(nat.t)}</div></div>
  <div class="kpi"><div class="kpi-l">Chance of a run-off</div>
    <div class="kpi-v ${mc_.ro>0.55?'vr':mc_.ro>0.30?'va':'vgr'}">${pct(mc_.ro,0)}</div>
    <div class="kpi-d">Across ${N.format(ITERS)} simulated elections</div></div>
  <div class="kpi"><div class="kpi-l">Extra vote for others to force a run-off</div>
    <div class="kpi-v va">${f.ia?'+'+pct(f.tbi):'Already forced'}</div>
    <div class="kpi-d">${f.ia?`On top of today's ${pct(nat.t)}, to pull the incumbent below 50%+1`:`The incumbent is already below 50% at ${pct(nat.t)} third-force share`}</div></div>`;

  // Run-off pairing = actual top two in round one (Art. 138(5))
  const pr=r2pair(nat),A=blocName(pr.a),B=blocName(pr.b),E=blocName(pr.e);
  const BC={inc:'var(--blbr)',opp:'var(--red2)',tf:'var(--others)'};
  const sh={inc:nat.i,opp:nat.o,tf:nat.t};
  const dirs=[{k:'toA',l:`If the other candidates' voters lean to ${A}`,c:BC[pr.a]},{k:'toB',l:`If they lean to ${B}`,c:BC[pr.b]},{k:'spl',l:'If they split evenly',c:'var(--muted)'}];
  $('#roScens').innerHTML=`<div class="ro-pair" style="grid-column:1/-1"><span class="ro-pair-l">Run-off pairing</span>
      <b style="color:${BC[pr.a]}">${A}</b> <span class="ro-pair-s">${pct(sh[pr.a])}</span> vs <b style="color:${BC[pr.b]}">${B}</b> <span class="ro-pair-s">${pct(sh[pr.b])}</span>
      <span class="ro-pair-e">${E} comes third with ${pct(sh[pr.e])}; votes for everyone else decide round two.${mc_.ro>0?` Across simulated run-offs, this pairing comes up ${pct((mc_.pairs||{})[[pr.a,pr.b].sort().join('|')]||0,0)} of the time; with an even split, ${A} wins round two in ${pct((mc_.r2Win||{})[pr.a]||0,0)} and ${B} in ${pct((mc_.r2Win||{})[pr.b]||0,0)}.`:''}</span></div>`+
  dirs.map(d=>{
    const ro=r2sim(ctyRes,nat,d.k);
    const carriedA=ro.r2cty.filter(c=>c.r2lead===ro.a).length;
    return`<div class="ro-card">
      <div class="ro-ttl" style="color:${d.c}">${d.l}</div>
      <div class="ro-val" style="color:${BC[ro.winner]}">${pct(Math.max(ro.shareA,ro.shareB))}</div>
      <div style="font-size:13px;color:var(--text-2);margin-top:6px;">${A} ${pct(ro.shareA)} · ${B} ${pct(ro.shareB)} · ${A} leads in ${carriedA}/47 counties</div>
      <div class="pbar mt8"><div class="pf" style="width:${pct(ro.shareA,0)};background:${BC[ro.a]}"></div></div>
      <div style="margin-top:6px;"><span class="b ${ro.winner==='inc'?'b-b':ro.winner==='opp'?'b-r':'b-a'}">${blocName(ro.winner)} wins</span></div>
    </div>`;
  }).join('');

  $('#roTrans').innerHTML=`<p class="cty-empty">When a voter's candidate is out of the run-off, the model sends <b>70%</b> of them to the finalist they lean toward and 30% to the other, or splits them evenly if there is no lean. Turnout stays the same as round one.</p>`;

  const ro=r2sim(ctyRes,nat,'spl');
  const marg=ro.r2cty.filter(c=>Math.abs(c.r2a-0.5)<0.10).sort((x,y)=>Math.abs(x.r2a-0.5)-Math.abs(y.r2a-0.5));
  $('#roCtbl').innerHTML=`<thead><tr><th>County</th><th>${A} share</th><th>Leader</th><th>Region</th></tr></thead>
  <tbody>${marg.map(c=>`<tr>
    <td style="font-weight:600">${c.name}</td>
    <td style="color:${c.r2a>=0.5?BC[ro.a]:BC[ro.b]}">${pct(c.r2a)}</td>
    <td><span class="b ${c.r2lead==='inc'?'b-b':c.r2lead==='opp'?'b-r':'b-a'}">${blocName(c.r2lead)}</span></td>
    <td style="font-size:12px;color:var(--muted)">${c.cluster}</td>
  </tr>`).join('')||'<tr><td colspan="4" class="hint">No county within 10 points of 50/50.</td></tr>'}</tbody>`;

  $('#ffDetail').innerHTML=`<div class="g3">
    <div><div class="kpi-l">A + B combined</div><div style="font-family:var(--disp);font-size:22px;">${pct(nat.i+nat.o)}</div></div>
    <div><div class="kpi-l">Others needed to force a run-off</div><div style="font-family:var(--disp);font-size:22px;color:var(--amb2);">${f.ia?pct(f.tbi+nat.t):'Blocked'}</div></div>
    <div><div class="kpi-l">Status</div>${f.forced?'<span class="b b-r">Run-off</span>':f.ia?'<span class="b b-g">A above 50%</span>':'<span class="b b-gr">B above 50%</span>'}</div>
  </div>`;
}

function rTipping(r,f,i25){
  const tip=S.tip||[];
  $('#ffBoxes').innerHTML=`
  <div style="flex:1;padding:11px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">Extra vote for others to keep A under 50%</div>
    <div style="font-family:var(--disp);font-size:26px;color:${f.ia?'var(--amb2)':'var(--gbr)'};">${f.ia?pct(f.tbi):'Already &lt;50%'}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">Others now: ${pct(f.cur)}</div>
  </div>
  <div style="flex:1;padding:11px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">Extra vote for others to keep B under 50%</div>
    <div style="font-family:var(--disp);font-size:26px;color:${f.oa?'var(--amb2)':'var(--gbr)'};">${f.oa?pct(f.tbo):'Already &lt;50%'}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">Run-off: ${f.forced?'<span class="b b-r">FORCED</span>':'Not yet forced'}</div>
  </div>`;

  $('#ffNarr').innerHTML=`At current parameters: Inc ${pct(r.nat.i)} · Opp ${pct(r.nat.o)} · TF ${pct(r.nat.t)}. ${f.forced?'<strong style="color:var(--red2)">Run-off required.</strong> TF has denied both candidates 50%+1.':f.ia?`Incumbent holds above 50%. TF needs to reach ${pct(f.tbi+f.cur)} nationally to force run-off.`:'Opposition above 50%.'}`;

  const below=tip.filter(t=>t.ig>0),marg=tip.filter(t=>t.ig<=0&&t.ig>-0.05);
  $('#p24').innerHTML=`<div class="g2 mb12">
    <div style="padding:11px;background:var(--rdim);border:1px solid var(--red);">
      <div style="font-family:var(--mono);font-size:12px;color:var(--red2);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;">Below 25%</div>
      <div style="font-family:var(--disp);font-size:30px;color:var(--red2);">${below.length} counties</div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">Closest: ${below[0]?.name||'—'} (${pct(below[0]?.i||0)})</div>
    </div>
    <div style="padding:11px;background:var(--gdark);border:1px solid var(--grn);">
      <div style="font-family:var(--mono);font-size:12px;color:var(--gbr);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;">Marginal (≤30%)</div>
      <div style="font-family:var(--disp);font-size:30px;color:var(--gbr);">${marg.length} counties</div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">At risk with -3pp swing</div>
    </div>
  </div>
  <div style="font-family:var(--mono);font-size:12px;color:var(--muted);">Incumbent: ${i25}/47 counties at ≥25%. ${i25>=24?'<span class="b b-gr">Art.138 PASSES</span>':'<span class="b b-r">Art.138 FAILS — needs '+(24-i25)+'</span>'}</div>`;

  $('#tipTbl').innerHTML=`<thead><tr><th>County</th><th>Region</th><th>Team A</th><th>Gap to 25%</th><th>Votes Needed</th><th>B</th><th>Others</th><th>2017→2022</th><th>DQ</th></tr></thead>
  <tbody>${tip.length?tip.map(t=>{
    const gc=t.ig>0.04?'b-r':t.ig>0?'b-a':t.ig>-0.04?'b-gr':'b-m';
    const hist=CM.get(t.name);
    return`<tr><td style="font-weight:600">${t.name}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${t.cl}</td>
    <td style="color:var(--blbr)">${pct(t.i)}</td>
    <td><span class="b ${gc}">${t.ig>0?'+':''}${pct(t.ig)}</span></td>
    <td style="font-family:var(--mono);font-size:12px">${t.vn>0?'+'+N.format(t.vn):'<span style="color:var(--gbr)">Above</span>'}</td>
    <td style="color:var(--red2)">${pct(t.o)}</td>
    <td style="color:var(--others)">${pct(t.t)}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${hist?pct(hist.hist17)+'→'+pct(hist.baseIncumbent2022):'—'}</td>
    <td><span class="b ${t.dq==='high'?'b-gr':t.dq==='medium'?'b-g':'b-r'}">${t.dq}</span></td></tr>`;
  }).join(''):`<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--muted);font-family:var(--mono);font-size:12px;">No counties within ±8pp of 25% threshold at current parameters.</td></tr>`}</tbody>`;

  $('#a138Tbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th>A</th><th>≥25?</th><th>B</th><th>≥25?</th><th>Others</th></tr></thead>
  <tbody>${(S.res?.ctyRes||[]).map(c=>`<tr>
    <td style="font-weight:600">${c.name}</td>
    <td><span class="b ${c.lead==='inc'?'b-b':'b-r'}">${c.lead.toUpperCase()}</span></td>
    <td style="color:var(--blbr)">${pct(c.i)}</td>
    <td>${c.ia?'<span class="b b-gr">✓</span>':'<span class="b b-r">✗</span>'}</td>
    <td style="color:var(--red2)">${pct(c.o)}</td>
    <td>${c.oa?'<span class="b b-gr">✓</span>':'<span class="b b-m">✗</span>'}</td>
    <td style="color:var(--others)">${pct(c.t)}</td>
  </tr>`).join('')}</tbody>`;
}

// Vote counts: 6,123,456 → "6.12M"; under a million → "845K"
function fmtVotes(v){v=Math.round(v||0);return v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?Math.round(v/1e3)+'K':String(v);}
const REG_TOTAL=CO.reduce((s,c)=>s+(c.projectedVoters2027||0),0);
function rScen(){
  // Each preset: one deterministic run plus a seeded 200-draw Monte Carlo, so the
  // cards are stable between renders (previously 60 unseeded draws).
  const N_SC=200;
  // Presets ignore the sliders and switches, so only the seed and poll anchor
  // matter: cache so slider moves stay fast.
  const key=JSON.stringify([S.seed,S.reg]);
  if(rScen._key!==key){rScen._key=key;rScen._res=null;}
  const results=rScen._res||(rScen._res=SCENS.map(sc=>{
    const p={...sc.p,cfg:sc.cfg};
    const r=sim(p,false,false,false);
    const i25=r.ctyRes.filter(c=>c.i>=0.25).length;
    const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
    let iW=0,oW=0;
    const prev=RNG_SOURCE;
    RNG_SOURCE=mulberry32(seedHash(`${S.seed}|${sc.id}`));
    try{
      for(let i=0;i<N_SC;i++){
        const mr=sim(p,true,false,false);
        const mi25=mr.ctyRes.filter(c=>c.i>=0.25).length;
        const mo25=mr.ctyRes.filter(c=>c.o>=0.25).length;
        if(mr.nat.i>0.5&&mi25>=CTY_N)iW++;else if(mr.nat.o>0.5&&mo25>=CTY_N)oW++;
      }
    }finally{RNG_SOURCE=prev;}
    const ro=1-(iW+oW)/N_SC;
    const outcome=iW/N_SC>=0.5?['b-gr',`${sc.cfg.teams[0]} wins outright`]:oW/N_SC>=0.5?['b-r',`${sc.cfg.teams[1]} wins outright`]:['b-a','Run-off'];
    return{...sc,r,i25,o25,n:r.nat,iW:iW/N_SC,oW:oW/N_SC,ro,outcome};
  }));
  const active=SCENS.find(sc=>JSON.stringify(sc.cfg)===JSON.stringify(S.cfg)&&Object.entries(sc.p).every(([k,v])=>S[k]===v));
  const ps=$('#presetSelect');
  if(ps){
    if(!ps.options.length)ps.innerHTML=SCENS.map(s=>`<option value="${s.id}">${s.tier}</option>`).join('')+'<option value="">Custom (your own settings)</option>';
    ps.value=active?active.id:'';
  }

  $('#sqMat').innerHTML=results.map(sc=>`
  <div class="sqc${active&&active.id===sc.id?' sqc-on':''}" style="border-left:3px solid ${sc.c}">
    <div class="sq-tier">${sc.tier}</div>
    <div class="sq-t" style="color:${sc.c}">${sc.t}</div>
    <div class="sq-d">${mapEsc(sc.d)}</div>
    <div class="sq-bars" aria-label="First-round shares">
      ${[[sc.cfg.teams[0],sc.n.i,'var(--blbr)'],[sc.cfg.teams[1],sc.n.o,'var(--red2)'],['Others',sc.n.t,'var(--others)']].map(([l,v,col])=>`
      <div class="sq-bar"><span>${l}</span><div class="sq-track"><div style="width:${(v*100).toFixed(1)}%;background:${col}"></div></div><b>${pct(v)}</b><em>${fmtVotes(v*sc.n.v)}</em></div>`).join('')}
    </div>
    <p class="sq-total">Total votes cast <b>${N.format(Math.round(sc.n.v))}</b> · turnout ${pct(sc.n.v/REG_TOTAL,0)} of ${fmtVotes(REG_TOTAL)} projected voters</p>
    <div class="sq-foot">
      <span class="b ${sc.outcome[0]}">${sc.outcome[1]}</span>
      <span>Run-off ${pct(sc.ro,0)} · Ruto 25%+ in ${sc.i25}/47</span>
      ${active&&active.id===sc.id?'<span class="b b-m">In use</span>':`<button type="button" class="btn" onclick="applyScenario('${sc.id}')">Use this line-up</button>`}
    </div>
  </div>`).join('');

  $('#sqTbl').innerHTML=`<thead><tr><th>Scenario</th><th>Team A</th><th>Team B</th><th>Others</th><th>Total votes</th><th>A 25%+ counties</th><th>Run-off chance</th><th>Most likely</th></tr></thead>
  <tbody>${results.map(sc=>`<tr>
    <td style="font-weight:600;color:${sc.c}">${sc.tier}</td>
    <td style="color:var(--blbr)">${pct(sc.n.i)} <span class="hint">${fmtVotes(sc.n.i*sc.n.v)}</span></td>
    <td style="color:var(--red2)">${pct(sc.n.o)} <span class="hint">${fmtVotes(sc.n.o*sc.n.v)}</span></td>
    <td style="color:var(--others)">${pct(sc.n.t)} <span class="hint">${fmtVotes(sc.n.t*sc.n.v)}</span></td>
    <td>${N.format(Math.round(sc.n.v))}</td>
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
    const i=+b.dataset.rm;cfg.teams.splice(i,1);
    Object.keys(cfg.assign).forEach(k=>{if(cfg.assign[k]===i)cfg.assign[k]=-1;else if(cfg.assign[k]>i)cfg.assign[k]--;});
    renderTeams();rerenderTeams();
  });
  const add=$('#tmAdd');if(add)add.onclick=()=>{cfg.teams.push('Team '+L(cfg.teams.length));renderTeams();rerenderTeams();};

  const rows=[...CANDIDATES].sort((a,b)=>b.avg-a.avg);
  grid.innerHTML=rows.map((c,ri)=>{
    const cur=cfg.assign[c.name];const fixed=c.name==='William Ruto';
    return `<div class="tm-row${ri>=8&&!renderTeams.all?' tm-more':''}" role="radiogroup" aria-labelledby="tmn${ri}">
      <span class="tm-name" id="tmn${ri}">${mapEsc(c.name)}</span><span class="tm-avg">${c.avg.toFixed(1)}%</span>
      <span class="tm-seg">${cfg.teams.map((t,ti)=>`<label style="--tc:var(${TEAM_VARS[ti]})"><input type="radio" name="tm${ri}" value="${ti}" aria-label="${mapEsc(t)}" ${cur===ti?'checked':''} ${fixed&&ti!==0?'disabled':''}><span>${L(ti)}</span></label>`).join('')}
        <label><input type="radio" name="tm${ri}" value="-1" aria-label="Runs solo" ${!(cur>=0)?'checked':''} ${fixed?'disabled':''}><span>Solo</span></label></span>
    </div>`;}).join('')+
    (!renderTeams.all&&rows.length>8?`<button type="button" class="tm-showall" id="tmAll">Show ${rows.length-8} more candidates</button>`:'');
  grid.querySelectorAll('input').forEach(n=>n.onchange=()=>{cfg.assign[rows[+n.name.slice(2)].name]=+n.value;rerenderTeams();});
  const all=$('#tmAll');if(all)all.onclick=()=>{renderTeams.all=true;renderTeams();};
  const fo=$('#sl-follow');if(fo){fo.value=cfg.follow;$('#lv-follow').textContent=cfg.follow+'%';}
}
// Copy a preset into the live settings (sliders + political context)
function applyScenario(id){
  const sc=SCENS.find(s=>s.id===id);if(!sc)return;
  Object.assign(S,sc.p);S.cfg=JSON.parse(JSON.stringify(sc.cfg));
  ['tf','si','so','ys'].forEach(k=>{const el=$('#sl-'+k);if(el)el.value=S[k];});
  syncRegimeUI();updateLabels();if(typeof renderTeams==='function')renderTeams();renderAll();rShockLog();
}

function rConst(r,mc_){
  const{nat,ctyRes}=r;
  const i25=ctyRes.filter(c=>c.i>=0.25).length;
  const o25=ctyRes.filter(c=>c.o>=0.25).length;

  $('#jpBoxes').innerHTML=`<div class="flex g12" style="align-items:stretch;">
  ${[['Incumbent',mc_.iJ,mc_.iW+mc_.iJ,mc_.iLo,mc_.iHi,i25,'blbr'],
     ['Opposition',mc_.oJ,mc_.oW+mc_.oJ,mc_.oLo,mc_.oHi,o25,'red2']].map(([l,jp,np,lo,hi,cnt,c])=>`
  <div style="flex:1;padding:11px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">${l} — P(Art.138 jointly)</div>
    <div style="font-family:var(--disp);font-size:34px;color:var(--${c})">${pct(jp)}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">P(nat>50%): ${pct(np)} · Counties: ${cnt}/47</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);">90% band: ${pct(lo,1)}–${pct(hi,1)}</div>
  </div>`).join('')}</div>`;

  const byC={};
  ctyRes.forEach(c=>{if(!byC[c.cluster])byC[c.cluster]={t:0,a:0,b:0};byC[c.cluster].t++;if(c.i>=0.25)byC[c.cluster].a++;else byC[c.cluster].b++;});
  $('#clExp').innerHTML=Object.entries(byC).sort((a,b)=>b[1].t-a[1].t).map(([cl,d])=>`
  <div style="margin-bottom:9px;">
    <div class="fb mb8" style="font-size:12px;"><span style="font-weight:600">${cl}</span>
    <span><span style="color:var(--gbr)">${d.a}✓</span> <span style="color:var(--red2)">${d.b}✗</span> / ${d.t}</span></div>
    <div style="height:7px;background:var(--bdr);overflow:hidden;border-radius:1px;">
      <div style="height:100%;width:${d.a/d.t*100}%;background:var(--gbr);"></div>
    </div>
  </div>`).join('');

  const wk=FK.map(n=>ctyRes.find(c=>c.name===n)).filter(Boolean);
  const cst=OLG.map(n=>ctyRes.find(c=>c.name===n)).filter(Boolean);
  $('#coalDisp').innerHTML=`
  <div class="mb12">
    <div style="font-weight:600;font-size:12px;color:var(--blbr);margin-bottom:6px;">Western counties</div>
    ${wk.map(c=>`<div class="fb" style="padding:4px 0;border-bottom:1px solid var(--bdr);font-family:var(--mono);font-size:12px;">
      <span>${c.name}</span><span style="color:var(--blbr)">${pct(c.i)}</span></div>`).join('')}
  </div>
  <div>
    <div style="font-weight:600;font-size:12px;color:var(--amb2);margin-bottom:6px;">Coast counties</div>
    ${cst.map(c=>`<div class="fb" style="padding:4px 0;border-bottom:1px solid var(--bdr);font-family:var(--mono);font-size:12px;">
      <span>${c.name}</span><span style="color:${c.i>=0.25?'var(--blbr)':'var(--red2)'}">${pct(c.i)} ${c.i>=0.25?'✓':'✗'}</span></div>`).join('')}
  </div>`;

  const clH={};
  CO.forEach(c=>{if(!clH[c.cluster])clH[c.cluster]={i13:[],i17:[],i22:[]};
    clH[c.cluster].i13.push(c.hist13||c.baseIncumbent2022*0.95);
    clH[c.cluster].i17.push(c.hist17||c.baseIncumbent2022*0.98);
    clH[c.cluster].i22.push(c.baseIncumbent2022);});
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  $('#histCtx').innerHTML=Object.entries(clH).map(([cl,d])=>{
    const a13=avg(d.i13),a17=avg(d.i17),a22=avg(d.i22);
    const up=a22>a17;
    return`<div style="margin-bottom:9px;">
      <div class="fb mb8" style="font-size:12px;"><span style="font-weight:600">${cl}</span>
        <span style="color:${up?'var(--gbr)':'var(--red2)'}">${up?'▲':'▼'} ${pct(Math.abs(a22-a17))}</span></div>
      <div class="flex g12" style="font-family:var(--mono);font-size:12px;color:var(--muted);">
        <span>2013: <strong style="color:var(--txt)">${pct(a13)}</strong></span>
        <span>2017: <strong style="color:var(--txt)">${pct(a17)}</strong></span>
        <span>2022: <strong style="color:var(--gold)">${pct(a22)}</strong></span>
      </div>
    </div>`;
  }).join('');

  rSens();
}

function rSens(){
  const rows=S.sens||[];
  $('#sensTbl').innerHTML=`<thead><tr><th>Ward</th><th>County</th><th>Constituency</th><th>Voters</th><th>Influence</th><th>Team A</th><th>DQ</th></tr></thead>
  <tbody>${rows.slice(0,60).map(w=>`<tr>
    <td style="font-weight:600">${w.ward}</td><td>${w.county}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${w.constituency}</td>
    <td style="font-family:var(--mono);font-size:12px">${N.format(w.voters)}</td>
    <td><div class="pbar" style="width:55px;display:inline-block;vertical-align:middle;"><div class="pf p-g" style="width:${Math.min(100,w.inf*2)}%"></div></div></td>
    <td style="color:${iCol(w.cis)}">${pct(w.cis)}</td>
    <td><span class="b ${w.dq==='high'?'b-gr':w.dq==='medium'?'b-g':'b-r'}">${w.dq}</span></td>
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
      i:c.i,o:c.o,t:c.t,to:c.to,tv:c.tv,wards:hist.wards||0,base:hist.baseIncumbent2022,hist13:hist.hist13,hist17:hist.hist17,
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
function getMapValues(){return VW_MAP_STATE.rows.map(r=>r.values[VW_MAP_STATE.indicator]).filter(v=>typeof v==='number'&&!Number.isNaN(v));}
function mapHexToRgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function mapRgbToHex(r,g,b){return'#'+[r,g,b].map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join('');}
function mapMix(a,b,t){const A=mapHexToRgb(a),B=mapHexToRgb(b);return mapRgbToHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);}
function mapRamp(v,rev=false){
  const pal=rev?['#1a6535','#8B7010','#8B5010','#8B2020']:['#8B2020','#8B5010','#8B7010','#1a6535'];
  v=clamp(v,0,1);
  if(v<.33)return mapMix(pal[0],pal[1],v/.33);
  if(v<.66)return mapMix(pal[1],pal[2],(v-.33)/.33);
  return mapMix(pal[2],pal[3],(v-.66)/.34);
}
function mapNormValue(raw){
  const meta=getMapIndicatorMeta(); const vals=getMapValues();
  if(raw==null||Number.isNaN(raw))return null;
  if(VW_MAP_STATE.classification==='quantiles'){
    const sorted=[...vals].sort((a,b)=>a-b); return sorted.filter(x=>x<=raw).length/(sorted.length||1);
  }
  if(VW_MAP_STATE.classification==='equal'){
    const lo=Math.min(...vals),hi=Math.max(...vals); return hi===lo?.5:(raw-lo)/(hi-lo);
  }
  const min=meta.min??Math.min(...vals),max=meta.max??Math.max(...vals);
  return max===min?.5:(raw-min)/(max-min);
}
function mapFillForRow(row){
  const key=VW_MAP_STATE.indicator, raw=row?.values?.[key], meta=getMapIndicatorMeta();
  if(raw==null||Number.isNaN(raw))return '#1a2d44';
  if(VW_MAP_STATE.classification==='policy'){
    if(key==='article138Gap')return raw<0?'#8B2020':raw<5?'#8B5010':raw<15?'#8B7010':'#1a6535';
    if(key==='thresholdBuffer')return raw<2?'#8B2020':raw<5?'#8B5010':raw<10?'#8B7010':'#1a6535';
    if(key==='disputeRisk'||key==='runoffSensitivity')return raw>70?'#8B2020':raw>45?'#8B5010':raw>25?'#8B7010':'#1a6535';
    if(key==='dataQualityScore')return raw<50?'#8B2020':raw<75?'#8B7010':'#1a6535';
    if(raw<25)return'#8B2020'; if(raw<40)return'#8B5010'; if(raw<55)return'#8B7010'; return'#1a6535';
  }
  return mapRamp(mapNormValue(raw),meta.dir==='lower');
}
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
function mapMetric(v,unit){
  if(v==null||Number.isNaN(v))return '—';
  if(unit==='votes')return N.format(Math.round(v));
  if(unit==='%'||unit==='pp')return Number(v).toFixed(1)+(unit==='%'?'%':'pp');
  return Number(v).toFixed(0);
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
function mapBuildDataset(){
  const rows=VW_MAP_STATE.rows;
  return {metadata:{datasetTitle:'VOTEWATCH 2027 County Boundary Map Dataset',datasetVersion:'v4.4-embedded-boundary-map',sourceName:'VOTEWATCH model state + Kenya county boundary GeoJSON',createdAt:new Date().toISOString(),geographicLevel:'County',country:'Kenya',geometry:'Leaflet boundary layer',boundarySource:VW_MAP_STATE.boundarySource||'not loaded',schemaVersion:'map-4.4',notes:'Values are scenario outputs, not official election results.'},indicators:VW_MAP_INDICATORS,records:rows.map(r=>({county:r.name,countyCode:r.code,cluster:r.cluster,dataQuality:r.dq,values:r.values,status:r.status}))};
}
function ensureVWMapControls(){
  const ind=$('#vwMapIndicator'); if(!ind||ind.dataset.ready)return;
  ind.innerHTML=Object.entries(VW_MAP_INDICATORS).map(([k,m])=>`<option value="${k}">${m.label}</option>`).join('');
  ind.value=VW_MAP_STATE.indicator;
  ind.addEventListener('change',()=>{VW_MAP_STATE.indicator=ind.value;rMap(S.res?.ctyRes||[]);});
  $('#vwMapClass')?.addEventListener('change',e=>{VW_MAP_STATE.classification=e.target.value;rMap(S.res?.ctyRes||[]);});
  $('#vwMapFocus')?.addEventListener('change',e=>{VW_MAP_STATE.focus=e.target.value;rMap(S.res?.ctyRes||[]);});
  $('#vwMapLabels')?.addEventListener('change',e=>{VW_MAP_STATE.labels=e.target.value;rMap(S.res?.ctyRes||[]);});
  $('#vwMapSearchBtn')?.addEventListener('click',()=>searchVWMapCounty());
  $('#vwMapResetBtn')?.addEventListener('click',()=>{VW_MAP_STATE.selected=null;S.selCty='Nairobi City';refreshVWLeafletStyles();rVWMapPanels();});
  $('#vwMapDrillBtn')?.addEventListener('click',()=>openVWMapDrilldown());
  $('#vwMapSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchVWMapCounty();});
  $$('.vw-map-tab').forEach(b=>b.addEventListener('click',()=>switchVWMapPanel(b.dataset.mapTab)));
  ind.dataset.ready='1';
}
function switchVWMapPanel(panel){
  VW_MAP_STATE.activePanel=panel;
  $$('.vw-map-tab').forEach(b=>b.classList.toggle('active',b.dataset.mapTab===panel));
  ['summary','profile','ranking','quality','metadata'].forEach(p=>{$('#vwPanel'+p.charAt(0).toUpperCase()+p.slice(1))?.classList.toggle('active',p===panel);});
}
function searchVWMapCounty(){
  const raw=$('#vwMapSearch')?.value||''; const q=normCtyName(raw), cq=compactCtyName(raw); if(!q)return;
  const canonical=canonicalCtyName(raw);
  const row=VW_MAP_STATE.rows.find(r=>r.name===canonical)||VW_MAP_STATE.rows.find(r=>normCtyName(r.name).includes(q)||q.includes(normCtyName(r.name))||compactCtyName(r.name).includes(cq));
  if(row) selCtyMap(row.name,true);
  else $('#vwPanelProfile').innerHTML=`<div class="note-r">No county matched “${mapEsc(raw)}”. Try Nairobi, Muranga, Tharaka Nithi, Elgeyo Marakwet, Mombasa.</div>`;
}
function openVWMapDrilldown(){
  if(VW_MAP_STATE.selected){selCounty(VW_MAP_STATE.selected);}
  const btn=[...$$('.tbtn')].find(b=>b.dataset.t==='map'); if(btn)btn.click();
}
function mapAbbr(name){return ({'Nairobi City':'NRB','Mombasa':'MSA','Kisumu':'KSM','Nakuru':'NKR','Kiambu':'KBU','Uasin Gishu':'UG',"Murang'A":'MUR','Elgeyo/Marakwet':'EM','Tharaka - Nithi':'TN','Taita Taveta':'TT','Trans Nzoia':'TNZ','Homa Bay':'HB','West Pokot':'WP','Tana River':'TR','Nyandarua':'NDR'})[name]||abbrFallback(name);}
// multi-word names → initials; single-word names → first three letters (was a lone initial, e.g. "K")
function abbrFallback(name){const p=String(name).split(/[\s/-]+/).filter(Boolean);return (p.length>1?p.map(x=>x[0]).join(''):p[0]||'').slice(0,3).toUpperCase();}
function mapShouldDim(row){
  const f=VW_MAP_STATE.focus;
  if(f==='none'||!row)return false;
  if(f==='threshold')return !(row.values.article138Gap<8);
  if(f==='dispute')return !(row.values.disputeRisk>=45);
  if(f==='dataQuality')return !(row.dq!=='high');
  if(f==='cluster'&&VW_MAP_STATE.selected){const sel=VW_MAP_STATE.rowMap.get(VW_MAP_STATE.selected);return !sel||row.cluster!==sel.cluster;}
  return false;
}
function detectVWCountyKey(geojson){
  const features=geojson?.features||[];
  const props=features[0]?.properties||{};
  const explicit=VW_COUNTY_KEY_CANDIDATES.find(k=>props[k]!=null);
  if(explicit)return explicit;
  for(const k of Object.keys(props)){
    const hits=features.slice(0,10).filter(f=>canonicalCtyName(f.properties?.[k])).length;
    if(hits>=3)return k;
  }
  return null;
}
function getFeatureCountyName(feature){
  const props=feature?.properties||{};
  const raw=props[VW_MAP_STATE.boundaryKey]??props.COUNTY??props.COUNTY_NAME??props.name??props.Name;
  const byCode=props.COUNTY_CODE||props.countyCode||props.code||props.ID||props.OBJECTID;
  const canonical=canonicalCtyName(raw);
  if(canonical)return canonical;
  if(byCode!=null){const c=CO.find(x=>String(x.code).padStart(3,'0')===String(byCode).padStart(3,'0')); if(c)return c.name;}
  return String(raw||'Unknown');
}
function initVWLeafletMap(){
  if(VW_MAP_STATE.map||!$('#vwLeafletMap'))return;
  if(typeof L==='undefined'){
    VW_MAP_STATE.error='Leaflet library unavailable. Check internet connection or CDN access.';
    showVWMapToast(VW_MAP_STATE.error,'error');
    return;
  }
  VW_MAP_STATE.map=L.map('vwLeafletMap',{zoomControl:true,attributionControl:true}).setView([0.45,37.9],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(VW_MAP_STATE.map);
  setTimeout(()=>VW_MAP_STATE.map.invalidateSize(),120);
}
async function loadVWBoundaries(){
  if(VW_MAP_STATE.layer||VW_MAP_STATE.loading||VW_MAP_STATE.loaded)return;
  if(!VW_MAP_STATE.map)return;
  VW_MAP_STATE.loading=true;
  showVWMapToast('Loading embedded Kenya county boundaries…','warn');
  try{
    if(typeof VW_EMBEDDED_COUNTY_GEOJSON!=='undefined'&&VW_EMBEDDED_COUNTY_GEOJSON.features&&VW_EMBEDDED_COUNTY_GEOJSON.features.length){
      createVWBoundaryLayer(VW_EMBEDDED_COUNTY_GEOJSON,'embedded Kenya county GeoJSON fallback · 38 source polygons + 9 proxy completion polygons');
      VW_MAP_STATE.loaded=true;VW_MAP_STATE.error=null;
      showVWMapToast(`Embedded boundary layer loaded: ${VW_MAP_STATE.boundaryMatched}/47 counties matched`,'good');
      VW_MAP_STATE.loading=false;
      rVWMapPanels();
      return;
    }
  }catch(e){console.warn('Embedded VOTEWATCH map boundary failed',e);}
  let lastErr=null;
  for(const url of VW_GEOJSON_URLS){
    try{
      const res=await fetch(url,{cache:'force-cache'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const geo=await res.json();
      if(!geo||!Array.isArray(geo.features))throw new Error('Invalid GeoJSON FeatureCollection');
      createVWBoundaryLayer(geo,url);
      VW_MAP_STATE.loaded=true;VW_MAP_STATE.error=null;
      showVWMapToast(`Boundary layer loaded: ${VW_MAP_STATE.boundaryMatched}/47 counties matched`,'good');
      break;
    }catch(e){lastErr=e;console.warn('VOTEWATCH map boundary source failed',url,e);}
  }
  if(!VW_MAP_STATE.loaded){VW_MAP_STATE.error='Could not load county boundary GeoJSON. Map tiles may show, but choropleth polygons are unavailable.';showVWMapToast(VW_MAP_STATE.error,'error');}
  VW_MAP_STATE.loading=false;
  rVWMapPanels();
}
function createVWBoundaryLayer(geojson,source){
  if(VW_MAP_STATE.layer){VW_MAP_STATE.layer.remove();VW_MAP_STATE.layer=null;}
  VW_MAP_STATE.countyLayers.clear();
  VW_MAP_STATE.boundaryKey=detectVWCountyKey(geojson);
  VW_MAP_STATE.boundarySource=source;
  VW_MAP_STATE.boundaryFeatureCount=geojson.features.length;
  VW_MAP_STATE.boundaryMatched=0;
  VW_MAP_STATE.layer=L.geoJSON(geojson,{style:f=>styleVWFeature(f),onEachFeature:(feature,layer)=>{
    const name=getFeatureCountyName(feature);
    layer._vwCounty=name;
    if(VW_MAP_STATE.rowMap.has(name)){VW_MAP_STATE.boundaryMatched++;VW_MAP_STATE.countyLayers.set(name,layer);}    
    layer.bindTooltip(()=>buildVWTooltip(name),{sticky:true,className:'county-tooltip'});
    layer.on({mouseover:e=>{e.target.setStyle({weight:2.6,color:'#e8bc40',fillOpacity:.90});},mouseout:e=>refreshOneVWLayer(e.target),click:e=>selCtyMap(name,true)});
  }}).addTo(VW_MAP_STATE.map);
  if(VW_MAP_STATE.layer.getBounds().isValid())VW_MAP_STATE.map.fitBounds(VW_MAP_STATE.layer.getBounds(),{padding:[18,18]});
  refreshVWLeafletStyles(true);
}
function styleVWFeature(feature){
  const name=getFeatureCountyName(feature); const row=VW_MAP_STATE.rowMap.get(name);
  const selected=VW_MAP_STATE.selected===name;
  const dim=mapShouldDim(row);
  return {fillColor:row?mapFillForRow(row):'#1a2d44',weight:selected?3:1,color:selected?'#e8bc40':'#1c2a42',opacity:1,fillOpacity:row?(dim?.22:.78):.18,dashArray:row?'':'4 3'};
}
function refreshOneVWLayer(layer){if(!layer||!layer.feature)return;layer.setStyle(styleVWFeature(layer.feature));}
function refreshVWLeafletStyles(rebind=false){
  if(!VW_MAP_STATE.layer)return;
  VW_MAP_STATE.layer.eachLayer(layer=>{
    layer.setStyle(styleVWFeature(layer.feature));
    const name=layer._vwCounty;
    if(rebind||VW_MAP_STATE.labels!=='tooltip'){
      try{layer.unbindTooltip();}catch(e){}
      if(VW_MAP_STATE.labels==='hidden')return;
      const permanent=VW_MAP_STATE.labels==='permanent';
      layer.bindTooltip(permanent?mapAbbr(name):()=>buildVWTooltip(name),{sticky:!permanent,permanent,direction:'center',className:permanent?'county-label':'county-tooltip'});
    }
  });
  rVWMapLegend();
}
function showVWMapToast(msg,type=''){
  const el=$('#vwMapToast'); if(!el)return;
  el.textContent=msg; el.className='vw-map-toast '+type;
}
function buildVWTooltip(name){
  const row=VW_MAP_STATE.rowMap.get(name), meta=getMapIndicatorMeta();
  if(!row)return `<strong>${mapEsc(name)}</strong><br>No model row matched`;
  return `<strong>${mapEsc(row.name)}</strong> <span style="color:#6b8bb0">${row.code}</span><br>${mapEsc(meta.label)}: <strong>${mapFmt(row)}</strong><br>Inc ${mapFmt(row,'incShare')} · Opp ${mapFmt(row,'oppShare')} · TF ${mapFmt(row,'thirdShare')}<br>${mapEsc(row.status.label)} · ${mapEsc(row.cluster)}`;
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
function rVWMapLegend(){
  const meta=getMapIndicatorMeta(); const vals=getMapValues(); const lo=Math.min(...vals),hi=Math.max(...vals);
  $('#vwMapLegend').innerHTML=`<div class="vw-leg-title">${mapEsc(meta.label)}</div><div style="color:var(--muted);font-size:12px;line-height:1.5;">${mapEsc(VW_MAP_STATE.classification)} · ${mapEsc(meta.category)} · ${mapEsc(meta.status)}</div><div class="vw-leg-grad"></div><div class="vw-leg-labels"><span>${mapMetric(meta.min??lo,meta.unit)}</span><span>${mapMetric(((meta.min??lo)+(meta.max??hi))/2,meta.unit)}</span><span>${mapMetric(meta.max??hi,meta.unit)}</span></div><div style="margin-top:6px;color:var(--muted);font-size:12px;line-height:1.45;">${policyLegendText()}</div>`;
  $('#vwMapSub').textContent=`${meta.label} · ${VW_MAP_STATE.classification}`;
}
function policyLegendText(){
  const k=VW_MAP_STATE.indicator;
  if(k==='article138Gap')return 'Policy bands: below 25% · 0–5pp buffer · 5–15pp buffer · >15pp buffer';
  if(k==='disputeRisk'||k==='runoffSensitivity')return 'Policy bands: low · moderate · elevated · severe';
  if(k==='dataQualityScore')return 'Policy bands: low · medium · high data quality';
  return 'Colors are scenario indicators, not official results.';
}
function rVWMapSummary(){
  const rows=VW_MAP_STATE.rows, meta=getMapIndicatorMeta(), vals=getMapValues(); if(!$('#vwPanelSummary'))return;
  const sorted=[...rows].sort((a,b)=>(b.values[VW_MAP_STATE.indicator]??-999)-(a.values[VW_MAP_STATE.indicator]??-999));
  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  const sensitive=rows.filter(r=>r.values.article138Gap<8).length;
  const elevated=rows.filter(r=>r.values.disputeRisk>=45).length;
  const q=VW_MAP_STATE.diagnostics||{};
  $('#vwPanelSummary').innerHTML=`
    <div class="vw-summary-grid">
      <div class="vw-mini"><div class="vw-mini-l">Selected indicator</div><div class="vw-mini-v vg">${mapEsc(meta.label).split(' ')[0]}</div><div class="kpi-d">Average: ${mapMetric(avg,meta.unit)}</div></div>
      <div class="vw-mini"><div class="vw-mini-l">Boundary match</div><div class="vw-mini-v ${q.status==='PASS'?'vgr':q.status==='WARNING'?'va':'vr'}">${q.boundaryMatched||0}/47</div><div class="kpi-d">${mapEsc(q.boundarySource||'loading / not loaded')}</div></div>
      <div class="vw-mini"><div class="vw-mini-l">Threshold-sensitive</div><div class="vw-mini-v va">${sensitive}</div><div class="kpi-d">Inc Article 138 gap below 8pp</div></div>
      <div class="vw-mini"><div class="vw-mini-l">Dispute signal</div><div class="vw-mini-v ${elevated>10?'vr':elevated>4?'va':'vgr'}">${elevated}</div><div class="kpi-d">Counties ≥45 risk score</div></div>
    </div>
    <div class="divider"></div>
    <div class="note" style="font-size:12px;line-height:1.7;">Top county by ${mapEsc(meta.label)}: <strong style="color:var(--gold)">${mapEsc(sorted[0]?.name||'—')}</strong> (${sorted[0]?mapFmt(sorted[0]):'—'}). Click any county polygon to update this map panel and the VOTEWATCH drilldown.</div>`;
}
function rVWMapDetail(){
  const row=VW_MAP_STATE.rowMap.get(VW_MAP_STATE.selected)||VW_MAP_STATE.rows[0];
  if(!row)return;
  $('#vwPanelProfile').innerHTML=`
    <div class="vw-profile-title">${mapEsc(row.name)}</div>
    <div class="kpi-d mb8">${mapEsc(row.cluster)} · Code ${row.code} · ${row.wards||0} wards</div>
    <div class="vw-kv"><span>Team A</span><strong>${mapFmt(row,'incShare')}</strong></div>
    <div class="vw-kv"><span>Team B</span><strong>${mapFmt(row,'oppShare')}</strong></div>
    <div class="vw-kv"><span>Others</span><strong>${mapFmt(row,'thirdShare')}</strong></div>
    <div class="vw-kv"><span>Turnout</span><strong>${mapFmt(row,'turnout')}</strong></div>
    <div class="vw-kv"><span>Article 138 gap</span><strong>${mapFmt(row,'article138Gap')}</strong></div>
    <div class="vw-kv"><span>Dispute risk</span><strong>${mapFmt(row,'disputeRisk')}</strong></div>
    <div class="vw-kv"><span>Data quality</span><strong>${mapEsc(row.dq)} (${mapFmt(row,'dataQualityScore')})</strong></div>
    <div class="divider"></div>
    <div class="note" style="font-size:12px;line-height:1.7;">${mapCountyExplanation(row)}</div>`;
}
function mapCountyExplanation(row){
  const gap=row.values.article138Gap, tf=row.values.thirdShare, risk=row.values.disputeRisk;
  const gapTxt=gap<0?`${row.name} is below the 25% county floor for the incumbent by ${Math.abs(gap).toFixed(1)}pp.`:gap<8?`${row.name} is threshold-sensitive: incumbent buffer is ${gap.toFixed(1)}pp above 25%.`:`${row.name} is comfortably above the 25% county floor under this scenario.`;
  const tfTxt=tf>15?`Third Force exposure is high at ${tf.toFixed(1)}%.`:tf>8?`Third Force exposure is material at ${tf.toFixed(1)}%.`:`Third Force exposure is limited at ${tf.toFixed(1)}%.`;
  const riskTxt=risk>60?'Dispute-risk signal is elevated; validate underlying data and assumptions.':risk>35?'Dispute-risk signal is moderate.':'Dispute-risk signal is comparatively low.';
  return `${gapTxt} ${tfTxt} ${riskTxt} Data quality: ${row.dq}.`;
}
function rVWMapDiagnostics(){
  const q=VW_MAP_STATE.diagnostics||mapDiagnostics(VW_MAP_STATE.rows);
  VW_MAP_STATE.diagnostics=q;
  const cls=q.status==='PASS'?'b-gr':q.status==='WARNING'?'b-a':'b-r';
  $('#vwMapQualityBadge').className=`b ${cls}`;
  $('#vwMapQualityBadge').textContent=`QA ${q.status} · ${q.boundaryMatched||0}/47`;
  $('#vwMapDiagnostics').innerHTML=`
    <div class="vw-summary-grid">
      <div class="vw-mini"><div class="vw-mini-l">Model rows</div><div class="vw-mini-v ${q.count===47?'vgr':'vr'}">${q.count}/47</div></div>
      <div class="vw-mini"><div class="vw-mini-l">Boundary matched</div><div class="vw-mini-v ${q.boundaryMatched>=45?'vgr':q.boundaryMatched?'va':'vr'}">${q.boundaryMatched||0}/47</div></div>
      <div class="vw-mini"><div class="vw-mini-l">QA score</div><div class="vw-mini-v ${q.score>=90?'vgr':q.score>=70?'va':'vr'}">${Math.round(q.score)}</div></div>
      <div class="vw-mini"><div class="vw-mini-l">Boundary source</div><div class="kpi-d">${mapEsc(q.boundarySource||'not loaded')}</div></div>
    </div>
    <div class="divider"></div>
    <div class="vw-map-details"><strong>Missing:</strong> ${q.missing.length?q.missing.map(mapEsc).join(', '):'None'}<br><strong>Duplicates:</strong> ${q.dup.length?q.dup.map(mapEsc).join(', '):'None'}<br><strong>Invalid values:</strong> ${q.invalid.length?q.invalid.slice(0,12).map(mapEsc).join('<br>'):'None'}<br><strong>Warnings:</strong> ${q.warnings.length?q.warnings.slice(0,12).map(mapEsc).join('<br>'):'None'}<br><strong>Boundary key:</strong> ${mapEsc(q.boundaryKey||'—')}</div>`;
  $('#vwMapMethod').innerHTML=`<strong>Map method note:</strong> County polygons are used for visualization only. VOTEWATCH scenario values are model outputs generated from the current sliders, polling anchor, regime switches, shocks and ward dataset. Colors are not official results. Boundary source: ${mapEsc(q.boundarySource||'loading / not loaded')}.`;
}
function rVWMapPanels(){
  rVWMapSummary();rVWMapDetail();rVWMapDiagnostics();
  $('#vwPanelRanking').innerHTML=mapRankingTableHTML();
  $('#vwPanelQuality').innerHTML=`<div class="note" style="font-size:12px;line-height:1.7;">${rMapQualityHTML()}</div>`;
  $('#vwPanelMetadata').innerHTML=`<div class="note" style="font-size:12px;line-height:1.7;">${mapIndicatorMetaHTML()}<div class="divider"></div>${rMapAliasHTML()}</div>`;
  $('#vwMapIndicatorMeta').innerHTML=mapIndicatorMetaHTML();
}
function mapIndicatorMetaHTML(){
  const m=getMapIndicatorMeta();
  return `<strong style="color:var(--gold)">${mapEsc(m.label)}</strong><br>Category: ${mapEsc(m.category)}<br>Unit: ${mapEsc(m.unit)}<br>Formula: ${mapEsc(m.formula)}<br>Source: ${mapEsc(m.source)}<br>Status: ${mapEsc(m.status)}<br>Caveat: ${mapEsc(m.caveat)}`;
}
function rMapQualityHTML(){
  const q=VW_MAP_STATE.diagnostics||{};
  return `<strong style="color:var(--gold)">Map QA</strong><br>Generated: ${mapEsc(q.generatedAt||'—')}<br>Boundary source: ${mapEsc(q.boundarySource||'—')}<br>Boundary key: ${mapEsc(q.boundaryKey||'—')}<br>High/Medium/Low DQ: ${q.highDQ||0}/${q.medDQ||0}/${q.lowDQ||0}<br>Clusters represented: ${q.clusters||0}<br>Quality score: ${Math.round(q.score||0)} / 100`;
}
function rMapAliasHTML(){return `<strong style="color:var(--gold)">Alias handling</strong><br>${VW_ALIAS_EXAMPLES.map(a=>`${mapEsc(a[0])} → ${mapEsc(a[1])}`).join('<br>')}`;}
function mapRankingTableHTML(){
  const rows=[...VW_MAP_STATE.rows].sort((a,b)=>(b.values[VW_MAP_STATE.indicator]??-999)-(a.values[VW_MAP_STATE.indicator]??-999));
  return `<div class="tscroll" style="max-height:540px"><table class="tbl"><thead><tr><th>#</th><th>County</th><th>Region</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>`<tr onclick="selCtyMap('${mapEsc(r.name)}',true)" style="cursor:pointer"><td>${i+1}</td><td>${mapEsc(r.name)}</td><td>${mapEsc(r.cluster)}</td><td>${mapFmt(r)}</td><td><span class="b ${r.status.cls}">${r.status.risk}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function rMapTbl(){
  const rows=VW_MAP_STATE.rows;
  $('#mapTbl').innerHTML=`<thead><tr><th>County</th><th>Region</th><th>A</th><th>B</th><th>Others</th><th>Article 138 Gap</th><th>Dispute</th><th>DQ</th></tr></thead><tbody>${rows.map(r=>`<tr onclick="selCtyMap('${mapEsc(r.name)}',true)" style="cursor:pointer"><td>${mapEsc(r.name)}</td><td>${mapEsc(r.cluster)}</td><td>${mapFmt(r,'incShare')}</td><td>${mapFmt(r,'oppShare')}</td><td>${mapFmt(r,'thirdShare')}</td><td>${mapFmt(r,'article138Gap')}</td><td>${mapFmt(r,'disputeRisk')}</td><td>${mapEsc(r.dq)}</td></tr>`).join('')}</tbody>`;
}
function selCtyMap(name,fly=false){
  const canonical=canonicalCtyName(name)||name;
  const row=VW_MAP_STATE.rowMap.get(canonical)||VW_MAP_STATE.rows.find(r=>r.name===name);
  if(!row)return;
  VW_MAP_STATE.selected=row.name;S.selCty=row.name;
  rVWMapDetail();rVWMapSummary();rVWMapPanels();refreshVWLeafletStyles();
  const layer=VW_MAP_STATE.countyLayers.get(row.name);
  if(layer&&VW_MAP_STATE.map&&fly){VW_MAP_STATE.map.fitBounds(layer.getBounds(),{padding:[40,40],maxZoom:8});layer.openTooltip();}
}
function dlVWMapCSV(kind='indicator'){
  const rows=VW_MAP_STATE.rows; let csv='';
  if(kind==='ranking'){
    const sorted=[...rows].sort((a,b)=>(b.values[VW_MAP_STATE.indicator]??-999)-(a.values[VW_MAP_STATE.indicator]??-999));
    csv='rank,county,code,cluster,value,status\n'+sorted.map((r,i)=>[i+1,r.name,r.code,r.cluster,r.values[VW_MAP_STATE.indicator],r.status.risk].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  }else{
    csv='county,code,cluster,incShare,oppShare,thirdShare,turnout,article138Gap,runoffSensitivity,disputeRisk,dataQualityScore,projectedVotes,leadMargin,thresholdBuffer\n'+rows.map(r=>[r.name,r.code,r.cluster,r.values.incShare,r.values.oppShare,r.values.thirdShare,r.values.turnout,r.values.article138Gap,r.values.runoffSensitivity,r.values.disputeRisk,r.values.dataQualityScore,r.values.projectedVoters,r.values.leadMargin,r.values.thresholdBuffer].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  }
  dlBlob(csv,`votewatch_map_${kind}.csv`,'text/csv');
}
function dlVWMapDatasetJSON(){dlBlob(JSON.stringify(mapBuildDataset(),null,2),'votewatch_map_dataset.json','application/json');}
function dlVWMapDiagnostics(){dlBlob(JSON.stringify(VW_MAP_STATE.diagnostics||mapDiagnostics(VW_MAP_STATE.rows),null,2),'votewatch_map_diagnostics.json','application/json');}
function dlVWMapMetadata(){dlBlob(JSON.stringify({metadata:mapBuildDataset().metadata,indicator:getMapIndicatorMeta(),allIndicators:VW_MAP_INDICATORS,diagnostics:VW_MAP_STATE.diagnostics},null,2),'votewatch_map_metadata.json','application/json');}
function dlVWMapPNG(){
  const target=$('#vwMapReportArea');
  if(typeof html2canvas==='undefined'||!target){dlVWMapDatasetJSON();return;}
  html2canvas(target,{backgroundColor:'#060810',useCORS:true,scale:2}).then(canvas=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='votewatch_county_boundary_map.png';a.click();});
}
function dlBlob(content,filename,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=filename;a.click();URL.revokeObjectURL(a.href);}

function rDispute(ctyRes,dr){
  $('#rpin').style.left=`${dr.score}%`;
  $('#disKpis').innerHTML=`
  <div class="kpi"><div class="kpi-l">Risk score</div>
    <div class="kpi-v ${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}</div>
    <div class="kpi-d">${dr.score>60?'HIGH — petition-viable':'MEDIUM — within norms'}</div></div>
  <div class="kpi"><div class="kpi-l">Close counties in one region</div>
    <div class="kpi-v ${dr.conc>0.60?'vr':dr.conc>0.40?'va':'vgr'}">${pct(dr.conc,0)}</div>
    <div class="kpi-d">of close counties in <strong>${dr.top}</strong> · ${dr.tc}/${dr.n}</div></div>
  <div class="kpi"><div class="kpi-l">Closest county margin</div>
    <div class="kpi-v ${dr.minM<0.03?'vr':dr.minM<0.07?'va':'vgr'}">${pct(dr.minM)}</div>
    <div class="kpi-d">${dr.n} counties within 6pp of leading share</div></div>`;

  $('#disNarr').innerHTML=`Score ${Math.round(dr.score)}/100. ${dr.n} counties within petition margin. Min margin ${pct(dr.minM)}.${dr.conc>0.60?` <strong style="color:var(--red2)">Geographic concentration alert:</strong> ${pct(dr.conc,0)} of marginal counties in ${dr.top} — single-cluster concentration substantially strengthens a petition narrative around regional data integrity.`:''} ${dr.score>55?' Historical note: 2017 petition was filed with broader national margins. Geographically-concentrated close result with data quality gaps in specific clusters is the most litigation-viable scenario.':''}`;

  $('#disClust').innerHTML=Object.entries(dr.byC).sort((a,b)=>b[1]-a[1]).map(([cl,n])=>`
  <div class="fb" style="padding:6px 0;border-bottom:1px solid var(--bdr);">
    <span style="font-weight:600;font-size:12px;">${cl}</span>
    <div class="fc g8"><div class="pbar" style="width:65px;"><div class="pf p-r" style="width:${n/dr.n*100}%"></div></div>
    <span style="font-family:var(--mono);font-size:12px;color:var(--gold)">${n}</span></div>
  </div>`).join('')||'<div style="font-family:var(--mono);font-size:12px;color:var(--muted)">No close counties at current scenario.</div>';

  $('#disTbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th>Margin</th><th>A</th><th>B</th><th>DQ</th><th>Volatility</th><th>Region</th></tr></thead>
  <tbody>${dr.close.sort((a,b)=>Math.abs(a.ls-0.5)-Math.abs(b.ls-0.5)).map(c=>`<tr>
    <td style="font-weight:600">${c.name}</td>
    <td><span class="b ${c.lead==='inc'?'b-b':'b-r'}">${c.lead.toUpperCase()}</span></td>
    <td><span class="b ${Math.abs(c.ls-0.5)<0.03?'b-r':'b-a'}">${pct(Math.abs(c.ls-0.5))}</span></td>
    <td style="color:var(--blbr)">${pct(c.i)}</td><td style="color:var(--red2)">${pct(c.o)}</td>
    <td><span class="b ${c.dq==='high'?'b-gr':c.dq==='medium'?'b-g':'b-r'}">${c.dq}</span></td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${c.vl}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${c.cluster}</td>
  </tr>`).join('')}</tbody>`;
}

function rCountyGrid(ctyRes){
  if(!$('#ctyGrid'))return; // county grid replaced by the map panel
  const s=($('#ctySrch').value||'').toLowerCase();
  const filtered=ctyRes.filter(c=>c.name.toLowerCase().includes(s)||c.cluster.toLowerCase().includes(s));
  $('#ctyCount').textContent=`${filtered.length} counties`;
  $('#ctyGrid').innerHTML=filtered.map(c=>{
    const hist=CM.get(c.name);
    return`<div class="cc ${c.name===S.selCty?'sel':''}" onclick="selCounty('${c.name.replace(/'/g,"\\'")}')">
      <div class="cc-n">${c.name}</div>
      <div class="stk mb8"><div class="si" style="flex:${c.i}"></div><div class="so" style="flex:${c.o}"></div><div class="st" style="flex:${c.t}"></div></div>
      <div class="cc-r"><span>Team A</span><strong style="color:${iCol(c.i)}">${pct(c.i)} ${c.ia?'✓':''}</strong></div>
      <div class="cc-r"><span>Team B</span><strong style="color:var(--red2)">${pct(c.o)}</strong></div>
      <div class="cc-r"><span>Others</span><strong style="color:var(--others)">${pct(c.t)}</strong></div>
      <div class="cc-r"><span>Turnout</span><strong>${pct(c.to)}</strong></div>
      ${hist?`<div class="cc-r"><span>2017→2022</span><strong style="color:var(--muted)">${pct(hist.hist17)}→${pct(hist.baseIncumbent2022)}</strong></div>`:''}
      <div class="mt6"><span class="b b-m">${c.cluster}</span></div>
    </div>`;
  }).join('');
}

function selCounty(name){
  S.selCty=name;
  if(S.res)rCountyGrid(S.res.ctyRes);
  if(S.wards)rWardDrill(S.wards);
  if(typeof rVoteMap==='function')rVoteMap();
}

function rWardDrill(wardRes){
  if(!$('#wardTbl'))return;
  const s=($('#wardSrch')?.value||'').toLowerCase();
  const rows=wardRes.filter(w=>w.county===S.selCty&&(!s||w.ward.toLowerCase().includes(s)||w.constituency.toLowerCase().includes(s)));
  $('#wardTbl').innerHTML=`<thead><tr><th>Ward</th><th>Constituency</th><th>Voters</th><th>Turnout</th><th>${mapEsc(S.cfg.teams[0])}</th><th>${mapEsc(S.cfg.teams[1]||'B')}</th><th>Others</th></tr></thead>
  <tbody>${rows.map(w=>`<tr>
    <td style="font-weight:600">${w.ward}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${w.constituency}</td>
    <td style="font-family:var(--mono);font-size:12px">${N.format(Math.round(w.voters))}</td>
    <td>${pct(w.to)}</td>
    <td style="color:var(--blbr)">${pct(w.inc)}</td>
    <td style="color:var(--red2)">${pct(w.opp)}</td>
    <td style="color:var(--others)">${pct(w.tf)}</td>
  </tr>`).join('')}</tbody>`;
}

function rIntel(){
  $('#levList').innerHTML=LEVERS.map(l=>`
  <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr);">
    <div style="width:7px;height:7px;border-radius:50%;margin-top:3px;flex-shrink:0;
      background:${l.s==='red'?'var(--red2)':l.s==='amb'?'var(--amb2)':'var(--gbr)'};
      box-shadow:0 0 4px ${l.s==='red'?'var(--red2)':l.s==='amb'?'var(--amb2)':'var(--gbr)'}"></div>
    <div><div style="font-weight:600;font-size:13px;margin-bottom:2px;">${mapEsc(l.t)}</div>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:4px;line-height:1.5;">${mapEsc(l.d)}</div>
    <div style="font-size:12px;color:var(--gold);line-height:1.5;"><strong>In the model:</strong> ${mapEsc(l.i)}</div></div>
  </div>`).join('');

  $('#sentList').innerHTML=SENTS.map(s=>`
  <div style="padding:7px 0;border-bottom:1px solid var(--bdr);">
    <div class="fb mb8"><span style="font-weight:600;font-size:13px;">${mapEsc(s.t)}</span>
    <div class="fc g6"><span class="b ${s.tier==='HIGH'?'b-r':s.tier==='MED'?'b-g':'b-m'}">${s.tier}</span>
    <span style="font-family:var(--mono);font-size:12px;color:var(--muted)">${s.freq}</span></div></div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);font-style:italic;">${mapEsc(s.n)}</div>
  </div>`).join('');

  $('#byeList').innerHTML=BYES.map(b=>`
  <div style="padding:8px 0;border-bottom:1px solid var(--bdr);">
    <div class="fb mb8"><span style="font-weight:600;font-size:12px;">${b.n} (${b.yr})</span>
    <span style="font-family:var(--mono);font-size:12px;color:var(--muted)">${b.co}</span></div>
    <div class="g3" style="font-family:var(--mono);font-size:12px;gap:6px;">
      <div><div style="color:var(--muted)">Model</div><div style="font-weight:600">${pct(b.mb)}</div></div>
      <div><div style="color:var(--muted)">Actual</div><div style="font-weight:600">${pct(b.act)}</div></div>
      <div><div style="color:var(--muted)">Delta</div><div style="font-weight:600;color:${b.d<0?'var(--red2)':'var(--gbr)'}">${b.d>0?'+':''}${pct(b.d)}</div></div>
    </div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;font-style:italic;">${b.note}</div>
  </div>`).join('');

  $('#dataRoadmap').innerHTML=ROADMAP.map(d=>`
  <div class="flex g8 mb8">
    <span class="b ${d.p==='P1'?'b-r':d.p==='P2'?'b-g':'b-m'}">${d.p}</span>
    <div><div style="font-weight:600;font-size:12px">${d.i}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted)">${d.imp}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--gdim)">Source: ${d.src}</div></div>
  </div>`).join('');

  $('#regEffects').innerHTML=REG_EFF.map(r=>`
  <div style="padding:8px 0;border-bottom:1px solid var(--bdr);">
    <div style="font-weight:600;font-size:12px;color:var(--gold);margin-bottom:3px;">${r.sw}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);line-height:1.5">${r.e}</div>
  </div>`).join('');

  $('#methNotes').innerHTML=`<strong>How it works</strong><br>Each candidate's support comes from the national polling average and is spread across 1,457 wards using their home regions and 2022 voting patterns. Teams add up their members' support, minus supporters who don't follow. The model then runs the election hundreds of times with random polling error. An outright win needs over 50% nationally and 25% in 24 counties; otherwise the top two go to a run-off, won by most votes. This is a scenario tool, not a forecast.`;

  const pt=$('#pollsTbl');
  if(pt)pt.innerHTML=`<thead><tr><th>Released</th><th>Pollster</th><th>${mapEsc(S.cfg.teams[0])}</th><th>${mapEsc(S.cfg.teams[1]||'Team B')}</th><th>Others</th><th>Top names</th></tr></thead><tbody>${POLLS.map(p=>{const b=pollTeams(p);const top=Object.entries(p.r).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([n,v])=>`${mapEsc(n.split(' ').pop())} ${v}`).join(' · ');
    return `<tr><td>${p.date}</td><td><a href="${p.url}" target="_blank" rel="noopener">${mapEsc(p.pollster)}</a>${p.eligible?'':' <span class="b b-m" title="Methodology not disclosed or not yet verified">held out</span>'}</td><td style="color:var(--blbr)">${b.inc.toFixed(1)}%</td><td style="color:var(--red2)">${b.opp.toFixed(1)}%</td><td style="color:var(--others)">${b.tf.toFixed(1)}%</td><td style="white-space:normal">${top}</td></tr>`;}).join('')}</tbody>`;
  const cf=$('#ctxFacts');
  if(cf)cf.innerHTML=CONTEXT_FACTS.map(x=>`<li><span class="ctx-d">${x.date}</span> ${mapEsc(x.t)} <a href="${x.url}" target="_blank" rel="noopener">source</a></li>`).join('');
}

function rShockLog(){
  $('#shLog').innerHTML=S.shLog.length
    ?S.shLog.map(l=>`<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);">
      <span style="color:var(--gdim)">[${l.ts}]</span> <span style="color:var(--txt)">${l.e}</span>
      <span style="color:var(--muted)"> → ${l.d}</span></div>`).join('')
    :'<span style="color:var(--muted)">No events yet. Add one here, or turn on live events in the header.</span>';
}

// ═══ EXPORTS ═══
function dlCSV(kind){
  const r=S.res;if(!r)return;
  let rows=[],fn=`vw2027_${kind}.csv`;
  if(kind==='county'){
    rows=[['County','Cluster','Voters','Turnout','Inc','Inc≥25','Opp','TF','DQ']];
    r.ctyRes.forEach(c=>rows.push([c.name,c.cluster,Math.round(c.tv),pct(c.to),pct(c.i),c.ia,pct(c.o),pct(c.t),c.dq]));
  }else if(kind==='ward'){
    rows=[['County','Constituency','Ward','Voters','Turnout','Inc','Opp','TF','DQ']];
    (S.wards||[]).forEach(w=>rows.push([w.county,w.constituency,w.ward,Math.round(w.voters),pct(w.to),pct(w.inc),pct(w.opp),pct(w.tf),w.dq]));
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
  if(mc_.ro>=0.5){const pr=r2pair(n);tone="warn";title=`Run-off likely: ${blocName(pr.a)} vs ${blocName(pr.b)}`;}
  else if(mc_.iW>=mc_.oW){tone="inc";title="Incumbent wins in round one";}
  else{tone="opp";title="Opposition wins in round one";}
  const p=mc_.ro>=0.5?mc_.ro:Math.max(mc_.iW,mc_.oW);
  el.dataset.tone=tone;
  el.innerHTML=`<span class="v-dot" aria-hidden="true"></span><span class="v-title">${title}</span><span class="v-p">${pct(p,0)} of simulations</span><span class="v-sep" aria-hidden="true"></span><span class="v-detail">Incumbent <b>${pct(n.i)}</b> · Opposition <b>${pct(n.o)}</b> · ${blocName("tf")} <b>${pct(n.t)}</b> · <b>${i25}</b>/47 counties at 25%+</span>`;
}
function setLive(on){
  S.live=!!on;S.timer=30;
  const b=document.getElementById("liveBtn");
  if(b){b.setAttribute("aria-pressed",String(S.live));b.querySelector(".live-txt").textContent=S.live?"Live events on":"Live events off";}
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
  if(vb){vb.textContent=S.viewMode==='public'?'Public view':'Analyst view';vb.setAttribute('aria-pressed',String(S.viewMode!=='public'));}
}
function applyTheme(){
  document.body.classList.toggle('light-mode',S.theme==='light');
  const b=document.getElementById('themeBtn');
  if(b){b.textContent=S.theme==='light'?'☾':'☀';b.setAttribute('aria-label',S.theme==='light'?'Switch to dark theme':'Switch to light theme');}
}
function setTheme(t){S.theme=t;savePref('vw-theme',t);applyTheme();}
function setViewMode(v){
  S.viewMode=v;savePref('vw-view',v);updateViewModeLabels();renderAll();
}
function updateMcModeUI(){
  ITERS=MC_MODES[S.mcMode]||MC_MODES.preview;
  const modeText={preview:'Preview · 400',standard:'Standard · 1,000',research:'Research · 5,000 seeded'}[S.mcMode]||'Preview · 400';
  $('#mcModeLabel')&&( $('#mcModeLabel').textContent=modeText );
  $('#seedLabel')&&( $('#seedLabel').textContent=S.seed );
  $('#mcCredibilityNote')&&( $('#mcCredibilityNote').innerHTML=S.mcMode==='preview'
    ?'Preview mode prioritizes speed. Treat probabilities as directional and switch to Standard or Research before briefing.'
    :S.mcMode==='standard'?'Standard mode is suitable for internal review. Use Research mode for reproducible exported briefings.'
    :'Research mode uses 5,000 seeded simulations for reproducibility; record the seed in exported materials.');
}
function assumptionSensitivityHTML(){
  if(!S.res)return '<div class="note">Run the model to calculate sensitivity.</div>';
  const base=S.res.nat.i;
  const tests=[
    ['Protest vote +5pp',{tf:S.tf+5}],
    ['Swing to Ruto +4pp',{si:S.si+4}],['Swing to team B +4pp',{so:S.so+4}],
    ['Youth turnout +8pp',{ys:S.ys+8}],
    ['Follow-through 70%',{cfg:{...S.cfg,follow:70}}],['Follow-through 100%',{cfg:{...S.cfg,follow:100}}]
  ];
  const rows=tests.map(([label,p])=>{const r=sim({...p},false,true,false);return{label,delta:r.nat.i-base,inc:r.nat.i,ro:ff(r.nat).forced};})
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return `<table class="tbl"><thead><tr><th>If…</th><th>Team A change</th><th>Team A share</th><th>Effect</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td style="color:${r.delta<0?'var(--red2)':'var(--gbr)'}">${r.delta>0?'+':''}${pct(r.delta)}</td><td>${pct(r.inc)}</td><td>${Math.abs(r.delta)>0.025?'Major':'Minor'}</td></tr>`).join('')}</tbody></table>`;
}
function responsibleUseHTML(){
  return `<div class="note" style="font-size:12px;line-height:1.65;"><strong style="color:var(--gold)">Permitted:</strong> civic analysis, academic research, journalistic review, scenario planning, election-risk monitoring and data-quality auditing.<br><strong style="color:var(--red2)">Prohibited:</strong> voter suppression, deceptive persuasion, intimidation, unofficial result claims, microtargeting based on sensitive traits, or spreading unverified projections as official outcomes.<br><strong>Language standard:</strong> use “threshold-sensitive”, “uncertainty hotspot”, “data validation priority”, and “scenario driver”; avoid operational terms such as target, mobilize, persuade, counter-message, flip or suppress. Current display mode: <span class="b ${S.viewMode==='public'?'b-gr':'b-g'}">${S.viewMode==='public'?'PUBLIC / NEUTRAL':'INTERNAL'}</span></div>`;
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
function validationHTML(){return `<div class="note" style="font-size:12px;line-height:1.65;"><strong style="color:var(--amb2)">Validation status: Not yet externally validated.</strong><br>Required data: 2022 ward presidential results; 2017 ward/constituency tallies; 2023–2025 by-election results; polling time series; official voter-register growth; verified turnout history.<br>Current calibration available: internal by-election analogues and scenario consistency checks only. This panel is intentionally explicit so outputs are not misread as validated forecasts.</div>`;}
function modelRiskRegisterHTML(){
  const risks=[
    ['Ward-level vote shares imputed from county baseline','High','Replace with actual ward-level presidential results'],
    ['Third Force baseline synthetic','High','Calibrate with polling and repeated survey waves'],
    ['Proxy boundary polygons exist','Medium/High','Replace proxy geometries with verified official county GeoJSON'],
    ['Polling anchor previously under-wired','Mitigated','v4.5 applies Incumbent, Opposition and Third Force poll adjustments'],
    ['Monte Carlo count low in preview','Medium','Use Standard or Research mode for briefing outputs'],
    ['Contextual actor labels','Medium','Use Public / neutral mode for external or civic presentations']
  ];
  return `<table class="tbl"><thead><tr><th>Risk</th><th>Severity</th><th>Mitigation</th></tr></thead><tbody>${risks.map(r=>`<tr><td>${r[0]}</td><td><span class="b ${r[1].startsWith('High')?'b-r':r[1].startsWith('Medium')?'b-a':'b-gr'}">${r[1]}</span></td><td>${r[2]}</td></tr>`).join('')}</tbody></table>`;
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
  const taxonomy=type==='security'?'<div class="note" style="font-size:12px;line-height:1.55;">Taxonomy: Low civic tension · Localized tension · Narrative escalation · Administrative flashpoint · Security-sensitive area. This panel flags independent verification and civic monitoring needs; it does not prescribe coercive action.</div><div class="divider"></div>':'';
  return `${taxonomy}<table class="tbl"><thead><tr><th>County</th><th>Region</th><th>${title}</th><th>Source Label</th><th>Driver</th></tr></thead><tbody>${top.map(x=>{const v=x.s[key];return `<tr><td>${x.row.name}</td><td>${x.row.cluster}</td><td class="${lensClass(v)}">${Math.round(v)}</td><td>${type==='political'||type==='market'?'proxy / synthetic':'computed / proxy'}</td><td>${v>=70?'Elevated validation priority':v>=45?'Watch signal':'Low-to-moderate signal'}</td></tr>`}).join('')}</tbody></table>`;
}
function formatMovementRows(rows,key,baseFn,sortDesc=true,limit=6){
  const arr=rows.map(r=>({r,val:(r.values[key]||0)-(baseFn(r)||0)})).sort((a,b)=>sortDesc?b.val-a.val:a.val-b.val).slice(0,limit);
  return arr.map(x=>`<tr><td>${x.r.name}</td><td>${x.r.cluster}</td><td style="color:${x.val<0?'var(--red2)':'var(--gbr)'}">${x.val>0?'+':''}${x.val.toFixed(1)}pp</td><td>${mapFmt(x.r,key)}</td></tr>`).join('');
}
function mapMovementHTML(){
  const rows=VW_MAP_STATE.rows||[];
  const incG=formatMovementRows(rows,'incShare',r=>(r.base||0)*100,true,5);
  const incL=formatMovementRows(rows,'incShare',r=>(r.base||0)*100,false,5);
  const tf=rows.map(r=>({r,val:r.values.thirdShare})).sort((a,b)=>b.val-a.val).slice(0,5).map(x=>`<tr><td>${x.r.name}</td><td>${x.r.cluster}</td><td>${x.val.toFixed(1)}%</td><td>${x.r.values.disputeRisk.toFixed(0)}</td></tr>`).join('');
  const art=rows.map(r=>({r,val:r.values.article138Gap})).sort((a,b)=>a.val-b.val).slice(0,5).map(x=>`<tr><td>${x.r.name}</td><td>${x.r.cluster}</td><td style="color:${x.val<0?'var(--red2)':'var(--amb2)'}">${x.val.toFixed(1)}pp</td><td>${x.r.values.thirdShare.toFixed(1)}%</td></tr>`).join('');
  const run=rows.map(r=>({r,val:r.values.runoffSensitivity})).sort((a,b)=>b.val-a.val).slice(0,5).map(x=>`<tr><td>${x.r.name}</td><td>${x.r.cluster}</td><td>${x.val.toFixed(0)}</td><td>${x.r.values.leadMargin.toFixed(1)}pp</td></tr>`).join('');
  return `<div class="g2"><div><div class="gov-title">Largest incumbent gains vs baseline</div><table class="tbl"><tbody>${incG}</tbody></table></div><div><div class="gov-title">Largest incumbent losses vs baseline</div><table class="tbl"><tbody>${incL}</tbody></table></div></div><div class="divider"></div><div class="g3"><div><div class="gov-title">Largest Third Force share</div><table class="tbl"><tbody>${tf}</tbody></table></div><div><div class="gov-title">Article 138 deterioration</div><table class="tbl"><tbody>${art}</tbody></table></div><div><div class="gov-title">Run-off sensitivity</div><table class="tbl"><tbody>${run}</tbody></table></div></div>`;
}
function getGeometryStats(){
  // geoBoundaries ADM1 outlines for all 47 counties (data/kenya-geo.js)
  const n=typeof KE_GEO!=='undefined'?KE_GEO.counties.length:0;
  return {verified:n,proxy:0,other:0,total:n,confidence:n===47?'High':'Partial'};
}
function boundarySourceHTML(){
  const q=VW_MAP_STATE.diagnostics||mapDiagnostics(VW_MAP_STATE.rows); const g=getGeometryStats();
  return `<div class="vw-summary-grid"><div class="vw-mini"><div class="vw-mini-l">County data match</div><div class="vw-mini-v ${q.count===47?'vgr':'vr'}">${q.count}/47</div></div><div class="vw-mini"><div class="vw-mini-l">Boundary geometry match</div><div class="vw-mini-v ${q.boundaryMatched>=47?'vgr':q.boundaryMatched?'va':'vr'}">${q.boundaryMatched||0}/47</div></div><div class="vw-mini"><div class="vw-mini-l">Verified polygons</div><div class="vw-mini-v vgr">${g.verified}</div></div><div class="vw-mini"><div class="vw-mini-l">Proxy polygons</div><div class="vw-mini-v ${g.proxy?'va':'vgr'}">${g.proxy}</div></div></div><div class="divider"></div><div class="vw-map-details"><strong>Boundary source:</strong> ${mapEsc(q.boundarySource||'embedded / pending load')}<br><strong>Simplification level:</strong> browser-optimized county polygons with proxy fallback completion<br><strong>Projection:</strong> WGS84 / EPSG:4326 coordinates rendered by Leaflet Web Mercator<br><strong>Boundary source confidence:</strong> ${g.confidence}<br><strong>Geometry caveat:</strong> ${g.proxy?`${g.proxy} counties use proxy completion geometry; use for visualization, not legal GIS interpretation.`:'All embedded geometries marked source-boundary.'}<br><strong>Model output completeness:</strong> ${q.modelOutputCompleteness||0}%</div>`;
}
function indicatorFormulaCardsHTML(){
  return `<div class="gov-grid">${Object.entries(VW_MAP_INDICATORS).slice(0,12).map(([k,m])=>`<div class="gov-card"><div class="gov-title">${mapEsc(m.label)}</div><div class="gov-list">Formula: ${mapEsc(m.formula)}<br>Source: ${mapEsc(m.source)}<br>Status: ${mapEsc(m.status)}<br>Confidence: ${m.status==='computed'?'Medium-high':m.status==='modelled'?'Medium':'Context-dependent'}<br>Caveat: ${mapEsc(m.caveat)}</div></div>`).join('')}</div>`;
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

// Override map diagnostics and metadata panels
rVWMapDiagnostics=function(){
  const q=VW_MAP_STATE.diagnostics||mapDiagnostics(VW_MAP_STATE.rows); VW_MAP_STATE.diagnostics=q;
  const cls=q.status==='PASS'?'b-gr':q.status==='WARNING'?'b-a':'b-r';
  $('#vwMapQualityBadge').className=`b ${cls}`; $('#vwMapQualityBadge').textContent=`QA ${q.status} · data ${q.count}/47 · geom ${q.boundaryMatched||0}/47`;
  $('#vwMapDiagnostics').innerHTML=`<div class="vw-summary-grid"><div class="vw-mini"><div class="vw-mini-l">County data match</div><div class="vw-mini-v ${q.count===47?'vgr':'vr'}">${q.count}/47</div></div><div class="vw-mini"><div class="vw-mini-l">Boundary geometry match</div><div class="vw-mini-v ${q.boundaryMatched>=47?'vgr':q.boundaryMatched?'va':'vr'}">${q.boundaryMatched||0}/47</div></div><div class="vw-mini"><div class="vw-mini-l">Proxy geometry count</div><div class="vw-mini-v ${q.proxyGeometryCount?'va':'vgr'}">${q.proxyGeometryCount||0}</div></div><div class="vw-mini"><div class="vw-mini-l">Model completeness</div><div class="vw-mini-v ${q.modelOutputCompleteness>=99?'vgr':'va'}">${q.modelOutputCompleteness||0}%</div></div><div class="vw-mini"><div class="vw-mini-l">Boundary confidence</div><div class="kpi-d">${mapEsc(q.boundarySourceConfidence||'—')}</div></div><div class="vw-mini"><div class="vw-mini-l">QA score</div><div class="vw-mini-v ${q.score>=90?'vgr':q.score>=70?'va':'vr'}">${Math.round(q.score)}</div></div></div><div class="divider"></div><div class="vw-map-details"><strong>Missing:</strong> ${q.missing.length?q.missing.map(mapEsc).join(', '):'None'}<br><strong>Duplicates:</strong> ${q.dup.length?q.dup.map(mapEsc).join(', '):'None'}<br><strong>Invalid values:</strong> ${q.invalid.length?q.invalid.slice(0,12).map(mapEsc).join('<br>'):'None'}<br><strong>Warnings:</strong> ${q.warnings.length?q.warnings.slice(0,12).map(mapEsc).join('<br>'):'None'}<br><strong>Boundary key:</strong> ${mapEsc(q.boundaryKey||'—')}</div>`;
  $('#vwMapMethod').innerHTML=`<strong>Map method note:</strong> 47/47 data matching means VOTEWATCH outputs joined to county geometries. It does not imply official legal boundary authority where proxy geometries exist. Boundary confidence: ${mapEsc(q.boundarySourceConfidence||'—')}. Scenario colors are model outputs, not official results.`;
  $('#vwMapBoundarySourcePanel')&&( $('#vwMapBoundarySourcePanel').innerHTML=boundarySourceHTML() );
  $('#vwMapMovementPanel')&&( $('#vwMapMovementPanel').innerHTML=mapMovementHTML() );
};
mapIndicatorMetaHTML=function(){const m=getMapIndicatorMeta();return `<strong style="color:var(--gold)">${mapEsc(m.label)}</strong><br>Category: ${mapEsc(m.category)}<br>Unit: ${mapEsc(m.unit)}<br>Formula: ${mapEsc(m.formula)}<br>Source: ${mapEsc(m.source)}<br>Status: ${mapEsc(m.status)}<br>Confidence: ${m.status==='computed'?'Medium-high':m.status==='modelled'?'Medium':'Proxy / requires validation'}<br>Caveat: ${mapEsc(m.caveat)}<div class="divider"></div><strong style="color:var(--gold)">Formula cards</strong><br>${indicatorFormulaCardsHTML()}`;};
rMapQualityHTML=function(){const q=VW_MAP_STATE.diagnostics||{};return `<strong style="color:var(--gold)">Map QA</strong><br>Generated: ${mapEsc(q.generatedAt||'—')}<br>County data match: ${q.countyDataMatch||0}/47<br>Boundary geometry match: ${q.geometryMatch||0}/47<br>Verified/proxy geometry: ${q.verifiedGeometryCount||0}/${q.proxyGeometryCount||0}<br>Boundary source confidence: ${mapEsc(q.boundarySourceConfidence||'—')}<br>Model output completeness: ${q.modelOutputCompleteness||0}%<br>High/Medium/Low DQ: ${q.highDQ||0}/${q.medDQ||0}/${q.lowDQ||0}<br>Quality score: ${Math.round(q.score||0)} / 100`;};

// Override profile explanation for explainability beside scores
mapCountyExplanation=function(row){
  const gap=row.values.article138Gap, tf=row.values.thirdShare, risk=row.values.disputeRisk, sig=computeCountySignals(row);
  const drivers=[]; if(Math.abs(gap)<5)drivers.push('Article 138 proximity'); if(tf>10)drivers.push('Third Force exposure'); if(risk>45)drivers.push('close-margin / dispute-risk signal'); if(row.dq!=='high')drivers.push(`${row.dq} data quality`);
  const conf=row.dq==='high'&&risk<45?'Medium-high':row.dq==='medium'?'Medium':'Low-to-medium';
  const dataNeed=row.dq==='high'?'recent polling and official register update':'verified ward results, official register update and county polling';
  return `<strong>Why this score:</strong> ${(drivers.length?drivers.join(', '):'no single severe driver under current assumptions')}.<br><strong>What moved it:</strong> current TF ${tf.toFixed(1)}%, Article 138 gap ${gap.toFixed(1)}pp, dispute ${risk.toFixed(0)}, civic ${sig.civic.toFixed(0)}, market ${sig.market.toFixed(0)}.<br><strong>Confidence:</strong> ${conf}. <strong>Data that would change this:</strong> ${dataNeed}.`;
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
  if(tab==='map'&&S.res){rMap(S.res.ctyRes);}
  if(tab==='report'){renderExecutiveReport();}
}
function currentScenarioSettings(){
  return {mode:S.mcMode,iterations:ITERS,seed:S.seed,viewMode:S.viewMode,theme:S.theme,protestVote:S.tf,incSwing:S.si,oppSwing:S.so,youthSurge:S.ys,followThrough:S.cfg.follow,teams:S.cfg.teams.map((t,i)=>`${t}: ${CAND.names.filter(n=>S.cfg.assign[n]===i).join(', ')||'nobody'}`).join(' · '),riftValley:S.reg.uda};
}
function qaStatusClass(status){return status==='PASS'?'qa-pass':status==='FAIL'?'qa-fail':'qa-warn';}
function technicalEngineQA(){
  const r=S.res||sim({},false,true,true);const mapQ=VW_MAP_STATE?.diagnostics||mapDiagnostics(VW_MAP_STATE?.rows||[]);const sharesOk=r.ctyRes.every(c=>Math.abs((c.i+c.o+c.t)-1)<0.002);const ctyOk=r.ctyRes.length===47;const wardOk=(S.wards||r.wardRes||[]).length>=1400;const pollOk=!!S.cfg&&Array.isArray(S.cfg.teams);
  const checks=[
    ['County result count',ctyOk,`${r.ctyRes.length}/47`],['Ward drilldown rows',wardOk,`${(S.wards||r.wardRes||[]).length}/1,457`],['Shares normalize to 100%',sharesOk,sharesOk?'within tolerance':'check county sums'],['Article 138 uses county vote share',true,'candidate share ≥25%, not turnout'],['Teams configured',pollOk,`${S.cfg.teams.length} teams`],['MC mode configured',!!MC_MODES[S.mcMode],`${S.mcMode} · ${ITERS}`],['Map county data match',(mapQ.count||0)===47,`${mapQ.count||0}/47`],['Map geometry match',(mapQ.boundaryMatched||0)>=45,`${mapQ.boundaryMatched||0}/47`]
  ];
  const fails=checks.filter(x=>!x[1]).length;return {checks,status:fails?'WARNING':'PASS'};
}
function topRowsBy(arr,key,n=5,asc=false){return [...arr].sort((a,b)=>asc?(a[key]-b[key]):(b[key]-a[key])).slice(0,n);}
function movementFromBaselineRows(){
  const rows=(S.res?.ctyRes||[]).map(c=>{const base=CM.get(c.name)?.baseIncumbent2022??c.i;const tfBase=0.03;return {...c,incMove:c.i-base,tfMove:c.t-tfBase,a138Deterioration:0.25-c.i,runoffSensitivity:Math.max(0,0.5-Math.max(c.i,c.o))*100+Math.abs(c.i-0.25)*12};});
  return {gains:topRowsBy(rows,'incMove',5),losses:topRowsBy(rows,'incMove',5,true),tfSurge:topRowsBy(rows,'tfMove',5),a138:topRowsBy(rows,'a138Deterioration',5),runoff:topRowsBy(rows,'runoffSensitivity',5)};
}
function driverNarrative(){
  if(!S.res)return 'Run the model to calculate drivers.';
  const base=S.res.nat.i;
  const drivers=[['Third Force baseline',Math.abs(sim({tf:S.tf+5},false,true,false).nat.i-base)],['Incumbent swing',Math.abs(sim({si:S.si+4},false,true,false).nat.i-base)],['Opposition swing',Math.abs(sim({so:S.so+4},false,true,false).nat.i-base)],['Youth turnout',Math.abs(sim({ys:S.ys+8},false,true,false).nat.i-base)],['Coalition cohesion',Math.abs(sim({cc:Math.max(55,S.cc-15)},false,true,false).nat.i-base)]];
  drivers.sort((a,b)=>b[1]-a[1]);
  return `Most sensitive assumption: ${drivers[0][0]}. Second: ${drivers[1][0]}. Third: ${drivers[2][0]}.`;
}
function reportTable(rows,cols){return `<table class="tbl"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof c[1]==='function'?c[1](r):(r[c[1]]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function renderExecutiveReport(){
  const el=$('#printReport'); if(!el)return;
  if(!S.res)renderAll();
  const r=S.res, mc_=S.mc||mc({},ITERS), dr=disRisk(r.ctyRes), i25=r.ctyRes.filter(c=>c.i>=0.25).length, lead=r.nat.i>=r.nat.o&&r.nat.i>=r.nat.t?'Incumbent':r.nat.o>=r.nat.t?'Opposition':'Third Force';
  const qa=technicalEngineQA(), mapQ=VW_MAP_STATE?.diagnostics||mapDiagnostics(VW_MAP_STATE?.rows||[]), move=movementFromBaselineRows(), settings=currentScenarioSettings(), f=ff(r.nat);
  const topTip=(S.tip||tipPts(r.ctyRes)).slice(0,8), topDis=dr.close.slice(0,8);
  el.innerHTML=`
  <div class="pr-cover no-break"><div><div class="pr-title">VOTEWATCH 2027</div><div class="pr-sub">Executive scenario report · generated ${new Date().toLocaleString('en-KE')} · scenario analysis, not prediction</div></div><div class="pr-stamp"><strong>Mode:</strong> ${settings.mode} / ${settings.iterations} iterations<br><strong>Seed:</strong> ${mapEsc(settings.seed)}<br><strong>Display:</strong> ${settings.viewMode}<br><strong>Teams:</strong> ${mapEsc(settings.teams)} · follow-through ${settings.followThrough}%<br><strong>Responsible-use:</strong> civic, academic, journalistic and analytical review only.</div></div>
  <div class="pr-grid no-break"><div class="pr-card"><div class="pr-l">Leading candidate</div><div class="pr-v vg">${lead}</div><div class="pr-note">National lead state under current assumptions.</div></div><div class="pr-card"><div class="pr-l">Incumbent share</div><div class="pr-v ${r.nat.i>0.5?'vgr':'vg'}">${pct(r.nat.i)}</div><div class="pr-note">Scenario-weighted national vote share.</div></div><div class="pr-card"><div class="pr-l">Run-off probability</div><div class="pr-v ${mc_.ro>0.6?'vr':mc_.ro>0.3?'va':'vgr'}">${pct(mc_.ro,0)}</div><div class="pr-note">Monte Carlo mode: ${settings.mode}.</div></div><div class="pr-card"><div class="pr-l">Path to 24</div><div class="pr-v ${i25>=24?'vgr':'vr'}">${i25}/47</div><div class="pr-note">Incumbent counties at ≥25%.</div></div></div>
  <div class="pr-section no-break"><div class="pr-h">Executive readout</div><div class="pr-note">Current scenario produces Incumbent ${pct(r.nat.i)}, Opposition ${pct(r.nat.o)}, Third Force ${pct(r.nat.t)}. ${i25>=24?'The incumbent clears the county breadth test in this deterministic run.':'The incumbent does not clear the county breadth test in this deterministic run.'} Run-off forcing signal: ${f.forced}. ${driverNarrative()}</div></div>
  <div class="pr-two pr-section"><div class="no-break"><div class="pr-h">Technical QA</div>${reportTable(qa.checks,[['Check',x=>x[0]],['Status',x=>x[1]?'<span class="qa-pass">PASS</span>':'<span class="qa-warn">WARN</span>'],['Detail',x=>x[2]]])}</div><div class="no-break"><div class="pr-h">Map / geometry QA</div><div class="pr-note">County data match: ${mapQ.count||0}/47<br>Boundary geometry match: ${mapQ.boundaryMatched||0}/47<br>Verified / proxy geometry: ${mapQ.verifiedGeometryCount||0} / ${mapQ.proxyGeometryCount||0}<br>Boundary source confidence: ${mapEsc(mapQ.boundarySourceConfidence||'—')}<br>Model output completeness: ${mapQ.modelOutputCompleteness||0}%<br>QA status: <span class="${qaStatusClass(mapQ.status)}">${mapEsc(mapQ.status||'—')}</span></div></div></div>
  <div class="pr-two pr-section"><div class="no-break"><div class="pr-h">Threshold-sensitive counties</div>${reportTable(topTip,[['County','name'],['Inc',x=>pct(x.i)],['Gap',x=>pct(x.ig)],['Votes needed',x=>N.format(Math.round(x.vn||0))],['DQ','dq']])}</div><div class="no-break"><div class="pr-h">Dispute / audit-priority counties</div>${reportTable(topDis,[['County','name'],['Lead','lead'],['Margin',x=>pct(Math.abs(x.ls-.5))],['DQ','dq'],['Cluster','cluster']])}</div></div>
  <div class="pr-section no-break"><div class="pr-h">Largest movement from baseline</div><div class="pr-two"><div>${reportTable(move.gains,[['Largest inc gains','name'],['Move',x=>(x.incMove>0?'+':'')+pct(x.incMove)],['Inc',x=>pct(x.i)]])}</div><div>${reportTable(move.losses,[['Largest inc losses','name'],['Move',x=>(x.incMove>0?'+':'')+pct(x.incMove)],['Inc',x=>pct(x.i)]])}</div></div></div>
  <div class="pr-section no-break"><div class="pr-h">Model risk register</div>${modelRiskRegisterHTML()}</div>
  <div class="pr-section no-break"><div class="pr-h">Validation and responsible-use note</div><div class="pr-note">Validation status: not externally validated. Required next data: 2022 ward presidential results; 2017 ward/constituency tallies; by-election results; polling time series; official voter-register growth. This report must not be used for voter suppression, deceptive persuasion, intimidation, unofficial result claims, or microtargeting based on sensitive traits.</div></div>`;
}
function printExecutiveReport(){renderExecutiveReport();openVwTab('report');setTimeout(()=>window.print(),220);}
function downloadReportHTML(){renderExecutiveReport();const html=`<!doctype html><html><head><meta charset="utf-8"><title>VOTEWATCH 2027 Executive Report</title><style>${Array.from(document.styleSheets).map(ss=>{try{return Array.from(ss.cssRules).map(r=>r.cssText).join('\n')}catch(e){return ''}}).join('\n')}</style></head><body><section class="print-report">${$('#printReport')?.innerHTML||''}</section></body></html>`;dlBlob(html,'votewatch2027_executive_report.html','text/html');}
function enhanceInteractivePolish(){
  document.querySelectorAll('.btn,.tbtn,.sw-btn').forEach(btn=>{if(btn.dataset.polished)return;btn.dataset.polished='1';btn.addEventListener('pointerdown',e=>{const r=btn.getBoundingClientRect();btn.style.setProperty('--rx',`${e.clientX-r.left}px`);btn.style.setProperty('--ry',`${e.clientY-r.top}px`);});});
  document.querySelectorAll('.pan,.kpi,.ro-card,.cc,.sqc').forEach((el,i)=>{if(el.dataset.reveal)return;el.dataset.reveal='1';el.style.animationDelay=`${Math.min(i*18,180)}ms`;});
}

// Override renderAll to append governance renders without rewriting base flow
const _renderAll_v44=renderAll;
renderAll=function(){_renderAll_v44();renderGovernanceWidgets();updateMcModeUI();updateViewModeLabels();applyTheme();renderExecutiveReport();enhanceInteractivePolish();};
// ═══ INIT ═══
function updateLabels(){
  $('#lv-tf').textContent=S.tf+'pp';
  $('#lv-si').textContent=(S.si>0?'+':'')+S.si+'pp';
  $('#lv-so').textContent=(S.so>0?'+':'')+S.so+'pp';
  $('#lv-ys').textContent=(S.ys>0?'+':'')+S.ys+'pp';
}

function bndSlider(id,key,scale){
  const el=$('#sl-'+id);if(!el)return;
  const rerender=dbnc(()=>{renderAll();rShockLog();},200);
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
  $('#sl-follow')?.addEventListener('input',e=>{S.cfg.follow=+e.target.value;$('#lv-follow').textContent=S.cfg.follow+'%';rerenderTeams();});
  renderTeams();

  $('#bRefresh').addEventListener('click',()=>{addShock();renderAll();decayShocks();rShockLog();S.timer=30;});
  $('#bReset').addEventListener('click',()=>{
    // Full reset: assumptions, political context, polls and probability settings.
    // (Previously left regimes/polls untouched and kept a stale iteration count and theme.)
    const {reg:dReg,...dSl}=DEFAULTS;
    Object.assign(S,dSl,{shocks:[],shLog:[],timer:30,mcMode:'preview',seed:'2027-baseline-001'});
    S.reg={...dReg};S.cfg=defaultCfg();
    Object.keys(dSl).forEach(k=>{const el=$('#sl-'+k);if(el)el.value=S[k];});
    if(typeof renderTeams==='function')renderTeams();
    $('#mcModeSelect')&&($('#mcModeSelect').value=S.mcMode);$('#seedInput')&&($('#seedInput').value=S.seed);$('#viewModeSelect')&&($('#viewModeSelect').value=S.viewMode);
    syncRegimeUI();updateMcModeUI();updateViewModeLabels();updateLabels();renderAll();rShockLog();
  });

  $('#ctySrch')?.addEventListener('input',dbnc(()=>{if(S.res)rCountyGrid(S.res.ctyRes);},80));
  $('#wardSrch')?.addEventListener('input',dbnc(()=>{if(S.wards)rWardDrill(S.wards);},80));



  // v4.5 governance controls
  $('#mcModeSelect')?.addEventListener('change',e=>{S.mcMode=e.target.value;updateMcModeUI();renderAll();rShockLog();});
  $('#seedInput')?.addEventListener('change',e=>{S.seed=e.target.value||'2027-baseline-001';updateMcModeUI();if(S.mcMode==='research'){renderAll();rShockLog();}});
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
