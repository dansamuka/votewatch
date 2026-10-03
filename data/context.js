// Political context and national presidential-preference polls, as of 3 Oct 2026.
// Polls are taken from the kenya-election-intelligence-engine repo
// (data/foundation/poll_results_long.json + polls_normalized.json). `eligible`
// mirrors that repo's model_eligible flag: Mizani and Politrack are shown but
// held out of averages until their methodology is verified.
// Regional-only polls (e.g. Infotrak "Mulembe Nation", Western only) are excluded.

const CTX_AS_OF='2026-10-03';

const POLLS=[
  {date:'2026-10-01',field:'15–25 Sep 2026',pollster:'Politrack Africa',n:20419,eligible:false,
   url:'https://capitalfm.africa/ruto-leads-2027-presidential-race-with-45-1-politrack-africa-poll/',
   r:{'William Ruto':45.1,'Edwin Sifuna':19.6,'Kalonzo Musyoka':10.3,"Fred Matiang'i":7.2,'Rigathi Gachagua':6,'George Wajackoyah':1.1,'David Maraga':0.8,'Martha Karua':0.8,'James Orengo':0.4,'Jimi Wanjigi':0.3}},
  {date:'2026-09-25',field:'not disclosed',pollster:'Mizani Africa',n:null,eligible:false,
   url:'https://capitalfm.africa/mizani-poll-ruto-leads-kalonzo-sifuna-in-presidential-preference-survey/',
   r:{'William Ruto':38.7,'Kalonzo Musyoka':27.5,'Edwin Sifuna':13.2,"Fred Matiang'i":7.7,'Rigathi Gachagua':4.4,'Ndindi Nyoro':3.1,'Martha Karua':0.3,'David Maraga':0.1}},
  {date:'2026-08-20',field:'25 Jul–6 Aug 2026',pollster:'Swiss Poll International',n:4037,eligible:true,
   url:'https://capitalfm.africa/kalonzo-emerges-as-leading-opposition-choice-in-2027-race-swiss-poll-shows/',
   r:{'William Ruto':31,'Kalonzo Musyoka':22,'Edwin Sifuna':13,"Fred Matiang'i":11,'Rigathi Gachagua':6}},
  {date:'2026-07-03',field:'Jun–Jul 2026',pollster:'Infotrak Research',n:3000,eligible:true,
   url:'https://www.infotrakresearch.com/2743-2/',
   r:{'William Ruto':32,'Edwin Sifuna':12,"Fred Matiang'i":12,'Kalonzo Musyoka':4,'Rigathi Gachagua':4}},
  {date:'2026-05-14',field:'May 2026',pollster:'TIFA Research',n:2013,eligible:true,
   url:'https://www.tifaresearch.com/wp-content/uploads/2023/03/TIFA-Research_Political-Alignments-and-2027-Election-Prospects_14-May-2026.pdf',
   r:{'William Ruto':24,'Kalonzo Musyoka':19,"Fred Matiang'i":16,'Edwin Sifuna':9,'Rigathi Gachagua':6}},
  {date:'2026-03-01',field:'Mar 2026',pollster:'Stats Kenya',n:null,eligible:true,
   url:'https://thekenyatimes.com/politics/ruto-in-early-lead-in-new-poll-as-opposition-split-emerges/',
   r:{'William Ruto':23.41,"Fred Matiang'i":12.25,'Kalonzo Musyoka':8.17,'Edwin Sifuna':7.44,'Rigathi Gachagua':3.99,'David Maraga':1.45,'Oburu Odinga':1,'Okiya Omtata':0.36}},
  {date:'2025-12-28',field:'19–20 Dec 2025',pollster:'Infotrak Research',n:1000,eligible:true,
   url:'https://nation.africa/kenya/news/politics/ruto-leads-in-popularity-poll-babu-owino-tipped-for-luo-kingpin-after-raila-death-infotrak-5310226',
   r:{'William Ruto':28,"Fred Matiang'i":13,'Kalonzo Musyoka':12,'Babu Owino':7,'Rigathi Gachagua':5,'David Maraga':2,'Martha Karua':2,'Edwin Sifuna':0.2}},
  {date:'2025-11-01',field:'10–17 Nov 2025',pollster:'TIFA Research',n:2053,eligible:true,
   url:'https://www.tifaresearch.com/wp-content/uploads/2023/03/TIFA-Research_Political-Alignments-and-2027-Election-Prospects_14-May-2026.pdf',
   r:{'William Ruto':25,'Kalonzo Musyoka':18,"Fred Matiang'i":16,'Edwin Sifuna':10,'Rigathi Gachagua':8}},
];

// A poll regrouped by the current teams (decided voters, undecided dropped):
// team A, team B, and everyone else. Uses the live team assignment S.cfg.
function pollTeams(p){
  const b={inc:0,opp:0,tf:0},asg=(typeof S!=="undefined"&&S.cfg&&S.cfg.assign)||{};
  for(const [name,v] of Object.entries(p.r)){const t=asg[name];b[t===0?"inc":t===1?"opp":"tf"]+=v;}
  const t=b.inc+b.opp+b.tf||1;
  return {inc:b.inc/t*100,opp:b.opp/t*100,tf:b.tf/t*100};
}

