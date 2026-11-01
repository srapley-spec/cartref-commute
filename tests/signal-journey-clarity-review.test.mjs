// Independent real-page checks: important text must be visible through its
// ancestors, rather than merely retained somewhere in a collapsed DOM subtree.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T07:00:00Z'),MIN=60000;
const tube=(id,name,sev=10,reason='')=>({id,name,statuses:[{sev,desc:sev===10?'Good Service':sev===9?'Minor Delays':sev===6?'Severe Delays':'Service Closed',reason}]});
const rail=(from,to,std,dep,arr,id,extra={})=>({from,to,std,dep,arr,serviceId:id,operator:to==='KGX'||from==='KGX'?'Great Northern':'Thameslink',
 platform:'1',depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:'',...extra});
function visible(a,node){
 if(!node)return false;
 for(let n=node;n;n=n.parentElement){
  if(n.hidden||a.w.getComputedStyle(n).display==='none'||a.w.getComputedStyle(n).visibility==='hidden')return false;
  const parent=n.parentElement;
  if(parent?.tagName==='DETAILS'&&!parent.open&&n!==parent.querySelector(':scope > summary'))return false;
 }
 return true;
}
const visibleText=(a,selector)=>{
 const root=a.d.querySelector(selector);assert.ok(root,'container '+selector+' exists');
 const walker=a.d.createTreeWalker(root,4),out=[];
 while(walker.nextNode())if(visible(a,walker.currentNode.parentElement))out.push(walker.currentNode.textContent);
 return out.join(' ').replace(/\s+/g,' ').trim();
};
async function app(home=false){
 const a=await createApp({now:NOW,geo:null,settings:{provider:'demo',followRoute:true},saved:{dirMode:home?'home':'office'}}),s=a.c.state;
 s.saved.settings.provider='rdm';s.saved.settings.rdmKey='fixture-only';s.saved.view='now';s.saved.mode='commute';
 s.boards=home?{
  'KGX-LET':{services:[rail('KGX','LET','08:00',NOW+60*MIN,NOW+90*MIN,'home-gn')],msgs:[]},
  'STP-LET':{services:[rail('STP','LET','08:05',NOW+65*MIN,NOW+95*MIN,'home-tl')],msgs:[]},
  'ZFD-LET':{services:[rail('ZFD','LET','08:00',NOW+60*MIN,NOW+95*MIN,'home-tl')],msgs:[]},
 }:{
  'LET-KGX':{services:[rail('LET','KGX','07:30',NOW+30*MIN,NOW+65*MIN,'office-gn'),rail('LET','KGX','08:00',NOW+60*MIN,NOW+95*MIN,'office-next')],msgs:[]},
  'LET-STP':{services:[rail('LET','STP','07:40',NOW+40*MIN,NOW+79*MIN,'office-tl')],msgs:[]},
  'LET-ZFD':{services:[rail('LET','ZFD','07:40',NOW+40*MIN,NOW+84*MIN,'office-tl')],msgs:[]},
 };
 s.status=[tube('circle','Circle'),tube('metropolitan','Metropolitan'),tube('hammersmith-city','Hammersmith & City')];
 s.nrStatus=[tube('great-northern','Great Northern'),tube('thameslink','Thameslink')];
 Object.assign(s,{railSource:'darwin',boardsDir:home?'home':'office',boardsAt:NOW,errors:[],routeFailed:{},loading:false,
  locStatus:'unavailable',autoSrc:"can't get your location right now",onLine:false,atHub:null});
 a.c.render();return a;
}
function delay(a,minutes,reason='A signalling failure near Hatfield is delaying this service.'){
 const t=a.c.state.boards['LET-KGX'].services[0];
 t.dep+=minutes*MIN;t.arr+=minutes*MIN;t.depLate=minutes;t.arrLate=minutes;t.reason=reason;return t;
}

