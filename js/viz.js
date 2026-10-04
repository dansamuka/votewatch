/* Data graphics: race strip, outcome dots, margin strip, Article 138 gates and
   run-off transfer flow. Pure render helpers; app.js calls them with results. */
(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const p1=v=>((v||0)*100).toFixed(1)+'%', p0=v=>Math.round((v||0)*100)+'%';
const votes=v=>{v=Math.round(v||0);return v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?Math.round(v/1e3)+'K':String(v);};

// Colour for a contestant key: team A/B/C/D or a solo candidate
function col(k){return k==='inc'?'var(--team-a)':k==='opp'?'var(--team-b)':k==='t2'?'var(--team-c)':k==='t3'?'var(--team-d)':'var(--others)';}
function ink(k){return k==='inc'?'var(--team-a-ink)':col(k);}
// National contestants, largest first
function field(nat){
  const out=[{key:'inc',name:blocName('inc',nat),v:nat.i}];
  if(nat.B&&nat.B.members.length)out.push({key:'opp',name:blocName('opp',nat),v:nat.o});
  (nat.others||[]).forEach(o=>out.push({key:o.key,name:o.name,v:o.share}));
  return out.sort((a,b)=>b.v-a.v);
}
function verdictOf(mc){
  if(mc.ro>=0.5)return{t:'Run-off',p:mc.ro};
  return mc.iW>=mc.oW?{t:blocName('inc')+' wins outright',p:mc.iW}:{t:blocName('opp')+' wins outright',p:mc.oW};
}

/* ── Race strip ── */
function race(el,r,mc,i25,o25){
  if(!el)return;
  const nat=r.nat,f=field(nat);
  if(!el.dataset.built){
    el.innerHTML=`<header class="race-hd"><p class="eyebrow" id="raceT">First round · decided voters</p><p class="race-verdict" id="raceV"></p></header>
      <div class="rs" role="img" id="raceBar"><div class="rs-segs"></div><span class="rs-half"><i>50% + 1</i></span></div>
      <ol class="race-legend" id="raceLg"></ol>
      <div class="ctyband"><span class="eyebrow">25%+ in counties</span><div class="cb-rows" id="raceCb"></div><span class="need">needs 24</span></div>`;
    el.dataset.built='1';
  }
  const v=verdictOf(mc),pr=r2pair(nat);
  el.querySelector('#raceV').innerHTML=`<b>${esc(v.t)}</b>${v.t==='Run-off'?` · ${esc(blocName(pr.a,nat))} vs ${esc(blocName(pr.b,nat))}`:''} <span>${p0(v.p)} of simulations</span>`;
  // keyed segments: transform-only updates so they glide between scenarios
  const segs=el.querySelector('.rs-segs');let x=0;const seen=new Set();
  // top three contestants, then everyone else as one grey segment
  const restV=f.slice(3).reduce((s,c)=>s+c.v,0);
  const shown=f.slice(0,3).concat(restV>0.0005?[{key:'rest',name:'Everyone else',v:restV}]:[]);
  shown.forEach(c=>{
    let s=segs.querySelector(`[data-k="${c.key}"]`);
    if(!s){s=document.createElement('i');s.dataset.k=c.key;s.style.setProperty('--x',x);s.style.setProperty('--w',0);segs.appendChild(s);}
    s.style.background=c.key==='rest'?'var(--line-2)':col(c.key);s.title=`${c.name} ${p1(c.v)}`;
    requestAnimationFrame(()=>{s.style.setProperty('--x',x0(s));s.style.setProperty('--w',c.v);});
    s._x=x;x+=c.v;seen.add(c.key);
  });
  function x0(s){return s._x;}
  segs.querySelectorAll('i').forEach(s=>{if(!seen.has(s.dataset.k))s.remove();});
  el.querySelector('#raceBar').setAttribute('aria-label',f.slice(0,3).map(c=>`${c.name} ${p1(c.v)}`).join(', ')+'. 50% plus one needed to win outright.');
  // legend: top three plus the rest
  const top=f.slice(0,3),rest=f.slice(3).reduce((s,c)=>s+c.v,0);
  el.querySelector('#raceLg').innerHTML=top.map(c=>`<li style="--c:${col(c.key)};--ci:${ink(c.key)}"><span>${esc(c.name)}</span><b>${p1(c.v)}</b><em>${votes(c.v*nat.v)}</em></li>`).join('')+
    (rest>0.0005?`<li style="--c:var(--line-2);--ci:var(--ink-2)"><span>Everyone else</span><b>${p1(rest)}</b><em>${votes(rest*nat.v)}</em></li>`:'')+
    `<li class="race-total"><span>Votes cast</span><b>${Math.round(nat.v).toLocaleString('en-KE')}</b></li>`;
  // 47-county meters for team A and team B
  const row=(k,n)=>`<div class="cb-row" role="img" aria-label="${esc(blocName(k,nat))}: 25% or more in ${n} of 47 counties"><span class="cb-l" style="color:${ink(k)}">${k==='inc'?'A':'B'} <b>${n}</b></span><span class="ticks" style="--c:${col(k)}">${Array.from({length:47},(_,i)=>`<i${i<n?' class="on"':''}></i>`).join('')}</span></div>`;
  el.querySelector('#raceCb').innerHTML=row('inc',i25)+(nat.B&&nat.B.members.length?row('opp',o25):'');
}

/* ── 100-dot outcome chart ── */
function outcomes(el,mc){
  if(!el)return;
  const ro=mc.ro||0,w=mc.r2Win||{};
  const cats=[
    {k:'inc',l:`${blocName('inc')} outright`,v:mc.iW,cls:'solid'},
    {k:'opp',l:`${blocName('opp')} outright`,v:mc.oW,cls:'solid'},
    {k:'inc',l:`Run-off, ${blocName('inc')} wins`,v:ro*(w.inc||0),cls:'ring'},
    {k:'opp',l:`Run-off, ${blocName('opp')} wins`,v:ro*(w.opp||0),cls:'ring'},
    {k:'x',l:'Run-off, someone else wins',v:ro*Object.entries(w).filter(([k])=>k!=='inc'&&k!=='opp').reduce((s,[,v])=>s+v,0),cls:'ring'}
  ];
  // largest-remainder rounding to exactly 100 dots
  let n=cats.map(c=>Math.floor(c.v*100));let left=100-n.reduce((a,b)=>a+b,0);
  cats.map((c,i)=>[c.v*100-n[i],i]).sort((a,b)=>b[0]-a[0]).slice(0,Math.max(0,left)).forEach(([,i])=>n[i]++);
  const dots=[];cats.forEach((c,i)=>{for(let j=0;j<n[i];j++)dots.push(`<i class="${c.cls}" style="--c:${c.k==='x'?'var(--others)':col(c.k)}"></i>`);});
  el.innerHTML=`<div class="dots" role="img" aria-label="${cats.filter((c,i)=>n[i]).map((c,i)=>`${c.l} ${n[cats.indexOf(c)]} in 100`).join('; ')}">${dots.join('')}</div>
    <ul class="dots-lg">${cats.map((c,i)=>n[i]?`<li><i class="${c.cls}" style="--c:${c.k==='x'?'var(--others)':col(c.k)}"></i>${esc(c.l)} <b>${n[i]}</b></li>`:'').join('')}</ul>`;
}

/* ── County margin strip (A minus B), petition zone ±5 points ── */
function margins(el,ctyRes,opts={}){
  if(!el)return;
  const W=opts.w||600,H=opts.h||76,R=opts.r||4,pad=12,span=0.8;
  const X=m=>pad+(Math.max(-span,Math.min(span,m))+span)/(2*span)*(W-2*pad);
  const pts=ctyRes.map(c=>({n:c.name,m:c.i-c.o})).sort((a,b)=>a.m-b.m);
  // simple beeswarm: stack dots that would overlap
  const placed=[];pts.forEach(p=>{p.x=X(p.m);let lvl=0;while(placed.some(q=>q.lvl===lvl&&Math.abs(q.x-p.x)<R*2+1))lvl++;p.lvl=lvl;placed.push(p);});
  const mid=H/2-6,yOf=l=>mid+(l%2?1:-1)*Math.ceil(l/2)*(R*2+1);
  const close=pts.filter(p=>Math.abs(p.m)<0.05).length;
  el.innerHTML=`<svg class="mstrip" viewBox="0 0 ${W} ${H}" role="img" aria-label="${close} counties within 5 points between team A and team B">
    <rect class="zone" x="${X(-0.05)}" y="4" width="${X(0.05)-X(-0.05)}" height="${H-26}" rx="3"/>
    <line class="axis" x1="${pad}" x2="${W-pad}" y1="${mid}" y2="${mid}"/><line class="zero" x1="${X(0)}" x2="${X(0)}" y1="4" y2="${H-22}"/>
    ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${yOf(p.lvl).toFixed(1)}" r="${R}" style="fill:${p.m>=0?'var(--team-a)':'var(--team-b)'}"><title>${esc(p.n)}: ${p.m>=0?'A':'B'} ahead by ${p1(Math.abs(p.m))}</title></circle>`).join('')}
    <text x="${pad}" y="${H-6}" class="ax-l">B +80</text><text x="${X(0)}" y="${H-6}" class="ax-l" text-anchor="middle">level</text><text x="${W-pad}" y="${H-6}" class="ax-l" text-anchor="end">A +80</text>
  </svg><p class="mstrip-cap"><b>${close}</b> ${close===1?'county is':'counties are'} within 5 points (shaded): the likeliest to be contested.</p>`;
}

/* ── Article 138: two gates ── */
function gates(el,r,mc,i25,o25){
  if(!el)return;
  const nat=r.nat,hasB=nat.B&&nat.B.members.length;
  const mk=(k,x,l)=>`<span class="mark${k==='opp'?' below':''}" style="--x:${(x*100).toFixed(2)}%;--c:${col(k)}" data-l="${esc(l)}"></span>`;
  const passA1=nat.i>0.5,passB1=hasB&&nat.o>0.5,passA2=i25>=24,passB2=hasB&&o25>=24;
  const who=(passA1&&passA2)?`${esc(blocName('inc'))} passes both`:(passB1&&passB2)?`${esc(blocName('opp'))} passes both`:'Nobody passes both';
  el.innerHTML=`<h3 class="card-t">To win outright you need both</h3>
  <div class="gate"><p class="eyebrow">1 · Over 50% of all votes</p>
    <div class="track">${mk('inc',nat.i,'A '+p1(nat.i))}${hasB?mk('opp',nat.o,'B '+p1(nat.o)):''}<span class="notch" style="--x:50%"></span></div>
    <p class="gate-s">${passA1?'A passes':passB1?'B passes':'Neither is above 50%'}</p></div>
  <div class="gate"><p class="eyebrow">2 · 25% in at least 24 of 47 counties</p>
    <div class="track">${mk('inc',i25/47,'A '+i25)}${hasB?mk('opp',o25/47,'B '+o25):''}<span class="notch" style="--x:${(24/47*100).toFixed(2)}%"></span></div>
    <p class="gate-s">${[passA2&&'A passes',passB2&&'B passes'].filter(Boolean).join(' · ')||'Neither reaches 24'}</p></div>
  <p class="gate-out"><b>${who}.</b> ${mc.ro>=0.5?`A run-off is likely (${p0(mc.ro)} of simulations).`:`Outright win chance: A ${p0(mc.iW)}, B ${p0(mc.oW)}.`}</p>`;
}

/* ── Run-off transfer flow (three columns) ── */
function flow(el,r,dir){
  if(!el)return;
  const nat=r.nat,ro=r2sim(r.ctyRes,nat,dir||'spl');
  const tot=r.ctyRes.reduce((s,c)=>s+c.tv,0)||1;
  const sh=k=>k==='inc'?nat.i:k==='opp'?nat.o:((nat.others||[]).find(o=>o.key===k)||{share:0}).share;
  const a=sh(ro.a),b=sh(ro.b),pool=Math.max(0,1-a-b);
  const toA=ro.shareA-a,toB=ro.shareB-b; // pool votes that end up with each finalist
  const W=780,H=220,cw=14,gap=10,top=10,usable=H-2*top-2*gap;
  const hA=a*usable,hB=b*usable,hP=pool*usable;
  const L=[{k:ro.a,y:top,h:hA},{k:ro.b,y:top+hA+gap,h:hB},{k:'pool',y:top+hA+hB+2*gap,h:hP}];
  const RA={y:top+(H-2*top-ro.shareA*usable-ro.shareB*usable-gap)/2,h:ro.shareA*usable};const RB={y:RA.y+RA.h+gap,h:ro.shareB*usable};
  const x0=205,x1=W-205;
  const rib=(y0,h0,y1,h1,c)=>`<path d="M${x0+cw},${y0} C${(x0+x1)/2},${y0} ${(x0+x1)/2},${y1} ${x1},${y1} L${x1},${y1+h1} C${(x0+x1)/2},${y1+h1} ${(x0+x1)/2},${y0+h0} ${x0+cw},${y0+h0}Z" style="fill:${c}" class="rib"/>`;
  const pA=toA/(pool||1)*hP;
  const svg=`<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="Run-off: ${esc(blocName(ro.a,nat))} ${p1(ro.shareA)}, ${esc(blocName(ro.b,nat))} ${p1(ro.shareB)}">
    ${rib(L[0].y,L[0].h,RA.y,hA,col(ro.a))}${rib(L[1].y,L[1].h,RB.y,hB,col(ro.b))}
    ${rib(L[2].y,pA,RA.y+hA,RA.h-hA,col(ro.a))}${rib(L[2].y+pA,hP-pA,RB.y+hB,RB.h-hB,col(ro.b))}
    ${L.map(n=>`<rect x="${x0}" y="${n.y}" width="${cw}" height="${Math.max(1,n.h)}" rx="2" style="fill:${n.k==='pool'?'var(--others)':col(n.k)}"/>`).join('')}
    <rect x="${x1}" y="${RA.y}" width="${cw}" height="${RA.h}" rx="2" style="fill:${col(ro.a)}"/><rect x="${x1}" y="${RB.y}" width="${cw}" height="${RB.h}" rx="2" style="fill:${col(ro.b)}"/>
    ${L.map(n=>`<text x="${x0-8}" y="${n.y+n.h/2+4}" text-anchor="end" class="fl-l">${esc(n.k==='pool'?'Everyone else':blocName(n.k,nat))} <tspan class="fl-v">${p1(n.k==='pool'?pool:sh(n.k))}</tspan></text>`).join('')}
    <text x="${x1+cw+8}" y="${RA.y+RA.h/2+4}" class="fl-l">${esc(blocName(ro.a,nat))} <tspan class="fl-v">${p1(ro.shareA)}</tspan></text>
    <text x="${x1+cw+8}" y="${RB.y+RB.h/2+4}" class="fl-l">${esc(blocName(ro.b,nat))} <tspan class="fl-v">${p1(ro.shareB)}</tspan></text>
    <text x="${x0+cw/2}" y="${H-1}" text-anchor="middle" class="ax-l">Round 1</text><text x="${x1+cw/2}" y="${H-1}" text-anchor="middle" class="ax-l">Run-off</text>
  </svg>`;
  el.innerHTML=svg+`<p class="mstrip-cap">${esc(blocName(ro.winner,nat))} wins round two with ${p1(Math.max(ro.shareA,ro.shareB))}. Everyone else's votes split ${dir==='toA'?`70/30 toward ${esc(blocName(ro.a,nat))}`:dir==='toB'?`70/30 toward ${esc(blocName(ro.b,nat))}`:'50/50'}.</p>`;
}