// Dated, sourced facts behind the political-context options.
const CONTEXT_FACTS=[
  {date:'2025-10',t:'Raila Odinga dies; Oburu Oginga leads ODM.',
   url:'https://nation.africa/kenya/news/politics/raila-s-anniversary-ruto-alliance-party-divisions-oburu-returns-to-a-full-in-tray-5613852'},
  {date:'2026',t:'ODM (Oburu) stays in the broad-based arrangement with Ruto; UDA–ODM zoning for 2027 still disputed.',
   url:'https://nation.africa/kenya/news/politics/ruto-oburu-pact-faces-first-major-test-over-2027-zoning-plan-5593340'},
  {date:'2026-05',t:'TIFA: support for the broad-based government falls to 30% (56% oppose).',
   url:'https://www.capitalfm.co.ke/news/2026/05/ruto-support-weakens-fragmented-opposition-2027-tifa-poll/'},
  {date:'2026-09',t:'Linda Mwananchi endorses Edwin Sifuna as its 2027 presidential candidate; party to be unveiled in October.',
   url:'https://citizen.digital/article/linda-mwananchi-group-settles-on-sifuna-as-its-2027-presidential-candidate-n390997'},
  {date:'2026-09',t:'United Opposition principals (Kalonzo, Gachagua, Matiang\'i, Karua) still split on how to pick one candidate: negotiation vs polling.',
   url:'https://eastleighvoice.co.ke/news/265402/cracks-in-united-opposition-as-gachagua-kalonzo-clash-on-when-to-name-2027-presidential-candidate'},
  {date:'2026-09-28',t:'Gachagua, Kalonzo, Sifuna and Matiang\'i ask MP Edward Muriu to draft a coalition formula for a single candidate.',
   url:'https://peopledaily.digital/inside-politics/gachagua-kalonzo-sifuna-and-matiangi-task-gatanga-mp-edward-muriu-to-draft-2027-coalition-formula'},
  {date:'2027-08-10',t:'General election (second Tuesday of August). Outright win needs 50%+1 and 25% in 24 counties; a run-off is decided by most votes (Art. 138).',
   url:'https://www.electionguide.org/elections/id/2614/'},
];

// ═══ CANDIDATE FIELD ═══
// avg: polling average across all published national polls (incl. held-out ones),
// from kenya-election-intelligence-engine data/model/polling_average_all.json
// (as of 2026-10-01). These are the numbers shown in the Teams panel.
// prof: relative strength by model region, in CLUSTER order
//   [Western & Nairobi (Western+Nairobi), Mt Kenya (Mt Kenya), Coast,
//    Eastern, Rift & North, Nyanza]
// home: strongholds (x1.6). lean: which 2022 vote a candidate draws from
// within a region ('bi' = 2022 Ruto voters, 'bo' = 2022 Raila voters).
// Profiles are assumptions informed by TIFA Jul 2026 regional cuts (e.g. Ruto ~1.6x his
// national share in Nyanza and ~1.9x in the Rift) and home regions.
const CANDIDATES=[
  {name:'William Ruto',      avg:33.69,polls:10,lean:'bi',prof:[0.95,0.7,0.9,0.6,1.8,2.0],home:[]},
  {name:'Kalonzo Musyoka',   avg:15.12,polls:10,lean:'bo',prof:[0.7,0.6,1.0,3.5,0.3,0.5],home:['Machakos','Makueni','Kitui']},
  {name:'Edwin Sifuna',      avg:13.79,polls:10,lean:'bo',prof:[2.2,0.3,1.6,0.5,0.3,1.0],home:['Bungoma','Kakamega','Vihiga','Nairobi City']},
  {name:"Fred Matiang'i",    avg:11.05,polls:10,lean:'bo',prof:[1.0,1.4,0.6,0.6,0.5,2.0],home:['Kisii','Nyamira']},
  {name:'Babu Owino',        avg:7.0,  polls:1, lean:'bo',prof:[1.2,0.3,0.8,0.3,0.3,2.5],home:['Kisumu','Siaya','Homa Bay','Migori','Nairobi City']},
  {name:'Rigathi Gachagua',  avg:5.24, polls:10,lean:'bi',prof:[0.6,3.5,0.2,0.3,0.5,0.1],home:['Nyeri',"Murang'A",'Kiambu','Kirinyaga','Nyandarua']},
  {name:'Ndindi Nyoro',      avg:3.1,  polls:1, lean:'bi',prof:[0.6,2.5,0.6,0.6,0.6,0.6],home:["Murang'A",'Kiambu']},
  {name:'George Wajackoyah', avg:1.1,  polls:1, lean:'bo',prof:[1.5,0.9,0.9,0.9,0.9,0.9],home:['Kakamega','Bungoma']},
  {name:'Oburu Odinga',      avg:1.0,  polls:1, lean:'bo',prof:[0.3,0.3,0.3,0.3,0.3,3.5],home:['Siaya','Kisumu','Homa Bay','Migori']},
  {name:'David Maraga',      avg:0.83, polls:5, lean:'bo',prof:[0.9,0.9,0.9,0.9,0.9,1.8],home:['Nyamira','Kisii']},
  {name:'Martha Karua',      avg:0.83, polls:4, lean:'bi',prof:[0.8,2.0,0.8,0.8,0.8,0.8],home:['Kirinyaga']},
  {name:'James Orengo',      avg:0.4,  polls:1, lean:'bo',prof:[0.3,0.3,0.3,0.3,0.3,3.5],home:['Siaya']},
  {name:'Okiya Omtata',      avg:0.36, polls:1, lean:'bo',prof:[1.5,0.8,0.8,0.8,0.8,1.3],home:['Busia']},
  {name:'Jimi Wanjigi',      avg:0.3,  polls:1, lean:'bi',prof:[0.9,1.5,0.9,0.9,0.9,0.9],home:['Nyeri','Kiambu']},
];
