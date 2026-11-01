// Independent retirement regressions: exercise the real generated page and original controls.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,planBrightonCanterbury} from './trip-fixtures.mjs';
after(closeAll);

const NOW=Date.parse('2026-11-03T10:00:00Z'),MIN=60000;
const plain=value=>JSON.parse(JSON.stringify(value));
const norm=node=>node.textContent.replace(/\s+/g,' ').trim();
function exposed(a,node){
 if(!node)return false;
 for(let n=node;n;n=n.parentElement){
  if(n.hidden||a.w.getComputedStyle(n).display==='none'||a.w.getComputedStyle(n).visibility==='hidden')return false;
  if(n.parentElement?.tagName==='DETAILS'&&!n.parentElement.open&&!n.parentElement.querySelector(':scope>summary')?.contains(node))return false;
 }
 return true;
}
const submitSettings=a=>a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));

for(const signal of [undefined,false,true])test(`independent Panda retirement: signal=${signal} preserves the real Along preferences and followed itinerary through save and reload`,async()=>{
 const initial=await createApp({now:NOW,settings:{provider:'demo',followRoute:true,alongLine:true},saved:{dirMode:'office'}});
 initial.d.querySelector('#hero [data-follow]:not([disabled])').click();
 initial.d.querySelector('[data-journey-view="plan"]').click();
 const saved=JSON.parse(initial.w.localStorage.getItem('cartrefCommute.v1'));
 saved.settings={...saved.settings,appearance:'dark',walkHomeStationAvg:777,fastFactor:.74,...(signal===undefined?{}:{signal})};
 saved.alongLinePreferences={depth:'explore',interests:['engineering','operations']};
 saved.planInputs={by:{date:'2026-11-04',time:'08:37'},at:{date:'2026-11-05',time:'07:43'}};
 saved.home=[51.9752,-.2301];saved.pace='fast';
 const route=plain(saved.followRoute),pin=plain(saved.viewOverride);initial.close();
 const a=await createApp({now:NOW,saved});
 assert.equal(a.d.documentElement.dataset.design,'signal');
 assert.equal(a.c.readSimulationActual().railProgress.enabled,true,'an obsolete design value cannot suppress progress verification');
 assert.equal(a.c.readSimulationActual().railProgress.diagram,true,'the sole design always verifies its real diagram');
 assert.equal(a.c.S().followRoute,true);assert.equal(a.c.S().alongLine,true);
 assert.equal(a.c.state.saved.followRoute.id,route.id);assert.equal(a.c.state.saved.followRoute.plannedArrival,route.plannedArrival);
 assert.deepEqual(plain(a.c.state.saved.followRoute.option.legs),route.option.legs);
 assert.deepEqual(plain(a.c.state.saved.viewOverride),pin);
 a.d.querySelector('#alongEntry').click();
 assert.equal(a.d.querySelector('#alongLine').open,true);
 assert.equal(a.d.querySelector('#alongDepth').value,'explore');
 a.d.querySelector('#alongClose').click();
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_appearance').value='light';
 const requests=[...a.calls],boards=a.c.state.boards;submitSettings(a);
 assert.equal(a.c.state.boards,boards);assert.deepEqual(a.calls,requests,'appearance-only save does not restart feeds');
 const persisted=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));a.close();
 assert.equal('signal' in persisted.settings,false);
 assert.equal(persisted.settings.followRoute,true);assert.equal(persisted.settings.alongLine,true);
 assert.equal(persisted.settings.walkHomeStationAvg,777);assert.equal(persisted.settings.fastFactor,.74);
 for(const key of ['home','pace','planInputs','alongLinePreferences'])assert.deepEqual(persisted[key],saved[key],key);
 assert.equal(persisted.followRoute.id,route.id);assert.deepEqual(persisted.followRoute.option.legs,route.option.legs);
 assert.equal(persisted.followRoute.plannedArrival,route.plannedArrival);
 const b=await createApp({now:NOW,saved:persisted});
 assert.equal(b.c.state.saved.followRoute.id,route.id);assert.deepEqual(plain(b.c.state.saved.alongLinePreferences),saved.alongLinePreferences);
 assert.equal(b.d.documentElement.dataset.theme,'light');assert.deepEqual(b.errors,[]);b.close();
});

