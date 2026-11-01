// Live before a journey (Sam, 31 Oct): with nothing selected or detected, Live is the departure board at the next
// stop of your journey. Auto still says when to leave. docs/stories/live-station-board.md
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, closeAll, json } from './harness.mjs';
after(closeAll);

const MIN=60e3, MORNING=Date.parse('2026-11-03T10:00:00Z'), EVENING=Date.parse('2026-11-03T17:30:00Z');
const AT_OFFICE={coords:{latitude:51.5139,longitude:-0.0710,accuracy:10}};
const SOHO={coords:{latitude:51.5136,longitude:-0.1365,accuracy:20}};
const live=a=>a.d.querySelector('[data-journey-view="live"]').click();
const auto=a=>a.d.querySelector('[data-journey-view="auto"]').click();
const reach=row=>row.querySelector('[data-reach]')?.dataset.reach??null;
const boardRows=a=>[...a.d.querySelectorAll('#list .live-board .row.board')];
// Westbound Circles at Aldgate, 3, 9 and 15 minutes from now.
const aldgate=now=>u=>/940GZZLUALD\/Arrivals/.test(u)?json([3,9,15].map((m,i)=>({vehicleId:`c${i}`,lineId:'circle',platformName:'Westbound - Platform 1',
  destinationName:'Edgware Road (Circle Line) Underground Station',expectedArrival:new Date(now+m*MIN).toISOString(),timeToStation:m*60}))):undefined;

