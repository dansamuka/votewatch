// ═══ DATA ═══
const WARDS=WD.map(w=>({id:w.id,county:w.co,constituency:w.cs,ward:w.w,
  voters:w.v,toBase:w.tb,bi:w.bi,bo:w.bo,cl:w.cl,dq:w.dq,vl:w.vl,yr:w.yr,dn:w.dn}));
const CM=new Map(CO.map(c=>[c.name,c]));
const WBC=new Map();
WARDS.forEach(w=>{if(!WBC.has(w.county))WBC.set(w.county,[]);WBC.get(w.county).push(w);});

// ═══ ANALYTICAL CONSTANTS ═══
// TF_BASE: calibrated to 2025 pre-declaration state
// Urban 6.8%, MtnRebel 4.2%, Coast 2.8%, Eastern 2.5%, Nyanza 2.5%, RV 1.8%
// These give ~47-48% inc national at defaults WITHOUT forcing runoff
const TF_BASE={
  'Urban/Protest':0.068,'Mountain Rebel':0.042,'Coast/Joho':0.028,
  'Eastern/Ukambani':0.025,'Nyanza Split':0.025,'Rift Valley Anchor':0.018
};
// Added when Gachagua regime ON
const TF_GACH={
  'Mountain Rebel':0.140,'Urban/Protest':0.050,'Eastern/Ukambani':0.030,
  'Coast/Joho':0.020,'Nyanza Split':0.010,'Rift Valley Anchor':0.005
};
// Cluster-dynamic leakage caps
const LCAPS={
  'Mountain Rebel':{i:0.58,o:0.24},'Urban/Protest':{i:0.48,o:0.40},
  'Coast/Joho':{i:0.36,o:0.46},'Nyanza Split':{i:0.20,o:0.56},
  'Eastern/Ukambani':{i:0.36,o:0.36},'Rift Valley Anchor':{i:0.26,o:0.20}
};
// Turnout sigma by cluster (heteroskedastic)
const TO_SIG={
  'Urban/Protest':0.048,'Mountain Rebel':0.042,'Coast/Joho':0.036,
  'Nyanza Split':0.032,'Eastern/Ukambani':0.038,'Rift Valley Anchor':0.024
};
// R2 transfer rates
const R2T={
  toI:{'Mountain Rebel':0.75,'Urban/Protest':0.58,'Coast/Joho':0.52,'Eastern/Ukambani':0.55,'Nyanza Split':0.22,'Rift Valley Anchor':0.48},
  toO:{'Mountain Rebel':0.22,'Urban/Protest':0.52,'Coast/Joho':0.58,'Eastern/Ukambani':0.50,'Nyanza Split':0.78,'Rift Valley Anchor':0.30},
  spl:{'Mountain Rebel':0.50,'Urban/Protest':0.50,'Coast/Joho':0.50,'Eastern/Ukambani':0.50,'Nyanza Split':0.50,'Rift Valley Anchor':0.50}
};
// Scenario presets — stored as RAW integers (pp), engine divides by 100
const SCENS=[
  {id:'q1',tier:'Q1 — HIGH RISK',c:'#b83232',t:'TF Strong + Mt Kenya Fractures',
    d:'Gachagua runs. TF polls 18%+ nationally. Ruto loses >60% of Mountain Rebel base.',
    p:{tf:16,si:-7,so:2,ys:10,cc:68}},
  {id:'q2',tier:'Q2 — CONTESTED',c:'#b86a10',t:'TF Strong + Mt Kenya Holds',
    d:'Third Force significant but Ruto retains Kikuyu core. Urban protest vote elevated.',
    p:{tf:13,si:1,so:-1,ys:6,cc:88}},
  {id:'q3',tier:'Q3 — UNCERTAIN',c:'#b86a10',t:'TF Weak + Mt Kenya Fractures',
    d:'Linda Mwananchi collapses. Ruto loses Mt Kenya without meaningful TF offset.',
    p:{tf:2,si:-8,so:3,ys:2,cc:70}},
  {id:'q4',tier:'Q4 — INC HOLDS',c:'#1b7a4a',t:'TF Weak + Mt Kenya Consolidates',
    d:'TF fades. UDA sweeps Mt Kenya. Broad-Based delivers fully. Coalition intact.',
    p:{tf:1,si:6,so:-3,ys:0,cc:97}}
];
// Coalition counties
const FK=['Bungoma','Kakamega','Vihiga','Busia','Trans Nzoia'];
const OLG=['Mombasa','Kilifi','Kwale','Lamu','Tana River'];
const MC_MODES={preview:400,standard:1000,research:5000};
let ITERS=MC_MODES.preview;
const CTY_N=24;

// ═══ STATE — all raw integers, engine divides ═══
const S={
  tf:3,si:0,so:0,ys:0,cc:90,  // RAW: tf=3 means 3pp; engine does /100
  reg:{gach:false,odm:true,uda:true,poll:false},
  pa:{inc:48,opp:36,tf:13},   // RAW polling %
  selCty:'Nairobi City',
  shocks:[],shLog:[],timer:30,live:false,
  res:null,wards:null,sens:null,tip:null,mc:null,
  seed:'2027-baseline-001',mcMode:'preview',viewMode:'internal',theme:'dark'
};

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
const CLUSTERS=['Urban/Protest','Mountain Rebel','Coast/Joho','Eastern/Ukambani','Rift Valley Anchor','Nyanza Split'];
const RV_UDA=['Nandi','Kericho','Bomet','Baringo','Elgeyo/Marakwet','Uasin Gishu','West Pokot'];
const SENS2={'Urban/Protest':1.42,'Mountain Rebel':1.28,'Coast/Joho':1.08,'Eastern/Ukambani':1.04,'Nyanza Split':1.06,'Rift Valley Anchor':0.70};
const IW={'Mountain Rebel':0.75,'Nyanza Split':0.20,'Rift Valley Anchor':0.62,'Coast/Joho':0.40,'Urban/Protest':0.45};
const DQ_SIG={high:0.015,medium:0.028,low:0.044,imputed:0.058},DN_MUL={high:0.8,medium:1.0,low:1.4},VL_MUL={low:0.8,medium:1.0,high:1.25};
const CO_IDX=new Map(CO.map((c,i)=>[c.name,i]));
const WK=WARDS.map(w=>({
  ci:CO_IDX.has(w.county)?CO_IDX.get(w.county):-1,
  tfB:TF_BASE[w.cl]||0.025, tfG:TF_GACH[w.cl]||0,
  fk:FK.includes(w.county), olg:OLG.includes(w.county), rv:RV_UDA.includes(w.county),
  sig:(DQ_SIG[w.dq]||0.034)*(DN_MUL[w.dn]||1.0)*(VL_MUL[w.vl]||1.0),
  toSig:TO_SIG[w.cl]||0.038,
  caps:LCAPS[w.cl]||{i:0.38,o:0.38},
  sens2:SENS2[w.cl]||1.0, iw:IW[w.cl]||0.50
}));