test('independent Panda retirement: original controls retain nodes, values and handlers after repeated appearance changes',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo'},saved:{dirMode:'office'}});
 const selectors=['#byForm','#byDate','#byTime','[data-mode="commute"]','[data-mode="leisure"]','[data-dir="home"]','[data-dir="office"]','[data-pace="avg"]','[data-pace="fast"]'];
 const nodes=new Map(selectors.map(selector=>[selector,a.d.querySelector(selector)]));
 a.d.querySelector('#signalAdjustments').open=true;
 a.d.querySelector('[data-view="by"]').click();
 a.d.querySelector('#byDate').value='2026-11-04';a.d.querySelector('#byTime').value='08:37';
 a.d.querySelector('#byTime').dispatchEvent(new a.w.Event('change',{bubbles:true}));
 for(const theme of ['dark','light','system']){
  a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_appearance').value=theme;submitSettings(a);
  for(const [selector,node]of nodes){assert.equal(a.d.querySelector(selector),node,selector);assert.equal(a.d.querySelectorAll(selector).length,1,selector);}
  assert.equal(a.d.querySelector('#byDate').value,'2026-11-04');assert.equal(a.d.querySelector('#byTime').value,'08:37');
  assert.equal(a.d.querySelector('#signalAdjustments').open,true);
 }
 a.d.querySelector('[data-pace="fast"]').click();assert.equal(a.c.state.saved.pace,'fast');
 assert.match(a.text('#signalContextSummary'),/Fast pace/);
 a.d.querySelector('[data-dir="home"]').click();assert.equal(a.c.direction(),'home');assert.match(a.text('#signalContextSummary'),/To home/);
 a.d.querySelector('[data-mode="leisure"]').click();assert.equal(a.c.state.saved.mode,'leisure');
 assert.match(a.text('#signalContextSummary'),/Leisure/);assert.equal(a.d.querySelector('#dirOutBtn').textContent,'To London');
 a.d.querySelector('[data-mode="commute"]').click();a.d.querySelector('[data-dir="office"]').click();
 assert.equal(a.c.direction(),'office');assert.equal(a.c.state.saved.pace,'fast');
 assert.ok(exposed(a,a.d.querySelector('[data-pace="fast"]')));
 await sleep(50);assert.deepEqual(a.errors,[]);a.close();
});

