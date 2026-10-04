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

/* ── Hero: one-row county band (who leads each county), links to the Map ── */
function renderHero(){
  const body=$('#heroBody'); if(!body||typeof S==="undefined"||!S.res)return;
  const nat=S.res.nat,order=['Rift & North','Mt Kenya','Eastern','Coast','Nyanza','Western & Nairobi'];
  const rows=S.res.ctyRes.slice().sort((a,b)=>order.indexOf(a.cluster)-order.indexOf(b.cluster)||b.i-a.i);
  const lead=c=>{const cs=[['inc',c.i],['opp',c.o]].concat((nat.others||[]).map(o=>[o.key,(c.oc?c.oc[o.idx]:0)/(c.tv||1)])).sort((x,y)=>y[1]-x[1]);return {k:cs[0][0],gap:cs[0][1]-(cs[1]?cs[1][1]:0)};};
  let html='',prev='';
  rows.forEach(c=>{
    if(c.cluster!==prev){html+=`${prev?'</span>':''}<span class="cb-grp"><b>${c.cluster}</b>`;prev=c.cluster;}
    const l=lead(c),mix=Math.round(30+Math.min(1,l.gap/0.4)*65);
    html+=`<button type="button" class="cb-c" data-c="${c.name}" style="--c:color-mix(in oklab,${VZ.col(l.k)} ${mix}%,var(--surface))" aria-label="${c.name}: led by ${blocName(l.k,nat)}" title="${c.name}: ${blocName(l.k,nat)} leads"><span>${c.name}</span></button>`;
  });
  body.innerHTML=`<div class="cband">${html}</span></div>`;
  $('#heroLeg').innerHTML=`<a href="#" class="hero-link" id="heroToMap">Open the map →</a>`;
  const go=n=>{if(n&&typeof selCounty==='function')selCounty(n);const b=$('.tbtn[data-t="map"]');if(b)b.click();window.scrollTo({top:0,behavior:'smooth'});};
  body.onclick=e=>{const b=e.target.closest('.cb-c');if(b)go(b.dataset.c);};
  $('#heroToMap').onclick=e=>{e.preventDefault();go(null);};
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
  const col=s>60?'var(--c-red)':s>35?'var(--c-amber)':'var(--c-green)';
  return`<svg class="kpi-gauge" viewBox="0 0 64 64" role="img" aria-label="Dispute risk ${Math.round(s)} out of 100"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line-2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(135 32 32)"/><circle cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(arc*s/100).toFixed(1)} ${C}" transform="rotate(135 32 32)"/></svg>`;
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
    try{renderHero();}catch(e){console.error('enhance',e);}
  };
}

/* ── Shell: sidebar open/closed by width, export menu, first-run guide ── */
function initShell(){
  const box=$('#sideBox'), wide=matchMedia('(min-width:1024px)');
  if(box){
    const apply=()=>{box.open=wide.matches;};
    apply();wide.addEventListener('change',apply);
    // on desktop the settings panel is always visible; the summary is just a heading
    $('.side-sum',box).addEventListener('click',e=>{if(wide.matches)e.preventDefault();});
  }
  const menu=$('.menu');
  if(menu){
    $$('.menu-pop button',menu).forEach(b=>b.addEventListener('click',()=>{menu.open=false;}));
    document.addEventListener('click',e=>{if(menu.open&&!menu.contains(e.target))menu.open=false;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;$('summary',menu).focus();}});
  }
  // First visit: show the four-step guide once; afterwards it lives behind the "?" button
  const guide=$('#guide');
  try{if(guide){if(localStorage.getItem('vw-guide-seen'))guide.hidden=true;else localStorage.setItem('vw-guide-seen','1');}}catch(e){}
  const help=$('#helpBtn');
  if(help&&guide)help.onclick=()=>{const t=$('.tbtn[data-t="cmd"]');if(t)t.click();guide.hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
  if(typeof setLive==='function')setLive(false);
}

/* ── boot ── */
wrapKPIs();
initTabs();initShell();labelControls();
let lblQueued=false;
new MutationObserver(()=>{if(lblQueued)return;lblQueued=true;requestAnimationFrame(()=>{lblQueued=false;labelControls();});})
  .observe(document.body,{childList:true,subtree:true});
})();
