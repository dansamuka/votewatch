// Final published pre-election polls vs results, 2013–2022 (Kenyatta/Ruto side = "a",
// Odinga = "b"; percentages of all respondents as published). Used to calibrate the
// model's national poll error and the optional poll-bias correction, and as the input
// to the 2022 back-test (scripts/backtest-2022.mjs).
// Only pollsters in the model's validated set are used for calibration; Radio Africa
// 2022 is listed for context (it was the one poll that had Ruto ahead).
const POLL_HISTORY=[
  {year:2013,result:{a:50.51,b:43.70},
   polls:[
    {p:'Ipsos Synovate',field:'15–19 Feb 2013',a:44.8,b:44.4,url:'https://books.openedition.org/africae/1482?lang=en'},
    {p:'Infotrak',field:'Feb 2013',a:44.5,b:46.0,url:'https://books.openedition.org/africae/1482?lang=en'}]},
  {year:2017,result:{a:54.17,b:44.94},note:'August 2017 declared result (annulled by the Supreme Court; the October re-run was boycotted)',
   polls:[
    {p:'Ipsos',field:'3–12 Jul 2017',a:47,b:43,url:'https://www.capitalfm.co.ke/news/2017/07/infotrak-survey-shows-raila-now-more-popular-than-uhuru-while-ipsos-shows-reverse/'},
    {p:'Infotrak',field:'16–22 Jul 2017',a:46,b:47,url:'https://www.capitalfm.co.ke/news/2017/07/infotrak-survey-shows-raila-now-more-popular-than-uhuru-while-ipsos-shows-reverse/'}]},
  {year:2022,result:{a:50.49,b:48.85},
   polls:[
    {p:'TIFA Research',field:'31 Jul–1 Aug 2022',a:45,b:53,url:'https://www.capitalfm.co.ke/news/2022/08/final-tifa-poll-shows-raila-will-win-with-53pc-ruto-45-pc/'},
    {p:'Infotrak Research',field:'1–2 Aug 2022',a:42,b:49,url:'https://www.capitalfm.co.ke/news/2022/08/railas-popularity-at-49pc-against-rutos-42pc-in-the-state-house-race-infotrak/'},
    {p:'Ipsos',field:'released 2 Aug 2022',a:41,b:47,url:'https://www.ipsos.com/en-ke/ipsos-opinion-poll-7-days-general-elections-mr-odinga-leads-presidential-race'}],
   context:[{p:'Radio Africa',field:'early Aug 2022',a:45.5,b:44.2,url:'https://www.the-star.co.ke/news/2022-09-29-only-radio-africa-correctly-predicted-election-results'}]}
];
// Two-way error of the final poll average for side "a" (result minus polls, points).
function pollHistoryErrors(years){
  return POLL_HISTORY.filter(e=>!years||years.includes(e.year)).map(e=>{
    const tw=x=>100*x.a/(x.a+x.b),poll=e.polls.reduce((s,p)=>s+tw(p),0)/e.polls.length;
    return{year:e.year,poll:+poll.toFixed(2),result:+tw(e.result).toFixed(2),err:+(tw(e.result)-poll).toFixed(2)};
  });
}
function pollErrorStats(years){
  const es=pollHistoryErrors(years).map(x=>x.err),n=es.length;
  const mean=es.reduce((s,x)=>s+x,0)/n,rms=Math.sqrt(es.reduce((s,x)=>s+x*x,0)/n);
  const sd=n>1?Math.sqrt(es.reduce((s,x)=>s+(x-mean)**2,0)/(n-1)):0;
  return{n,mean,rms,sd};
}
const POLL_ERR=pollErrorStats();

// Undecided voters (share of potential voters). TIFA, Jun 2026: 20% nationally;
// Infotrak, Jul 2026: 26% in Central / Mt Kenya. No other region is published, so the
// rest share one rate chosen to keep the national average at 20% (solved in js/app.js).
const UNDECIDED={national:0.20,regions:{MTK:0.26},
  sources:['TIFA Research, fieldwork 13–22 Jun 2026 (20% undecided nationally)','Infotrak Research, Jul 2026 (26% undecided in Central / Mt Kenya)']};