// CRITICAL FIX: params stored as RAW integers, ALL divided by 100 here ONCE
function sim(params={},noise=false,shocks=true,capWards=false){
  // Merge: S values are raw, params override also raw, divide by 100 here
  const tf  =(params.tf  !==undefined?params.tf  :S.tf )  /100;
  const si  =(params.si  !==undefined?params.si  :S.si )  /100;
  const so  =(params.so  !==undefined?params.so  :S.so )  /100;
  const ys  =(params.ys  !==undefined?params.ys  :S.ys )  /100;
  const cc  =(params.cc  !==undefined?params.cc  :S.cc )  /100;
  const pollW=0.40; // polling anchor weight

  // Cluster noise: drawn in fixed CLUSTERS order so seeded runs stay reproducible
  // A national swing is drawn first and applied to every ward, so polling-style
  // error is correlated nationally instead of averaging away across wards.
  const natSwing=noise?rng()*NAT_SWING_SD:0;
  const clNoise={};
  CLUSTERS.forEach(cl=>clNoise[cl]=noise?rng()*0.036:0);

  const agg=CO.map(c=>({
    name:c.name,cluster:c.cluster,pop:c.projectedVoters2027,
    dq:c.dataQuality,vl:c.volatility,yr:c.youthRatio,
    tv:0,iv:0,ov:0,tfv:0,ts:0,wc:0,il:0,ol:0
  }));

  // Polling anchor adjustment — fully wired for incumbent, opposition and Third Force
  let polIncAdj=0, polOppAdj=0, polTfAdj=0;
  if(S.reg.poll){
    const pi=S.pa.inc/100, po=S.pa.opp/100, pt=S.pa.tf/100;
    polIncAdj=(pi-0.505)*pollW;      // 0.505 = 2022 incumbent-aligned national baseline
    polOppAdj=(po-0.489)*pollW;      // 0.489 = 2022 opposition-aligned national baseline
    polTfAdj=(pt-0.030)*pollW;       // 0.030 = scenario Third Force prior baseline
  }
  // Active shocks; cluster shocks are defined with `cl`, older ones with `cluster`
  const shockList=shocks?S.shocks.map(sh=>({sh,cl:sh.cluster||sh.cl})):[];
  const {gach,odm,uda,poll}=S.reg;

  const wardRes=[];
  for(let wi=0;wi<WARDS.length;wi++){
    const w=WARDS[wi],k=WK[wi];
    // TF base: regime-dependent
    let tfBase=k.tfB+(gach?k.tfG:0)+tf;
    if(poll)tfBase=clamp(tfBase+polTfAdj,0,0.35);

    // Coalition adjustments
    let csi=0,coa=0;
    if(k.fk&&odm){const d=(1-cc)*0.08;csi=-d;coa=d*0.5;}
    else if(k.olg){
      if(!odm){csi=-0.04;coa=0.05;}
      else{const d=(1-cc)*0.05;csi=d*0.3;coa=-d*0.4;}
    }
    if(!uda&&k.rv){csi-=0.03;}

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

    // Asymmetric share calculation
    let inc=w.bi+si+clNoise[w.cl]+ssh+polIncAdj+csi+ns+natSwing;
    let opp=w.bo+so-clNoise[w.cl]*0.5+polOppAdj+coa-ns*0.4-natSwing;

    // Leakage
    const caps=k.caps,iw=k.iw;
    const leakR=clamp(tfBase*k.sens2,0,0.26);
    const il=Math.min(inc*caps.i,inc*leakR*iw);
    const ol=Math.min(opp*caps.o,opp*leakR*(1-iw));
    inc-=il;opp-=ol;let tf_=tfBase+il+ol+stf; // stf: Third Force shocks (previously computed but never applied)

    // Normalize
    const tot=Math.max(inc,0)+Math.max(opp,0)+Math.max(tf_,0)||1;
    const si_=Math.max(inc,0)/tot,so_=Math.max(opp,0)/tot,st_=Math.max(tf_,0)/tot;

    const to=clamp(w.toBase+(w.yr||0.42)*ys+sto+tn,0.24,0.87);
    const vs=w.voters*to;
    const a=k.ci>=0?agg[k.ci]:null;
    if(a){a.tv+=vs;a.iv+=vs*si_;a.ov+=vs*so_;a.tfv+=vs*st_;a.ts+=to;a.wc++;a.il+=il*vs;a.ol+=ol*vs;}
    if(capWards)wardRes.push({county:w.county,constituency:w.constituency,ward:w.ward,
      voters:w.voters,to,inc:si_,opp:so_,tf:st_,dq:w.dq,vl:w.vl,cl:w.cl});
  }

  const ctyRes=agg.map(c=>{
    const tv=c.tv||1,i=c.iv/tv,o=c.ov/tv,t=c.tfv/tv;
    return{...c,to:c.ts/(c.wc||1),i,o,t,
      ia:i>=0.25,oa:o>=0.25,ta:t>=0.25,
      lead:i>=o&&i>=t?'inc':o>=t?'opp':'tf',
      ls:Math.max(i,o,t),il:c.il/tv,ol:c.ol/tv};
  });

  const tot=ctyRes.reduce((a,c)=>({v:a.v+c.tv,i:a.i+c.iv,o:a.o+c.ov,t:a.t+c.tfv}),{v:0,i:0,o:0,t:0});
  const nat={i:tot.i/(tot.v||1),o:tot.o/(tot.v||1),t:tot.t/(tot.v||1),v:tot.v};
  return{ctyRes,nat,wardRes};
}


function mc(params={},n=ITERS){
  let iW=0,oW=0,ro=0,iJ=0,oJ=0;
  const iA=[],oA=[],tA=[];
  const prevRng=RNG_SOURCE;
  if(S.mcMode==='research'){
    RNG_SOURCE=mulberry32(seedHash(`${S.seed}|${JSON.stringify(params)}|${n}|${S.tf}|${S.si}|${S.so}|${S.ys}|${S.cc}|${S.pa.inc}|${S.pa.opp}|${S.pa.tf}|${S.reg.gach}|${S.reg.odm}|${S.reg.uda}|${S.reg.poll}`));
  }
  try{
    for(let i=0;i<n;i++){
      try{
        const r=sim(params,true,true,false);
        const i25=r.ctyRes.filter(c=>c.i>=0.25).length;
        const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
        const iP=r.nat.i>0.50&&i25>=CTY_N;
        const oP=r.nat.o>0.50&&o25>=CTY_N;
        if(iP)iW++;else if(oP)oW++;else ro++;
        if(iP)iJ++;if(oP)oJ++;
        iA.push(r.nat.i);oA.push(r.nat.o);tA.push(r.nat.t);
      }catch(e){}
    }
  }finally{
    RNG_SOURCE=prevRng;
  }
  return{iW:iW/n,oW:oW/n,ro:ro/n,iJ:iJ/n,oJ:oJ/n,
    iMed:qntl(iA,.5),oMed:qntl(oA,.5),tMed:qntl(tA,.5),
    iLo:qntl(iA,.1),iHi:qntl(iA,.9),oLo:qntl(oA,.1),oHi:qntl(oA,.9),
    iterations:n,mode:S.mcMode,seed:S.mcMode==='research'?S.seed:null};
}

