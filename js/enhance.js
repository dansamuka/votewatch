/* UI enhancement layer: accessibility wiring, lazy geometry, hero cartogram,
   KPI sparklines/gauge. Reads scenario state; never changes scenario logic. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

/* ── Tabs: keep ARIA in sync with the existing class-based switching ── */
function syncTabs(){
  $$('.tbtn').forEach(b=>{
    const on=b.classList.contains('act');
    b.setAttribute('aria-selected',on);
    b.tabIndex=on?0:-1;
  });
}
function initTabs(){
  const list=$('.tablist'); if(!list)return;
  new MutationObserver(syncTabs).observe(list,{attributes:true,subtree:true,attributeFilter:['class']});
  list.addEventListener('keydown',e=>{
    const t=$$('.tbtn',list), i=t.indexOf(document.activeElement);
    if(i<0)return;
    let n=null;
    if(e.key==='ArrowRight')n=t[(i+1)%t.length];
    else if(e.key==='ArrowLeft')n=t[(i-1+t.length)%t.length];
    else if(e.key==='Home')n=t[0];
    else if(e.key==='End')n=t[t.length-1];
    if(!n)return;
    e.preventDefault();n.focus();n.click();
  });
  syncTabs();
}

/* ── Accessible names for controls that lack a label ── */
function labelControls(root=document){
  $$('input,select,textarea',root).forEach(el=>{
    if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||(el.id&&$(`label[for="${el.id}"]`))||el.closest('label'))return;
    let t='';
    const wrap=el.parentElement;
    const lab=wrap&&$('label,.ctrl-l,.sw-lbl,.rbar-lbl',wrap);
    if(lab)t=(lab.childNodes[0]&&lab.childNodes[0].textContent||'').trim()||lab.textContent.trim();
    if(!t){const p=el.closest('.sw');const l=p&&$('.sw-lbl',p);if(l)t=l.textContent.trim();}
    t=t||el.getAttribute('title')||el.getAttribute('placeholder')||el.id;
    if(t)el.setAttribute('aria-label',t);
  });
}

/* ── Lazy county geometry (~1 MB): idle prefetch + on demand ── */
let geoPromise=null;
const geoReady=()=>typeof VW_EMBEDDED_COUNTY_GEOJSON!=='undefined';
function loadGeometry(){
  if(geoReady())return Promise.resolve();
  return geoPromise||(geoPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='data/county-geojson.js';s.onload=res;s.onerror=rej;
    document.head.appendChild(s);
  }));
}
function wrapGeometryUsers(){
  const lazy=(name,needs)=>{
    const orig=window[name]; if(typeof orig!=='function')return;
    window[name]=function(...a){
      if(geoReady()||!needs())return orig.apply(this,a);
      loadGeometry().then(()=>orig.apply(this,a)).catch(()=>orig.apply(this,a));
    };
  };
  lazy('rMap',()=>{const p=$('#t-map');return !!p&&p.classList.contains('act');});
  lazy('renderExecutiveReport',()=>true);
  const idle=window.requestIdleCallback||(f=>setTimeout(f,1500));
  idle(()=>loadGeometry().then(()=>{
    // refresh geometry-dependent diagnostics once boundaries arrive
    if(typeof S!=="undefined"&&S.res&&typeof rMap==='function'){try{rMap(S.res.ctyRes);}catch(e){}}
  }).catch(()=>{}),{timeout:4000});
}