test('independent Signal clarity: serious service-specific cause is visible before opening Travel alerts',async()=>{
 const a=await app();delay(a,17);a.c.render();
 assert.equal(a.d.querySelector('#signalNotices').open,false);
 assert.equal(visible(a,a.d.querySelector('#signalDisruptions')),true);
 assert.match(visibleText(a,'#signalDisruptions'),/signalling failure near Hatfield/i);
 assert.match(visibleText(a,'#signalDisruptions'),/17 min/);
 assert.equal(a.d.querySelector('#signalDisruptions [data-scope="rail"]').classList.contains('bad'),true);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: minor or unused-line disruption stays background while its full details remain reachable',async()=>{
 const a=await app(),s=a.c.state;
 s.status=[tube('circle','Circle',9,'A small delay on the Circle line.'),tube('metropolitan','Metropolitan'),tube('hammersmith-city','Hammersmith & City',6,'Severe delay on an unused alternative.')];
 a.c.render();
 assert.equal(a.d.querySelector('#signalDisruptions').hidden,true);
 assert.equal(a.w.CommuteCore.lineLevel(s.status[0]),'warn','folding does not redefine the minor status colour');
 a.d.querySelector('#signalNotices').open=true;
 assert.match(visibleText(a,'#signalNotices'),/Circle: Minor Delays/);
 a.d.querySelector('#signalNetwork').open=true;
 assert.match(visibleText(a,'#signalNetwork'),/Hammersmith & City/);
 assert.match(visibleText(a,'#signalNetwork'),/Severe Delays/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: feed priority cannot hide separate serious train and remaining Tube impacts',async()=>{
 const a=await app(),s=a.c.state;
 s.boards['LET-KGX'].services[0].cancelled=true;s.boards['LET-KGX'].services[0].reason='A crew shortage has cancelled this train.';
 s.errors=['The rail provider is unavailable'];
 s.status=[tube('circle','Circle',20,'Circle is closed because of a track failure.'),tube('metropolitan','Metropolitan',6,'Metropolitan is severely delayed by a signal failure.'),tube('hammersmith-city','Hammersmith & City')];
 a.c.render();
 assert.equal(a.d.querySelector('#signalNotices').open,false);
 const text=visibleText(a,'#signalDisruptions');
 for(const pattern of [/rail provider is unavailable/,/crew shortage/,/Circle is closed/,/Metropolitan is severely delayed/])assert.match(text,pattern);
 assert.equal(a.d.querySelectorAll('#signalDisruptions [data-scope="tube"]').length,2);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: a profile threshold override reaches rendered status, train flag and visible card',async()=>{
 const a=await app(),C=a.w.CommuteCore;
 C.profiles.samCommute.disruption={rail:{warnMin:10,badMin:20}};
 const t=delay(a,17);a.c.render();
 const flag=[...a.d.querySelectorAll('#list .pill')].find(n=>n.textContent==='17 min late');
 assert.ok(flag);assert.equal(flag.classList.contains('warn'),true);
 assert.equal(a.d.querySelector('#signalStatus').classList.contains('warn'),true);
 assert.equal(a.d.querySelector('#signalDisruptions [data-scope="rail"]').classList.contains('warn'),true);
 t.dep-=8*MIN;t.arr-=8*MIN;t.depLate=9;t.arrLate=9;a.c.render();
 assert.equal(a.d.querySelector('#signalDisruptions').hidden,true,'nine minutes is below this configured prominent-warning threshold');
 const nowGreen=[...a.d.querySelectorAll('#list .pill')].find(n=>n.textContent==='9 min late');
 assert.ok(nowGreen);assert.equal(nowGreen.classList.contains('ok'),true);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: manual direction keeps location diagnostics visible without restarting location',async()=>{
 const a=await app(),s=a.c.state;let watches=0;
 a.w.navigator.geolocation.watchPosition=()=>{watches++;return 42;};
 s.autoSrc="you're near Letchworth (±300 m)";s.locStatus='ok';s.locAcc=300;s.lastFixAt=NOW-2*MIN;
 a.c.render();
 const note=a.d.querySelector('#dirNote');assert.equal(visible(a,note),true);
 assert.equal(a.d.querySelector('#signalAdjustments').open,false);
 assert.match(note.textContent,/near Letchworth/);assert.match(note.textContent,/(stale|last) fix/);assert.match(note.textContent,/approximate/);
 s.locStatus='denied';s.autoSrc='location is off for this app';a.c.render();
 assert.match(visibleText(a,'#dirNote'),/location is off/);assert.doesNotMatch(note.textContent,/near Letchworth/);
 assert.equal(watches,0,'drawing diagnostics cannot create a permission/watch restart');
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: confirmed boarding with unavailable GPS retains old current-rail problems and folds the completed Tube',async()=>{
 const a=await app(true),s=a.c.state;
 const button=a.d.querySelector('[data-follow]:not([disabled])');assert.ok(button);button.click();
 const chosen=s.saved.followRoute;assert.ok(chosen);
 const now=chosen.option.train.dep+10*MIN;a.setNow(now);s.boardsAt=now;
 const selected=Object.values(s.boards).flatMap(b=>b.services).find(t=>t.serviceId===chosen.option.train.serviceId&&t.from===chosen.option.train.from);
 assert.ok(selected);selected.arr+=17*MIN;selected.arrLate=17;selected.reason='A train fault is delaying your chosen service.';
 s.status=[tube('circle','Circle',20,'Closure of the already completed Tube leg.'),tube('metropolitan','Metropolitan',20,'Closure of the already completed Tube leg.'),tube('hammersmith-city','Hammersmith & City')];
 a.c.render();
 const boarded=a.d.querySelector('[data-follow-action="boarded"]');assert.ok(boarded,'the actual boarding correction is available');boarded.click();
 assert.equal(s.saved.followRoute.phase,'on-train');assert.equal(s.onLine,false,'the test does not manufacture GPS rail inference');
 assert.match(visibleText(a,'#signalDisruptions'),/train fault is delaying your chosen service/);
 assert.equal(a.d.querySelectorAll('#signalDisruptions [data-scope="tube"]').length,0,'completed access-leg disruption cannot look like an onward problem');
 assert.equal(s.saved.followRoute.id,chosen.id);assert.equal(s.saved.followRoute.plannedArrival,chosen.plannedArrival);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: a fresh current-train report promotes a serious arrival delay even when its board still says on time',async()=>{
 const a=await app(),s=a.c.state,C=a.w.CommuteCore;
 const t=rail('LET','KGX','06:45',NOW-15*MIN,NOW+20*MIN,'current-reported');
 s.boards={'LET-KGX':{services:[t],msgs:[]}};
 Object.assign(s,{here:[51.9017,-.2071],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:true,
  trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true},
  progressById:{[t.serviceId]:{id:t.serviceId,at:NOW,data:C.parseServiceDetails({locationName:'Letchworth Garden City',crs:'LET',std:'06:45',atd:'06:45',
   delayReason:'A points failure is delaying this train.',subsequentCallingPoints:[{callingPoint:[
    {locationName:'Stevenage',crs:'SVG',st:'07:00',at:'07:00'},
    {locationName:'London Kings Cross',crs:'KGX',st:'07:20',et:'07:40'}]}]},NOW)}}});
 a.c.render();
 assert.match(visibleText(a,'.journey-progress'),/20 min behind/,'the current report is genuinely selected by the live progress view');
 assert.match(visibleText(a,'#signalDisruptions'),/20 min/,'serious live arrival impact cannot remain folded because the old departure board is on time');
 assert.match(visibleText(a,'#signalDisruptions'),/points failure/i,'retain the current report cause');
 assert.equal(t.arrLate,0,'the diagnostic view does not rewrite the original board');
 const requests=a.calls.slice();
 s.saved.settings.appearance='dark';a.c.render();
 assert.equal(a.d.documentElement.dataset.design,'signal');
 assert.match(visibleText(a,'.journey-progress'),/20 min behind/,'changing appearance retains the same selected report');
 assert.equal(s.trainLock.serviceId,t.serviceId);assert.equal(t.arrLate,0);
 assert.deepEqual(a.calls,requests);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: Tube headline and progress share vehicle, target-platform and freshness guards',async()=>{
 const a=await app(),s=a.c.state;
 Object.assign(s,{here:[51.5201,-.0973],locAcc:30,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null,inLondon:false});
 s.saved.tubeRide={hub:'KGX',from:'KGX',t:NOW-3*MIN,line:'Met',vehicle:'435',rideMs:10*MIN,stop:'Aldgate',stopGeo:[51.5142,-.0755],picked:true};
 const matching={vehicle:'435',lineId:'metropolitan',platform:'Northbound - Platform 3',stopId:'940GZZLUALD',observedAt:NOW,t:NOW+5*MIN};
 s.ald={at:NOW,arrivals:[matching]};a.c.render();
 assert.equal(s.rendered.progress.liveArrival.t,matching.t);
 assert.equal(s.rendered.progressModel.source,'prediction');
 assert.doesNotMatch(a.d.querySelector('#hero .arrlbl').textContent,/estimate/);
 assert.match(visibleText(a,'.journey-progress'),/Live arrival; position is a time-based estimate/);
 assert.equal(a.d.querySelectorAll('.jp-stop[data-state="reported"]').length,0);
 s.boardsAt=NOW-4*MIN;a.c.render();
 assert.equal(s.rendered.progress.homeward,false,'the rail leg has already been completed outbound');
 assert.doesNotMatch(visibleText(a,'#signalDisruptions'),/Train times may be out of date/,'old completed rail data must not overshadow the current Tube');
 assert.equal(s.signalDisruptionItems.some(item=>item.id==='data-stale'),false);
 s.boardsAt=NOW;
 s.ald={at:NOW,arrivals:[{...matching,observedAt:NOW+10000}]};a.c.render();
 assert.ok(s.rendered.progress.liveArrival,'the existing Tube guard accepts a small provider clock offset');
 assert.equal(s.rendered.progressModel.source,'prediction','an accepted provider clock offset cannot make the headline and bar disagree about live arrival evidence');
 for(const incompatible of [{vehicle:'other'},{lineId:'circle'},{platform:'Eastbound - Platform 1'},{platform:''},
  {stopId:'other'},{observedAt:NOW-3*MIN}]){
  s.ald={at:NOW,arrivals:[{...matching,...incompatible}]};a.c.render();
  assert.equal(s.rendered.progress.liveArrival,null,'the headline rejects '+JSON.stringify(incompatible));
  assert.equal(s.rendered.progressModel.source,'modelled','the bar rejects the same incompatible observation');
  assert.match(a.d.querySelector('#hero .arrlbl').textContent,/estimate/);
  assert.equal(s.rendered.progressModel.status.deltaMin,null);
 }
 assert.deepEqual(a.errors,[]);a.close();
 const home=await app(true),hs=home.c.state;
 Object.assign(hs,{here:[51.5201,-.0973],locAcc:30,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null,inLondon:false,boardsAt:NOW-4*MIN});
 hs.saved.tubeRide={hub:'ALD',from:'ALD',t:NOW-2*MIN,line:'Met',picked:true,rideMs:10*MIN,stop:"King's Cross",stopGeo:null};
 home.c.render();
 assert.equal(hs.rendered.progress.homeward,true,'the return Tube still has an onward rail leg');
 assert.match(visibleText(home,'#signalDisruptions'),/Train times may be out of date/,'onward rail freshness remains important on the homeward Tube');
 assert.deepEqual(home.errors,[]);home.close();
});

