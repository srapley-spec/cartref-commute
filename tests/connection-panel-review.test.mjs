// Independent review counterexamples for the approved journey + connection panels.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp,closeAll,hm,json,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);

const MIN=60000,NOW=Date.parse('2026-11-03T07:00:00Z');
const rail=(dep,extra={})=>({from:'LET',to:'KGX',std:hm(dep),dep,arr:dep+35*MIN,operator:'Great Northern',
 platform:'7',serviceId:'review-'+dep,depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:'',...extra});
async function app(){
 const a=await createApp({now:NOW,geo:null,settings:{provider:'demo',followRoute:true},saved:{dirMode:'office'}});
 Object.assign(a.c.state,{railSource:'darwin',boardsAt:NOW,errors:[],loading:false,status:[],nrStatus:[]});
 return a;
}
function use(a,services){
 a.c.state.boards={'LET-KGX':{services,msgs:[]},'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}};
 a.c.render();
}

test('connection panel review: first and next-best connection clocks stay visible and prominent',async()=>{
 const a=await app(),first=rail(NOW+30*MIN,{dep:NOW+35*MIN,arr:NOW+70*MIN,depLate:5,arrLate:5});use(a,[first,rail(NOW+45*MIN)]);
 assert.equal(a.d.querySelectorAll('#hero>.opt').length,2);
 const clocks=a.d.querySelectorAll('#hero .connection-time,#list .connection-time');assert.ok(clocks.length>=4);
 for(const clock of clocks){
  for(let n=clock;n;n=n.parentElement){const style=a.w.getComputedStyle(n);assert.ok(!n.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0','the connection clock must be visible: '+clock.textContent);}
  const minimum=clock.closest('.journey-row')?30:36;
  assert.ok(parseFloat(a.w.getComputedStyle(clock).fontSize)>=minimum,'train departure stays prominent beside journey times');
  if(clock.dataset.connectionTime==='expected')assert.equal(clock.parentElement.querySelector('small').textContent,'Expected');
  else if(clock.closest('.has-expected'))assert.equal(clock.parentElement.querySelector('small').textContent,'Scheduled');
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panel review: unusable future services with passed access deadlines have no departure promise, while a known missed train keeps its countdown',async()=>{
 const a=await app();
 for(const issue of ['cancelled','depUnknown','arrUnknown']){
  const train=rail(NOW+7*MIN,{[issue]:true});use(a,[train]);
  const option=a.c.ranked(NOW)[0],row=a.d.querySelector('#list .row');
  assert.ok(option.missed,'the access deadline has already passed');assert.ok(train.dep>NOW,'the retained departure is still in the future');
  assert.equal(row.querySelector('[data-fact="leave-by"]'),null);
  assert.equal(row.querySelector('[data-dep]'),null,issue+': retained times must not become a departure promise');
  assert.doesNotMatch(row.textContent,/train departs in|train has departed/);
  assert.equal(row.querySelector('[data-connection-time="scheduled"]').textContent,'07:07');
  assert.match(row.querySelector('.connection-status').textContent,/Cancelled|No estimate/);
 }
 const known=rail(NOW+7*MIN);use(a,[known]);const row=a.d.querySelector('#list .row');
 assert.equal(a.c.ranked(NOW)[0].missed,true);
 assert.match(row.querySelector('[data-cd]').textContent,/leave time passed/);
 assert.equal(Number(row.querySelector('[data-dep]').dataset.dep),known.dep);
 assert.match(row.querySelector('[data-dep]').textContent,/train departs in 7m/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panel review: cancellation while following retracts the current access promise without replacing the selected service',async()=>{
 const a=await app(),train=rail(NOW+30*MIN),next=rail(NOW+45*MIN);use(a,[train,next]);
 a.d.querySelector('#hero .opt [data-follow]').click();const id=a.c.state.saved.followRoute.id;
 assert.ok(a.d.querySelector('#followPanel>.journey-heading[data-fact="leave-by"]'));
 train.cancelled=true;use(a,[train,next]);
 const panel=a.d.querySelector('#followPanel');
 assert.equal(a.c.state.saved.followRoute.id,id);
 assert.equal(panel.querySelector(':scope>.journey-heading'),null);
 assert.match(panel.querySelector(':scope>.big').textContent,/Arrival uncertain/);
 assert.equal(panel.querySelector(':scope>.journey-connection [data-connection-time="scheduled"]').textContent,'07:30');
 assert.match(panel.querySelector(':scope>.journey-connection .connection-status').textContent,/Cancelled/);
 assert.match(panel.textContent,/Original plan: arrive/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panel review: Live keeps its original alternative layout while Auto exposes the journey panel',async()=>{
 const a=await app(),train=rail(NOW+30*MIN),next=rail(NOW+45*MIN);use(a,[train,next]);
 a.d.querySelector('#hero .opt [data-follow]').click();train.cancelled=true;use(a,[train,next]);
 let alternative=a.d.querySelector('#followPanel>.follow-alternative');assert.ok(alternative);
 assert.ok(alternative.querySelector(':scope>.journey-heading'));
 assert.equal(a.w.getComputedStyle(alternative).display,'grid');
 const chosen=a.c.state.saved.followRoute.id;
 a.d.querySelector('[data-journey-view="live"]').click();
 alternative=a.d.querySelector('#followPanel>.follow-alternative');assert.ok(alternative);
 assert.equal(alternative.querySelector('.journey-heading,.journey-connection'),null);
 assert.equal(a.w.getComputedStyle(alternative).display,'block','Live keeps the preceding production layout as well as its text');
 assert.equal(a.c.state.saved.followRoute.id,chosen);
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panel review: a delayed second Trip train owns its expected clock, station and warning',async()=>{
 const recorded=JSON.parse(readFileSync(new URL('./fixtures/trip/tfl-brighton-canterburywest.json',import.meta.url))).body;
 const leg=recorded.journeys[0].legs[1],scheduled=leg.departureTime;
 leg.scheduledDepartureTime=scheduled;leg.scheduledArrivalTime=leg.arrivalTime;
 leg.departureTime=new Date(Date.parse(scheduled)+3*MIN).toISOString();
 leg.arrivalTime=new Date(Date.parse(leg.arrivalTime)+3*MIN).toISOString();
 const route=u=>/JourneyResults\/90000899\/to\/1001160/.test(u)?json(recorded):tripRoute(u);
 const a=await createApp({now:Date.parse('2026-11-03T10:00:00Z'),settings:TRIP_SETTINGS,route});
 await planBrightonCanterbury(a);
 const row=[...a.d.querySelectorAll('#tripResults .trip-row')].find(r=>r.querySelector('[data-connection-time="scheduled"]')?.textContent==='10:06');assert.ok(row);
 const panels=row.querySelectorAll('.journey-connection');assert.equal(panels.length,4);
 assert.equal(panels[0].querySelector('[data-connection-time="expected"]'),null);
 assert.match(panels[1].querySelector('.connection-heading').textContent,/Train from Lewes/);
 assert.equal(panels[1].querySelector('[data-connection-time="scheduled"]').textContent,'10:27');
 assert.equal(panels[1].querySelector('[data-connection-time="expected"]').textContent,'10:30');
 assert.match(panels[1].querySelector('.connection-status').textContent,/3 min late/);
 assert.equal(panels[2].querySelector('[data-connection-time="expected"]'),null);
 assert.equal(row.querySelector('.trip-steps').open,false,'each connection is exposed without its steps');
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panel review: a failed Trip board refresh qualifies retained connection facts instead of claiming current On time',async()=>{
 for(const incident of ['on-time','delayed','cancelled']){
 const now=Date.parse('2026-11-03T10:00:00Z');let failed=false,requests=0;
 const route=u=>{
  if(/departures\/BTN\/to\/LWS/.test(u)){
   requests++;
   return failed?json({},503):json({locationName:'Brighton',trainServices:[{std:'10:06',etd:incident==='delayed'?'10:14':'On time',isCancelled:incident==='cancelled',operator:'Southern',platform:'5',serviceID:'review-1006',destination:[{locationName:'Seaford'}],subsequentCallingPoints:[{callingPoint:[{crs:'LWS',st:'10:21',et:incident==='delayed'?'10:29':'On time'}]}]}]});
  }
  return tripRoute(u);
 };
 const a=await createApp({now,settings:TRIP_SETTINGS,route});await planBrightonCanterbury(a);await sleep(100);
 const row=()=>[...a.d.querySelectorAll('#tripResults .trip-row')].find(r=>r.querySelector('[data-connection-time="scheduled"]')?.textContent==='10:06');
 const panel=()=>row()?.querySelector('.journey-connection');assert.ok(panel());
 const expectedStatus=incident==='delayed'?/8 min late/:incident==='cancelled'?/Cancelled/:/On time/;
 assert.match(panel().querySelector('.connection-status').textContent,expectedStatus);
 if(incident==='delayed')assert.equal(panel().querySelector('.connection-expected>small').textContent,'Expected');
 failed=true;a.setNow(now+31000);a.d.querySelector('#refreshBtn').click();
 await until(()=>requests>=2);await sleep(100);
 assert.equal(panel().querySelector('[data-connection-time="scheduled"]').textContent,'10:06','keep the retained scheduled identity');
 assert.match(panel().textContent,/Not live|Last known/i,'source loss must qualify the retained connection status');
 if(incident!=='on-time')assert.match(panel().querySelector('.connection-status').textContent,expectedStatus,'retain the observed problem after source loss');
 if(incident==='delayed'){
  assert.equal(panel().querySelector('[data-connection-time="expected"]').textContent,'10:14');
  assert.equal(panel().querySelector('.connection-expected>small').textContent,'Last known');
  assert.ok(panel().querySelector('.connection-status').classList.contains('warn'));
 }
 if(incident==='cancelled')assert.ok(panel().querySelector('.connection-status').classList.contains('bad'));
 assert.ok(![...row().querySelectorAll('.flags>*')].some(e=>e.textContent==='On time'),'no unqualified stale On time flag is repeated below the panel');
 assert.deepEqual(a.errors,[]);a.close();
 }
});