/* ── Hero: cluster-grouped county cartogram ── */
function shareColor(v){
  // below 50%: blue ramp from the raised surface; 50%+: gold. Mixed in oklab for even steps.
  if(v>=0.5)return`color-mix(in oklab,var(--c-gold) ${Math.min(100,60+Math.round((v-0.5)*200))}%,var(--raised))`;
  const p=Math.round(Math.max(0,v)/0.5*90);
  return`color-mix(in oklab,var(--c-blue) ${p}%,var(--raised))`;
}
function renderHero(){
  const body=$('#heroBody'); if(!body||typeof S==="undefined"||!S.res)return;
  const rows=S.res.ctyRes.slice().sort((a,b)=>String(a.cluster).localeCompare(String(b.cluster))||b.i-a.i);
  const groups=new Map();
  rows.forEach(c=>{if(!groups.has(c.cluster))groups.set(c.cluster,[]);groups.get(c.cluster).push(c);});
  const R=26,W=R*1.732,PER=6,PAD=8,GAP=28;
  let x0=PAD,svg='',maxY=0;
  const abbr=n=>(typeof mapAbbr==='function'?mapAbbr(n):String(n).slice(0,3).toUpperCase());
  groups.forEach((list,cl)=>{
    const cols=Math.min(PER,Math.ceil(list.length/Math.ceil(list.length/PER)));
    svg+=`<text class="hero-cl" x="${x0}" y="14">${cl}</text>`;
    list.forEach((c,k)=>{
      const col=k%cols,row=Math.floor(k/cols);
      const cx=x0+W/2+col*W+(row%2?W/2:0), cy=36+R+row*R*1.5;
      const pts=[0,1,2,3,4,5].map(j=>{const a=Math.PI/180*(60*j-30);return`${(cx+R*Math.cos(a)).toFixed(1)},${(cy+R*Math.sin(a)).toFixed(1)}`;}).join(' ');
      const name=c.name||c.county;
      svg+=`<g class="hex" tabindex="0" role="button" data-c="${name}" aria-label="${name}: incumbent ${(c.i*100).toFixed(1)}%"><title>${name} · Inc ${(c.i*100).toFixed(1)}% · Opp ${(c.o*100).toFixed(1)}% · TF ${(c.t*100).toFixed(1)}%</title><polygon points="${pts}" fill="${shareColor(c.i)}"/><text x="${cx.toFixed(1)}" y="${(cy+4).toFixed(1)}" text-anchor="middle">${abbr(name)}</text></g>`;
      maxY=Math.max(maxY,cy+R);
    });
    x0+=(cols+0.5)*W+GAP;
  });
  const w=x0-GAP+PAD, h=maxY+PAD;
  body.innerHTML=`<svg class="hero-svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" role="group" aria-label="County cartogram grouped by political cluster, coloured by incumbent first-round share">${svg}</svg>`;
  $('#heroLeg').innerHTML=`<span>0%</span><span class="leg-bar" aria-hidden="true"></span><span>50%+</span>`;
  const act=e=>{
    const g=e.target.closest('.hex'); if(!g)return;
    if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault();
    if(typeof selCounty==='function')selCounty(g.dataset.c);
    const b=$('.tbtn[data-t="cty"]'); if(b)b.click();
  };
  body.onclick=act;body.onkeydown=act;
}

/* ── KPI sparklines + dispute gauge ── */
const hist={inc:[],ro:[],art:[],dis:[],tf:[]};
const MAXH=24;
function push(k,v){const a=hist[k];a.push(v);if(a.length>MAXH)a.shift();}
function spark(a){
  if(a.length<2)return'';
  const lo=Math.min(...a),hi=Math.max(...a),sp=hi-lo||1;
  const pts=a.map((v,i)=>`${(i/(a.length-1)*120).toFixed(1)},${(26-(v-lo)/sp*22).toFixed(1)}`).join(' ');
  return`<svg class="kpi-spark" viewBox="0 0 120 28" preserveAspectRatio="none" role="img" aria-label="Trend over the last ${a.length} runs"><polyline fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
}
function gauge(score){
  const s=Math.max(0,Math.min(100,score)),C=2*Math.PI*26,arc=C*0.75;
  const col=s>60?'var(--red2)':s>35?'var(--amb2)':'var(--gbr)';
  return`<svg class="kpi-gauge" viewBox="0 0 64 64" role="img" aria-label="Dispute risk ${Math.round(s)} out of 100"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--bdr2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(135 32 32)"/><circle cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(arc*s/100).toFixed(1)} ${C}" transform="rotate(135 32 32)"/></svg>`;
}
function decorateKPIs(r,mc_,dr,i25){
  push('inc',r.nat.i*100);push('ro',mc_.ro*100);push('art',i25);push('dis',dr.score);push('tf',r.nat.t*100);
  const keys=['inc','ro','art','dis','tf'];
  $$('#kpiRow .kpi').forEach((el,i)=>{
    const k=keys[i]; if(!k)return;
    el.insertAdjacentHTML('beforeend',k==='dis'?gauge(dr.score):spark(hist[k]));
  });
}
function wrapKPIs(){
  const orig=window.rKPIs; if(typeof orig!=='function')return;
  window.rKPIs=function(r,mc_,dr,f,i25){
    orig.apply(this,arguments);
    try{decorateKPIs(r,mc_,dr,i25);renderHero();}catch(e){console.error('enhance',e);}
  };
}

/* ── boot ── */
wrapKPIs();wrapGeometryUsers();
initTabs();labelControls();
new MutationObserver(()=>labelControls()).observe(document.body,{childList:true,subtree:true});
})();
