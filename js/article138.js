// ═══ ARTICLE 138 — constitutional tests on integer valid-vote tallies ═══
// Pure functions, no DOM: loaded by the page before js/app.js and by the Node scripts
// through scripts/model-harness.mjs, so the browser and the validator run the same code.
//
// Art. 138(4): a candidate is elected in round one with (a) more than half of all the
// votes cast and (b) at least 25% of the votes cast in each of more than half of the
// counties (24 of 47). "Votes cast" means valid votes: the Supreme Court's 2013
// presidential-petition judgment excluded rejected ballots from the denominator.
// Art. 138(5): otherwise a fresh election between the candidate(s) with the most votes
// and the candidate(s) with the second most. Art. 138(7): the fresh election is decided
// by most votes, with no county test; it does not say what happens on an exact tie.
//
// Tests use integers, so exact boundaries are unambiguous: majority is 2·V_k > N and the
// county test is 4·V_ck ≥ T_c. Votes cast outside any county (diaspora, prisons) count
// toward N and V_k but toward no county's 25% test.
const A138=(()=>{
  const COUNTIES=47,NEEDED=24;
  const big=x=>typeof x==='bigint'?x:BigInt(Math.round(Number(x)||0));

  // Split integer `total` across non-negative `weights` by largest remainder. Ties in the
  // remainder go to the earlier entry, so the split is deterministic.
  function largestRemainder(total,weights){
    const T=Math.max(0,Math.round(Number(total)||0));
    const w=weights.map(x=>Math.max(0,Number(x)||0)),W=w.reduce((a,b)=>a+b,0);
    if(!T||!W)return w.map(()=>0n);
    const q=w.map(x=>T*x/W),fl=q.map(Math.floor);
    let rest=T-fl.reduce((a,b)=>a+b,0);
    const order=q.map((x,i)=>[x-fl[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
    for(let j=0;rest>0&&j<order.length;j++,rest--)fl[order[j][1]]++;
    return fl.map(x=>BigInt(x));
  }

  // counties: [{code, valid:{key: votes}}]; outOfCounty: {key: votes}
  // eligible: keys that can be elected (others, e.g. minor candidates, still count in N)
  // mode 'ingest' throws on a county with no valid votes; 'engine' marks it unavailable,
  // which never counts as reaching 25%, and reports it in `degenerate`.
  function evaluate(counties,outOfCounty={},opt={}){
    const mode=opt.mode||'engine',expect=opt.expectCounties??COUNTIES;
    if(!Array.isArray(counties)||counties.length!==expect)throw new Error(`Article 138: expected ${expect} counties, got ${counties&&counties.length}`);
    const codes=new Set(counties.map(c=>c.code));
    if(codes.size!==counties.length)throw new Error('Article 138: duplicate county code');
    const total={},qual={},countyStatus={};let N=0n,degenerate=0;
    const keys=new Set();counties.forEach(c=>Object.keys(c.valid).forEach(k=>keys.add(k)));Object.keys(outOfCounty).forEach(k=>keys.add(k));
    keys.forEach(k=>{total[k]=0n;qual[k]=0;});
    for(const c of counties){
      let T=0n;const st={};
      for(const k of keys){const v=big(c.valid[k]??0);if(v<0n)throw new Error(`Article 138: negative votes in ${c.code} for ${k}`);T+=v;}
      if(T===0n){
        if(mode==='ingest')throw new Error(`Article 138: county ${c.code} has no valid votes`);
        degenerate++;keys.forEach(k=>st[k]='unavailable');countyStatus[c.code]=st;continue;
      }
      for(const k of keys){
        const v=big(c.valid[k]??0);total[k]+=v;
        const pass=4n*v>=T;st[k]=pass?'pass':'fail';if(pass)qual[k]++;
      }
      countyStatus[c.code]=st;N+=T;
    }
    for(const [k,x] of Object.entries(outOfCounty)){const v=big(x);if(v<0n)throw new Error(`Article 138: negative out-of-county votes for ${k}`);total[k]+=v;N+=v;}
    const eligible=opt.eligible?[...opt.eligible].filter(k=>keys.has(k)):[...keys];
    const half=N/2n+1n;
    const gates={};
    for(const k of eligible)gates[k]={
      national:2n*total[k]>N,county:qual[k]>=NEEDED,countiesQualified:qual[k],
      votesToMajority:total[k]>=half?0n:half-total[k]
    };
    const elected=eligible.filter(k=>gates[k].national&&gates[k].county);
    return{N,total,gates,countyStatus,elected,freshElection:elected.length===0,degenerate,fresh:elected.length?null:freshElectionField(total,eligible)};
  }

  // Art. 138(5): the candidate(s) with the greatest and second-greatest number of votes.
  // A tie for first sends all tied candidates through; a tie for second does the same.
  function freshElectionField(total,eligible){
    const vals=[...new Set(eligible.map(k=>total[k]))].sort((a,b)=>(b>a?1:b<a?-1:0));
    const first=eligible.filter(k=>total[k]===vals[0]);
    const second=first.length>1?[]:eligible.filter(k=>vals.length>1&&total[k]===vals[1]);
    return{first,second,tie:first.length>1||second.length>1};
  }

  // Art. 138(7): most votes wins. An exact tie is not resolved by the Constitution, so it is
  // reported as out of model rather than given to either side.
  function freshElectionWinner(votesA,votesB,a,b){
    const A=big(votesA),B=big(votesB);
    return A===B?{winner:null,status:'tie_out_of_model'}:{winner:A>B?a:b,status:'decided'};
  }

  // Build integer tallies from a simulated result. Each county's valid votes are rounded once
  // and split across contestants by largest remainder; out-of-county votes (oocShare of the
  // county total) are split in proportion to the national result.
  function fromSim(ctyRes,nat,oocShare=0){
    const others=(nat&&nat.others)||[];
    const keys=['inc',...(nat&&nat.B&&nat.B.members&&nat.B.members.length?['opp']:[]),...others.map(o=>o.key)];
    const counties=ctyRes.map(c=>{
      const oSum=others.reduce((s,o)=>s+(c.oc?c.oc[o.idx]:0),0);
      const w=keys.map(k=>k==='inc'?c.iv:k==='opp'?c.ov:(c.oc?c.oc[others.find(o=>o.key===k).idx]:0));
      w.push(Math.max(0,c.tfv-oSum));                       // votes for minor candidates outside any team
      const v=largestRemainder(c.tv,w),valid={};
      keys.forEach((k,j)=>valid[k]=v[j]);valid.minor=v[keys.length];
      return{code:c.code||c.name,valid};
    });
    let ooc={};
    if(oocShare>0){
      const nat_=keys.map(k=>counties.reduce((s,c)=>s+Number(c.valid[k]),0));
      nat_.push(counties.reduce((s,c)=>s+Number(c.valid.minor),0));
      const D=Math.round(oocShare*nat_.reduce((a,b)=>a+b,0)),v=largestRemainder(D,nat_);
      keys.forEach((k,j)=>ooc[k]=v[j]);ooc.minor=v[keys.length];
    }
    return evaluate(counties,ooc,{eligible:keys});
  }

  // Display: a rounded number must never land on the wrong side of a threshold. Values below
  // the line are rounded down, values on or above it are rounded normally; the pass flag
  // always comes from the unrounded value.
  function fmtGate(x,thr=0.25,d=1){
    const f=10**(d+2),v=Number(x)||0,pass=v>=thr;
    const shown=pass?Math.round(v*f)/f:Math.floor(v*f)/f;
    return{text:(shown*100).toFixed(d)+'%',pass,glyph:pass?'✓':'✗'};
  }
  // Majority is strict: exactly 50% fails, and a value just under 50% never reads "50.0%".
  function fmtMajority(x,d=1){
    const f=10**(d+2),v=Number(x)||0,pass=v>0.5;
    let shown=pass?Math.round(v*f)/f:Math.floor(v*f)/f;
    let text=(shown*100).toFixed(d)+'%';
    if(pass&&shown<=0.5)text='> '+(50).toFixed(d)+'%';
    if(!pass&&shown>=0.5)text='< '+(50).toFixed(d)+'%';
    return{text,pass,glyph:pass?'✓':'✗'};
  }

  // General-purpose percentage for the whole page: rounds normally, except that a value
  // below 25% or 50% is never shown at or above that line (24.96% → "24.9%", not "25.0%").
  function safePct(x,d=1){
    const v=Number(x)||0,f=10**(d+2);let s=Math.round(v*f)/f;
    for(const thr of [0.25,0.5])if(v<thr&&s>=thr)s=Math.floor(v*f)/f;
    return (s*100).toFixed(d)+'%';
  }

  return{COUNTIES,NEEDED,largestRemainder,evaluate,freshElectionField,freshElectionWinner,fromSim,fmtGate,fmtMajority,safePct};
})();