function r2sim(ctyRes,nat,dir='spl'){
  const rt=R2T[dir];
  let r2iV=0,r2oV=0;
  const r2cty=ctyRes.map(c=>{
    const rate=rt[c.cluster]||0.50;
    const ig=c.tfv*rate,og=c.tfv*(1-rate);
    const r2i=c.iv+ig,r2o=c.ov+og,r2t=r2i+r2o;
    r2iV+=r2i;r2oV+=r2o;
    const r2is=r2i/r2t;
    return{...c,r2is,r2lead:r2is>=0.5?'inc':'opp'};
  });
  const r2tot=r2iV+r2oV;
  const r2iN=r2iV/r2tot;
  const ri25=r2cty.filter(c=>c.r2is>=0.25).length;
  // Art. 138(7): in the fresh (run-off) election the candidate with the most
  // votes is elected; there is no 25%-in-24-counties test in round two.
  return{r2cty,r2iN,r2oN:1-r2iN,win:r2iN>0.50,ri25,dir};
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
    out.push(`Run-off is the most likely outcome (${pct(mc_.ro)} of simulations): in those runs neither candidate clears both Article 138 tests (50%+1 nationally and 25% in 24 counties). The Third Force functions as a forcing mechanism at ${pct(nat.t)} nationally — currently ${f.ia?pct(f.tbi)+' short of the block threshold':'already blocking incumbent'}.`);
  else if(mc_.iW>0.45)
    out.push(`Incumbent holds a first-round path: P(outright win) ${pct(mc_.iW)}. County threshold met at ${i25}/47. The 90% simulation band runs ${pct(mc_.iLo)}–${pct(mc_.iHi)}, indicating meaningful uncertainty within a broadly favourable scenario.`);
  else
    out.push(`Genuinely contested configuration. Incumbent outright: ${pct(mc_.iW)}, run-off: ${pct(mc_.ro)}. Small parameter shifts produce qualitatively different outcomes — this is peak scenario sensitivity.`);

  const vulnCl=S.reg.gach?'Mountain Rebel':'Urban/Protest';
  const vuln=ctyRes.filter(c=>c.cluster===vulnCl&&c.i<0.25);
  if(vuln.length>0)
    out.push(`Critical Art.138 exposure in ${vulnCl}: ${vuln.length} count${vuln.length>1?'ies':'y'} (${vuln.map(c=>c.name).slice(0,3).join(', ')}) fall below the 25% constitutional threshold. Each denies a county in the Art.138(4)(b) count.`);
  else{
    // nearest county to the 25% line within the same cluster (was: nearest nationally)
    const near=ctyRes.filter(c=>c.cluster===vulnCl).sort((a,b)=>a.i-b.i)[0];
    out.push(`No counties in ${vulnCl} fall below 25% at current parameters.${near?` Closest: ${near.name} at ${pct(near.i)}, ${pct(near.i-0.25)} above the threshold.`:''}`);
  }

  if(mc_.ro>0.25){
    const ri=r2sim(ctyRes,nat,'toI'),ro=r2sim(ctyRes,nat,'toO');
    out.push(`Run-off outcome is endorsement-sensitive: TF→Inc yields ${pct(ri.r2iN)} incumbent R2; TF→Opp yields ${pct(ro.r2iN)}. The endorsement swing is ${pct(Math.abs(ri.r2iN-ro.r2iN))} — decisive if R2 is close.`);
  }

  if(dr.score>55)
    out.push(`Dispute vulnerability elevated (${Math.round(dr.score)}/100). ${dr.n} counties within petition margin; ${pct(dr.conc,0)} concentrated in ${dr.top}. Geographic concentration of disputed results in one cluster substantially strengthens a petition narrative.`);
  else
    out.push(`Dispute exposure moderate (${Math.round(dr.score)}/100), minimum margin ${pct(dr.minM)}. Within historical norms for election-day litigation filing. Would not constitute a strong evidentiary basis for a 2017-style petition absent specific data irregularities.`);

  if(S.reg.gach)
    out.push(`REGIME ALERT: Gachagua candidacy switch ACTIVE. Mountain Rebel TF elevated +14pp. Incumbent's 2022 base in Meru, Nyeri, Kirinyaga, Nyandarua, Murang'a and Kiambu is structurally compromised. Run-off module is now the primary analytical lens.`);
  else if(!S.reg.odm)
    out.push(`COALITION ALERT: ODM-LG deal OFF. Coast counties revert to 2022 opposition base. Incumbent share in Kilifi projected below 25% — Article 138 coastal counties critically at risk.`);

  return out;
}

