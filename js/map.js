/* County map in the style of the Kenya Projects Atlas: SVG choropleth on the
   left, county results panel on the right. Geometry: data/kenya-geo.js. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const GEO_NAME={'Elgeyo-Marakwet':'Elgeyo/Marakwet','Tharaka':'Tharaka - Nithi',"Murang'a":"Murang'A",'Nairobi':'Nairobi City'};
const MX=lon=>+((lon-33.6)*56).toFixed(1), MY=lat=>+((5.2-lat)*56).toFixed(1);
const VM={measure:'lead',built:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const p1=v=>A138.safePct(v,1);
const TEAMC=['var(--team-a)','var(--team-b)','var(--team-c)','var(--team-d)'];
const RAMP=['a','b','c','d'];
// five-step OKLCH ramps (tokens.css): weak → strong, never mixed toward the dark surface
const step=(v,cuts)=>1+cuts.filter(t=>v>=t).length;
const ramp=(r,n)=>`var(--ramp-${r}-${n})`;

// contestants in a county: team A, team B, then each other team / solo candidate
function contestants(c,nat){
  const cfg=S.cfg,out=[{key:'inc',name:cfg.teams[0],v:c.i,col:TEAMC[0],r:'a'}];
  if(nat.B&&nat.B.members.length)out.push({key:'opp',name:cfg.teams[1],v:c.o,col:TEAMC[1],r:'b'});
  (nat.others||[]).forEach(o=>{
    const ti=o.key[0]==='t'?+o.key.slice(1):-1;
    out.push({key:o.key,name:o.name,v:(c.oc?c.oc[o.idx]:0)/(c.tv||1),col:ti>=0?TEAMC[ti]:'var(--others)',r:ti>=0?RAMP[ti]:'o'});
  });
  return out.sort((a,b)=>b.v-a.v);
}
const LEAD_CUTS=[0.05,0.12,0.2,0.3],SHARE_CUTS=[0.15,0.3,0.45,0.6],TURN_CUTS=[0.55,0.62,0.69,0.76];
function fillFor(c,nat){
  const m=VM.measure;
  if(m==='lead'){
    const cs=contestants(c,nat),lead=cs[0],gap=lead.v-(cs[1]?cs[1].v:0);
    return ramp(lead.r,step(gap,LEAD_CUTS));
  }
  if(m==='turnout')return ramp('t',step(c.to,TURN_CUTS));
  return ramp(m==='a'?'a':'b',step(m==='a'?c.i:c.o,SHARE_CUTS));
}
const steps=r=>`<span class="lg-steps" aria-hidden="true">${[1,2,3,4,5].map(n=>`<i style="background:${ramp(r,n)}"></i>`).join('')}</span>`;

function build(){
  const svg=$('#vmMap');if(!svg||typeof KE_GEO==='undefined')return false;
  const G=KE_GEO;let h=`<title>Map of Kenya's 47 counties, coloured by the selected measure</title>
  <defs><pattern id="vmHalf" width="5" height="5" patternUnits="userSpaceOnUse"><circle style="fill:var(--landdot)" cx="1.5" cy="1.5" r=".75"/></pattern><clipPath id="vmK"><path d="${G.kenya}"/></clipPath></defs>
  <rect class="frame" x="-36" y="-32" width="544" height="620" rx="2"/>
  <path style="fill:var(--land)" d="${G.kenya}"/>
  <g id="vmCty">${G.counties.map(c=>{const n=GEO_NAME[c.n]||c.n;return `<path class="vm-c" data-county="${esc(n)}" d="${c.d}" tabindex="0" role="button" aria-label="${esc(n)}"></path>`;}).join('')}</g>
  <rect x="-36" y="-32" width="544" height="620" clip-path="url(#vmK)" style="fill:url(#vmHalf);pointer-events:none;opacity:.35"/>
  ${Object.values(G.lakes).map(d=>`<path style="fill:var(--water);stroke:var(--waterline);stroke-width:.7;vector-effect:non-scaling-stroke;pointer-events:none" d="${d}"/>`).join('')}
  <path style="fill:none;stroke:var(--ink-2);stroke-width:1.3;vector-effect:non-scaling-stroke;stroke-linejoin:round;pointer-events:none" d="${G.kenya}"/>`;
  [34,36,38,40,42].forEach(lo=>{const x=MX(lo);h+=`<line class="tick" x1="${x}" y1="-32" x2="${x}" y2="-25"/><line class="tick" x1="${x}" y1="588" x2="${x}" y2="581"/><text class="m" x="${x}" y="575" text-anchor="middle">${lo}°E</text>`;});
  [[4,'4°N'],[2,'2°N'],[0,'0°'],[-2,'2°S'],[-4,'4°S']].forEach(([la,s])=>{const y=MY(la);h+=`<line class="tick" x1="-36" y1="${y}" x2="-29" y2="${y}"/><text class="m" x="-26" y="${y+4}">${s}</text>`;});
  h+=`<line class="equator" x1="-10" y1="${MY(0)}" x2="508" y2="${MY(0)}"/><text class="m" x="496" y="${MY(0)-6}" text-anchor="end" style="fill:var(--accent)">EQUATOR</text>`;
  h+=`<text class="lk" x="${MX(36.45)}" y="${MY(3.75)}">Lake Turkana</text><text class="lk" x="-26" y="${MY(-0.62)}">L. Victoria</text>`;
  h+=`<g class="north" transform="translate(486 -4)"><path d="M0 -14 L6 6 L0 2 L-6 6Z"/><text class="m" x="0" y="22" text-anchor="middle">N</text></g>`;
  svg.innerHTML=h;
  const pick=e=>{const p=e.target.closest('.vm-c');if(!p)return;if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();window.selCounty(p.dataset.county);};
  svg.addEventListener('click',pick);svg.addEventListener('keydown',pick);
  // Hover label: county name plus its top three results and votes cast
  const fig=svg.closest('figure');
  const tip=document.createElement('div');tip.className='vm-tip';tip.hidden=true;tip.setAttribute('role','tooltip');fig.appendChild(tip);
  const show=p=>{
    const c=S.res&&S.res.ctyRes.find(x=>x.name===p.dataset.county);if(!c){tip.hidden=true;return;}
    const cs=contestants(c,S.res.nat).slice(0,3);
    tip.innerHTML=`<b>${esc(c.name)}</b>${cs.map(x=>`<span>${esc(x.name)}<i>${p1(x.v)}</i></span>`).join('')}<span>Votes cast<i>${Math.round(c.tv).toLocaleString('en-KE')}</i></span>`;
    tip.hidden=false;
  };
  const place=(x,y)=>{const r=fig.getBoundingClientRect();tip.style.left=(x-r.left)+'px';tip.style.top=(y-r.top)+'px';};
  svg.addEventListener('mousemove',e=>{const p=e.target.closest('.vm-c');if(!p){tip.hidden=true;return;}if(tip.dataset.c!==p.dataset.county){tip.dataset.c=p.dataset.county;show(p);}place(e.clientX,e.clientY);});
  svg.addEventListener('mouseleave',()=>{tip.hidden=true;tip.dataset.c='';});
  svg.addEventListener('focusin',e=>{const p=e.target.closest('.vm-c');if(!p)return;tip.dataset.c=p.dataset.county;show(p);const b=p.getBoundingClientRect();place(b.left+b.width/2,b.top);});
  svg.addEventListener('focusout',()=>{tip.hidden=true;});
  const sb=$('#vmSheetBtn');if(sb)sb.onclick=()=>sb.closest('.cty-card').classList.toggle('open');
  const sel=$('#vmSel');
  if(sel){
    sel.innerHTML='<option value="">Choose a county…</option>'+[...CO].map(c=>c.name).sort().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.onchange=()=>{if(sel.value)window.selCounty(sel.value);else{S.selCty=null;render();}};
  }
  document.querySelectorAll('[data-vm]').forEach(b=>b.onclick=()=>{VM.measure=b.dataset.vm;document.querySelectorAll('[data-vm]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
  VM.built=true;return true;
}

function legend(nat){
  const el=$('#vmLegend');if(!el)return;
  if(VM.measure==='lead'){
    const cs=[{name:S.cfg.teams[0],r:'a'}];
    if(nat.B&&nat.B.members.length)cs.push({name:S.cfg.teams[1],r:'b'});
    (nat.others||[]).slice(0,3).forEach(o=>{const ti=o.key[0]==='t'?+o.key.slice(1):-1;cs.push({name:o.name,r:ti>=0?RAMP[ti]:'o'});});
    el.innerHTML=`<div class="mbar-row">${cs.map(c=>`<span class="lg-i">${steps(c.r)}${esc(c.name)}</span>`).join('')}</div><p class="mbar-note">Colour shows who leads; darker steps mean a bigger lead (under 5, 5–12, 12–20, 20–30, over 30 points).</p>`;
  }else{
    const r=VM.measure==='a'?'a':VM.measure==='b'?'b':'t';
    const lab=VM.measure==='turnout'?'Turnout: under 55% → over 76%':`${esc(VM.measure==='a'?S.cfg.teams[0]:S.cfg.teams[1])} share: under 15% → over 60%`;
    el.innerHTML=`<div class="mbar-row"><span class="lg-i">${steps(r)}</span><span class="mbar-note">${lab}</span></div>`;
  }
}

function outlineSVG(name){
  const g=KE_GEO.counties.find(c=>(GEO_NAME[c.n]||c.n)===name);if(!g)return '';
  const nums=g.d.match(/-?\d+(\.\d+)?/g).map(Number);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let i=0;i+1<nums.length;i+=2){x0=Math.min(x0,nums[i]);x1=Math.max(x1,nums[i]);y0=Math.min(y0,nums[i+1]);y1=Math.max(y1,nums[i+1]);}
  const pad=Math.max(x1-x0,y1-y0)*0.12;
  return `<svg class="cty-map" viewBox="${(x0-pad).toFixed(1)} ${(y0-pad).toFixed(1)} ${(x1-x0+2*pad).toFixed(1)} ${(y1-y0+2*pad).toFixed(1)}" role="img" aria-label="Outline of ${esc(name)}"><path class="cty-out" d="${g.d}"/></svg>`;
}

// Margin gauge: A minus B on a diverging track centred on "level"; ±5 points (the close-margin zone) shaded
function marginGauge(c){
  const W=300,pad=8,span=0.8,m=c.i-c.o,X=v=>pad+(Math.max(-span,Math.min(span,v))+span)/(2*span)*(W-2*pad);
  const A=S.cfg.teams[0],B=S.cfg.teams[1];
  return `<div class="mgauge"><svg viewBox="0 0 ${W} 40" role="img" aria-label="${esc(m>=0?A:B)} ahead by ${p1(Math.abs(m))}${Math.abs(m)<0.05?', inside the 5-point close-margin zone':''}">
    <rect class="z" x="${X(-0.05)}" y="4" width="${X(0.05)-X(-0.05)}" height="16" rx="2"/>
    <line class="tk" x1="${pad}" x2="${W-pad}" y1="12" y2="12"/><line class="mid" x1="${X(0)}" x2="${X(0)}" y1="2" y2="22"/>
    <circle class="pin" cx="${X(m).toFixed(1)}" cy="12" r="7" style="fill:${m>=0?'var(--team-a)':'var(--team-b)'}"/>
    <text x="${pad}" y="36">B +80</text><text x="${X(0)}" y="36" text-anchor="middle">level</text><text x="${W-pad}" y="36" text-anchor="end">A +80</text>
  </svg></div>`;
}
// Why the county looks like this: regional poll evidence, home candidates, method
function basis(name){
  if(typeof GROUP_BASIS==='undefined')return '';
  const g=GROUP_OF[name],home=(HOME_NOTE[name]||[]);
  const lab=g&&GROUP_LABEL[g];
  return `<div class="cty-basis"><b>Basis</b>
    ${lab?`<p><span class="tag-g">${esc(lab)}</span> ${esc(GROUP_BASIS[g]||'')}</p>`:''}
    ${home.length?`<p>Home county of ${esc(home.join(' and '))}.</p>`:''}
    <p class="hint">Candidate levels come from the average of validated national polls; differences between counties and constituencies in the same region follow the 2022 presidential results. Change teams to see how this county moves.</p></div>`;
}
function card(nat){
  const body=$('#vmBody'),sel=$('#vmSel');if(!body||!S.res)return;
  const name=S.selCty,c=name&&S.res.ctyRes.find(x=>x.name===name);
  if(sel)sel.value=c?name:'';
  // phones: the county panel is a bottom sheet, opened when a county is chosen
  const cardEl=body.closest('.cty-card');if(cardEl)cardEl.classList.toggle('open',!!c);
  document.querySelectorAll('#vmMap .vm-c').forEach(p=>p.classList.toggle('on',!!c&&p.dataset.county===name));
  const wards=$('#vmWards');
  if(!c){
    body.innerHTML=`<p class="cty-empty">Pick a county from the list or click the map to see its result.</p>
      <div class="cty-stats"><span><b>${p1(nat.i)}</b> ${esc(S.cfg.teams[0])}</span>${nat.B&&nat.B.members.length?`<span><b>${p1(nat.o)}</b> ${esc(S.cfg.teams[1])}</span>`:''}<span><b>${p1(nat.t)}</b> others</span></div>`;
    if(wards)wards.hidden=true;return;
  }
  const cs=contestants(c,nat),co=CO.find(x=>x.name===name)||{};
  const lead=cs[0],second=cs[1];
  body.innerHTML=`${outlineSVG(name)}
    <div class="cty-res">${cs.filter(x=>x.v>=0.005).slice(0,5).map(x=>`<div class="cty-bar"><span class="nm">${esc(x.name)}</span><span class="tr"><i style="width:${(x.v*100).toFixed(1)}%;background:${x.col}"></i></span><b>${p1(x.v)}</b></div>`).join('')}</div>
    ${(()=>{const q=S.mc&&S.mc.cty&&S.mc.cty[name];return q?`<p class="cty-range">In 80% of simulations: ${esc(S.cfg.teams[0])} ${p0r(q.iLo)}–${p0r(q.iHi)}${nat.B&&nat.B.members.length?`, ${esc(S.cfg.teams[1])} ${p0r(q.oLo)}–${p0r(q.oHi)}`:''}. ${esc(S.cfg.teams[0])} reaches 25% in ${p0r(q.p25)} of them. ${typeof BACKTEST!=='undefined'?`Ranges include county-level error calibrated on 2022: ${Math.round(BACKTEST.variants.find(v=>v.id==='regional-bias-cal').coverage80)}% of counties fell inside their 80% range in the back-test.`:''}</p>`:'';})()}
    ${nat.B&&nat.B.members.length?marginGauge(c):''}
    <div class="cty-stats">
      <span>Leader <b>${esc(lead.name)}</b> by ${p1(lead.v-(second?second.v:0))}</span>
      <span>Turnout <b>${p1(c.to)}</b></span>
      ${(()=>{const i=WARDS.findIndex(w=>w.county===name);return i>=0&&typeof WU!=='undefined'?`<span title="Share of voters undecided in polls (TIFA Jun 2026 nationally; Infotrak Jul 2026 for Mt Kenya)">Undecided <b>${p0r(WU[i])}</b></span>`:'';})()}
      <span>Registered <b>${(co.projectedVoters2027||0).toLocaleString('en-KE')}</b></span>
      <span>Votes cast <b>${Math.round(c.tv).toLocaleString('en-KE')}</b></span>
      <span>${esc(S.cfg.teams[0])} 25%+ <b>${c.i>=0.25?'Yes':'No'}</b></span>
    </div>
    ${basis(name)}`;
  if(wards){wards.hidden=false;const t=$('#vmWardsT');if(t)t.textContent=`Constituencies in ${name}`;}
}

const p0r=x=>Math.round(x*100)+'%';
function render(){
  if(!S.res)return;
  if(!VM.built&&!build())return;
  const nat=S.res.nat;
  const byName=new Map(S.res.ctyRes.map(c=>[c.name,c]));
  document.querySelectorAll('#vmMap .vm-c').forEach(p=>{
    const c=byName.get(p.dataset.county);if(!c)return;
    p.style.fill=fillFor(c,nat);
  });
  legend(nat);card(nat);
}
window.rVoteMap=render;
})();