test('Live at home with no journey: every train leaving Letchworth, each saying whether you can make it',async()=>{
  const a=await createApp({now:MORNING,settings:{provider:'demo'}});
  assert.equal(a.c.state.presentation.view,'plan-now','Auto at home is still the plan');
  assert.match(a.text('#hero'),/If you leave now/);
  live(a);
  assert.equal(a.c.state.presentation.mode,'live'); assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#hero'),/Live · departures from Letchworth/);
  assert.equal(a.text('#hero .live-note'),'Auto shows when to leave.');
  assert.equal(a.text('#listTitle'),'Departures from Letchworth');
  assert.equal(a.d.querySelectorAll('[data-board-jump]').length,0,'one station: no station lozenges');
  const rows=boardRows(a), text=rows.map(r=>r.textContent.replace(/\s+/g,' '));
  // Example data from 10:00: Great Northern at :07/:37 to King's Cross, a Thameslink at :21/:51 (to St Pancras and
  // Farringdon: one train, one row), 10:51 cancelled. Two hours of trains are listed, none hidden.
  assert.deepEqual(rows.map(r=>r.querySelector('.leave .t').textContent),['10:07','10:21','10:37','10:51','11:07','11:21','11:37','11:51','12:07','12:21','12:37','12:51']);
  assert.match(text[0],/to King's Cross/); assert.match(text[1],/to Farringdon or St Pancras/);
  const grade=a.c.ranked(MORNING).find(option=>option.train.std==='10:07').effort;
  assert.equal(reach(rows[0]),grade,'the board retains the same effort grade as Auto, including a possible car');
  assert.equal(rows[0].classList.contains('gone'),grade==='none');
  assert.equal(reach(rows[2]),'walk'); assert.match(text[2],/You can make it/);
  assert.match(text[2],/Arrive\s*11:40/,'arrival at the office, from the same plan Auto uses');
  assert.equal(reach(rows[3]),null,'a cancelled train has nothing to make'); assert.match(text[3],/Cancelled/);
  assert.equal(a.c.state.trainLock||null,null,'Live never invents a train you are on');
  auto(a);
  assert.equal(a.c.state.presentation.view,'plan-now'); assert.match(a.text('#hero'),/If you leave now/);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live in the office going home: Aldgate westbound departures, the train home each connects to, and whether you can make it',async()=>{
  const a=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(a);
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#hero'),/departures from Aldgate/);
  assert.equal(a.text('#listTitle'),'Departures from Aldgate');
  const rows=boardRows(a), text=rows.map(r=>r.textContent.replace(/\s+/g,' '));
  assert.equal(rows.length,3,'every listed tube, including one you cannot make');
  assert.deepEqual(rows.map(r=>r.querySelector('.leave .t').textContent),['17:33','17:39','17:45']);
  assert.equal(reach(rows[0]),'none','3 minutes: less than the office walk and platform');
  assert.equal(reach(rows[1]),'walk'); assert.match(text[1],/leave the office by/);
  assert.match(text[1],/Off at (Farringdon|King's Cross)/); assert.match(text[1],/Home\s*\d\d:\d\d/);
  assert.equal(a.d.querySelectorAll('#list [data-reach]').length,3);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live going home away from the office says Aldgate departures load near the office (no extra requests)',async()=>{
  const a=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo'},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(a);
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#list'),/Live departures from Aldgate load when you're near the office/);
  assert.equal(a.calls.filter(u=>/940GZZLUALD/.test(u)).length,0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live with Circle and Met closed: the next stop is Aldgate East, which has no live departures in the app',async()=>{
  const closed=id=>({id,name:id,lineStatuses:[{statusSeverity:20,statusSeverityDescription:'Closed',reason:'Closed (test)'}]});
  const route=u=>/Line\/circle,metropolitan,hammersmith-city\/Status/.test(u)?json([closed('circle'),closed('metropolitan'),{id:'hammersmith-city',name:'H&C',lineStatuses:[{statusSeverity:10,statusSeverityDescription:'Good Service'}]}]):aldgate(EVENING)(u);
  const a=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home'},route});
  live(a);
  assert.match(a.text('#hero'),/departures from Aldgate East/);
  assert.match(a.text('#list'),/No live departures for Aldgate East in the app/);
  assert.equal(boardRows(a).length,0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live in Leisure going home: each London station grouped, with station lozenges that jump to its departures',async()=>{
  const a=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo'},saved:{dirMode:'home',mode:'leisure'}});
  live(a);
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  const names=[...a.d.querySelectorAll('#list .live-board-name')].map(h=>h.textContent);
  // The way to the station is planned (TfL mock), so the stop the best option boards at comes first; the rest in route order.
  const best=a.c.state.presentation&&[...a.d.querySelectorAll('#list .live-board')][0].querySelector('[data-reach="walk"]');
  assert.ok(best,'the first station has a train you can make');
  assert.deepEqual(names,['St Pancras','Farringdon',"King's Cross"]);
  assert.equal(a.text('#listTitle'),'Departures by station');
  const jumps=[...a.d.querySelectorAll('#hero [data-board-jump]')];
  assert.deepEqual(jumps.map(b=>b.textContent),names,'one lozenge per station, in the list order');
  for(const section of a.d.querySelectorAll('#list .live-board'))
    assert.ok([...section.querySelectorAll('.row.board')].every(r=>r.textContent.includes('to Letchworth')),'trains home only');
  let scrolled=null; a.w.HTMLElement.prototype.scrollIntoView=function(){ scrolled=this.id; };
  jumps.find(b=>b.textContent==='Farringdon').click();
  assert.equal(scrolled,'liveboard-ZFD');
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live without a location keeps asking where you are and never assumes home',async()=>{
  const a=await createApp({now:MORNING,geo:'denied',settings:{provider:'demo'}});
  live(a);
  assert.equal(a.c.state.presentation.view,'awaiting-location');
  assert.match(a.text('#hero'),/Location needed|Finding your location/);
  assert.equal(a.d.querySelectorAll('#list .live-board').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live board rows: a cancelled train has no countdown, nor does a delayed one with no estimate whose time has passed',async()=>{
  const lateNoEstimate=u=>/GetDepBoardWithDetails\/LET/.test(u)?json({trainServices:[{std:'09:50',etd:'Delayed',operator:'Great Northern',platform:'2',serviceID:'x1',
    destination:[{locationName:'London Kings Cross',crs:'KGX'}],subsequentCallingPoints:[{callingPoint:[{locationName:'London Kings Cross',crs:'KGX',st:'10:30',et:'Delayed'}]}]}]}):undefined;
  const a=await createApp({now:MORNING,settings:{provider:'rdm',rdmKey:'k',rdmBase:'https://darwin.test/LDBWS/api/20220120'},route:lateNoEstimate});
  live(a);
  const rows=boardRows(a), text=rows.map(r=>r.textContent.replace(/\s+/g,' '));
  const late=text.find(t=>/09:50/.test(t));
  assert.ok(late,'the delayed train is listed'); assert.match(late,/Delayed/);
  assert.equal(rows[text.indexOf(late)].querySelector('[data-dep]'),null,'no countdown: its time has passed but it has not left');
  assert.equal(reach(rows[text.indexOf(late)]),'unknown');
  a.close();
  const b=await createApp({now:MORNING,settings:{provider:'demo'}});
  live(b);
  const brows=boardRows(b), at=std=>brows.find(r=>r.querySelector('.leave .t').textContent===std);
  assert.match(at('10:51').textContent,/Cancelled/);
  assert.equal(at('10:51').querySelector('[data-dep]'),null,'a cancelled train has no countdown');
  assert.ok(at('10:37').querySelector('[data-dep]'),'a running train keeps its countdown');
  assert.deepEqual([...a.errors,...b.errors],[]);b.close();
});

test('Live with the timetable source says so in its heading',async()=>{
  const a=await createApp({now:MORNING,settings:{provider:'tfl'}});
  live(a);
  assert.match(a.text('#hero'),/Live · departures from Letchworth · 10:00 · timetable/);
  assert.ok(boardRows(a).length>0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live Aldgate board: leave-by time at your pace, greyed when you cannot make it, and from Aldgate itself the walk is just the platform',async()=>{
  const by=row=>(row.textContent.match(/leave (the office|for the platform) by\s*(\d\d:\d\d)/)||[]).slice(1).join(' ');
  const office=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(office);
  let rows=boardRows(office);
  assert.ok(rows[0].classList.contains('gone')); assert.ok(!rows[1].classList.contains('gone'));
  // Settings defaults: office walk 420 s + platform 90 s. 17:39 − 8.5 min = 17:30:30; 17:45 → 17:36:30.
  assert.deepEqual(rows.map(by),['','the office 17:30','the office 17:36']);
  office.close();
  // Fast pace (× 0.82): 418 s. 17:39 → 17:32:02.
  const fast=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home',pace:'fast'},route:aldgate(EVENING)});
  live(fast);
  assert.deepEqual(boardRows(fast).map(by),['','the office 17:32','the office 17:38']);
  fast.close();
  // At Aldgate: only the platform (90 s), so the 17:33 is within reach.
  const atAld=await createApp({now:EVENING,geo:{coords:{latitude:51.5143,longitude:-0.0755,accuracy:10}},settings:{provider:'demo'},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(atAld);
  assert.equal(atAld.c.state.presentation.noActiveJourney,true);
  rows=boardRows(atAld);
  assert.deepEqual(rows.map(reach),['walk','walk','walk']);
  assert.deepEqual(rows.map(by),['for the platform 17:31','for the platform 17:37','for the platform 17:43']);
  assert.deepEqual(atAld.errors,[]);atAld.close();
});

test('Live Aldgate board says why when the departures fail to load or are over 3 minutes old',async()=>{
  const fail=u=>/940GZZLUALD\/Arrivals/.test(u)?json({},500):undefined;
  const a=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home'},route:fail});
  live(a);
  assert.match(a.text('#list'),/TfL tube departures error \(HTTP 500\)/);
  a.close();
  const b=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo'},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(b);
  assert.equal(boardRows(b).length,3);
  b.c.state.aldDeps.at=EVENING-3*MIN-1;b.c.render();
  assert.match(b.text('#list'),/over 3 minutes old/);
  assert.equal(boardRows(b).length,0,'old departures never say you can make it');
  assert.deepEqual([...a.errors,...b.errors],[]);b.close();
});

test('Live board Follow: each row follows that train from that station',async()=>{
  const a=await createApp({now:MORNING,settings:{provider:'demo',followRoute:true}});
  live(a);
  const rows=boardRows(a);
  assert.equal(rows[0].querySelector('[data-follow]')?.disabled,true,'one you cannot make cannot be followed');
  const btn=rows[2].querySelector('[data-follow]');
  assert.match(btn.getAttribute('aria-label'),/Follow the 10:37 Great Northern via King's Cross/);
  btn.click();
  assert.equal(a.c.state.saved.followRoute.id,'2026-11-03|Great Northern|10:37|LET|KGX|KGX');
  assert.equal(a.c.state.presentation.view,'following');
  a.close();
  const b=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo',followRoute:true},saved:{dirMode:'home',mode:'leisure'}});
  live(b);
  for(const section of b.d.querySelectorAll('#list .live-board')){
    const name=section.querySelector('.live-board-name').textContent;
    for(const f of section.querySelectorAll('[data-follow]'))
      assert.match(f.getAttribute('aria-label'),new RegExp(`via ${name}`),`${name}: ${f.getAttribute('aria-label')}`);
  }
  assert.deepEqual([...a.errors,...b.errors],[]);b.close();
});

test('Live in Leisure going home: Farringdon still lists the Thameslinks when only the St Pancras board has them (from their calling points)',async()=>{
  const a=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo'},saved:{dirMode:'home',mode:'leisure'}});
  // St Pancras trains that call at Farringdon first (as Darwin lists them); Farringdon's own board missing.
  const stp=a.c.state.boards['STP-LET'].services;
  for(const t of stp) t.calls=[{name:'London St Pancras International',code:'STP',t:t.dep},{name:'Farringdon',code:'ZFD',t:t.dep-4*MIN},{name:'Letchworth Garden City',code:'LET',t:t.arr}];
  for(const t of stp) t.calls.sort((x,y)=>x.t-y.t);
  delete a.c.state.boards['ZFD-LET'];
  live(a);
  const zfd=a.d.querySelector('#liveboard-ZFD');
  assert.ok(zfd,'Farringdon still has a section');
  const times=[...zfd.querySelectorAll('.row.board .leave .t')].map(e=>e.textContent);
  assert.ok(times.length>0,'derived from the St Pancras trains\' stops');
  assert.ok(times.every(t=>stp.some(s=>{const d=new Date(s.dep-4*MIN);return t===`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;})),times.join(','));
  assert.deepEqual(a.errors,[]);a.close();
});