// ═══ INTEL DATA ═══
const LEVERS=[
  {s:'red',t:'Gachagua candidacy declaration',d:'Formal Linda Mwananchi/Kenya Moja candidacy — binary regime switch, not a slider.',i:'+14pp TF Mountain Rebel · Inc swing -7 to -10pp in Meru/Nyeri/Kirinyaga/Kiambu · Run-off P +35–45pp'},
  {s:'red',t:'ODM-Linda Ground deal collapse',d:'Talks fail. Coast opposition share reverts, removing Joho machine delivery from coalition.',i:'Inc loses -3 to -5pp Mombasa/Kilifi/Kwale · Art.138 coast counties at risk'},
  {s:'amb',t:'IEBC voter registration surge',d:'New registrations in Urban/Protest and Mountain Rebel wards. Key leading indicator for youth surge magnitude.',i:'Each 1% new youth registration → ~0.5pp effective youthSurge · Update youthRatio by ward'},
  {s:'amb',t:'Third Force financing filings',d:'IEBC campaign filings. Underfunded TF (<KSh 2B) collapses to <4% nationally.',i:'If weak: TF baseline -5 to -8pp · Run-off forcing threshold rises proportionally'},
  {s:'amb',t:'UDA parliamentary defections',d:'MPs shifting to opposition or TF — signals Rift Valley Anchor softening.',i:'Each RV defection: ~0.4pp RV swing uncertainty · 5+ defections → toggle UDA switch'},
  {s:'grn',t:'Fuel/CPI data release',d:'Single strongest economic driver of Urban/Protest swing. KNBS monthly data.',i:'CPI >10% sustained: Urban -2 to -4pp inc · Youth surge +3 to +6pp'},
  {s:'grn',t:'TIFA/Infotrak polling release',d:'County-level tracking. Use Polling Anchor feature with actual numbers.',i:'>5pp county divergence from model = revise cluster baseline via Polling Anchor'}
];
const SENTS=[
  {tier:'HIGH',freq:'Wkly',t:'Ruto/UDA constituency project announcements',n:'Service delivery → inc swing in target county'},
  {tier:'HIGH',freq:'Wkly',t:'Raila domestic presence vs. international calendar',n:'Absence affects Nyanza mobilisation baseline'},
  {tier:'HIGH',freq:'Wkly',t:'Gachagua Mt Kenya rallies — language analysis',n:'"Coalition" vs "movement" language signals candidacy timeline'},
  {tier:'HIGH',freq:'Wkly',t:'Linda Mwananchi/Kenya Moja polling releases',n:'Calibrate against TF baseline — enter in Polling Anchor'},
  {tier:'MED',freq:'Mthly',t:'Fuel prices and public grievance index',n:'Urban/Protest cluster swing sensitivity — strongest single lever'},
  {tier:'MED',freq:'Mthly',t:'CDF disbursement and county absorption rates',n:'Service delivery proxy → inc sentiment'},
  {tier:'MED',freq:'Mthly',t:'Security incidents in ASAL counties',n:'Turnout suppressor — adjust turnoutBase for affected counties'},
  {tier:'LOW',freq:'Qtrly',t:'Diaspora remittance trends',n:'Coast/diaspora vote motivation proxy'},
  {tier:'LOW',freq:'Qtrly',t:'Senate censure motions against Ruto',n:'Elite defection risk indicator within UDA'}
];
const BYES=[
  {n:'Kasarani',co:'Nairobi City',yr:2023,mb:0.462,act:0.441,d:-0.021,note:'Urban protest 2.1pp above 2022 model base — update Urban cluster by -2pp'},
  {n:'Kibwezi West',co:'Makueni',yr:2023,mb:0.091,act:0.084,d:-0.007,note:'Eastern/Ukambani well-calibrated; within measurement error'},
  {n:'Embakasi East',co:'Nairobi City',yr:2024,mb:0.462,act:0.429,d:-0.033,note:'Urban protest strengthening — Urban base should be revised -3pp'}
];
const ROADMAP=[
  {p:'P1',i:'IEBC 2022 Form 34C ward tallies',imp:'Upgrades 450 Nyanza/Nairobi/Busia wards low→medium quality',src:'Harvard Dataverse'},
  {p:'P1',i:'KNBS 2019 census ward age breakdown',imp:'Replace county-imputed youthRatio with ward-precise values',src:'Kenya Open Data'},
  {p:'P2',i:'KPLC electrification data by ward',imp:'Replace synthetic infrastructureIndex',src:'KPLC/REREC reports'},
  {p:'P2',i:'IEBC registration growth 2019→2022',imp:'Refine 2027 voter projections by ward',src:'IEBC public register'},
  {p:'P3',i:'CDF expenditure by constituency',imp:'Replace synthetic serviceDeliverySignal',src:'National Treasury'},
  {p:'P3',i:'TIFA/Infotrak 2026 county polling',imp:'Calibrate cluster baselines via Polling Anchor',src:'Purchase/FOI'}
];
const REG_EFF=[
  {sw:'Gachagua Runs: YES',e:'TF_BASE[Mountain Rebel] += 14pp. TF_BASE[Urban] += 5pp. Applied as additive to ward-level TF before leakage. Expected: +8–10pp TF national, -6pp Inc national, run-off P +35–45pp.'},
  {sw:'ODM-LG Deal: OFF',e:'Coast reverts to 2022 opposition base without Joho delivery. Inc loses ~3–5pp in Mombasa/Kilifi/Kwale. 25% threshold at risk in Kilifi.'},
  {sw:'UDA Majority: OFF',e:'RV Anchor swing -3pp inc in Nandi/Kericho/Bomet/Baringo/Elgeyo belt. Trans Nzoia and Baringo become marginal.'},
  {sw:'Polling Anchor: ON',e:'Bayesian shrinkage: county baselines weighted 40% toward current polling national shares, 60% toward 2022 spatial pattern. Enter latest TIFA/Infotrak figures in fields above sliders.'}
];

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
  {t:'Large rally in Eldoret',cl:'Rift Valley Anchor',si:0.018,desc:'+1.8% Inc RV Anchor'},
  {t:'Urban protest disruption',cl:'Urban/Protest',si:-0.014,to:-0.010,desc:'-1.4% Inc Urban'},
  {t:'Third Force youth rally',cl:'Urban/Protest',tf:0.018,desc:'+1.8% TF Urban'},
  {t:'Mt Kenya political signal',cl:'Mountain Rebel',si:-0.016,desc:'-1.6% Inc Mtn Rebel'},
  {t:'Coastal development event',cl:'Coast/Joho',si:0.014,desc:'+1.4% Inc Coast'},
  {t:'Economic discontent signal',cl:'Urban/Protest',si:-0.012,desc:'-1.2% Inc Urban'},
  {t:'County endorsement signal',rnd:true,si:0.012,desc:'+1.2% Inc in county'},
  {t:'Service delivery goodwill',rnd:true,si:0.014,desc:'+1.4% Inc in county'}
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
    <div class="kpi-l">Incumbent · first round</div>
    <div class="kpi-v ${n.i>0.50?'vgr':n.i>0.45?'vg':'vr'}">${pct(n.i,1)}</div>
    <div class="kpi-d">${n.i>0.50?'<span class="b b-gr">Above 50%</span>':'<span class="b b-r">Below 50%</span>'} · likely range ${pct(mc_.iLo,1)}–${pct(mc_.iHi,1)}</div>
    <div class="kpi-d">Chance of winning outright: <strong>${pct(mc_.iW,0)}</strong></div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Chance of a run-off</div>
    <div class="kpi-v ${mc_.ro>0.55?'vr':mc_.ro>0.30?'va':'vgr'}">${pct(mc_.ro,0)}</div>
    <div class="kpi-d">Outright: incumbent ${pct(mc_.iW,0)}, opposition ${pct(mc_.oW,0)}</div>
    <div class="kpi-d">${f.tbi>0?`A further <strong>${pct(f.tbi)}</strong> third-force vote would force one`:'Incumbent already below 50%'}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Counties where incumbent has 25%+ <span class="kpi-hint">need 24</span></div>
    <div class="kpi-v ${i25>=24?'vgr':'vr'}">${i25}<span style="font-size:20px;color:var(--muted)">/47</span></div>
    <div class="kpi-d">${i25>=24?'<span class="b b-gr">Passes county test</span>':'<span class="b b-r">Short by '+(24-i25)+'</span>'}</div>
    <div class="kpi-d">Opposition has 25%+ in ${r.ctyRes.filter(c=>c.o>=0.25).length}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Dispute risk <span class="kpi-hint">0–100</span></div>
    <div class="kpi-v ${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}</div>
    <div class="kpi-d">${dr.n} close counties · tightest margin ${pct(dr.minM)}</div>
    <div class="kpi-d">Most of them in ${dr.top}</div>
  </div>
  <div class="kpi">
    <div class="kpi-l">Third force · national</div>
    <div class="kpi-v va">${pct(n.t,1)}</div>
    <div class="kpi-d">Simulation median ${pct(mc_.tMed)} · ${S.reg.gach?'Gachagua in the race':'no Gachagua candidacy'}</div>
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
  ${[['Incumbent',n.i,'blbr'],['Opposition',n.o,'red2'],['Third Force',n.t,'amb2']].map(([l,v,c])=>`
  <div style="flex:1;padding:10px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">${l}</div>
    <div style="font-family:var(--disp);font-size:28px;color:var(--${c})">${pct(v)}</div>
    <div class="pbar mt6"><div class="pf p-${c==='blbr'?'b':c==='red2'?'r':'a'}" style="width:${pct(v,0)}"></div></div>
  </div>`).join('')}
  </div>
  <table class="tbl"><thead><tr><th>Cluster</th><th>Votes</th><th>Inc</th><th>Opp</th><th>TF</th><th>Split</th></tr></thead>
  <tbody>${cls.map(([cl,d])=>`<tr>
    <td style="font-weight:600">${cl}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${N.format(Math.round(d.tv))}</td>
    <td style="color:var(--blbr)">${pct(d.iv/d.tv)}</td>
    <td style="color:var(--red2)">${pct(d.ov/d.tv)}</td>
    <td style="color:var(--amb2)">${pct(d.tfv/d.tv)}</td>
    <td style="min-width:90px"><div class="stk"><div class="si" style="flex:${d.iv/d.tv}"></div><div class="so" style="flex:${d.ov/d.tv}"></div><div class="st" style="flex:${d.tfv/d.tv}"></div></div></td>
  </tr>`).join('')}</tbody></table>`;
}

function rTornado(nat){
  const base=nat.i;
  // Each bar is a real deterministic re-run of the engine (previously fixed offsets)
  const run=p=>sim(p,false,true,false).nat.i;
  const cases=[
    {l:'Third force +13pp',v:run({tf:S.tf+13})},
    {l:'Third force +8pp',v:run({tf:S.tf+8})},
    {l:'Youth turnout +12pp',v:run({ys:S.ys+12})},
    {l:'Opposition swing +6pp',v:run({so:S.so+6})},
    {l:'Cohesion 65%',v:run({cc:65})},
    {l:'Cohesion 98%',v:run({cc:98})},
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
    <div class="kpi-v ${f.forced?'va':mc_.iW>0.5?'vgr':'vr'}">${f.forced?'Run-off':mc_.iW>0.5?'Incumbent wins':'Contested'}</div>
    <div class="kpi-d">Incumbent ${pct(nat.i)} · Opposition ${pct(nat.o)} · Third force ${pct(nat.t)}</div></div>
  <div class="kpi"><div class="kpi-l">Chance of a run-off</div>
    <div class="kpi-v ${mc_.ro>0.55?'vr':mc_.ro>0.30?'va':'vgr'}">${pct(mc_.ro,0)}</div>
    <div class="kpi-d">Across ${N.format(ITERS)} simulated elections</div></div>
  <div class="kpi"><div class="kpi-l">Third-force vote needed to force a run-off</div>
    <div class="kpi-v va">${f.ia?'+'+pct(f.tbi):'Already forced'}</div>
    <div class="kpi-d">${f.ia?`On top of today's ${pct(nat.t)}, to pull the incumbent below 50%+1`:`The incumbent is already below 50% at ${pct(nat.t)} third-force share`}</div></div>`;

  const dirs=[{k:'toI',l:'If third force backs the incumbent',c:'var(--blbr)'},{k:'toO',l:'If third force backs the opposition',c:'var(--red2)'},{k:'spl',l:'If third-force voters split evenly',c:'var(--muted)'}];
  $('#roScens').innerHTML=dirs.map(d=>{
    const ro=r2sim(ctyRes,nat,d.k);
    const carried=ro.r2cty.filter(c=>c.r2lead==='inc').length;
    return`<div class="ro-card">
      <div class="ro-ttl" style="color:${d.c}">${d.l}</div>
      <div class="ro-val" style="color:${ro.win?'var(--gbr)':'var(--red2)'}">${pct(ro.r2iN)}</div>
      <div style="font-size:13px;color:var(--text-2);margin-top:6px;">Incumbent's second-round share · leads in ${carried}/47 counties</div>
      <div class="pbar mt8"><div class="pf p-b" style="width:${pct(ro.r2iN,0)}"></div></div>
      <div style="margin-top:6px;">${ro.win?'<span class="b b-gr">Incumbent wins</span>':'<span class="b b-r">Opposition wins</span>'}</div>
    </div>`;
  }).join('');

  $('#roTrans').innerHTML=`<table class="tbl"><thead><tr><th>Cluster</th><th>→Inc Rate</th><th>→Opp Rate</th><th>Basis</th></tr></thead>
  <tbody>${Object.keys(R2T.toI).map(cl=>`<tr>
    <td style="font-weight:600">${cl}</td>
    <td style="color:var(--blbr)">${pct(R2T.toI[cl])}</td>
    <td style="color:var(--red2)">${pct(1-R2T.toI[cl])}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${cl==='Mountain Rebel'?'2017 Gichugu analogue':cl==='Nyanza Split'?'2017 NASA retention':'Directional survey est.'}</td>
  </tr>`).join('')}</tbody></table>`;

  const ro=r2sim(ctyRes,nat,'toI');
  const marg=ro.r2cty.filter(c=>Math.abs(c.r2is-0.5)<0.10).sort((a,b)=>Math.abs(a.r2is-0.5)-Math.abs(b.r2is-0.5));
  $('#roCtbl').innerHTML=`<thead><tr><th>County</th><th>R2 Inc</th><th>R2 Winner</th><th>Cluster</th></tr></thead>
  <tbody>${marg.map(c=>`<tr>
    <td style="font-weight:600">${c.name}</td>
    <td style="color:${c.r2is>=0.5?'var(--blbr)':'var(--red2)'}">${pct(c.r2is)}</td>
    <td><span class="b ${c.r2lead==='inc'?'b-b':'b-r'}">${c.r2lead.toUpperCase()}</span></td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${c.cluster}</td>
  </tr>`).join('')}</tbody>`;

  $('#ffDetail').innerHTML=`<div class="g3">
    <div><div class="kpi-l">Combined share</div><div style="font-family:var(--disp);font-size:22px;">${pct(nat.i+nat.o)}</div></div>
    <div><div class="kpi-l">Forcing threshold</div><div style="font-family:var(--disp);font-size:22px;color:var(--amb2);">${f.ia?pct(f.tbi+nat.t):'Blocked'}</div></div>
    <div><div class="kpi-l">Status</div>${f.forced?'<span class="b b-r">RUN-OFF FORCED</span>':f.ia?'<span class="b b-g">INC ABOVE 50%</span>':'<span class="b b-gr">OPP ABOVE 50%</span>'}</div>
  </div>`;
}