async function twoStation(platform='C'){
 const now=Date.parse('2026-11-03T17:00:00Z');
 const a=await createApp({now,geo:null,settings:{provider:'demo',followRoute:true},saved:{dirMode:'home'}});
 const service=(from,dep,arr,id,platform)=>({from,to:'LET',std:new Date(now+dep*MIN).toISOString().slice(11,16),
  dep:now+dep*MIN,arr:now+arr*MIN,serviceId:id,operator:'Thameslink',platform,depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:''});
 Object.assign(a.c.state,{boards:{'KGX-LET':{services:[],msgs:[]},
  'STP-LET':{services:[service('STP',40,80,'first','B'),service('STP',60,100,'second',platform)],msgs:[]},
  'ZFD-LET':{services:[service('ZFD',35,80,'first','4'),service('ZFD',55,100,'second','5')],msgs:[]}},
  boardsAt:now,boardsDir:'home',railSource:'darwin',routeFailed:{},loading:false,errors:[],atHub:null});
 a.c.render();return a;
}
for(const platform of ['C',''])test(`independent Panda retirement: a collapsed two-station option retains each time and ${platform?'different':'unknown'} platform`,async()=>{
 const a=await twoStation(platform),detail=a.d.querySelector('#hero .signal-alternative');
 assert.ok(detail&&!detail.open);
 const summary=detail.querySelector(':scope>summary'),boarding=summary.querySelector('.signal-alt-boarding');
 assert.ok(exposed(a,boarding),'the two boarding points are available without expanding Next best');
 assert.equal(norm(boarding),`Board at Farringdon 17:55 platform 5 or St Pancras 18:00${platform?' platform C':''}`);
 assert.doesNotMatch(norm(summary.querySelector('.signal-alt-service')),/platform/,'a shared service label cannot assign one station platform to both');
 const original=detail.querySelector('.opt .altstop');assert.equal(norm(original),norm(boarding));
 detail.open=true;
 assert.ok(exposed(a,original));assert.ok(exposed(a,detail.querySelector('[data-follow]:not([disabled])')));
 detail.querySelector('[data-follow]').click();
 assert.equal(a.c.state.saved.followRoute.option.train.from,'ZFD');
 assert.equal(a.c.state.saved.followRoute.option.train.platform,'5');
 assert.equal(a.c.state.saved.followRoute.option.train.std,'17:55');
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Panda retirement: collapsed full notices remain reachable and retain their source detail while severe impact stays exposed',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo'},saved:{dirMode:'office'}}),s=a.c.state;
 Object.assign(s,{railSource:'darwin',boardsAt:NOW-180001,errors:['Independent full diagnostic detail'],status:[
  {id:'circle',name:'Circle',statuses:[{sev:9,desc:'Minor Delays',reason:'Independent full line notice'}]},
  {id:'metropolitan',name:'Metropolitan',statuses:[{sev:10,desc:'Good Service'}]},
  {id:'hammersmith-city',name:'Hammersmith & City',statuses:[{sev:10,desc:'Good Service'}]}]});
 s.saved.settings.provider='rdm';s.saved.settings.rdmKey='fixture-only';a.c.render();
 const notices=a.d.querySelector('#signalNotices'),network=a.d.querySelector('#signalNetwork');
 assert.ok(!notices.open&&!network.open);
 assert.ok(exposed(a,notices.querySelector('summary'))&&exposed(a,network.querySelector('summary')));
 assert.ok(exposed(a,a.d.querySelector('#signalDisruptions')));
 assert.match(a.text('#signalDisruptions'),/Independent full diagnostic detail/);
 assert.match(a.text('#signalDisruptions'),/Train times may be out of date/);
 notices.open=true;network.open=true;
 assert.ok(exposed(a,a.d.querySelector('#banners'))&&exposed(a,a.d.querySelector('#status')));
 const lineDetail=[...a.d.querySelectorAll('#banners details')].find(node=>/Circle: Minor Delays/.test(norm(node.querySelector('summary'))));
 assert.ok(lineDetail&&exposed(a,lineDetail.querySelector('summary')),'the full line notice has a reachable original disclosure');
 lineDetail.open=true;assert.ok(exposed(a,lineDetail.querySelector('.msg')));
 assert.match(a.text('#banners'),/Independent full line notice/);
 assert.match(a.text('#banners'),/check a live board before relying/);
 assert.match(a.text('#status'),/CircleMinor DelaysMetropolitanGood ServiceHammersmith & CityGood Service/);
 assert.match(a.text('#modelNote'),/Tube legs are estimates/);
 a.c.render();
 assert.equal(notices.open,true);assert.equal(network.open,true);
 const restoredLine=[...a.d.querySelectorAll('#banners details')].find(node=>/Circle: Minor Delays/.test(norm(node.querySelector('summary'))));
 assert.equal(restoredLine.open,true,'redraw preserves the original nested notice reading position');
 assert.ok(exposed(a,restoredLine.querySelector('.msg')));
 assert.match(a.text('#banners'),/Independent full diagnostic detail/);
 assert.match(a.text('#signalCurrentLines'),/no live status/,'an unknown rail source is not rewritten as good service');
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Panda retirement: Trip opt-in and its followed address journey survive all obsolete design values and mode changes',async()=>{
 const seed=await createApp({now:NOW,settings:TRIP_SETTINGS,saved:{dirMode:'office'},route:tripRoute});
 await planBrightonCanterbury(seed);
 assert.ok(seed.d.querySelectorAll('#tripResults .trip-row').length>=3);
 seed.d.querySelector('[data-trip-follow]').click();
 const saved=JSON.parse(seed.w.localStorage.getItem('cartrefCommute.v1')),trip=plain(seed.c.state.saved.tripMode);seed.close();
 assert.ok(trip.follow?.id,'the fixture follows an actual multi-ride itinerary');
 for(const signal of [undefined,false,true]){
  const prefs={...saved,settings:{...saved.settings,googleKey:'',...(signal===undefined?{}:{signal})}};
  const a=await createApp({now:NOW,saved:prefs,route:tripRoute});
  assert.equal(a.d.documentElement.dataset.design,'signal');assert.equal(a.d.documentElement.dataset.trip,'on');
  assert.equal(a.d.querySelector('#tripModeBtn').hidden,false);assert.equal(a.d.querySelector('#tripRoot').hidden,false);
  assert.equal(a.d.querySelector('#tripInput-from').value,'Brighton Station');assert.equal(a.d.querySelector('#tripInput-to').value,'Canterbury Cathedral');
  assert.deepEqual(plain(a.c.state.saved.tripMode),trip);
  a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_appearance').value='dark';submitSettings(a);
  assert.deepEqual(plain(a.c.state.saved.tripMode),trip,'changing appearance preserves the complete trip');
  a.d.querySelector('[data-mode="commute"]').click();
  assert.equal(a.d.documentElement.dataset.trip,'off');assert.equal(a.c.state.saved.tripMode.active,false);
  for(const key of ['from','to','modes','question','recent','follow'])assert.deepEqual(plain(a.c.state.saved.tripMode[key]),trip[key],key);
  a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_trip').checked=false;submitSettings(a);
  assert.equal(a.d.querySelector('#tripModeBtn').hidden,true);assert.equal(a.c.S().followRoute,true);
  a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_trip').checked=true;submitSettings(a);
  a.d.querySelector('#tripModeBtn').click();assert.equal(a.d.documentElement.dataset.trip,'on');
  assert.equal(a.c.state.saved.tripMode.follow.id,trip.follow.id);
  assert.equal(a.d.querySelector('script[src*="maps.googleapis"]'),null,'missing-key setup remains honest after the upgrade');
  assert.equal('signal' in JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1')).settings,false);
  await sleep(30);assert.deepEqual(a.errors,[]);a.close();
 }
});

