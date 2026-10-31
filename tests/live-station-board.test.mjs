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
  const a=await createApp({now:MORNING,settings:{provider:'demo',signal:true}});
  assert.equal(a.c.state.presentation.view,'plan-now','Auto at home is still the plan');
  assert.match(a.text('#hero'),/If you leave now/);
  live(a);
  assert.equal(a.c.state.presentation.mode,'live'); assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#hero'),/Live · departures from Letchworth/);
  assert.match(a.text('#hero'),/No journey under way/);
  assert.equal(a.text('#listTitle'),'Departures from Letchworth');
  assert.equal(a.d.querySelectorAll('[data-board-jump]').length,0,'one station: no station lozenges');
  const rows=boardRows(a), text=rows.map(r=>r.textContent.replace(/\s+/g,' '));
  // Example data from 10:00: Great Northern at :07/:37 to King's Cross, a Thameslink at :21/:51 (to St Pancras and
  // Farringdon: one train, one row), 10:51 cancelled. Two hours of trains are listed, none hidden.
  assert.deepEqual(rows.map(r=>r.querySelector('.leave .t').textContent),['10:07','10:21','10:37','10:51','11:07','11:21','11:37','11:51','12:07','12:21','12:37','12:51']);
  assert.match(text[0],/to King's Cross/); assert.match(text[1],/to Farringdon or St Pancras/);
  assert.equal(reach(rows[0]),'none','10:07 leaves before you could walk there');
  assert.ok(rows[0].classList.contains('gone'));
  assert.equal(reach(rows[2]),'walk'); assert.match(text[2],/You can make it/);
  assert.match(text[2],/Arrive\s*11:40/,'arrival at the office, from the same plan Auto uses');
  assert.equal(reach(rows[3]),null,'a cancelled train has nothing to make'); assert.match(text[3],/Cancelled/);
  assert.equal(a.c.state.trainLock||null,null,'Live never invents a train you are on');
  auto(a);
  assert.equal(a.c.state.presentation.view,'plan-now'); assert.match(a.text('#hero'),/If you leave now/);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live in the office going home: Aldgate westbound departures, the train home each connects to, and whether you can make it',async()=>{
  const a=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo',signal:true},saved:{dirMode:'home'},route:aldgate(EVENING)});
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
  const a=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo',signal:true},saved:{dirMode:'home'},route:aldgate(EVENING)});
  live(a);
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#list'),/Live departures from Aldgate load when you're near the office/);
  assert.equal(a.calls.filter(u=>/940GZZLUALD/.test(u)).length,0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live with Circle and Met closed: the next stop is Aldgate East, which has no live departures in the app',async()=>{
  const closed=id=>({id,name:id,lineStatuses:[{statusSeverity:20,statusSeverityDescription:'Closed',reason:'Closed (test)'}]});
  const route=u=>/Line\/circle,metropolitan,hammersmith-city\/Status/.test(u)?json([closed('circle'),closed('metropolitan'),{id:'hammersmith-city',name:'H&C',lineStatuses:[{statusSeverity:10,statusSeverityDescription:'Good Service'}]}]):aldgate(EVENING)(u);
  const a=await createApp({now:EVENING,geo:AT_OFFICE,settings:{provider:'demo',signal:true},saved:{dirMode:'home'},route});
  live(a);
  assert.match(a.text('#hero'),/departures from Aldgate East/);
  assert.match(a.text('#list'),/No live departures for Aldgate East in the app/);
  assert.equal(boardRows(a).length,0);
  assert.deepEqual(a.errors,[]);a.close();
});

test('Live in Leisure going home: each London station grouped, with station lozenges that jump to its departures',async()=>{
  const a=await createApp({now:EVENING,geo:SOHO,settings:{provider:'demo',signal:true},saved:{dirMode:'home',mode:'leisure'}});
  live(a);
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  const names=[...a.d.querySelectorAll('#list .live-board-name')].map(h=>h.textContent);
  assert.deepEqual([...names].sort(),["Farringdon","King's Cross","St Pancras"]);
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
  const a=await createApp({now:MORNING,geo:'denied',settings:{provider:'demo',signal:true}});
  live(a);
  assert.equal(a.c.state.presentation.view,'awaiting-location');
  assert.match(a.text('#hero'),/Location needed|Finding your location/);
  assert.equal(a.d.querySelectorAll('#list .live-board').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});