function rTipping(r,f,i25){
  const tip=S.tip||[];
  $('#ffBoxes').innerHTML=`
  <div style="flex:1;padding:11px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">TF to Block Incumbent</div>
    <div style="font-family:var(--disp);font-size:26px;color:${f.ia?'var(--amb2)':'var(--gbr)'};">${f.ia?pct(f.tbi):'Already &lt;50%'}</div>
    <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:4px;">Current TF: ${pct(f.cur)}</div>
  </div>
  <div style="flex:1;padding:11px;background:var(--s2);border:1px solid var(--bdr);">
    <div style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">TF to Block Opposition</div>
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

  $('#tipTbl').innerHTML=`<thead><tr><th>County</th><th>Cluster</th><th>Inc Share</th><th>Gap to 25%</th><th>Votes Needed</th><th>Opp</th><th>TF</th><th>2017→2022</th><th>DQ</th></tr></thead>
  <tbody>${tip.length?tip.map(t=>{
    const gc=t.ig>0.04?'b-r':t.ig>0?'b-a':t.ig>-0.04?'b-gr':'b-m';
    const hist=CM.get(t.name);
    return`<tr><td style="font-weight:600">${t.name}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${t.cl}</td>
    <td style="color:var(--blbr)">${pct(t.i)}</td>
    <td><span class="b ${gc}">${t.ig>0?'+':''}${pct(t.ig)}</span></td>
    <td style="font-family:var(--mono);font-size:12px">${t.vn>0?'+'+N.format(t.vn):'<span style="color:var(--gbr)">Above</span>'}</td>
    <td style="color:var(--red2)">${pct(t.o)}</td>
    <td style="color:var(--amb2)">${pct(t.t)}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${hist?pct(hist.hist17)+'→'+pct(hist.baseIncumbent2022):'—'}</td>
    <td><span class="b ${t.dq==='high'?'b-gr':t.dq==='medium'?'b-g':'b-r'}">${t.dq}</span></td></tr>`;
  }).join(''):`<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--muted);font-family:var(--mono);font-size:12px;">No counties within ±8pp of 25% threshold at current parameters.</td></tr>`}</tbody>`;

  $('#a138Tbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th>Inc</th><th>≥25?</th><th>Opp</th><th>≥25?</th><th>TF</th></tr></thead>
  <tbody>${(S.res?.ctyRes||[]).map(c=>`<tr>
    <td style="font-weight:600">${c.name}</td>
    <td><span class="b ${c.lead==='inc'?'b-b':'b-r'}">${c.lead.toUpperCase()}</span></td>
    <td style="color:var(--blbr)">${pct(c.i)}</td>
    <td>${c.ia?'<span class="b b-gr">✓</span>':'<span class="b b-r">✗</span>'}</td>
    <td style="color:var(--red2)">${pct(c.o)}</td>
    <td>${c.oa?'<span class="b b-gr">✓</span>':'<span class="b b-m">✗</span>'}</td>
    <td style="color:var(--amb2)">${pct(c.t)}</td>
  </tr>`).join('')}</tbody>`;
}