test('independent Panda retirement: synthetic Along and journey edits cannot replace the upgraded real itinerary or preferences',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo',signal:false,followRoute:true,alongLine:true},
  saved:{dirMode:'office',alongLinePreferences:{depth:'explore',interests:['operations']}}});
 a.d.querySelector('#hero [data-follow]:not([disabled])').click();a.d.querySelector('[data-journey-view="plan"]').click();
 const before=plain(a.c.state.saved),stored=a.w.localStorage.getItem('cartrefCommute.v1');
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_simulatedFeeds').checked=true;submitSettings(a);
 assert.equal(a.c.simClock.active,true);assert.equal(a.c.state.saved.followRoute,undefined);
 a.d.querySelector('[data-pace="fast"]').click();a.d.querySelector('#alongEntry').click();
 a.d.querySelector('#alongDepth').value='glance';a.d.querySelector('#alongDepth').dispatchEvent(new a.w.Event('change',{bubbles:true}));
 a.d.querySelector('#alongClose').click();
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),stored,'synthetic preference and pace edits remain session-only');
 a.d.querySelector('#simExit').click();await sleep(100);
 assert.equal(a.c.simClock.active,false);assert.equal(a.c.state.saved.pace,before.pace);
 assert.equal(a.c.state.saved.followRoute.id,before.followRoute.id);
 assert.deepEqual(plain(a.c.state.saved.followRoute.option.legs),before.followRoute.option.legs);
 assert.deepEqual(plain(a.c.state.saved.alongLinePreferences),before.alongLinePreferences);
 assert.equal(a.d.documentElement.dataset.design,'signal');assert.deepEqual(a.errors,[]);a.close();
});