test('independent Signal clarity: an otherwise fresh arrival report preserves a current cancellation until the board explicitly recovers',async()=>{
 const a=await app(),s=a.c.state,C=a.w.CommuteCore;
 a.d.querySelector('[data-follow]:not([disabled])').click();
 const chosen=s.saved.followRoute,t=Object.values(s.boards).flatMap(board=>board.services).find(t=>t.serviceId===chosen.option.train.serviceId&&t.from===chosen.option.train.from);
 assert.equal(t.to,'KGX','the fixture follows the original Great Northern itinerary');
 const now=t.dep+5*MIN;a.setNow(now);s.boardsAt=now;
 const report=C.parseServiceDetails({locationName:'Letchworth Garden City',crs:'LET',std:t.std,atd:t.std,
  subsequentCallingPoints:[{callingPoint:[{locationName:'Stevenage',crs:'SVG',st:'07:34',at:'07:34'},
   {locationName:'London Kings Cross',crs:'KGX',st:'08:05',et:'08:05'}]}]},now-MIN);
 s.progressById={[t.serviceId]:{id:t.serviceId,at:now-MIN,data:report}};
 a.c.render();
 a.d.querySelector('[data-follow-action="boarded"]').click();
 assert.ok(s.rendered.progressModel,'establish the selected on-board service before its cancellation update');
 t.cancelled=true;t.reason='An electrical fault has cancelled this train.';a.c.render();
 assert.ok(s.rendered.activeRailDisruption,'a confirmed followed train retains its incident context');
 assert.equal(s.rendered.activeRailDisruption.cancelled,true,'one-minute-old on-time evidence cannot erase a newer cancellation');
 assert.match(visibleText(a,'.journey-progress'),/Service cancelled/);
 assert.match(visibleText(a,'#signalDisruptions'),/cancelled/);
 assert.match(visibleText(a,'#signalDisruptions'),/electrical fault/,'an empty residual report reason cannot erase the explicit cancellation cause');
 a.setNow(now+1000);s.progressById[t.serviceId]={id:t.serviceId,at:now+1000,data:report};a.c.render();
 assert.equal(s.rendered.activeRailDisruption.cancelled,true,'a residual arrival estimate never clears an explicit current cancellation');
 assert.equal(t.cancelled,true,'the display does not rewrite the provider board');
 t.cancelled=false;t.reason='';s.boardsAt=now+1000;a.c.render();
 assert.equal(s.rendered.activeRailDisruption.cancelled,false,'normal provider/controller recovery clears the incident');
 assert.equal(s.rendered.progressModel.status.deltaMin,0);
 assert.doesNotMatch(visibleText(a,'#signalDisruptions'),/train.*cancelled/);
 assert.equal(t.cancelled,false,'drawing the recovered view preserves the updated provider snapshot');
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: an explicitly picked current train keeps its cancellation visible after it leaves the board lookback without Follow',async()=>{
 const a=await app(),s=a.c.state;
 s.saved.settings.followRoute=false;
 const t=rail('LET','KGX','06:45',NOW-15*MIN,NOW+20*MIN,'picked-before-cancellation');
 Object.assign(s,{boards:{'LET-KGX':{services:[t],msgs:[]}},boardsAt:NOW,
  here:[51.9017,-.2071],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:true,
  trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true}});
 a.c.render();
 assert.equal(s.rendered.train.t.serviceId,t.serviceId,'establish the already picked current service');
 t.cancelled=true;t.reason='This picked service is cancelled following a train fault.';a.c.render();
 assert.equal(s.saved.followRoute??null,null,'this case uses the existing train choice without creating Follow');
 assert.equal(s.trainLock.serviceId,t.serviceId,'rendering an incident preserves the explicit train choice');
 assert.match(visibleText(a,'#signalDisruptions'),/picked service is cancelled following a train fault/i,
  'the current incident remains important after its original departure even when inference omits the cancelled train');
 assert.equal(a.d.querySelector('#signalDisruptions [data-scope="rail"]').classList.contains('bad'),true);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent Signal clarity: reading expanded significant details defers Auto and preserves disclosure focus across refresh',async()=>{
 const a=await app();delay(a,17,'A signalling failure near Hatfield. An engineer is investigating.');
 a.c.state.boards['LET-KGX'].msgs=['Trains between Hitchin and Stevenage are disrupted.'];a.c.render();
 const details=a.d.querySelector('#signalDisruptions details');assert.ok(details);details.open=true;details.querySelector('summary').focus();
 a.c.state.onLine=true;a.c.render();
 assert.equal(a.c.state.presentation.pending,true);
 const retained=a.d.querySelector('#signalDisruptions details');assert.ok(retained);assert.equal(retained.open,true);
 assert.equal(a.d.activeElement,retained.querySelector('summary'));
 retained.open=false;a.d.activeElement.blur();a.c.render();
 assert.equal(a.c.state.presentation.pending,false);assert.equal(a.c.state.presentation.view,'on-train');
 assert.deepEqual(a.errors,[]);a.close();
});