/* ── Team A share in every county against the 25% line (Swing counties tab) ── */
function threshold(el,ctyRes){
  if(!el)return;
  const W=760,H=96,R=5,pad=14,max=0.95,X=v=>pad+Math.min(max,Math.max(0,v))/max*(W-2*pad);
  const pts=ctyRes.map(c=>({n:c.name,v:c.i})).sort((a,b)=>a.v-b.v);
  const placed=[];pts.forEach(p=>{p.x=X(p.v);let l=0;while(placed.some(q=>q.l===l&&Math.abs(q.x-p.x)<R*2+1))l++;p.l=l;placed.push(p);});
  const mid=H/2-8,yOf=l=>mid+(l%2?1:-1)*Math.ceil(l/2)*(R*2+1);
  const near=pts.filter(p=>Math.abs(p.v-0.25)<0.08).length,pass=pts.filter(p=>p.v>=0.25).length;
  el.innerHTML=`<svg class="mstrip" viewBox="0 0 ${W} ${H}" role="img" aria-label="${pass} of 47 counties give team A 25% or more; ${near} are within 8 points of the line">
    <rect class="zone" x="${X(0.17)}" y="4" width="${X(0.33)-X(0.17)}" height="${H-28}" rx="3" style="fill:color-mix(in oklab,var(--c-amber) 12%,transparent)"/>
    <line class="axis" x1="${pad}" x2="${W-pad}" y1="${mid}" y2="${mid}"/><line class="zero" x1="${X(0.25)}" x2="${X(0.25)}" y1="2" y2="${H-24}" style="stroke-dasharray:none;stroke-width:2"/>
    ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${yOf(p.l).toFixed(1)}" r="${Math.abs(p.v-0.25)<0.08?R+1:R}" style="fill:${p.v>=0.25?'var(--team-a)':'var(--team-b)'}"><title>${esc(p.n)}: team A ${p1(p.v)}</title></circle>`).join('')}
    ${[0,0.25,0.5,0.95].map(t=>`<text x="${X(t)}" y="${H-6}" class="ax-l" text-anchor="${t===0?'start':t===0.95?'end':'middle'}">${Math.round(t*100)}%</text>`).join('')}
  </svg><p class="mstrip-cap"><b>${pass}</b> of 47 counties give team A 25% or more (needs 24). <b>${near}</b> sit in the shaded band within 8 points of the line.</p>`;
}

window.VZ={race,outcomes,margins,gates,flow,threshold,col,ink};
})();
