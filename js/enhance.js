/* UI enhancement layer: tab wiring (ARIA, sliding indicator, edge fades),
   accessible names, the Overview county band, the docking header verdict and
   the settings shell. Reads scenario state; never changes scenario logic. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

/* ── Tabs: ARIA in sync with the class-based switching, one sliding underline ── */
function placeIndicator(){
  const list=$('.tablist'),ind=$('.tab-ind'),act=$('.tbtn.act');if(!list||!ind||!act)return;
  // translateX + scaleX from the active tab's box: transform-only, no layout work
  ind.style.transform=`translateX(${act.offsetLeft+8}px) scaleX(${Math.max(1,act.offsetWidth-16)})`;
}
function fades(){
  const l=$('.tablist');if(!l)return;
  l.classList.toggle('fade-l',l.scrollLeft>4);
  l.classList.toggle('fade-r',l.scrollLeft+l.clientWidth<l.scrollWidth-4);
}
function syncTabs(){
  $$('.tbtn').forEach(b=>{
    const on=b.classList.contains('act');
    b.setAttribute('aria-selected',on);
    b.tabIndex=on?0:-1;
    if(on&&b.scrollIntoView&&b.parentElement.scrollWidth>b.parentElement.clientWidth)b.scrollIntoView({block:'nearest',inline:'nearest'});
  });
  placeIndicator();fades();
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
  list.addEventListener('scroll',fades,{passive:true});
  addEventListener('resize',()=>{placeIndicator();fades();});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(syncTabs);
  syncTabs();
}

/* ── Accessible names for controls that lack a label ── */
function labelControls(root=document){
  $$('input,select,textarea',root).forEach(el=>{
    if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||(el.id&&$(`label[for="${el.id}"]`))||el.closest('label'))return;
    let t='';
    const wrap=el.parentElement;
    const lab=wrap&&$('label',wrap);
    if(lab)t=(lab.childNodes[0]&&lab.childNodes[0].textContent||'').trim()||lab.textContent.trim();
    t=t||el.getAttribute('title')||el.getAttribute('placeholder')||el.id;
    if(t)el.setAttribute('aria-label',t);
  });
}

/* ── Overview: county band (who leads each county, by region) ── */
const RAMP={inc:'a',opp:'b',t2:'c',t3:'d'};
function renderHero(){
  const body=$('#heroBody'); if(!body||typeof S==="undefined"||!S.res)return;
  const nat=S.res.nat,order=['Rift & North','Mt Kenya','Eastern','Coast','Nyanza','Western & Nairobi'];
  const rows=S.res.ctyRes.slice().sort((a,b)=>order.indexOf(a.cluster)-order.indexOf(b.cluster)||b.i-a.i);
  const lead=c=>{const cs=[['inc',c.i],['opp',c.o]].concat((nat.others||[]).map(o=>[o.key,(c.oc?c.oc[o.idx]:0)/(c.tv||1)])).sort((x,y)=>y[1]-x[1]);return {k:cs[0][0],gap:cs[0][1]-(cs[1]?cs[1][1]:0)};};
  // same five-step ramps as the map: weak lead → strong lead
  const stepOf=g=>1+[0.05,0.12,0.2,0.3].filter(t=>g>=t).length;
  let html='',prev='';const seen=new Set();
  rows.forEach(c=>{
    if(c.cluster!==prev){html+=`${prev?'</span>':''}<span class="cb-grp"><b>${c.cluster}</b>`;prev=c.cluster;}
    const l=lead(c),r=RAMP[l.k]||'o';seen.add(l.k);
    html+=`<button type="button" class="cb-c" data-c="${c.name}" style="--c:var(--ramp-${r}-${stepOf(l.gap)})" aria-label="${c.name}: led by ${blocName(l.k,nat)}" title="${c.name}: ${blocName(l.k,nat)} leads by ${(l.gap*100).toFixed(1)} points"><span>${c.name}</span></button>`;
  });
  body.innerHTML=`<div class="cband">${html}</span></div>`;
  const key=$('#heroKey');
  if(key)key.innerHTML=[...seen].map(k=>`<span><i style="--c:var(--ramp-${RAMP[k]||'o'}-4)"></i>${blocName(k,nat)}</span>`).join('')+`<span>Paler: a narrower lead</span>`;
  $('#heroLeg').innerHTML=`<a href="#" class="hero-link" id="heroToMap">Open the map →</a>`;
  const go=n=>{if(n&&typeof selCounty==='function')selCounty(n);const b=$('.tbtn[data-t="map"]');if(b)b.click();window.scrollTo({top:0,behavior:'smooth'});};
  body.onclick=e=>{const b=e.target.closest('.cb-c');if(b)go(b.dataset.c);};
  $('#heroToMap').onclick=e=>{e.preventDefault();go(null);};
  sideSummary();
}

function wrapKPIs(){
  const orig=window.rKPIs; if(typeof orig!=='function')return;
  window.rKPIs=function(r,mc_,dr,f,i25){
    orig.apply(this,arguments);
    try{renderHero();}catch(e){console.error('enhance',e);}
  };
}

/* ── Header: the verdict docks into the header only once the hero ribbon is off-screen ── */
function initDock(){
  const hdr=$('.hdr'),hero=$('#raceStrip');if(!hdr)return;
  let heroVisible=true;
  const update=()=>{const onOverview=($('.tbtn.act')||{}).dataset?.t==='cmd';hdr.dataset.docked=String(!onOverview||!heroVisible);};
  if(hero&&'IntersectionObserver'in window){
    new IntersectionObserver(([e])=>{heroVisible=e.isIntersecting;update();},{rootMargin:'-108px 0px 0px 0px'}).observe(hero);
  }else heroVisible=false;
  new MutationObserver(update).observe($('.tablist'),{attributes:true,subtree:true,attributeFilter:['class']});
  update();
}

/* ── Shell: sidebar open/closed by width, export menu, first-run guide ── */
const WIDE=matchMedia('(min-width:1280px)');
function sideSummary(){
  const h=$('.side-sum-hint');if(!h||typeof S==='undefined'||!S.cfg)return;
  h.textContent=WIDE.matches?'Every tab updates as you change these':`${S.cfg.teams.slice(0,2).join(' vs ')} · ${S.cfg.follow}% follow`;
}
function initShell(){
  const box=$('#sideBox');
  if(box){
    const apply=()=>{box.open=WIDE.matches;sideSummary();};
    apply();WIDE.addEventListener('change',apply);
    // on desktop the settings panel is always visible; the summary is just a heading
    $('.side-sum',box).addEventListener('click',e=>{if(WIDE.matches)e.preventDefault();});
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

/* ── Tables: "More columns" shows the analyst-only columns for one table in public view ── */
function initMoreCols(){
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-more]');if(!b)return;
    const box=b.closest('.pan,#vmWards');if(!box)return;
    const on=box.classList.toggle('show-opt');
    b.setAttribute('aria-pressed',String(on));b.textContent=on?'Fewer columns':'More columns';
  });
}

/* ── boot ── */
initMoreCols();
wrapKPIs();
initTabs();initShell();initDock();labelControls();
let lblQueued=false;
new MutationObserver(()=>{if(lblQueued)return;lblQueued=true;requestAnimationFrame(()=>{lblQueued=false;labelControls();});})
  .observe(document.body,{childList:true,subtree:true});
})();