function rScen(){
  const results=SCENS.map(sc=>{
    try{
      const r=sim(sc.p,false,false,false);
      const i25=r.ctyRes.filter(c=>c.i>=0.25).length;
      const o25=r.ctyRes.filter(c=>c.o>=0.25).length;
      // Quick MC for runoff prob
      let ro=0;
      for(let i=0;i<60;i++){
        try{
          const mr=sim(sc.p,true,false,false);
          const mi25=mr.ctyRes.filter(c=>c.i>=0.25).length;
          const mo25=mr.ctyRes.filter(c=>c.o>=0.25).length;
          if(!(mr.nat.i>0.5&&mi25>=CTY_N)&&!(mr.nat.o>0.5&&mo25>=CTY_N))ro++;
        }catch(e){}
      }
      return{...sc,r,i25,o25,n:r.nat,ro:ro/60,wins:r.nat.i>0.50&&i25>=CTY_N};
    }catch(e){return{...sc,r:null,i25:0,o25:0,n:{i:0,o:0,t:0},ro:1,wins:false};}
  });

  $('#sqMat').innerHTML=results.map(sc=>`
  <div class="sqc" style="border-left:3px solid ${sc.c}">
    <div class="sq-tier">${sc.tier}</div>
    <div class="sq-t" style="color:${sc.c}">${sc.t}</div>
    <div class="sq-d">${sc.d}</div>
    <div class="g2 mb8" style="gap:6px;">
      <div style="padding:9px;background:var(--s2);border:1px solid var(--bdr);">
        <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:2px;">Incumbent</div>
        <div class="sq-n" style="color:var(--blbr)">${pct(sc.n.i)}</div>
      </div>
      <div style="padding:9px;background:var(--s2);border:1px solid var(--bdr);">
        <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:2px;">Counties</div>
        <div class="sq-n" style="color:${sc.i25>=24?'var(--gbr)':'var(--red2)'}">${sc.i25}/47</div>
      </div>
    </div>
    <div class="fb" style="font-family:var(--mono);font-size:12px;">
      <span>Opp: <strong>${pct(sc.n.o)}</strong></span>
      <span>TF: <strong style="color:var(--amb2)">${pct(sc.n.t)}</strong></span>
      <span>RO: <strong>${pct(sc.ro)}</strong></span>
      ${sc.wins?'<span class="b b-gr">INC WIN</span>':sc.n.o>0.5&&sc.o25>=24?'<span class="b b-r">OPP WIN</span>':'<span class="b b-a">RUN-OFF</span>'}
    </div>
  </div>`).join('');

  $('#sqTbl').innerHTML=`<thead><tr><th>Scenario</th><th>Inc</th><th>Opp</th><th>TF</th><th>Inc Counties</th><th>Run-off P</th><th>Outcome</th></tr></thead>
  <tbody>${results.map(sc=>`<tr>
    <td style="font-weight:600;color:${sc.c}">${sc.t}</td>
    <td style="color:var(--blbr)">${pct(sc.n.i)}</td>
    <td style="color:var(--red2)">${pct(sc.n.o)}</td>
    <td style="color:var(--amb2)">${pct(sc.n.t)}</td>
    <td>${sc.i25}/47</td>
    <td>${pct(sc.ro)}</td>
    <td>${sc.wins?'<span class="b b-gr">INC WIN</span>':sc.n.o>0.5&&sc.o25>=24?'<span class="b b-r">OPP WIN</span>':'<span class="b b-a">RUN-OFF</span>'}</td>
  </tr>`).join('')}</tbody>`;
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
    <div style="font-weight:600;font-size:12px;color:var(--blbr);margin-bottom:6px;">Ford Kenya — Western (Cohesion ${S.cc}%)</div>
    ${wk.map(c=>`<div class="fb" style="padding:4px 0;border-bottom:1px solid var(--bdr);font-family:var(--mono);font-size:12px;">
      <span>${c.name}</span><span style="color:var(--blbr)">${pct(c.i)}</span></div>`).join('')}
  </div>
  <div>
    <div style="font-weight:600;font-size:12px;color:var(--amb2);margin-bottom:6px;">ODM Linda Ground — Coast · ${S.reg.odm?'<span class="b b-gr">DEAL ON</span>':'<span class="b b-r">DEAL OFF</span>'}</div>
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
  $('#sensTbl').innerHTML=`<thead><tr><th>Ward</th><th>County</th><th>Constituency</th><th>Voters</th><th>Influence</th><th>Inc Share</th><th>DQ</th></tr></thead>
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
  return clamp(close+tfForce+(c.cluster==='Mountain Rebel'?8:0),0,100);
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
  const btn=[...$$('.tbtn')].find(b=>b.dataset.t==='cty'); if(btn)btn.click();
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
function rMap(ctyRes){
  ensureVWMapControls();
  VW_MAP_STATE.rows=buildVWMapRows(ctyRes||[]);
  VW_MAP_STATE.rowMap=new Map(VW_MAP_STATE.rows.map(r=>[r.name,r]));
  if(!VW_MAP_STATE.selected&&S.selCty) VW_MAP_STATE.selected=S.selCty;
  VW_MAP_STATE.diagnostics=mapDiagnostics(VW_MAP_STATE.rows);
  const active=$('#t-map')?.classList.contains('act');
  if(active){initVWLeafletMap();loadVWBoundaries();setTimeout(()=>{VW_MAP_STATE.map?.invalidateSize();},160);}  
  refreshVWLeafletStyles();
  rVWMapLegend();rVWMapSummary();rVWMapDetail();rVWMapDiagnostics();rVWMapPanels();rMapTbl();
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
    <div class="vw-kv"><span>Incumbent</span><strong>${mapFmt(row,'incShare')}</strong></div>
    <div class="vw-kv"><span>Opposition</span><strong>${mapFmt(row,'oppShare')}</strong></div>
    <div class="vw-kv"><span>Third Force</span><strong>${mapFmt(row,'thirdShare')}</strong></div>
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
  return `<div class="tscroll" style="max-height:540px"><table class="tbl"><thead><tr><th>#</th><th>County</th><th>Cluster</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>`<tr onclick="selCtyMap('${mapEsc(r.name)}',true)" style="cursor:pointer"><td>${i+1}</td><td>${mapEsc(r.name)}</td><td>${mapEsc(r.cluster)}</td><td>${mapFmt(r)}</td><td><span class="b ${r.status.cls}">${r.status.risk}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function rMapTbl(){
  const rows=VW_MAP_STATE.rows;
  $('#mapTbl').innerHTML=`<thead><tr><th>County</th><th>Cluster</th><th>Inc</th><th>Opp</th><th>TF</th><th>Article 138 Gap</th><th>Dispute</th><th>DQ</th></tr></thead><tbody>${rows.map(r=>`<tr onclick="selCtyMap('${mapEsc(r.name)}',true)" style="cursor:pointer"><td>${mapEsc(r.name)}</td><td>${mapEsc(r.cluster)}</td><td>${mapFmt(r,'incShare')}</td><td>${mapFmt(r,'oppShare')}</td><td>${mapFmt(r,'thirdShare')}</td><td>${mapFmt(r,'article138Gap')}</td><td>${mapFmt(r,'disputeRisk')}</td><td>${mapEsc(r.dq)}</td></tr>`).join('')}</tbody>`;
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
  <div class="kpi"><div class="kpi-l">Overall Risk Score</div>
    <div class="kpi-v ${dr.score>60?'vr':dr.score>35?'va':'vgr'}">${Math.round(dr.score)}</div>
    <div class="kpi-d">${dr.score>60?'HIGH — petition-viable':'MEDIUM — within norms'}</div></div>
  <div class="kpi"><div class="kpi-l">Cluster Concentration</div>
    <div class="kpi-v ${dr.conc>0.60?'vr':dr.conc>0.40?'va':'vgr'}">${pct(dr.conc,0)}</div>
    <div class="kpi-d">of close counties in <strong>${dr.top}</strong> · ${dr.tc}/${dr.n}</div></div>
  <div class="kpi"><div class="kpi-l">Min County Margin</div>
    <div class="kpi-v ${dr.minM<0.03?'vr':dr.minM<0.07?'va':'vgr'}">${pct(dr.minM)}</div>
    <div class="kpi-d">${dr.n} counties within 6pp of leading share</div></div>`;

  $('#disNarr').innerHTML=`Score ${Math.round(dr.score)}/100. ${dr.n} counties within petition margin. Min margin ${pct(dr.minM)}.${dr.conc>0.60?` <strong style="color:var(--red2)">Geographic concentration alert:</strong> ${pct(dr.conc,0)} of marginal counties in ${dr.top} — single-cluster concentration substantially strengthens a petition narrative around regional data integrity.`:''} ${dr.score>55?' Historical note: 2017 petition was filed with broader national margins. Geographically-concentrated close result with data quality gaps in specific clusters is the most litigation-viable scenario.':''}`;

  $('#disClust').innerHTML=Object.entries(dr.byC).sort((a,b)=>b[1]-a[1]).map(([cl,n])=>`
  <div class="fb" style="padding:6px 0;border-bottom:1px solid var(--bdr);">
    <span style="font-weight:600;font-size:12px;">${cl}</span>
    <div class="fc g8"><div class="pbar" style="width:65px;"><div class="pf p-r" style="width:${n/dr.n*100}%"></div></div>
    <span style="font-family:var(--mono);font-size:12px;color:var(--gold)">${n}</span></div>
  </div>`).join('')||'<div style="font-family:var(--mono);font-size:12px;color:var(--muted)">No close counties at current scenario.</div>';

  $('#disTbl').innerHTML=`<thead><tr><th>County</th><th>Lead</th><th>Margin</th><th>Inc</th><th>Opp</th><th>DQ</th><th>Volatility</th><th>Cluster</th></tr></thead>
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
  const s=($('#ctySrch').value||'').toLowerCase();
  const filtered=ctyRes.filter(c=>c.name.toLowerCase().includes(s)||c.cluster.toLowerCase().includes(s));
  $('#ctyCount').textContent=`${filtered.length} counties`;
  $('#ctyGrid').innerHTML=filtered.map(c=>{
    const hist=CM.get(c.name);
    return`<div class="cc ${c.name===S.selCty?'sel':''}" onclick="selCounty('${c.name.replace(/'/g,"\\'")}')">
      <div class="cc-n">${c.name}</div>
      <div class="stk mb8"><div class="si" style="flex:${c.i}"></div><div class="so" style="flex:${c.o}"></div><div class="st" style="flex:${c.t}"></div></div>
      <div class="cc-r"><span>Incumbent</span><strong style="color:${iCol(c.i)}">${pct(c.i)} ${c.ia?'✓':''}</strong></div>
      <div class="cc-r"><span>Opposition</span><strong style="color:var(--red2)">${pct(c.o)}</strong></div>
      <div class="cc-r"><span>Third Force</span><strong style="color:var(--amb2)">${pct(c.t)}</strong></div>
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
  $('#drillT').textContent=`Ward Drilldown — ${name}`;
}

function rWardDrill(wardRes){
  const s=($('#wardSrch').value||'').toLowerCase();
  const rows=wardRes.filter(w=>w.county===S.selCty&&(!s||w.ward.toLowerCase().includes(s)||w.constituency.toLowerCase().includes(s)));
  $('#wardTbl').innerHTML=`<thead><tr><th>Ward</th><th>Constituency</th><th>Voters</th><th>Turnout</th><th>Inc</th><th>Opp</th><th>TF</th><th>DQ</th></tr></thead>
  <tbody>${rows.map(w=>`<tr>
    <td style="font-weight:600">${w.ward}</td>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${w.constituency}</td>
    <td style="font-family:var(--mono);font-size:12px">${N.format(Math.round(w.voters))}</td>
    <td>${pct(w.to)}</td>
    <td style="color:var(--blbr)">${pct(w.inc)}</td>
    <td style="color:var(--red2)">${pct(w.opp)}</td>
    <td style="color:var(--amb2)">${pct(w.tf)}</td>
    <td><span class="b ${w.dq==='high'?'b-gr':w.dq==='medium'?'b-g':'b-r'}">${w.dq}</span></td>
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
    <div style="font-size:12px;color:var(--gold);line-height:1.5;"><strong>Model impact:</strong> ${mapEsc(l.i)}</div></div>
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

  $('#methNotes').innerHTML=`<strong style="color:var(--gold)">v4.5 — Think-Tank Governance Upgrade</strong><br><br>
① TF baselines calibrated to 2025 pre-declaration levels — not 15%/10% which artificially forced run-off at defaults.<br>
② Parameter division fixed: sliders store raw pp values (e.g., 3), engine divides by 100 once — eliminates 100× underscaling that made sliders non-functional.<br>
③ Tipping point filter corrected: strictly |iGap| &lt; 8pp from 25% threshold. High-share counties (Garissa 72%) excluded.<br>
④ Dispute risk recalibrated with dynamic 0–100 range — not pegged at 100 at baseline.<br>
⑤ Scenario matrix parameter spread: Q1 TF=16pp/Inc -7pp vs Q4 TF=1pp/Inc +6pp = 15pp TF and 13pp swing spread.<br>
⑥ Tile map click handlers applied after SVG DOM update — not in innerHTML (browser security restriction).<br>
⑦ All render functions wrapped in try/catch for graceful degradation.<br>⑧ Poll anchor fully wired across Incumbent, Opposition and Third Force.<br>⑨ Monte Carlo modes added: Preview 400, Standard 1,000, Research 5,000 seeded.<br>⑩ Map QA separates county data match, geometry match, proxy geometry count and boundary confidence.<br><br>⚠ All 1,457 ward baselines imputed from 2022 IEBC constituency aggregates. Treat as scenario analysis, not a validated forecast.`;
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
  if(mc_.ro>=0.5){tone="warn";title="Run-off likely";}
  else if(mc_.iW>=mc_.oW){tone="inc";title="Incumbent wins in round one";}
  else{tone="opp";title="Opposition wins in round one";}
  const p=mc_.ro>=0.5?mc_.ro:Math.max(mc_.iW,mc_.oW);
  el.dataset.tone=tone;
  el.innerHTML=`<span class="v-dot" aria-hidden="true"></span><span class="v-title">${title}</span><span class="v-p">${pct(p,0)} of simulations</span><span class="v-sep" aria-hidden="true"></span><span class="v-detail">Incumbent <b>${pct(n.i)}</b> · Opposition <b>${pct(n.o)}</b> · Third force <b>${pct(n.t)}</b> · <b>${i25}</b>/47 counties at 25%+</span>`;
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
  const ps=$('#pollStat');
  if(ps){ps.textContent=S.reg.poll?'On':'Off';ps.className=S.reg.poll?'b b-g':'b b-m';}
  const pf=$('#pollFields');if(pf)pf.toggleAttribute('data-off',!S.reg.poll);
}



// ═══ v4.5 THINK-TANK GOVERNANCE / QA / RISK LAYERS ═══
const PUBLIC_LABELS={internal:['Gachagua runs for president','ODM–Linda Ground deal holds','UDA keeps Rift Valley majority','Anchor to latest polls'],public:['Third Force Entry','Opposition alliance cohesion','Incumbent coalition cohesion','Polling anchor']};
function updateViewModeLabels(){
  const labels=PUBLIC_LABELS[S.viewMode==='public'?'public':'internal'];
  $$('.reg-lbl').forEach((el,i)=>{if(i<4)el.textContent=labels[i]||el.textContent;});
  document.body.classList.toggle('public-mode',S.viewMode==='public');
}
function applyTheme(){document.body.classList.toggle('light-mode',S.theme==='light');}
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
    ['Third-force surge +5pp',{tf:S.tf+5}],['Third-force surge −5pp',{tf:Math.max(0,S.tf-5)}],
    ['Swing to incumbent +4pp',{si:S.si+4}],['Swing to opposition +4pp',{so:S.so+4}],
    ['Youth turnout +8pp',{ys:S.ys+8}],['Coalition cohesion −15pp',{cc:Math.max(55,S.cc-15)}],
    ['Anchor to latest polls',{},{poll:true}]
  ];
  const oldPoll=S.reg.poll;
  const rows=tests.map(([label,p,opts])=>{if(opts&&opts.poll)S.reg.poll=true;const r=sim({...p},false,true,false);S.reg.poll=oldPoll;return{label,delta:r.nat.i-base,inc:r.nat.i,ro:ff(r.nat).forced};})
    .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return `<table class="tbl"><thead><tr><th>If…</th><th>Incumbent change</th><th>Incumbent share</th><th>Effect</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td style="color:${r.delta<0?'var(--red2)':'var(--gbr)'}">${r.delta>0?'+':''}${pct(r.delta)}</td><td>${pct(r.inc)}</td><td>${Math.abs(r.delta)>0.025?'Major':'Minor'}</td></tr>`).join('')}</tbody></table>`;
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
  return `${taxonomy}<table class="tbl"><thead><tr><th>County</th><th>Cluster</th><th>${title}</th><th>Source Label</th><th>Driver</th></tr></thead><tbody>${top.map(x=>{const v=x.s[key];return `<tr><td>${x.row.name}</td><td>${x.row.cluster}</td><td class="${lensClass(v)}">${Math.round(v)}</td><td>${type==='political'||type==='market'?'proxy / synthetic':'computed / proxy'}</td><td>${v>=70?'Elevated validation priority':v>=45?'Watch signal':'Low-to-moderate signal'}</td></tr>`}).join('')}</tbody></table>`;
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
  const feats=(typeof VW_EMBEDDED_COUNTY_GEOJSON!=='undefined'&&VW_EMBEDDED_COUNTY_GEOJSON.features)||[];
  let verified=0,proxy=0,other=0;
  feats.forEach(f=>{const src=String(f.properties?.source||'').toLowerCase(); if(src.includes('proxy'))proxy++; else if(src.includes('embedded-boundary'))verified++; else other++;});
  return {verified,proxy,other,total:feats.length,confidence:proxy?'Partial / medium':'High'};
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
  return {mode:S.mcMode,iterations:ITERS,seed:S.seed,viewMode:S.viewMode,theme:S.theme,tfDelta:S.tf,incSwing:S.si,oppSwing:S.so,youthSurge:S.ys,coalitionCohesion:S.cc,pollAnchor:S.reg.poll?'ON':'OFF',pollInc:S.pa.inc,pollOpp:S.pa.opp,pollTF:S.pa.tf,thirdForceEntry:S.reg.gach,oppositionDeal:S.reg.odm,incumbentCoalition:S.reg.uda};
}
function qaStatusClass(status){return status==='PASS'?'qa-pass':status==='FAIL'?'qa-fail':'qa-warn';}
function technicalEngineQA(){
  const r=S.res||sim({},false,true,true);const mapQ=VW_MAP_STATE?.diagnostics||mapDiagnostics(VW_MAP_STATE?.rows||[]);const sharesOk=r.ctyRes.every(c=>Math.abs((c.i+c.o+c.t)-1)<0.002);const ctyOk=r.ctyRes.length===47;const wardOk=(S.wards||r.wardRes||[]).length>=1400;const pollOk=!!S.reg&&typeof S.pa.tf==='number';
  const checks=[
    ['County result count',ctyOk,`${r.ctyRes.length}/47`],['Ward drilldown rows',wardOk,`${(S.wards||r.wardRes||[]).length}/1,457`],['Shares normalize to 100%',sharesOk,sharesOk?'within tolerance':'check county sums'],['Article 138 uses county vote share',true,'candidate share ≥25%, not turnout'],['Polling anchor has TF input',pollOk,`TF poll ${S.pa.tf}%`],['MC mode configured',!!MC_MODES[S.mcMode],`${S.mcMode} · ${ITERS}`],['Map county data match',(mapQ.count||0)===47,`${mapQ.count||0}/47`],['Map geometry match',(mapQ.boundaryMatched||0)>=45,`${mapQ.boundaryMatched||0}/47`]
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
  <div class="pr-cover no-break"><div><div class="pr-title">VOTEWATCH 2027</div><div class="pr-sub">Executive scenario report · generated ${new Date().toLocaleString('en-KE')} · scenario analysis, not prediction</div></div><div class="pr-stamp"><strong>Mode:</strong> ${settings.mode} / ${settings.iterations} iterations<br><strong>Seed:</strong> ${mapEsc(settings.seed)}<br><strong>Display:</strong> ${settings.viewMode}<br><strong>Poll anchor:</strong> ${settings.pollAnchor} · Inc ${settings.pollInc}% / Opp ${settings.pollOpp}% / TF ${settings.pollTF}%<br><strong>Responsible-use:</strong> civic, academic, journalistic and analytical review only.</div></div>
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
  $('#lv-cc').textContent=S.cc+'%';
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
  bndSlider('cc','cc',1);   // slider 55–100 → S.cc=55–100 (raw %)

  $('#bRefresh').addEventListener('click',()=>{addShock();renderAll();decayShocks();rShockLog();S.timer=30;});
  $('#bReset').addEventListener('click',()=>{
    // Full reset: assumptions, political context, polls and probability settings.
    // (Previously left regimes/polls untouched and kept a stale iteration count and theme.)
    Object.assign(S,{tf:3,si:0,so:0,ys:0,cc:90,shocks:[],shLog:[],timer:30,mcMode:'preview',seed:'2027-baseline-001',viewMode:'internal'});
    S.reg={gach:false,odm:true,uda:true,poll:false};
    S.pa={inc:48,opp:36,tf:13};
    [['sl-tf',3],['sl-si',0],['sl-so',0],['sl-ys',0],['sl-cc',90]].forEach(([id,v])=>$(('#'+id)).value=v);
    [['pi',48],['po',36],['pt',13]].forEach(([id,v])=>$('#'+id)&&($('#'+id).value=v));
    $('#mcModeSelect')&&($('#mcModeSelect').value=S.mcMode);$('#seedInput')&&($('#seedInput').value=S.seed);$('#viewModeSelect')&&($('#viewModeSelect').value=S.viewMode);
    syncRegimeUI();updateMcModeUI();updateViewModeLabels();updateLabels();renderAll();rShockLog();
  });

  $('#ctySrch').addEventListener('input',dbnc(()=>{if(S.res)rCountyGrid(S.res.ctyRes);},80));
  $('#wardSrch').addEventListener('input',dbnc(()=>{if(S.wards)rWardDrill(S.wards);},80));

  // Institutional map controls
  ensureVWMapControls();


  // v4.5 governance controls
  $('#mcModeSelect')?.addEventListener('change',e=>{S.mcMode=e.target.value;updateMcModeUI();renderAll();rShockLog();});
  $('#seedInput')?.addEventListener('change',e=>{S.seed=e.target.value||'2027-baseline-001';updateMcModeUI();if(S.mcMode==='research'){renderAll();rShockLog();}});
  $('#viewModeSelect')?.addEventListener('change',e=>{S.viewMode=e.target.value;updateViewModeLabels();renderAll();});
  $('#themeSelect')?.addEventListener('change',e=>{S.theme=e.target.value;applyTheme();});
  updateMcModeUI();updateViewModeLabels();applyTheme();

  // Polling inputs
  ['pi','po','pt'].forEach(id=>{
    $('#'+id)?.addEventListener('change',()=>{
      // clamp to each field's min/max; empty/invalid falls back to the default
      const read=(id,def)=>{const el=$('#'+id),v=Number(el.value);const ok=el.value!==''&&Number.isFinite(v);const c=ok?clamp(v,Number(el.min),Number(el.max)):def;el.value=c;return c;};
      S.pa.inc=read('pi',48);
      S.pa.opp=read('po',36);
      S.pa.tf=read('pt',13);
      if(S.reg.poll){renderAll();rShockLog();}
    });
  });

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
