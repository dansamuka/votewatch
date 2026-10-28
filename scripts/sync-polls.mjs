#!/usr/bin/env node
// Sync fresh national presidential-preference polls from the upstream evidence ledger.
// Source governance decides eligibility; this script never promotes unverified polls.
import fs from 'node:fs';
const base='https://raw.githubusercontent.com/dansamuka/kenya-election-intelligence-engine/main/data/foundation/';
const read=async path=>{
  const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),25000);
  try{const res=await fetch(base+path,{signal:ctrl.signal,headers:{'Accept':'application/json'}});
    if(!res.ok)throw new Error(path+': HTTP '+res.status);
    return await res.json();
  }finally{clearTimeout(t);}
};
const [polls,results]=await Promise.all([read('polls_normalized.json'),read('poll_results_long.json')]);
if(!Array.isArray(polls)||!Array.isArray(results)||polls.length===0)throw new Error('Invalid upstream evidence');
const perId=new Map();
for(const r of results){
 if(r.metric!=='percentage'||!Number.isFinite(Number(r.value)))continue;
 const x=perId.get(r.poll_id)||{};x[r.candidate]=Number(r.value);perId.set(r.poll_id,x);
}
const file='data/context.js';let src=fs.readFileSync(file,'utf8');
const begin=src.indexOf('const POLLS=['),end=src.indexOf('\n];',begin);
if(begin<0||end<0)throw new Error('POLLS array markers missing');
// Keep every previously curated record (including methodology-held records).
const currentBlock=src.slice(begin,end+3);
const sandbox={};
const evaluate=new Function(currentBlock+';return POLLS;');
const existing=evaluate();
const supported=new Set(['preferred_presidential_aspirant','preferred_presidential_candidate','presidential_preference','presidential_preference_reported']);
let added=0,held=0;
for(const p of polls){
 if(!supported.has(p.poll_type))continue;
 if(String(p.geography||'').toLowerCase()!=='kenya')continue;
 if(p.compatible_group&&!String(p.compatible_group).startsWith('presidential_horse_race'))continue;
 if(!/^\d{4}-\d\d-\d\d$/.test(p.date)||p.date<'2026-10-03')continue;
 const votes=perId.get(p.poll_id);
 if(!votes||Object.keys(votes).length<2)continue;
 const count=existing.filter(x=>x.date===p.date&&x.pollster===p.pollster);
 if(count.length)continue; // do not overwrite carefully curated, existing polling records
 const eligible=p.model_eligible===true;
 const row={date:p.date,field:p.fieldwork_dates||'not disclosed',pollster:p.pollster,
   n:Number.isFinite(Number(p.sample_size))&&Number(p.sample_size)>0?Number(p.sample_size):null,
   eligible,url:p.source_url||'',r:votes};
 if(!eligible){row.review=p.methodology_status||'Not approved for central estimate';held++;}
 // Keep non-candidate responses as metadata, never as candidate vote shares.
 const undecided=Number(p.response_categories?.Undecided);
 if(p.response_categories?.Undecided!=null&&Number.isFinite(undecided))row.undecided=undecided;
 const other=Number(p.response_categories?.['Other candidates']);
 if(p.response_categories?.['Other candidates']!=null&&Number.isFinite(other))row.other=other;
 existing.push(row);added++;
}
if(added===0){console.log('Poll sync: no new supported national presidential polls');process.exit(0);}
existing.sort((a,b)=>b.date.localeCompare(a.date));
const latest=existing[0].date;
const body='const POLLS=[\n'+existing.map(x=>'  '+JSON.stringify(x)).join(',\n')+'\n];';
src=src.slice(0,begin)+body+src.slice(end+3);
src=src.replace(/const CTX_AS_OF='\d{4}-\d\d-\d\d';/,"const CTX_AS_OF='"+latest+"';");
fs.writeFileSync(file,src);
console.log('Poll sync: added '+added+' national polls; '+held+' methodology-held; latest '+latest);
