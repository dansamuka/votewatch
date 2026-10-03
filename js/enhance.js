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

/* ── Hero: cluster-grouped county cartogram ── */
function shareColor(v){
  // team A (Ruto's side) colour, stronger as its share rises (0–70%). Mixed in oklab for even steps.
  return`color-mix(in oklab,var(--team-a) ${Math.round(Math.min(1,Math.max(0,v)/0.7)*90+5)}%,var(--raised))`;
}
function renderHero(){
  const body=$('#heroBody'); if(!body||typeof S==="undefined"||!S.res)return;
  const rows=S.res.ctyRes.slice().sort((a,b)=>String(a.cluster).localeCompare(String(b.cluster))||b.i-a.i);
  const groups=new Map();
  rows.forEach(c=>{if(!groups.has(c.cluster))groups.set(c.cluster,[]);groups.get(c.cluster).push(c);});
  // Lay out in real pixels: region groups flow left→right and wrap to a new
  // band when the panel is too narrow, so hexes never shrink below legibility.
  const R=22,W=R*1.732,PER=6,PAD=4,GAP=24,LABEL=28;
  const avail=Math.max(260,body.clientWidth||800);
  let x0=PAD,y0=0,bandH=0,svg='',maxX=0;
  const abbr=n=>(typeof mapAbbr==='function'?mapAbbr(n):String(n).slice(0,3).toUpperCase());
  const p1=v=>(v*100).toFixed(1)+'%';
  groups.forEach((list,cl)=>{
    const cols=Math.min(PER,Math.ceil(list.length/Math.ceil(list.length/PER)));
    const rowsN=Math.ceil(list.length/cols);
    const gw=(cols+0.5)*W, gh=LABEL+R+(rowsN-1)*R*1.5+R+8;
    if(x0>PAD&&x0+gw>avail){x0=PAD;y0+=bandH+8;bandH=0;}
    svg+=`<text class="hero-cl" x="${x0}" y="${y0+14}">${cl}</text>`;
    list.forEach((c,k)=>{
      const col=k%cols,row=Math.floor(k/cols);
      const cx=x0+W/2+col*W+(row%2?W/2:0), cy=y0+LABEL+R+row*R*1.5;
      const pts=[0,1,2,3,4,5].map(j=>{const a=Math.PI/180*(60*j-30);return`${(cx+R*Math.cos(a)).toFixed(1)},${(cy+R*Math.sin(a)).toFixed(1)}`;}).join(' ');
      const name=c.name||c.county;
      svg+=`<g class="hex" tabindex="0" role="button" data-c="${name}" aria-label="${name}: incumbent ${p1(c.i)}. Open county detail"><title>${name}: incumbent ${p1(c.i)} · opposition ${p1(c.o)} · third force ${p1(c.t)}</title><polygon points="${pts}" fill="${shareColor(c.i)}"/><text x="${cx.toFixed(1)}" y="${(cy+4).toFixed(1)}" text-anchor="middle">${abbr(name)}</text></g>`;
    });
    maxX=Math.max(maxX,x0+gw);bandH=Math.max(bandH,gh);
    x0+=gw+GAP;
  });
  const w=Math.ceil(maxX+PAD), h=Math.ceil(y0+bandH);
  body.innerHTML=`<svg class="hero-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="group" aria-label="County cartogram grouped by region, coloured by incumbent first-round share">${svg}</svg>`;
  if(!body._ro&&window.ResizeObserver){
    let lastW=body.clientWidth,t=0;
    body._ro=new ResizeObserver(()=>{const cw=body.clientWidth;if(Math.abs(cw-lastW)<24)return;lastW=cw;clearTimeout(t);t=setTimeout(renderHero,120);});
    body._ro.observe(body);
  }
  $('#heroLeg').innerHTML=`<span>0%</span><span class="leg-bar" aria-hidden="true"></span><span>50%+</span>`;
  const act=e=>{
    const g=e.target.closest('.hex'); if(!g)return;
    if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault();
    if(typeof selCounty==='function')selCounty(g.dataset.c);
    const b=$('.tbtn[data-t="map"]'); if(b)b.click();
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
  try{if(localStorage.getItem('vw-guide')==='0'){const g=$('#guide');if(g)g.hidden=true;}}catch(e){}
  if(typeof setLive==='function')setLive(false);
}

/* ── boot ── */
wrapKPIs();
initTabs();initShell();labelControls();
let lblQueued=false;
new MutationObserver(()=>{if(lblQueued)return;lblQueued=true;requestAnimationFrame(()=>{lblQueued=false;labelControls();});})
  .observe(document.body,{childList:true,subtree:true});
})();
